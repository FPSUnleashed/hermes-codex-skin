import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

const image = 'https://github.com/FPSUnleashed/hermes-codex-skin/releases/download/v1.8.0/composer-update.png'
const source = () => readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8').then(s => s.replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.plugin = {'))

test('release images render safely from Markdown and HTML without loading before hover', async () => {
 const b=await chromium()
 try {
  await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:'<!doctype html><body><article></article></body>'})
  await b.call('Network.enable');await b.call('Network.setBlockedURLs',{urls:['*']})
  const notes=['# Images',`![Markdown screenshot](${image})`,`<img src="${image}" alt="HTML &amp; screenshot" width="600" onerror="window.attacked=true" srcset="https://untrusted.invalid/a.png 2x">`,'Before '+`![Inline](${image})`+' after','<script>window.attacked=true</script>','<svg onload="window.attacked=true"></svg>',`<img src="http://127.0.0.1/private" alt="Blocked image">`].join('\n')
  await b.evaluate(await source()+`;appendUpdateNotes(document.querySelector('article'),${JSON.stringify(notes)})`)
  const r=await b.evaluate(`(()=>{const a=document.querySelector('article');return{images:Array.from(a.querySelectorAll('img'),i=>({alt:i.alt,src:i.getAttribute('src'),pending:i.dataset.updateImageSrc,events:i.getAttribute('onerror'),srcset:i.getAttribute('srcset'),referrer:i.referrerPolicy,crossOrigin:i.crossOrigin})),scripts:a.querySelectorAll('script,svg').length,attacked:!!window.attacked,text:a.textContent}})()`)
  assert.equal(r.images.length,3,'Markdown and HTML images must become image elements, not literal markup')
  assert.deepEqual(r.images.map(i=>i.alt),['Markdown screenshot','HTML & screenshot','Inline'])
  for(const i of r.images){assert.equal(i.src,null);assert.equal(i.pending,image);assert.equal(i.events,null);assert.equal(i.srcset,null);assert.equal(i.referrer,'no-referrer');assert.equal(i.crossOrigin,null,'GitHub release redirects do not support CORS image mode')}
  assert.equal(r.scripts,0);assert.equal(r.attacked,false);assert.match(r.text,/Before/);assert.match(r.text,/after/);assert.match(r.text,/Blocked image/);assert.doesNotMatch(r.text,/<img/)
  const urls=[image,'https://github.com/user-attachments/assets/1234','https://raw.githubusercontent.com/FPSUnleashed/hermes-codex-skin/main/image.png','http://github.com/FPSUnleashed/hermes-codex-skin/a.png','https://github.com.evil.invalid/a.png','https://github.com@evil.invalid/a.png','https://github.com/unrelated/repo/releases/download/v1/a.png','javascript:alert(1)','data:image/svg+xml,<svg/>','file:///tmp/a.png','https://github.com:444/FPSUnleashed/hermes-codex-skin/releases/download/v1/a.png']
  const allowed=await b.evaluate(`${JSON.stringify(urls)}.map(u=>!!updateImageURL(u))`)
  assert.deepEqual(allowed,[true,true,true,false,false,false,false,false,false,false,false])
  await b.evaluate(`activateUpdateImages(document.querySelector('article'));window.requestedImages=Array.from(document.querySelectorAll('img'),i=>i.src);document.querySelectorAll('img').forEach(i=>i.dispatchEvent(new Event('error')))`)
  assert.deepEqual(await b.evaluate('window.requestedImages'),[image,image,image])
  assert.equal(await b.evaluate(`document.querySelectorAll('article img').length`),0,'failed images leave readable fallback, not broken-image boxes')
  assert.match(await b.evaluate(`document.querySelector('article').textContent`),/Markdown screenshot/)
 } finally {b.close()}
})

test('late image layout keeps the hover panel and pointer bridge above the composer',async()=>{
 const b=await chromium()
 try{
  await b.call('Emulation.setDeviceMetricsOverride',{width:420,height:600,deviceScaleFactor:1,mobile:false})
  await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:'<!doctype html><body><div id="anchor" style="position:fixed;left:60px;bottom:30px"></div></body>'})
  // Hold requests deterministically; a later DOM size change models decoding.
  // The separate live smoke fetches and decodes actual GitHub PNG bytes.
  await b.evaluate(await source()+`;Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,set(v){this.dataset.requested=v}});const s=document.createElement('style');s.textContent=UPDATE_CSS;document.head.append(s);window.u=createSkinUpdater({get:()=>null,set:()=>{},remove:()=>{}},{});u.accept({checkedAt:Date.now(),releases:[{id:5,tag_name:'v1.9.0',prerelease:false,draft:false,body:${JSON.stringify(`![Image](${image})`)},assets:[{id:2,name:'plugin.js',size:100,digest:'sha256:'+('a'.repeat(64)),url:'https://api.github.com/repos/'+UPDATE_REPO+'/releases/assets/2'}]}]});window.unmount=u.mount(document.getElementById('anchor'))`)
  const point=await b.evaluate(`(()=>{const r=document.querySelector('.codex-update-button').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
  const before=await b.evaluate(`document.querySelector('.codex-update-panel').getBoundingClientRect().height`)
  await b.evaluate(`const i=document.querySelector('.codex-update-panel img');i.style.width='220px';i.style.height='140px';new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`)
  const after=await b.evaluate(`(()=>{const p=document.querySelector('.codex-update-panel').getBoundingClientRect(),b=document.querySelector('.codex-update-button').getBoundingClientRect(),h=document.querySelector('.codex-update-hover-bridge').getBoundingClientRect();return{height:p.height,top:p.top,bottom:p.bottom,buttonTop:b.top,bridgeTop:h.top,bridgeBottom:h.bottom,requested:document.querySelector('img').dataset.requested}})()`)
  assert.ok(after.height>before+50);assert.ok(after.top>=12);assert.ok(Math.abs(after.bottom+12-after.buttonTop)<.1);assert.ok(Math.abs(after.bridgeTop-after.bottom)<.1);assert.ok(after.bridgeBottom>=after.buttonTop);assert.equal(after.requested,image)
  await b.evaluate(`unmount();u.dispose()`)
  assert.equal(await b.evaluate(`document.querySelectorAll('.codex-update-panel,.codex-update-hover-bridge').length`),0)
 }finally{b.close()}
})
