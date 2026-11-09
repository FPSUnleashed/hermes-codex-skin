import assert from 'node:assert/strict'
import { readFile, appendFile, writeFile } from 'node:fs/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { chromium, waitForRendered } from './helpers/chromium.mjs'
import { nativeStatusFixture } from './helpers/status-theme-fixture.mjs'
import { approvedStatusPanelColor, statusPanelPaintFailures } from './helpers/status-panel-paint-oracle.mjs'

// Test-only copy. Exact frozen v10/candidate, native writer and pinned native CSS.
const target = fileURLToPath(new URL('../', import.meta.url))
const baseline = process.env.STATUS_PANEL_BASELINE
const output = process.env.STATUS_PANEL_EVIDENCE
assert.ok(baseline && output && process.env.STATUS_PANEL_AA_PLAN)
const sha = s => createHash('sha256').update(s).digest('hex')
const native = nativeStatusFixture()
const offline = { window: {} }
vm.runInNewContext(native.script, offline)
assert.equal(typeof offline.window.nativePaint, 'function')
const builds = []
for (const root of [baseline, target]) {
  const { loadPluginInternals } = await import(pathToFileURL(`${root}/test/helpers/load-plugin.mjs`))
  const internals = await loadPluginInternals(['CSS', 'decorateComposerChrome', 'clearComposerChromeDecorations', 'T3_PAINT_ROLE_MAP'])
  const themes = []
  internals.plugin.register({ storage: { get: (_k, fallback) => fallback, set: () => { throw Error('Preference write') } }, register: e => { if (e.area === 'themes') themes.push(JSON.parse(JSON.stringify(e.data))) }, onDispose: () => {} })
  builds.push({ ...internals, themes, bundle: sha(await readFile(`${root}/codex-chat-look/plugin.js`)) })
}
const themes = [...native.themes, ...builds[1].themes]
assert.equal(new Set(themes.map(t => t.name)).size, themes.length)
const modes = ['light', 'dark'], glasses = ['off', 'sidebar', 'window'], states = ['rest', 'scrolled', 'hover', 'focus']
const historical = JSON.parse(await readFile(process.env.STATUS_PANEL_AA_PLAN, 'utf8'))
const plan = { baseline: builds[0].bundle, candidate: builds[1].bundle, nativeInputs: native.inputs, themes: themes.map(t => t.name), modes, glasses, states, plannedCases: themes.length * modes.length * glasses.length * states.length, plannedAACases: historical.aa_cells.length * 2, comparison: 'strict A/B at identical screen coordinate; A/A placement controls for every historical affected theme/mode', oracle: 'independently painted sRGB midpoint with approved OKLCH lightness step', paintToleranceUnchanged: 2 }
await writeFile(`${output}/paint-plan.json`, JSON.stringify(plan, null, 2) + '\n')
if (process.env.STATUS_PANEL_PREPARE_ONLY === '1') { console.log(JSON.stringify({ prepared: true, ...plan })); process.exit(0) }
const markup = `<div id="chat" style="background:var(--ui-chat-surface-background);min-height:460px"><div id="backdrop" style="height:40px"></div><div id="dock" data-slot="composer-dock" class="group/composer-dock"><div class="status-drawer" id="drawer"><div class="status-drawer-clip"><div class="status-drawer-content"><div data-slot="composer-status-stack"><div id="frame"><div data-slot="status-stack-scroll"><div data-slot="status-stack-content" id="status" class="opacity-100"><div data-slot="status-stack-section"><button id="queue" type="button">2 agents</button></div><div data-slot="status-stack-section" style="height:80px"></div></div></div></div></div></div></div></div><div data-slot="composer-root" id="composer-root"><div data-slot="composer-surface" id="composer" style="position:relative"><div aria-hidden="true" style="position:absolute;inset:0"></div><input id="input" aria-label="Composer" style="position:relative;margin:10px" /></div></div></div><button id="outside">Outside</button></div>`
const fixtureCSS = `*{box-sizing:border-box}html,body{margin:0;min-height:460px}#dock{position:relative;width:440px!important;padding:0!important;margin:0}#frame{min-height:100px}#composer{height:110px}#status{transition:none!important}#queue{height:25px}#outside{position:absolute;left:10px;top:400px}.status-drawer{display:grid;grid-template-rows:1fr}.status-drawer[data-collapsed]{grid-template-rows:0fr}.status-drawer-clip{min-height:0;overflow:hidden}.status-drawer[data-collapsed] .status-drawer-content{visibility:hidden;opacity:0}`
const b = await chromium()
const rows = [], failures = [], aaRows = [], preservation = [], collapseTiming = []
try {
  await b.call('Emulation.setDeviceMetricsOverride', { width: 1000, height: 500, deviceScaleFactor: 1, mobile: false })
  await b.call('Page.setDocumentContent', { frameId: (await b.call('Page.getFrameTree')).frameTree.frame.id, html: '<!doctype html><html style="background:#172535"><body style="margin:0;display:flex;background:#172535"><iframe id="base" style="width:480px;height:480px;border:0"></iframe><iframe id="next" style="width:480px;height:480px;border:0"></iframe></body></html>' })
  const setupFrames = async (indices = [0, 1]) => {
    for (const [i, id] of ['base', 'next'].entries()) {
      const build = builds[indices[i]]
      const script = `${native.script}\nwindow.decorate=${build.decorateComposerChrome.toString()};window.clear=${build.clearComposerChromeDecorations.toString()};document.documentElement.dataset.codexChatLook='true';decorate();window.original={queue:document.getElementById('queue'),input:document.getElementById('input'),status:document.getElementById('status')};window.clicks=0;original.queue.onclick=()=>clicks++;`
      new vm.Script(script)
      await b.evaluate(`(()=>{const f=document.getElementById('${id}'),d=f.contentDocument;d.open();d.write(${JSON.stringify(`<!doctype html><html><head><style>${native.css}</style><style>${fixtureCSS}</style><style id="skin">${build.CSS}</style></head><body>${markup}</body></html>`)});d.close();f.contentWindow.eval(${JSON.stringify(script)});if(typeof f.contentWindow.nativePaint!=='function')throw Error('Native writer setup failed')})()`)
    }
  }
  const pixels = async (points, captureName) => {
    const { data } = await b.call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 960, height: 360, scale: 1 } })
    if (captureName) await writeFile(`${output}/${captureName}.png`, Buffer.from(data, 'base64'))
    return b.evaluate(`new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(i,0,0);resolve(${JSON.stringify(points)}.map(([x,y])=>[...q.getImageData(x,y,1,1).data]))};i.onerror=reject;i.src=${JSON.stringify('data:image/png;base64,' + data)}})`)
  }
  // Keep both frame layouts unchanged. Only the selected frame paints, always
  // at x=0. This removes screen-position-dependent Glass quantization, without
  // widening pixel tolerances or changing production CSS or the native writer.
  const placement = async (id, sideBySide = false) => b.evaluate(`(()=>{for(const key of ['base','next']){const f=document.getElementById(key);f.style.visibility=${sideBySide}||key===${JSON.stringify(id)}?'visible':'hidden';f.style.position='absolute';f.style.left=${sideBySide}&&key==='next'?'480px':'0px';f.style.top='0px'}})()`)
  const applyThemes = async (pair, mode, glass) => b.evaluate(`(()=>{for(const[id,theme]of ${JSON.stringify(['base', 'next'].map((id,i)=>[id,pair[i]]))}){const w=document.getElementById(id).contentWindow,r=w.document.documentElement;r.removeAttribute('data-hermes-glass');r.removeAttribute('data-hermes-glass-scope');if('${glass}'!=='off'){r.dataset.hermesGlass='';r.dataset.hermesGlassScope='${glass}';r.style.setProperty('--translucency-glass-keep','60%');r.style.setProperty('--glass-rail-edge','0px')}w.nativePaint(theme,'${mode}');w.decorate();if((w.document.getElementById('hermes-desktop-custom-css')?.textContent||'')!==(theme.customCSS?.trim()||''))throw Error('Native customCSS injection mismatch')}})()`)
  const pointsFor = m => [[220,20],[220,Math.floor(m.frame.rect[1]+60)],[220,Math.floor(m.composer.rect[1]+65)]]
  const readMetrics = async (id, state) => b.evaluate(`(()=>{const w=document.getElementById('${id}').contentWindow,d=w.document,r=d.getElementById('composer-root'),s=d.getElementById('status');r.toggleAttribute('data-thread-scrolled-up','${state}'!=='rest');s.className='${state}'==='scrolled'?'opacity-30 group-hover/composer-dock:opacity-100 group-focus-within/composer-dock:opacity-100':'opacity-100';if('${state}'==='focus')w.focus();d.getElementById('input')['${state}'==='focus'?'focus':'blur']();w.decorate();const sample=e=>{const a=w.getComputedStyle(e),b=e.getBoundingClientRect();return{background:a.backgroundColor,color:a.color,opacity:a.opacity,rect:[b.x,b.y,b.width,b.height],font:a.fontFamily,border:a.borderColor,shadow:a.boxShadow,backdrop:a.backdropFilter}};return{status:sample(s),frame:sample(d.getElementById('frame')),composer:sample(d.getElementById('composer')),body:sample(d.body),outside:sample(d.getElementById('outside')),identity:w.original.queue===d.getElementById('queue')&&w.original.input===d.getElementById('input')&&w.original.status===s,text:d.getElementById('queue').textContent,mode:d.documentElement.dataset.hermesMode,focused:d.activeElement===d.getElementById('input')&&d.hasFocus()}})()`)

  // A/A controls use each exact build twice at the original two positions,
  // then compare both at the left position. Cover every historical affected cell.
  for (const buildIndex of [0,1]) {
    await setupFrames([buildIndex,buildIndex])
    for (const cell of historical.aa_cells) {
      const theme = builds[buildIndex].themes.find(t=>t.name===cell.theme) || themes.find(t=>t.name===cell.theme)
      await placement('base', true)
      await applyThemes([theme,theme], cell.requestedMode, cell.glass)
      const m = await readMetrics('base','rest')
      await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
      const local = pointsFor(m), name = `aa-${buildIndex}-${aaRows.length}`
      const placed = await pixels([...local,...local.map(([x,y])=>[x+480,y])], `${name}-side-by-side`)
      await placement('next')
      const matched = await pixels(local, `${name}-same-coordinate`)
      const aa = { ...cell, build: buildIndex===0?'baseline':'candidate', points:local, left:placed.slice(0,3), right:placed.slice(3), sameCoordinate:matched, sameCoordinateEqual:JSON.stringify(placed.slice(0,3))===JSON.stringify(matched), differentPlacementDiffers:JSON.stringify(placed.slice(0,3))!==JSON.stringify(placed.slice(3)) }
      aaRows.push(aa); await appendFile(`${output}/aa-cases.jsonl`, JSON.stringify(aa)+'\n')
      assert.equal(aa.sameCoordinateEqual,true,'A/A must be strict-equal at identical screen coordinates')
    }
  }
  await placement('base',true)
  await setupFrames()
  // The captured failing frame had an active input in an unfocused document.
  // Establish target focus without forcing CSS focus pseudo-states.
  await b.call('Emulation.setFocusEmulationEnabled', { enabled: true })
  await b.call('DOM.enable'); await b.call('CSS.enable')
  const { root } = await b.call('DOM.getDocument', { depth:-1, pierce:true })
  const docks = []
  const walk = node => { if(node.attributes?.some((v,i,a)=>v==='id'&&a[i+1]==='dock')) docks.push(node.nodeId); for(const child of [...(node.children||[]),...(node.contentDocument?[node.contentDocument]:[])]) walk(child) }
  walk(root); assert.equal(docks.length,2)
  for (const theme of themes) for (const mode of modes) for (const glass of glasses) {
    const pair = builds.map(build=>build.themes.find(t=>t.name===theme.name)||theme)
    await applyThemes(pair,mode,glass)
    for (const state of states) {
      for (const nodeId of docks) await b.call('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:state==='hover'?['hover']:[]})
      const metrics = [], paint = []
      for (const id of ['base','next']) {
        await placement(id)
        const m = await readMetrics(id,state)
        assert.equal(m.focused,state==='focus','The frame being sampled must own focus in the focus case')
        m.focusPseudo = await b.evaluate(`(()=>{const d=document.getElementById('${id}').contentDocument,i=d.getElementById('input');return{focus:i.matches(':focus'),focusVisible:i.matches(':focus-visible')}})()`)
        assert.deepEqual(m.focusPseudo, { focus: state==='focus', focusVisible: state==='focus' })
        await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        metrics.push(m)
        paint.push(...await pixels(pointsFor(m),rows.length===0?`matrix-first-${id}`:undefined))
      }
      const row = { theme:theme.name,requestedMode:mode,glass,state,screenPoints:metrics.map(pointsFor),baseline:{chat:paint[0],panel:paint[1],composer:paint[2]},candidate:{chat:paint[3],panel:paint[4],composer:paint[5]},metrics }
      // Paint an independent approved color on the same native frame. Applying
      // the step to screenshot RGB endpoints would be wrong for translucent
      // Glass: adjust the uncomposited mix first, preserving its native alpha.
      const reference = approvedStatusPanelColor(metrics[1].mode)
      const saved = await b.evaluate(`(()=>{const e=document.getElementById('next').contentDocument.getElementById('frame'),s=e.style;const old={value:s.getPropertyValue('background-color'),priority:s.getPropertyPriority('background-color')};s.setProperty('background-color',${JSON.stringify(reference)},'important');return old})()`)
      let expected
      try {
        await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        const referencePaint = await pixels(pointsFor(metrics[1]))
        assert.deepEqual(referencePaint[0], row.candidate.chat, 'Reference must not change chat paint')
        assert.deepEqual(referencePaint[2], row.candidate.composer, 'Reference must not change composer paint')
        expected = referencePaint[1]
      } finally {
        await b.evaluate(`(()=>{const s=document.getElementById('next').contentDocument.getElementById('frame').style,old=${JSON.stringify(saved)};if(old.value)s.setProperty('background-color',old.value,old.priority);else s.removeProperty('background-color')})()`)
      }
      for (const failure of statusPanelPaintFailures(row, expected)) failures.push({case:rows.length,...failure})
      for(const key of ['chat','composer']) if(JSON.stringify(row.baseline[key])!==JSON.stringify(row.candidate[key])) failures.push({case:rows.length,reason:`unrelated-${key}-changed`,row})
      for(const m of metrics) assert.equal(m.identity&&m.text==='2 agents',true)
      for(const key of ['composer','outside']) assert.deepEqual(metrics[0][key],metrics[1][key],`Unrelated ${key} metrics changed`)
      assert.equal(metrics[0].status.opacity,metrics[1].status.opacity)
      assert.deepEqual(row.screenPoints[0],row.screenPoints[1])
      await appendFile(`${output}/paint-cases.jsonl`,JSON.stringify(row)+'\n'); rows.push(row)
    }
  }
  // The native transition remains enabled. Wait for the true collapsed/expanded
  // state, not the immediate post-attribute geometry; repeat with reduced motion.
  for (const motion of ['no-preference','reduce']) {
    await placement('base',true)
    await b.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:motion}]})
    const immediate = await b.evaluate(`['base','next'].map(id=>{const w=document.getElementById(id).contentWindow,d=w.document,drawer=d.getElementById('drawer');d.documentElement.dataset.codexChatLook='true';d.querySelector('[data-slot="status-stack-scroll"]').removeAttribute('style');w.decorate();w.clicks=0;w.original.queue.click();const initial=drawer.getBoundingClientRect().height;drawer.setAttribute('data-collapsed','');drawer.inert=true;const s=w.getComputedStyle(drawer);return{initial,height:drawer.getBoundingClientRect().height,property:s.transitionProperty,duration:s.transitionDuration,delay:s.transitionDelay}})`)
    collapseTiming.push({motion,immediate})
    await writeFile(`${output}/collapse-timing.json`,JSON.stringify(collapseTiming,null,2)+'\n')
    const settled = `['base','next'].every(id=>{const w=document.getElementById(id).contentWindow,d=w.document,e=d.getElementById('drawer');return [e,d.querySelector('.status-drawer-content')].every(n=>n.getAnimations().every(a=>a.playState==='finished'||a.playState==='idle'))})`
    await waitForRendered(b,`(${settled})&&['base','next'].every(id=>document.getElementById(id).contentDocument.getElementById('drawer').getBoundingClientRect().height===0)`,'Native drawer never reached collapsed zero height')
    const collapsed = await b.evaluate(`['base','next'].map(id=>{const w=document.getElementById(id).contentWindow,d=w.document,e=d.getElementById('drawer');return{height:e.getBoundingClientRect().height,inert:e.inert,visibility:w.getComputedStyle(d.querySelector('.status-drawer-content')).visibility}})`)
    await b.evaluate(`for(const id of ['base','next']){const e=document.getElementById(id).contentDocument.getElementById('drawer');e.removeAttribute('data-collapsed');e.inert=false}`)
    await waitForRendered(b,`(${settled})&&['base','next'].every(id=>document.getElementById(id).contentDocument.getElementById('drawer').getBoundingClientRect().height>0)`,'Native drawer never finished expanding')
    const pair = await b.evaluate(`['base','next'].map(id=>{const w=document.getElementById(id).contentWindow,d=w.document,drawer=d.getElementById('drawer'),scroll=d.querySelector('[data-slot="status-stack-scroll"]');const expanded=drawer.getBoundingClientRect().height;scroll.style.height='40px';scroll.style.overflowY='auto';scroll.scrollTop=17;const before=scroll.scrollTop;w.decorate();const after=scroll.scrollTop;w.clear();d.documentElement.removeAttribute('data-codex-chat-look');return{clicks:w.clicks,expanded,identity:w.original.queue===d.getElementById('queue')&&w.original.input===d.getElementById('input')&&w.original.status===d.getElementById('status'),scroll:{before,after,cleanup:scroll.scrollTop,sameNode:scroll===d.querySelector('[data-slot="status-stack-scroll"]')},decorations:d.querySelectorAll('[data-codex-status-card]').length}})`)
    for(const [i,p] of pair.entries()) p.collapsed=collapsed[i]
    assert.deepEqual(pair[0],pair[1]); assert.equal(pair[1].clicks,1); assert.equal(pair[1].collapsed.height,0); assert.equal(pair[1].collapsed.inert,true); assert.equal(pair[1].collapsed.visibility,'hidden'); assert.ok(pair[1].expanded>0); assert.equal(pair[1].decorations,0); assert.equal(pair[1].identity,true)
    assert.deepEqual(pair[1].scroll,{before:17,after:17,cleanup:17,sameNode:true})
    assert.deepEqual(immediate[0], immediate[1], 'Native drawer timing and immediate geometry must be preserved exactly')
    for(const timing of immediate) {
      // Native global .01ms!important remains computed even with property none.
      // Assert the absence of a transition and immediate collapse, not an inert duration.
      if(motion==='reduce') { assert.equal(timing.property,'none'); assert.equal(timing.delay,'0s'); assert.equal(timing.height,0) }
      else { assert.ok(timing.property.includes('grid-template-rows')); assert.equal(timing.duration,'0.2s'); assert.equal(timing.delay,'0.07s'); assert.ok(timing.height>0,'Reproduce the invalid immediate-height assertion before waiting') }
    }
    preservation.push({motion,baseline:pair[0],candidate:pair[1]})
    await writeFile(`${output}/preservation.json`,JSON.stringify(preservation,null,2)+'\n')
  }
  const red = rows.filter(r=>r.baseline.maxError>2)
  assert.ok(red.length>0,'Exact frozen v10 must fail the same approved-contrast paint oracle before GREEN can count')
  const report = { status:failures.length?'FAIL':'PASS',cases:rows.length,plannedCases:plan.plannedCases,baselineRedCases:red.length,candidateFailures:failures.length,failures,aaCases:aaRows.length,aaPlacementDifferences:aaRows.filter(r=>r.differentPlacementDiffers).length,aaSameCoordinateFailures:aaRows.filter(r=>!r.sameCoordinateEqual).length,preservation,collapseTiming,proof:'Chromium screenshot samples in source-shaped fixture, not native Mac acceptance or full suite' }
  await writeFile(`${output}/paint-result.json`,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report)); assert.equal(rows.length,plan.plannedCases); assert.equal(aaRows.length,plan.plannedAACases); assert.equal(failures.length,0)
} finally { b.close() }
