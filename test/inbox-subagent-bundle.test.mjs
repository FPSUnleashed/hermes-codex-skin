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

test('exact shipping bundle keeps child-only cold-start chat animated through parent unread, then stops after final child', async () => {
  const server = createServer(async (request, response) => {
    if (request.url === '/') { response.end('<!doctype html><html data-codex-chat-look="true"><style>:root{--ui-text-primary:#eee;--ui-text-tertiary:#777;--ui-success:#16884b}body{background:#171717;color:#eee}aside{width:280px;height:500px}</style><aside data-sessions-mode="sessions"></aside></html>'); return }
    if (!/^\/core\/[a-zA-Z0-9_-]+\.js$/.test(request.url)) { response.writeHead(404).end(); return }
    response.setHeader('Content-Type', 'text/javascript')
    response.end(await readFile(resolve(coreDir, request.url.slice(6))))
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
      window.state={connectionId:atom(scope.connectionId),profile:atom(scope.profile),gateway:atom('open'),focusedSessionOwner:atom(scope),focusedStoredSessionId:atom('chat-a'),focusedSessionId:atom('runtime-a'),busyBySession:atom({})};
      window.events=new Set();window.disposals=[];
      window.saved=new Map([['inbox','on']]);window.storage={get:(k,f)=>structuredClone(saved.get(k)??f),set:(k,v)=>saved.set(k,structuredClone(v))};
      window.rows=[{id:'runtime-a',session_key:'chat-a',status:'idle'},{id:'chat-b',session_key:'chat-c',status:'working'}];
      window.metadata=['chat-a','chat-b','chat-c'].map(id=>({id,source:'desktop',profile:'default',message_count:2,started_at:1,unread:true}));
      window.children={'runtime-a':[{subagent_id:'one',status:'running'},{subagent_id:'two',status:'running'}],'chat-b':[]};
      window.host={state,onEvent:(_,fn)=>{events.add(fn);return()=>events.delete(fn)},profileRoutes:async()=>[scope],requestProfile:async(_,method,params)=>{
        if(method==='session.active_list')return {sessions:rows};
        if(method==='subagent.list')return {subagents:children[params.session_id]||[],delegations:[]};
        return {output:'Hermes TUI Status\\n\\nSession ID: '+rows.find(r=>r.id===params.session_id).session_key+'\\nPath: /profile/default'};
      }};
      window.hermesDesktop={api:async()=>({total:3,sessions:metadata}),getAgentRoster:async()=>({sources:[{connectionId:scope.connectionId,reachable:true}],agents:[scope]})};
      window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
    })()`)
    await browser.evaluate(bundle)
    await browser.evaluate(`(() => {
      pluginStorage=storage;
      const style=document.createElement('style');style.textContent=CODEX_INBOX_ROW_UI_CSS;document.head.appendChild(style);
      window.runtime=installCodexInboxRuntime({storage,host,window});disposals.push(()=>runtime.dispose());
      startCodexInboxObserver({onDispose:fn=>disposals.push(fn)},runtime);disposals.push(connectCodexInboxEvents(runtime));
      window.flush=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setTimeout(r,0));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
      window.sample=id=>{const row=document.querySelector('[data-codex-inbox-row="'+id+'"]');if(!row)return null;const arc=row.querySelector('[data-codex-inbox-running-arc]'),css=getComputedStyle(arc,'::before');return {state:row.dataset.workState,children:row.dataset.codexInboxActiveChildren,opacity:getComputedStyle(arc).opacity,animation:css.animationName,play:css.animationPlayState,transform:css.transform}};
      window.emit=(type,payload={},sid='runtime-a')=>events.forEach(fn=>fn({type,payload,...scope,session_id:sid}));
    })()`)
    await browser.evaluate('flush()')
    let a = await browser.evaluate("sample('chat-a')")
    assert.equal(a?.state, 'working', 'child roster admits and animates cold-start conversation while parent idle/unread')
    assert.equal(a.opacity, '1')
    assert.notEqual(a.animation, 'none')
    assert.equal(a.play, 'running')
    assert.equal(await browser.evaluate("sample('chat-b')"), null, 'runtime ID collision cannot admit another durable chat')
    assert.equal((await browser.evaluate("sample('chat-c')")).state, 'working')
    await browser.evaluate('new Promise(resolve=>setTimeout(resolve,80))')
    assert.notEqual((await browser.evaluate("sample('chat-a')")).transform, a.transform, 'actual animated contour advances')
    await browser.evaluate("emit('message.complete',{status:'complete'});flush()")
    assert.equal((await browser.evaluate("sample('chat-a')")).state, 'working', 'parent handoff must not mark chat completed')
    await browser.evaluate("children['runtime-a']=[{subagent_id:'two',status:'running'}];emit('subagent.complete',{subagent_id:'one',status:'completed'});flush()")
    assert.equal((await browser.evaluate("sample('chat-a')")).state, 'working', 'one remaining child keeps animation')
    await browser.evaluate("emit('subagent.complete',{subagent_id:'two',status:'completed'});flush()")
    assert.notEqual((await browser.evaluate("sample('chat-a')")).state, 'working', 'last child return is not perpetual activity')
    await browser.evaluate("(async()=>{await new Promise(resolve=>setTimeout(resolve,3));await queryClient.refetchQueries({queryKey:['codex-chat-look','inbox']});await flush()})()")
    assert.equal((await browser.evaluate("sample('chat-a')")).children, '0', 'a newer native roster still containing a completed child cannot resurrect it')
    assert.notEqual((await browser.evaluate("sample('chat-a')")).state, 'working', 'native completion-before-registry-cleanup race remains terminal in the exact shipping bundle')
    await browser.evaluate("emit('subagent.start',{subagent_id:'two'});flush()")
    assert.equal((await browser.evaluate("sample('chat-a')")).state, 'working', 'a proved new start can reuse a terminal child ID')
    await browser.evaluate("children['runtime-a']=[];emit('subagent.complete',{subagent_id:'two',status:'completed'});flush()")
    await browser.evaluate("emit('message.start');emit('message.complete',{status:'complete'});flush()")
    assert.equal((await browser.evaluate("sample('chat-a')")).state, 'completed', 'parent final after child returns can complete normally')
    await browser.evaluate("state.gateway.set('closed');flush()")
    assert.equal((await browser.evaluate("sample('chat-a')")).state, 'unknown', 'disconnect revokes activity and completion authority')
    await browser.evaluate("children['runtime-a']=[{subagent_id:'reconnected',status:'running'}];state.gateway.set('open');flush()")
    assert.equal((await browser.evaluate("sample('chat-a')")).state, 'working', 'fresh connected child roster supersedes old parent terminal receipt')
    await browser.evaluate('disposals.forEach(fn=>fn())')
    assert.equal(await browser.evaluate("document.querySelector('[data-codex-inbox-owned]')===null"), true)
  } finally {
    await browser.evaluate('disposals.forEach(fn=>fn());queryClient.unmount();queryClient.clear()').catch(() => {})
    browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
