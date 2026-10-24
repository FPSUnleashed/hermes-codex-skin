import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

async function fixture(initial = {}) {
  const values = new Map(Object.entries(initial))
  const attributes = new Map()
  const registrations = []
  const notices = []
  const storage = {
    get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value)
  }
  const internals = await loadPluginInternals(
    ['readFloatingSidebarMode', 'setFloatingSidebarMode', 'syncFloatingSidebarRoot'],
    { document: { documentElement: { setAttribute: (key, value) => attributes.set(key, value) } } }
  )
  internals.plugin.register({ storage, onDispose: () => {}, register: item => registrations.push(item) })
  internals.syncFloatingSidebarRoot?.()
  return { values, attributes, registrations, storage, internals, notices }
}

test('Floating sidebar palette entry defaults On and persists both choices across reload', async () => {
  const f = await fixture()
  const command = f.registrations.find(item => item.id === 'toggle-floating-sidebar')
  assert.ok(command, 'Floating sidebar command must be registered')
  assert.equal(command.data.label, 'Codex Skin: Floating sidebar')
  assert.equal(command.data.detail(), 'On')
  assert.equal(command.data.detailVariant, 'state')
  assert.equal(command.data.keepOpen, true)
  assert.equal(f.values.has('floating-sidebar'), false, 'default is not an implicit user choice')
  command.data.run()
  assert.equal(command.data.detail(), 'Off')
  assert.equal(f.values.get('floating-sidebar'), 'off')
  assert.equal(f.attributes.get('data-codex-floating-sidebar'), 'off')
  const reloaded = await fixture(Object.fromEntries(f.values))
  assert.equal(reloaded.internals.readFloatingSidebarMode(), 'off')
  command.data.run()
  assert.equal(command.data.detail(), 'On')
  assert.equal(f.values.get('floating-sidebar'), 'on')
  assert.equal(f.attributes.get('data-codex-floating-sidebar'), 'on')
  assert.equal((await fixture(Object.fromEntries(f.values))).internals.readFloatingSidebarMode(), 'on')
})

test('Floating sidebar does not update presentation when persistence fails', async () => {
  const f = await fixture()
  f.storage.set = () => { throw Error('quota') }
  assert.equal(f.internals.setFloatingSidebarMode('off'), false)
  assert.equal(f.attributes.get('data-codex-floating-sidebar'), 'on')
  f.storage.set = () => {}
  assert.equal(f.internals.setFloatingSidebarMode('off'), false, 'readback must reject silent write failure')
  assert.equal(f.attributes.get('data-codex-floating-sidebar'), 'on')
})

test('unreadable Floating sidebar storage uses the normal layout without writing', async () => {
  const f = await fixture()
  f.storage.get = (key, fallback) => { if (key === 'floating-sidebar') throw Error('unavailable'); return fallback }
  f.storage.set = () => assert.fail('must not overwrite an unreadable setting')
  assert.equal(f.internals.syncFloatingSidebarRoot(), 'off')
  assert.equal(f.internals.setFloatingSidebarMode('on'), false)
  assert.equal(f.attributes.get('data-codex-floating-sidebar'), 'off')
})
