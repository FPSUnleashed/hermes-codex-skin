import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {pathToFileURL,fileURLToPath} from 'node:url'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {measureHistoricalWidth} from './helpers/width-history.mjs'

const core=referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require=createRequire(`${core}/package.json`), ts=require('typescript')
const preRepairRoot=referenceRoot('CODEX_WIDTH_PRE_REPAIR_ROOT')
const candidate=process.env.CODEX_WIDTH_BASELINE||fileURLToPath(new URL('../',import.meta.url))
const {loadPluginInternals}=await import(pathToFileURL(`${candidate}/test/helpers/load-plugin.mjs`))
const {CSS,BROWSER_PALETTE_CSS,UPDATE_CSS,T3_SUBAGENT_CSS}=await loadPluginInternals(['CSS','BROWSER_PALETTE_CSS','UPDATE_CSS','T3_SUBAGENT_CSS'])
const source=(await readFile(`${candidate}/codex-chat-look/plugin.js`,'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.__widthPlugin = {')
const nativeCSS=await readFile(process.env.HERMES_INSTALLED_ROW_CSS||new URL('./fixtures/native-font-contract.css',import.meta.url),'utf8')
const referenceHTML=await readFile(new URL('./fixtures/t3-width/reference.html',import.meta.url),'utf8')
const installed=await readFile(referenceFile('HERMES_INSTALLED_RENDERER_JS'),'utf8')
// Read geometry-owning wrappers from native source, then confirm the retained
// installed renderer has the same literal classes. Native state hooks are out
// of scope; their rendered normal-thread branch is retained, not reimplemented.
async function nativeClass(relative,slot){
 const text=await readFile(`${core}/${relative}`,'utf8'), file=ts.createSourceFile(relative,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 const found=[]
 function walk(n){
  if(ts.isJsxOpeningElement(n)&&n.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.getText(file)==='data-slot'&&a.initializer?.text===slot)){
   const attr=n.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(file)==='className')
   if(attr){const strings=[];function scan(x){if(ts.isStringLiteral(x))strings.push(x.text);else ts.forEachChild(x,scan)}scan(attr.initializer);found.push(strings)}
  }
  ts.forEachChild(n,walk)
 }
 walk(file);assert.ok(found.length,`native ${slot} exists`)
 const classes=found[0][0];assert.ok(installed.includes(classes),`installed ${slot} classes match source`)
 return classes
}
const list='apps/desktop/src/components/assistant-ui/thread/list.tsx', composer='apps/desktop/src/app/chat/composer/index.tsx', assistant='apps/desktop/src/components/assistant-ui/thread/assistant-message.tsx'
const cls={lane:await nativeClass(list,'aui_thread-content'),viewport:await nativeClass(list,'aui_thread-viewport'),content:await nativeClass(assistant,'aui_assistant-message-content'),root:await nativeClass(assistant,'aui_assistant-message-root'),surface:await nativeClass(composer,'composer-surface'),fade:await nativeClass(composer,'composer-fade')}
const probe='<span data-width-probe style="display:inline-block;width:100%;height:1px">x</span>'
const editor=`<div class="min-w-0 [grid-area:input]"><div data-slot="composer-rich-input" contenteditable="true"><p>${probe}</p></div></div>`
const surface=`<div class="relative w-full rounded-[inherit]"><div data-slot="composer-surface" class="${cls.surface}"><div data-slot="composer-fade" class="${cls.fade}"><div class="grid w-full"><div style="grid-area:menu"><button>+</button></div>${editor}<div style="grid-area:controls"><button style="width:20px;height:20px;padding:0;font-size:12px">↑</button></div></div></div></div></div>`
const dock=`<div data-slot="composer-dock" class="absolute bottom-0 left-1/2 max-w-full -translate-x-1/2"><div data-slot="composer-root">${surface}</div></div>`
const pane=`<section class="native-pane"><div data-slot="aui_thread-viewport" class="${cls.viewport}" style="height:180px;overflow-y:scroll"><div data-slot="aui_thread-content" class="${cls.lane}"><div data-codex-activity-phase="settled" data-slot="aui_turn-pair"><div data-slot="aui_user-message-root" class="sticky top-0"><div data-slot="aui_user-message-content">x</div></div><div data-role="assistant" data-slot="aui_assistant-message-root" class="${cls.root}"><div data-slot="aui_assistant-message-content" class="${cls.content}"><div class="aui-md"><p>${probe}</p></div></div></div><div data-slot="aui_edit-composer-root"><div data-slot="composer-surface"><div data-slot="composer-rich-input" contenteditable>Sent edit</div></div></div></div><div style="height:500px"></div></div></div>${dock}<div data-slot="composer-dock" data-popped-out style="position:absolute;top:300px;left:0;--composer-popout-width:12rem"><div data-slot="composer-root" data-popped-out>${surface}</div></div></section>`
const metrics=`(()=>{
 const rect=(e,p)=>{const r=e.getBoundingClientRect(),b=p.getBoundingClientRect();return{left:r.left-b.left,right:r.right-b.left,width:r.width}}
 const range=(e,p)=>{const r=document.createRange();r.selectNode(e.querySelector('[data-width-probe]'));const b=p.getBoundingClientRect(),x=r.getBoundingClientRect();return{left:x.left-b.left,right:x.right-b.left,width:x.width}}
 const natives=[...document.querySelectorAll('.native-pane')].map(p=>({
 lane:rect(p.querySelector('[data-slot="aui_thread-content"]'),p),prose:range(p.querySelector('.aui-md'),p),surface:rect(p.querySelector('[data-slot="composer-dock"]:not([data-popped-out]) [data-slot="composer-surface"]'),p),editor:range(p.querySelector('[data-slot="composer-dock"]:not([data-popped-out]) [data-slot="composer-rich-input"]'),p),popout:rect(p.querySelector('[data-slot="composer-dock"][data-popped-out]'),p),popoutEditor:range(p.querySelector('[data-slot="composer-dock"][data-popped-out] [data-slot="composer-rich-input"]'),p),sticky:getComputedStyle(p.querySelector('[data-slot="aui_user-message-root"]')).position,family:getComputedStyle(p.querySelector('.aui-md')).fontFamily,overflow:p.querySelector('[data-slot="aui_thread-viewport"]').scrollWidth>p.querySelector('[data-slot="aui_thread-viewport"]').clientWidth,viewportGutter:p.querySelector('[data-slot="aui_thread-viewport"]').offsetWidth-p.querySelector('[data-slot="aui_thread-viewport"]').clientWidth
 }))
 const d=document.querySelector('iframe').contentDocument
 const refs=[...d.querySelectorAll('.reference-pane')].map(p=>({lane:rect(p.querySelector('[data-reference-lane]'),p),prose:range(p.querySelector('[data-reference-prose]'),p),surface:rect(p.querySelector('[data-reference-surface]'),p),editor:range(p.querySelector('[data-reference-editor]'),p)}))
 return{natives,refs,mode:document.documentElement.dataset.codexComposerWidth,writes:window.writes}
})()`
function same(a,b,label){for(const k of ['left','right','width'])assert.ok(Math.abs(a[k]-b[k])<=1/32,`${label}.${k}: actual ${a[k]}, T3 ${b[k]}`)}
const receipts=[]

test('source-built T3 comfortable actual transcript/prose/composer lanes match across viewport, scale, split panes and lifecycle', {timeout:120000},async t=>{
 const browser=await chromium()
 try{
  const html=`<!doctype html><html><head><style>${nativeCSS}</style><style id="width-plugin-css">${CSS}</style><style>${BROWSER_PALETTE_CSS+UPDATE_CSS+T3_SUBAGENT_CSS}</style><style>body{margin:0}.native-panes{display:grid;grid-template-columns:repeat(var(--pane-count,1),minmax(0,1fr))}.native-pane{position:relative;height:250px;min-width:0}iframe{position:absolute;top:700px;left:0;width:100%;height:650px;border:0}</style></head><body><main class="native-panes">${pane}${pane}</main><iframe></iframe></body></html>`
  await browser.call('Emulation.setDeviceMetricsOverride',{width:1200,height:700,deviceScaleFactor:2,mobile:false})
  await browser.call('Page.setDocumentContent',{frameId:(await browser.call('Page.getFrameTree')).frameTree.frame.id,html})
  await browser.evaluate(`document.querySelector('iframe').srcdoc=${JSON.stringify(referenceHTML)};new Promise(r=>document.querySelector('iframe').onload=r)`)
  await browser.evaluate(`(()=>{const host={state:{activeSessionId:{get:()=>null},profile:{get:()=> 'default'}}},PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},useEffect=()=>{},jsx=()=>null;${source};window.writes=[];window.saved=new Map();pluginStorage={get:(k,f)=>saved.has(k)?saved.get(k):f,set:(k,v)=>{saved.set(k,v);writes.push([k,v])}};window.startWidth=()=>installBehaviorRuntime();window.syncWidth=syncComposerWidthRoot;window.setWidth=setComposerWidthMode;window.enable=()=>{document.documentElement.dataset.codexChatLook='true';syncWidth();window.stopWidth=startWidth()};window.disable=()=>{stopWidth();delete document.documentElement.dataset.codexChatLook;delete document.documentElement.dataset.codexComposerWidth};window.setLayout=(scale,count,family)=>{const d=document.querySelector('iframe').contentDocument;for(const doc of [document,d]){doc.documentElement.style.fontSize=scale+'px';doc.documentElement.style.setProperty('--pane-count',count);doc.querySelectorAll('section').forEach((p,i)=>p.style.display=i<count?'':'none')}document.documentElement.style.setProperty('--dt-font-sans',family);document.documentElement.style.setProperty('--chat-text-scale',scale/16);document.querySelector('iframe').contentWindow.measureGutters()};window.settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));enable()})()`)
  const failures=[]
  for(const width of [320,600,639,640,900,1200,1400])for(const scale of [12,16,20,24,28,32])for(const count of [1,2]){
   await browser.call('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:2,mobile:false})
   await browser.evaluate(`setLayout(${scale},${count},${JSON.stringify(count===1?'"Native Reading", serif':'"User Changed", sans-serif')});settle()`)
   const state=await browser.evaluate(metrics)
   receipts.push({width,scale,count,...state})
   for(let i=0;i<count;i++)for(const key of ['lane','prose','surface','editor']){
    try{same(state.natives[i][key],state.refs[i][key],`${width}px root${scale} panes${count} pane${i} ${key}`)}catch(e){failures.push(e.message)}
   }
   for(const n of state.natives.slice(0,count)){assert.equal(n.overflow,false,'narrow panes must not overflow');assert.equal(n.sticky,'sticky');assert.match(n.family,count===1?/Native Reading/:/User Changed/)}
  }
  t.diagnostic(JSON.stringify({example:receipts.find(r=>r.width===1200&&r.scale===16&&r.count===1),comparisons:receipts.reduce((n,r)=>n+r.count*4,0)}))
  assert.deepEqual(failures,[])
  assert.deepEqual(await browser.evaluate('writes'),[],'default must not be persisted')
  // The full shipping mutation/resize runtime must discover a late replacement,
  // not merely a test calling the width helper directly.
  await browser.evaluate(`setLayout(16,2,'serif');window.removedViewport=document.querySelectorAll('[data-slot="aui_thread-viewport"]')[1];window.replacementViewport=removedViewport.cloneNode(true);replacementViewport.style.removeProperty('--codex-chat-scrollbar-inset');removedViewport.replaceWith(replacementViewport);replacementViewport.querySelector('[data-slot="aui_thread-content"]').dataset.threadType='onboarding';settle()`)
  assert.notEqual(await browser.evaluate(`replacementViewport.style.getPropertyValue('--codex-chat-scrollbar-inset')`),'','late viewport is measured by the real runtime')
  assert.equal(await browser.evaluate(`removedViewport.style.getPropertyValue('--codex-chat-scrollbar-inset')`),'','detached viewport is cleaned')
  const remounted=await browser.evaluate(metrics)
  for(let i=0;i<2;i++)for(const key of ['lane','prose','surface','editor'])same(remounted.natives[i][key],remounted.refs[i][key],`remount/onboarding ${key}`)
  await browser.call('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:2,mobile:false})
  await browser.evaluate(`setLayout(12,1,'serif');settle()`)
  const idle=await browser.evaluate(metrics)
  await browser.evaluate(`(()=>{const v=document.querySelector('[data-slot="aui_thread-viewport"]');v.scrollTop=20;v.dispatchEvent(new Event('scroll'));return settle()})()`)
  const scrolling=await browser.evaluate(metrics)
  for(const key of ['lane','prose','surface','editor'])same(scrolling.natives[0][key],idle.natives[0][key],`scrolling keeps ${key}`)
  await browser.call('Emulation.setDeviceMetricsOverride',{width:1400,height:700,deviceScaleFactor:2,mobile:false})
  for(const textScale of [.75,1,1.25,1.5,1.75,2]){
   await browser.evaluate(`setLayout(16,1,'serif');document.documentElement.style.setProperty('--chat-text-scale',${JSON.stringify(String(textScale))});settle()`)
   const scaled=await browser.evaluate(metrics)
   for(const key of ['lane','prose','surface','editor'])same(scaled.natives[0][key],scaled.refs[0][key],`native chat scale ${textScale} ${key}`)
  }
  // Every explicit optional mode must retain the shipping implementation's
  // pre-repair dimensions, including its native Hermes restoration semantics.
  const baseline=await import(pathToFileURL(`${preRepairRoot}/test/helpers/load-plugin.mjs`))
  const old=await baseline.loadPluginInternals(['CSS'])
  let shippingPopout
  for(const mode of ['codex-wide','codex-wider','hermes']){
   await browser.evaluate(`saved.set('composer-width',${JSON.stringify(mode)});syncWidth();setLayout(16,2,'serif');settle()`)
   const before=await browser.evaluate(metrics)
   const previous=await measureHistoricalWidth(browser,old.CSS,metrics)
   shippingPopout=previous.natives[0].popoutEditor
   assert.deepEqual(before.natives,previous.natives,`${mode} preserves optional geometry`)
  }
  for(const saved of [undefined,'codex','codex-wide','codex-wider','hermes']){
   await browser.evaluate(`${saved===undefined?"window.saved.delete('composer-width')":`window.saved.set('composer-width',${JSON.stringify(saved)})`};disable();setLayout(16,1,'serif');settle()`)
   const disabled=await browser.evaluate(metrics)
   await browser.evaluate('enable();settle()')
   const enabled=await browser.evaluate(metrics)
   assert.equal(enabled.mode,saved||'codex')
   for(let i=0;i<1;i++){
    same(enabled.natives[i].popout,disabled.natives[i].popout,'floating dock remains native')
    same(enabled.natives[i].popoutEditor,shippingPopout,'floating editor retains shipping skin geometry')
   }
   await browser.evaluate('disable();settle()')
   assert.deepEqual((await browser.evaluate(metrics)).natives,disabled.natives,'disable restores native geometry')
  }
  assert.deepEqual(await browser.evaluate('writes'),[],'loading explicit preferences must not migrate them')
 }finally{browser.close();if(process.env.CODEX_WIDTH_RECEIPT)await writeFile(process.env.CODEX_WIDTH_RECEIPT,JSON.stringify({pluginSHA256:createHash('sha256').update(await readFile(`${candidate}/codex-chat-look/plugin.js`)).digest('hex'),nativeCSSSHA256:createHash('sha256').update(nativeCSS).digest('hex'),receipts},null,2)+'\n')}
})
