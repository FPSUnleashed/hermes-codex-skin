import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('MNT-001 owns a scoped marker wrapper and unwraps it during final cleanup', () => {
  assert.match(source, /html\[data-codex-chat-look='true'\] \[data-codex-image-marker='true'\]/)
  assert.match(source, /wrapper\.replaceWith\(\.\.\.wrapper\.childNodes\)/)
  assert.match(source, /clearImageAttachmentMarkers\(\)\s*\n\s*clearComposerChromeDecorations\(\)/)
  assert.doesNotMatch(source, /node\.nodeValue\s*=/)
})

test('MNT-002 leaves Queue native and keeps owned status-card/context-menu cleanup', () => {
  assert.doesNotMatch(source, /data-codex-queue-|data-codex-has-queue|data-codex-status-stack/)
  assert.match(source, /statusCard\?\.setAttribute\('data-codex-status-card', 'true'\)/)
  assert.match(source, /element\.removeAttribute\('data-codex-status-card'\)/)
  assert.match(source, /contextMenu\.setAttribute\('data-codex-context-menu', 'true'\)/)
  assert.match(source, /element\.removeAttribute\('data-codex-context-menu'\)/)
})

test('MNT-003 documents the unchanged eight-line 198px clamp', () => {
  assert.match(source, /8 text lines, then a\s*\n\s*dedicated ellipsis row/)
  assert.match(source, /The 198px clamp covers\s*\n\s*eight 22px content lines plus the 22px ellipsis row/)
  assert.match(source, /max-height: 198px !important/)
  assert.doesNotMatch(source, /18 text lines/)
})

test('MNT-004 keeps lexical runtime cleanup without a behavior ref', () => {
  assert.doesNotMatch(source, /\buseRef\b|\bbehaviorRef\b/)
  assert.match(source, /import \{ useEffect \} from 'react'/)
  assert.match(source, /const uninstallBehavior = installBehaviorRuntime/)
  assert.match(source, /return \(\) => \{\s*uninstallBehavior\(\)\s*\}/)
  assert.match(source, /RUNTIME_HANDOFF_KEY/)
})

test('MNT-005 removes dead speed metadata without leaking Fast into effort', () => {
  assert.doesNotMatch(source, /const fast =|\bspeed:/)
  assert.match(source, /rawMeta\.replace\(\/\\bFast\\b\/gi, ''\)/)
  assert.match(source, /model: prettyModelName\(rawModel\)/)
  assert.match(source, /effort: effortMap\[effortRaw\] \|\| effortRaw/)
})
