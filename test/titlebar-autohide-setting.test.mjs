import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

async function setup(values = new Map(), storageError = false) {
  const attributes = new Map()
  const writes = []
  const entries = []
  const storage = {
    get(key, fallback) {
      if (storageError) throw new Error('Storage unavailable')
      return values.has(key) ? values.get(key) : fallback
    },
    set(key, value) {
      writes.push([key, value])
      values.set(key, value)
    }
  }
  const internals = await loadPluginInternals(['syncTitlebarAutohideRoot'], {
    document: { documentElement: { setAttribute: (key, value) => attributes.set(key, value) } },
    window: { Event: class Event {}, dispatchEvent: () => {} }
  })
  internals.plugin.register({ storage, register: entry => entries.push(entry) })
  const command = entries.find(entry => entry.id === 'toggle-titlebar-autohide').data
  return { ...internals, attributes, writes, values, command }
}

test('unconfigured titlebar autohide defaults to On without recording a user choice', async () => {
  const app = await setup()
  assert.equal(app.command.detail(), 'On')
  assert.equal(app.syncTitlebarAutohideRoot(), 'on')
  assert.equal(app.attributes.get('data-codex-titlebar-autohide'), 'on')
  assert.deepEqual(app.writes, [])
  assert.equal(app.values.has('titlebar-autohide'), false)
})

for (const mode of ['on', 'off']) {
  test(`saved ${mode} choice survives registration and reload without writes`, async () => {
    const values = new Map([['titlebar-autohide', mode]])
    for (let reload = 0; reload < 2; reload++) {
      const app = await setup(values)
      assert.equal(app.syncTitlebarAutohideRoot(), mode)
      assert.equal(app.command.detail(), mode === 'on' ? 'On' : 'Off')
      assert.deepEqual(app.writes, [])
      assert.equal(values.get('titlebar-autohide'), mode)
    }
  })
}

test('palette can disable the new default and re-enable it across reloads', async () => {
  const app = await setup()
  app.command.run()
  assert.deepEqual(app.writes, [['titlebar-autohide', 'off']])
  assert.equal(app.attributes.get('data-codex-titlebar-autohide'), 'off')
  const reloaded = await setup(app.values)
  assert.equal(reloaded.command.detail(), 'Off')
  reloaded.command.run()
  assert.deepEqual(reloaded.writes, [['titlebar-autohide', 'on']])
  assert.equal(reloaded.attributes.get('data-codex-titlebar-autohide'), 'on')
  assert.equal((await setup(app.values)).command.detail(), 'On')
})

test('unreadable or invalid stored settings keep the titlebar visible without overwriting them', async () => {
  for (const value of [null, 'invalid', false]) {
    const app = await setup(new Map([['titlebar-autohide', value]]))
    assert.equal(app.syncTitlebarAutohideRoot(), 'off')
    assert.deepEqual(app.writes, [])
    assert.equal(app.values.get('titlebar-autohide'), value)
  }
  const app = await setup(new Map(), true)
  assert.equal(app.syncTitlebarAutohideRoot(), 'off')
  assert.deepEqual(app.writes, [])
})
