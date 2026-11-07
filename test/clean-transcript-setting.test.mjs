import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

async function pluginFixture(initialStorage = {}, unreadable = false) {
  const values = new Map(Object.entries(initialStorage))
  const registrations = [], disposals = [], reads = [], writes = [], events = []
  const attributes = new Map()
  const document = { documentElement: {
    getAttribute: name => attributes.get(name) ?? null,
    removeAttribute: name => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, String(value))
  } }
  const internals = await loadPluginInternals(
    ['__pluginDefault', 'readCleanTranscriptMode', 'setCleanTranscriptMode', 'syncCleanTranscriptRoot', 'reconcileCleanTranscript', 'reconcileTurnActivity'],
    { document, window: { dispatchEvent: event => events.push(event.type), Event, location: { hash: '#/theme-test' } } }
  )
  internals.__pluginDefault.register({
    onDispose: fn => disposals.push(fn),
    storage: {
      get(key, fallback) { reads.push(key); if (unreadable && key === 'clean-transcript') throw Error('unavailable'); return values.has(key) ? values.get(key) : fallback },
      set(key, value) { writes.push(key); values.set(key, value) }
    },
    register: contribution => registrations.push(contribution)
  })
  return { values, registrations, attributes, reads, writes, events, internals, close() { for (const fn of disposals.reverse()) fn() } }
}

function retiredPathAbsent(fixture) {
  assert.equal(fixture.registrations.some(item => item.id === 'toggle-clean-transcript'), false)
  for (const name of ['readCleanTranscriptMode', 'setCleanTranscriptMode', 'syncCleanTranscriptRoot', 'reconcileCleanTranscript']) assert.equal(fixture.internals[name], null, name)
  assert.equal(typeof fixture.internals.reconcileTurnActivity, 'function')
  assert.equal(fixture.attributes.has('data-codex-clean-transcript'), false)
  assert.equal(fixture.reads.includes('clean-transcript'), false)
  assert.equal(fixture.writes.includes('clean-transcript'), false)
  assert.deepEqual(fixture.events, [])
  assert.ok(fixture.registrations.some(item => item.id === 'toggle-complete-messages'), 'unrelated current setting is retained')
}

test('retired Clean transcript has no implicit default, hide-all attribute or storage write', async () => {
  const f = await pluginFixture()
  try { retiredPathAbsent(f); assert.equal(f.values.has('clean-transcript'), false) } finally { f.close() }
})

test('palette omits the retired Clean transcript command without removing current settings', async () => {
  const f = await pluginFixture({ 'clean-transcript': 'off' })
  try { retiredPathAbsent(f); assert.equal(f.values.get('clean-transcript'), 'off') } finally { f.close() }
})

test('legacy Off cannot reactivate the old path through initialization or reload', async () => {
  for (let i = 0; i < 2; i++) {
    const f = await pluginFixture({ 'clean-transcript': 'off' })
    try { retiredPathAbsent(f); assert.equal(f.values.get('clean-transcript'), 'off') } finally { f.close() }
  }
})

test('legacy On cannot reactivate hide-all and is not silently rewritten across reload', async () => {
  for (let i = 0; i < 2; i++) {
    const f = await pluginFixture({ 'clean-transcript': 'on' })
    try { retiredPathAbsent(f); assert.equal(f.values.get('clean-transcript'), 'on') } finally { f.close() }
  }
})

test('unreadable retired storage is never consulted or overwritten', async () => {
  const f = await pluginFixture({}, true)
  try { retiredPathAbsent(f); assert.equal(f.values.has('clean-transcript'), false) } finally { f.close() }
})
