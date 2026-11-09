import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFile } from 'node:fs/promises'
import { chromium, waitForRendered } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'
import { nativeStatusFixture } from './helpers/status-theme-fixture.mjs'

// Native theme writer and installed CSS, exercised in isolated Chromium only.
test('every palette derives status contrast in OKLCH without changing composer, text, geometry or controls', async () => {
  const native = nativeStatusFixture()
  const { plugin, CSS, decorateComposerChrome } = await loadPluginInternals(['CSS', 'decorateComposerChrome'])
  const themes = [...native.themes]
  const disposers = []
  plugin.register({ storage: { get: (_key, fallback) => fallback, set: () => assert.fail('Preference write') }, register: entry => { if (entry.area === 'themes') themes.push(entry.data) }, onDispose: fn => disposers.push(fn) })
  const modes = ['light', 'dark'], glasses = ['off', 'sidebar', 'window'], states = ['rest', 'scrolled', 'hover', 'focus']
  const browser = await chromium(), rows = [], failures = []
  try {
    const markup = `<div id="chat" style="background:var(--ui-chat-surface-background);min-height:460px"><div style="height:40px"></div><div data-slot="composer-dock" id="dock" class="group/composer-dock"><div class="status-drawer"><div class="status-drawer-clip"><div class="status-drawer-content"><div data-slot="composer-status-stack"><div id="frame"><div data-slot="status-stack-scroll"><div id="status" data-slot="status-stack-content" class="opacity-100"><div data-slot="status-stack-section"><button id="tasks">Previous tasks 2/11</button></div><div data-slot="status-stack-section" style="height:80px"></div></div></div></div></div></div></div></div><div data-slot="composer-root" id="composer-root"><div data-slot="composer-surface" id="composer" style="position:relative"><div aria-hidden="true" style="position:absolute;inset:0"></div><input id="input" style="position:relative;margin:10px" aria-label="Message" /></div></div></div></div>`
    const fixtureCSS = '*{box-sizing:border-box}html,body{margin:0;min-height:460px}#dock{position:relative;width:440px!important;padding:0!important;margin:0}#frame{min-height:100px}#composer{height:110px}#status{transition:none!important}#tasks{height:25px}.status-drawer{display:grid;grid-template-rows:1fr}.status-drawer-clip{min-height:0;overflow:hidden}'
    await browser.call('Emulation.setDeviceMetricsOverride', { width: 480, height: 500, deviceScaleFactor: 1, mobile: false })
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><html data-codex-chat-look="true"><head><style>${native.css}</style><style>${CSS}</style><style>${fixtureCSS}</style></head><body>${markup}</body></html>` })
    await browser.evaluate(`${native.script}\nwindow.decorate=${decorateComposerChrome.toString()};window.clicks=0;window.originalInput=document.getElementById('input');window.originalTasks=document.getElementById('tasks');originalTasks.onclick=()=>window.clicks++;
      window.channels=color=>{const e=document.createElement('span');e.style.color='oklch(from '+color+' l c h)';document.body.append(e);const s=getComputedStyle(e).color;e.remove();if(!s.startsWith('oklch('))throw Error('Unresolved OKLCH: '+s);return s.slice(6,s.indexOf(')')).split(' ').slice(0,3).map(x=>x==='none'?0:Number(x))};
      window.sample=id=>{const e=document.getElementById(id),s=getComputedStyle(e),r=e.getBoundingClientRect();return {background:s.backgroundColor,color:s.color,border:s.borderColor,shadow:s.boxShadow,opacity:s.opacity,rect:[r.x,r.y,r.width,r.height],text:e.textContent}};
      window.snapshot=()=>Object.fromEntries(['frame','composer','tasks','input','status'].map(id=>[id,sample(id)]));`)
    const screenPixels = async (points, imagePath) => {
      const { data } = await browser.call('Page.captureScreenshot', { format: 'png' })
      if (imagePath) await writeFile(imagePath, Buffer.from(data, 'base64'))
      return browser.evaluate(`new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);resolve(${JSON.stringify(points)}.map(([x,y])=>[...context.getImageData(x,y,1,1).data]))};image.onerror=reject;image.src=${JSON.stringify('data:image/png;base64,' + data)}})`)
    }
    for (const theme of themes) for (const mode of modes) for (const glass of glasses) {
      await browser.evaluate(`(()=>{const r=document.documentElement;r.removeAttribute('data-hermes-glass');r.removeAttribute('data-hermes-glass-scope');if(${JSON.stringify(glass)}!=='off'){r.dataset.hermesGlass='';r.dataset.hermesGlassScope=${JSON.stringify(glass)};r.style.setProperty('--translucency-glass-keep','60%');r.style.setProperty('--glass-rail-edge','0px')}nativePaint(${JSON.stringify(theme)},${JSON.stringify(mode)});decorate()})()`)
      for (const state of states) {
        const label = `${theme.name}/${mode}/${glass}/${state}`
        const rect = await browser.evaluate(`(()=>{const input=document.getElementById('input');document.getElementById('composer-root').toggleAttribute('data-thread-scrolled-up',${JSON.stringify(state)}!=='rest');document.getElementById('status').className=${JSON.stringify(state)}==='scrolled'?'opacity-30 group-hover/composer-dock:opacity-100 group-focus-within/composer-dock:opacity-100':'opacity-100';input[${JSON.stringify(state)}==='focus'?'focus':'blur']();decorate();return sample('tasks').rect})()`)
        await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: state === 'hover' ? rect[0] + 5 : 470, y: state === 'hover' ? rect[1] + 5 : 490 })
        await waitForRendered(browser, () => true)
        const result = await browser.evaluate(`(()=>{const r=document.documentElement;
          const base='color-mix(in srgb, var(--codex-composer-fill) 50%, var(--codex-color-chat))';
          r.style.setProperty('--codex-color-status-panel',base);const before=snapshot(),baseChannels=channels(before.frame.background),backgroundChannels=channels(getComputedStyle(document.getElementById('chat')).backgroundColor);
          r.style.removeProperty('--codex-color-status-panel');const after=snapshot(),afterChannels=channels(after.frame.background);
          originalTasks.click();return {before,after,baseChannels,afterChannels,backgroundChannels,renderedMode:r.dataset.hermesMode,identity:originalTasks===document.getElementById('tasks')&&originalInput===document.getElementById('input')};})()`)
        try {
          for (const id of ['composer', 'tasks', 'input', 'status']) assert.deepEqual(result.after[id], result.before[id], `${label}/${id}`)
          const { background: ignoredBefore, ...beforeFrame } = result.before.frame
          const { background: ignoredAfter, ...afterFrame } = result.after.frame
          assert.deepEqual(afterFrame, beforeFrame, `${label}/frame preservation`)
          const [l, c, h] = result.baseChannels, [nextL, nextC, nextH] = result.afterChannels
          assert.ok(Math.abs(nextL - Math.max(0, Math.min(1, l + (result.renderedMode === 'dark' ? 0.04 : -0.025)))) < 0.000003, `${label}/small directed lightness step`)
          assert.ok(Math.abs(nextC - c) < 0.000003, `${label}/chroma preserved`)
          // Hue is undefined near gray. Cartesian chroma coordinates also catch
          // actual hue drift without treating neutral conversion noise as color.
          for (const axis of [Math.sin, Math.cos]) assert.ok(Math.abs(nextC * axis(nextH * Math.PI / 180) - c * axis(h * Math.PI / 180)) < 0.000003, `${label}/chromatic coordinates preserved`)
          if (glass === 'off') assert.ok(Math.abs(nextL - result.backgroundChannels[0]) > Math.abs(l - result.backgroundChannels[0]), `${label}/moves away from background`)
          assert.ok(result.identity, `${label}/native controls retained`)
        } catch (error) { failures.push({ label, message: error.message }) }
        let pixels
        if (state === 'rest') {
          const points = [[220, 20], [220, Math.floor(result.after.frame.rect[1] + 60)], [220, Math.floor(result.after.composer.rect[1] + 65)]]
          await browser.evaluate(`document.documentElement.style.setProperty('--codex-color-status-panel','color-mix(in srgb, var(--codex-composer-fill) 50%, var(--codex-color-chat))')`)
          await waitForRendered(browser, () => true)
          const before = await screenPixels(points)
          await browser.evaluate(`document.documentElement.style.removeProperty('--codex-color-status-panel')`)
          await waitForRendered(browser, () => true)
          const imagePath = process.env.STATUS_CONTRAST_IMAGES_DIR && glass === 'off' && ['nous', 'codex-t3-chat', 'codex-t3-code'].includes(theme.name) ? `${process.env.STATUS_CONTRAST_IMAGES_DIR}/${theme.name}-${mode}.png` : undefined
          const after = await screenPixels(points, imagePath)
          pixels = { points, before, after }
          try {
            assert.deepEqual(after[0], before[0], `${label}/painted backdrop unchanged`)
            assert.deepEqual(after[2], before[2], `${label}/painted composer unchanged`)
            assert.notDeepEqual(after[1], before[1], `${label}/bar adjustment reaches painted pixels`)
          } catch (error) { failures.push({ label, message: error.message }) }
        }
        rows.push({ label, renderedMode: result.renderedMode, base: result.baseChannels, after: result.afterChannels, background: result.backgroundChannels, pixels })
      }
    }
    assert.equal(rows.length, themes.length * modes.length * glasses.length * states.length)
    assert.equal(rows.filter(row => row.pixels).length, themes.length * modes.length * glasses.length)
    assert.equal(await browser.evaluate('window.clicks'), rows.length)
    if (process.env.STATUS_CONTRAST_REPORT) await writeFile(process.env.STATUS_CONTRAST_REPORT, JSON.stringify({ nativeInputs: native.inputs, themes: themes.map(t => t.name), modes, glasses, states, cases: rows.length, failures, rows }, null, 2) + '\n')
    console.log(JSON.stringify({ themes: themes.length, cases: rows.length, failures: failures.length }))
    assert.deepEqual(failures, [])
  } finally {
    browser.close()
    for (const dispose of disposers.reverse()) dispose()
  }
})
