import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { chromium } from './helpers/chromium.mjs'

// Independent oracle: compile the pinned complete T3 stylesheet and execute its
// shared palette definitions. No expected colors are read from the skin.
const hostRoot = referenceRoot('HERMES_THEME_SOURCE_ROOT', 'HERMES_DESKTOP_SOURCE_ROOT')
const upstream = referenceRoot('T3_THEME_SOURCE_ROOT')
const target = process.env.T3_PAINT_BASELINE || fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(pathToFileURL(`${hostRoot}/package.json`))
const ts = require('typescript')
const { compile } = require('@tailwindcss/node')
const sha = text => createHash('sha256').update(text).digest('hex')
const readUp = path => readFile(`${upstream}/${path}`, 'utf8')
const upstreamCSS = await readUp('apps/web/src/index.css')
const composerSource = await readUp('apps/web/src/components/chat/ComposerSurface.tsx')
const classStrings = source => [...source.matchAll(/"([^"\n]+)"/g)].map(match => match[1]).filter(value => value.includes(' ')).join(' ')
const composerShellClasses = classStrings(composerSource.slice(composerSource.indexOf('function Shell('), composerSource.indexOf('const outlineClasses')))
const composerHostClasses = classStrings(composerSource.slice(composerSource.indexOf('function Host('), composerSource.indexOf('function Main('))) + ' ' + classStrings(composerSource.slice(composerSource.indexOf('const outlineClasses'), composerSource.indexOf('function Host(')))
const composerMainClasses = classStrings(composerSource.slice(composerSource.indexOf('function Main('), composerSource.indexOf('function ContextStrip(')))
const paletteSource = await readUp('packages/shared/src/themePalettes.ts')
const paletteContext = { exports: {} }
vm.runInNewContext(ts.transpileModule(paletteSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, paletteContext)
const sourceThemes = Object.fromEntries(paletteContext.exports.BUILT_IN_THEMES.map(t => [t.id, t]))
const compiled = await compile(upstreamCSS, { base: hostRoot, onDependency() {} })
const oracleCSS = compiled.build(['border-b', 'border-border/60', 'bg-destructive/90', 'hover:bg-destructive', 'text-white', 'bg-sidebar', 'border-r', 'border-border', 'h-px', 'bg-sidebar-border/50','text-muted-foreground','text-secondary-label','text-icon-muted','text-foreground','bg-background','bg-card','bg-popover','bg-message-surface','text-message-foreground', ...composerShellClasses.split(/\s+/), ...composerHostClasses.split(/\s+/), ...composerMainClasses.split(/\s+/)])
const nativePath = referenceFile('HERMES_INSTALLED_ROW_CSS')
const nativeCSS = await readFile(nativePath, 'utf8')
assert.equal(sha(nativeCSS), 'ce4eaebe23cc99c7ba7ca4d69c7221793a0eec3005564105dbaf4b9de69ad104')
const nativeContext = await readFile(`${hostRoot}/apps/desktop/src/themes/context.tsx`, 'utf8')
// Execute the actual native writer, preserving every seed and customCSS write.
// Unrelated font/contrast helpers are stand-ins; no native source is edited.
const slice = (start, end) => nativeContext.slice(nativeContext.indexOf(start), nativeContext.indexOf(end, nativeContext.indexOf(start)))
const nativeWriter = ts.transpileModule([
  slice('function renderedModeFor(', '// ─── CSS application'),
  slice('const mixesFor =', 'const TYPOGRAPHY_KNOB_VARS'),
  slice('function applyTheme(', '// Pin Electron\'s nativeTheme')
].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const { loadPluginInternals } = await import(pathToFileURL(`${target}/test/helpers/load-plugin.mjs`))
const { plugin } = await loadPluginInternals()
const themes = []
const disposers = []
plugin.register({ storage: { get: (_k, fallback) => fallback, set: () => { throw Error('Unexpected plugin preference write') } }, register: entry => { if (entry.area === 'themes') themes.push(JSON.parse(JSON.stringify(entry.data))) }, onDispose: fn => disposers.push(fn) })
const t3Themes = themes.filter(t => t.name.startsWith('codex-t3-'))
assert.equal(t3Themes.length, 6)
const bundle = await readFile(`${target}/codex-chat-look/plugin.js`, 'utf8')
const runtime = bundle.replace(/^import .*$/gm, '').replace('export default {', 'window.shippingPlugin = {')
const receipts = { bundle: sha(bundle), nativeCSS: sha(nativeCSS), upstreamCSS: sha(upstreamCSS), palettes: sha(paletteSource), nativeContext: sha(nativeContext), cases: [] }

// Native sidebar ancestry includes its real visible border AND the sibling
// resize hairline. The latter must not inherit accent-mixed native strokes.
const primaryClass = 'size-(--composer-control-primary-size,var(--composer-control-size)) shrink-0 rounded-full p-0 bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground/30 disabled:text-background disabled:opacity-100'
const markup = `<div id="root"><div data-tree-split><div><div data-tree-group="grp-sessions"><div id="sidebar" data-slot="sidebar" class="flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground relative min-w-0 overflow-hidden border-t-0 border-b-0 border-r border-l-0 border-(--sidebar-edge-border) bg-(--ui-sidebar-surface-background) opacity-100"><div data-slot="sidebar-content" class="gap-0 overflow-hidden bg-transparent px-2.5"><div data-slot="sidebar-group"><div data-slot="sidebar-group-content"><button id="shelf" data-codex-inbox-working-toggle style="display:block;width:100%;padding:6px 8px;background:transparent;text-align:left;font:inherit;font-size:11px;line-height:16px;font-weight:400;color:var(--ui-text-tertiary);cursor:pointer">Working 1</button></div></div></div></div></div></div><div><div role="separator" class="inset-y-0"><span id="split"></span><span></span></div><div data-tree-group="grp-main"><div data-slot="aui_thread-viewport"><div data-slot="aui_thread-content"><div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content"><button id="working" data-codex-turn-activity>Working for 1m</button><div class="aui-md"><p id="body-text">Assistant body</p></div><div data-tool-row data-conversation-scaffold><div><div class="group/disclosure-row"><button><span><span><span><svg id="tool-icon" class="text-(--ui-text-secondary)"></svg></span><span id="tool-label">Terminal</span></span></span></button></div></div></div></div></div></div></div><div data-slot="composer-root"><div id="composer" data-slot="composer-surface"><button id="primary" type="submit" class="${primaryClass}" aria-label="Stop"><span class="block size-2.5 rounded-[0.1875rem] bg-current"></span></button></div></div></div></div></div></div>`
const oracleMarkup = `<div id="sidebar" data-app-sidebar class="border-r border-border bg-sidebar"><div id="shelf-line" class="h-px bg-sidebar-border/50"></div></div><div id="working" class="border-b border-border/60 text-muted-foreground">Working</div><p id="body-text" class="text-foreground">Assistant body</p><span id="tool-label" class="text-secondary-label">Terminal</span><svg id="tool-icon" class="text-icon-muted"></svg><div id="composer"><button id="primary" class="bg-destructive/90 hover:bg-destructive text-white">Stop</button></div>`

async function fixture() {
  const b = await chromium()
  try {
  await b.call('Page.setDocumentContent', { frameId: (await b.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><html><head><style>${nativeCSS}</style><style>#root{height:800px}#sidebar{width:280px;height:300px}#composer{width:400px}#primary{width:28px;height:28px;transition:none!important}#split{display:block;height:300px}iframe{position:fixed;left:800px;top:0;width:500px;height:500px}</style></head><body>${markup}<iframe id="oracle"></iframe></body></html>` })
  await b.evaluate(`(()=>{const d=document.querySelector('iframe').contentDocument;d.open();d.write(${JSON.stringify(`<!doctype html><html><head><style>${oracleCSS}</style><style>#sidebar{height:100px}#composer{height:50px}#primary{transition:none!important}</style></head><body>${oracleMarkup}</body></html>`)});d.close()})()`)
  await b.evaluate(`
    window.errors=[];addEventListener('error',e=>errors.push(String(e.error)));
    const host={state:{},onEvent:()=>()=>{}};const jsx=()=>null,useEffect=()=>{},useRef=()=>({current:null}),useQuery=()=>({}),THEMES_AREA='themes',PALETTE_AREA='palette',TITLEBAR_AREAS={};
    ${runtime}
    const DEFAULT_TYPOGRAPHY={fontSans:'serif',fontMono:'monospace'},nousTheme={},INJECTED_FONT_URLS=new Set(),PRIMARY_SOLID_FOREGROUND='#fcfcfc';
    const parseColor=x=>x.match(/[a-f\\d]{2}/gi).map(v=>parseInt(v,16)),setAppearance=()=>{},readableInk=()=> '#fff',ensureContrast=x=>x,harmonize=x=>x,resolveChatFontFamily=x=>x,applyTypographyKnobs=()=>{},chromeBackground=x=>x;
    ${nativeWriter}
    window.nativePaint=(theme,mode)=>applyTheme({...theme,colors:mode==='dark'?(theme.darkColors||theme.colors):theme.colors},mode,'"User Choice", serif');
    window.enable=()=>{window.cleanup=installChatStyleRuntime()};window.disable=async()=>{window.cleanup?.();window.cleanup=null;await new Promise(r=>setTimeout(r,350))};
    window.oraclePaint=(id,mode,palette)=>{const d=document.querySelector('iframe').contentDocument,r=d.documentElement;r.classList.toggle('dark',mode==='dark');if(id==='t3-code')delete r.dataset.themeId;else r.dataset.themeId=id;for(const[k,v]of Object.entries(palette||{}))r.style.setProperty('--app-theme-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),v)};
    window.metrics=()=>Object.fromEntries(['sidebar','shelf','working','composer','primary','split'].map(id=>{const s=getComputedStyle(document.getElementById(id)),r=document.getElementById(id).getBoundingClientRect();return[id,Object.fromEntries(['fontSize','fontWeight','lineHeight','letterSpacing','padding','borderRadius','width','height','transform'].map(k=>[k,s[k]]))]}));
    window.sample=(id,prop,oracle=false)=>{const d=oracle?document.querySelector('iframe').contentDocument:document,e=d.getElementById(id),s=d.defaultView.getComputedStyle(e),canvas=d.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});const pixel=()=>[...ctx.getImageData(0,0,1,1).data];const fill=c=>{if(!window.CSS.supports('color',c))throw Error('Invalid color '+c);ctx.fillStyle=c;ctx.fillRect(0,0,1,1)};const layers=[];for(let n=e.parentElement;n;n=n.parentElement)layers.unshift(d.defaultView.getComputedStyle(n).backgroundColor);layers.forEach(fill);const backdrop=pixel();fill(s[prop]);const painted=pixel();ctx.clearRect(0,0,1,1);fill(s[prop]);return {css:s[prop],raw:pixel(),backdrop,painted,opacity:s.opacity,borderWidth:s.borderRightWidth}};
  `)
  await b.call('DOM.enable');await b.call('CSS.enable')
  const {root}=await b.call('DOM.getDocument',{depth:-1,pierce:true})
  b.primaryNodeId=(await b.call('DOM.querySelector',{nodeId:root.nodeId,selector:'#primary'})).nodeId
  await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:1270,y:790})
  return b
  } catch (error) { b.close(); throw error }
}
function paletteFor(id, mode) {
  if (id === 't3-code') return null
  const t = sourceThemes[id]
  return t.appearance === mode ? t.colors : t.variants?.[mode]
}
const ids = { 'codex-t3-chat': 't3-chat', 'codex-t3-code': 't3-code', 'codex-t3-ocean': 'ocean', 'codex-t3-iris': 'iris', 'codex-t3-grove': 'grove', 'codex-t3-ember': 'ember' }
// Independent semantic contracts from upstream index.css 1325-1388.
const paintCases = {
  '--ui-chat-surface-background':'--background','--ui-sidebar-surface-background':'--sidebar',
  '--theme-background-seed':'--background','--theme-foreground':'--foreground',
  '--dt-card':'--card','--dt-card-foreground':'--card-foreground','--dt-popover':'--popover','--dt-popover-foreground':'--popover-foreground',
  '--dt-muted':'--muted','--dt-muted-foreground':'--muted-foreground','--dt-border':'--border','--dt-input':'--input',
  '--dt-primary':'--primary','--dt-primary-foreground':'--primary-foreground','--dt-secondary':'--secondary','--dt-secondary-foreground':'--secondary-foreground',
  '--dt-accent':'--accent','--dt-accent-foreground':'--accent-foreground','--dt-destructive':'--destructive','--dt-destructive-foreground':'--destructive-foreground','--dt-ring':'--ring',
  '--ui-text-primary':'--foreground','--ui-text-secondary':'--secondary-label','--ui-text-tertiary':'--muted-foreground','--ui-text-quaternary':'--icon-muted',
  '--ui-icon-secondary':'--icon-muted','--ui-bg-primary':'--background','--ui-bg-secondary':'--card','--ui-bg-tertiary':'--muted','--ui-bg-elevated':'--popover','--ui-bg-sidebar':'--sidebar',
  '--ui-editor-surface-background':'--card','--ui-widget-surface-background':'--popover','--ui-code-surface-background':'--code-background','--ui-chat-bubble-background':'--message-surface','--ui-chat-bubble-foreground':'--message-foreground',
  '--ui-stroke-primary':'--border','--ui-stroke-secondary':'--border','--ui-stroke-tertiary':'--border',
  '--codex-color-card':'--card','--codex-color-elevated':'--popover','--codex-color-bubble':'--message-surface','--codex-color-text':'--foreground',
  '--codex-color-text-secondary':'--secondary-label','--codex-color-text-tertiary':'--muted-foreground','--codex-color-border':'--border',
  '--codex-color-primary':'--message-action','--codex-color-primary-foreground':'--message-action-foreground','--codex-color-destructive':'--error',
  '--dt-background':'--background','--dt-foreground':'--foreground','--dt-primary-solid':'--message-action','--dt-primary-solid-foreground':'--message-action-foreground',
  '--ui-bg-chrome':'--app-chrome-background','--ui-bg-editor':'--card','--ui-bg-card':'--card','--ui-bg-input':'--card','--ui-bg-quaternary':'--muted','--ui-bg-quinary':'--muted','--ui-surface-background':'--card',
  '--ui-chat-bubble-opaque-background':'--message-surface','--ui-inline-code-background':'--code-background','--ui-inline-code-foreground':'--code-foreground','--ui-terminal-surface-background':'--terminal-background',
  '--ui-red':'--error','--ui-orange':'--warning','--ui-yellow':'--warning','--ui-stroke-quaternary':'--border',
  '--codex-tool-label':'--secondary-label','--codex-tool-icon':'--icon-muted','--codex-activity-label':'--muted-foreground','--codex-placeholder':'--placeholder',
  '--codex-subagent-text':'--foreground','--codex-subagent-meta':'--muted-foreground','--codex-subagent-avatar-background':'--muted',
  '--codex-subagent-avatar-border':'color-mix(in oklab, var(--border) 70%, transparent)',
  '--codex-subagent-hover':'color-mix(in oklab, var(--accent) 20%, transparent)',
  '--codex-subagent-focus':'color-mix(in oklab, var(--ring) 70%, transparent)'
}
function samePixel(a, e, label, failures, tolerance=1) {
  if (a.raw[3] === 0 || e.raw[3] === 0 || a.painted[3] !== 255 || e.painted[3] !== 255) failures.push(`${label}: unresolved/transparent ${JSON.stringify({a,e})}`)
  if (a.painted.some((v,i)=>Math.abs(v-e.painted[i])>tolerance)) failures.push(`${label}: ${JSON.stringify(a)} expected ${JSON.stringify(e)}`)
}
for (const theme of t3Themes) {
  test(`${theme.label}: exact upstream paint, both appearances and repeated switches`, async () => {
    const b = await fixture(), failures=[], cases=[]
    try {
      await b.evaluate(`nativePaint(${JSON.stringify(theme)},'light');enable()`)
      for (const mode of ['light','dark','light']) {
        await b.evaluate(`nativePaint(${JSON.stringify(theme)},${JSON.stringify(mode)});oraclePaint(${JSON.stringify(ids[theme.name])},${JSON.stringify(mode)},${JSON.stringify(paletteFor(ids[theme.name],mode))})`)
        {
          // Every T3 variant uses the real Shell ::before at source-default
          // opacity over uniform canvas, not the unrelated generic card role.
          await b.evaluate(`(()=>{const d=document.querySelector('iframe').contentDocument,e=d.createElement('div');e.className=${JSON.stringify(composerShellClasses)};d.body.append(e);const c=d.createElement('canvas');c.width=c.height=1;const q=c.getContext('2d');q.fillStyle=d.defaultView.getComputedStyle(d.body).backgroundColor;q.fillRect(0,0,1,1);q.fillStyle=d.defaultView.getComputedStyle(e,'::before').backgroundColor;q.fillRect(0,0,1,1);const p=q.getImageData(0,0,1,1).data;d.getElementById('composer').style.backgroundColor='rgb('+[...p].slice(0,3).join(',')+')';e.remove()})()`)
        }
        // The real native ancestor cascade supplies the backdrop.
        const row={theme:theme.name,mode,metrics:await b.evaluate('metrics()')}
        await b.evaluate(`document.body.id='canvas';document.querySelector('iframe').contentDocument.body.id='canvas'`)
        row.canvas={actual:await b.evaluate(`sample('canvas','backgroundColor')`),expected:await b.evaluate(`sample('canvas','backgroundColor',true)`)}
        samePixel(row.canvas.actual,row.canvas.expected,`${mode}/app canvas`,failures)
        for (const [name, id, prop] of [['activity','working','borderBottomColor'],['sidebar','sidebar','backgroundColor'],['boundary','sidebar','borderRightColor'],['stop','primary','backgroundColor']]) {
          row[name]={actual:await b.evaluate(`sample('${id}','${prop}')`),expected:await b.evaluate(`sample('${id}','${prop}',true)`)}
          // Border paint sits over the element's own fill, not its parent.
          if(name==='boundary') {
            row[name]=await b.evaluate(`(()=>{const a=sample('sidebar','borderRightColor'),e=sample('sidebar','borderRightColor',true);const composite=(x,bg)=>{const c=document.createElement('canvas');c.width=c.height=1;const q=c.getContext('2d');q.fillStyle=bg;q.fillRect(0,0,1,1);q.fillStyle=x.css;q.fillRect(0,0,1,1);x.painted=[...q.getImageData(0,0,1,1).data];return x};return {actual:composite(a,getComputedStyle(document.getElementById('sidebar')).backgroundColor),expected:composite(e,document.querySelector('iframe').contentWindow.getComputedStyle(document.querySelector('iframe').contentDocument.getElementById('sidebar')).backgroundColor)}})()`)
          }
          samePixel(row[name].actual,row[name].expected,`${theme.name}/${mode}/${name}`,failures)
        }
        row.roles=await b.evaluate(`Object.entries(${JSON.stringify(paintCases)}).map(([actual,expected],i)=>{const o=document.querySelector('iframe').contentDocument;for(const[d,color,side]of[[document,actual,actual.includes('sidebar')],[o,expected,actual.includes('sidebar')]]){let p=d.getElementById('probe-'+i);if(!p){p=d.createElement('span');p.id='probe-'+i;p.style.display='none';(side?d.getElementById('sidebar'):d.body).append(p)}p.style.backgroundColor=color.startsWith('--')?'var('+color+')':color}return {role:actual,actual:sample('probe-'+i,'backgroundColor'),expected:sample('probe-'+i,'backgroundColor',true)}})`)
        for (const r of row.roles) samePixel(r.actual,r.expected,`${mode}/${r.role}`,failures)
        await b.evaluate(`document.getElementById('working').textContent='Worked for 1m'`)
        samePixel(await b.evaluate(`sample('working','color')`),await b.evaluate(`sample('working','color',true)`),`${mode}/Worked text`,failures)
        await b.evaluate(`document.getElementById('working').textContent='Working for 1m'`)
        row.foregrounds=[]
        for (const id of ['working','body-text','tool-label','tool-icon']) {
          const colors={id,actual:await b.evaluate(`sample('${id}','color')`),expected:await b.evaluate(`sample('${id}','color',true)`)}
          samePixel(colors.actual,colors.expected,`${mode}/${id}`,failures);row.foregrounds.push(colors)
        }
        const composer={actual:await b.evaluate(`sample('composer','backgroundColor')`),expected:await b.evaluate(`sample('composer','backgroundColor',true)`)}
        samePixel(composer.actual,composer.expected,`${mode}/composer`,failures);row.composer=composer
        assert.equal(await b.evaluate(`getComputedStyle(document.getElementById('shelf')).borderBottomWidth`),'0px','Sidebar Working is a shelf toggle, not the chat activity divider')
        // The resize hairline and visible native sidebar edge share one role.
        row.split=await b.evaluate(`sample('split','backgroundColor')`)
        if (JSON.stringify(row.split.raw)!==JSON.stringify(row.boundary.actual.raw)) failures.push(`${mode}/split hairline ${JSON.stringify(row.split)} != ${JSON.stringify(row.boundary.actual)}`)
        for (const disabled of [false,true]) {
          await b.evaluate(`document.getElementById('primary').disabled=${disabled};document.querySelector('iframe').contentDocument.getElementById('primary').disabled=${disabled}`)
          for (const hovered of [true,false]) {
            await b.call('CSS.forcePseudoState',{nodeId:b.primaryNodeId,forcedPseudoClasses:hovered?['hover']:[]})
            await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:1270,y:790})
            await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            // Oracle hover rule is the source-derived destructive token at 100%.
            await b.evaluate(`document.querySelector('iframe').contentDocument.getElementById('primary').style.background=${hovered?"'var(--destructive)'":"''"}`)
            const stopPaint=await b.evaluate(`sample('primary','backgroundColor')`)
            samePixel(stopPaint,await b.evaluate(`sample('primary','backgroundColor',true)`),`${mode}/stop/hover=${hovered}/disabled=${disabled}`,failures)
            if(stopPaint.opacity!=='1') failures.push(`${mode}/Stop opacity=${stopPaint.opacity}`)
            if ((await b.evaluate(`getComputedStyle(document.getElementById('primary')).color`))!=='rgb(255, 255, 255)') failures.push(`${mode}/stop ink is not white`)
          }
        }
        await b.evaluate(`document.getElementById('primary').disabled=false;document.querySelector('iframe').contentDocument.getElementById('primary').disabled=false;document.getElementById('primary').innerHTML='<i class="codicon codicon-arrow-up"></i>';document.getElementById('primary').setAttribute('aria-label','Stop')`)
        const send=await b.evaluate(`sample('primary','backgroundColor')`)
        if (JSON.stringify(send.raw)===JSON.stringify(row.stop.actual.raw)) failures.push(`${mode}/send branch incorrectly shares stop paint`)
        await b.evaluate(`document.getElementById('primary').innerHTML='<span class="block size-2.5 rounded-[0.1875rem] bg-current"></span>';document.documentElement.style.setProperty('--dt-font-sans','"Changed Live", sans-serif')`)
        assert.match(await b.evaluate(`getComputedStyle(document.getElementById('working')).fontFamily`),/Changed Live/)
        cases.push(row)
      }
      await b.evaluate('disable()')
      const off=await b.evaluate(`({flag:document.documentElement.hasAttribute('data-codex-chat-look'),styles:document.querySelectorAll('#codex-chat-look-style').length,errors})`)
      assert.equal(off.flag,false);assert.deepEqual(off.errors,[])
      receipts.cases.push(...cases)
      assert.deepEqual(failures,[])
    } finally { b.close() }
  })
}

test('vivid external bright/dark themes remain native; semantic adaptations do not impose T3 palettes', async () => {
  const b=await fixture()
  try {
    for(const mode of ['light','dark','light']) {
      const theme={...t3Themes[0],name:'external-vivid',customCSS:undefined,colors:{...t3Themes[0].colors,background:mode==='light'?'#f0ffdb':'#120c30',sidebarBackground:mode==='light'?'#e8ffb0':'#291050',foreground:mode==='light'?'#36104f':'#f1edff',border:'#ff00f4',destructive:'#00a6ee'},darkColors:undefined}
      await b.evaluate(`nativePaint(${JSON.stringify(theme)},'${mode}')`)
      const native=await b.evaluate(`({bg:sample('sidebar','backgroundColor'),send:sample('primary','backgroundColor')})`)
      await b.evaluate('enable()')
      const active=await b.evaluate(`({bg:sample('sidebar','backgroundColor'),send:sample('primary','backgroundColor')})`)
      assert.deepEqual(active.bg.painted,native.bg.painted)
      await b.evaluate(`document.getElementById('primary').innerHTML='<i class="codicon codicon-arrow-up"></i>'`)
      assert.deepEqual((await b.evaluate(`sample('primary','backgroundColor')`)).raw,native.send.raw)
      await b.evaluate(`document.getElementById('primary').innerHTML='<span class="block size-2.5 rounded-[0.1875rem] bg-current"></span>';disable()`)
      assert.deepEqual(await b.evaluate(`({bg:sample('sidebar','backgroundColor'),send:sample('primary','backgroundColor')})`),native)
    }
  } finally {b.close()}
})

test('Glass sidebar uses the reference sidebar tint without repainting chat or changing native glass controls', async () => {
  const b = await fixture(), failures = [], cases = []
  try {
    await b.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await b.call('Emulation.setDefaultBackgroundColorOverride', { color: { r: 23, g: 37, b: 53, a: 1 } })
    await b.evaluate(`document.documentElement.dataset.hermesGlass='';document.documentElement.dataset.hermesGlassScope='sidebar';document.documentElement.style.setProperty('--glass-rail-edge','280px');enable()`)
    const pixel = async x => {
      assert.match(await b.evaluate(`document.elementFromPoint(${x},850)?.tagName || ''`), /^(BODY|HTML)$/, 'Sample the sole body field painter, not a foreground card')
      const { data } = await b.call('Page.captureScreenshot', { format: 'png', clip: { x, y: 850, width: 1, height: 1, scale: 1 } })
      return b.evaluate(`new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=c.height=1;const q=c.getContext('2d');q.drawImage(i,0,0);resolve([...q.getImageData(0,0,1,1).data])};i.onerror=reject;i.src=${JSON.stringify('data:image/png;base64,' + data)}})`)
    }
    for (const theme of t3Themes) for (const mode of ['light', 'dark']) {
      await b.evaluate(`nativePaint(${JSON.stringify(theme)},${JSON.stringify(mode)});oraclePaint(${JSON.stringify(ids[theme.name])},${JSON.stringify(mode)},${JSON.stringify(paletteFor(ids[theme.name],mode))})`)
      for (const direction of ['ltr', 'rtl']) {
        await b.evaluate(`document.documentElement.dir=${JSON.stringify(direction)};document.documentElement.style.setProperty('--translucency-glass-keep','0%')`)
        await b.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        const underlay = await pixel(direction === 'ltr' ? 10 : 1270)
        for (const keep of [100, 60]) {
        await b.evaluate(`document.documentElement.dir=${JSON.stringify(direction)};document.documentElement.style.setProperty('--translucency-glass-keep','${keep}%')`)
        await b.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        const reference = await b.evaluate(`(()=>{const d=document.querySelector('iframe').contentDocument;const c=document.createElement('canvas');c.width=c.height=1;const q=c.getContext('2d');q.fillStyle='rgb(${underlay.slice(0,3).join(' ')})';q.fillRect(0,0,1,1);q.globalAlpha=${keep}/100;q.fillStyle=d.defaultView.getComputedStyle(d.getElementById('sidebar')).backgroundColor;q.fillRect(0,0,1,1);return [...q.getImageData(0,0,1,1).data]})()`)
        const actual = await pixel(direction === 'ltr' ? 10 : 1270)
        const chat = await pixel(direction === 'ltr' ? 600 : 10)
        const expectedChat = await b.evaluate(`(()=>{const c=document.createElement('canvas');c.width=c.height=1;const q=c.getContext('2d');q.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--ui-bg-chrome');q.fillRect(0,0,1,1);return [...q.getImageData(0,0,1,1).data]})()`)
        const row = { theme: theme.name, mode, direction, keep, actual, reference, chat, expectedChat, metrics: await b.evaluate('metrics()'), state: await b.evaluate(`({glass:document.documentElement.hasAttribute('data-hermes-glass'),scope:document.documentElement.dataset.hermesGlassScope,keep:document.documentElement.style.getPropertyValue('--translucency-glass-keep'),font:document.documentElement.style.getPropertyValue('--dt-font-sans'),composer:sample('composer','backgroundColor'),glassSidebarToken:getComputedStyle(document.documentElement).getPropertyValue('--ui-sidebar-surface-background').trim()})`) }
        cases.push(row)
        if (actual.some((v, i) => Math.abs(v-reference[i]) > 1)) failures.push(`${theme.name}/${mode}/${direction}/${keep}: sidebar ${actual} != ${reference}`)
        if (chat.some((v, i) => Math.abs(v-expectedChat[i]) > 1)) failures.push(`${theme.name}/${mode}/${direction}/${keep}: chat ${chat} != ${expectedChat}`)
        assert.equal(row.state.glass, true); assert.equal(row.state.scope, 'sidebar'); assert.equal(row.state.keep, `${keep}%`)
        assert.equal(row.state.glassSidebarToken, 'transparent', 'Preserve the native single-painter surface contract')
        }
      }
    }
    receipts.glassSidebar = cases
    assert.deepEqual(failures, [])
  } finally { try { await b.evaluate('disable()') } finally { b.close() } }
})

test('composer outline matches the actual T3 ComposerSurface rather than the generic border, with and without typing focus', async () => {
  const b = await fixture(), failures = [], cases = []
  try {
    const oracle = `<div class="${composerShellClasses}"><div id="composer" class="${composerHostClasses}">Composer</div></div>`
    await b.evaluate(`document.querySelector('iframe').contentDocument.getElementById('composer').outerHTML=${JSON.stringify(oracle)};document.getElementById('composer').insertAdjacentHTML('beforeend','<input id="typing-focus" aria-label="Synthetic composer input">')`)
    await b.evaluate('enable()')
    for (const theme of t3Themes) for (const mode of ['light', 'dark']) {
      await b.evaluate(`nativePaint(${JSON.stringify(theme)},${JSON.stringify(mode)});oraclePaint(${JSON.stringify(ids[theme.name])},${JSON.stringify(mode)},${JSON.stringify(paletteFor(ids[theme.name],mode))})`)
      for (const focused of [false, true]) {
        await b.evaluate(`document.getElementById('typing-focus').${focused ? 'focus' : 'blur'}();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
        const row = await b.evaluate(`(()=>{
          const c=document.getElementById('composer'),o=document.querySelector('iframe').contentDocument,e=o.getElementById('composer');
          const raw=color=>{const a=document.createElement('canvas');a.width=a.height=1;const q=a.getContext('2d');q.fillStyle=color;q.fillRect(0,0,1,1);return [...q.getImageData(0,0,1,1).data]};
          const a=getComputedStyle(c),r=o.defaultView.getComputedStyle(e,'::after');
          return {actual:{css:a.borderTopColor,rgba:raw(a.borderTopColor)},expected:{css:r.borderTopColor,rgba:raw(r.borderTopColor),width:r.borderTopWidth},metrics:metrics(),body:getComputedStyle(document.body).backgroundImage,fill:a.backgroundColor,shadow:a.boxShadow,font:a.fontFamily,sidebar:sample('sidebar','backgroundColor'),split:sample('split','backgroundColor')}
        })()`)
        cases.push({theme:theme.name,mode,focused,...row})
        assert.equal(row.expected.width,'1px','Compile and observe the real upstream outline painter')
        assert.ok(row.expected.rgba[3]>0,'Upstream outline must be a real nontransparent color')
        if(row.actual.rgba.some((v,i)=>Math.abs(v-row.expected.rgba[i])>1)) failures.push({theme:theme.name,mode,focused,actual:row.actual,expected:row.expected})
      }
    }
    receipts.composerSource=sha(composerSource)
    receipts.composerOutlines=cases
    assert.deepEqual(failures,[])
  } finally { try { await b.evaluate('disable()') } finally { b.close() } }
})

test('T3 composers match real Shell/Host/Main and native backing plus derived status contrast at DPR 1 and 2', async () => {
  const context={exports:{},React:{createElement:(type,props,...children)=>({type,props,children})},cn:(...values)=>values.flat().filter(Boolean).join(' ')}
  vm.runInNewContext(ts.transpileModule(composerSource.replace(/^import[^\n]+\n/gm,''),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText,context)
  const html=node=>node==null||node===false?'':typeof node==='object'?`<${node.type} ${Object.entries(node.props||{}).filter(([k,v])=>k!=='children'&&v!=null&&v!==false).map(([k,v])=>`${k==='className'?'class':k}="${String(v)}"`).join(' ')}>${(node.children.length?node.children:[node.props?.children]).map(html).join('')}</${node.type}>`:String(node)
  const {Shell,Host,Main}=context.exports.ComposerSurface
  const oracle=html(Shell({id:'real-composer-shell',children:Host({id:'real-composer-host',children:Main({id:'real-composer-main'})})}))
  const nativeComposerSource=await readFile(`${hostRoot}/apps/desktop/src/app/chat/composer/index.tsx`,'utf8')
  const nativeDockSource=await readFile(`${hostRoot}/apps/desktop/src/components/chat/composer-dock.ts`,'utf8')
  const dock={exports:{},cn:context.cn}
  vm.runInNewContext(ts.transpileModule(nativeDockSource.replace(/^import[^\n]+\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,dock)
  const nativeClasses=nativeComposerSource.match(/'(group\/composer-surface relative z-4[^']+)'/)[1]
  const b=await fixture(),rows=[],failures=[]
  try{
    await b.evaluate(`(()=>{for(const d of [document,document.querySelector('iframe').contentDocument]){const s=d.createElement('style');s.textContent='*,::before,::after{transition:none!important;animation:none!important}';d.head.append(s)}})()`)
    await b.evaluate(`(()=>{const n=document.getElementById('composer');n.className=${JSON.stringify(nativeClasses)};n.style.cssText='position:fixed;left:320px;top:350px;width:400px;height:100px';n.insertAdjacentHTML('afterbegin',${JSON.stringify(`<div id="real-native-backing" aria-hidden="true" class="${dock.exports.composerInputBacking}"></div><textarea id="paint-focus" style="position:absolute;left:0;top:0;width:30px;height:20px;background:transparent"></textarea>`)});const o=document.querySelector('iframe').contentDocument;o.body.insertAdjacentHTML('beforeend',${JSON.stringify(oracle)});o.getElementById('real-composer-shell').style.cssText='position:fixed;left:0;top:350px;width:400px;height:100px';o.getElementById('real-composer-host').style.height='100px';o.getElementById('real-composer-main').style.height='100px'})()`)
    await b.evaluate(`document.querySelector('[data-slot="composer-root"]').insertAdjacentHTML('beforeend','<div data-slot="composer-status-stack"><div id="real-status-frame" style="position:fixed;left:320px;top:300px;width:400px;height:30px"><div data-slot="status-stack-scroll"></div></div></div>')`)
    await b.evaluate('enable()')
    const pixel=async (oracle,id=oracle?'real-composer-host':'composer',y=50)=>{const clip=await b.evaluate(`(()=>{const f=document.querySelector('iframe'),d=${oracle?'f.contentDocument':'document'},r=d.getElementById(${JSON.stringify(id)}).getBoundingClientRect(),q=${oracle?'f.getBoundingClientRect()':'{x:0,y:0}'};return{x:r.left+250+q.x,y:r.top+${y}+q.y,width:1,height:1,scale:1}})()`);const {data}=await b.call('Page.captureScreenshot',{format:'png',clip});return b.evaluate(`new Promise(resolve=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const q=c.getContext('2d');q.drawImage(i,0,0);resolve([...q.getImageData(0,0,c.width,c.height).data])};i.src=${JSON.stringify('data:image/png;base64,'+data)}})`)}
    for(const dpr of [1,2]){
      await b.call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:dpr,mobile:false})
      for(const theme of t3Themes)for(const mode of ['light','dark'])for(const glass of [false,true])for(const focus of [false,true]){
        const id=ids[theme.name]
        await b.evaluate(`document.documentElement.dir='ltr';nativePaint(${JSON.stringify(theme)},'${mode}');oraclePaint('${id}','${mode}',${JSON.stringify(paletteFor(id,mode))});document.documentElement.toggleAttribute('data-hermes-glass',${glass});document.documentElement.dataset.hermesGlassScope='sidebar';document.documentElement.style.setProperty('--translucency-glass-keep','70%');document.documentElement.style.setProperty('--glass-rail-edge','280px');document.getElementById('paint-focus').${focus?'focus':'blur'}();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
        const row={theme:theme.name,mode,glass,focus,dpr,actual:await pixel(false),expected:await pixel(true)}
        // This is a uniform-canvas/default-opacity endpoint check. It does not
        // reproduce dynamic backdrop blur/saturation or user opacity settings.
        row.backing=await b.evaluate(`sample('real-native-backing','backgroundColor')`)
        // Keep the independent upstream composer endpoint. Only the approved
        // status derivation changes; Glass retains its transparent input.
        row.midpoint=await b.evaluate(`(()=>{const o=document.querySelector('iframe').contentDocument,c=o.createElement('canvas');c.width=c.height=1;const q=c.getContext('2d');q.fillStyle=o.defaultView.getComputedStyle(o.body).backgroundColor;q.fillRect(0,0,1,1);q.fillStyle=o.defaultView.getComputedStyle(o.getElementById('real-composer-shell'),'::before').backgroundColor;q.fillRect(0,0,1,1);const endpoint=[...q.getImageData(0,0,1,1).data];let e=o.getElementById('source-midpoint');if(!e){e=o.createElement('div');e.id='source-midpoint';e.style.cssText='position:fixed;left:0;top:300px;width:400px;height:30px';o.body.append(e)}e.style.backgroundColor='oklch(from color-mix(in srgb, rgb('+endpoint.slice(0,3).join(' ')+') 50%, ${glass ? 'transparent' : 'var(--background)'}) clamp(0, calc(l ${mode === 'dark' ? '+ 0.04' : '- 0.025'}), 1) c h)';return {actual:sample('real-status-frame','backgroundColor'),expected:sample('source-midpoint','backgroundColor',true)}})()`)
        // Compare the independent reference color at the same coordinate and
        // over the same native Glass painter, not an opaque upstream iframe.
        const originalStatusStyle=await b.evaluate(`document.getElementById('real-status-frame').getAttribute('style')`)
        await b.evaluate(`document.getElementById('real-status-frame').style.setProperty('background',${JSON.stringify(row.midpoint.expected.css)},'important')`)
        row.midpoint.expectedPainted=await pixel(false,'real-status-frame',15)
        await b.evaluate(`document.getElementById('real-status-frame').setAttribute('style',${JSON.stringify(originalStatusStyle)})`)
        row.midpoint.actualPainted=await pixel(false,'real-status-frame',15)
        if(row.midpoint.actualPainted.some((v,i)=>Math.abs(v-row.midpoint.expectedPainted[i])>1))failures.push({theme:theme.name,mode,glass,focus,dpr,midpoint:row.midpoint})
        if(row.backing.painted.some((v,i)=>Math.abs(v-row.expected[i])>1))failures.push({theme:theme.name,mode,glass,focus,dpr,backing:row.backing,expected:row.expected})
        rows.push(row);if(row.actual.some((v,i)=>Math.abs(v-row.expected[i])>1))failures.push(row)
      }
    }
    receipts.t3Composer={composerSource:sha(composerSource),nativeComposerSource:sha(nativeComposerSource),nativeDockSource:sha(nativeDockSource),scope:'uniform canvas, source-default opacity; not full dynamic material',cases:rows}
    assert.equal(rows.length,96);assert.deepEqual(failures,[])
  }finally{try{await b.evaluate('disable()')}finally{b.close()}}
})

test.after(async()=>{for(const fn of disposers.reverse())fn();if(process.env.T3_PAINT_RECEIPT)await writeFile(process.env.T3_PAINT_RECEIPT,JSON.stringify(receipts,null,2)+'\n')})
