import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { getEventListeners } from 'node:events'
import { deferred, until, universalNodeFixture } from './helpers/universal-node-fixture.mjs'

async function limiter(limit) {
  const bundle = process.env.CODEX_UNIVERSAL_TEST_BUNDLE
  const source = bundle
    ? (await readFile(bundle, 'utf8')).replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')
    : await readFile(process.env.CODEX_UNIVERSAL_SOURCE_ROOT ? `${process.env.CODEX_UNIVERSAL_SOURCE_ROOT}/src/inbox-universal.js` : new URL('../src/inbox-universal.js', import.meta.url), 'utf8')
  const context = vm.createContext({ ID: 'test', host: { state: {} }, jsx: () => null,
    useEffect() {}, useRef: () => ({}), useQuery: () => ({}), THEMES_AREA: 'themes', TITLEBAR_AREAS: {}, PALETTE_AREA: 'palette' })
  vm.runInContext(source + '\nglobalThis.makeLimiter = codexInboxReadLimiter', context)
  return context.makeLimiter(limit)
}

for (const limit of [1, 4]) test(`already-aborted acquisition rejects while all ${limit} slots remain held`, async () => {
  const acquire = await limiter(limit)
  const releases = await Promise.all(Array.from({ length: limit }, () => acquire()))
  const controller = new AbortController()
  controller.abort()
  let outcome = 'pending'
  const cancelled = acquire(controller.signal).then(release => { release(); outcome = 'acquired' }, error => { outcome = error.message })
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(outcome, 'Inbox read cancelled', 'rejection cannot wait for an unrelated active read to release')
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0, 'a pre-cancelled read cannot retain an abort listener')
  } finally {
    for (const release of releases) release()
    await cancelled
  }
  const release = await acquire()
  release()
})

test('queued cancellation preserves FIFO, removes abort listeners and never leaks or double-releases a slot', async () => {
  const acquire = await limiter(1), order = []
  const first = await acquire(), queuedAbort = new AbortController(), surviving = new AbortController()
  const second = acquire(surviving.signal).then(release => { order.push('second'); return release })
  const cancelled = acquire(queuedAbort.signal)
  const rejection = assert.rejects(cancelled, /Inbox read cancelled/)
  const fourth = acquire().then(release => { order.push('fourth'); return release })
  queuedAbort.abort()
  await rejection
  assert.equal(getEventListeners(queuedAbort.signal, 'abort').length, 0)
  first(); first()
  const releaseSecond = await second
  assert.deepEqual(order, ['second'])
  assert.equal(getEventListeners(surviving.signal, 'abort').length, 0)
  surviving.abort()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(order, ['second'], 'aborting an acquired signal cannot free its active slot')
  releaseSecond(); releaseSecond()
  const releaseFourth = await fourth
  assert.deepEqual(order, ['second', 'fourth'])
  releaseFourth(); releaseFourth()
  const final = await acquire()
  final()
})

for (const index of [0, 1, 2]) test(`real Universal SDK activity reaches selected/foreign owner ${index} with colliding durable IDs`, async t => {
  const f = await universalNodeFixture(t)
  await f.ready()
  const route = f.routes[index]
  for (const type of ['clarify.request', 'approval.request']) {
    f.emit(route, type, { prompt_id: type })
    await f.paint()
    assert.ok(f.receipts.some(receipt => receipt.event.type === type && receipt.result === true), type + ' must reach the real owner pipeline')
    assert.equal(f.row(route)?.dataset.workState, 'needs-input')
    for (const other of f.routes.filter(other => other !== route)) assert.equal(f.runtime.admission.isEligible(other, 'same'), false, 'colliding foreign durable ID cannot borrow admission')
  }
  f.emit(route, 'clarify.settled', { prompt_id: 'clarify.request' })
  await f.paint()
  assert.equal(f.row(route)?.dataset.workState, 'needs-input', 'approval still needs input')
  f.emit(route, 'approval.settled', { prompt_id: 'approval.request' })
  f.emit(route, 'message.start')
  await f.paint()
  assert.equal(f.row(route)?.dataset.workState, 'working')
  f.emit(route, 'message.complete', { status: 'complete' })
  await f.paint()
  assert.equal(f.runtime.model.replyState(route, 'same'), 'completed')
  assert.equal(f.row(route)?.dataset.workState, 'completed')
  assert.equal(f.state.profile.get(), 'default', 'routing cannot depend on selecting the foreign profile')
})

for (const index of [0, 1, 2]) for (const type of ['clarify.request', 'approval.request', 'message.start', 'message.complete']) test(`real Universal observer releases pending ${type} through its proxy into owner ${index}`, async t => {
  const held = deferred()
  const f = await universalNodeFixture(t, { holdLive: held })
  const route = f.routes[index]
  f.state.focusedSessionOwner.set(route)
  f.state.focusedStoredSessionId.set('same')
  f.state.focusedSessionId.set(f.runtimeId(route))
  await until(() => f.liveStarted.size === 3, 'all real owner reads must be waiting before input')
  f.emit(route, type, { prompt_id: 'pending', status: 'complete' })
  assert.equal(f.receipts.length, 0, 'unproved activity must wait rather than bypass ownership')
  held.resolve()
  await f.ready()
  assert.ok(f.receipts.some(receipt => receipt.event.type === type && receipt.result === true), 'the observer proxy must enter the real owner runtime')
  if (type === 'message.complete') assert.equal(f.runtime.model.replyState(route, 'same'), 'completed')
  else assert.equal(f.row(route)?.dataset.workState, type === 'message.start' ? 'working' : 'needs-input')
  for (const other of f.routes.filter(other => other !== route)) {
    assert.equal(f.runtime.admission.isEligible(other, 'same'), false)
    assert.notEqual(f.runtime.model.replyState(other, 'same'), 'completed')
  }
})

test('route/generation ABA rejects retained events; a fresh destination event remains effective', async t => {
  const f = await universalNodeFixture(t)
  await f.ready()
  const route = f.routes[1]
  const event = f.runtime.resolveLiveEvent({ ...route, type: 'message.start', session_id: f.runtimeId(route) })
  assert.ok(event)
  assert.equal(f.runtime.activity(event), true)
  const original = { ...route }
  route.targetProfile = 'beta'
  await f.queryClient.refetchQueries({ queryKey: ['codex-chat-look', 'universal-inbox-inventory'] })
  await f.ready()
  const before = JSON.stringify([...f.saved])
  assert.equal(f.runtime.activity(event), false)
  assert.equal(JSON.stringify([...f.saved]), before)
  const destination = f.runtime.resolveLiveEvent({ ...route, type: 'approval.request', session_id: f.runtimeId(route), payload: { prompt_id: 'destination' } })
  assert.ok(destination)
  assert.equal(f.runtime.activity(destination), true, 'retarget must not disable legitimate destination activity')
  Object.assign(route, original)
  await f.queryClient.refetchQueries({ queryKey: ['codex-chat-look', 'universal-inbox-inventory'] })
  await f.ready()
  assert.equal(f.runtime.activity(event), false, 'returning to alpha cannot resurrect its old generation')
  const fresh = f.runtime.resolveLiveEvent({ ...route, type: 'message.start', session_id: f.runtimeId(route) })
  assert.ok(fresh)
  assert.equal(f.runtime.activity(fresh), true)
  assert.equal(f.runtime.activity({ ...fresh, scope: { ...fresh.scope, _codexInboxGeneration: Symbol('forged') } }), false)
  assert.equal(f.runtime.activity({ ...fresh, scope: { ...fresh.scope, targetProfile: 'wrong' } }), false)
})

test('Universal Off fences retained foreign events while the selected single-owner path still works', async t => {
  const f = await universalNodeFixture(t)
  await f.ready()
  const foreign = f.runtime.resolveLiveEvent({ ...f.routes[2], type: 'message.start', session_id: f.runtimeId(f.routes[2]) })
  assert.ok(foreign)
  f.setUniversalInbox(false)
  await until(() => f.queryClient.getQueryCache().getAll().filter(query => query.getObserversCount()).every(query => query.state.fetchStatus === 'idle'))
  assert.equal(f.runtime.activity(foreign), false)
  f.emit(f.routes[0], 'approval.request', { prompt_id: 'selected-only' })
  await f.paint()
  assert.ok(f.receipts.some(receipt => receipt.event.payload?.prompt_id === 'selected-only' && receipt.result === true))
  assert.equal(f.row(f.routes[0])?.dataset.workState, 'needs-input')
  const before = JSON.stringify([...f.saved])
  f.emit(f.routes[2], 'message.start')
  await f.paint()
  assert.equal(JSON.stringify([...f.saved]), before)
  assert.equal(f.row(f.routes[2]), undefined)
})

test('ambiguous backend aliases cannot own events while an independent foreign owner still can', async t => {
  const f = await universalNodeFixture(t, { ambiguous: true })
  await f.ready()
  const inventory = await f.readUniversalInboxInventory()
  assert.equal(inventory.complete, false)
  assert.equal(f.runtime.resolveLiveEvent({ ...f.routes[1], type: 'message.start', session_id: f.runtimeId(f.routes[1]) }), null)
  f.emit(f.routes[1], 'message.start')
  await f.paint()
  assert.equal(f.runtime.admission.isEligible(f.routes[1], 'same'), false)
  f.emit(f.routes[2], 'approval.request', { prompt_id: 'independent' })
  await f.paint()
  assert.equal(f.row(f.routes[2])?.dataset.workState, 'needs-input')
})
