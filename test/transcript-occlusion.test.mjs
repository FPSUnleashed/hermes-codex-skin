import assert from 'node:assert/strict'
import test from 'node:test'

import { loadPluginInternals } from './helpers/load-plugin.mjs'

const { CSS, OCCLUSION_TARGET_SELECTOR, occlusionClipTop } = await loadPluginInternals([
  'CSS',
  'OCCLUSION_TARGET_SELECTOR',
  'occlusionClipTop'
])

test('the transcript mask runtime is completely absent', () => {
  assert.equal(OCCLUSION_TARGET_SELECTOR, null)
  assert.equal(occlusionClipTop, null)
})

test('the full-width sticky user row paints nothing in every theme and mode', () => {
  const selector = "html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'] {"
  const start = CSS.indexOf(selector)
  assert.notEqual(start, -1)
  const block = CSS.slice(start, CSS.indexOf('\n}', start) + 2)

  assert.match(block, /background: transparent !important/)
  assert.doesNotMatch(block, /var\(--codex-color-chat\)|backdrop-filter|filter:|opacity:|color-mix|box-shadow|clip-path/)
})

test('no light, dark, glass, clear, or Codex-specific mask survives', () => {
  assert.doesNotMatch(CSS, /data-codex-occlusion-ready|data-codex-occluded/)
  assert.doesNotMatch(CSS, /codex-transcript-occlusion/)
})
