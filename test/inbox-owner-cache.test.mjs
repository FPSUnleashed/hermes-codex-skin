import assert from 'node:assert/strict'
import test from 'node:test'
import { flush, loadHostQueryCore, observerFixture } from './helpers/inbox-observer.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const core = await loadHostQueryCore()
assert.ok(core, 'Run with the installed host QueryClient available')
const A = { connectionId: 'source-A', profile: 'default' }
const atom = initial => {
  let value = initial
  const listeners = new Set()
  return { get: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) }, set: next => { value = next; listeners.forEach(fn => fn()) } }
}

async function fixture(t, { focused = false, empty = false } = {}) {
  const f = await observerFixture(core, { api: request => ({ total: 1, sessions: [{ id: 'shared-id', profile: request.profile, started_at: 1, message_count: 1 }] }) })
  await flush()
  f.stop()
  f.queryClient.removeQueries({ queryKey: f.key, exact: true })
  Object.assign(f.state, {
    gateway: atom('open'), focusedSessionId: atom(focused ? 'R' : null),
    focusedSessionOwner: atom(focused ? A : null), focusedStoredSessionId: atom(focused ? 'shared-id' : null)
  })
  const events = new Set(), receipts = []
  let liveRead = async () => ({ sessions: empty ? [] : [{ id: 'R', session_key: 'shared-id', status: 'working' }] })
  f.host.onEvent = (_, fn) => { events.add(fn); return () => events.delete(fn) }
  f.host.profileRoutes = async () => [A, { ...A, profile: 'other' }]
  f.host.requestProfile = (...args) => liveRead(...args)
  f.inbox.activity = event => receipts.push(event)
  const { connectCodexInboxEvents } = await loadPluginInternals(['connectCodexInboxEvents'], { host: f.host })
  const disconnectEvents = connectCodexInboxEvents(f.inbox)
  const stop = f.startCodexInboxObserver({ onDispose() {} }, f.inbox)
  t.after(() => { disconnectEvents(); stop(); f.cleanup() })
  await flush()
  return { ...f, receipts, emit: event => events.forEach(fn => fn(event)), setLiveRead: fn => { liveRead = fn } }
}

const live = f => Array.from(f.last().liveSessions, row => [row.id, row.status])

test('surface event tags cannot create, replace or contradict verified runtime ownership', async t => {
  const f = await fixture(t)
  assert.deepEqual(live(f), [['shared-id', 'unknown']])
  f.emit({ ...A, type: 'tool.start', session_id: 'R' })
  await flush()
  assert.deepEqual(live(f), [['shared-id', 'unknown']], 'ambient event.profile cannot adopt an unowned runtime')
  assert.equal(f.receipts.length, 0, 'the SDK event bridge must not bypass the owner proof')

  f.state.focusedSessionOwner.set(A)
  f.state.focusedStoredSessionId.set('shared-id')
  f.state.focusedSessionId.set('R')
  f.last().retry()
  await flush()
  assert.deepEqual(live(f), [['R', 'working']])
  f.emit({ ...A, profile: 'other', type: 'tool.start', session_id: 'R' })
  f.emit({ ...A, type: 'message.complete', session_id: 'R', replayed: true })
  await flush()
  assert.deepEqual(live(f), [['R', 'working']], 'foreign surface tag does not overwrite a validated owner')
  assert.equal(f.receipts.length, 0)
  f.emit({ ...A, type: 'tool.start', session_id: 'R' })
  assert.equal(f.receipts.length, 1, 'a positively owned live runtime still receives activity')

  f.state.focusedSessionOwner.set({ ...A, profile: 'other' })
  await flush()
  f.state.focusedSessionOwner.set(A)
  await flush()
  assert.deepEqual(live(f), [['shared-id', 'unknown']], 'contradictory stable owner tuples quarantine the runtime across A-B-A')
})

test('disconnect revokes cached empty-snapshot authority until a fresh connected read, including late responses', async t => {
  const f = await fixture(t, { empty: true })
  assert.equal(f.last().liveStatusKnown, true)
  f.state.gateway.set('closed')
  assert.equal(f.last().liveStatusKnown, false, 'an empty cached list cannot authorize offline Settle')
  f.state.gateway.set('open')
  await flush()
  assert.equal(f.last().liveStatusKnown, true, 'reconnect refresh restores activity authority')

  let finish, started
  const reached = new Promise(resolve => { started = resolve })
  f.setLiveRead(() => { started(); return new Promise(resolve => { finish = resolve }) })
  f.last().retry()
  await reached
  f.state.gateway.set('closed')
  finish({ sessions: [] })
  await flush()
  assert.equal(f.last().liveStatusKnown, false, 'a read begun before disconnect cannot restore authority')
  f.emit({ ...A, type: 'message.complete', session_id: 'R' })
  assert.equal(f.receipts.length, 0)

  f.setLiveRead(async () => ({ sessions: [] }))
  f.state.gateway.set('open')
  await flush()
  assert.equal(f.last().liveStatusKnown, true)
})
