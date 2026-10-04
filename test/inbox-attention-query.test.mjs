import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const source = (await Promise.all(['inbox-runtime.js', 'inbox-open-intent.js', 'inbox-query.js'].map(file => readFile(new URL('../src/' + file, import.meta.url), 'utf8')))).join('\n')
const scope = { connectionId: 'source-A', profile: 'default' }

async function fixture({ retainedError, failAt = 'lineage', corrupt = false } = {}) {
  const calls = [], records = new Map()
  const storage = { get: key => records.get(key), set: (key, value) => records.set(key, structuredClone(value)) }
  const context = vm.createContext({
    ID: 'codex-chat-look', URLSearchParams, console,
    host: { state: { connectionId: { get: () => scope.connectionId }, profile: { get: () => scope.profile } }, request: async () => ({ sessions: [] }) },
    window: { hermesDesktop: {
      api: async options => {
        calls.push(options)
        const url = new URL(options.path, 'https://fixture.invalid')
        if (url.pathname === '/api/sessions') return { total: 500, sessions: [{ id: 'unadmitted-idle-history', profile: 'default', message_count: 1, started_at: 1 }] }
        const id = decodeURIComponent(url.pathname.split('/')[3])
        const stage = url.pathname.endsWith('/latest-descendant') ? 'lineage' : 'metadata'
        if (id === 'gone' && stage === failAt) {
          if (retainedError) throw retainedError
          if (corrupt) return { detail: 'HTTP 404 mentioned in corrupt metadata' }
        }
        if (stage === 'lineage') return { requested_session_id: id, session_id: id, path: [id] }
        return { id, source: 'desktop', profile: 'default', message_count: 1, started_at: 1 }
      },
      getAgentRoster: async () => ({ sources: [{ connectionId: scope.connectionId, reachable: true }], agents: [scope] })
    } }
  })
  vm.runInContext(source + '\nglobalThis.exports={createCodexInboxModel,createCodexInboxAdmission,readCodexInboxPage}', context)
  const model = context.exports.createCodexInboxModel(storage)
  const admission = context.exports.createCodexInboxAdmission(storage, model)
  return { ...context.exports, model, admission, calls, records, storage }
}

test('scroll-only Inbox retrieves all admitted attention beyond 100 without importing idle history', async () => {
  const f = await fixture()
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: 'attention-' + i, source: 'desktop', profile: 'default', connection_id: scope.connectionId, started_at: 1, message_count: 1 }))
  f.model.ingest(scope, rows)
  assert.equal(f.admission.observe(scope, rows, { workingSessions: rows }), true)
  assert.equal(f.admission.admittedSessionIds(scope).length, rows.length)
  assert.deepEqual(Array.from(f.admission.explicitSessionIds(scope)), [], 'real work admissions are not rewritten into deliberate opens')
  assert.equal(f.model.settle(scope, rows[0]), true)
  assert.equal(f.model.snooze(scope, rows[1], Date.now() + 60_000), true)
  const other = { connectionId: 'source-B', profile: 'other' }
  const foreign = { id: 'foreign', source: 'desktop', profile: 'other', connection_id: 'source-B', started_at: 1 }
  assert.equal(f.admission.observe(other, [foreign], { workingSessions: [foreign] }), true)
  const reloaded = f.createCodexInboxAdmission(f.storage, f.model)
  const page = await f.readCodexInboxPage(scope, 1, undefined, { admission: reloaded, model: f.model })
  const fetched = page.sessions.filter(row => row.id.startsWith('attention-'))
  assert.equal(fetched.length, 118)
  assert.equal(new Set(fetched.map(row => row.id)).size, 118)
  assert.equal(fetched.some(row => row.id === 'attention-119'), true, 'the recent-page size is not an attention limit')
  assert.equal(page.sessions.some(row => row.id === 'foreign'), false)
  assert.equal(reloaded.isEligible(scope, page.sessions.find(row => row.id === 'unadmitted-idle-history')), false)
  assert.equal(f.calls.filter(call => new URL(call.path, 'https://fixture.invalid').pathname === '/api/sessions').length, 1, 'does not fetch every history page')
  assert.equal(f.calls.every(call => call.connectionId === scope.connectionId && call.profile === scope.profile), true)
  assert.equal(f.calls.some(call => /attention-(?:0|1|foreign)\//.test(call.path)), false, 'settled and snoozed attention is not fetched')
})

test('more than 100 explicitly opened chats never import history after reload', async () => {
  const f = await fixture()
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: 'opened-' + i, profile: 'default', connection_id: scope.connectionId, started_at: 1, message_count: 1 }))
  f.model.ingest(scope, rows)
  assert.equal(f.admission.observe(scope, rows, { explicitOpenedSessions: rows }), true)
  const admission = f.createCodexInboxAdmission(f.storage, f.model)
  const page = await f.readCodexInboxPage(scope, 1, undefined, { admission, model: f.model })
  assert.equal(page.sessions.filter(row => row.id.startsWith('opened-')).length, 0)
  assert.equal(page.explicitRequestedIds.length, 0, 'opens never create durable attention')
  assert.equal(admission.isEligible(scope, 'opened-119'), false)
})

const ipcError = message => new Error(`Error invoking remote method 'hermes:api': Error: ${message}`)
const attentionRows = () => ['gone', ...Array.from({ length: 120 }, (_, i) => 'attention-' + i)]
  .map(id => ({ id, source: 'desktop', profile: scope.profile, connection_id: scope.connectionId, started_at: 1, message_count: 1 }))

function reloadAttention(f) {
  const rows = attentionRows()
  f.model.ingest(scope, rows)
  assert.equal(f.admission.observe(scope, rows, { workingSessions: rows }), true)
  const model = f.createCodexInboxModel(f.storage)
  const admission = f.createCodexInboxAdmission(f.storage, model)
  assert.equal(admission.admittedSessionIds(scope).length, rows.length)
  return { model, admission }
}

test('deleted admitted native 404 does not discard 120 surviving attention threads after reload', async () => {
  for (const retainedError of [
    Object.assign(new Error('Session not found'), { status: 404 }),
    Object.assign(new Error('404: {"detail":"Session not found"}'), { statusCode: 404 }),
    ipcError('404: {"detail":"Session not found"}')
  ]) {
    for (const failAt of ['lineage', 'metadata']) {
      const f = await fixture({ retainedError, failAt })
      const inbox = reloadAttention(f)
      const page = await f.readCodexInboxPage(scope, 1, undefined, inbox)
      const alive = page.sessions.filter(row => row.id.startsWith('attention-'))
      assert.equal(alive.length, 120)
      assert.equal(new Set(alive.map(row => row.id)).size, 120)
      assert.equal(alive.some(row => row.id === 'attention-119'), true)
      assert.equal(page.sessions.some(row => row.id === 'gone'), false)
      assert.equal(page.explicitRequestedIds.length, 121)
      assert.equal(alive.every(row => inbox.admission.isEligible(scope, row)), true)
      assert.equal(inbox.admission.isEligible(scope, page.sessions.find(row => row.id === 'unadmitted-idle-history')), false)
      assert.equal(f.calls.filter(call => new URL(call.path, 'https://fixture.invalid').pathname === '/api/sessions').length, 1)
      assert.equal(f.calls.every(call => call.connectionId === scope.connectionId && call.profile === scope.profile), true)
    }
  }
})

test('retention rejects auth, transport and corruption failures even when their text mentions 404', async () => {
  const errors = [
    ...[401, 403, 500].flatMap(statusCode => [
      Object.assign(new Error(`${statusCode}: {"detail":"upstream HTTP 404"}`), { statusCode }),
      Object.assign(ipcError('404: misleading body'), { status: statusCode }),
      ipcError(`${statusCode}: {"detail":"upstream HTTP 404"}`)
    ]),
    new Error('Network failed while requesting HTTP 404 diagnostics'),
    ipcError('Network failed: HTTP 404'),
    ipcError('Corrupt metadata: status 404'),
    new Error('HTTP 404: not a native status prefix'),
    new Error('404: not an IPC error'),
    new Error("prefix Error invoking remote method 'hermes:api': Error: 404: not anchored"),
    new Error("Error invoking remote method 'other:api': Error: 404: wrong method"),
    ipcError('4040: not status 404'),
    Object.assign(new Error('HTTP 404'), { statusCode: '404' })
  ]
  for (const failAt of ['lineage', 'metadata']) {
    for (const retainedError of errors) {
      const f = await fixture({ retainedError, failAt })
      await assert.rejects(f.readCodexInboxPage(scope, 1, undefined, reloadAttention(f)), error => error === retainedError)
    }
    const corrupt = await fixture({ corrupt: true, failAt })
    await assert.rejects(corrupt.readCodexInboxPage(scope, 1, undefined, reloadAttention(corrupt)), /lineage could not be verified|incomplete opened-chat metadata/)
  }
})
