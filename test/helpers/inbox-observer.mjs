import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadPluginInternals } from './load-plugin.mjs'

// Tests can use an explicitly supplied host installation without coupling the
// shipped plugin or its ordinary build to a native source tree.
export async function loadHostQueryCore() {
  const root = process.env.CODEX_INBOX_QUERY_CORE_ROOT
  const require = root ? createRequire(pathToFileURL(resolve(root, 'package.json'))) : createRequire(import.meta.url)
  let manifestPath
  try { manifestPath = require.resolve('@tanstack/query-core/package.json') }
  catch (error) { if (error.code === 'MODULE_NOT_FOUND') return null; throw error }
  const manifest = require(manifestPath), version = manifest.version
  if (version !== '5.101.2') throw new Error(`Inbox host probe requires query-core@5.101.2, found ${version}`)
  const entry = resolve(dirname(manifestPath), manifest.exports['.'].import.default)
  return import(pathToFileURL(entry).href)
}

export const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)) }

function atom(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    set: next => { value = next; listeners.forEach(fn => fn()) },
    notify: () => listeners.forEach(fn => fn()), listeners
  }
}

export async function observerFixture(core, { api, initialMode = 'on', cached } = {}) {
  const state = {
    connectionId: atom('source-A'), profile: atom('default'),
    busyBySession: atom({}), focusedStoredSessionId: atom(null), focusedSessionOwner: atom(null)
  }
  const values = new Map([['inbox', initialMode]]), events = new Map(), mutations = new Set()
  const calls = [], snapshots = [], modes = [], intervals = new Map(), timeouts = new Map()
  let nextTimer = 0, island = null
  const document = { body: null, visibilityState: 'visible', querySelector: () => island }
  const window = {
    location: { hash: '#/chat' },
    hermesDesktop: {
      api: async options => {
        calls.push(options)
        return api ? api(options) : { total: 1, sessions: [{ id: 'one', profile: options.profile }] }
      },
      getAgentRoster: async () => ({
        agents: [{ connectionId: state.connectionId.get(), profile: state.profile.get() }],
        sources: [{ connectionId: state.connectionId.get(), reachable: true }]
      })
    },
    addEventListener: (type, fn) => { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn) },
    removeEventListener: (type, fn) => events.get(type)?.delete(fn),
    dispatchEvent: event => { events.get(event.type)?.forEach(fn => fn(event)); return true },
    MutationObserver: class {
      constructor(fn) { this.fn = fn }
      observe() { mutations.add(this.fn) }
      disconnect() { mutations.delete(this.fn) }
    }
  }
  const host = { state, request: async () => ({ sessions: [] }), onEvent: () => () => {} }
  const queryClient = new core.QueryClient({ defaultOptions: { queries: { gcTime: Infinity, refetchOnWindowFocus: false } } })
  queryClient.mount()
  queryClient.setQueryData(['host', 'unrelated'], { keep: true })
  const key = ['codex-chat-look', 'inbox', 'source-A', 'default', 1]
  if (cached) queryClient.setQueryData(key, cached)
  const internals = await loadPluginInternals(['startCodexInboxObserver', 'setCodexInboxMode', 'CodexInboxObserverVendor'], {
    host, queryClient, window, document, URLSearchParams,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail } },
    setInterval: (fn, delay) => { const id = ++nextTimer; intervals.set(id, { fn, delay }); return id },
    clearInterval: id => intervals.delete(id),
    setTimeout: (fn, delay) => { const id = ++nextTimer; timeouts.set(id, { fn, delay }); return id },
    clearTimeout: id => timeouts.delete(id)
  })
  // The no-DOM registration sets plugin storage but must not need a client.
  internals.plugin.register({ storage: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) }, onDispose() {}, register() {} })
  document.body = {}
  const inbox = { setMode: mode => modes.push(mode), update: snapshot => snapshots.push(snapshot) }
  const disposals = []
  const stop = internals.startCodexInboxObserver({ onDispose: fn => disposals.push(fn) }, inbox)
  return {
    ...internals, state, queryClient, host, document, window, key, calls, snapshots, modes, intervals, timeouts, inbox, values, events, mutations,
    last: () => snapshots.at(-1), stop,
    dispose: () => disposals.forEach(fn => fn()),
    tick: async () => { for (const timer of [...intervals.values()]) timer.fn(); await flush() },
    addIsland: () => { island = { dataset: {} }; mutations.forEach(fn => fn()); return island },
    cleanup: () => { stop(); queryClient.unmount(); queryClient.clear() }
  }
}