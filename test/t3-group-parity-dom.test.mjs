import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {testDependencyRequire} from './helpers/reference-paths.mjs'
const {JSDOM} = testDependencyRequire()('jsdom')
const base = new URL('../', import.meta.url)
const source = await readFile(process.env.T3_GROUP_SEQUENCE_SOURCE || new URL('src/tool-sequences.js', base), 'utf8')
const glyphs = await readFile(new URL('src/tool-sequence-glyphs.js', base), 'utf8')
const textClass = 'text-(--conversation-scaffold-text)'
const row = (id, label = 'Ran command', running = false) => `<div id="${id}" data-slot="tool-block" data-tool-row data-conversation-scaffold><div><div class="group/disclosure-row"><button type="button" aria-expanded="false"><span><span><span class="grid place-items-center">${running ? '<span role="status"><i class="glyph-spinner"></i></span>' : '<i class="codicon codicon-terminal"></i>'}</span><span class="${textClass}">${label}</span></span></span><span>caret</span></button><span data-slot="timeline-timestamp">23:59</span></div></div></div>`
const thought = (id, label = 'Thought') => `<div id="${id}" data-slot="aui_thinking-disclosure" data-conversation-scaffold><div class="group/disclosure-row"><button type="button" aria-expanded="false"><span><span><span class="${textClass}">${label}</span></span></span><span>caret</span></button><span>23:59</span></div></div>`
const group = (id, label, children = '') => `<div id="${id}" data-slot="tool-block" data-tool-group><div data-tool-summary><div class="group/disclosure-row"><button type="button" aria-expanded="${!!children}"><span><span><span class="${textClass}">${label}</span></span></span><span>caret</span></button><span>23:59</span></div></div>${children ? `<div>${children}</div>` : ''}</div>`
const scope = (session = 'session', profile = 'default') => JSON.stringify(['connection', ['connection', profile], profile, session, `stored-${session}`, session, `stored-${session}`])
const assistant = (id, parts, live = false) => `<div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="${id}" ${live ? 'data-streaming="true"' : ''}><div data-slot="aui_assistant-message-content">${parts}</div></div>`
function fixture(parts, options = {}) {
  const dom = new JSDOM(`<section data-session-anchor="workspace"><div data-slot="aui_turn-pair"><div data-role="user" data-message-id="u"></div>${assistant('a', parts, options.live)}</div></section>`, {runScripts: 'outside-only'})
  const w = dom.window
  w.eval(`const TURN_ACTION_SELECTOR='[data-slot="tool-approval-inline"],[data-slot="clarify-inline"],[data-slot="mcp-setup-inline"]';const TURN_FAILURE_SELECTOR='.text-destructive,[class~="text-amber-700"]';${glyphs}\n${source}\nwindow.scope=${JSON.stringify(options.scope ?? scope())};window.gen=0;window.runtime=createToolSequenceRuntime(()=>scope,()=>gen)`)
  const pair = w.document.querySelector('[data-slot="aui_turn-pair"]')
  const sync = () => w.runtime.reconcile(pair, w.scope)
  const headers = () => [...pair.querySelectorAll('[data-codex-tool-sequence] button')]
  const remount = (parts, id = 'a') => { pair.querySelector('[data-role="assistant"]').outerHTML = assistant(id, parts); sync() }
  sync()
  return {w, pair, sync, headers, remount, close: () => dom.window.close()}
}
const expanded = button => button.getAttribute('aria-expanded')
test('completed mixed summaries omit native reasoning, not tools or their opaque facts', () => {
  const f = fixture(thought('r', 'Réflexion pendant 7 s') + group('g', 'Exploration de 17 fichiers') + row('t', 'Commande exécutée'))
  try {
    assert.equal(f.headers()[0].getAttribute('aria-label'), 'Exploration de 17 fichiers · Commande exécutée')
    f.headers()[0].click()
    assert.equal(f.w.document.getElementById('r').hasAttribute('data-codex-tool-sequence-item'), false)
    assert.equal(f.w.document.querySelector('#r button').getAttribute('aria-expanded'), 'false')
    assert.equal(f.w.document.querySelector('#g button').getAttribute('aria-expanded'), 'false')
  } finally { f.close() }
})
test('whole execution message restores explicit open and closed choices after full native remount', () => {
  const parts = thought('r') + row('t')
  const f = fixture(parts)
  try {
    const old = f.headers()[0]
    old.click()
    f.remount(parts)
    assert.notEqual(f.headers()[0], old)
    assert.equal(expanded(f.headers()[0]), 'true')
    f.headers()[0].click()
    f.remount(parts)
    assert.equal(expanded(f.headers()[0]), 'false')
    old.click()
    assert.equal(expanded(f.headers()[0]), 'false')
  } finally { f.close() }
})
test('memory survives pair removal/pruning but stays bounded to 100 explicit choices', () => {
  const parts = thought('r') + row('t')
  const f = fixture(parts)
  try {
    f.headers()[0].click()
    const parent = f.pair.parentNode
    f.pair.remove(); f.w.runtime.pruneDisconnected(); parent.append(f.pair)
    f.remount(parts)
    assert.equal(expanded(f.headers()[0]), 'true')
    for (let i = 0; i < 100; i++) { f.remount(parts, `a-${i}`); f.headers()[0].click() }
    f.remount(parts)
    assert.equal(expanded(f.headers()[0]), 'false', 'oldest explicit choice must be evicted')
    f.remount(parts, 'a-99')
    assert.equal(expanded(f.headers()[0]), 'true')
  } finally { f.close() }
})
for (const boundary of ['session', 'profile', 'incarnation', 'incomplete', 'missing-anchor', 'provisional', 'cleanup']) test(`remount memory cannot cross ${boundary} ownership`, () => {
  const parts = thought('r') + row('t')
  const f = fixture(parts, boundary === 'incomplete' ? {scope: 'unqualified'} : {})
  try {
    if (boundary === 'missing-anchor') { f.pair.closest('section').setAttribute('data-slot', 'aui_thread-content'); f.pair.closest('section').removeAttribute('data-session-anchor') }
    if (boundary === 'provisional') f.pair.querySelector('[data-role="user"]').setAttribute('data-message-id', 'user-inflight-1')
    f.sync(); f.headers()[0]?.click()
    if (boundary === 'session') f.w.scope = scope('other')
    if (boundary === 'profile') f.w.scope = scope('session', 'other')
    if (boundary === 'incarnation') f.w.gen++
    if (boundary === 'cleanup') { f.w.runtime.cleanup(); f.w.eval('window.runtime=createToolSequenceRuntime(()=>scope,()=>gen)') }
    f.remount(parts)
    assert.equal(expanded(f.headers()[0]), 'false')
  } finally { f.close() }
})
test('ambiguous multi-group messages do not borrow ordinal or caption identity after remount', () => {
  const parts = row('a') + row('b') + '<div class="aui-md">Prose boundary</div>' + row('c') + row('d')
  const f = fixture(parts)
  try {
    assert.equal(f.headers().length, 2)
    f.headers()[0].click()
    f.remount(parts)
    assert.deepEqual(f.headers().map(expanded), ['false', 'false'])
  } finally { f.close() }
})
for (const kind of ['clarification', 'failure']) test(`proven direct ${kind} boundary preserves unrelated groups and native controls`, () => {
  const barrier = kind === 'clarification' ? '<div data-slot="clarify-inline"><button id="approve">Answer</button></div>' : row('failed', '<span class="text-destructive">Failed</span>')
  const f = fixture(row('a', 'Read A') + row('b', 'Read B') + barrier + row('c', 'Read C') + row('d', 'Read D'))
  try {
    assert.equal(f.headers().length, 2)
    assert.deepEqual(f.headers().map(b => b.getAttribute('aria-label')), ['Read A · Read B', 'Read C · Read D'])
    const control = f.w.document.querySelector(kind === 'clarification' ? '#approve' : '#failed button')
    assert.equal(control.closest('[data-codex-tool-sequence-item]'), null)
    assert.equal(control.getAttribute('tabindex'), null)
    f.headers()[0].click()
    assert.equal(expanded(f.headers()[0]), 'true')
    const observer = new f.w.MutationObserver(() => {})
    observer.observe(f.pair, {subtree: true, childList: true, attributes: true, characterData: true})
    f.sync(); f.sync()
    assert.equal(observer.takeRecords().length, 0)
    observer.disconnect()
    f.w.runtime.cleanup()
    assert.equal(f.pair.querySelector('[data-codex-tool-sequence-item]'), null)
    assert.equal(f.pair.hasAttribute('data-codex-tool-sequence-local-safe'), false)
  } finally { f.close() }
})

for (const beforeObserver of [false, true]) test(`reused secondary message identity cannot inherit disclosure, ${beforeObserver ? 'before' : 'after'} observer delivery`, () => {
  const f = fixture('<div class="aui-md">First assistant prose</div>')
  try {
    f.pair.insertAdjacentHTML('beforeend', assistant('secondary', row('one') + row('two')))
    f.sync()
    const saved = f.headers()[0]
    saved.click()
    assert.equal(expanded(saved), 'true')
    const second = f.w.document.getElementById('one').closest('[data-role="assistant"]')
    second.dataset.messageId = 'replacement-native-message'
    if (beforeObserver) saved.click()
    else f.sync()
    assert.notEqual(f.headers()[0], saved)
    assert.equal(expanded(f.headers()[0]), 'false')
    assert.equal(saved.isConnected, false)
    second.dataset.messageId = 'secondary'
    f.sync()
    assert.equal(expanded(f.headers()[0]), 'true', 'the original unique identity retains its own choice')
  } finally { f.close() }
})
for (const barrier of ['<div><div data-slot="tool-approval-inline"><button>Approve</button></div></div>', '<div role="alert">Global failure</div>', '<div data-slot="aui_assistant-message-stopped">Stopped</div>']) test(`unknown or global guard remains pair-wide: ${barrier}`, () => {
  const f = fixture(row('a') + row('b') + barrier + row('c') + row('d'))
  try { assert.equal(f.headers().length, 0); assert.equal(f.pair.querySelector('[data-codex-tool-sequence-item]'), null) } finally { f.close() }
})
test('late inserted approval in a formerly folded tool restores focus before any toggle', () => {
  const f = fixture(row('a') + row('b', 'Running tests', true), {live: true})
  try {
    const saved = f.headers()[0]
    assert.equal(f.w.document.querySelector('#b button').getAttribute('tabindex'), '-1')
    f.w.document.getElementById('b').insertAdjacentHTML('beforeend', '<div data-slot="tool-approval-inline"><button id="approve">Approve</button></div>')
    saved.click()
    assert.equal(f.headers().length, 0)
    assert.equal(f.w.document.querySelector('#b button').getAttribute('tabindex'), null)
    assert.equal(f.w.document.getElementById('approve').getAttribute('tabindex'), null)
  } finally { f.close() }
})
test('opaque native inventories never become mounted totals, reasoning blocks never claim part counts', () => {
  const f = fixture(group('g', 'Read 17 files', row('nested', 'Read file')) + row('t', 'Read file'))
  try {
    assert.equal(f.headers()[0].getAttribute('aria-label'), 'Read 17 files · Read file')
    f.remount(thought('r1', 'Thought') + thought('r2', 'Thought'))
    assert.equal(f.headers()[0].getAttribute('aria-label'), 'Thought')
    assert.ok(!f.headers()[0].textContent.includes('×'))
  } finally { f.close() }
})
test('live single-line current activity and timer survive mixed thought settlement and remount', () => {
  const parts = thought('r') + row('t', 'Running tests', true)
  const f = fixture(parts, {live: true})
  try {
    const native = f.w.document.getElementById('t'), parent = native.parentNode, timer = native.querySelector('[data-slot="timeline-timestamp"]')
    assert.equal(f.headers()[0].getAttribute('aria-label'), 'Running tests')
    assert.equal(native.getAttribute('data-codex-activity-native-current'), '')
    f.headers()[0].click(); f.sync()
    assert.equal(native.parentNode, parent); assert.ok(native.contains(timer))
    f.pair.querySelector('[data-role="assistant"]').removeAttribute('data-streaming'); f.sync()
    assert.equal(f.headers()[0].getAttribute('aria-label'), 'Running tests')
    assert.equal(expanded(f.headers()[0]), 'true')
  } finally { f.close() }
})
test('memory follows a unique native message, not its label, duration or mounted inventory', () => {
  const f = fixture(thought('r', 'Thought for 7s') + row('t', 'Read first'))
  try {
    f.headers()[0].click()
    f.remount(thought('r', 'Réflexion pendant 9 s') + group('g', 'Exploration de 99 fichiers') + row('t', 'Nouvelle commande'))
    assert.equal(expanded(f.headers()[0]), 'true')
    assert.equal(f.headers()[0].getAttribute('aria-label'), 'Exploration de 99 fichiers · Nouvelle commande')
    assert.equal(f.w.document.querySelector('#g button').getAttribute('aria-expanded'), 'false')
  } finally { f.close() }
})
test('disabled or absent native reasoning never creates synthetic reasoning content', () => {
  const f = fixture(thought('r') + row('t'))
  try {
    f.remount(row('a', 'Read file') + row('b', 'Ran command'))
    assert.equal(f.pair.querySelector('[data-slot="aui_thinking-disclosure"]'), null)
    assert.equal(f.headers()[0].getAttribute('aria-label'), 'Read file · Ran command')
    f.headers()[0].click()
    assert.ok(!f.pair.textContent.includes('Thought'))
  } finally { f.close() }
})
test('local native failure inserted before observer delivery never hides its actionable row', () => {
  const f = fixture(row('a', 'Read A') + row('b', 'Read B') + row('c', 'Read C'))
  try {
    const saved = f.headers()[0]
    f.w.document.querySelector('#b [class*="conversation-scaffold-text"]').insertAdjacentHTML('beforeend', '<span class="text-destructive">Failed</span>')
    saved.click()
    assert.equal(f.w.document.getElementById('b').hasAttribute('data-codex-tool-sequence-item'), false)
    assert.equal(f.w.document.querySelector('#b button').getAttribute('tabindex'), null)
    assert.equal(f.headers().length, 0, 'two safe singleton segments do not invent an aggregate')
  } finally { f.close() }
})
test('cleanup before hot-reload adoption removes even a marker-only local pair', () => {
  const f = fixture('<div data-slot="clarify-inline"><button>Answer</button></div>')
  try {
    assert.equal(f.pair.hasAttribute('data-codex-tool-sequence-local-safe'), true)
    f.w.runtime.deactivate()
    f.w.eval('window.fresh=createToolSequenceRuntime(()=>scope,()=>gen)')
    f.w.fresh.cleanup()
    assert.equal(f.pair.hasAttribute('data-codex-tool-sequence-local-safe'), false)
    assert.equal(f.pair.querySelector('button').getAttribute('tabindex'), null)
  } finally { f.close() }
})
