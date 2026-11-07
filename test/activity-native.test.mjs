import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import test from 'node:test'
import {chromium,waitForRendered} from './helpers/chromium.mjs'
const core=referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require=createRequire(core+'/package.json')
const bundle=await readFile(process.env.CODEX_ACTIVITY_TEST_PLUGIN||new URL('../codex-chat-look/plugin.js',import.meta.url),'utf8')
const source=bundle.replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.plugin = {')
const nativeCSS=await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
const {outputFiles}=await require('esbuild').build({stdin:{resolveDir:core,loader:'tsx',contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
import{DisclosureRow}from'./apps/desktop/src/components/chat/disclosure-row';
import{ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS}from'./apps/desktop/src/components/chat/scaffold-row';
import{FadeText}from'./apps/desktop/src/components/ui/fade-text';
import{ToolIcon}from'./apps/desktop/src/components/ui/tool-icon';
import{GlyphSpinner}from'./apps/desktop/src/components/ui/glyph-spinner';
import{ActivityTimerText}from'./apps/desktop/src/components/chat/activity-timer-text';
import{ToolRunTicker}from'./apps/desktop/src/components/assistant-ui/tool/run-ticker';
function Tool({tool}){const[open,setOpen]=useState(false);return <div id={tool.id} data-slot='tool-block' data-tool-row='' data-conversation-scaffold=''><div><DisclosureRow open={open} onToggle={()=>{window.nativeClicks++;setOpen(!open)}} trailing={<span className='flex shrink-0 items-center gap-1.5'><ActivityTimerText seconds={tool.seconds||12}/></span>}><span className='flex min-w-0 items-center gap-1.5'><span className={SCAFFOLD_GLYPH_CLASS}>{tool.running?<GlyphSpinner ariaLabel='Running' spinner='breathe'/>:<ToolIcon name={tool.icon||'terminal'}/>}</span><FadeText className={SCAFFOLD_LABEL_CLASS}>{tool.label}</FadeText></span></DisclosureRow></div>{open?<div data-native-body=''><button onClick={()=>window.nativeActions++}>Native Copy</button><pre>Original result</pre></div>:null}</div>}
function Group({part}){const[open,setOpen]=useState(false);return <div id={part.id} data-slot='tool-block' data-tool-group=''>{part.tools.length>1?<div data-tool-summary='' data-conversation-scaffold=''><ScaffoldRow open={open} onToggle={()=>{window.nativeClicks++;setOpen(!open)}}><FadeText className={SCAFFOLD_LABEL_CLASS}>{part.live?<span className='shimmer'>Native summary</span>:'Native summary'}</FadeText></ScaffoldRow></div>:null}{part.tools.length>1&&part.live&&!open?<ToolRunTicker>{part.tools.map(tool=><Tool key={tool.id} tool={tool}/>)}</ToolRunTicker>:part.tools.length<2||open?<div>{part.tools.map(tool=><Tool key={tool.id} tool={tool}/>)}</div>:null}</div>}
function Fixture(){const[c,setC]=useState(window.config);window.change=fn=>flushSync(()=>setC(old=>fn(structuredClone(old))));return <section data-session-anchor='workspace'><div id='pair' data-slot='aui_turn-pair'><div data-role='user' data-message-id='user'>Question</div>{c.roots.map(root=><div key={root.id} id={root.id} data-role='assistant' data-message-id={root.id} data-slot='aui_assistant-message-root' data-streaming={c.live?'true':undefined}><div data-slot='aui_assistant-message-content'>{root.parts.map(part=>part.tools?<Group key={part.id} part={part}/>:<div key={part.id} id={part.id} className='aui-md'>Fresh prose</div>)}</div></div>)}</div></section>}
window.nativeClicks=0;window.nativeActions=0;flushSync(()=>createRoot(document.getElementById('fixture')).render(<Fixture/>));
`},bundle:true,format:'iife',write:false,jsx:'automatic',outdir:'activity-native-no-output',tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},define:{'process.env.NODE_ENV':'"production"'}})
async function fixture(config){const b=await chromium();await b.call('Emulation.setDeviceMetricsOverride',{width:900,height:650,deviceScaleFactor:1,mobile:false});await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look='true'><head><style>${nativeCSS}</style><style>:root{--codex-tool-label:#929292;--codex-tool-icon:#777;--ui-text-primary:#eee;--codex-color-text:#eee;--conversation-tool-font-size:14px;--conversation-line-height:24px}body{padding:30px;background:#171717;color:#ddd}section{width:700px}</style></head><body><div id='fixture'></div></body></html>`});await b.evaluate(`window.config=${JSON.stringify(config)}`);await b.evaluate(outputFiles.find(f=>f.path.endsWith('.js')).text);await b.evaluate(`(()=>{const atom=v=>{const ls=new Set();return{get:()=>v,set:x=>{v=x;ls.forEach(f=>f(x))},subscribe:f=>{ls.add(f);return()=>ls.delete(f)}}};const host={state:{activeSessionId:atom('test'),profile:atom('default'),gateway:atom('open')},onEvent:()=>()=>{},request:async()=>({messages:[]})};window.fixtureState=host.state;const THEMES_AREA='themes',TITLEBAR_AREAS={},PALETTE_AREA='palette',jsx=()=>null,useEffect=()=>{};${source};const style=document.createElement('style');style.textContent=CSS;document.head.append(style);window.stop=installBehaviorRuntime();window.pair=document.getElementById('pair');window.headers=()=>[...pair.querySelectorAll('[data-codex-tool-sequence]')];window.label=()=>headers().at(-1)?.querySelector('[data-codex-tool-sequence-label]').textContent;})()`);return b}
const wait=(b,s)=>waitForRendered(b,s,s,3000)
const tool=(id,label,running=false)=>({id,label,running})
test('actual native ticker and spinner seam retains running entry, native timer/status, controls and releases disconnected handlers',async()=>{
 const b=await fixture({live:true,roots:[{id:'root',parts:[{id:'group',live:true,tools:[tool('b','Read other file'),tool('a','Reading file',true)]}]}]});try{
 await wait(b,`label()==='Reading file'`)
 const p=await b.evaluate(`(()=>{const h=headers()[0],r=h.querySelector('button').getBoundingClientRect(),n=document.getElementById('a'),timer=n.querySelector(':scope > div > [class~="group/disclosure-row"] > span:last-child > span > span'),t=timer.getBoundingClientRect();window.originals=[...pair.querySelectorAll('[data-tool-row]')];window.parents=originals.map(n=>n.parentNode);window.originalStatus=n.querySelector('[role="status"]');window.originalTimer=timer;window.savedButton=h.querySelector('button');return{ancestors:[n,n.parentElement,n.parentElement.parentElement,n.parentElement.parentElement.parentElement,n.closest('[data-tool-group]'),h].map(e=>({tag:e.tagName,cls:e.className,rect:[e.getBoundingClientRect().y,e.getBoundingClientRect().height],display:getComputedStyle(e).display,transform:getComputedStyle(e).transform,align:getComputedStyle(e).alignItems})),header:[r.x,r.y,r.width,r.height],timer:[t.x,t.y,t.width,t.height],status:getComputedStyle(originalStatus).display,opacity:getComputedStyle(n.querySelector('button')).opacity,timerOpacity:getComputedStyle(timer).opacity,nativeTab:n.querySelector('button').getAttribute('tabindex'),live:!!h.hasAttribute('data-codex-activity-live')}})()`)
 console.log('NATIVE_ACTIVITY_GEOMETRY',JSON.stringify(p));assert.equal(p.live,true);assert.ok(Math.abs(p.header[1]-p.timer[1])<8);assert.ok(p.timer[2]>0&&p.timer[3]>0);assert.notEqual(p.status,'none');assert.equal(p.timerOpacity,'1');assert.equal(p.nativeTab,'-1')
 const ax=await b.call('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>!n.ignored&&n.role?.value==='status'&&n.name?.value==='Running'),'native status remains accessible')
 await b.evaluate(`headers()[0].querySelector('button').click()`);assert.equal(await b.evaluate(`label()`),'Reading file');assert.equal(await b.evaluate(`originals.every((n,i)=>n===document.getElementById(n.id)&&n.parentNode===parents[i])&&originalStatus===document.querySelector('#a [role="status"]')&&originalTimer===document.querySelector('#a > div > [class~="group/disclosure-row"] > span:last-child > span > span')&&nativeClicks===0`),true)
 assert.equal(await b.evaluate(`document.querySelector('#a button').hasAttribute('tabindex')`),false)
 await b.evaluate(`document.querySelector('#group [data-tool-summary] button').click()`);await wait(b,`nativeClicks===1`);await b.evaluate(`document.querySelector('#a button').click()`);await wait(b,`document.querySelector('#a [data-native-body] button')`);await b.evaluate(`document.querySelector('#a [data-native-body] button').click()`);assert.equal(await b.evaluate(`nativeActions`),1)
 await b.evaluate(`pair.remove();Promise.resolve()`);assert.equal(await b.evaluate(`savedButton.onclick===null`),true,'the removal delivery releases the disconnected handler before idle paint')
 }finally{b.close()}
})
test('native single tool completes into a quiet gap, then next call crosses assistant roots and prose seals old activity',async()=>{
 const b=await fixture({live:true,roots:[{id:'root',parts:[{id:'group',live:true,tools:[tool('a','Reading file',true)]}]}]});try{
 await wait(b,`label()==='Reading file'`);await b.evaluate(`window.first=headers()[0];window.currentY=first.querySelector('button').getBoundingClientRect().y;change(c=>{c.roots[0].parts[0].tools[0]={id:'a',label:'Read file'};return c})`);await wait(b,`label()==='Read file'`);assert.equal(await b.evaluate(`first===headers()[0]`),true)
 await b.evaluate(`change(c=>{c.roots.push({id:'next',parts:[{id:'group2',live:true,tools:[{id:'b',label:'Running command',running:true}]}]});return c})`);await wait(b,`label()==='Running command'`);assert.equal(await b.evaluate(`first===headers()[0]&&headers().length===1&&Math.abs(currentY-first.querySelector('button').getBoundingClientRect().y)<1`),true)
 await b.evaluate(`change(c=>{c.roots[1].parts.push({id:'prose'});return c})`);await wait(b,`label()==='Read file · Running command'`)
 await b.evaluate(`change(c=>{c.roots[1].parts.push({id:'group3',live:true,tools:[{id:'d',label:'Searching',running:true}]});return c})`);await wait(b,`headers().length===2&&label()==='Searching'`);assert.equal(await b.evaluate(`document.getElementById('prose').nextElementSibling===headers()[1]`),true)
 for(const slot of ['tool-approval-inline','clarify-inline','mcp-setup-inline','aui_assistant-message-stopped']){await b.evaluate(`(()=>{const e=document.createElement('div');e.id='critical';e.setAttribute('data-slot',${JSON.stringify(slot)});e.textContent='Native action';document.getElementById('d').append(e)})()`);await wait(b,`headers().length===0`);assert.equal(await b.evaluate(`document.getElementById('critical').getBoundingClientRect().height>0`),true);await b.evaluate(`document.getElementById('critical').remove()`);await wait(b,`headers().length===2`)}
 }finally{b.close()}
})
test('older opaque group folds without hiding a newer verified current activity',async()=>{
 const b=await fixture({live:true,roots:[{id:'root',parts:[{id:'opaque',live:false,tools:[tool('a','Read file'),tool('b','Ran command')]},{id:'visible',live:true,tools:[tool('c','Reading file',true)]}]}]});try{
 await wait(b,`label()==='Reading file'`)
 assert.equal(await b.evaluate(`headers().length===1&&document.getElementById('a')===null&&getComputedStyle(document.getElementById('opaque')).clipPath==='inset(50%)'&&document.getElementById('c').hasAttribute('data-codex-activity-native-current')`),true)
 assert.equal(await b.evaluate(`nativeClicks===0&&nativeActions===0`),true,'reconciliation never clicks native UI')
 await b.evaluate(`window.opaque=document.getElementById('opaque');window.current=document.getElementById('c');window.currentParent=current.parentNode;window.opaqueSummary=opaque.querySelector('[data-tool-summary] button');window.case9Targets=[];pair.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.closest('[data-codex-tool-sequence]'))case9Targets.push(button)},true);headers()[0].querySelector('button').click()`)
 await wait(b,`document.getElementById('a')`)
 assert.equal(await b.evaluate(`label()==='Reading file'&&opaque===document.getElementById('opaque')&&current===document.getElementById('c')&&current.parentNode===currentParent&&!opaque.hasAttribute('data-codex-tool-sequence-item')&&nativeClicks===1&&nativeActions===0&&case9Targets.length===1&&case9Targets[0]===opaqueSummary`),true,'explicit expansion forwards only the verified native run summary')
 await b.evaluate(`new Promise(resolve=>setTimeout(resolve,40))`)
 assert.equal(await b.evaluate(`nativeClicks===1&&case9Targets.length===1`),true,'observer reconciliation adds no native click')
 await b.evaluate(`document.querySelector('#opaque [data-tool-summary] button').click()`);await wait(b,`!document.getElementById('a')`)
 assert.equal(await b.evaluate(`nativeClicks===2&&nativeActions===0&&case9Targets.length===2&&case9Targets.every(button=>button===opaqueSummary)&&label()==='Reading file'`),true)
 await b.evaluate(`document.querySelector('#opaque [data-tool-summary] button').click()`);await wait(b,`document.getElementById('a')`)
 assert.equal(await b.evaluate(`nativeClicks===3&&nativeActions===0&&case9Targets.length===3&&case9Targets.every(button=>button===opaqueSummary)&&label()==='Reading file'`),true)
 }finally{b.close()}
})
test('opaque terminal unit keeps its public factual captions, and a lone opaque unit stays native',async()=>{
 const b=await fixture({live:true,roots:[{id:'root',parts:[{id:'known',live:true,tools:[tool('k','Earlier running name',true)]},{id:'opaque',live:false,tools:[tool('a','Hidden name A'),tool('b','Hidden name B')]}]}]});try{
 await wait(b,`label()==='Earlier running name · Native summary'`)
 const snapshot=await b.evaluate(`({label:label(),headers:headers().length,live:headers()[0].hasAttribute('data-codex-activity-live'),current:!!pair.querySelector('[data-codex-activity-native-current]'),hiddenA:!!document.getElementById('a'),hiddenB:!!document.getElementById('b'),nativeClicks})`)
 assert.deepEqual(snapshot,{label:'Earlier running name · Native summary',headers:1,live:false,current:false,hiddenA:false,hiddenB:false,nativeClicks:0})
 console.log('OPAQUE_TERMINAL_SNAPSHOT '+JSON.stringify(snapshot))
 await b.evaluate(`change(c=>{c.roots[0].parts.shift();return c})`);await wait(b,`headers().length===0`)
 assert.equal(await b.evaluate(`!document.getElementById('opaque').hasAttribute('data-codex-tool-sequence-item')&&!!document.querySelector('#opaque [data-tool-summary]').getClientRects().length&&nativeClicks===0`),true)
 }finally{b.close()}
})
