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

test('shipping observer and real browser: resend old/settled threads, fast replies, cron and stale owners', async () => {
  const server = createServer(async (request, response) => {
    if (request.url === '/') { response.end('<!doctype html><html data-codex-chat-look="true"><aside data-sessions-mode="sessions"></aside></html>'); return }
    if (!/^\/core\/[a-zA-Z0-9_-]+\.js$/.test(request.url)) { response.writeHead(404).end(); return }
    try { response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(resolve(coreDir, request.url.slice(6)))) }
    catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium()
  try {
    await browser.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
    await browser.evaluate(`(async () => {
      // The native renderer's build replaces this package constant.
      window.process={env:{NODE_ENV:'production'}};
      const {QueryClient}=await import('/core/index.js');
      window.queryClient=new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false}}});queryClient.mount();
      window.scope={connectionId:'source-A',profile:'default'};
      window.atom=initial=>{let value=initial;const listeners=new Set();return {get:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:next=>{value=next;listeners.forEach(fn=>fn())}}};
      window.state={connectionId:atom(scope.connectionId),profile:atom(scope.profile),gateway:atom('open'),focusedSessionOwner:atom(null),focusedStoredSessionId:atom(null),focusedSessionId:atom(null),busyBySession:atom({})};
      window.events=new Set();window.disposals=[];window.calls=[];
      window.errors=[];addEventListener('error',e=>errors.push(String(e.error)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
      window.saved=new Map([['inbox','on']]);window.storage={get:(k,f)=>structuredClone(saved.get(k)??f),set:(k,v)=>saved.set(k,structuredClone(v))};
      window.host={state,onEvent:(_,fn)=>{events.add(fn);return()=>events.delete(fn)},profileRoutes:async()=>[scope],requestProfile:async()=>{
        calls.push('live');if(window.holdLive)await new Promise(r=>window.releaseLive=r);
        return {sessions:[{id:'runtime-old',session_key:'old',status:window.liveStatus||'idle'}]}
      }};
      window.hermesDesktop={api:async options=>options.path.includes('/latest-descendant?')?{requested_session_id:'old',session_id:'old',path:['old']}:options.path.startsWith('/api/sessions/old?')?window.metadata:{total:window.outsidePage?0:1,sessions:window.outsidePage?[]:[window.metadata]},getAgentRoster:async()=>({sources:[{connectionId:scope.connectionId,reachable:true}],agents:[scope]})};
      window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
    })()`)
    await browser.evaluate(bundle)
    await browser.evaluate(`(() => {
      pluginStorage=storage;
      window.setup=(source='desktop',settled=false,outside=false)=>{
        disposals.forEach(fn=>fn());disposals=[];queryClient.clear();saved.clear();saved.set('inbox','on');
        state.focusedSessionOwner.set(null);state.focusedStoredSessionId.set(null);state.focusedSessionId.set(null);state.busyBySession.set({});state.gateway.set('open');
        window.metadata={id:'old',source,profile:'default',message_count:2,started_at:1};window.outsidePage=outside;window.liveStatus='idle';window.holdLive=false;
        window.runtime=installCodexInboxRuntime({storage,host,window});disposals.push(()=>runtime.dispose());
        if(settled){runtime.admission.observe(scope,[metadata],{workingSessions:[metadata]});runtime.model.settle(scope,metadata,{manual:true})}
        startCodexInboxObserver({onDispose:fn=>disposals.push(fn)},runtime);disposals.push(connectCodexInboxEvents(runtime));
      };
      window.flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setTimeout(r,0));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
      window.focusOld=()=>{state.focusedSessionOwner.set(scope);state.focusedStoredSessionId.set('old');state.focusedSessionId.set('runtime-old')};
      window.emit=(type,payload={},extra={})=>{const event={type,payload,...scope,session_id:'runtime-old',...extra};events.forEach(fn=>fn(event))};
      window.present=()=>!!document.querySelector('[data-codex-inbox-row="old"]');
    })()`)
    for (const scenario of [
      { source: 'desktop', settled: false, outside: false },
      { source: 'desktop', settled: true, outside: false },
      { source: 'desktop', settled: true, outside: true },
      { source: 'cron', settled: true, outside: true },
      { source: 'unknown', settled: true, outside: true }
    ]) {
      await browser.evaluate(`setup(${JSON.stringify(scenario.source)},${scenario.settled},${scenario.outside});flush()`)
      assert.equal(await browser.evaluate('present()'), false, 'idle history stays absent')
      await browser.evaluate("window.holdLive=true;focusOld();state.busyBySession.set({'runtime-old':true});emit('message.start',{text:'PRIVATE_TEST_SENTINEL'});flush()")
      assert.equal(await browser.evaluate('present()'), false, 'unverified tags cannot release admission')
      assert.equal(await browser.evaluate('typeof releaseLive'), 'function', JSON.stringify(await browser.evaluate('({calls,errors,mode:readCodexInboxMode(),queries:queryClient.getQueryCache().getAll().map(q=>({status:q.state.status,error:String(q.state.error),fetch:q.state.fetchStatus,observers:q.getObserversCount(),options:q.options})),focus:codexInboxLiveFocus()})')))
      // A short reply can finish before the metadata/owner round trip returns.
      await browser.evaluate("emit('message.complete',{status:'complete'});state.busyBySession.set({'runtime-old':false});window.holdLive=false;releaseLive();flush()")
      const allowed = scenario.source === 'desktop'
      assert.equal(await browser.evaluate('present()'), allowed, JSON.stringify(scenario))
      if (allowed) {
        assert.equal(await browser.evaluate('runtime.model.isManualSettled(scope,metadata)'), false)
        assert.equal(await browser.evaluate('document.querySelector("[data-codex-inbox-row=old]").dataset.workState'), 'completed')
        await browser.evaluate('document.querySelector("[data-codex-inbox-settle]").click();flush()')
        await browser.evaluate("window.liveStatus='working';runtime.update({scope,sessions:[metadata],liveSessions:[{id:'runtime-old',session_key:'old',status:'working',...scope}],liveStatusKnown:true,liveStatusAt:Date.now(),busyOwnerKnown:true,busyBySession:{'runtime-old':true}});flush()")
        assert.equal(await browser.evaluate('present()'), false, 'continuing old work cannot undo Settle')
      }
      assert.equal(await browser.evaluate('JSON.stringify([...saved]).includes("PRIVATE_TEST_SENTINEL")'), false)
    }
    await browser.evaluate("setup('desktop',true);flush()")
    await browser.evaluate("window.holdLive=true;focusOld();emit('message.start');flush()")
    await browser.evaluate("state.focusedSessionOwner.set({...scope,profile:'other'});window.holdLive=false;releaseLive();flush()")
    assert.equal(await browser.evaluate('present()'), false, 'owner switch drops pending start')
    await browser.evaluate("setup('desktop',true);flush()")
    await browser.evaluate("window.holdLive=true;focusOld();emit('message.start',{}, {replayed:true});flush()")
    await browser.evaluate('window.holdLive=false;releaseLive();flush()')
    assert.equal(await browser.evaluate('present()'), false, 'replayed start never restores old attention')
  } finally {
    await browser.evaluate('disposals.forEach(fn=>fn());queryClient.unmount();queryClient.clear()').catch(() => {})
    browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
