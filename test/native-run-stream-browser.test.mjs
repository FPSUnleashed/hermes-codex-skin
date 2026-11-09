import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {nativeRunBundle,installSequence,tool,provenance} from './helpers/native-run-stream.mjs'
import {chromium,waitForRendered} from './helpers/chromium.mjs'
import {paintedNativeJS} from './helpers/painted-native.mjs'
const native=await nativeRunBundle()
const plugin=(await readFile(new URL('../codex-chat-look/plugin.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.plugin = {')
const sequence=await readFile(new URL('../src/tool-sequence-glyphs.js',import.meta.url),'utf8')+'\n'+await readFile(new URL('../src/tool-sequences.js',import.meta.url),'utf8')
const nativeCSS=await readFile(process.env.HERMES_INSTALLED_ROW_CSS,'utf8')
console.log('NATIVE_RUN_PROVENANCE',JSON.stringify(provenance))
test('native grouping streaming geometry, direct reconciliation and scheduled runtime',async()=>{
 const b=await chromium();try{
  await b.call('Emulation.setDeviceMetricsOverride',{width:900,height:650,deviceScaleFactor:1,mobile:false})
  const all=[]
  for(const scheduled of [false,true])for(const acrossRoots of [false,true]){
   const marker=`fresh-${scheduled}-${acrossRoots}`
   await b.call('Page.navigate',{url:'data:text/html,'+encodeURIComponent(`<div id="${marker}"></div>`)})
   await waitForRendered(b,`document.getElementById(${JSON.stringify(marker)})`,'fresh JavaScript realm',3000)
   await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look='true'><head><style>${nativeCSS}</style><style>:root{--conversation-tool-font-size:14px;--conversation-line-height:24px;--ui-text-secondary:#ddd;--ui-text-tertiary:#999}body{padding:30px;background:#171717;color:#ddd}</style></head><body><div id='fixture'></div></body></html>`})
   await b.evaluate(`(()=>{const atom=v=>({get:()=>v,set:x=>v=x,subscribe:()=>()=>{}});window.fixtureHost={state:{activeSessionId:atom('s'),profile:atom('default'),gateway:atom('open')},onEvent:()=>()=>{},request:async()=>({messages:[]})};const host=fixtureHost,jsx=()=>null,useEffect=()=>{},THEMES_AREA='themes',TITLEBAR_AREAS={},PALETTE_AREA='palette';window.frame=()=>new Promise(r=>requestAnimationFrame(r));${plugin};const style=document.createElement('style');style.textContent=CSS;document.head.append(style);window.startScheduled=()=>installBehaviorRuntime();${paintedNativeJS};window.paintedFaceButtons=()=>[...document.querySelectorAll('#pair [data-codex-tool-sequence] button,#pair [data-tool-row] button,#pair [data-tool-summary] button')].filter(painted);})()`)
   await b.evaluate(`window.config=${JSON.stringify({live:true,roots:[{id:'a',live:true,parts:[tool('t1')]}]})}`)
   await b.evaluate(native)
   if(scheduled)await b.evaluate(`window.stopScheduled=startScheduled()`)
   else await b.evaluate(`(()=>{${installSequence(sequence)}})()`)
   await waitForRendered(b,`document.querySelector('[data-codex-tool-sequence]')`,'first current projection',3000)
   await b.evaluate(`new Promise(r=>setTimeout(r,260))`)
   const samples=[]
   for(let i=1;i<=6;i++){
    for(const phase of ['result','next']){
     if(phase==='result')await b.evaluate(`change(c=>{const last=c.roots.at(-1);last.parts[last.parts.length-1]=${JSON.stringify(tool('t'+i,true))};return c})`)
     else if(i<6)await b.evaluate(`change(c=>{${acrossRoots?`c.roots.at(-1).live=false;c.roots.push({id:'a${i}',live:true,parts:[${JSON.stringify(tool('t'+(i+1)))}]})`:`c.roots[0].parts.push(${JSON.stringify(tool('t'+(i+1)))})`};return c})`)
     else continue
     if(!scheduled)await b.evaluate('sync()')
     const frames=await b.evaluate(`(async()=>{const rows=[];for(let frame=0;frame<8;frame++){await window.frame();const pair=document.getElementById('pair');rows.push({frame,faces:paintedFaceButtons().map(x=>({label:x.textContent,y:x.getBoundingClientRect().y,height:x.getBoundingClientRect().height})),pairHeight:pair.getBoundingClientRect().height,headers:pair.querySelectorAll('[data-codex-tool-sequence]').length,current:pair.querySelectorAll('[data-codex-activity-native-current]').length,streaming:pair.querySelectorAll('[data-streaming="true"]').length})}return rows})()`)
     samples.push({i,phase,frames})
    }
   }
   console.log('NATIVE_STREAM_GEOMETRY',JSON.stringify({scheduled,acrossRoots,samples}));all.push({scheduled,acrossRoots,samples})
   await b.evaluate(scheduled?'stopScheduled()':'runtime.cleanup()');await b.evaluate('nativeRoot.unmount()');await b.evaluate('new Promise(r=>setTimeout(r,330))')
  }
  const failures=all.flatMap(s=>s.samples.flatMap(x=>x.frames.filter(f=>f.faces.length!==1).map(f=>({scheduled:s.scheduled,acrossRoots:s.acrossRoots,i:x.i,phase:x.phase,...f}))))
  assert.deepEqual(failures,[],'one painted activity face per frame through arrivals and results')
 }finally{b.close()}
})
