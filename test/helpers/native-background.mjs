import { referenceRoot } from './reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import {createHash} from 'node:crypto'

const core = referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require = createRequire(`${core}/package.json`)
const ts = require('typescript')
const nativePath = `${core}/apps/desktop/src/components/assistant-ui/thread/system-message.tsx`
const source = await readFile(nativePath, 'utf8')
const ast = ts.createSourceFile(nativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const declarations = ast.statements.filter(ts.isVariableStatement).flatMap(s => s.declarationList.declarations)
function nativeDeclaration(name) {
  const declaration = declarations.find(d => d.name.getText(ast) === name)
  assert.ok(declaration, `Missing native declaration ${name}`)
  return `const ${declaration.getText(ast)};`
}

// Use the unchanged native component, its real React useState/onClick path,
// native ScaffoldRow, DisclosureRow, DisclosureCaret, cn and ToolIcon.
// The full Desktop markdown graph cannot resolve in this host (assistant-ui,
// streamdown and shiki are not installed). Only report rendering and message
// context are adapters: real React paragraphs/code and a deterministic stamp.
// Neither adapter implements/replaces disclosure, report mounting or collapse.
export async function nativeBackgroundBundle() {
  const result = await require('esbuild').build({
    stdin: {resolveDir:core, loader:'tsx', contents:`
      import React,{useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {cn} from './apps/desktop/src/lib/utils';
      import {ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS} from './apps/desktop/src/components/chat/scaffold-row';
      import {ToolIcon} from './apps/desktop/src/components/ui/tool-icon';
      import {Codicon} from './apps/desktop/src/components/ui/codicon';
      const h=React.createElement;
      const MessagePrimitive={Root:'div'};
      let message={text:'',metadata:{custom:{}}};
      const useAuiState=fn=>fn({message:{...message,content:message.text}});
      const messageContentText=text=>text;
      function MessageTimelineTimestamp(){return h('span',{'data-slot':'timeline-timestamp',className:'text-[0.625rem] leading-4 tabular-nums text-(--conversation-scaffold-meta)'},h('time',null,'12:14'))}
      function MarkdownTextContent({text}){return h('div',{className:'aui-md','data-report-adapter':''},h('p',null,text),h('pre',null,h('code',null,'const exactReport = true;')))}
      function LogView({children,className}){return h('pre',{className},children)}
      function LinkifiedText({children,text,className}){return h('span',{className},text||children)}
      ${['SLASH_STATUS_RE','STEER_NOTE_RE','REVIEW_NOTE_RE','USAGE_WINDOW_GAUGE_RE','BackgroundResult','SystemMessage'].map(nativeDeclaration).join('\n')}
      function Notice({id,text,report='',process=false}){return h('div',{id,'data-role':'system','data-slot':'aui_system-message-root',className:'w-full min-w-0 self-start'},h(BackgroundResult,{text,report,process}))}
      function SystemControl({id,text}){message={text,metadata:{custom:{}}};return h('div',{id},h(SystemMessage))}
      function Fixture(){return h('main',{id:'pane','data-slot':'aui_thread-content'},
        h('p',{id:'before'},'Assistant text before completion'),
        h(Notice,{id:'short',text:'Subagent Task Completed: Review',report:'Independent review passed.'}),
        h(Notice,{id:'long',text:'Subagent Tasks Completed: '+ 'Independent review of the combined artifact, native typography and disclosure preservation. '.repeat(6),report:'Long native report.'}),
        h(Notice,{id:'empty',text:'Subagent Task Completed: No report'}),
        h(Notice,{id:'process',text:'Background Process Completed: verification',report:'command output',process:true}),
        h('p',{id:'after'},'Assistant text after completion'),
        h('section',{id:'controls'},h(SystemControl,{id:'generic',text:'Connection restored'}),h(SystemControl,{id:'steer',text:'steer:Keep going'}),h(SystemControl,{id:'slash',text:'slash:/model\\nSelected model'}),
        h('div',{role:'alert',className:'text-destructive'},'Native error'),h('div',{'data-slot':'tool-approval-inline'},h('button',{id:'approval',onClick:()=>window.approved++},'Approve'))))}
      window.approved=0;window.errors=[];window.addEventListener('error',e=>window.errors.push(e.message));
      createRoot(document.getElementById('fixture')).render(h(Fixture));
    `},
    bundle:true, format:'iife',write:false,jsx:'automatic',outdir:'native-background-fixture',
    tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},
    define:{'process.env.NODE_ENV':'"production"'}
  })
  return result.outputFiles.find(f=>f.path.endsWith('.js')).text
}

// Evaluate just the exact shipping stylesheet constant dependency closure.
// No fake JSX globals, rewritten runtime or silent missing CSS exports.
export async function shippingCSS(file = process.env.CODEX_INBOX_TEST_BUNDLE || new URL('../../codex-chat-look/plugin.js',import.meta.url)) {
  const text=await readFile(file,'utf8')
  const tree=ts.createSourceFile('plugin.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const constants=new Map(tree.statements.filter(ts.isVariableStatement).flatMap(s=>s.declarationList.declarations).map(d=>[d.name.getText(tree),d.initializer]))
  const names=['CSS','BROWSER_PALETTE_CSS','UPDATE_CSS','T3_SUBAGENT_CSS'],done=new Set(),chunks=[]
  function add(name){
    if(done.has(name))return
    const node=constants.get(name);assert.ok(node,`Missing shipping CSS constant ${name}`)
    done.add(name)
    function dependencies(n){if(ts.isIdentifier(n)&&constants.has(n.text))add(n.text);ts.forEachChild(n,dependencies)}
    dependencies(node);chunks.push(`const ${name}=${node.getText(tree)};`)
  }
  names.forEach(add)
  return vm.runInNewContext(chunks.join('\n')+'\n'+names.join('+'))
}
export const nativeProvenance={path:nativePath,sha256:createHash('sha256').update(source).digest('hex'),disclosure:'actual native imports; report markdown/message context adapters only'}
