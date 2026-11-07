import { testDependencyRequire } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {nativeFactualBundle, sequenceSource, installSequence, provenance} from './helpers/native-factual-v9.mjs'
const require = testDependencyRequire()
const {JSDOM} = require('jsdom')
const native = await nativeFactualBundle()
const source = await sequenceSource()
console.log('NATIVE_V9_PROVENANCE', JSON.stringify(provenance))
for (const live of [false, true]) test(`real React native header, FadeText and disclosure, live=${live}`, () => {
  const dom = new JSDOM('<div id="fixture"></div>', {runScripts:'outside-only', pretendToBeVisual:true})
  const w = dom.window
  try {
    w.config = {live,summary:'Explored 4 files, ran 17 commands',tool:'Edited wiring.tsx'}
    w.eval(native)
    const g = w.document.getElementById('g'), t = w.document.getElementById('t')
    const nativeButton = g.querySelector('button'), timer = g.querySelector('[data-slot="timeline-timestamp"]')
    const nativeTargets = []
    w.document.addEventListener('click', event => {
      const button = event.target.closest('button')
      if (button && !button.closest('[data-codex-tool-sequence]')) nativeTargets.push(button)
    }, true)
    w.eval(installSequence(source))
    const expected = live ? 'Edited wiring.tsx' : 'Explored 4 files, ran 17 commands · Edited wiring.tsx'
    assert.equal(w.header().getAttribute('aria-label'),expected)
    w.sync(); w.runtime.reconcileObserved(w.pair,w.scope)
    assert.equal(w.nativeClicks,0)
    assert.deepEqual(nativeTargets,[])
    assert.equal(nativeButton.getAttribute('aria-expanded'),'false')
    w.flushNative(() => w.header().click())
    assert.equal(w.nativeClicks,1,'explicit skin expansion forwards exactly one native run click')
    assert.deepEqual(nativeTargets,[nativeButton])
    assert.equal(nativeButton.getAttribute('aria-expanded'),'true')
    assert.ok(w.document.getElementById('nested'))
    assert.equal(w.document.querySelector('#nested button').getAttribute('aria-expanded'),'false')
    assert.equal(t.querySelector('button').getAttribute('aria-expanded'),'false')
    assert.equal(w.document.querySelector('pre'),null,'no tool result opened')
    w.sync(); w.runtime.reconcileObserved(w.pair,w.scope)
    w.flushNative(() => w.header().click())
    assert.equal(w.header().getAttribute('aria-expanded'),'false')
    w.flushNative(() => w.header().click())
    assert.equal(w.header().getAttribute('aria-expanded'),'true')
    assert.deepEqual(nativeTargets,[nativeButton],'collapse and reopening an already-open run never retoggle native UI')
    // Commit between gestures: a direct native click now closes, rather than
    // repeating setOpen(true) against the same pre-commit React closure.
    w.flushNative(() => nativeButton.click())
    assert.equal(w.nativeClicks,2)
    assert.equal(nativeButton.getAttribute('aria-expanded'),'false')
    assert.equal(w.document.getElementById('nested'),null)
    w.flushNative(() => nativeButton.click())
    assert.equal(w.nativeClicks,3)
    assert.deepEqual(nativeTargets,[nativeButton,nativeButton,nativeButton])
    assert.ok(w.document.getElementById('nested'))
    assert.equal(w.document.querySelector('pre'),null)
    assert.ok(g.querySelector('button') === nativeButton && g.contains(timer))
    assert.ok(w.document.getElementById('t') === t)
    w.change({live:false,summary:'Explored 5 files, ran 18 commands',tool:'Edited app.tsx'})
    w.sync(); w.runtime.reconcileObserved(w.pair,w.scope)
    assert.equal(w.header().getAttribute('aria-label'),'Explored 5 files, ran 18 commands · Edited app.tsx')
    w.runtime.cleanup()
    assert.equal(w.header(),null)
    assert.equal(w.pair.querySelector('[data-codex-tool-sequence-item]'),null)
    assert.equal(t.querySelector('button').getAttribute('tabindex'),null)
    assert.equal(w.nativeClicks,3)
    assert.deepEqual(nativeTargets,[nativeButton,nativeButton,nativeButton])
  } finally {w.nativeRoot?.unmount();dom.window.close()}
})
