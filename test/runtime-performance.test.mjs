import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('session reconciliation never schedules repeated full-history rescans', () => {
  const start = source.indexOf('const reconcileSession = (')
  const end = source.indexOf('let observedSessionId =', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const body = source.slice(start, end)
  assert.doesNotMatch(body, /for \(const delay of \[/)
  assert.doesNotMatch(body, /processAllPairs = true/)
})

test('sidebar decoration never scans every descendant or reads layout styles', () => {
  assert.doesNotMatch(source, /sidebar\.querySelectorAll\('\*'\)/)
  assert.doesNotMatch(source, /getComputedStyle\(element\)\.overflowY/)
  assert.doesNotMatch(source, /let sidebarDirty = true/)
  assert.doesNotMatch(source, /sidebarDirty = true/)
})

test('ordinary sidebar mutations are ignored by the document observer', () => {
  assert.match(source, /if \(target\?\.closest\?\.\('\[data-slot="sidebar"\]'\)\) continue/)
  assert.match(source, /if \(node\.matches\('\[data-slot="sidebar"\]'\) \|\| node\.closest\?\.\('\[data-slot="sidebar"\]'\)\) continue/)
  assert.doesNotMatch(source, /node\.querySelector\('\[data-slot="sidebar"\]'\)/)
})

test('historical decoration stays idle-batched while a bounded tail collapse runs before paint', () => {
  assert.match(source, /window\.requestIdleCallback/)
  assert.match(source, /const PAIR_WORK_BATCH_SIZE = 8/)
  assert.match(source, /const FIRST_PAINT_EXECUTION_PAIR_LIMIT = 8/)
  assert.match(source, /const FIRST_PAINT_EXECUTION_WINDOW_MS = 1_200/)
  const markerStart = source.indexOf('const markPairsIn = node => {')
  const markerEnd = source.indexOf('const markClosestPair', markerStart)
  assert.doesNotMatch(source.slice(markerStart, markerEnd), /querySelectorAll/)
  assert.match(source.slice(markerStart, markerEnd), /\[data-session-anchor\]/)
  const processStart = source.indexOf('const process = () => {')
  const observerStart = source.indexOf('const touchesComposerChrome', processStart)
  const processBody = source.slice(processStart, observerStart)
  assert.doesNotMatch(processBody, /stripImageAttachmentMarker|decorateLongUserMessage|applyCleanConversation/)
  assert.match(processBody, /runFirstPaintExecutionTail\(document\)/)

  const fastStart = source.indexOf('const runFirstPaintExecutionTail =')
  const fastEnd = source.indexOf('const markPairsIn =', fastStart)
  const fastBody = source.slice(fastStart, fastEnd)
  assert.match(fastBody, /decorateExecutionSummary\(pair\)/)
  assert.match(fastBody, /processed < FIRST_PAINT_EXECUTION_PAIR_LIMIT/)
  assert.doesNotMatch(fastBody, /stripImageAttachmentMarker|decorateLongUserMessage/)
})

test('Clean conversation uses CSS rather than per-turn runtime annotation', () => {
  assert.match(source, /\[data-slot='tool-block'\]:not\(:has\(/)
  assert.match(source, /\[data-slot='aui_changed-files'\]/)
  assert.match(source, /\[data-slot='aui_generated-image'\]/)
  assert.doesNotMatch(source, /function applyCleanConversation\(/)
})