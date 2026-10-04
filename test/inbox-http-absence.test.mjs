import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Compile and import the complete native module, not a copied constructor.
// No requests are sent. Electron invoke serialization is modeled, not launched.
const root = process.env.CODEX_INBOX_QUERY_CORE_ROOT
const native = root ? await (async () => {
  const require = createRequire(pathToFileURL(resolve(root, 'package.json')))
  const ts = require('typescript')
  const source = await readFile(resolve(root, 'apps/desktop/electron/api-transport.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
})() : null
const options = { skip: native ? false : 'Set CODEX_INBOX_QUERY_CORE_ROOT to a native Hermes source/package root' }
const scope = { connectionId: 'source-A', profile: 'default' }
const foreign = { connectionId: 'source-A', profile: 'other' }
const atom = value => ({ get: () => value, subscribe: () => () => {} })
const serialize = error => new Error(`Error invoking remote method 'hermes:api': Error: ${error.message}`)
const results = []

async function fixture({ error, failAt = 'lineage', foreignRow, roster, stillCurrent = () => true } = {}) {
  const calls = []
  const f = await loadPluginInternals(['codexInboxUnchangedOpenOwner', 'readCodexInboxPage'], {
    URLSearchParams,
    host: {
      state: { connectionId: atom(scope.connectionId), profile: atom(scope.profile) },
      profileRoutes: async () => [scope, foreign], request: async () => ({ sessions: [] })
    },
    window: { hermesDesktop: {
      getAgentRoster: async () => roster || { sources: [{ connectionId: scope.connectionId, reachable: true }], agents: [scope, foreign] },
      api: async request => {
        calls.push(request)
        const url = new URL(request.path, 'https://fixture.invalid')
        if (url.pathname === '/api/sessions') return { total: 0, sessions: [] }
        const id = decodeURIComponent(url.pathname.split('/')[3])
        const stage = url.pathname.endsWith('/latest-descendant') ? 'lineage' : 'metadata'
        if (request.profile === foreign.profile) {
          if (foreignRow !== undefined) return foreignRow
          throw error
        }
        if (id === 'gone' && stage === failAt) throw error
        if (stage === 'lineage') return { requested_session_id: id, session_id: id, path: [id] }
        return { id, profile: scope.profile, message_count: 1, started_at: 1 }
      }
    } }
  })
  const inbox = {
    model: { isSettled: () => false, isSnoozed: () => false },
    admission: { admittedSessionIds: () => ['gone', 'survivor'], explicitSessionIds: () => [] }
  }
  return {
    calls,
    owner: () => f.codexInboxUnchangedOpenOwner('unique-thread', scope, stillCurrent),
    retention: () => f.readCodexInboxPage(scope, 1, undefined, inbox)
  }
}

async function outcome(fn, error, positive, path, label) {
  let value, thrown
  try { value = await fn() } catch (actual) { thrown = actual }
  const accepted = path === 'owner' ? value === true
    : value?.sessions.length === 1 && value.sessions[0].id === 'survivor'
  const passed = positive ? !thrown && accepted : thrown === error
  results.push({ label, path, expected: positive ? 'accept' : 'reject-same-error', accepted: !!accepted, threw: !!thrown, sameError: thrown === error, passed })
}

test('native HTTP absence matrix agrees for unchanged-open ownership and both retention stages', options, async () => {
  const scenarios = []
  for (const status of [404, 401, 403, 500]) {
    const error = native.httpStatusError(status, status === 404 ? '{"detail":"Session not found"}' : '{"detail":"upstream HTTP 404 or status 404"}')
    scenarios.push({ label: `native-${status}-structured`, error, positive: status === 404 },
      { label: `native-${status}-serialized`, error: serialize(error), positive: status === 404 })
  }
  for (const status of [401, 403, 500]) for (const field of ['status', 'statusCode']) {
    scenarios.push({ label: `${field}-${status}-overrides-serialized-404`, error: Object.assign(serialize(native.httpStatusError(404, 'misleading body')), { [field]: status }), positive: false })
  }
  for (const message of ['Network failed while requesting HTTP 404 diagnostics', 'Corrupt metadata: status 404']) {
    scenarios.push({ label: message, error: new Error(message), positive: false },
      { label: `serialized-${message}`, error: serialize(new Error(message)), positive: false })
  }
  for (const message of [
    'HTTP 404: not a native status prefix', '404: not an IPC error',
    "prefix Error invoking remote method 'hermes:api': Error: 404: not anchored",
    "Error invoking remote method 'other:api': Error: 404: wrong method",
    "Error invoking remote method 'hermes:api': Error: 4040: not status 404",
    "Error invoking remote method 'hermes:api': Error: 404:not the exact prefix"
  ]) scenarios.push({ label: message, error: new Error(message), positive: false })
  scenarios.push({ label: 'string-status-not-native', error: Object.assign(serialize(native.httpStatusError(404, 'missing')), { statusCode: '404' }), positive: false })
  for (const { label, error, positive } of scenarios) {
    const f = await fixture({ error })
    await outcome(f.owner, error, positive, 'owner', label)
    for (const failAt of ['lineage', 'metadata']) {
      const retained = await fixture({ error, failAt })
      await outcome(retained.retention, error, positive, `retention-${failAt}`, label)
      assert.ok(retained.calls.every(call => call.profile === scope.profile && call.connectionId === scope.connectionId))
    }
  }
  assert.deepEqual(results.filter(row => !row.passed), [])
})

test('negative owner proof never accepts duplicate, malformed, wrong-owner, incomplete or stale metadata', options, async () => {
  const error = native.httpStatusError(404, '{"detail":"Session not found"}')
  const duplicate = await fixture({ foreignRow: { id: 'unique-thread', profile: foreign.profile } })
  assert.equal(await duplicate.owner(), false)
  for (const foreignRow of [{ detail: 'HTTP 404 mentioned in corrupt metadata' }, { id: 'unique-thread', profile: scope.profile }]) {
    const f = await fixture({ foreignRow })
    await assert.rejects(f.owner(), /incomplete opened-chat metadata|owner could not be verified/)
  }
  for (const roster of [
    { sources: [{ connectionId: scope.connectionId, reachable: false }], agents: [scope, foreign] },
    { sources: [{ connectionId: scope.connectionId, reachable: true }], agents: [foreign] }
  ]) {
    const f = await fixture({ error, roster })
    assert.equal(await f.owner(), false)
    assert.equal(f.calls.length, 0)
  }
  const stale = await fixture({ error, stillCurrent: () => false })
  assert.equal(await stale.owner(), false)
  assert.equal(stale.calls.length, 0)
})

test.after(async () => {
  native?.destroyKeepaliveAgents()
  if (process.env.CODEX_INBOX_HTTP_MATRIX_OUTPUT) {
    await writeFile(process.env.CODEX_INBOX_HTTP_MATRIX_OUTPUT, JSON.stringify({
      provenance: 'complete native api-transport.ts compiled-import; plugin shipping bundle; synthetic metadata; modeled Electron invoke serialization; no network or private state',
      counts: { cases: results.length, passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length }, results
    }, null, 2) + '\n')
  }
})