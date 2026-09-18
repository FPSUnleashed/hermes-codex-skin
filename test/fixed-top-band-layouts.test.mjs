import assert from 'node:assert/strict'

import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Exercise the real alignment runtime with native-shaped headers, control
// reservations and independently toggled chat/browser strips.
test('top band and five controls stay stable across browser, tabs, cramped strips and zoom', async () => {
  const b = await chromium()
  try {
    const { CSS, installTitlebarAlignment } = await loadPluginInternals(['CSS', 'installTitlebarAlignment'])
    const source = installTitlebarAlignment.toString()
    const pane = id => `<section data-tree-group="${id}" data-window-top><div data-panel-header style="height:34px"><div aria-hidden="true" style="width:var(--panel-titlebar-left)"></div><div data-window-drag-handle></div><div aria-hidden="true" style="width:var(--panel-titlebar-right)"></div></div><div class="body">${id === 'preview' ? '<aside data-preview-browser></aside>' : '<div data-slot="aui_thread-viewport"></div>'}</div></section>`
    await b.call('Page.setDocumentContent', { frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id, html:`<html data-codex-chat-look="true"><style>
      :root{--titlebar-controls-top:5px;--ui-chat-surface-background:white;--ui-editor-surface-background:white;--ui-sidebar-surface-background:#eee}
      *{box-sizing:border-box}body{margin:0}#layout{display:flex;width:100%;height:600px}section{position:relative;display:flex;flex-direction:column;overflow:hidden;min-width:0;height:100%;--panel-titlebar-left:0px;--panel-titlebar-right:0px}
      [data-tree-group=grp-sessions]{width:200px;flex-shrink:0;--panel-titlebar-left:40px}[data-tree-group=grp-main]{flex:1}[data-tree-group=preview]{width:260px;flex-shrink:0}
      [data-panel-header]{position:relative;display:flex;flex-shrink:0;min-width:0;background:#eee}[data-panel-header]>[aria-hidden]{flex-shrink:0}
      [data-window-drag-handle]{height:34px;min-width:0;flex:1;-webkit-app-region:drag}.body{position:relative;flex:1;min-height:0;overflow:hidden}
      [data-zone-tabstrip]{display:flex;flex:1;min-width:0}[role=tablist]{display:flex;flex:1;min-width:0;overflow-x:auto}[role=tab]{display:flex;flex-shrink:0;width:160px;height:100%;-webkit-app-region:no-drag}.absolute{position:absolute;bottom:0;left:0;right:0}
      [data-titlebar-cluster]{position:fixed;top:var(--titlebar-controls-top);display:flex;z-index:70;-webkit-app-region:no-drag}[data-titlebar-cluster=left]{left:8px}[data-titlebar-cluster=right]{right:8px}button{width:24px;height:24px;flex-shrink:0;padding:0;border:0;-webkit-app-region:no-drag}
      ${CSS}</style><body><div id="layout">${pane('grp-sessions')}${pane('grp-main')}${pane('preview')}</div><div data-titlebar-cluster="left"><button>Side</button></div><div data-titlebar-cluster="right">${Array.from({length:5},(_,i)=>`<button>${i}</button>`).join('')}</div></body></html>` })
    await b.evaluate(source+`;window.stopAlignment=installTitlebarAlignment();window.nativeButtons=[...document.querySelectorAll('[data-titlebar-cluster=right] button')];window.clicks=0;window.nativeButtons.forEach(b=>b.onclick=()=>window.clicks++);window.configure=(preview,mainTabs,previewTabs,cramped)=>{
      const groups=[...document.querySelectorAll('section')];groups[2].style.display=preview?'flex':'none';groups[1].style.setProperty('--panel-titlebar-right',preview?'0px':'140px');groups[2].style.setProperty('--panel-titlebar-right','140px');
      groups.forEach((group,i)=>{const header=group.querySelector('[data-panel-header]');header.querySelector('[data-zone-tabstrip]')?.remove();header.style.height=cramped?'62px':'34px';if(i===0||i===1&&mainTabs||i===2&&previewTabs){header.insertAdjacentHTML('afterbegin','<div data-zone-tabstrip="'+group.dataset.treeGroup+'" class="'+(cramped?'absolute':'')+'"><div role="tablist"><div role="tab" data-tree-tab aria-selected="true">A long native tab label</div><div role="tab" data-tree-tab>Another tab</div></div></div>')}});window.dispatchEvent(new Event('resize'))
    }`)
    for (const zoom of [1,0.9,1.25]) for (const preview of [false,true]) for (const mainTabs of [false,true]) for (const previewTabs of [false,true]) for (const cramped of [false,true]) {
      await b.evaluate(`document.documentElement.style.zoom='${zoom}';window.configure(${preview},${mainTabs},${previewTabs},${cramped});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`)
      const out = await b.evaluate(`(()=>{const headers=[...document.querySelectorAll('section')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const h=e.querySelector('[data-panel-header]'),r=h.getBoundingClientRect(),s=h.querySelector('[data-zone-tabstrip]'),list=s?.querySelector('[role=tablist]');return {id:e.dataset.treeGroup,height:r.height,contentY:e.querySelector('.body').getBoundingClientRect().y,background:getComputedStyle(h).backgroundColor,strip:s?{left:s.getBoundingClientRect().left,right:s.getBoundingClientRect().right}:null,left:r.left+parseFloat(getComputedStyle(e).getPropertyValue('--panel-titlebar-left')),right:r.right-parseFloat(getComputedStyle(e).getPropertyValue('--panel-titlebar-right')),scrollable:list?list.scrollWidth>=list.clientWidth:true}});const controls=[...document.querySelectorAll('[data-titlebar-cluster]')].map(e=>{const r=e.getBoundingClientRect();return {center:r.y+r.height/2,height:r.height}});return {headers,controls,buttons:window.nativeButtons.every((b,i)=>b===document.querySelectorAll('[data-titlebar-cluster=right] button')[i]),reachable:window.nativeButtons.every(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b})}})()`)
      const label = JSON.stringify({zoom,preview,mainTabs,previewTabs,cramped})
      for (const header of out.headers) assert.ok(Math.abs(header.height-48*zoom)<0.1, label)
      for (const control of out.controls) { assert.ok(Math.abs(control.center-24*zoom)<0.1,label+JSON.stringify(out.controls)); assert.ok(Math.abs(control.height-24*zoom)<0.1,label) }
      const main = out.headers.find(h=>h.id==='grp-main')
      assert.ok(Math.abs(main.contentY-(mainTabs?48*zoom:0))<0.1,label)
      if (!mainTabs) assert.equal(main.background,'rgba(0, 0, 0, 0)',label)
      assert.equal(out.buttons,true,label)
      assert.equal(out.reachable,true,label)
      // With no zoom, check the host-measured gutters explicitly. At other
      // scales they are already covered by hit testing and center geometry.
      if (zoom===1 && cramped) for (const header of out.headers.filter(h=>h.strip)) {
        assert.ok(header.strip.left>=header.left-0.1,label+' left gutter')
        assert.ok(header.strip.right<=header.right+0.1,label+' right gutter')
        assert.equal(header.scrollable,true)
      }
    }
    await b.evaluate('window.nativeButtons.forEach(b=>b.click());window.stopAlignment()')
    assert.equal(await b.evaluate('window.clicks'),5)
  } finally { b.close() }
})
