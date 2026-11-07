import assert from 'node:assert/strict'
import test from 'node:test'
import { testDependencyRequire } from './helpers/reference-paths.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const { JSDOM } = testDependencyRequire()('jsdom')
const md = (id, text = id) => `<div class="aui-md" id="${id}">${text}</div>`
const tool = id => `<div data-slot="tool-block" id="${id}"><button aria-expanded="false">Read</button><div>Native output</div></div>`
const footer = id => `<div data-slot="aui_msg-actions" id="${id}"><button>Copy</button></div>`
const root = (id, body, chrome = '') => `<div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="${id}"><div data-slot="aui_assistant-message-content">${body}</div>${chrome}</div>`
const pair = (id, body) => `<div data-slot="aui_turn-pair"><div data-role="user" data-message-id="${id}">Question</div><div data-slot="aui_response-group">${body}</div></div>`
const atom = initial => {
  let value = initial
  const listeners = new Set()
  return { get: () => value, set(next) { value = next; for (const fn of listeners) fn(next) }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) } }
}

async function fixture(body) {
  const dom = new JSDOM(`<html data-codex-chat-look="true"><head></head><body><section data-session-anchor="workspace">${pair('independent-user', body)}</section></body></html>`, { pretendToBeVisual: true, url: 'https://independent.invalid/#/stored' })
  const w = dom.window
  const host = { state: { activeSessionId: atom('runtime'), focusedSessionId: atom('runtime'), focusedStoredSessionId: atom('stored'), focusedSessionOwner: atom({ connectionId: 'local', profile: 'default' }), connectionId: atom('local'), profile: atom('default'), busy: atom(false), busyBySession: atom({ runtime: false }) }, onEvent: () => () => {} }
  const api = await loadPluginInternals(['reconcileTurnActivity', 'clearTurnActivityDecorations', 'installBehaviorRuntime', 'CSS'], { host, window: w, document: w.document, Node: w.Node, Element: w.Element, MutationObserver: w.MutationObserver, getComputedStyle: w.getComputedStyle.bind(w) })
  const style = w.document.createElement('style'); style.textContent = api.CSS; w.document.head.append(style)
  const f = { w, api, host, scope: 'independent-owner-a', p: w.document.querySelector('[data-slot="aui_turn-pair"]'), el: id => w.document.getElementById(id) }
  f.project = (evidence = null) => api.reconcileTurnActivity(f.p, '', null, f.scope, undefined, '', evidence)
  f.hidden = id => {
    const target = f.el(id); assert.ok(target, `native node #${id} must remain mounted`)
    for (let n = target; n; n = n.parentElement) {
      const style = w.getComputedStyle(n)
      if (style.display === 'none' || style.visibility === 'hidden' || n.hidden) return true
    }
    return false
  }
  f.expect = (id, hidden) => assert.equal(f.hidden(id), hidden, `#${id} must be ${hidden ? 'folded' : 'visible'}`)
  f.disclosure = () => {
    const button = f.p.querySelector(':scope > [data-codex-turn-activity]')
    assert.ok(button, 'existing Working/Worked disclosure must be available')
    assert.equal(button.disabled, false, 'earlier prose disclosure must be actionable')
    return button
  }
  f.install = () => {
    const tasks = new Map(); let serial = 0
    w.setTimeout = (fn, delay = 0) => { tasks.set(++serial, { fn, delay }); return serial }
    w.clearTimeout = id => tasks.delete(id)
    w.requestAnimationFrame = fn => w.setTimeout(fn, 16); w.cancelAnimationFrame = w.clearTimeout
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    const stop = api.installBehaviorRuntime()
    return { stop, tasks, async flush() {
      for (let i = 0; i < 80; i += 1) {
        await Promise.resolve()
        const entry = [...tasks].find(([, task]) => task.delay < 1000)
        if (!entry) return
        tasks.delete(entry[0]); entry[1].fn()
      }
      assert.fail('bounded fixture exceeded 80 scheduled callbacks')
    } }
  }
  return f
}
function scenario(name, body, fn) {
  test(name, { timeout: 10000, concurrency: false }, async () => {
    const f = await fixture(body)
    try { await fn(f) } finally { f.w.close() }
  })
}
const twoReplies = root('older', md('old', 'First legitimate reply')) + root('newer', md('latest', 'Second legitimate reply'))
const phases = [['working', { active: true, settled: false }], ['completed', { active: false, settled: true }], ['uncertain', null]]

for (const [phase, evidence] of phases) {
  for (const sameText of [false, true]) {
    scenario(`independent ${phase}: ${sameText ? 'equal' : 'different'} text folds by native reply order without tools or footers`, root('older', md('old', 'Native response')) + root('newer', md('latest', sameText ? 'Native response' : 'A different native response')), f => {
      f.project(evidence)
      f.expect('old', true); f.expect('latest', false)
      const disclosure = f.disclosure()
      assert.equal(disclosure.getAttribute('aria-expanded'), 'false')
      disclosure.click(); f.expect('old', false); f.expect('latest', false)
      assert.equal(disclosure.getAttribute('aria-expanded'), 'true')
      f.project(evidence); f.expect('old', false)
      disclosure.click(); f.expect('old', true); f.expect('latest', false)
    })
  }
}

scenario('independent streaming completion: only disclosure reveals earlier prose throughout phase changes', twoReplies, f => {
  const latestRoot = f.el('latest').closest('[data-role="assistant"]')
  latestRoot.dataset.streaming = 'true'; f.project()
  assert.equal(f.p.dataset.codexActivityPhase, 'working')
  f.expect('old', true); f.expect('latest', false)
  f.disclosure().click(); f.expect('old', false)
  latestRoot.removeAttribute('data-streaming'); latestRoot.insertAdjacentHTML('beforeend', footer('latest-footer'))
  f.project({ active: false, settled: true })
  f.expect('old', false); f.expect('latest', false)
  f.disclosure().click(); f.expect('old', true)
})

scenario('independent streaming completion keeps earlier prose folded without any disclosure click', twoReplies, f => {
  const latestRoot = f.el('latest').closest('[data-role="assistant"]')
  latestRoot.dataset.streaming = 'true'; f.project()
  f.expect('old', true); f.expect('latest', false)
  latestRoot.removeAttribute('data-streaming'); latestRoot.insertAdjacentHTML('beforeend', footer('latest-footer'))
  f.project({ active: false, settled: true })
  f.expect('old', true); f.expect('latest', false)
  f.disclosure().click(); f.expect('old', false)
})

scenario('independent live tool-only tail cannot remove the most recent prose reply', twoReplies + root('tail', tool('tail-tool')), f => {
  f.el('tail-tool').closest('[data-role="assistant"]').dataset.streaming = 'true'
  f.project()
  assert.equal(f.p.dataset.codexActivityPhase, 'working')
  f.expect('old', true); f.expect('latest', false); f.expect('tail-tool', false)
  f.disclosure().click(); f.expect('old', false); f.expect('latest', false)
})

scenario('independent background notice never displaces latest prose', twoReplies + '<div data-slot="aui_system-message-root"><div data-slot="aui_background-result" id="notice"><div data-conversation-scaffold><span class="truncate">Subagent Task Completed: result</span></div></div></div>', f => {
  f.project({ active: false, settled: true })
  f.expect('old', true); f.expect('latest', false)
  f.disclosure().click(); f.expect('old', false)
})

for (const [name, boundary] of [['tool', tool('boundary')], ['thought', '<div data-slot="aui_thinking-disclosure" id="boundary"><button>Reasoning</button></div>'], ['timestamp', '<div data-slot="timeline-timestamp" id="boundary"><time datetime="2026-01-01T00:00:00Z">12:00</time></div>']]) {
  scenario(`independent composite root: ${name} separates old prose from all terminal chunks`, root('composite', md('old') + boundary + md('latest-a') + md('latest-b')), f => {
    f.project({ active: false, settled: true })
    f.expect('old', true); f.expect('latest-a', false); f.expect('latest-b', false)
    f.disclosure().click(); f.expect('old', false)
  })
}

scenario('independent latest chunks around generated media remain visible together', root('older', md('old')) + root('composite', md('pre-tool') + tool('boundary') + md('latest-a') + '<div data-slot="aui_generated-image"><img id="image" alt="Native image"></div>' + md('latest-b') + '<audio id="audio" controls></audio>' + md('latest-c')), f => {
  f.project({ active: false, settled: true })
  for (const id of ['old', 'pre-tool']) f.expect(id, true)
  for (const id of ['latest-a', 'latest-b', 'latest-c', 'image', 'audio']) f.expect(id, false)
  f.disclosure().click(); f.expect('old', false); f.expect('pre-tool', false)
})

scenario('independent tool-only and empty trailing assistant roots cannot replace latest prose', twoReplies + root('tail-tool', tool('tail-tool')) + root('empty', md('empty-md', '   ')), f => {
  f.project({ active: false, settled: true })
  f.expect('old', true); f.expect('latest', false)
  f.disclosure().click(); f.expect('old', false)
})

scenario('independent latest terminal prose survives trailing tools in its own composite root', root('older', md('old')) + root('composite', tool('first-tool') + md('latest-a') + md('latest-b') + tool('tail-tool')), f => {
  f.project({ active: false, settled: true })
  f.expect('old', true); f.expect('latest-a', false); f.expect('latest-b', false)
})

scenario('independent links and sensitive native siblings stay usable while plain earlier prose folds', root('older', md('plain') + md('old', '<a id="link" href="https://example.invalid/">Reference</a>') + '<div data-slot="tool-approval-inline" id="approval"><button id="approve">Approve</button></div><input id="input" value="original"><div role="alert" id="alert">Warning</div><div class="text-destructive" id="error">Error</div><div data-slot="aui_generated-image"><img id="image" alt="result"></div>') + root('newer', md('latest')), f => {
  const native = f.el('approve'); const parent = native.parentNode; let clicks = 0
  native.onclick = () => { clicks += 1 }
  f.project()
  f.expect('plain', true); f.expect('old', false); f.expect('link', false); f.expect('latest', false)
  for (const id of ['approval', 'input', 'alert', 'error', 'image']) f.expect(id, false)
  f.el('input').value = 'edited'; native.click()
  assert.equal(clicks, 1); assert.equal(native.parentNode, parent); assert.equal(f.el('input').value, 'edited')
  f.disclosure().click(); f.expect('plain', false); f.expect('link', false)
  assert.equal(clicks, 1, 'skin disclosure must not click native approval')
})

for (const [name, markup] of [['input', '<input id="sensitive" value="keep">'], ['approval', '<div id="sensitive" data-slot="tool-approval-inline"><button>Approve</button></div>'], ['media', '<img id="sensitive" alt="keep">'], ['alert', '<div id="sensitive" role="alert">Keep visible</div>'], ['error', '<span id="sensitive" class="text-destructive">Failed</span>']]) {
  scenario(`independent ${name} inside earlier prose is never concealed`, root('older', md('protected-old', `Earlier response ${markup}`)) + root('newer', md('latest')), f => {
    f.project({ active: false, settled: true })
    f.expect('sensitive', false); f.expect('latest', false)
  })
}

scenario('independent previous native footers and durations fold with their prose and retain handlers', root('older', md('old'), footer('old-footer') + '<span data-slot="aui_turn-duration" id="old-duration">1 s</span><div data-slot="timeline-timestamp" id="old-time">12:00</div>') + root('newer', md('latest'), footer('latest-footer')), f => {
  const copy = f.el('old-footer').querySelector('button'); const parent = copy.parentNode; let clicks = 0
  copy.onclick = () => { clicks += 1 }
  f.project()
  for (const id of ['old', 'old-footer', 'old-duration', 'old-time']) f.expect(id, true)
  f.expect('latest-footer', false)
  f.disclosure().click()
  for (const id of ['old', 'old-footer', 'old-duration', 'old-time']) f.expect(id, false)
  assert.equal(clicks, 0); assert.equal(copy.parentNode, parent)
  copy.click(); assert.equal(clicks, 1)
})

scenario('independent complete removal of latest root immediately reveals old prose before reconciliation', twoReplies, f => {
  f.project(); f.expect('old', true)
  f.el('latest').closest('[data-role="assistant"]').remove()
  f.expect('old', false)
  f.project(); f.expect('old', false)
  assert.equal(f.p.querySelector('[data-codex-turn-activity]'), null)
})

scenario('independent removal of latest markdown node immediately reveals old prose', twoReplies, f => {
  f.project(); f.expect('old', true)
  f.el('latest').remove(); f.expect('old', false)
  f.project(); f.expect('old', false)
})

scenario('independent sensitive hydration inside folded prose fails open before reconciliation', twoReplies, f => {
  f.project(); f.expect('old', true)
  f.el('old').insertAdjacentHTML('beforeend', '<input id="hydrated-input" value="keep">')
  f.expect('hydrated-input', false)
  f.project(); f.expect('hydrated-input', false); f.expect('latest', false)
})

scenario('independent remount restores explicit expansion only for the same semantic owner', twoReplies + root('tool', tool('tool')), f => {
  f.project({ active: false, settled: true }); f.disclosure().click(); f.expect('old', false)
  const clone = f.p.cloneNode(true); f.api.clearTurnActivityDecorations(clone); f.p.replaceWith(clone); f.p = clone
  f.project({ active: false, settled: true }); f.expect('old', false)
  f.scope = 'independent-owner-b'; f.project({ active: false, settled: true }); f.expect('old', true)
  f.project({ quarantined: true }); f.expect('old', false); f.expect('latest', false)
  assert.equal(f.p.querySelector('[data-codex-turn-activity]'), null)
})

scenario('independent projection remains per native user turn', twoReplies, f => {
  f.p.insertAdjacentHTML('afterend', pair('second-user', root('other-old', md('other-old')) + root('other-new', md('other-latest'))))
  const first = f.p; const second = first.nextElementSibling
  f.project(); f.p = second; f.project()
  f.expect('old', true); f.expect('latest', false); f.expect('other-old', true); f.expect('other-latest', false)
  f.disclosure().click(); f.expect('other-old', false); f.expect('old', true)
})

scenario('independent cleanup restores every native node without reparenting or clicking', twoReplies + root('tool', tool('tool')), f => {
  const nodes = [...f.p.querySelectorAll('*')]; const parents = nodes.map(node => node.parentNode); const texts = nodes.map(node => node.textContent)
  let clicks = 0; f.el('tool').querySelector('button').onclick = () => { clicks += 1 }
  f.project({ active: false, settled: true }); f.expect('old', true)
  f.api.clearTurnActivityDecorations(f.p)
  f.expect('old', false); f.expect('latest', false); f.expect('tool', false)
  nodes.forEach((node, i) => { assert.equal(node.parentNode, parents[i]); assert.equal(node.textContent, texts[i]) })
  assert.equal(clicks, 0)
  assert.equal(f.p.querySelector('[data-codex-previous-reply], [data-codex-latest-reply], [data-codex-turn-activity]'), null)
})

scenario('independent legacy plain-text replies obey latest order', root('older', 'Older plain text') + root('newer', 'Latest plain text'), f => {
  const oldContent = f.p.querySelector('[data-message-id="older"] > [data-slot="aui_assistant-message-content"]'); oldContent.id = 'plain-old'
  const latestContent = f.p.querySelector('[data-message-id="newer"] > [data-slot="aui_assistant-message-content"]'); latestContent.id = 'plain-latest'
  f.project(); f.expect('plain-old', true); f.expect('plain-latest', false)
  f.disclosure().click(); f.expect('plain-old', false)
})

scenario('independent installed runtime projects appended replies and teardown restores prior prose', twoReplies, async f => {
  const runtime = f.install()
  try {
    await runtime.flush(); f.expect('old', true); f.expect('latest', false)
    f.el('latest').closest('[data-role="assistant"]').insertAdjacentHTML('afterend', root('newest', md('newest')))
    await runtime.flush(); f.expect('latest', true); f.expect('newest', false)
    f.host.state.busy.set(true)
    const stale = [...runtime.tasks.values()].map(task => task.fn)
    assert.ok(stale.length > 0, 'fixture must actually retain a queued callback')
    runtime.stop(); await runtime.flush()
    f.expect('old', false); f.expect('latest', false); f.expect('newest', false)
    assert.equal(f.p.querySelector('[data-codex-turn-activity]'), null)
    for (const callback of stale) callback()
    f.host.state.busy.set(false)
    await runtime.flush(); f.expect('old', false)
    assert.equal(f.p.querySelector('[data-codex-turn-activity]'), null)
  } finally { runtime.stop() }
})
