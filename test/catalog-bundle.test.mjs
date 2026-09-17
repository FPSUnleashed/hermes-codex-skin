import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('catalog desktop bundle stays byte-identical to the standalone plugin', async () => {
  const standalone = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url))
  const catalog = await readFile(new URL('../codex-chat-look/desktop/plugin.js', import.meta.url))
  assert.deepEqual(catalog, standalone)
})
