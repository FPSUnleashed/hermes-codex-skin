import assert from 'node:assert/strict'
import test from 'node:test'
import { flush, loadHostQueryCore, observerFixture } from './helpers/inbox-observer.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const core = await loadHostQueryCore()
const A = { connectionId: 'source-A', profile: 'default' }
const atom = initial => {
  let value = initial
  const listeners = new Set()
  return { get: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) }, set: next => { value = next; listeners.forEach(fn => fn()) } }
}
async function fixture(t, { rows, live, children = [], delayed = false } = {}) {
  const metadata = rows || [{ id: 'thread', profile: 'default', source: 'desktop', started_at: 1, message_count: 1 }]
  const f = await observerFixture(core, { api: () => ({ total: metadata.length, sessions: metadata }) })
  await flush(); f.stop(); f.queryClient.removeQueries({ queryKey: f.key, exact: true })
  Object.assign(f.state, { gateway: atom('open'), focusedSessionId: atom('runtime'), focusedStoredSessionId: atom('thread'), focusedSessionOwner: atom(A) })
  const events = new Set(), receipts = [], rpc = []
  let currentLive = live || [{ id: 'runtime', session_key: 'thread', status: 'idle' }]
  let roster = children, release, failRoster = false
  const held = delayed ? new Promise(resolve => { release = resolve }) : Promise.resolve()
  f.host.onEvent = (_, fn) => { events.add(fn); return () => events.delete(fn) }
  f.host.profileRoutes = async () => [A]
  f.host.requestProfile = async (route, method, params) => {
    rpc.push({ route, method, params })
    if (method === 'session.active_list') { await held; return { sessions: currentLive } }
    if (method === 'session.status') return { output: `Hermes TUI Status\n\nSession ID: ${params.session_id === 'runtime' ? 'thread' : 'thread'}\nPath: /profile/default` }
    if (method === 'subagent.list') { if (failRoster) throw new Error('transport unavailable'); return { subagents: roster, delegations: [] } }
    throw new Error(`Unexpected method ${method}`)
  }
  f.inbox.activity = event => receipts.push(event)
  const { connectCodexInboxEvents, createCodexInboxModel } = await loadPluginInternals(['connectCodexInboxEvents', 'createCodexInboxModel'], { host: f.host })
  f.inbox.model = createCodexInboxModel({ get: (key, fallback) => f.values.get(key) ?? fallback, set: (key, value) => f.values.set(key, value) })
  const off = connectCodexInboxEvents(f.inbox), stop = f.startCodexInboxObserver({ onDispose() {} }, f.inbox)
  t.after(() => { off(); stop(); f.cleanup() })
  await flush()
  return { ...f, receipts, rpc, release, setLive: value => { currentLive = value }, setRoster: value => { roster = value }, failRoster: () => { failRoster = true }, emit: event => events.forEach(fn => fn(event)) }
}

test('owner-routed roster restores children after reload without child events and carries no transcript or goal', async t => {
  const f = await fixture(t, { children: [{ subagent_id: 'child', status: 'running', goal: 'private goal', model: 'private model' }, { subagent_id: 'done', status: 'completed' }] })
  assert.deepEqual(Array.from(f.last().childSnapshots || [], row => ({ session_id: row.session_id, childIds: Array.from(row.childIds) })), [{ session_id: 'thread', childIds: ['child'] }])
  assert.equal(f.rpc.filter(call => call.method === 'subagent.list').length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(f.rpc.find(call => call.method === 'subagent.list').params)), { session_id: 'runtime' })
  assert.ok(!JSON.stringify(f.last().childSnapshots).includes('private'))
  f.setRoster([]); f.last().retry(); await flush()
  assert.deepEqual(Array.from(f.last().childSnapshots, row => Array.from(row.childIds)), [[]])
})

test('child lifecycle received before runtime ownership proof is released with canonical durable identity', async t => {
  const f = await fixture(t, { delayed: true })
  for (const type of ['message.start', 'subagent.spawn_requested', 'subagent.start', 'message.complete']) {
    f.emit({ ...A, session_id: 'runtime', type, payload: { subagent_id: 'child', status: 'complete', text: 'never retain text' } })
  }
  assert.equal(f.receipts.length, 0)
  f.release(); await flush(); await flush()
  assert.deepEqual(f.receipts.map(event => event.type), ['message.start', 'subagent.spawn_requested', 'subagent.start', 'message.complete'])
  assert.ok(f.receipts.every(event => event.canonicalSessionId === 'thread'))
  assert.ok(f.receipts.every(event => !event.payload.text))
  f.emit({ ...A, session_id: 'runtime', type: 'subagent.complete', payload: { subagent_id: 'child', status: 'completed' } })
  assert.equal(f.receipts.at(-1).canonicalSessionId, 'thread')
})

test('runtime namespace never redirects a proved event into a colliding durable thread', async t => {
  const f = await fixture(t, { rows: [{ id: 'runtime', profile: 'default' }, { id: 'thread', profile: 'default', _lineage_root_id: 'root', _lineage_ids: ['thread', 'root'] }] })
  f.emit({ ...A, session_id: 'runtime', type: 'subagent.start', payload: { subagent_id: 'child' } })
  assert.equal(f.receipts.length, 1)
  assert.equal(f.receipts[0].session_id, 'thread', 'the sink retains B’s durable metadata-ID contract')
  assert.equal(f.receipts[0].canonicalSessionId, 'thread')
  assert.equal(f.last().liveSessions.find(row => row.id === 'runtime')._codexInboxCanonicalId, 'root', 'child rosters retain A’s canonical lineage root')
})

test('duplicate runtime and contradictory durable fields cannot hydrate or authorize child activity', async t => {
  const f = await fixture(t, { rows: [{ id: 'thread', profile: 'default' }, { id: 'foreign-thread', profile: 'default' }], live: [{ id: 'runtime', session_key: 'thread', stored_session_id: 'foreign-thread', profile: 'default', status: 'idle' }] })
  f.emit({ ...A, session_id: 'runtime', type: 'subagent.start', payload: { subagent_id: 'child' } })
  assert.equal(f.receipts.length, 0)
  assert.equal(f.rpc.filter(call => call.method === 'subagent.list').length, 0)
  f.setLive([{ id: 'runtime', session_key: 'thread', status: 'idle' }, { id: 'runtime', session_key: 'thread', profile: 'other', status: 'idle' }]); f.last().retry(); await flush()
  f.emit({ ...A, session_id: 'runtime', type: 'subagent.start', payload: { subagent_id: 'child' } })
  assert.equal(f.receipts.length, 0)
})

test('multiple owned runtimes aggregate children under one conversation and roster failure does not certify emptiness', async t => {
  const f = await fixture(t, { live: [{ id: 'runtime', session_key: 'thread', status: 'idle' }, { id: 'runtime-2', session_key: 'thread', status: 'idle' }], children: [{ subagent_id: 'child', status: 'running' }] })
  assert.deepEqual(Array.from(f.last().childSnapshots || [], row => Array.from(row.childIds)), [['child']])
  f.failRoster(); f.last().retry(); await flush()
  assert.deepEqual(Array.from(f.last().childSnapshots || []), [])
  assert.ok(f.last().liveSessions.some(row => row.status === 'unknown' && row.session_key === 'thread'))
})

test('disconnect rejects buffered children and late roster authority, then fresh reconnect restores roster', async t => {
  const f = await fixture(t, { delayed: true, children: [{ subagent_id: 'child', status: 'running' }] })
  f.emit({ ...A, session_id: 'runtime', type: 'subagent.start', payload: { subagent_id: 'child' } })
  f.state.gateway.set('closed'); f.release(); await flush(); await flush()
  assert.equal(f.receipts.length, 0)
  assert.deepEqual(Array.from(f.last().childSnapshots || []), [])
  f.state.gateway.set('open'); await flush(); await flush()
  assert.deepEqual(Array.from(f.last().childSnapshots || [], row => Array.from(row.childIds)), [['child']])
})
