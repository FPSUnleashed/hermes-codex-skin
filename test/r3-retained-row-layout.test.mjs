import assert from 'node:assert/strict'
import test from 'node:test'
import {writeFile} from 'node:fs/promises'
import {chromium,waitForRendered} from './helpers/chromium.mjs'
import {fixture,click} from './r3-ui-native-fixture.mjs'

for(const width of [390,900])test(`R3-01 retained native caption reserves flow after ticker unmount at ${width}px`,async()=>{
 const b=await chromium()
 try{
  await fixture(b,width)
  const initial=await b.evaluate(`(()=>{window.header=pair.querySelector('[data-codex-tool-sequence]');window.originalButton=header.querySelector('button');window.footer=document.createElement('button');footer.textContent='Following native footer';pair.after(footer);window.geometry=()=>{const h=header.getBoundingClientRect(),b=originalButton.getBoundingClientRect(),f=footer.getBoundingClientRect();return{headerHeight:h.height,buttonHeight:b.height,buttonBottom:b.bottom,footerTop:f.top,position:getComputedStyle(originalButton).position,label:caption(),current:!!pair.querySelector('[data-codex-activity-native-current]'),ticker:!!pair.querySelector('[data-tool-ticker]')}};return geometry()})()`)
  assert.equal(initial.headerHeight,0,'mounted native row supplies approved overlay height')
  assert.equal(initial.position,'absolute')
  assert.ok(initial.footerTop>=initial.buttonBottom-1)
  await b.evaluate(`change(c=>{c.roots[0].live=false;c.roots[0].parts.forEach(p=>p.result='done');return c})`)
  await waitForRendered(b,`!pair.querySelector('[data-tool-ticker]')&&!pair.querySelector('[data-codex-activity-native-current]')&&caption()==='Running second'`,'native rows unmount, factual caption retained',4000)
  const gap=await b.evaluate(`geometry()`)
  const native=await b.evaluate(`(()=>{const sheets=[...document.querySelectorAll('style')];const skin=sheets.at(-1);skin.disabled=true;const f=footer.getBoundingClientRect(),s=pair.querySelector('[data-tool-summary]').getBoundingClientRect();const result={summaryBottom:s.bottom,footerTop:f.top};skin.disabled=false;return result})()`)
  console.log('R3_01_GEOMETRY',JSON.stringify({width,initial,gap,native}))
  if(process.env.UI_EVIDENCE_RUN)await writeFile(process.env.UI_EVIDENCE_RUN+`/r3-01-${width}.json`,JSON.stringify({initial,gap,native},null,2))
  assert.ok(native.footerTop>=native.summaryBottom-1,'same native tree without skin does not overlap')
  assert.ok(gap.headerHeight>=gap.buttonHeight-1,'retained caption must reserve a row without a native current row')
  assert.notEqual(gap.position,'absolute')
  assert.ok(gap.footerTop>=gap.buttonBottom-1,'following native footer must not overlap caption')
  assert.equal(await b.evaluate(`header===pair.querySelector('[data-codex-tool-sequence]')&&originalButton===header.querySelector('button')&&nativeClicks===0`),true)
  await click(b,'[data-codex-tool-sequence] button')
  await waitForRendered(b,`pair.querySelectorAll('[data-tool-row]').length===2`,'explicit disclosure still opens native run')
  await click(b,'#second button')
  await waitForRendered(b,`!!pair.querySelector('[data-native-result]')`,'native row action retained')
  await click(b,'[data-codex-tool-sequence] button')
  await b.evaluate(`stopSkin()`)
  await waitForRendered(b,`!pair.querySelector('[data-codex-tool-sequence]')`,'existing hot-reload handoff retires skin nodes')
  assert.equal(await b.evaluate(`!pair.querySelector('[data-codex-tool-sequence]')&&footer.isConnected`),true)
 }finally{b.close()}
})
