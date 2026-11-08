import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const files = [
  'sidebar-actions-runtime.test.mjs',
  'inbox-input-bundle.test.mjs',
  'inbox-old-chat-browser.test.mjs',
  'inbox-progressive-browser.test.mjs',
  'inbox-rapid-departure-browser.test.mjs',
  'inbox-refresh-continuity-browser.test.mjs',
  'inbox-subagent-bundle.test.mjs',
]
const runner = fileURLToPath(new URL('./helpers/server-lifecycle-case.mjs', import.meta.url))
const env = { ...process.env }
// Do not consume optional machine-local fixtures or alternate product bundles.
for (const key of ['CODEX_INBOX_TEST_BUNDLE', 'CODEX_INBOX_PLUGIN_FILE', 'HERMES_INSTALLED_ROW_CSS', 'SIDEBAR_NATIVE_ROOT', 'HERMES_DESKTOP_SOURCE_ROOT', 'NODE_TEST_CONTEXT']) delete env[key]

for (const file of files) {
  const modes = ['acquire-reject', 'acquire-success', 'close-throws']
  if (file !== 'sidebar-actions-runtime.test.mjs') modes.push('evaluate-reject')
  for (const mode of modes) {
    test(`${file}: real server and keep-alive socket close after ${mode}`, () => {
      const result = spawnSync(process.execPath, [runner, file, mode], { env, encoding: 'utf8', timeout: 10000 })
      assert.ifError(result.error)
      assert.equal(result.signal, null, result.stderr)
      const output = result.stdout + result.stderr
      const line = result.stdout.split('\n').find(line => line.startsWith('LIFECYCLE_RECEIPT '))
      assert.ok(line, output)
      const receipt = JSON.parse(line.slice('LIFECYCLE_RECEIPT '.length))
      assert.equal(receipt.acquisitions, 1, output)
      assert.equal(receipt.httpStatus, 200, output)
      assert.equal(receipt.servers.length, 1, output)
      const [server] = receipt.servers
      assert.equal(server.listening, false, JSON.stringify(receipt))
      assert.equal(server.closes, 1, JSON.stringify(receipt))
      assert.equal(server.closed, true, JSON.stringify(receipt))
      assert.equal(server.reachable, false, JSON.stringify(receipt))
      assert.equal(receipt.socketClosed, true, JSON.stringify(receipt))
      assert.equal(receipt.browserCloses, mode === 'acquire-reject' ? 0 : 1, output)
      if (file !== 'sidebar-actions-runtime.test.mjs') assert.equal(receipt.evaluations, mode === 'acquire-reject' ? 0 : 1, output)
      const expectedExit = mode === 'acquire-reject' || mode === 'close-throws' ? 1 : 0
      assert.equal(result.status, expectedExit, output)
      if (mode === 'acquire-reject') assert.match(output, /LIFECYCLE_ACQUISITION_REJECTED/)
      if (mode === 'close-throws') assert.match(output, /LIFECYCLE_CLOSE_FAILED/)
      // Natural exit follows source cleanup; the helper's rescue runs only
      // after recording the state checked above, never to manufacture GREEN.
    })
  }
}
