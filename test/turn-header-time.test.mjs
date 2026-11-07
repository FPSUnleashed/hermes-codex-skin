import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {nativeTimestampBundle} from './helpers/native-timestamp-fixture.mjs'

const pluginUrl=process.env.CODEX_ACTIVITY_TEST_PLUGIN
 ? new URL(process.env.CODEX_ACTIVITY_TEST_PLUGIN,`file://${process.cwd()}/`)
 : new URL('../codex-chat-look/plugin.js',import.meta.url)
const source=(await readFile(pluginUrl,'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.testPlugin = {')

const start=1793444400,end=1793444465.125
const rows=[{role:'user',timestamp:start,text:'Question'},{role:'assistant',timestamp:start+2,text:'Progress',tool_calls:[{}]},{role:'assistant',timestamp:end,text:'First final'}]
const message=(id,content,footer='')=>`<div data-role="assistant" data-message-id="${id}" data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">${content}</div>${footer}<span hidden data-slot="aui_message-streaming-marker"></span></div>`
const actions='<div data-slot="aui_msg-actions"><button>Copy</button></div>'
const pair=`<div id="pair" data-slot="aui_turn-pair"><div data-role="user" data-message-id="${start}-0-user">Question</div>${message('work','<div data-slot="tool-block" id="tool"><button id="native">Native tool</button></div>')}${message(`${end}-2-assistant`,'<div class="aui-md" id="answer">First final</div>',actions)}</div>`
async function fixture(options={}) {
 const browser=await chromium()
 await browser.call('Emulation.setLocaleOverride',{locale:options.locale||'en-US'})
 await browser.call('Emulation.setTimezoneOverride',{timezoneId:options.timezone||'Europe/Paris'})
 await browser.call('Emulation.setDeviceMetricsOverride',{width:860,height:360,deviceScaleFactor:1,mobile:false})
 const {frameTree}=await browser.call('Page.getFrameTree')
 await browser.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html data-codex-chat-look="true"><head></head><body><section data-session-anchor="workspace">${pair}</section></body></html>`})
 await browser.evaluate(nativeTimestampBundle)
 await browser.evaluate(`document.getElementById('answer').closest('[data-role="assistant"]').insertAdjacentHTML('beforeend',timestampMarkup(${JSON.stringify(options.nativeStart??start)},${JSON.stringify(Object.hasOwn(options,'nativeEnd')?options.nativeEnd:end)},${options.timestamps!==false}))`)
 await browser.evaluate(`(()=>{const atom=v=>({get:()=>v,subscribe:()=>()=>{}});window.fixtureHistory=${JSON.stringify(options.rows??rows)};window.events=new Map();window.location.hash='#/stored-test';const host={state:{activeSessionId:atom('test'),profile:atom('default'),gateway:atom('open')},onEvent:(name,fn)=>{events.set(name,fn);return()=>events.delete(name)},request:async()=>({messages:fixtureHistory})};const PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},jsx=()=>null,useEffect=()=>{};${source}
 const style=document.createElement('style');style.textContent=CSS;document.head.append(style);const scene=document.createElement('style');scene.textContent='body{font:14px system-ui;margin:40px;background:var(--ui-bg, #161616);color:var(--ui-text,#ddd)}section{max-width:760px}';document.head.append(scene);
 window.stop=installBehaviorRuntime();window.h=()=>document.querySelector('[data-codex-turn-activity]');window.waitFor=async f=>{const limit=performance.now()+3000;while(!f()){if(performance.now()>limit)throw Error('Header timed out');await new Promise(r=>setTimeout(r,20))}};window.time=()=>h()?.querySelector('[data-codex-turn-finished-time]');window.label=()=>h()?.querySelector('span')?.textContent;window.emit=(name,payload)=>{for(const key of [name,'*'])events.get(key)?.({...payload,type:name})};
 })()`)
 await browser.evaluate(`waitFor(()=>h())`)
 await browser.evaluate(`new Promise(r=>setTimeout(r,200))`)
 return browser
}

async function screenshot(browser,name) {
 if(!process.env.CODEX_HEADER_SCREENSHOTS)return
 await mkdir(process.env.CODEX_HEADER_SCREENSHOTS,{recursive:true})
 const {data}=await browser.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
 await writeFile(`${process.env.CODEX_HEADER_SCREENSHOTS}/${name}.png`,Buffer.from(data,'base64'))
}

test('work header has only its disclosure arrow and removes stale owned hammers on refresh',async()=>{
 const browser=await fixture()
 try {
  assert.equal(await browser.evaluate(`h().querySelectorAll('svg').length===1&&!h().querySelector('[data-codex-turn-hammer]')`),true)
  await browser.evaluate(`window.chevron=h().querySelector('[data-codex-turn-chevron]');window.finishedTime=time();h().insertAdjacentHTML('afterbegin','<svg data-codex-turn-hammer aria-hidden="true"><path d="M0 0"/></svg><svg data-codex-turn-hammer hidden></svg>');window.dispatchEvent(new Event('resize'));waitFor(()=>!h().querySelector('[data-codex-turn-hammer]'))`)
  assert.equal(await browser.evaluate(`!h().querySelector('[data-codex-turn-hammer]')&&h().querySelector('svg')===chevron&&time()===finishedTime`),true,'remove stale SVGs rather than concealing them; retain chevron and timing nodes')
  await browser.evaluate(`window.nativeTool=document.getElementById('native');h().click();new Promise(r=>setTimeout(r,180))`)
  assert.deepEqual(await browser.evaluate(`({arrow:getComputedStyle(h().querySelector('[data-codex-turn-chevron]')).transform,expanded:h().getAttribute('aria-expanded'),native:document.getElementById('native')===nativeTool,svgCount:h().querySelectorAll('svg').length})`),{arrow:'matrix(0, 1, -1, 0, 0, 0)',expanded:'true',native:true,svgCount:1})
  await browser.evaluate(`document.querySelector('[data-slot="aui_message-streaming-marker"]').dataset.messageStreaming='true';waitFor(()=>label()==='Working')`)
  assert.equal(await browser.evaluate(`h().querySelectorAll('svg').length===1&&!h().querySelector('[data-codex-turn-hammer]')`),true)
  await screenshot(browser,'chevron-only-expanded')
 } finally {browser.close()}
})

test('finished header reveals the actual native completedAt on hover and focus, without changing its accessible name',async()=>{
 const browser=await fixture()
 try {
  await browser.evaluate(`waitFor(()=>time())`)
  const finished=await browser.evaluate(`({iso:time().dateTime,hidden:getComputedStyle(time().parentElement).opacity,name:h().getAttribute('aria-label'),label:label(),tip:h().querySelector('[role="tooltip"]').textContent,expected:new Intl.DateTimeFormat(undefined,{dateStyle:'full',timeStyle:'short'}).format(new Date(${end}*1000))})`)
  assert.deepEqual(finished,{iso:new Date(end*1000).toISOString(),hidden:'0',name:'Worked for 1m 5s',label:'Worked for 1m 5s',tip:finished.expected,expected:finished.expected})
  const {x,y}=await browser.evaluate(`(()=>{const r=h().getBoundingClientRect();return{x:r.x+20,y:r.y+10}})()`)
  await browser.call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y})
  assert.equal(await browser.evaluate(`getComputedStyle(time().parentElement).opacity`),'1')
  await screenshot(browser,'hover-finished-clock')
  await browser.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0})
  await browser.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await browser.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  assert.equal(await browser.evaluate(`document.activeElement===h()&&getComputedStyle(h().querySelector('[role="tooltip"]')).display!=='none'&&getComputedStyle(time().parentElement).opacity==='1'`),true)
  await screenshot(browser,'focus-finished-tooltip')
  await browser.call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32})
  await browser.call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32})
  assert.equal(await browser.evaluate(`h().getAttribute('aria-expanded')`),'true')
 } finally {browser.close()}
})

test('fresh streamed follow-up clears a previous completion time and cannot revive it from stale history',async()=>{
 const browser=await fixture()
 try {
  await browser.evaluate(`waitFor(()=>time())`)
  await browser.evaluate(`window.firstAnswer=document.getElementById('answer');document.querySelector('[data-slot="aui_message-streaming-marker"]').dataset.messageStreaming='true';waitFor(()=>label()==='Working'&&!time())`)
  assert.equal(await browser.evaluate(`h().hasAttribute('title')||h().hasAttribute('aria-description')`),false)
  await screenshot(browser,'working-no-finish-time')
  await browser.evaluate(`document.querySelector('[data-slot="aui_message-streaming-marker"]').removeAttribute('data-message-streaming');waitFor(()=>label()?.startsWith('Worked'))`)
  await browser.evaluate(`new Promise(r=>setTimeout(r,200))`)
  assert.equal(await browser.evaluate(`Boolean(time())`),false)
  const next=end+121.25
  await browser.evaluate(`fixtureHistory.push({role:'user',timestamp:${end+1},display_kind:'async_delegation_complete',text:'Subagent Task Completed: inspect'},{role:'assistant',timestamp:${next},text:'Second final'});emit('message.complete',{session_id:'test',profile:'default',payload:{status:'complete',timestamp:${next}}});new Promise(r=>setTimeout(r,200))`)
  assert.equal(await browser.evaluate(`Boolean(time())`),false,'an event or new history authoring time must not invent native completedAt')
  await browser.evaluate(`firstAnswer.closest('[data-role="assistant"]').querySelector(':scope > [data-slot="timeline-timestamp"]').outerHTML=timestampMarkup(${start},${next});waitFor(()=>time()?.dateTime===${JSON.stringify(new Date(next*1000).toISOString())})`)
  assert.equal(await browser.evaluate(`document.getElementById('answer')===firstAnswer&&Boolean(firstAnswer.getClientRects().length)`),true)
  await screenshot(browser,'resumed-actual-new-finish')
 } finally {browser.close()}
})

test('authoring-only, missing, reversed, invalid or hidden native endpoints have no finish tooltip; locale and timezone use native Intl',async()=>{
 for(const options of [{nativeEnd:null},{nativeStart:0},{nativeEnd:start-10},{nativeEnd:NaN},{timestamps:false}]) {
  const browser=await fixture(options)
  try {assert.equal(await browser.evaluate(`Boolean(time())||h().hasAttribute('title')||h().hasAttribute('aria-description')`),false)}finally{browser.close()}
 }
 const browser=await fixture({locale:'fr-FR',timezone:'America/New_York'})
 try {
  await browser.evaluate(`waitFor(()=>time())`)
  assert.equal(await browser.evaluate(`h().querySelector('[role="tooltip"]').textContent===new Intl.DateTimeFormat(undefined,{dateStyle:'full',timeStyle:'short'}).format(new Date(${end}*1000))&&time().textContent===new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(${end}*1000))`),true)
 }finally{browser.close()}
})
