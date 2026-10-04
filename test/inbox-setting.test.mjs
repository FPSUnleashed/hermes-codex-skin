import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

async function fixture(initial = {}) {
  const values = new Map(Object.entries(initial)), registrations = []
  const internals = await loadPluginInternals(['readCodexInboxMode'], {
    jsx: (type, props) => ({ type, props }),
    window: { dispatchEvent() {} }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } }
  })
  internals.plugin.register({
    onDispose() {},
    storage: { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) },
    register: entry => registrations.push(entry)
  })
  return { values, internals, registrations, command: registrations.find(entry => entry.id === 'toggle-inbox') }
}

test('Inbox defaults On without writing an implicit preference and keeps explicit Off after reload', async () => {
  const fresh = await fixture()
  assert.ok(fresh.command, 'Inbox must have its native command-palette setting')
  assert.equal(fresh.command.area, 'palette')
  assert.equal(fresh.command.data.label, 'Codex Skin: Inbox')
  assert.equal(fresh.command.data.detail(), 'On')
  assert.equal(fresh.values.has('inbox'), false)
  fresh.command.data.run()
  assert.equal(fresh.command.data.detail(), 'Off')
  assert.equal(fresh.values.get('inbox'), 'off')
  const reloaded = await fixture({ inbox: 'off' })
  assert.equal(reloaded.command.data.detail(), 'Off')
  reloaded.command.data.run()
  assert.equal(reloaded.command.data.detail(), 'On')
  assert.equal(reloaded.values.get('inbox'), 'on')
})

test('a silent storage failure neither changes Inbox mode nor broadcasts success', async () => {
  const notifications = [], events = [], modes = []
  const internals = await loadPluginInternals(['setCodexInboxMode'], {
    host: { state: {}, onEvent: () => () => {}, notify: event => notifications.push(event) },
    window: { dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } }
  })
  internals.plugin.register({ storage: { get: (_key, fallback) => fallback, set() {} }, onDispose() {}, register() {} })
  assert.equal(internals.setCodexInboxMode('off', { setMode: value => modes.push(value) }), 'on')
  assert.equal(modes.length, 0)
  assert.equal(events.length, 0)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].kind, 'error')
})

test('Inbox does not attach its data lifetime to any rendered contribution', async () => {
  const f = await fixture()
  const observers = f.registrations.filter(entry => entry.id === 'inbox-runtime')
  assert.equal(observers.length, 0, 'a hidden statusbar must not unmount the data observer')
})
