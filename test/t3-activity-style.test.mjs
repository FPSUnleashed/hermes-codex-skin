import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Exercise the installed Tailwind cascade and actual native React disclosures,
// not a hand-written preflight or an onclick that only changes aria-expanded.
const core = referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const nativeCSS = await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
const require = createRequire(`${core}/package.json`)
const ts = require('typescript')
// Preserve the real clipping ancestry, not only the row's own hit rectangle.
const assistantSource = await readFile(`${core}/apps/desktop/src/components/assistant-ui/thread/assistant-message.tsx`, 'utf8')
const assistantAST = ts.createSourceFile('assistant.tsx', assistantSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function wrapper(slot) {
  const found=[]
  function visit(n){if(ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.getText(assistantAST)==='data-slot'&&a.initializer?.text===slot))found.push(n);ts.forEachChild(n,visit)}
  visit(assistantAST);assert.equal(found.length,1)
  return found[0].openingElement.getText(assistantAST)+'{children}'+found[0].closingElement.getText(assistantAST)
}
const { outputFiles } = await require('esbuild').build({
  stdin: { resolveDir: core, loader: 'tsx', contents: `
    import React,{useState} from 'react';
    import {cn} from './apps/desktop/src/lib/utils';
    import {FadeText} from './apps/desktop/src/components/ui/fade-text';
    import {createRoot} from 'react-dom/client';
    import {DisclosureRow} from './apps/desktop/src/components/chat/disclosure-row';
    import {ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_META_CLASS,SCAFFOLD_GLYPH_CLASS} from './apps/desktop/src/components/chat/scaffold-row';
    import {GlyphSpinner} from './apps/desktop/src/components/ui/glyph-spinner';
    const h=React.createElement;
    const MessagePrimitive={Root:'div'},collapsedNotice=null,approval=false,activityOnly=false,onDoubleClick=undefined,enterRef=undefined;
    function NativeAssistant({children}){return (${wrapper('aui_assistant-message-root')})}
    function NativeContent({children}){return (${wrapper('aui_assistant-message-content')})}
    const icon=h('svg',{viewBox:'0 0 24 24',width:14,height:14,'aria-hidden':true},h('path',{d:'m5 7 5 5-5 5m8 0h6'}));
    const meta=()=>h('span',{className:'flex shrink-0 items-center gap-1.5'},h('span',{'data-slot':'timeline-timestamp',className:'text-[0.625rem] leading-4 tabular-nums text-(--conversation-scaffold-meta) '+SCAFFOLD_META_CLASS},h('time',null,'12:14')),h('span',{'data-duration':'',className:SCAFFOLD_META_CLASS},'12.8s'));
    function Tool({id,label,running=false,error=false,warning=false}){
      const[open,setOpen]=useState(false);
      return h('div',{id,'data-slot':'tool-block','data-tool-row':'','data-conversation-scaffold':'','data-tool-open':open?'':undefined,
        className:'group/tool-block min-w-0 max-w-full overflow-hidden text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)'+(open?' rounded-[0.3125rem] border border-(--ui-stroke-tertiary)':'')},
        h('div',{className:open?'border-b border-(--ui-stroke-tertiary) px-2 py-1.5':undefined},
          h(DisclosureRow,{open,onToggle:()=>{window.nativeToggles++;setOpen(!open)},trailing:meta()},
            h('span',{className:'flex min-w-0 items-center gap-1.5'},
              h('span',{className:SCAFFOLD_GLYPH_CLASS+' self-center'},running?h(GlyphSpinner,{ariaLabel:'Running',className:'size-3.5 shrink-0 text-[0.95rem] text-(--ui-text-tertiary)',spinner:'breathe'}):icon),
              h('span',{className:SCAFFOLD_LABEL_CLASS+' block min-w-0 max-w-full overflow-hidden whitespace-nowrap'+(error?' text-destructive':warning?' text-amber-700':'')},label)))),
        open?h('div',{className:'relative grid w-full min-w-0 max-w-full gap-1.5 overflow-hidden p-1.5','data-native-detail':''},
          h('pre',{className:'max-h-20 max-w-full overflow-auto bg-transparent px-2 py-1.5 font-mono text-[0.7rem] leading-relaxed'},Array.from({length:40},(_,i)=>'Exact native output '+i).join('\\n')),
          h('button',{type:'button',onClick:()=>window.detailClicks++},'Inspect output')):null);
    }
    function Thinking({id,live}){
      const[open,setOpen]=useState(live);
      return h('div',{'data-streaming':live?'true':undefined},h('div',{id,'data-slot':'aui_thinking-disclosure','data-conversation-scaffold':'',className:'text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)'},
        h(ScaffoldRow,{open,onToggle:()=>{window.nativeToggles++;setOpen(!open)},trailing:meta()},h('span',{className:SCAFFOLD_LABEL_CLASS+(live?' shimmer':'')},live?'Thinking…':'Thought for 2s')),
        open?h('div',{'data-slot':'aui_thinking-body',className:'mt-0.5 w-full min-w-0 max-w-full overflow-auto overscroll-x-contain overscroll-y-auto wrap-anywhere pb-1'},
          h('div',{'data-slot':'aui_reasoning-text'},h('div',{className:'aui-md'},h('p',null,'Reasoning remains intentionally compact.')))):null));
    }
    function Summary({open,onToggle}){return h('div',{'data-tool-summary':'','data-conversation-scaffold':''},
      h(ScaffoldRow,{open,onToggle,trailing:meta()},h(FadeText,{className:SCAFFOLD_LABEL_CLASS+' truncate'},'Read 2 files and ran 1 command')))}
    function Controls(){return h('div',null,
      h('div',{'data-slot':'tool-clarify','data-conversation-scaffold':'',id:'clarify'},h(ScaffoldRow,{trailing:meta()},h('span',{className:SCAFFOLD_LABEL_CLASS},'Choose a target'))),
      h('div',{'data-slot':'connector-card',id:'connector'},h('span',{className:'text-[length:var(--conversation-tool-font-size)] text-(--ui-text-primary)'},'Native connector')),
      h('div',{'data-slot':'tool-approval-inline'},h('button',{id:'approval'},'Approve')))}
    function Group(){const[open,setOpen]=useState(true);return h('div',{'data-slot':'tool-block','data-tool-group':'',className:'grid min-w-0 max-w-full gap-(--tool-row-gap) overflow-hidden'},h(Summary,{open,onToggle:()=>setOpen(!open)}),
        open?h('div',{id:'calls',className:'grid min-w-0 max-w-full gap-(--tool-row-gap)'},
          h(Tool,{id:'long',label:'Read /shared/a/very/long/path/to/a/file/that/must/not/push/the/disclosure/off/the/pane/configuration.json'}),
          h(Tool,{id:'running',label:'Running command',running:true}),h(Tool,{id:'failed',label:'Failed command',error:true}),h(Tool,{id:'warning',label:'Recovered command',warning:true}),
          ...Array.from({length:20},(_,i)=>h(Tool,{key:i,id:'call-'+i,label:'Read file '+i}))):null)}
    function Fixture(){return h('main',{id:'pane','data-slot':'aui_thread-content'},
      h(NativeAssistant,null,h(NativeContent,null,h(Group),
        h(Thinking,{id:'live-thinking',live:true}),h(Thinking,{id:'settled-thinking',live:false}),h(Controls))),
      h('div',{'data-slot':'aui_background-result'},h(Tool,{id:'background-tool',label:'Background command'}),h(Controls)))}
    window.nativeToggles=0;window.detailClicks=0;createRoot(document.getElementById('fixture')).render(h(Fixture));
  ` },
  bundle: true, format: 'iife', write: false, jsx: 'automatic', outdir: 't3-native-fixture',
  tsconfigRaw: { compilerOptions: { baseUrl: core, paths: { '@/*': ['apps/desktop/src/*'] } } },
  define: { 'process.env.NODE_ENV': '"production"' }
})

async function settle(browser) {
  await browser.evaluate(`(async()=>{document.body.getBoundingClientRect();await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))})()`)
}
async function fixture(theme = 'dark', scale = 1) {
  const { CSS } = await loadPluginInternals(['CSS'])
  const browser = await chromium()
  try {
    await browser.call('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false })
    const foreground = theme === 'light' ? '#242424' : theme === 'colored' ? '#d9e8e1' : '#e8e8e8'
    const background = theme === 'light' ? '#ffffff' : theme === 'colored' ? '#073642' : '#111111'
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><html><head><style>${nativeCSS}</style><style>${outputFiles.filter(f => f.path.endsWith('.css')).map(f => f.text).join('\n')}</style><style>${CSS}</style><style>
      :root{--chat-text-scale:${scale};--ui-text-primary:${foreground};--ui-text-secondary:${foreground};--ui-base:${foreground};--ui-text-tertiary:#777;--ui-accent:#3b82f6;--ui-stroke-tertiary:#555;--ui-chat-surface-background:${background};--tool-row-gap:4px}
      body{background:${background};color:${foreground}}#pane{width:720px}
    </style></head><body><div id="fixture"></div></body></html>` })
    await browser.evaluate(outputFiles.find(f => f.path.endsWith('.js')).text)
    await browser.evaluate(`new Promise((resolve,reject)=>{let n=0;const check=()=>document.querySelector('#live-thinking button')?resolve():n++<200?setTimeout(check,10):reject(Error('Native fixture did not mount'));check()})`)
    await settle(browser)
    return browser
  } catch (error) { browser.close(); throw error }
}
async function enable(browser, enabled = true) {
  await browser.evaluate(enabled ? `document.documentElement.setAttribute('data-codex-chat-look','true')` : `document.documentElement.removeAttribute('data-codex-chat-look')`)
  await settle(browser)
}
async function click(browser, selector) {
  const point = await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
  await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
  await settle(browser)
}
async function key(browser, key, code, windowsVirtualKeyCode, text) {
  await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...(text ? { text } : {}) })
  await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
  await settle(browser)
}

for (const theme of ['dark', 'light', 'colored']) {
  test(`T3 native rows: geometry, native status colors, narrow pane and disable (${theme})`, async () => {
    const browser = await fixture(theme)
    try {
      const before = await browser.evaluate(`(()=>{const s=e=>getComputedStyle(e),el=document.querySelector('#long'),glyph=el.querySelector('button .grid');return{size:s(el.querySelector('button .block')).fontSize,opacity:s(el).opacity,glyph:glyph.getBoundingClientRect().width,error:s(document.querySelector('#failed .text-destructive')).color,warning:s(document.querySelector('#warning .text-amber-700')).color}})()`)
      await enable(browser)
      const geometry = await browser.evaluate(`(() => {const row=document.querySelector('#long'), button=row.querySelector('button'), label=row.querySelector('button .block'), glyph=button.querySelector('.grid'), caret=button.lastElementChild;const s=e=>getComputedStyle(e),r=e=>e.getBoundingClientRect();return {size:s(label).fontSize,opacity:s(row).opacity,height:r(button).height,glyph:r(glyph).width,icon:r(glyph.firstElementChild).width,caret:s(caret).opacity,caretX:r(caret).x,buttonRight:r(button).right,buttonWidth:r(button).width,rowWidth:r(row).width,meta:s(row.querySelector('.tabular-nums')).fontSize,error:s(document.querySelector('#failed .text-destructive')).color,warning:s(document.querySelector('#warning .text-amber-700')).color,summaryIcon:getComputedStyle(document.querySelector('[data-tool-summary] button'),'::before').content,approval:!!document.getElementById('approval').offsetHeight,thinking:document.querySelectorAll('[data-slot="aui_thinking-disclosure"]').length}})()`)
      assert.equal(geometry.size, '14px')
      assert.equal(geometry.opacity, '1')
      assert.ok(geometry.height >= 24 && geometry.height <= 30, JSON.stringify(geometry))
      assert.equal(geometry.glyph, 24)
      assert.equal(geometry.icon, 16)
      assert.ok(Number(geometry.caret) >= .6, 'per-call disclosure is visible at rest')
      assert.ok(geometry.caretX > geometry.buttonRight - 24, 'caret stays at far end of hit area')
      assert.ok(geometry.buttonWidth > geometry.rowWidth * .85, 'native toggle fills available row')
      assert.equal(geometry.meta, '12px')
      assert.equal(geometry.error, before.error, 'do not force destructive colors in the fixture')
      assert.equal(geometry.warning, before.warning)
      assert.notEqual(geometry.error, geometry.warning, 'native status colors are distinct')
      assert.notEqual(geometry.summaryIcon, 'none')
      assert.equal(geometry.approval, true)
      assert.equal(geometry.thinking, 2, 'thinking slots are present, without duplicate data-slot attributes')
      await browser.evaluate(`document.getElementById('pane').style.width='280px'`)
      assert.equal(await browser.evaluate(`document.getElementById('pane').scrollWidth <= 281`), true, 'long paths fit a narrow pane')
      await enable(browser, false)
      const restored = await browser.evaluate(`(()=>{const row=document.querySelector('#long');return {size:getComputedStyle(row.querySelector('button .block')).fontSize,opacity:getComputedStyle(row).opacity,glyph:row.querySelector('button .grid').getBoundingClientRect().width,icon:getComputedStyle(document.querySelector('[data-tool-summary] button'),'::before').content}})()`)
      assert.equal(restored.size, before.size)
      assert.equal(restored.opacity, before.opacity)
      assert.equal(restored.glyph, before.glyph)
      assert.equal(restored.icon, 'none')
    } finally { browser.close() }
  })
}

test('T3 activity typography follows the native chat text scale at 175%', async () => {
  const browser = await fixture('dark', 1.75)
  try {
    await enable(browser)
    const sizes = await browser.evaluate(`['#long button .block','#background-tool button .block','[data-tool-summary] button [class*="conversation-tool-font-size"]','#live-thinking button [class*="conversation-tool-font-size"]','#settled-thinking button [class*="conversation-tool-font-size"]'].map(selector=>{const s=getComputedStyle(document.querySelector(selector));return{selector,size:parseFloat(s.fontSize),line:parseFloat(s.lineHeight)}})`)
    for (const item of sizes) {
      assert.equal(item.size, 24.5, JSON.stringify(item))
      assert.ok(Math.abs(item.line - 39.8125) < .05, JSON.stringify(item))
    }
    assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('#long .tabular-nums')).fontSize`), '21px')
    await browser.evaluate(`document.getElementById('pane').style.width='280px'`)
    assert.equal(await browser.evaluate(`pane.scrollWidth<=281`), true, 'scaled labels still fit narrow panes')
  } finally { browser.close() }
})

test('T3 live thinking header is readable while reasoning stays compact', async () => {
  const browser = await fixture()
  try {
    await enable(browser)
    const sizes = await browser.evaluate(`({live:getComputedStyle(document.querySelector('#live-thinking button [class*="conversation-tool-font-size"]')).fontSize,settled:getComputedStyle(document.querySelector('#settled-thinking button [class*="conversation-tool-font-size"]')).fontSize,reasoning:getComputedStyle(document.querySelector('#live-thinking [data-slot="aui_reasoning-text"] p')).fontSize,body:document.querySelector('#live-thinking [data-slot="aui_thinking-body"]').offsetHeight})`)
    assert.equal(sizes.live, '14px')
    assert.equal(sizes.settled, '14px')
    assert.equal(sizes.reasoning, '12px')
    assert.ok(sizes.body > 0)
  } finally { browser.close() }
})

test('T3 span-based native GlyphSpinner uses the 24px column without timestamp shrinkage', async () => {
  const browser = await fixture()
  try {
    await enable(browser)
    const geometry = await browser.evaluate(`(()=>{const status=document.querySelector('#running [role="status"]'),glyph=status.parentElement,s=getComputedStyle(status);return{tag:status.tagName,column:glyph.getBoundingClientRect().width,height:glyph.getBoundingClientRect().height,width:status.getBoundingClientRect().width,font:s.fontSize,frames:status.querySelectorAll('.glyph-spinner__frame').length,meta:getComputedStyle(document.querySelector('#running [class~="group/disclosure-row"] > span .tabular-nums')).fontSize,labelX:document.querySelector('#running button .block').getBoundingClientRect().x,otherLabelX:document.querySelector('#long button .block').getBoundingClientRect().x}})()`)
    assert.equal(geometry.tag, 'SPAN')
    assert.ok(geometry.frames > 1, 'use the native nested-span spinner, not an SVG stand-in')
    assert.equal(geometry.column, 24)
    assert.equal(geometry.height, 24)
    assert.equal(geometry.width, 16)
    assert.equal(geometry.font, '16px')
    assert.equal(geometry.meta, '12px')
    assert.equal(geometry.labelX, geometry.otherLabelX)
  } finally { browser.close() }
})

test('T3 keyboard focus stays inside overflow-hidden and native Space/Enter handlers reveal real details', async () => {
  const browser = await fixture()
  try {
    await enable(browser)
    await browser.evaluate(`document.activeElement.blur();window.originalButton=document.querySelector('#long button');void 0`)
    await key(browser, 'Tab', 'Tab', 9)
    assert.equal(await browser.evaluate(`document.activeElement===document.querySelector('[data-tool-summary] button')`), true)
    await key(browser, 'Tab', 'Tab', 9)
    const focus = await browser.evaluate(`(()=>{const b=document.activeElement,s=getComputedStyle(b),r=b.getBoundingClientRect(),row=document.querySelector('#long'),c=row.getBoundingClientRect();return{native:b===originalButton,visible:b.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth),offset:parseFloat(s.outlineOffset),color:s.outlineColor,accent:getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim(),clipping:getComputedStyle(row).overflowY,inside:r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom}})()`)
    assert.equal(focus.native, true)
    assert.equal(focus.visible, true, 'real Tab navigation, not forced :focus-visible')
    assert.equal(focus.clipping, 'hidden', 'preserve the native clipping boundary')
    assert.equal(focus.inside, true)
    assert.equal(focus.style, 'solid')
    assert.equal(focus.width, 2)
    assert.ok(focus.offset <= -focus.width, JSON.stringify(focus))
    await key(browser, ' ', 'Space', 32, ' ')
    assert.equal(await browser.evaluate(`document.querySelector('#long button')===originalButton&&originalButton.getAttribute('aria-expanded')==='true'&&!!document.querySelector('#long [data-native-detail] pre').offsetHeight&&nativeToggles===1`), true)
    await key(browser, 'Enter', 'Enter', 13, '\r')
    assert.equal(await browser.evaluate(`originalButton.getAttribute('aria-expanded')==='false'&&!document.querySelector('#long [data-native-detail]')&&nativeToggles===2`), true)
    await click(browser, '#long button')
    await click(browser, '#long [data-native-detail] button')
    assert.equal(await browser.evaluate(`detailClicks===1&&nativeToggles===3&&document.querySelector('#long button')===originalButton`), true, 'nested native detail action does not toggle the disclosure')
  } finally { browser.close() }
})

test('T3 variables and scaffold opacity do not leak into clarify or connector controls', async () => {
  const browser = await fixture('colored', 1.75)
  try {
    const probe = `(()=>[...document.querySelectorAll('[data-slot="tool-clarify"],[data-slot="connector-card"]')].map(e=>{const label=e.querySelector('[class*="conversation-tool-font-size"]'),s=getComputedStyle(e),l=getComputedStyle(label);return{slot:e.dataset.slot,size:l.fontSize,line:e.dataset.slot==='tool-clarify'?l.lineHeight:null,color:l.color,opacity:s.opacity,tool:s.getPropertyValue('--conversation-tool-font-size'),height:s.getPropertyValue('--conversation-line-height'),text:s.getPropertyValue('--conversation-scaffold-text'),meta:s.getPropertyValue('--conversation-scaffold-meta'),gap:s.getPropertyValue('--tool-row-gap')}}))()`
    const before = await browser.evaluate(probe)
    assert.equal(before.length, 4)
    await enable(browser)
    assert.deepEqual(await browser.evaluate(probe), before)
    await enable(browser, false)
    assert.deepEqual(await browser.evaluate(probe), before)
  } finally { browser.close() }
})

const textGeometry = `(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,width:r.width}},style=e=>{const s=getComputedStyle(e);return{classes:e.className,slot:e.dataset.slot||null,overflow:s.overflowY,display:s.display,size:s.fontSize,line:s.lineHeight,family:s.fontFamily,...rect(e)}};
  const rows=[...document.querySelectorAll('[data-tool-row],[data-tool-summary],[data-slot="aui_thinking-disclosure"]')];
  return rows.map(row=>({id:row.id||'summary',row:style(row),texts:[...row.querySelectorAll('button [class*="conversation-tool-font-size"],[data-duration],time')].map(label=>{
    const range=document.createRange();range.selectNodeContents(label);const r=range.getBoundingClientRect(),ancestors=[];
    for(let e=label;e;e=e.parentElement){ancestors.push(style(e));if(e===row)break}
    return{label:style(label),range:{top:r.top,bottom:r.bottom,height:r.height},ancestors};
  })}));
})()`
function assertUnclipped(rows) {
  assert.ok(rows.length>=3)
  for(const row of rows) {
    assert.ok(row.texts.length>=3, 'check actual label, timestamp and duration')
    for(const text of row.texts) for(const ancestor of text.ancestors) if(['hidden','clip','auto','scroll'].includes(ancestor.overflow)) {
      assert.ok(text.range.top>=ancestor.top-.1&&text.range.bottom<=ancestor.bottom+.1,JSON.stringify({row:row.id,text,ancestor}))
    }
  }
}

test('T3 expanded activity text fits every row-local vertical clipping ancestor', async () => {
  const browser = await fixture()
  try {
    await enable(browser)
    const geometry = await browser.evaluate(textGeometry)
    console.log('ACTIVITY_CLIP_GEOMETRY '+JSON.stringify(geometry.slice(0,5).map(row=>({id:row.id,row:row.row,texts:row.texts.map(text=>({range:text.range,size:text.label.size,line:text.label.line,clipping:text.ancestors.filter(a=>['hidden','clip','auto','scroll'].includes(a.overflow))}))}))))
    if(process.env.ACTIVITY_GEOMETRY_OUTPUT) await writeFile(process.env.ACTIVITY_GEOMETRY_OUTPUT, JSON.stringify(geometry,null,2))
    if(process.env.ACTIVITY_SCREENSHOT_OUTPUT) await writeFile(process.env.ACTIVITY_SCREENSHOT_OUTPUT, Buffer.from((await browser.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
    assertUnclipped(geometry)
  } finally { browser.close() }
})

for(const scale of [.75,1,1.75,2.5]) for(const font of ['system','serif','tall-metrics']) {
  test(`T3 activity range containment across native disclosure states (${scale}x, ${font})`,async()=>{
    const browser=await fixture(scale===1?'light':'colored',scale)
    try {
      await enable(browser)
      await browser.evaluate(`pane.style.width='360px'`)
      if(font!=='system') {
        if(font==='tall-metrics') {
          // A real font file with deliberately wider/taller font metrics. This
          // probes layout resilience without claiming OpenDyslexic is installed.
          const bytes=await readFile(process.env.ACTIVITY_TEST_FONT||'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
          await browser.evaluate(`(async()=>{const font=new FontFace('ActivityMetrics','url(data:font/ttf;base64,${bytes.toString('base64')})',${process.env.ACTIVITY_TEST_FONT?'{}':"{ascentOverride:'105%',descentOverride:'35%',lineGapOverride:'0%'}"});await font.load();document.fonts.add(font)})()`)
        }
        const family=font==='serif'?'serif':'ActivityMetrics'
        await browser.evaluate(`(()=>{const style=document.createElement('style');style.textContent='html[data-codex-chat-look="true"] :is([data-tool-row],[data-tool-summary],[data-slot="aui_thinking-disclosure"]),html[data-codex-chat-look="true"] :is([data-tool-row],[data-tool-summary],[data-slot="aui_thinking-disclosure"]) * {font-family:${family} !important}';document.head.append(style)})()`)
        await settle(browser)
        assert.ok((await browser.evaluate(textGeometry))[0].texts[0].label.family.includes(family))
      }
      const check=async phase=>{
        const rows=await browser.evaluate(textGeometry);assertUnclipped(rows)
        const label=rows.find(r=>r.id==='long')?.texts[0].label||rows[0].texts[0].label
        assert.equal(parseFloat(label.size),14*scale,phase)
        assert.ok(Math.abs(parseFloat(label.line)-22.75*scale)<.05,phase)
        for(const row of rows) for(const text of row.texts.slice(1)) assert.equal(parseFloat(text.label.size),12*scale,phase)
      }
      await check('expanded capped group')
      const cap=await browser.evaluate(`({height:calls.clientHeight,scroll:calls.scrollHeight,max:getComputedStyle(calls).maxHeight})`)
      assert.equal(cap.height,288);assert.ok(cap.scroll>cap.height)
      // Scroll each end into view: the viewport may clip offscreen rows, but
      // must not shave any visible text at either reachable list boundary.
      for(const edge of ['firstElementChild','lastElementChild']) {
        await browser.evaluate(`calls.${edge}.scrollIntoView({block:'center'})`);await settle(browser)
        assert.equal(await browser.evaluate(`(()=>{const row=calls.${edge},a=row.querySelector('button .block'),range=document.createRange();range.selectNodeContents(a);const t=range.getBoundingClientRect(),v=calls.getBoundingClientRect();return t.top>=v.top-.1&&t.bottom<=v.bottom+.1})()`),true)
      }
      await click(browser,'#long button');await check('individual call open')
      assert.equal(await browser.evaluate(`getComputedStyle(calls).maxHeight`),'none')
      await click(browser,'#long button');await check('individual call reclosed')
      // The native wrapper variant containing one inner list also remains safe.
      await browser.evaluate(`calls.classList.add('tool-group-scroll');const inner=document.createElement('div');calls.append(inner);[...calls.querySelectorAll(':scope > [data-tool-row]')].forEach(e=>inner.append(e))`)
      await check('legacy inner list')
      await click(browser,'[data-tool-summary] button');assert.equal(await browser.evaluate(`!!document.getElementById('calls')`),false)
      await check('collapsed group summary')
      await click(browser,'[data-tool-summary] button');await check('group reopened')
      for(const id of ['live-thinking','settled-thinking']){await click(browser,'#'+id+' button');await check(id+' toggled')}
      // Uncapped short groups retain natural row height, not stretched tracks.
      await browser.evaluate(`[...calls.children].slice(2).forEach(e=>e.remove())`);await check('short group')
      assert.ok(await browser.evaluate(`calls.clientHeight<calls.getBoundingClientRect().height+1&&calls.clientHeight<288`))
    }finally{browser.close()}
  })
}

test('T3 compact list caps at rest and becomes unlimited only while a native call is expanded', async () => {
  const browser = await fixture()
  try {
    await enable(browser)
    const probe = `(()=>{const e=document.getElementById('calls'),s=getComputedStyle(e);return{max:s.maxHeight,height:e.clientHeight,scroll:e.scrollHeight,overflow:s.overflowY,open:e.querySelectorAll('[data-tool-open]').length,detail:!!e.querySelector('[data-native-detail]')}})()`
    const capped = await browser.evaluate(probe)
    assert.equal(capped.max, '288px')
    assert.equal(capped.height, 288)
    assert.ok(capped.scroll > capped.height)
    assert.equal(capped.overflow, 'auto')
    assert.equal(capped.open, 0)
    await click(browser, '#long button')
    const expanded = await browser.evaluate(probe)
    assert.equal(expanded.max, 'none')
    assert.ok(expanded.height > capped.height)
    assert.equal(expanded.open, 1)
    assert.equal(expanded.detail, true)
    assert.equal(await browser.evaluate(`(()=>{const pre=document.querySelector('#long [data-native-detail] pre');return pre.scrollHeight>pre.clientHeight&&getComputedStyle(pre).overflowY==='auto'})()`), true, 'expanded output keeps its native inner scroller')
    await click(browser, '#long button')
    assert.deepEqual(await browser.evaluate(probe), capped)
    // Check the other supported native scroll-wrapper shape too.
    await browser.evaluate(`calls.classList.add('tool-group-scroll');const wrapper=document.createElement('div');wrapper.id='inner';calls.append(wrapper);[...calls.querySelectorAll(':scope > [data-tool-row]')].forEach(e=>wrapper.append(e))`)
    assert.equal((await browser.evaluate(probe)).max, '288px')
    await click(browser, '#long button')
    assert.equal((await browser.evaluate(probe)).max, 'none')
    await click(browser, '#long button')
    assert.equal((await browser.evaluate(probe)).max, '288px')
    await enable(browser, false)
    assert.equal(await browser.evaluate(`getComputedStyle(calls).maxHeight`), 'none', 'disable restores native uncapped geometry')
  } finally { browser.close() }
})
