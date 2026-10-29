import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const scope = { connectionId: 'A', profile: 'default' }
const atom = value => ({ get: () => value })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }

async function fixture(held) {
  const waits = { history: deferred(), identity: deferred(), child: deferred(), roster: deferred() }
  const metadata = ['focus', 'fast', 'slow'].map(id => ({ id, profile: 'default', source: 'desktop', message_count: 1 }))
  const runtime = metadata.map(row => ({ id: `R-${row.id}`, session_key: row.id, status: 'working' }))
  const host = {
    state: { connectionId: atom('A'), profile: atom('default'), focusedSessionOwner: atom(scope), focusedStoredSessionId: atom('focus'), focusedSessionId: atom('R-focus') },
    profileRoutes: async () => [scope],
    requestProfile: async (_, method, params) => {
      if (method === 'session.active_list') return { sessions: runtime }
      if (method === 'session.status') {
        if (held === 'identity' && params.session_id === 'R-slow') await waits.identity.promise
        return { output: `Hermes TUI Status\n\nSession ID: ${params.session_id.slice(2)}\nPath: /owner` }
      }
      if (method === 'subagent.list') {
        if (held === 'child' && params.session_id === 'R-slow') await waits.child.promise
        return { subagents: params.session_id === 'R-fast' ? [{ subagent_id: 'kid', status: 'running' }] : [] }
      }
      throw Error(method)
    }
  }
  const f = await loadPluginInternals(['readCodexInboxPage', 'createCodexInboxModel', 'createCodexInboxAdmission'], {
    URLSearchParams, host, window: { hermesDesktop: {
      api: async options => {
        if (options.path.startsWith('/api/sessions?')) return { total: metadata.length, sessions: metadata }
        if (held === 'history') await waits.history.promise
        if (options.path.includes('/latest-descendant?')) return { requested_session_id: 'old', session_id: 'old', path: ['old'] }
        return { id: 'old', profile: 'default', source: 'desktop', message_count: 1 }
      },
      getAgentRoster: async () => {
        if (held === 'roster') await waits.roster.promise
        return { sources: [{ connectionId: 'A', reachable: true }], agents: [scope] }
      }
    } }
  })
  const storage = { get: (_, fallback) => fallback, set() {} }
  const model = f.createCodexInboxModel(storage), admission = f.createCodexInboxAdmission(storage, model)
  if (held === 'history') admission.explicitSessionIds = () => ['old']
  const previews = [], progress = []
  const abort = new AbortController()
  let finished = false
  const pending = f.readCodexInboxPage(scope, 1, abort.signal, { model, admission }, new Map(), data => previews.push(data), () => [], data => progress.push(data)).then(data => { finished = true; return data })
  return { waits, previews, progress, abort, pending, finished: () => finished }
}

for (const held of ['history', 'identity', 'child', 'roster']) {
  test(`cold startup publishes verified work before unrelated ${held} completes`, async () => {
    const f = await fixture(held)
    try {
      await flush()
      assert.equal(f.finished(), false, 'slow request is still outstanding')
      assert.ok(f.previews.some(data => data.sessions.some(row => row.id === 'focus')), 'metadata paints before history hydration')
      assert.ok(f.progress.some(data => data.liveSessions.some(row => row.id === 'R-fast' && row.status === 'working')), 'proved work must publish without the unrelated request')
      if (held === 'child') assert.ok(f.progress.some(data => data.childSnapshots.some(row => row.session_id === 'fast' && row.childIds.includes('kid'))), 'fast child roster publishes independently')
      assert.ok(f.progress.every(data => data.liveSnapshotComplete === false), 'partial progress never certifies a complete snapshot or Settle')
    } finally { Object.values(f.waits).forEach(wait => wait.resolve()); await f.pending }
  })
}

test('disconnect cancellation prevents late progressive owner/child publication', async () => {
  const f = await fixture('identity')
  await flush()
  f.abort.abort()
  const before = f.progress.length
  Object.values(f.waits).forEach(wait => wait.resolve())
  await assert.rejects(f.pending, /scope changed/)
  assert.equal(f.progress.length, before)
})
