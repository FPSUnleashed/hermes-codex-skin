import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const atom = value => ({ get: () => value, subscribe: () => () => {} })
const scope = { connectionId: 'source-A', profile: 'default' }
async function fixture(api, extra = {}) {
  const host = { state: { connectionId: atom(scope.connectionId), profile: atom(scope.profile) }, profileRoutes: async () => [scope], request: async () => ({ sessions: [] }), ...extra.host }
  const internals = await loadPluginInternals(['readCodexInboxPage', 'CodexSettledBadge', 'createCodexInboxModel', 'createCodexInboxAdmission', 'connectCodexInboxEvents', 'codexInboxBadgeScope'], {
    host, window: { hermesDesktop: { api, getAgentRoster: async () => {
      const routes = await host.profileRoutes()
      return { agents: routes, sources: [...new Set((routes || []).map(route => route?.connectionId))].map(connectionId => ({ connectionId, reachable: true })) }
    }, ...extra.bridge }, addEventListener() {}, removeEventListener() {} }, URLSearchParams,
    useValue: atom => atom?.get?.(), useState: value => [value, () => {}], jsx: (type, props) => ({ type, props })
  })
  return { host, ...internals }
}

// Badge-only fixtures represent an already work-admitted exact-owner thread.
// The real factory provenance gate is exercised below, not bypassed in runtime.
const badgeInbox = (model, admission = { isEligible: (owner, id) => owner.connectionId === scope.connectionId && owner.profile === scope.profile && id === 'one' }) =>
  ({ model, admission, rowOwnerEvidence: { scope: { ...scope }, ids: ['one'] } })

test('native badges require known non-cron admission, never merely legacy attention', async () => {
  const f = await fixture(async () => ({})), values = new Map();
  const storage = { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, structuredClone(value)) };
  f.plugin.register({ storage, onDispose() {}, register() {} });
  const model = f.createCodexInboxModel(storage), admission = f.createCodexInboxAdmission(storage, model);
  const thread = { id: 'one', source: 'desktop', profile: scope.profile, message_count: 2 };
  model.settle(scope, thread, { manual: true });
  const inbox = badgeInbox(model, admission);
  assert.equal(f.CodexSettledBadge({ sessionId: 'one', inbox }), null, 'legacy settlement alone is not attention');
  admission.observe(scope, [thread], { workingSessions: [thread] });
  assert.equal(f.CodexSettledBadge({ sessionId: 'one', inbox }).type, 'button');
  admission.observe(scope, [{ ...thread, source: 'cron' }]);
  assert.equal(f.CodexSettledBadge({ sessionId: 'one', inbox }), null, 'cron overrides prior admission and native badge restore');
  assert.equal(model.isManualSettled(scope, thread), true, 'excluded cron attention remains saved');
})

test('reads explicit-owner pages through the native API, dedupes lineage and signals the remaining page', async () => {
  const calls = []
  const rows = Array.from({ length: 105 }, (_, index) => ({ id: `row-${index}`, message_count: 1 }))
  const f = await fixture(async options => {
    calls.push(options)
    const params = new URL(options.path, 'http://test').searchParams
    return params.get('offset') === '0'
      ? { total: 105, sessions: [...rows.slice(0, 100), { id: 'old-0', _lineage_root_id: 'row-0', message_count: 1 }] }
      : { total: 105, sessions: [...rows.slice(100), rows[0]] }
  })
  const first = await f.readCodexInboxPage(scope, 1)
  assert.equal(first.hasMore, true)
  assert.equal(first.sessions.length, 100)
  const all = await f.readCodexInboxPage(scope, 2)
  assert.equal(all.hasMore, false)
  assert.equal(all.sessions.length, 105)
  assert.equal(new URL(calls.at(-1).path, 'http://test').searchParams.get('offset'), '100')
  assert.ok(calls.every(call => call.path.startsWith('/api/sessions?')))
  assert.ok(calls.every(call => call.connectionId === scope.connectionId && call.profile === scope.profile && new URL(call.path, 'http://test').searchParams.get('profile') === scope.profile))
  assert.equal(all.liveStatusKnown, true)
})

test('managed SSH aliases keep Desktop routing separate from backend row ownership', async () => {
  const alias = { connectionId: 'source-A', profile: 'desktop-alias' }
  const calls = []
  const f = await fixture(async options => {
    calls.push(options)
    return { total: 2, sessions: [
      { id: 'mine', profile: 'default', connection_id: alias.connectionId },
      { id: 'foreign', profile: 'another-profile', connection_id: alias.connectionId }
    ] }
  }, { host: {
    state: { connectionId: atom(alias.connectionId), profile: atom(alias.profile) },
    profileRoutes: async () => [{ ...alias, targetProfile: 'default', mode: 'remote' }]
  } })
  const result = await f.readCodexInboxPage(alias, 1)
  assert.equal(calls[0].profile, alias.profile)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].id, 'mine')
  assert.equal(result.sessions[0].profile, alias.profile)
})

test('Inbox follows the exact focused owner and reads its live status through its route rather than the active gateway', async () => {
  const focused = { connectionId: 'source-B', profile: 'desktop-alias' }
  const requests = []
  const f = await fixture(async options => {
    assert.equal(options.connectionId, focused.connectionId)
    assert.equal(options.profile, focused.profile)
    return { total: 1, sessions: [{ id: 'opened-old', profile: 'default' }] }
  }, { host: {
    state: { connectionId: atom(scope.connectionId), profile: atom(scope.profile), focusedStoredSessionId: atom('opened-old'), focusedSessionOwner: atom(focused) },
    profileRoutes: async () => [scope, { ...focused, targetProfile: 'default' }],
    request: async () => { throw new Error('Wrong foreground gateway') },
    requestProfile: async (route, method, params) => {
      requests.push({ route, method, params })
      return { sessions: [{ id: 'opened-old', profile: 'default', status: 'running' }, { id: 'foreign', profile: 'other', status: 'running' }] }
    }
  } })
  const result = await f.readCodexInboxPage(focused, 1)
  assert.equal(result.sessions[0].profile, focused.profile)
  assert.equal(result.liveStatusKnown, true)
  assert.equal(result.liveSessions.length, 1)
  assert.equal(result.liveSessions[0].id, 'opened-old')
  assert.equal(result.liveSessions[0].profile, focused.profile)
  assert.equal(result.liveSessions[0].connection_id, focused.connectionId)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].route.connectionId, focused.connectionId)
  assert.equal(requests[0].route.profile, focused.profile)
  assert.equal(requests[0].method, 'session.active_list')
  assert.equal(requests[0].params.profile, 'default')
})

test('rejects incomplete metadata and a result delivered after an owner switch', async () => {
  const broken = await fixture(async () => ({ sessions: [] }))
  await assert.rejects(broken.readCodexInboxPage(scope, 1), /incomplete/)
  let finish
  const shifted = await fixture(() => new Promise(resolve => { finish = resolve }))
  const pending = shifted.readCodexInboxPage(scope, 1)
  shifted.host.state.profile = atom('other')
  finish({ total: 1, sessions: [{ id: 'same' }] })
  await assert.rejects(pending, /scope changed/)
})

test('unknown live status never masquerades as an idle authoritative snapshot', async () => {
  const f = await fixture(async () => ({ total: 1, sessions: [{ id: 'one' }] }), { host: { request: async () => { throw new Error('offline') } } })
  const result = await f.readCodexInboxPage(scope, 1)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.liveStatusKnown, false)
})

test('native durable-row badge un-settles locally without changing pins or triggering navigation', async () => {
  const f = await fixture(async () => ({}))
  const values = new Map(), contributions = []
  f.plugin.register({ storage: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) }, onDispose() {}, register: item => contributions.push(item) })
  let stored = null
  const model = f.createCodexInboxModel({ get: () => stored, set: (_key, value) => { stored = structuredClone(value) } })
  model.settle(scope, { id: 'one', message_count: 4 })
  const inbox = badgeInbox(model)
  const badge = f.CodexSettledBadge({ sessionId: 'one', inbox })
  assert.equal(badge.type, 'button')
  assert.equal(badge.props.children[0].props.children, 'Settled')
  const stops = []
  await badge.props.onClick({ preventDefault: () => stops.push('default'), stopPropagation: () => stops.push('propagation') })
  assert.deepEqual(stops, ['default', 'propagation'])
  assert.equal(model.isSettled(scope, 'one'), false)
  assert.equal(f.CodexSettledBadge({ sessionId: 'one', inbox }), null)
  assert.ok(contributions.some(item => item.area === 'sessionRow.trailing' && typeof item.data.render === 'function'))
})

test('only positively verified fresh work wakes a thread; surface tags alone, replay and reads do not', async () => {
  let listener
  const events = []
  const f = await fixture(async () => ({}), { host: { onEvent: (_type, fn) => { listener = fn; return () => {} } } })
  const inbox = { reactivate: event => events.push(event) }
  f.connectCodexInboxEvents(inbox)
  listener({ type: 'message.start', ...scope, session_id: 'one' })
  assert.equal(events.length, 0, 'source/profile tags do not prove the runtime owner')
  let verified = false
  inbox.verifyLiveEvent = () => verified
  listener({ type: 'message.start', ...scope, session_id: 'one' })
  assert.equal(events.length, 0)
  verified = true
  listener({ type: 'message.start', ...scope, session_id: 'one', replayed: true })
  listener({ type: 'session.resumed', ...scope, session_id: 'one' })
  listener({ type: 'message.start', session_id: 'one' })
  assert.equal(events.length, 0)
  listener({ type: 'message.start', ...scope, session_id: 'one' })
  assert.equal(events.length, 1)
  assert.equal(events[0].scope.connectionId, scope.connectionId)
})

test('native snooze badge exposes deadline and cancels only the rendered owner without navigating', async () => {
  const f = await fixture(async () => ({}))
  f.plugin.register({ storage: { get: (_key, fallback) => fallback, set() {} }, onDispose() {}, register() {} })
  const cancelled = []
  const model = {
    subscribe: () => () => {}, isSettled: () => false,
    isSnoozed: () => true, snoozedUntil: () => Date.now() + 60_000,
    cancelSnooze: (...args) => cancelled.push(args)
  }
  const inbox = badgeInbox(model)
  const badge = f.CodexSettledBadge({ sessionId: 'one', inbox })
  assert.equal(badge?.type, 'button')
  assert.equal(badge.props.children[0].props.children, 'Snoozed')
  assert.equal(badge.props.children[1].props.children, 'Wake now')
  assert.match(badge.props.title, /Snoozed until/)
  const event = { preventDefault() {}, stopPropagation() {} }
  f.host.state.profile = atom('other')
  await badge.props.onClick(event)
  assert.equal(cancelled.length, 0)
  f.host.state.profile = atom(scope.profile)
  await badge.props.onClick(event)
  assert.equal(cancelled.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(cancelled[0])), [scope, 'one'])
})

test('settled and snoozed native badges remain independently reversible', async () => {
  const f = await fixture(async () => ({}))
  f.plugin.register({ storage: { get: (_key, fallback) => fallback, set() {} }, onDispose() {}, register() {} })
  let settled = true, snoozed = true
  const model = {
    subscribe: () => () => {}, isSettled: () => settled, isSnoozed: () => snoozed,
    snoozedUntil: () => Date.now() + 60_000,
    unsettle: () => { settled = false }, cancelSnooze: () => { snoozed = false }
  }
  const inbox = badgeInbox(model)
  const both = f.CodexSettledBadge({ sessionId: 'one', inbox })
  assert.equal(both.type, 'span')
  assert.equal(both.props.children.length, 2)
  await both.props.children[1].props.onClick({ preventDefault() {}, stopPropagation() {} })
  assert.equal(snoozed, false)
  assert.equal(settled, true)
  const remaining = f.CodexSettledBadge({ sessionId: 'one', inbox })
  assert.equal(remaining.props.children[0].props.children, 'Settled')
  await remaining.props.onClick({ preventDefault() {}, stopPropagation() {} })
  assert.equal(settled, false)
})

test('native badges refuse mixed, missing and stale owner evidence instead of adopting the active gateway', async () => {
  const rows = { total: 1, sessions: [{ id: 'one', profile: scope.profile, message_count: 1 }] }
  const mixed = await fixture(async () => rows, { host: { profileRoutes: async () => [scope, { ...scope, profile: 'other' }] } })
  const data = await mixed.readCodexInboxPage(scope, 1)
  assert.equal(data.rowOwnerScope, null)
  mixed.plugin.register({ storage: { get: (_key, fallback) => fallback, set() {} }, onDispose() {}, register() {} })
  const model = { subscribe: () => () => {}, isSettled: () => true }
  assert.equal(mixed.CodexSettledBadge({ sessionId: 'one', inbox: { model, rowOwnerEvidence: null } }), null)
  assert.equal(mixed.CodexSettledBadge({ sessionId: 'not-loaded', inbox: badgeInbox(model) }), null)
  mixed.host.state.profile = atom('other')
  assert.equal(mixed.CodexSettledBadge({ sessionId: 'one', inbox: badgeInbox(model) }), null)
  for (const result of [[], [null], [{ profile: 'default' }]]) {
    const f = await fixture(async () => rows, { host: { profileRoutes: async () => result } })
    assert.equal((await f.readCodexInboxPage(scope, 1)).rowOwnerScope, null)
  }
  const unavailable = await fixture(async () => rows, { host: { profileRoutes: async () => { throw new Error('offline') } } })
  assert.equal((await unavailable.readCodexInboxPage(scope, 1)).rowOwnerScope, null)
  const single = await fixture(async () => rows, { host: { profileRoutes: async () => [scope, scope] } })
  assert.deepEqual(JSON.parse(JSON.stringify((await single.readCodexInboxPage(scope, 1)).rowOwnerScope)), scope)
  const partial = await fixture(async () => rows, { bridge: { getAgentRoster: async () => ({
    agents: [scope], sources: [{ connectionId: scope.connectionId, reachable: true }, { connectionId: 'offline', reachable: false, error: 'offline' }]
  }) } })
  assert.equal((await partial.readCodexInboxPage(scope, 1)).rowOwnerScope, null)
})

test('the command palette keeps Inbox settings but contains no restore-only clutter', async () => {
  const focused = { connectionId: 'source-B', profile: 'other' }
  const f = await fixture(async () => ({}), { host: { state: {
    connectionId: atom(scope.connectionId), profile: atom(scope.profile),
    focusedSessionOwner: atom(focused), focusedStoredSessionId: atom('one')
  } } })
  const registrations = []
  f.plugin.register({ storage: { get: (_key, fallback) => fallback, set() {} }, onDispose() {}, register: command => registrations.push(command) })
  const commands = registrations.filter(command => command.area === 'palette')
  assert.ok(commands.some(command => command.id === 'toggle-inbox'))
  assert.ok(commands.every(command => !['unsettle-current', 'wake-current'].includes(command.id)))
  assert.ok(commands.every(command => !/Un-settle current thread|Wake current thread now/.test(command.data.label)))
})
