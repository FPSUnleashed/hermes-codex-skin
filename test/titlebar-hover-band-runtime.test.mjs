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
    // Controls in the original content flow win over the reveal band.
    for (const markup of ['<button><span>Button</span></button>', '<a href="#"><span>Link</span></a>', '<div role="tab" tabindex="-1"><span>Tab</span></div>', '<input>', '<div style="cursor:pointer"><span>Custom</span></div>']) {
      await evaluate(`(() => {const control=document.createElement('div');control.id='control';control.style.cssText='height:28px;margin-left:180px;width:120px';control.innerHTML=${JSON.stringify(markup)};control.firstElementChild.style.cssText+=';display:block;width:120px;height:28px';document.getElementById('chat').before(control);window.controlClicks=0;control.onclick=e=>{e.preventDefault();window.controlClicks++}})()`)
      await settle()
      const before = await evaluate("({control:document.getElementById('control').getBoundingClientRect().top,chat:snapshot().chatTop})")
      assert.equal(before.control, 0, 'no added space above content')
      await move(220, 14)
      await settle()
      assert.equal((await evaluate('snapshot()')).revealed, null, markup)
      for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', {type,x:220,y:14,button:'left',clickCount:1})
      assert.equal(await evaluate('window.controlClicks'), 1)
      assert.deepEqual(await evaluate("({control:document.getElementById('control').getBoundingClientRect().top,chat:snapshot().chatTop})"), before)
      await evaluate('document.activeElement.blur()')
      await move(500, 14)
      await settle()
      assert.equal((await evaluate('snapshot()')).revealed, 'true', 'empty space still reveals')
      assert.equal((await evaluate('snapshot()')).chatTop, before.chat)
      await move(500,400)
      await settle()
      await evaluate("document.getElementById('control').remove()")
    }
    await evaluate(`(() => {
      const row=document.createElement('div');row.id='pane-row';row.style.cssText='display:flex;width:760px;gap:80px';
      const group=document.createElement('div');group.id='tab-group';group.setAttribute('data-tree-group','test');group.style.width='300px';
      group.innerHTML='<div data-zone-tabstrip style="display:flex"><div role="tablist" style="display:flex;flex:1;min-width:0;overflow:auto"><button role="tab" id="gap-a" style="width:120px;flex-shrink:0">A</button><button role="tab" id="gap-b" style="width:120px;flex-shrink:0">B</button><span id="add-wrap"><button id="add-tab" style="width:20px;height:20px">+</button></span></div></div>';
      const peer=document.createElement('div');peer.id='browser-group';peer.setAttribute('data-tree-group','browser');peer.style.width='300px';peer.innerHTML='<div data-zone-tabstrip style="display:flex"><div role="tablist" style="display:flex;flex:1;min-width:0;overflow:auto"><button role="tab" id="browser-tab" style="width:120px;flex-shrink:0">Browser</button></div></div>';
      row.append(group,peer);document.getElementById('chat').before(row);window.tabClicks=0;window.addClicks=0;window.browserClicks=0;document.getElementById('gap-b').onclick=()=>window.tabClicks++;document.getElementById('add-tab').onclick=()=>window.addClicks++;document.getElementById('browser-tab').onclick=()=>window.browserClicks++;
    })()`)
    await settle()
    const tabLayout=await evaluate("({chat:snapshot().chatTop,a:document.getElementById('gap-a').getBoundingClientRect().toJSON(),b:document.getElementById('gap-b').getBoundingClientRect().toJSON(),add:document.getElementById('add-wrap').getBoundingClientRect().toJSON(),browser:document.getElementById('browser-tab').getBoundingClientRect().toJSON()})")
    const gapX=(tabLayout.a.right+tabLayout.b.left)/2
    for (const y of [tabLayout.a.top+1,tabLayout.a.top+14,tabLayout.a.top+25]) {
      for (const x of [tabLayout.a.left+30,tabLayout.a.right-1,gapX,tabLayout.b.left+1,tabLayout.b.left+30,gapX,tabLayout.a.right-1]) {
        await move(x,y)
        assert.equal((await evaluate('snapshot()')).revealed,null,`horizontal crossing ${x},${y}`)
      }
      await move(gapX,y);await settle()
      assert.equal((await evaluate('snapshot()')).revealed,null,'resting in gap stays hidden')
    }
    const clickX=tabLayout.b.left+30,clickY=tabLayout.b.top+14
    await move(clickX,clickY)
    for (const type of ['mousePressed','mouseReleased']) await call('Input.dispatchMouseEvent',{type,x:clickX,y:clickY,button:'left',clickCount:1})
    assert.equal(await evaluate('window.tabClicks'),1)
    await evaluate('document.activeElement.blur()')
    const addGapX=(tabLayout.b.right+tabLayout.add.left)/2
    for(const y of [tabLayout.b.top+1,tabLayout.b.top+14,tabLayout.b.bottom-1]){await move(addGapX,y);assert.equal((await evaluate('snapshot()')).revealed,null,`tab-to-plus crossing ${addGapX},${y}`)}
    const addX=(tabLayout.add.left+tabLayout.add.right)/2,addY=(tabLayout.add.top+tabLayout.add.bottom)/2
    await move(addX,addY);for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:addX,y:addY,button:'left',clickCount:1});assert.equal(await evaluate('window.addClicks'),1)
    await evaluate('document.activeElement.blur()')
    const crossStripGapX=(tabLayout.add.right+tabLayout.browser.left)/2
    for(const y of [tabLayout.b.top+1,tabLayout.b.top+14,tabLayout.b.bottom-1]){await move(crossStripGapX,y);assert.equal((await evaluate('snapshot()')).revealed,null,`cross-strip crossing ${crossStripGapX},${y}`)}
    const browserX=tabLayout.browser.left+30,browserY=tabLayout.browser.top+14
    await move(browserX,browserY);for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:browserX,y:browserY,button:'left',clickCount:1});assert.equal(await evaluate('window.browserClicks'),1)
    await evaluate('document.activeElement.blur()')
    await move(tabLayout.browser.right+40,clickY);await settle()
    assert.equal((await evaluate('snapshot()')).revealed,'true','space after rightmost tab still reveals')
    assert.deepEqual(await evaluate("({chat:snapshot().chatTop,a:document.getElementById('gap-a').getBoundingClientRect().toJSON(),b:document.getElementById('gap-b').getBoundingClientRect().toJSON(),add:document.getElementById('add-wrap').getBoundingClientRect().toJSON(),browser:document.getElementById('browser-tab').getBoundingClientRect().toJSON()})"),tabLayout,'hover never moves tabs, plus, browser or chat')
    await evaluate('dispose()')
    assert.equal(await evaluate('document.querySelectorAll("[data-codex-titlebar-edge-trigger]").length'), 0)
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer)
    child.kill()
  }
})
