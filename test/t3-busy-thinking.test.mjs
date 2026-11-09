import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test, { after } from 'node:test'
import { createServer } from 'node:http'
import { chromium, waitForRendered } from './helpers/chromium.mjs'
import { fixtureJS, fixtureCSS } from './helpers/native-busy.mjs'

const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body></body></html>') })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
const origin = `http://127.0.0.1:${server.address().port}`
const nativeCSS = await readFile(process.env.HERMES_INSTALLED_ROW_CSS, 'utf8')
let loader = await readFile(new URL('./helpers/load-plugin.mjs', import.meta.url), 'utf8')
if (process.env.THINKING_BASELINE_BUNDLE) loader = loader.replace("new URL('../../codex-chat-look/plugin.js', import.meta.url)", `new URL(${JSON.stringify(pathToFileURL(process.env.THINKING_BASELINE_BUNDLE).href)})`)
else loader = loader.replace("new URL('../../codex-chat-look/plugin.js', import.meta.url)", `new URL(${JSON.stringify(new URL('../codex-chat-look/plugin.js', import.meta.url).href)})`)
const { loadPluginInternals } = await import('data:text/javascript;base64,' + Buffer.from(loader).toString('base64'))
const { CSS } = await loadPluginInternals(['CSS'])
const svg = await readFile(new URL('./fixtures/brain/brain.svg', import.meta.url), 'utf8')
const expectedMask = 'url("data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '")'
const row = '[data-slot="aui_response-loading"],[data-slot="aui_turn-activity"]'
const probe = `(()=>{const e=document.querySelector(${JSON.stringify(row)});if(!e)return null;const s=getComputedStyle(e),b=getComputedStyle(e,'::before'),a=getComputedStyle(e,'::after'),d=e.querySelector(':scope > .dither'),timer=e.lastElementChild;return{slot:e.dataset.slot,state:e.dataset.state||null,label:e.getAttribute('aria-label'),live:e.getAttribute('aria-live'),role:e.getAttribute('role'),before:b.content,mask:b.maskImage,iconWidth:parseFloat(b.width),iconColor:b.backgroundColor,animation:b.animationName,after:a.content,order:[b.order,a.order,timer?getComputedStyle(timer).order:null],dither:d?getComputedStyle(d).display:null,children:e.children.length,text:e.textContent,timer:timer?.textContent,font:s.fontFamily,size:parseFloat(s.fontSize),gap:parseFloat(s.gap),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width,position:s.position,shimmer:!!e.querySelector('.shimmer'),right:timer?.getBoundingClientRect().right,paneRight:document.querySelector('#pane').getBoundingClientRect().right}})()`
async function enable(b, on = true) {
  await b.evaluate(`document.documentElement.${on ? "setAttribute('data-codex-chat-look','true')" : "removeAttribute('data-codex-chat-look')"}`)
  await b.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
}
async function update(b, patch) { await b.evaluate(`window.updateBusy(${JSON.stringify(patch)})`) }
async function fixture(theme = 'dark', scale = 1) {
  const b = await chromium()
  try {
    await b.call('Page.navigate', { url: origin })
    await waitForRendered(b, `location.origin===${JSON.stringify(origin)} && document.readyState==='complete'`, 'isolated local fixture origin')
    await b.call('Emulation.setDeviceMetricsOverride', { width: 400, height: 700, deviceScaleFactor: 1, mobile: false })
    const light = theme === 'light', fg = light ? '#242424' : theme === 'external' ? '#cce8dd' : '#eeeeee', bg = light ? '#ffffff' : theme === 'external' ? '#073642' : '#111111'
    await b.call('Page.setDocumentContent', { frameId: (await b.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><html><head><style>${nativeCSS}</style><style>${fixtureCSS}</style><style>${CSS}</style><style>:root{--chat-text-scale:${scale};--dt-font-sans:serif;--font-sans:var(--dt-font-sans);--ui-base:${fg};--ui-text-primary:${fg};--ui-text-secondary:${fg};--ui-text-tertiary:#888;--ui-accent:#b25393;--primary:#b25393;--primary-foreground:#fff;--ui-chat-surface-background:${bg};--conversation-tool-font-size:14px;--conversation-line-height:22.75px;--conversation-scaffold-text:${fg}}body{font-family:var(--dt-font-sans);background:${bg};color:${fg}}#pane{width:280px;max-width:100%}</style></head><body><div id='fixture'></div></body></html>` })
    await b.evaluate(fixtureJS)
    await waitForRendered(b, `document.querySelector('[data-slot="aui_response-loading"]')`, 'native response loading mounts')
    // The native viewed interval intentionally pauses outside the foreground.
    await b.call('Page.bringToFront')
    assert.deepEqual(await b.evaluate(`({focus:document.hasFocus(),visibility:document.visibilityState})`), { focus: true, visibility: 'visible' }, 'native clock fixture must be viewed')
    return b
  } catch (e) { b.close(); throw e }
}
function assertThinking(p, scale = 1) {
  assert.equal(p.mask, expectedMask, 'use the resolved lucide Brain, not the native square')
  assert.equal(p.after, '"Thinking"')
  assert.equal(p.dither, 'none')
  assert.equal(p.iconWidth, 16 * scale)
  assert.equal(p.size, 14 * scale)
  assert.equal(p.gap, 8 * scale)
  assert.ok(p.height >= 24 * scale)
  assert.equal(p.animation, 'none', 'do not add an infinite compositor animation')
  assert.deepEqual(p.order, ['0', '1', '2'])
  assert.equal(p.role, 'status'); assert.equal(p.live, 'polite')
  assert.ok(p.timer?.length && p.right <= p.paneRight + .1, JSON.stringify(p))
  assert.match(p.font, /serif/)
}
for (const theme of ['dark', 'light', 'external']) test(`native busy Brain/Thinking, timer, font and restoration (${theme})`, async () => {
  const b = await fixture(theme)
  try {
    await enable(b)
    await b.evaluate(`window.nativeRow=document.querySelector(${JSON.stringify(row)});window.nativePulse=nativeRow.querySelector('.dither');window.nativeTimer=nativeRow.lastElementChild;window.nativeStop=document.querySelector('button[aria-label="Stop"]');window.nativeSquare=nativeStop.firstElementChild;window.nativeOther=document.querySelector('#unrelated .dither');window.savedPrefs=JSON.stringify(localStorage)`)
    const p = await b.evaluate(probe); assertThinking(p)
    assert.equal(p.label, 'Loading response')
    const unchanged = `(()=>{const stop=getComputedStyle(nativeSquare),other=getComputedStyle(nativeOther);return{stopDisplay:stop.display,stopWidth:stop.width,stopMask:getComputedStyle(nativeStop,'::before').maskImage,otherDisplay:other.display,otherMask:getComputedStyle(nativeOther,'::before').maskImage}})()`
    const controls = await b.evaluate(unchanged)
    assert.notEqual(controls.stopDisplay, 'none'); assert.notEqual(controls.otherDisplay, 'none'); assert.equal(controls.stopMask, 'none'); assert.equal(controls.otherMask, 'none')
    await waitForRendered(b, `window.nativeTimer.textContent!==${JSON.stringify(p.timer)}`, 'the actual native clock still ticks', 2500)
    for (const on of [false, true, false, true]) {
      await enable(b, on)
      const now = await b.evaluate(probe)
      if (on) assertThinking(now)
      else { assert.equal(now.mask, 'none'); assert.equal(now.after, 'none'); assert.notEqual(now.dither, 'none') }
      assert.equal(await b.evaluate(`nativeRow===document.querySelector(${JSON.stringify(row)})&&nativeTimer===nativeRow.lastElementChild&&nativePulse===nativeRow.querySelector('.dither')&&nativeStop===document.querySelector('button[aria-label="Stop"]')&&nativeSquare===nativeStop.firstElementChild`), true)
      assert.deepEqual(await b.evaluate(unchanged), controls)
    }
    await b.evaluate(`document.documentElement.style.setProperty('--dt-font-sans','monospace')`)
    assert.match((await b.evaluate(probe)).font, /monospace/)
    await b.evaluate(`document.documentElement.style.setProperty('--dt-font-sans','serif')`)
    const stopPoint = await b.evaluate(`(()=>{const r=nativeStop.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await b.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...stopPoint })
    await b.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...stopPoint })
    assert.deepEqual(await b.evaluate(`({actions:stopActions,submits:stopSubmits})`), { actions: ['composer.cancel'], submits: 1 })
    assert.equal(await b.evaluate(`JSON.stringify(localStorage)===savedPrefs`), true)
    if (process.env.THINKING_SCREENSHOT_DIR) await writeFile(`${process.env.THINKING_SCREENSHOT_DIR}/${theme}.png`, Buffer.from((await b.call('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  } finally { b.close() }
})

for (const mode of ['loading', 'turn']) test(`native specialized hints and compaction are not renamed (${mode})`, async () => {
  const b = await fixture()
  try {
    await update(b, { mode, providerWait: 'Waiting on provider' }); await enable(b)
    for (const patch of [
      {providerWait:'Waiting on provider',drafting:null,localLoad:null},
      {providerWait:'',drafting:{name:'read_file',since:Date.now()}},
      {providerWait:'',drafting:null,localLoad:{model:'Qwen',percent:43}},
      {providerWait:'⏳ loading Qwen into memory — 43% …',drafting:null,localLoad:null},
      {providerWait:'⚙ processing prompt — 31%'}
    ]) {
      await update(b, patch)
      await waitForRendered(b, `document.querySelector(${JSON.stringify(row)})?.querySelector('.shimmer')`, 'native hint is visible', 1500)
      if (patch.drafting) await waitForRendered(b, `document.querySelector(${JSON.stringify(row)}).textContent.includes('Reading file')`, 'native drafting debounce', 1500)
      const p = await b.evaluate(probe)
      assert.equal(p.mask, expectedMask); assert.equal(p.after, 'none'); assert.equal(p.dither, 'none'); assert.equal(p.shimmer, true)
      assert.ok(p.height >= 24); assert.ok(p.timer?.length)
      assert.equal(await b.evaluate(`document.querySelectorAll(${JSON.stringify(row)}).length`), 1)
      if (patch.localLoad) assert.match(p.text, /Loading Qwen43%/)
      if (patch.providerWait?.startsWith('⚙')) assert.match(p.text, /Processing prompt31%/)
    }
    await update(b, { compacting: true, providerWait: '', drafting: null, localLoad: null })
    const compaction = await b.evaluate(probe)
    assert.equal(compaction.label, 'Summarizing thread'); assert.equal(compaction.mask, 'none'); assert.equal(compaction.after, 'none'); assert.notEqual(compaction.dither, 'none')
    assert.match(compaction.text, /Summarizing thread/)
  } finally { b.close() }
})

test('native turn lifecycle owns quiet/awaiting/tool/idle/error/hidden-reasoning transitions', async () => {
  const b = await fixture()
  try {
    await update(b, { mode: 'turn' }); await enable(b)
    assert.equal(await b.evaluate(probe), null, 'do not invent a row during the native quiet window')
    await waitForRendered(b, `document.querySelector('[data-state="active"]')`, 'native quiet window activates', 3000)
    assertThinking(await b.evaluate(probe))
    await b.evaluate(`window.retainedTurn=document.querySelector('[data-slot="aui_turn-activity"]');void 0`)
    for (let i = 0; i < 3; i++) {
      for (const patch of [{awaitingInput:true},{awaitingInput:false,content:[{type:'tool-call',toolName:'terminal'}]},{busy:false,content:[],status:{type:'complete',reason:'error'},turnStartedAt:null}]) {
        await update(b, patch)
        const p = await b.evaluate(probe)
        assert.equal(p.state, 'idle'); assert.equal(p.children, 0); assert.equal(p.text, ''); assert.equal(p.label, ''); assert.equal(p.mask, 'none'); assert.equal(p.after, 'none'); assert.equal(p.position, 'absolute'); assert.ok(p.width <= 1 && p.height <= 1, JSON.stringify(p))
        assert.equal(await b.evaluate(`retainedTurn===document.querySelector('[data-slot="aui_turn-activity"]')`), true)
      }
      await update(b, {busy:true,awaitingInput:false,content:[],status:{type:'running'},turnStartedAt:Date.now()-16000})
      await waitForRendered(b, `document.querySelector('[data-state="active"]')`, 'native resume reactivates', 3000)
      assertThinking(await b.evaluate(probe))
      assert.equal(await b.evaluate(`retainedTurn===document.querySelector('[data-slot="aui_turn-activity"]')`), true)
    }
    await update(b, {thinking:true,showReasoning:false})
    assert.equal((await b.evaluate(probe)).slot, 'aui_response-loading'); assertThinking(await b.evaluate(probe))
    assert.equal(await b.evaluate(`document.querySelectorAll(${JSON.stringify(row)}).length`), 1, 'native hidden-reasoning branch does not duplicate the indicator')
    await b.evaluate(`window.unmountBusy()`)
    assert.equal(await b.evaluate(`document.querySelectorAll(${JSON.stringify(row)}).length`), 0)
    assert.deepEqual(await b.evaluate(`fixtureErrors`), [])
  } finally { b.close() }
})

test('Brain/Thinking scales with native chat metrics and respects reduced motion', async () => {
  const b = await fixture('external', 1.75)
  try {
    await b.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await enable(b); assertThinking(await b.evaluate(probe), 1.75)
    assert.equal(await b.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(row)}),'::after').animationName`), 'none')
  } finally { b.close() }
})
