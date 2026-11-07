import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'

const nativeRoot = referenceRoot('COMPLETE_MESSAGES_NATIVE_ROOT')
const require = createRequire(nativeRoot + '/package.json')
const pluginPath = process.env.COMPLETE_MESSAGES_BUNDLE || fileURLToPath(new URL('../codex-chat-look/plugin.js', import.meta.url))
const nativeCSS = await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'),'utf8')
const nativeCore = referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const nativeRequire = createRequire(nativeCore + '/package.json')
const ts = nativeRequire('typescript')
const runtimeFile = await readFile(nativeCore + '/apps/desktop/src/lib/chat-runtime.ts','utf8')
const runtimeAST = ts.createSourceFile('chat-runtime.ts',runtimeFile,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
// Execute these complete, unedited native functions, without loading unrelated
// composer/attachment stores. All cases below take their assistant branch.
const runtimeFunctions = ['messageCreatedAt','toRuntimeMessage'].map(name=>{
  const node=runtimeAST.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)
  assert.ok(node,'Native runtime function missing: '+name)
  return node.getText(runtimeAST)
}).join('\n')
const nativeConverter = ts.transpileModule(runtimeFunctions,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const sdk = `
import {QueryClient} from '@tanstack/query-core';
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
const atom=value=>({get:()=>value,subscribe:()=>()=>{}});
export const host={state:{connectionId:atom('local'),profile:atom('default'),gateway:atom('open'),focusedSessionOwner:atom(null),focusedStoredSessionId:atom(null),focusedSessionId:atom(null),activeSessionId:atom(null),busyBySession:atom({})},onEvent:()=>()=>{},notify:n=>window.notifications.push(n)};
export const PALETTE_AREA='palette',THEMES_AREA='themes';
export const useQuery=()=>({}),useValue=a=>a?.get?.(),profileColor=()=>null,profileColorSoft=()=>null;
`
// Import the unmodified shipped ESM module. Only the supported host SDK boundary
// is replaced; React and the host-pinned native text primitive execute for real.
const {outputFiles} = await require('esbuild').build({
  stdin:{resolveDir:nativeRoot,contents:`
import React from 'react';import{createRoot}from'react-dom/client';
import{TextMessagePartProvider}from'@assistant-ui/react';
import{StreamdownTextPrimitive}from'@assistant-ui/react-streamdown';
${nativeConverter}
import plugin from ${JSON.stringify(pluginPath)};
window.notifications=[];window.errors=[];window.nativeCalls=[];
addEventListener('error',e=>errors.push(String(e.error)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.saved=new Map();window.failSave=false;window.failRead=false;window.failReadback=false;
window.storage={get(k,f){if(k==='show-complete-messages'&&(failRead||failReadback&&window.didWrite))throw Error('read unavailable');return saved.has(k)?saved.get(k):f},set(k,v){window.didWrite=true;if(!failSave)saved.set(k,v)}};
window.activate=()=>{window.contributions=[];window.disposals=[];plugin.register({storage,register:e=>contributions.push(e),onDispose:fn=>disposals.push(fn)})};
window.deactivate=()=>{for(const fn of disposals.splice(0).reverse())fn()};
window.command=()=>contributions.find(c=>c.id==='toggle-complete-messages');
window.toggle=()=>command().data.run();
const h=React.createElement;const roots=new Map();window.converted={};
window.part=(id,text,running,extra={})=>{let el=document.getElementById(id);if(!el){el=document.createElement('div');el.id=id;el.dataset.slot='aui_assistant-message-content';document.getElementById('pane-a').append(el)}let root=roots.get(id);if(!root){root=createRoot(el);roots.set(id,root)}const message=toRuntimeMessage({id,role:'assistant',parts:[{type:'text',text}],pending:running,...extra});window.converted[id]=message;root.render(h(TextMessagePartProvider,{text,isRunning:message.status.type==='running'},h(StreamdownTextPrimitive,{containerClassName:'aui-md',mode:'streaming'})))};
window.flush=async()=>{await new Promise(r=>setTimeout(r,30));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
window.probe=id=>{const el=document.getElementById(id).querySelector('.aui-md');return{status:el.dataset.status,display:getComputedStyle(el).display,text:el.textContent,visible:el.getBoundingClientRect().height>0}};
window.part('previous','Previous final reply with **markdown** and [link](#native-link)',false);
window.part('live','First streamed token',true);
window.part('other','Other pane final',false);
`},bundle:true,format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'host-boundary',setup(build){build.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:'sdk',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:sdk,resolveDir:nativeRoot}));
    build.onResolve({filter:/^@tanstack\/query-core$/},()=>({path:fileURLToPath(new URL('../node_modules/@tanstack/query-core/build/modern/index.js',import.meta.url))}));
    build.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:require.resolve(args.path)}));
  }}]
})
async function fixture(run, {saved,readFailure=false}={}){
  const b=await chromium()
  try{
    await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html class="dark" data-hermes-mode="dark"><head><style>${nativeCSS}</style><style>:root{--dt-font-sans:Georgia;--font-sans:var(--dt-font-sans);--ui-chat-surface-background:#202020;--ui-text-primary:#ededed;--ui-text-secondary:#aaa;--ui-stroke-secondary:#444}body{margin:0}main{display:flex}section{width:400px}[data-slot=aui_assistant-message-content]{font-family:var(--dt-font-sans)}</style></head><body><main><section id="pane-a" data-slot="aui_thread-content"></section><section id="pane-b" data-slot="aui_thread-content"></section></main><button id="stop">Stop</button><div id="working" role="status">Working</div><div id="tool" data-slot="tool-block"><button onclick="nativeCalls.push('tool')">Tool details</button><div class="aui-md" data-status="running">Tool output</div></div><details data-slot="aui_thinking-disclosure" id="thinking" open><summary>Thinking</summary><div class="aui-md" data-status="running">Thinking text</div></details><div id="error" role="alert">Native error</div><audio id="media" controls></audio></body></html>`})
    await b.evaluate(outputFiles[0].text)
    await b.evaluate(`document.getElementById('pane-b').append(document.getElementById('other'));document.getElementById('stop').onclick=()=>{nativeCalls.push('stop');part('live','Cancelled partial text',false,{interrupted:true,completedAt:1})};${saved===undefined?'':`saved.set('show-complete-messages',${JSON.stringify(saved)});`}window.failRead=${readFailure};activate();flush()`)
    await run(b)
  }finally{await b.evaluate('deactivate()').catch(()=>{});b.close()}
}
const shown = async(b,id)=> (await b.evaluate(`probe(${JSON.stringify(id)})`)).visible

test('default hides only in-flight assistant text; sealed commentary and final appear intact',()=>fixture(async b=>{
  assert.equal(await shown(b,'live'),false,'default must not paint token-by-token prose')
  assert.equal(await shown(b,'previous'),true)
  assert.equal(await b.evaluate(`command().data.label`),'Codex Skin: Show complete messages')
  assert.match(await b.evaluate(`command().data.detail()`),/^On/)
  for(const text of ['First streamed token plus a token','First streamed token plus **markdown**']){
    await b.evaluate(`part('live',${JSON.stringify(text)},true);flush()`)
    assert.equal(await shown(b,'live'),false)
  }
  await b.evaluate(`part('live','Completed interim **markdown**',false);part('next','New final stream',true);flush()`)
  assert.equal(await shown(b,'live'),true);assert.equal(await shown(b,'next'),false)
  await b.evaluate(`part('next','Final reply with **bold**, [link](#native-link) and code',false);flush()`)
  assert.equal(await shown(b,'next'),true)
  assert.equal(await b.evaluate(`document.querySelector('#next [data-streamdown="strong"]').textContent`),'bold')
  assert.equal(await b.evaluate(`document.querySelector('#next [data-streamdown="link"]').textContent`),'link')
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('running markdown descendants fail open for media, alerts, preview cards and late actions',()=>fixture(async b=>{
  await b.evaluate(`part('guarded','Partial prose',true);flush()`)
  assert.equal(await shown(b,'guarded'),false)
  const parts = [
    '<span data-slot="aui_zoomable-image"><img alt="Delivered image" src="data:image/png;base64,AA=="></span>',
    '<audio controls></audio>',
    '<video controls></video>',
    '<iframe title="Preview"></iframe>',
    '<div data-slot="aui_markdown-alert" role="alert">Action needed</div>',
    '<div data-slot="aui_artifact-card"><button>Open preview</button></div>',
    '<div data-slot="future-preview-card">Unknown native output</div>',
    '<a href="#native-result">Open result</a>',
    '<span tabindex="0">Native focus target</span>',
    '<span role="button">Native action</span>',
    '<span contenteditable>Editable output</span>',
    '<svg aria-label="Native plot"><path d="M0 0h1"></path></svg>',
    '<button onclick="nativeCalls.push(\'preview\')">Open preview</button>'
  ]
  await b.evaluate(`window.guardedNative=document.querySelector('#guarded .aui-md');true`)
  for (const html of parts) {
    const immediate=await b.evaluate(`(()=>{const native=document.querySelector('#guarded .aui-md');native.innerHTML=${JSON.stringify('<p>Partial prose</p>' + html)};window.protectedNative=native.lastElementChild;return native===guardedNative&&native.getBoundingClientRect().height>0})()`)
    assert.equal(immediate,true,'late protected descendants fail open before observer delivery: '+html)
    await b.evaluate(`flush()`)
    assert.equal(await b.evaluate(`document.querySelector('#guarded .aui-md')===guardedNative&&guardedNative.lastElementChild===protectedNative`),true,'native content is never replaced')
    assert.equal(await shown(b,'guarded'),true,html)
  }
  await b.evaluate(`document.querySelector('#guarded .aui-md button').click();flush()`)
  assert.deepEqual(await b.evaluate('nativeCalls'),['preview'])
  await b.evaluate(`document.querySelector('#guarded .aui-md').innerHTML='<p>Only prose remains</p>';flush()`)
  assert.equal(await shown(b,'guarded'),false)
  await b.evaluate(`deactivate();flush()`)
  assert.equal(await shown(b,'guarded'),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('native Stop, work, tools, thinking, errors and media remain live; cancellation reveals partial text',()=>fixture(async b=>{
  assert.equal(await shown(b,'live'),false)
  await b.evaluate(`document.querySelector('#tool button').click();document.querySelector('#stop').click();flush()`)
  assert.equal(await shown(b,'live'),true)
  assert.equal(await b.evaluate(`converted.live.metadata.custom.interrupted`),true)
  assert.equal(await b.evaluate(`converted.live.metadata.custom.timelineCompletedAt`),1)
  assert.deepEqual(await b.evaluate('nativeCalls'),['tool','stop'])
  for(const id of ['stop','working','tool','thinking','error','media'])assert.equal(await b.evaluate(`document.getElementById('${id}').getBoundingClientRect().height>0`),true,id)
  await b.evaluate(`part('failed','Partial text before failure',true);flush()`);assert.equal(await shown(b,'failed'),false)
  // Native error completion ends the part's running status. Error UI is a sibling.
  await b.evaluate(`part('failed','Partial text before failure',false,{error:'Native transport failure',completedAt:1});error.textContent='Native transport failure';flush()`)
  assert.equal(await shown(b,'failed'),true);assert.equal(await b.evaluate(`error.textContent`),'Native transport failure')
  assert.deepEqual(await b.evaluate(`converted.failed.status`),{type:'incomplete',reason:'error',error:'Native transport failure'})
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('earlier replies, async continuation, split panes, route replacement and unknown markers stay visible',()=>fixture(async b=>{
  assert.equal(await shown(b,'previous'),true);assert.equal(await shown(b,'other'),true)
  await b.evaluate(`part('live','First final before child wake',false);flush()`)
  await b.evaluate(`part('child-wake','Async resumed stream',true);flush()`)
  assert.equal(await shown(b,'live'),true);assert.equal(await shown(b,'child-wake'),false)
  await b.evaluate(`part('child-wake','Second final after child completion',false);flush()`)
  assert.equal(await shown(b,'live'),true);assert.equal(await shown(b,'child-wake'),true)
  await b.evaluate(`document.getElementById('pane-a').remove();const pane=document.createElement('section');pane.id='pane-a';pane.innerHTML='<div data-slot="aui_assistant-message-content"><div class="aui-md" data-status="running" id="late">New route stream</div><div class="aui-md" id="unknown">Unknown status must stay visible</div><div data-slot="aui_thinking-disclosure"><div class="aui-md" data-status="running" id="nested-thought">Nested reasoning stays visible</div></div></div>';document.querySelector('main').append(pane);flush()`)
  assert.equal(await b.evaluate(`late.getBoundingClientRect().height>0`),false)
  assert.equal(await b.evaluate(`unknown.getBoundingClientRect().height>0`),true)
  assert.equal(await b.evaluate(`document.getElementById('nested-thought').getBoundingClientRect().height>0`),true)
  assert.equal(await shown(b,'other'),true)
  // A code-card highlighting flag is not the enclosing text's lifecycle.
  await b.evaluate(`document.getElementById('other').querySelector('.aui-md').insertAdjacentHTML('beforeend','<div data-slot="code-card" data-streaming="true" id="highlighting">Sealed code still highlighting</div>');flush()`)
  assert.equal(await shown(b,'other'),true)
  assert.equal(await b.evaluate(`highlighting.getBoundingClientRect().height>0`),true)
  // Cold reopening uses new native text roots, not a remembered visible node.
  await b.evaluate(`part('reopened-first','First persisted final',false);part('reopened-second','Second persisted final',false);part('reopened-live','New pending reply',true);flush()`)
  assert.equal(await shown(b,'reopened-first'),true)
  assert.equal(await shown(b,'reopened-second'),true)
  assert.equal(await shown(b,'reopened-live'),false)
}))

test('toggle persists with readback; disable/re-enable/hot reload preserve native font, theme and completed geometry',()=>fixture(async b=>{
  const metrics=`(()=>{const e=document.querySelector('#previous .aui-md'),s=getComputedStyle(e),r=e.getBoundingClientRect();return{font:s.fontFamily,size:s.fontSize,line:s.lineHeight,width:r.width,height:r.height,color:s.color,theme:document.documentElement.className,controls:['stop','working','tool','thinking','error','media'].map(id=>{const e=document.getElementById(id);return[e.getBoundingClientRect().width,e.getBoundingClientRect().height]})}})()`
  const before=await b.evaluate(metrics)
  assert.equal(await b.evaluate(`saved.has('show-complete-messages')`),false,'no first-run preference write')
  await b.evaluate(`toggle();flush()`);assert.equal(await shown(b,'live'),true)
  assert.equal(await b.evaluate(`saved.get('show-complete-messages')`),false)
  await b.evaluate(`deactivate();activate();flush()`);assert.equal(await shown(b,'live'),true)
  await b.evaluate(`toggle();flush()`);assert.equal(await shown(b,'live'),false)
  assert.equal(await b.evaluate(`saved.get('show-complete-messages')`),true)
  assert.deepEqual(await b.evaluate(metrics),before)
  await b.evaluate(`deactivate();flush()`);assert.equal(await shown(b,'live'),true)
  await b.evaluate(`activate();flush()`);assert.equal(await shown(b,'live'),false)
  await b.evaluate(`document.documentElement.className='light';document.documentElement.style.setProperty('--dt-font-sans','monospace');flush()`)
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('#previous .aui-md')).fontFamily`),'monospace')
  assert.equal(await shown(b,'previous'),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('saved Off is honored before first paint',()=>fixture(async b=>{
  assert.equal(await shown(b,'live'),true)
  assert.match(await b.evaluate(`command().data.detail()`),/^Off/)
},{saved:false}))

test('failed save/readback does not change applied setting or report success',()=>fixture(async b=>{
  assert.equal(await shown(b,'live'),false)
  await b.evaluate(`window.failSave=true;toggle();flush()`)
  assert.equal(await shown(b,'live'),false);assert.match(await b.evaluate(`command().data.detail()`),/^On/)
  assert.equal(await b.evaluate(`notifications.at(-1).kind`),'error')
  await b.evaluate(`window.failSave=false;window.didWrite=false;window.failReadback=true;toggle();flush()`)
  assert.equal(await shown(b,'live'),false);assert.match(await b.evaluate(`command().data.detail()`),/^On/)
  assert.equal(await b.evaluate(`notifications.at(-1).kind`),'error')
}))

test('retired palette callbacks cannot write or change display after disable',()=>fixture(async b=>{
  await b.evaluate(`window.retired=command().data.run;deactivate();retired();flush()`)
  assert.equal(await b.evaluate(`saved.has('show-complete-messages')`),false)
  assert.equal(await shown(b,'live'),true)
  await b.evaluate(`activate();retired();flush()`)
  assert.equal(await shown(b,'live'),false)
  assert.equal(await b.evaluate(`saved.has('show-complete-messages')`),false)
}))

test('unreadable initial preference fails open rather than overriding a possible saved Off',()=>fixture(async b=>{
  assert.equal(await shown(b,'live'),true)
  assert.equal(await b.evaluate(`notifications.at(-1).kind`),'error')
},{readFailure:true}))
