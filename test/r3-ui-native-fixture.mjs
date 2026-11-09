import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {chromium,waitForRendered} from './helpers/chromium.mjs'
import {referenceFile} from './helpers/reference-paths.mjs'
import {nativeRunBundle,tool} from './helpers/native-run-stream.mjs'
const native=await nativeRunBundle()
const shipping=(await readFile(process.env.CODEX_R3_TEST_PLUGIN||new URL('../codex-chat-look/plugin.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.testPlugin = {')
const css=await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'),'utf8')
async function fixture(b,width){
 await b.call('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false})
 const {frameTree}=await b.call('Page.getFrameTree')
 await b.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:'<!doctype html><html data-codex-chat-look="true"><head></head><body><div id="fixture"></div></body></html>'})
 await b.evaluate(`window.config=${JSON.stringify({live:true,roots:[{id:'a',live:true,parts:[tool('first',true),tool('second')]}]})}`)
 await b.evaluate(native)
 await b.evaluate(`(()=>{
  document.querySelector('[data-session-anchor]').dataset.sessionAnchor='workspace';
  const atom=v=>{const listeners=new Set();return{get:()=>v,set:x=>{v=x;listeners.forEach(f=>f(x))},subscribe:f=>{listeners.add(f);f(v);return()=>listeners.delete(f)}}};
  window.fixtureState={activeSessionId:atom('runtime'),focusedSessionId:atom('runtime'),focusedStoredSessionId:atom('stored'),focusedSessionOwner:atom({connectionId:'local',profile:'default'}),connectionId:atom('local'),profile:atom('default'),busy:atom(true),busyBySession:atom({runtime:true}),gateway:atom('open')};
  const host={state:fixtureState,onEvent:()=>()=>{},request:async()=>({messages:[]})};
  const PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},jsx=()=>null,useEffect=()=>{};
  window.location.hash='#/stored';${shipping}
  const base=document.createElement('style');base.textContent=${JSON.stringify(css)};document.head.append(base);
  const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
  window.stopSkin=installBehaviorRuntime();window.pair=document.getElementById('pair');
  window.caption=()=>pair.querySelector('[data-codex-tool-sequence-label], [data-tool-summary] [class*="conversation-scaffold-text"]')?.textContent;
 })()`)
 await waitForRendered(b,`caption()==='Running second'&&pair.dataset.codexActivityPhase==='working'`,'native active tail',4000)
}
async function click(b,selector){const point=await b.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point})}
export {fixture,click}
