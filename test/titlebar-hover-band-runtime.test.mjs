import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const chrome = [process.env.CHROME_BIN, '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p))

// Real browser input: no synthetic pointerenter or manual reveal attributes.
test('full titlebar band opens and retains hover without covering native controls', { timeout: 30000 }, async () => {
  assert.ok(chrome, 'Chrome is required for the hover release gate')
  const source = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
    .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.fixturePlugin = {')
  const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-pipe'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  let serial = 0, buffer = ''
  const pending = new Map()
  child.on('error', error => { for (const entry of pending.values()) entry.reject(error) })
  child.stdio[4].on('data', chunk => {
    buffer += chunk.toString()
    let end
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      const entry = pending.get(message.id)
      if (entry) {
        clearTimeout(entry.timer)
        pending.delete(message.id)
        message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result)
      }
    }
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++serial
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10000)
    pending.set(id, { resolve, reject, timer })
    child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const call = (method, params) => send(method, params, sessionId)
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    const move = (x, y) => call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    const settle = () => evaluate('new Promise(resolve => setTimeout(resolve, 550))')
    await call('Page.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1, mobile: false })
    await move(500, 400)
    const { frameTree } = await call('Page.getFrameTree')
    const html = `<!doctype html><html data-codex-chat-look="true"><head><style>
      *{box-sizing:border-box}html,body{margin:0;height:100%}
      [data-contrib-shell]{--titlebar-height:0px;display:flex;flex-direction:column}
      #bar{position:relative;height:34px;flex-shrink:0;background:#222}
      .fixed{position:fixed;z-index:70;top:5px;height:24px}.left{left:8px}.right{right:8px}
      button{width:24px;height:24px;border:0;padding:0}#chat{height:500px}
      .drag{pointer-events:none;position:absolute;inset:0;-webkit-app-region:drag}
      </style></head><body><div data-contrib-shell>
      <div id="bar" class="relative flex h-[34px]"><div aria-hidden="true" class="drag app-region"></div></div>
      <div class="fixed z-70 left"><button id="toggle" aria-label="Show sidebar"><span class="codicon-layout-sidebar-left"></span></button></div>
      <div class="fixed z-70 right"><button id="right" aria-label="Show right sidebar"><span class="codicon-layout-sidebar-right"></span></button></div>
      <div data-slot="sidebar" hidden></div><main id="chat">Chat</main></div></body></html>`
    await call('Page.setDocumentContent', { frameId: frameTree.frame.id, html })
    await evaluate(`(() => {
      const host={state:{activeSessionId:{get:()=>null},profile:{get:()=> 'default'}}},PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},useEffect=()=>{},jsx=()=>null;
      ${source}
      const store=new Map();fixturePlugin.register({storage:{get:(k,d)=>store.has(k)?store.get(k):d,set:(k,v)=>store.set(k,v)},register:()=>{}});
      const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);
      syncTitlebarAutohideRoot();window.dispose=installBehaviorRuntime();setTitlebarAutohideMode('on');
      window.clicks=0;document.getElementById('toggle').onclick=()=>window.clicks++;
      window.snapshot=()=>({revealed:document.documentElement.getAttribute('data-codex-titlebar-revealed'),barTop:document.getElementById('bar').getBoundingClientRect().top,chatTop:document.getElementById('chat').getBoundingClientRect().top});
    })()`)
    await settle()
    const hidden = await evaluate('snapshot()')
    assert.equal(hidden.barTop, -34, 'native zero-valued layout variable must not stop hiding')
    for (const [x, y] of [[500, 33], [20, 33], [500, 1], [880, 33]]) {
      await move(x, y)
      await settle()
      const shown = await evaluate('snapshot()')
      assert.equal(shown.revealed, 'true', `opens and stays open at ${x},${y}`)
      assert.equal(shown.barTop, 0)
      assert.equal(shown.chatTop, hidden.chatTop, 'reveal does not shift chat')
      await move(x, 34)
      await settle()
      assert.equal((await evaluate('snapshot()')).revealed, null, 'first pixel outside band hides: ' + JSON.stringify(await evaluate(`({hovered:[...document.querySelectorAll(':hover')].map(e=>({id:e.id,tag:e.tagName,rect:{top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}})),hit:document.elementFromPoint(${x},34)?.outerHTML})`)))
    }
    await move(500, 17)
    await settle()
    await move(20, 17)
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 20, y: 17, button: 'left', clickCount: 1 })
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 20, y: 17, button: 'left', clickCount: 1 })
    assert.equal(await evaluate('window.clicks'), 1, 'native control remains clickable')
    await evaluate('document.activeElement.blur()')
    await move(500, 400)
    await settle()
    assert.equal((await evaluate('snapshot()')).revealed, null)
    await evaluate('dispose()')
    assert.equal(await evaluate('document.querySelectorAll("[data-codex-titlebar-edge-trigger]").length'), 0)
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer)
    child.kill()
  }
})
