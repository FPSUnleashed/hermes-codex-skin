import { testDependencyRequire } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
const require = testDependencyRequire()
const {JSDOM} = require('jsdom')
const root = new URL('../', import.meta.url)
const runtimeSource = await readFile(process.env.CODEX_V9_SEQUENCE_SOURCE || new URL('src/tool-sequences.js', root), 'utf8')
const glyphSource = await readFile(new URL('src/tool-sequence-glyphs.js', root), 'utf8')
// Native-shaped ScaffoldRow / DisclosureRow; layout and browser AX are separate gates.
const labelClass = 'text-(--conversation-scaffold-text)'
const row = (id, label, running = false) => `<div id="${id}" data-slot="tool-block" data-tool-row data-conversation-scaffold><div><div class="group/disclosure-row"><button type="button" aria-expanded="false"><span><span><span class="grid place-items-center">${running ? '<span role="status"><i class="glyph-spinner"></i></span>' : '<i class="codicon codicon-terminal"></i>'}</span><span class="${labelClass}">${label}</span></span></span><span>caret</span></button><span data-slot="timeline-timestamp">23:59</span></div></div><pre data-private>PRIVATE OUTPUT</pre></div>`
const group = (id, label, body = '') => `<div id="${id}" data-slot="tool-block" data-tool-group><div data-tool-summary data-conversation-scaffold><div class="group/disclosure-row"><button type="button" aria-expanded="${!!body}"><span><span><span class="${labelClass} truncate">${label}</span></span></span><span>caret</span></button><span data-slot="timeline-timestamp">17s</span></div></div>${body ? `<div>${body}</div>` : ''}</div>`
function fixture(parts, live = false) {
  const dom = new JSDOM(`<section data-session-anchor="test"><div data-slot="aui_turn-pair"><div data-role="user" data-message-id="u"></div><div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="a" ${live ? 'data-streaming="true"' : ''}><div data-slot="aui_assistant-message-content">${parts}</div></div></div></section>`, {runScripts: 'outside-only'})
  const w = dom.window
  w.eval(`const TURN_ACTION_SELECTOR='[data-slot="tool-approval-inline"],[data-slot="clarify-inline"]'; const TURN_FAILURE_SELECTOR='.text-destructive'; ${glyphSource}\n${runtimeSource}\nwindow.scope='scope';window.generation=0;window.runtime=createToolSequenceRuntime(()=>window.scope,()=>window.generation)`)
  const pair = w.document.querySelector('[data-slot="aui_turn-pair"]')
  const reconcile = () => w.runtime.reconcile(pair, w.scope)
  const header = () => pair.querySelector('[data-codex-tool-sequence]')
  reconcile()
  return {w, pair, reconcile, header, close: () => dom.window.close()}
}
for (const [name, caption, next] of [
  ['en', 'Explored 4 files, ran 1 command', 'Updated file'],
  ['fr', 'Exploration de 4 fichiers, exécution de 1 commande', 'Fichier modifié']
]) test(`settled ${name}: opaque summary contributes exact facts, no inferred counts`, () => {
  const f = fixture(group('g', caption) + row('t', next))
  try {
    const b = f.header().querySelector('button')
    assert.equal(b.getAttribute('aria-label'), `${caption} · ${next}`)
    assert.equal(f.header().querySelector('[data-codex-tool-sequence-label]').textContent, b.getAttribute('aria-label'))
    assert.ok(!b.textContent.includes('PRIVATE'))
    assert.equal(f.w.document.querySelector('#g button').getAttribute('aria-expanded'), 'false')
  } finally { f.close() }
})
test('expanded group summary contributes once, never double-count mounted members', () => {
  const f = fixture(group('g', 'Ran 17 commands', row('nested', 'DO NOT ADD ME')) + row('e', 'Edited wiring.tsx'))
  try { assert.equal(f.header().querySelector('button').getAttribute('aria-label'), 'Ran 17 commands · Edited wiring.tsx') } finally { f.close() }
})
test('native single-tool runs without summaries retain their factual settled aggregate', () => {
  const single = (id, caption) => `<div data-slot="tool-block" data-tool-group><div>${row(id, caption)}</div></div>`
  const f = fixture(single('a', 'Read file') + single('b', 'Ran command'))
  try {
    assert.ok(f.header(), 'known native single-tool runs must remain grouped at settlement')
    assert.equal(f.header().querySelector('button').getAttribute('aria-label'), 'Read file · Ran command')
    assert.equal(f.pair.querySelectorAll('[data-tool-row]').length, 2)
  } finally { f.close() }
})
test('active caption/timer survive; settlement becomes factual aggregate', () => {
  const f = fixture(group('g', 'Explored 4 files') + row('t', 'Running tests', true), true)
  try {
    const native = f.w.document.getElementById('t'), parent = native.parentNode
    const timer = native.querySelector('[data-slot="timeline-timestamp"]')
    assert.equal(f.header().querySelector('button').getAttribute('aria-label'), 'Running tests')
    assert.ok(native.hasAttribute('data-codex-activity-native-current'))
    f.pair.querySelector('[data-role="assistant"]').removeAttribute('data-streaming')
    native.querySelector('[class*="conversation-scaffold-text"]').textContent = 'Ran tests'
    f.reconcile()
    assert.equal(f.header().querySelector('button').getAttribute('aria-label'), 'Explored 4 files · Ran tests')
    assert.ok(native.parentNode === parent && native.contains(timer))
  } finally { f.close() }
})
test('opaque terminal summary is factual, not an invented latest tool', () => {
  const f = fixture(row('t', 'Ran command', true) + group('g', 'Exploring 6 files'), true)
  try {
    assert.equal(f.header().querySelector('button').getAttribute('aria-label'), 'Ran command · Exploring 6 files')
    assert.ok(!f.header().hasAttribute('data-codex-activity-live'))
  } finally { f.close() }
})
test('unknown opaque unit stays native instead of generic collapse', () => {
  const f = fixture('<div id="g" data-slot="tool-block" data-tool-group><pre>PRIVATE OUTPUT</pre></div>' + row('t', 'Ran command'))
  try {
    assert.equal(f.header(), null)
    assert.equal(f.pair.querySelector('[data-codex-tool-sequence-item]'), null)
  } finally { f.close() }
})
test('native generic caption is not repeated by the aggregate', () => {
  const f = fixture(group('g', 'Tool activity') + row('t', 'Ran command'))
  try { assert.equal(f.header(), null) } finally { f.close() }
})
test('bounded verbatim distinct caption sample, no fabricated totals', () => {
  const f = fixture(Array.from({length: 100}, (_, i) => row(`t${i}`, `Ran check ${i}`)).join(''))
  try { assert.equal(f.header().querySelector('button').getAttribute('aria-label'), 'Ran check 0 · Ran check 1 · Ran check 2 · …') } finally { f.close() }
})
test('unchanged reconciliation mutates nothing; native handlers and parents survive', () => {
  const f = fixture(group('g', 'Read example.com') + row('t', 'Ran tests'))
  try {
    const nodes = [...f.pair.querySelectorAll('#g, #t, #g button, #t button')]
    const parents = nodes.map(n => n.parentNode)
    let clicks = 0
    nodes.find(n => n.tagName === 'BUTTON').onclick = () => clicks++
    const observer = new f.w.MutationObserver(() => {})
    observer.observe(f.pair, {subtree: true, childList: true, attributes: true, characterData: true})
    f.reconcile(); f.reconcile()
    assert.equal(observer.takeRecords().length, 0)
    f.header().querySelector('button').click()
    assert.equal(clicks, 1, 'explicit group expansion forwards only the native run-disclosure toggle')
    assert.equal(f.header().querySelector('button').getAttribute('aria-expanded'), 'true')
    nodes.find(n => n.tagName === 'BUTTON').click()
    assert.equal(clicks, 2)
    assert.ok(nodes.every((n, i) => n.isConnected && n.parentNode === parents[i]))
    observer.disconnect()
  } finally { f.close() }
})
test('prose separates historical aggregates; approvals stay fail-open', () => {
  const f = fixture(row('a', 'Read first') + row('b', 'Read second') + '<div class="aui-md">Assistant prose</div>' + row('c', 'Read third') + row('d', 'Read fourth'))
  try {
    assert.equal(f.pair.querySelectorAll('[data-codex-tool-sequence]').length, 2)
    assert.equal(f.header().querySelector('button').getAttribute('aria-label'), 'Read first · Read second')
    f.w.document.getElementById('d').insertAdjacentHTML('beforeend', '<div data-slot="tool-approval-inline">Approve</div>')
    f.reconcile()
    assert.equal(f.header(), null)
    assert.ok(f.pair.querySelector('.aui-md').textContent === 'Assistant prose')
  } finally { f.close() }
})
test('caption becomes invalid after collapse: restore native units and focus', () => {
  const f = fixture(group('g', 'Read 4 pages') + row('t', 'Running test'), true)
  try {
    const b = f.w.document.querySelector('#t button')
    assert.equal(b.getAttribute('tabindex'), '-1')
    f.w.document.querySelector('#g [class*="conversation-scaffold-text"]').innerHTML = '<code>PRIVATE</code>'
    f.pair.querySelector('[data-role="assistant"]').removeAttribute('data-streaming')
    f.reconcile()
    assert.equal(f.header(), null)
    assert.equal(b.getAttribute('tabindex'), null)
    assert.equal(f.pair.querySelector('[data-codex-tool-sequence-item]'), null)
  } finally { f.close() }
})
test('late generation click remains fenced; cleanup restores native UI', () => {
  const f = fixture(row('a', 'Read first') + row('b', 'Read second'))
  try {
    const saved = f.header().querySelector('button')
    f.w.generation++
    saved.click()
    assert.equal(saved.getAttribute('aria-expanded'), 'false')
    f.reconcile()
    assert.notEqual(f.header().querySelector('button'), saved)
    f.w.runtime.cleanup()
    assert.equal(f.header(), null)
    assert.equal(f.pair.querySelector('[data-codex-tool-sequence-item]'), null)
  } finally { f.close() }
})
