import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

const require = createRequire(import.meta.url)
const coreDir = resolve(dirname(require.resolve('@tanstack/query-core/package.json')), 'build/modern')
const bundle = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')

test('shipping Inbox preserves live paint across metadata refresh and rejects revoked authority', async () => {
  const server = createServer(async (request, response) => {
    if (request.url === '/') {
      response.end('<!doctype html><html data-codex-chat-look="true"><style>:root{--ui-text-primary:#fff;--dt-midground:#fff}</style><aside data-sessions-mode="sessions"></aside></html>')
      return
    }
    if (!/^\/core\/[a-zA-Z0-9_-]+\.js$/.test(request.url)) { response.writeHead(404).end(); return }
    try { response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(resolve(coreDir, request.url.slice(6)))) }
    catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium()
  try {
    await browser.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
    await browser.evaluate(`(async () => {
      window.process={env:{NODE_ENV:'production'}};
      const {QueryClient}=await import('/core/index.js');
      window.queryClient=new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false}}});queryClient.mount();
      window.scope={connectionId:'source-A',profile:'default'};
      window.atom=initial=>{let value=initial;const listeners=new Set();return {get:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:next=>{value=next;listeners.forEach(fn=>fn())}}};
      window.state={connectionId:atom(scope.connectionId),profile:atom(scope.profile),gateway:atom('open'),focusedSessionOwner:atom(scope),focusedStoredSessionId:atom('parent'),focusedSessionId:atom('R'),busyBySession:atom({})};
      window.events=new Set();window.disposals=[];window.saved=new Map([['inbox','on']]);
      window.storage={get:(key,fallback)=>structuredClone(saved.get(key)??fallback),set:(key,value)=>saved.set(key,structuredClone(value))};
      window.metadata=[{id:'parent',profile:'default',source:'desktop',title:'Parent',message_count:1,started_at:1},{id:'child',profile:'default',source:'desktop',title:'Child',message_count:1,started_at:2}];
      window.host={state,onEvent:(_,fn)=>{events.add(fn);return()=>events.delete(fn)},profileRoutes:async()=>[scope],requestProfile:async(_,method,params)=>{
        if(method==='session.active_list') { if(window.holdLive)await new Promise(resolve=>window.releaseLive=resolve); return {sessions:[{id:'R',session_key:'parent',status:'working'},{id:'Q',session_key:'child',status:'idle'}]}; }
        if(method==='session.status')return {output:'Hermes TUI Status\\n\\nSession ID: '+(params.session_id==='R'?'parent':'child')+'\\nPath: /profile/default'};
        if(method==='subagent.list')return {subagents:params.session_id==='Q'?[{subagent_id:'kid',status:'running'}]:[],delegations:[]};
        throw Error('Unexpected RPC '+method);
      }};
      window.hermesDesktop={api:async request=>{
        if(request.profile!==scope.profile||request.connectionId!==scope.connectionId)throw Error('Wrong owner route');
        return {total:metadata.length,sessions:metadata};
      },getAgentRoster:async()=>({sources:[{connectionId:scope.connectionId,reachable:true}],agents:[scope]})};
      window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
      window.errors=[];addEventListener('error',event=>errors.push(String(event.error)));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
    })()`)
    await browser.evaluate(bundle)
    await browser.evaluate(`(() => {
      pluginStorage=storage;
      window.flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))};
      window.runtime=installCodexInboxRuntime({storage,host,window});disposals.push(()=>runtime.dispose());
      window.startObserver=()=>startCodexInboxObserver({onDispose:fn=>disposals.push(fn)},runtime);
      window.stopObserver=startObserver();disposals.push(connectCodexInboxEvents(runtime));
      window.row=id=>document.querySelector('[data-codex-inbox-row="'+id+'"]');
      window.paint=id=>{const el=row(id),arc=el?.querySelector('[data-codex-inbox-running-arc]');return {state:el?.dataset.workState,opacity:arc&&getComputedStyle(arc).opacity,animation:arc&&getComputedStyle(arc,'::before').animationName}};
      window.refresh=()=>{window.holdLive=true;window.releaseLive=null;runtimeInputRetry()};
      window.runtimeInputRetry=()=>{const q=queryClient.getQueryCache().getAll().find(q=>q.queryKey[0]==='codex-chat-look'&&q.queryKey[1]==='inbox');q.fetch()};
      window.watchFrames=async()=>{const frames=[];for(let i=0;i<8;i++){await new Promise(resolve=>requestAnimationFrame(resolve));frames.push(['parent','child'].map(paint))}return frames};
    })()`)
    await browser.evaluate('flush()')
    assert.deepEqual(await browser.evaluate("['parent','child'].map(paint)"), [
      { state: 'working', opacity: '1', animation: 'codex-inbox-row-contour' },
      { state: 'working', opacity: '1', animation: 'codex-inbox-row-contour' }
    ])
    await browser.evaluate("window.originalRows=['parent','child'].map(row);window.originalAnimations=originalRows.map(r=>r.getAnimations({subtree:true}).find(a=>a.animationName==='codex-inbox-row-contour'))")
    for (let i = 0; i < 3; i++) {
      await browser.evaluate('refresh();flush()')
      assert.equal(await browser.evaluate('typeof releaseLive'), 'function')
      const frames = await browser.evaluate('watchFrames()')
      for (const frame of frames) for (const paint of frame) assert.equal(paint.state, 'working', 'metadata preview must not erase proved work')
      assert.equal(await browser.evaluate("['parent','child'].every((id,i)=>row(id)===originalRows[i]&&row(id).getAnimations({subtree:true}).includes(originalAnimations[i]))"), true, 'refresh preserves animation objects')
      await browser.evaluate('window.holdLive=false;releaseLive();flush()')
    }
    await browser.evaluate("state.focusedStoredSessionId.set('child');state.focusedSessionId.set('Q');flush()")
    assert.equal(await browser.evaluate("['parent','child'].every((id,i)=>row(id)===originalRows[i]&&row(id).getAnimations({subtree:true}).includes(originalAnimations[i]))"), true, 'selection preserves animation objects')
    await browser.evaluate('refresh();flush()')
    await browser.evaluate("state.gateway.set('closed');flush()")
    assert.equal(await browser.evaluate("['parent','child'].some(id=>paint(id).state==='working')"), false)
    await browser.evaluate('window.holdLive=false;releaseLive();flush()')
    assert.equal(await browser.evaluate("['parent','child'].some(id=>paint(id).state==='working')"), false, 'late reads cannot restore disconnected work')
    // A new observer lifetime cannot borrow a previous controller's cache.
    await browser.evaluate("state.gateway.set('open');flush()")
    await browser.evaluate('stopObserver();window.holdLive=true;window.releaseLive=null;window.stopObserver=startObserver();runtimeInputRetry();flush()')
    assert.equal(await browser.evaluate("['parent','child'].some(id=>paint(id).state==='working')"), false, 'fresh controller requires fresh live proof')
    await browser.evaluate('window.holdLive=false;releaseLive();flush()')
    assert.equal(await browser.evaluate("['parent','child'].every(id=>paint(id).state==='working')"), true)
    // Latest metadata must constrain cached evidence and the event bridge.
    await browser.evaluate("window.metadata=[{...metadata[0],_lineage_root_id:'ambiguous',_lineage_ids:['parent','child']},metadata[1]];refresh();flush()")
    assert.notEqual(await browser.evaluate("paint('child').state"), 'working', 'cached child evidence cannot bypass contradictory metadata')
    assert.equal(await browser.evaluate("!!runtime.resolveLiveEvent({type:'subagent.start',...scope,session_id:'Q'})"), false)
    assert.deepEqual(await browser.evaluate('errors'), [])
  } finally {
    await browser.evaluate('disposals.forEach(fn=>fn());queryClient.unmount();queryClient.clear()').catch(() => {})
    browser.close(); await new Promise(resolve => server.close(resolve))
  }
})
