import assert from 'node:assert/strict'
import test from 'node:test'
import {testDependencyRequire} from './helpers/reference-paths.mjs'
import {nativeRunBundle, tool, provenance} from './helpers/native-run-stream.mjs'
import {sequenceSource} from './helpers/native-factual-v9.mjs'

const {JSDOM} = testDependencyRequire()('jsdom')
const native = await nativeRunBundle(), source = await sequenceSource()
console.log('FOCUS_HANDOFF_NATIVE_PROVENANCE', JSON.stringify(provenance))

// Execute native ToolRun/ToolGroupSlot, ticker and DisclosureRow, not a mock
// focus implementation. JSDOM proves attribute ownership and DOM focus only;
// browser Tab traversal, layout and live Electron remain separate gates.
function fixture(split, prefixCount, tabindex) {
  const dom = new JSDOM('<div id="fixture"></div>', {runScripts:'outside-only', pretendToBeVisual:true})
  const w = dom.window
  w.structuredClone = structuredClone
  // Native enter hooks honor this public preference; JSDOM has no WAAPI.
  w.matchMedia = media => ({media, matches:media === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}})
  w.config = {live:true, roots:[
    ...Array.from({length:prefixCount}, (_, i) => ({id:`prefix-${i}`, live:false, parts:[tool(`p${i}`, true)], ...(split && i === prefixCount - 1 ? {prose:'Native boundary'} : {})})),
    {id:'tail', live:true, parts:[tool('t')]}
  ]}
  w.eval(native)
  const pair = w.document.getElementById('pair')
  const nodes = [...pair.querySelectorAll('[data-tool-row] button')]
  for (const node of nodes) if (tabindex !== null) node.setAttribute('tabindex', tabindex)
  const parents = nodes.map(node => node.parentNode)
  w.eval(`const TURN_ACTION_SELECTOR='[data-slot="tool-approval-inline"],[data-slot="clarify-inline"]';const TURN_FAILURE_SELECTOR='.text-destructive';${source};window.scope='focus';window.gen=0;window.runtime=createToolSequenceRuntime(()=>window.scope,()=>window.gen)`)
  const sync = () => w.runtime.reconcile(pair, w.scope)
  const header = () => [...pair.querySelectorAll('[data-codex-tool-sequence] button')].at(-1)
  const boundary = value => w.change(c => {if (value) c.roots[prefixCount - 1].prose = 'Native boundary'; else delete c.roots[prefixCount - 1].prose; return c})
  const snapshot = () => nodes.map(node => node.getAttribute('tabindex'))
  const original = () => assert.deepEqual(snapshot(), nodes.map(() => tabindex), 'restore exact native tabindex, including absence and intentional -1')
  const quiet = () => {
    const observer = new w.MutationObserver(() => {})
    observer.observe(pair, {subtree:true, attributes:true, childList:true, characterData:true})
    for (let i = 0; i < 5; i++) { sync(); w.runtime.reconcileObserved(pair, w.scope) }
    assert.equal(observer.takeRecords().length, 0, 'unchanged reconciliation performs zero DOM mutations')
    observer.disconnect()
  }
  sync()
  return {w, pair, nodes, parents, sync, header, boundary, snapshot, original, quiet,
    close() {w.runtime.cleanup(); w.nativeRoot.unmount(); dom.window.close()}}
}

for (const startSplit of [false, true]) for (const prefixCount of [1, 2]) for (const tabindex of [null, '0', '4', '-1']) {
  test(`native focus survives ${startSplit ? 'merge→split' : 'split→merge'}; prefix=${prefixCount}; tabindex=${tabindex ?? 'absent'}`, () => {
    const f = fixture(startSplit, prefixCount, tabindex), trace = []
    try {
      for (const split of [!startSplit, startSplit, !startSplit]) {
        f.boundary(split)
        f.sync()
        trace.push({split, first:f.snapshot()})
        // A second pass exposes a corrupted saved -1 even when retirement
        // temporarily restored the native attribute on the first pass.
        f.sync()
        trace.push({split, repeated:f.snapshot()})
        const button = f.header()
        assert.equal(button.getAttribute('aria-expanded'), 'false')
        button.click()
        assert.equal(button.getAttribute('aria-expanded'), 'true')
        f.original()
        for (const node of f.nodes) {
          node.focus()
          assert.equal(f.w.document.activeElement, node, 'native disclosure remains programmatically focusable')
        }
        f.quiet()
        button.click()
        assert.equal(button.getAttribute('aria-expanded'), 'false')
        f.quiet()
      }
      f.w.runtime.cleanup()
      f.original()
      assert.equal(f.pair.querySelector('[data-codex-tool-sequence], [data-codex-tool-sequence-item]'), null)
      assert.ok(f.nodes.every((node, i) => node.isConnected && node.parentNode === f.parents[i]))
      assert.equal(f.w.nativeClicks, 0, 'reconciliation and skin expansion never activate mounted native tools')
    } finally {
      console.log('FOCUS_HANDOFF_TRACE', JSON.stringify({startSplit, prefixCount, tabindex, trace}))
      f.close()
    }
  })
}

for (const finish of ['cleanup', 'deactivate', 'complete', 'unsafe', 'disconnect']) test(`closed handoff restores native controls on ${finish}`, () => {
  const f = fixture(true, 1, '3')
  try {
    f.boundary(false); f.sync(); f.sync()
    if (finish === 'complete') {
      f.w.change(c => {c.live = false; c.roots.forEach(root => {root.live = false}); return c})
      f.sync()
    } else if (finish === 'unsafe') {
      const alert = f.w.document.createElement('div')
      alert.setAttribute('role', 'alert'); f.pair.append(alert); f.sync()
    } else if (finish === 'disconnect') {
      f.pair.remove(); f.w.runtime.pruneDisconnected()
    } else f.w.runtime[finish]()
    f.original()
  } finally {f.close()}
})
