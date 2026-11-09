import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// Offline runtime seam: shipping function bodies and JSDOM's real observer;
// only SDK/React imports, transport, clock and animation scheduling are supplied.
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve))
}
const messages = [
  { role: 'user', row_id: 1, text: 'Old question' },
  { role: 'assistant', text: 'Historical answer' },
  { role: 'user', row_id: 2, text: 'Live question' },
  { role: 'assistant', text: 'Live answer' },
]
const pairMarkup = (id, prompt, answer) => `<div data-slot="aui_turn-pair">
  <div data-slot="aui_user-message-root" data-message-id="${id}"><div data-slot="aui_user-message-text">${prompt}</div></div>
  <div data-role="assistant" data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content"><div class="aui-md">${answer}</div></div></div>
</div>`
const fixture = `<!doctype html><section data-session-anchor="workspace">
  <div data-slot="aui_thread-viewport">${pairMarkup('history:2', 'Live question', 'Live answer')}</div>
  <div data-slot="thread-timeline"><div data-slot="thread-timeline-ticks">
    <button class="thread-timeline-tick" data-timeline-id="history:1" data-timeline-index="0" aria-label="Old question" aria-describedby="native-description"><span data-slot="timeline-bar"></span></button>
    <button class="thread-timeline-tick" data-timeline-id="history:2" data-timeline-index="1" aria-label="Live question"><span data-slot="timeline-bar"></span></button>
  </div></div></section>`

async function setup(relative, t, { pending = false } = {}) {
  const filename = new URL(`../${relative}`, import.meta.url)
  const source = await readFile(filename, 'utf8')
  const dom = new JSDOM(fixture, {
    url: 'https://synthetic.invalid/#/stored-a', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const { window } = dom
  const document = window.document
  const frames = new Map(), frameCallbacks = [], requests = [], resolvers = []
  let serial = 0, now = 100000
  window.Date.now = () => now
  window.requestAnimationFrame = callback => {
    frameCallbacks.push(callback)
    frames.set(++serial, callback)
    return serial
  }
  window.cancelAnimationFrame = id => frames.delete(id)
  const atom = initial => {
    let value = initial
    const listeners = new Set()
    return {
      get: () => value,
      set(next) { value = next; for (const callback of listeners) callback() },
      subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback) },
      listeners,
    }
  }
  const state = { activeSessionId: atom('runtime-a'), profile: atom('default'), gateway: atom('open') }
  Object.assign(window, {
    host: {
      state, onEvent: () => () => {},
      request(method, params) {
        assert.equal(method, 'session.history')
        requests.push({ method, params: JSON.parse(JSON.stringify(params)) })
        return pending ? new Promise(resolve => resolvers.push(resolve)) : Promise.resolve({ messages })
      },
    },
    jsx: () => null, useEffect: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}],
    useQuery: () => ({}), useValue: () => null, queryClient: {}, PALETTE_AREA: 'palette', THEMES_AREA: 'themes',
  })
  const executable = source.replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__plugin = {')
  vm.runInContext(executable + '\nglobalThis.__mount = installHistoryRailRuntime;', dom.getInternalVMContext(), { filename: filename.pathname })
  const runtime = window.__mount()
  // The enclosing behavior runtime forwards topology records through observe().
  const topology = new window.MutationObserver(records => runtime.observe(records))
  topology.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-session-anchor'] })
  t.after(() => { topology.disconnect(); runtime.cleanup(); window.close() })
  await settle()
  const buttons = [...document.querySelectorAll('.thread-timeline-tick')]
  const hover = async (button = buttons[0]) => {
    button.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
    await settle()
  }
  const close = () => buttons[0].dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  return {
    window, document, runtime, topology, state, requests, resolvers, frames, frameCallbacks, buttons, hover, close,
    advance: ms => { now += ms },
    answer: () => document.querySelector('[data-codex-history-answer]')?.textContent,
    card: () => document.querySelector('[data-codex-history-preview]'),
    live: () => document.querySelector('.aui-md'),
    surface: document.querySelector('section'),
    viewport: document.querySelector('[data-slot="aui_thread-viewport"]'),
  }
}

for (const relative of ['codex-chat-look/plugin.js', 'codex-chat-look/desktop/plugin.js']) {
  for (const mutation of ['characterData', 'childList']) {
    test(`${relative}: unrelated ${mutation} streaming preserves resolved history and preview nodes`, async t => {
      const h = await setup(relative, t)
      await h.hover()
      assert.equal(h.answer(), 'Historical answer')
      const answerNode = h.document.querySelector('[data-codex-history-answer]').firstChild
      const previewChanges = []
      const observer = new h.window.MutationObserver(records => previewChanges.push(...records))
      observer.observe(h.card(), { subtree: true, childList: true, characterData: true, attributes: true })
      t.after(() => observer.disconnect())
      for (let i = 0; i < 6; i++) {
        if (mutation === 'characterData') h.live().firstChild.data += ` chunk-${i}`
        else h.live().textContent = `Live chunk-${i}`
        await settle()
      }
      assert.equal(h.requests.length, 1, 'streaming must not invalidate the 20-second RPC cache')
      assert.equal(h.answer(), 'Historical answer')
      assert.equal(h.document.querySelector('[data-codex-history-answer]').firstChild, answerNode)
      assert.equal(previewChanges.length, 0, 'an unrelated turn must not close/repaint the preview')
    })
  }

  test(`${relative}: unrelated streaming preserves the initial pending history callback`, async t => {
    const h = await setup(relative, t, { pending: true })
    await h.hover()
    for (let i = 0; i < 6; i++) {
      h.live().firstChild.data += ' chunk'
      await settle()
    }
    h.resolvers[0]({ messages })
    await settle()
    assert.equal(h.answer(), 'Historical answer', 'first pending response remains usable without a new hover')
    assert.equal(h.requests.length, 1)
  })

  test(`${relative}: the hovered mounted preview follows both text mutation forms`, async t => {
    const h = await setup(relative, t)
    await h.hover(h.buttons[1])
    assert.equal(h.answer(), 'Live answer')
    h.live().firstChild.data += ' streamed'
    await settle()
    assert.equal(h.answer(), 'Live answer streamed')
    h.live().textContent = 'Replaced final'
    await settle()
    assert.equal(h.answer(), 'Replaced final')
    assert.equal(h.requests.length, 0)
    assert.equal(h.card().hidden, false)
  })

  test(`${relative}: mounted/unmounted transitions fence RPC while reusing its valid cache`, async t => {
    const h = await setup(relative, t, { pending: true })
    await h.hover()
    h.viewport.insertAdjacentHTML('afterbegin', pairMarkup('history:1', 'Old question', 'Mounted historical answer'))
    await settle()
    assert.equal(h.answer(), 'Mounted historical answer')
    h.resolvers[0]({ messages })
    await settle()
    assert.equal(h.answer(), 'Mounted historical answer', 'late RPC cannot overwrite mounted content')
    h.viewport.firstElementChild.remove()
    await settle()
    assert.equal(h.answer(), 'Historical answer')
    assert.equal(h.requests.length, 1, 'virtualization alone must not discard cached history')
  })

  test(`${relative}: cache TTL is honored on the next preview open`, async t => {
    const h = await setup(relative, t)
    await h.hover()
    h.close(); h.advance(20000)
    await h.hover()
    assert.equal(h.requests.length, 1, 'existing inclusive TTL boundary')
    h.close(); h.advance(1)
    await h.hover()
    assert.equal(h.requests.length, 2)
    assert.equal(h.answer(), 'Historical answer')
  })

  for (const key of ['activeSessionId', 'profile', 'gateway']) {
    test(`${relative}: ${key} invalidates cache and fences stale responses`, async t => {
      const h = await setup(relative, t, { pending: true })
      await h.hover()
      h.state[key].set(`${key}-b`)
      assert.equal(h.card().hidden, true)
      await h.hover()
      assert.equal(h.requests.length, 2)
      h.resolvers[0]({ messages })
      await settle()
      assert.equal(h.answer(), '')
      h.resolvers[1]({ messages })
      await settle()
      assert.equal(h.answer(), 'Historical answer')
      assert.equal(h.requests[1].params.session_id, h.state.activeSessionId.get())
    })
  }

  test(`${relative}: route and pane ownership stay isolated`, async t => {
    const h = await setup(relative, t, { pending: true })
    await h.hover()
    h.window.history.replaceState(null, '', '#/stored-b')
    h.window.dispatchEvent(new h.window.HashChangeEvent('hashchange'))
    await settle()
    await h.hover()
    assert.equal(h.requests.length, 2)
    h.resolvers[0]({ messages })
    await settle()
    assert.equal(h.answer(), '')
    h.surface.setAttribute('data-session-anchor', 'session-tile:foreign')
    await settle()
    assert.equal(h.card().hidden, true)
    await h.hover()
    assert.equal(h.requests.length, 2, 'tiles cannot send runtime-only RPCs')
    h.resolvers[1]({ messages })
    await settle()
    assert.equal(h.answer(), '')
    h.surface.setAttribute('data-session-anchor', 'workspace')
    await settle(); await h.hover()
    assert.equal(h.requests.length, 3)
  })

  for (const change of ['identity', 'index', 'label', 'replacement']) {
    test(`${relative}: tick ${change} invalidates cached topology and stale callback`, async t => {
      const h = await setup(relative, t, { pending: true })
      await h.hover()
      let button = h.buttons[0]
      if (change === 'replacement') {
        const replacement = button.cloneNode(true)
        button.replaceWith(replacement)
        button = replacement
      } else {
        const [attribute, value] = {
          identity: ['data-timeline-id', 'history:999'], index: ['data-timeline-index', '99'], label: ['aria-label', 'Different question'],
        }[change]
        button.setAttribute(attribute, value)
      }
      await settle()
      assert.equal(h.card().hidden, true)
      await h.hover(button)
      assert.equal(h.requests.length, 2)
      h.resolvers[0]({ messages })
      await settle()
      assert.equal(h.answer(), '')
      h.resolvers[1]({ messages })
      await settle()
      assert.equal(h.answer(), change === 'replacement' ? 'Historical answer' : '', 'mismatched global identity must fail closed')
    })
  }

  test(`${relative}: unrelated streaming leaves a mounted historical preview untouched`, async t => {
    const h = await setup(relative, t)
    h.viewport.insertAdjacentHTML('afterbegin', pairMarkup('history:1', 'Old question', 'Mounted historical answer'))
    await settle(); await h.hover()
    const answerNode = h.document.querySelector('[data-codex-history-answer]').firstChild
    h.document.querySelectorAll('.aui-md')[1].textContent = 'Unrelated live update'
    await settle()
    assert.equal(h.answer(), 'Mounted historical answer')
    assert.equal(h.document.querySelector('[data-codex-history-answer]').firstChild, answerNode)
    assert.equal(h.requests.length, 0)
  })

  test(`${relative}: disable before first response rejects stale promise and queued paint`, async t => {
    const h = await setup(relative, t, { pending: true })
    await h.hover()
    assert.equal(h.requests.length, 1)
    assert.equal(h.answer(), '')
    const staleFrames = [...h.frameCallbacks]
    h.topology.disconnect(); h.runtime.cleanup()
    h.resolvers[0]({ messages })
    for (const callback of staleFrames) callback(0)
    await settle()
    assert.equal(h.document.querySelector('[data-codex-history-preview]'), null)
    assert.equal(h.frames.size, 0)
    assert.equal(h.buttons[0].getAttribute('aria-describedby'), 'native-description')
    await h.hover()
    assert.equal(h.requests.length, 1)
  })

  test(`${relative}: hover handoff and disable fence callbacks and restore native state`, async t => {
    const h = await setup(relative, t, { pending: true })
    await h.hover()
    await h.hover(h.buttons[1])
    h.resolvers[0]({ messages })
    await settle()
    assert.equal(h.answer(), 'Live answer', 'old hovered tick cannot overwrite current mounted preview')
    await h.hover()
    h.buttons[0].dispatchEvent(new h.window.MouseEvent('mouseout', { bubbles: true }))
    h.topology.disconnect()
    const staleFrames = [...h.frameCallbacks]
    h.runtime.cleanup()
    for (const callback of staleFrames) callback(0)
    h.resolvers[0]({ messages })
    h.live().textContent = 'After disable'
    await settle()
    assert.equal(h.document.querySelectorAll('[data-codex-history-preview], [data-codex-history-rail], [data-codex-history-open], [data-codex-history-hover]').length, 0)
    assert.equal(h.buttons[0].getAttribute('aria-describedby'), 'native-description')
    assert.equal(h.frames.size, 0)
    assert.ok(Object.values(h.state).every(atom => atom.listeners.size === 0))
    const count = h.requests.length
    await h.hover()
    assert.equal(h.requests.length, count, 'removed listeners cannot reopen after disable')
  })
}
