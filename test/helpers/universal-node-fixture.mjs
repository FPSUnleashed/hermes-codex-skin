import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'
import { loadHostQueryCore } from './inbox-observer.mjs'

export const atom = initial => {
  let value = initial
  const listeners = new Set()
  return { get: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    set: next => { value = next; for (const fn of listeners) fn() } }
}
export const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
export async function until(predicate, message = 'fixture did not settle') {
  for (let i = 0; i < 200; i++) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  assert.fail(message)
}

export async function universalNodeFixture(t, { universal = true, holdLive = null, ambiguous = false } = {}) {
  const core = await loadHostQueryCore()
  assert.ok(core, 'pinned QueryClient must be installed')
  const dom = new JSDOM('<!doctype html><html data-codex-chat-look="true"><aside data-sessions-mode="sessions"></aside></html>', { url: 'http://fixture.invalid/' })
  const { window } = dom
  const frames = new Map()
  let frameId = 0
  window.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId }
  window.cancelAnimationFrame = id => frames.delete(id)
  const routes = [
    { connectionId: 'A', profile: 'default', targetProfile: 'default', mode: 'local' },
    { connectionId: 'A', profile: 'desk', targetProfile: 'alpha', mode: 'remote' },
    { connectionId: 'B', profile: 'desk', targetProfile: 'alpha', mode: 'remote' }
  ]
  if (ambiguous) routes.push({ connectionId: 'A', profile: 'alias', targetProfile: 'alpha', mode: 'remote' })
  const state = { connectionId: atom('A'), profile: atom('default'), gateway: atom('open'),
    focusedSessionOwner: atom(null), focusedStoredSessionId: atom(null), focusedSessionId: atom(null), busyBySession: atom({}) }
  const saved = new Map([['inbox', 'on'], ['universal-inbox', universal]])
  const storage = { get: (key, fallback) => structuredClone(saved.get(key) ?? fallback), set: (key, value) => saved.set(key, structuredClone(value)) }
  const metadata = route => ({ id: 'same', title: route.connectionId + ':' + route.profile, profile: route.targetProfile,
    connection_id: route.connectionId, source: 'desktop', message_count: 2, started_at: 1,
    _lineage_root_id: 'root', _lineage_ids: ['root', 'same'] })
  const runtimeId = route => 'R-' + route.connectionId + '-' + route.profile
  const events = new Set(), calls = [], receipts = [], publications = [], liveStarted = new Set(), liveStates = new Map()
  const host = { state, profileRoutes: async () => routes, onEvent: (_, fn) => { events.add(fn); return () => events.delete(fn) },
    requestProfile: async (route, method) => {
      calls.push({ route: { ...route }, method })
      if (method === 'subagent.list') return { subagents: [] }
      assert.equal(method, 'session.active_list')
      liveStarted.add(route.connectionId + ':' + route.profile)
      if (holdLive) await holdLive.promise
      return { sessions: [{ id: runtimeId(route), session_key: 'same', profile: route.targetProfile || route.profile,
        connection_id: route.connectionId, status: liveStates.get(runtimeId(route)) || 'idle' }] }
    } }
  window.hermesDesktop = {
    getAgentRoster: async () => ({ sources: ['A', 'B'].map(connectionId => ({ connectionId, reachable: true })), agents: routes }),
    api: async request => {
      calls.push(request)
      const route = routes.find(route => route.connectionId === request.connectionId && route.profile === request.profile)
      assert.ok(route, 'metadata must use exact owner routing')
      return { total: 1, sessions: [metadata(route)] }
    }
  }
  const queryClient = new core.QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })
  queryClient.mount()
  const context = vm.createContext({ ID: 'codex-chat-look', pluginStorage: storage, host, window, document: window.document,
    queryClient, URLSearchParams, AbortController, CustomEvent: window.CustomEvent, queueMicrotask,
    setTimeout, clearTimeout, setInterval, clearInterval, console,
    jsx: () => null, useEffect() {}, useRef: () => ({}), useQuery: () => ({}), THEMES_AREA: 'themes', TITLEBAR_AREAS: {}, PALETTE_AREA: 'palette' })
  const names = ['installCodexInboxRuntime', 'startCodexInboxService', 'connectCodexInboxEvents', 'setUniversalInbox', 'readUniversalInboxInventory', 'codexInboxReadLimiter']
  let source
  if (process.env.CODEX_UNIVERSAL_TEST_BUNDLE) {
    source = (await readFile(process.env.CODEX_UNIVERSAL_TEST_BUNDLE, 'utf8')).replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')
    source += '\npluginStorage = globalThis.__storage;'
    context.__storage = storage
  } else {
    source = (await Promise.all(['inbox-observer-runtime', 'inbox-query', 'inbox-universal', 'inbox-open-gesture', 'inbox-open-intent', 'inbox-row-ui', 'inbox-runtime']
      .map(name => readFile(process.env.CODEX_UNIVERSAL_SOURCE_ROOT ? `${process.env.CODEX_UNIVERSAL_SOURCE_ROOT}/src/${name}.js` : new URL('../../src/' + name + '.js', import.meta.url), 'utf8')))).join('\n\n')
  }
  vm.runInContext(source + '\nglobalThis.api = {' + names.join(',') + '}', context, { filename: 'codex-universal-node-runtime.js' })
  const api = context.api
  const runtime = api.installCodexInboxRuntime({ storage, host, document: window.document, window })
  const activity = runtime.activity
  runtime.activity = event => { const result = activity(event); receipts.push({ event, result }); return result }
  const updateOwners = runtime.updateOwners
  runtime.updateOwners = snapshots => { publications.push(snapshots); return updateOwners(snapshots) }
  const disposals = []
  const stop = api.startCodexInboxService({ onDispose: fn => disposals.push(fn) }, runtime)
  const disconnect = api.connectCodexInboxEvents(runtime)
  t.after(() => {
    disconnect(); stop(); runtime.dispose(); queryClient.unmount(); queryClient.clear(); window.close()
  })
  const paint = async () => {
    await new Promise(resolve => setImmediate(resolve))
    for (const [id, fn] of [...frames]) { frames.delete(id); fn() }
    await new Promise(resolve => setImmediate(resolve))
  }
  const ready = async () => {
    await until(() => queryClient.getQueryCache().getAll().filter(query => query.getObserversCount()).every(query => query.state.fetchStatus === 'idle') &&
      (universal ? publications.at(-1)?.length >= (ambiguous ? 2 : 3) : calls.some(call => call.method)), 'owner reads did not finish')
    await paint()
  }
  const emit = (route, type, payload = {}) => {
    // Native follow-up reads must agree with the lifecycle producer. Returning
    // a newer idle snapshot after a request correctly supersedes its input bit.
    const status = ['clarify.request', 'approval.request'].includes(type) ? 'waiting' :
      type === 'message.start' ? 'working' : type === 'message.complete' ? 'idle' : null
    if (status) liveStates.set(runtimeId(route), status)
    for (const fn of [...events]) fn({ connectionId: route.connectionId, profile: route.profile, session_id: runtimeId(route), type, payload })
  }
  const row = route => [...window.document.querySelectorAll('[data-codex-inbox-row]')].find(node => {
    const key = JSON.parse(node.dataset.codexInboxKey)
    return key[0] === route.connectionId && key[1] === route.profile
  })
  return { ...api, runtime, routes, state, saved, calls, receipts, publications, liveStarted, emit, row, ready, paint,
    queryClient, window, metadata, runtimeId, context }
}
