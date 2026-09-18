import assert from 'node:assert/strict'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {loadPluginInternals} from './helpers/load-plugin.mjs'
test('native inline header contains balanced tab margins and square chat content below its header',async()=>{
 const browser=await chromium()
 try{
  const {CSS}=await loadPluginInternals(['CSS'])
  const {frameTree}=await browser.call('Page.getFrameTree')
  await browser.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html data-codex-chat-look="true"><head><style>
:root{--theme-background-seed:#111;--theme-sidebar-seed:#1c1c1c;--theme-foreground:#fcfcfc;--theme-card-seed:#212121;--ui-editor-surface-background:#111;--ui-sidebar-surface-background:#1c1c1c}*{box-sizing:border-box}body{margin:0}[data-tree-split]{display:flex;height:400px}[data-tree-split]>div{display:flex;position:relative;min-width:0}[data-tree-group]{display:flex;flex:1;flex-direction:column;min-width:0;overflow:hidden;background:var(--ui-editor-surface-background)}[data-panel-header]{position:relative;display:flex;flex-shrink:0;min-width:0;background:var(--ui-sidebar-surface-background)}[data-zone-tabstrip]{display:flex;flex:1;height:100%;min-width:0}[role=tablist]{display:flex;flex:1;min-width:0;overflow:auto}[role=tab]{display:flex;height:100%;align-items:center;flex-shrink:0}[data-zone-tabstrip].absolute{position:absolute;bottom:0;left:0;right:0}.content{position:relative;flex:1;min-height:0;overflow:hidden}#native-drag{position:absolute;top:0;height:34px;left:0;right:0;pointer-events:none;-webkit-app-region:drag}
${CSS}</style></head><body><div data-tree-split="root"><div id="side" style="width:160px"><div data-tree-group="grp-sessions"><div data-slot="sidebar">Sessions</div></div></div><div style="width:360px"><div id="chat" data-tree-group="grp-main" data-window-top><div data-panel-header id="chat-header" style="height:34px"><div data-window-drag-handle style="height:34px"> </div></div><div class="content" id="chat-content"><div data-chat-surface>Chat</div></div></div></div><div style="width:400px"><div data-tree-group="browser" data-window-top><div data-panel-header id="header" style="height:34px"><div aria-hidden="true" style="width:20px"></div><div data-zone-tabstrip="browser" id="strip"><div role="tablist"><div role="tab" id="tab" aria-selected="true">Browser</div><span><button id="add">+</button></span></div></div><div aria-hidden="true" style="width:20px"></div></div><div class="content" id="browser-content">Page</div></div></div></div></body></html>`})
  await browser.evaluate(`window.measure=()=>{const h=document.getElementById('header').getBoundingClientRect(),s=document.getElementById('strip').getBoundingClientRect(),t=document.getElementById('tab').getBoundingClientRect(),c=document.getElementById('chat-content'),g=document.getElementById('chat');return {headerHeight:h.height,top:t.top-s.top,bottom:h.bottom-t.bottom,stripTop:s.top,contentTop:document.getElementById('browser-content').getBoundingClientRect().top,corner:getComputedStyle(c).borderTopLeftRadius,chatColor:getComputedStyle(c).backgroundColor,backdrop:getComputedStyle(g).backgroundColor}}`)
  let r=await browser.evaluate('measure()');assert.equal(r.headerHeight,48);assert.equal(r.top,10);assert.equal(r.bottom,10);assert.equal(r.contentTop,48);assert.equal(r.corner,'0px');assert.equal(r.chatColor,'rgb(17, 17, 17)');assert.equal(r.backdrop,'rgb(28, 28, 28)')
  await browser.evaluate(`document.getElementById('header').style.height='62px';document.getElementById('strip').classList.add('absolute')`)
  r=await browser.evaluate('measure()');assert.equal(r.headerHeight,82);assert.equal(r.stripTop,34);assert.equal(r.top,10);assert.equal(r.bottom,10);assert.equal(r.contentTop,82)
  await browser.evaluate(`document.getElementById('side').style.display='none'`)
  assert.equal((await browser.evaluate('measure()')).corner,'0px')
  await browser.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
  r=await browser.evaluate('measure()');assert.equal(r.headerHeight,62);assert.equal(r.corner,'0px')
 }finally{browser.close()}
})
