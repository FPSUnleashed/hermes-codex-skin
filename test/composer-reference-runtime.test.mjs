import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const chrome = [process.env.CHROME_BIN, '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => p && existsSync(p))

test('composer reference geometry, native plus action and real-frame scroll fade', { timeout: 30000 }, async t => {
  if (!chrome) return t.skip('Chrome required')
  const { CSS, BROWSER_PALETTE_CSS, CODEX_THEME } = await loadPluginInternals(['CSS', 'BROWSER_PALETTE_CSS', 'CODEX_THEME'])
  const temp = await mkdtemp(path.join(os.tmpdir(), 'codex-composer-'))
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-pipe', `--user-data-dir=${temp}`], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  const pending = new Map()
  let seq = 0, buffer = ''
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10000)
    pending.set(id, { resolve: data => { clearTimeout(timer); resolve(data) }, reject: err => { clearTimeout(timer); reject(err) } })
    proc.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0')
  })
  proc.stdio[4].on('data', chunk => {
    buffer += chunk.toString()
    let end
    while ((end = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1)
      const request = pending.get(message.id)
      if (request) { pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result) }
    }
  })
  try {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    await call('Emulation.setDeviceMetricsOverride', { width: 760, height: 800, deviceScaleFactor: 2, mobile: false }, sessionId)
    const html = `<!doctype html><html data-codex-chat-look="true" data-hermes-theme="codex-chat" data-hermes-mode="dark"><head><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#111;color:#eee}button{font:inherit;color:inherit;border:0;background:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}button:disabled{opacity:.5;pointer-events:none}
:root{--theme-background-seed:${CODEX_THEME.darkColors.background};--theme-card-seed:${CODEX_THEME.darkColors.card};--theme-elevated-seed:${CODEX_THEME.darkColors.popover};--theme-bubble-seed:${CODEX_THEME.darkColors.userBubble};--theme-foreground:${CODEX_THEME.darkColors.foreground};--ui-text-primary:${CODEX_THEME.darkColors.foreground};--dt-primary:${CODEX_THEME.darkColors.primary};--dt-primary-foreground:${CODEX_THEME.darkColors.primaryForeground};--dt-border:${CODEX_THEME.darkColors.border};--dt-composer-ring:${CODEX_THEME.darkColors.composerRing};--ui-text-tertiary:#999;--composer-input-max-height:192px}
#surface{width:503px}#fade{display:flex;flex-direction:column}#grid{display:grid;width:100%}.menu{grid-area:menu;display:flex;align-self:start;translate:0 3px}.input-area{grid-area:input;min-width:0}.controls{grid-area:controls;display:flex;align-items:center;justify-content:flex-end;gap:4px}#editor{max-height:var(--composer-input-max-height);overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere;outline:0}#editor:empty:before{content:attr(data-placeholder);color:#999}.attachments{display:flex;flex-wrap:wrap;gap:6px;padding:4px}.group\\/attachment{position:relative}.group\\/attachment>button:first-child{display:flex;gap:6px;border:1px solid #444}.group\\/attachment>button:first-child>span:first-child{display:flex;width:16px;height:16px}.group\\/attachment>button:nth-child(2){position:absolute;right:-4px;top:-4px;width:14px;height:14px}.group\\/attachment>button:nth-child(2)>.codicon{font-size:.625rem}img{width:100%;height:100%}#edit{max-height:192px;overflow-y:auto}
${CSS}\n${BROWSER_PALETTE_CSS}
</style></head><body><div id="surface" data-slot="composer-surface"><div id="fade" data-slot="composer-fade"><div id="grid"><div class="menu"><button id="plus" aria-label="Add context"><i class="codicon codicon-add" aria-hidden="true">+</i></button></div><div class="input-area"><div class="relative"><div id="editor" contenteditable="true" data-slot="composer-rich-input" data-placeholder="Que voulez-vous faire ?"></div></div></div><div class="controls"><button>GPT-6 Astra</button><button aria-label="Voice dictation">Mic</button><button aria-label="Send">Send</button></div></div></div></div><div data-slot="aui_edit-composer-root"><div id="edit" data-slot="composer-rich-input" contenteditable="true">Separate sent-message editor</div></div></body></html>`
    await evaluate(`document.write(${JSON.stringify(html)}); document.close(); window.plusClicks=0; document.getElementById('plus').onclick=()=>window.plusClicks++`)
    const frames = 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'
    await evaluate(frames)
    const metrics = `(() => {const e=document.getElementById('editor'),s=document.getElementById('surface'),p=document.getElementById('plus'); const r=s.getBoundingClientRect(),er=e.getBoundingClientRect(),pr=p.getBoundingClientRect(),rm=document.querySelector('[class~="group/attachment"] > button:nth-child(2)'),rr=rm?.getBoundingClientRect(),gr=rm?.parentElement.getBoundingClientRect();return {height:r.height,inputX:er.x-r.x,inputY:er.y-r.y,inputHeight:er.height,plusX:pr.x+pr.width/2-r.x,plusBottom:r.bottom-pr.y-pr.height/2,plusWidth:getComputedStyle(p,'::before').width,plusStroke:getComputedStyle(p,'::before').height,plusColor:getComputedStyle(p).color,textColor:getComputedStyle(e).color,weight:getComputedStyle(e).fontWeight,mask:getComputedStyle(e).maskImage,scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,editMax:getComputedStyle(document.getElementById('edit')).maxHeight,removeWidth:rr?.width,removeHeight:rr?.height,removeCenterX:rr?.x+rr?.width/2,removeCenterY:rr?.y+rr?.height/2,nativeCenterX:gr?.right-3,nativeCenterY:gr?.top+3,removeHit:rr&&document.elementFromPoint(rr.x+rr.width/2,rr.y+rr.height/2)?.matches('button')}})()`
    const empty = await evaluate(metrics)
    assert.equal(empty.height, 98)
    assert.equal(empty.inputX, 12)
    assert.equal(empty.inputY, 12)
    assert.equal(empty.plusX, 22)
    assert.equal(empty.plusBottom, 22)
    assert.equal(empty.plusWidth, '12px')
    assert.equal(empty.plusStroke, '1.5px')
    assert.equal(empty.weight, '400')
    assert.equal(empty.editMax, '192px')
    assert.equal(await evaluate("getComputedStyle(document.getElementById('editor')).paddingTop"),'2px')
    assert.equal(empty.textColor, 'rgb(252, 252, 252)')
    assert.equal(empty.plusColor, 'rgb(252, 252, 252)')
    const placeholderPixel = await evaluate(`(() => {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
      ctx.fillStyle=getComputedStyle(document.getElementById('surface')).backgroundColor;ctx.fillRect(0,0,1,1);
      ctx.fillStyle=getComputedStyle(document.getElementById('editor'),'::before').color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];
    })()`)
    assert.deepEqual(placeholderPixel,[86,86,86,255])
    if (process.env.CODEX_SKIN_ARTIFACT_DIR) {
      await mkdir(process.env.CODEX_SKIN_ARTIFACT_DIR,{recursive:true})
      const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId)
      await writeFile(path.join(process.env.CODEX_SKIN_ARTIFACT_DIR,'composer-empty.png'),Buffer.from(data,'base64'))
    }
    await evaluate("document.getElementById('plus').click()")
    assert.equal(await evaluate('window.plusClicks'), 1)
    await evaluate("document.getElementById('plus').disabled=true;document.getElementById('plus').click()")
    assert.equal(await evaluate('window.plusClicks'), 1)
    await evaluate("document.getElementById('plus').disabled=false")
    await evaluate("document.getElementById('editor').textContent='longmessage'.repeat(500)")
    const image = `<div class="group/attachment"><button><span><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='122' height='122'%3E%3Crect width='122' height='122' fill='%23333333'/%3E%3C/svg%3E"></span><span>reference.png</span></button><button aria-label="Remove attachment">×</button></div>`
    await evaluate(`const a=document.createElement('div');a.id='attachments';a.className='attachments';a.dataset.slot='composer-attachments';a.innerHTML=${JSON.stringify(image + image)};document.getElementById('fade').prepend(a);window.removeClicks=0;document.querySelectorAll('[class~="group/attachment"] > button:nth-child(2)').forEach(b=>b.onclick=()=>window.removeClicks++)`)
    await evaluate(frames)
    const top = await evaluate(metrics)
    assert.equal(top.inputHeight, 240)
    assert.equal(top.height, 414)
    assert.equal(top.inputY, 138)
    assert.ok(top.scrollHeight > top.clientHeight)
    assert.equal(top.removeWidth, 28)
    assert.equal(top.removeHeight, 28)
    assert.equal(top.removeCenterX, top.nativeCenterX)
    assert.equal(top.removeCenterY, top.nativeCenterY)
    assert.equal(top.removeHit, true)
    await evaluate(`document.querySelector('[class~="group/attachment"] > button:nth-child(2)').click()`)
    assert.equal(await evaluate('window.removeClicks'), 1)
    assert.ok(!top.mask.includes('rgba(0, 0, 0, 0)'), 'no fade while at top')
    await evaluate("document.getElementById('editor').scrollTop=100")
    await evaluate(frames)
    const scrolled = await evaluate(metrics)
    assert.ok(scrolled.mask.includes('rgba(0, 0, 0, 0)'), JSON.stringify(scrolled))
    assert.ok(scrolled.mask.includes('16px'))
    assert.equal(scrolled.inputY, top.inputY)
    assert.equal(scrolled.height, top.height)
    assert.equal(await evaluate("getComputedStyle(document.getElementById('attachments')).gap"), '12px')
    const dir = process.env.CODEX_SKIN_ARTIFACT_DIR
    if (dir) {
      await mkdir(dir, { recursive: true })
      const { data } = await call('Page.captureScreenshot', { format: 'png' }, sessionId)
      await writeFile(path.join(dir, 'composer-refined.png'), Buffer.from(data, 'base64'))
      await writeFile(path.join(dir, 'composer-metrics.json'), JSON.stringify({empty,top,scrolled},null,2))
    }
    await evaluate("document.getElementById('editor').scrollTop=0")
    await evaluate(frames)
    assert.ok(!(await evaluate(metrics)).mask.includes('rgba(0, 0, 0, 0)'), 'fade clears when back at top')
    const playback = await evaluate(`(() => {
      const row=document.createElement('div');row.setAttribute('role','status');row.setAttribute('aria-live','polite');row.innerHTML='<div>Audio</div><div>Reading aloud</div><button>Stop</button>';document.getElementById('fade').prepend(row);
      const style=getComputedStyle(row),r=row.getBoundingClientRect(),s=document.getElementById('surface').getBoundingClientRect();const result={top:r.top-s.top,height:r.height,gap:style.marginBottom};row.remove();return result;
    })()`)
    assert.deepEqual(playback,{top:12,height:28,gap:'12px'})
    await evaluate("document.documentElement.removeAttribute('data-codex-chat-look')")
    await evaluate(frames)
    assert.equal((await evaluate(metrics)).mask, 'none')
  } finally {
    proc.kill('SIGTERM')
    await new Promise(resolve => proc.exitCode !== null ? resolve() : proc.once('exit', resolve))
    for (const request of pending.values()) request.reject(new Error('Browser closed'))
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
