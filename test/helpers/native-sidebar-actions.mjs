import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { referenceFile } from './reference-paths.mjs'

// Extract the original native nav producer, including its real click/drag/split
// callbacks. Only application state and navigation sinks are fixture inputs.
export async function nativeSidebarActions(root) {
  const require = createRequire(`${root}/package.json`)
  const ts = require('typescript'), { build } = require('esbuild')
  const path = `${root}/apps/desktop/src/app/chat/sidebar/index.tsx`
  const source = await readFile(path, 'utf8')
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let group, search
  const walk = node => {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(file)
      if (tag === 'SidebarGroup' && node.getText(file).includes('sidebar-nav-${item.id}')) group = node.getText(file)
      if (tag === 'div' && node.children.some(child => ts.isJsxSelfClosingElement(child) && child.tagName.getText(file) === 'SearchField')) search = node.getText(file)
    }
    ts.forEachChild(node, walk)
  }
  walk(file)
  assert.ok(group && search, 'exact native nav/SearchField producers exist')
  const fixture = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {Sidebar,SidebarProvider,SidebarContent,SidebarGroup,SidebarGroupContent,SidebarMenu,SidebarMenuItem,SidebarMenuButton} from '@/components/ui/sidebar';
import {SearchField} from '@/components/ui/search-field';
import {KbdGroup} from '@/components/ui/kbd';
import {TipKeybindLabel} from '@/components/ui/tooltip';
import {ContextMenu,ContextMenuContent,ContextMenuTrigger,ContextMenuItem} from '@/components/ui/context-menu';
import {codiconIcon} from '@/components/ui/codicon'; import {cn} from '@/lib/utils';
window.nativeActions=[];window.newChatOverride='foreign-inbox';
function NativeSidebar({owner,showSearch=true}) {
 const [searchQuery,setQuery]=React.useState('');const searchInputRef=React.useRef(null);
 const setSearchQuery=value=>{setQuery(value);nativeActions.push(['search',owner,value])};
 const navItems=[{id:'new-session',action:'new',keybindActionId:'new-session',icon:codiconIcon('add'),label:'New session'}];
 const currentView='chat',pathname='/chat',s={nav:{'new-session':'New session'},row:{openInSplit:'Open in split'},searchAria:'Search sessions',searchPlaceholder:'Search sessions'};
 const $newChatProfile={set:value=>{window.newChatOverride=value}};
 const recordAction=(...args)=>nativeActions.push(['metric',...args]);
 const onNavigate=item=>nativeActions.push(['navigate',owner,item.id]);
 const startNewSessionDrag=(callback,event)=>{nativeActions.push(['pointer',owner]);window.nativeDrag=callback};
 const onNewSessionSplit=(dir,options)=>nativeActions.push(['split',owner,dir,options??null]);
 const newSessionKbd=['⌘','N'],newSessionKbdFlash=false,CONTEXT_SPLIT_KIT={};
 const openRouteTile=()=>{throw new Error('unexpected route')};
 const SplitSubmenu=({onSplit,label})=><ContextMenuItem onSelect={()=>onSplit('right')}>{label}</ContextMenuItem>;
 return <Sidebar collapsible="none" className="relative h-full min-w-0 overflow-hidden" data-tour="sessions-sidebar" style={{width:260}}><SidebarContent className="gap-0 overflow-hidden bg-transparent px-2.5">${group}{showSearch&&<>${search}<div data-sessions-mode="flat"><div data-codex-inbox-owned="island">FOREIGN Inbox</div><p>Real conversation title</p></div></>}</SidebarContent></Sidebar>;
}
const root=createRoot(document.getElementById('mount'));
window.renderNative=(owner='A',showSearch=true)=>root.render(<SidebarProvider defaultOpen><NativeSidebar owner={owner} showSearch={showSearch}/></SidebarProvider>);
renderNative();`
  const i18n = `export const useI18n=()=>({t:{ui:{search:{clear:'Clear search'}},keybinds:{actions:{}},sidebar:{toggle:'Toggle sidebar'}}});`
  const tabler = referenceFile('SIDEBAR_TABLER_ENTRY')
  const result = await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'native-sidebar-actions.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',nodePaths:[`${root}/node_modules`],alias:{'@':`${root}/apps/desktop/src`,'@tabler/icons-react':tabler},plugins:[{name:'native-environment-seams',setup(b){
    b.onResolve({filter:/^@\/i18n$/},()=>({path:'i18n',namespace:'fixture'}))
    b.onResolve({filter:/^@\/lib\/keybinds\/use-keybind-hint$/},()=>({path:'keybind',namespace:'fixture'}))
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='i18n'?i18n:`export const useKeybindHint=()=> '⌘N';`,loader:'js'}))
    b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'empty'}))
  }}]})
  const dependencies = ['app/chat/sidebar/index.tsx','components/ui/sidebar.tsx','components/ui/search-field.tsx','components/ui/button.tsx','components/ui/context-menu.tsx','components/ui/tooltip.tsx','components/ui/kbd.tsx']
  const provenance = await Promise.all(dependencies.map(async relative=>({path:`apps/desktop/src/${relative}`,sha256:createHash('sha256').update(await readFile(`${root}/apps/desktop/src/${relative}`)).digest('hex')})))
  return {bundle:result.outputFiles.find(f=>!f.path.endsWith('.css')).text,provenance,boundary:'Original native JSX producer, SearchField, sidebar primitives, Button, ContextMenu, Tooltip and Kbd. Only i18n/keybind lookup, application state, metrics and navigation/drag endpoints are fixture inputs. Not Electron or a gateway session-create smoke.'}
}
