import assert from 'node:assert/strict'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {loadPluginInternals} from './helpers/load-plugin.mjs'
test('reference current/idle colors remain theme-aware and hover supersedes current',async()=>{
 const browser=await chromium()
 try{
  const {CSS}=await loadPluginInternals(['CSS'])
  const {frameTree}=await browser.call('Page.getFrameTree')
  await browser.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html data-codex-chat-look="true"><head><style>:root{--ui-text-primary:#fcfcfc;--ui-chat-surface-background:#111} ${CSS}</style></head><body><div data-codex-history-rail><div data-slot="thread-timeline-ticks"><div class="thread-timeline-track"><button id="a" class="thread-timeline-tick" aria-current="location"><span data-slot="timeline-bar" class="dither"></span></button><button id="b" class="thread-timeline-tick"><span data-slot="timeline-bar" class="dither"></span></button><button id="c" class="thread-timeline-tick"><span data-slot="timeline-bar" class="dither"></span></button></div></div></div></body></html>`})
  await browser.evaluate(`window.snap=()=>['a','b','c'].map(id=>{const s=getComputedStyle(document.getElementById(id).firstElementChild),c=document.createElement('canvas').getContext('2d');c.fillStyle=s.backgroundColor;c.fillRect(0,0,1,1);return {opacity:s.opacity,rgba:[...c.getImageData(0,0,1,1).data]}})`)
  let r=await browser.evaluate('snap()');assert.deepEqual(r.map(x=>x.rgba),[[158,158,158,255],[62,62,62,255],[62,62,62,255]]);assert.deepEqual(r.map(x=>x.opacity),['1','1','1'])
  await browser.evaluate(`document.querySelector('[data-codex-history-rail]').setAttribute('data-codex-history-open','');document.getElementById('b').setAttribute('data-codex-history-hover','')`)
  r=await browser.evaluate('snap()');assert.deepEqual(r.map(x=>x.rgba),[[62,62,62,255],[252,252,252,255],[62,62,62,255]])
  assert.equal(await browser.evaluate("getComputedStyle(document.getElementById('b').firstElementChild).transitionDuration"),'0s','hover motion must not chase a 140ms transition')
  await browser.evaluate(`document.querySelector('[data-codex-history-rail]').removeAttribute('data-codex-history-open');document.getElementById('b').removeAttribute('data-codex-history-hover')`)
  r=await browser.evaluate('snap()');assert.deepEqual(r.map(x=>x.rgba),[[158,158,158,255],[62,62,62,255],[62,62,62,255]])
  await browser.evaluate(`document.getElementById('a').removeAttribute('aria-current');document.getElementById('b').setAttribute('aria-current','location')`)
  r=await browser.evaluate('snap()');assert.deepEqual(r.map(x=>x.rgba),[[62,62,62,255],[158,158,158,255],[62,62,62,255]])
  await browser.evaluate(`document.documentElement.style.setProperty('--ui-text-primary','#202020');document.documentElement.style.setProperty('--ui-chat-surface-background','#fff')`)
  r=await browser.evaluate('snap()');assert.ok(r[1].rgba[0]<r[0].rgba[0],'light theme current tick remains darker than idle')
 }finally{browser.close()}
})
