import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {chromium,waitForRendered} from './helpers/chromium.mjs'
import {referenceFile} from './helpers/reference-paths.mjs'
import {nativeRunBundle,tool} from './helpers/native-run-stream.mjs'
const native=await nativeRunBundle()
const shipping=(await readFile(new URL('../codex-chat-look/plugin.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.testPlugin = {')
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
for(const width of [390,900])test(`shipping observer keeps last command through real native unmount and opens all commands at ${width}px`,async()=>{
 const b=await chromium()
 try{
  await fixture(b,width)
  await b.evaluate(`change(c=>{c.roots[0].live=false;c.roots[0].parts.forEach(p=>p.result='done');return c})`)
  const samples=await b.evaluate(`new Promise(resolve=>{const out=[];let start=performance.now();const sample=()=>{const h=pair.querySelector('[data-codex-tool-sequence] button');out.push({label:caption(),height:h?.getBoundingClientRect().height||0,ticker:!!pair.querySelector('[data-tool-ticker]')});performance.now()-start<800?requestAnimationFrame(sample):resolve(out)};requestAnimationFrame(sample)})`)
  assert.ok(samples.length>10);assert.ok(samples.every(s=>s.label==='Running second'),'no aggregate flash after half a second or on intermediate paints')
  assert.ok(samples.every(s=>!s.ticker),'actual native rows are unmounted during the quiet gap')
  assert.ok(samples.every(s=>s.height>1),'last command remains painted and clickable')
  assert.equal(await b.evaluate(`nativeClicks`),0,'observer must not open native controls')
  await click(b,'[data-codex-tool-sequence] button')
  await waitForRendered(b,`pair.querySelectorAll('[data-tool-row]').length===2`,'one-click native command expansion')
  assert.equal(await b.evaluate(`[...pair.querySelectorAll('[data-tool-row]')].every(n=>n.getBoundingClientRect().height>1)`),true)
  await click(b,'#second button');await waitForRendered(b,`!!pair.querySelector('[data-native-result]')`,'native result handler retained')
  await click(b,'[data-codex-tool-sequence] button')
  await b.evaluate(`change(c=>{c.roots[0].prose='Intermediate update';return c})`)
  await waitForRendered(b,`caption()==='Read 2 files'&&!!pair.querySelector('.aui-md')`,'message seals the preceding group',4000)
  await b.evaluate(`change(c=>{c.roots.push({id:'b',live:true,parts:[{type:'tool-call',toolCallId:'third',toolName:'read_file',args:{path:'third'}}]});return c})`)
  await waitForRendered(b,`document.getElementById('b').querySelector('[data-codex-tool-sequence-label]')?.textContent==='Running third'`,'fresh group after message',4000)
  assert.equal(await b.evaluate(`caption()`),'Read 2 files')
  await b.evaluate(`change(c=>{c.roots[1].live=false;c.roots[1].parts[0].result='done';c.roots[1].prose='Final answer';c.live=false;return c});fixtureState.busy.set(false);fixtureState.busyBySession.set({runtime:false})`)
  await waitForRendered(b,`[...pair.querySelectorAll('.aui-md')].some(n=>n.textContent==='Final answer'&&getComputedStyle(n).display!=='none')`,'final answer retained',4000)
  await b.evaluate(`stopSkin()`)
  assert.equal(await b.evaluate(`!pair.querySelector('[data-codex-tool-sequence]')&&!!pair.querySelector('[data-tool-summary]')`),true,'disable restores native UI')
 }finally{b.close()}
})
