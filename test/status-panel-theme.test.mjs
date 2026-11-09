import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { nativeStatusFixture } from './helpers/status-theme-fixture.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const { CSS, T3_PAINT_ROLE_MAP } = await loadPluginInternals(['CSS', 'T3_PAINT_ROLE_MAP'])

test('status panel shares the effective skin composer endpoint, not the native sibling-local fill', () => {
  assert.match(CSS, /--codex-composer-fill:\s*var\(--codex-color-card\)/)
  assert.match(CSS, /--codex-status-base:\s*color-mix\(\s*in srgb,\s*var\(--codex-composer-fill\) 50%,\s*var\(--codex-color-chat\)\s*\)/)
  assert.match(CSS, /--codex-color-status-panel:\s*oklch\(from var\(--codex-status-base\)/)
  assert.equal([...CSS.matchAll(/--codex-color-status-panel\s*:/g)].length, 1)
  const composer = CSS.slice(CSS.indexOf("html[data-codex-chat-look='true'] [data-slot='composer-surface'] {"))
  assert.match(composer.slice(0, composer.indexOf('\n}')), /background: var\(--codex-composer-fill\) !important/)
  const frame = CSS.slice(CSS.indexOf("html[data-codex-chat-look='true'] [data-slot='composer-status-stack'] > div:has(> [data-slot='status-stack-scroll']) {"))
  assert.match(frame.slice(0, frame.indexOf('\n}')), /background: var\(--codex-color-status-panel\) !important/)
  assert.match(CSS, /\[data-slot='status-stack-content'\]\[data-codex-status-card='true'\] \{\s*background: transparent !important/)
})

test('all registered palettes inherit status contrast without theme-specific overrides', async () => {
  assert.equal(Object.hasOwn(T3_PAINT_ROLE_MAP, '--codex-color-status-panel'), false)
  // Execute the shipping theme factory, including theme switching customCSS.
  const { plugin } = await loadPluginInternals()
  const themes = []
  plugin.register({ storage: { get: (_k, fallback) => fallback, set: () => { throw Error('Preference write') } }, register: e => { if (e.area === 'themes') themes.push(e.data) }, onDispose: () => {} })
  assert.equal(themes.filter(t => t.name.startsWith('codex-t3-')).length, 6)
  for (const theme of themes) {
    const overrides = [...(theme.customCSS || '').matchAll(/([^{}]+)\{([^{}]*--codex-color-status-panel:[^{}]*)\}/g)]
    assert.equal(overrides.length, 0, theme.name)
  }
  const ocean = themes.find(t => t.name === 'codex-t3-ocean')
  assert.match(ocean.customCSS, /--codex-composer-fill:var\(--codex-t3-composer-fill\);/)
  assert.match(ocean.customCSS, /background:var\(--codex-composer-fill\)!important/)
})

test('prepared native writer parses and executes every built-in palette without browser stubs for color math', async () => {
  const fixture = nativeStatusFixture()
  new vm.Script(fixture.script)
  const values = new Map(), elements = new Map()
  const root = { style: { setProperty: (k, v) => values.set(k, v) }, dataset: {}, classList: { toggle() {} } }
  const document = { documentElement: root, head: { appendChild: e => elements.set(e.id, e) }, getElementById: id => elements.get(id), createElement: () => ({ dataset: {}, remove() {} }) }
  const context = vm.createContext({ document, window: { localStorage: { setItem() {} } } })
  vm.runInContext(fixture.script, context)
  const { plugin } = await loadPluginInternals(), themes = [...fixture.themes]
  plugin.register({ storage: { get: (_k, fallback) => fallback }, register: e => { if (e.area === 'themes') themes.push(e.data) }, onDispose() {} })
  assert.equal(themes.length, 19)
  for (const theme of themes) for (const mode of ['light', 'dark']) {
    context.window.nativePaint(theme, mode)
    const colors = mode === 'dark' ? theme.darkColors || theme.colors : theme.colors
    assert.equal(values.get('--theme-background-seed'), colors.background)
    assert.equal(values.get('--theme-card-seed'), colors.card)
  }
  // This verifies fixture setup and source execution, not CSS or compositor paint.
})
