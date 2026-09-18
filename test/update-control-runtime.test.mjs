import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

test('native update control uses composer seam, escaped release content and an unclipped hover panel', async () => {
 const { UPDATE_CSS } = await loadPluginInternals(['UPDATE_CSS'])
 const source = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/, 'globalThis.plugin = {')
 const b = await chromium()
 try {
  await b.call('Emulation.setDeviceMetricsOverride',{width:500,height:700,deviceScaleFactor:1,mobile:false})
  await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><style>body{margin:0;background:white;--ui-text-primary:#171717;--ui-text-secondary:#666;--ui-stroke-secondary:#ddd;--codex-color-card:white}#composer{position:absolute;bottom:20px;left:20px;width:460px;height:110px;padding:15px;box-sizing:border-box;overflow:hidden;border-radius:20px;background:#f7f7f7}#toolbar{display:flex;align-items:center;gap:12px;position:absolute;bottom:12px}#plus{width:28px;height:28px;border:0;background:none}${UPDATE_CSS}</style><form id="composer"><div>Message Hermes…</div><div id="toolbar"><button id="plus" type="button">+</button><span id="anchor"></span></div></form>`})
  await b.evaluate(source + `;window.submissions=0;document.getElementById('composer').addEventListener('submit',e=>{e.preventDefault();window.submissions++});window.updater=createSkinUpdater({get:()=>null,set:()=>{},remove:()=>{}},{});window.entry={checkedAt:Date.now(),releases:[{id:2,tag_name:'v1.9.0',prerelease:false,draft:false,name:'Update validation',published_at:'2026-09-18T00:00:00Z',body:'# Changes\\n- '+('<img src=x onerror=alert(1)> repeat\\n'.repeat(18)),assets:[{id:101,name:'plugin.js',size:100,digest:'sha256:'+('a'.repeat(64)),url:'https://api.github.com/repos/'+UPDATE_REPO+'/releases/assets/101'}]}]};updater.accept(entry);window.disposeView=updater.mount(document.getElementById('anchor'));`)
  const rect = await b.evaluate(`(()=>{const r=document.querySelector('.codex-update-button').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width}})()`)
  assert.ok(Math.abs(rect.width-25.2)<.05)
  await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y})
  const state=await b.evaluate(`(()=>{const p=document.querySelector('.codex-update-panel'),r=p.getBoundingClientRect(),c=document.getElementById('composer').getBoundingClientRect();return{open:!p.hidden,above:r.top<c.top,parent:p.parentElement.tagName,buttons:p.querySelectorAll('button').length,images:p.querySelectorAll('img').length,text:p.textContent,scroll:p.scrollHeight>p.clientHeight}})()`)
  assert.equal(state.open,true);assert.equal(state.above,true);assert.equal(state.parent,'BODY');assert.equal(state.buttons,0);assert.equal(state.images,0);assert.equal(state.scroll,true);assert.doesNotMatch(state.text,/<img/);assert.match(state.text,/Image unavailable/)
  const bridge = await b.evaluate(`(()=>{const r=document.querySelector('.codex-update-hover-bridge').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',...bridge})
  await b.evaluate(`new Promise(resolve=>setTimeout(resolve,350))`)
  assert.equal(await b.evaluate(`document.querySelector('.codex-update-panel').hidden`),false,'slow traversal through the hover gap keeps releases open')
  await b.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
  assert.equal(await b.evaluate(`document.querySelector('.codex-update-panel').hidden`),true)
  await b.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:rect.x,y:rect.y})
  await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:rect.x,y:rect.y})
  await b.evaluate(`new Promise(resolve=>setTimeout(resolve,30))`)
  assert.equal(await b.evaluate('window.submissions'),0)
  assert.equal(await b.evaluate('updater.state.phase'),'error')
  await b.evaluate('disposeView();updater.dispose()')
  assert.equal(await b.evaluate(`document.querySelectorAll('.codex-update-panel,.codex-update-button').length`),0)
 } finally { b.close() }
})
