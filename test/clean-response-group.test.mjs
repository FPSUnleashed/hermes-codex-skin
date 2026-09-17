import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
test('Clean transcript crosses native response groups while preserving final, media and running turns',async()=>{
 const browser=await chromium()
 try{
  const {frameTree}=await browser.call('Page.getFrameTree')
  const message=(id,content,extra='')=>`<div id="${id}" data-role="assistant" data-slot="aui_assistant-message-root" ${extra}><div data-slot="aui_assistant-message-content">${content}</div></div>`
  const html=`<html data-codex-chat-look="true" data-codex-clean-transcript="on"><head></head><body><div data-slot="aui_turn-pair" id="settled"><div data-role="user">Question</div><div data-slot="aui_response-group">${message('interim','Commentary')}${message('tools','<div data-slot="tool-block">Ran command</div><div data-slot="aui_thinking-disclosure">Thought</div>')}${message('media','<div data-slot="aui_generated-image">Generated image</div>')}${message('final','Final answer<div data-slot="aui_msg-actions"></div>')}</div></div><div data-slot="aui_turn-pair" id="running"><div data-slot="aui_response-group">${message('live','Working','data-streaming="true"')}${message('previous','Previous<div data-slot="aui_msg-actions"></div>')}</div></div></body></html>`
  await browser.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html})
  const source=(await readFile(new URL('../codex-chat-look/plugin.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.testPlugin = {')
  const r=await browser.evaluate(`(()=>{const host={},PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},jsx=()=>null,useEffect=()=>{};${source}\nconst style=document.createElement('style');style.textContent=CSS;document.head.append(style);for(const p of document.querySelectorAll('[data-slot="aui_turn-pair"]'))reconcileCleanTranscript(p);const visible=id=>getComputedStyle(document.getElementById(id)).display!=='none';const state={settled:document.getElementById('settled').dataset.codexCleanSettled,interim:visible('interim'),final:visible('final'),media:visible('media'),tool:getComputedStyle(document.querySelector('[data-slot="tool-block"]')).display,live:visible('live'),running:document.getElementById('running').hasAttribute('data-codex-clean-settled')};document.documentElement.dataset.codexCleanTranscript='off';clearCleanTranscriptDecorations();return {...state,restored:visible('interim')}})()`)
  assert.equal(r.settled,'true')
  assert.equal(r.interim,false)
  assert.equal(r.final,true);assert.equal(r.media,true)
  assert.equal(r.tool,'none');assert.equal(r.live,true);assert.equal(r.running,false);assert.equal(r.restored,true)
 }finally{browser.close()}
})
