import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// A transparent overlay must let the real scroller reach the top of the pane,
// not merely repaint the native reserved row. Native controls stay separate.
test('tabless main header overlays scrolling chat with a constant control band', async () => {
  const browser = await chromium()
  try {
    const { CSS, BROWSER_PALETTE_CSS } = await loadPluginInternals(['CSS', 'BROWSER_PALETTE_CSS'])
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<html><head><style>
      :root { --ui-chat-surface-background:#fdf6e3; --ui-sidebar-surface-background:#eee8d5; --ui-editor-surface-background:#fdf6e3; --ui-row-active-background:#ddd; --ui-stroke-secondary:#888; --ui-stroke-tertiary:#bbb; }
      *{box-sizing:border-box}body{margin:0}[data-tree-split]{display:flex;width:1100px;height:500px}
      .side{width:230px}.main{flex:1;min-width:0}[data-tree-group]{position:relative;display:flex;flex-direction:column;height:100%}
      [data-panel-header]{display:flex;position:relative;flex-shrink:0;background:var(--ui-sidebar-surface-background)}
      [data-window-drag-handle]{height:34px;flex:1;-webkit-app-region:drag}
      .content{position:relative;flex:1;min-height:0;overflow:hidden;background:var(--ui-chat-surface-background)}
      [data-slot='aui_thread-viewport']{height:100%;overflow:auto}.scroll-body{height:1600px;padding-top:100px}.scroll-marker{height:20px;background:rgb(255,0,0)}
      [data-titlebar-cluster]{position:fixed;right:4px;top:5px;display:flex;z-index:70;-webkit-app-region:no-drag}
      button{width:24px;height:24px;flex-shrink:0;-webkit-app-region:no-drag}
      [data-zone-tabstrip]{display:flex;flex:1}[role=tablist]{display:flex}[role=tab]{display:flex}
      </style><style id="skin">${CSS}${BROWSER_PALETTE_CSS}</style></head><body>
      <div data-tree-split><div class="side"><section data-tree-group="grp-sessions" data-window-top><div data-panel-header style="height:34px"></div><div class="content"></div></section></div>
      <div class="main"><section data-tree-group="grp-main" data-window-top><div data-panel-header style="height:34px"><div aria-hidden="true" style="width:0"></div><div data-window-drag-handle></div><div aria-hidden="true" style="width:140px"></div></div><div class="content"><div data-slot="aui_thread-viewport"><div class="scroll-body"><div class="scroll-marker">Text scrolling under the transparent band</div></div></div></div></section></div></div>
      <div data-titlebar-cluster="right">${Array.from({length:5},(_,i)=>`<button id="native-${i}">${i}</button>`).join('')}</div>
      </body></html>` })
    await browser.evaluate(`window.originalButtons=[...document.querySelectorAll('button')];window.clicks=0;window.originalButtons.forEach(b=>b.addEventListener('click',()=>window.clicks++));window.measure=()=>{
      const header=document.querySelector('[data-tree-group="grp-main"] > [data-panel-header]'),drag=header.querySelector('[data-window-drag-handle]');
      const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
      return {header:rect(header),content:rect(header.nextElementSibling),buttons:window.originalButtons.map(rect),dragRegion:getComputedStyle(drag).webkitAppRegion,background:getComputedStyle(header).backgroundColor,sidebar:getComputedStyle(document.querySelector('[data-tree-group="grp-sessions"] > [data-panel-header]')).backgroundColor,border:getComputedStyle(header).borderBottomWidth,shadow:getComputedStyle(header).boxShadow,identical:window.originalButtons.every((b,i)=>b===document.querySelectorAll('button')[i]),regions:window.originalButtons.map(b=>getComputedStyle(b).webkitAppRegion),reachable:window.originalButtons.every(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b})}
    }`)
    const before = await browser.evaluate('window.measure()')
    for (const [chat, sidebar, editor] of [
      ['rgb(253, 246, 227)', 'rgb(238, 232, 213)', 'rgb(245, 240, 230)'],
      ['rgb(17, 17, 17)', 'rgb(28, 28, 28)', 'rgb(23, 23, 23)'],
      ['rgb(255, 255, 255)', 'rgb(243, 243, 243)', 'rgb(250, 250, 250)'],
      ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']
    ]) {
      await browser.evaluate(`document.documentElement.setAttribute('data-codex-chat-look','true');document.documentElement.style.setProperty('--ui-chat-surface-background',${JSON.stringify(chat)});document.documentElement.style.setProperty('--ui-sidebar-surface-background',${JSON.stringify(sidebar)});document.documentElement.style.setProperty('--ui-editor-surface-background',${JSON.stringify(editor)})`)
      const on = await browser.evaluate('window.measure()')
      assert.equal(on.background, 'rgba(0, 0, 0, 0)', 'header must be genuinely transparent')
      assert.equal(on.sidebar, sidebar, 'sidebar background is unchanged')
      assert.equal(on.border, '0px')
      assert.equal(on.shadow, 'none')
      assert.deepEqual(on.header, {...before.header, height:48})
      assert.equal(on.content.y, on.header.y, 'scroller is not clipped below the header')
      assert.equal(on.content.height, before.content.height + before.header.height)
      assert.deepEqual(on.buttons, before.buttons)
      assert.equal(on.dragRegion, 'drag')
      assert.deepEqual(on.regions, Array(5).fill('no-drag'))
      assert.equal(on.identical, true)
      assert.equal(on.reachable, true)
      await browser.evaluate(`document.querySelector('[data-slot="aui_thread-viewport"]').scrollTop=90`)
      const scroll = await browser.evaluate(`(()=>{const marker=document.querySelector('.scroll-marker'),r=marker.getBoundingClientRect();return {y:r.y,underBand:document.elementsFromPoint(r.x+100,r.y+5).includes(marker),scroll:document.querySelector('[data-slot="aui_thread-viewport"]').scrollTop}})()`)
      assert.equal(scroll.scroll,90)
      assert.equal(scroll.y,10,'content is visible inside the formerly clipped upper band')
      assert.equal(scroll.underBand,true)
      // Native toggle adds/removes the strip; CSS responds without JS state.
      await browser.evaluate(`document.querySelector('[data-tree-group="grp-main"] > [data-panel-header]').insertAdjacentHTML('beforeend','<div data-zone-tabstrip="grp-main"><div role="tablist"><div role="tab" data-tree-tab aria-selected="true">Chat</div></div></div>')`)
      const tabs = await browser.evaluate('window.measure()')
      assert.equal(tabs.background, editor, 'tabs-on keeps the existing editor-surface header styling')
      assert.equal(tabs.header.height, 48)
      assert.equal(tabs.content.y,48,'tabs retain their own reserved row')
      await browser.evaluate(`document.querySelector('[data-zone-tabstrip="grp-main"]').remove()`)
      assert.equal((await browser.evaluate('window.measure()')).background, 'rgba(0, 0, 0, 0)')
      await browser.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
      assert.equal((await browser.evaluate('window.measure()')).background, sidebar, 'disable restores native paint')
      assert.deepEqual((await browser.evaluate('window.measure()')).header,before.header)
    }
    await browser.evaluate(`window.originalButtons.forEach(b=>b.click());window.originalButtons[0].focus()`)
    assert.equal(await browser.evaluate('window.clicks'), 5)
    assert.equal(await browser.evaluate('document.activeElement===window.originalButtons[0]'), true)
  } finally { browser.close() }
})
