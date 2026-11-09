import { referenceRoot } from './reference-paths.mjs'
import {readFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {resolve,dirname} from 'node:path'
import {createRequire} from 'node:module'
import {chromium} from './chromium.mjs'
const require=createRequire(import.meta.url)
const core=resolve(dirname(require.resolve('@tanstack/query-core/package.json')),'build/modern')
let paletteUi
async function nativePaletteUI(){
  const nativeRoot=referenceRoot()
  if(paletteUi)return paletteUi
  const nativeRequire=createRequire(`${nativeRoot}/package.json`)
  paletteUi=(await nativeRequire('esbuild').build({stdin:{resolveDir:nativeRoot,contents:`
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';import * as Dialog from '@radix-ui/react-dialog';
    export {useEffect,useRef,useState} from 'react';export {jsx} from 'react/jsx-runtime';export {renderToStaticMarkup} from 'react-dom/server.browser';
    export function mountPalette(){const root=document.createElement('div');document.body.append(root);function Palette(){const[open,setOpen]=useState(false);const[tick,setTick]=useState(0);const data=window.toggle().data;return React.createElement(Dialog.Root,{open,onOpenChange:setOpen},
      React.createElement(Dialog.Trigger,{id:'native-palette-trigger',style:{position:'fixed',left:700,top:10}},'Commands'),
      React.createElement(Dialog.Portal,null,React.createElement(Dialog.Overlay,{style:{position:'fixed',inset:0,zIndex:1000}}),React.createElement(Dialog.Content,{'aria-describedby':undefined,style:{position:'fixed',left:300,top:100,width:400,padding:16,background:'white',color:'#111',zIndex:1001}},React.createElement(Dialog.Title,null,'Commands'),
      React.createElement('button',{id:'native-universal-toggle','data-detail-variant':data.detailVariant,onClick:()=>{window.nativePalette({...data,detail:data.detail()});setTick(tick+1)}},data.icon?React.createElement(data.icon,{className:'palette-icon'}):null,data.label+' — '+data.detail()))))};createRoot(root).render(React.createElement(Palette));return()=>{root.remove()}}`},bundle:true,format:'esm',write:false,define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
  return paletteUi
}
export async function universalFixture(run, config = {}) {
  const nativeRoot=referenceRoot()
  const nativeCSS=process.env.HERMES_INSTALLED_ROW_CSS?await readFile(process.env.HERMES_INSTALLED_ROW_CSS,'utf8'):''
  const ts=createRequire(`${nativeRoot}/package.json`)('typescript')
  const nativeColors=ts.transpileModule(await readFile(`${nativeRoot}/apps/desktop/src/lib/profile-color.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  const paletteSource=await readFile(`${nativeRoot}/apps/desktop/src/app/command-palette/index.tsx`,'utf8')
  const ast=ts.createSourceFile('palette.tsx',paletteSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  let select
  const find=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='handleSelect')select=node;ts.forEachChild(node,find)}
  find(ast)
  const nativeSelect=ts.transpileModule('export function nativeSelect(receipt){const completeFlow=()=>{},recordAction=()=>{},leaveIntro=()=>{},setPage=()=>{},setSearch=()=>{},lastSelectMods={current:{}},closeCommandPalette=()=>{receipt.closed++},setSelectTick=fn=>{receipt.tick=fn(receipt.tick)};const '+select.getText(ast)+';return handleSelect}',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  const server=createServer(async(req,res)=>{
    if(req.url==='/palette-ui.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await nativePaletteUI());return}
    if(req.url==='/native-colors.mjs'){res.setHeader('Content-Type','text/javascript');res.end(nativeColors);return}
    if(req.url==='/native-api'&&config.nativeApi){
      try{let body='';for await(const chunk of req)body+=chunk;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await config.nativeApi(JSON.parse(body))))}
      catch(error){res.writeHead(error.statusCode||500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}))}
      return
    }
    if(req.url==='/'){res.end(`<!doctype html><html data-codex-chat-look="true"><style>${nativeCSS||':root{--ui-text-primary:#222;--ui-text-secondary:#555;--ui-text-tertiary:#777;--ui-bg-elevated:#fff;--ui-stroke-secondary:#ccc}.dark{--ui-text-primary:#ddd;--ui-text-secondary:#aaa;--ui-bg-elevated:#202020}'}body{margin:0;font:14px Arial}aside{width:270px;height:600px;display:flex;flex-direction:column}</style><aside data-sessions-mode="sessions"></aside></html>`);return}
    if(req.url==='/native-palette.mjs'){res.setHeader('Content-Type','text/javascript');res.end(nativeSelect);return}
    if(!/^\/core\/[\w-]+\.js$/.test(req.url)){res.writeHead(404).end();return}
    res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(core,req.url.slice(6))))
  })
  let browser
  try {
    await new Promise(r=>server.listen(0,'127.0.0.1',r))
    browser=await chromium()
    await browser.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`})
    await browser.evaluate(`(async()=>{
      window.process={env:{NODE_ENV:'production'}};const {QueryClient}=await import('/core/index.js');
      const {nativeSelect}=await import('/native-palette.mjs');window.paletteReceipt={tick:0,closed:0};window.nativePalette=nativeSelect(paletteReceipt);window.runToggle=()=>nativePalette({...toggle().data,detail:toggle().data.detail()});
      window.queryClient=new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false}}});queryClient.mount();
      window.atom=value=>{const listeners=new Set();return {get:()=>value,set:next=>{value=next;listeners.forEach(fn=>fn())},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}};
      window.routes=[{connectionId:'A',profile:'default',targetProfile:'default',mode:'local'},{connectionId:'A',profile:'desk',targetProfile:'alpha',mode:'remote'},{connectionId:'B',profile:'desk',targetProfile:'alpha',mode:'remote'}];
      window.state={connectionId:atom('A'),profile:atom('default'),gateway:atom('open'),focusedSessionOwner:atom(null),focusedStoredSessionId:atom(null),focusedSessionId:atom(null),busyBySession:atom({})};
      window.saved=new Map([['inbox','on']]);window.failSave=false;window.storage={get:(k,f)=>structuredClone(saved.get(k)??f),set:(k,v)=>{if(!failSave)saved.set(k,structuredClone(v))}};
      window.calls=[];window.nav=[];window.events=new Set();window.disposals=[];window.contributions=[];window.notifications=[];window.errors=[];
      addEventListener('error',e=>errors.push(String(e.error)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
      window.metadata=r=>({id:'same',title:r.connectionId+':'+r.profile,profile:r.targetProfile,connection_id:r.connectionId,source:'desktop',message_count:2,started_at:1,_lineage_root_id:'root',_lineage_ids:['root','same']});
      window.host={state,notify:n=>notifications.push(n),onEvent:(_,fn)=>{events.add(fn);return()=>events.delete(fn)},profileRoutes:async()=>routes,
        requestProfile:async(r,m,p)=>{calls.push({rpc:m,route:r});if(m==='session.active_list')return {sessions:[{id:'R',session_key:'same',status:'idle'}]};if(m==='subagent.list')return {subagents:[]};throw Error('unqualified legacy identity')},
        openSession:(id,options)=>nav.push({id,options}),newChat:options=>nav.push({newChat:options})};
      window.failedSource=null;window.hermesDesktop={getAgentRoster:async()=>({sources:['A','B'].map(connectionId=>({connectionId,reachable:failedSource!==connectionId,...(failedSource===connectionId?{error:'offline'}:{})})),agents:routes.map(r=>({...r,profileMetadata:{display_name:r.profile==='desk'?'Focus':'Home',has_avatar:true}}))}),api:async request=>{
        calls.push(request);const r=routes.find(r=>r.connectionId===request.connectionId&&r.profile===request.profile);if(!r)throw Error('bad route');
        if(window.holdRoute===r.connectionId+':'+r.profile)await new Promise(resolve=>window.releaseRoute=resolve);
        if(failedSource===r.connectionId)throw Error('offline');return {total:1,sessions:[metadata(r)]};
      }};
      const ui=await import('/palette-ui.mjs');window.jsx=ui.jsx;window.useEffect=ui.useEffect;window.useRef=ui.useRef;window.useState=ui.useState;window.renderPaletteElement=ui.renderToStaticMarkup;window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
      const colors=await import('/native-colors.mjs');window.profileColor=colors.profileColor;window.profileColorSoft=colors.profileColorSoft;
      window.flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
    })()`)
    if(config.routes)await browser.evaluate(`window.routes=${JSON.stringify(config.routes)}`)
    if(config.nativeApi)await browser.evaluate(`host.requestProfile=async()=>{throw Error('Native live transport not certified by this HTTP probe')};hermesDesktop.api=async request=>{calls.push(request);const res=await fetch('/native-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.error),{statusCode:res.status});return data}`)
    const bundle=(await readFile(process.env.CODEX_INBOX_TEST_BUNDLE||new URL('../../codex-chat-look/plugin.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.__pluginDefault = {')
    await browser.evaluate(bundle)
    await browser.evaluate(`const actualInstall=installCodexInboxRuntime;installCodexInboxRuntime=options=>window.runtime=actualInstall(options);__pluginDefault.register({storage,register:c=>contributions.push(c),onDispose:fn=>disposals.push(fn)});for(const entry of contributions.filter(c=>c.area===PALETTE_AREA)){if(entry.data.icon)renderPaletteElement(jsx(entry.data.icon,{className:'palette-icon'}))};window.toggle=()=>contributions.find(c=>c.id==='toggle-universal-inbox');window.rows=()=>[...document.querySelectorAll('[data-codex-inbox-row]')];window.refetch=async()=>{await Promise.all(queryClient.getQueryCache().getAll().filter(q=>q.getObserversCount()>0).map(q=>q.fetch().catch(()=>{})));await flush()};window.ownerRow=(connectionId,profile)=>rows().find(el=>{const key=JSON.parse(el.dataset.codexInboxKey);return key[0]===connectionId&&key[1]===profile});flush()`)
    await run(browser)
  } finally {
    try {
      if(browser){
        try {
          await browser.evaluate('disposals.reverse().forEach(fn=>fn());queryClient.unmount();queryClient.clear()').catch(()=>{})
        } finally {
          browser.close()
        }
      }
    } finally {
      await new Promise(r=>server.close(r))
    }
  }
}
