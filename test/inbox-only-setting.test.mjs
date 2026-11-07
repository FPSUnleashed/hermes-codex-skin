import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

async function fixture(initial, faults = {}) {
  const saved = new Map(initial === undefined ? [] : [['inbox-only', initial]])
  const attributes = new Map(), entries = [], notices = [], disposals = [], writes = []
  const state = value => ({ get: () => value, subscribe: () => () => {} })
  const storage = {
    get(key, fallback) { if (key === 'inbox-only' && faults.read) throw Error('read'); return saved.has(key) ? saved.get(key) : fallback },
    set(key, value) { writes.push([key, value]); if (faults.throw) throw Error('quota'); if (!faults.silent) saved.set(key, value); if (faults.afterWrite) faults.read = true }
  }
  const context = vm.createContext({ host: { state: { profile: state('default'), gateway: state('open') }, onEvent: () => () => {}, notify: n => notices.push(n) }, window: {}, document: { documentElement: { setAttribute: (k,v) => attributes.set(k,v) } }, console, AbortController, PALETTE_AREA: 'palette', THEMES_AREA: 'themes', jsx: () => null })
  let source = await readFile(process.env.CODEX_INBOX_TEST_BUNDLE || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
  source = source.replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.plugin = {')
  vm.runInContext(source, context)
  context.plugin.register({ storage, register: e => entries.push(e), onDispose: fn => disposals.push(fn) })
  const command = entries.find(e => e.id === 'toggle-inbox-only')
  assert.ok(command, 'Inbox only (Beta) palette command is registered')
  return { saved, attributes, command, faults, storage, writes, notices, disposals }
}

test('Inbox only (Beta) is default Off without writes and persists verified On/Off through reload', async () => {
  const f = await fixture()
  assert.equal(f.command.data.label, 'Codex Skin: Inbox only (Beta)')
  assert.equal(f.command.data.keepOpen, true)
  assert.equal(f.command.data.detailVariant, 'state')
  assert.match(f.command.data.detail(), /^Off.*hide.*Pinned.*Sessions.*not delete/i)
  assert.deepEqual(f.writes, [])
  assert.equal(f.attributes.get('data-codex-inbox-only'), 'off')
  assert.equal(f.command.data.run(), true)
  assert.equal(f.saved.get('inbox-only'), 'on')
  assert.equal(f.attributes.get('data-codex-inbox-only'), 'on')
  assert.match((await fixture(f.saved.get('inbox-only'))).command.data.detail(), /^On/)
  assert.equal(f.command.data.run(), true)
  assert.equal(f.saved.get('inbox-only'), 'off')
  assert.match((await fixture(f.saved.get('inbox-only'))).command.data.detail(), /^Off/)
})

for (const initial of [true, 1, 'true', 'ON', {}, null]) test(`invalid stored choice ${JSON.stringify(initial)} stays Off without mutation`, async () => {
  const f = await fixture(initial)
  assert.match(f.command.data.detail(), /^Off/)
  assert.equal(f.attributes.get('data-codex-inbox-only'), 'off')
  assert.deepEqual(f.writes, [])
})

for (const kind of ['read', 'throw', 'silent', 'afterWrite']) test(`save ${kind} failure never hides or claims success`, async () => {
  const f = await fixture(undefined, { [kind]: true })
  assert.equal(f.command.data.run(), false)
  assert.match(f.command.data.detail(), /^Off/)
  assert.equal(f.attributes.get('data-codex-inbox-only'), 'off')
  assert.equal(f.notices.at(-1).kind, 'error')
  assert.match(f.notices.at(-1).message, /could not be saved/i)
})

test('failed Off save retains accepted On state and reports failure', async () => {
  const f = await fixture('on')
  f.faults.silent = true
  assert.equal(f.command.data.run(), false)
  assert.match(f.command.data.detail(), /^On/)
  assert.equal(f.attributes.get('data-codex-inbox-only'), 'on')
  f.faults.silent = false
  assert.equal(f.command.data.run(), true)
  assert.match(f.command.data.detail(), /^Off/)
})
