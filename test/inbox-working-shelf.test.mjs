import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const bundle = (await readFile(process.env.CODEX_INBOX_TEST_BUNDLE || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')

async function settingFixture(initial = {}, fail = false) {
  const values = new Map(Object.entries(initial)), entries = [], notifications = [], events = [], disposals = []
  const code = await loadPluginInternals(['setCodexInboxMode', 'readCodexInboxMode'], {
    host: { state: {}, onEvent: () => () => {}, notify: event => notifications.push(event) },
    window: { dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } }
  })
  code.plugin.register({
    storage: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => { if (!fail) values.set(key, value) } },
    register: entry => entries.push(entry), onDispose: fn => disposals.push(fn)
  })
  return { values, entries, notifications, events, code, disposals, command: entries.find(entry => entry.id === 'toggle-inbox')?.data }
}

test('shipping Inbox is the only control, defaults On, preserves explicit Off, and refuses unverified writes', async () => {
  const fresh = await settingFixture()
  assert.ok(fresh.command)
  assert.equal(fresh.command.label, 'Codex Skin: Inbox')
  assert.equal(fresh.entries.some(entry => entry.id === 'toggle-inbox-hide-working'), false)
  assert.equal(fresh.command.detailVariant, 'state')
  assert.equal(fresh.command.keepOpen, true)
  assert.equal(fresh.command.detail(), 'On')
  assert.equal(fresh.values.has('inbox'), false)
  fresh.command.run()
  assert.equal(fresh.command.detail(), 'Off')
  assert.equal(fresh.values.get('inbox'), 'off')
  assert.deepEqual(fresh.events.map(event => [event.type, event.detail]), [['codex-chat-look:inbox-mode', 'off']])
  const reload = await settingFixture(Object.fromEntries(fresh.values))
  assert.equal(reload.command.detail(), 'Off')
  reload.command.run()
  assert.equal(reload.command.detail(), 'On')
  assert.equal(reload.values.get('inbox'), 'on')
  const failed = await settingFixture({}, true), modes = []
  assert.equal(failed.code.setCodexInboxMode('off', { setMode: value => modes.push(value) }), 'on')
  assert.deepEqual(modes, [])
  assert.deepEqual(failed.events, [])
  assert.equal(failed.notifications.length, 1)
  assert.equal(failed.notifications[0].kind, 'error')
  for (const fixture of [fresh, reload, failed]) fixture.disposals.forEach(fn => fn())
})

async function fixture(run) {
  const browser = await chromium()
  try {
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true })
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><html data-codex-chat-look="true"><style>
      :root{--ui-text-primary:#ddd;--ui-text-tertiary:#999;--ui-accent:#8ab;--dt-midground:#ddd;--color-amber-500:#f90}
      body{font:14px Arial}[data-sessions-mode]{width:280px;height:600px;display:flex;flex-direction:column}.flex{display:flex}.flex-col{flex-direction:column}
      </style><aside data-sessions-mode="sessions"><div id="native" data-slot="sidebar-group"><button id="native-button">Sessions</button><div data-slot="sidebar-group-content">Native history</div></div></aside></html>` })
    await browser.evaluate(`(() => {
      window.now=1800000000000;Date.now=()=>now;
      window.scope={connectionId:'source-A',profile:'default'};
      window.atom=value=>({get:()=>value,subscribe:()=>()=>{},set:next=>value=next});
      window.nav=[];window.notifications=[];
      window.host={state:{focusedStoredSessionId:atom(null),focusedSessionOwner:atom(scope)},openSession:(id,options)=>nav.push({id,options}),notify:event=>notifications.push(event)};
      window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';
      window.values=new Map([['inbox-hide-working','off']]);
      window.storage={get:(key,fallback)=>structuredClone(values.get(key)??fallback),set:(key,value)=>values.set(key,structuredClone(value))};
      window.nativeBefore=document.getElementById('native').outerHTML;
      window.errors=[];addEventListener('error',event=>errors.push(String(event.error)));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
    })()`)
    await browser.evaluate(bundle)
    await browser.evaluate(`(() => {
      pluginStorage=storage;
      window.flush=async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))};
      window.runtime=installCodexInboxRuntime({storage,host,window});
      window.rows=['work','question','child','idle','read','done','unknown'].map(id=>({id,source:'desktop',title:'Thread '+id,profile:scope.profile,connectionId:scope.connectionId,message_count:1,started_at:1,...(id==='done'?{unread:true}:{})}));
      runtime.admission.observe(scope,rows,{workingSessions:rows});
      window.input={scope,sessions:[...rows,{...rows[0],id:'alias',_lineage_root_id:'work',_lineage_ids:['work','alias']}],loading:false,liveStatusKnown:true,liveStatusAt:now,
        liveSessions:rows.map(row=>({session_id:row.id,status:({work:'working',question:'waiting',read:'resuming',unknown:'mystery'})[row.id]||'idle'})),
        childSnapshots:[{session_id:'work',at:now,childIds:['a','b','c']},{session_id:'child',at:now,childIds:['d','e']},{session_id:'question',at:now,childIds:['f']}]};
      window.update=(extra={})=>{now+=100;runtime.update(input={...input,...extra,liveStatusAt:now})};
      window.event=(id,type,payload={})=>{now+=100;return runtime.activity({...scope,session_id:id,type,payload})};
      window.row=id=>document.querySelector('[data-codex-inbox-row="'+id+'"]');
      window.toggle=()=>document.querySelector('[data-codex-inbox-working-toggle]');
      window.region=()=>document.getElementById(toggle().getAttribute('aria-controls'));
      window.content=()=>document.querySelector('[data-codex-inbox-owned="island"] [data-slot="sidebar-group-content"]');
      window.main=()=>[...content().children].filter(el=>el.hasAttribute('data-codex-inbox-row')).map(el=>el.getAttribute('data-codex-inbox-row'));
      window.shelf=()=>[...region().children].map(el=>el.getAttribute('data-codex-inbox-row'));
      window.attention=()=>JSON.stringify([...values].filter(([key])=>key!=='inbox'));
      window.mode=on=>setCodexInboxMode(on?'on':'off',runtime);
      update();
    })()`)
    await browser.evaluate('flush()')
    await run(browser)
    assert.equal(await browser.evaluate('document.getElementById("native").outerHTML===nativeBefore'), true)
    assert.deepEqual(await browser.evaluate('errors'), [])
  } finally {
    await browser.evaluate('runtime?.dispose()').catch(() => {})
    browser.close()
  }
}

test('shipping shelf groups only unique working threads after main rows without attention or navigation changes', () => fixture(async browser => {
  await browser.evaluate('window.before=attention();window.originalRows=rows.map(s=>row(s.id));flush()')
  assert.deepEqual(await browser.evaluate('main()'), ['question', 'idle', 'read', 'done', 'unknown'])
  assert.deepEqual(await browser.evaluate('shelf()'), ['work', 'child'])
  assert.deepEqual(await browser.evaluate(`({label:toggle().textContent,hidden:toggle().hidden,expanded:toggle().getAttribute('aria-expanded'),rowsHidden:region().hidden,type:toggle().type})`), { label: 'Working 2', hidden: false, expanded: 'false', rowsHidden: true, type: 'button' })
  assert.equal(await browser.evaluate(`toggle().parentElement===content()&&toggle().nextElementSibling===region()&&row('unknown').nextElementSibling===toggle()`), true)
  assert.equal(await browser.evaluate('before===attention()&&nav.length===0&&rows.every((s,i)=>row(s.id)===originalRows[i])'), true)
  await browser.evaluate('toggle().click();flush()')
  assert.equal(await browser.evaluate('!region().hidden&&toggle().getAttribute("aria-expanded")==="true"'), true)
  assert.equal(await browser.evaluate(`region().getBoundingClientRect().top>=toggle().getBoundingClientRect().bottom&&toggle().getBoundingClientRect().top>=row('unknown').getBoundingClientRect().bottom`), true)
  await browser.evaluate(`window.workAnimation=row('work').getAnimations({subtree:true}).find(a=>a.animationName==='codex-inbox-row-contour');rows[0]={...rows[0],title:'Fresh work'};update({sessions:rows});flush()`)
  assert.equal(await browser.evaluate(`row('work')===originalRows[0]&&row('work').getAnimations({subtree:true}).includes(workAnimation)&&row('work').textContent.includes('Fresh work')`), true, 'metadata redraw preserves mounted row and animation')
  await browser.evaluate('mode(false);flush()')
  assert.equal(await browser.evaluate('!document.querySelector("[data-codex-inbox-owned]")&&before===attention()&&nav.length===0'), true, 'Inbox Off removes the entire Inbox including Working without changing attention')
  await browser.evaluate('mode(true);flush()')
  assert.deepEqual(await browser.evaluate('main()'), ['question', 'idle', 'read', 'done', 'unknown'])
  assert.equal(await browser.evaluate('toggle().textContent==="Working 2"&&region().hidden&&before===attention()&&nav.length===0'), true, 'Inbox On restores Working automatically, ignoring the obsolete separate Off preference')
  await browser.evaluate('toggle().click();flush()')
  await browser.evaluate(`row('work').querySelector('[data-slot="row-button"]').click();flush()`)
  assert.deepEqual(await browser.evaluate('nav'), [{ id: 'work', options: { profile: 'default', route: { connectionId: 'source-A', profile: 'default' } } }])
}))

test('shipping shelf supports native Enter/Space activation, stays collapsed on reload, and hides with no working threads', () => fixture(async browser => {
  assert.equal(await browser.evaluate('toggle().getAttribute("aria-expanded")'), 'false')
  await browser.evaluate('toggle().focus()')
  for (const [key, code, keyCode] of [['Enter', 'Enter', 13], [' ', 'Space', 32]]) {
    await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text: key === 'Enter' ? '\r' : ' ' })
    await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode })
    await browser.evaluate('flush()')
    assert.equal(await browser.evaluate('toggle().getAttribute("aria-expanded")'), key === 'Enter' ? 'true' : 'false')
  }
  await browser.evaluate('toggle().click();flush();runtime.dispose();runtime=installCodexInboxRuntime({storage,host,window});update();flush()')
  assert.equal(await browser.evaluate('toggle().textContent==="Working 2"&&region().hidden&&toggle().getAttribute("aria-expanded")==="false"'), true)
  await browser.evaluate('update({liveStatusKnown:false});flush()')
  assert.equal(await browser.evaluate('toggle().hidden&&shelf().length===0&&main().length===7&&nav.length===0'), true)
}, true))

test('shipping shelf immediately releases questions, completion, errors, idle and unknown into main', () => fixture(async browser => {
  await browser.evaluate('toggle().click();flush();event("work","clarify.request",{prompt_id:"ask"});flush()')
  assert.equal(await browser.evaluate('main().includes("work")&&row("work").dataset.workState==="needs-input"&&toggle().textContent==="Working 1"'), true, 'question outranks three live children')
  await browser.evaluate('event("work","clarify.settled",{prompt_id:"ask"});flush()')
  assert.equal(await browser.evaluate('shelf().includes("work")&&toggle().textContent==="Working 2"'), true)
  await browser.evaluate('event("work","approval.request",{request_id:"approve"});flush()')
  assert.equal(await browser.evaluate('main().includes("work")&&row("work").dataset.workState==="needs-input"'), true)
  await browser.evaluate('event("work","approval.settled",{request_id:"approve"});flush()')
  assert.equal(await browser.evaluate('shelf().includes("work")'), true)
  await browser.evaluate(`for(const child of ['a','b','c'])event('work','subagent.complete',{subagent_id:child});event('work','message.complete',{status:'complete'});flush()`)
  assert.equal(await browser.evaluate('main().includes("work")&&row("work").dataset.workState==="completed"'), true)
  await browser.evaluate(`event('work','message.start');flush();event('work','error');flush()`)
  assert.equal(await browser.evaluate('main().includes("work")&&row("work").dataset.workState==="unknown"'), true)
  await browser.evaluate(`event('work','message.start');flush();update({liveSessions:input.liveSessions.map(s=>s.session_id==='work'?{...s,status:'idle'}:s)});flush()`)
  assert.equal(await browser.evaluate('main().includes("work")&&row("work").dataset.workState!=="working"'), true)
  await browser.evaluate('update({liveStatusKnown:false});flush()')
  assert.equal(await browser.evaluate('toggle().hidden&&main().length===7&&shelf().length===0&&nav.length===0'), true)
}, true))

test('shipping shelf excludes Settle/Snooze/foreign rows, keeps fresh row actions, and fences old shelf handles', () => fixture(async browser => {
  await browser.evaluate('toggle().click();flush();row("work").querySelector("[data-codex-inbox-settle]").click();flush()')
  assert.equal(await browser.evaluate('!row("work")&&runtime.model.isManualSettled(scope,rows[0])&&toggle().textContent==="Working 1"'), true)
  await browser.evaluate('runtime.snooze(rows[2],now+60000);flush()')
  assert.equal(await browser.evaluate('!row("child")&&runtime.model.isSnoozed(scope,rows[2])&&toggle().hidden&&shelf().length===0'), true)
  await browser.evaluate(`window.before=attention();mode(false);flush();mode(true);flush()`)
  assert.equal(await browser.evaluate('before===attention()&&!row("work")&&!row("child")&&nav.length===0'), true)
  await browser.evaluate(`update({sessions:rows.map(s=>s.id==='question'?{...s,profile:'foreign'}:s)});flush()`)
  assert.equal(await browser.evaluate('!row("question")'), true)
  await browser.evaluate(`window.oldToggle=toggle();runtime.dispose();runtime=installCodexInboxRuntime({storage,host,window});update();flush();oldToggle.click();flush()`)
  assert.equal(await browser.evaluate('toggle()!==oldToggle&&toggle().getAttribute("aria-expanded")==="false"&&nav.length===0'), true)
  await browser.evaluate(`runtime.model.unsettle(scope,rows[0]);update({sessions:rows});flush()`)
  assert.equal(await browser.evaluate('!!row("work")'), true)
  await browser.evaluate(`window.staleAction=row('work').querySelector('[data-codex-inbox-settle]');update({sessions:rows.filter(s=>s.id!=='work')});staleAction.click();flush()`)
  assert.equal(await browser.evaluate('!runtime.model.isSettled(scope,rows[0])&&!row("work")'), true, 'actions resolve latest metadata, not the object captured before grouping')
}, true))
