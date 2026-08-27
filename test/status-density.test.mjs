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

test('status card keeps the accepted 14px inset without hiding Queue behind the composer', () => {
  const absoluteStart = source.indexOf("div.absolute.inset-x-0.bottom-full {")
  const absoluteBlock = source.slice(absoluteStart, source.indexOf('\n}', absoluteStart) + 2)
  assert.match(absoluteBlock, /left: 19px !important/)
  assert.match(absoluteBlock, /right: 19px !important/)
  assert.match(absoluteBlock, /bottom: 100% !important/)

  const legacyStart = source.indexOf("[data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] {")
  const legacyBlock = source.slice(legacyStart, source.indexOf('\n}', legacyStart) + 2)
  assert.match(legacyBlock, /left: auto !important/)
  assert.match(legacyBlock, /right: auto !important/)
  assert.match(legacyBlock, /bottom: auto !important/)
  assert.match(legacyBlock, /margin-left: 19px !important/)
  assert.match(legacyBlock, /margin-right: 19px !important/)
  assert.match(legacyBlock, /margin-bottom: 0 !important/)
  assert.doesNotMatch(legacyBlock, /margin-bottom: -16px/)
})

test('status sections have no separator in light or dark mode', () => {
  const lightStart = source.indexOf("[data-codex-status-card='true'] > div + div")
  const lightBlock = source.slice(lightStart, source.indexOf('\n}', lightStart) + 2)
  assert.match(lightBlock, /border-top: 0 !important/)

  const darkStart = source.indexOf(
    "[data-hermes-mode='dark'] [data-codex-status-card='true'] > div + div"
  )
  const darkBlock = source.slice(darkStart, source.indexOf('\n}', darkStart) + 2)
  assert.match(darkBlock, /background: transparent !important/)
  assert.match(darkBlock, /border-color: transparent !important/)
  assert.match(darkBlock, /border-top: 0 !important/)
  assert.doesNotMatch(darkBlock, /rgba\(255, 255, 255, 0\.10\)/)
})

test('dark menu separators keep their own visible rule', () => {
  const start = source.indexOf(
    "[data-hermes-mode='dark'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-separator']"
  )
  const block = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(block, /background: rgba\(255, 255, 255, 0\.10\) !important/)
})

test('the dark Tasks and Queue card has no clipped black shadow behind it', () => {
  const start = source.indexOf("[data-hermes-mode='dark'] [data-codex-status-card='true'],")
  const block = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(block, /box-shadow: none !important/)
  assert.doesNotMatch(block, /rgba\(0, 0, 0/)
})
