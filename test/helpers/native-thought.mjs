import { referenceFile, referenceRoot } from './reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {chromium,waitForRendered} from './chromium.mjs'
import {paintedNativeJS} from './painted-native.mjs'
const core=referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require=createRequire(`${core}/package.json`),ts=require('typescript')
const native=await readFile(`${core}/apps/desktop/src/components/assistant-ui/thread/message-parts.tsx`,'utf8')
const ast=ts.createSourceFile('message-parts.tsx',native,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
function declaration(name){const found=[];function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)found.push(n);ts.forEachChild(n,visit)}visit(ast);assert.equal(found.length,1);return `const ${found[0].getText(ast)};`}
console.log('THOUGHT_NATIVE_SOURCE '+createHash('sha256').update(native).digest('hex'))
const {outputFiles}=await require('esbuild').build({stdin:{resolveDir:core,loader:'tsx',contents:`
import React,{useState,useRef,useMemo,useEffect,useContext,createContext}from'react';import{createRoot}from'react-dom/client';
import{ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS,SCAFFOLD_META_CLASS}from'./apps/desktop/src/components/chat/scaffold-row';
import{GlyphSpinner}from'./apps/desktop/src/components/ui/glyph-spinner';
import{DisclosureRow}from'./apps/desktop/src/components/chat/disclosure-row';import{ToolIcon}from'./apps/desktop/src/components/ui/tool-icon';import{cn}from'./apps/desktop/src/lib/utils';
const h=React.createElement,Context=createContext(null),$showReasoning={},$reasoningCollapsedByDefault={},PREVIEW_RELOCK_THRESHOLD_PX=8;
const useAuiState=selector=>{const p=useContext(Context);return selector({message:{id:p.id,status:{type:p.live?'running':'complete'},parts:[{type:'reasoning',text:p.text??'Native reasoning',status:{type:p.live?'running':'complete'}}]},thread:{isRunning:!!p.live}})};
const useStore=store=>{const p=useContext(Context);return store===$showReasoning?p.enabled!==false:store===$reasoningCollapsedByDefault?!!p.collapsed:false};
const useSessionView=()=>({$runtimeId:{}}),onboardingChatStore=()=>({}),useElapsedSeconds=()=>3,useMeasuredDuration=()=>null,useEnterAnimation=()=>{const p=useContext(Context);return node=>{if(node)node.id=p.id}},formatElapsed=s=>s+'s';
const useI18n=()=>({t:{assistant:{thread:{thinking:'Thinking',thought:'Thought',thoughtBriefly:'Thought briefly',thoughtFor:s=>'Thought for '+s}}}});
const TimelineTimestamp=()=>null,ActivityTimerText=({className,seconds})=>h('span',{className,role:'status'},seconds+'s');
${declaration('ThinkingDisclosure')}
${declaration('ReasoningAccordionGroup')}
function Thought({part}){return h(Context.Provider,{value:part},h(ReasoningAccordionGroup,{startIndex:0,endIndex:0},h('div',{'data-slot':'aui_reasoning-text',className:'aui-md','aria-live':part.live?'polite':undefined},part.text||'Native reasoning',part.unsafe?h('div',{'data-slot':part.unsafe,role:part.unsafe==='alert'?'alert':undefined},'Required native action'):null)))}
function Tool({part}){const[open,setOpen]=useState(false);return h('div',{id:part.id,'data-slot':'tool-block','data-tool-row':'','data-conversation-scaffold':''},h(DisclosureRow,{open,onToggle:()=>{window.nativeClicks++;setOpen(!open)}},h('span',{className:'flex items-center gap-1.5'},h('span',{className:SCAFFOLD_GLYPH_CLASS},part.running?h(GlyphSpinner,{ariaLabel:'Running',spinner:'breathe'}):h(ToolIcon,{name:'terminal'})),h('span',{className:SCAFFOLD_LABEL_CLASS},part.label||'Native command'))),open?h('pre',null,'Native output'):null)}
function Part({part}){if(part.type==='thought')return h(Thought,{part});if(part.type==='tool')return h(Tool,{part});return h('div',{id:part.id,className:'aui-md'},part.text||'Assistant prose')}
function Fixture(){const[c,set]=useState(window.config);window.change=fn=>set(old=>fn(structuredClone(old)));return h('section',{'data-session-anchor':'workspace'},h('div',{'data-slot':'aui_turn-pair',id:'pair'},h('div',{'data-role':'user','data-message-id':'user'},'Question'),...c.map(root=>h('div',{key:root.id,'data-role':'assistant','data-message-id':root.id,'data-slot':'aui_assistant-message-root','data-streaming':root.live?'true':undefined},h('div',{'data-slot':'aui_assistant-message-content'},...root.parts.map(part=>h(Part,{key:part.id,part})))))))}
window.nativeClicks=0;createRoot(document.getElementById('fixture')).render(h(Fixture));
`},bundle:true,write:false,format:'iife',jsx:'automatic',outdir:'native-thought-fixture',tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},define:{'process.env.NODE_ENV':'"production"'}})
// Full native disclosure/group producers; only stores, clocks, translations,
// timestamp and animation ref sinks are isolated. Native open/preview state,
// scroll observer, ScaffoldRow and DisclosureRow remain untouched.
const nativeCSS=await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
const source=await readFile(process.env.CODEX_ACTIVITY_TEST_PLUGIN||new URL('../../codex-chat-look/plugin.js',import.meta.url),'utf8')
const runtime=source.replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.testPlugin = {')
export const part=(id,type='thought',extra={})=>({id,type,...extra})
export const wait=async(b,condition)=>waitForRendered(b,condition,condition,3000)
export async function fixture(parts,{live=false,roots=null}={}){
 const b=await chromium();await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look="true"><head><style>${nativeCSS}</style><style>body{padding:30px}:root{--ui-text-secondary:#555;--ui-text-tertiary:#888;--conversation-tool-font-size:14px;--conversation-line-height:24px}</style></head><body><div id="fixture"></div><div data-slot="aui_response-loading" id="thinking-reference"></div><button id="stop" aria-label="Stop">Stop</button></body></html>`});await b.evaluate(`window.config=${JSON.stringify(roots||[{id:'assistant',live,parts}])}`);await b.evaluate(outputFiles.find(f=>f.path.endsWith('.js')).text);await wait(b,`document.querySelector('[data-slot="aui_turn-pair"]')`);
 await b.evaluate(`(()=>{const atom=v=>{const listeners=new Set();return{get:()=>v,set:x=>{v=x;listeners.forEach(f=>f(x))},subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)}}};const host={state:{activeSessionId:atom('test'),profile:atom('default'),gateway:atom('open')},onEvent:()=>()=>{},request:async()=>({messages:[]})};window.fixtureState=host.state;const PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={},jsx=()=>null,useEffect=()=>{};window.location.hash='#/stored-test';${runtime};const style=document.createElement('style');style.textContent=CSS;document.head.append(style);window.start=()=>installBehaviorRuntime();window.stopRuntime=start();window.el=id=>document.getElementById(id);${paintedNativeJS};window.vis=id=>nativeContentPainted(el(id));window.header=()=>document.querySelector('[data-codex-tool-sequence] button');window.makeSequenceRuntime=()=>createToolSequenceRuntime(()=> 'measure',()=> 'incarnation');window.mask=node=>getComputedStyle(node,'::before').maskImage;})()`);return b
}
export async function click(b,selector){
 // The initial pair projection is queued after RAF on an idle callback.
 await wait(b,`document.querySelector('[data-slot="aui_turn-pair"] [data-codex-turn-activity]')`)
 const key=JSON.stringify(selector)
 const p=await b.evaluate(`new Promise((resolve,reject)=>{
  let frame;const timer=setTimeout(()=>{cancelAnimationFrame(frame);reject(Error('click geometry frame timeout'))},1500);
  const fail=message=>{clearTimeout(timer);reject(Error(message))};
  frame=requestAnimationFrame(()=>{
   const node=document.querySelector(${key});if(!node||node.disabled)return fail('click target unavailable');
   const r=node.getBoundingClientRect(),rect=[r.x,r.y,r.width,r.height],x=r.x+r.width/2,y=r.y+r.height/2;
   frame=requestAnimationFrame(()=>{
    const now=node.getBoundingClientRect(),hit=document.elementFromPoint(x,y);
    if(document.querySelector(${key})!==node||!node.isConnected||node.disabled||r.width<=0||r.height<=0||[now.x,now.y,now.width,now.height].some((v,i)=>v!==rect[i])||!hit||!node.contains(hit))return fail('click target moved or covered before pointer move');
    window.__nativeThoughtClick={node,rect,x,y};clearTimeout(timer);resolve({x,y});
   });
  });
 })`)
 await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',...p})
 const ready=await b.evaluate(`new Promise((resolve,reject)=>{let frame;const timer=setTimeout(()=>{cancelAnimationFrame(frame);reject(Error('click hit-test frame timeout'))},1500);frame=requestAnimationFrame(()=>{const saved=window.__nativeThoughtClick;delete window.__nativeThoughtClick;const node=document.querySelector(${key}),r=node?.getBoundingClientRect(),hit=document.elementFromPoint(saved.x,saved.y);clearTimeout(timer);resolve(!!node&&node===saved.node&&node.isConnected&&!node.disabled&&[r.x,r.y,r.width,r.height].every((v,i)=>v===saved.rect[i])&&!!hit&&node.contains(hit))})})`)
 assert.equal(ready,true,'click target moved or covered after pointer move')
 for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...p})
}
