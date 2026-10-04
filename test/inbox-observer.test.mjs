import assert from 'node:assert/strict'
import test from 'node:test'
import { flush, loadHostQueryCore, observerFixture } from './helpers/inbox-observer.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const core = await loadHostQueryCore()
const options = { skip: core ? false : 'Install query-core@5.101.2 or set CODEX_INBOX_QUERY_CORE_ROOT to the host package root' }
async function fixture(t, config) {
  const f = await observerFixture(core, config)
  t.after(f.cleanup)
  await flush()
  return f
}
const scopedQueries = f => f.queryClient.getQueryCache().findAll({ queryKey: ['codex-chat-look', 'inbox'] })
const observers = f => scopedQueries(f).reduce((count, query) => count + query.getObserversCount(), 0)

test('vendored observer polls with real timers against the separately imported host QueryClient', { ...options, timeout: 3_000 }, async () => {
  const { CodexInboxObserverVendor } = await loadPluginInternals(['CodexInboxObserverVendor'], {
    window: {}, document: { visibilityState: 'visible' }, setTimeout, clearTimeout, setInterval, clearInterval
  })
  const client = new core.QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  let calls = 0
  const queryOptions = {
    queryKey: ['bounded-real-observer'], queryFn: async () => ++calls,
    staleTime: 0, refetchInterval: 25, enabled: true, retry: false
  }
  const observer = new CodexInboxObserverVendor.QueryObserver(client, queryOptions)
  const stop = observer.subscribe(() => {})
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  try {
    await wait(90)
    assert.ok(calls >= 2, 'real TanStack refetchInterval must execute')
    assert.equal(client.getQueryData(queryOptions.queryKey), calls)
    observer.setOptions({ ...queryOptions, enabled: false, refetchInterval: false })
    const disabled = calls
    await wait(60)
    assert.equal(calls, disabled)
    observer.setOptions(queryOptions)
    await wait(60)
    assert.ok(calls > disabled)
    stop(); observer.destroy()
    const disposed = calls
    await wait(60)
    assert.equal(calls, disposed)
    assert.equal(client.getQueryCache().find({ queryKey: queryOptions.queryKey }).getObserversCount(), 0)
    assert.equal(client.getQueryData(queryOptions.queryKey), disposed)
  } finally { stop(); observer.destroy(); client.clear() }
})

test('the separately bundled observer uses the native host cache and deduplicates host fetches', options, async t => {
  let resolve
  const f = await fixture(t, { api: () => new Promise(done => { resolve = done }) })
  const query = f.queryClient.getQueryCache().find({ queryKey: f.key, exact: true })
  assert.equal(query.getObserversCount(), 1)
  assert.ok(query.observers[0] instanceof f.CodexInboxObserverVendor.QueryObserver)
  assert.ok(!(query.observers[0] instanceof core.QueryObserver), 'the observer really is separately bundled')
  const nativeFetch = f.queryClient.fetchQuery({ queryKey: f.key })
  assert.equal(f.calls.length, 1)
  resolve({ total: 1, sessions: [{ id: 'shared' }] })
  const data = await nativeFetch
  await flush()
  assert.equal(data.sessions[0].id, 'shared')
  assert.equal(f.last().sessions[0].id, 'shared')
  assert.equal(f.queryClient.getQueryData(f.key), data)
  assert.equal(f.intervals.size, 1)
  assert.equal([...f.intervals.values()][0].delay, 10_000)
})

test('hidden statusbar, Simple mode, non-chat routes and absent/multiple composers do not stop refresh', options, async t => {
  const f = await fixture(t)
  assert.equal(f.calls.length, 1)
  for (const view of [
    { statusbar: false, simple: true, route: '#/settings', composers: 0 },
    { statusbar: false, simple: false, route: '#/capabilities', composers: 0 },
    { statusbar: true, simple: false, route: '#/chat', composers: 3 }
  ]) {
    Object.assign(f.document, view)
    f.window.location.hash = view.route
    const before = f.calls.length
    await f.tick()
    assert.equal(f.calls.length, before + 1)
    assert.equal(observers(f), 1)
    assert.equal(f.intervals.size, 1)
  }
})

test('disable removes library polling and re-enable restarts the same observer', options, async t => {
  const f = await fixture(t)
  const observer = scopedQueries(f)[0].observers[0]
  f.setCodexInboxMode('off', f.inbox)
  assert.equal(f.intervals.size, 0)
  assert.equal(f.inbox.rowOwnerEvidence, null)
  const before = f.calls.length
  await f.tick()
  assert.equal(f.calls.length, before)
  f.setCodexInboxMode('on', f.inbox)
  await flush()
  assert.equal(f.intervals.size, 1)
  assert.equal(scopedQueries(f)[0].observers[0], observer)
  const afterEnable = f.calls.length
  await f.tick()
  assert.equal(f.calls.length, afterEnable + 1)
})

test('scope switches cancel old subscriptions and suppress a late result while resetting pagination', options, async t => {
  let finishOld
  const f = await fixture(t, { api: options => options.profile === 'default'
    ? new Promise(resolve => { finishOld = resolve })
    : { total: 1, sessions: [{ id: 'new-owner', profile: options.profile }] } })
  const oldLoadMore = f.last().loadMore, oldRetry = f.last().retry
  const oldQuery = f.queryClient.getQueryCache().find({ queryKey: f.key, exact: true })
  f.state.profile.set('other')
  await flush()
  assert.equal(oldQuery.getObserversCount(), 0)
  assert.equal(f.last().scope.profile, 'other')
  assert.equal(f.last().sessions[0].id, 'new-owner')
  const count = f.calls.length
  oldLoadMore(); oldRetry()
  assert.equal(f.calls.length, count)
  finishOld({ total: 1, sessions: [{ id: 'late-old-owner' }] })
  await flush()
  assert.equal(f.last().sessions[0].id, 'new-owner')
  assert.equal(f.last().scope.profile, 'other')
  assert.equal(observers(f), 1)
  assert.equal(f.intervals.size, 1)
  assert.equal(scopedQueries(f).find(query => query.getObserversCount()).queryKey.at(-1), 1)
  f.state.connectionId.set('source-B')
  await flush()
  assert.equal(f.last().scope.connectionId, 'source-B')
  assert.equal(f.calls.at(-1).connectionId, 'source-B')
  assert.equal(observers(f), 1)
})

test('foreground-owner changes rebind A to B to A without adopting a late result or mutating the active gateway', options, async t => {
  let finishB
  const f = await fixture(t, { api: request => request.connectionId === 'source-B'
    ? new Promise(resolve => { finishB = resolve })
    : { total: 1, sessions: [{ id: 'owner-A', profile: request.profile }] } })
  f.state.focusedStoredSessionId.set('opened-B')
  f.state.focusedSessionOwner.set({ connectionId: 'source-B', profile: 'other' })
  await flush()
  assert.equal(f.last().scope.connectionId, 'source-B')
  assert.equal(f.last().scope.profile, 'other')
  assert.equal(f.state.connectionId.get(), 'source-A')
  assert.equal(f.state.profile.get(), 'default')
  const foreignLoadMore = f.last().loadMore
  f.state.focusedSessionOwner.set({ connectionId: 'source-A', profile: 'default' })
  f.state.focusedStoredSessionId.set('owner-A')
  await flush()
  assert.equal(f.last().sessions[0].id, 'owner-A')
  const calls = f.calls.length
  foreignLoadMore()
  assert.equal(f.calls.length, calls)
  finishB({ total: 1, sessions: [{ id: 'late-B', profile: 'other' }] })
  await flush()
  assert.equal(f.last().scope.connectionId, 'source-A')
  assert.equal(f.last().sessions[0].id, 'owner-A')
  assert.equal(observers(f), 1)
  assert.equal(f.intervals.size, 1)
})

test('load-more changes options on one observer and reads the complete paginated list', options, async t => {
  const rows = Array.from({ length: 105 }, (_, index) => ({ id: `row-${index}` }))
  const f = await fixture(t, { api: options => {
    const offset = Number(new URL(options.path, 'https://test').searchParams.get('offset'))
    return { total: 105, sessions: rows.slice(offset, offset + 100) }
  } })
  const observer = scopedQueries(f)[0].observers[0]
  assert.equal(f.last().sessions.length, 100)
  assert.equal(f.last().hasMore, true)
  f.last().loadMore()
  await flush()
  assert.equal(f.last().sessions.length, 105)
  assert.equal(f.last().hasMore, false)
  const current = scopedQueries(f).find(query => query.getObserversCount())
  assert.equal(current.queryKey.at(-1), 2)
  assert.equal(current.observers[0], observer)
  assert.equal(observers(f), 1)
  assert.equal(f.intervals.size, 1)
  assert.equal(new URL(f.calls.at(-1).path, 'https://test').searchParams.get('offset'), '100')
  f.state.profile.set('other')
  await flush()
  assert.equal(scopedQueries(f).find(query => query.getObserversCount()).queryKey.at(-1), 1)
  assert.equal(f.last().sessions.length, 100)
})

test('duplicate projections keep one observer; a coalesced new busy edge refreshes once', options, async t => {
  const f = await fixture(t)
  const observer = scopedQueries(f)[0].observers[0]
  const before = f.calls.length
  for (let i = 0; i < 10; i++) {
    f.state.profile.notify(); f.state.connectionId.notify()
    f.window.dispatchEvent({ type: 'codex-chat-look:inbox-mode', detail: 'on' })
    f.state.focusedStoredSessionId.set(`focus-${i}`)
  }
  await flush()
  assert.equal(f.calls.length, before)
  assert.equal(f.last().focusedStoredSessionId, 'focus-9')
  for (let i = 0; i < 10; i++) f.state.busyBySession.set({ one: true })
  await flush()
  assert.equal(f.calls.length, before + 1, 'one new work edge refreshes without polling')
  assert.equal(f.last().busyBySession.one, undefined, 'unverified runtime busy never borrows this owner')
  assert.equal(observers(f), 1)
  assert.equal(scopedQueries(f)[0].observers[0], observer)
  assert.equal(f.intervals.size, 1)
  await f.tick()
  assert.equal(f.calls.length, before + 2)
})

test('readiness marks an island created after an initial cache hit and follows mode/scope/errors', options, async t => {
  const f = await fixture(t, { cached: {
    sessions: [{ id: 'cached' }], liveSessions: [], liveStatusKnown: true,
    rowOwnerScope: { connectionId: 'source-A', profile: 'default' }, hasMore: false
  } })
  assert.equal(f.calls.length, 0)
  const island = f.addIsland()
  assert.equal(island.dataset.codexInboxQueryReady, 'true')
  f.setCodexInboxMode('off', f.inbox)
  assert.equal(island.dataset.codexInboxQueryReady, 'false')
  f.setCodexInboxMode('on', f.inbox)
  assert.equal(island.dataset.codexInboxQueryReady, 'true')
  f.state.profile.set('other')
  assert.equal(island.dataset.codexInboxQueryReady, 'false')
  await flush()
  assert.equal(island.dataset.codexInboxQueryReady, 'true')
  const current = scopedQueries(f).find(query => query.getObserversCount())
  current.setState({ error: new Error('read failed'), status: 'error' })
  assert.equal(island.dataset.codexInboxQueryReady, 'false')
  assert.equal(f.addIsland().dataset.codexInboxQueryReady, 'false')
})

test('plugin disposal stops timers, atom/events and late completions without clearing or unmounting the host client', options, async t => {
  let finish
  const f = await fixture(t, { api: () => new Promise(resolve => { finish = resolve }) })
  const island = f.addIsland(), staleLoadMore = f.last().loadMore, staleRetry = f.last().retry
  const clear = f.queryClient.clear, unmount = f.queryClient.unmount
  let clears = 0, unmounts = 0
  f.queryClient.clear = () => { clears++ }
  f.queryClient.unmount = () => { unmounts++ }
  f.dispose(); f.dispose()
  assert.equal(observers(f), 0)
  assert.equal(f.intervals.size, 0)
  assert.equal(f.timeouts.size, 0)
  assert.equal(f.mutations.size, 0)
  assert.ok(Object.values(f.state).every(atom => atom.listeners.size === 0))
  assert.equal(f.events.get('codex-chat-look:inbox-mode').size, 0)
  assert.equal(island.dataset.codexInboxQueryReady, 'false')
  const before = f.calls.length, projections = f.snapshots.length
  finish({ total: 1, sessions: [{ id: 'late' }] })
  staleLoadMore(); staleRetry()
  f.state.profile.set('other')
  f.window.dispatchEvent({ type: 'codex-chat-look:inbox-mode', detail: 'on' })
  await f.tick()
  assert.equal(f.calls.length, before)
  assert.equal(f.snapshots.length, projections)
  assert.equal(clears, 0)
  assert.equal(unmounts, 0)
  assert.deepEqual(f.queryClient.getQueryData(['host', 'unrelated']), { keep: true })
  f.queryClient.clear = clear; f.queryClient.unmount = unmount
})

test('initial Off creates one disabled subscription, then enables polling on that same observer', options, async t => {
  const f = await fixture(t, { initialMode: 'off' })
  assert.equal(f.calls.length, 0)
  assert.equal(observers(f), 1)
  assert.equal(f.intervals.size, 0)
  f.setCodexInboxMode('on', f.inbox)
  await flush()
  assert.equal(f.calls.length, 1)
  assert.equal(f.intervals.size, 1)
})