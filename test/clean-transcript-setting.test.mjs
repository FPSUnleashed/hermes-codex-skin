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
  const events = []
  const internals = await loadPluginInternals(
    ['__pluginDefault', 'readCleanTranscriptMode', 'setCleanTranscriptMode', 'syncCleanTranscriptRoot'],
    {
      document: root.document,
      window: {
        dispatchEvent: event => events.push(event.type),
        Event,
        location: { hash: '#/theme-test' }
      }
    }
  )

  internals.__pluginDefault.register({
    storage: {
      get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
      set: (key, value) => values.set(key, value)
    },
    register: contribution => registrations.push(contribution)
  })

  return { events, internals, registrations, root, values }
}

test('Clean transcript is Off by default', async () => {
  const fixture = await pluginFixture()

  assert.equal(fixture.internals.readCleanTranscriptMode(), 'off')
  assert.equal(fixture.internals.syncCleanTranscriptRoot(), 'off')
  assert.equal(fixture.root.attributes.get('data-codex-clean-transcript'), 'off')
})

test('palette setting toggles Clean transcript On and persists it', async () => {
  const fixture = await pluginFixture()
  const command = fixture.registrations.find(item => item.id === 'toggle-clean-transcript')

  assert.ok(command)
  assert.equal(command.data.label, 'Codex Skin: Clean transcript')
  assert.equal(command.data.detail(), 'Off')

  command.data.run()
  assert.equal(fixture.values.get('clean-transcript'), 'on')
  assert.equal(fixture.root.attributes.get('data-codex-clean-transcript'), 'on')
  assert.equal(command.data.detail(), 'On')
  assert.deepEqual(fixture.events, ['codex-chat-look:clean-transcript'])

  const reloaded = await pluginFixture({ 'clean-transcript': fixture.values.get('clean-transcript') })
  assert.equal(reloaded.internals.readCleanTranscriptMode(), 'on')
  assert.equal(reloaded.internals.syncCleanTranscriptRoot(), 'on')

  reloaded.internals.setCleanTranscriptMode('off')
  assert.equal(reloaded.values.get('clean-transcript'), 'off')
  assert.equal(reloaded.root.attributes.get('data-codex-clean-transcript'), 'off')
})
