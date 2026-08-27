import assert from 'node:assert/strict'
import test from 'node:test'

import { loadPluginInternals } from './helpers/load-plugin.mjs'

const { CODEX_THEME, CSS, SYSTEM_FONT } = await loadPluginInternals(['CODEX_THEME', 'CSS', 'SYSTEM_FONT'])
const cssWithoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

test('the optional Codex palette remains bundled in light and dark', () => {
  assert.equal(CODEX_THEME.name, 'codex-chat')
  assert.equal(CODEX_THEME.label, 'Codex Skin')
  assert.ok(CODEX_THEME.colors.background)
  assert.ok(CODEX_THEME.darkColors.background)
})

test('the skin fixes typography independently from the selected Hermes theme', () => {
  assert.match(CSS, /--dt-font-sans:\s*[^;]+!important;/)
  assert.match(CSS, /--font-sans:\s*[^;]+!important;/)
  assert.ok(CSS.includes(`font-family: ${SYSTEM_FONT} !important`))
})

test('layout CSS consumes theme variables instead of embedding a palette', () => {
  assert.doesNotMatch(cssWithoutComments, /#[0-9a-f]{3,8}\b/i)
  assert.doesNotMatch(cssWithoutComments, /rgba?\(/i)
  const rootStart = cssWithoutComments.indexOf("html[data-codex-chat-look='true'] {")
  const rootBlock = cssWithoutComments.slice(rootStart, cssWithoutComments.indexOf('\n}', rootStart) + 2)
  assert.doesNotMatch(
    rootBlock,
    /--(?:theme-(?:primary|secondary|accent-soft|midground|background-seed|sidebar-seed|bubble-seed)|ui-(?:base|accent|text-[a-z-]+|stroke-[a-z-]+|bg-[a-z-]+|chat-surface-background|sidebar-surface-background|editor-surface-background))\s*:/
  )
  for (const token of [
    '--ui-chat-surface-background',
    '--ui-sidebar-surface-background',
    '--ui-chat-bubble-background',
    '--ui-bg-tertiary',
    '--ui-row-active-background',
    '--ui-row-hover-background',
    '--ui-text-primary',
    '--ui-text-secondary',
    '--ui-stroke-secondary',
    '--dt-primary',
    '--dt-primary-foreground'
  ]) {
    assert.match(CSS, new RegExp(`var\\(${token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`))
  }
})

test('theme changes stay live because every plugin color resolves through CSS variables', () => {
  assert.match(CSS, /--codex-color-chat:\s*var\(--ui-chat-surface-background\)/)
  assert.match(CSS, /--codex-color-text:\s*var\(--ui-text-primary\)/)
  const themeOverrides = new Set([...CSS.matchAll(/data-hermes-theme=['"]([^'"]+)['"]/g)].map(match => match[1]))
  assert.deepEqual([...themeOverrides], ['codex-chat'])
})

test('composer keeps a uniform real border and a downward shadow without rings', () => {
  const start = CSS.indexOf("[data-slot='composer-surface'] {")
  assert.notEqual(start, -1)
  const block = CSS.slice(start, CSS.indexOf('\n}', start) + 2)
  assert.match(block, /border: 0\.5px solid var\(--codex-color-border-subtle\) !important/)
  assert.match(block, /var\(--shadow-nous\) !important/)
  assert.doesNotMatch(block, /\binset\b/)
  assert.doesNotMatch(block, /var\(--shadow-md\)/)
  assert.doesNotMatch(block, /var\(--shadow-composer\)/)
})

test('Codex theme keeps its opaque field palette only when native Glass is off', () => {
  const themeStart = CSS.indexOf("html[data-codex-chat-look='true'][data-hermes-theme='codex-chat'] {")
  const themeBlock = CSS.slice(themeStart, CSS.indexOf('\n}', themeStart) + 2)
  assert.doesNotMatch(themeBlock, /--codex-color-(?:chat|sidebar):|--ui-chat-surface-background:/)
  assert.match(
    CSS,
    /html\[data-codex-chat-look='true'\]\[data-hermes-theme='codex-chat'\]:not\(\[data-hermes-glass\]\) \{[\s\S]{0,220}--codex-color-chat: var\(--theme-background-seed\);[\s\S]{0,120}--ui-chat-surface-background: var\(--codex-color-chat\);[\s\S]{0,120}--codex-color-sidebar: var\(--theme-sidebar-seed\)/
  )
  assert.match(
    CSS,
    /html\[data-codex-chat-look='true'\]\[data-hermes-theme='codex-chat'\]:not\(\[data-hermes-glass\]\),[\s\S]{0,180}body \{[\s\S]{0,100}background-color: var\(--codex-color-chat\) !important/
  )
})

test('Codex theme yields chat and sidebar fields to native Glass transparency', () => {
  assert.match(
    CSS,
    /html\[data-codex-chat-look='true'\]\[data-hermes-theme='codex-chat'\]\[data-hermes-glass\] \{[\s\S]{0,180}--codex-color-chat: var\(--ui-chat-surface-background\);[\s\S]{0,120}--codex-color-sidebar: var\(--ui-sidebar-surface-background\)/
  )
  assert.doesNotMatch(CSS, /\[data-hermes-clear\][^{]*\{[^}]*\bopacity\s*:/)
})
