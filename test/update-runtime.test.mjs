import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash, webcrypto } from 'node:crypto'
import vm from 'node:vm'
import test from 'node:test'
const runtime = await readFile(new URL('../src/update-runtime.js', import.meta.url), 'utf8')
const repo = 'FPSUnleashed/hermes-codex-skin-dev'
const root = '/local/desktop-plugins', target = `${root}/codex-chat-look/plugin.js`
const a = "const ID = 'codex-chat-look'\nconst BUILD_ID = 'v1.8.0-test.1'\n"
const b = "const ID = 'codex-chat-look'\nconst BUILD_ID = 'v1.8.0-test.2'\n"
const hash = text => createHash('sha256').update(text).digest('hex')
function api(version = 'v1.8.0-test.1') {
 const context = vm.createContext({ BUILD_ID: version, ID: 'codex-chat-look', crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, AbortController, AbortSignal, setTimeout, clearTimeout, console, document: { documentElement: { dataset: { codexChatLookBuild: version } } }, matchMedia: () => ({ matches: false }) })
 vm.runInContext(runtime + '\nglobalThis.exports={createSkinUpdater,compareUpdateVersions,updateAssetFor,normalizeUpdateRoot,UPDATE_INTERVAL_MS,CodexUpdateRuntime};', context)
 return context.exports
}
function fixture({ content = b, tamper = false, failDownload = false, corruptWrite = false } = {}) {
 const files = new Map([[target, a], [`${root}/codex-chat-look/update-test-access.json`, JSON.stringify({ repository: repo, token: 'test-fixture-token' })]])
 const values = new Map(), calls = [], writes = []
 const storage = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value), remove: key => values.delete(key) }
 const asset = { id: 101, name: 'plugin.js', size: Buffer.byteLength(content), digest: 'sha256:' + hash(content), url: `https://api.github.com/repos/${repo}/releases/assets/101` }
 const releases = [{ id: 2, tag_name: 'v1.8.0-test.2', prerelease: true, draft: false, body: '# Real test notes\n- Test change', assets: [asset] }]
 let corruptOnce = corruptWrite
 const native = {
  desktopPluginsRoot: async () => root,
  readPluginSource: async path => { if (!files.has(path)) throw new Error('Missing fixture path'); return { text: files.get(path), truncated: false } },
  writeTextFile: async (path, text) => { writes.push(path); files.set(path, path === target && corruptOnce ? 'corrupted' : text); if (path === target) corruptOnce = false; return { path } }
 }
 const fetcher = async (url, options) => {
  calls.push({ url, options })
  if (url.includes('/assets/')) return failDownload ? new Response('', { status: 503 }) : new Response(tamper ? content.replace('test.2', 'test.9') : content)
  return Response.json(releases)
 }
 const updater = api().createSkinUpdater(storage, native, fetcher)
 return { updater, files, values, storage, native, fetcher, calls, writes, releases, asset }
}
test('release comparison and asset admission are strict', () => {
 const u = api()
 assert.equal(u.UPDATE_INTERVAL_MS, 3600000)
 assert.equal(u.compareUpdateVersions('v1.8.0-test.2', 'v1.8.0-test.1'), 1)
 assert.equal(u.compareUpdateVersions('v1.8.0', 'v1.8.0-test.2'), 1)
 assert.equal(u.compareUpdateVersions('v1.7.0', 'v1.8.0-test.1'), -1)
 assert.equal(u.compareUpdateVersions('latest', 'v1.8.0'), null)
 const f = fixture()
 try {
  assert.ok(u.updateAssetFor(f.releases[0]))
  assert.equal(u.updateAssetFor({ ...f.releases[0], draft: true }), null)
  assert.equal(u.updateAssetFor({ ...f.releases[0], assets: [{ ...f.asset, url: 'https://example.invalid/steal' }] }), null)
  assert.equal(u.updateAssetFor({ ...f.releases[0], assets: [{ ...f.asset, digest: null }] }), null)
  assert.equal(api('v1.8.0').updateAssetFor(f.releases[0]), null)
 } finally { f.updater.dispose() }
})
test('verified A to B writes only local skin paths; success requires loading B', async () => {
 const f = fixture()
 let next
 try {
  f.updater.accept(await f.updater.firstPage())
  assert.equal(f.updater.state.phase, 'available')
  await Promise.all([f.updater.install(), f.updater.install()])
  assert.equal(f.calls.filter(call => call.url.includes('/assets/')).length, 1)
  assert.equal(f.files.get(target), b)
  assert.equal(f.files.get(`${root}/codex-chat-look/update-rollback.js`), a)
  assert.equal(f.updater.state.phase, 'awaiting-reload', 'writing bytes alone is not success')
  assert.equal(f.values.get('last-update'), undefined)
  assert.ok(f.calls.every(call => call.url.startsWith(`https://api.github.com/repos/${repo}/releases`)))
  assert.ok(f.calls.every(call => call.options.headers.Authorization === 'Bearer test-fixture-token' && call.options.credentials === 'omit'))
  assert.ok(f.writes.every(path => path.startsWith(root + '/codex-chat-look/')))
  f.updater.dispose()
  next = api('v1.8.0-test.2').createSkinUpdater(f.storage, f.native, f.fetcher)
  await next.initialize()
  assert.equal(next.state.phase, 'done')
  assert.equal(f.values.get('last-update').digest, hash(b))
  assert.equal(f.values.has('update-pending'), false)
 } finally { f.updater.dispose(); next?.dispose() }
})
for (const [name, options] of [
 ['digest mismatch', { tamper: true }], ['network failure', { failDownload: true }],
 ['wrong plugin identity', { content: b.replace('codex-chat-look', 'different-plugin') }],
 ['wrong build version', { content: b.replace('test.2', 'test.8') }]
]) test(`${name} never replaces the working file`, async () => {
 const f = fixture(options)
 try { f.updater.accept(await f.updater.firstPage()); await f.updater.install(); assert.equal(f.updater.state.phase, 'error'); assert.equal(f.files.get(target), a); assert.equal(f.writes.includes(target), false); assert.equal(f.values.has('update-pending'), false) }
 finally { f.updater.dispose() }
})
test('a corrupted install is restored from the previous bytes', async () => {
 const f = fixture({ corruptWrite: true })
 try { f.updater.accept(await f.updater.firstPage()); await f.updater.install(); assert.equal(f.updater.state.phase, 'error'); assert.equal(f.files.get(target), a); assert.equal(f.values.has('update-pending'), false) }
 finally { f.updater.dispose() }
})
test('no newer release means no button; unsupported shell fails closed', async () => {
 const f = fixture()
 try {
  f.updater.accept({ releases: [{ ...f.releases[0], tag_name: 'v1.8.0-test.1' }], checkedAt: Date.now() })
  assert.equal(f.updater.state.phase, 'idle')
  const unsupported = api().createSkinUpdater(f.storage, {}, f.fetcher)
  try { assert.equal(unsupported.capable, false); await assert.rejects(unsupported.initialize(), /does not support/); assert.equal(f.calls.length, 0) }
  finally { unsupported.dispose() }
 } finally { f.updater.dispose() }
})

test('remount recovers a pending update after the old React controller was disposed', async () => {
 const f = fixture(); let replacement
 try {
  f.updater.accept(await f.updater.firstPage()); await f.updater.install(); f.updater.dispose()
  f.values.get('update-pending').startedAt = Date.now() - 10001
  replacement = api().createSkinUpdater(f.storage, f.native, f.fetcher)
  await replacement.initialize(); await new Promise(resolve => setTimeout(resolve, 60))
  assert.equal(f.files.get(target), a); assert.equal(f.values.has('update-pending'), false); assert.equal(replacement.state.phase, 'error')
 } finally { f.updater.dispose(); replacement?.dispose() }
})
test('unverified rollback retains its receipt and never claims success', async () => {
 const f = fixture(); const write = f.native.writeTextFile
 f.native.writeTextFile = async (path, text) => write(path, path === target ? 'persistently corrupted' : text)
 try {
  f.updater.accept(await f.updater.firstPage()); await f.updater.install()
  assert.equal(f.updater.state.phase, 'error'); assert.equal(f.values.has('update-pending'), true)
  assert.match(f.updater.state.error, /Restoration could not be verified/)
  assert.equal(f.files.get(`${root}/codex-chat-look/update-rollback.js`), a)
 } finally { f.updater.dispose() }
})
test('streamless response is rejected without allocating an unbounded arrayBuffer', async () => {
 const f = fixture(); let allocated = false
 const u = api().createSkinUpdater(f.storage, f.native, (url, options) => url.includes('/assets/') ? Promise.resolve({ ok: true, body: null, arrayBuffer() { allocated = true; throw new Error('unsafe buffer') } }) : f.fetcher(url, options))
 try { u.accept(await u.firstPage()); await u.install(); assert.equal(allocated, false); assert.equal(u.state.phase, 'error'); assert.equal(f.files.get(target), a) }
 finally { f.updater.dispose(); u.dispose() }
})
test('native plugin roots require an absolute path without traversal', () => {
 const normalize = api().normalizeUpdateRoot
 assert.equal(normalize('/Users/name/.hermes/desktop-plugins/'), '/Users/name/.hermes/desktop-plugins')
 assert.equal(normalize('C:\\Users\\name\\.hermes\\desktop-plugins'), 'C:/Users/name/.hermes/desktop-plugins')
 for (const path of ['relative/desktop-plugins', '/tmp/../desktop-plugins', '/tmp/not-plugins', '/tmp/\u0000/desktop-plugins']) assert.throws(() => normalize(path))
})
