import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const modes = [['codex', 'Codex'], ['codex-wide', 'Codex +20 %'], ['codex-wider', 'Codex +40 %'], ['hermes', 'Hermes']]

async function settingFixture(store = new Map(), failRead = false) {
  const attributes = new Map(), writes = [], frames = [], disposers = [], contributions = []
  let decorationReads = 0
  const internals = await loadPluginInternals(['readComposerWidthMode', 'setComposerWidthMode', 'syncComposerWidthRoot'], {
    document: {
      documentElement: { setAttribute: (key, value) => attributes.set(key, value) },
      querySelector: () => { decorationReads++; return null }
    },
    window: { requestAnimationFrame: callback => frames.push(callback) }
  })
  internals.plugin.register({
    storage: {
      get: (key, fallback) => {
        if (failRead && key === 'composer-width') throw new Error('Unreadable store')
        return store.has(key) ? store.get(key) : fallback
      },
      set: (key, value) => { store.set(key, value); writes.push([key, value]) }
    },
    register: contribution => contributions.push(contribution),
    onDispose: callback => disposers.push(callback)
  })
  const setting = contributions.find(item => item.id === 'toggle-composer-width')
  assert.equal(setting.area, 'palette')
  assert.equal(setting.data.label, 'Codex Skin: Composer width')
  assert.equal(setting.data.keepOpen, true)
  assert.equal(setting.data.detailVariant, 'state')
  return {
    ...internals, setting: setting.data, attributes, writes,
    flush: () => { for (const callback of frames.splice(0)) callback(); return decorationReads },
    dispose: () => disposers.forEach(callback => callback())
  }
}

test('real VM palette cycles Codex -> Codex +20 % -> Codex +40 % -> Hermes -> Codex and reloads every saved choice', async () => {
  const store = new Map(), fixture = await settingFixture(store)
  try {
    assert.equal(fixture.setting.detail(), 'Codex')
    assert.equal(fixture.syncComposerWidthRoot(), 'codex')
    assert.equal(fixture.attributes.get('data-codex-composer-width'), 'codex')
    assert.deepEqual(fixture.writes, [], 'the default must not become a saved preference')
    for (const [mode, label] of [...modes.slice(1), modes[0]]) {
      fixture.setting.run()
      assert.equal(fixture.setting.detail(), label)
      assert.equal(store.get('composer-width'), mode)
      assert.equal(fixture.attributes.get('data-codex-composer-width'), mode)
      const reloaded = await settingFixture(store)
      try {
        assert.equal(reloaded.setting.detail(), label)
        assert.equal(reloaded.syncComposerWidthRoot(), mode)
        assert.deepEqual(reloaded.writes, [], 'loading preserves explicit preferences')
      } finally { reloaded.dispose() }
    }
    assert.deepEqual(fixture.writes, [['composer-width', 'codex-wide'], ['composer-width', 'codex-wider'], ['composer-width', 'hermes'], ['composer-width', 'codex']])
    assert.equal(fixture.flush(), 8, 'each setting change refreshes the real composer decorator')
  } finally { fixture.dispose() }
})

test('real VM preserves old codex/hermes and new intermediate preferences without migration writes', async () => {
  for (const [mode, label] of modes) {
    const store = new Map([['composer-width', mode]]), fixture = await settingFixture(store)
    try {
      assert.equal(fixture.setting.detail(), label)
      assert.equal(fixture.syncComposerWidthRoot(), mode)
      assert.equal(store.get('composer-width'), mode)
      assert.deepEqual(fixture.writes, [])
      fixture.setting.run()
      assert.equal(fixture.setting.detail(), modes[(modes.findIndex(entry => entry[0] === mode) + 1) % modes.length][1])
    } finally { fixture.dispose() }
  }
})

test('real VM defaults invalid or unreadable width preferences to Codex without overwriting them', async () => {
  for (const invalid of [null, '', 'unknown', '__proto__', 'constructor', {}, ['hermes'], ['codex-wide'], 0]) {
    const store = new Map([['composer-width', invalid]]), fixture = await settingFixture(store)
    try {
      assert.equal(fixture.setting.detail(), 'Codex')
      assert.equal(fixture.syncComposerWidthRoot(), 'codex')
      assert.equal(store.get('composer-width'), invalid)
      assert.deepEqual(fixture.writes, [])
      fixture.setComposerWidthMode(invalid)
      assert.deepEqual(fixture.writes, [['composer-width', 'codex']])
    } finally { fixture.dispose() }
  }
  const fixture = await settingFixture(new Map([['composer-width', 'hermes']]), true)
  try {
    assert.equal(fixture.setting.detail(), 'Codex')
    assert.equal(fixture.syncComposerWidthRoot(), 'codex')
    assert.deepEqual(fixture.writes, [])
  } finally { fixture.dispose() }
})

// Native styles.css dock/root/popout geometry, including its 5px peel-out
// margins. This is a real Chromium DOM/CSS seam, not native-window acceptance.
const nativeCSS = `
  * { box-sizing: border-box }
  :root { font-size: 16px; --composer-width: 100% }
  body { margin: 0 }
  #pane { position: relative; width: 100%; height: 500px }
  [data-slot='aui_thread-content'] { width: 100%; max-width: var(--composer-width); padding-inline: 1.5rem; margin-inline: auto }
  [data-slot='composer-dock'] { position: absolute; left: 50%; transform: translateX(-50%); width: calc(min(var(--composer-width), calc(100% - 2rem)) + 10px); max-width: 100% }
  [data-slot='composer-root'] { width: 100%; padding-inline: 5px }
  [data-slot='composer-dock'][data-popped-out] { width: var(--composer-popout-width, 24rem); max-width: calc(100vw - 1.5rem) }
  [data-slot='composer-root'][data-popped-out] { padding: 5px }
  #popout { top: 200px }
`

const metrics = `(() => {
  const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return {width:r.width,left:r.left,right:r.right} }
  return {mode:document.documentElement.getAttribute('data-codex-composer-width'), variable:getComputedStyle(document.documentElement).getPropertyValue('--composer-width').trim(), dock:rect('dock'), surface:rect('surface'), column:rect('column'), popout:rect('popout'), popoutSurface:rect('popout-surface'), overflow:document.documentElement.scrollWidth > innerWidth}
})()`

function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 1 / 64, `${message}: expected ${expected}, got ${actual}`)
}

test('Chromium computes 736 / 883.2 / 1030.4 CSS px, constrains narrow panes and preserves native Hermes/popout geometry', { timeout: 30000 }, async t => {
  const { CSS } = await loadPluginInternals(['CSS'])
  const source = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
    .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__widthPlugin = {')
  const browser = await chromium()
  try {
    await browser.call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 700, deviceScaleFactor: 2, mobile: false })
    const html = `<!doctype html><html><head><style>${nativeCSS}</style><style>${CSS}</style></head><body><main id="pane"><div id="column" data-slot="aui_thread-content">Conversation</div><div id="dock" data-slot="composer-dock"><div data-slot="composer-root"><div id="surface" data-slot="composer-surface"></div></div></div><div id="popout" data-slot="composer-dock" data-popped-out style="--composer-popout-width:24rem"><div data-slot="composer-root" data-popped-out><div id="popout-surface" data-slot="composer-surface"></div></div></div></main></body></html>`
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
    await browser.evaluate(`(() => { ${source}; const saved = new Map(); pluginStorage = {get:(key,fallback)=>saved.has(key)?saved.get(key):fallback,set:(key,value)=>saved.set(key,value)}; window.widthMode = setComposerWidthMode })()`)
    for (const width of [1400, 1200, 1100, 900, 600, 320]) {
      await browser.call('Emulation.setDeviceMetricsOverride', { width, height: 700, deviceScaleFactor: 2, mobile: false })
      await browser.evaluate("document.documentElement.removeAttribute('data-codex-chat-look')")
      const native = await browser.evaluate(metrics)
      await browser.evaluate("document.documentElement.setAttribute('data-codex-chat-look', 'true')")
      for (const [mode, requested] of [['codex', 736], ['codex-wide', 883.2], ['codex-wider', 1030.4], ['hermes', null], ['codex', 736]]) {
        await browser.evaluate(`widthMode(${JSON.stringify(mode)}); new Promise(resolve => requestAnimationFrame(resolve))`)
        const state = await browser.evaluate(metrics)
        assert.equal(state.overflow, false, `${mode} must not overflow at ${width}px`)
        assert.deepEqual(state.popout, native.popout, 'floating dock retains native width and position')
        assert.deepEqual(state.popoutSurface, native.popoutSurface, 'floating surface retains native geometry')
        if (requested === null) {
          assert.equal(state.variable, '100%')
          assert.deepEqual(state.dock, native.dock)
          assert.deepEqual(state.surface, native.surface)
          assert.deepEqual(state.column, native.column)
        } else {
          closeTo(state.surface.width, Math.min(requested, width - 32), `${mode} surface at ${width}px`)
          assert.equal(state.variable, `${requested}px`, 'the configured CSS limit is exact')
          closeTo(state.dock.width, state.surface.width + 10, '5px peel-out margins are preserved')
          closeTo(state.column.width, Math.min(requested, width), 'conversation shares the width limit')
          closeTo(state.surface.left, (width - state.surface.width) / 2, 'surface remains centered')
          assert.ok(state.surface.left >= 16, 'minimum 16px visible gutter')
        }
        assert.equal(state.mode, mode)
        if (width === 1200) t.diagnostic(JSON.stringify({mode, limit:state.variable, surface:state.surface.width, dock:state.dock.width, column:state.column.width, popout:state.popout.width}))
      }
      await browser.evaluate("document.documentElement.removeAttribute('data-codex-chat-look'); document.documentElement.removeAttribute('data-codex-composer-width')")
      assert.deepEqual(await browser.evaluate(metrics), native, 'disabling restores native geometry')
    }
  } finally { browser.close() }
})
