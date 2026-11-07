import assert from 'node:assert/strict'
import test from 'node:test'
import {fixture, part, wait, click} from './helpers/native-thought.mjs'
import {nativeFactualBundle} from './helpers/native-factual-v9.mjs'
import {nativeStatusFixture} from './helpers/status-theme-fixture.mjs'
import {T3_SOURCE_PALETTES} from '../src/t3-themes.js'
import {t3ThemePaintCSS} from '../src/t3-theme-paint.js'

// Real native ThinkingDisclosure, ToolRunHeader, ScaffoldRow and DisclosureRow.
// Their established helpers isolate clock/store/markdown inputs only. The full
// shipping plugin runs; its pseudo-elements are counted as painters, not nodes.
const factual = await nativeFactualBundle()
const themeFixture = nativeStatusFixture()
async function addFactual(b, live = false) {
  await b.evaluate(`window.thoughtChange=window.change;document.getElementById('fixture').id='thought-fixture';document.body.insertAdjacentHTML('beforeend','<div id="fixture"></div>');window.config=${JSON.stringify({live, summary:'Explored 5 files, ran 3 commands, used 1 tool', tool:'Ran 5 commands, used 1 tool'})}`)
  await b.evaluate(factual)
  await wait(b, `document.querySelector('[data-session-anchor="native-v9"] [data-codex-tool-sequence] button')`)
  await b.evaluate(`window.factualChange=window.change;window.factualHeader=()=>document.querySelector('[data-session-anchor="native-v9"] [data-codex-tool-sequence] button');window.originalNative=document.querySelector('#g');window.originalParent=originalNative.parentNode;document.documentElement.setAttribute('data-renderer-animations-paused','')`)
}
const paint = `(()=>{const button=factualHeader(),icon=button.querySelector('[data-codex-activity-icon]'),pseudo=getComputedStyle(button,'::before'),ink=getComputedStyle(icon);return {headers:document.querySelectorAll('[data-session-anchor="native-v9"] [data-codex-tool-sequence]').length,pseudoDisplay:pseudo.display,pseudoMask:pseudo.maskImage,iconDisplay:ink.display,iconMask:ink.maskImage,iconWidth:icon.getBoundingClientRect().width,iconOpacity:ink.opacity,chevron:button.lastElementChild.textContent,expanded:button.getAttribute('aria-expanded'),nativePreserved:document.querySelector('#g')===originalNative&&originalNative.parentNode===originalParent}})()`

test('shipping native reasoning aggregate has one brain slot; sweep layers and prose glyphs survive', {timeout:15000}, async () => {
  const b = await fixture([part('r1','thought'),part('r2','thought'),part('p','prose',{text:'🧠 Valid prose and 🔨 valid prose.'})])
  try {
    await wait(b, `header()?.closest('[data-codex-tool-sequence]')?.getAttribute('data-codex-tool-sequence-glyph')==='brain'`)
    for (const live of [false,true,false]) {
      await b.evaluate(`change(roots=>{roots[0].live=${live};for(const part of roots[0].parts)part.live=${live};return roots})`)
      await wait(b, `header()?.closest('[data-codex-tool-sequence]')?.getAttribute('data-codex-tool-sequence-glyph')==='brain'`)
      const actual = await b.evaluate(`(()=>{const button=header(),face=button.querySelector('[data-codex-activity-face]'),leading=face.querySelector(':scope > [data-codex-activity-content] > [data-codex-activity-icon]');return{pseudo:getComputedStyle(button,'::before').display,baseSlots:face.querySelectorAll(':scope > [data-codex-activity-content] > [data-codex-activity-icon]').length,mask:getComputedStyle(leading).maskImage,prose:el('p').textContent,nativeRoots:document.querySelectorAll('[data-slot="aui_thinking-disclosure"]').length}})()`)
      assert.equal(actual.pseudo, 'none')
      assert.equal(actual.baseSlots, 1)
      assert.notEqual(actual.mask, 'none')
      assert.equal(actual.nativeRoots, 2)
      assert.equal(actual.prose, '🧠 Valid prose and 🔨 valid prose.')
    }
    await b.evaluate(`stopRuntime()`)
    await wait(b, `!document.querySelector('[data-codex-tool-sequence]')`)
    assert.equal(await b.evaluate(`document.querySelectorAll('[data-slot="aui_thinking-disclosure"]').length`), 2)
  } finally {b.close()}
})

test('shipping leading painters: one icon across refresh, active/history, reload and cleanup', {timeout:40000}, async () => {
  const b = await fixture([])
  try {
    await addFactual(b, true)
    for (const phase of ['active','refresh','history','hot reload']) {
      if (phase === 'refresh') for (let i = 0; i < 8; i++) await b.evaluate(`factualChange({summary:'ACCEPTANCE.md · Explored ${5+i} files, ran 3 commands, used 1 tool'})`)
      if (phase === 'history') await b.evaluate(`factualChange({live:false});document.querySelector('#stop').remove()`)
      if (phase === 'hot reload') await b.evaluate(`stopRuntime();window.stopRuntime=start()`)
      await wait(b, `factualHeader()`)
      const actual = await b.evaluate(paint)
      assert.equal(actual.headers, 1, phase)
      assert.equal(actual.pseudoDisplay, 'none', `${phase}: a generated face must suppress the independent pseudo-icon`)
      assert.notEqual(actual.iconDisplay, 'none', phase)
      assert.notEqual(actual.iconMask, 'none', phase)
      assert.ok(actual.iconWidth > 0, phase)
      assert.equal(actual.iconOpacity, '1', phase)
      assert.equal(actual.chevron, '›', phase)
      assert.equal(actual.nativePreserved, true, phase)
    }
    // Repeated real pointer clicks must still reach the same owned button.
    await b.evaluate(`document.querySelectorAll('[data-codex-turn-activity][aria-expanded="false"]').forEach(button=>button.click())`)
    for (let i = 0; i < 6; i++) {
      // Stop/start schedules a fresh native/outer projection on idle. Require a
      // stable rendered endpoint before the one click, not a retry after failure.
      await wait(b, `(()=>{const node=factualHeader();if(!node)return false;const r=node.getBoundingClientRect(),rect=[r.x,r.y,r.width,r.height].join(',');let p=window.v15StableRect;if(!p||p.node!==node||p.rect!==rect){p=window.v15StableRect={node,rect,since:performance.now()}}return r.width>0&&r.height>0&&performance.now()-p.since>=150})()`)
      const p = await b.evaluate(`(()=>{const b=factualHeader(),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:b.contains(document.elementFromPoint(x,y)),open:b.getAttribute('aria-expanded')}})()`)
      assert.equal(p.hit, true, 'label is reachable')
      await click(b, '[data-session-anchor="native-v9"] [data-codex-tool-sequence] button')
      assert.equal(await b.evaluate(`factualHeader().getAttribute('aria-expanded')`), p.open === 'true' ? 'false' : 'true')
      await b.evaluate(`factualChange({summary:'ACCEPTANCE.md · Explored 5 files, ran 3 commands, used 1 tool'})`)
    }
    await b.evaluate(`stopRuntime()`)
    await wait(b, `!document.querySelector('[data-codex-tool-sequence]')`)
    assert.equal(await b.evaluate(`document.querySelector('#g')===originalNative&&originalNative.parentNode===originalParent`), true)
  } finally {b.close()}
})

test('shipping hammer resting ink matches actual Thinking scaffold label across native and T3 palettes', {timeout:40000}, async () => {
  const b = await fixture([part('thinking-reference-native','thought')])
  try {
    await addFactual(b)
    // This helper's fallback colors are for structure-only tests. Real palette
    // probes must leave these two roles to the captured stylesheet and writer.
    await b.evaluate(`(()=>{const style=[...document.querySelectorAll('style')].find(s=>s.textContent.startsWith('body{padding:30px}'));if(!style||!style.textContent.includes('--ui-text-secondary:#555;--ui-text-tertiary:#888;'))throw Error('native thought fixture fallback changed');style.textContent=style.textContent.replace('--ui-text-secondary:#555;--ui-text-tertiary:#888;','')})()`)
    await b.evaluate(themeFixture.script)
    const native = themeFixture.themes[0]
    const matrix = []
    for (const mode of ['light','dark']) for (const glass of [false,true]) matrix.push({theme:native,mode,glass})
    for (const name of Object.keys(T3_SOURCE_PALETTES)) for (const mode of ['light','dark']) matrix.push({name,mode,glass:false})
    for (const item of matrix) {
      await b.evaluate(`document.getElementById('v15-theme-paint')?.remove();nativePaint(${JSON.stringify(native)},${JSON.stringify(item.mode)});document.documentElement.toggleAttribute('data-hermes-glass',${item.glass});document.documentElement.dataset.hermesGlassScope='sidebar';document.documentElement.style.setProperty('--translucency-glass-keep','70%');`)
      if (item.name) {
        const css = t3ThemePaintCSS(item.name,T3_SOURCE_PALETTES[item.name])
        await b.evaluate(`(()=>{document.documentElement.setAttribute('data-hermes-theme',${JSON.stringify('codex-t3-'+item.name.replace(/^t3-/,''))});document.documentElement.setAttribute('data-hermes-mode',${JSON.stringify(item.mode)});const s=document.createElement('style');s.id='v15-theme-paint';s.textContent=${JSON.stringify(css)};document.head.append(s)})()`)
      }
      await wait(b, `document.getAnimations().every(a=>a.effect.getComputedTiming().iterations===Infinity||a.playState!=='running')`)
      const actual = await b.evaluate(`(()=>{const label=document.querySelector('[data-slot="aui_thinking-disclosure"] [class~="text-(--conversation-scaffold-text)"]'),generated=factualHeader().querySelector('[data-codex-activity-icon]'),nativeButton=document.querySelector('#g button');return{reference:getComputedStyle(label).color,labelOpacity:getComputedStyle(label).opacity,generated:getComputedStyle(generated).color,native:getComputedStyle(nativeButton,'::before').color,generatedOpacity:getComputedStyle(generated).opacity,nativeOpacity:getComputedStyle(nativeButton,'::before').opacity,nativeMask:getComputedStyle(nativeButton,'::before').maskImage}})()`)
      const name = `${item.name || native.name}/${item.mode}/${item.glass?'glass':'opaque'}`
      console.log('V15_PAINT_SAMPLE '+JSON.stringify({name,reference:actual.reference,generated:actual.generated,native:actual.native}))
      assert.notEqual(actual.reference, 'rgba(0, 0, 0, 0)', name)
      assert.equal(actual.native, actual.reference, name+' native Hammer')
      assert.equal(actual.generated, actual.reference, name+' aggregate fallback Hammer')
      assert.equal(actual.generatedOpacity, actual.labelOpacity, name+' aggregate opacity')
      assert.equal(actual.nativeOpacity, actual.labelOpacity, name+' native opacity')
      assert.notEqual(actual.nativeMask, 'none', name)
    }
    console.log('V15_HAMMER_PAINT_MATRIX '+JSON.stringify({cases:matrix.length,nativeSourceInputs:themeFixture.inputs}))
  } finally {b.close()}
})
