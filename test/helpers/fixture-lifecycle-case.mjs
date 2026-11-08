// Load genuine modules, native source extraction and node:test callbacks.
// Only browser I/O and selection of the test callback are process-local seams.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test, { after } from 'node:test'
import { fixtureLifecycleCases, lifecycleScenarios } from './fixture-lifecycle-cases.mjs'

const file = process.argv[2]
const spec = fixtureLifecycleCases.find(spec => spec.file === file)
assert.ok(spec, `Unknown lifecycle case: ${file}`)
let selected, current
const receipts = []
const acquisitionError = new Error('FIXTURE_ACQUISITION_REJECTED')
const setupError = new Error('FIXTURE_SETUP_FAILED')
const bodyBoundary = new Error('FIXTURE_UI_BOUNDARY_NOT_EXECUTED')

function operation(method) {
  const state = current
  state.operations.push(method)
  const step = state.operations.length
  assert.equal(state.closes, 0, 'browser must stay owned and open during setup and at transfer')
  if (step > spec.operations.length) {
    if (state.transferred && spec.cleanup && step === spec.operations.length + 2) {
      assert.equal(method, 'evaluate', 'retain the caller-owned disposal before close')
      return Promise.resolve()
    }
    // An operation in the caller, not a boundary thrown inside fixture setup.
    const stack = new Error().stack
    assert.doesNotMatch(stack, /\bat (?:async )?fixture\b/, stack)
    state.transferred = true
    throw bodyBoundary
  }
  assert.equal(method, spec.operations[step - 1], 'reach each real setup operation in order')
  if (state.scenario.step === step) {
    if (state.scenario.kind === 'throw') throw setupError
    if (state.scenario.kind === 'reject') return Promise.reject(setupError)
  }
  if (method === 'Page.getFrameTree') return Promise.resolve({ frameTree: { frame: { id: 'lifecycle-frame' } } })
  if (method === 'DOM.getDocument') return Promise.resolve({ root: { nodeId: 1 } })
  if (method === 'DOM.querySelector') return Promise.resolve({ nodeId: 2 })
  // This value serves the genuine native-font fixture's type assertion only;
  // no CSS or DOM is evaluated or claimed to have painted.
  if (spec.assertion && step === 5) return Promise.resolve(state.scenario.kind === 'assertion' ? null : '')
  return Promise.resolve()
}

const seam = {
  register(name, callback) {
    if (!name.startsWith(spec.name) || selected) return
    selected = { name, callback }
  },
  async chromium() {
    current.acquisitions++
    if (current.scenario.kind === 'acquire-reject') throw acquisitionError
    const browser = {
      call: method => operation(method),
      evaluate: () => operation('evaluate'),
      close() { current.closes++ },
    }
    if (current.scenario.kind === 'assignment') Object.defineProperty(browser, 'primaryNodeId', { set() { throw setupError } })
    return browser
  },
  after,
}
globalThis.__fixtureLifecycle = seam
const modules = new Map([
  ['node:test', `const test = (...args) => globalThis.__fixtureLifecycle.register(...args);test.after = globalThis.__fixtureLifecycle.after;export default test`],
  [new URL('./chromium.mjs', import.meta.url).href, `export const chromium = () => globalThis.__fixtureLifecycle.chromium();export { waitForRendered } from ${JSON.stringify(new URL('./chromium.mjs?lifecycle-renderer', import.meta.url).href)}`],
])
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const key = specifier.startsWith('.') ? new URL(specifier, context.parentURL).href : specifier
    if (modules.has(key)) return { url: `data:text/javascript,${encodeURIComponent(modules.get(key))}`, shortCircuit: true }
    return next(specifier, context)
  },
})
await import(new URL(`../${file}`, import.meta.url))
assert.ok(selected, `No real test selected for ${file}: ${spec.name}`)

for (const scenario of lifecycleScenarios(spec)) {
  test(`${file}: ${scenario.kind} ${scenario.step ?? ''}`, async t => {
    current = { scenario, acquisitions: 0, closes: 0, operations: [], transferred: false }
    let caught
    try { await selected.callback(t) } catch (error) { caught = error }
    const receipt = { ...current, error: caught?.message, sameError: caught === setupError || caught === acquisitionError || caught === bodyBoundary }
    receipts.push(receipt)
    assert.equal(current.acquisitions, 1)
    if (scenario.kind === 'acquire-reject') {
      assert.equal(caught, acquisitionError)
      assert.equal(current.closes, 0)
      assert.deepEqual(current.operations, [])
    } else {
      if (scenario.kind === 'transfer') {
        assert.equal(caught, bodyBoundary, 'stop before executing any UI assertion')
        assert.equal(current.transferred, true, 'successful fixture transfers its live browser to caller')
        assert.equal(current.operations.length, spec.operations.length + (spec.cleanup ? 2 : 1))
      } else if (scenario.kind === 'assertion') {
        assert.equal(caught?.code, 'ERR_ASSERTION')
        assert.match(caught.message, /shipping Inbox runtime must inject its real stylesheet/)
      } else assert.equal(caught, setupError, 'rethrow the exact setup error after closing')
      assert.equal(current.closes, 1, JSON.stringify(receipt))
      if (scenario.kind !== 'transfer') {
        assert.equal(current.transferred, false)
        assert.equal(current.operations.length, scenario.step)
      }
    }
  })
}
after(() => {
  console.log('FIXTURE_LIFECYCLE_RECEIPT ' + JSON.stringify({ file, target: spec.target ?? file, cases: receipts }))
  hooks.deregister()
  delete globalThis.__fixtureLifecycle
})
