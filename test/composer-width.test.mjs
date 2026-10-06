import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('the composer uses the measured 21px Codex radius', () => {
  const start = source.indexOf("[data-slot='composer-root'],")
  const block = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(block, /border-radius: 21px !important/)
  assert.doesNotMatch(block, /border-radius: 25px/)
})

test('the Attach menu keeps its native compact width and Radix anchoring', () => {
  const menuStart = source.indexOf("[data-codex-context-menu='true'] {")
  const menuRule = source.slice(menuStart, source.indexOf('\n}', menuStart) + 2)
  assert.match(menuRule, /width: 240px !important/)
  assert.doesNotMatch(menuRule, /width: 100%/)
  assert.doesNotMatch(source, /--codex-context-menu-width/)
  assert.doesNotMatch(source, /data-codex-context-menu-shell/)
  assert.doesNotMatch(source, /Object\.assign\(shell\.style/)
})

test('floating composers keep their Hermes-owned width', () => {
  const blockStart = source.indexOf("[data-slot='composer-dock']:not([data-popped-out])")
  const block = source.slice(blockStart, source.indexOf('\n}', blockStart) + 2)
  assert.doesNotMatch(block, /composer-popout-width/)
})
