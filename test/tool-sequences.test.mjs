import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import test from 'node:test'
import {chromium,waitForRendered} from './helpers/chromium.mjs'
import {paintedNativeJS} from './helpers/painted-native.mjs'
const core=referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require=createRequire(`${core}/package.json`)
const pluginUrl=process.env.CODEX_ACTIVITY_TEST_PLUGIN?new URL(process.env.CODEX_ACTIVITY_TEST_PLUGIN,`file://${process.cwd()}/`):new URL('../codex-chat-look/plugin.js',import.meta.url)
const source=(await readFile(pluginUrl,'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.testPlugin = {')
const nativeCSS=await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
const {outputFiles}=await require('esbuild').build({stdin:{resolveDir:core,loader:'tsx',contents:`
 import React,{useState} from 'react';import{createRoot}from'react-dom/client';
 import{ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS}from'./apps/desktop/src/components/chat/scaffold-row';
 import{DisclosureRow}from'./apps/desktop/src/components/chat/disclosure-row';
 import{ToolIcon}from'./apps/desktop/src/components/ui/tool-icon';
 const h=React.createElement;
 function Tool({part}){const[open,setOpen]=useState(false);return h('div',{id:part.id,'data-slot':'tool-block','data-tool-row':'','data-file-edit':part.type==='edit'&&open?'':undefined,'data-conversation-scaffold':''},h(DisclosureRow,{open,onToggle:()=>{window.nativeClicks++;setOpen(!open)}},h('span',{className:'flex items-center gap-1.5'},h('span',{className:SCAFFOLD_GLYPH_CLASS},h(ToolIcon,{name:part.type==='edit'?'edit':'terminal'})),h('span',{className:SCAFFOLD_LABEL_CLASS},part.type==='edit'?'Updated file':'Ran command'))),open?h('pre',{'data-native-output':''},'Exact native output'):null,part.unsafe?h('div',{'data-slot':part.unsafe,role:part.unsafe==='alert'?'alert':undefined,className:part.unsafe==='failure'?'text-destructive':undefined},'Required action / failure'):null)}
 function Group({part}){const[open,setOpen]=useState(false);return h('div',{id:part.id,'data-slot':'tool-block','data-tool-group':''},h('div',{'data-tool-summary':'','data-conversation-scaffold':''},h(ScaffoldRow,{open,onToggle:()=>{window.nativeClicks++;setOpen(!open)}},h('span',{className:SCAFFOLD_LABEL_CLASS},'Explored 4 files, ran 1 command'))),open?h('div',null,h(Tool,{part:{id:part.id+'-nested',type:'terminal'}})):null)}
 function Part({part}){if(part.type==='group')return h(Group,{part});if(['terminal','edit'].includes(part.type))return h(Tool,{part});if(part.type==='prose')return h('div',{id:part.id,className:'aui-md'},part.text||'Assistant prose');if(part.type==='marker')return h('span',{'data-slot':'aui_message-streaming-marker','data-message-streaming':part.live?'true':undefined,hidden:true});if(part.type==='media')return h('div',{id:part.id,'data-slot':'aui_artifact-card'},'Native media');return h('div',{id:part.id,'data-slot':part.type,role:part.type==='alert'?'alert':undefined},'Unknown or actionable native part')}
 function Fixture(){const[config,setConfig]=useState(window.config);window.change=fn=>setConfig(old=>fn(structuredClone(old)));return h('section',{'data-session-anchor':'workspace'},...config.map(pair=>h('div',{key:pair.id,id:pair.id,'data-slot':'aui_turn-pair'},h('div',{'data-role':'user','data-message-id':pair.user||pair.id+'-user'},'Question'),...pair.roots.map(root=>h('div',{key:root.id,id:root.id,'data-role':'assistant','data-message-id':root.id,'data-slot':'aui_assistant-message-root','data-streaming':root.live?'true':undefined},h('div',{'data-slot':'aui_assistant-message-content'},...root.parts.map(part=>h(Part,{key:part.id||part.type,part}))),root.final?h('div',{'data-slot':'aui_msg-actions'},h('button',null,'Copy')):null)))))}
 window.nativeClicks=0;createRoot(document.getElementById('fixture')).render(h(Fixture));
 `},bundle:true,format:'iife',write:false,jsx:'automatic',outdir:'native-sequence-fixture',tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},define:{'process.env.NODE_ENV':'"production"'}})
const part=(id,type='terminal',extra={})=>({id,type,...extra})
const pair=(id,parts)=>({id,roots:[{id:id+'-assistant',parts}]})
async function fixture(config){const b=await chromium();await b.call('Emulation.setDeviceMetricsOverride',{width:900,height:650,deviceScaleFactor:1,mobile:false});await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look="true"><head><style>${nativeCSS}</style><style>body{padding:30px;background:#171717;color:#ddd}section{max-width:760px}:root{--ui-text-secondary:#ddd;--ui-text-tertiary:#aaa;--conversation-tool-font-size:14px;--conversation-line-height:24px}</style></head><body><div id="fixture"></div></body></html>`});await b.evaluate(`window.config=${JSON.stringify(config)}`);await b.evaluate(outputFiles.find(f=>f.path.endsWith('.js')).text);await waitForRendered(b,`document.querySelector('[data-slot="aui_turn-pair"]')`,'native roots mounted');await b.evaluate(`(()=>{const atom=v=>{const listeners=new Set();return{get:()=>v,set:x=>{v=x;listeners.forEach(f=>f(x))},subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)}}};const host={state:{activeSessionId:atom('test'),profile:atom('default'),gateway:atom('open')},onEvent:()=>()=>{},request:async()=>({messages:[]})};window.fixtureState=host.state;const PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},jsx=()=>null,useEffect=()=>{};window.location.hash='#/stored-test';${source};const style=document.createElement('style');style.textContent=CSS;document.head.append(style);window.start=()=>installBehaviorRuntime();window.stop=start();window.el=id=>document.getElementById(id);${paintedNativeJS};window.vis=id=>nativeContentPainted(el(id));window.header=id=>el(id).querySelector('[data-codex-tool-sequence] button');})()`);return b}
async function click(b,selector){const p=await b.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...p})}
async function key(b,key,code,n){for(const type of ['keyDown','keyUp'])await b.call('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:n,...(type==='keyDown'?{text:key==='Enter'?'\r':key}:{})})}
async function wait(b,condition){await waitForRendered(b,condition,condition,3000)}
async function screenshot(b,name){if(!process.env.CODEX_HEADER_SCREENSHOTS)return;await mkdir(process.env.CODEX_HEADER_SCREENSHOTS,{recursive:true});const{data}=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(`${process.env.CODEX_HEADER_SCREENSHOTS}/${name}.png`,Buffer.from(data,'base64'))}

test('screenshot topology: native group + terminal + edit + terminal + edit becomes one closed line without moving native nodes',async()=>{
 const config=[pair('p',[part('g','group'),part('t'),part('e','edit'),part('t2'),part('e2','edit')])];config[0].roots[0].live=true
 const b=await fixture(config);try{
 try {await wait(b,`header('p')`)}catch(error){await screenshot(b,'sequence-missing-fold');throw error}
 assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-tool-sequence]').length===1&&header('p').getAttribute('aria-expanded')==='false'&&['g','t','e','t2','e2'].every(id=>!vis(id))&&nativeClicks===0`),true)
 assert.equal(await b.evaluate(`['g','t','e','t2'].every(id=>!painted(el(id))&&el(id).getBoundingClientRect().height<=1)&&el('e2').hasAttribute('data-codex-activity-native-current')&&el('e2').getBoundingClientRect().height===24&&!painted(el('e2').querySelector('button'))&&Math.abs(el('e2').getBoundingClientRect().y-header('p').getBoundingClientRect().y)<1&&header('p').querySelector('[data-codex-tool-sequence-label]').textContent==='Updated file'`),true,'only the native current footprint survives, with exactly one plugin title')
 await b.evaluate(`window.originals=['g','t','e','t2','e2'].map(el);window.parents=originals.map(n=>n.parentNode);window.nativeSummary=el('g').querySelector('[data-tool-summary] button');window.originalHeader=header('p')`)
 await screenshot(b,'sequence-collapsed')
 await click(b,'[data-codex-tool-sequence] button')
 assert.equal(await b.evaluate(`originals.every((n,i)=>n===el(n.id)&&n.parentNode===parents[i]&&vis(n.id))&&nativeClicks===1&&el('g').querySelector('[data-tool-summary] button').getAttribute('aria-expanded')==='true'`),true)
 await click(b,'#t button');await click(b,'#e button')
 await wait(b,`nativeClicks===3&&el('g-nested')`)
 assert.equal(await b.evaluate(`nativeSummary===el('g').querySelector('[data-tool-summary] button')&&!!el('t').querySelector('[data-native-output]')&&!!el('e').querySelector('[data-native-output]')`),true)
 await screenshot(b,'sequence-expanded')
 await b.evaluate(`header('p').focus()`);await key(b,' ','Space',32);await wait(b,`header('p').getAttribute('aria-expanded')==='false'`)
 await b.evaluate(`change(c=>{c[0].roots[0].parts.push({id:'t3',type:'terminal'});return c})`);await wait(b,`el('t3')&&!vis('t3')`)
 await key(b,'Enter','Enter',13);await wait(b,`header('p').getAttribute('aria-expanded')==='true'`)
 await b.evaluate(`change(c=>{c[0].roots.push({id:'p-next',live:true,parts:[{id:'t4',type:'terminal'}]});return c})`);await wait(b,`vis('t4')&&header('p')===originalHeader`)
 assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-tool-sequence]').length`),1,'cross-assistant-root append preserves the same open run')
 }finally{b.close()}
})

test('prose, unknown/media/actions separate runs; single tools and lone native groups remain native',async()=>{
 const b=await fixture([pair('p',[part('a'),part('b','edit'),part('prose','prose'),part('c'),part('d','edit'),part('unknown','unknown'),part('single'),part('media','media'),part('alone','group')]),pair('q',[part('q1'),part('q2')])]);try{
 await wait(b,`document.querySelectorAll('[data-codex-tool-sequence]').length===3`)
 assert.equal(await b.evaluate(`vis('prose')&&vis('single')&&vis('media')&&vis('unknown')&&vis('alone')&&el('single').hasAttribute('data-codex-tool-sequence-item')===false`),true)
 await click(b,'#p [data-codex-tool-sequence] button')
 assert.equal(await b.evaluate(`vis('a')&&vis('b')&&!vis('c')&&!vis('q1')`),true)
 for(const unsafe of ['tool-approval-inline','clarify-inline','mcp-setup-inline','alert','failure']){
 await b.evaluate(`change(c=>{c[1].roots[0].parts[0].unsafe=${JSON.stringify(unsafe)};return c})`)
 await wait(b,`!header('q')&&vis('q1')&&vis('q2')`)
 await b.evaluate(`change(c=>{delete c[1].roots[0].parts[0].unsafe;return c})`);await wait(b,`header('q')&&!vis('q1')`)
 }
 await b.evaluate(`change(c=>{c[1].roots[0].parts.unshift({id:'inserted-prose',type:'prose'});return c})`)
 await wait(b,`header('q').closest('[data-codex-tool-sequence]').previousElementSibling?.id==='inserted-prose'`)
 assert.equal(await b.evaluate(`vis('inserted-prose')&&!vis('q1')&&!vis('q2')`),true,'only the owned header moves after newly inserted prose')
 }finally{b.close()}
})

test('route/profile/new-user fences, hot reload, disable and Working fold preserve ownership and native DOM',async()=>{
 const config=[pair('p',[part('a'),part('b','edit')])];config[0].roots.push({id:'final',final:true,parts:[part('answer','prose')]})
 const b=await fixture(config);try{
 await wait(b,`header('p')&&el('p').querySelector('[data-codex-turn-activity]')`)
 assert.equal(await b.evaluate(`!header('p').getClientRects().length&&vis('answer')`),true,'Working fold also conceals the sibling summary')
 await click(b,'[data-codex-turn-activity]');await click(b,'[data-codex-tool-sequence] button')
 await b.evaluate(`window.saved=header('p');window.native=el('a');window.nativeParent=native.parentNode;window.location.hash='#/different';saved.click()`)
 assert.equal(await b.evaluate(`saved.getAttribute('aria-expanded')`),'true','late route click cannot fold new owner')
 await wait(b,`header('p')!==saved&&header('p').getAttribute('aria-expanded')==='false'`)
 await b.evaluate(`window.saved=header('p');fixtureState.profile.set('other');saved.click()`)
 assert.equal(await b.evaluate(`saved.getAttribute('aria-expanded')`),'false','late profile click is inert')
 await wait(b,`header('p')!==saved`)
 await b.evaluate(`window.saved=header('p');el('p').closest('[data-session-anchor]').setAttribute('data-session-anchor','other-pane');saved.click()`)
 assert.equal(await b.evaluate(`saved.getAttribute('aria-expanded')`),'false','late owner-surface click is inert')
 await wait(b,`header('p')!==saved`)
 await b.evaluate(`window.saved=header('p');change(c=>{c[0].user='new-user';return c})`);await wait(b,`header('p')!==saved&&header('p')?.getAttribute('aria-expanded')==='false'`)
 // New owner defaults closed, but outer Worked may remain closed independently.
 await b.evaluate(`el('p').querySelector('[data-codex-turn-activity]').click();header('p').click();window.saved=header('p');stop();saved.click();window.stop=start()`)
 await wait(b,`header('p')===saved&&header('p').getAttribute('aria-expanded')==='true'`)
 await wait(b,`(saved.click(),saved.getAttribute('aria-expanded')==='false')`)
 await b.evaluate(`saved.click()`)
 assert.equal(await b.evaluate(`saved.getAttribute('aria-expanded')`),'true','hot reload rebinds the surviving owned button')
 assert.equal(await b.evaluate(`el('a')===native&&native.parentNode===nativeParent`),true)
 await b.evaluate(`stop();window.stop=start();stop()`);await wait(b,`!document.querySelector('[data-codex-tool-sequence], [data-codex-tool-sequence-item], [data-codex-turn-activity]')`)
 assert.equal(await b.evaluate(`vis('a')&&vis('b')&&el('a')===native`),true)
 }finally{b.close()}
})
