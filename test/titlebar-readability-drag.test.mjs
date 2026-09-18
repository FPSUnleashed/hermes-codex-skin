import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

async function fixture(browser) {
  const { CSS } = await loadPluginInternals(['CSS'])
  await browser.call('Page.setDocumentContent', {frameId:(await browser.call('Page.getFrameTree')).frameTree.frame.id,html:`<html data-codex-chat-look="true"><style>
    :root{--theme-background-seed:#fdf6e3;--ui-chat-surface-background:#fdf6e3;--ui-editor-surface-background:#fdf6e3;--ui-sidebar-surface-background:#eee8d5}
    *{box-sizing:border-box}body{margin:0}section{position:relative;width:500px;height:300px;--panel-titlebar-left:40px;--panel-titlebar-right:140px}
    [data-panel-header]{position:relative;display:flex;height:62px;background:#eee}[data-panel-header]>[aria-hidden]{flex-shrink:0}
    [data-zone-tabstrip]{position:absolute;inset:0;display:flex;min-width:0;-webkit-app-region:no-drag}[role=tablist]{display:flex;flex:1;min-width:0;overflow-x:auto}[role=tab]{display:flex;flex-shrink:0;width:150px;-webkit-app-region:no-drag}
    [data-window-drag-handle]{height:34px;min-width:0;flex:1;-webkit-app-region:drag}
    [data-titlebar-cluster]{position:fixed;display:flex;top:12px;z-index:70;-webkit-app-region:no-drag}[data-titlebar-cluster=left]{left:8px}[data-titlebar-cluster=right]{left:368px}button{height:24px;width:24px;flex-shrink:0;border:0;padding:0;background:transparent;-webkit-app-region:no-drag}
    ${CSS}</style><body><section data-tree-group="grp-main" data-window-top><div data-panel-header><div aria-hidden="true" style="width:40px"></div><div data-zone-tabstrip="grp-main" class="absolute"><div role="tablist"><div role="tab" data-tree-tab aria-selected="true">Native tab</div><div role="tab" data-tree-tab>Second</div></div></div><div data-window-drag-handle></div><div aria-hidden="true" style="width:140px"></div></div><div>Chat</div></section><div data-titlebar-cluster="left"><button>Side</button></div><div data-titlebar-cluster="right">${Array.from({length:5},(_,i)=>`<button>${i}</button>`).join('')}</div></body></html>`})
}

test('cramped native drag handle remains visible and strip gaps drag without swallowing tab clicks', async () => {
  const b = await chromium()
  try {
    await fixture(b)
    const result = await b.evaluate(`(()=>{const h=document.querySelector('[data-window-drag-handle]'),strip=document.querySelector('[data-zone-tabstrip]'),r=h.getBoundingClientRect(),s=strip.getBoundingClientRect(),tab=document.querySelector('[role=tab]'),t=tab.getBoundingClientRect(),gap=document.elementFromPoint(s.x+8,s.y+5);window.tabClicks=0;tab.onclick=()=>window.tabClicks++;return {display:getComputedStyle(h).display,region:getComputedStyle(h).webkitAppRegion,rect:{width:r.width,height:r.height},gapRegion:getComputedStyle(gap).webkitAppRegion,tabRegion:getComputedStyle(tab).webkitAppRegion,tabReachable:tab.contains(document.elementFromPoint(t.x+10,t.y+10)),controls:[...document.querySelectorAll('[data-titlebar-cluster] button')].every(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+12,r.y+12))})}})()`)
    assert.notEqual(result.display,'none','native window dragging must not disappear')
    assert.ok(result.rect.width>0 && result.rect.height===48)
    assert.equal(result.region,'drag')
    assert.equal(result.gapRegion,'drag','the strip padding must be a real drag region, not only an underlying hidden handle')
    assert.equal(result.tabRegion,'no-drag')
    assert.equal(result.tabReachable,true)
    assert.equal(result.controls,true)
    await b.evaluate(`document.querySelector('[role=tab]').click()`)
    assert.equal(await b.evaluate('window.tabClicks'),1)
    await b.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
    assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('[data-zone-tabstrip]')).webkitAppRegion`),'no-drag')
  } finally { b.close() }
})

test('right-side controls get a theme-aware soft shadow without changing their native geometry', async () => {
  const b = await chromium()
  try {
    await fixture(b)
    await b.evaluate(`window.buttons=[...document.querySelectorAll('[data-titlebar-cluster=right] button')];window.boxes=()=>window.buttons.map(b=>{const r=b.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});document.documentElement.removeAttribute('data-codex-chat-look')`)
    const before = await b.evaluate('window.boxes()')
    for (const background of ['#111111','#ffffff','#fdf6e3']) {
      await b.evaluate(`document.documentElement.style.setProperty('--theme-background-seed',${JSON.stringify(background)});document.documentElement.setAttribute('data-codex-chat-look','true')`)
      const result = await b.evaluate(`({filters:window.buttons.map(b=>getComputedStyle(b).filter),left:getComputedStyle(document.querySelector('[data-titlebar-cluster=left] button')).filter,boxes:window.boxes(),reachable:window.buttons.every(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+12,r.y+12))})})`)
      assert.ok(result.filters.every(f=>f.includes('drop-shadow(')), 'all five icons must have the subtle shadow')
      assert.equal(result.left,'none')
      assert.deepEqual(result.boxes,before)
      assert.equal(result.reachable,true)
    }
    await b.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
    assert.deepEqual(await b.evaluate('window.buttons.map(b=>getComputedStyle(b).filter)'),Array(5).fill('none'))
  } finally { b.close() }
})
