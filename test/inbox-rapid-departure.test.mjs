import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

// Read-only probe: the existing observer fixture supplies the real host cache.
// Runtime/model/admission/event bridge are shipping code; no DOM paint is run.
// CODEX_INBOX_PLUGIN_FILE optionally selects the installed plugin snapshot.
const checkout = process.env.CODEX_INBOX_TEST_CHECKOUT || resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { flush, loadHostQueryCore, observerFixture } = await import(pathToFileURL(resolve(checkout, 'test/helpers/inbox-observer.mjs')))
const { loadPluginInternals } = await import(pathToFileURL(resolve(checkout, 'test/helpers/load-plugin.mjs')))
const core = await loadHostQueryCore()
assert.ok(core, 'Supply the real pinned host query-core@5.101.2; this probe must not skip')
const A = { connectionId: 'source-A', profile: 'default' }
const names = ['startCodexInboxObserver', 'connectCodexInboxEvents', 'installCodexInboxRuntime']
const atom = initial => {
  let value = initial
  const listeners = new Set()
  return { get: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) }, set: next => { value = next; listeners.forEach(fn => fn()) } }
}
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

async function selectedInternals(overrides) {
  if (!process.env.CODEX_INBOX_PLUGIN_FILE) return loadPluginInternals(names, overrides)
  // Same VM loading convention as the existing helper, with a read-only file override.
  let source = await readFile(process.env.CODEX_INBOX_PLUGIN_FILE, 'utf8')
  source = source.replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')
  source += '\nglobalThis.__pluginInternals = {' + names.join(',') + '};'
  const context = vm.createContext({ jsx: () => null, useEffect() {}, useRef: () => ({ current: null }), useQuery: () => ({}), AbortController, THEMES_AREA: 'themes', TITLEBAR_AREAS: {}, PALETTE_AREA: 'palette', console, ...overrides })
  context.globalThis = context
  vm.runInContext(source, context, { filename: process.env.CODEX_INBOX_PLUGIN_FILE })
  return { ...context.__pluginInternals, plugin: context.__pluginDefault }
}

async function fixture(t, { status = 'idle', metadata = {}, live = {}, duplicate = false, routes = [A], metadataFailure = false, initialRuntime = 'R', clock, firstOther = false, liveTransform = x => x } = {}) {
  const created = { id: 'created', source: 'desktop', created_source: 'desktop', profile: A.profile, connection_id: A.connectionId, message_count: 1, ...metadata }
  const other = { id: 'other', source: 'desktop', profile: A.profile, connection_id: A.connectionId, message_count: 1 }
  const f = await observerFixture(core, { initialMode: 'off', api: request => {
    assert.equal(request.connectionId, A.connectionId)
    assert.equal(request.profile, A.profile)
    if (metadataFailure) throw Object.assign(new Error('Unauthorized'), { status: 401 })
    return { total: 2, sessions: firstOther ? [other, created] : [created, other] }
  } })
  f.stop()
  f.queryClient.removeQueries({ queryKey: f.key, exact: true })
  f.values.set('inbox', 'on')
  Object.assign(f.state, { gateway: atom('open'), focusedSessionId: atom(initialRuntime), focusedStoredSessionId: atom(initialRuntime === 'R' ? 'created' : 'other'), focusedSessionOwner: atom(A) })
  const listeners = new Set(), receipts = [], routed = [], reached = deferred(), gate = deferred()
  let liveCalls = 0, currentStatus = status
  const liveRows = () => {
    const rows = [{ id: 'R', session_key: 'created', status: currentStatus, ...live }, { id: 'Q', session_key: 'other', status: 'idle' }]
    if (duplicate) rows.push({ ...rows[0] })
    return liveTransform(rows)
  }
  f.host.onEvent = (_, listener) => { listeners.add(listener); return () => listeners.delete(listener) }
  f.host.profileRoutes = async () => routes
  f.host.requestProfile = async (route, method, params) => {
    routed.push({ route, method, params })
    assert.equal(route.connectionId, A.connectionId)
    assert.equal(route.profile, A.profile)
    if (method === 'subagent.list') return { subagents: [], delegations: [] }
    assert.equal(method, 'session.active_list')
    assert.equal(params.profile, A.profile)
    if (++liveCalls === 1) { reached.resolve(); await gate.promise }
    return { sessions: liveRows() }
  }
  const frames = new Map(), timers = new Map()
  let next = 0
  Object.assign(f.document, { body: null, documentElement: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, hasFocus: () => true })
  Object.assign(f.window, {
    requestAnimationFrame: fn => { frames.set(++next, fn); return next }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, delay) => { timers.set(++next, { fn, delay }); return next }, clearTimeout: id => timers.delete(id)
  })
  const code = await selectedInternals({ host: f.host, queryClient: f.queryClient, window: f.window, document: f.document, URLSearchParams,
    ...(clock ? { Date: class extends Date { static now() { return clock.now } } } : {}),
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail } },
    setInterval: (fn, delay) => { f.intervals.set(++next, { fn, delay }); return next }, clearInterval: id => f.intervals.delete(id),
    setTimeout: f.window.setTimeout, clearTimeout: f.window.clearTimeout })
  const records = new Map()
  const storage = { get: (key, fallback) => key === 'inbox' ? f.values.get(key) : structuredClone(records.get(key) ?? fallback), set: (key, value) => records.set(key, structuredClone(value)) }
  code.plugin.register({ storage, onDispose() {}, register() {} })
  const runtime = code.installCodexInboxRuntime({ storage, host: f.host, document: f.document, window: f.window })
  const update = runtime.update.bind(runtime), activity = runtime.activity.bind(runtime)
  runtime.update = snapshot => { f.snapshots.push(snapshot); update(snapshot) }
  runtime.activity = event => { receipts.push(event); return activity(event) }
  const disconnectEvents = code.connectCodexInboxEvents(runtime)
  const stop = code.startCodexInboxObserver({ onDispose() {} }, runtime)
  t.after(() => { gate.resolve(); disconnectEvents(); stop(); runtime.dispose(); f.cleanup() })
  await flush()
  return {
    ...f, runtime, created, other, receipts, records, storage, routed, reached: reached.promise,
    emit: (type, extra = {}) => listeners.forEach(listener => listener({ type, ...A, session_id: 'R', payload: type === 'message.complete' ? { status: 'complete' } : {}, ...extra })),
    focusCreated: () => { f.state.focusedSessionId.set('R'); f.state.focusedStoredSessionId.set('created') },
    leave: () => { f.state.focusedSessionId.set('Q'); f.state.focusedStoredSessionId.set('other') },
    release: async () => { gate.resolve(); await flush(); await flush() },
    setStatus: status => { currentStatus = status },
    eligible: () => runtime.admission.isEligible(A, created),
    verified: () => runtime.verifyLiveEvent({ type: 'message.start', ...A, session_id: 'R' })
  }
}

const bounded = { timeout: 3000 }

test('control: a focused short turn is admitted after independent idle-owner proof', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  f.emit('message.start'); f.emit('message.complete')
  await f.release()
  assert.equal(f.verified(), true)
  assert.equal(f.eligible(), true)
  assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
})

test('REGRESSION: leaving during owner proof does not lose still-working admission', bounded, async t => {
  const f = await fixture(t, { status: 'working' })
  await f.reached
  f.leave()
  await f.release()
  assert.equal(f.state.focusedStoredSessionId.get(), 'other')
  assert.ok(f.routed.length >= 1)
  assert.equal(f.verified(), true, 'the departed nominated runtime must be independently verified, without focus equality')
  assert.equal(f.eligible(), true, 'the owned working chat enters Inbox without a return visit')
  assert.equal(f.runtime.admission.isEligible(A, f.other), false, 'the newly focused idle chat stays out')
})

test('REGRESSION: a buffered start survives departure and admits a turn completed before proof returns', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  f.emit('message.start')
  assert.deepEqual(Array.from(f.runtime.pendingWorkSessionIds(A)), ['created'])
  f.leave()
  f.emit('message.complete')
  await f.release()
  assert.equal(f.eligible(), true, 'navigation must not discard pre-departure work evidence')
  assert.equal(f.receipts.filter(event => event.type === 'message.start').length, 1, 'release the start exactly once after independent proof')
})

test('REGRESSION: the retained nomination verifies a start delivered only after departure', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  f.leave()
  f.emit('message.start'); f.emit('message.complete')
  await f.release()
  assert.equal(f.eligible(), true, 'a delayed lifecycle frame uses the previously nominated tuple, not the new focus')
})

test('REGRESSION: a new thread started behind an older pending query survives immediate departure', bounded, async t => {
  const f = await fixture(t, { initialRuntime: 'Q' })
  await f.reached
  f.focusCreated()
  f.emit('message.start')
  f.leave()
  f.emit('message.complete')
  await f.release()
  assert.equal(f.eligible(), true, 'the pending query must verify work nominated after it began')
  assert.equal(f.runtime.admission.isEligible(A, f.other), false)
  assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
})

test('REGRESSION: a focus nomination is captured while an older query is pending, before any work frame', bounded, async t => {
  const f = await fixture(t, { initialRuntime: 'Q' })
  await f.reached
  f.focusCreated()
  await flush()
  f.leave()
  f.emit('message.start'); f.emit('message.complete')
  await f.release()
  assert.equal(f.eligible(), true, 'deferred refresh must remember the departed tuple before awaiting the old query')
})

test('negative: an expired departure nomination cannot verify a delayed work frame', bounded, async t => {
  const clock = { now: Date.now() }
  const f = await fixture(t, { clock })
  await f.reached
  f.leave()
  clock.now += 10_001
  f.emit('message.start'); f.emit('message.complete')
  await f.release()
  assert.equal(f.eligible(), false)
  assert.equal(f.receipts.length, 0)
})

test('negative: rapid departure cannot carry pending work across a profile switch and back', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  f.emit('message.start'); f.leave()
  f.state.focusedSessionOwner.set({ ...A, profile: 'foreign' })
  f.state.focusedSessionOwner.set(A)
  await f.release()
  assert.equal(f.eligible(), false)
  assert.equal(f.receipts.length, 0)
})

for (const status of ['idle', 'resuming', 'reading']) test('negative: nomination/navigation plus ' + status + ' never admits', bounded, async t => {
  const f = await fixture(t, { status })
  await f.reached; f.leave(); await f.release()
  assert.equal(f.eligible(), false)
  assert.equal(f.runtime.admission.isEligible(A, f.other), false)
})

for (const [label, config] of [
  ['foreign profile', { live: { profile: 'foreign' } }],
  ['foreign connection', { live: { connection_id: 'source-B' } }],
  ['wrong durable identity', { live: { session_key: 'unrelated' } }],
  ['duplicate runtime rows', { duplicate: true }],
  ['cron routing', { metadata: { source: 'cron' } }],
  ['cron creation', { metadata: { created_source: 'cron' } }],
  ['unknown provenance', { metadata: { source: 'unrecognized-source' } }]
]) test('negative: rapid-departure event cannot bypass ' + label, bounded, async t => {
  const f = await fixture(t, config)
  await f.reached; f.emit('message.start'); f.leave(); await f.release()
  assert.equal(f.eligible(), false)
})

test('negative: disconnect invalidates a departed nomination and its late reply', bounded, async t => {
  const f = await fixture(t, { status: 'working' })
  await f.reached; f.emit('message.start'); f.leave(); f.state.gateway.set('closed'); await f.release()
  assert.equal(f.last().liveStatusKnown, false)
  assert.equal(f.eligible(), false)
  assert.equal(f.receipts.length, 0)
})

test('negative: successful Settle fences pre-decision buffered work even without a focus change', bounded, async t => {
  const f = await fixture(t)
  await f.reached; f.emit('message.start')
  assert.equal(f.runtime.model.settle(A, f.created, { manual: true }), true)
  await f.release()
  assert.equal(f.runtime.model.isManualSettled(A, f.created), true)
  assert.equal(f.receipts.length, 0)
  assert.equal(f.eligible(), false)
})

test('REGRESSION B1: delayed departed work survives same-runtime verified lineage nominations', bounded, async t => {
  const f = await fixture(t, { metadata: { id: 'child', _lineage_root_id: 'created', _lineage_ids: ['created', 'child'] } })
  await f.reached
  f.state.focusedStoredSessionId.set('child')
  await flush()
  f.leave()
  f.emit('message.start'); f.emit('message.complete')
  await f.release()
  assert.equal(f.verified(), true, 'the unique live R row independently proves the created/child lineage')
  assert.equal(f.eligible(), true, 'authoritative lineage aliases must not make departed R work ambiguous')
  assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
  assert.equal(f.runtime.admission.isEligible(A, f.other), false)
})

test('REGRESSION B1: delayed departed work survives a transitional R/other nomination', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  // Native selection changes the stored ID before asynchronous runtime binding.
  f.state.focusedStoredSessionId.set('other')
  await flush()
  f.state.focusedSessionId.set('Q')
  f.emit('message.start'); f.emit('message.complete')
  await f.release()
  assert.equal(f.verified(), true)
  assert.equal(f.eligible(), true, 'the invalid interim R/other pair must not displace the proven R/created nomination')
  assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
  assert.equal(f.runtime.admission.isEligible(A, f.other), false, 'the transitional stored selection grants no work ownership')
})

test('REGRESSION B2: successful Settle fences an R start buffered under transitional R/other focus', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  assert.equal(f.runtime.admission.observe(A, [f.created], { workingSessions: [f.created] }), true)
  assert.equal(f.eligible(), true, 'created was already admitted before the user decision')
  f.state.focusedStoredSessionId.set('other')
  await flush()
  f.emit('message.start')
  assert.equal(f.runtime.model.settle(A, f.created, { manual: true }), true)
  assert.equal(f.runtime.model.isManualSettled(A, f.created), true)
  f.state.focusedSessionId.set('Q')
  await f.release()
  assert.equal(f.verified(), true)
  assert.equal(f.runtime.model.isManualSettled(A, f.created), true, 'late proof must not replay pre-decision R work under its interim stored ID')
  assert.equal(f.receipts.length, 0, 'the fenced start must never reach activity')
  assert.equal(f.runtime.admission.isEligible(A, f.other), false)
})

test('negative: unrelated Settle does not suppress valid departed R work', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  f.leave()
  f.emit('message.start'); f.emit('message.complete')
  assert.equal(f.runtime.model.settle(A, f.other, { manual: true }), true)
  await f.release()
  assert.equal(f.verified(), true)
  assert.equal(f.eligible(), true, 'Settle of other must not install an owner-wide work fence')
  assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
  assert.equal(f.runtime.model.isManualSettled(A, f.other), true)
  assert.equal(f.runtime.model.isManualSettled(A, f.created), false)
})

test('negative: successful Settle during ambiguous nominations suppresses the pre-decision R start', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  f.emit('message.start')
  f.state.focusedStoredSessionId.set('other')
  await flush()
  assert.equal(f.runtime.model.settle(A, f.created, { manual: true }), true)
  f.state.focusedSessionId.set('Q')
  await f.release()
  assert.equal(f.verified(), true)
  assert.equal(f.runtime.model.isManualSettled(A, f.created), true)
  assert.equal(f.receipts.length, 0, 'ambiguous focus must not prevent purging the earlier valid R start')
  assert.equal(f.eligible(), false)
})

test('negative: a fresh departed R start after Settle can reopen after independent proof', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  f.emit('message.start')
  assert.equal(f.runtime.model.settle(A, f.created, { manual: true }), true)
  f.leave()
  await f.release()
  assert.equal(f.verified(), true)
  assert.equal(f.runtime.model.isManualSettled(A, f.created), true)
  assert.equal(f.receipts.length, 0, 'only the pre-decision start is fenced')
  assert.equal(f.eligible(), false)
  f.emit('message.start'); f.emit('message.complete')
  await flush()
  assert.equal(f.eligible(), true, 'a new independently verified R turn can reopen created without refocusing')
  assert.equal(f.runtime.model.isManualSettled(A, f.created), false)
  assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
  assert.equal(f.runtime.admission.isEligible(A, f.other), false)
})

test('negative: owner-verified delayed work retains a Snooze deadline', bounded, async t => {
  const f = await fixture(t)
  await f.reached
  const deadline = Date.now() + 60000
  assert.equal(f.runtime.model.snooze(A, f.created, deadline), true)
  f.emit('message.start'); await f.release()
  assert.equal(f.eligible(), true, 'work can admit a snoozed thread but cannot wake it')
  assert.equal(f.runtime.model.snoozedUntil(A, f.created), deadline)
  assert.equal(f.runtime.model.isSnoozed(A, f.created), true)
})

for (const firstOther of [false, true]) {
  const order = firstOther ? 'other-first metadata' : 'created-first metadata'

  test('REGRESSION R1: buffered proved R work ignores transitional R/other focus, ' + order, bounded, async t => {
    const f = await fixture(t, { firstOther })
    await f.reached
    f.state.focusedStoredSessionId.set('other')
    await flush()
    f.emit('message.start'); f.emit('message.complete')
    await f.release()
    assert.equal(f.state.focusedSessionId.get(), 'R', 'keep the non-atomic focus tuple through proof and replay')
    assert.equal(f.state.focusedStoredSessionId.get(), 'other')
    assert.equal(f.verified(), true)
    assert.equal(f.eligible(), true, 'the proved R/created lineage owns the buffered lifecycle')
    assert.equal(f.runtime.admission.isEligible(A, f.other), false, 'metadata ordering cannot redirect work into idle other')
    assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
  })

  test('REGRESSION R1: immediate direct R work after proof ignores wrong stored focus, ' + order, bounded, async t => {
    const f = await fixture(t, { firstOther })
    await f.reached
    await f.release()
    assert.equal(f.verified(), true)
    assert.equal(f.eligible(), false, 'idle proof alone is not admission')
    f.state.focusedStoredSessionId.set('other')
    // Deliver before any focus-triggered refresh can repair the interim tuple.
    f.emit('message.start'); f.emit('message.complete')
    await flush()
    assert.equal(f.eligible(), true, 'direct delivery retains the independently proved durable identity')
    assert.equal(f.runtime.admission.isEligible(A, f.other), false)
    assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
  })

  test('REGRESSION R1: busy snapshot cannot admit idle other under R/other focus, ' + order, bounded, async t => {
    const f = await fixture(t, { firstOther, live: { busy: true } })
    await f.reached
    f.state.focusedStoredSessionId.set('other')
    await flush()
    await f.release()
    assert.equal(f.verified(), true)
    assert.equal(f.eligible(), true, 'the unique proved busy R row admits created without lifecycle frames')
    assert.equal(f.runtime.admission.isEligible(A, f.other), false, 'R busy evidence must not borrow the current stored focus')
    assert.equal(f.receipts.length, 0, 'snapshot admission is exercised independently of event replay')
  })

  for (const qualified of [false, true]) {
    const qualification = qualified ? 'own-profile live row' : 'unqualified live row'

    test('REGRESSION R3: unrelated dual durable fields reject idle lifecycle, ' + qualification + ', ' + order, bounded, async t => {
      const f = await fixture(t, { firstOther, live: { stored_session_id: 'other', ...(qualified ? { profile: A.profile } : {}) } })
      await f.reached
      f.state.focusedStoredSessionId.set('other')
      await flush()
      f.leave()
      f.emit('message.start'); f.emit('message.complete')
      await f.release()
      assert.equal(f.verified(), false, 'unique runtime cardinality cannot resolve unrelated durable fields')
      assert.equal(f.eligible(), false)
      assert.equal(f.runtime.admission.isEligible(A, f.other), false)
      assert.equal(f.receipts.length, 0, 'contradictory durable identity must not release either lifecycle frame')
    })

    test('REGRESSION R3: unrelated dual durable fields reject working snapshot, ' + qualification + ', ' + order, bounded, async t => {
      const f = await fixture(t, { firstOther, status: 'working', live: { stored_session_id: 'other', ...(qualified ? { profile: A.profile } : {}) } })
      await f.reached
      f.state.focusedStoredSessionId.set('other')
      await flush()
      f.leave()
      await f.release()
      assert.equal(f.verified(), false)
      assert.equal(f.eligible(), false, 'working cannot turn contradictory durable fields into created authority')
      assert.equal(f.runtime.admission.isEligible(A, f.other), false, 'working cannot grant the second unrelated durable ID authority')
      assert.equal(f.receipts.length, 0)
    })
  }

  for (const status of ['idle', 'working']) test('positive R3: dual durable fields sharing authoritative lineage admit ' + status + ' work, ' + order, bounded, async t => {
    const f = await fixture(t, {
      firstOther, status,
      metadata: { id: 'child', _lineage_root_id: 'created', _lineage_ids: ['created', 'child'] },
      live: { stored_session_id: 'child' }
    })
    await f.reached
    f.state.focusedStoredSessionId.set('child')
    await flush()
    f.leave()
    if (status === 'idle') { f.emit('message.start'); f.emit('message.complete') }
    await f.release()
    assert.equal(f.verified(), true, 'created and child are one authoritative durable lineage, not a conflict')
    assert.equal(f.eligible(), true)
    assert.equal(f.runtime.admission.isEligible(A, f.other), false)
    assert.deepEqual(f.receipts.map(event => event.type), status === 'idle' ? ['message.start', 'message.complete'] : [])
  })

  for (const [label, config] of [
    ['duplicate own-profile working rows', { duplicate: true }],
    ['foreign same-runtime contradiction', { liveTransform: rows => [...rows, { id: 'R', session_key: 'created', profile: 'foreign', status: 'working' }] }]
  ]) test('REGRESSION R4: ' + label + ' reject snapshots and events, ' + order, bounded, async t => {
    const f = await fixture(t, { firstOther, status: 'working', live: { profile: A.profile }, ...config })
    await f.reached
    f.leave()
    await f.release()
    assert.equal(f.verified(), false)
    assert.equal(f.eligible(), false, 'profile qualification cannot bypass unique-runtime ownership on the snapshot path')
    assert.equal(f.runtime.admission.isEligible(A, f.other), false)
    assert.equal(f.receipts.length, 0, 'first exercise snapshot rejection with no lifecycle frames')
    f.emit('message.start'); f.emit('message.complete')
    await flush()
    assert.equal(f.verified(), false)
    assert.equal(f.eligible(), false)
    assert.equal(f.runtime.admission.isEligible(A, f.other), false)
    assert.equal(f.receipts.length, 0, 'contradictory runtime rows cannot become authoritative through direct events')
  })
}

for (const firstOther of [false, true]) {
  const order = firstOther ? 'other-first metadata' : 'created-first metadata'

  test('REGRESSION R2: nomination survives while refresh loop already awaits older proof, ' + order, bounded, async t => {
    const f = await fixture(t, { initialRuntime: 'Q', firstOther })
    await f.reached
    f.state.focusedSessionId.set('transient')
    await flush()
    f.focusCreated()
    await flush()
    f.leave()
    f.emit('message.start'); f.emit('message.complete')
    await f.release()
    assert.equal(f.verified(), true)
    assert.equal(f.eligible(), true, 'a later focused tuple must be captured even when refresh has already yielded on old proof')
    assert.equal(f.runtime.admission.isEligible(A, f.other), false)
    assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
  })

  test('REGRESSION R2: synchronous focus and departure retain nomination for delayed lifecycle, ' + order, bounded, async t => {
    const f = await fixture(t, { initialRuntime: 'Q', firstOther })
    await f.reached
    // No flush or lifecycle frame occurs while created is focused.
    f.focusCreated(); f.leave()
    f.emit('message.start'); f.emit('message.complete')
    await f.release()
    assert.equal(f.verified(), true)
    assert.equal(f.eligible(), true, 'synchronous atom notifications must capture the departed R/created nomination')
    assert.equal(f.runtime.admission.isEligible(A, f.other), false)
    assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'message.complete'])
  })
}