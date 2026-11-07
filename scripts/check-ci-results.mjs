#!/usr/bin/env node
// Node can exit successfully with skipped tests. Required CI contracts cannot.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

assert.equal(process.argv.length, 4, 'Usage: node scripts/check-ci-results.mjs <regression.tap> <chromium-suite.json>')
const tap = readFileSync(process.argv[2], 'utf8')
const counts = Object.fromEntries([...tap.matchAll(/^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/gm)].map(([, key, value]) => [key, Number(value)]))
for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
  assert.ok(Number.isSafeInteger(counts[key]), `Missing TAP total: ${key}`)
}
assert.ok(counts.tests > 0, 'No tests executed')
assert.equal(counts.pass, counts.tests, 'Not every test passed')
for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(counts[key], 0, `Unqualified TAP total: ${key}`)
const harness = JSON.parse(readFileSync(process.argv[3], 'utf8'))
assert.equal(harness.exit_code, 0, 'Harness child failed')
assert.deepEqual(harness.stopped, [], 'Harness admission/resource/timeout refusal')
assert.deepEqual(harness.owned_remaining, {}, 'Owned browser descendants remain')
assert.ok(Number.isSafeInteger(harness.chrome_launches) && harness.chrome_launches > 0, 'No browser launches recorded')
console.log(JSON.stringify({ qualified: true, counts, chromeLaunches: harness.chrome_launches, ownedRemaining: harness.owned_remaining }, null, 2))
