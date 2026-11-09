import { testDependencyRequire } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {nativeFactualBundle,sequenceSource,installSequence} from './helpers/native-factual-v9.mjs'
const require=testDependencyRequire()
const {JSDOM}=require('jsdom')
const native=await nativeFactualBundle(), source=await sequenceSource()
function fixture(){
 const dom=new JSDOM('<div id="fixture"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window
 w.config={live:true,summary:'Read four files',tool:'Reading first file'}
 w.eval(native);w.eval(installSequence(source))
 return{w,close(){w.nativeRoot.unmount();dom.window.close()}}
}
test('prepaint refresh preserves user expansion, native nodes and native handlers',async()=>{
 const f=fixture(),w=f.w
 try{
  const button=w.header(),row=w.document.getElementById('t'),parent=row.parentNode,nativeButton=row.querySelector('button')
  w.change({tool:'Reading next file'});w.runtime.reconcileObserved(w.pair,w.scope)
  assert.equal(button.getAttribute('aria-label'),'Reading next file')
  button.click();assert.equal(button.getAttribute('aria-expanded'),'true')
  w.change({tool:'Reading third file'});w.runtime.reconcileObserved(w.pair,w.scope)
  assert.equal(w.header(),button);assert.equal(button.getAttribute('aria-expanded'),'true')
  assert.equal(row.hasAttribute('data-codex-tool-sequence-item'),false)
  assert.equal(row.parentNode,parent);assert.equal(row.querySelector('button'),nativeButton)
  nativeButton.click();await new Promise(r=>w.setTimeout(r,0));assert.equal(w.nativeClicks,2,'one run disclosure plus the explicitly clicked native result')
  const observer=new w.MutationObserver(()=>{});observer.observe(w.pair,{subtree:true,childList:true,attributes:true,characterData:true})
  w.runtime.reconcileObserved(w.pair,w.scope);assert.equal(observer.takeRecords().length,0);observer.disconnect()
 }finally{f.close()}
})
for(const fence of ['scope','incarnation','user','surface','disconnected','deactivated','unobserved'])test(`prepaint cannot adopt a new owner: ${fence}`,()=>{
 const f=fixture(),w=f.w
 try{
  const old=w.header();w.change({tool:'New owner caption'})
  let scope=w.scope,runtime=w.runtime
  if(fence==='scope')scope='other'
  if(fence==='incarnation')w.gen++
  if(fence==='user')w.pair.querySelector('[data-role="user"]').setAttribute('data-message-id','new-user')
  if(fence==='surface')w.pair.closest('[data-session-anchor]').setAttribute('data-session-anchor','other')
  if(fence==='disconnected')w.pair.remove()
  if(fence==='deactivated')runtime.deactivate()
  if(fence==='unobserved'){w.eval('window.fresh=createToolSequenceRuntime(()=>scope,()=>gen)');runtime=w.fresh}
  runtime.reconcileObserved(w.pair,scope)
  assert.equal(old.getAttribute('aria-label'),'Reading first file')
  assert.equal(old.getAttribute('aria-expanded'),'false')
 }finally{f.close()}
})
for(const slot of ['tool-approval-inline','clarify-inline'])test(`prepaint immediately restores native controls for ${slot}`,()=>{
 const f=fixture(),w=f.w
 try{
  const control=w.document.createElement('button');control.setAttribute('data-slot',slot);control.textContent='Required action';w.document.getElementById('t').append(control)
  w.runtime.reconcileObserved(w.pair,w.scope)
  assert.equal(w.header(),null);assert.equal(w.pair.querySelector('[data-codex-tool-sequence-item]'),null)
  assert.equal(control.isConnected,true);assert.equal(control.getAttribute('tabindex'),null)
 }finally{f.close()}
})
