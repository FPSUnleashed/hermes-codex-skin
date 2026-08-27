import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('the native Tasks section is identified by its semantic checklist icon', () => {
  assert.match(source, /statusCard\.querySelectorAll\(':scope > div'\)/)
  assert.match(source, /section\.querySelector\('\.codicon-checklist'\)/)
  assert.match(source, /taskSection\?\.setAttribute\('data-codex-task-section', 'true'\)/)
  assert.match(source, /statusStack\.setAttribute\('data-codex-has-task-section', 'true'\)/)
})

test('only the expanded Tasks body scrolls while sibling sections stay fixed', () => {
  assert.match(source, /\[data-codex-has-task-section='true'\] \{[\s\S]{0,140}overflow: hidden !important/)
  assert.match(source, /\[data-codex-status-card='true'\]:has\(\[data-codex-task-section='true'\]\) \{[\s\S]{0,220}display: flex !important/)
  assert.match(source, /\[data-codex-task-section='true'\] \{[\s\S]{0,220}flex: 0 1 auto !important/)
  assert.match(source, /\[data-codex-task-section='true'\] > div > div:nth-child\(2\) \{[\s\S]{0,220}overflow-y: auto !important/)
  assert.match(source, /\[data-codex-task-section='true'\] > div > div:nth-child\(2\) \{[\s\S]{0,260}overscroll-behavior: contain/)
})

test('task scrolling decorations are removed on hot reload', () => {
  assert.match(source, /element\.removeAttribute\('data-codex-task-section'\)/)
  assert.match(source, /element\.removeAttribute\('data-codex-has-task-section'\)/)
})
