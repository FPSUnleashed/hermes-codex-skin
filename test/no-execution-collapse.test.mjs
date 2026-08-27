import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('the fragile custom execution-collapse projection is retired', () => {
  assert.doesNotMatch(source, /data-codex-execution-summary/)
  assert.doesNotMatch(source, /data-codex-execution-hidden/)
  assert.doesNotMatch(source, /data-codex-execution-collapsed/)
  assert.doesNotMatch(source, /data-codex-execution-expanded/)
  assert.doesNotMatch(source, /decorateExecutionSummary|classifyExecutionRoots|executionStateByKey/)
})

test('retirement preserves user controls and generated images', () => {
  assert.match(source, /data-codex-user-expand/)
  assert.match(source, /function hasRenderedImageAttachment\(user\)/)
  assert.match(source, /aui_embedded-images/)
  assert.match(source, /Codex Skin: Composer width/)
})
