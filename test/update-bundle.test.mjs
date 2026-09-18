import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleUpdater } from '../scripts/build-updater.mjs'
test('updater bundling is deterministic and rejects incomplete or duplicate markers', () => {
 const plain = 'const existing = true;\n'
 const once = bundleUpdater(plain, 'const updater = true;')
 assert.equal(bundleUpdater(once, 'const updater = true;'), once)
 for (const source of [plain+'// BEGIN GENERATED UPDATE RUNTIME', plain+'// END GENERATED UPDATE RUNTIME', once+once]) assert.throws(() => bundleUpdater(source,'const updater=true;'))
})
