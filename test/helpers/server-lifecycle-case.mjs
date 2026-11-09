// Execute the actual test module and its node:test cleanup, never Chrome or UI.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { Agent, createServer, get } from 'node:http'
import { createConnection } from 'node:net'
import { createRequire, registerHooks } from 'node:module'
import { after, test } from 'node:test'

const [file, mode] = process.argv.slice(2)
const source = new URL(`../${file}`, import.meta.url)
const servers = []
const bodyBoundary = new Error('LIFECYCLE_BODY_BOUNDARY')
const acquisitionError = new Error('LIFECYCLE_ACQUISITION_REJECTED')
const closeError = new Error('LIFECYCLE_CLOSE_FAILED')
const agent = new Agent({ keepAlive: true })
let acquisitions = 0, browserCloses = 0, evaluations = 0, registrations = 0
let socket, socketClosed = false, httpStatus

const state = {
  createRequire,
  createServer(...args) {
    const server = createServer(...args)
    const record = { server, port: null, closes: 0, closed: false }
    const close = server.close.bind(server)
    server.close = (...args) => { record.closes++; return close(...args) }
    server.on('listening', () => { record.port = server.address().port })
    server.on('close', () => { record.closed = true })
    servers.push(record)
    return server
  },
  register(name, callback) {
    // Only the server-owning sidebar case; the first case in each Inbox file.
    if (file === 'sidebar-actions-runtime.test.mjs' && !name.startsWith('extracted native JSX')) return
    if (registrations++) return
    return test(name, async t => {
      try { await callback(t) }
      catch (error) {
        // Stop at the first UI call, after real resource acquisition. This is
        // lifecycle coverage, not a substitute for browser/product assertions.
        if (error !== bodyBoundary) throw error
      }
    })
  },
  async chromium() {
    acquisitions++
    assert.equal(servers.length, 1)
    assert.equal(servers[0].server.listening, true)
    // Open a real HTTP keep-alive connection; cleanup must close that socket,
    // not merely flip a flag on a fake server or wait for process destruction.
    await new Promise((resolve, reject) => {
      const request = get({ host: '127.0.0.1', port: servers[0].port, path: '/', agent }, response => {
        httpStatus = response.statusCode
        socket = response.socket
        socket.on('close', () => { socketClosed = true })
        response.resume()
        response.on('end', resolve)
      })
      request.on('error', reject)
    })
    if (mode === 'acquire-reject') throw acquisitionError
    return {
      async call() { throw bodyBoundary },
      async evaluate() {
        evaluations++
        if (mode === 'evaluate-reject') throw new Error('LIFECYCLE_EVALUATE_REJECTED')
      },
      close() {
        browserCloses++
        if (mode === 'close-throws') throw closeError
      },
    }
  },
}

// Keep mocks in this disposable process. Loading the original modules intact
// avoids testing a copied lifecycle or asserting on their source spelling.
globalThis.__serverLifecycle = state
const modules = new Map([
  ['node:test', 'export default (...args) => globalThis.__serverLifecycle.register(...args)'],
  ['node:http', 'export const createServer = (...args) => globalThis.__serverLifecycle.createServer(...args)'],
  ['node:module', `export const createRequire = url => {
    const real = globalThis.__serverLifecycle.createRequire(url)
    const require = name => name === 'esbuild' ? { build: async () => ({ outputFiles: [{ text: '' }] }) } : real(name)
    require.resolve = real.resolve
    return require
  }`],
  [new URL('./chromium.mjs', import.meta.url).href, 'export const chromium = () => globalThis.__serverLifecycle.chromium()'],
  [new URL('./reference-paths.mjs', import.meta.url).href, `export const referenceRoot = () => ${JSON.stringify(new URL('../../', import.meta.url).pathname)}
    export const referenceFile = () => new URL(${JSON.stringify(new URL('../fixtures/native-inbox-colors.css', import.meta.url).href)})`],
  [new URL('./native-sidebar-actions.mjs', import.meta.url).href, 'export const nativeSidebarActions = async () => ({ provenance: null, boundary: "mocked native setup", bundle: "" })'],
])
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const key = specifier.startsWith('.') ? new URL(specifier, context.parentURL).href : specifier
    if (modules.has(key)) return { url: `data:text/javascript,${encodeURIComponent(modules.get(key))}`, shortCircuit: true }
    return next(specifier, context)
  },
})
await import(source)

function canConnect(port) {
  return new Promise((resolve, reject) => {
    const connection = createConnection({ host: '127.0.0.1', port })
    connection.setTimeout(1000, () => { connection.destroy(); reject(new Error('TCP observation timed out')) })
    connection.once('connect', () => { connection.destroy(); resolve(true) })
    connection.once('error', error => {
      connection.destroy()
      if (error.code === 'ECONNREFUSED') resolve(false)
      else reject(error)
    })
  })
}

after(async () => {
  try {
    await new Promise(resolve => setImmediate(resolve))
    if (socket && !socketClosed && servers.every(({ server }) => !server.listening)) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 1000)
      try { await once(socket, 'close', { signal: controller.signal }) }
      finally { clearTimeout(timeout) }
    }
    const observations = []
    for (const record of servers) {
      observations.push({ port: record.port, listening: record.server.listening, closes: record.closes, closed: record.closed, reachable: await canConnect(record.port) })
    }
    console.log('LIFECYCLE_RECEIPT ' + JSON.stringify({ file, mode, acquisitions, browserCloses, evaluations, httpStatus, socketClosed, servers: observations }))
  } finally {
    // Rescue only after the observation, so RED cannot hang the test runner.
    // These calls cannot turn a leaking source into a passing observation.
    agent.destroy()
    socket?.destroy()
    for (const { server } of servers) {
      if (server.listening) await new Promise(resolve => server.close(resolve))
    }
    hooks.deregister()
    delete globalThis.__serverLifecycle
  }
})
