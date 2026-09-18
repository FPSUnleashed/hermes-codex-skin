import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const message = 'Session controls unavailable: request timed out after 30s: session.control.read'
// Structure/classes from native status-stack/session-control.tsx; no text selector.
const notice = id => `<div id="${id}" class="native-alert" role="alert"><div class="flex items-center gap-1.5 truncate"><i aria-hidden="true" class="codicon codicon-error shrink-0">⊗</i><span class="truncate">${message}</span></div><button type="button" aria-label="Dismiss error" class="native-close"><i aria-hidden="true" class="codicon codicon-close">×</i></button></div>`

test('session error notice uses a theme-aware Codex card without replacing native content or dismissal', async () => {
  const b = await chromium()
  try {
    const { CSS } = await loadPluginInternals(['CSS'])
    const { frameTree } = await b.call('Page.getFrameTree')
    await b.call('Emulation.setDeviceMetricsOverride', { width: 780, height: 180, deviceScaleFactor: 1, mobile: false })
    await b.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<html data-codex-chat-look="true"><head><style>
      *{box-sizing:border-box}body{margin:12px;font:12px/20px -apple-system,system-ui,sans-serif;background:var(--ui-chat-surface-background)}#stack{width:740px;max-width:100%}.native-alert{display:flex;align-items:center;justify-content:space-between;gap:8px;border:0;border-bottom:1px solid color-mix(in srgb,var(--dt-destructive) 20%,transparent);background:color-mix(in srgb,var(--dt-destructive) 10%,transparent);padding:6px 12px;color:var(--dt-destructive)}.flex{display:flex}.items-center{align-items:center}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.shrink-0{flex-shrink:0}.native-close{width:24px;height:24px;flex-shrink:0;padding:0;border:0;background:transparent;color:inherit}.codicon{font-style:normal}.native-alert>div{gap:6px}.codicon-error{font-size:14px}
      ${CSS}</style></head><body><div data-slot="composer-status-stack" id="stack"><div><div data-slot="status-stack-scroll"><div data-slot="status-stack-content"><div data-slot="status-stack-section">${notice('notice')}</div><div data-slot="status-stack-section"><div data-slot="session-control-goal"><div role="alert" id="nested">Goal validation error</div></div></div></div></div></div></div><div id="other">${notice('outside')}</div></body></html>` })
    await b.evaluate(`window.originalNotice=document.getElementById('notice');window.dismissals=0;originalNotice.querySelector('button').onclick=()=>{dismissals++;originalNotice.remove()};window.theme=(card,text,error)=>{for(const [k,v] of Object.entries({'--ui-chat-surface-background':card,'--ui-editor-surface-background':card,'--dt-card':card,'--ui-text-primary':text,'--ui-text-secondary':text,'--dt-destructive':error,'--ui-stroke-tertiary':text,'--ui-row-hover-background':card}))document.documentElement.style.setProperty(k,v)};window.measure=()=>{const el=document.getElementById('notice'),cs=getComputedStyle(el),text=el.querySelector('span'),r=el.getBoundingClientRect(),button=el.querySelector('button').getBoundingClientRect();return {radius:cs.borderRadius,background:cs.backgroundColor,color:cs.color,icon:getComputedStyle(el.querySelector('.codicon-error')).color,border:cs.borderTopWidth,role:el.getAttribute('role'),text:text.textContent,whiteSpace:getComputedStyle(text).whiteSpace,inside:button.right<=r.right&&button.left>=r.left,textFits:text.scrollWidth<=text.clientWidth+1,identity:el===originalNotice,outside:getComputedStyle(document.getElementById('outside')).borderRadius,nested:getComputedStyle(document.getElementById('nested')).borderRadius}}`)
    for (const [card, text, error, expected] of [
      ['#ffffff', '#171717', '#d00e17', ['rgb(255, 255, 255)', 'rgb(23, 23, 23)', 'rgb(208, 14, 23)']],
      ['#212121', '#fcfcfc', '#ef4444', ['rgb(33, 33, 33)', 'rgb(252, 252, 252)', 'rgb(239, 68, 68)']],
      ['#fdf6e3', '#586e75', '#dc322f', ['rgb(253, 246, 227)', 'rgb(88, 110, 117)', 'rgb(220, 50, 47)']]
    ]) {
      await b.evaluate(`theme(${JSON.stringify(card)},${JSON.stringify(text)},${JSON.stringify(error)})`)
      for (const width of [740, 260]) {
        await b.evaluate(`document.getElementById('stack').style.width='${width}px'`)
        const r = await b.evaluate('measure()')
        assert.equal(r.radius, '12px'); assert.equal(r.border, '1px')
        assert.deepEqual([r.background, r.color, r.icon], expected)
        assert.equal(r.role, 'alert'); assert.equal(r.text, message); assert.equal(r.whiteSpace, 'normal')
        assert.equal(r.inside, true); assert.equal(r.textFits, true); assert.equal(r.identity, true)
        assert.equal(r.outside, '0px'); assert.equal(r.nested, '0px')
      }
    }
    if (process.env.CODEX_NOTIFICATION_PREVIEW) {
      await b.evaluate(`document.getElementById('stack').style.width='740px';document.getElementById('other').style.display='none';document.getElementById('nested').style.display='none'`)
      const { data } = await b.call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 780, height: 90, scale: 1 } })
      await writeFile(process.env.CODEX_NOTIFICATION_PREVIEW, Buffer.from(data, 'base64'))
    }
    await b.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
    const native = await b.evaluate('measure()'); assert.equal(native.radius, '0px'); assert.equal(native.whiteSpace, 'nowrap')
    await b.evaluate(`document.documentElement.dataset.codexChatLook='true';document.querySelector('#notice button').focus()`)
    await b.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
    await b.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    assert.equal(await b.evaluate('dismissals'), 1)
    assert.equal(await b.evaluate('!!document.getElementById("notice")'), false)
  } finally { b.close() }
})
