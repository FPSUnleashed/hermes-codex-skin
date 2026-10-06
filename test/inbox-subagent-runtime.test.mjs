import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from './helpers/chromium.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = ['inbox-row-ui.js', 'inbox-runtime.js'].map(name => fs.readFileSync(path.join(root, 'src', name), 'utf8')).join('\n')

async function fixture(theme = 'light', unread = false, collision = false, admitted = true) {
  const browser = await chromium()
  try {
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true })
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><style>
      :root { --ui-text-primary:${theme === 'light' ? '#242424' : '#eeeeee'}; --ui-success:#16884b; --ui-text-tertiary:#777; }
      body { margin:0; font:12px Arial; color:var(--ui-text-primary); }
      [data-sessions-mode] { width:280px; height:520px; display:flex; flex-direction:column; }
    </style><aside data-sessions-mode="sessions"><div id="native">Native history</div></aside>` })
    await browser.evaluate(source)
    await browser.evaluate(`(() => {
      window.clock = 10000; Date.now = () => clock;
      window.scope = { connectionId:'source-a', profile:'default' };
      const atom = value => ({ get:()=>value, subscribe:()=>()=>{} });
      window.host = { state:{ focusedSessionId:atom('runtime-a'), focusedStoredSessionId:atom('a'), focusedSessionOwner:atom(scope) } };
      const storage = new Map(); window.storage = storage;
      window.session = { id:'a', title:'Parent', source:'desktop', unread:${unread}, ...scope };
      window.other = { ...session, id:'runtime-a', title:'Unrelated durable collision', unread:false };
      window.rows = ${collision ? '[other, session]' : '[session]'};
      window.nativeBefore = document.getElementById('native').outerHTML;
      window.runtime = installCodexInboxRuntime({document,window,host,storage:{get:(key,fallback)=>storage.get(key)??fallback,set:(key,value)=>storage.set(key,value)}});
      if (${admitted}) runtime.admission.observe(scope,rows,{workingSessions:rows});
      window.input = {scope,sessions:rows,liveSessions:[],liveStatusKnown:true,liveStatusAt:clock};
      window.update = extra => runtime.update(window.input={...input,...extra});
      window.emit = (type,payload={},extra={}) => { clock++; return runtime.activity({type,payload,session_id:'runtime-a',canonicalSessionId:'a',...scope,...extra}) };
      window.flush = async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>requestAnimationFrame(resolve))};
      window.row = (id='a')=>[...document.querySelectorAll('[data-codex-inbox-row]')].find(row=>row.dataset.codexInboxRow===id);
      window.sample = (id='a')=>{
        const r=row(id), arc=r.querySelector('[data-codex-inbox-running-arc]'), dot=r.querySelector('[data-codex-inbox-work-dot]');
        const contour=getComputedStyle(arc), gradient=getComputedStyle(arc,'::before');
        return { state:r.dataset.workState, children:Number(r.dataset.codexInboxActiveChildren), opacity:contour.opacity, animation:gradient.animationName, playState:gradient.animationPlayState,
          transform:gradient.transform, mask:contour.maskComposite, gradient:gradient.backgroundImage,
          animations:r.getAnimations({subtree:true}).filter(animation=>animation.animationName==='codex-inbox-row-contour').map(animation=>animation.playState),
          color:getComputedStyle(dot).backgroundColor, dotOpacity:getComputedStyle(dot).opacity,
          height:r.getBoundingClientRect().height, labelInset:r.querySelector('[data-codex-inbox-label]').getBoundingClientRect().left-r.getBoundingClientRect().left };
      };
      window.visibleReply = ()=>{
        window.surface=document.createElement('div');surface.setAttribute('data-chat-surface','');surface.setAttribute('data-session-anchor','session-tile:a');
        surface.innerHTML='<div data-slot="aui_thread-viewport" data-following="true" style="position:fixed;left:350px;top:0;width:300px;height:150px;overflow:auto"><div data-slot="aui_turn-pair"><div data-slot="aui_assistant-message-root" style="height:40px"><div data-slot="aui_msg-actions"></div></div></div></div>';
        document.body.appendChild(surface);
      };
      update();
    })()`)
    return browser
  } catch (error) { browser.close(); throw error }
}

async function paint(browser, expected, theme = 'light', id = 'a') {
  await browser.evaluate('flush()')
  const first = await browser.evaluate(`sample(${JSON.stringify(id)})`)
  assert.equal(first.state, expected)
  assert.equal(first.height, 26, 'activity preserves the row contour geometry')
  assert.equal(first.labelInset, 28)
  if (expected === 'working') {
    assert.equal(first.opacity, '1', 'the working contour is actually visible')
    assert.equal(first.animation, 'codex-inbox-row-contour')
    assert.equal(first.playState, 'running')
    assert.deepEqual(first.animations, ['running'], 'a real CSS pseudo-element animation is running')
    assert.ok(first.mask.split(',').every(value => value.trim() === 'exclude'), 'the contour uses the native exclusion mask')
    assert.match(first.gradient, /^linear-gradient\(/)
    assert.equal(first.dotOpacity, '1')
    assert.equal(first.color, theme === 'light' ? 'rgb(36, 36, 36)' : 'rgb(238, 238, 238)')
    await browser.evaluate('flush()')
    assert.notEqual((await browser.evaluate(`sample(${JSON.stringify(id)})`)).transform, first.transform, 'the contour moves between actual rendered frames')
  } else {
    assert.equal(first.opacity, '0', 'neutral/terminal paint has no contour')
    assert.equal(first.animation, 'none')
    assert.deepEqual(first.animations, [], 'the animation stops, not merely hides')
    assert.equal(first.dotOpacity, expected === 'completed' ? '1' : '0')
    if (expected === 'completed') assert.equal(first.color, 'rgb(22, 136, 75)')
  }
  return first
}

for (const theme of ['light', 'dark']) for (const unread of [true, false]) {
  test(`active children override unread/read receipts without changing attention (${theme}, unread=${unread})`, async () => {
    const browser = await fixture(theme, unread)
    try {
      await paint(browser, unread ? 'completed' : 'idle', theme)
      await browser.evaluate("emit('subagent.start',{subagent_id:'native-unread-child'})")
      await paint(browser, 'working', theme)
      await browser.evaluate("emit('subagent.complete',{subagent_id:'native-unread-child'})")
      await paint(browser, unread ? 'completed' : 'unknown', theme)
      await browser.evaluate("emit('message.start');emit('message.complete',{status:'complete'})")
      await paint(browser, 'completed', theme)
      await browser.evaluate('visibleReply()')
      await paint(browser, 'idle', theme)
      const attention = await browser.evaluate("JSON.stringify(storage.get('inbox-state-v1'))")
      await browser.evaluate("emit('subagent.start',{subagent_id:'child-1'});emit('subagent.start',{subagent_id:'child-2'})")
      assert.equal((await paint(browser, 'working', theme)).children, 2)
      assert.equal(await browser.evaluate("JSON.stringify(storage.get('inbox-state-v1'))"), attention, 'child lifecycle never settles/unsettles or mutates attention')
      await browser.evaluate("emit('subagent.complete',{subagent_id:'child-1'})")
      assert.equal((await paint(browser, 'working', theme)).children, 1, 'diagnostics refresh even while working paint stays the same')
      await browser.evaluate("emit('subagent.complete',{subagent_id:'child-2'})")
      assert.equal((await paint(browser, 'idle', theme)).children, 0)
      await browser.evaluate("surface.remove();emit('message.start');emit('subagent.spawn_requested',{subagent_id:'child-3'});emit('message.complete',{status:'complete'})")
      await paint(browser, 'working', theme)
      await browser.evaluate("clock++;update({liveStatusAt:clock,liveSessions:[]})")
      await paint(browser, 'working', theme)
      await browser.evaluate("emit('subagent.complete',{subagent_id:'child-3',status:'completed'})")
      await paint(browser, 'unknown', theme)
      await browser.evaluate("clock++;update({liveStatusAt:clock,liveSessions:[{...session,session_id:'runtime-a',stored_session_id:'a',status:'working'}]})")
      await paint(browser, 'unknown', theme)
      await browser.evaluate("emit('message.start')")
      await paint(browser, 'working', theme)
      await browser.evaluate("emit('message.complete',{status:'complete'});update({liveSessions:[]})")
      await paint(browser, 'completed', theme)
      assert.equal(await browser.evaluate('runtime.model.isSettled(scope,session)'), false)
      assert.equal(await browser.evaluate("document.getElementById('native').outerHTML===nativeBefore"), true)
    } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
  })
}

for (const theme of ['light', 'dark']) test(`authoritative child snapshots are independently ordered and parent-safe (${theme})`, async () => {
  const browser = await fixture(theme, true)
  try {
    await browser.evaluate("emit('message.start');emit('message.complete',{status:'complete'})")
    await paint(browser, 'completed', theme)
    const attention = await browser.evaluate("JSON.stringify(storage.get('inbox-state-v1'))")
    await browser.evaluate("clock++;window.snapshotAt=clock;update({childSnapshots:[{session_id:'a',childIds:['snapshot-child'],at:snapshotAt}]})")
    await paint(browser, 'working', theme)
    assert.equal(await browser.evaluate("JSON.stringify(storage.get('inbox-state-v1'))"), attention)
    await browser.evaluate('visibleReply()')
    await paint(browser, 'working', theme)
    await browser.evaluate("clock++;update({childSnapshots:[{session_id:'a',childIds:[],at:clock}]})")
    await paint(browser, 'idle', theme)
    await browser.evaluate("clock++;update({childSnapshots:[{session_id:'a',childIds:['read-child'],at:clock}]})")
    await paint(browser, 'working', theme)
    await browser.evaluate("emit('subagent.complete',{subagent_id:'read-child'});surface.remove();update({sessions:rows})")
    await paint(browser, 'idle', theme)
    await browser.evaluate("emit('subagent.start',{subagent_id:'live-child'});window.beforeEvent=clock-1;update({childSnapshots:[{session_id:'a',childIds:[],at:beforeEvent}]})")
    await paint(browser, 'working', theme)
    await browser.evaluate("update({childSnapshots:[{session_id:'a',childIds:[],at:clock}]})")
    await paint(browser, 'working', theme)
    await browser.evaluate("clock++;window.freshEmpty=clock;update({childSnapshots:[{session_id:'a',childIds:[],at:freshEmpty}]})")
    await paint(browser, 'idle', theme)
    await browser.evaluate("update({childSnapshots:[{session_id:'a',childIds:['obsolete'],at:freshEmpty}]})")
    await paint(browser, 'idle', theme)
    await browser.evaluate("emit('message.start');emit('subagent.start',{subagent_id:'parent-child'});clock++;update({childSnapshots:[{session_id:'a',childIds:[],at:clock}]})")
    await paint(browser, 'working', theme)
    await browser.evaluate("emit('subagent.complete',{subagent_id:'parent-child'})")
    await paint(browser, 'working', theme)
    await browser.evaluate("emit('message.complete',{status:'complete'})")
    await paint(browser, 'completed', theme)
    await browser.evaluate("clock++;update({liveStatusAt:clock,liveSessions:[{...session,stored_session_id:'a',session_id:'runtime-a',status:'working'}]})")
    await paint(browser, 'completed', theme)
    await browser.evaluate("clock++;update({liveSessions:[],childSnapshots:[{session_id:'a',childIds:['disconnect-child'],at:clock}]})")
    await paint(browser, 'working', theme)
    await browser.evaluate("update({liveStatusKnown:false,busyBySession:{a:true},childSnapshots:[{session_id:'a',childIds:['late-child'],at:clock+1}]})")
    await paint(browser, 'unknown', theme)
    await browser.evaluate("clock+=2;update({liveStatusKnown:true,busyBySession:{},liveStatusAt:clock,childSnapshots:[{session_id:'a',childIds:[],at:clock}]})")
    await paint(browser, 'completed', theme)
    await browser.evaluate("update({liveSessions:[{...session,status:'unknown'}],childSnapshots:[{session_id:'a',childIds:['unknown-child'],at:clock+1}]})")
    await paint(browser, 'unknown', theme)
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

test('canonical durable activity cannot be redirected by a runtime/durable ID collision', async () => {
  const browser = await fixture('light', false, true)
  try {
    await browser.evaluate("emit('message.start')")
    await paint(browser, 'working')
    await paint(browser, 'idle', 'light', 'runtime-a')
    await browser.evaluate("emit('message.complete',{status:'complete'})")
    await paint(browser, 'completed')
    for (const canonicalSessionId of ['missing', '', null, 42, { id:'a' }]) {
      assert.equal(await browser.evaluate(`emit('message.start',{},${JSON.stringify({canonicalSessionId})})`), false)
      assert.equal(await browser.evaluate(`runtime.reactivate({type:'work',scope,session_id:'runtime-a',canonicalSessionId:${JSON.stringify(canonicalSessionId)}})`), false)
      await paint(browser, 'completed')
      await paint(browser, 'idle', 'light', 'runtime-a')
    }
    await browser.evaluate("emit('subagent.start',{subagent_id:'canonical-child'})")
    await paint(browser, 'working')
    await paint(browser, 'idle', 'light', 'runtime-a')
    await browser.evaluate("emit('subagent.complete',{subagent_id:'canonical-child'})")
    await paint(browser, 'completed')
    await browser.evaluate("clock++;update({childSnapshots:[{session_id:'a',childIds:['canonical-snapshot'],at:clock}]})")
    await paint(browser, 'working')
    await paint(browser, 'idle', 'light', 'runtime-a')
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

for (const canonical of [true, false]) test(`live and busy namespaces cannot borrow another durable thread (${canonical ? 'canonical' : 'legacy stored fields'})`, async () => {
  const browser = await fixture('light', false, true)
  try {
    const marker = canonical ? ",_codexInboxCanonicalId:'a'" : ''
    await browser.evaluate(`clock++;update({liveStatusAt:clock,liveSessions:[{id:'a',session_key:'a',status:'unknown',profile:scope.profile,connection_id:scope.connectionId},{session_id:'runtime-a',stored_session_id:'a',status:'working',...scope${marker}}],busyBySession:{a:true}})`)
    await paint(browser, 'working')
    await paint(browser, 'idle', 'light', 'runtime-a')
    await browser.evaluate(`clock++;update({liveStatusAt:clock,liveSessions:[{session_id:'runtime-a',stored_session_id:'a',status:'idle',...scope${marker}}]})`)
    await paint(browser, 'working')
    await paint(browser, 'idle', 'light', 'runtime-a')
    await browser.evaluate("emit('message.complete',{status:'complete'});update({busyBySession:{},liveSessions:[]})")
    await paint(browser, 'completed')
    await browser.evaluate("update({liveSessions:[{id:'a',session_key:'a',status:'unknown',profile:scope.profile,connection_id:scope.connectionId}]})")
    await paint(browser, 'unknown')
    await paint(browser, 'idle', 'light', 'runtime-a')
    if (canonical) {
      await browser.evaluate("update({liveSessions:[{session_id:'runtime-a',stored_session_id:'a',_codexInboxCanonicalId:'missing',status:'working',...scope}],busyBySession:{a:true}})")
      await paint(browser, 'completed')
      await paint(browser, 'idle', 'light', 'runtime-a')
    }
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

test('proved canonical live runtime without stored fields cannot borrow focused or colliding durable identity', async () => {
  const browser = await fixture('light', false, true)
  try {
    await browser.evaluate("clock++;update({liveStatusAt:clock,liveSessions:[{session_id:'runtime-a',_codexInboxCanonicalId:'a',status:'working',...scope}],busyBySession:{}})")
    await paint(browser, 'working')
    await paint(browser, 'idle', 'light', 'runtime-a')
    await browser.evaluate("host.state.focusedStoredSessionId={get:()=> 'runtime-a'};clock++;update({liveStatusAt:clock})")
    await paint(browser, 'working')
    await paint(browser, 'idle', 'light', 'runtime-a')
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

test('queued spawn intent survives an empty running roster until start/complete or positive roster', async () => {
  const browser = await fixture()
  try {
    await browser.evaluate("emit('message.start');emit('subagent.spawn_requested',{subagent_id:'queued'});emit('message.complete',{status:'complete'});clock++;update({liveStatusAt:clock,childSnapshots:[{session_id:'a',childIds:[],at:clock}]})")
    assert.equal((await paint(browser, 'working')).children, 1)
    await browser.evaluate("emit('subagent.start',{subagent_id:'queued'})")
    await paint(browser, 'working')
    await browser.evaluate("emit('subagent.complete',{subagent_id:'queued'})")
    assert.equal((await paint(browser, 'unknown')).children, 0)
    await browser.evaluate("emit('subagent.spawn_requested',{subagent_id:'confirmed'});clock++;update({childSnapshots:[{session_id:'a',childIds:['confirmed'],at:clock}]})")
    await paint(browser, 'working')
    await browser.evaluate("clock++;update({childSnapshots:[{session_id:'a',childIds:[],at:clock}]})")
    assert.equal((await paint(browser, 'unknown')).children, 0, 'a roster-confirmed spawn is no longer pending')
    await browser.evaluate("emit('subagent.spawn_requested',{subagent_id:'canceled'});emit('subagent.complete',{subagent_id:'canceled'})")
    await paint(browser, 'unknown')
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

for (const theme of ['light', 'dark']) test(`child terminality survives newer native cleanup rosters (${theme})`, async () => {
  const browser = await fixture(theme)
  try {
    await browser.evaluate("emit('subagent.start',{subagent_id:'finished'});emit('message.complete',{status:'complete'});emit('subagent.complete',{subagent_id:'finished'})")
    await paint(browser, 'unknown', theme)
    const attention = await browser.evaluate("JSON.stringify(storage.get('inbox-state-v1'))")
    await browser.evaluate("clock++;update({childSnapshots:[{session_id:'a',childIds:['finished'],at:clock}]})")
    assert.equal((await paint(browser, 'unknown', theme)).children, 0, 'a roster requested AFTER complete still precedes registry removal')
    await browser.evaluate("emit('subagent.start',{subagent_id:'other'});emit('subagent.spawn_requested',{subagent_id:'pending'});emit('subagent.complete',{subagent_id:'finished'});clock++;update({childSnapshots:[{session_id:'a',childIds:['finished','other'],at:clock}]})")
    assert.equal((await paint(browser, 'working', theme)).children, 2, 'terminality is per child, preserving other work and pending registration')
    await browser.evaluate("emit('subagent.complete',{subagent_id:'other'});emit('subagent.complete',{subagent_id:'pending'});clock++;update({childSnapshots:[{session_id:'a',childIds:['finished','other','pending'],at:clock}]})")
    assert.equal((await paint(browser, 'unknown', theme)).children, 0)
    await browser.evaluate("emit('subagent.complete',{subagent_id:'finished'});clock++;update({liveStatusKnown:false,childSnapshots:[{session_id:'a',childIds:['finished'],at:clock}]})")
    await paint(browser, 'unknown', theme)
    await browser.evaluate("clock++;update({liveStatusKnown:true,childSnapshots:[{session_id:'a',childIds:['finished'],at:clock}]})")
    assert.equal((await paint(browser, 'unknown', theme)).children, 0, 'disconnect/unknown frames cannot erase terminality')
    await browser.evaluate("emit('subagent.start',{subagent_id:'finished'})")
    assert.equal((await paint(browser, 'working', theme)).children, 1, 'a genuinely new proved start may reuse the ID')
    await browser.evaluate("emit('subagent.complete',{subagent_id:'finished'});clock++;update({childSnapshots:[{session_id:'a',childIds:['finished'],at:clock}]})")
    await paint(browser, 'unknown', theme)
    await browser.evaluate("emit('subagent.spawn_requested',{subagent_id:'finished'});clock++;update({childSnapshots:[{session_id:'a',childIds:[],at:clock}]})")
    assert.equal((await paint(browser, 'working', theme)).children, 1, 'a genuinely new spawn survives an empty registry')
    assert.equal(await browser.evaluate("JSON.stringify(storage.get('inbox-state-v1'))"), attention, 'terminality never changes attention')
    await browser.evaluate("emit('subagent.complete',{subagent_id:'finished'});clock++;window.nextScope={...scope,connectionId:'source-b'};window.nextRows=[{...session,...nextScope}];runtime.admission.observe(nextScope,nextRows,{workingSessions:nextRows});update({scope:nextScope,sessions:nextRows,childSnapshots:[{session_id:'a',childIds:['finished'],at:clock}]})")
    assert.equal((await paint(browser, 'working', theme)).children, 1, 'scope lifetime reset permits cold hydration of the same child ID')
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

test('bounded per-thread terminal history fails closed without evicting completed IDs', async () => {
  const browser = await fixture()
  try {
    await browser.evaluate("emit('subagent.start',{subagent_id:'first'});emit('message.complete',{status:'complete'});emit('subagent.complete',{subagent_id:'first'});for(let i=0;i<300;i++)emit('subagent.complete',{subagent_id:'done-'+i});clock++;update({childSnapshots:[{session_id:'a',childIds:['first','done-299'],at:clock}]})")
    assert.equal((await paint(browser, 'unknown')).children, 0, 'overflow never evicts terminality into live work')
    await browser.evaluate("emit('subagent.start',{subagent_id:'first'});emit('subagent.spawn_requested',{subagent_id:'new'});clock++;update({childSnapshots:[{session_id:'a',childIds:['first','done-299'],at:clock}]})")
    assert.equal((await paint(browser, 'working')).children, 2, 'overflow still permits proved new work and preserves pending spawn')
    await browser.evaluate("emit('subagent.complete',{subagent_id:'first'});emit('subagent.complete',{subagent_id:'new'});clock++;update({childSnapshots:[{session_id:'a',childIds:['first','new','done-299'],at:clock}]})")
    assert.equal((await paint(browser, 'unknown')).children, 0)
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

test('replayed and foreign completions cannot poison a never-seen child roster', async () => {
  const browser = await fixture()
  try {
    for (const extra of [{replayed:true},{connectionId:'source-b'},{profile:'other'},{connection_id:'source-b'},{canonicalSessionId:'missing'}]) {
      assert.equal(await browser.evaluate(`emit('subagent.complete',{subagent_id:'cold'},${JSON.stringify(extra)})`), false)
    }
    await browser.evaluate("clock++;update({childSnapshots:[{session_id:'a',childIds:['cold'],at:clock}]})")
    assert.equal((await paint(browser, 'working')).children, 1)
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})

for (const sourceKind of ['desktop', 'cron', 'unknown']) test(`cold child snapshots admit verified non-cron work only (${sourceKind})`, async () => {
  const browser = await fixture('light', false, false, false)
  try {
    assert.equal(await browser.evaluate('!!row()'), false, 'metadata and idle alone never admit a cold thread')
    await browser.evaluate(`session.source=${JSON.stringify(sourceKind)};clock++;update({childSnapshots:[{session_id:'a',childIds:['cold-child'],at:clock}]})`)
    if (sourceKind === 'desktop') {
      assert.equal((await paint(browser, 'working')).children, 1)
      assert.equal(await browser.evaluate('runtime.admission.isEligible(scope,session)'), true)
      await browser.evaluate('runtime.model.settle(scope,session,{manual:true});runtime.model.snooze(scope,session,clock+60000)')
      const attention = await browser.evaluate("JSON.stringify(storage.get('inbox-state-v1'))")
      await browser.evaluate("clock++;update({childSnapshots:[{session_id:'a',childIds:['cold-child','new-child'],at:clock}]});flush()")
      assert.equal(await browser.evaluate("JSON.stringify(storage.get('inbox-state-v1'))"), attention, 'positive children preserve manual Settle and Snooze')
      assert.equal(await browser.evaluate('runtime.model.isManualSettled(scope,session)&&runtime.model.isSnoozed(scope,session)&&!row()'), true)
    } else {
      await browser.evaluate('flush()')
      assert.equal(await browser.evaluate('!!row()||runtime.admission.isEligible(scope,session)'), false)
    }
  } finally { await browser.evaluate('runtime.dispose()'); browser.close() }
})
