import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {loadPluginInternals} from './helpers/load-plugin.mjs'
import {referenceFile,referenceRoot} from './helpers/reference-paths.mjs'
import {measureHistoricalWidth} from './helpers/width-history.mjs'

const {CSS}=await loadPluginInternals(['CSS'])
const baseline=await import(pathToFileURL(`${referenceRoot('CODEX_WIDTH_PRE_REPAIR_ROOT')}/test/helpers/load-plugin.mjs`))
const old=await baseline.loadPluginInternals(['CSS'])
const nativeCSS=await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'),'utf8')
const constraint="html[data-codex-chat-look='true'][data-codex-composer-width='codex-wide'] [data-slot='composer-dock']:not([data-popped-out]) [data-slot='composer-surface'] { max-width: 240px !important; }"

test('historical width measurement excludes candidate-only constraints and restores the candidate even on failure',{timeout:15000},async t=>{
 const browser=await chromium()
 try {
  const candidateCSS=CSS+constraint
  const html=`<!doctype html><html data-codex-chat-look="true" data-codex-composer-width="codex-wide"><head><style>${nativeCSS}</style><style id="width-plugin-css">${candidateCSS}</style><style id="layout">body{margin:0}section{position:relative;width:700px;height:250px}</style></head><body><section><div data-slot="composer-dock" class="absolute bottom-0 left-1/2 max-w-full -translate-x-1/2"><div data-slot="composer-root"><div data-slot="composer-surface" style="width:100%;height:40px"></div></div></div></section></body></html>`
  await browser.call('Page.setDocumentContent',{frameId:(await browser.call('Page.getFrameTree')).frameTree.frame.id,html})
  await browser.evaluate(`window.settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));settle()`)
  const metrics=`document.querySelector('[data-slot="composer-surface"]').getBoundingClientRect().width`
  const before=await browser.evaluate(metrics)
  assert.equal(before,240)
  // Demonstrate the old cascade's false equality with real shipping styles.
  await browser.evaluate(`(()=>{const s=document.createElement('style');s.id='old-width';s.textContent=${JSON.stringify(old.CSS)};document.head.append(s);return settle()})()`)
  assert.equal(await browser.evaluate(metrics),before,'appending history masks the width regression')
  await browser.evaluate(`document.getElementById('old-width').remove();settle()`)
  const historical=await measureHistoricalWidth(browser,old.CSS,metrics)
  assert.ok(historical>before+100,'isolated history must expose the optional width regression')
  assert.equal(await browser.evaluate(metrics),before,'candidate geometry restored')
  assert.equal(await browser.evaluate(`document.getElementById('width-plugin-css').textContent`),candidateCSS,'exact candidate bytes restored')
  const order=await browser.evaluate(`[...document.querySelectorAll('head style')].map(s=>s.id)`)
  await assert.rejects(measureHistoricalWidth(browser,old.CSS,`(()=>{throw Error('measurement failed')})()`),/measurement failed/)
  assert.equal(await browser.evaluate(`document.getElementById('width-plugin-css').textContent`),candidateCSS,'exact candidate bytes restored after measurement failure')
  assert.deepEqual(await browser.evaluate(`[...document.querySelectorAll('head style')].map(s=>s.id)`),order,'native/layout sheets and cascade order retained')
  assert.equal(await browser.evaluate(metrics),before)
  t.diagnostic(JSON.stringify({candidate:before,contaminatedHistory:before,isolatedHistory:historical}))
 } finally {browser.close()}
})
