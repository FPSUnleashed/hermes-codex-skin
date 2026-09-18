import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

test('composer plus strokes use the native send/stop foreground palette, not theme accent', async () => {
  const b = await chromium()
  try {
    const { CSS } = await loadPluginInternals(['CSS'])
    const { frameTree } = await b.call('Page.getFrameTree')
    await b.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<html data-codex-chat-look="true"><head><style>
      *{box-sizing:border-box}button{width:28px;height:28px;padding:0;border:0;background:transparent;color:var(--dt-primary)}button:disabled{opacity:.5;pointer-events:none}.primary{background:var(--dt-foreground);color:var(--dt-background);border-radius:50%}.primary:disabled{background:color-mix(in srgb,var(--dt-foreground) 30%,transparent);opacity:1}[data-slot=composer-surface]{display:flex;gap:12px;width:200px}
      ${CSS}</style></head><body><div data-slot="composer-surface"><button id="plus" aria-label="Add context"><i class="codicon codicon-add">+</i></button><button id="send" class="primary" aria-label="Send">Send</button><button id="stop" class="primary" aria-label="Stop">Stop</button></div><button id="other"><i class="codicon codicon-add">+</i></button></body></html>` })
    await b.evaluate(`window.clicks=0;window.originalPlus=document.getElementById('plus');originalPlus.onclick=()=>clicks++`)
    for (const [foreground, accent, background] of [
      ['#171717', '#0285ff', '#ffffff'],
      ['#fcfcfc', '#0285ff', '#111111'],
      ['#93a1a1', '#268bd2', '#002b36'],
      ['rgba(147,161,161,.94)', '#b58900', '#002b36']
    ]) {
      await b.evaluate(`for(const [k,v] of Object.entries({'--dt-foreground':${JSON.stringify(foreground)},'--ui-text-primary':${JSON.stringify(foreground)},'--dt-primary':${JSON.stringify(accent)},'--dt-background':${JSON.stringify(background)}}))document.documentElement.style.setProperty(k,v)`)
      const result = await b.evaluate(`(()=>{const p=originalPlus,a=getComputedStyle(p,'::before'),z=getComputedStyle(p,'::after');return {color:getComputedStyle(p).color,horizontal:a.backgroundColor,vertical:z.backgroundColor,send:getComputedStyle(document.getElementById('send')).backgroundColor,stop:getComputedStyle(document.getElementById('stop')).backgroundColor,other:getComputedStyle(document.getElementById('other')).color,background:getComputedStyle(p).backgroundColor,width:p.getBoundingClientRect().width,height:p.getBoundingClientRect().height,stroke:[a.width,a.height,z.width,z.height],pointer:a.pointerEvents,identity:p===document.getElementById('plus')}})()`)
      assert.equal(result.horizontal, result.send)
      assert.equal(result.vertical, result.stop)
      assert.notEqual(result.color, result.other, 'an unrelated add button keeps the native accent')
      assert.equal(result.background, 'rgba(0, 0, 0, 0)', 'do not turn the plus into a filled circle')
      assert.deepEqual(result.stroke, ['13px', '1.5px', '1.5px', '13px'])
      assert.equal(result.width, 28); assert.equal(result.height, 28)
      assert.equal(result.pointer, 'none'); assert.equal(result.identity, true)
    }
    await b.evaluate(`originalPlus.focus()`)
    await b.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
    await b.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    assert.equal(await b.evaluate('clicks'), 1)
    await b.evaluate('originalPlus.disabled=true;originalPlus.click()')
    assert.equal(await b.evaluate('clicks'), 1)
    assert.equal(await b.evaluate('getComputedStyle(originalPlus).opacity'), '0.5')
    await b.evaluate(`originalPlus.disabled=false;document.documentElement.removeAttribute('data-codex-chat-look')`)
    assert.equal(await b.evaluate(`getComputedStyle(originalPlus).color===getComputedStyle(document.getElementById('other')).color`), true)
  } finally { b.close() }
})
