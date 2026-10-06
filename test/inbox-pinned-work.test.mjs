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

async function fixture(t) {
  const server = createServer(async (request, response) => {
    if (request.url === '/') { response.end('<!doctype html><html data-codex-chat-look="true"><aside data-sessions-mode="sessions"><div data-slot="sidebar-group" id="native-pinned"></div><div data-slot="sidebar-group" id="native-sessions"></div></aside></html>'); return }
    if (!/^\/core\/[a-zA-Z0-9_-]+\.js$/.test(request.url)) { response.writeHead(404).end(); return }
    try { response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(resolve(coreDir, request.url.slice(6)))) }
    catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium()
  t.after(async () => {
    await browser.evaluate('disposals.forEach(fn=>fn());queryClient.unmount();queryClient.clear()').catch(() => {})
    browser.close()
    await new Promise(resolve => server.close(resolve))
  })
  await browser.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
  await browser.evaluate(`(async () => {
    window.process={env:{NODE_ENV:'production'}};
    const {QueryClient}=await import('/core/index.js');
    window.queryClient=new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false}}});queryClient.mount();
    window.scope={connectionId:'source-A',profile:'default'};
    window.atom=initial=>{let value=initial;const listeners=new Set();return {get:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:next=>{value=next;listeners.forEach(fn=>fn())}}};
    window.state={connectionId:atom(scope.connectionId),profile:atom(scope.profile),gateway:atom('open'),focusedSessionOwner:atom(null),focusedStoredSessionId:atom(null),focusedSessionId:atom(null),busyBySession:atom({})};
    window.events=new Set();window.disposals=[];window.calls=[];window.errors=[];
    addEventListener('error',e=>errors.push(String(e.error)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
    window.saved=new Map([['inbox','on']]);window.storage={get:(k,f)=>structuredClone(saved.get(k)??f),set:(k,v)=>saved.set(k,structuredClone(v))};
    window.host={state,onEvent:(_,fn)=>{events.add(fn);return()=>events.delete(fn)},profileRoutes:async()=>[scope],requestProfile:async(_,method)=>method==='subagent.list'?{subagents:[],delegations:[]}:({sessions:[{id:'runtime-old',session_key:'old',status:window.liveStatus||'idle'}]})};
    window.hermesDesktop={api:async options=>{
      calls.push(options.path);
      if(options.path.includes('/latest-descendant?'))return {requested_session_id:'old',session_id:'old',path:['old']};
      if(options.path.startsWith('/api/sessions/old?'))return window.metadata;
      return {total:1,sessions:[window.metadata]};
    },getAgentRoster:async()=>({sources:[{connectionId:scope.connectionId,reachable:true}],agents:[scope]})};
    window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
  })()`)
  await browser.evaluate(bundle)
  await browser.evaluate(`(() => {
    pluginStorage=storage;
    window.setup=(pinned,createdSource,source='desktop')=>{
      window.liveStatus='idle';
      window.metadata={id:'old',source,created_source:createdSource,profile:'default',message_count:2,started_at:1,pinned,hidden:0,archived:false};
      if(pinned){
        window.nativePinnedRow=document.createElement('button');nativePinnedRow.dataset.nativePinnedRow='old';nativePinnedRow.textContent='Old thread';
        window.nativePinClicks=0;nativePinnedRow.addEventListener('click',()=>nativePinClicks++);
        document.querySelector('#native-pinned').append(nativePinnedRow);
      }
      window.runtime=installCodexInboxRuntime({storage,host,window});disposals.push(()=>runtime.dispose());
      startCodexInboxObserver({onDispose:fn=>disposals.push(fn)},runtime);disposals.push(connectCodexInboxEvents(runtime));
    };
    window.flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,0));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
    window.focusOld=()=>{state.focusedSessionOwner.set(scope);state.focusedStoredSessionId.set('old');state.focusedSessionId.set('runtime-old')};
    window.emit=type=>events.forEach(fn=>fn({type,payload:type==='message.complete'?{status:'complete'}:{},...scope,session_id:'runtime-old'}));
    window.rows=()=>[...document.querySelectorAll('[data-codex-inbox-row]')].map(el=>el.getAttribute('data-codex-inbox-row'));
  })()`)
  return browser
}

// The actual Mac metadata contains source=desktop and immutable created_source=tui.
// Keep pinning independent from that legitimate surface migration.
for (const pinned of [false, true]) for (const createdSource of ['desktop', 'tui', 'cli', null]) {
  test(`shipping observer admits owner-verified history work (pinned=${pinned}, created=${createdSource})`, async t => {
    const browser = await fixture(t)
    await browser.evaluate(`setup(${pinned},${JSON.stringify(createdSource)});flush()`)
    assert.deepEqual(await browser.evaluate('rows()'), [], 'pinning and loading history never admit work')
    await browser.evaluate('focusOld();flush()')
    assert.deepEqual(await browser.evaluate('rows()'), [], 'opening a pinned thread is not work')
    await browser.evaluate("window.liveStatus='working';state.busyBySession.set({'runtime-old':true});emit('message.start');flush()")
    const actual = await browser.evaluate('({rows:rows(),calls,pending:runtime.pendingWorkSessionIds(scope),verified:runtime.verifyLiveEvent({type:"message.start",...scope,session_id:"runtime-old"}),errors})')
    assert.equal(actual.rows.length, 1, JSON.stringify(actual))
    assert.equal(await browser.evaluate('metadata.pinned'), pinned, 'native pin state must not change')
    await browser.evaluate("emit('message.complete');window.liveStatus='idle';state.busyBySession.set({'runtime-old':false});flush()")
    assert.equal(await browser.evaluate('rows().length'), 1, 'completed work remains in Inbox')
    await browser.evaluate('document.querySelector("[data-codex-inbox-settle]").click();flush()')
    assert.equal(await browser.evaluate('rows().length===0&&runtime.model.isManualSettled(scope,"old")'), true)
    await browser.evaluate('focusOld();flush()')
    assert.deepEqual(await browser.evaluate('rows()'), [], 'opening settled history does not restore it')
    await browser.evaluate("window.liveStatus='working';state.busyBySession.set({'runtime-old':true});emit('message.start');flush()")
    assert.equal(await browser.evaluate('rows().length'), 1, 'new verified work restores a settled migrated thread')
    await browser.evaluate('runtime.snooze(metadata,Date.now()+60000);emit("message.start");flush()')
    assert.equal(await browser.evaluate('rows().length===0&&runtime.model.isSnoozed(scope,"old")'), true, 'Snooze remains in force during new work')
    if (pinned) {
      assert.equal(await browser.evaluate('document.querySelector("[data-native-pinned-row=old]")===nativePinnedRow&&nativePinnedRow.isConnected&&nativePinnedRow.textContent==="Old thread"'), true, 'the native-shaped pin DOM is preserved')
      await browser.evaluate('nativePinnedRow.click()')
      assert.equal(await browser.evaluate('nativePinClicks'), 1, 'its original click listener is preserved')
    }
    assert.deepEqual(await browser.evaluate('errors'), [])
  })
}

for (const provenance of [
  { source: 'cron', created: 'desktop' },
  { source: 'desktop', created: 'cron' },
  { source: 'unknown', created: 'desktop' },
  { source: 'desktop', created: 'unknown' }
]) {
  test(`shipping pinned observer excludes unsafe provenance ${JSON.stringify(provenance)}`, async t => {
    const browser = await fixture(t)
    await browser.evaluate(`setup(true,${JSON.stringify(provenance.created)},${JSON.stringify(provenance.source)});flush()`)
    await browser.evaluate("focusOld();window.liveStatus='working';state.busyBySession.set({'runtime-old':true});emit('message.start');flush()")
    assert.deepEqual(await browser.evaluate('rows()'), [], 'verified work cannot override cron or unknown provenance')
    assert.equal(await browser.evaluate('nativePinnedRow.isConnected&&metadata.pinned===true'), true)
    assert.deepEqual(await browser.evaluate('errors'), [])
  })
}
