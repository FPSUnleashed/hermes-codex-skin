import { testDependencyRequire } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const nativeRequire = testDependencyRequire()
const asModule = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64')
const token = 'phc_OnlySyntheticPublicProjectToken1234'
const host = 'https://eu.i.posthog.com'
async function load(configured = false) {
  let source = await readFile(process.env.CODEX_ANALYTICS_TEST_BUNDLE || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
  if (configured) source = source.replace(/const CODEX_ANALYTICS_PROJECT = Object\.freeze\([^\n]+\)/, `const CODEX_ANALYTICS_PROJECT = Object.freeze(${JSON.stringify({ token, host })})`)
  const sdk = asModule(`export const host=globalThis.__analyticsTestHost, PALETTE_AREA='palette',THEMES_AREA='themes',queryClient={};export const useQuery=()=>({}),useValue=atom=>atom?.get?.(),profileColor=()=>null,profileColorSoft=()=>null;`)
  const imports = { '@hermes/plugin-sdk': sdk, react: pathToFileURL(nativeRequire.resolve('react')).href, 'react/jsx-runtime': pathToFileURL(nativeRequire.resolve('react/jsx-runtime')).href }
  source = source.replace(/from '([^']+)'/g, (_match, name) => { assert.ok(imports[name]); return `from '${imports[name]}'` })
  source += '\nexport {createCodexSkinAnalytics,CODEX_ANALYTICS_FEATURES,CODEX_ANALYTICS_FAILURES,installCodexSkinAnalytics,codexSkinSettingAction};'
  const directory = await mkdtemp(join(tmpdir(), 'codex-analytics-esm-'))
  try {
    const file = join(directory, 'plugin.mjs')
    await writeFile(file, source)
    return await import(pathToFileURL(file).href)
  } finally { await rm(directory, { recursive: true, force: true }) }
}
// The shipping ESM owns reload-retention WeakMaps on window. Keep this a
// headless host (no document or confirm), not a fabricated native component.
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
globalThis.window = Object.create(null)
test.after(() => {
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
  else delete globalThis.window
})
globalThis.__analyticsTestHost = { state: { profile: { get: () => 'default' }, activeSessionId: { get: () => null } }, notify: () => {} }
const runtime = await load()

function fixture(extra = {}) {
  let time = Date.parse('2026-10-31T12:00:00Z'), serial = 0, randoms = 0, writes = 0
  const jobs = new Map(), records = new Map(), calls = []
  const document = new EventTarget(); document.visibilityState = 'visible'
  const listeners = new Set(), add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document)
  document.addEventListener = (type, fn) => { listeners.add(fn); add(type, fn) }
  document.removeEventListener = (type, fn) => { listeners.delete(fn); remove(type, fn) }
  const timers = { setTimeout(fn, ms) { const id = ++serial; jobs.set(id, { fn, at: time + ms }); return id }, clearTimeout(id) { jobs.delete(id) }, setInterval(fn, ms) { const id = ++serial; jobs.set(id, { fn, at: time + ms, interval: ms }); return id }, clearInterval(id) { jobs.delete(id) } }
  const storage = { get: (key, fallback) => records.has(key) ? structuredClone(records.get(key)) : fallback, set: (key, value) => { writes++; records.set(key, structuredClone(value)) } }
  const config = { storage, token, host, version: 'v1.12.0', document, navigator: { platform: 'Linux x86_64' }, timers, now: () => time,
    crypto: { getRandomValues(bytes) { randoms++; bytes.fill(randoms); return bytes } },
    request: async (url, options) => { calls.push({ url, options, decoded: JSON.parse(options.body) }); return { ok: true, status: 200 } }, ...extra }
  const create = () => runtime.createCodexSkinAnalytics(config)
  const advance = async ms => {
    const until = time + ms
    for (let safety = 0; safety < 100000; safety++) {
      const entry = [...jobs.entries()].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!entry) { time = until; return }
      const [id, job] = entry; time = job.at
      if (job.interval) job.at += job.interval; else jobs.delete(id)
      job.fn(); await Promise.resolve(); await Promise.resolve()
    }
    throw Error('Timer loop')
  }
  return { config, create, calls, records, storage, document, jobs, listeners, advance, randoms: () => randoms, writes: () => writes, setTime: value => { time = value } }
}

test('new shipping runtime: no ID, writes, timers, listener or network before explicit opt-in', async () => {
  const f = fixture(), a = f.create()
  assert.equal(a.configured, true); assert.equal(a.isEnabled(), false)
  assert.equal(a.used('inbox'), false); assert.equal(a.failed('settle', 'storage_write'), false)
  await f.advance(120000)
  assert.equal(f.randoms(), 0); assert.equal(f.writes(), 0); assert.equal(f.records.size, 0)
  assert.equal(f.calls.length, 0); assert.equal(f.jobs.size, 0); assert.equal(f.listeners.size, 0)
  a.dispose()
})

test('decoded official event POST has exact fields, no browser/content enrichment and a pseudonymous ID', async () => {
  const f = fixture(), a = f.create()
  assert.equal(a.setConsent(true), true)
  const id = f.records.get('usage-consent-v1').id
  assert.match(id, /^cs_[a-f0-9]{32}$/)
  await f.advance(250)
  const { url, options, decoded } = f.calls[0]
  assert.equal(url, host + '/i/v0/e/'); assert.equal(options.credentials, 'omit')
  assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.keepalive, false); assert.equal(options.redirect, 'error')
  assert.deepEqual(options.headers, { 'Content-Type': 'application/json' })
  assert.deepEqual(Object.keys(decoded).sort(), ['api_key', 'distinct_id', 'event', 'properties', 'timestamp'])
  assert.equal(decoded.distinct_id, id); assert.equal(decoded.event, 'codex_skin_active')
  assert.deepEqual(decoded.properties, { plugin_version: 'v1.12.0', os_family: 'linux', is_test: false, $process_person_profile: false, $geoip_disable: true })
  assert.equal(a.used('snooze'), true); assert.equal(a.failed('settle', 'storage_write'), true)
  await f.advance(500)
  assert.deepEqual(f.calls[1].decoded.properties, { ...decoded.properties, feature: 'snooze' })
  assert.deepEqual(f.calls[2].decoded.properties, { ...decoded.properties, feature: 'settle', failure_category: 'storage_write' })
  a.dispose()
})

test('closed event/property enums reject secret, content, identity, URL, prototype and type attacks', async () => {
  const f = fixture(), a = f.create(); a.setConsent(true)
  for (const name of ['$identify', '$pageview', '$snapshot', '$exception', 'codex_skin_feature_used secret']) assert.equal(a.capture(name), false)
  for (const key of ['prompt', 'message', 'title', 'session_id', 'profile', 'path', '$current_url', '$host', '$raw_user_agent', '$ip', '$geoip_disable', '$set', 'stack', 'email', 'api_key', 'is_test', 'plugin_version']) {
    assert.equal(a.capture('codex_skin_feature_used', { feature: 'inbox', [key]: 'private data' }), false, key)
  }
  for (const feature of ['constructor', '__proto__', ['inbox'], new String('inbox'), null, 'private-session']) assert.equal(a.used(feature), false)
  for (const category of ['raw-error-secret', ['storage_write'], {}, null]) assert.equal(a.failed('inbox', category), false)
  assert.equal(a.capture('codex_skin_active', { feature: 'inbox' }), false)
  assert.equal(a.capture('codex_skin_feature_used', Object.create({ feature: 'inbox' })), false)
  assert.equal(a.capture('codex_skin_feature_used', { get feature() { throw Error('secret') } }), false)
  assert.equal(a.capture('codex_skin_feature_failed', { feature: 'inbox' }), false)
  await f.advance(500)
  assert.equal(f.calls.length, 1)
  assert.deepEqual(runtime.CODEX_ANALYTICS_FEATURES, ['inbox', 'snooze', 'restore', 'settle', 'settings', 'theme', 'complete_messages', 'collapse'])
  assert.deepEqual(runtime.CODEX_ANALYTICS_FAILURES, ['storage_write', 'storage_readback', 'action_failed'])
  for (const feature of runtime.CODEX_ANALYTICS_FEATURES) assert.equal(a.used(feature), true)
  await f.advance(3000); assert.equal(f.calls.length, 9)
  a.dispose()
})

test('opt-out clears queued events and stored ID; next explicit opt-in rotates it', async () => {
  const f = fixture(), a = f.create(); a.setConsent(true)
  const original = f.records.get('usage-consent-v1').id
  a.used('inbox'); assert.equal(a.setConsent(false), true)
  assert.deepEqual(f.records.get('usage-consent-v1'), { v: 1, enabled: false })
  await f.advance(10000); assert.equal(f.calls.length, 0); assert.equal(f.jobs.size, 0); assert.equal(f.listeners.size, 0)
  assert.equal(a.used('settings'), false); assert.equal(a.setConsent(true), true)
  assert.notEqual(f.records.get('usage-consent-v1').id, original)
  a.dispose(); assert.equal(f.jobs.size, 0); assert.equal(f.listeners.size, 0); assert.equal(a.setConsent(true), false)
})

test('storage write, swallowed write, readback and privacy-signal failures never activate telemetry', async () => {
  for (const mode of ['throw', 'swallow', 'readback']) {
    const f = fixture(); let set = false
    f.config.storage = { get() { if (mode === 'readback' && set) throw Error('private secret'); return null }, set() { set = true; if (mode === 'throw') throw Error('quota') } }
    const a = f.create(); assert.equal(a.setConsent(true), false); await f.advance(1000)
    assert.equal(a.isEnabled(), false); assert.equal(f.calls.length, 0); assert.equal(f.jobs.size, 0); assert.equal(f.listeners.size, 0)
    a.dispose()
  }
  for (const nav of [{ doNotTrack: '1' }, { doNotTrack: 'yes' }, { globalPrivacyControl: true }]) {
    const f = fixture({ navigator: nav }), a = f.create(); assert.equal(a.setConsent(true), false)
    assert.equal(f.randoms(), 0); assert.equal(f.writes(), 0); assert.equal(f.jobs.size, 0)
    a.dispose()
  }
})

test('pending or invalid public project config cannot activate or create an ID', () => {
  for (const config of [{ token: null, host: null }, { token: 'phx_private_personal_key' }, { host: 'https://eu.i.posthog.com/evil' }, { host: 'https://attacker.example' }, { host: 'http://eu.i.posthog.com' }]) {
    const f = fixture(config), a = f.create(); assert.equal(a.configured, false); assert.equal(a.setConsent(true), false)
    assert.equal(f.randoms(), 0); assert.equal(f.writes(), 0); a.dispose()
  }
})

test('daily visible active installation event dedupes heartbeat, hot reload and route-independent lifetime', async () => {
  const f = fixture(); f.document.visibilityState = 'hidden'
  let a = f.create(); assert.equal(a.setConsent(true), true); await f.advance(120000); assert.equal(f.calls.length, 0)
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange'))
  await f.advance(250); assert.equal(f.calls.length, 1)
  await f.advance(60000); assert.equal(f.calls.length, 1)
  a.dispose(); a = f.create(); await f.advance(1000); assert.equal(f.calls.length, 1)
  assert.equal(f.listeners.size, 1)
  f.setTime(Date.parse('2026-11-01T12:00:00Z'))
  f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange')); assert.equal(a.used('inbox'), false)
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange'))
  await f.advance(250); assert.equal(f.calls.length, 2)
  a.dispose(); assert.equal(f.listeners.size, 0); assert.equal(f.jobs.size, 0)
})

test('bounded queue and per-minute cap do not spin or retry failed transport', async () => {
  const f = fixture({ request: () => { throw Error('raw transport secret') } }), a = f.create(); a.setConsent(true)
  const results = Array.from({ length: 1000 }, () => a.used('inbox'))
  assert.equal(results.filter(Boolean).length, 19)
  assert.equal(f.jobs.size, 2)
  await f.advance(10000); assert.equal(f.jobs.size, 1)
  const more = Array.from({ length: 100 }, () => a.used('inbox'))
  assert.equal(more.filter(Boolean).length, 10)
  await f.advance(10000); assert.equal(a.used('inbox'), false)
  a.dispose(); assert.equal(f.jobs.size, 0)
})

test('in-flight opt-out aborts transport immediately and retained callbacks cannot emit', async () => {
  let signal
  const f = fixture({ request: (_url, options) => { signal = options.signal; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))) } })
  const a = f.create(); a.setConsent(true); await f.advance(250); assert.equal(signal.aborted, false)
  a.used('inbox'); assert.equal(a.setConsent(false), true); assert.equal(signal.aborted, true)
  await f.advance(10000); assert.equal(f.jobs.size, 0); assert.equal(a.used('inbox'), false)
  a.dispose()
})

test('timeout aborts, errors fail open and is_test is true only by explicit constructor option', async () => {
  let signal
  const f = fixture({ isTest: true, request: (_url, options) => { signal = options.signal; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))) } })
  const a = f.create(); a.setConsent(true); await f.advance(5250); assert.equal(signal.aborted, true)
  assert.equal(a.isEnabled(), true); a.dispose()
  for (const isTest of [true, false, 'true', 1, null]) {
    const f = fixture({ isTest }), a = f.create(); a.setConsent(true); await f.advance(250)
    assert.equal(f.calls[0].decoded.properties.is_test, isTest === true); a.dispose()
  }
})

test('changed saved consent, unreadable storage and changed privacy signal revoke current lifetime', async () => {
  for (const mode of ['revoke', 'read', 'privacy']) {
    const f = fixture(), a = f.create(); a.setConsent(true)
    if (mode === 'revoke') f.records.set('usage-consent-v1', { v: 1, enabled: false })
    if (mode === 'read') f.config.storage.get = () => { throw Error('unreadable') }
    if (mode === 'privacy') f.config.navigator.globalPrivacyControl = true
    await f.advance(250); assert.equal(f.calls.length, 0); assert.equal(a.isEnabled(), false); assert.equal(f.jobs.size, 0)
    a.dispose()
  }
})

test('actual shipping ESM register owns an off-by-default palette control and disposes old runtime on reload', async () => {
  const entries = [], disposals = [], records = new Map()
  let writes = 0
  const ctx = { storage: { get: (key, fallback) => records.get(key) ?? fallback, set: (key, value) => { writes++; records.set(key, value) } }, register: entry => entries.push(entry), onDispose: fn => disposals.push(fn) }
  runtime.default.register(ctx)
  const command = entries.find(entry => entry.id === 'share-usage-statistics')
  assert.ok(command); assert.equal(command.data.detail(), 'Off'); assert.equal(writes, 0)
  // Native confirm is deliberately absent: no accidental consent in headless
  // or unsupported hosts, even with the public shipping project configured.
  assert.equal(command.data.run(), false); assert.equal(writes, 0)
  for (const dispose of disposals.reverse()) dispose()
  const retained = command.data.run
  assert.equal(retained(), false)
})
