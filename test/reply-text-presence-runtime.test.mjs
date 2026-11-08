import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

// Full shipping module + real MutationObserver. Clock/layout/SDK are seams;
// these tests establish DOM/CSS behavior, not native-window acceptance.
const message = (id, body, extra = '') => `<div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="${id}" ${extra}><div data-slot="aui_assistant-message-content">${body}</div></div>`
const md = (id, body = '') => `<div id="${id}" class="aui-md" data-status="${id === 'new' ? 'running' : 'complete'}">${body}</div>`
const pair = (id, body) => `<div id="${id}" data-slot="aui_turn-pair"><div data-role="user" data-message-id="user-${id}">Question</div><div data-slot="aui_response-group">${body}</div></div>`
const atom = value => ({ get: () => value, subscribe: () => () => {} })

async function setup(relative, t, { complete = false, raw = false, nested = false } = {}) {
  const source = await readFile(new URL(`../${relative}`, import.meta.url), 'utf8')
  const body = message('old-root', md('old', 'Earlier answer'))
    + message('new-root', raw ? '' : md('new', nested ? '<p id="paragraph"> </p><p id="kept">Kept prose</p>' : ''), 'data-streaming="true"')
  const dom = new JSDOM(`<html data-codex-chat-look="true"><head></head><body><section data-session-anchor="workspace">${pair('pair', body)}${pair('other-pair', message('other-root', md('other', 'Other turn answer')))}</section></body></html>`, { url: 'https://reply.invalid/#/stored', runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window, doc = w.document, tasks = new Map(), errors = []
  let serial = 0, frames = 0
  w.addEventListener('error', event => errors.push(event.error || event.message))
  w.setTimeout = (fn, delay = 0) => { tasks.set(++serial, { fn, delay }); return serial }
  w.clearTimeout = id => tasks.delete(id)
  w.requestAnimationFrame = fn => { frames++; return w.setTimeout(fn, 16) }
  w.cancelAnimationFrame = w.clearTimeout
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  Object.assign(w, {
    host: { state: { activeSessionId: atom('runtime'), profile: atom('default'), gateway: atom('open') }, onEvent: () => () => {} },
    jsx: () => null, useEffect: () => {}, useRef: () => ({ current: null }), useQuery: () => ({}),
    THEMES_AREA: 'themes', TITLEBAR_AREAS: {}, PALETTE_AREA: 'palette',
  })
  vm.runInContext(source.replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__plugin = {') + '\nglobalThis.__reply = {installBehaviorRuntime, registerCompleteMessages, CSS};', dom.getInternalVMContext())
  const style = doc.createElement('style'); style.textContent = w.__reply.CSS; doc.head.append(style)
  const registrations = [], disposers = [], storage = new Map([['show-complete-messages', complete]])
  w.__reply.registerCompleteMessages({ storage: { get: (key, fallback) => storage.has(key) ? storage.get(key) : fallback, set: (key, value) => storage.set(key, value) }, register: item => registrations.push(item), onDispose: fn => disposers.push(fn) }, 'palette', w.host)
  const el = id => doc.getElementById(id), p = el('pair'), content = doc.querySelector('[data-message-id="new-root"] > [data-slot="aui_assistant-message-content"]')
  const surface = raw ? content : el('new')
  if (raw) surface.id = 'new'
  const text = doc.createTextNode(''); (surface.querySelector('#paragraph') || surface).append(text)
  const other = el('other-pair')
  let pairQueries = 0, otherQueries = 0, globalPairScans = 0
  for (const [node, count] of [[p, () => pairQueries++], [other, () => otherQueries++]]) {
    const query = node.querySelectorAll.bind(node)
    node.querySelectorAll = selector => { count(); return query(selector) }
  }
  const query = doc.querySelectorAll.bind(doc)
  doc.querySelectorAll = selector => { if (selector === '[data-slot="aui_turn-pair"]') globalPairScans++; return query(selector) }
  const hidden = id => {
    const node = el(id); assert.ok(node?.isConnected, `${id} must remain mounted`)
    for (let current = node; current; current = current.parentElement) {
      if (w.getComputedStyle(current).display === 'none') return true
    }
    return false
  }
  const flush = async () => {
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setImmediate(resolve))
      const entry = [...tasks].find(([, task]) => task.delay < 1000)
      if (!entry) { assert.deepEqual(errors, []); return }
      tasks.delete(entry[0]); entry[1].fn()
    }
    assert.fail('runtime did not settle within 100 callbacks')
  }
  let stop = w.__reply.installBehaviorRuntime()
  t.after(() => { stop(); disposers.forEach(fn => fn()); w.close() })
  await flush()
  return { w, doc, p, el, surface, text, flush, hidden, stop: () => stop(), tasks,
    restart: () => { stop(); stop = w.__reply.installBehaviorRuntime() },
    metrics: () => ({ pairQueries, otherQueries, globalPairScans, frames }),
    toggleComplete: () => registrations[0].data.run(),
    disposeComplete: () => disposers.forEach(fn => fn()),
  }
}

for (const relative of ['codex-chat-look/plugin.js', 'codex-chat-look/desktop/plugin.js']) {
  for (const raw of [false, true]) {
    for (const complete of [false, true]) {
      test(`${relative}: existing ${raw ? 'plain' : 'markdown'} text node empty/nonempty transitions, complete=${complete}`, async t => {
        const f = await setup(relative, t, { raw, complete })
        const parent = f.surface.parentNode
        assert.equal(f.hidden('old'), false, 'empty latest root must not fold the earlier answer')
        f.text.data = 'Newest streamed answer'
        await f.flush()
        assert.equal(f.el('old').getAttribute('data-codex-previous-reply'), 'collapsed', 'text-only first token must demote the previous answer')
        assert.equal(f.hidden('old'), true)
        assert.equal(f.hidden('new'), complete && !raw, 'complete-messages filtering remains independent')
        assert.equal(f.surface.hasAttribute('data-codex-latest-reply'), true)
        const baseline = f.metrics()
        for (let i = 0; i < 12; i++) { f.text.data += ` token-${i}`; await f.flush() }
        assert.deepEqual(f.metrics(), baseline, 'ordinary tokens must not project pairs, rescan history or schedule frames')
        assert.equal(f.hidden('other'), false)
        assert.equal(f.metrics().otherQueries, baseline.otherQueries, 'another user turn is not reprojected')
        const header = f.p.querySelector(':scope > [data-codex-turn-activity]')
        assert.equal(header.disabled, false); header.click()
        assert.equal(f.hidden('old'), false, 'previous answer remains accessible by disclosure')
        header.click(); assert.equal(f.hidden('old'), true)
        f.text.data = '  \n '
        await f.flush()
        assert.equal(f.hidden('old'), false, 'clearing the latest text must restore the earlier answer')
        assert.equal(f.el('old').hasAttribute('data-codex-latest-reply'), true)
        assert.equal(f.surface.hasAttribute('data-codex-latest-reply'), false)
        assert.equal(f.p.querySelector('[data-codex-turn-activity]'), null)
        f.text.data = 'Back again'; await f.flush()
        assert.equal(f.hidden('old'), true)
        assert.equal(f.surface.firstChild, f.text); assert.equal(f.surface.parentNode, parent)
        f.toggleComplete()
        assert.equal(f.hidden('new'), !complete && !raw)
        f.stop(); f.disposeComplete(); await f.flush()
        assert.equal(f.hidden('old'), false); assert.equal(f.hidden('new'), false)
        assert.equal(f.p.querySelector('[data-codex-previous-reply], [data-codex-latest-reply], [data-codex-turn-activity]'), null)
        const afterStop = f.metrics(); f.text.data = ''; await f.flush()
        assert.deepEqual(f.metrics(), afterStop, 'disconnected runtime cannot redecorate after disable')
      })
    }
  }

  for (const raw of [false, true]) test(`${relative}: ${raw ? 'plain' : 'markdown'} textContent replacement follows presence without projecting ordinary replacement tokens`, async t => {
    const f = await setup(relative, t, { raw })
    f.surface.textContent = 'Replacement first token'; await f.flush()
    assert.equal(f.hidden('old'), true)
    const baseline = f.metrics()
    for (let i = 0; i < 8; i++) { f.surface.textContent = `Replacement token ${i}`; await f.flush() }
    assert.deepEqual(f.metrics(), baseline)
    f.surface.textContent = ''; await f.flush()
    assert.equal(f.hidden('old'), false)
  })

  for (const phase of ['working', 'completed', 'uncertain']) test(`${relative}: newly mounted empty markdown becomes latest through characterData in ${phase} phase`, async t => {
    const f = await setup(relative, t)
    const response = f.surface.closest('[data-slot="aui_response-group"]')
    f.surface.closest('[data-role="assistant"]').remove(); await f.flush()
    response.insertAdjacentHTML('beforeend', message('late-root', md('late'), phase === 'working' ? 'data-streaming="true"' : ''))
    const root = f.el('late').closest('[data-role="assistant"]')
    if (phase === 'completed') root.insertAdjacentHTML('beforeend', '<div data-slot="aui_msg-actions"><button>Copy</button></div>')
    const text = f.doc.createTextNode(''); f.el('late').append(text)
    await f.flush()
    assert.equal(f.hidden('old'), false)
    const baseline = f.metrics()
    text.data = 'First token on existing empty text node'; await f.flush()
    assert.equal(f.hidden('old'), true)
    assert.equal(f.el('late').hasAttribute('data-codex-latest-reply'), true)
    assert.equal(f.p.getAttribute('data-codex-activity-phase'), phase)
    assert.equal(f.metrics().globalPairScans, baseline.globalPairScans)
    assert.equal(f.metrics().otherQueries, baseline.otherQueries)
    f.p.querySelector('[data-codex-turn-activity]').click()
    assert.equal(f.hidden('old'), false)
    text.data = ''; await f.flush()
    assert.equal(f.hidden('old'), false)
    assert.equal(f.el('old').hasAttribute('data-codex-latest-reply'), true)
  })

  test(`${relative}: hot reload reseeds presence and cleanup fences a queued text transition`, async t => {
    const f = await setup(relative, t)
    f.text.data = 'First reply'; await f.flush(); assert.equal(f.hidden('old'), true)
    f.restart(); await f.flush(); assert.equal(f.hidden('old'), true)
    f.text.data = ''; await f.flush(); assert.equal(f.hidden('old'), false)
    f.text.data = 'Pending reply'
    await new Promise(resolve => setImmediate(resolve))
    const pending = [...f.tasks.values()].filter(task => task.delay < 1000).map(task => task.fn)
    assert.ok(pending.length > 0, 'text transition must really have queued work')
    f.stop(); await f.flush()
    for (const callback of pending) callback()
    await f.flush()
    assert.equal(f.hidden('old'), false); assert.equal(f.hidden('new'), false)
    assert.equal(f.p.querySelector('[data-codex-turn-activity], [data-codex-latest-reply]'), null)
  })

  test(`${relative}: comment characterData is not prose presence and cannot consume the first real token`, async t => {
    const f = await setup(relative, t)
    const comment = f.doc.createComment(''); f.surface.append(comment)
    await f.flush()
    const baseline = f.metrics()
    comment.data = 'React marker, not answer text'; await f.flush()
    assert.deepEqual(f.metrics(), baseline, 'comments cannot schedule prose projections')
    assert.equal(f.hidden('old'), false)
    f.text.data = 'Real first token'; await f.flush()
    assert.equal(f.hidden('old'), true)
    assert.equal(f.surface.hasAttribute('data-codex-latest-reply'), true)
  })

  test(`${relative}: native order and full-part presence govern text changes, not the last mutated node`, async t => {
    const f = await setup(relative, t, { nested: true })
    const text = f.text
    await f.flush(); assert.equal(f.hidden('old'), true)
    const baseline = f.metrics()
    text.data = 'More prose'; await f.flush()
    text.data = ''; await f.flush()
    assert.equal(f.hidden('old'), true, 'another text node still establishes this reply')
    assert.deepEqual(f.metrics(), baseline)
    // An earlier native reply receiving tokens cannot overtake the newer one.
    f.el('old').firstChild.data += ' changed'; await f.flush()
    assert.equal(f.hidden('old'), true); assert.equal(f.hidden('new'), false)
    f.el('kept').firstChild.data = ''; await f.flush()
    assert.equal(f.hidden('old'), false)
    text.data = 'Restored'; await f.flush(); assert.equal(f.hidden('old'), true)
  })

  test(`${relative}: text-only latest transitions preserve protected content, media and native action identity`, async t => {
    const f = await setup(relative, t)
    f.el('old').insertAdjacentHTML('afterend', md('protected', '<a id="link" href="#native">Reference</a><button id="action">Native action</button><span tabindex="0" id="focus">Focus</span><span data-slot="future-native-output" id="unknown">Unknown</span>') + '<div data-slot="aui_generated-image"><img id="image" alt="Native image"></div><audio id="audio" controls></audio><div data-slot="tool-approval-inline" id="approval"><button id="approve">Approve</button></div>')
    const nodes = ['link', 'action', 'focus', 'unknown', 'image', 'audio', 'approval', 'approve'].map(f.el)
    const parents = nodes.map(node => node.parentNode)
    let clicks = 0; f.el('action').onclick = () => clicks++; f.el('approve').onclick = () => clicks++
    await f.flush()
    for (const value of ['New answer', '', 'New answer again']) {
      f.text.data = value; await f.flush()
      for (const node of nodes) assert.equal(f.hidden(node.id), false, `${node.id} remains reachable`)
    }
    assert.equal(f.hidden('old'), true, 'protection cannot disable ordinary previous-reply folding')
    assert.equal(clicks, 0, 'projection must not activate native controls')
    f.el('action').click(); f.el('approve').click(); assert.equal(clicks, 2)
    nodes.forEach((node, index) => { assert.equal(f.el(node.id), node); assert.equal(node.parentNode, parents[index]) })
    f.stop(); await f.flush()
    assert.equal(f.hidden('old'), false)
    nodes.forEach(node => assert.equal(f.hidden(node.id), false))
  })
}
