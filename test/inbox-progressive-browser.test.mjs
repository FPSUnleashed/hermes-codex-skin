import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

const require = createRequire(import.meta.url)
const coreDir = resolve(dirname(require.resolve('@tanstack/query-core/package.json')), 'build/modern')
const bundle = (await readFile(process.env.CODEX_INBOX_PLUGIN_FILE || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')

test('shipping cold Inbox paints Working while another native child request is still blocked', async () => {
  const server = createServer(async (request, response) => {
    if (request.url === '/') return response.end('<!doctype html><html data-codex-chat-look="true"><aside data-sessions-mode="sessions"></aside></html>')
    if (!/^\/core\/[a-zA-Z0-9_-]+\.js$/.test(request.url)) return response.writeHead(404).end()
    try { response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(resolve(coreDir, request.url.slice(6)))) }
    catch { response.writeHead(404).end() }
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const browser = await chromium()
  try {
    await browser.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
    await browser.evaluate(`(async()=>{
      window.process={env:{NODE_ENV:'production'}};
      const {QueryClient}=await import('/core/index.js');
      window.queryClient=new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false}}});queryClient.mount();
      window.scope={connectionId:'A',profile:'default'};
      window.atom=initial=>{let value=initial;const listeners=new Set();return {get:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:next=>{value=next;listeners.forEach(fn=>fn())}}};
      window.state={connectionId:atom('A'),profile:atom('default'),gateway:atom('open'),focusedSessionOwner:atom(scope),focusedStoredSessionId:atom('fast'),focusedSessionId:atom('R-fast'),busyBySession:atom({})};
      window.saved=new Map([['inbox','on']]);window.storage={get:(key,fallback)=>structuredClone(saved.get(key)??fallback),set:(key,value)=>saved.set(key,structuredClone(value))};
      window.disposals=[];window.events=new Set();window.errors=[];
      addEventListener('error',event=>errors.push(String(event.error)));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
      window.host={state,profileRoutes:async()=>[scope],onEvent:(_,fn)=>{events.add(fn);return()=>events.delete(fn)},requestProfile:async(_,method,params)=>{
        if(method==='session.active_list')return {sessions:[{id:'R-fast',session_key:'fast',status:'working'},{id:'R-slow',session_key:'slow',status:'idle'}]};
        if(method==='session.status')return {output:'Hermes TUI Status\\n\\nSession ID: '+params.session_id.slice(2)+'\\nPath: /owner'};
        if(method==='subagent.list'){if(params.session_id==='R-slow')await new Promise(done=>window.releaseSlow=done);return {subagents:[]};}
        throw Error(method);
      }};
      window.hermesDesktop={api:async()=>({total:2,sessions:['fast','slow'].map(id=>({id,profile:'default',source:'desktop',message_count:1}))}),getAgentRoster:async()=>({sources:[{connectionId:'A',reachable:true}],agents:[scope]})};
      window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
    })()`)
    await browser.evaluate(bundle)
    await browser.evaluate(`(()=>{
      pluginStorage=storage;window.runtime=installCodexInboxRuntime({storage,host,window});disposals.push(()=>runtime.dispose());
      startCodexInboxObserver({onDispose:fn=>disposals.push(fn)},runtime);disposals.push(connectCodexInboxEvents(runtime));
      window.flush=async()=>{for(let i=0;i<6;i++)await new Promise(done=>setTimeout(done,0));await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))};
    })()`)
    await browser.evaluate('flush()')
    assert.equal(await browser.evaluate('typeof releaseSlow'), 'function', 'slow request is outstanding')
    assert.equal(await browser.evaluate("queryClient.getQueryCache().getAll().find(q=>q.queryKey[1]==='inbox').state.fetchStatus"), 'fetching')
    assert.equal(await browser.evaluate("document.querySelector('[data-codex-inbox-working-toggle]')?.textContent.trim()"), 'Working 1')
    await browser.evaluate("document.querySelector('[data-codex-inbox-working-toggle]').click();flush()")
    assert.equal(await browser.evaluate("document.querySelector('[data-codex-inbox-row=fast]')?.dataset.workState"), 'working')
    // Progress cannot enable manual Settle before the whole read completes.
    await browser.evaluate("document.querySelector('[data-codex-inbox-row=fast] [data-codex-inbox-settle]').click();flush()")
    assert.equal(await browser.evaluate("runtime.model.isSettled(scope,'fast')"), false)
    await browser.evaluate("state.gateway.set('closed');flush()")
    assert.notEqual(await browser.evaluate("document.querySelector('[data-codex-inbox-row=fast]')?.dataset.workState"), 'working')
    await browser.evaluate('releaseSlow();flush()')
    assert.notEqual(await browser.evaluate("document.querySelector('[data-codex-inbox-row=fast]')?.dataset.workState"), 'working', 'late progress cannot restore disconnected work')
    assert.deepEqual(await browser.evaluate('errors'), [])
  } finally {
    await browser.evaluate('releaseSlow?.();disposals.forEach(fn=>fn());queryClient.unmount();queryClient.clear()').catch(()=>{})
    browser.close();await new Promise(done=>server.close(done))
  }
})
