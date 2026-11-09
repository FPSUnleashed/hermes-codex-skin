// Process/socket protocol tests, NOT a substitute native HTTP server or gate.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveNativeRouterDependency, startNativeRouterServer } from './helpers/native-router-dependency.mjs'

async function fixture(t, script) {
  const directory = await mkdtemp(join(tmpdir(), 'codex-router-dependency-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'protocol-child.py')
  await writeFile(path, script)
  const env = { CODEX_NATIVE_ROUTER_SERVER: path, CODEX_NATIVE_ROUTER_SERVER_SHA256: createHash('sha256').update(script).digest('hex') }
  return { directory, path, env, dependency: resolveNativeRouterDependency(env) }
}
function reachable(baseUrl) {
  const url = new URL(baseUrl)
  return new Promise(resolve => {
    const socket = createConnection({ host: url.hostname, port: Number(url.port) })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false) })
  })
}
const socketOnlyChild = `import json, os, signal, socket, sys, time
s = socket.socket()
s.bind(('127.0.0.1', 0))
s.listen(8)
with open(os.path.join(os.environ['TMPDIR'], sys.argv[1] + '.json'), 'w') as f:
    json.dump({'source': sys.argv[1], 'cwd': os.getcwd(), 'bytecode': os.environ['PYTHONDONTWRITEBYTECODE']}, f)
print('PORT=' + str(s.getsockname()[1]), flush=True)
while True: time.sleep(1)
`

test('external native-router input fails closed on absent, malformed or changed dependency', async t => {
  const f = await fixture(t, socketOnlyChild)
  assert.throws(() => resolveNativeRouterDependency({}), /CODEX_NATIVE_ROUTER_SERVER is not configured/)
  assert.throws(() => resolveNativeRouterDependency({ ...f.env, CODEX_NATIVE_ROUTER_SERVER: 'relative.py' }), /absolute file path/)
  assert.throws(() => resolveNativeRouterDependency({ ...f.env, CODEX_NATIVE_ROUTER_SERVER: join(f.directory, 'absent.py') }), /readable regular file/)
  assert.throws(() => resolveNativeRouterDependency({ ...f.env, CODEX_NATIVE_ROUTER_SERVER: f.directory }), /readable regular file/)
  for (const sha of [undefined, '', 'bad', 'A'.repeat(64), '0'.repeat(64)]) {
    assert.throws(() => resolveNativeRouterDependency({ ...f.env, CODEX_NATIVE_ROUTER_SERVER_SHA256: sha }), /SHA256/)
  }
  assert.throws(() => resolveNativeRouterDependency({ ...f.env, CODEX_NATIVE_PYTHON: 'python' }), /absolute executable path/)
  assert.throws(() => resolveNativeRouterDependency({ ...f.env, CODEX_NATIVE_PYTHON: join(f.directory, 'missing-python') }), /executable file/)
  assert.throws(() => resolveNativeRouterDependency({ ...f.env, CODEX_NATIVE_PYTHON: f.path }), /executable file/)
  await writeFile(f.path, socketOnlyChild + '# modified\n')
  await assert.rejects(startNativeRouterServer({ dependency: f.dependency, source: 'A', root: f.directory, scratch: f.directory }), /SHA256 mismatch/)
})

test('real Python A/B spawn, pinned path, argv, cwd, scratch, handshake and bounded cleanup (socket only)', async t => {
  const f = await fixture(t, socketOnlyChild)
  const servers = []
  t.after(async () => { await Promise.all(servers.map(server => server.stop())) })
  for (const source of ['A', 'B']) {
    const server = await startNativeRouterServer({ dependency: f.dependency, source, root: f.directory, scratch: f.directory })
    servers.push(server)
    assert.equal(await reachable(server.baseUrl), true)
    assert.deepEqual(JSON.parse(await readFile(join(f.directory, source + '.json'), 'utf8')), { source, cwd: f.directory, bytecode: '1' })
  }
  assert.notEqual(servers[0].baseUrl, servers[1].baseUrl)
  await Promise.all(servers.map(server => server.stop()))
  await Promise.all(servers.map(server => server.stop())) // Idempotent.
  for (const server of servers) {
    assert.equal(await reachable(server.baseUrl), false)
    assert.notEqual(server.child.signalCode, null)
  }
})

test('external server startup errors, invalid handshake and timeout reject without child leaks', async t => {
  for (const [name, script, message] of [
    ['exit', "import sys\nprint('actual startup error', file=sys.stderr)\nsys.exit(7)\n", /exited before readiness: 7; actual startup error/],
    ['zero', "import time\nprint('PORT=0', flush=True)\ntime.sleep(60)\n", /invalid PORT handshake/],
    ['range', "import time\nprint('PORT=65536', flush=True)\ntime.sleep(60)\n", /invalid PORT handshake/],
    ['suffix', "import time\nprint('PORT=1234junk', flush=True)\ntime.sleep(60)\n", /invalid PORT handshake/],
    ['timeout', "import time\ntime.sleep(60)\n", /readiness timeout/],
    ['output-budget', "import time\nprint('x' * 65537, flush=True)\ntime.sleep(60)\n", /exceeds 64 KiB/],
    ['cumulative-output-budget', "import time\nfor _ in range(20):\n print('x' * 4095, flush=True)\n time.sleep(0.002)\ntime.sleep(60)\n", /exceeds 64 KiB/],
    ['utf8-output-budget', "import time\nprint(chr(0x1f680) * 17000, flush=True)\ntime.sleep(60)\n", /exceeds 64 KiB/],
  ]) {
    await t.test(name, async t => {
      const f = await fixture(t, 'import os\nopen(os.path.join(os.environ[\'TMPDIR\'], \'pid\'), \'w\').write(str(os.getpid()))\n' + script)
      await assert.rejects(startNativeRouterServer({ dependency: f.dependency, source: 'A', root: f.directory, scratch: f.directory, timeoutMs: 500 }), message)
      const pid = Number(await readFile(join(f.directory, 'pid'), 'utf8'))
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    })
  }
})

test('unavailable default Python produces a spawn error, not an unhandled event or hanging cleanup', async t => {
  const f = await fixture(t, socketOnlyChild)
  const helper = new URL('./helpers/native-router-dependency.mjs', import.meta.url).href
  const code = `import {startNativeRouterServer} from ${JSON.stringify(helper)}; try {await startNativeRouterServer(${JSON.stringify({ dependency: f.dependency, source: 'A', root: f.directory, scratch: f.directory, timeoutMs: 500 })}); process.exitCode=2} catch(e) {console.error(e.message); process.exitCode=1}`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, PATH: f.directory }, encoding: 'utf8', timeout: 4000 })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /spawn failed:.*ENOENT/)
})

test('preflight CLI is explicitly dependency-only and never reports native HTTP certification', async t => {
  const f = await fixture(t, socketOnlyChild)
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./native-router-preflight.mjs', import.meta.url))], {
    env: { ...process.env, ...f.env, HERMES_DESKTOP_SOURCE_ROOT: f.directory, CODEX_NATIVE_SCRATCH_ROOT: f.directory },
    encoding: 'utf8', timeout: 8000,
  })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr)
  const receipt = JSON.parse(result.stdout)
  assert.equal(receipt.status, 'DEPENDENCY_PREFLIGHT_ONLY')
  assert.equal(receipt.nativeHttpCertified, false)
  assert.equal(receipt.browserCertified, false)
  assert.equal(receipt.cleanupComplete, true)
  assert.deepEqual(receipt.sources.map(s => s.source), ['A', 'B'])
  for (const server of receipt.sources) assert.equal(await reachable(server.baseUrl), false)
})

test('standalone probe rejects missing dependency before native or browser imports', () => {
  const env = { ...process.env }
  delete env.CODEX_NATIVE_ROUTER_SERVER
  delete env.CODEX_NATIVE_ROUTER_SERVER_SHA256
  delete env.HERMES_DESKTOP_SOURCE_ROOT
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./native-universal-contract.mjs', import.meta.url))], { env, encoding: 'utf8', timeout: 4000 })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /CODEX_NATIVE_ROUTER_SERVER is not configured/)
  assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/)
})

test('preflight stops A when B fails startup and emits no success receipt', async t => {
  const f = await fixture(t, socketOnlyChild.replace("s = socket.socket()", "if sys.argv[1] == 'B': sys.exit(9)\ns = socket.socket()")
    .replace("'bytecode': os.environ['PYTHONDONTWRITEBYTECODE']", "'bytecode': os.environ['PYTHONDONTWRITEBYTECODE'], 'pid': os.getpid(), 'port': s.getsockname()[1]"))
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./native-router-preflight.mjs', import.meta.url))], {
    env: { ...process.env, ...f.env, HERMES_DESKTOP_SOURCE_ROOT: f.directory, CODEX_NATIVE_SCRATCH_ROOT: f.directory }, encoding: 'utf8', timeout: 8000,
  })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Native router B exited before readiness: 9/)
  assert.equal(result.stdout, '')
  const receipt = JSON.parse(await readFile(join(f.directory, 'A.json'), 'utf8'))
  assert.throws(() => process.kill(receipt.pid, 0), { code: 'ESRCH' })
  assert.equal(await reachable(`http://127.0.0.1:${receipt.port}`), false)
})

test('owned server ignoring SIGTERM is killed and reaped within the cleanup bound', async t => {
  const f = await fixture(t, socketOnlyChild.replace('s = socket.socket()', 'signal.signal(signal.SIGTERM, signal.SIG_IGN)\ns = socket.socket()'))
  const server = await startNativeRouterServer({ dependency: f.dependency, source: 'A', root: f.directory, scratch: f.directory })
  t.after(() => server.stop())
  await server.stop()
  assert.equal(server.child.signalCode, 'SIGKILL')
  assert.equal(await reachable(server.baseUrl), false)
})
