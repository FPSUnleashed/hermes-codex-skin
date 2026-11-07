import { referenceRoot } from './reference-paths.mjs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const nativeRoot = referenceRoot()
const require = createRequire(nativeRoot + '/package.json')
const ts = require('typescript')
const paths = {
  section: 'apps/desktop/src/app/chat/sidebar/sessions-section.tsx',
  group: 'apps/desktop/src/components/ui/sidebar.tsx',
  label: 'apps/desktop/src/app/shell/sidebar-label.tsx',
  caret: 'apps/desktop/src/components/ui/disclosure-caret.tsx',
  codicon: 'apps/desktop/src/components/ui/codicon.tsx'
}

// Execute native section/header/conditional-body code, not a hand-recreated
// disclosure. Only data/grouping and the session row dependency are synthetic.
export async function nativeSectionsScript() {
  const parts = []
  for (const [kind, path] of Object.entries(paths)) {
    const text = await readFile(nativeRoot + '/' + path, 'utf8')
    const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    parts.push(ast.statements.filter(node => !ts.isImportDeclaration(node) && (kind !== 'group' || (ts.isFunctionDeclaration(node) && ['SidebarGroup', 'SidebarGroupContent'].includes(node.name?.text)))).map(node => node.getText(ast)).join('\n'))
  }
  const contents = `
    import React,{useCallback,useEffect,useMemo,useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {cn} from '${nativeRoot}/apps/desktop/src/lib/utils.ts';
    const $sidebarShowAllSessions=false,$sessionDotStateById={},$sidebarWorkspaceNodeOpen={};
    const useStore=value=>value,useI18n=()=>({t:{sidebar:{dateDivider:{},statusDivider:{},projects:{toggle:()=>''}}}});
    const flattenSessionsWithBranches=rows=>rows.map(session=>({session}));
    const toSessionRows=rows=>rows.map(entry=>({kind:'session',entry}));
    const hideCollapsedGroupRows=rows=>rows,reorderableRowIds=rows=>rows.filter(r=>r.kind==='session').map(r=>r.entry.session.id);
    const useSortableBindings=()=>({});
    const SidebarSessionRow=props=>React.createElement('button',{type:'button',onClick:props.onResume},props.session.title);
    ${parts.join('\n')}
    window.nativeMount=target=>{
      const tree=createRoot(target);
      function App(){
        const[pins,setPins]=useState(true),[recents,setRecents]=useState(false);
        window.nativeStates={pins,recents};
        const common={activeSessionId:null,sessions:[{id:'native-1',title:'Native session'}],onResumeSession:()=>window.nativeOpens++,onDeleteSession:()=>{throw Error('delete forbidden')},onArchiveSession:()=>{throw Error('archive forbidden')},onTogglePin:()=>{throw Error('pin mutation forbidden')},onToggleUnread:()=>{},emptyState:React.createElement('div',null,'Native empty')};
        return React.createElement('div',{'data-sessions-mode':'flat',className:'flex min-h-0 flex-1 flex-col',style:{height:420}},
          React.createElement(SidebarSessionsSection,{...common,label:'Épinglé',open:pins,onToggle:()=>setPins(!pins),pinned:true,rootClassName:'shrink-0 p-0 pb-1',contentClassName:'flex flex-col gap-px'}),
          React.createElement(SidebarSessionsSection,{...common,label:'Sitzungen',open:recents,onToggle:()=>setRecents(!recents),pinned:false,rootClassName:'min-h-32 flex-1 overflow-hidden p-0',contentClassName:'flex min-h-0 flex-1 flex-col gap-px overflow-y-auto'}));
      }
      tree.render(React.createElement(App));return()=>tree.unmount();
    };
  `
  return (await require('esbuild').build({stdin:{contents,loader:'tsx',resolveDir:nativeRoot},bundle:true,format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
}
