import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Execute the actual plugin helper and installed host CSS in Chromium. This is
// a differential behavior gate, not a source-text/selector-shape assertion.
const source = await readFile(new URL('../src/inbox-row-ui.js', import.meta.url), 'utf8')
const cssPath = process.env.HERMES_INSTALLED_ROW_CSS
for (const [mode, radius] of [['light', 2], ['dark', 2], ['light', 0], ['dark', 0]]) {
  test(`Inbox contour matches installed Hermes at sampled phases (${mode}, ${radius}px token)`, { skip: !cssPath && 'Set HERMES_INSTALLED_ROW_CSS to the installed host stylesheet' }, async () => {
    const nativeCSS = await readFile(cssPath, 'utf8')
    const { CSS } = await loadPluginInternals(['CSS'])
    const browser = await chromium()
    try {
      const dark = mode === 'dark'
      const html = `<!doctype html><html class="${dark ? 'dark' : ''}" data-codex-chat-look="true" data-hermes-theme="codex-chat" data-hermes-mode="${mode}"><head><style>${nativeCSS}</style><style>${CSS}</style><style>
      :root{font-size:16px;--radius-md:${radius}px;--ui-text-primary:${dark ? '#eeeeee' : '#222222'};--ui-text-secondary:${dark ? '#aaaaaa' : '#666666'};--ui-text-quaternary:#777777;--ui-success:#15803d;--dt-foreground:var(--ui-text-primary);--dt-midground:var(--ui-text-secondary);--dt-background:${dark ? '#1c1c1c' : '#f3f3f3'};--ui-sidebar-surface-background:var(--dt-background);--ui-chat-surface-background:var(--dt-background);--theme-foreground:var(--ui-text-primary);--theme-sidebar-seed:var(--dt-background);--theme-background-seed:var(--dt-background);--ui-row-hover-background:transparent;--ui-row-active-background:transparent;--ui-accent:#4488dd}
      body{margin:24px;font:14px system-ui;color:var(--ui-text-primary);background:var(--dt-background)}h1{font:600 16px system-ui;margin:0 0 16px}h2{font:400 12px system-ui;color:var(--ui-text-secondary);margin:20px 0 8px}aside{width:300px}#reference{position:relative;box-sizing:border-box;border-radius:6px;width:300px;height:26px;padding:4px 28px;font-size:13px;color:var(--ui-text-secondary)}button{font:inherit;color:inherit}
      </style></head><body><h1>Inbox · ${mode}</h1><div data-tree-group="grp-sessions"><aside data-slot="sidebar" id="mount"><div id="reference" class="row-hover" data-working="true">Working<span class="arc-border arc-row" aria-hidden="true"></span></div></aside></div></body></html>`
      await browser.call('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 2, mobile: false })
      await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
      await browser.evaluate(source)
      await browser.evaluate(`
        const style=document.createElement('style');style.textContent=CODEX_INBOX_ROW_UI_CSS;document.head.append(style);
        window.rows={};for(const state of ['working','completed','idle','reading','unknown']){const ui=createCodexInboxRowUI({document});ui.update({title:state[0].toUpperCase()+state.slice(1),workState:state,settleAction:true,menuDisabled:['working','reading','unknown'].includes(state)});document.getElementById('mount').append(ui.row);rows[state]=ui}
        window.arc=rows.working.row.querySelector('[data-codex-inbox-running-arc]');window.nativeArc=document.querySelector('#reference .arc-row');
        window.contour=e=>{const s=getComputedStyle(e),p=getComputedStyle(e,'::before'),r=e.getBoundingClientRect();return {size:[r.width,r.height],radius:s.borderRadius,inset:[s.top,s.right,s.bottom,s.left],padding:s.padding,mask:s.maskImage,clip:s.maskClip,origin:s.maskOrigin,composite:s.maskComposite,overflow:s.overflow,pointerEvents:s.pointerEvents,layer:[p.width,p.height],background:p.backgroundImage,transform:p.transform,duration:p.animationDuration,timing:p.animationTimingFunction,iterations:p.animationIterationCount,willChange:p.willChange}};
      `)
      assert.equal(await browser.evaluate('arc.parentElement===rows.working.row'), true, 'native contour surrounds the row, not a 12px lead spinner')
      assert.equal(await browser.evaluate('getComputedStyle(rows.working.row).borderRadius'), '10px', 'running Inbox shell matches the already-skinned native running row')
      assert.equal(await browser.evaluate('getComputedStyle(arc).borderRadius'), await browser.evaluate('getComputedStyle(rows.working.row).borderRadius'), 'contour inherits the actual row corners even with a square global radius token')
      assert.equal(await browser.evaluate('Object.values(rows).every(ui=>ui.actions.firstElementChild===ui.clock && ui.actions.lastElementChild===ui.menu && ui.clock.getBoundingClientRect().x < ui.menu.getBoundingClientRect().x)'), true, 'real DOM and rendered positions put Snooze left and Settle right')
      const samples = []
      for (const time of [0, 557.5, 1115, 1672.5, 2229]) {
        await browser.evaluate(`for(const e of [arc,nativeArc])for(const a of e.getAnimations({subtree:true})){a.pause();a.currentTime=${time}};new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`)
        const sample = await browser.evaluate('({plugin:contour(arc),native:contour(nativeArc)})')
        assert.deepEqual(sample.plugin, sample.native, `native paint, mask and travel match at ${time}ms`)
        assert.equal(sample.plugin.duration, '2.23s')
        assert.deepEqual(sample.plugin.size, [300, 26])
        samples.push({ time, ...sample })
        if (process.env.CODEX_INBOX_ROW_EVIDENCE) {
          await mkdir(process.env.CODEX_INBOX_ROW_EVIDENCE, { recursive: true })
          const { data } = await browser.call('Page.captureScreenshot', { format: 'png' })
          await writeFile(`${process.env.CODEX_INBOX_ROW_EVIDENCE}/contour-${mode}-${time}.png`, Buffer.from(data, 'base64'))
        }
      }
      const settleStates = await browser.evaluate(`Object.fromEntries(Object.entries(rows).map(([state,ui])=>{const s=getComputedStyle(ui.menu),r=ui.menu.getBoundingClientRect();return [state,{disabled:ui.menu.disabled,opacity:s.opacity,visibility:s.visibility,slot:[r.width,r.height]}]}))`)
      for (const [state, paint] of Object.entries(settleStates)) {
        assert.deepEqual(paint.slot, [24,24])
        assert.equal(paint.visibility, ['working','reading','unknown'].includes(state) ? 'hidden' : 'visible')
        assert.equal(paint.opacity, ['working','reading','unknown'].includes(state) ? '0' : '1')
      }
      const hover = await browser.evaluate('(()=>{const r=rows.working.go.getBoundingClientRect();return {x:r.x+10,y:r.y+13}})()')
      await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', ...hover })
      await browser.evaluate('for(const e of [arc,nativeArc])for(const a of e.getAnimations({subtree:true}))a.currentTime=1115;new Promise(r=>setTimeout(r,140))')
      assert.equal(await browser.evaluate("getComputedStyle(rows.working.menu).visibility"), 'hidden')
      assert.equal(await browser.evaluate("getComputedStyle(rows.working.clock).opacity"), '1', 'hover reveals Snooze, never unavailable Settle')
      if (process.env.CODEX_INBOX_ROW_EVIDENCE) {
        const { data } = await browser.call('Page.captureScreenshot', { format:'png' })
        await writeFile(`${process.env.CODEX_INBOX_ROW_EVIDENCE}/contour-${mode}-disabled-hover.png`, Buffer.from(data,'base64'))
      }
      await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', x:620,y:340 })
      assert.notEqual(samples[0].plugin.transform, samples[2].plugin.transform, 'segments travel through the stationary contour mask')
      await browser.evaluate('for(const e of [arc,nativeArc])for(const a of e.getAnimations({subtree:true}))a.play()')
      const before = await browser.evaluate('contour(arc).transform')
      await browser.evaluate('new Promise(r=>setTimeout(r,140))')
      assert.notEqual(await browser.evaluate('contour(arc).transform'), before, 'real-time compositor animation advances')
      await browser.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      assert.equal(await browser.evaluate("getComputedStyle(arc,'::before').animationName"), 'none')
      assert.equal(await browser.evaluate("getComputedStyle(nativeArc,'::before').animationName"), 'none')
      assert.deepEqual(await browser.evaluate('contour(arc)'), await browser.evaluate('contour(nativeArc)'), 'native reduced-motion paint is retained')
      if (process.env.CODEX_INBOX_ROW_EVIDENCE) {
        const { data } = await browser.call('Page.captureScreenshot', { format: 'png' })
        await writeFile(`${process.env.CODEX_INBOX_ROW_EVIDENCE}/contour-${mode}-reduced.png`, Buffer.from(data, 'base64'))
        await writeFile(`${process.env.CODEX_INBOX_ROW_EVIDENCE}/native-differential-${mode}.json`, JSON.stringify({ cssPath, samples, settleStates, reduced: await browser.evaluate('contour(arc)') }, null, 2))
      }
    } finally { browser.close() }
  })
}
