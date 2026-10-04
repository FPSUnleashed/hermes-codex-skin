import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const scope = { connectionId: 'source-A', profile: 'default' }
const atom = value => ({ get: () => value, subscribe: () => () => {} })
const nativeRows = () => [
  { id: 'runtime-default', session_key: 'safe-a', status: 'idle' },
  { id: 'runtime-foreign', session_key: 'shared-id', status: 'working' }
]
// The independently exercised native producer returns process-wide, unqualified
// runtime rows even when the RPC request names a profile.
async function fixture(owner = scope) {
  const records = new Map()
  const storage = { get: key => records.get(key), set: (key, value) => records.set(key, structuredClone(value)) }
  let live = nativeRows()
  const host = {
    state: { connectionId: atom(owner.connectionId), profile: atom(owner.profile) },
    request: async () => ({ sessions: live }),
    profileRoutes: async () => [{ ...owner, targetProfile: 'default' }]
  }
  const internals = await loadPluginInternals(['readCodexInboxPage', 'createCodexInboxModel', 'createCodexInboxAdmission'], {
    URLSearchParams, host, window: { hermesDesktop: {
      api: async () => ({ total: 2, sessions: [
        { id: 'safe-a', profile: 'default', source: 'desktop', started_at: 1, message_count: 1 },
        { id: 'shared-id', profile: 'default', source: 'desktop', started_at: 1, message_count: 1 }
      ] }),
      getAgentRoster: async () => ({ sources: [{ connectionId: owner.connectionId, reachable: true }], agents: [owner, { ...owner, profile: 'other' }] })
    } }
  })
  const model = internals.createCodexInboxModel(storage)
  const admission = internals.createCodexInboxAdmission(storage, model)
  return { ...internals, model, admission, host, setLive: rows => { live = rows } }
}

test('unowned process-wide runtime cannot admit a colliding idle thread in another profile', async () => {
  const f = await fixture()
  const page = await f.readCodexInboxPage(scope, 1, undefined, { model: f.model, admission: f.admission })
  assert.equal(page.liveStatusKnown, true)
  assert.equal(page.liveSessions.some(row => row.id === 'runtime-foreign'), false)
  assert.equal(page.liveSessions.some(row => row.status === 'working'), false)
  assert.equal(page.liveSessions.find(row => row.id === 'shared-id')?.status, 'unknown', 'unknown identity blocks unchecked settle instead of pretending idle')
  const working = page.liveSessions.filter(row => ['working', 'running'].includes(row.status))
  f.admission.observe(scope, page.sessions, { workingSessions: working })
  assert.equal(f.admission.isEligible(scope, page.sessions.find(row => row.id === 'shared-id')), false)
})

test('stable SDK identity proof preserves owned runtime status across focus and Desktop aliases', async () => {
  const owner = { connectionId: 'source-A', profile: 'desktop-alias' }
  const f = await fixture(owner), cache = new Map()
  Object.assign(f.host.state, {
    focusedSessionOwner: atom(owner), focusedSessionId: atom('runtime-default'), focusedStoredSessionId: atom('safe-a')
  })
  let page = await f.readCodexInboxPage(owner, 1, undefined, { model: f.model, admission: f.admission }, cache)
  const mine = page.liveSessions.find(row => row.id === 'runtime-default')
  assert.equal(mine?.profile, owner.profile)
  assert.equal(mine?.connection_id, owner.connectionId)
  assert.equal(mine?.status, 'idle')
  assert.equal(page.liveSessions.some(row => row.id === 'runtime-foreign'), false)
  f.host.state.focusedSessionId = atom('another-runtime')
  f.host.state.focusedStoredSessionId = atom('another-thread')
  f.setLive([{ id: 'runtime-default', session_key: 'safe-a', status: 'working' }, nativeRows()[1]])
  page = await f.readCodexInboxPage(owner, 1, undefined, { model: f.model, admission: f.admission }, cache)
  assert.equal(page.liveSessions.find(row => row.id === 'runtime-default')?.status, 'working')
  const cold = await f.readCodexInboxPage(owner, 1, undefined, { model: f.model, admission: f.admission })
  assert.equal(cold.liveSessions.some(row => row.id === 'runtime-default'), false)
  assert.equal(cold.liveSessions.find(row => row.id === 'safe-a')?.status, 'unknown')
})
