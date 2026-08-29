import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('task rows use the compact Codex density', () => {
  const cardStart = source.indexOf("[data-codex-status-card='true'],")
  const cardBlock = source.slice(cardStart, source.indexOf('\n}', cardStart) + 2)
  assert.match(cardBlock, /padding: 4px 8px 2px !important/)
  assert.match(cardBlock, /margin: 0 !important/)

  const start = source.indexOf("[data-codex-status-card='true'] [class~='group/status-row']")
  const block = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(block, /min-height: 24px !important/)
  assert.match(block, /padding: 1px 8px !important/)
  assert.match(block, /gap: 6px !important/)
  assert.match(block, /border-radius: 8px !important/)
})

test('the scrollable status stack cannot paint a square gutter above the rounded card', () => {
  assert.match(source, /\[data-slot='composer-status-stack'\] \{[\s\S]{0,180}scrollbar-color: transparent transparent !important/)
  assert.match(source, /\[data-slot='composer-status-stack'\]::\-webkit-scrollbar \{[\s\S]{0,100}width: 8px !important/)
  assert.match(source, /\[data-slot='composer-status-stack'\]::\-webkit-scrollbar-track,[\s\S]{0,180}background: transparent !important/)
  assert.match(source, /\[data-slot='composer-status-stack'\]::\-webkit-scrollbar-button \{[\s\S]{0,100}display: none !important/)
})

test('status card clears the composer corner shoulders without hiding Queue', () => {
  const absoluteStart = source.indexOf("div.absolute.inset-x-0.bottom-full {")
  const absoluteBlock = source.slice(absoluteStart, source.indexOf('\n}', absoluteStart) + 2)
  assert.match(absoluteBlock, /left: 26px !important/)
  assert.match(absoluteBlock, /right: 26px !important/)
  assert.match(absoluteBlock, /bottom: 100% !important/)

  const legacyStart = source.indexOf("[data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] {")
  const legacyBlock = source.slice(legacyStart, source.indexOf('\n}', legacyStart) + 2)
  assert.match(legacyBlock, /left: auto !important/)
  assert.match(legacyBlock, /right: auto !important/)
  assert.match(legacyBlock, /bottom: auto !important/)
  assert.match(legacyBlock, /margin-left: 26px !important/)
  assert.match(legacyBlock, /margin-right: 26px !important/)
  assert.match(legacyBlock, /margin-bottom: 0 !important/)
  assert.doesNotMatch(legacyBlock, /margin-bottom: -16px/)
})

test('status sections have no separator in every theme', () => {
  const start = source.indexOf("[data-codex-status-card='true'] > div + div")
  const block = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(block, /border-top: 0 !important/)
  assert.doesNotMatch(source, /data-hermes-mode='dark'[^\n]*\[data-codex-status-card='true'\] > div \+ div/)
})

test('menu separators inherit a visible rule from the active theme', () => {
  const start = source.indexOf("[data-codex-context-menu='true'] [data-slot='dropdown-menu-separator']")
  const block = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(block, /background: color-mix\(in srgb, var\(--codex-color-text\) 8%, transparent\) !important/)
})

test('Attach menu reuses the composer chrome at native compact density', () => {
  const menuStart = source.indexOf("[data-codex-context-menu='true'] {")
  const menuBlock = source.slice(menuStart, source.indexOf('\n}', menuStart) + 2)
  assert.match(menuBlock, /border: 0\.5px solid var\(--codex-color-border-subtle\) !important/)
  assert.match(menuBlock, /border-radius: 12px !important/)
  assert.match(menuBlock, /background: var\(--codex-color-card\) !important/)
  assert.match(menuBlock, /box-shadow: var\(--shadow-nous\) !important/)
  assert.match(menuBlock, /backdrop-filter: none !important/)

  const labelStart = source.indexOf("[data-codex-context-menu='true'] [data-slot='dropdown-menu-label'] {")
  const labelBlock = source.slice(labelStart, source.indexOf('\n}', labelStart) + 2)
  assert.match(labelBlock, /padding: 2px 8px !important/)
  assert.match(labelBlock, /font-size: 10px !important/)
  assert.match(labelBlock, /line-height: 14px !important/)
  assert.match(labelBlock, /font-weight: 600 !important/)
  assert.match(labelBlock, /text-transform: uppercase !important/)

  const itemStart = source.indexOf("[data-codex-context-menu='true'] [data-slot='dropdown-menu-item'] {")
  const itemBlock = source.slice(itemStart, source.indexOf('\n}', itemStart) + 2)
  assert.match(itemBlock, /height: 28px !important/)
  assert.match(itemBlock, /min-height: 28px !important/)
  assert.match(itemBlock, /gap: 8px !important/)
  assert.match(itemBlock, /padding: 0 8px !important/)
  assert.match(itemBlock, /border-radius: 6px !important/)
  assert.match(itemBlock, /font-size: 12px !important/)
  assert.match(itemBlock, /line-height: 16px !important/)

  const iconStart = source.indexOf("[data-codex-context-menu='true'] [data-slot='dropdown-menu-item'] svg")
  const iconBlock = source.slice(iconStart, source.indexOf('\n}', iconStart) + 2)
  assert.match(iconBlock, /width: 14px !important/)
  assert.match(iconBlock, /height: 14px !important/)
})

test('the Tasks and Queue card has no border and no shadow halo', () => {
  const start = source.indexOf("[data-codex-status-card='true'],")
  const block = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(block, /border: 0 none transparent !important/)
  assert.match(block, /box-shadow: none !important/)
  assert.doesNotMatch(block, /var\(--codex-shadow-floating\)/)
  assert.doesNotMatch(block, /var\(--shadow-md\)/)
  assert.doesNotMatch(block, /var\(--shadow-nous\)/)
  assert.doesNotMatch(source, /data-hermes-mode='dark'[^\n]*\[data-codex-status-card='true'/)
})
