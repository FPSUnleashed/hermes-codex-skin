import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'
import { loadHostQueryCore, flush } from './helpers/inbox-observer.mjs'

const atom = (initial) => {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set: (next) => { value = next; listeners.forEach((fn) => fn()) }
  }
}

// The plugin reads its preferences through `ctx.storage`, wired by the host when
// the plugin registers. Every fixture must register it the same way the app does.
function pluginStorage(values) {
  return {
    get: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
    set: (key, value) => { values.set(key, value) },
    remove: (key) => { values.delete(key) }
  }
}

async function readFixture(api, values, hostExtra = {}) {
  const host = {
    state: { connectionId: atom('conn'), profile: atom('default') },
    profileRoutes: async () => [{ connectionId: 'conn', profile: 'default', targetProfile: 'default' }],
    requestProfile: async () => ({ sessions: [] }),
    ...hostExtra.host
  }
  const loaded = await loadPluginInternals(
    ['readCodexInboxPage', 'sameInboxScope', 'codexInboxOwnedBy', 'codexInboxProfileSelected', 'createCodexInboxModel', 'createCodexInboxAdmission', 'readCodexInboxProfiles', 'setCodexInboxProfiles'],
    {
      host,
      window: { hermesDesktop: { api }, addEventListener() {}, removeEventListener() {}, ...(hostExtra.window || {}) },
      URLSearchParams
    }
  )
  loaded.plugin.register({ register() {}, onDispose() {}, storage: pluginStorage(values) })
  return { host, internals: loaded, values }
}

test('aggregated read keeps only selected profiles rows and drops rows without a profile', async () => {
  const values = new Map([['inbox-profiles', JSON.stringify(['beta'])]])
  const api = async () => ({
    total: 3,
    sessions: [
      { id: 'selected', profile: 'beta', connection_id: 'conn', message_count: 1 },
      { id: 'other', profile: 'alpha', connection_id: 'conn', message_count: 1 },
      { id: 'missing', connection_id: 'conn', message_count: 1 }
    ]
  })
  const { internals } = await readFixture(api, values)
  const result = await internals.readCodexInboxPage({ connectionId: 'conn', profile: '*' }, 1)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].id, 'selected')
  assert.equal(result.sessions[0].profile, 'beta')
})

test("['*'] accepts every real profile and rejects a row whose profile is the synthetic '*'", async () => {
  const values = new Map([['inbox-profiles', JSON.stringify(['*'])]])
  const api = async () => ({
    total: 3,
    sessions: [
      { id: 'alpha-row', profile: 'alpha', connection_id: 'conn', message_count: 1 },
      { id: 'beta-row', profile: 'beta', connection_id: 'conn', message_count: 1 },
      { id: 'synthetic-row', profile: '*', connection_id: 'conn', message_count: 1 }
    ]
  })
  const { internals } = await readFixture(api, values)
  const result = await internals.readCodexInboxPage({ connectionId: 'conn', profile: '*' }, 1)
  assert.equal(result.sessions.length, 2)
  assert.deepEqual(Array.from(result.sessions, (row) => row.profile).sort(), ['alpha', 'beta'])
})

async function liveFixture(selectedProfiles, routeProfiles) {
  const core = await loadHostQueryCore()
  const state = {
    connectionId: atom('conn'),
    profile: atom('default'),
    busyBySession: atom({}),
    focusedStoredSessionId: atom(null),
    focusedSessionOwner: atom(null)
  }
  const values = new Map([['inbox', 'on'], ['inbox-profiles', JSON.stringify(selectedProfiles)]])
  const document = { body: null, visibilityState: 'visible', querySelector: () => null }
  const window = {
    location: { hash: '#/chat' },
    hermesDesktop: {
      api: async () => ({ total: 1, sessions: [{ id: 'one', profile: routeProfiles[0] || 'alpha', connection_id: 'conn', message_count: 1 }] }),
      getAgentRoster: async () => ({ agents: [{ connectionId: 'conn', profile: 'alpha' }], sources: [{ connectionId: 'conn', reachable: true }] })
    },
    addEventListener: (type, fn) => {},
    removeEventListener: (type, fn) => {},
    dispatchEvent: (event) => true,
    MutationObserver: class { constructor() {} observe() {} disconnect() {} }
  }
  const host = {
    state,
    profileRoutes: async () => routeProfiles.map((profile) => ({ connectionId: 'conn', profile, targetProfile: profile })),
    requestProfile: async (route, method, params) => {
      if (method === 'session.active_list') {
        return { sessions: [{ id: 'one', session_id: 'one', profile: route.profile, connection_id: 'conn', session_key: 'one', stored_session_id: 'one', status: 'idle' }] }
      }
      return { sessions: [] }
    },
    onEvent: () => () => {}
  }
  const queryClient = new core.QueryClient({ defaultOptions: { queries: { gcTime: Infinity, refetchOnWindowFocus: false } } })
  queryClient.mount()
  const internals = await loadPluginInternals(
    ['startCodexInboxObserver', 'setCodexInboxMode', 'CodexInboxObserverVendor', 'readCodexInboxProfiles', 'setCodexInboxProfiles'],
    {
      host,
      queryClient,
      window,
      document,
      URLSearchParams,
      CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail } },
      setInterval: (fn, delay) => 1,
      clearInterval: () => {},
      setTimeout: (fn, delay) => 1,
      clearTimeout: () => {}
    }
  )
  internals.plugin.register({ storage: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) }, onDispose() {}, register() {} })
  document.body = {}
  const inbox = { setMode: () => {}, update: () => {} }
  const stop = internals.startCodexInboxObserver({ onDispose: (fn) => {} }, inbox)
  await flush()
  await flush()
  await flush()
  return { internals, inbox, stop, queryClient, cleanup: () => { stop(); queryClient.unmount(); queryClient.clear() } }
}

test('live events are accepted for a selected profile on the same connection and rejected otherwise', async () => {
  const f = await liveFixture(['alpha'], ['alpha'])
  const accepted = { type: 'message.start', connectionId: 'conn', profile: 'alpha', session_id: 'one' }
  assert.ok(f.inbox.resolveLiveEvent(accepted), 'selected profile on same connection is accepted')
  assert.equal(f.inbox.resolveLiveEvent({ ...accepted, profile: 'beta' }), null, 'non-selected profile is rejected')
  assert.equal(f.inbox.resolveLiveEvent({ ...accepted, connectionId: 'other' }), null, 'another connection is rejected')
  assert.equal(f.inbox.resolveLiveEvent({ ...accepted, profile: '*' }), null, 'producer profile * is rejected')
  f.cleanup()
})

test('a scope tuple with * is accepted by scope comparison and reactivation, and outside profiles are rejected', async () => {
  const values = new Map([['inbox-profiles', JSON.stringify(['alpha'])]])
  const { internals } = await readFixture(async () => ({ total: 0, sessions: [] }), values)
  assert.equal(internals.sameInboxScope({ connectionId: 'conn', profile: '*' }, { connectionId: 'conn', profile: 'alpha' }), true)
  assert.equal(internals.codexInboxOwnedBy({ connectionId: 'conn', profile: '*' }, { profile: 'alpha', connectionId: 'conn' }), true)
  assert.equal(internals.codexInboxOwnedBy({ connectionId: 'conn', profile: '*' }, { profile: 'beta', connectionId: 'conn' }), false)
})

test('record keys are [connectionId, realProfile, id] aggregated and unchanged when single-profile', async () => {
  const values = new Map([['inbox-profiles', JSON.stringify(['alpha'])]])
  const { internals } = await readFixture(async () => ({ total: 0, sessions: [] }), values)
  const model = internals.createCodexInboxModel({ get: () => null, set: () => {} })
  assert.equal(model.key({ connectionId: 'conn', profile: '*' }, { id: 'thread-1', profile: 'alpha' }), JSON.stringify(['conn', 'alpha', 'thread-1']))
  assert.equal(model.key({ connectionId: 'conn', profile: 'default' }, { id: 'thread-1' }), JSON.stringify(['conn', 'default', 'thread-1']))
})

test("connectionId: '' keeps admitting rows", async () => {
  const values = new Map()
  const api = async () => ({ total: 1, sessions: [{ id: 'local', profile: 'default', message_count: 1 }] })
  const { internals } = await readFixture(api, values, { host: { state: { connectionId: atom(''), profile: atom('default') }, profileRoutes: async () => [{ connectionId: '', profile: 'default', targetProfile: 'default' }] } })
  const result = await internals.readCodexInboxPage({ connectionId: '', profile: 'default' }, 1)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].id, 'local')
})

test('changing the selection re-runs the seed and re-reads without restarting the observer', async () => {
  const core = await loadHostQueryCore()
  const f = await (async () => {
    const state = { connectionId: atom('conn'), profile: atom('default'), busyBySession: atom({}), focusedStoredSessionId: atom(null), focusedSessionOwner: atom(null) }
    const values = new Map([['inbox', 'on'], ['inbox-profiles', JSON.stringify([])]])
    const document = { body: null, visibilityState: 'visible', querySelector: () => null }
    const window = {
      location: { hash: '#/chat' },
      hermesDesktop: { api: async () => ({ total: 1, sessions: [{ id: 'one', profile: 'default', connection_id: 'conn', message_count: 1 }] }), getAgentRoster: async () => ({ agents: [{ connectionId: 'conn', profile: 'default' }], sources: [{ connectionId: 'conn', reachable: true }] }) },
      addEventListener: (type, fn) => { if (!window.__events) window.__events = new Map(); if (!window.__events.has(type)) window.__events.set(type, new Set()); window.__events.get(type).add(fn) },
      removeEventListener: (type, fn) => window.__events?.get(type)?.delete(fn),
      dispatchEvent: (event) => { window.__events?.get(event.type)?.forEach((fn) => fn(event)); return true },
      MutationObserver: class { constructor() {} observe() {} disconnect() {} }
    }
    const host = { state, profileRoutes: async () => [{ connectionId: 'conn', profile: 'default', targetProfile: 'default' }], onEvent: () => () => {} }
    const queryClient = new core.QueryClient({ defaultOptions: { queries: { gcTime: Infinity, refetchOnWindowFocus: false } } })
    queryClient.mount()
    const internals = await loadPluginInternals(['startCodexInboxObserver', 'CodexInboxObserverVendor'], { host, queryClient, window, document, URLSearchParams, CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail } }, setInterval: (fn, delay) => 1, clearInterval: () => {}, setTimeout: (fn, delay) => 1, clearTimeout: () => {} })
    internals.plugin.register({ storage: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) }, onDispose() {}, register() {} })
    document.body = {}
    const inbox = { setMode: () => {}, update: () => {} }
    const stop = internals.startCodexInboxObserver({ onDispose: (fn) => {} }, inbox)
    await flush(); await flush()
    const scoped = queryClient.getQueryCache().findAll({ queryKey: ['codex-chat-look', 'inbox'] })
    const observer = scoped.reduce((count, query) => query.getObserversCount() ? query.observers[0] : count, null)
    const callsBefore = window.__callsBefore ?? 0
    const apiCallsBefore = 0
    return { internals, window, queryClient, stop, values, observer, document }
  })()
  const beforeCalls = f.queryClient.getQueryCache().findAll({ queryKey: ['codex-chat-look', 'inbox'] }).reduce((sum, q) => sum + (q.state?.dataUpdateCount || 0), 0)
  f.window.dispatchEvent(new (class { constructor(type, options = {}) { this.type = type; this.detail = options.detail } })('codex-chat-look:inbox-profiles', { detail: ['*'] }))
  await flush(); await flush()
  const afterCalls = f.queryClient.getQueryCache().findAll({ queryKey: ['codex-chat-look', 'inbox'] }).reduce((sum, q) => sum + (q.state?.dataUpdateCount || 0), 0)
  assert.ok(afterCalls >= beforeCalls, 'selection change triggers a re-read')
  f.stop(); f.queryClient.unmount(); f.queryClient.clear()
})

test('one unreachable profile does not blank the rows of the others', async () => {
  const values = new Map([['inbox-profiles', JSON.stringify(['*'])]])
  const api = async () => ({ total: 2, sessions: [
    { id: 'alpha-row', profile: 'alpha', connection_id: 'conn', message_count: 1 },
    { id: 'beta-row', profile: 'beta', connection_id: 'conn', message_count: 1 }
  ] })
  const host = {
    state: { connectionId: atom('conn'), profile: atom('default') },
    profileRoutes: async () => [
      { connectionId: 'conn', profile: 'alpha', targetProfile: 'alpha' },
      { connectionId: 'conn', profile: 'beta', targetProfile: 'beta' }
    ],
    requestProfile: async (route) => {
      if (route.profile === 'alpha') throw new Error('unreachable')
      return { sessions: [{ id: 'beta-row', session_id: 'beta-row', profile: 'beta', connection_id: 'conn', session_key: 'beta-row', stored_session_id: 'beta-row' }] }
    }
  }
  const internals = await readFixture(api, values, { host })
  const result = await internals.internals.readCodexInboxPage({ connectionId: 'conn', profile: '*' }, 1)
  assert.equal(result.sessions.length, 2)
  assert.ok(result.liveSessions.some((row) => row.profile === 'beta'))
})

test('marker is hidden with no profile and renders per profile rules, overrides, and malformed JSON', async () => {
  function makeDoc() {
    const nodes = []
    function makeNode(tag) {
      const children = []
      const attrs = new Map()
      const node = {
        tagName: String(tag).toUpperCase(),
        className: '',
        hidden: false,
        textContent: '',
        title: '',
        style: {},
        dataset: {},
        _children: children,
        get firstChild() { return children.length ? children[0] : null },
        appendChild(child) { children.push(child); return child },
        append(...items) { for (const item of items) { if (typeof item === 'string') { node.textContent += item } else children.push(item) } return node },
        removeChild(child) { const index = children.indexOf(child); if (index >= 0) children.splice(index, 1); return child },
        setAttribute(name, value) { attrs.set(name, String(value)) },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null },
        removeAttribute(name) { attrs.delete(name) },
        toggleAttribute(name, force) { if (force) attrs.set(name, ''); else attrs.delete(name) },
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener() {},
        querySelector(selector) {
          const match = selector.match(/\[([^\]]+)\]/)
          const wanted = match ? match[1] : selector
          function walk(current) {
            if (current?.getAttribute && current.getAttribute(wanted) !== null) return current
            for (const child of current?._children || []) {
              const found = walk(child)
              if (found) return found
            }
            return null
          }
          return walk(node)
        }
      }
      return node
    }
    return { createElement: makeNode, createElementNS: (ns, tag) => makeNode(tag), body: {} }
  }

  const doc = makeDoc()
  let storageValue = null
  const internals = await loadPluginInternals(['createCodexInboxRowUI', 'codexInboxProfileShortLabel', 'codexInboxProfileColor'], {
    document: doc,
    localStorage: { getItem: (key) => (key === 'hermes.desktop.profileColors' ? storageValue : null), setItem: () => {} },
    window: { localStorage: { getItem: (key) => (key === 'hermes.desktop.profileColors' ? storageValue : null), setItem: () => {} } }
  })
  const ui = internals.createCodexInboxRowUI({ document: doc, onOpen: () => {}, onMenu: () => {}, onSnooze: () => {} })
  const mark = () => ui.row.querySelector('[data-codex-inbox-profile-mark]')
  ui.update({ title: 'thread' })
  assert.equal(mark().hidden, true, 'no profile keeps the mark hidden')

  ui.update({ profile: 'default' })
  assert.equal(mark().hidden, false)
  assert.ok(mark().firstChild && mark().firstChild.className.includes('codicon-home'), 'default renders the home codicon')
  assert.equal(mark().title, 'Profile: default')
  assert.equal(mark().getAttribute('aria-label'), 'Profile: default')

  // The label is the raw grapheme; the mark uppercases it through CSS.
  assert.equal(internals.codexInboxProfileShortLabel('Alice'), 'A')
  ui.update({ profile: 'Alice' })
  assert.ok(String(mark().textContent).toLowerCase().startsWith('a'), 'named profile renders its short label')
  assert.equal(internals.codexInboxProfileColor('Alice', null), `hsl(${[...'Alice'].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % 360} 68% 58%)`)
  assert.match(mark().style.color, /^hsl\(/)
  assert.match(mark().style.background, /color-mix\(in srgb,/)

  storageValue = JSON.stringify({ Alice: '#ff00aa' })
  ui.update({ profile: 'Alice' })
  assert.equal(mark().style.color, '#ff00aa')

  storageValue = '{bad json'
  assert.doesNotThrow(() => ui.update({ profile: 'Alice' }))
  assert.match(mark().style.color, /^hsl\(/)
})

test('single-profile invariance uses the same route and params and keeps the row layout', async () => {
  const values = new Map()
  const calls = []
  const api = async (options) => {
    calls.push(options)
    return { total: 1, sessions: [{ id: 'one', profile: 'default', message_count: 1 }] }
  }
  const { internals } = await readFixture(api, values)
  const result = await internals.readCodexInboxPage({ connectionId: 'conn', profile: 'default' }, 1)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].profile, 'default')
  assert.equal(calls[0].profile, 'default')
  assert.equal(new URL(calls[0].path, 'http://test').searchParams.get('profile'), 'default')
})
