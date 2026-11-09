import { referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {loadPluginInternals} from './helpers/load-plugin.mjs'

const pluginUrl = process.env.CODEX_ACTIVITY_TEST_PLUGIN
  ? new URL(process.env.CODEX_ACTIVITY_TEST_PLUGIN, `file://${process.cwd()}/`)
  : new URL('../codex-chat-look/plugin.js', import.meta.url)
const source = (await readFile(pluginUrl, 'utf8')).replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.testPlugin = {')
const actions = '<div data-slot="aui_msg-actions"><button>Copy</button></div>'
const duration = '<span data-slot="aui_turn-duration">⏱ 6m 9s</span>'
// These roots model source rows with tool_calls. Supply their public history
// records: a footer's absence (or an old assistant-interim ID) is not proof.
const interimIds = ['interim','work','combined','history-root','first-work','preview-work']
const fixtureHistory = {messages:interimIds.map((id,index)=>({role:'assistant',timestamp:1701000000+index,text:id,tool_calls:[{id:'call-'+id,type:'function',function:{name:'terminal',arguments:'{}'}}]}))}
const message = (id, body, footer = '', attrs = '') => `<div id="${id}" data-role="assistant" data-slot="aui_assistant-message-root" ${interimIds.includes(id) ? `data-message-id="${1701000000+interimIds.indexOf(id)}-0-assistant"` : ''} ${attrs}><div data-slot="aui_assistant-message-content">${body}</div>${footer}</div>`
const tool = '<div data-slot="tool-block" id="tool"><details id="native-tool"><summary>Ran command</summary><pre id="output">Exact output</pre></details></div>'
const notice = (id, label = 'Subagent Tasks Completed: inspect') => `<div id="${id}" data-slot="aui_background-result"><div data-conversation-scaffold><button aria-expanded="false"><span class="truncate">${label}</span></button></div><div>Worker result</div></div>`

async function fixture(html, options = {}) {
  const browser = await chromium()
  try {
  const {frameTree} = await browser.call('Page.getFrameTree')
  await browser.call('Page.setDocumentContent', {frameId: frameTree.frame.id, html: `<html data-codex-chat-look="true"><head></head><body><section data-session-anchor="workspace">${html}</section></body></html>`})
  await browser.evaluate(`(()=>{
    const atom = value => {const listeners=new Set();return {get:()=>value,set:next=>{value=next;for(const listener of listeners)listener(next)},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}};
    window.fixtureEvents={};window.historyCalls=[];window.historyResult=${JSON.stringify(options.history ?? fixtureHistory)};
    const host={state:{activeSessionId:atom('test'),profile:atom('default'),gateway:atom('open')},onEvent:(type,fn)=>{window.fixtureEvents[type]=fn;return()=>delete window.fixtureEvents[type]},request:async(method,params)=>{window.historyCalls.push({method,params});const snapshot=window.historyResult;if(${Boolean(options.owner)})window.historyRequestOwners.push({runtime:params.session_id,profile:host.state.profile.get(),connection:host.state.connectionId.get()});if(${Boolean(options.deferHistory)})await new Promise(resolve=>window.resolveHistory=resolve);return ${Boolean(options.owner)}?snapshot:window.historyResult}};
    if(${Boolean(options.owner)}){window.historyRequestOwners=[];Object.assign(host.state,{connectionId:atom('local'),focusedSessionId:atom('test'),focusedStoredSessionId:atom('stored-test'),focusedSessionOwner:atom({connectionId:'local',profile:'default'})})}
    window.fixtureState=host.state;
    window.location.hash=${JSON.stringify(options.route ?? '#/stored-test')};
    const PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},jsx=()=>null,useEffect=()=>{};
    ${source}
    const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
    window.start=()=>installBehaviorRuntime();
    window.stop=window.start();
    window.el=id=>document.getElementById(id);
    window.visible=id=>Boolean(el(id)?.getClientRects().length);
    window.waitFor=async predicate=>{const end=performance.now()+3000;while(!predicate()){if(performance.now()>end)throw Error('Activity reconciliation timed out');await new Promise(r=>setTimeout(r,20));}};
    window.header=id=>el(id).querySelector('[data-codex-turn-activity]');
  })()`)
  return browser
  } catch (error) { browser.close(); throw error }
}

async function click(browser, selector) {
  const point = await browser.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await browser.call('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', clickCount:1, ...point})
  await browser.call('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', clickCount:1, ...point})
}

test('completed turn auto-folds once, pointer and keyboard restore native nested controls without remounting', async()=>{
  const browser=await fixture(`<div data-slot="aui_turn-pair" id="pair"><div data-role="user">Question</div><div data-slot="aui_response-group">${message('interim','<div class="aui-md">Checking files</div>'+tool)}${message('final','<div class="aui-md" id="answer">Final answer</div>',duration+actions)}</div></div>`)
  try {
    await browser.evaluate(`waitFor(()=>header('pair')&&!visible('interim'))`)
    assert.deepEqual(await browser.evaluate(`({label:header('pair').textContent.trim(),expanded:header('pair').getAttribute('aria-expanded'),interim:visible('interim'),answer:visible('answer'),actions:visible('final')})`), {label:'Worked for 6m 9s',expanded:'false',interim:false,answer:true,actions:true})
    await browser.evaluate(`window.originalTool=el('native-tool');window.originalOutput=el('output');window.originalParent=originalTool.parentNode`)
    await click(browser,'[data-codex-turn-activity]')
    assert.equal(await browser.evaluate(`visible('interim')`),true)
    await click(browser,'#native-tool > summary')
    assert.equal(await browser.evaluate(`el('native-tool').open`),true)
    await browser.evaluate(`window.dispatchEvent(new Event('resize'));`)
    await browser.evaluate(`new Promise(r=>setTimeout(r,150))`)
    assert.equal(await browser.evaluate(`header('pair').getAttribute('aria-expanded')`),'true')
    await browser.evaluate(`header('pair').focus()`)
    await browser.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13})
    await browser.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    assert.equal(await browser.evaluate(`visible('interim')`),false)
    await click(browser,'[data-codex-turn-activity]')
    assert.equal(await browser.evaluate(`el('native-tool')===originalTool&&el('output')===originalOutput&&originalTool.parentNode===originalParent&&originalTool.open`),true)
  } finally {browser.close()}
})

test('live, resumed and uncertain turns fail open; completion resets only after new work; hot reload and disable preserve native DOM', async()=>{
  const browser=await fixture(`<div data-slot="aui_thread-content"><div data-slot="aui_turn-pair" id="pair">${message('interim','<div class="aui-md">Checking</div>'+tool)}${message('final','<div class="aui-md">Answer</div>',actions,'data-streaming="true"')}</div></div>`)
  try {
    await browser.evaluate(`waitFor(()=>header('pair'))`)
    assert.deepEqual(await browser.evaluate(`({label:header('pair').textContent.trim(),visible:visible('interim')})`),{label:'Working',visible:true})
    await browser.evaluate(`el('final').removeAttribute('data-streaming');waitFor(()=>header('pair').textContent.trim()==='Worked')`)
    assert.equal(await browser.evaluate(`visible('interim')`),false)
    await click(browser,'[data-codex-turn-activity]')
    await browser.evaluate(`window.original=el('tool');window.stop();window.stop=window.start();new Promise(r=>setTimeout(r,450))`)
    assert.equal(await browser.evaluate(`visible('interim')&&header('pair').getAttribute('aria-expanded')==='true'&&el('tool')===original`),true)
    await browser.evaluate(`el('final').dataset.streaming='true';waitFor(()=>header('pair').textContent.trim()==='Working')`)
    await browser.evaluate(`el('final').removeAttribute('data-streaming');waitFor(()=>header('pair').getAttribute('aria-expanded')==='false')`)
    await browser.evaluate(`el('pair').insertAdjacentHTML('beforeend',${JSON.stringify(message('late','<div class="aui-md">More work</div>'))});waitFor(()=>visible('interim'))`)
    assert.equal(await browser.evaluate(`visible('late')`),true)
    await browser.evaluate(`window.stop();new Promise(r=>setTimeout(r,450))`)
    assert.equal(await browser.evaluate(`!header('pair')&&visible('interim')&&el('tool')===original&&!el('pair').hasAttribute('data-codex-activity-phase')`),true)
  } finally {browser.close()}
})

test('hydration, tool-only tail, protected output, scoped notices, multiple panes and late mutations',async()=>{
  const protectedBody='<div class="aui-md" id="mixed">Keep image<img id="image" alt="image"></div><div data-slot="aui_artifact-card" id="artifact">Artifact</div><div role="alert" id="alert">Failure</div>'
  const browser=await fixture(`<section data-session-anchor="workspace"><div data-slot="aui_turn-pair" id="hydrated">${message('combined','<div class="aui-md" id="part1">Interim</div><span data-slot="timeline-timestamp">12:00</span><div class="aui-md" id="part2">Final hydrated</div>'+tool,actions)}</div></section><section data-session-anchor="two"><div data-slot="aui_turn-pair" id="tail">${message('earlier','<div class="aui-md" id="last-answer">Real last answer</div>')}${message('tail-tool','<div data-slot="tool-block" id="tail-block">Done</div>',actions)}<div data-role="system" data-slot="aui_system-message-root">${notice('completion')}<p id="unrelated">Keep system detail</p></div></div><div data-slot="aui_turn-pair" id="protected">${message('protected-root',protectedBody+'<div data-slot="tool-block" id="safe-tool">Safe tool</div>')}${message('protected-final','<div class="aui-md">Final</div>',actions)}</div></section>`)
  try {
    try {
      await browser.evaluate(`waitFor(()=>header('hydrated')&&header('tail')&&header('protected')&&!visible('part1'))`)
    } catch (error) {
      console.log('hydration snapshot', await browser.evaluate(`({headers:['hydrated','tail','protected'].map(id=>[id,header(id)?.outerHTML]),parts:['part1','part2','tool'].map(id=>[id,visible(id),el(id)?.getAttribute('data-codex-activity-item')]),historyCalls})`))
      throw error
    }
    assert.deepEqual(await browser.evaluate(`Object.fromEntries(['part1','part2','tool','last-answer','tail-block','completion','unrelated','mixed','artifact','alert','safe-tool'].map(id=>[id,visible(id)]))`),{part1:false,part2:true,tool:false,'last-answer':true,'tail-block':false,completion:false,unrelated:true,mixed:true,artifact:true,alert:true,'safe-tool':false})
    await browser.evaluate(`el('tail').insertAdjacentHTML('beforeend',${JSON.stringify(notice('late-completion'))});waitFor(()=>!visible('late-completion'))`)
    for (const slot of ['tool-approval-inline','clarify-inline','mcp-setup-inline']) {
      await browser.evaluate(`el('safe-tool').insertAdjacentHTML('beforeend','<div id="action" data-slot="${slot}">Required action</div>');waitFor(()=>visible('safe-tool'))`)
      assert.equal(await browser.evaluate(`visible('action')&&visible('mixed')`),true)
      await browser.evaluate(`el('action').remove();waitFor(()=>!visible('safe-tool'))`)
    }
  } finally {browser.close()}
})

test('obsolete Clean transcript palette control is removed rather than replaced by a toggle',async()=>{
  const {plugin}=await loadPluginInternals()
  const registrations=[]
  plugin.register({onDispose:()=>{},register:item=>registrations.push(item),storage:{get:(_key,fallback)=>fallback,set:()=>{throw Error('Unexpected setting write')}}})
  assert.equal(registrations.some(item=>/clean.transcript|turn.activity|worked.for/i.test(item.id+' '+item.data?.label)),false)
})

test('raw textual final before a tool-only footer is never mistaken for activity',async()=>{
  const browser=await fixture(`<div data-slot="aui_turn-pair" id="pair">${message('raw-answer','Plain textual final')}${message('tail','<div data-slot="tool-block" id="raw-tail">Done</div>',actions)}</div>`)
  try {
    await browser.evaluate(`waitFor(()=>header('pair'))`)
    assert.equal(await browser.evaluate(`visible('raw-answer')`),true)
    assert.equal(await browser.evaluate(`visible('raw-tail')`),false)
  } finally {browser.close()}
})

test('native hidden streaming marker gates completion and a newer active turn closes previous expansion only in its own pane',async()=>{
  const first=`<div data-slot="aui_turn-pair" id="first">${message('first-work','<div class="aui-md">Checking</div>'+tool)}${message('first-final','<div class="aui-md">Answer</div>',duration+actions)}</div>`
  const browser=await fixture(`<div data-slot="aui_thread-content" id="thread">${first}</div><div data-slot="aui_thread-content" id="other"><div data-slot="aui_turn-pair" id="other-pair">${message('other-work','<div data-slot="tool-block">Read</div>')}${message('other-final','<div class="aui-md">Answer</div>',actions)}</div></div>`)
  try {
    await browser.evaluate(`waitFor(()=>header('first')&&header('other-pair'))`)
    await click(browser,'#first > [data-codex-turn-activity]')
    await click(browser,'#other-pair > [data-codex-turn-activity]')
    const second=`<div data-slot="aui_turn-pair" id="second">${message('second-work','<div data-slot="tool-block">Read</div>')}${message('second-final','<div class="aui-md">Answer</div><span hidden data-slot="aui_message-streaming-marker" data-message-streaming="true" id="marker"></span>',actions)}</div>`
    await browser.evaluate(`el('thread').insertAdjacentHTML('beforeend',${JSON.stringify(second)});waitFor(()=>header('second'))`)
    assert.equal(await browser.evaluate(`header('second').textContent.trim()`),'Working')
    assert.equal(await browser.evaluate(`header('first').getAttribute('aria-expanded')`),'false')
    assert.equal(await browser.evaluate(`header('other-pair').getAttribute('aria-expanded')`),'true')
    await browser.evaluate(`el('marker').removeAttribute('data-message-streaming');waitFor(()=>header('second').textContent.trim()==='Worked')`)
  } finally {browser.close()}
})

test('late protected descendants, scoped notice lookalikes and historical wrapper hydration preserve output',async()=>{
  const heading='Subagent Tasks Completed: inspect'
  const browser=await fixture(`<div data-slot="aui_thread-content" id="thread"><div data-slot="aui_turn-pair" id="pair"><div data-role="user" id="user">${notice('user-notice')}</div>${message('work','<div class="aui-md">Checking</div>'+tool)}${message('final',`<div class="aui-md">${heading}${notice('assistant-notice')}</div>`,actions)}${notice('direct-notice')}<div data-slot="aui_background-result" id="body-lookalike"><div data-conversation-scaffold><span class="truncate">Other event</span></div>${heading}</div><div role="alert">${notice('error-notice')}</div></div></div>`)
  try {
    await browser.evaluate(`waitFor(()=>header('pair'))`)
    assert.deepEqual(await browser.evaluate(`Object.fromEntries(['user-notice','assistant-notice','direct-notice','body-lookalike','error-notice'].map(id=>[id,visible(id)]))`),{'user-notice':true,'assistant-notice':true,'direct-notice':false,'body-lookalike':true,'error-notice':true})
    await browser.evaluate(`el('tool').insertAdjacentHTML('beforeend','<div data-slot="aui_generated-image" id="late-image">Image</div>');waitFor(()=>visible('late-image'))`)
    assert.equal(await browser.evaluate(`visible('tool')`),true)
    const historical=`<div class="historical-turn-row"><div class="virtualizer-spacer"></div><div data-slot="aui_turn-pair" id="historical">${message('history-root','<span data-slot="timeline-timestamp" id="history-time">12:00</span><div class="aui-md" id="history-interim">Checking</div><div data-slot="tool-block" id="history-tool">Read</div><div class="aui-md" id="history-final">Final</div>',actions)}</div></div>`
    await browser.evaluate(`el('thread').insertAdjacentHTML('afterbegin',${JSON.stringify(historical)});waitFor(()=>header('historical')&&!visible('history-interim'))`)
    assert.deepEqual(await browser.evaluate(`({interim:visible('history-interim'),time:visible('history-time'),final:visible('history-final'),tool:visible('history-tool')})`),{interim:false,time:false,final:true,tool:false})
    // The old paragraph was independently completed (its root had native
    // actions before this append), not proven interim by the new paragraph.
    await browser.evaluate(`el('history-root').querySelector('[data-slot="aui_assistant-message-content"]').insertAdjacentHTML('beforeend','<div class="aui-md" id="new-history-final">New final</div>');waitFor(()=>visible('new-history-final'))`)
    assert.equal(await browser.evaluate(`visible('history-final')&&visible('new-history-final')&&!visible('history-interim')`),true)
  } finally {browser.close()}
})

test('duration is native whole-turn metadata, geometry follows T3, text streams do not rescan historical pairs',async()=>{
  const browser=await fixture(`<div data-slot="aui_thread-content"><div data-slot="aui_turn-pair" id="pair">${message('work','<div class="aui-md" id="stream-text">Checking</div><div data-slot="tool-block">Took 999s</div>')}${message('final','<div class="aui-md">Answer</div><span data-slot="timeline-timestamp"><time datetime="2000-01-01T00:00:00Z">old</time></span>',duration+actions)}</div></div>`)
  try {
    await browser.evaluate(`waitFor(()=>header('pair'))`)
    assert.deepEqual(await browser.evaluate(`(()=>{const h=header('pair'),s=getComputedStyle(h),chevron=h.querySelector('[data-codex-turn-chevron]');return {font:s.fontSize,chevron:getComputedStyle(chevron).width,chevronAfter:chevron.getBoundingClientRect().left>=h.querySelector('span').getBoundingClientRect().right,paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,label:h.textContent.trim()}})()`),{font:'14px',chevron:'14px',chevronAfter:true,paddingTop:'4px',paddingBottom:'8px',label:'Worked for 6m 9s'})
    await browser.evaluate(`el('final').querySelector('[data-slot="aui_turn-duration"]').textContent='⏱ 7m 1s';waitFor(()=>header('pair').textContent.trim()==='Worked for 7m 1s')`)
    const scans=await browser.evaluate(`(async()=>{let count=0;const original=document.querySelectorAll;document.querySelectorAll=function(selector){if(selector==='[data-slot="aui_turn-pair"]')count++;return original.call(this,selector)};for(let i=0;i<100;i++)el('stream-text').textContent='Chunk '+i;await new Promise(r=>setTimeout(r,150));document.querySelectorAll=original;return count})()`)
    assert.equal(scans,0)
  } finally {browser.close()}
})

test('actual Hermes DisclosureRow owns nested state and remains mounted across outer pointer and Space-key toggles',async()=>{
  const core=referenceRoot()
  const require=createRequire(`${core}/package.json`)
  const {outputFiles}=await require('esbuild').build({
    stdin:{resolveDir:core,contents:`
      import React,{useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {DisclosureRow} from './apps/desktop/src/components/chat/disclosure-row';
      function NativeFixture(){const[open,setOpen]=useState(false);return React.createElement(React.Fragment,null,
        React.createElement(DisclosureRow,{open,onToggle:()=>{window.nativeToggles++;setOpen(value=>!value)}},'Native tool call'),
        open?React.createElement('pre',{id:'real-native-output'},'Exact native result'):null)}
      window.mountNativeDisclosure=()=>{window.nativeToggles=0;window.nativeRoot=createRoot(document.getElementById('native-host'));nativeRoot.render(React.createElement(NativeFixture))};
    `},bundle:true,format:'iife',write:false,jsx:'automatic',
    tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},
    define:{'process.env.NODE_ENV':'"production"'}
  })
  const browser=await fixture(`<div data-slot="aui_turn-pair" id="pair">${message('work','<div data-slot="tool-block" id="native-host"></div>')}${message('final','<div class="aui-md">Final answer</div>',actions)}</div>`)
  try {
    await browser.evaluate(outputFiles[0].text)
    await browser.evaluate(`mountNativeDisclosure();waitFor(()=>header('pair')&&el('native-host').querySelector('button'))`)
    await click(browser,'[data-codex-turn-activity]')
    assert.equal(await browser.evaluate(`el('native-host').querySelector('button').getAttribute('aria-expanded')`),'false')
    await click(browser,'#native-host button')
    await browser.evaluate(`waitFor(()=>el('real-native-output'));window.realButton=el('native-host').querySelector('button');window.realOutput=el('real-native-output');window.realParent=el('native-host').parentNode`)
    await browser.evaluate(`header('pair').focus()`)
    await browser.call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',text:' ',windowsVirtualKeyCode:32})
    await browser.call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32})
    assert.equal(await browser.evaluate(`visible('native-host')`),false)
    await click(browser,'[data-codex-turn-activity]')
    assert.equal(await browser.evaluate(`el('native-host').querySelector('button')===realButton&&el('real-native-output')===realOutput&&el('native-host').parentNode===realParent&&nativeToggles===1&&realButton.getAttribute('aria-expanded')==='true'`),true)
    await browser.evaluate(`stop();new Promise(r=>setTimeout(r,450))`)
    assert.equal(await browser.evaluate(`visible('native-host')&&el('real-native-output')===realOutput`),true)
  } finally {browser.close()}
})

test('preview attachment chrome never replaces the final textual answer or folds an earlier attachment',async()=>{
  // AssistantPreviewEmbeds adds an unmarked wrapper after markdown; the
  // nested native PreviewAttachment uses ordinary controls, not an image.
  const preview=id=>`<div id="${id}" class="mt-3 flex flex-wrap gap-2"><div class="flex w-full max-w-160 items-center gap-2 rounded-lg border"><span title="https://example.com">example.com</span><button type="button">Download</button><button type="button">Open preview</button></div></div>`
  const browser=await fixture(`<div data-slot="aui_turn-pair" id="pair">${message('preview-work','<div class="aui-md" id="preview-comment">Checking</div>'+tool+preview('earlier-preview'))}${message('preview-final','<div class="aui-md" id="preview-answer">Final answer with link</div>'+preview('final-preview'),actions)}</div><div data-slot="aui_turn-pair" id="only-answer">${message('no-tool-final','<div class="aui-md" id="no-tool-answer">Answer</div>'+preview('only-preview'),actions)}</div>`)
  try {
    await browser.evaluate(`waitFor(()=>header('pair')&&!visible('preview-comment'))`)
    assert.deepEqual(await browser.evaluate(`Object.fromEntries(['preview-comment','tool','preview-answer','earlier-preview','final-preview','no-tool-answer','only-preview'].map(id=>[id,visible(id)]))`),{'preview-comment':false,tool:false,'preview-answer':true,'earlier-preview':true,'final-preview':true,'no-tool-answer':true,'only-preview':true})
    assert.equal(await browser.evaluate(`Boolean(header('only-answer'))`),false)
    await browser.evaluate(`window.savedPreview=el('final-preview');window.previewClicks=0;savedPreview.querySelector('button').onclick=()=>window.previewClicks++`)
    await click(browser,'#final-preview button')
    assert.equal(await browser.evaluate(`previewClicks`),1)
    await click(browser,'#pair > [data-codex-turn-activity]')
    assert.equal(await browser.evaluate(`visible('preview-comment')&&visible('preview-answer')&&el('final-preview')===savedPreview`),true)
  } finally {browser.close()}
})

test('interrupted responses stay open with their partial answer and never claim successful completion',async()=>{
  const browser=await fixture(`<div data-slot="aui_turn-pair" id="stopped">${message('stopped-work','<div class="aui-md">Checking</div>'+tool)}${message('stopped-final','<div class="aui-md" id="partial-answer">Partial answer</div><div data-slot="aui_assistant-message-stopped" id="stop-notice">Response stopped</div>',duration+actions)}</div><div data-slot="aui_turn-pair" id="late-stop">${message('late-stop-work','<div data-slot="tool-block" id="late-stop-tool">Read</div>')}${message('late-stop-final','<div class="aui-md" id="late-stop-answer">Answer</div>',actions)}</div>`)
  try {
    await browser.evaluate(`waitFor(()=>header('late-stop'))`)
    assert.deepEqual(await browser.evaluate(`({work:visible('stopped-work'),answer:visible('partial-answer'),notice:visible('stop-notice'),header:Boolean(header('stopped'))})`),{work:true,answer:true,notice:true,header:false})
    await browser.evaluate(`el('late-stop-final').querySelector('[data-slot="aui_assistant-message-content"]').insertAdjacentHTML('beforeend','<div data-slot="aui_assistant-message-stopped" id="late-stop-notice">Response stopped</div>');waitFor(()=>!header('late-stop'))`)
    assert.equal(await browser.evaluate(`visible('late-stop-tool')&&visible('late-stop-answer')&&visible('late-stop-notice')`),true)
    await browser.evaluate(`stop();new Promise(r=>setTimeout(r,450))`)
    assert.equal(await browser.evaluate(`visible('partial-answer')&&visible('stop-notice')&&!el('stopped').hasAttribute('data-codex-activity-phase')`),true)
  } finally {browser.close()}
})

test('native singular and plural subagent completion notices remain inside Worked, with native disclosure identity intact',async()=>{
  const browser=await fixture(`<div data-slot="aui_turn-pair" id="pair"><div data-slot="aui_response-group">${message('work',tool)}${message('final','<div class="aui-md" id="answer">Answer</div>',actions)}<div data-role="system" data-slot="aui_system-message-root">${notice('singular','Subagent Task Completed: inspect')}${notice('plural')}</div></div></div>`)
  try {
    await browser.evaluate(`(async()=>{await waitFor(()=>header('pair'));window.noticeButton=el('singular').querySelector('button');window.noticeClicks=0;noticeButton.onclick=()=>noticeClicks++})()`)
    assert.deepEqual(await browser.evaluate(`({single:visible('singular'),plural:visible('plural'),answer:visible('answer')})`),{single:false,plural:false,answer:true})
    await click(browser,'[data-codex-turn-activity]')
    assert.equal(await browser.evaluate(`visible('singular')&&visible('plural')&&el('singular').querySelector('button')===noticeButton`),true)
    await click(browser,'#singular button')
    assert.equal(await browser.evaluate(`noticeClicks`),1)
    await browser.evaluate(`(async()=>{el('final').dataset.streaming='true';await waitFor(()=>header('pair').textContent==='Working');el('singular').querySelector('.truncate').textContent='Subagent Task Completed: updated';el('final').removeAttribute('data-streaming');await waitFor(()=>!visible('singular'))})()`)
    await browser.evaluate(`stop();new Promise(r=>setTimeout(r,450))`)
    assert.equal(await browser.evaluate(`visible('singular')&&visible('plural')&&el('singular').querySelector('button')===noticeButton`),true)
  } finally {browser.close()}
})

test('recorded prompt-to-final timestamps recover Worked duration after hydration with timestamps disabled, without tool-time sums',async()=>{
  const history={messages:[
    {role:'user',timestamp:1700000000,text:'Question'},
    {role:'assistant',timestamp:1700000002,text:'Checking'},
    {role:'tool',timestamp:1700000004,text:'Took 999s'},
    {role:'assistant',timestamp:1700000369,text:'Final answer'},
    {role:'user',timestamp:1700000400,display_kind:'async_delegation_complete',text:'Subagent Task Completed: inspect'}
  ]}
  const browser=await fixture(`<section data-session-anchor="workspace"><div data-slot="aui_thread-content"><div data-slot="aui_turn-pair" id="pair"><div data-role="user" data-message-id="1700000000-0-user">Question</div>${message('work',tool)}${message('final','<div class="aui-md" id="answer">Final answer</div>',actions)}</div></div></section>`,{history,route:'#/stored-test'})
  try {
    await browser.evaluate(`waitFor(()=>header('pair')?.querySelector('span')?.textContent==='Worked for 6m 9s')`)
    assert.equal(await browser.evaluate(`visible('answer')&&!visible('tool')`),true)
    assert.equal(await browser.evaluate(`historyCalls.length`),1)
    assert.deepEqual(await browser.evaluate(`historyCalls[0]`),{method:'session.history',params:{session_id:'test'}})
    await browser.evaluate(`el('final').insertAdjacentHTML('beforeend','<span data-slot="aui_turn-duration">⏱ 7m 1s</span>');waitFor(()=>header('pair').querySelector('span').textContent==='Worked for 7m 1s')`)
    await browser.evaluate(`window.dispatchEvent(new Event('resize'));new Promise(r=>setTimeout(r,200))`)
    assert.equal(await browser.evaluate(`historyCalls.length`),1)
  } finally {browser.close()}
})

test('duration history is owner scoped and rejects duplicate, missing, reversed and unrelated timestamps',async()=>{
  const {turnDurationHistoryRecords}=await loadPluginInternals(['turnDurationHistoryRecords'])
  const rows=[{role:'user',timestamp:1700000000},{role:'assistant',timestamp:1700000005,text:'Final'}]
  assert.equal(turnDurationHistoryRecords(rows).get('1700000000'),5)
  for (const invalid of [
    [{role:'user',timestamp:1700000000},{role:'assistant',timestamp:1699999990,text:'Older'}],
    [{role:'user',timestamp:1700000000},{role:'tool',timestamp:1700000005}],
    [{role:'user',timestamp:1700000000},{role:'user'},{role:'assistant',timestamp:1700000005,text:'Another turn'}],
    [...rows,...rows]
  ]) assert.equal(turnDurationHistoryRecords(invalid).has('1700000000'),false)
  const history={messages:rows}
  const browser=await fixture(`<section data-session-anchor="tile-other"><div data-slot="aui_turn-pair" id="other"><div data-role="user" data-message-id="1700000000-0-user">Question</div>${message('other-work',tool)}${message('other-final','<div class="aui-md">Final</div>',actions)}</div></section>`,{history,route:'#/stored-test'})
  try {
    await browser.evaluate(`waitFor(()=>header('other'))`)
    await browser.evaluate(`new Promise(r=>setTimeout(r,150))`)
    assert.equal(await browser.evaluate(`header('other').textContent`),'Worked')
    assert.equal(await browser.evaluate(`historyCalls.length`),0)
  } finally {browser.close()}
})

test('late duration RPC cannot relabel a stale route/profile owner and teardown ignores outstanding history',async()=>{
  const html=`<section data-session-anchor="workspace"><div data-slot="aui_turn-pair" id="pair"><div data-role="user" data-message-id="1700000000-0-user">Question</div>${message('work',tool)}${message('final','<div class="aui-md" id="answer">Answer</div>',actions)}</div></section>`
  const history={messages:[{role:'user',timestamp:1700000000},{role:'assistant',timestamp:1700000369,text:'Final'}]}
  for(const boundary of ['route','profile','stop']) {
    const browser=await fixture(html,{history,route:'#/stored-test',deferHistory:true})
    try {
      await browser.evaluate(`waitFor(()=>header('pair')&&window.resolveHistory)`)
      assert.equal(await browser.evaluate(`header('pair').textContent`),'Worked')
      await browser.evaluate(`window.savedResolve=window.resolveHistory;${boundary==='route'?"window.location.hash='#/other-session'":boundary==='profile'?"fixtureState.profile.set('other-profile')":"stop()"};savedResolve();new Promise(r=>setTimeout(r,450))`)
      assert.equal(await browser.evaluate(`header('pair')?.textContent??null`),null)
      assert.equal(await browser.evaluate(`visible('answer')`),true)
      assert.equal(await browser.evaluate(`historyCalls.length`),1)
      console.log('LATE_DURATION_BOUNDARY_EXECUTED '+boundary)
    } finally {browser.close()}
  }
})

for (const boundary of ['route','profile']) test(`late owner A history cannot overwrite positive owner B duration after ${boundary} transfer with colliding user timestamp`,async()=>{
  const html=`<div data-slot="aui_turn-pair" id="pair"><div data-role="user" data-message-id="1700000000-0-user">Question A</div>${message('work',tool)}${message('final','<div class="aui-md" id="answer">Answer A</div>',actions)}</div>`
  const history={messages:[{role:'user',timestamp:1700000000},{role:'assistant',timestamp:1700000369,text:'Answer A'}]}
  const nextHistory={messages:[{role:'user',timestamp:1700000000},{role:'assistant',timestamp:1700000083,text:'Answer B'}]}
  const nextPair=`<div data-slot="aui_turn-pair" id="pair-b"><div data-role="user" data-message-id="1700000000-1-user">Question B</div>${message('b-work','<div data-slot="tool-block"><details id="b-native"><summary>Ran command B</summary><pre>Native output B</pre></details></div>')}${message('b-final','<div class="aui-md" id="answer-b">Answer B</div>',actions)}</div>`
  const browser=await fixture(html,{history,route:'#/stored-test',deferHistory:true,owner:true})
  try {
    await browser.evaluate(`waitFor(()=>header('pair')&&window.resolveHistory)`)
    assert.equal(await browser.evaluate(`header('pair').textContent`),'Worked')
    await browser.evaluate(`window.resolveA=resolveHistory;window.savedA=el('pair');window.savedUserA=savedA.querySelector('[data-role="user"]');window.historyResult=${JSON.stringify(nextHistory)};delete window.resolveHistory;${boundary==='route'?"fixtureState.activeSessionId.set('runtime-b');fixtureState.focusedSessionId.set('runtime-b');fixtureState.focusedStoredSessionId.set('stored-b');window.location.hash='#/stored-b'":"fixtureState.profile.set('profile-b');fixtureState.focusedSessionOwner.set({connectionId:'local',profile:'profile-b'})"};savedA.insertAdjacentHTML('afterend',${JSON.stringify(nextPair)});window.savedB=el('pair-b');window.savedUserB=savedB.querySelector('[data-role="user"]');window.savedAnswerB=el('answer-b');window.savedNativeB=el('b-native');waitFor(()=>header('pair-b')&&window.resolveHistory)`)
    assert.equal(await browser.evaluate(`savedA!==savedB&&savedUserA!==savedUserB&&savedUserA.dataset.messageId.split('-')[0]===savedUserB.dataset.messageId.split('-')[0]&&savedUserA.dataset.messageId!==savedUserB.dataset.messageId`),true)
    await browser.evaluate(`resolveHistory();waitFor(()=>header('pair-b')?.textContent==='Worked for 1m 23s')`)
    assert.equal(await browser.evaluate(`header('pair')?.textContent??null`),null)
    await browser.evaluate(`resolveA();new Promise(r=>setTimeout(r,450))`)
    assert.equal(await browser.evaluate(`header('pair-b').textContent`),'Worked for 1m 23s')
    assert.equal(await browser.evaluate(`header('pair')?.textContent??null`),null)
    assert.equal(await browser.evaluate(`savedA===el('pair')&&savedB===el('pair-b')&&savedUserB===savedB.querySelector('[data-role="user"]')&&savedAnswerB===el('answer-b')&&visible('answer-b')&&savedAnswerB.textContent==='Answer B'&&savedNativeB===el('b-native')&&visible('answer')`),true)
    assert.deepEqual(await browser.evaluate(`historyCalls`),[{method:'session.history',params:{session_id:'test'}},{method:'session.history',params:{session_id:boundary==='route'?'runtime-b':'test'}}])
    assert.deepEqual(await browser.evaluate(`historyRequestOwners`),[{runtime:'test',profile:'default',connection:'local'},{runtime:boundary==='route'?'runtime-b':'test',profile:boundary==='profile'?'profile-b':'default',connection:'local'}])
  } finally {browser.close()}
})

test('native failed and warning tool titles keep the whole failed run open without a successful completion header',async()=>{
  for (const errorClass of ['text-destructive','text-amber-700','dark:text-amber-300']) {
    const browser=await fixture(`<div data-slot="aui_turn-pair" id="failed">${message('failed-work','<div class="aui-md">Checking</div><div data-slot="tool-block" id="failed-tool"><button aria-expanded="false"><span class="'+errorClass+'">Command failed</span></button></div>')}${message('failed-final','<div class="aui-md">Failure report</div>',duration+actions)}</div>`)
    try {
      await browser.evaluate(`new Promise(r=>setTimeout(r,200))`)
      assert.deepEqual(await browser.evaluate(`({work:visible('failed-work'),tool:visible('failed-tool'),final:visible('failed-final'),header:Boolean(header('failed'))})`),{work:true,tool:true,final:true,header:false})
    } finally {browser.close()}
  }
  const browser=await fixture(`<div data-slot="aui_turn-pair" id="late-failure">${message('late-work','<div class="aui-md">Checking</div><div data-slot="tool-block"><button><span id="tool-title">Command</span></button></div>')}${message('late-final','<div class="aui-md">Answer</div>',actions)}</div>`)
  try {
    await browser.evaluate(`waitFor(()=>header('late-failure'));el('tool-title').className='text-amber-700';waitFor(()=>!header('late-failure'))`)
    assert.equal(await browser.evaluate(`visible('late-work')&&visible('tool-title')`),true)
  } finally {browser.close()}
})

const hourBoundaries=[3599,3600,3601,3661,7200,4325]
const hourLabels=['59m 59s','1h 0m','1h 0m','1h 1m','2h 0m','1h 12m']
async function certifiedNativeElapsed(){
 const core=referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
 const ts=createRequire(core+'/package.json')('typescript')
 const text=await readFile(core+'/apps/desktop/src/components/chat/activity-timer.ts','utf8')
 const ast=ts.createSourceFile('activity-timer.ts',text,ts.ScriptTarget.Latest,true)
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='formatElapsed')
 assert.ok(fn,'use the actual native formatElapsed declaration')
 return new Function(ts.transpile(fn.getText(ast).replace(/^export /,''))+';return formatElapsed')()
}
function hourPair(id,index,native=''){
 const user=1700000000+index*10000
 return `<div data-slot="aui_turn-pair" id="${id}"><div data-role="user" data-message-id="${user}-0-user">Question</div>${message(id+'-final',`<div data-slot="tool-block"><span data-slot="timeline-timestamp" id="${id}-tool-clock">999s</span></div><div class="aui-md">Final answer</div>`,(native?`<span data-slot="aui_turn-duration" id="${id}-native">⏱ ${native}</span>`:'')+actions)}</div>`
}

test('Worked hour boundaries: historical helper preserves sub-hour formatting and omits seconds from one hour',async()=>{
 const {formatTurnActivityDuration:f}=await loadPluginInternals(['formatTurnActivityDuration'])
 assert.deepEqual([0,59,60].map(f),['0s','59s','1m 0s'])
 assert.deepEqual(hourBoundaries.map(f),hourLabels)
})

test('Worked hour boundaries: actual native formatElapsed header wins history, preserves native text and tool clocks',async()=>{
 const elapsed=await certifiedNativeElapsed()
 const raw=hourBoundaries.map(elapsed)
 const history={messages:hourBoundaries.flatMap((_,i)=>[{role:'user',timestamp:1700000000+i*10000},{role:'assistant',timestamp:1700000001+i*10000,text:'Final answer'}])}
 const browser=await fixture(raw.map((s,i)=>hourPair('native-hour-'+i,i,s)).join(''),{history})
 try {
  const state=await browser.evaluate(`(async()=>{let result;await waitFor(()=>{const rows=(${JSON.stringify(raw)}).map((s,i)=>{const id='native-hour-'+i,h=header(id);return h?{label:h.querySelector('span').textContent,aria:h.getAttribute('aria-label'),native:el(id+'-native').textContent,tool:el(id+'-tool-clock').textContent}:null});if(rows.some((r,i)=>!r||r.label!==${JSON.stringify(hourLabels.map((s,i)=>'Worked for '+(i===0?raw[i]:s)))}[i]))return false;result=rows;return true});return result})()`)
  const expected=hourLabels.map((s,i)=>({label:'Worked for '+(i===0?raw[i]:s),aria:'Worked for '+(i===0?raw[i]:s),native:'⏱ '+raw[i],tool:'999s'}))
  console.log('WORKED_NATIVE_HOUR_BOUNDARIES '+JSON.stringify(state));assert.deepEqual(state,expected)
  assert.equal(await browser.evaluate(`historyCalls.length`),1)
  await browser.evaluate(`el('native-hour-1-native').remove();waitFor(()=>header('native-hour-1')?.querySelector('span')?.textContent==='Worked for 1s')`)
 } finally {browser.close()}
})

test('Worked hour boundaries: RPC prompt-to-final headers use the same hour formatter',async()=>{
 const history={messages:hourBoundaries.flatMap((s,i)=>[{role:'user',timestamp:1700000000+i*10000},{role:'assistant',timestamp:1700000000+i*10000+s,text:'Final answer'}])}
 const browser=await fixture(hourBoundaries.map((_,i)=>hourPair('history-hour-'+i,i)).join(''),{history})
 try {
  const state=await browser.evaluate(`(async()=>{let result;await waitFor(()=>{const rows=(${JSON.stringify(hourBoundaries)}).map((_,i)=>{const id='history-hour-'+i,h=header(id);return h?{label:h.querySelector('span').textContent,aria:h.getAttribute('aria-label'),tool:el(id+'-tool-clock').textContent}:null});if(rows.some((r,i)=>!r||r.label!==${JSON.stringify(hourLabels.map(s=>'Worked for '+s))}[i]))return false;result=rows;return true});return result})()`)
  console.log('WORKED_HISTORY_HOUR_BOUNDARIES '+JSON.stringify(state))
  assert.deepEqual(state,hourLabels.map(s=>({label:'Worked for '+s,aria:'Worked for '+s,tool:'999s'})))
  assert.equal(await browser.evaluate(`historyCalls.length`),1)
 } finally {browser.close()}
})

test('Worked native duration preserves unknown formats rather than guessing',async()=>{
 const raw=['72m 5s','060:00','60:60','3600s','1h 0m','1:2','1:02 extra','-60:00','60:0.5','0:00']
 const browser=await fixture(raw.map((s,i)=>hourPair('unknown-hour-'+i,i,s)).join(''),{history:{messages:[]}})
 try {
  await browser.evaluate(`waitFor(()=>${raw.map((_,i)=>`header('unknown-hour-${i}')`).join('&&')})`)
  assert.deepEqual(await browser.evaluate(`(${JSON.stringify(raw)}).map((_,i)=>header('unknown-hour-'+i).querySelector('span').textContent)`),raw.map(s=>'Worked for '+s))
 } finally {browser.close()}
})
