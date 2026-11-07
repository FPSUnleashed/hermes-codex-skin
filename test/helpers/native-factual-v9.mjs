import { referenceRoot } from './reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
const core = referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require = createRequire(`${core}/package.json`)
const ts = require('typescript')
const fallback = await readFile(`${core}/apps/desktop/src/components/assistant-ui/tool/fallback.tsx`, 'utf8')
const ast = ts.createSourceFile('fallback.tsx', fallback, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const header = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'ToolRunHeader')
assert.equal(header.length, 1)
export const provenance = {fallback_sha256: createHash('sha256').update(fallback).digest('hex'), adapters: ['TimelineTimestamp renders a fixed native-shaped timer; no clock store', 'Fixture tool rows use real DisclosureRow and ToolIcon', 'Native ToolRunHeader, FadeText, ScaffoldRow and handlers unmodified', 'Fixture captions are explicit public input, not hidden tool results']}
export async function nativeFactualBundle() {
  const result = await require('esbuild').build({stdin: {resolveDir: core, loader: 'tsx', contents: `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS} from './apps/desktop/src/components/chat/scaffold-row';
import {DisclosureRow} from './apps/desktop/src/components/chat/disclosure-row';
import {ToolIcon} from './apps/desktop/src/components/ui/tool-icon';
import {FadeText} from './apps/desktop/src/components/ui/fade-text';
import {cn} from './apps/desktop/src/lib/utils';
const h=React.createElement;
const TimelineTimestamp=()=>h('span',{'data-slot':'timeline-timestamp'},'23:59');
${header[0].getText(ast)}
function Tool({id,label}) { const [open,setOpen]=useState(false);return h('div',{id,'data-slot':'tool-block','data-tool-row':'','data-conversation-scaffold':''},h(DisclosureRow,{open,onToggle:()=>{window.nativeClicks++;setOpen(!open)}},h('span',{className:'flex items-center gap-1.5'},h('span',{className:SCAFFOLD_GLYPH_CLASS},h(ToolIcon,{name:'terminal'})),h('span',{className:SCAFFOLD_LABEL_CLASS},label))),open?h('pre',null,'PRIVATE OUTPUT'):null) }
function Fixture() {const [c,set]=useState(window.config);const [open,setOpen]=useState(false);window.change=patch=>flushSync(()=>set(old=>({...old,...patch})));return h('section',{'data-session-anchor':'native-v9'},h('div',{'data-slot':'aui_turn-pair'},h('div',{'data-role':'user','data-message-id':'u'},'Question'),h('div',{'data-role':'assistant','data-message-id':'a','data-slot':'aui_assistant-message-root','data-streaming':c.live?'true':undefined},h('div',{'data-slot':'aui_assistant-message-content'},h('div',{id:'g','data-slot':'tool-block','data-tool-group':''},h(ToolRunHeader,{live:c.live,open,onToggle:()=>{window.nativeClicks++;setOpen(!open)},summary:c.summary}),open?h('div',null,h(Tool,{id:'nested',label:'Nested native caption'})):null),h(Tool,{id:'t',label:c.tool})))))}
window.flushNative=callback=>flushSync(callback);
window.nativeClicks=0; window.nativeRoot=createRoot(document.getElementById('fixture'));flushSync(()=>window.nativeRoot.render(h(Fixture)));
`}, bundle: true, write: false, format: 'iife', jsx: 'automatic', outdir: 'native-factual-v9', tsconfigRaw: {compilerOptions: {baseUrl: core, paths: {'@/*':['apps/desktop/src/*']}}}, define: {'process.env.NODE_ENV':'"production"'}})
  return result.outputFiles.find(f => f.path.endsWith('.js')).text
}
export async function sequenceSource() {
  return (await readFile(new URL('../../src/tool-sequence-glyphs.js', import.meta.url), 'utf8')) + '\n' + (await readFile(new URL('../../src/tool-sequences.js', import.meta.url), 'utf8'))
}
export const installSequence = source => `const TURN_ACTION_SELECTOR='[data-slot="tool-approval-inline"],[data-slot="clarify-inline"]';const TURN_FAILURE_SELECTOR='.text-destructive';${source};window.scope='s';window.gen=0;window.runtime=createToolSequenceRuntime(()=>window.scope,()=>window.gen);window.pair=document.querySelector('[data-slot="aui_turn-pair"]');window.sync=()=>runtime.reconcile(pair,scope);window.header=()=>pair.querySelector('[data-codex-tool-sequence] button');sync();`
