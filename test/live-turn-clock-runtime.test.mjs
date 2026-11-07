import { testDependencyRequire } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const require = testDependencyRequire()
const { JSDOM } = require('jsdom')
const pluginUrl = new URL('../codex-chat-look/plugin.js', import.meta.url)
// SDK/React bindings are supplied by the fixture, as in helpers/load-plugin.mjs.
// No implementation is extracted or replaced: installBehaviorRuntime executes.
const plugin = (await readFile(pluginUrl, 'utf8'))
  .replace(/^import .*$/gm, '')
  .replace(/export default\s*\{/, 'globalThis.testPlugin = {')
const EPOCH = 1_800_000_000_000

function atom(value) {
  const listeners = new Set()
  return {
    get: () => value,
    set(next) { value = next; for (const listener of listeners) listener(value) },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    listenerCount: () => listeners.size
  }
}

// Partial native-shaped DOM only, not a mounted native React window. Native
// message IDs, streaming marker, final footer and tool slots are public seams.
const pairMarkup = (id = 'pair', { live = true, duration = '', final = false } = {}) => `
  <div data-slot="aui_turn-pair" id="${id}">
    <div data-role="user" data-slot="aui_user-message-root" data-message-id="1800000000-0-user">Question</div>
    <div data-slot="aui_response-group">
      <div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="1800000001-1-assistant">
        <div data-slot="aui_assistant-message-content">
          <div data-slot="tool-block" id="${id}-tool"><button>Read file</button><span data-native-tool-duration>2s</span></div>
          ${final ? '<div class="aui-md">Final answer</div>' : ''}
        </div>
        <span hidden data-slot="aui_message-streaming-marker" ${live ? 'data-message-streaming="true"' : ''}></span>
        ${final ? '<div data-slot="aui_msg-actions"><button>Copy</button></div>' : ''}
        ${duration ? `<span data-slot="aui_turn-duration">⏱ ${duration}</span>` : ''}
      </div>
    </div>
  </div>`

function fixture({ html = pairMarkup(), history = [] } = {}) {
  const dom = new JSDOM(`<html data-codex-chat-look="true"><body><section data-session-anchor="workspace"><div data-slot="aui_thread-content">${html}</div></section></body></html>`, {
    runScripts: 'outside-only', pretendToBeVisual: true,
    url: 'https://clock-fixture.invalid/#/stored-test'
  })
  const w = dom.window
  const events = new Map(), tasks = new Map(), errors = [], requests = []
  const state = {
    activeSessionId: atom('test'), profile: atom('default'), gateway: atom('open'),
    connectionId: atom('connection-test'),
    focusedSessionOwner: atom({ connectionId: 'connection-test', profile: 'default' }),
    focusedSessionId: atom('test'), focusedStoredSessionId: atom('stored-test')
  }
  let elapsed = 0, wallOffset = 0, sequence = 0, stopped = false, callbacks = 0
  w.Date.now = () => EPOCH + elapsed + wallOffset
  w.setTimeout = (fn, delay = 0, ...args) => {
    const id = ++sequence
    tasks.set(id, { at: elapsed + Math.max(0, Number(delay) || 0), delay: Number(delay) || 0, fn: () => fn(...args) })
    return id
  }
  w.clearTimeout = id => tasks.delete(id)
  w.requestAnimationFrame = fn => w.setTimeout(() => fn(elapsed), 16)
  w.cancelAnimationFrame = w.clearTimeout
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  w.addEventListener('error', event => { errors.push(event.error || event.message); event.preventDefault() })
  w.fixtureHost = {
    state,
    onEvent(type, callback) {
      assert.equal(events.has(type), false, `fixture supports one subscription for ${type}`)
      events.set(type, callback)
      return () => { if (events.get(type) === callback) events.delete(type) }
    },
    request: async (method, params) => { requests.push({ method, params: structuredClone(params) }); return { messages: history } }
  }
  w.eval(`const host=window.fixtureHost, jsx=()=>null, useEffect=()=>{}, useRef=()=>({current:null}), useQuery=()=>({}), THEMES_AREA='themes', PALETTE_AREA='palette', TITLEBAR_AREAS={};\n${plugin}\nwindow.startClockRuntime=()=>installBehaviorRuntime();`)
  const cleanup = w.startClockRuntime()
  const microtasks = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  async function advance(ms) {
    const target = elapsed + ms
    await microtasks()
    let budget = 2000
    while (true) {
      const next = [...tasks.entries()].filter(([, task]) => task.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
      if (!next) break
      assert.ok(budget-- > 0, 'bounded runtime scheduler exceeded 2000 callbacks')
      elapsed = next[1].at
      tasks.delete(next[0]); callbacks++
      next[1].fn()
      await microtasks()
    }
    elapsed = target
    await microtasks()
    assert.deepEqual(errors, [], 'runtime must not produce unhandled DOM errors')
  }
  return {
    w, state, events, requests, tasks, advance,
    settle: () => advance(200),
    nowSeconds: () => w.Date.now() / 1000,
    jumpWall: ms => { wallOffset += ms },
    callbacks: () => callbacks,
    clockTimers: () => [...tasks.values()].filter(task => task.delay === 1000).length,
    pair: (id = 'pair') => w.document.getElementById(id),
    header: (id = 'pair') => w.document.getElementById(id)?.querySelector(':scope > [data-codex-turn-activity]'),
    label(id = 'pair') { return this.header(id)?.querySelector('span')?.textContent ?? null },
    emit(type, payload = {}, owner = {}) {
      const event={ type, session_id: 'test', profile: 'default', connectionId: 'connection-test', payload, ...owner }
      for (const key of [type,'*']) events.get(key)?.(event)
    },
    stop() { if (!stopped) { stopped = true; cleanup() } },
    async close() { this.stop(); try { await advance(400) } finally { w.close() } }
  }
}

const runtimeTest = (name, fn) => test(name, { timeout: 5000, concurrency: false }, async () => {
  const f = fixture()
  try { await f.settle(); await fn(f) } finally { await f.close() }
})

runtimeTest('partial DOM: mounting an already-live turn never invents mount-age duration', async f => {
  assert.equal(f.label(), 'Working')
  assert.equal(f.clockTimers(), 0)
  f.jumpWall(3_600_000)
  await f.advance(5000)
  assert.equal(f.label(), 'Working')
  assert.equal(f.clockTimers(), 0)
  assert.deepEqual(f.requests, [{ method: 'session.history', params: { session_id: 'test' } }])
})

// message.start proves acceptance receipt, not the earlier submit instant. Only
// session.info.turn_started_at establishes the authoritative backend origin.
runtimeTest('message.start acceptance ticks absolute whole-turn time across tool changes, with exact second/minute/hour labels', async f => {
  f.emit('message.start')
  await f.settle()
  assert.equal(f.label(), 'working 0s')
  assert.equal(f.clockTimers(), 1)
  const tool = f.w.document.getElementById('pair-tool')
  const parent = tool.parentNode
  await f.advance(8000)
  assert.equal(f.label(), 'working 8s')
  tool.querySelector('button').textContent = 'Finished reading file'
  tool.querySelector('[data-native-tool-duration]').textContent = '999s'
  const next = f.w.document.createElement('div')
  next.setAttribute('data-slot', 'tool-block'); next.textContent = 'Running next tool'
  parent.append(next)
  await f.settle()
  assert.equal(f.label(), 'working 8s', 'a new tool and its timer must not reset or replace whole-turn time')
  assert.equal(tool.parentNode, parent)
  f.jumpWall(56_000)
  await f.advance(1000)
  assert.equal(f.label(), 'working 1min 5s')
  f.jumpWall(3_596_000)
  await f.advance(1000)
  assert.equal(f.label(), 'working 1hour 1min')
  assert.equal(f.clockTimers(), 1)
})

runtimeTest('native session.info hydrates an existing turn using epoch seconds and authoritative correction, not receipt time', async f => {
  f.emit('message.start')
  await f.settle()
  f.emit('session.info', { running: true, turn_started_at: f.nowSeconds() - 125 })
  await f.settle()
  assert.equal(f.label(), 'working 2min 5s')
  await f.advance(1000)
  assert.equal(f.label(), 'working 2min 6s')
  const older = f.nowSeconds() - 300
  f.emit('session.info', { running: true, turn_started_at: older })
  await f.settle()
  assert.equal(f.label(), 'working 2min 6s', 'an older heartbeat cannot move an authoritative origin')
})

runtimeTest('native session.info alone recovers a whole-turn clock after mounting mid-turn', async f => {
  const origin = f.nowSeconds() - 65
  f.emit('session.info', { running: true, turn_started_at: origin })
  await f.settle()
  assert.equal(f.label(), 'working 1min 5s')
  f.emit('session.info', { running: true, turn_started_at: origin })
  await f.settle()
  await f.advance(1000)
  assert.equal(f.label(), 'working 1min 6s')
})

runtimeTest('wrong-session and wrong-profile events cannot start, correct or end the active clock', async f => {
  for (const owner of [{ session_id: 'other' }, { profile: 'other' }]) {
    f.emit('message.start', {}, owner)
    f.emit('session.info', { running: true, turn_started_at: f.nowSeconds() - 80 }, owner)
  }
  await f.settle()
  assert.equal(f.label(), 'Working')
  assert.equal(f.clockTimers(), 0)
  f.emit('message.start')
  await f.settle()
  for (const owner of [{ session_id: 'other' }, { profile: 'other' }]) {
    f.emit('message.complete', {}, owner)
    f.emit('session.info', { running: false }, owner)
    f.emit('session.info', { running: true, turn_started_at: f.nowSeconds() - 80 }, owner)
  }
  await f.advance(2000)
  assert.equal(f.label(), 'working 2s')
  assert.equal(f.clockTimers(), 1)
})

for (const coordinate of ['profile', 'session', 'route']) runtimeTest(`departing and returning ${coordinate} scope cannot resurrect an old clock`, async f => {
  f.emit('message.start'); await f.settle(); await f.advance(2000)
  assert.equal(f.label(), 'working 2s')
  const set = value => {
    if (coordinate === 'profile') f.state.profile.set(value)
    if (coordinate === 'session') f.state.activeSessionId.set(value)
    if (coordinate === 'route') {
      f.w.history.replaceState(null, '', `#/${value}`)
      f.w.dispatchEvent(new f.w.HashChangeEvent('hashchange'))
    }
  }
  set('other'); await f.settle()
  assert.equal(f.clockTimers(), 0)
  assert.equal(f.label(), null, 'a departed native pair stays visible, without a destination activity projection')
  assert.equal(f.pair().querySelector('[data-slot="tool-block"]').hasAttribute('data-codex-activity-item'), false)
  set(coordinate === 'profile' ? 'default' : coordinate === 'session' ? 'test' : 'stored-test')
  await f.advance(2000)
  assert.equal(f.label(), null, 'returning SDK coordinates cannot rebind stale native DOM')
  f.pair().outerHTML = pairMarkup()
  await f.settle()
  assert.equal(f.label(), 'Working')
  assert.equal(f.clockTimers(), 0)
})

runtimeTest('native running:false stops and freezes the timer even before a stale streaming marker disappears', async f => {
  f.emit('message.start'); await f.settle(); await f.advance(8000)
  assert.equal(f.label(), 'working 8s')
  f.emit('session.info', { running: false }); await f.settle()
  const frozen = f.label()
  assert.equal(f.clockTimers(), 0)
  await f.advance(5000)
  assert.equal(f.label(), frozen)
  const stopped = f.w.document.createElement('div')
  stopped.setAttribute('data-slot', 'aui_assistant-message-stopped')
  f.pair().querySelector('[data-role="assistant"]').append(stopped)
  await f.settle()
  assert.equal(f.header(), null, 'native stopped state remains unprojected')
  assert.equal(f.clockTimers(), 0)
})

for (const duration of ['', '1m 5s']) test(`completion cancels live work and preserves original completed label (${duration || 'unspecified'})`, { timeout: 5000 }, async () => {
  const f = fixture()
  try {
    await f.settle(); f.emit('message.start'); await f.settle(); await f.advance(8000)
    assert.equal(f.label(), 'working 8s')
    f.emit('message.complete'); await f.settle()
    assert.equal(f.clockTimers(), 0)
    const root = f.pair().querySelector('[data-role="assistant"]')
    root.querySelector('[data-slot="aui_message-streaming-marker"]').removeAttribute('data-message-streaming')
    root.querySelector('[data-slot="aui_assistant-message-content"]').insertAdjacentHTML('beforeend', '<div class="aui-md">Final answer</div>')
    root.insertAdjacentHTML('beforeend', `<div data-slot="aui_msg-actions"><button>Copy</button></div>${duration ? `<span data-slot="aui_turn-duration">⏱ ${duration}</span>` : ''}`)
    await f.settle()
    const expected = duration ? 'Worked for 1m 5s' : 'Worked'
    assert.equal(f.label(), expected)
    assert.equal(f.header().disabled, false)
    await f.advance(5000)
    assert.equal(f.label(), expected)
    assert.equal(f.clockTimers(), 0)
  } finally { await f.close() }
})

runtimeTest('cleanup unsubscribes events, cancels ticks and removes owned presentation after the handoff grace period', async f => {
  f.emit('message.start'); await f.settle(); await f.advance(2000)
  assert.equal(f.label(), 'working 2s')
  f.stop()
  assert.equal(f.clockTimers(), 0)
  assert.equal(f.events.size, 0)
  for (const state of Object.values(f.state)) assert.equal(state.listenerCount(), 0)
  f.emit('message.start')
  await f.advance(400)
  assert.equal(f.header(), null)
  assert.equal(f.tasks.size, 0)
  const callbacks = f.callbacks()
  await f.advance(5000)
  assert.equal(f.callbacks(), callbacks, 'disposed runtime cannot schedule more callbacks')
  assert.equal(f.header(), null)
})

runtimeTest('replayed message.start is recovered work and must not arm a fresh receipt clock', async f => {
  f.emit('message.start', {}, { replayed: true })
  await f.settle()
  assert.equal(f.label(), 'Working')
  assert.equal(f.clockTimers(), 0)
  await f.advance(2000)
  assert.equal(f.label(), 'Working')
})

for (const type of ['message.start', 'session.info', 'message.complete']) runtimeTest(`foreign connection ${type} cannot touch the focused clock`, async f => {
  if (type !== 'message.start') {
    f.emit('message.start'); await f.settle(); await f.advance(2000)
    assert.equal(f.label(), 'working 2s')
  }
  f.emit(type, type === 'session.info' ? { running: true, turn_started_at: f.nowSeconds() - 80 } : {}, { connectionId: 'foreign-connection' })
  await f.settle()
  assert.equal(f.label(), type === 'message.start' ? 'Working' : 'working 2s')
  assert.equal(f.clockTimers(), type === 'message.start' ? 0 : 1)
  await f.advance(1000)
  assert.equal(f.label(), type === 'message.start' ? 'Working' : 'working 3s')
})

for (const type of ['session.info', 'message.complete']) runtimeTest(`replayed ${type} cannot correct or stop a fresh live clock`, async f => {
  f.emit('message.start'); await f.settle(); await f.advance(2000)
  f.emit(type, { running: false }, { replayed: true })
  await f.settle()
  assert.equal(f.label(), 'working 2s')
  assert.equal(f.clockTimers(), 1)
  await f.advance(1000)
  assert.equal(f.label(), 'working 3s')
})

runtimeTest('legacy unqualified events remain usable on the active primary path', async f => {
  f.emit('message.start', {}, { connectionId: undefined })
  await f.settle(); await f.advance(2000)
  assert.equal(f.label(), 'working 2s')
  f.emit('session.info', { running: true, turn_started_at: f.nowSeconds() - 80 }, { connectionId: undefined })
  await f.settle()
  assert.equal(f.label(), 'working 1min 20s')
  f.emit('message.complete', {}, { connectionId: undefined })
  await f.settle()
  assert.equal(f.clockTimers(), 0)
})
