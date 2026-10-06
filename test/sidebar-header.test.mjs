import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Native ancestry verified against installed index-BlmkkJ3g.js (MSt/rje).
// Tip's asChild does not wrap the button. Badge retains its native aria label owner.
const fixture = CSS => `<html data-codex-chat-look="true"><head><style>
:root{--ui-text-primary:#302e27;--ui-text-secondary:#5d594b;--ui-text-tertiary:#706b5c;--ui-editor-surface-background:#f9f7ef;--ui-sidebar-surface-background:#f2efe4;--ui-row-active-background:#e6e2d5;--theme-primary:#625b42;--ui-stroke-secondary:#d6d0c0;--ui-stroke-tertiary:#ded8ca;--ui-stroke-quaternary:#e5dfd1;--titlebar-controls-top:10px;--titlebar-controls-y-nudge:0px;--titlebar-controls-left:10px}
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--ui-sidebar-surface-background)}
#side{width:260px}[data-tree-group]{position:relative;overflow:hidden}[data-panel-header]{position:relative;display:flex;min-width:0;height:34px;flex-shrink:0}[data-zone-tabstrip]{display:flex;flex:1;min-width:0;height:100%}[data-zone-tabstrip].absolute{position:absolute;inset:auto 0 0}[role=tablist]{display:flex;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}[role=tab]{display:flex;flex-shrink:0;align-items:center;height:100%;font-size:11px;font-weight:500;background:transparent;border-left:1px solid var(--ui-stroke-quaternary);-webkit-app-region:no-drag}[role=tab][data-active=true]{box-shadow:inset 0 -2px var(--theme-primary)}.pane-tab-content{display:flex;min-width:0;height:100%;align-items:center;flex:1}.label{display:flex;min-width:0;height:100%;padding:0 8px;align-items:center;overflow:hidden}.truncate{white-space:nowrap;text-transform:uppercase;letter-spacing:.275px;font-weight:500}
[data-titlebar-cluster]{position:fixed;left:10px;top:10px;display:flex;align-items:center;z-index:60}[data-size=icon-titlebar]{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--ui-text-secondary);-webkit-app-region:no-drag}.relative{position:relative}.inline-flex{display:inline-flex}.count-overlay{position:absolute;top:-10px;right:-6px;pointer-events:none;z-index:1}[data-slot=badge]{display:inline-flex;align-items:center;justify-content:center;height:8px;min-width:8px;padding:0 1px;border-radius:2px;font-size:7px;font-weight:600;line-height:1;color:#fff;background:var(--theme-primary);white-space:nowrap}.codicon{display:inline-block;width:12px;height:12px}#drag{position:absolute;top:0;left:0;right:0;height:34px;-webkit-app-region:drag}.spacer{flex-shrink:0}
${CSS}</style></head><body>
<div data-titlebar-cluster="left"><button id="toggle" data-size="icon-titlebar" aria-label="Hide sidebar · 1 unread session" onclick="window.clicked=(window.clicked||0)+1"><span class="relative inline-flex"><svg id="icon" class="codicon codicon-layout-sidebar-left" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor"/><path d="M5 1v10" stroke="currentColor"/></svg><span class="count-overlay"><span id="count" data-slot="badge" aria-hidden="true">1</span></span></span></button></div>
<div id="side"><div data-tree-group="grp-sessions" data-window-top><div data-panel-header><div id="left-reservation" class="spacer"></div><div data-zone-tabstrip="grp-sessions" class="absolute"><div role="tablist">${['Sessions','Bots','Terminal'].map((label,i)=>`<div data-slot="pane-tab" data-tree-tab="${label.toLowerCase()}" role="tab" aria-selected="${i===0}" data-active="${i===0}"><div class="pane-tab-content"><span class="label"><span class="truncate">${label}</span></span></div></div>`).join('')}</div></div><div id="drag" data-window-drag-handle></div><div class="spacer"></div></div></div></div>
<div data-tree-group="grp-main" style="position:absolute;top:80px;width:260px"><div data-zone-tabstrip="grp-main"><div role="tablist"><div role="tab"><div class="pane-tab-content"><span class="label"><span id="reference-caption" class="truncate">Chat tab</span></span></div></div></div></div></div>
</body></html>`

async function mount(browser, CSS) {
  const { frameTree } = await browser.call('Page.getFrameTree')
  await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: fixture(CSS) })
  await browser.evaluate(`window.reserve=()=>{const r=document.querySelector('[data-titlebar-cluster]').getBoundingClientRect();document.querySelector('[data-tree-group]').style.setProperty('--panel-titlebar-left', (r.right+12)+'px')}; reserve();window.measure=()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}},count=rect('count'),icon=rect('icon'),button=rect('toggle'),list=document.querySelector('[role=tablist]'),labels=[...document.querySelectorAll('.truncate')];return {count,icon,button,headerHeight:document.querySelector('[data-panel-header]').getBoundingClientRect().height,overlap:Math.max(0,Math.min(count.right,icon.right)-Math.max(count.left,icon.left))*Math.max(0,Math.min(count.bottom,icon.bottom)-Math.max(count.top,icon.top)),contained:count.left>=button.left&&count.right<=button.right&&count.top>=button.top&&count.bottom<=button.bottom,labels:labels.map(el=>({text:el.textContent,transform:getComputedStyle(el).textTransform,font:getComputedStyle(el).fontSize})),list:{left:list.getBoundingClientRect().left,right:list.getBoundingClientRect().right,client:list.clientWidth,scroll:list.scrollWidth},countText:document.getElementById('count').textContent}}`)
}

test('sidebar captions match chat tabs without changing tab styling or unread badge', async () => {
  const browser = await chromium()
  try {
    const { CSS } = await loadPluginInternals(['CSS'])
    await mount(browser, CSS)
    for (const count of ['1', '99', '9k']) {
      await browser.evaluate(`document.getElementById('count').textContent=${JSON.stringify(count)};reserve()`)
      const r = await browser.evaluate('measure()')
      if (count === '1' && process.env.HEADER_SCREENSHOT) {
        const { data } = await browser.call('Page.captureScreenshot', { format:'png', clip:{x:0,y:0,width:260,height:60,scale:3} })
        await writeFile(process.env.HEADER_SCREENSHOT, Buffer.from(data, 'base64'))
      }
      assert.equal(r.headerHeight, 48)
      assert.equal(r.countText, count)
      assert.ok(r.list.scroll <= r.list.client + 1, '260px sidebar clips a tab title')
      for (const label of r.labels) { assert.equal(label.transform, 'none'); assert.equal(label.font, '12px') }
      const appearance = await browser.evaluate(`(()=>{const tab=document.querySelector('[role=tab]'),label=tab.querySelector('.truncate'),type=el=>{const s=getComputedStyle(el);return {size:s.fontSize,weight:s.fontWeight,case:s.textTransform,spacing:s.letterSpacing,font:s.fontFamily}};return {radius:getComputedStyle(tab).borderRadius,underline:getComputedStyle(tab).boxShadow,caption:type(label),reference:type(document.getElementById('reference-caption'))}})()`)
      assert.equal(appearance.radius, '0px')
      assert.notEqual(appearance.underline, 'none')
      assert.deepEqual(appearance.caption, appearance.reference)
      // Compare the caption change with the skin still enabled. Disabling the
      // entire skin also restores its pre-existing global system-font override.
      await browser.evaluate(`(()=>{const previous=document.createElement('style');previous.id='previous-captions';previous.textContent='#side .truncate{font-size:11px!important;font-weight:500!important;text-transform:uppercase!important;letter-spacing:.275px!important}';document.head.append(previous)})()`)
      const previous = await browser.evaluate('measure()')
      assert.equal(previous.labels[0].font, '11px')
      assert.equal(previous.labels[0].transform, 'uppercase')
      assert.deepEqual(r.count, previous.count, 'caption change moved the badge')
      assert.deepEqual(r.icon, previous.icon, 'caption change moved the icon')
      assert.deepEqual(r.button, previous.button, 'caption change altered the sidebar control')
      await browser.evaluate(`document.getElementById('previous-captions').remove()`)
      await browser.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
      const native = await browser.evaluate('measure()')
      assert.deepEqual(r.icon, native.icon, 'icon moved')
      assert.deepEqual(r.button, native.button, 'sidebar control changed')
      assert.equal(native.labels[0].font, '11px')
      assert.equal(native.labels[0].transform, 'uppercase')
      await browser.evaluate(`document.documentElement.dataset.codexChatLook='true';reserve()`)
      await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', x:r.button.left+3, y:r.button.top+14, button:'left', clickCount:1 })
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x:r.button.left+3, y:r.button.top+14, button:'left', clickCount:1 })
    }
    assert.equal(await browser.evaluate('window.clicked'), 3)
    await browser.evaluate(`document.getElementById('side').style.width='160px';reserve();document.querySelector('[role=tablist]').scrollLeft=1000`)
    const end = await browser.evaluate(`(()=>{const list=document.querySelector('[role=tablist]'),tab=document.querySelector('[data-tree-tab=terminal]').getBoundingClientRect(),r=list.getBoundingClientRect();return {scroll:list.scrollLeft,visible:tab.right<=r.right+1&&tab.right>r.left}})()`)
    assert.ok(end.scroll > 0)
    assert.equal(end.visible, true, 'native horizontal scrolling cannot reach Terminal')
  } finally { browser.close() }
})
