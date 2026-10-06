import assert from 'node:assert/strict'
import test from 'node:test'
import { flush, loadHostQueryCore, observerFixture } from './helpers/inbox-observer.mjs'

const core = await loadHostQueryCore()
assert.ok(core, 'Supply the pinned host QueryClient')
const A = { connectionId: 'source-A', profile: 'default' }

test('positively owned work backfills its old durable thread outside the recent page', async t => {
  const f = await observerFixture(core, { api: request => request.path.startsWith('/api/sessions/old?')
    ? { id: 'old', profile: 'default', started_at: 1, message_count: 2, title: 'Old thread' }
    : { total: 0, sessions: [] } })
  t.after(f.cleanup)
  await flush()
  f.stop()
  f.queryClient.removeQueries({ queryKey: f.key, exact: true })
  f.host.profileRoutes = async () => [A]
  f.host.requestProfile = async (_route, method) => method === 'subagent.list' ? { subagents: [], delegations: [] } : ({ sessions: [{ id: 'runtime-old', session_key: 'old', profile: 'default', status: 'working' }] })
  const stop = f.startCodexInboxObserver({ onDispose() {} }, f.inbox)
  t.after(stop)
  await flush()
  assert.equal(f.last().sessions[0]?.id, 'old', 'an owned active thread must not depend on recent-list persistence timing')
  assert.equal(f.last().liveSessions[0]?.session_key, 'old')
  assert.equal(f.last().liveStatusKnown, true)
  assert.ok(f.calls.some(request => request.path.startsWith('/api/sessions/old?')))
})

test('unowned or foreign work never fetches a durable thread into the current owner', async t => {
  const f = await observerFixture(core, { api: () => ({ total: 0, sessions: [] }) })
  t.after(f.cleanup)
  await flush()
  f.stop()
  f.queryClient.removeQueries({ queryKey: f.key, exact: true })
  f.host.profileRoutes = async () => [A]
  f.host.requestProfile = async (_route, method) => method === 'subagent.list' ? { subagents: [], delegations: [] } : ({ sessions: [
    { id: 'unowned-runtime', session_key: 'unowned', status: 'working' },
    { id: 'foreign-runtime', session_key: 'foreign', profile: 'other', status: 'working' }
  ] })
  const stop = f.startCodexInboxObserver({ onDispose() {} }, f.inbox)
  t.after(stop)
  await flush()
  assert.equal(f.last().sessions.length, 0)
  assert.ok(f.calls.every(request => !request.path.startsWith('/api/sessions/')))
})

test('failed owned-work metadata cannot preserve partial live authority', async t => {
  const f = await observerFixture(core, { api: request => {
    if (request.path.startsWith('/api/sessions/old?')) throw Object.assign(new Error('Unauthorized'), { status: 401 })
    return { total: 0, sessions: [] }
  } })
  t.after(f.cleanup)
  await flush()
  f.stop()
  f.queryClient.removeQueries({ queryKey: f.key, exact: true })
  f.host.profileRoutes = async () => [A]
  f.host.requestProfile = async (_route, method) => method === 'subagent.list' ? { subagents: [], delegations: [] } : ({ sessions: [{ id: 'runtime-old', session_key: 'old', profile: 'default', status: 'working' }] })
  const stop = f.startCodexInboxObserver({ onDispose() {} }, f.inbox)
  t.after(stop)
  await flush()
  assert.equal(f.last().sessions.length, 0)
  assert.equal(f.last().liveStatusKnown, false)
  assert.equal(f.last().busyOwnerKnown, false)
})
