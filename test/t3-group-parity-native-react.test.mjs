import assert from 'node:assert/strict'
import test from 'node:test'
import {testDependencyRequire} from './helpers/reference-paths.mjs'
import {nativeFactualBundle, sequenceSource, installSequence, provenance} from './helpers/native-factual-v9.mjs'
const {JSDOM} = testDependencyRequire()('jsdom')
const native = await nativeFactualBundle(), source = await sequenceSource()
const scope = JSON.stringify(['connection', ['connection', 'default'], 'default', 'runtime', 'stored', 'runtime', 'stored'])
console.log('T3_GROUP_NATIVE_PROVENANCE', JSON.stringify(provenance))
for (const live of [false, true]) test(`full React root remount retains whole-message disclosure, not native nested opening; live=${live}`, async () => {
  const dom = new JSDOM('<div id="fixture"></div>', {runScripts: 'outside-only', pretendToBeVisual: true}), w = dom.window
  try {
    w.config = {live, summary: 'Read 17 files', tool: live ? 'Running tests' : 'Ran tests'}
    w.eval(native)
    // The upstream fixture's explicit surface is replaced with the real
    // workspace anchor before qualifying complete native ownership.
    w.document.querySelector('[data-session-anchor]').setAttribute('data-session-anchor', 'workspace')
    const nativeTargets = []
    w.document.addEventListener('click', event => {
      const button = event.target.closest('button')
      if (button && !button.closest('[data-codex-tool-sequence]')) nativeTargets.push(button)
    }, true)
    w.eval(installSequence(source))
    w.scope = scope; w.sync(); w.runtime.reconcileObserved(w.pair,w.scope)
    const old = w.header(), lateClick = old.onclick, oldNative = w.document.querySelector('#g button')
    assert.equal(w.nativeClicks, 0)
    assert.deepEqual(nativeTargets, [])
    w.flushNative(() => old.click())
    assert.equal(old.getAttribute('aria-expanded'), 'true')
    assert.equal(w.nativeClicks, 1, 'explicit user expansion opens only the native run')
    assert.deepEqual(nativeTargets, [oldNative])
    assert.equal(oldNative.getAttribute('aria-expanded'), 'true')
    assert.ok(w.document.getElementById('nested'))
    assert.equal(w.document.querySelector('#nested button').getAttribute('aria-expanded'), 'false')
    assert.equal(w.document.querySelector('pre'), null)
    w.nativeRoot.unmount(); w.runtime.pruneDisconnected()
    w.eval(native) // This fixture resets nativeClicks; the independent target log does not reset.
    w.document.querySelector('[data-session-anchor]').setAttribute('data-session-anchor', 'workspace')
    w.pair = w.document.querySelector('[data-slot="aui_turn-pair"]'); w.sync()
    const current = w.header(), nativeButton = w.document.querySelector('#g button')
    assert.notEqual(current, old)
    assert.equal(current.getAttribute('aria-expanded'), 'true')
    assert.equal(nativeButton.getAttribute('aria-expanded'), 'false')
    assert.equal(w.document.getElementById('nested'), null)
    w.sync(); w.runtime.reconcileObserved(w.pair,w.scope)
    w.flushNative(() => { old.click(); lateClick() })
    assert.equal(current.getAttribute('aria-expanded'), 'true')
    assert.equal(w.nativeClicks, 0, 'remount, reconcile, refresh and stale callback never click native UI')
    assert.deepEqual(nativeTargets, [oldNative])
    assert.equal(nativeButton.getAttribute('aria-expanded'), 'false')
    w.flushNative(() => nativeButton.click())
    assert.equal(w.nativeClicks, 1)
    assert.deepEqual(nativeTargets, [oldNative,nativeButton])
    assert.ok(w.document.getElementById('nested'))
    assert.equal(w.document.querySelector('#nested button').getAttribute('aria-expanded'), 'false')
    assert.equal(w.document.querySelector('#t button').getAttribute('aria-expanded'), 'false')
    assert.equal(w.document.querySelector('pre'), null)
    assert.equal(w.document.querySelector('#g button'), nativeButton)
    w.sync()
    const observer = new w.MutationObserver(() => {})
    observer.observe(w.pair, {subtree: true, childList: true, attributes: true, characterData: true})
    w.sync(); w.sync()
    assert.equal(observer.takeRecords().length, 0)
    observer.disconnect()
    w.runtime.cleanup()
    assert.equal(w.header(), null)
    assert.equal(w.document.querySelector('#g button'), nativeButton)
  } finally { w.nativeRoot?.unmount(); dom.window.close() }
})
