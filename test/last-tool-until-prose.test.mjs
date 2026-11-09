import assert from 'node:assert/strict'
import test from 'node:test'
import {testDependencyRequire} from './helpers/reference-paths.mjs'
import {nativeRunBundle,installSequence,tool} from './helpers/native-run-stream.mjs'
import {sequenceSource} from './helpers/native-factual-v9.mjs'
const {JSDOM}=testDependencyRequire()('jsdom')
const native=await nativeRunBundle(), source=await sequenceSource()
function fixture(){
 const dom=new JSDOM('<div id="fixture"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window
 // jsdom has no Web Animations API. Exercise the native reduced-motion path;
 // real animation/paint is qualified separately in Chromium.
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})
 w.structuredClone=structuredClone
 w.config={live:true,roots:[{id:'a',live:true,parts:[tool('first',true),tool('second')]}]}
 w.eval(native);w.eval(installSequence(source));w.pair.dataset.codexActivityPhase='working'
 w.header=()=>w.pair.querySelector('[data-codex-tool-sequence] button')
 return {w,close(){w.nativeRoot.unmount();w.runtime.cleanup();dom.window.close()}}
}
const caption=w=>w.pair.querySelector('[data-codex-tool-sequence-label], [data-tool-summary] [class*="conversation-scaffold-text"]')?.textContent
function quiet(w){w.change(c=>{c.roots[0].parts.forEach(p=>p.result='done');c.roots[0].live=false;return c});w.sync()}
test('latest command wins even when an older parallel command is still running',()=>{
 const f=fixture(),w=f.w
 try{
  w.change(c=>{delete c.roots[0].parts[0].result;c.roots[0].parts[1].result='done';return c});w.sync()
  assert.equal(caption(w),'Finished second')
 }finally{f.close()}
})
test('native ticker unmount during an owned working gap retains the last command, not the aggregate',()=>{
 const f=fixture(),w=f.w
 try{
  assert.equal(caption(w),'Running second');quiet(w)
  assert.equal(w.pair.querySelector('[data-tool-ticker]'),null,'actual native ToolRun must unmount its ticker')
  for(let i=0;i<10;i++){w.sync();assert.equal(caption(w),'Running second');assert.equal(w.header().getAttribute('aria-expanded'),'false')}
  assert.equal(w.pair.querySelector('[data-codex-activity-running]'),null,'a remembered caption must not invent running work')
 }finally{f.close()}
})
test('one user click opens all native commands without losing their handlers',async()=>{
 const f=fixture(),w=f.w
 try{
  quiet(w);const header=w.header();assert.ok(header,'last-command disclosure survives quiet gap');header.click()
  await new Promise(r=>w.setTimeout(r,0));w.sync()
  assert.equal(header.getAttribute('aria-expanded'),'true')
  assert.equal(w.pair.querySelectorAll('[data-tool-row]').length,2,'do not require a second click on a native aggregate')
  w.document.querySelector('#second button').click();await new Promise(r=>w.setTimeout(r,0))
  assert.equal(w.nativeClicks,1);assert.ok(w.pair.querySelector('[data-native-result]'))
  header.click();assert.equal(header.getAttribute('aria-expanded'),'false')
 }finally{f.close()}
})
test('message boundary settles only the preceding group; next tools and final message remain independent',()=>{
 const f=fixture(),w=f.w
 try{
  quiet(w);assert.equal(caption(w),'Running second')
  w.change(c=>{c.roots[0].prose='Intermediate update';return c});w.sync()
  assert.equal(caption(w),'Read 2 files');assert.equal(w.pair.querySelector('.aui-md').textContent,'Intermediate update')
  w.change(c=>{c.roots.push({id:'b',live:true,parts:[tool('third')]});return c});w.sync()
  const labels=()=>[...w.pair.querySelectorAll('[data-slot="aui_assistant-message-content"]')].map(n=>n.querySelector('[data-codex-tool-sequence-label], [data-tool-summary] [class*="conversation-scaffold-text"]')?.textContent)
  assert.deepEqual(labels(),['Read 2 files','Running third'])
  w.change(c=>{c.roots[1].live=false;c.roots[1].parts[0].result='done';return c});w.sync()
  assert.deepEqual(labels(),['Read 2 files','Finished third'])
  w.change(c=>{c.roots[1].prose='Final answer';c.live=false;return c});w.pair.dataset.codexActivityPhase='completed';w.sync()
  assert.equal(labels()[0],'Read 2 files')
  assert.equal(w.pair.querySelector('[data-codex-activity-live]'),null)
  assert.equal(w.pair.querySelectorAll('.aui-md')[1].textContent,'Final answer')
 }finally{f.close()}
})
for(const fence of ['scope','incarnation','native-message','user','surface','new-terminal'])test(`last command cache cannot cross ${fence}`,()=>{
 const f=fixture(),w=f.w
 try{
  quiet(w)
  if(fence==='scope')w.scope='other'
  if(fence==='incarnation')w.gen++
  if(fence==='native-message')w.document.getElementById('a').dataset.messageId='other'
  if(fence==='user')w.pair.querySelector('[data-role="user"]').dataset.messageId='other'
  if(fence==='surface')w.pair.closest('[data-session-anchor]').dataset.sessionAnchor='other'
  if(fence==='new-terminal')w.change(c=>{c.roots.push({id:'b',live:false,parts:[tool('opaque-one',true),tool('opaque-two',true)]});return c})
  w.sync();assert.notEqual(caption(w),'Running second','never claim an earlier tool as the newest opaque activity')
 }finally{f.close()}
})
