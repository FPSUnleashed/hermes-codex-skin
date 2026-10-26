import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from './helpers/chromium.mjs'

const bundle = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')

async function fixture() {
  const browser = await chromium()
  await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true })
  await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id,
    html: '<!doctype html><style>:root{--ui-success:#16884b}aside{width:280px;height:400px}</style><aside data-sessions-mode="sessions"></aside>' })
  await browser.evaluate(`(() => {
    window.scope={connectionId:'source-a',profile:'default'};
    window.atom=value=>({get:()=>value,subscribe:()=>()=>{}});
    window.host={state:{focusedSessionOwner:atom(scope),focusedStoredSessionId:atom('other-chat'),focusedSessionId:atom('other-runtime')}};
    window.saved=new Map([['inbox','on']]);
    window.storage={get:(k,f)=>structuredClone(saved.get(k)??f),set:(k,v)=>saved.set(k,structuredClone(v))};
    window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});
    window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
  })()`)
  await browser.evaluate(bundle)
  await browser.evaluate(`(() => {
    const style=document.createElement('style');style.textContent=CODEX_INBOX_ROW_UI_CSS;document.head.append(style);
    window.session={id:'chat-a',title:'Unread reply',source:'desktop',message_count:4,...scope};
    window.runtime=installCodexInboxRuntime({storage,host,window});
    runtime.admission.observe(scope,[session],{workingSessions:[session]});
    window.input={scope,sessions:[session],liveSessions:[],liveStatusKnown:true,liveStatusAt:Date.now()};
    window.update=extra=>runtime.update(input={...input,...extra});
    window.emit=(type,payload={})=>runtime.activity({type,payload,session_id:session.id,...scope});
    window.flush=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    window.sample=()=>{const row=document.querySelector('[data-codex-inbox-row="chat-a"]');return {state:row?.dataset.workState,opacity:row&&getComputedStyle(row.querySelector('[data-codex-inbox-work-dot]')).opacity}};
    update();
  })()`)
  return browser
}

async function sample(browser) { await browser.evaluate('flush()'); return browser.evaluate('sample()') }

test('shipping bundle retains background unread through metadata false and missing unread without opening', async () => {
  const browser = await fixture()
  try {
    await browser.evaluate('update({sessions:[{...session,unread:true}]})')
    assert.equal((await sample(browser)).state, 'completed')
    for (const row of ['{...session,unread:false,title:"Renamed"}', '{...session}']) {
      await browser.evaluate(`update({sessions:[${row}],liveStatusAt:Date.now()+10})`)
      assert.equal((await sample(browser)).state, 'completed', 'a metadata refresh is not proof Gabriel read the chat')
      assert.equal((await sample(browser)).opacity, '1')
    }
    assert.equal(await browser.evaluate("host.state.focusedStoredSessionId.get()"), 'other-chat')
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

test('shipping bundle retains unviewed completion across profile switch and controller reload', async () => {
  const browser = await fixture()
  try {
    await browser.evaluate("emit('message.start');emit('message.complete',{status:'complete'})")
    assert.equal((await sample(browser)).state, 'completed')
    await browser.evaluate("update({scope:{connectionId:'source-b',profile:'default'},sessions:[]});update({scope,sessions:[session]})")
    assert.equal((await sample(browser)).state, 'completed', 'returning to the owner must not forget an unviewed reply')
    await browser.evaluate('runtime.dispose();runtime=installCodexInboxRuntime({storage,host,window});update({sessions:[session]})')
    assert.equal((await sample(browser)).state, 'completed', 'hot reload is not a read acknowledgement')
    assert.equal(await browser.evaluate('runtime.model.isSettled(scope,session)'), false)
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

test('shipping bundle retains native unread in memory when receipt persistence fails', async () => {
  const browser = await fixture()
  try {
    await browser.evaluate('storage.set=()=>{throw Error("quota")};update({sessions:[{...session,unread:true}]})')
    assert.equal((await sample(browser)).state, 'completed')
    await browser.evaluate('update({sessions:[{...session,unread:false}]})')
    assert.equal((await sample(browser)).state, 'completed', 'quota cannot turn a refresh into a read acknowledgement')
    assert.equal(await browser.evaluate('host.state.focusedStoredSessionId.get()'), 'other-chat')
    await browser.evaluate('storage.set=(k,v)=>saved.set(k,structuredClone(v));update()')
    assert.equal((await sample(browser)).state, 'completed')
    assert.equal(await browser.evaluate('runtime.model.replyState(scope,session)'), 'completed', 'a later refresh retries the receipt after storage recovers')
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

test('shipping bundle never rejects proved starts, completions or errors because storage is full', async () => {
  const browser = await fixture()
  try {
    await browser.evaluate('storage.set=()=>{throw Error("quota")}')
    assert.equal(await browser.evaluate('emit("message.start")'), true)
    assert.equal((await sample(browser)).state, 'working')
    assert.equal(await browser.evaluate('emit("message.complete",{status:"complete"})'), true)
    assert.equal((await sample(browser)).state, 'completed')
    assert.equal(await browser.evaluate('emit("message.start")'), true)
    assert.equal((await sample(browser)).state, 'working')
    assert.equal(await browser.evaluate('emit("error",{message:"failed"})'), true)
    assert.equal((await sample(browser)).state, 'unknown')
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

test('shipping bundle only acknowledges visible latest reply and preserves read receipt on reload', async () => {
  const browser = await fixture()
  try {
    await browser.evaluate('update({sessions:[{...session,unread:true}]})')
    assert.equal((await sample(browser)).state, 'completed')
    await browser.evaluate(`(() => {
      window.surface=document.createElement('div');surface.setAttribute('data-chat-surface','');surface.setAttribute('data-session-anchor','session-tile:chat-a');
      surface.innerHTML='<div data-slot="aui_thread-viewport" data-following="true" style="position:fixed;left:350px;top:0;width:300px;height:150px"><div data-slot="aui_turn-pair"><div data-slot="aui_assistant-message-root" style="height:40px"><div data-slot="aui_msg-actions"></div></div></div></div>';
      document.body.append(surface);
    })()`)
    assert.equal((await sample(browser)).state, 'completed', 'a mounted unfocused chat is not read')
    await browser.evaluate("host.state.focusedStoredSessionId=atom('chat-a');host.state.focusedSessionId=atom('runtime-a');document.dispatchEvent(new Event('scroll'))")
    assert.equal((await sample(browser)).state, 'idle')
    await browser.evaluate('surface.remove();runtime.dispose();runtime=installCodexInboxRuntime({storage,host,window});update()')
    assert.equal((await sample(browser)).state, 'idle', 'stale native unread must not relight the acknowledged reply')
    await browser.evaluate('update({sessions:[{...session,message_count:8,unread:true}]})')
    assert.equal((await sample(browser)).state, 'completed', 'a genuinely newer native unread reply releases an old read receipt without a start event')
    await browser.evaluate("emit('message.start');emit('message.complete',{status:'complete'})")
    assert.equal((await sample(browser)).state, 'completed', 'a new completed turn is unread again')
    assert.equal(await browser.evaluate('runtime.model.isSettled(scope,session)'), false)
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})
