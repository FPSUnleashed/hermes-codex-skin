// Lifecycle only: genuine fixture/native compilation and loopback HTTP, no UI/Chrome.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { Agent, createServer, get } from 'node:http'
import { registerHooks } from 'node:module'
import { connect } from 'node:net'
import { fileURLToPath } from 'node:url'

const scenarios = [
  { kind: 'acquire-reject' },
  ...Array.from({ length: 6 }, (_, index) => ['throw', 'reject'].map(kind => ({ kind, step: index + 1 }))).flat(),
  { kind: 'callback-reject' },
  { kind: 'cleanup-reject' },
  { kind: 'cleanup-throw' },
  { kind: 'close-throw' },
  { kind: 'normal' },
]
const cleanupExpression = 'disposals.reverse().forEach(fn=>fn());queryClient.unmount();queryClient.clear()'
const receiptPrefix = 'UNIVERSAL_FIXTURE_LIFECYCLE_RECEIPT '

if (process.argv[2] === '--lifecycle-case') {
  await lifecycleCase(JSON.parse(process.argv[3]))
} else {
  const { default: test } = await import('node:test')
  for (const scenario of scenarios) {
    test(`universalFixture: ${scenario.kind} ${scenario.step ?? ''} disposes independently without Chrome`, () => {
      const env = { ...process.env }
      // A nested test-runner context otherwise changes stdout to binary frames.
      delete env.NODE_TEST_CONTEXT
      delete env.CODEX_INBOX_TEST_BUNDLE
      const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--lifecycle-case', JSON.stringify(scenario)], {
        env, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024,
      })
      assert.ifError(result.error)
      const output = result.stdout + result.stderr
      const line = result.stdout.split('\n').find(line => line.startsWith(receiptPrefix))
      assert.ok(line, output)
      const receipt = JSON.parse(line.slice(receiptPrefix.length))
      console.log(receiptPrefix + JSON.stringify(receipt))
      assert.deepEqual(receipt.scenario, scenario)
      assert.equal(result.signal, null, output)
      assert.equal(result.status, 0, output)
    })
  }
}

async function lifecycleCase(scenario) {
  const injectedError = new Error(`INJECTED_${scenario.kind}_${scenario.step ?? ''}`)
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })
  let server, serverClose, socket, port, socketClosed = false, closeEvent = false
  let serverCloses = 0, browserCloses = 0, acquisitions = 0, callbackCalls = 0, cleanupCalls = 0
  const operations = [], nativeResponses = []
  const browser = {
    call(method, params) {
      assert.equal(method, 'Page.navigate')
      assert.equal(params.url, `http://127.0.0.1:${server.address().port}/`)
      return operation(method)
    },
    evaluate(expression) {
      if (expression === cleanupExpression) {
        cleanupCalls++
        if (scenario.kind === 'cleanup-throw') throw injectedError
        if (scenario.kind === 'cleanup-reject') return Promise.reject(injectedError)
        return Promise.resolve()
      }
      return operation('evaluate')
    },
    close() {
      browserCloses++
      if (scenario.kind === 'close-throw') throw injectedError
    },
  }
  function operation(method) {
    operations.push(method)
    assert.equal(browserCloses, 0, 'setup must retain a live browser')
    if (operations.length === scenario.step) {
      if (scenario.kind === 'throw') throw injectedError
      if (scenario.kind === 'reject') return Promise.reject(injectedError)
    }
    return Promise.resolve()
  }
  async function request(path) {
    return new Promise((resolve, reject) => {
      const req = get({ hostname: '127.0.0.1', port: server.address().port, path, agent }, res => {
        if (!socket) {
          socket = res.socket
          socket.once('close', () => { socketClosed = true })
        }
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.once('error', reject)
        res.once('end', () => {
          const body = Buffer.concat(chunks)
          nativeResponses.push({ path, status: res.statusCode, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') })
          assert.equal(res.statusCode, 200)
          assert.ok(body.length > 0)
          resolve()
        })
      })
      req.once('error', reject)
    })
  }
  const seam = {
    createServer(...args) {
      assert.equal(server, undefined, 'one real HTTP server per invocation')
      server = createServer(...args)
      server.once('close', () => { closeEvent = true })
      serverClose = server.close.bind(server)
      server.close = (...args) => { serverCloses++; return serverClose(...args) }
      return server
    },
    async chromium() {
      acquisitions++
      assert.equal(server.listening, true, 'HTTP resource precedes browser acquisition')
      port = server.address().port
      // Request the real routes: extraction, transpilation, esbuild and core input
      // remain genuine, while browser expressions are deliberately not evaluated.
      for (const path of ['/', '/native-colors.mjs', '/native-palette.mjs', '/palette-ui.mjs', '/core/index.js']) await request(path)
      assert.equal(socketClosed, false)
      if (scenario.kind === 'acquire-reject') throw injectedError
      return browser
    },
  }
  globalThis.__universalCleanupLifecycle = seam
  const modules = new Map([
    ['node:http', 'export const createServer = (...args) => globalThis.__universalCleanupLifecycle.createServer(...args)'],
    [new URL('./helpers/chromium.mjs', import.meta.url).href, 'export const chromium = () => globalThis.__universalCleanupLifecycle.chromium()'],
  ])
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      const key = specifier.startsWith('.') ? new URL(specifier, context.parentURL).href : specifier
      if (modules.has(key)) return { url: `data:text/javascript,${encodeURIComponent(modules.get(key))}`, shortCircuit: true }
      return next(specifier, context)
    },
  })
  let caught, callbackOwned = false, receipt
  try {
    const { universalFixture } = await import('./helpers/universal-fixture.mjs')
    try {
      await universalFixture(async received => {
        callbackCalls++
        assert.equal(received, browser, 'transfer the acquired browser, not a replacement')
        assert.equal(server.listening, true)
        assert.equal(browserCloses, 0)
        assert.equal(cleanupCalls, 0)
        assert.equal(socketClosed, false)
        await received.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
        callbackOwned = true
        if (scenario.kind === 'callback-reject') throw injectedError
      }, { routes: [], nativeApi: async () => ({}) })
    } catch (error) { caught = error }
    // A referenced timer bounds RED; observe before agent.destroy or rescue.
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 250)
      if (socketClosed) { clearTimeout(timer); resolve() }
      else socket?.once('close', () => { clearTimeout(timer); resolve() })
    })
    const tcp = await new Promise(resolve => {
      const probe = connect({ host: '127.0.0.1', port })
      probe.once('connect', () => { probe.destroy(); resolve('connected') })
      probe.once('error', error => { probe.destroy(); resolve(error.code) })
      probe.setTimeout(1000, () => { probe.destroy(); resolve('timeout') })
    })
    receipt = { scenario, acquisitions, operations, callbackCalls, callbackOwned, cleanupCalls, browserCloses,
      error: caught?.message ?? null, sameError: caught === injectedError, nativeResponses,
      beforeRescue: { listening: server.listening, serverCloses, closeEvent, socketClosed, tcp } }
  } finally {
    // Rescue bounds failing baselines only; never counts as fixture disposal.
    if (server?.listening) {
      server.closeAllConnections()
      await new Promise(resolve => serverClose(resolve))
    }
    agent.destroy()
    hooks.deregister()
    delete globalThis.__universalCleanupLifecycle
  }
  console.log(receiptPrefix + JSON.stringify(receipt))
  assert.equal(acquisitions, 1)
  assert.deepEqual(receipt.nativeResponses.map(({ path }) => path), ['/', '/native-colors.mjs', '/native-palette.mjs', '/palette-ui.mjs', '/core/index.js'])
  const acquired = scenario.kind !== 'acquire-reject'
  const setupFailed = scenario.step !== undefined
  const enteredCallback = acquired && !setupFailed
  assert.equal(callbackCalls, enteredCallback ? 1 : 0)
  assert.equal(callbackOwned, enteredCallback)
  assert.equal(cleanupCalls, acquired ? 1 : 0)
  assert.equal(browserCloses, acquired ? 1 : 0)
  assert.deepEqual(operations, ['Page.navigate', 'evaluate', 'evaluate', 'evaluate', 'evaluate', 'evaluate', 'Page.navigate'].slice(0, setupFailed ? scenario.step : acquired ? 7 : 0))
  if (['normal', 'cleanup-reject'].includes(scenario.kind)) assert.equal(caught, undefined)
  else assert.equal(caught, injectedError, 'preserve the exact acquisition/setup/callback/cleanup error')
  assert.deepEqual(receipt.beforeRescue, { listening: false, serverCloses: 1, closeEvent: true, socketClosed: true, tcp: 'ECONNREFUSED' },
    'fixture must close the real listener and keepalive socket even when browser cleanup throws, before rescue')
}
