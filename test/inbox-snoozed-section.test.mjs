import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

const bundle = (await readFile(process.env.CODEX_INBOX_TEST_BUNDLE || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')

for (const [zone, dates] of [
  ['Europe/Paris', [
    ['2026-03-28T12:00:00+01:00', '2026-03-29T09:00:00+02:00', '2026-03-30T09:00:00+02:00'],
    ['2026-10-24T12:00:00+02:00', '2026-10-25T09:00:00+01:00', '2026-10-26T09:00:00+01:00']]],
  ['America/New_York', [
    ['2026-03-07T12:00:00-05:00', '2026-03-08T09:00:00-04:00', '2026-03-09T09:00:00-04:00'],
    ['2026-10-31T12:00:00-04:00', '2026-11-01T09:00:00-05:00', '2026-11-02T09:00:00-05:00']]],
  ['UTC', [
    ['2026-10-26T08:00:00Z', '2026-10-27T09:00:00Z', '2026-11-02T09:00:00Z'],
    ['2026-10-26T10:00:00Z', '2026-10-27T09:00:00Z', '2026-11-02T09:00:00Z'],
    ['2026-12-31T23:59:00Z', '2027-01-01T09:00:00Z', '2027-01-04T09:00:00Z']]]
]) {
  test(`shipping snooze deadlines use local calendar days and next Monday (${zone})`, () => {
    // Execute the actual shipped helper with the process timezone, not a fake Date.
    const script = `${bundle}\nconst cases=${JSON.stringify(dates)};console.log(JSON.stringify(cases.map(([now])=>codexInboxSnoozeOptions(Date.parse(now)))));`
    const result = spawnSync(process.execPath, ['--input-type=module'], { input: script, env: { ...process.env, TZ: zone }, encoding: 'utf8', maxBuffer: 1024 * 1024 })
    assert.equal(result.status, 0, result.stderr)
    const results = JSON.parse(result.stdout)
    for (const [index, options] of results.entries()) {
      const [now, tomorrow, week] = dates[index]
      assert.deepEqual(options.map(o => o.label), ['In 1 hour', 'In 3 hours', 'Tomorrow', 'Next week'])
      assert.deepEqual(options.map(o => o.until), [Date.parse(now) + 3600000, Date.parse(now) + 10800000, Date.parse(tomorrow), Date.parse(week)])
      assert.ok(options.every(o => o.until > Date.parse(now) && o.indicator.length > 0))
      assert.match(options[3].indicator, /Mon/)
    }
  })
}

async function fixture(run) {
  const browser = await chromium()
  try {
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true })
    await browser.call('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' })
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><html data-codex-chat-look="true"><style>
      :root{--ui-text-primary:#222;--ui-text-secondary:#555;--ui-text-tertiary:#777;--ui-bg-elevated:#fff;--ui-stroke-secondary:#999}
      body{margin:0;font:14px Arial}aside{width:280px;height:600px;display:flex;flex-direction:column}
      </style><aside data-sessions-mode="sessions"><div id="native" data-slot="sidebar-group"><button>Sessions</button><div data-slot="sidebar-group-content">Native history</div></div></aside></html>` })
    await browser.evaluate(`window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';`)
    await browser.evaluate(bundle)
    await browser.evaluate(`(() => {
      window.now=Date.parse('2026-10-24T12:00:00+02:00');Date.now=()=>now;
      window.scope={connectionId:'source-a',profile:'default'};window.other={connectionId:'source-b',profile:'default'};
      window.atom=v=>({get:()=>v,subscribe:()=>()=>{},set:n=>v=n});
      window.nav=[];window.host={state:{focusedStoredSessionId:atom(null),focusedSessionOwner:atom(scope)},openSession:(id,options)=>nav.push({id,options}),request:()=>{throw Error('No agent or native mutation allowed')}};
      window.data=new Map();window.storage={get:k=>structuredClone(data.get(k)),set:(k,v)=>data.set(k,structuredClone(v))};
      let serial=0;const frames=new Map(),timers=new Map();
      window.scheduler={MutationObserver,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id),setTimeout:(fn,delay)=>{timers.set(++serial,{fn,at:now+delay});return serial},clearTimeout:id=>timers.delete(id)};
      window.flush=async()=>{for(let i=0;i<20;i++){await Promise.resolve();if(!frames.size)return;const todo=[...frames.values()];frames.clear();todo.forEach(fn=>fn())}throw Error('RAF loop')};
      window.advance=async ms=>{now+=ms;for(const [id,t]of [...timers])if(t.at<=now&&timers.delete(id))t.fn();await flush()};
      window.nativeBefore=document.getElementById('native').outerHTML;
      window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
      window.rows=['idle','work','sleep','history'].map(id=>({id,title:id,source:'desktop',...scope,message_count:2,started_at:1}));
      // Retain the actual shipping listeners to exercise stale callbacks too.
      window.clickHandlers=new WeakMap();const listen=EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener=function(type,handler,...rest){if(type==='click'){const handlers=clickHandlers.get(this)||[];handlers.push(handler);clickHandlers.set(this,handlers)}return listen.call(this,type,handler,...rest)};
      window.runtime=installCodexInboxRuntime({storage,host,window:scheduler});
      runtime.admission.observe(scope,rows,{workingSessions:rows.slice(0,3)});
      window.input={scope,sessions:rows,liveSessions:[{session_id:'work',status:'working'}],liveStatusKnown:true};
      window.update=extra=>runtime.update(input={...input,...extra});update({});
      window.row=id=>document.querySelector('[data-codex-inbox-row="'+id+'"]');
      window.toggle=kind=>document.querySelector('[data-codex-inbox-'+kind+'-toggle]');
      window.region=kind=>document.querySelector('[data-codex-inbox-'+kind+'-rows]');
      window.ids=kind=>[...region(kind).children].map(el=>el.getAttribute('data-codex-inbox-row'));
      window.main=()=>[...row('idle').parentElement.children].filter(el=>el.hasAttribute('data-codex-inbox-row')).map(el=>el.getAttribute('data-codex-inbox-row'));
      window.popup=()=>document.querySelector('[data-codex-inbox-snooze-popup]');
      window.rect=el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};
      window.actions=id=>[...row(id).querySelector('[data-row-actions]').children];
      window.paint=id=>actions(id).map(el=>{getComputedStyle(el).opacity;el.getAnimations().forEach(a=>a.finish());return [getComputedStyle(el).opacity,getComputedStyle(el).pointerEvents]});
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

test('shipping four-option menu shows right-aligned local indicators and commits the displayed DST deadline', () => fixture(async browser => {
  await browser.evaluate(`row('idle').querySelector('[data-codex-inbox-snooze]').click();flush()`)
  assert.deepEqual(await browser.evaluate('[...popup().children].map(b=>b.firstElementChild.textContent)'), ['In 1 hour', 'In 3 hours', 'Tomorrow', 'Next week'])
  assert.equal(await browser.evaluate(`popup().children.length===4&&!popup().querySelector('input,select,form')&&[...popup().children].every(b=>{const r=b.getBoundingClientRect(),v=b.lastElementChild.getBoundingClientRect();return v.right<=r.right&&Math.abs(v.right-(r.right-8))<1&&v.left>b.firstElementChild.getBoundingClientRect().right})`), true)
  const deadline = await browser.evaluate(`codexInboxSnoozeOptions(now)[2].until`)
  await browser.evaluate('popup().children[2].click();flush()')
  assert.equal(await browser.evaluate(`runtime.model.snoozedUntil(scope,'idle')`), deadline)
  assert.equal(await browser.evaluate(`!popup()&&row('idle').parentElement===region('snoozed')&&region('snoozed').hidden&&nav.length===0`), true)
}))

test('shipping Snoozed follows Working, opens without waking, cancels into current activity and retains action geometry', () => fixture(async browser => {
  await browser.evaluate(`window.original=row('sleep');runtime.snooze(rows[2],now+60000);flush()`)
  assert.equal(await browser.evaluate(`toggle('working').textContent==='Working 1'&&!toggle('working').hidden&&toggle('snoozed').textContent==='Snoozed 1'&&region('working').nextElementSibling===toggle('snoozed')`), true)
  await browser.evaluate(`runtime.snooze(rows[1],now+60000);flush()`)
  assert.deepEqual(await browser.evaluate(`({ids:ids('snoozed'),label:toggle('snoozed').textContent,expanded:toggle('snoozed').getAttribute('aria-expanded'),hidden:region('snoozed').hidden})`), { ids:['work','sleep'], label:'Snoozed 2', expanded:'false', hidden:true })
  assert.equal(await browser.evaluate(`region('working').nextElementSibling===toggle('snoozed')&&toggle('snoozed').nextElementSibling===region('snoozed')&&!row('history')&&row('sleep')===original`), true)
  await browser.evaluate(`toggle('snoozed').focus()`)
  for (const type of ['keyDown', 'keyUp']) await browser.call('Input.dispatchKeyEvent', { type, key:'Enter',code:'Enter',windowsVirtualKeyCode:13, ...(type==='keyDown'?{text:'\r'}:{}) })
  await browser.evaluate('flush()')
  assert.equal(await browser.evaluate(`!region('snoozed').hidden`), true)
  await browser.evaluate(`row('sleep').querySelector('[data-codex-inbox-open]').click();flush()`)
  assert.equal(await browser.evaluate(`nav.length===1&&nav[0].id==='sleep'&&runtime.model.isSnoozed(scope,'sleep')&&row('sleep').parentElement===region('snoozed')`), true)
  await browser.evaluate('document.activeElement.blur()')
  assert.deepEqual(await browser.evaluate(`paint('sleep')`), [['0','none'],['0','none']])
  assert.equal(await browser.evaluate(`!row('sleep').querySelector('[data-codex-inbox-settle]')&&row('sleep').querySelector('[data-codex-inbox-cancel-snooze]').getAttribute('aria-label')==='Cancel snooze for sleep'`), true)
  const geometry = await browser.evaluate(`actions('sleep').map(rect)`)
  const p = await browser.evaluate(`(()=>{const r=row('sleep').getBoundingClientRect();return {x:r.x+10,y:r.y+10}})()`)
  await browser.call('Input.dispatchMouseEvent', {type:'mouseMoved',...p})
  assert.deepEqual(await browser.evaluate(`paint('sleep')`), [['0','none'],['1','auto']])
  assert.deepEqual(await browser.evaluate(`actions('sleep').map(rect)`), geometry)
  await browser.call('Input.dispatchMouseEvent', {type:'mouseMoved',x:700,y:500})
  await browser.evaluate(`row('sleep').querySelector('[data-codex-inbox-cancel-snooze]').focus()`)
  assert.deepEqual(await browser.evaluate(`paint('sleep')`), [['0','none'],['1','auto']])
  await browser.evaluate(`row('sleep').querySelector('[data-codex-inbox-cancel-snooze]').click();flush()`)
  assert.equal(await browser.evaluate(`!runtime.model.isSnoozed(scope,'sleep')&&row('sleep').parentElement!==region('snoozed')&&!!row('sleep').querySelector('[data-codex-inbox-settle]')&&nav.length===1&&row('sleep')===original`), true)
  await browser.evaluate(`row('work').querySelector('[data-codex-inbox-cancel-snooze]').click();flush()`)
  assert.deepEqual(await browser.evaluate(`ids('working')`), ['work'])
  assert.equal(await browser.evaluate(`toggle('snoozed').hidden&&region('snoozed').hidden&&ids('snoozed').length===0&&nav.length===1`), true)
}))

test('shipping expiry partitions idle and running rows, aliases count once, reload persists and Off fences stale actions', () => fixture(async browser => {
  await browser.evaluate(`runtime.snooze(rows[1],now+1000);runtime.snooze(rows[2],now+1000);update({sessions:[...rows,{...rows[2],id:'tip',_lineage_root_id:'sleep',_lineage_ids:['sleep','tip']},{...rows[2],id:'foreign',connectionId:other.connectionId}]});flush();window.deadline=runtime.model.snoozedUntil(scope,'sleep')`)
  assert.deepEqual(await browser.evaluate(`ids('snoozed')`), ['work','sleep'])
  await browser.evaluate(`runtime.dispose();runtime=installCodexInboxRuntime({storage,host,window:scheduler});update({});flush()`)
  assert.equal(await browser.evaluate(`runtime.model.snoozedUntil(scope,'sleep')===deadline&&region('snoozed').hidden&&toggle('snoozed').textContent==='Snoozed 2'`), true)
  await browser.evaluate(`window.stale=row('sleep').querySelector('[data-codex-inbox-cancel-snooze]');window.staleToggle=toggle('snoozed');window.before=JSON.stringify([...data]);runtime.setMode(false);stale.click();staleToggle.click();flush()`)
  assert.equal(await browser.evaluate(`!document.querySelector('[data-codex-inbox-owned]')&&before===JSON.stringify([...data])&&runtime.model.isSnoozed(scope,'sleep')`), true)
  await browser.evaluate(`runtime.setMode(true);flush();advance(1000)`)
  assert.deepEqual(await browser.evaluate(`ids('working')`), ['work'])
  assert.equal(await browser.evaluate(`row('sleep').parentElement!==region('snoozed')&&toggle('snoozed').hidden&&ids('snoozed').length===0&&nav.length===0`), true)
}))

test('shipping cancellation failures preserve snooze; foreign and detached actions cannot mutate another owner', () => fixture(async browser => {
  await browser.evaluate(`runtime.snooze(rows[2],now+60000);flush().then(()=>{window.savedSet=storage.set;storage.set=()=>{};row('sleep').querySelector('[data-codex-inbox-cancel-snooze]').click();return flush()})`)
  assert.equal(await browser.evaluate(`runtime.model.isSnoozed(scope,'sleep')&&ids('snoozed').includes('sleep')&&!!runtime.model.error&&nav.length===0`), true)
  assert.equal(await browser.evaluate(`runtime.cancelSnooze({...rows[2],connectionId:other.connectionId})`), false)
  await browser.evaluate(`storage.set=savedSet;window.old=row('sleep').querySelector('[data-codex-inbox-cancel-snooze]');update({scope:other,sessions:[]});flush();old.click();flush()`)
  assert.equal(await browser.evaluate(`runtime.model.isSnoozed(scope,'sleep')&&!runtime.model.isSettled(other,'sleep')&&nav.length===0`), true)
}))

test('shipping selection measures relative duration at click, not when the menu was opened', () => fixture(async browser => {
  await browser.evaluate(`row('idle').querySelector('[data-codex-inbox-snooze]').click();advance(600000)`)
  await browser.evaluate(`popup().children[0].click();flush()`)
  assert.equal(await browser.evaluate(`runtime.model.snoozedUntil(scope,'idle')===now+3600000`), true)
}))

test('shipping cancellation uses activity changed during snooze without navigation or restarting work', () => fixture(async browser => {
  await browser.evaluate(`runtime.snooze(rows[2],now+60000);runtime.snooze(rows[1],now+60000);runtime.activity({type:'message.start',...scope,session_id:'sleep'});now+=100;update({liveStatusAt:now,liveSessions:[{session_id:'work',status:'idle'},{session_id:'sleep',status:'working'}]});flush()`)
  assert.deepEqual(await browser.evaluate(`ids('snoozed')`), ['work','sleep'])
  await browser.evaluate(`row('sleep').querySelector('[data-codex-inbox-cancel-snooze]').click();row('work').querySelector('[data-codex-inbox-cancel-snooze]').click();flush()`)
  assert.deepEqual(await browser.evaluate(`ids('working')`), ['sleep'])
  assert.equal(await browser.evaluate(`row('work').parentElement!==region('working')&&row('work').parentElement!==region('snoozed')&&nav.length===0`), true)
}))

async function key(browser, value, code, number) {
  for (const type of ['keyDown', 'keyUp']) await browser.call('Input.dispatchKeyEvent', { type, key:value, code, windowsVirtualKeyCode:number, ...(type==='keyDown'&&value==='Enter'?{text:'\r'}:{}) })
  await browser.evaluate('flush()')
}

async function pointerClick(browser, selector) {
  const p = await browser.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  for (const type of ['mouseMoved','mousePressed','mouseReleased']) await browser.call('Input.dispatchMouseEvent', {type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})})
  await browser.evaluate('flush()')
}

test('shipping snoozed rows reserve an inert clock slot and reject pointer, keyboard, programmatic and retained Snooze actions', () => fixture(async browser => {
  await browser.evaluate(`window.original=row('sleep');window.clock=original.querySelector('[data-codex-inbox-snooze]');
    window.shape=()=>{const r=original.getBoundingClientRect();return [original.firstElementChild,...actions('sleep')].map(el=>{const b=el.getBoundingClientRect();return [b.x-r.x,b.y-r.y,b.width,b.height]})};window.beforeShape=shape();
    window.writes=0;const save=storage.set;storage.set=(k,v)=>{writes++;save(k,v)};
    clock.click();popup().children[0].click();flush().then(()=>{toggle('snoozed').click();return flush()}).then(()=>{window.saved=JSON.stringify([...data]);window.savedWrites=writes;window.deadline=runtime.model.snoozedUntil(scope,'sleep')})`)
  assert.deepEqual(await browser.evaluate('shape()'), await browser.evaluate('beforeShape'), 'Snooze and restore retain the original row slots')
  await pointerClick(browser, '[data-codex-inbox-row="sleep"] [data-codex-inbox-snooze]')
  assert.equal(await browser.evaluate(`!popup()&&clock.disabled&&clock.inert&&clock.tabIndex===-1&&clock.getAttribute('aria-hidden')==='true'&&getComputedStyle(clock).visibility==='hidden'&&getComputedStyle(clock).pointerEvents==='none'`), true, 'hover cannot reveal or activate the snoozed clock')
  await browser.evaluate(`original.firstElementChild.focus();clock.focus()`)
  assert.equal(await browser.evaluate('document.activeElement===original.firstElementChild'), true, 'programmatic focus cannot enter the snoozed clock')
  await key(browser, 'Tab', 'Tab', 9)
  assert.equal(await browser.evaluate(`document.activeElement===original.querySelector('[data-codex-inbox-cancel-snooze]')&&getComputedStyle(clock).visibility==='hidden'`), true, 'keyboard order skips Snooze and exposes only restore')
  await browser.evaluate(`clock.click();clock.dispatchEvent(new MouseEvent('click',{bubbles:true}));for(const handler of clickHandlers.get(clock))handler.call(clock,new MouseEvent('click'));flush()`)
  assert.equal(await browser.evaluate(`runtime.snooze(rows[2],now+10800000)===false&&!popup()&&saved===JSON.stringify([...data])&&writes===savedWrites&&runtime.model.snoozedUntil(scope,'sleep')===deadline&&ids('snoozed').join()==='sleep'&&nav.length===0`), true, 'all invocation paths preserve the exact stored decision without duplicate writes')
  await key(browser, 'Enter', 'Enter', 13)
  assert.equal(await browser.evaluate(`row('sleep')===original&&!runtime.model.isSnoozed(scope,'sleep')&&!clock.disabled&&!clock.inert&&clock.tabIndex===0&&!clock.hasAttribute('aria-hidden')&&getComputedStyle(clock).visibility==='visible'`), true, 'restore re-enables Snooze on the same keyed row')
  assert.deepEqual(await browser.evaluate('shape()'), await browser.evaluate('beforeShape'))
  await browser.evaluate(`clock.click();popup().children[0].click();flush();advance(3600000)`)
  assert.equal(await browser.evaluate(`!runtime.model.isSnoozed(scope,'sleep')&&!clock.disabled&&!clock.inert&&clock.tabIndex===0&&getComputedStyle(clock).visibility==='visible'`), true, 'expiry also restores clock eligibility')
  await browser.evaluate(`clock.focus()`)
  await key(browser, 'Enter', 'Enter', 13)
  assert.equal(await browser.evaluate('!!popup()&&popup().children.length===4'), true, 'the restored clock can open all four presets again')
}))

test('shipping retained open menu cannot renew a thread snoozed externally before or after repaint', () => fixture(async browser => {
  await browser.evaluate(`window.clock=row('sleep').querySelector('[data-codex-inbox-snooze]');clock.click();window.menu=popup();window.choice=menu.children[1];window.handlers=clickHandlers.get(choice);
    runtime.model.snooze(scope,rows[2],now+60000);window.saved=JSON.stringify([...data]);window.deadline=runtime.model.snoozedUntil(scope,'sleep');
    window.writes=0;const save=storage.set;storage.set=(k,v)=>{writes++;save(k,v)};
    choice.click();for(const handler of handlers)handler.call(choice,new MouseEvent('click'));
    clock.click();clock.dispatchEvent(new MouseEvent('click'));for(const handler of clickHandlers.get(clock))handler.call(clock,new MouseEvent('click'));`)
  assert.equal(await browser.evaluate(`!popup()&&saved===JSON.stringify([...data])&&writes===0&&runtime.model.snoozedUntil(scope,'sleep')===deadline`), true, 'stale menu and still-enabled clock callbacks cannot replace the external deadline even before render')
  await browser.evaluate(`flush().then(()=>{runtime.cancelSnooze(rows[2]);return flush()}).then(()=>{
    clock.click();window.menu=popup();window.choice=menu.children[1];window.handlers=clickHandlers.get(choice);
    runtime.model.snooze(scope,rows[2],now+60000);window.saved=JSON.stringify([...data]);window.deadline=runtime.model.snoozedUntil(scope,'sleep');writes=0;return flush()
  })`)
  assert.equal(await browser.evaluate('!popup()&&!menu.isConnected'), true, 'repaint alone dismisses the externally invalidated menu')
  await browser.evaluate(`choice.click();for(const handler of handlers)handler.call(choice,new MouseEvent('click'));clock.dispatchEvent(new MouseEvent('click'));for(const handler of clickHandlers.get(clock))handler.call(clock,new MouseEvent('click'));flush()`)
  assert.equal(await browser.evaluate(`!popup()&&saved===JSON.stringify([...data])&&writes===0&&runtime.model.snoozedUntil(scope,'sleep')===deadline&&ids('snoozed').join()==='sleep'&&nav.length===0`), true, 'detached menu and retained clock callbacks cannot reopen or renew Snooze')
}))

test('shipping snoozed alias replacement keeps one row and resolves opening and cancellation to fresh durable metadata', () => fixture(async browser => {
  await browser.evaluate(`runtime.snooze(rows[2],now+60000);flush().then(()=>{window.original=row('sleep');update({sessions:rows.map(s=>s.id==='sleep'?{...s,id:'tip',_lineage_root_id:'sleep',_lineage_ids:['sleep','tip']}:s)});return flush()})`)
  assert.equal(await browser.evaluate(`ids('snoozed').length===1&&row('tip')===original&&runtime.model.isSnoozed(scope,'tip')&&!row('sleep')`), true)
  await browser.evaluate(`toggle('snoozed').click();flush().then(()=>{row('tip').querySelector('[data-codex-inbox-open]').click();return flush()})`)
  assert.equal(await browser.evaluate(`nav.length===1&&nav[0].id==='tip'&&runtime.model.isSnoozed(scope,'sleep')`), true)
  await browser.evaluate(`row('tip').querySelector('[data-codex-inbox-cancel-snooze]').click();flush()`)
  assert.equal(await browser.evaluate(`!runtime.model.isSnoozed(scope,'tip')&&!runtime.model.isSnoozed(scope,'sleep')&&row('tip')===original&&row('tip').parentElement!==region('snoozed')&&nav.length===1`), true)
}))
