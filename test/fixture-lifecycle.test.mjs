import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { fixtureLifecycleCases, lifecycleScenarios } from './helpers/fixture-lifecycle-cases.mjs'

const runner = fileURLToPath(new URL('./helpers/fixture-lifecycle-case.mjs', import.meta.url))
const env = { ...process.env }
// Retain mandatory authenticated source inputs, but never consume an alternate
// product or write optional screenshot/receipt outputs in nested module loads.
for (const key of ['NODE_TEST_CONTEXT', 'CODEX_ACTIVITY_TEST_PLUGIN', 'CODEX_FONT_BASELINE', 'T3_PAINT_BASELINE', 'CODEX_HEADER_SCREENSHOTS', 'T3_PAINT_RECEIPT', 'CODEX_FONT_RECEIPT']) delete env[key]

for (const spec of fixtureLifecycleCases) {
  test(`${spec.target ?? spec.file}: closes failed setup and transfers success without Chrome`, () => {
    const result = spawnSync(process.execPath, [runner, spec.file], { env, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
    assert.ifError(result.error)
    const output = result.stdout + result.stderr
    assert.equal(result.signal, null, output)
    const line = result.stdout.split('\n').find(line => line.startsWith('FIXTURE_LIFECYCLE_RECEIPT '))
    assert.ok(line, output)
    const receipt = JSON.parse(line.slice('FIXTURE_LIFECYCLE_RECEIPT '.length))
    assert.equal(receipt.file, spec.file)
    assert.deepEqual(receipt.cases.map(({ scenario }) => scenario), lifecycleScenarios(spec))
    assert.equal(result.status, 0, output)
  })
}
