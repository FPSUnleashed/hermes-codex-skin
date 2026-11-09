import assert from 'node:assert/strict'
import test from 'node:test'
import { testDependencyRequire } from './helpers/reference-paths.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const { JSDOM } = testDependencyRequire()('jsdom')
const footer = '<div data-slot="aui_msg-actions"><button>Copy</button></div>'
const md = (id, text = id) => `<div class="aui-md" id="${id}">${text}</div>`
const tool = id => `<div data-slot="tool-block" id="${id}"><button aria-expanded="false">Read</button><div>native output</div></div>`
const root = (id, body, actions = '') => `<div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="${id}"><div data-slot="aui_assistant-message-content">${body}</div>${actions}</div>`
const pair = (id, body) => `<div data-slot="aui_turn-pair"><div data-role="user" data-message-id="${id}">Question</div><div data-slot="aui_response-group">${body}</div></div>`
const atom = initial => {
  let value = initial
  const listeners = new Set()
  return { get: () => value, set(next) { value = next; for (const fn of listeners) fn(next) }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }, listenerCount: () => listeners.size }
}
async function fixture(body) {
  const dom = new JSDOM(`<html data-codex-chat-look="true"><body><section data-session-anchor="workspace">${pair('user-real', body)}</section></body></html>`, { pretendToBeVisual: true, url: 'https://fixture.invalid/#/stored' })
  const w = dom.window
  const events = new Map()
  const host = { state: { activeSessionId: atom('runtime'), focusedSessionId: atom('runtime'), focusedStoredSessionId: atom('stored'), focusedSessionOwner: atom({ connectionId: 'local', profile: 'default' }), connectionId: atom('local'), profile: atom('default'), busy: atom(false), busyBySession: atom({ runtime: false }) }, onEvent: (type, fn) => { events.set(type, fn); return () => events.delete(type) } }
  const api = await loadPluginInternals(['installBehaviorRuntime', 'reconcileTurnActivity', 'turnNativeCompletedAt', 'createTurnActivityEvidence', 'clearTurnActivityDecorations', 'CSS'], { host, window: w, document: w.document, Node: w.Node, Element: w.Element, MutationObserver: w.MutationObserver, getComputedStyle: w.getComputedStyle.bind(w) })
  const style = w.document.createElement('style'); style.textContent = api.CSS; w.document.head.append(style)
  const p = w.document.querySelector('[data-slot="aui_turn-pair"]')
  const f = { w, host, api, events, p, scope: 'owner-a', el: id => w.document.getElementById(id), close: () => w.close() }
  f.project = (history = null, evidence = null, target = p) => api.reconcileTurnActivity(target, '', history, f.scope, undefined, '', evidence)
  f.hidden = id => { for (let node = f.el(id); node; node = node.parentElement) if (w.getComputedStyle(node).display === 'none') return true; return false }
  f.tracker = () => api.createTurnActivityEvidence(() => f.scope)
  f.snapshot = tracker => tracker.snapshot()
  f.busy = value => { host.state.busy.set(value); host.state.busyBySession.set({ runtime: value }) }
  f.install = () => {
    const tasks = new Map(); let serial = 0
    w.setTimeout = (fn, delay = 0) => { tasks.set(++serial, { fn, delay }); return serial }
    w.clearTimeout = id => tasks.delete(id)
    w.requestAnimationFrame = fn => w.setTimeout(fn, 16); w.cancelAnimationFrame = w.clearTimeout
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    const stop = api.installBehaviorRuntime()
    const flush = async () => {
      for (let i = 0; i < 100; i += 1) {
        await Promise.resolve()
        const entry = [...tasks].find(([, task]) => task.delay < 1000)
        if (!entry) return
        tasks.delete(entry[0]); entry[1].fn()
      }
      assert.fail('bounded fixture scheduler exceeded 100 callbacks')
    }
    return { stop, tasks, flush }
  }
  return f
}
const run = (name, body, fn) => test(name, async () => { const f = await fixture(body); try { await fn(f) } finally { f.close() } })
const completedBody = root('old-opaque', md('old-a') + md('old-b')) + root('tool', tool('tool')) + root('final', md('answer'), footer)

run('approved latest-only policy folds cold older replies and restores them on demand', completedBody, f => {
  f.project()
  assert.equal(f.hidden('old-a'), true); assert.equal(f.hidden('old-b'), true)
  assert.equal(f.hidden('tool'), true); assert.equal(f.hidden('answer'), false)
  f.p.querySelector('[data-codex-turn-activity]').click()
  assert.equal(f.hidden('old-a'), false); assert.equal(f.hidden('old-b'), false)
})
run('latest-only policy folds older standalone and mixed prose without deleting it', root('mixed', md('mixed-prose') + tool('mixed-tool') + md('mixed-answer'), footer) + completedBody, f => {
  f.project()
  for (const id of ['mixed-prose', 'mixed-answer', 'old-a', 'old-b']) assert.equal(f.hidden(id), true)
  assert.equal(f.hidden('answer'), false)
  f.p.querySelector('[data-codex-turn-activity]').click()
  for (const id of ['mixed-prose', 'mixed-answer', 'old-a', 'old-b', 'answer']) assert.equal(f.hidden(id), false)
})
run('unique source tool-call evidence folds standalone and mixed pre-tool prose equally', root('100-0-assistant', md('standalone')) + root('tool', tool('tool')) + root('101-1-assistant', md('mixed') + tool('tool-two')) + root('answer', md('answer'), footer), f => {
  f.project(new Map([['100', 'interim'], ['101', 'interim']]))
  assert.equal(f.hidden('standalone'), true); assert.equal(f.hidden('mixed'), true)
  assert.equal(f.hidden('answer'), false)
})
run('latest-only presentation does not depend on history classification', root('100-0-assistant', md('standalone')) + root('101-1-assistant', md('mixed') + tool('tool')) + root('answer', md('answer'), footer), f => {
  f.project(new Map())
  assert.equal(f.hidden('standalone'), true); assert.equal(f.hidden('mixed'), true)
  assert.equal(f.hidden('answer'), false)
})
run('owner-qualified SDK busy vetoes a stale footer and stays open throughout a DOM signal gap', completedBody, f => {
  const tracker = f.tracker(); f.busy(true)
  f.project(null, f.snapshot(tracker).get(f.p))
  assert.equal(f.p.dataset.codexActivityPhase, 'working'); assert.equal(f.hidden('tool'), false)
  f.el('tool').closest('[data-role="assistant"]').dataset.streaming = 'true'
  f.project(null, f.snapshot(tracker).get(f.p))
  f.el('tool').closest('[data-role="assistant"]').removeAttribute('data-streaming')
  f.project(null, f.snapshot(tracker).get(f.p))
  assert.equal(f.p.dataset.codexActivityPhase, 'working'); assert.equal(f.hidden('tool'), false)
  f.busy(false); f.project(null, f.snapshot(tracker).get(f.p))
  assert.equal(f.p.dataset.codexActivityPhase, 'completed'); assert.equal(f.hidden('tool'), true)
})
run('busy never vetoes a different history pair or another panel', completedBody, f => {
  const previous = f.p
  previous.insertAdjacentHTML('afterend', pair('new-user', root('new-tool', tool('new-tool')) + root('new-final', md('new-answer'), footer)))
  const latest = previous.nextElementSibling
  f.w.document.body.insertAdjacentHTML('beforeend', `<section data-session-anchor="session-tile:other">${pair('tile-user', completedBody.replaceAll('id="', 'id="tile-'))}</section>`)
  f.busy(true); const snapshots = f.snapshot(f.tracker())
  assert.equal(snapshots.has(previous), false)
  assert.equal(snapshots.get(latest)?.active, true)
  const tile = f.w.document.querySelector('[data-session-anchor="session-tile:other"] [data-slot="aui_turn-pair"]')
  assert.equal(snapshots.has(tile), false)
  f.project(null, snapshots.get(previous), previous); assert.equal(previous.dataset.codexActivityPhase, 'completed')
})
run('fresh local owner beats a completed trailing pair and retains ownership during its gap', completedBody, f => {
  const activeRoot = f.el('tool').closest('[data-role="assistant"]'); activeRoot.dataset.streaming = 'true'
  f.p.insertAdjacentHTML('afterend', pair('trailing-user', root('tail-tool', tool('tail-tool')) + root('tail-final', md('tail-answer'), footer)))
  f.busy(true); const tracker = f.tracker()
  assert.equal(f.snapshot(tracker).get(f.p)?.active, true)
  activeRoot.removeAttribute('data-streaming')
  const snapshots = f.snapshot(tracker)
  assert.equal(snapshots.get(f.p)?.active, true); assert.equal(snapshots.has(f.p.nextElementSibling), false)
})
run('new SDK busy episode cannot stay attached to the previous historical pair', completedBody, f => {
  const tracker = f.tracker()
  f.el('tool').closest('[data-role="assistant"]').dataset.streaming = 'true'
  f.busy(true); assert.equal(f.snapshot(tracker).get(f.p)?.active, true)
  f.el('tool').closest('[data-role="assistant"]').removeAttribute('data-streaming')
  f.busy(false); f.snapshot(tracker)
  f.p.insertAdjacentHTML('afterend', pair('new-user', root('new-tool', tool('new-tool'))))
  const next = f.p.nextElementSibling
  f.busy(true); const snapshots = f.snapshot(tracker)
  assert.equal(snapshots.has(f.p), false); assert.equal(snapshots.get(next)?.active, true)
})
run('focus/session/source/profile mismatch and duplicate workspaces do not borrow busy or idle evidence', completedBody, f => {
  f.busy(true)
  const changes = [['focusedSessionId', 'other'], ['focusedStoredSessionId', 'other-stored'], ['focusedSessionOwner', { connectionId: 'other-source', profile: 'default' }], ['focusedSessionOwner', { connectionId: 'local', profile: 'other-profile' }]]
  for (const [key, value] of changes) {
    const old = f.host.state[key].get(); f.host.state[key].set(value)
    assert.equal(f.snapshot(f.tracker()).size, 0, key)
    f.host.state[key].set(old)
  }
  f.w.document.body.insertAdjacentHTML('beforeend', '<section data-session-anchor="workspace"></section>')
  assert.equal(f.snapshot(f.tracker()).size, 0)
})
run('scope handoff quarantines stale reused pair until its native user identity changes', completedBody, f => {
  f.busy(true); const tracker = f.tracker()
  assert.equal(f.snapshot(tracker).get(f.p)?.active, true)
  f.scope = 'owner-b'
  const stale = f.snapshot(tracker).get(f.p)
  assert.equal(stale?.quarantined, true)
  f.project(null, stale); assert.equal(f.p.hasAttribute('data-codex-activity-phase'), false)
  assert.equal(f.hidden('tool'), false)
  f.p.querySelector('[data-role="user"]').dataset.messageId = 'new-native-user'
  assert.equal(f.snapshot(tracker).get(f.p)?.active, true)
})
run('native running event veto survives an idle SDK until an explicit end event', completedBody, f => {
  const tracker = f.tracker(); tracker.event('start')
  f.project(null, f.snapshot(tracker).get(f.p)); assert.equal(f.p.dataset.codexActivityPhase, 'working')
  tracker.event('info', { running: true })
  f.project(null, f.snapshot(tracker).get(f.p)); assert.equal(f.hidden('tool'), false)
  tracker.event('complete'); f.project(null, f.snapshot(tracker).get(f.p))
  assert.equal(f.p.dataset.codexActivityPhase, 'completed')
})
run('either positive SDK busy flag vetoes contradictory idle during atom publication', completedBody, f => {
  const tracker = f.tracker()
  f.host.state.busy.set(true)
  assert.equal(f.snapshot(tracker).get(f.p)?.active, true)
  f.host.state.busy.set(false); f.host.state.busyBySession.set({ runtime: true })
  assert.equal(f.snapshot(tracker).get(f.p)?.active, true)
})
run('qualified running/end events remain useful when SDK busy is unavailable', root('tool', tool('tool')), f => {
  f.host.state.busy.set(undefined); f.host.state.busyBySession.set({})
  const tracker = f.tracker()
  assert.equal(f.snapshot(tracker).size, 0)
  tracker.event('info', { running: true }); f.project(null, f.snapshot(tracker).get(f.p))
  assert.equal(f.p.dataset.codexActivityPhase, 'working')
  tracker.event('info', { running: false }); f.project(null, f.snapshot(tracker).get(f.p))
  assert.equal(f.p.dataset.codexActivityPhase, 'completed')
})
run('earlier footer promotion does not displace the latest reply and remains recoverable', root('100-0-assistant', md('progress')) + root('tool', tool('tool')) + root('answer', md('answer'), footer), f => {
  f.project(new Map([['100', 'interim']]))
  assert.equal(f.hidden('progress'), true)
  f.el('progress').closest('[data-role="assistant"]').insertAdjacentHTML('beforeend', footer)
  assert.equal(f.hidden('progress'), true)
  f.project(new Map([['100', 'interim']]))
  assert.equal(f.hidden('progress'), true)
  f.p.querySelector('[data-codex-turn-activity]').click()
  assert.equal(f.hidden('progress'), false)
})
run('ordinary links and buttons in earlier replies stay visible before and after expansion', root('100-0-assistant', md('standalone-link', '<a href="https://example.invalid">Reference</a>')) + root('101-1-assistant', md('mixed-link', '<a href="https://example.invalid">Reference</a>') + md('mixed-control', '<button>Preview</button>') + tool('tool')) + root('answer', md('answer'), footer), f => {
  f.project(new Map([['100', 'interim'], ['101', 'interim']]))
  assert.equal(f.hidden('standalone-link'), false); assert.equal(f.hidden('mixed-link'), false); assert.equal(f.hidden('mixed-control'), false)
  f.p.querySelector('[data-codex-turn-activity]').click()
  assert.equal(f.hidden('standalone-link'), false); assert.equal(f.hidden('mixed-link'), false); assert.equal(f.hidden('mixed-control'), false)
  assert.equal(f.hidden('tool'), false)
})
run('completed tool-only turn needs reliable idle/end evidence rather than footer or hydration age', root('tool', tool('tool')), f => {
  f.project(); assert.equal(f.p.dataset.codexActivityPhase, 'uncertain'); assert.equal(f.hidden('tool'), false)
  f.project(null, f.snapshot(f.tracker()).get(f.p))
  assert.equal(f.p.dataset.codexActivityPhase, 'completed'); assert.equal(f.hidden('tool'), true)
  assert.equal(f.p.querySelector('[data-codex-turn-activity]').textContent.trim(), 'Worked')
})
run('latest available commentary stays visible when no later reply exists', root('100-0-assistant', md('mixed') + tool('tool')), f => {
  const evidence = f.snapshot(f.tracker()).get(f.p)
  f.project(null, evidence); assert.equal(f.hidden('mixed'), false)
  f.project(new Map([['100', 'interim']]), evidence)
  assert.equal(f.p.dataset.codexActivityPhase, 'completed'); assert.equal(f.hidden('tool'), true); assert.equal(f.hidden('mixed'), false)
})
run('settled trailing tools fold without consuming final paragraphs or protected output', root('first', tool('first')) + root('final', md('answer-a') + md('answer-b'), footer) + root('trailing', tool('trailing') + '<div data-slot="aui_generated-image"><img id="image" alt="result"></div>'), f => {
  f.project(); assert.equal(f.p.dataset.codexActivityPhase, 'uncertain')
  f.project(null, f.snapshot(f.tracker()).get(f.p))
  assert.equal(f.p.dataset.codexActivityPhase, 'completed'); assert.equal(f.hidden('first'), true); assert.equal(f.hidden('trailing'), true)
  for (const id of ['answer-a', 'answer-b', 'image']) assert.equal(f.hidden(id), false)
})
run('local streaming, approvals, stopped and failures override settled SDK evidence', root('tool', tool('tool')) + root('final', md('answer'), footer), f => {
  const tracker = f.tracker()
  for (const markup of ['<div role="status">Running</div>', '<div data-slot="tool-approval-inline"><button>Approve</button></div>']) {
    f.el('tool').insertAdjacentHTML('beforeend', markup)
    f.project(null, f.snapshot(tracker).get(f.p)); assert.equal(f.hidden('tool'), false)
    f.el('tool').lastElementChild.remove()
  }
  f.el('tool').insertAdjacentHTML('beforeend', '<span class="text-destructive">Failed</span>')
  f.project(null, f.snapshot(tracker).get(f.p)); assert.equal(f.p.hasAttribute('data-codex-activity-phase'), false)
  f.el('tool').lastElementChild.remove()
  f.p.insertAdjacentHTML('beforeend', '<div data-slot="aui_assistant-message-stopped">Stopped</div>')
  f.project(null, f.snapshot(tracker).get(f.p)); assert.equal(f.p.hasAttribute('data-codex-activity-phase'), false)
})
run('outer expansion restores on native remount, stays owner-scoped and never clicks native disclosures', completedBody, f => {
  f.project(); const native = f.el('tool').querySelector('button'); let clicks = 0; native.onclick = () => { clicks += 1 }
  const parent = native.parentNode
  f.p.querySelector('[data-codex-turn-activity]').click()
  assert.equal(f.p.dataset.codexActivityExpanded, 'true'); assert.equal(clicks, 0); assert.equal(native.parentNode, parent)
  const clone = f.p.cloneNode(true); f.api.clearTurnActivityDecorations(clone); f.p.replaceWith(clone)
  f.project(null, null, clone); assert.equal(clone.dataset.codexActivityExpanded, 'true')
  f.scope = 'owner-b'; f.project(null, null, clone); assert.equal(clone.dataset.codexActivityExpanded, 'false')
  f.api.clearTurnActivityDecorations(clone)
  assert.equal(clone.querySelector('[data-codex-turn-activity]'), null)
  assert.equal(clone.querySelector('#tool').hasAttribute('data-codex-activity-item'), false)
})
run('expansion retention is bounded to one hundred semantic turn identities', completedBody, f => {
  f.project(); f.p.querySelector('[data-codex-turn-activity]').click()
  const source = f.p.cloneNode(true)
  for (let i = 0; i < 101; i += 1) {
    const next = source.cloneNode(true); f.api.clearTurnActivityDecorations(next)
    next.querySelector('[data-role="user"]').dataset.messageId = `user-${i}`
    f.p.replaceWith(next); f.p = next; f.project(null, null, next); next.querySelector('[data-codex-turn-activity]').click()
  }
  f.api.clearTurnActivityDecorations(source); f.p.replaceWith(source); f.project(null, null, source)
  assert.equal(source.dataset.codexActivityExpanded, 'false')
})

run('renewed work invalidates prior expansion choice but ordinary completed reconciliations do not', completedBody, f => {
  f.project(); f.p.querySelector('[data-codex-turn-activity]').click(); f.project()
  assert.equal(f.p.dataset.codexActivityExpanded, 'true')
  f.project(null, { active: true, settled: false }); f.project(null, { active: false, settled: true })
  assert.equal(f.p.dataset.codexActivityExpanded, 'false')
})
run('SDK resume blocks stale native completedAt until a genuinely newer native endpoint', completedBody, f => {
  const native = '<div data-slot="timeline-timestamp"><time datetime="2026-01-01T00:00:00Z"></time><time datetime="2026-01-01T00:01:00Z"></time></div>'
  f.el('answer').closest('[data-role="assistant"]').insertAdjacentHTML('beforeend', native)
  const old = f.api.turnNativeCompletedAt(f.p, f.scope)
  assert.equal(typeof old, 'number')
  assert.equal(f.api.turnNativeCompletedAt(f.p, f.scope, true), undefined)
  assert.equal(f.api.turnNativeCompletedAt(f.p, f.scope, false), undefined)
  f.p.querySelector('time:last-child').dateTime = '2026-01-01T00:02:00Z'
  assert.ok(f.api.turnNativeCompletedAt(f.p, f.scope, false) > old)
})
run('unknown busy and provisional native users never manufacture settled evidence', completedBody, f => {
  const tracker = f.tracker()
  f.host.state.busyBySession.set({ runtime: undefined }); assert.equal(f.snapshot(tracker).size, 0)
  f.busy(false); f.p.querySelector('[data-role="user"]').dataset.messageId = 'user-inflight-1'
  assert.equal(f.snapshot(tracker).size, 0)
  tracker.clear(); f.p.querySelector('[data-role="user"]').dataset.messageId = 'native-stable'
  tracker.event('start'); assert.equal(f.snapshot(tracker).size, 0)
})
run('full runtime consumes SDK subscriptions, event vetoes and trailing settled tools without DOM nudges', completedBody, async f => {
  const runtime = f.install()
  try {
    await runtime.flush(); assert.equal(f.p.dataset.codexActivityPhase, 'completed'); assert.equal(f.hidden('old-a'), true)
    f.busy(true); await runtime.flush()
    assert.equal(f.p.dataset.codexActivityPhase, 'working'); assert.equal(f.hidden('tool'), false)
    for (const key of ['message.start','*']) f.events.get(key)?.({type:'message.start', session_id: 'runtime', profile: 'default', connectionId: 'local', payload: {} })
    f.busy(false); await runtime.flush(); assert.equal(f.p.dataset.codexActivityPhase, 'working')
    for (const key of ['message.complete','*']) f.events.get(key)?.({type:'message.complete', session_id: 'other', profile: 'default', connectionId: 'local', payload: {} })
    await runtime.flush(); assert.equal(f.p.dataset.codexActivityPhase, 'working')
    for (const key of ['message.complete','*']) f.events.get(key)?.({type:'message.complete', session_id: 'runtime', profile: 'default', connectionId: 'local', payload: {} })
    await runtime.flush(); assert.equal(f.p.dataset.codexActivityPhase, 'completed')
    f.p.querySelector('[data-slot="aui_response-group"]').insertAdjacentHTML('beforeend', root('trailing', tool('trailing')))
    await runtime.flush(); assert.equal(f.p.dataset.codexActivityPhase, 'completed'); assert.equal(f.hidden('trailing'), true)
    assert.equal(f.hidden('answer'), false)
  } finally { runtime.stop(); await runtime.flush() }
})
run('full-runtime teardown cancels busy/event subscriptions and stale callbacks cannot redecorate', completedBody, async f => {
  const runtime = f.install(); await runtime.flush()
  f.busy(true)
  const stale = [...runtime.tasks.values()].map(task => task.fn)
  runtime.stop(); await runtime.flush()
  for (const fn of stale) fn()
  f.busy(false); await runtime.flush()
  assert.equal(f.host.state.busy.listenerCount(), 0); assert.equal(f.host.state.busyBySession.listenerCount(), 0)
  assert.equal(f.events.size, 0); assert.equal(f.p.querySelector('[data-codex-turn-activity]'), null)
  assert.equal(f.hidden('tool'), false); assert.equal(f.hidden('old-a'), false)
})

run('history prose cache follows the connection when native session and timestamp IDs collide', root('100-0-assistant', md('first')) + root('tools', tool('tool')) + root('final', md('answer'), footer), async f => {
  const requests = []
  f.host.request = (method, params) => {
    const connection = f.host.state.connectionId.get()
    requests.push({ connection, method, params })
    return Promise.resolve({ messages: [{ role: 'assistant', timestamp: 100, tool_calls: connection === 'local' ? [{ id: 'local-call' }] : [] }] })
  }
  const runtime = f.install()
  try {
    for (let i = 0; i < 8; i += 1) await runtime.flush()
    assert.equal(f.hidden('first'), true)
    assert.equal(requests.length, 1)
    const markup = f.p.outerHTML
    f.host.state.connectionId.set('remote')
    f.host.state.focusedSessionOwner.set({ connectionId: 'remote', profile: 'default' })
    f.p.outerHTML = markup
    for (let i = 0; i < 8; i += 1) await runtime.flush()
    assert.equal(f.el('first').hasAttribute('data-codex-standalone-narration'), false, 'the destination must never inherit old interim evidence')
    assert.equal(f.hidden('first'), true, 'approved latest-only presentation is independent of source classification')
    assert.deepEqual(requests.map(request => request.connection), ['local', 'remote'])
  } finally { runtime.stop(); await runtime.flush() }
})

run('known stale working pair stays quarantined throughout a focused-owner publication gap', completedBody, async f => {
  f.busy(true)
  const runtime = f.install()
  try {
    await runtime.flush()
    assert.equal(f.p.dataset.codexActivityPhase, 'working')
    f.w.location.hash = '#/stored-b'
    f.host.state.activeSessionId.set('runtime-b')
    await runtime.flush()
    assert.equal(f.p.dataset.codexActivityPhase, undefined)
    assert.equal(f.hidden('tool'), false)
    f.host.state.focusedSessionId.set('runtime-b')
    f.host.state.focusedStoredSessionId.set('stored-b')
    f.host.state.busyBySession.set({ 'runtime-b': true })
    await runtime.flush()
    assert.equal(f.p.dataset.codexActivityPhase, undefined)
    assert.equal(f.hidden('tool'), false)
    f.p.querySelector('[data-role="user"]').dataset.messageId = 'destination-native-user'
    await runtime.flush()
    assert.equal(f.p.dataset.codexActivityPhase, 'working', 'new native user identity may bind the destination lifecycle')
  } finally { runtime.stop(); await runtime.flush() }
})

run('late history callback from a departed connection cannot classify destination prose', root('100-0-assistant', md('first')) + root('tools', tool('tool')) + root('final', md('answer'), footer), async f => {
  let resolveLocal
  const requests = []
  f.host.request = () => {
    const connection = f.host.state.connectionId.get()
    requests.push(connection)
    return connection === 'local' ? new Promise(resolve => { resolveLocal = resolve })
      : Promise.resolve({ messages: [{ role: 'assistant', timestamp: 100, tool_calls: [] }] })
  }
  const runtime = f.install()
  try {
    for (let i = 0; i < 8; i += 1) await runtime.flush()
    assert.equal(typeof resolveLocal, 'function')
    const markup = f.p.outerHTML
    f.host.state.connectionId.set('remote')
    f.host.state.focusedSessionOwner.set({ connectionId: 'remote', profile: 'default' })
    f.p.outerHTML = markup
    for (let i = 0; i < 8; i += 1) await runtime.flush()
    resolveLocal({ messages: [{ role: 'assistant', timestamp: 100, tool_calls: [{ id: 'stale-call' }] }] })
    for (let i = 0; i < 8; i += 1) await runtime.flush()
    assert.equal(f.el('first').hasAttribute('data-codex-standalone-narration'), false)
    assert.equal(f.hidden('first'), true)
    assert.deepEqual(requests, ['local', 'remote'])
  } finally { runtime.stop(); await runtime.flush() }
})

for (const working of [false, true]) {
  run(`same-route SDK owner publication preserves ${working ? 'Working' : 'Worked and latest-only'} presentation`, completedBody, async f => {
    f.host.state.focusedSessionOwner.set(null)
    f.busy(working)
    if (working) f.el('tool').closest('[data-role="assistant"]').dataset.streaming = 'true'
    const runtime = f.install()
    try {
      await runtime.flush()
      const phase = working ? 'working' : 'completed'
      assert.equal(f.p.dataset.codexActivityPhase, phase)
      assert.ok(f.p.querySelector('[data-codex-turn-activity]'))
      f.host.state.focusedSessionOwner.set({ connectionId: 'local', profile: 'default' })
      await runtime.flush()
      assert.equal(f.p.dataset.codexActivityPhase, phase, 'SDK enrichment is not a route handoff')
      assert.ok(f.p.querySelector('[data-codex-turn-activity]'))
      assert.equal(f.hidden('answer'), false)
      assert.equal(f.hidden('tool'), !working)
      if (!working) assert.equal(f.hidden('old-a'), true)
    } finally { runtime.stop(); await runtime.flush() }
  })
}

run('DOM ownership remains revoked after route ABA despite SDK owner enrichment', completedBody, async f => {
  f.host.state.focusedSessionOwner.set(null)
  const runtime = f.install()
  try {
    await runtime.flush()
    assert.equal(f.p.dataset.codexActivityPhase, 'completed')
    f.w.location.hash = '#/stored-b'
    f.host.state.activeSessionId.set('runtime-b')
    f.host.state.focusedSessionId.set('runtime-b')
    f.host.state.focusedStoredSessionId.set('stored-b')
    await runtime.flush()
    assert.equal(f.p.querySelector('[data-codex-turn-activity]'), null)
    f.w.location.hash = '#/stored'
    f.host.state.activeSessionId.set('runtime')
    f.host.state.focusedSessionId.set('runtime')
    f.host.state.focusedStoredSessionId.set('stored')
    f.host.state.focusedSessionOwner.set({ connectionId: 'local', profile: 'default' })
    await runtime.flush()
    assert.equal(f.p.querySelector('[data-codex-turn-activity]'), null)
    assert.equal(f.hidden('tool'), false)
    f.p.querySelector('[data-role="user"]').dataset.messageId = 'fresh-native-user'
    await runtime.flush()
    assert.equal(f.p.dataset.codexActivityPhase, 'completed')
    assert.ok(f.p.querySelector('[data-codex-turn-activity]'))
  } finally { runtime.stop(); await runtime.flush() }
})