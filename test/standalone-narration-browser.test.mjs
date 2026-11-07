import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {chromium} from './helpers/chromium.mjs'
import {loadPluginInternals} from './helpers/load-plugin.mjs'

// Partial public DOM fixture with the shipping plugin and real Chromium CSS/AX.
// This is not a running Hermes application or a semantic interim classifier.
const {CSS}=await loadPluginInternals(['CSS'])
const source=(await readFile(new URL('../codex-chat-look/plugin.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.__testPlugin = {')
const md=(id,text=id)=>`<div class="aui-md" id="${id}">${text}</div>`
const actions='<div data-slot="aui_msg-actions"><button onclick="window.nativeClicks++">Copy final</button></div>'
const root=(id,body,footer='')=>`<div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="${id}"><div data-slot="aui_assistant-message-content">${body}</div>${footer}</div>`
const body=`<section data-session-anchor="browser"><div data-slot="aui_turn-pair"><div data-role="user" data-message-id="u">Question</div><div data-slot="aui_response-group">${root('progress-a',md('progress-a','Checking files'))}${root('progress-b',md('progress-b','Checking results'))}${root('tool','<div data-slot="tool-block" id="tool">Read file</div>')}${root('final',md('final-a','Final paragraph one')+md('final-b','Final paragraph two'),actions)}</div></div></section>`
const install=`(()=>{${source}\nwindow.project=(live='')=>reconcileTurnActivity(document.querySelector('[data-slot="aui_turn-pair"]'),'',null,'browser-owner',undefined,live);window.clearProjection=()=>clearTurnActivityDecorations();window.shown=id=>getComputedStyle(document.getElementById(id)).display!=='none';})()`

test('standalone completed narration: Chromium paint, AX, native promotion, streaming and cleanup at 320/900px',async()=>{
 const b=await chromium()
 try{
  await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look="true"><head><style>${CSS}</style></head><body></body></html>`})
  await b.evaluate(`const state=v=>({get:()=>v,subscribe:()=>()=>{}});globalThis.host={state:{activeSessionId:state('browser'),gateway:state('open'),profile:state('default')},onEvent:()=>()=>{}};globalThis.jsx=()=>null;globalThis.useEffect=()=>{};globalThis.useRef=()=>({current:null});globalThis.useQuery=()=>({});globalThis.THEMES_AREA='themes';globalThis.TITLEBAR_AREAS={left:'titleBar.left',center:'titleBar.center',right:'titleBar.right'};globalThis.PALETTE_AREA='palette';${install}`)
  const results=[]
  for(const width of [320,900]){
   await b.call('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false})
   await b.evaluate(`document.body.innerHTML=${JSON.stringify(body)};window.nativeClicks=0;window.nativeNode=document.getElementById('progress-a');window.nativeParent=nativeNode.parentNode;project();`)
   const closed=await b.evaluate(`({progress:shown('progress-a'),other:shown('progress-b'),first:shown('final-a'),last:shown('final-b'),tool:shown('tool'),same:nativeNode===document.getElementById('progress-a')&&nativeNode.parentNode===nativeParent,overflow:document.documentElement.scrollWidth>innerWidth})`)
   assert.deepEqual(closed,{progress:false,other:false,first:true,last:true,tool:false,same:true,overflow:false})
   const ax=(await b.call('Accessibility.getFullAXTree')).nodes.filter(n=>!n.ignored).map(n=>n.name?.value)
   assert.ok(ax.includes('Final paragraph one'));assert.ok(ax.includes('Final paragraph two'));assert.ok(!ax.includes('Checking files'));assert.ok(!ax.includes('Checking results'))
   await b.evaluate(`document.querySelector('[data-codex-turn-activity]').click()`)
   assert.deepEqual(await b.evaluate(`({progress:shown('progress-a'),tool:shown('tool')})`),{progress:true,tool:true})
   await b.evaluate(`document.querySelector('[data-codex-turn-activity]').click();document.querySelector('[data-slot="aui_msg-actions"] button').click()`)
   assert.equal(await b.evaluate('window.nativeClicks'),1)
   await b.evaluate(`document.getElementById('progress-a').closest('[data-role="assistant"]').insertAdjacentHTML('beforeend',${JSON.stringify(actions)})`)
   assert.equal(await b.evaluate(`shown('progress-a')`),false)
   await b.evaluate(`project()`);assert.equal(await b.evaluate(`shown('progress-b')`),false)
   await b.evaluate(`document.querySelector('[data-codex-turn-activity]').click()`)
   assert.equal(await b.evaluate(`shown('progress-a')&&shown('progress-b')&&nativeNode.parentNode===nativeParent`),true)
   await b.evaluate(`document.querySelector('[data-codex-turn-activity]').click()`)
   await b.evaluate(`document.getElementById('progress-a').closest('[data-role="assistant"]').querySelector('[data-slot="aui_msg-actions"]').remove();project();document.getElementById('progress-a').insertAdjacentHTML('beforeend','<img alt="late protected output">')`)
   assert.equal(await b.evaluate(`shown('progress-a')`),true)
   await b.evaluate(`document.getElementById('progress-a').querySelector('img').remove();document.getElementById('final-a').closest('[data-role="assistant"]').dataset.streaming='true'`)
   assert.equal(await b.evaluate(`shown('progress-b')`),false)
   await b.evaluate(`project('1min 2s')`)
   assert.equal(await b.evaluate(`document.querySelector('[data-codex-turn-activity] > span').textContent`),'working 1min 2s')
   await b.evaluate(`project('1hour 2min')`)
   assert.equal(await b.evaluate(`document.querySelector('[data-codex-turn-activity] > span').textContent`),'working 1hour 2min')
   await b.evaluate(`clearProjection()`)
   assert.equal(await b.evaluate(`document.querySelectorAll('[data-codex-activity-item],[data-codex-standalone-narration],[data-codex-turn-activity]').length`),0)
   assert.equal(await b.evaluate(`shown('progress-a')&&shown('progress-b')&&nativeNode.parentNode===nativeParent`),true)
   const oldBody=`<section><div data-slot="aui_turn-pair"><div data-role="user" data-message-id="reload-user">Question</div><div data-slot="aui_response-group">${root('old-opaque',md('old-one')+md('old-two'),actions)}</div></div></section>`
   await b.evaluate(`document.body.innerHTML=${JSON.stringify(oldBody)};project();window.oldNode=document.getElementById('old-two');oldNode.closest('[data-role="assistant"]').querySelector('[data-slot="aui_msg-actions"]').remove();document.querySelector('[data-slot="aui_response-group"]').insertAdjacentHTML('beforeend',${JSON.stringify(root('followup',md('followup-progress'))+root('new',md('new-final'),actions))});project();`)
   await b.evaluate(install)
   await b.evaluate('project()')
   assert.deepEqual(await b.evaluate(`({first:shown('old-one'),second:shown('old-two'),progress:shown('followup-progress'),last:shown('new-final'),same:oldNode===document.getElementById('old-two')})`),{first:false,second:false,progress:false,last:true,same:true})
   await b.evaluate(`document.querySelector('[data-codex-turn-activity]').click()`)
   assert.equal(await b.evaluate(`shown('old-one')&&shown('old-two')&&shown('new-final')&&oldNode===document.getElementById('old-two')`),true)
   results.push({width,closed,finalsInAX:true,nativeClickPreserved:true,olderPromotionStaysFolded:true,lateMediaImmediate:true,streamingLatestOnly:true,cleanup:true,moduleReloadReversible:true})
  }
  console.log('STANDALONE_BROWSER_PARTIAL_FIXTURE '+JSON.stringify(results))
 }finally{b.close()}
})
