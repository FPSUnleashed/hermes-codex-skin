import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import {
  T3_SOURCE_PALETTES, T3_THEME_UPSTREAM_COMMIT, T3_CODE_WEB_PAINTED_OVERRIDES,
  T3_NATIVE_ROLE_MAP, T3_THEMES, t3ColorToHex, t3NativeColors, registerT3Themes
} from '../src/t3-themes.js'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// SHA-256 of sorted semantic role/value JSON extracted from the pinned source.
const upstreamFingerprints = {
  "t3-chat": {
    "light": "aad31dd50fd424f788845d2df387adc873486787c265dbde0bb25b749097b607",
    "dark": "a6e1ac6765c6a4e10db1a18f612ce4d367a3ea6da8cfe98347e3b81dc5684210"
  },
  "t3-code": {
    "light": "d878d53696a1a2b1da5389b1ba62cf5db1b9887b2c6b3028c404827bc0b472b5",
    "dark": "b42538adab74e5fc5b75e17a9d90570cac16485cd121277613c7e7310625b2b5"
  },
  "ocean": {
    "light": "c23a7e123eb592c07feaee94250e4a01a82ef0a6cb4c1e755bcb005d9c85d8fe",
    "dark": "7667b0370060f1300fa1cfa8456bbc1c53e5dd9914537f7eedf2641511fd6696"
  },
  "iris": {
    "light": "79668e64a87cef1d8244a758c73d47c5200605a4fed629939ff9c047a6c3117c",
    "dark": "4c045b9280c0f4f68b33ca991979f6e71fc307dbd7a4613debc37ead593f93ae"
  },
  "grove": {
    "light": "b5fb16d93cf4fc67ed660a766e0c961bb2cb819bb132874809102b205ec9026a",
    "dark": "28b81f4345e50c72f0850225a5014ffade28a08791e5efd3b77c462fc8b3d199"
  },
  "ember": {
    "light": "13d5fd7100b61436bdcce75f3955168271c066aa0c4c784a9a0edd0901f0aa32",
    "dark": "fd846076605c2bf0ad580c6a4915879190d917fc4c62422f1feb19803ff0cf3b"
  }
}

const expectedRoles = {
  background: 'canvas', foreground: 'text', card: 'surface', cardForeground: 'text',
  muted: 'muted', mutedForeground: 'mutedForeground',
  popover: 'surfaceOverlay', popoverForeground: 'text',
  primary: 'messageAction', primaryForeground: 'messageActionForeground',
  secondary: 'secondary', secondaryForeground: 'secondaryForeground',
  accent: 'accentSurface', accentForeground: 'accentSurfaceForeground',
  border: 'border', input: 'input', ring: 'focus',
  midground: 'accent', midgroundForeground: 'accentForeground', composerRing: 'focus',
  destructive: 'error', destructiveForeground: 'errorForeground',
  sidebarBackground: 'sidebar', sidebarBorder: 'sidebarBorder',
  userBubble: 'messageSurface', userBubbleBorder: 'messageSurface'
}

// Independent named color fixtures: canvas, action, focus, bubble, sidebar.
const paintedFixtures = {
  'codex-t3-chat': [
    ['#fdf7fd', '#db2777', '#db2777', '#f7def2', '#f2e1f4'],
    ['#1f1a24', '#a3004c', '#db2777', '#2b2431', '#171018']
  ],
  'codex-t3-code': [
    ['#fcfcfc', '#1b4ed8', '#1b4ed8', '#ebebed', '#fafafa'],
    ['#000000', '#346bf1', '#346bf1', '#1e1e1e', '#000000']
  ],
  'codex-t3-ocean': [
    ['#f5f7f8', '#0a6f75', '#2672af', '#d0dfeb', '#e4ecf2'],
    ['#17212b', '#5bd0d6', '#70b9ee', '#375871', '#1e2d3b']
  ],
  'codex-t3-iris': [
    ['#f8f7f9', '#a82c87', '#7253b9', '#e0d9ee', '#edeaf4'],
    ['#1d1929', '#f099d8', '#9d7df2', '#4b3d72', '#272139']
  ],
  'codex-t3-grove': [
    ['#f3f7f4', '#8f6410', '#1b7d50', '#cce1d7', '#e2ede7'],
    ['#1b2821', '#e3b34e', '#69d69a', '#37664d', '#21362b']
  ],
  'codex-t3-ember': [
    ['#f9f7f5', '#b23535', '#ae552a', '#ebdad1', '#f3eae5'],
    ['#291e1a', '#f78a7a', '#f09a64', '#704b34', '#39281f']
  ]
}

test('preserves all 61 upstream semantic literals in each of the 12 palettes', () => {
  assert.equal(T3_THEME_UPSTREAM_COMMIT, '6d450a4284852af137b2f3407fddd89eb76e7644')
  assert.deepEqual(Object.keys(T3_SOURCE_PALETTES), Object.keys(upstreamFingerprints))
  for (const [id, source] of Object.entries(T3_SOURCE_PALETTES)) {
    for (const mode of ['light', 'dark']) {
      const palette = source[mode]
      assert.equal(Object.keys(palette).length, 61, `${id}/${mode}`)
      const sorted = Object.fromEntries(Object.keys(palette).sort().map(key => [key, palette[key]]))
      assert.equal(createHash('sha256').update(JSON.stringify(sorted)).digest('hex'), upstreamFingerprints[id][mode], `${id}/${mode}`)
    }
  }
})

test('keeps the source OKLCH literals and converts with T3 gamut fitting and rounding', () => {
  assert.equal(T3_SOURCE_PALETTES.grove.light.accent, 'oklch(0.523295 0.112292 158.089)')
  assert.equal(T3_SOURCE_PALETTES.grove.light.messageAction, 'oklch(0.535028 0.106403 77.549)')
  assert.equal(t3ColorToHex('#FCFCFC'), '#fcfcfc')
  assert.equal(t3ColorToHex('oklch(0 0 0)'), '#000000')
  assert.equal(t3ColorToHex('oklch(1 0 0)'), '#ffffff')
  assert.equal(t3ColorToHex('oklch(0.523295 0.112292 158.089)'), '#1b7d50')
  // This saturated red exceeds sRGB: preserve hue by reducing chroma, not clipping.
  assert.equal(t3ColorToHex('oklch(0.627117 0.248974 7.734)'), '#f7086c')
  assert.throws(() => t3ColorToHex('var(--accent)'), /Unsupported T3 source color/)
})

test('uses the actual upstream web paint overrides for the default T3 Code theme', () => {
  assert.deepEqual(T3_CODE_WEB_PAINTED_OVERRIDES, {
    light: { messageSurface: '#ebebed' },
    dark: { canvas: '#000000', messageSurface: '#1e1e1e' }
  })
  assert.equal(T3_SOURCE_PALETTES['t3-code'].dark.canvas, '#0a0a0a', 'keep the mobile/shared source intact')
  const theme = T3_THEMES.find(theme => theme.name === 'codex-t3-code')
  assert.equal(theme.darkColors.background, '#000000')
  assert.equal(theme.colors.userBubble, '#ebebed')
  assert.equal(theme.darkColors.userBubble, '#1e1e1e')
})

test('matches the genuine canvas/action/focus/bubble/sidebar colors in both appearances', () => {
  assert.equal(T3_THEMES.length, 6)
  for (const theme of T3_THEMES) {
    for (const [index, palette] of [theme.colors, theme.darkColors].entries()) {
      assert.deepEqual(['background', 'primary', 'ring', 'userBubble', 'sidebarBackground'].map(key => palette[key]), paintedFixtures[theme.name][index], `${theme.name}/${index}`)
    }
  }
})

test('maps solid action, brand accent and soft selection separately through the native model', () => {
  assert.deepEqual(T3_NATIVE_ROLE_MAP, expectedRoles)
  for (const [id, source] of Object.entries(T3_SOURCE_PALETTES)) {
    for (const mode of ['light','dark']) {
      const native = t3NativeColors(source[mode])
      assert.deepEqual(Object.keys(native).sort(), Object.keys(expectedRoles).sort())
      for (const [key, role] of Object.entries(expectedRoles)) {
        assert.equal(native[key], t3ColorToHex(source[mode][role]), `${id}/${mode}/${key}`)
      }
    }
  }
  const grove = T3_THEMES.find(theme => theme.name === 'codex-t3-grove')
  assert.notEqual(grove.colors.primary, grove.colors.midground, 'T3 Grove action is ochre, brand/focus is green')
  assert.notEqual(grove.colors.accent, grove.colors.primary, 'soft selection must not become a solid action fill')
})

test('emits six complete native theme records with scoped paint only, safe IDs and no material/font activation side effects', () => {
  const builtins = new Set(['github', 'nous', 'catppuccin', 'everforest', 'solarized', 'nous-alt', 'classic', 'midnight', 'ember', 'mono', 'cyberpunk', 'slate'])
  assert.equal(new Set(T3_THEMES.map(theme => theme.name)).size, 6)
  assert.deepEqual(T3_THEMES.map(theme => theme.label), ['T3 Chat', 'T3 Code', 'T3 Ocean', 'T3 Iris', 'T3 Grove', 'T3 Ember'])
  for (const theme of T3_THEMES) {
    assert.match(theme.name, /^codex-t3-[a-z]+$/)
    assert.equal(builtins.has(theme.name), false)
    assert.notEqual(theme.name, 'codex-chat')
    assert.deepEqual(Object.keys(theme).sort(), ['name','label','description','colors','darkColors','terminal','darkTerminal','customCSS'].sort())
    assert.equal(typeof theme.customCSS, 'string')
    assert.doesNotMatch(theme.customCSS, /(?:font|padding|margin|width|height|opacity|transform|filter|backdrop-filter)\s*:/i, 'palette bridge must not change typography, geometry or material')
    const selectors=theme.customCSS.split('}').filter(s=>s.trim()).map(s=>s.slice(0,s.indexOf('{')))
    for(const selector of selectors)for(const branch of selector.split(/,(?![^()]*\))/)) {
      assert.ok(branch.includes("[data-codex-chat-look='true']"), 'disable must remove all paint overrides')
      assert.ok(branch.includes(`[data-hermes-theme='${theme.name}']`), 'other native themes must not receive the palette')
      assert.match(branch,/\[data-hermes-mode='(?:light|dark)'\]/)
    }
    assert.equal(typeof theme.description, 'string')
    for (const palette of [theme.colors, theme.darkColors]) {
      for (const value of Object.values(palette)) assert.match(value, /^#[0-9a-f]{6}$/)
      for (const key of ['background','foreground','primary']) assert.equal(typeof palette[key], 'string')
    }
    for (const terminal of [theme.terminal, theme.darkTerminal]) {
      assert.deepEqual(Object.keys(terminal).sort(), ['cursor','foreground','selectionBackground'])
      assert.equal('background' in terminal, false, 'native terminal owns translucent pane background')
      Object.values(terminal).forEach(value => assert.match(value, /^#[0-9a-f]{6}$/))
    }
  }
})

test('terminal cursor, selection and foreground come from upstream without inventing ANSI colors', () => {
  T3_THEMES.forEach((theme, index) => {
    const source = Object.values(T3_SOURCE_PALETTES)[index]
    for (const [key, mode] of [['terminal','light'], ['darkTerminal','dark']]) {
      assert.deepEqual(theme[key], {
        foreground: t3ColorToHex(source[mode].terminalForeground),
        cursor: t3ColorToHex(source[mode].terminalCursor),
        selectionBackground: t3ColorToHex(source[mode].terminalSelection)
      })
    }
  })
})

test('registers alongside the real existing Codex contribution without selecting or rewriting it', async () => {
  const contributions = [], disposers = [], stored = new Map([['active-theme', 'codex-chat']])
  const { plugin, CODEX_THEME } = await loadPluginInternals(['CODEX_THEME'])
  const before = JSON.stringify(CODEX_THEME)
  const ctx = {
    register: contribution => contributions.push(contribution),
    onDispose: dispose => disposers.push(dispose),
    storage: { get: (key, fallback) => stored.get(key) ?? fallback, set: (key, value) => stored.set(key, value) }
  }
  plugin.register(ctx)
  const themes = contributions.filter(contribution => contribution.area === 'themes')
  assert.equal(themes.length, 7)
  assert.equal(themes[0].id, 'theme')
  assert.equal(themes[0].data.name, 'codex-chat')
  assert.equal(themes[0].data, CODEX_THEME)
  assert.equal(JSON.stringify(CODEX_THEME), before)
  assert.equal(stored.get('active-theme'), 'codex-chat')
  assert.equal(new Set(themes.map(theme => theme.id)).size, 7)
  assert.deepEqual(JSON.parse(JSON.stringify(themes.slice(1).map(theme => theme.data))), T3_THEMES)
  for (const dispose of disposers.reverse()) dispose?.()
})

test('can be embedded as declarations in a single plugin module without extra imports', async () => {
  const source = await readFile(new URL('../src/t3-themes.js', import.meta.url), 'utf8')
  const paint = await readFile(new URL('../src/t3-theme-paint.js', import.meta.url), 'utf8')
  const sandbox = vm.createContext({})
  vm.runInContext(paint.replace(/^export /gm, '') + '\n' + source.replace(/^import .*$/gm, '').replace(/^export /gm, '') + '\nglobalThis.registerThemes = registerT3Themes', sandbox)
  const rows = []
  sandbox.registerThemes({ register: row => rows.push(row) }, 'themes-from-sdk')
  assert.equal(rows.length, 6)
  assert.ok(rows.every(row => row.area === 'themes-from-sdk' && row.id === `theme-${row.data.name}`))
})
