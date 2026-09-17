import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {loadPluginInternals} from './helpers/load-plugin.mjs'
test('reference rail scales native hit boxes and virtual scroll coordinates together',async()=>{
 const b=await chromium()
 try{
 const {CSS}=await loadPluginInternals(['CSS']);const {frameTree}=await b.call('Page.getFrameTree')
 await b.call('Emulation.setDeviceMetricsOverride',{width:1100,height:800,deviceScaleFactor:2,mobile:false})
 await b.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html data-codex-chat-look="true"><head><style>:root{font-size:16px;--ui-text-primary:#fcfcfc;--ui-text-secondary:#aaa;--ui-chat-surface-background:#111;--ui-widget-surface-background:#111}*{box-sizing:border-box}body{margin:0;background:#111;color:#fcfcfc}#pane{position:relative;width:900px;height:700px}#rail{position:absolute;right:0;top:50%;transform:translateY(-50%);height:min(43.75rem,50%)}#strip{height:100%;overflow:auto;position:relative}.thread-timeline-track{position:relative;width:100%;height:700px}.thread-timeline-tick{position:absolute;display:flex;align-items:center;justify-content:flex-end;width:100%;padding:0 6px 0 0;border:0;background:transparent;height:7px}.thread-timeline-tick>span{height:1px;width:8px;background:#aaa;pointer-events:auto}${CSS}</style></head><body><section id="pane" data-session-anchor="main"><div id="rail" data-slot="thread-timeline" data-codex-history-rail><div id="strip" data-slot="thread-timeline-ticks"><div id="track" class="thread-timeline-track"></div></div></div></section></body></html>`})
 await b.evaluate(`window.jumps=[];window.render=(start,end)=>{track.replaceChildren();for(let i=start;i<=end;i++){const button=document.createElement('button');button.className='thread-timeline-tick';button.dataset.timelineIndex=i;button.style.top=(i*7)+'px';button.style.height='7px';if(i===42)button.setAttribute('aria-current','location');button.innerHTML='<span data-slot="timeline-bar"></span>';button.onclick=()=>jumps.push(i);track.append(button)}};render(40,65);strip.scrollTop=280;strip.onkeydown=e=>{if(e.key==='End'){e.preventDefault();render(70,99);strip.scrollTop=700-strip.clientHeight;track.lastElementChild.focus({preventScroll:true})}};window.metrics=()=>[...track.children].map(el=>{const r=el.firstElementChild.getBoundingClientRect(),box=el.getBoundingClientRect();return{index:Number(el.dataset.timelineIndex),nativeTop:el.style.top,nativeHeight:el.style.height,width:r.width,height:r.height,y:r.top+r.height/2,x:r.left+r.width/2,buttonY:box.top+box.height/2,buttonHeight:box.height,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button')?.dataset.timelineIndex}})`)
 let r=await b.evaluate('metrics()');assert.equal(await b.evaluate('strip.scrollTop'),280)
 for(let i=0;i<r.length;i++){
  assert.equal(r[i].nativeTop,`${(40+i)*7}px`);assert.equal(r[i].nativeHeight,'7px');assert.equal(r[i].hit,String(40+i))
  assert.ok(Math.abs(r[i].height-2)<.06);assert.equal(r[i].width,6);assert.ok(Math.abs(r[i].y-r[i].buttonY)<.04);assert.ok(Math.abs(r[i].buttonHeight-10)<.04)
  if(i)assert.ok(Math.abs(r[i].y-r[i-1].y-10)<.04)
 }
 for(const i of [0,10,20])for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,x:r[i].x,y:r[i].y,button:'left',clickCount:1})
 assert.deepEqual(await b.evaluate('jumps'),[40,50,60])
 await b.call('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35})
 assert.equal(await b.evaluate('document.activeElement.dataset.timelineIndex'),'99');assert.equal(await b.evaluate('track.style.height||getComputedStyle(track).height'),'700px')
 r=await b.evaluate('metrics()');const last=r.at(-1);assert.equal(last.hit,'99');assert.equal(last.nativeTop,'693px')
 if(process.env.CODEX_REFERENCE_RAIL_SCREENSHOT){await b.evaluate('render(40,65);strip.scrollTop=280');const {data}=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(process.env.CODEX_REFERENCE_RAIL_SCREENSHOT,Buffer.from(data,'base64'))}
 await b.evaluate("pane.style.width='862px'");assert.equal(await b.evaluate('getComputedStyle(rail).display'),'none')
 await b.evaluate("pane.style.width='863px'");assert.notEqual(await b.evaluate('getComputedStyle(rail).display'),'none')
 await b.evaluate("document.documentElement.removeAttribute('data-codex-chat-look')");assert.equal(await b.evaluate('track.firstElementChild.getBoundingClientRect().height'),7)
 }finally{b.close()}
})
