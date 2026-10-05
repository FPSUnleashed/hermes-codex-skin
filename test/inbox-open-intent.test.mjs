import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { chromium } from './helpers/chromium.mjs'

const runtimeSource = await readFile(new URL('../src/inbox-row-ui.js', import.meta.url), 'utf8') + '\n' + await readFile(new URL('../src/inbox-runtime.js', import.meta.url), 'utf8')
const querySource = await readFile(new URL('../src/inbox-query.js', import.meta.url), 'utf8')
const gestureSource = await readFile(new URL('../src/inbox-open-gesture.js', import.meta.url), 'utf8')
const openSource = await readFile(new URL('../src/inbox-open-intent.js', import.meta.url), 'utf8')

function modelFixture() {
  const data = new Map(), scope = { connectionId: 'source-A', profile: 'default' }
  const storage = { get: key => data.get(key), set: (key, value) => data.set(key, structuredClone(value)) }
  const context = vm.createContext({ Date, JSON })
  vm.runInContext(runtimeSource + '\nglobalThis.factories={createCodexInboxModel,createCodexInboxAdmission}', context)
  const { createCodexInboxModel, createCodexInboxAdmission } = context.factories
  const model = createCodexInboxModel(storage), admission = createCodexInboxAdmission(storage, model)
  return { data, storage, scope, model, admission, createCodexInboxAdmission }
}

test('an explicit old-chat open never admits; hydration and list reads stay excluded', () => {
  const f = modelFixture(), old = { id: 'old', profile: 'default', started_at: 1, message_count: 4 }
  f.admission.observe(f.scope, [old])
  assert.equal(f.admission.isEligible(f.scope, old), false)
  f.admission.observe(f.scope, [old], { liveSessions: [{ session_id: 'old', status: 'resuming' }] })
  assert.equal(f.admission.isEligible(f.scope, old), false)
  assert.equal(f.admission.observe(f.scope, [old], { explicitOpenedSessions: [old] }), true)
  assert.equal(f.admission.isEligible(f.scope, old), false)
  assert.deepEqual(Array.from(f.admission.explicitSessionIds(f.scope)), [])
  const reloaded = f.createCodexInboxAdmission(f.storage, f.model)
  assert.equal(reloaded.isEligible(f.scope, old), false)
  assert.deepEqual(Array.from(reloaded.explicitSessionIds({ connectionId: 'other', profile: 'default' })), [])
  const before = JSON.stringify(f.data.get('inbox-admission-v1'))
  reloaded.observe(f.scope, [old], { explicitOpenedSessions: [{ id: 'foreign', profile: 'other' }] })
  assert.equal(reloaded.isEligible(f.scope, 'foreign'), false)
  assert.equal(JSON.stringify(f.data.get('inbox-admission-v1')), before)
})

test('reopen clears Settle and Snooze atomically, and a silent write does not claim success', () => {
  const f = modelFixture(), old = { id: 'old', message_count: 4 }
  f.model.settle(f.scope, old)
  f.model.snooze(f.scope, old, Date.now() + 60_000)
  f.storage.set = () => {}
  assert.equal(f.model.reopen(f.scope, old), false)
  assert.equal(f.model.isSettled(f.scope, old), true)
  assert.equal(f.model.isSnoozed(f.scope, old), true)
  f.storage.set = (key, value) => f.data.set(key, structuredClone(value))
  assert.equal(f.model.reopen(f.scope, old), true)
  assert.equal(f.model.isSettled(f.scope, old), false)
  assert.equal(f.model.isSnoozed(f.scope, old), false)
  const reloaded = f.createCodexInboxAdmission(f.storage, f.model)
  assert.equal(reloaded.isEligible(f.scope, old), false, 'the plain model does not invent an admission bridge')
})

test('exact metadata follows compaction lineage and validates managed-SSH profile translation', async () => {
  const scope = { connectionId: 'source-A', profile: 'desktop-alias' }, calls = []
  const context = vm.createContext({
    URLSearchParams, ID: 'fixture',
    host: { profileRoutes: async () => [{ ...scope, targetProfile: 'default' }] },
    window: { hermesDesktop: { api: async options => {
      calls.push(options)
      return options.path.includes('latest-descendant')
        ? { requested_session_id: 'root', session_id: 'tip', path: ['root', 'tip'] }
        : { id: 'tip', profile: 'default', title: 'Continuation', message_count: 8 }
    } } }
  })
  vm.runInContext(querySource + '\n' + openSource + '\nglobalThis.readOpened=readCodexInboxOpenedSession', context)
  const row = await context.readOpened({ id: 'root', scope }, { followLineage: true })
  assert.equal(row.id, 'tip')
  assert.equal(row.profile, 'desktop-alias')
  assert.equal(row.connection_id, 'source-A')
  assert.equal(row._lineage_ids.join(','), 'root,tip')
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.profile === 'desktop-alias' && call.connectionId === 'source-A'))
  assert.ok(calls[1].path.startsWith('/api/sessions/tip?'))
  await assert.rejects(context.readOpened({ id: 'unrelated', scope }, { expectedRootId: 'root' }), /clicked row/)
})

test('metadata is rejected if its owner or the current scope changes during the read', async () => {
  const scope = { connectionId: 'source-A', profile: 'default' }
  let current = true, response = { id: 'old', profile: 'foreign' }, changeDuringRead = false
  const context = vm.createContext({
    URLSearchParams, ID: 'fixture', host: {},
    window: { hermesDesktop: { api: async () => { if (changeDuringRead) current = false; return response } } }
  })
  vm.runInContext(querySource + '\n' + openSource + '\nglobalThis.readOpened=readCodexInboxOpenedSession', context)
  await assert.rejects(context.readOpened({ id: 'old', scope }), /owner could not be verified/)
  response = { id: 'old', profile: 'default' }; changeDuringRead = true
  await assert.rejects(context.readOpened({ id: 'old', scope }, { stillCurrent: () => current }), /owner changed/)
})

test('an unchanged-focus open proves this exact row owner across mixed rosters and rejects duplicate ids', async () => {
  const scope = { connectionId: 'source-A', profile: 'default' }
  let duplicate = false, reachable = true
  const context = vm.createContext({
    URLSearchParams, ID: 'fixture', host: {},
    window: { hermesDesktop: {
      getAgentRoster: async () => ({ sources: [{ connectionId: 'source-A', reachable: true }, { connectionId: 'source-B', reachable }], agents: [scope, { connectionId: 'source-B', profile: 'default' }] }),
      api: async options => {
        if (options.connectionId === 'source-B' && !duplicate) throw Object.assign(new Error('HTTP 404'), { status: 404 })
        return { id: 'old', profile: 'default', title: 'Old metadata only' }
      }
    } }
  })
  vm.runInContext(querySource + '\n' + openSource + '\nglobalThis.verifyOwner=codexInboxUnchangedOpenOwner', context)
  assert.equal(await context.verifyOwner('old', scope, () => true), true)
  duplicate = true
  assert.equal(await context.verifyOwner('old', scope, () => true), false, 'homonymous sessions from different sources cannot use the focused owner as row proof')
  reachable = false; duplicate = false
  assert.equal(await context.verifyOwner('old', scope, () => true), false, 'incomplete source enumeration cannot prove uniqueness')
})

function browserFixture(middleHelper = null) {
  return `<!doctype html><html data-codex-chat-look="true"><body>
    <div data-sessions-mode="sessions"><section data-slot="sidebar-group"><div class="group/section"><button class="group/section-label">Sessions</button></div><div data-slot="sidebar-group-content"><div id="native-old" class="row-hover"><button id="old-button" data-slot="row-button">Old chat</button><div data-row-actions><button id="pin-button">Pin</button></div></div></div></section></div>
    <script>
    const ID='test-inbox', data=new Map(), pluginStorage={get:(key,fallback)=>data.get(key)??fallback,set:(key,value)=>data.set(key,structuredClone(value))};
    const scope={connectionId:'source-A',profile:'default'}, other={connectionId:'source-B',profile:'default'};
    function atom(value){const listeners=new Set();return{get:()=>value,set:next=>{value=next;for(const fn of [...listeners])fn()},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}}
    const old={id:'old',title:'Old chat',profile:'default',started_at:1,message_count:4};
    const recent={id:'recent',title:'Recent history',profile:'default',started_at:2,message_count:1};
    const calls=[],notices=[];let clicks=0,pins=0;
    const host={state:{connectionId:atom(scope.connectionId),profile:atom(scope.profile),focusedStoredSessionId:atom('recent'),focusedSessionOwner:atom(scope)},request:async()=>({sessions:[]}),notify:n=>notices.push(n)};
    window.hermesDesktop={api:async options=>{calls.push(options);const url=new URL(options.path,'http://test');return url.pathname==='/api/sessions'?{total:1,sessions:[recent]}:url.pathname.endsWith('/latest-descendant')?{requested_session_id:'old',session_id:'old',path:['old']}:{...old}},getAgentRoster:async()=>({sources:[{connectionId:scope.connectionId,reachable:true}],agents:[scope]})};
    ${runtimeSource.replaceAll('</script', '<\\/script')}
    ${querySource.replaceAll('</script', '<\\/script')}
    ${gestureSource.replaceAll('</script', '<\\/script')}
    ${openSource.replaceAll('</script', '<\\/script')}
    let runtime=installCodexInboxRuntime({storage:pluginStorage,host});
    function update(extra={}){runtime.update({scope,sessions:[old,recent],liveSessions:[],liveStatusKnown:true,...extra});runtime.rowOwnerEvidence={scope,ids:['old','recent']}}
    function focus(id){host.state.focusedStoredSessionId.set(id)}
    function present(){return !!document.querySelector('[data-codex-inbox-row="old"]')}
    async function flush(){await Promise.resolve();await Promise.resolve();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))}
    update();
    const native=document.getElementById('native-old'),nativeButton=document.getElementById('old-button');
    nativeButton.onclick=event=>{if(event.shiftKey){pins++;return}clicks++;focus('old')};
    ${middleHelper ? `const MIDDLE_BUTTON=1;let pressedOn=null;const nativeMiddle=(${middleHelper})(()=>{clicks++;focus('old')});nativeButton.onpointerdown=nativeMiddle.onPointerDown;nativeButton.onpointerup=nativeMiddle.onPointerUp;nativeButton.onmousedown=nativeMiddle.onMouseDown;` : ''}
    document.getElementById('pin-button').onclick=()=>pins++;
    let detach=bindCodexInboxNativeOpenIntent(native,'old',runtime);
    </script></body></html>`
}

async function click(browser, expression, modifiers = 0) {
  const position = await browser.evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, modifiers, ...position })
  await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, modifiers, ...position })
  await browser.evaluate('flush()')
}

async function installMenuFixture(browser) {
  await browser.evaluate(`
    window.menuCache={picker:[{...old,connection_id:scope.connectionId}],palette:[{...old,connection_id:scope.connectionId}]};
    window.queryClient={getQueryData:key=>({sessions:key[0]==='session-picker'?menuCache.picker:menuCache.palette})};
    const command=document.createElement('section');command.setAttribute('data-slot','command');
    const input=document.createElement('input');input.setAttribute('data-slot','command-input');input.id='menu-input';
    const item=document.createElement('div');item.id='menu-old';item.setAttribute('data-slot','command-item');item.setAttribute('data-selected','true');item.setAttribute('data-value','Old chat  old');item.textContent='Old chat';item.style.cssText='width:200px;height:26px';
    command.append(input,item);document.body.append(command);
    window.nativeMenuActions=0;window.nativeMenuOpen=()=>{nativeMenuActions++;focus('old')};
    item.onclick=()=>nativeMenuOpen();input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();nativeMenuOpen()}};
    window.menuDisposals=[];window.stopMenu=startCodexInboxMenuOpenObserver({onDispose:stop=>menuDisposals.push(stop)},runtime);
    flush()`)
}

test('real Chrome: a passive open metadata failure is silent and only verified later work admits the chat', async () => {
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: browserFixture() })
    await browser.evaluate("const nativeApi=window.hermesDesktop.api;window.hermesDesktop.api=async options=>{if(options.path.startsWith('/api/sessions/'))throw Error('Metadata temporarily unavailable');return nativeApi(options)}")
    await click(browser, 'document.getElementById("old-button")')
    assert.equal(await browser.evaluate('notices.length'), 0, 'opening is not an Inbox restore action and must not announce a failed restore')
    assert.equal(await browser.evaluate('present()'), false, 'an opened chat is not admitted by metadata failure or focus')
    await browser.evaluate("update({sessions:[{...old,source:'desktop'},recent]});flush()")
    assert.equal(await browser.evaluate('present()'), false, 'later passive metadata still cannot admit the chat')
    await browser.evaluate("update({sessions:[{...old,source:'desktop'},recent],liveSessions:[{...old,...scope,status:'working'}]});flush()")
    assert.equal(await browser.evaluate('present()'), true, 'later independently owned actual work can admit the chat without a false error')
    await browser.evaluate('detach();runtime.dispose()')
  } finally { browser.close() }
})

test('real Chrome: picker click and palette Enter preserve attention through toggle/reload and disposal', async () => {
  const browser = await chromium()
  try {
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true })
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: browserFixture() })
    await installMenuFixture(browser)
    await browser.evaluate("document.getElementById('menu-old').click();flush()")
    assert.equal(await browser.evaluate('present()'), false, 'a synthetic selection is not an open intent')
    await browser.evaluate("focus('recent');flush()")
    await click(browser, 'document.getElementById("menu-old")')
    assert.equal(await browser.evaluate('present()'), false)
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'recent')"), false)
    await browser.evaluate("runtime.model.settle(scope,old);runtime.model.snooze(scope,old,Date.now()+60000);document.getElementById('menu-old').setAttribute('data-value','Old chat\\u0001pinned-old');document.getElementById('menu-input').focus();flush()")
    await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
    await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await browser.evaluate('flush()')
    assert.equal(await browser.evaluate('present()'), false, 'Enter never reactivates a settled or snoozed chat')
    assert.equal(await browser.evaluate("runtime.model.isSettled(scope,'old')&&runtime.model.isSnoozed(scope,'old')"), true)
    await browser.evaluate("runtime.model.settle(scope,old);runtime.model.snooze(scope,old,Date.now()+60000);menuCache={picker:[],palette:[{...old,connection_id:other.connectionId}]};window.nativeMenuOpen=()=>{nativeMenuActions++;host.state.focusedSessionOwner.set(other);focus('old');update({scope:other,sessions:[]})};calls.length=0;flush()")
    await click(browser, 'document.getElementById("menu-old")')
    assert.equal(await browser.evaluate('present()'), false, 'opening another owner does not admit the same stored id')
    assert.equal(await browser.evaluate("runtime.model.isSettled(scope,'old')&&runtime.model.isSnoozed(scope,'old')"), true)
    assert.equal(await browser.evaluate("calls.length>0&&calls.every(call=>call.connectionId===other.connectionId&&call.profile===other.profile)"), true)
    await browser.evaluate("setCodexInboxMode('off',runtime);flush()")
    assert.equal(await browser.evaluate('present()'), false)
    await browser.evaluate("setCodexInboxMode('on',runtime);flush()")
    assert.equal(await browser.evaluate('present()'), false)
    await browser.evaluate('menuDisposals.forEach(stop=>stop());detach();runtime.dispose();runtime=installCodexInboxRuntime({storage:pluginStorage,host});update({scope:other,sessions:[]});flush()')
    await browser.evaluate('readCodexInboxPage(other,1,undefined,runtime).then(page=>{window.reloadedPage=page;update({...page,scope:other});return flush()})')
    assert.equal(await browser.evaluate('present()'), false, 'reload does not retrieve merely opened history')
    assert.equal(await browser.evaluate("runtime.admission.isEligible(other,'recent')"), false)
    await browser.evaluate('stopMenu=startCodexInboxMenuOpenObserver({onDispose:stop=>menuDisposals.push(stop)},runtime);menuDisposals.forEach(stop=>stop());menuDisposals.forEach(stop=>stop());runtime.model.settle(other,old);calls.length=0;flush()')
    const actions = await browser.evaluate('nativeMenuActions')
    await click(browser, 'document.getElementById("menu-old")')
    assert.equal(await browser.evaluate('nativeMenuActions'), actions + 1, 'the native handler is untouched by disposal')
    assert.equal(await browser.evaluate('present()'), false)
    assert.equal(await browser.evaluate('calls.length'), 0)
    await browser.evaluate('runtime.dispose()')
  } finally { browser.close() }
})

test('real Chrome: a palette open waits for its actual async target and refuses unverified API ownership', async () => {
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: browserFixture() })
    await installMenuFixture(browser)
    await browser.evaluate("document.getElementById('menu-old').setAttribute('data-value','Old chat\\u0001session-old');window.finishMenuOpen=null;window.nativeMenuOpen=()=>{nativeMenuActions++;window.finishMenuOpen=()=>focus('old')};flush()")
    await click(browser, 'document.getElementById("menu-old")')
    assert.equal(await browser.evaluate('present()'), false)
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'recent')"), false, 'the previous focus is never admitted for the selected target')
    await browser.evaluate('finishMenuOpen();flush()')
    assert.equal(await browser.evaluate('present()'), false)
    await browser.evaluate("runtime.model.settle(scope,old);runtime.model.snooze(scope,old,Date.now()+60000);window.hermesDesktop.api=async options=>{calls.push(options);return {...old,profile:'wrong-profile'}};window.nativeMenuOpen=()=>{nativeMenuActions++;focus('old')};calls.length=0;flush()")
    await click(browser, 'document.getElementById("menu-old")')
    assert.equal(await browser.evaluate('present()'), false)
    assert.equal(await browser.evaluate("runtime.model.isSettled(scope,'old')&&runtime.model.isSnoozed(scope,'old')"), true)
    assert.equal(await browser.evaluate('notices.length'), 0, 'a rejected passive metadata read never announces an Inbox restore action')
    await browser.evaluate('menuDisposals.forEach(stop=>stop());detach();runtime.dispose()')
  } finally { browser.close() }
})

test('real Chrome: native click and Enter do not admit or wake; controls and disposal remain intact', async () => {
  const browser = await chromium()
  try {
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true })
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: browserFixture() })
    await browser.evaluate('flush()')
    assert.equal(await browser.evaluate('present()'), false)
    await browser.evaluate("focus('old');flush()")
    assert.equal(await browser.evaluate('present()'), false, 'passive focus hydration is not a deliberate open')
    await browser.evaluate("focus('recent');nativeButton.click();flush()")
    assert.equal(await browser.evaluate('present()'), false, 'synthetic rehydration clicks are excluded')
    await browser.evaluate("focus('recent');flush()")
    await click(browser, 'nativeButton', 8)
    assert.equal(await browser.evaluate('present()'), false, 'shift/pin is not an open')
    await click(browser, 'document.getElementById("pin-button")')
    assert.equal(await browser.evaluate('present()'), false, 'trailing actions do not admit')
    await click(browser, 'nativeButton')
    assert.equal(await browser.evaluate('present()'), false)
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'recent')"), false, 'no neighboring history imported')
    assert.equal(await browser.evaluate("document.getElementById('old-button')===nativeButton"), true, 'native element and handler retained')
    assert.equal(await browser.evaluate("calls.filter(call=>call.path.startsWith('/api/sessions/')).length"), 1)
    await browser.evaluate("runtime.model.settle(scope,old);runtime.model.snooze(scope,old,Date.now()+60000);flush()")
    assert.equal(await browser.evaluate('present()'), false)
    await browser.evaluate('nativeButton.focus()')
    await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
    await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await browser.evaluate('flush()')
    assert.equal(await browser.evaluate('present()'), false)
    assert.equal(await browser.evaluate("runtime.model.isSettled(scope,'old')&&runtime.model.isSnoozed(scope,'old')"), true)
    assert.equal(await browser.evaluate('runtime.opened({explicit:true,scope:other,session:old})'), false)
    await browser.evaluate('detach();runtime.dispose();runtime=installCodexInboxRuntime({storage:pluginStorage,host});update({sessions:[]});flush()')
    await browser.evaluate('readCodexInboxPage(scope,1,undefined,runtime).then(result=>{update(result);return flush()})')
    assert.equal(await browser.evaluate('present()'), false, 'explicit older chat is not attention after reload')
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'recent')"), false)
    await browser.evaluate('runtime.model.settle(scope,old);flush()')
    await click(browser, 'nativeButton')
    assert.equal(await browser.evaluate('present()'), false, 'removed observer cannot admit')
    assert.equal(await browser.evaluate('notices.length'), 0)
    await browser.evaluate('runtime.dispose()')
  } finally { browser.close() }
})

test('real Chrome: native middle pointerup opens but never admits without work', async t => {
  const hostRoot = process.env.CODEX_INBOX_QUERY_CORE_ROOT
  if (!hostRoot) return t.skip('Set CODEX_INBOX_QUERY_CORE_ROOT for the exact native middle-click seam.')
  const { middleClickHandlers } = await import(`${hostRoot}/apps/desktop/src/lib/middle-click.ts`)
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: browserFixture(middleClickHandlers.toString()) })
    await browser.evaluate('runtime.rowOwnerEvidence=null;flush()')
    const position = await browser.evaluate('(()=>{const r=nativeButton.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()')
    await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'middle', clickCount: 1, ...position })
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'middle', clickCount: 1, ...position })
    await browser.evaluate('flush()')
    assert.equal(await browser.evaluate('host.state.focusedStoredSessionId.get()'), 'old', 'real native helper opened before auxclick')
    assert.equal(await browser.evaluate('present()'), false, 'trusted native navigation remains separate from attention')
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'recent')"), false)
    await browser.evaluate('detach();runtime.dispose()')
  } finally { browser.close() }
})

test('real Chrome: explicit re-click on already focused unloaded history never admits', async () => {
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: browserFixture() })
    await browser.evaluate("focus('old');update({sessions:[]});runtime.rowOwnerEvidence=null;flush()")
    assert.equal(await browser.evaluate('present()'), false)
    await click(browser, 'nativeButton')
    assert.equal(await browser.evaluate('present()'), false, 'focused and unloaded is still not work')
    await browser.evaluate('detach();runtime.dispose()')
  } finally { browser.close() }
})

test('real Chrome: already-focused compacted tip is not admitted by clicking its root', async () => {
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: browserFixture() })
    await browser.evaluate(`focus('tip');update({sessions:[]});runtime.rowOwnerEvidence=null;
      nativeButton.onclick=()=>focus('tip');
      window.hermesDesktop.api=async options=>{calls.push(options);return options.path.includes('latest-descendant')?{requested_session_id:'old',session_id:'tip',path:['old','tip']}:{id:'tip',title:'Continuation',profile:'default',message_count:4,started_at:1}};flush()`)
    await click(browser, 'nativeButton')
    assert.equal(await browser.evaluate('!!document.querySelector(\'[data-codex-inbox-row="tip"]\')'), false)
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'old')||runtime.admission.isEligible(scope,'tip')"), false)
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'recent')"), false)
    await browser.evaluate('detach();runtime.dispose()')
  } finally { browser.close() }
})

test('real Chrome: an asynchronous native open waits for its target and never admits the previous focus', async () => {
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: browserFixture() })
    await browser.evaluate(`runtime.rowOwnerEvidence=null;
      nativeButton.onclick=()=>{window.nativeOpenStarted=true;window.finishNativeOpen=()=>focus('old')};
      window.hermesDesktop.api=async options=>{calls.push(options);return options.path.includes('latest-descendant')?{requested_session_id:'old',session_id:'old',path:['old']}:{...old,profile:'default'}}`)
    await click(browser, 'nativeButton')
    assert.equal(await browser.evaluate('nativeOpenStarted'), true)
    assert.equal(await browser.evaluate('present()'), false, 'the gesture alone does not prove native resume completed')
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'recent')"), false)
    await browser.evaluate('finishNativeOpen();flush()')
    assert.equal(await browser.evaluate('present()'), false, 'completed async navigation does not admit')
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'recent')"), false)
    assert.equal(await browser.evaluate("calls.some(call=>call.path.startsWith('/api/sessions/recent?'))"), false)
    assert.equal(await browser.evaluate('notices.length'), 0)
    await browser.evaluate('detach();runtime.dispose()')
  } finally { browser.close() }
})

test('real Chrome: opening an old chat in another source preserves both owners attention', async () => {
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: browserFixture() })
    await browser.evaluate(`runtime.model.settle(scope,old);runtime.model.snooze(scope,old,Date.now()+60000);
      runtime.model.settle(other,{...old,connection_id:other.connectionId});runtime.model.snooze(other,old,Date.now()+60000);
      nativeButton.onclick=()=>{host.state.focusedSessionOwner.set(other);focus('old');update({scope:other,sessions:[{...old,connection_id:other.connectionId},{...recent,connection_id:other.connectionId}],busyOwnerKnown:false,busyBySession:{recent:true}})};flush()`)
    await click(browser, 'nativeButton')
    assert.equal(await browser.evaluate('present()'), false)
    assert.equal(await browser.evaluate("runtime.admission.isEligible(other,'old')"), false)
    assert.equal(await browser.evaluate("runtime.admission.isEligible(other,'recent')"), false)
    assert.equal(await browser.evaluate("runtime.admission.isEligible(scope,'old')"), false)
    assert.equal(await browser.evaluate("runtime.model.isSettled(scope,'old')&&runtime.model.isSnoozed(scope,'old')"), true)
    assert.equal(await browser.evaluate("runtime.model.isSettled(other,'old')&&runtime.model.isSnoozed(other,'old')"), true)
    assert.equal(await browser.evaluate("calls.every(call=>call.connectionId===other.connectionId&&call.profile===other.profile)"), true)
    await browser.evaluate('detach();runtime.dispose()')
  } finally { browser.close() }
})
