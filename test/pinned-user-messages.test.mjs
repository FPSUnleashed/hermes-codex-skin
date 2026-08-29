import assert from 'node:assert/strict'
import test from 'node:test'

import { loadPluginInternals } from './helpers/load-plugin.mjs'

function rootFixture() {
  const attributes = new Map()
  return {
    attributes,
    document: {
      documentElement: {
        getAttribute: name => attributes.get(name) ?? null,
        removeAttribute: name => attributes.delete(name),
        setAttribute: (name, value) => attributes.set(name, String(value))
      }
    }
  }
}

async function pluginFixture(initialStorage = {}) {
  const values = new Map(Object.entries(initialStorage))
  const registrations = []
  const root = rootFixture()
  const internals = await loadPluginInternals(
    [
      '__pluginDefault',
      'readPinnedUserMessagesMode',
      'setPinnedUserMessagesMode',
      'syncPinnedUserMessagesRoot'
    ],
    { document: root.document }
  )

  internals.__pluginDefault.register({
    storage: {
      get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
      set: (key, value) => values.set(key, value)
    },
    register: contribution => registrations.push(contribution)
  })

  return { internals, registrations, root, values }
}

test('pinned user messages preserve Hermes behavior by default', async () => {
  const fixture = await pluginFixture()

  assert.equal(fixture.internals.readPinnedUserMessagesMode(), 'hermes')
  assert.equal(fixture.internals.syncPinnedUserMessagesRoot(), 'hermes')
  assert.equal(fixture.root.attributes.get('data-codex-pinned-user-messages'), 'hermes')
})

test('palette setting toggles Off and persists it across a plugin reload', async () => {
  const fixture = await pluginFixture()
  const command = fixture.registrations.find(item => item.id === 'toggle-pinned-user-messages')

  assert.ok(command)
  assert.equal(command.data.label, 'Codex Skin: Pinned user messages')
  assert.equal(command.data.detail(), 'Hermes')

  command.data.run()
  assert.equal(fixture.values.get('pinned-user-messages'), 'off')
  assert.equal(fixture.root.attributes.get('data-codex-pinned-user-messages'), 'off')
  assert.equal(command.data.detail(), 'Off')

  const reloaded = await pluginFixture({ 'pinned-user-messages': fixture.values.get('pinned-user-messages') })
  assert.equal(reloaded.internals.readPinnedUserMessagesMode(), 'off')
  assert.equal(reloaded.internals.syncPinnedUserMessagesRoot(), 'off')

  reloaded.internals.setPinnedUserMessagesMode('hermes')
  assert.equal(reloaded.values.get('pinned-user-messages'), 'hermes')
  assert.equal(reloaded.root.attributes.get('data-codex-pinned-user-messages'), 'hermes')
})
