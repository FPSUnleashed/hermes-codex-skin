import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

const require = createRequire(import.meta.url)
const coreDir = resolve(dirname(require.resolve('@tanstack/query-core/package.json')), 'build/modern')
const bundle = (await readFile(process.env.CODEX_INBOX_TEST_BUNDLE || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')

async function fixture(t, { status = 'working' } = {}) {
  // CI uses the pinned native excerpt; opt in to a full installed stylesheet.
  const nativeCSS = await readFile(process.env.HERMES_INSTALLED_ROW_CSS || new URL('./fixtures/native-inbox-colors.css', import.meta.url), 'utf8')
  const server = createServer(async (request, response) => {
    if (request.url === '/') { response.end('<!doctype html><html data-codex-chat-look="true"><style>' + nativeCSS + '</style><style>:root{--ui-text-primary:#eee;--ui-text-tertiary:#777;--ui-success:#16884b}aside{width:280px;height:500px}</style><aside data-sessions-mode="sessions"></aside></html>'); return }
    if (!/^\/core\/[a-zA-Z0-9_-]+\.js$/.test(request.url)) { response.writeHead(404).end(); return }
    response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(resolve(coreDir, request.url.slice(6))))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium()
  t.after(async () => { await browser.evaluate('disposals.forEach(fn=>fn());queryClient.unmount();queryClient.clear()').catch(() => {}); browser.close(); await new Promise(resolve => server.close(resolve)) })
  await browser.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
  await browser.evaluate(`(async () => {
    window.process={env:{NODE_ENV:'production'}};
    const {QueryClient}=await import('/core/index.js');
    window.queryClient=new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false}}});queryClient.mount();
    window.scope={connectionId:'source-A',profile:'default'};
    window.atom=initial=>{let value=initial;const listeners=new Set();return {get:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:next=>{value=next;listeners.forEach(fn=>fn())}}};
    window.state={connectionId:atom(scope.connectionId),profile:atom(scope.profile),gateway:atom('open'),focusedSessionOwner:atom(scope),focusedStoredSessionId:atom('anchor'),focusedSessionId:atom('runtime-anchor'),busyBySession:atom({'runtime-chat':true})};
    window.events=new Set();window.disposals=[];window.pending={};window.calls=[];
    window.saved=new Map([['inbox','on']]);window.storage={get:(k,f)=>structuredClone(saved.get(k)??f),set:(k,v)=>saved.set(k,structuredClone(v))};
    window.rows=[{id:'runtime-anchor',session_key:'anchor',status:'idle'},{id:'runtime-chat',session_key:'chat',status:'working'}];
    window.metadata=['anchor','chat'].map(id=>({id,source:'desktop',profile:'default',message_count:2,started_at:1}));
    window.host={state,onEvent:(_,fn)=>{events.add(fn);return()=>events.delete(fn)},profileRoutes:async()=>[scope],requestProfile:async(route,method,params)=>{
      calls.push({route,method,params});
      if(method==='session.active_list'){const result=structuredClone(rows);if(window.heldRead)await heldRead;return {sessions:result}};
      if(method==='subagent.list')return {subagents:[],delegations:[]};
      if(method==='session.status')return {output:'Hermes TUI Status\\n\\nSession ID: '+rows.find(r=>r.id===params.session_id).session_key+'\\nPath: /profile/default'};
      throw Error('Unexpected '+method);
    }};
    window.hermesDesktop={api:async()=>({total:2,sessions:metadata}),getAgentRoster:async()=>({sources:[{connectionId:scope.connectionId,reachable:true}],agents:[scope]})};
    window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
  })()`)
  await browser.evaluate(`rows[1].status=${JSON.stringify(status)}`)
  await browser.evaluate(bundle)
  await browser.evaluate(`(() => {
    pluginStorage=storage;const style=document.createElement('style');style.textContent=CODEX_INBOX_ROW_UI_CSS;document.head.appendChild(style);
    window.runtime=installCodexInboxRuntime({storage,host,window});disposals.push(()=>runtime.dispose());
    startCodexInboxObserver({onDispose:fn=>disposals.push(fn)},runtime);disposals.push(connectCodexInboxEvents(runtime));
    window.flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
    window.sample=()=>{const row=document.querySelector('[data-codex-inbox-row="chat"]');if(!row)return null;const arc=row.querySelector('[data-codex-inbox-running-arc]'),dot=row.querySelector('[data-codex-inbox-work-dot]');return {state:row.dataset.workState,arcOpacity:getComputedStyle(arc).opacity,animation:getComputedStyle(arc,'::before').animationName,dotOpacity:getComputedStyle(dot).opacity,dotColor:getComputedStyle(dot).backgroundColor}};
    window.emit=(type,payload={},sid='runtime-chat',owner=scope)=>events.forEach(fn=>fn({type,payload,...owner,session_id:sid}));
  })()`)
  await browser.evaluate('flush()')
  return browser
}

async function assertWaiting(browser) {
  const sample = await browser.evaluate('sample()')
  assert.equal(sample?.state, 'needs-input', 'pending question overrides native busy/work state on an unfocused chat')
  assert.equal(sample.arcOpacity, '0', 'waiting does not paint a running contour')
  assert.equal(sample.animation, 'none', 'waiting stops the actual CSS animation')
  assert.equal(sample.dotOpacity, '1')
  const native = await browser.evaluate(`(()=>{const e=document.createElement('span');e.className='bg-amber-500';document.body.append(e);const color=getComputedStyle(e).backgroundColor;e.remove();return color})()`)
  assert.notEqual(native, 'rgba(0, 0, 0, 0)', 'native amber token resolves')
  assert.equal(sample.dotColor, native, 'question dot matches installed Hermes amber')
}

test('shipping Inbox shows native amber and stops animation for an unfocused clarify request', async t => {
  const browser = await fixture(t)
  assert.equal((await browser.evaluate('sample()')).state, 'working')
  await browser.evaluate("rows[1].status='waiting';emit('clarify.request',{prompt_id:'question-1'});flush()")
  await assertWaiting(browser)
})

test('native waiting snapshot restores a legacy question after reload, ahead of busy and active children', async t => {
  const browser = await fixture(t, { status: 'waiting' })
  await browser.evaluate("emit('subagent.start',{subagent_id:'child'});flush()")
  await assertWaiting(browser)
  await browser.evaluate("rows[1].status='working';queryClient.refetchQueries({queryKey:['codex-chat-look','inbox']}).then(flush)")
  assert.equal((await browser.evaluate('sample()')).state, 'working', 'answering restores the running contour')
})

test('multiple prompts and their exact settlements preserve attention until the last answer', async t => {
  const browser = await fixture(t)
  await browser.evaluate("rows[1].status='waiting';emit('clarify.request',{prompt_id:'question-1'});emit('approval.request',{prompt_id:'approval-2'});flush()")
  await assertWaiting(browser)
  await browser.evaluate("emit('clarify.settled',{prompt_id:'question-1'});emit('approval.settled',{prompt_id:'wrong-id'});flush()")
  await assertWaiting(browser)
  await browser.evaluate("rows[1].status='working';emit('approval.settled',{prompt_id:'approval-2'});flush()")
  assert.equal((await browser.evaluate('sample()')).state, 'working')
  await browser.evaluate("emit('message.complete',{status:'complete'});flush()")
  assert.equal((await browser.evaluate('sample()')).state, 'completed')
})

test('an older in-flight working snapshot cannot overwrite a newer question event', async t => {
  const browser = await fixture(t)
  await browser.evaluate("window.heldRead=new Promise(resolve=>window.releaseRead=resolve);window.inFlight=queryClient.refetchQueries({queryKey:['codex-chat-look','inbox']});flush()")
  await browser.evaluate("rows[1].status='waiting';emit('clarify.request',{prompt_id:'question-1'});flush()")
  await assertWaiting(browser)
  await browser.evaluate("heldRead=null;releaseRead();inFlight.then(flush)")
  await assertWaiting(browser)
  await browser.evaluate("state.gateway.set('closed');flush()")
  assert.equal((await browser.evaluate('sample()')).state, 'unknown', 'disconnect revokes waiting paint')
  await browser.evaluate("state.gateway.set('open');flush()")
  await assertWaiting(browser)
})

test('foreign, unproved and replayed requests cannot alter a thread', async t => {
  const browser = await fixture(t)
  await browser.evaluate("emit('clarify.request',{prompt_id:'foreign'},'runtime-chat',{connectionId:'other',profile:'default'});emit('clarify.request',{prompt_id:'unproved'},'unknown-runtime');events.forEach(fn=>fn({...scope,session_id:'runtime-chat',type:'clarify.request',payload:{prompt_id:'old'},replayed:true}));flush()")
  assert.equal((await browser.evaluate('sample()')).state, 'working')
})
