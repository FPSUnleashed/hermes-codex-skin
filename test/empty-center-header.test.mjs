import assert from 'node:assert/strict'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {loadPluginInternals} from './helpers/load-plugin.mjs'
test('empty center-chat header disappears only between visible sidebar and browser',async()=>{
 const b=await chromium()
 try{
 const {CSS}=await loadPluginInternals(['CSS']);const {frameTree}=await b.call('Page.getFrameTree')
 await b.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html data-codex-chat-look="true"><head><style>*{box-sizing:border-box}body{margin:0}[data-tree-split]{display:flex;height:400px}[data-tree-split]>div{position:relative;display:flex;width:300px}[data-tree-group]{display:flex;flex:1;flex-direction:column;overflow:hidden}[data-panel-header]{height:34px;flex-shrink:0}.content{flex:1;overflow:hidden}${CSS}</style></head><body><div data-tree-split><div id="side"><div data-tree-group="grp-sessions">Sidebar</div></div><div><div id="main" data-tree-group="grp-main"><div data-panel-header id="header"><div data-window-drag-handle></div></div><div class="content" id="content">Chat</div></div></div><div id="right"><div data-tree-group="browser"><aside data-preview-browser>Browser</aside></div></div></div></body></html>`})
 await b.evaluate(`window.snap=()=>({display:getComputedStyle(document.getElementById('header')).display,top:document.getElementById('content').getBoundingClientRect().top,radius:getComputedStyle(document.getElementById('content')).borderTopLeftRadius,groupRadius:getComputedStyle(document.getElementById('main')).borderTopLeftRadius})`)
 let r=await b.evaluate('snap()');assert.equal(r.display,'none');assert.equal(r.top,0);assert.equal(r.radius,'0px');assert.equal(r.groupRadius,'0px')
 await b.evaluate(`document.getElementById('header').innerHTML='<div data-zone-tabstrip="grp-main"><div role="tablist"><div role="tab">Chat</div></div></div>'`)
 r=await b.evaluate('snap()');assert.notEqual(r.display,'none');assert.equal(r.top,44);assert.equal(r.radius,'0px')
 await b.evaluate(`document.getElementById('header').innerHTML='';document.getElementById('right').style.display='none'`)
 r=await b.evaluate('snap()');assert.notEqual(r.display,'none');assert.equal(r.top,34)
 await b.evaluate(`document.getElementById('right').style.display='flex';document.getElementById('side').style.display='none'`)
 r=await b.evaluate('snap()');assert.notEqual(r.display,'none');assert.equal(r.top,34)
 await b.evaluate(`document.getElementById('side').style.display='flex';document.documentElement.removeAttribute('data-codex-chat-look')`)
 r=await b.evaluate('snap()');assert.notEqual(r.display,'none');assert.equal(r.top,34)
 }finally{b.close()}
})
