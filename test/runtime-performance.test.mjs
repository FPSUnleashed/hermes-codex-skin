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

test('historical long-message and image decoration stays idle-batched', () => {
  assert.match(source, /window\.requestIdleCallback/)
  assert.match(source, /const PAIR_WORK_BATCH_SIZE = 8/)
  const markerStart = source.indexOf('const markPairsIn = node => {')
  const markerEnd = source.indexOf('const cancelPairWork', markerStart)
  assert.doesNotMatch(source.slice(markerStart, markerEnd), /querySelectorAll/)
  assert.match(source.slice(markerStart, markerEnd), /\[data-session-anchor\]/)
  const processStart = source.indexOf('function process() {')
  const observerStart = source.indexOf('const touchesComposerChrome', processStart)
  const processBody = source.slice(processStart, observerStart)
  assert.doesNotMatch(processBody, /stripImageAttachmentMarker|decorateLongUserMessage|applyCleanConversation/)
  const idleStart = source.indexOf('const runPairWork = deadline => {')
  const idleEnd = source.indexOf('const schedulePairWork =', idleStart)
  const idleBody = source.slice(idleStart, idleEnd)
  assert.match(idleBody, /stripImageAttachmentMarker\(pair\)/)
  assert.match(idleBody, /decorateLongUserMessage\(pair\)/)
})
