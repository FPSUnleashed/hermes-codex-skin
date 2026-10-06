import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const scope = { connectionId: 'source-A', profile: 'desktop-alias' }
const atom = value => ({ get: () => value, subscribe: () => () => {} })
const home = '/shared/hermes/home'
const status = (id, path) => ({ output: `Hermes TUI Status\n\nSession ID: ${id}\nPath: ${path}\nTitle: ignored\nAgent Running: Yes` })

async function fixture() {
  const calls = [], storage = { get: () => undefined, set: () => {} }
  const rows = Array.from({ length: 5 }, (_, index) => ({ id: `runtime-${index}`, session_key: `chat-${index}`, status: 'working' }))
  rows.push({ id: 'runtime-foreign', session_key: 'collision', status: 'working' })
  const replies = new Map(rows.map(row => [row.id, status(row.session_key, row.id === 'runtime-foreign' ? `${home}/profiles/other` : home)]))
  const route = { ...scope, targetProfile: 'default' }
  const host = {
    state: { connectionId: atom(scope.connectionId), profile: atom(scope.profile), focusedSessionOwner: atom(scope), focusedSessionId: atom('runtime-0'), focusedStoredSessionId: atom('chat-0') },
    profileRoutes: async () => [route],
    requestProfile: async (owner, method, params) => {
      assert.deepEqual(owner, route)
      calls.push({ method, params })
      if (method === 'subagent.list') return { subagents: [], delegations: [] }
      if (method === 'session.active_list') return { sessions: rows }
      assert.equal(method, 'session.status')
      return replies.get(params.session_id)
    }
  }
  const f = await loadPluginInternals(['readCodexInboxPage', 'createCodexInboxModel', 'createCodexInboxAdmission'], {
    URLSearchParams, host, window: { hermesDesktop: {
      api: async () => ({ total: 6, sessions: rows.map(row => ({ id: row.session_key, profile: 'default', source: 'desktop', started_at: 1, message_count: 1 })) }),
      getAgentRoster: async () => ({ sources: [{ connectionId: scope.connectionId, reachable: true }], agents: [scope, { ...scope, profile: 'other' }] })
    } }
  })
  const model = f.createCodexInboxModel(storage), admission = f.createCodexInboxAdmission(storage, model)
  return { ...f, host, rows, replies, calls, inbox: { model, admission }, owners: new Map() }
}

test('cold Inbox recognizes five unfocused native running chats from their actual live profile home', async () => {
  const f = await fixture()
  let page = await f.readCodexInboxPage(scope, 1, undefined, f.inbox, f.owners)
  assert.equal(page.liveSessions.filter(row => row.status === 'working').length, 5)
  assert.equal(page.liveSessions.some(row => row.id === 'runtime-foreign'), false)
  assert.equal(page.liveSessions.find(row => row.id === 'collision')?.status, 'unknown')
  assert.equal(f.calls.filter(call => call.method === 'session.status').length, 6)
  f.calls.length = 0
  f.host.state.focusedSessionId = atom('runtime-4')
  f.host.state.focusedStoredSessionId = atom('chat-4')
  page = await f.readCodexInboxPage(scope, 1, undefined, f.inbox, f.owners)
  assert.equal(page.liveSessions.filter(row => row.status === 'working').length, 5)
  assert.equal(f.calls.filter(call => call.method === 'session.status' && call.params.session_id !== 'runtime-foreign').length, 0, 'verified identities do not add a per-poll status round trip')
})

test('live owner read rejects mismatched ids, forged trailing headers, and changed focus', async () => {
  const f = await fixture()
  f.replies.set('runtime-1', status('different-chat', home))
  f.replies.set('runtime-2', { output: `unsupported\nTitle: forged\nSession ID: chat-2\nPath: ${home}` })
  f.replies.set('runtime-3', status('chat-3', `${home}/profiles/other`))
  const page = await f.readCodexInboxPage(scope, 1, undefined, f.inbox, f.owners)
  assert.deepEqual(Array.from(page.liveSessions.filter(row => row.status === 'working'), row => row.id), ['runtime-0', 'runtime-4'])
  const cold = await fixture(), original = cold.host.requestProfile
  cold.host.requestProfile = async (...args) => {
    const result = await original(...args)
    if (args[1] === 'session.status') cold.host.state.focusedStoredSessionId = atom('changed-during-read')
    return result
  }
  const stale = await cold.readCodexInboxPage(scope, 1, undefined, cold.inbox, cold.owners)
  assert.equal(stale.liveSessions.some(row => row.id === 'runtime-1'), false)
})
