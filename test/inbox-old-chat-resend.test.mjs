import assert from 'node:assert/strict'
import test from 'node:test'
import { flush, loadHostQueryCore, observerFixture } from './helpers/inbox-observer.mjs'

const core = await loadHostQueryCore()
assert.ok(core, 'Supply the pinned host QueryClient')
const A = { connectionId: 'source-A', profile: 'default' }
const atom = initial => {
  let value = initial
  const listeners = new Set()
  return { get: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) }, set: next => { value = next; listeners.forEach(fn => fn()) } }
}

// Native active_list rows have no profile stamp. Only a stable SDK focused
// owner + runtime + durable tuple can qualify their work (server.py).
async function fixture(t) {
  const f = await observerFixture(core, { api: () => ({ total: 1, sessions: [{ id: 'old', profile: 'default', source: 'desktop', message_count: 2 }] }) })
  await flush()
  f.stop()
  f.queryClient.removeQueries({ queryKey: f.key, exact: true })
  Object.assign(f.state, { gateway: atom('open'), focusedSessionId: atom(null) })
  let status = 'idle', reads = 0
  f.host.profileRoutes = async () => [A]
  f.host.requestProfile = async (_route, method) => {
    if (method === 'subagent.list') return { subagents: [], delegations: [] }
    reads++
    return { sessions: [{ id: 'runtime-old', session_key: 'old', status }] }
  }
  const stop = f.startCodexInboxObserver({ onDispose() {} }, f.inbox)
  t.after(() => { stop(); f.cleanup() })
  await flush()
  return { ...f, setStatus: next => { status = next }, reads: () => reads }
}

function focus(f) {
  f.state.focusedSessionOwner.set(A)
  f.state.focusedStoredSessionId.set('old')
  f.state.focusedSessionId.set('runtime-old')
}

test('sending work in a previous chat refreshes native owner proof without waiting for polling', async t => {
  const f = await fixture(t)
  focus(f)
  await flush()
  const before = f.reads()
  f.setStatus('working')
  f.state.busyBySession.set({ 'runtime-old': true })
  await flush()
  assert.ok(f.reads() > before, 'a new busy edge must refresh the owner-scoped live list')
  assert.equal(f.last().liveSessions.find(row => row.id === 'runtime-old')?.status, 'working')
  assert.equal(f.last().busyBySession.old, true, 'busy activity projects onto the independently proved durable thread')
})

test('reopening old history verifies identity but never invents work', async t => {
  const f = await fixture(t)
  focus(f)
  await flush()
  assert.equal(f.last().liveSessions.find(row => row.id === 'runtime-old')?.status, 'idle')
  assert.ok(!Object.values(f.last().busyBySession).some(Boolean))
})
