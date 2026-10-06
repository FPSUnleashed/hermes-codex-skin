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

test('shipping Inbox paints a departed new thread without a return visit', async () => {
  const server = createServer(async (request, response) => {
    if (request.url === '/') {
      response.end('<!doctype html><html data-codex-chat-look="true"><aside data-sessions-mode="sessions"></aside></html>')
      return
    }
    if (!/^\/core\/[a-zA-Z0-9_-]+\.js$/.test(request.url)) { response.writeHead(404).end(); return }
    try {
      response.setHeader('Content-Type', 'text/javascript')
      response.end(await readFile(resolve(coreDir, request.url.slice(6))))
    } catch { response.writeHead(404).end() }
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
      window.state={connectionId:atom(scope.connectionId),profile:atom(scope.profile),gateway:atom('open'),focusedSessionOwner:atom(scope),focusedStoredSessionId:atom('created'),focusedSessionId:atom('R'),busyBySession:atom({})};
      window.events=new Set();window.disposals=[];window.saved=new Map([['inbox','on']]);
      window.storage={get:(key,fallback)=>structuredClone(saved.get(key)??fallback),set:(key,value)=>saved.set(key,structuredClone(value))};
      window.errors=[];addEventListener('error',event=>errors.push(String(event.error)));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
      window.host={state,onEvent:(_,fn)=>{events.add(fn);return()=>events.delete(fn)},profileRoutes:async()=>[scope],requestProfile:async(_,method)=>{
        if(method==='subagent.list')return {subagents:[],delegations:[]};
        if(window.holdLive)await new Promise(resolve=>window.releaseLive=resolve);
        return {sessions:[{id:'R',session_key:'created',status:window.liveStatus},{id:'Q',session_key:'other',status:'idle'}]}
      }};
      window.hermesDesktop={api:async request=>{
        if(request.profile!==scope.profile||request.connectionId!==scope.connectionId)throw Error('Wrong owner route');
        if(request.path.includes('/latest-descendant?'))return {requested_session_id:'created',session_id:'created',path:['created']};
        if(request.path.startsWith('/api/sessions/created?'))return window.metadata;
        return {total:2,sessions:[window.metadata,{id:'other',profile:'default',source:'desktop',message_count:1}]}
      },getAgentRoster:async()=>({sources:[{connectionId:scope.connectionId,reachable:true}],agents:[scope]})};
      window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
    })()`)
    await browser.evaluate(bundle)
    await browser.evaluate(`(() => {
      pluginStorage=storage;
      window.flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))};
      window.focusCreated=()=>{state.focusedStoredSessionId.set('created');state.focusedSessionId.set('R')};
      window.leave=()=>{state.focusedStoredSessionId.set('other');state.focusedSessionId.set('Q')};
      window.emit=type=>events.forEach(fn=>fn({type,...scope,session_id:'R',payload:type==='message.complete'?{status:'complete'}:{text:'PRIVATE_SENTINEL'}}));
      window.rows=()=>[...document.querySelectorAll('[data-codex-inbox-row]')].map(row=>row.getAttribute('data-codex-inbox-row'));
      window.setup=(initial,status,source='desktop')=>{
        disposals.forEach(fn=>fn());disposals=[];queryClient.clear();saved.clear();saved.set('inbox','on');
        window.metadata={id:'created',profile:'default',source,created_source:source,message_count:1,started_at:1};
        window.liveStatus=status;window.holdLive=true;window.releaseLive=null;
        if(initial==='R')focusCreated();else leave();
        window.runtime=installCodexInboxRuntime({storage,host,window});disposals.push(()=>runtime.dispose());
        startCodexInboxObserver({onDispose:fn=>disposals.push(fn)},runtime);disposals.push(connectCodexInboxEvents(runtime));
      };
    })()`)
    for (const scenario of [
      { initial: 'R', status: 'working', phase: 'none', admitted: true },
      { initial: 'R', status: 'idle', phase: 'before', admitted: true },
      { initial: 'R', status: 'idle', phase: 'after', admitted: true },
      { initial: 'Q', status: 'idle', phase: 'before', admitted: true },
      { initial: 'Q', status: 'idle', phase: 'after', admitted: true },
      { initial: 'R', status: 'idle', phase: 'none', admitted: false },
      { initial: 'R', status: 'resuming', phase: 'none', admitted: false },
      { initial: 'R', status: 'idle', phase: 'before', source: 'cron', admitted: false },
      { initial: 'R', status: 'idle', phase: 'before', source: 'unknown', admitted: false }
    ]) {
      await browser.evaluate(`setup(${JSON.stringify(scenario.initial)},${JSON.stringify(scenario.status)},${JSON.stringify(scenario.source || 'desktop')});flush()`)
      assert.equal(await browser.evaluate('typeof releaseLive'), 'function')
      assert.deepEqual(await browser.evaluate('rows()'), [], 'unverified history remains absent')
      await browser.evaluate('focusCreated();flush()')
      if (scenario.phase === 'before') await browser.evaluate("emit('message.start')")
      await browser.evaluate('leave();flush()')
      if (scenario.phase === 'after') await browser.evaluate("emit('message.start')")
      if (scenario.phase !== 'none') await browser.evaluate("emit('message.complete')")
      await browser.evaluate('window.holdLive=false;releaseLive();flush()')
      assert.equal(await browser.evaluate('state.focusedStoredSessionId.get()'), 'other', 'no return visit or focus stealing')
      assert.deepEqual(await browser.evaluate('rows()'), scenario.admitted ? ['created'] : [], JSON.stringify(scenario))
      assert.equal(await browser.evaluate('JSON.stringify([...saved]).includes("PRIVATE_SENTINEL")'), false)
      assert.deepEqual(await browser.evaluate('errors'), [])
    }
  } finally {
    await browser.evaluate('disposals.forEach(fn=>fn());queryClient.unmount();queryClient.clear()').catch(() => {})
    browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
