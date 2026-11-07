import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {nativeRunBundle,tool} from './helpers/native-run-stream.mjs'
import {chromium,waitForRendered} from './helpers/chromium.mjs'

const native=await nativeRunBundle()
const plugin=(await readFile(new URL('../codex-chat-look/plugin.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.plugin = {')
const css=await readFile(process.env.HERMES_INSTALLED_ROW_CSS,'utf8')

test('shipping observer retains explicit expansion through pause, resume, native regrouping and completion; burst plus modeled history becomes mutation-quiet',async()=>{
 const b=await chromium()
 try{
  await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look='true'><head><style>${css}</style></head><body><div id='fixture'></div></body></html>`})
  await b.evaluate(`(()=>{const atom=v=>{const listeners=new Set();return{get:()=>v,set:x=>{v=x;listeners.forEach(f=>f(x))},subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)}}};window.fixtureHost={state:{activeSessionId:atom('s'),profile:atom('default'),gateway:atom('open')},onEvent:()=>()=>{},request:async()=>({messages:[]})};const host=fixtureHost,jsx=()=>null,useEffect=()=>{},THEMES_AREA='themes',TITLEBAR_AREAS={},PALETTE_AREA='palette';${plugin};const style=document.createElement('style');style.textContent=CSS;document.head.append(style);window.start=()=>installBehaviorRuntime();const Observer=window.MutationObserver;window.observerCalls=0;window.observerRecords=0;window.MutationObserver=class extends Observer{constructor(fn){super((records,observer)=>{observerCalls++;observerRecords+=records.length;fn(records,observer)})}};window.config=${JSON.stringify({live:true,roots:[{id:'a',live:false,parts:[tool('t1',true)]},{id:'b',live:true,parts:[tool('t2')]}]})};})()`)
  await b.evaluate(native)
  await b.evaluate(`window.stop=start();window.pair=document.getElementById('pair');window.header=()=>pair.querySelector('[data-codex-tool-sequence] button');window.settle=()=>new Promise(r=>setTimeout(r,650))`)
  await waitForRendered(b,`header()&&header().getAttribute('aria-label')==='Running t2'`,'initial projection',3000)
  await b.evaluate(`window.saved=header();window.originalNative=document.getElementById('t1');window.originalParent=originalNative.parentNode;saved.click()`)
  assert.equal(await b.evaluate(`saved.getAttribute('aria-expanded')`),'true')
  await b.evaluate(`change(c=>{c.live=false;c.roots.forEach(r=>{r.live=false;r.parts=r.parts.map(p=>({...p,result:'done'}))});return c})`)
  await waitForRendered(b,`header()===saved&&saved.getAttribute('aria-expanded')==='true'&&!pair.querySelector('[data-streaming="true"]')`,'quiet non-streaming pause',3000)
  await b.evaluate(`settle()`)
  assert.equal(await b.evaluate(`header()===saved&&saved.getAttribute('aria-expanded')==='true'`),true)
  await b.evaluate(`change(c=>{c.live=true;c.roots[1].live=true;c.roots[1].parts.push(${JSON.stringify(tool('t3'))});return c})`)
  await waitForRendered(b,`header()===saved&&saved.getAttribute('aria-expanded')==='true'&&document.getElementById('t3')`,'native regrouping after resume',3000)
  const nativeToggle=await b.evaluate(`(()=>{const n=document.getElementById('t3').closest('[data-tool-group]').querySelector('[data-tool-summary] button');n.click();return true})()`)
  assert.equal(nativeToggle,true)
  await waitForRendered(b,`document.getElementById('t3')`,'native expanded group',3000)
  await b.evaluate(`document.getElementById('t3').querySelector('button').click()`)
  await waitForRendered(b,`document.querySelector('#t3 [data-native-result]')`,'native tool result',3000)
  assert.equal(await b.evaluate(`nativeClicks===1&&originalNative===document.getElementById('t1')&&originalNative.parentNode===originalParent&&header()===saved&&saved.getAttribute('aria-expanded')==='true'`),true)
  await b.evaluate(`change(c=>{c.live=false;c.roots.forEach(r=>{r.live=false;r.parts=r.parts.map(p=>({...p,result:'done'}))});c.roots.at(-1).prose='Final reply';return c})`)
  await waitForRendered(b,`header()===saved&&saved.getAttribute('aria-expanded')==='true'&&pair.querySelector('.aui-md')?.textContent==='Final reply'`,'final completion preserves explicit choice and prose',3000)
  await b.evaluate(`settle()`)
  const completed=await b.evaluate(`({same:header()===saved,open:saved.getAttribute('aria-expanded'),nativeClicks,streaming:pair.querySelectorAll('[data-streaming="true"]').length})`)
  assert.deepEqual(completed,{same:true,open:'true',nativeClicks:1,streaming:0})

  // Deliberately modeled immutable historical DOM, not native-window hydration.
  // Each cloned pair gets independent public identity and no skin-owned nodes.
  await b.evaluate(`(()=>{const history=document.createElement('section');history.id='modeled-history';history.setAttribute('data-session-anchor','history');for(let i=0;i<64;i++){const p=pair.cloneNode(true);p.id='history-'+i;p.querySelectorAll('[data-codex-tool-sequence],[data-codex-turn-activity]').forEach(n=>n.remove());for(const n of [p,...p.querySelectorAll('*')]){for(const a of [...n.attributes])if(a.name.startsWith('data-codex-'))n.removeAttribute(a.name);if(n.hasAttribute('data-message-id'))n.setAttribute('data-message-id','history-'+i+'-'+n.getAttribute('data-message-id'));if(n.id)n.id='history-'+i+'-'+n.id}history.append(p)}document.body.prepend(history)})()`)
  await waitForRendered(b,`document.querySelectorAll('#modeled-history [data-codex-tool-sequence]').length===64`,'bounded history hydration',5000)
  await b.evaluate(`settle()`)
  const before=await b.evaluate(`({calls:observerCalls,records:observerRecords})`)
  const burst=await b.evaluate(`(()=>{const start=performance.now();for(let i=0;i<20;i++)change(c=>{c.live=true;c.roots.at(-1).prose=undefined;c.roots.at(-1).live=false;c.roots.push({id:'burst-'+i,live:true,parts:[{type:'tool-call',toolCallId:'burst-'+i,toolName:'read_file',args:{path:'fixture'},result:'done'}]});return c});return{nativeUpdateMs:performance.now()-start}})()`)
  await waitForRendered(b,`pair.querySelectorAll('[data-role="assistant"]').length===22&&header()===saved&&saved.getAttribute('aria-expanded')==='true'`,'burst reconciled',5000)
  await b.evaluate(`settle()`)
  const quiet1=await b.evaluate(`({calls:observerCalls,records:observerRecords,history:document.querySelectorAll('#modeled-history [data-codex-tool-sequence]').length})`)
  await b.evaluate(`settle()`)
  const quiet2=await b.evaluate(`({calls:observerCalls,records:observerRecords,history:document.querySelectorAll('#modeled-history [data-codex-tool-sequence]').length})`)
  console.log('RUNTIME_LIFECYCLE',JSON.stringify({completed,historyPairs:64,burstArrivals:20,before,burst,quiet1,quiet2}))
  assert.deepEqual(quiet2,quiet1,'full shipping observer must become mutation-quiet, not only direct reconcile calls')
  assert.ok(quiet1.calls-before.calls<80,'bounded observer deliveries after finite burst')
  await b.evaluate(`stop();settle()`)
  assert.equal(await b.evaluate(`!document.querySelector('[data-codex-tool-sequence]')&&originalNative===document.getElementById('t1')&&originalNative.parentNode===originalParent`),true)
 }finally{b.close()}
})
