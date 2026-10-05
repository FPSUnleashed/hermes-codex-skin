import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from './helpers/chromium.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = ['inbox-row-ui.js', 'inbox-runtime.js', 'inbox-query.js'].map(name => fs.readFileSync(path.join(root, 'src', name), 'utf8')).join('\n')

for (const theme of ['light', 'dark']) test(`production Inbox terminal receipts and runtime/stored identity (${theme})`, async t => {
  const browser = await chromium()
  try {
    await browser.call('Page.enable')
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true })
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><style>
      :root { --ui-text-primary: ${theme === 'light' ? '#242424' : '#eeeeee'}; --ui-text-tertiary:#777; --ui-success:#16884b; --ui-control-active-background:#ddd; }
      body { margin:0; color:var(--ui-text-primary); background:${theme === 'light' ? '#fff' : '#171717'}; font:12px Arial; }
      [data-sessions-mode] { width:280px;height:520px;display:flex;flex-direction:column; }
      [data-sidebar='group'] { display:flex; flex-direction:column; }
      [data-sidebar='group-content'] { flex:1;min-height:0; }
      [data-sidebar='group-label'] { height:26px;flex:none; }
    </style><aside data-sessions-mode='sessions'><div id='native' data-sidebar='group'><button data-sidebar='group-label'>Sessions</button><div data-sidebar='group-content'>Native history</div></div></aside>` })
    await browser.evaluate(`(() => {
      window.scope = { connectionId:'source-a', profile:'default' };
      window.clock = 10000; Date.now = () => clock;
      const atom = value => ({ get:()=>value, subscribe:()=>()=>{} });
      window.eventHandlers = new Set(); window.opens=[]; window.ID='codex-chat-look';
      window.host = { state:{ focusedSessionId:atom('runtime-a'), focusedStoredSessionId:atom('a'), focusedSessionOwner:atom(scope), focusedSession:atom(null) },
        onEvent:(type,fn)=>{eventHandlers.add(fn);return ()=>eventHandlers.delete(fn)}, openSession:async(id,owner)=>opens.push({id,owner}) };
      window.emit = (type,payload={},extra={}) => { clock++; const event={type,payload,session_id:'runtime-a',...scope,...extra}; for(const fn of eventHandlers)fn(event) };
      window.native = document.getElementById('native'); window.nativeBefore = native.outerHTML;
    })()`)
    await browser.evaluate(source)
    await browser.evaluate(`(() => {
      const storage = new Map();
      window.session = {id:'a',title:'Attention thread',started_at:20000,source:'desktop',...scope};
      window.rows = [session];
      window.runtime = installCodexInboxRuntime({document,window,host,storage:{get:(key,fallback)=>storage.get(key)??fallback,set:(key,value)=>storage.set(key,value)}});
      window.model = runtime.model;
      // Exercise the runtime's authorized event sink. The actual SDK bridge
      // and observer ownership gate are exercised in inbox-owner-cache.test.mjs.
      window.offEvents = host.onEvent('*', event => runtime.activity(event));
      window.input = {scope,sessions:rows,liveSessions:[],liveStatusKnown:true};
      window.update = extra => runtime.update(window.input={...input,...extra});
      window.flush = async()=>{for(let i=0;i<4;i++) await new Promise(resolve=>requestAnimationFrame(resolve))};
      window.row=()=>document.querySelector('[data-codex-inbox-row]');
      window.sample=()=>({state:row()?.dataset.workState, arc:row()?getComputedStyle(row().querySelector('[data-codex-inbox-running-arc]')).opacity==='1':false, color:row()?getComputedStyle(row().querySelector('[data-codex-inbox-work-dot]')).backgroundColor:null, settleVisible:row()?getComputedStyle(row().querySelector('[data-codex-inbox-settle]')).opacity:null, settleDisabled:row()?.querySelector('[data-codex-inbox-settle]').disabled});
      // Seed durable prior verified work, then test the neutral retained row.
      runtime.admission.observe(scope,rows,{workingSessions:rows});update();
    })()`)
    const sample = async () => { await browser.evaluate('flush()'); return browser.evaluate('sample()') }
    let state = await sample()
    assert.equal(state.state, 'idle', 'initial idle never implies successful completion')
    assert.equal(state.arc, false)
    assert.notEqual(state.color, 'rgb(22, 136, 75)')
    assert.equal(state.settleVisible, '1', 'Settle visible without hovering')
    assert.equal(state.settleDisabled, false)
    const initialGeometry = await browser.evaluate("(()=>{const r=row(),l=r.querySelector('[data-codex-inbox-label]');return [r.getBoundingClientRect().height,l.getBoundingClientRect().left-r.getBoundingClientRect().left]})()")
    assert.deepEqual(initialGeometry, [26, 28])

    await browser.evaluate("emit('message.start');row().querySelector('[data-codex-inbox-settle]').click()")
    assert.equal(await browser.evaluate('model.isSettled(scope,session)'), true, 'Settle is local attention even before the working-state paint')
    await browser.evaluate("document.querySelector('[data-codex-inbox-settle-notice] button').click()")
    state = await sample()
    assert.equal(state.state, 'working', 'runtime ID maps to exact focused stored owner')
    assert.equal(state.arc, true)
    assert.equal(state.color, theme === 'light' ? 'rgb(36, 36, 36)' : 'rgb(238, 238, 238)')
    assert.equal(state.settleDisabled, false, 'positive work does not block a local Settle')

    await browser.evaluate('update({busyBySession:{},liveSessions:[]})')
    assert.notEqual((await sample()).state, 'completed', 'busy:false or absent live work is not a terminal receipt')

    await browser.evaluate("emit('message.complete',{status:'complete'})")
    state = await sample()
    assert.equal(state.state, 'completed')
    assert.equal(state.arc, false)
    assert.equal(state.color, 'rgb(22, 136, 75)')
    assert.equal(state.settleDisabled, false)
    await browser.evaluate("clock++;update({liveStatusAt:clock,liveSessions:[{...session,session_id:'runtime-a',stored_session_id:'a',status:'working'}]})")
    assert.equal((await sample()).state, 'completed', 'late backend cleanup snapshot cannot erase a successful terminal frame')
    await browser.evaluate('update({liveSessions:[]})')

    await browser.evaluate(`(() => {
      window.surface=document.createElement('div');surface.setAttribute('data-chat-surface','');surface.setAttribute('data-session-anchor','session-tile:a');
      surface.innerHTML='<div data-slot="aui_thread-viewport" data-following="false" style="position:fixed;left:350px;top:0;width:300px;height:150px;overflow:auto"><div data-slot="aui_turn-pair"><div data-slot="aui_assistant-message-root" style="height:40px"><div data-slot="aui_msg-actions"></div></div></div></div>';
      document.body.appendChild(surface);
    })()`)
    assert.equal((await sample()).state, 'completed', 'opening while reading earlier messages does not acknowledge the latest reply')
    await browser.evaluate("surface.setAttribute('data-session-anchor','session-tile:foreign');surface.firstChild.setAttribute('data-following','true')")
    assert.equal((await sample()).state, 'completed', 'another mounted chat cannot acknowledge this reply')
    await browser.evaluate("surface.setAttribute('data-session-anchor','session-tile:a');surface.setAttribute('data-pane-hidden','')")
    assert.equal((await sample()).state, 'completed', 'a hidden pane cannot acknowledge a reply')
    await browser.evaluate("surface.removeAttribute('data-pane-hidden');surface.firstChild.firstChild.style.marginTop='300px'")
    assert.equal((await sample()).state, 'completed', 'a following marker alone does not prove visible reply geometry')
    await browser.evaluate("surface.firstChild.firstChild.style.marginTop='0px';document.dispatchEvent(new Event('scroll'));flush()")
    assert.equal((await sample()).state, 'idle', 'seeing the latest completed reply clears its green indicator')
    assert.equal(await browser.evaluate('model.isSettled(scope,session)'), false, 'reading preserves Inbox attention')
    await browser.evaluate("surface.remove();emit('message.complete',{status:'complete'})")
    assert.equal((await sample()).state, 'idle', 'a repeated terminal receipt cannot relight the same read reply')
    await browser.evaluate("surface.remove();clock++;update({sessions:[{...session,unread:true}],liveStatusAt:clock,liveSessions:[{...session,session_id:'runtime-a',stored_session_id:'a',status:'working'}]})")
    assert.equal((await sample()).state, 'idle', 'a stale cleanup snapshot cannot relight the acknowledged reply')
    await browser.evaluate('update({sessions:rows,liveSessions:[]})')
    await browser.evaluate("emit('message.start');emit('message.complete',{status:'complete'})")
    assert.equal((await sample()).state, 'completed', 'a genuinely new background reply needs reading again')
    await browser.evaluate("surface.setAttribute('data-session-anchor','workspace');document.body.appendChild(surface)")
    assert.equal((await sample()).state, 'completed', 'an unresolved primary runtime cannot borrow focused ownership')
    await browser.evaluate("host.state.activeSessionId={get:()=> 'runtime-a'};host.state.connectionId={get:()=>scope.connectionId};host.state.profile={get:()=>scope.profile};document.dispatchEvent(new Event('scroll'));flush()")
    assert.equal((await sample()).state, 'idle', 'the exact owner-qualified primary workspace acknowledges its visible latest reply')
    await browser.evaluate("surface.remove();emit('message.start');emit('message.complete',{status:'complete'})")
    await browser.evaluate(`(() => {
      const tail=document.createElement('div');tail.setAttribute('data-slot','aui_assistant-message-root');tail.style.height='20px';
      surface.firstChild.firstChild.appendChild(tail);document.body.appendChild(surface);
      const latest=document.createElement('div');latest.setAttribute('data-slot','aui_turn-pair');latest.innerHTML='<div data-slot="aui_assistant-message-root" style="height:20px"></div>';
      surface.firstChild.appendChild(latest);
    })()`)
    assert.equal((await sample()).state, 'completed', 'a footer in an earlier turn never acknowledges a newer turn without a text reply')
    await browser.evaluate("surface.firstChild.lastChild.remove();document.dispatchEvent(new Event('scroll'));flush()")
    assert.equal((await sample()).state, 'idle', 'the visible latest text reply is read even when its turn ends with a tool-only root')
    assert.equal(await browser.evaluate('model.isSettled(scope,session)'), false, 'a trailing tool bubble never changes Inbox attention')
    await browser.evaluate("surface.remove();emit('message.start');emit('message.complete',{status:'complete'})")

    for (const extra of [{replayed:true},{connectionId:'source-b'},{profile:'other'},{session_id:'unknown-runtime'}]) {
      await browser.evaluate(`emit('message.start',{},${JSON.stringify(extra)})`)
      assert.equal((await sample()).state, 'completed', 'replay/foreign owner/unmapped runtime cannot mutate this row')
    }
    await browser.evaluate("emit('message.start');emit('message.complete',{status:'interrupted'})")
    assert.equal((await sample()).state, 'unknown', 'interruption is never shown as successful completion')
    await browser.evaluate("emit('message.start');emit('message.complete',{status:'error',error:'failed'})")
    assert.equal((await sample()).state, 'unknown', 'failed completion stays neutral')
    await browser.evaluate("emit('message.start');emit('error',{message:'failed'})")
    assert.equal((await sample()).state, 'unknown')

    await browser.evaluate("emit('message.start');emit('subagent.spawn_requested',{subagent_id:'child-1'});emit('subagent.start',{subagent_id:'child-1'});emit('message.complete',{status:'complete'})")
    assert.equal((await sample()).state, 'working', 'parent handoff is not completion while child work remains')
    await browser.evaluate("clock++;update({liveStatusAt:clock,liveSessions:[]})")
    assert.equal((await sample()).state, 'working', 'idle active-list cannot green a pending child')
    await browser.evaluate("emit('subagent.complete',{subagent_id:'child-1',status:'completed'})")
    assert.notEqual((await sample()).state, 'completed', 'child return itself is not parent completion')
    await browser.evaluate("emit('message.start');emit('message.complete',{status:'complete'})")
    assert.equal((await sample()).state, 'completed')
    assert.deepEqual(await browser.evaluate("(()=>{const r=row(),l=r.querySelector('[data-codex-inbox-label]');return [r.getBoundingClientRect().height,l.getBoundingClientRect().left-r.getBoundingClientRect().left]})()"), initialGeometry)

    await browser.evaluate("update({liveSessions:[{...session,status:'resuming'}]})")
    assert.equal((await sample()).state, 'reading')
    await browser.evaluate("update({liveSessions:[],liveStatusKnown:false})")
    assert.equal((await sample()).state, 'unknown')
    await browser.evaluate("clock++;window.otherScope={connectionId:'source-b',profile:'default'};window.otherRows=[{...session,connectionId:'source-b',unread:false}];runtime.admission.observe(otherScope,otherRows,{workingSessions:otherRows});update({scope:otherScope,sessions:otherRows,liveStatusKnown:true,liveSessions:[],liveStatusAt:clock})")
    assert.equal((await sample()).state, 'idle', 'scope switch does not carry completion across identical IDs')
    await browser.evaluate("emit('message.complete',{status:'complete'})")
    assert.equal((await sample()).state, 'idle', 'old-owner event remains rejected after scope switch')
    await browser.evaluate("update({sessions:[{...session,connectionId:'source-b',unread:true}]})")
    assert.equal((await sample()).state, 'completed', 'authoritative native unread can restore completion on reload')

    const evidenceDir = process.env.CODEX_INBOX_ACTIVITY_PREVIEW
    if (evidenceDir) {
      fs.mkdirSync(evidenceDir,{recursive:true})
      const shot=await browser.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})
      fs.writeFileSync(path.join(evidenceDir,`production-activity-${theme}.png`),Buffer.from(shot.data,'base64'))
    }
    assert.equal(await browser.evaluate('native.outerHTML===nativeBefore'),true,'native tree remains unmodified')
    await browser.evaluate('offEvents();runtime.dispose()')
    assert.equal(await browser.evaluate("eventHandlers.size===0&&!document.querySelector('[data-codex-inbox-owned]')&&native.outerHTML===nativeBefore"),true,'listeners and plugin-owned DOM cleanly retire')
  } finally {
    browser.close()
  }
})
