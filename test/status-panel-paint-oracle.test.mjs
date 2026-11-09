import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { testDependencyRequire } from './helpers/reference-paths.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'
import { approvedStatusPanelColor, statusPanelPaintFailures } from './helpers/status-panel-paint-oracle.mjs'

// Use jsdom's real color evaluator, without a browser or a second implementation
// of the oracle. Execute the shipping CSS expression and the actual probe helper.
const require = testDependencyRequire()
const { convert } = createRequire(require.resolve('jsdom'))('@asamuzakjp/css-color')
const postcss = require('postcss')
const { CSS } = await loadPluginInternals(['CSS'])
const stylesheet = postcss.parse(CSS)
const properties = mode => {
  const result = {}
  stylesheet.walkRules(rule => {
    if (rule.selector === "html[data-codex-chat-look='true']" ||
      (mode === 'dark' && rule.selector === "html[data-codex-chat-look='true'][data-hermes-mode='dark']")) {
      rule.walkDecls(d => { result[d.prop] = d.value })
    }
  })
  return result
}
const pixel = channels => channels.map((v, i) => Math.round(i === 3 ? v * 255 : v))
const midpoint = 'color-mix(in srgb, var(--codex-composer-fill) 50%, var(--codex-color-chat))'

for (const mode of ['light', 'dark']) {
  test(`${mode}: probe accepts approved shipping color, rejects obsolete midpoint, keeps two-channel tolerance`, () => {
    const customProperty = { ...properties(mode), '--codex-composer-fill': '#646464', '--codex-color-chat': '#202020' }
    const options = { customProperty }
    const approved = approvedStatusPanelColor(mode)
    const reference = pixel(convert.colorToRgb(approved, options))
    const candidate = pixel(convert.colorToRgb(customProperty['--codex-color-status-panel'], options))
    const old = pixel(convert.colorToRgb(midpoint, options))
    const base = convert.colorToOklch(midpoint, options)
    const adjusted = convert.colorToOklch(approved, options)
    assert.ok(Math.abs(adjusted[0] - base[0] - (mode === 'dark' ? 0.04 : -0.025)) < 0.000003)
    assert.deepEqual(candidate, reference, 'shipping CSS evaluated, not a duplicated candidate formula')
    const row = panel => ({ baseline: { chat: [32, 32, 32, 255], composer: [100, 100, 100, 255], panel: old }, candidate: { chat: [32, 32, 32, 255], composer: [100, 100, 100, 255], panel } })
    const accepted = row(candidate)
    assert.deepEqual(statusPanelPaintFailures(accepted, reference), [])
    assert.ok(accepted.baseline.maxError > 2, 'obsolete midpoint is RED against the approved reference')
    assert.equal(statusPanelPaintFailures(row(old), reference).length, 1)
    assert.equal(statusPanelPaintFailures(row(reference.map((v, i) => i === 0 ? v + 2 : v)), reference).length, 0)
    assert.equal(statusPanelPaintFailures(row(reference.map((v, i) => i === 0 ? v + 3 : v)), reference).length, 1)
  })
}

test('independent reference retains alpha and clamps lightness before native compositing', () => {
  for (const [mode, color, expectedL] of [['light', '#000', 0], ['dark', '#fff', 1]]) {
    const options = { customProperty: { '--codex-composer-fill': color, '--codex-color-chat': color } }
    assert.ok(Math.abs(convert.colorToOklch(approvedStatusPanelColor(mode), options)[0] - expectedL) < 0.000003)
  }
  const options = { customProperty: { '--codex-composer-fill': 'rgb(100 100 100 / 0.2)', '--codex-color-chat': 'rgb(32 32 32 / 0.6)' } }
  const before = convert.colorToOklch(midpoint, options)
  for (const mode of ['light', 'dark']) {
    const after = convert.colorToOklch(approvedStatusPanelColor(mode), options)
    assert.equal(after[3], before[3])
    assert.ok(Math.abs(after[3] - 0.4) < 0.000003)
  }
})
