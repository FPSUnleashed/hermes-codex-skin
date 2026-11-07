import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createServer } from 'node:http'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'
import { nativeSidebarActions } from './helpers/native-sidebar-actions.mjs'

const nativeRoot = referenceRoot('SIDEBAR_NATIVE_ROOT', 'HERMES_DESKTOP_SOURCE_ROOT')
const requireNative = createRequire(`${nativeRoot}/package.json`)
const { build } = requireNative('esbuild')
const nativeCSS = await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
// The exact installed sidebar-nav-new-session branch / SearchField DOM, mounted
// with React so attribute updates, clear buttons and owner remounts are real.
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';
const h=React.createElement;window.actions=[];window.owner='A';window.active='thread-A';
function NativeSidebar({id}){const[q,Q]=React.useState('');return h('aside',{'data-slot':'sidebar','data-tour':'sessions-sidebar',className:'relative h-full min-w-0 overflow-hidden',style:{width:260}},h('div',{'data-slot':'sidebar-content',className:'gap-0 overflow-hidden bg-transparent px-2.5 flex flex-col'},
h('div',{'data-slot':'sidebar-group',className:'relative flex w-full min-w-0 flex-col shrink-0 p-0 pb-2 pt-[calc(var(--titlebar-height)+0.375rem)]'},h('div',{'data-slot':'sidebar-group-content'},h('ul',{'data-slot':'sidebar-menu',className:'flex w-full min-w-0 flex-col gap-px'},h('li',{'data-slot':'sidebar-menu-item',className:'group/menu-item relative'},h('button',{type:'button','data-slot':'sidebar-menu-button',className:'flex h-7 w-full justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium',onClick:()=>window.actions.push(['new',id]),onPointerDown:()=>window.actions.push(['pointer',id]),onContextMenu:e=>{e.preventDefault();window.actions.push(['context',id])}},h('svg',{'data-native-icon':'',width:16,height:16}),h('span',{'data-tour':'sidebar-nav-new-session',className:'min-w-0 truncate'},'New session'),h('span',{'data-slot':'kbd-group',className:'ml-auto opacity-55'},'⌘N')))))),
h('div',{className:'shrink-0 px-2 pb-1 pt-1'},h('div',{className:'inline-flex min-w-0 max-w-full items-center gap-1.5 border-b border-transparent px-0.5 opacity-30 focus-within:opacity-100'},h('svg',{width:14,height:14,'data-native-search':''}),h('input',{'aria-label':'Search sessions',className:'h-7 min-w-0 max-w-full flex-1 bg-transparent text-xs text-foreground',placeholder:'Search sessions',type:'text',value:q,onChange:e=>{Q(e.target.value);window.actions.push(['search',id,e.target.value])}}),q?h('button',{'aria-label':'Clear search',onClick:()=>Q('')},'×'):null)),h('div',{'data-sessions-mode':'flat'},h('div',{'data-codex-inbox-owned':'island'},'Inbox owner FOREIGN'),h('p',{},'Sessions'))));}
const root=createRoot(document.getElementById('mount'));window.clearNative=()=>root.render(null);window.render=(owner='A',second=false)=>{window.owner=owner;root.render(h(React.Fragment,{},h(NativeSidebar,{key:'primary',id:owner}),second?h(NativeSidebar,{key:'split',id:'split'}):null))};window.render();`
const bundle = (await build({stdin:{contents:fixture,resolveDir:nativeRoot,sourcefile:'native-sidebar.jsx'},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text
const wait = b => b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
async function mount(b) {
  const { CSS, T3_SIDEBAR_ACTIONS_CSS, installT3SidebarActions } = await loadPluginInternals(['CSS','T3_SIDEBAR_ACTIONS_CSS','installT3SidebarActions'])
  const {frameTree}=await b.call('Page.getFrameTree')
  await b.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html data-codex-chat-look="true"><head><style>${nativeCSS}\n:root{--titlebar-height:48px;--codex-sidebar-muted:#71717b;--codex-sidebar-hover:#f4f4f5;--codex-color-text:#27272a;--ui-sidebar-surface-background:#fafafa;--dt-font-sans:Arial;--font-sans:Arial}body{margin:0}#mount{display:flex}aside{height:450px}${CSS}\n${T3_SIDEBAR_ACTIONS_CSS||''}</style></head><body><h1 id="title">New session</h1><input id="unrelated" placeholder="Search sessions"><div id="mount"></div></body></html>`})
  await b.evaluate(bundle);await wait(b)
  await b.evaluate(`window.nativeBefore=document.querySelector('[data-tour=sessions-sidebar]').innerHTML`)
  await b.evaluate(`window.install=${installT3SidebarActions?.toString() || '()=>()=>{}'};window.stop=install()`);await wait(b)
}
async function pointer(b,selector,type='mouse'){
 const r=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{x:r.x+r.width/2,y:r.y+r.height/2,hit:e===hit||e.contains(hit)}})()`);assert.equal(r.hit,true,selector+' hit target')
 await b.call('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1})
}
async function line(b){return b.evaluate(`(()=>{const s=document.querySelector('[data-tour=sessions-sidebar]'),n=s.querySelector('[data-tour=sidebar-nav-new-session]').closest('button'),input=s.querySelector('input'),rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right}},range=document.createRange();range.selectNodeContents(n.querySelector('[data-tour]'));return{n:rect(n),search:rect(input.parentElement),placeholder:input.placeholder,labelRects:[...range.getClientRects()].map(r=>({w:r.width,h:r.height})),accessible:n.textContent,pseudo:getComputedStyle(n,'::before').maskImage,unrelated:document.getElementById('unrelated').placeholder,title:document.getElementById('title').textContent}})()`)}

test('T3 Search line uses native square-pen target; real pointer, keyboard, search and selected owner survive routing',async()=>{
 const b=await chromium();try{await mount(b);const r=await line(b)
 assert.equal(r.placeholder,'Search');assert.equal(r.n.w,28);assert.equal(r.n.h,28);assert.ok(Math.abs(r.n.y+r.n.h/2-r.search.y-r.search.h/2)<1);assert.equal(r.search.h,32);assert.equal(r.n.x-r.search.right,4);assert.match(r.pseudo,/M12|M12%20/);assert.match(r.accessible,/New session/);assert.match(r.accessible,/⌘N/);assert.equal(r.title,'New session');assert.equal(r.unrelated,'Search sessions')
 await pointer(b,'[data-codex-t3-new-session]')
 assert.deepEqual(await b.evaluate('actions'),[['pointer','A'],['new','A']])
 await pointer(b,'[data-tour="sessions-sidebar"] input');await b.call('Input.insertText',{text:'needle'});await wait(b)
 assert.deepEqual(await b.evaluate('actions.at(-1)'),['search','A','needle'])
 await pointer(b,'[aria-label="Clear search"]');await wait(b);assert.equal(await b.evaluate(`document.querySelector('[data-tour="sessions-sidebar"] input').value`),'')
 await b.evaluate(`window.retained=document.querySelector('[data-codex-t3-new-session]');render('B')`);await wait(b);await wait(b)
 assert.equal(await b.evaluate(`retained===document.querySelector('[data-codex-t3-new-session]')`),true)
 await pointer(b,'[data-codex-t3-new-session]');assert.deepEqual(await b.evaluate('actions.at(-1)'),['new','B'])
 await b.evaluate(`document.querySelector('[data-tour="sessions-sidebar"] input').focus()`)
 await b.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await b.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
 assert.equal(await b.evaluate(`document.activeElement===retained`),true)
 await b.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await b.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
 assert.deepEqual(await b.evaluate('actions.at(-1)'),['new','B'])
 assert.equal(await b.evaluate(`document.querySelector('[data-tour=sidebar-nav-new-session]').getBoundingClientRect().width`),1)
 assert.equal(await b.evaluate(`document.querySelector('[data-codex-t3-new-item]').getBoundingClientRect().height`),0)
 assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-t3-new-session]').length`),1)
 const ax=await b.call('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>n.role?.value==='button'&&/New session.*⌘N/.test(n.name?.value||'')))
 if(process.env.SIDEBAR_SCREENSHOT){const {data}=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(process.env.SIDEBAR_SCREENSHOT,Buffer.from(data,'base64'))}
 }finally{b.close()}
})

test('native controls restore exactly after late mounts, split/narrow/collapsed layout, hot reload and disable',async()=>{
 const b=await chromium();try{await mount(b);assert.equal((await line(b)).placeholder,'Search');await b.evaluate(`render('B',true)`);await wait(b);await wait(b)
 assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-t3-new-session]').length`),2)
 await b.evaluate(`document.querySelector('aside').style.width='160px'`);await wait(b);let r=await line(b);assert.equal(r.n.x-r.search.right,4)
 await b.evaluate(`document.querySelector('aside').style.display='none'`);await wait(b);await b.evaluate(`document.querySelector('aside').style.display=''`);await wait(b);r=await line(b);assert.equal(r.n.w,28)
 await b.evaluate(`stop();window.afterStop=document.querySelector('[data-tour=sessions-sidebar]').innerHTML;window.stop=install()`);await wait(b);assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-t3-new-session]').length`),2)
 await b.evaluate(`stop()`);assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-t3-new-session],[data-codex-t3-search-row],[data-codex-t3-search-field],[data-codex-t3-new-item]').length`),0)
 assert.equal((await line(b)).placeholder,'Search sessions');assert.equal(await b.evaluate(`document.querySelector('[data-tour=sessions-sidebar]').innerHTML===afterStop`),true)
 assert.equal(await b.evaluate(`document.querySelector('[data-tour=sessions-sidebar]').innerHTML===nativeBefore`),true,'exact native DOM restored, including original placeholder/attributes')
 }finally{b.close()}
})

test('extracted native JSX and real SearchField preserve current-profile handlers, hints, missing-owner fallback and scale',async t=>{
 const native=await nativeSidebarActions(nativeRoot)
 t.diagnostic(JSON.stringify({provenance:native.provenance,boundary:native.boundary}))
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body></body></html>')})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const b=await chromium();try{
  await b.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});await wait(b)
  await mount(b);await b.evaluate('stop();clearNative()');await wait(b)
  await b.evaluate(`window.nativeErrors=[];window.addEventListener('error',e=>nativeErrors.push(String(e.error?.stack||e.message)));console.error=(...args)=>nativeErrors.push(args.map(String).join(' '))`)
  await b.evaluate(native.bundle);await wait(b);await wait(b)
  assert.deepEqual(await b.evaluate('nativeErrors'),[],'original native components mount without renderer errors')
  await b.evaluate(`window.exactNativeBefore=document.querySelector('[data-tour=sessions-sidebar]').innerHTML;window.stop=install()`);await wait(b)
  assert.equal(await b.evaluate(`document.querySelector('[data-codex-t3-new-session]').dataset.sidebar`),'menu-button','native semantic marker survives Radix asChild')
  assert.notEqual(await b.evaluate(`document.querySelector('[data-codex-t3-new-session]').dataset.slot`),'sidebar-menu-button','test exercises the actual overwritten-slot branch')
  assert.equal((await line(b)).placeholder,'Search')
  await pointer(b,'[data-codex-t3-new-session]')
  assert.deepEqual(await b.evaluate('nativeActions'),[['pointer','A'],['metric','new-session','click'],['navigate','A','new-session']])
  assert.equal(await b.evaluate('newChatOverride'),null,'native click clears foreign Inbox override')
  await pointer(b,'[data-tour="sessions-sidebar"] input');await b.call('Input.insertText',{text:'needle'});await wait(b)
  assert.deepEqual(await b.evaluate('nativeActions.at(-1)'),['search','A','needle'])
  await pointer(b,'[aria-label="Clear search"]');await wait(b)
  assert.equal(await b.evaluate(`document.querySelector('[data-tour="sessions-sidebar"] input').value`),'')
  await b.evaluate(`window.retainedNative=document.querySelector('[data-codex-t3-new-session]');renderNative('B')`);await wait(b);await wait(b)
  assert.equal(await b.evaluate(`retainedNative===document.querySelector('[data-codex-t3-new-session]')`),true)
  await b.evaluate(`document.querySelector('[data-tour="sessions-sidebar"] input').focus()`)
  await b.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await b.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  assert.equal(await b.evaluate('document.activeElement===retainedNative'),true)
  await b.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await b.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  assert.deepEqual(await b.evaluate('nativeActions.at(-1)'),['navigate','B','new-session'])
  const ax=await b.call('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>n.role?.value==='button'&&/New session.*N/.test(n.name?.value||'')))
  await pointer(b,'[data-codex-t3-new-session]') // capture B's current native drag callback
  await b.evaluate(`newChatOverride='foreign-again';nativeDrag({dir:'left',anchor:'workspace',before:true})`)
  assert.equal(await b.evaluate('newChatOverride'),null)
  assert.deepEqual(await b.evaluate('nativeActions.at(-1)'),['split','B','left',{anchor:'workspace',before:true}])
  const contextRect=(await line(b)).n
  await b.call('Input.dispatchMouseEvent',{type:'mousePressed',x:contextRect.x+14,y:contextRect.y+14,button:'right',clickCount:1});await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:contextRect.x+14,y:contextRect.y+14,button:'right',clickCount:1});await wait(b)
  await pointer(b,'[role="menuitem"]');await wait(b)
  assert.deepEqual(await b.evaluate('nativeActions.at(-1)'),['split','B','right',null],'real native context menu still invokes current split handler')
  await b.evaluate(`renderNative('B',false)`);await wait(b);await wait(b)
  assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-t3-new-session]').length`),0,'missing Search owner restores native action')
  assert.ok(await b.evaluate(`retainedNative.getBoundingClientRect().width>100`),'fallback is visible, not icon-only')
  await pointer(b,'[data-sidebar="menu-button"]');assert.deepEqual(await b.evaluate('nativeActions.at(-1)'),['navigate','B','new-session'])
  await b.evaluate(`renderNative('A');window.nativeActions=[]`);await wait(b);await wait(b)
  for(const scale of [12,16,24,32]){
   await b.evaluate(`document.documentElement.style.fontSize='${scale}px'`);await wait(b);await wait(b)
   const r=await line(b);assert.equal(r.search.h,scale*2);assert.equal(r.n.w,scale*1.75);assert.ok(Math.abs(r.n.x-r.search.right-scale*.25)<.05);assert.ok(Math.abs(r.n.y+r.n.h/2-r.search.y-r.search.h/2)<.05)
  }
  await b.evaluate(`document.documentElement.style.fontSize='16px';stop()`);await wait(b)
  assert.equal(await b.evaluate(`document.querySelector('[data-tour=sessions-sidebar]').innerHTML===exactNativeBefore`),true,'exact native primitive DOM restored')
 }finally{b.close();await new Promise(r=>server.close(r))}
})

test('late native remount, root disable, native locale refresh, floating/mode variants and context action',async()=>{
 const b=await chromium();try{await mount(b)
 await b.evaluate(`clearNative()`);await wait(b);assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-t3-new-session]').length`),0)
 await b.evaluate(`render('LATE')`);await wait(b);await wait(b);assert.equal((await line(b)).placeholder,'Search')
 for(const mode of ['flat','project','search','archived'])for(const floating of ['on','off']){
  await b.evaluate(`document.querySelector('[data-sessions-mode]').dataset.sessionsMode=${JSON.stringify(mode)};document.documentElement.dataset.codexFloatingSidebar=${JSON.stringify(floating)}`);await wait(b)
  const r=await line(b);assert.equal(r.n.x-r.search.right,4);assert.equal(r.n.w,28)
 }
 const r=await line(b);await b.call('Input.dispatchMouseEvent',{type:'mousePressed',x:r.n.x+14,y:r.n.y+14,button:'right',clickCount:1});await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.n.x+14,y:r.n.y+14,button:'right',clickCount:1});assert.deepEqual(await b.evaluate('actions.at(-1)'),['context','LATE'])
 await b.evaluate(`document.querySelector('[data-tour="sessions-sidebar"] input').placeholder='Sitzungen durchsuchen'`);await wait(b);assert.equal((await line(b)).placeholder,'Search')
 await b.evaluate(`delete document.documentElement.dataset.codexChatLook`);await wait(b);assert.equal((await line(b)).placeholder,'Sitzungen durchsuchen');assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-t3-new-session]').length`),0)
 await b.evaluate(`document.documentElement.dataset.codexChatLook='true'`);await wait(b);assert.equal((await line(b)).placeholder,'Search')
 await b.evaluate(`stop()`);assert.equal((await line(b)).placeholder,'Sitzungen durchsuchen');assert.equal(await b.evaluate(`document.querySelectorAll('[style*="--codex-t3-"]').length`),0)
 }finally{b.close()}
})
