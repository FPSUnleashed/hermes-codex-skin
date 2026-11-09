import { referenceRoot } from './reference-paths.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

// Extract real producers without changing their JSX, lifecycle, clocks or pulse.
// Only application state, translated copy and action sinks are isolated.
export const core = referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require = createRequire(`${core}/package.json`)
const ts = require('typescript')
const source = await readFile(`${core}/apps/desktop/src/components/assistant-ui/thread/status.tsx`, 'utf8')
const ast = ts.createSourceFile('status.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['StatusRow', 'COMPACTION_LABEL', 'HintText', 'WaitHint', 'ProgressHint', 'DRAFTING_REVEAL_MS', 'useStatusHint', 'ResponseLoadingIndicator', 'useHandBackQuiet', 'TurnActivityRow', 'TurnActivityIndicator']
const declarations = names.map(name => {
  const matches = ast.statements.filter(n => n.name?.getText(ast) === name || (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === name)))
  assert.equal(matches.length, 1, `native declaration ${name}`)
  return matches[0].getText(ast).replace(/^export /, '')
}).join('\n')
const controls = await readFile(`${core}/apps/desktop/src/app/chat/composer/controls.tsx`, 'utf8')
const controlAST = ts.createSourceFile('controls.tsx', controls, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const stops = []
function visit(n) {
  if (ts.isJsxElement(n) && n.openingElement.tagName.getText(controlAST) === 'Button' && n.openingElement.attributes.getText(controlAST).includes('aria-label={showStop ? c.stop : sendLabel}')) stops.push(n.getText(controlAST))
  ts.forEachChild(n, visit)
}
visit(controlAST)
assert.equal(stops.length, 1, 'actual native Stop button branch')
const turnSource = await readFile(`${core}/apps/desktop/src/components/assistant-ui/thread/turn-activity.ts`, 'utf8')
const toolParts = await readFile(`${core}/apps/desktop/src/lib/chat-messages/tool-parts.ts`, 'utf8')
const questionTools = toolParts.match(/export const QUESTION_CARD_TOOLS = [^\n]+/)[0].replace(/^export /, '')
const turnDeclarations = turnSource.replace(/^import .*$/gm, '').replace(/^export /gm, '')
export const producerSources = { source, controls, declarations, stop: stops[0], turnSource, questionTools }
const { outputFiles } = await require('esbuild').build({
  stdin: { resolveDir: core, loader: 'tsx', contents: `
    import React,{useEffect,useState,useSyncExternalStore} from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {cn} from './apps/desktop/src/lib/utils';
    import {StatusPulse} from './apps/desktop/src/components/ui/status-pulse';
    import {ActivityTimerText} from './apps/desktop/src/components/chat/activity-timer-text';
    import {useElapsedSeconds} from './apps/desktop/src/components/chat/activity-timer';
    import {SCAFFOLD_LABEL_CLASS} from './apps/desktop/src/components/chat/scaffold-row';
    import {isSilentTool} from './apps/desktop/src/lib/tool-render-class';
    ${questionTools}
    ${turnDeclarations}
    import {Button} from './apps/desktop/src/components/ui/button';
    import {parseModelLoadWait} from './apps/desktop/src/store/provider-wait';
    const listeners=new Set();
    let state={busy:true,awaitingInput:false,compacting:false,drafting:null,providerWait:'',turnStartedAt:Date.now()-16000,localLoad:null,showReasoning:true,content:[],status:{type:'running'},mode:'loading',thinking:false};
    const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
    const useSnapshot=()=>useSyncExternalStore(subscribe,()=>state);
    const useThreadSessionStatus=()=>useSnapshot();
    const useLocalModelLoad=active=>{const s=useSnapshot();return active?s.localLoad:null};
    const $showReasoning={};
    const useStore=()=>useSnapshot().showReasoning;
    const useAuiState=selector=>{const s=useSnapshot();return selector({message:{content:s.content,status:s.status}})};
    const useI18n=()=>({t:{assistant:{thread:{loadingResponse:'Loading response',loadingLocalModel:model=>'Loading '+model,processingPrompt:'Processing prompt'}}}});
    const toolPresentVerb=name=>name==='read_file'?'Reading file':'Drafting '+name;
    ${declarations}
    const showStop=true,c={stop:'Stop'},sendLabel='Send',PRIMARY_ICON_BTN='rounded-full bg-primary text-primary-foreground',disabled=false,canSubmit=true;
    const recordAction=action=>window.stopActions.push(action),keepEditorFocus=event=>event.preventDefault();
    function NativeStop(){return (${stops[0]})}
    function Fixture(){const s=useSnapshot();return <>
      <main id='pane' data-slot='aui_thread-content'><div data-slot='aui_assistant-message-root'><div data-slot='aui_assistant-message-content'>
        {s.mode==='loading'?<ResponseLoadingIndicator/>:s.mode==='turn'?<TurnActivityIndicator thinking={s.thinking}/>:null}
      </div></div></main>
      <div id='unrelated'><StatusPulse className='dither size-3 inline-block' aria-hidden='true' kind='opacity'/></div>
      <form data-slot='aui_composer-root' onSubmit={e=>{e.preventDefault();window.stopSubmits++}}><NativeStop/></form>
    </>}
    window.stopActions=[];window.stopSubmits=0;window.fixtureErrors=[];window.addEventListener('error',e=>window.fixtureErrors.push(e.message));
    window.updateBusy=patch=>flushSync(()=>{state={...state,...patch};listeners.forEach(fn=>fn())});
    const root=createRoot(document.getElementById('fixture'));flushSync(()=>root.render(<Fixture/>));
    window.unmountBusy=()=>flushSync(()=>root.unmount());
  ` }, bundle: true, format: 'iife', write: false, jsx: 'automatic', outdir: 'native-busy-fixture',
  plugins: [{ name: 'unused-button-loader-import', setup(build) {
    // Keep the real Button producer; only its unmounted loading glyph import
    // avoids the host-wide icon barrel (the Stop branch is a native span).
    build.onLoad({filter: /components\/ui\/button\.tsx$/}, async args => ({
      contents: (await readFile(args.path, 'utf8')).replace("import { Loader2 } from '@/lib/icons'", "import { LoaderCircle as Loader2 } from 'lucide-react'"), loader: 'tsx'
    }))
  } }],
  tsconfigRaw: { compilerOptions: { baseUrl: core, paths: { '@/*': ['apps/desktop/src/*'] } } },
  define: { 'process.env.NODE_ENV': '"production"' }
})
export const fixtureJS = outputFiles.find(f => f.path.endsWith('.js')).text
export const fixtureCSS = outputFiles.filter(f => f.path.endsWith('.css')).map(f => f.text).join('\n')
