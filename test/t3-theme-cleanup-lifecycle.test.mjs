// Run the genuine theme module, including native extraction/compilation and its
// node:test after hook. Only test selection and browser I/O are process-local seams.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { registerHooks } from 'node:module'
import test, { after } from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const childArgument = '--theme-cleanup-lifecycle-child'
if (!process.argv.includes(childArgument)) {
  test('theme paint: acquired browsers close on setup, callback and cleanup failures', () => {
    const env = { ...process.env }
    // Nested test-runner context otherwise emits binary event frames, not TAP.
    delete env.NODE_TEST_CONTEXT
    delete env.T3_PAINT_RECEIPT
    delete env.T3_PAINT_BASELINE
    const result = spawnSync(process.execPath, ['--test-reporter=tap', fileURLToPath(import.meta.url), childArgument], {
      env, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
    })
    assert.ifError(result.error)
    assert.equal(result.signal, null, result.stderr)
    const output = result.stdout + result.stderr
    const line = result.stdout.split('\n').find(line => line.startsWith('THEME_CLEANUP_RECEIPT '))
    assert.ok(line, output)
    const receipt = JSON.parse(line.slice('THEME_CLEANUP_RECEIPT '.length))
    assert.equal(receipt.callbacks, 10, output)
    assert.equal(receipt.cases.length, 50, output)
    console.log(line)
    assert.equal(result.status, 0, output)
  })
} else {
  const callbacks = []
  const receipts = []
  const acquisitionError = new Error('THEME_ACQUISITION_REJECTED')
  const setupError = new Error('THEME_SETUP_FAILED')
  const bodyError = new Error('THEME_CALLER_UI_BOUNDARY')
  const cleanupError = new Error('THEME_CLEANUP_FAILED')
  const setupOperations = ['Page.getFrameTree', 'Page.setDocumentContent', 'evaluate', 'evaluate',
    'DOM.enable', 'CSS.enable', 'DOM.getDocument', 'DOM.querySelector', 'Input.dispatchMouseEvent']
  let current

  function operation(method, expression) {
    const state = current
    assert.equal(state.closes, 0, 'the acquired browser stays open until its owner disposes it')
    if (state.operations.length < setupOperations.length) {
      const step = state.operations.length + 1
      state.operations.push(method)
      assert.equal(method, setupOperations[step - 1])
      if (expression) state.setupHashes[step] = createHash('sha256').update(expression).digest('hex')
      if (step === state.scenario.step) {
        if (state.scenario.kind === 'setup-throw') throw setupError
        if (state.scenario.kind === 'setup-reject') return Promise.reject(setupError)
      }
      // Execute the actual fixture's complete runtime-definition expression.
      // No reconstructed disable() implementation or source-reading oracle.
      if (step === 4) vm.runInContext(expression, state.context)
      if (method === 'Page.getFrameTree') return Promise.resolve({ frameTree: { frame: { id: 'lifecycle' } } })
      if (method === 'DOM.getDocument') return Promise.resolve({ root: { nodeId: 1 } })
      if (method === 'DOM.querySelector') return Promise.resolve({ nodeId: 2 })
      return Promise.resolve()
    }
    if (method === 'evaluate' && expression === 'disable()') {
      state.disables++
      if (state.scenario.kind === 'cleanup-throw') throw cleanupError
      if (state.scenario.kind === 'cleanup-reject') return Promise.reject(cleanupError)
      return vm.runInContext(expression, state.context)
    }
    // A real caller-side operation proves successful fixture ownership transfer.
    assert.doesNotMatch(new Error().stack, /\bat (?:async )?fixture\b/)
    state.callerOperations++
    state.transferred = true
    if (['after-enable', 'assertion', 'cleanup-disposer-throw'].includes(state.scenario.kind)) {
      if (expression?.includes('enable()')) {
        // Browser-I/O model only: no DOM, paint or real runtime installation is claimed.
        state.enabled = true
        state.context.cleanup = () => {
          state.cleanups++
          if (state.scenario.kind === 'cleanup-disposer-throw') throw cleanupError
        }
        return Promise.resolve()
      }
      if (!state.enabled) return Promise.resolve()
      if (state.scenario.kind === 'assertion') return Promise.resolve(expression?.includes('elementFromPoint') ? '' : undefined)
    }
    throw bodyError
  }

  globalThis.__themeCleanupLifecycle = {
    register: (name, callback) => callbacks.push({ name, callback }),
    after,
    async chromium() {
      const state = current
      state.acquisitions++
      if (state.scenario.kind === 'acquire-reject') throw acquisitionError
      const browser = {
        call: method => operation(method),
        evaluate: expression => operation('evaluate', expression),
        close() { state.closes++ },
      }
      if (state.scenario.kind === 'assignment') Object.defineProperty(browser, 'primaryNodeId', { set() { throw setupError } })
      return browser
    },
  }
  const chromiumURL = new URL('./helpers/chromium.mjs', import.meta.url).href
  const modules = new Map([
    ['node:test', 'const t=(...args)=>globalThis.__themeCleanupLifecycle.register(...args);t.after=globalThis.__themeCleanupLifecycle.after;export default t'],
    [chromiumURL, 'export const chromium=()=>globalThis.__themeCleanupLifecycle.chromium()'],
  ])
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      const key = specifier.startsWith('.') ? new URL(specifier, context.parentURL).href : specifier
      if (modules.has(key)) return { url: `data:text/javascript,${encodeURIComponent(modules.get(key))}`, shortCircuit: true }
      return next(specifier, context)
    },
  })
  await import(new URL('./t3-theme-paint.test.mjs', import.meta.url))
  assert.equal(callbacks.length, 10)
  const finalizerCallbacks = callbacks.slice(7)

  function runCase(selected, scenario) {
    test(`${selected.name}: ${scenario.kind} ${scenario.step ?? ''}`, async t => {
      current = { scenario, acquisitions: 0, closes: 0, disables: 0, cleanups: 0,
        operations: [], setupHashes: {}, callerOperations: 0, transferred: false, enabled: false }
      const state = current
      state.context = vm.createContext({ addEventListener() {}, setTimeout: fn => fn() })
      state.context.window = state.context
      let caught
      try { await selected.callback(t) } catch (error) { caught = error }
      const receipt = { name: selected.name, ...Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'context')),
        error: caught?.message, sameError: [acquisitionError, setupError, bodyError, cleanupError].includes(caught) }
      receipts.push(receipt)
      assert.equal(state.acquisitions, 1)
      if (scenario.kind === 'acquire-reject') {
        assert.equal(state.closes, 0)
        assert.equal(caught, acquisitionError)
        assert.deepEqual(state.operations, [])
        return
      }
      assert.equal(state.closes, 1, JSON.stringify(receipt))
      if (scenario.kind.startsWith('setup-') || scenario.kind === 'assignment') {
        assert.equal(caught, setupError, 'fixture setup rethrows the exact initial error')
        assert.equal(state.transferred, false)
        assert.equal(state.operations.length, scenario.step)
      } else {
        assert.equal(state.transferred, true)
        assert.equal(state.operations.length, setupOperations.length)
        if (scenario.kind === 'assertion') {
          assert.equal(caught?.code, 'ERR_ASSERTION')
          assert.match(caught.message, /Sample the sole body field painter/)
        } else if (scenario.kind.startsWith('cleanup-')) {
          // Existing finally precedence is retained: cleanup rejection wins.
          assert.equal(caught, cleanupError)
        } else assert.equal(caught, bodyError, 'unset cleanup must not mask a caller failure')
        if (finalizerCallbacks.includes(selected)) assert.equal(state.disables, 1)
        if (scenario.kind === 'after-enable' || scenario.kind === 'assertion') {
          assert.equal(state.enabled, true)
          assert.equal(state.cleanups, finalizerCallbacks.includes(selected) ? 1 : 0)
          // Exercise the actual installed disable's null/unset guard repeatedly.
          await vm.runInContext('disable()', state.context)
          await vm.runInContext('disable()', state.context)
          assert.equal(state.cleanups, 1, 'a disposer is invoked only once')
        }
      }
    })
  }
  runCase(callbacks[0], { kind: 'acquire-reject' })
  for (let step = 1; step <= setupOperations.length; step++) {
    for (const kind of ['setup-throw', 'setup-reject']) runCase(callbacks[0], { kind, step })
  }
  runCase(callbacks[0], { kind: 'assignment', step: 8 })
  for (const selected of callbacks) {
    runCase(selected, { kind: 'before-enable' })
    runCase(selected, { kind: 'after-enable' })
  }
  for (const selected of finalizerCallbacks) {
    runCase(selected, { kind: 'cleanup-throw' })
    runCase(selected, { kind: 'cleanup-reject' })
    runCase(selected, { kind: 'cleanup-disposer-throw' })
  }
  runCase(finalizerCallbacks[0], { kind: 'assertion' })
  after(() => {
    console.log('THEME_CLEANUP_RECEIPT ' + JSON.stringify({ callbacks: callbacks.length, cases: receipts }))
    hooks.deregister()
    delete globalThis.__themeCleanupLifecycle
  })
}
