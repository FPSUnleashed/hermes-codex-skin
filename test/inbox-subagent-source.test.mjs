import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { flush, loadHostQueryCore } from './helpers/inbox-observer.mjs'

// Exercise the merged source independently of the parent's generated bundle.
const core = await loadHostQueryCore()
assert.ok(core, 'Supply the pinned host QueryClient')
const source = (await Promise.all(['inbox-runtime.js', 'inbox-query.js'].map(name => fs.readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')))).join('\n')
const A = { connectionId: 'source-A', profile: 'default' }
const atom = initial => {
  let value = initial
  const listeners = new Set()
  return { get: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) }, set: next => { value = next; listeners.forEach(fn => fn()) } }
}
async function fixture(t, { delayed = false, live, metadata, failChildren = false } = {}) {
  const state = { connectionId: atom(A.connectionId), profile: atom(A.profile), gateway: atom('open'),
    focusedSessionOwner: atom(A), focusedStoredSessionId: atom('thread'), focusedSessionId: atom('runtime'), busyBySession: atom({}) }
  const sessions = metadata || [{ id: 'thread', source: 'desktop', profile: 'default', _lineage_root_id: 'root', _lineage_ids: ['thread', 'root'], message_count: 1 },
    { id: 'runtime', source: 'desktop', profile: 'default', message_count: 1 }, { id: 'other', source: 'desktop', profile: 'default', message_count: 1 }]
  let rows = live || [{ id: 'runtime', session_key: 'thread', stored_session_id: 'root', profile: 'default', status: 'idle' }]
  let roster = [{ subagent_id: 'child', status: 'running', goal: 'private goal' }], fail = failChildren
  let release
  const held = delayed ? new Promise(resolve => { release = resolve }) : Promise.resolve()
  const listeners = new Set(), receipts = [], snapshots = [], rpc = []
  const storageValues = new Map([['inbox', 'on']])
  const storage = { get: (key, fallback) => structuredClone(storageValues.get(key) ?? fallback), set: (key, value) => storageValues.set(key, structuredClone(value)) }
  const host = { state, onEvent: (_, fn) => { listeners.add(fn); return () => listeners.delete(fn) }, profileRoutes: async () => [A],
    requestProfile: async (owner, method, params) => {
      assert.deepEqual(owner, A)
      rpc.push({ owner, method, params })
      if (method === 'session.active_list') { await held; return { sessions: rows } }
      if (method === 'session.status') return { output: `Hermes TUI Status\n\nSession ID: thread\nPath: /profile/default` }
      if (method === 'subagent.list') { if (fail) throw new Error('Roster unavailable'); return { subagents: roster } }
      throw new Error(`Unexpected RPC ${method}`)
    } }
  const events = new Map()
  const window = { hermesDesktop: { api: async () => ({ total: sessions.length, sessions }),
    getAgentRoster: async () => ({ sources: [{ connectionId: A.connectionId, reachable: true }], agents: [A] }) },
    addEventListener: (type, fn) => { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn) },
    removeEventListener: (type, fn) => events.get(type)?.delete(fn), dispatchEvent: event => events.get(event.type)?.forEach(fn => fn(event)) }
  const queryClient = new core.QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })
  queryClient.mount()
  const context = vm.createContext({ ID: 'codex-chat-look', host, pluginStorage: storage, queryClient, window, document: { querySelector: () => null },
    CodexInboxObserverVendor: { QueryObserver: core.QueryObserver }, URLSearchParams,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail } } })
  vm.runInContext(source + '\nglobalThis.code = {createCodexInboxModel,startCodexInboxObserver,connectCodexInboxEvents};', context)
  const model = context.code.createCodexInboxModel(storage)
  const inbox = { model, setMode() {}, update: snapshot => { snapshots.push(snapshot); model.ingest(A, snapshot.sessions) }, activity: event => receipts.push(event) }
  const off = context.code.connectCodexInboxEvents(inbox)
  const stop = context.code.startCodexInboxObserver({ onDispose() {} }, inbox)
  t.after(() => { release?.(); off(); stop(); queryClient.unmount(); queryClient.clear() })
  await flush()
  return { state, receipts, snapshots, rpc, inbox, sessions, last: () => snapshots.at(-1),
    emit: (type, extra = {}) => listeners.forEach(fn => fn({ ...A, type, session_id: 'runtime', payload: { subagent_id: 'child', status: 'complete', text: 'private text' }, ...extra })),
    release: async () => { release?.(); await flush(); await flush() },
    setRoster: value => { roster = value }, setLive: value => { rows = value }, failRoster: () => { fail = true } }
}

test('merged source preserves departed child payload, canonical sink and durable busy aggregation', async t => {
  const f = await fixture(t, { delayed: true, live: [{ id: 'runtime', session_key: 'thread', status: 'idle' }, { id: 'second-runtime', session_key: 'root', profile: 'default', status: 'idle' }] })
  f.emit('subagent.spawn_requested'); f.emit('subagent.start'); f.emit('message.complete')
  f.state.focusedSessionId.set('other-runtime'); f.state.focusedStoredSessionId.set('other')
  f.state.busyBySession.set({ runtime: true, 'second-runtime': false })
  assert.equal(f.receipts.length, 0, 'nomination alone never authorizes the sink')
  await f.release()
  assert.deepEqual(f.receipts.map(event => event.type), ['subagent.spawn_requested', 'subagent.start', 'message.complete'])
  assert.ok(f.receipts.every(event => event.session_id === 'thread' && event.canonicalSessionId === 'thread' && event.payload.subagent_id === 'child' && !event.payload.text))
  assert.ok(f.last().liveSessions.every(row => row._codexInboxCanonicalId === 'root' && row.session_key === 'thread' && row.stored_session_id === 'thread'))
  assert.equal(f.last().busyBySession.thread, true, 'work outranks idle among runtimes of one durable lineage')
  assert.equal(f.last().busyBySession.runtime, undefined, 'no colliding raw runtime busy aliases reach the durable sink')
  assert.deepEqual(JSON.parse(JSON.stringify(f.last().childSnapshots)).map(row => [row.session_id, row.childIds]), [['root', ['child']]])
  assert.ok(!JSON.stringify(f.last().childSnapshots).includes('private'))
})

for (const live of [
  [{ id: 'runtime', session_id: 'different-runtime', session_key: 'thread', profile: 'default', status: 'idle' }],
  [{ id: 'runtime', session_key: 'thread', stored_session_id: 'other', profile: 'default', status: 'idle' }],
  [{ id: 'runtime', session_key: 'thread', stored_session_id: 42, profile: 'default', status: 'idle' }],
  [{ id: 'runtime', session_key: 'thread', profile: 'default', status: 'idle' }, { id: 'runtime', session_key: 'thread', profile: 'foreign', status: 'idle' }]
]) test(`merged source rejects contradictory child runtime identity: ${JSON.stringify(live)}`, async t => {
  const f = await fixture(t, { live })
  f.emit('subagent.complete')
  assert.equal(f.receipts.length, 0)
  assert.equal(f.rpc.filter(call => call.method === 'subagent.list').length, 0)
  assert.deepEqual(Array.from(f.last().childSnapshots), [])
})

test('manual Settle fences buffered child events after verified lineage despite departure', async t => {
  const f = await fixture(t, { delayed: true })
  f.emit('subagent.start')
  assert.equal(f.inbox.model.settle(A, f.sessions[0], { manual: true }), true)
  f.state.focusedSessionId.set('other-runtime'); f.state.focusedStoredSessionId.set('other')
  await f.release()
  assert.equal(f.receipts.length, 0, 'pre-Settle events cannot restore attention when proof arrives')
  f.emit('subagent.start')
  assert.equal(f.receipts.length, 1, 'post-Settle fresh events retain the proved durable sink contract')
  assert.equal(f.receipts[0].canonicalSessionId, 'thread')
})

test('child roster failures stay unknown and disconnected late proofs supply no authority', async t => {
  const f = await fixture(t)
  f.failRoster(); f.last().retry(); await flush()
  assert.deepEqual(Array.from(f.last().childSnapshots), [])
  assert.ok(f.last().liveSessions.some(row => row.status === 'unknown' && row._codexInboxCanonicalId === 'root'))
  const late = await fixture(t, { delayed: true })
  late.emit('subagent.complete'); late.state.gateway.set('closed')
  await late.release()
  assert.equal(late.receipts.length, 0)
  assert.deepEqual(Array.from(late.last().childSnapshots), [])
})
