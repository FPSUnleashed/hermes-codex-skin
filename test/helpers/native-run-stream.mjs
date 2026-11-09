import { referenceRoot } from './reference-paths.mjs'
// Source-seam fixture: exact native grouping/render functions, public state inputs.
// Not a full Hermes window. SDK session/approval/locale and clocks are fixtures;
// actual React, motion, native grouping, ticker, disclosure and enter hook execute.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
const core=referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require=createRequire(`${core}/package.json`)
const ts=require('typescript')
const fallback=await readFile(`${core}/apps/desktop/src/components/assistant-ui/tool/fallback.tsx`,'utf8')
const ast=ts.createSourceFile('fallback.tsx',fallback,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const names=['splitRunItems','toolGroupKey','ToolRunHeader','useToolRun','ToolRun','ToolGroupSlot']
const declarations=names.map(name=>{
 const nodes=ast.statements.filter(n=>n.name?.text===name||n.declarationList?.declarations.some(d=>d.name.text===name))
 assert.equal(nodes.length,1,name)
 return nodes[0].getText(ast).replace(/^export /,'')
}).join('\n')
export const provenance={fallback_sha256:createHash('sha256').update(fallback).digest('hex'),exact_declarations:names,adapters:['public AUI message state supplied by React context','session id, approval=null and locale=en are fixture inputs','ordinary read_file calls only: connector/theme classifiers inactive','aggregate caption and entry disclosure IDs supplied as fixture metadata, not native summary-calculation coverage','native TimelineTimestamp replaced by fixed label; per-tool rows use actual ScaffoldRow and DisclosureRow']}
export async function nativeRunBundle(){
 const built=await require('esbuild').build({stdin:{resolveDir:core,loader:'tsx',contents:`
import React,{Children,createContext,Fragment,useContext,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {atom,computed} from 'nanostores';import {useStore} from '@nanostores/react';
import {motion,useReducedMotion} from 'motion/react';
import {ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS} from './apps/desktop/src/components/chat/scaffold-row';
import {DisclosureRow} from './apps/desktop/src/components/chat/disclosure-row';
import {ToolIcon} from './apps/desktop/src/components/ui/tool-icon';
import {GlyphSpinner} from './apps/desktop/src/components/ui/glyph-spinner';
import {FadeText} from './apps/desktop/src/components/ui/fade-text';
import {ToolRunTicker} from './apps/desktop/src/components/assistant-ui/tool/run-ticker';
import {isCardTool,CONNECTION_CARD_KEY} from './apps/desktop/src/lib/tool-render-class';
import {isApprovalActivity,isCurrentTurnMessage} from './apps/desktop/src/components/assistant-ui/tool/approval-activity';
import {useEnterAnimation} from './apps/desktop/src/lib/use-enter-animation';
import {cn} from './apps/desktop/src/lib/utils';
const selectMessageRunning=state=>state.thread.isRunning&&state.message.status?.type==='running';
const toolEntryDisclosureId=(id,part)=>id+':'+part.toolCallId;
const isToolCallPart=part=>part.type==='tool-call';
const summarizeToolRun=(tools,live)=>(live?'Reading ':'Read ')+tools.length+' files';
const connectorCalls=()=>[];const mcpTargets=()=>[];const SET_THEME_TOOL='set_theme';const setThemeCall=()=>null;
const State=createContext(null);const useAuiState=f=>f(useContext(State));
const useI18n=()=>({locale:'en'});const runtimeId=atom('fixture-session');const approval=atom(null);
const useSessionView=()=>({$runtimeId:runtimeId});const sessionApprovalRequest=()=>approval;
const opens=new Map();const $toolDisclosureOpen=id=>{if(!opens.has(id))opens.set(id,atom(undefined));return opens.get(id)};
const $anyToolDisclosureOpen=ids=>computed(ids.map($toolDisclosureOpen),(...values)=>values.some(Boolean));
const setToolDisclosureOpen=(id,value)=>$toolDisclosureOpen(id).set(value);
const $showToolActivity=atom(true);const ToolEmbedContext=createContext(false);const ToolRunDisclosureContext=createContext(null);
const TimelineTimestamp=()=> <span data-slot='timeline-timestamp'>00:01</span>;
${declarations}
function Row({part}){const[open,setOpen]=useState(false);return <div id={part.toolCallId} data-slot='tool-block' data-tool-row='' data-conversation-scaffold=''><DisclosureRow open={open} onToggle={()=>{window.nativeClicks++;setOpen(!open)}} trailing={<span data-native-timer=''>1s</span>}><span className='flex items-center gap-1.5'><span className={SCAFFOLD_GLYPH_CLASS}>{part.result===undefined?<GlyphSpinner size={10}/>:<ToolIcon name='terminal'/>}</span><span className={SCAFFOLD_LABEL_CLASS}>{part.result===undefined?'Running '+part.toolCallId:'Finished '+part.toolCallId}</span></span></DisclosureRow>{open&&<pre data-native-result=''>Exact native result</pre>}</div>}
function Fixture(){const[c,set]=useState(window.config);window.change=fn=>flushSync(()=>set(old=>fn(structuredClone(old))));const messages=c.roots.map(r=>({id:r.id,role:'assistant',status:{type:r.live?'running':'complete'},parts:r.parts}));return <section data-session-anchor='stream-probe'><div id='pair' data-slot='aui_turn-pair'><div data-role='user' data-message-id='u'>Question</div>{c.roots.map((r,i)=><State.Provider key={r.id} value={{message:messages[i],thread:{messages,isRunning:c.live}}}><div id={r.id} data-role='assistant' data-message-id={r.id} data-slot='aui_assistant-message-root' data-streaming={r.live?'true':undefined}><div data-slot='aui_assistant-message-content'><ToolGroupSlot startIndex={0} endIndex={r.parts.length-1}>{r.parts.map(p=><Row key={p.toolCallId} part={p}/>)}</ToolGroupSlot>{r.prose!==undefined&&<div className='aui-md'>{r.prose}</div>}</div></div></State.Provider>)}</div></section>}
window.nativeClicks=0;window.nativeRoot=createRoot(document.getElementById('fixture'));flushSync(()=>nativeRoot.render(<Fixture/>));
`},bundle:true,write:false,format:'iife',jsx:'automatic',outdir:'native-run-stream',tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},define:{'process.env.NODE_ENV':'"production"'}})
 return built.outputFiles.find(f=>f.path.endsWith('.js')).text
}
export function installSequence(source){return `const TURN_ACTION_SELECTOR='[data-slot="tool-approval-inline"],[data-slot="clarify-inline"]';const TURN_FAILURE_SELECTOR='.text-destructive';${source};window.scope='s';window.gen=0;window.runtime=createToolSequenceRuntime(()=>scope,()=>gen);window.pair=document.getElementById('pair');window.sync=()=>runtime.reconcile(pair,scope);sync();`}
export const tool=(id,done=false)=>({type:'tool-call',toolCallId:id,toolName:'read_file',args:{path:id},...(done?{result:'done'}:{})})
