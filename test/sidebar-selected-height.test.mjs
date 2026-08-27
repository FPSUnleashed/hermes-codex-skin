import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

function selectedRule() {
  const start = source.indexOf("[data-slot='sidebar'] .row-hover[class*='ui-row-active-background']")
  assert.notEqual(start, -1, 'missing selected sidebar rule')
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return source.slice(start, close + 1)
}

test('selecting a chat changes paint only and never overrides native row height', () => {
  const rule = selectedRule()
  assert.doesNotMatch(rule, /(?:min-)?height\s*:/)
  assert.match(rule, /border-radius: 10px !important/)
  assert.match(rule, /background: var\(--codex-color-active\) !important/)
})
