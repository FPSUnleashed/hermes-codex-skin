import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Exercise the composer decoration/cleanup entry points without launching
// Chromium. Native model nodes must not be read, replaced or decorated.
for (const name of ['gpt-5.3-codex', 'GPT-5.6-Codex', 'Claude Sonnet 4.5', 'vendor/custom-MiXeD-Model', 'gpt-5.6 · Fast', '']) {
  test(`composer lifecycle preserves the native model label: ${name || '(loading)'}`, async () => {
    const nativeLabel = { textContent: name }
    const nativeModel = {
      dataset: {},
      querySelector: () => nativeLabel,
      getAttribute: () => `Model · provider: ${name}`
    }
    const surface = { querySelectorAll: () => [] }
    const dock = {}
    const document = {
      querySelector(selector) {
        if (selector === '[data-slot="composer-surface"]') return surface
        if (selector === '[data-slot="composer-dock"]') return dock
        assert.fail(`Unexpected native control lookup: ${selector}`)
      },
      querySelectorAll(selector) {
        assert.doesNotMatch(selector, /model|Model|Modèle|Effort/)
        return []
      }
    }
    const { decorateComposerChrome, clearComposerChromeDecorations } = await loadPluginInternals(
      ['decorateComposerChrome', 'clearComposerChromeDecorations'], { document }
    )
    const snapshot = structuredClone(nativeModel.dataset)
    decorateComposerChrome()
    decorateComposerChrome()
    clearComposerChromeDecorations()
    decorateComposerChrome()
    assert.equal(nativeLabel.textContent, name)
    assert.deepEqual(nativeModel.dataset, snapshot)
  })
}

test('composer updates do not overwrite a native model switch', async () => {
  let label = 'gpt-5.3-codex'
  const surface = { querySelectorAll: () => [] }
  const document = {
    querySelector(selector) {
      if (selector === '[data-slot="composer-surface"]') return surface
      if (selector === '[data-slot="composer-dock"]') return {}
      assert.fail(`Unexpected native control lookup: ${selector}`)
    },
    querySelectorAll: () => []
  }
  const { decorateComposerChrome } = await loadPluginInternals(['decorateComposerChrome'], { document })
  decorateComposerChrome()
  label = 'Claude Sonnet 4.5'
  decorateComposerChrome()
  assert.equal(label, 'Claude Sonnet 4.5')
})
