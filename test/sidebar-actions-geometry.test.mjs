import assert from 'node:assert/strict'
import test from 'node:test'
import { testDependencyRequire } from './helpers/reference-paths.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const { JSDOM } = testDependencyRequire()('jsdom')

// Execute the shipping runtime on a real DOM. JSDOM does NOT render layout:
// rectangles, offsetParent, borders, scroll and ResizeObserver delivery below
// are deterministic geometry seams, not native/browser rendering evidence.
async function fixture({ rootDirection = 'ltr', rowDirection, scale = 1, scrollLeft = 0, scrollTop = 0, border = 0, size = 28, styled = true } = {}) {
  const dom = new JSDOM(`<!doctype html><html dir="${rootDirection}" data-codex-chat-look="true"><head><style>.rtl-row{direction:rtl}</style></head><body><main><aside data-tour="sessions-sidebar"><div data-slot="sidebar-content"><div data-slot="sidebar-menu-item" style="position:relative"><button data-sidebar="menu-button" data-slot="context-menu-trigger" aria-label="New session" style="color: red;"><span data-tour="sidebar-nav-new-session">New session</span><kbd>⌘N</kbd></button></div><div class="search-row" style="column-gap: 4px;"><div><svg></svg><input placeholder="Search sessions"></div></div><div data-sessions-mode="flat"></div></div></aside></main></body></html>`)
  const w = dom.window, d = w.document
  const sidebar = d.querySelector('aside'), row = d.querySelector('.search-row'), field = row.firstElementChild
  const input = field.querySelector('input'), button = sidebar.querySelector('button'), parent = button.parentElement
  if (rowDirection) row.dir = rowDirection
  if (!styled) button.removeAttribute('style')
  // JSDOM does not resolve the gap shorthand/rem to pixel columnGap. The row's
  // explicit 4px longhand above is part of the deterministic geometry input.
  const original = sidebar.innerHTML, calls = [], frames = new Map(), observers = new Set()
  let nextFrame = 0, measures = 0
  const geometry = { scale, scrollLeft, scrollTop, border, size, width: 28, rowX: 20, rowWidth: 220, top: 78 }
  const rect = (x, y, width, height) => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height })
  const viewport = (x, y, width, height) => rect(40 + (x + geometry.border - geometry.scrollLeft) * geometry.scale, 70 + (y + geometry.border - geometry.scrollTop) * geometry.scale, width * geometry.scale, height * geometry.scale)
  Object.defineProperties(parent, {
    offsetWidth: { get: () => 300 },
    clientLeft: { get: () => geometry.border }, clientTop: { get: () => geometry.border },
    scrollLeft: { get: () => geometry.scrollLeft }, scrollTop: { get: () => geometry.scrollTop }
  })
  Object.defineProperty(button, 'offsetParent', { get: () => parent })
  parent.getBoundingClientRect = () => { measures++; return rect(40, 70, 300 * geometry.scale, 120 * geometry.scale) }
  field.getBoundingClientRect = () => {
    measures++
    const rtl = w.getComputedStyle(row).direction === 'rtl'
    return viewport(geometry.rowX + (rtl ? 32 : 0), geometry.top, geometry.rowWidth - 32, 32)
  }
  button.getBoundingClientRect = () => {
    measures++
    return viewport(parseFloat(button.style.getPropertyValue('--codex-t3-new-left')) || 0, parseFloat(button.style.getPropertyValue('--codex-t3-new-top')) || 0, geometry.width, geometry.size)
  }
  class ResizeObserver {
    targets = new Set()
    constructor(callback) { this.callback = callback; observers.add(this) }
    observe(target) { this.targets.add(target) }
    unobserve(target) { this.targets.delete(target) }
    disconnect() { this.targets.clear(); observers.delete(this) }
  }
  for (const type of ['click', 'pointerdown', 'contextmenu']) button.addEventListener(type, e => calls.push({ type, target: e.currentTarget, owner: button.dataset.owner }))
  input.addEventListener('input', e => calls.push({ type: 'input', target: e.currentTarget, value: input.value }))
  const { T3_SIDEBAR_ACTIONS_CSS, installT3SidebarActions } = await loadPluginInternals(['T3_SIDEBAR_ACTIONS_CSS', 'installT3SidebarActions'], {
    window: w, document: d, getComputedStyle: w.getComputedStyle.bind(w), MutationObserver: w.MutationObserver, ResizeObserver,
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: id => frames.delete(id)
  })
  const style = d.createElement('style'); style.textContent = T3_SIDEBAR_ACTIONS_CSS; d.head.append(style)
  const install = () => installT3SidebarActions()
  let stop = install()
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve()
      const pending = [...frames.values()]; frames.clear()
      for (const callback of pending) callback()
    }
    assert.equal(frames.size, 0, 'runtime settles without an observer feedback loop')
  }
  const aligned = () => {
    const rtl = w.getComputedStyle(row).direction === 'rtl'
    const expected = { left: geometry.rowX + (rtl ? 0 : geometry.rowWidth - 28), top: geometry.top + (32 - geometry.size) / 2 }
    // The non-square case checks that RTL uses width, not height.
    if (rtl) expected.left += 28 - geometry.width
    const actual = Object.fromEntries(['left', 'top'].map(key => [key, parseFloat(button.style.getPropertyValue(`--codex-t3-new-${key}`))]))
    assert.deepEqual(actual, expected, JSON.stringify({ direction: w.getComputedStyle(row).direction, rootDirection: d.documentElement.dir, parent: parent.dataset.slot, geometry, actual, expected }))
    assert.equal(button.offsetParent, parent, 'native positioned item, not assumed sidebar, is the coordinate owner')
    assert.equal(sidebar.querySelector('button'), button)
    assert.equal(button.parentElement, parent)
  }
  return { w, d, sidebar, row, field, input, button, parent, geometry, original, calls, frames, observers, aligned, settle,
    resize: () => { for (const observer of observers) observer.callback([...observer.targets].map(target => ({ target }))) },
    get measures() { return measures },
    stop: () => stop(), restart: () => { stop = install() }, close: () => { stop(); w.close() } }
}

test('shipping runtime geometry seam: row direction wins over root, LTR and RTL with scaled bordered/scrolled offsetParent', async t => {
  for (const [rootDirection, rowDirection] of [['ltr', undefined], ['rtl', undefined], ['rtl', 'ltr'], ['ltr', 'rtl']]) {
    await t.test(`root=${rootDirection}, row=${rowDirection || 'inherited'}`, async () => {
      const f = await fixture({ rootDirection, rowDirection, scale: 1.25, scrollLeft: rootDirection === 'rtl' ? -17 : 17, scrollTop: 23, border: 3 })
      try { await f.settle(); f.aligned() } finally { f.close() }
    })
  }
})

test('shipping runtime geometry seam: live dir/style/class changes on row, root and ancestors do not require resize', async () => {
  const f = await fixture()
  try {
    await f.settle(); f.aligned()
    f.d.documentElement.dir = 'rtl'; await f.settle(); f.aligned()
    f.row.dir = 'ltr'; await f.settle(); f.aligned()
    f.row.removeAttribute('dir'); await f.settle(); f.aligned()
    f.d.documentElement.dir = 'ltr'; await f.settle(); f.aligned()
    f.d.querySelector('main').dir = 'rtl'; await f.settle(); f.aligned()
    f.row.style.direction = 'ltr'; await f.settle(); f.aligned()
    f.row.style.removeProperty('direction'); await f.settle(); f.aligned()
    f.d.querySelector('main').removeAttribute('dir'); await f.settle(); f.aligned()
    f.row.classList.add('rtl-row'); await f.settle(); f.aligned()
    f.row.classList.remove('rtl-row'); await f.settle(); f.aligned()
    f.d.documentElement.style.direction = 'rtl'; await f.settle(); f.aligned()
    f.d.documentElement.style.removeProperty('direction'); await f.settle(); f.aligned()
  } finally { f.close() }
})

test('shipping runtime geometry seam: RTL/LTR resize, zoom, negative scroll, borders, native targets and reversible unload', async () => {
  for (const direction of ['ltr', 'rtl']) {
    const f = await fixture({ rootDirection: direction, scale: 2, border: 5, scrollLeft: -31, scrollTop: 19, styled: direction === 'ltr' })
    try {
      await f.settle(); f.aligned()
      for (const scale of [.8, 1.5, 2.25]) {
        Object.assign(f.geometry, { scale, rowWidth: 180, rowX: 30, scrollLeft: direction === 'rtl' ? -12 : 12 })
        f.resize(); await f.settle(); f.aligned()
      }
      f.geometry.rowWidth = 240; f.w.dispatchEvent(new f.w.Event('resize')); await f.settle(); f.aligned()
      f.geometry.width = 24; f.resize(); await f.settle(); f.aligned()
      f.button.dataset.owner = 'B'
      for (const type of ['pointerdown', 'click', 'contextmenu']) f.button.dispatchEvent(new f.w.Event(type, { bubbles: true }))
      assert.deepEqual(f.calls.map(({ type, target, owner }) => [type, target === f.button, owner]), [['pointerdown', true, 'B'], ['click', true, 'B'], ['contextmenu', true, 'B']])
      f.input.value = 'needle'; f.input.dispatchEvent(new f.w.Event('input', { bubbles: true }))
      assert.equal(f.calls.at(-1).target, f.input); assert.equal(f.calls.at(-1).value, 'needle')
      delete f.button.dataset.owner
      f.d.documentElement.dataset.codexChatLook = 'false'; await f.settle()
      assert.equal(f.sidebar.innerHTML, f.original)
      f.d.documentElement.dataset.codexChatLook = 'true'; await f.settle(); f.aligned()
      f.w.dispatchEvent(new f.w.Event('resize')); assert.ok(f.frames.size > 0)
      f.stop(); await f.settle()
      assert.equal(f.observers.size, 0); assert.equal(f.sidebar.innerHTML, f.original)
      const count = f.measures
      f.d.documentElement.dir = direction === 'rtl' ? 'ltr' : 'rtl'
      f.row.style.direction = 'rtl'; f.w.dispatchEvent(new f.w.Event('resize')); await f.settle()
      assert.equal(f.measures, count, 'no layout work after unload')
      f.row.style.removeProperty('direction')
      f.restart(); await f.settle(); f.aligned()
      f.stop(); assert.equal(f.sidebar.innerHTML, f.original)
    } finally { f.close() }
  }
})

test('shipping runtime geometry seam: new direction observation ignores transcript and action style churn', async () => {
  const f = await fixture()
  try {
    await f.settle()
    const transcript = f.d.createElement('article'); f.d.body.append(transcript); await f.settle()
    const count = f.measures
    transcript.dir = 'rtl'; transcript.className = 'rtl-row'; transcript.style.direction = 'rtl'
    transcript.append(f.d.createElement('span'))
    f.button.style.color = 'blue'
    await f.settle()
    assert.equal(f.measures, count, 'unrelated attributes and owned button variable writes cannot trigger layout work')
    f.sidebar.remove(); await f.settle()
    assert.equal(f.sidebar.querySelectorAll('[data-codex-t3-new-session],[data-codex-t3-search-row],[data-codex-t3-search-field],[data-codex-t3-new-item]').length, 0)
    assert.equal([...f.observers].reduce((sum, observer) => sum + observer.targets.size, 0), 0)
    assert.equal(f.input.placeholder, 'Search sessions')
    assert.equal(f.button.style.color, 'blue', 'native style changes survive cleanup')
    assert.equal(f.button.getAttribute('aria-label'), 'New session')
  } finally { f.close() }
})
