import { referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {loadPluginInternals} from './helpers/load-plugin.mjs'

const core=referenceRoot()
const require=createRequire(`${core}/package.json`)
const pluginUrl=process.env.CODEX_ACTIVITY_TEST_PLUGIN
  ? new URL(process.env.CODEX_ACTIVITY_TEST_PLUGIN,`file://${process.cwd()}/`)
  : new URL('../codex-chat-look/plugin.js',import.meta.url)
const source=(await readFile(pluginUrl,'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.testPlugin = {')
// Execute the exact native BackgroundResult with real ScaffoldRow/DisclosureRow.
// Extract only that export to avoid importing the unrelated SystemMessage graph.
// Timestamp/log/markdown leaves need providers; they do not determine boundaries.
const nativeSystem=await readFile(`${core}/apps/desktop/src/components/assistant-ui/thread/system-message.tsx`,'utf8')
const nativeBackground=nativeSystem.slice(nativeSystem.indexOf('export const BackgroundResult:'),nativeSystem.indexOf('\nexport const SystemMessage:'))
assert.ok(nativeBackground.includes('data-slot="aui_background-result"'))
const {outputFiles}=await require('esbuild').build({
  stdin:{resolveDir:core,loader:'tsx',sourcefile:'background-result-native-fixture.tsx',contents:`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS} from './apps/desktop/src/components/chat/scaffold-row';
    import {cn} from './apps/desktop/src/lib/utils';
    const MessageTimelineTimestamp=()=>null, ToolIcon=()=>null;
    const MarkdownTextContent=({text})=>text,LogView=({children})=>children;
    ${nativeBackground}
    window.mountBackground=id=>{const root=createRoot(document.getElementById(id));root.render(React.createElement(BackgroundResult,{text:'Subagent Task Completed: inspect',report:'Exact child report'}));return root};
  `},bundle:true,format:'iife',write:false,jsx:'automatic',
  tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},
  plugins:[{name:'message-provider-leaves',setup(build){
    build.onResolve({filter:/^(?:@\/components\/assistant-ui\/(?:markdown-text|thread\/timeline-timestamp)|\.\/timeline-timestamp)$/},args=>({path:args.path,namespace:'provider-leaf'}))
    build.onLoad({filter:/.*/,namespace:'provider-leaf'},()=>({contents:'export const MessageTimelineTimestamp=()=>null;export const MarkdownTextContent=({text})=>text;',loader:'js'}))
  }}],define:{'process.env.NODE_ENV':'"production"'}
})
const actions='<div data-slot="aui_msg-actions"><button id="copy">Copy</button></div>'
const md=(id,text=id)=>`<div class="aui-md" id="${id}">${text}</div>`
const tool=id=>`<div data-slot="tool-block" id="${id}"><button>Native tool</button></div>`
const interimIds=['work-1','work-2','work-3','work-4','combined']
const fixtureHistory={messages:interimIds.map((id,index)=>({role:'assistant',timestamp:1701000000+index,text:id,tool_calls:[{id:'call-'+id,type:'function',function:{name:'terminal',arguments:'{}'}}]}))}
const message=(id,body,footer='',attrs='')=>`<div id="${id}" data-role="assistant" data-message-id="${interimIds.includes(id) ? `${1701000000+interimIds.indexOf(id)}-0-assistant` : id}" data-slot="aui_assistant-message-root" ${attrs}><div data-slot="aui_assistant-message-content">${body}</div>${footer}<span hidden data-slot="aui_message-streaming-marker"></span></div>`
const asyncHost=id=>`<div data-role="system" data-slot="aui_system-message-root" id="${id}"></div>`
const pair=(id,body)=>`<div data-slot="aui_turn-pair" id="${id}"><div data-role="user" data-message-id="user-${id}">Question</div><div data-slot="aui_response-group" id="group-${id}">${body}</div></div>`
const initial=message('work-1',md('progress-1')+tool('tool-1'))+message('final-1',md('answer-1'),actions)
const followup=message('work-2',md('progress-2')+tool('tool-2'))+message('final-2',md('answer-2'),actions)

async function fixture(html,notices=[],options={}) {
  const browser=await chromium()
  const {frameTree}=await browser.call('Page.getFrameTree')
  await browser.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html data-codex-chat-look="true"><head></head><body><section data-session-anchor="workspace">${html}</section></body></html>`})
  await browser.evaluate(`(()=>{const atom=v=>({get:()=>v,subscribe:()=>()=>{}});window.historyCalls=[];window.historyResult=${JSON.stringify(options.history??fixtureHistory)};window.location.hash='#/stored-test';const host={state:{activeSessionId:atom('test'),profile:atom('default'),gateway:atom('open')},onEvent:()=>()=>{},request:async(method,params)=>{historyCalls.push({method,params});if(${Boolean(options.deferHistory)})await new Promise(resolve=>window.resolveHistory=resolve);if(${Boolean(options.historyError)})throw Error('History unavailable');return historyResult}};const PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},jsx=()=>null,useEffect=()=>{};${source}
    const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
    window.start=()=>installBehaviorRuntime();window.stop=start();window.el=id=>document.getElementById(id);window.visible=id=>Boolean(el(id)?.getClientRects().length);
    window.header=id=>el(id).querySelector('[data-codex-turn-activity]');window.waitFor=async predicate=>{const end=performance.now()+3000;while(!predicate()){if(performance.now()>end)throw Error('Final retention timed out');await new Promise(r=>setTimeout(r,20))}};
  })()`)
  await browser.evaluate(outputFiles[0].text)
  for(const id of notices) await browser.evaluate(`mountBackground(${JSON.stringify(id)});waitFor(()=>el(${JSON.stringify(id)}).querySelector('[data-slot="aui_background-result"]'))`)
  return browser
}
const settled=browser=>browser.evaluate(`waitFor(()=>header('pair')?.textContent==='Worked'&&header('pair').getAttribute('aria-expanded')==='false'&&(!el('progress-1')||!visible('progress-1')))`)
const retained=browser=>browser.evaluate(`({first:visible('answer-1'),second:visible('answer-2'),work1:visible('tool-1'),work2:visible('tool-2'),progress1:visible('progress-1'),progress2:visible('progress-2')})`)
const expected={first:false,second:true,work1:false,work2:false,progress1:false,progress2:false}
// Latest-only is presentation, not deletion or native duplicate detection.
async function reopenReplies(browser,ids) {
  await browser.evaluate(`window.replyNodes=${JSON.stringify(ids)}.map(id=>[el(id),el(id).parentNode,el(id).textContent]);header('pair').click()`)
  assert.equal(await browser.evaluate(`replyNodes.every(([node,parent,text])=>node.isConnected&&node.parentNode===parent&&node.textContent===text&&visible(node.id))`),true)
  await browser.evaluate(`header('pair').click()`)
}

test('history evidence uses exact unique source timestamps, not rendered text or projection-dependent indexes',async()=>{
  const {turnHistoryProseKinds}=await loadPluginInternals(['turnHistoryProseKinds'])
  assert.deepEqual([...turnHistoryProseKinds([{role:'assistant',timestamp:2,tool_calls:[{}]},{role:'assistant',timestamp:3,text:'Same words'},{role:'assistant',timestamp:4,text:'Same words'}])].map(([key,value])=>[key,value]),[['2','interim'],['3','answer'],['4','answer']])
  for(const rows of [
    [{role:'assistant',timestamp:2,tool_calls:[{}]},{role:'assistant',timestamp:2}],
    [{role:'assistant',timestamp:2,tool_calls:[{}]},{role:'user',timestamp:2}],
    [{role:'assistant',timestamp:'2',tool_calls:[{}]}],
    [{role:'assistant',timestamp:0,tool_calls:[{}]}],
    [{role:'assistant',timestamp:NaN,tool_calls:[{}]}]
  ]) assert.equal(turnHistoryProseKinds(rows).has('2'),false)
})

test('async wake folds earlier replies reversibly after the native responseTail footer moves',async()=>{
  const browser=await fixture(pair('pair',initial))
  try {
    await settled(browser)
    await browser.evaluate(`window.firstAnswer=el('answer-1');window.firstRoot=el('final-1');el('group-pair').insertAdjacentHTML('beforeend',${JSON.stringify(asyncHost('async-1')+followup)});el('final-1').querySelector('[data-slot="aui_msg-actions"]').remove();el('final-2').querySelector('[data-slot="aui_message-streaming-marker"]').dataset.messageStreaming='true';mountBackground('async-1');waitFor(()=>header('pair')?.textContent==='Working')`)
    assert.equal(await browser.evaluate(`!visible('answer-1')&&visible('answer-2')`),true)
    await browser.evaluate(`el('final-2').querySelector('[data-slot="aui_message-streaming-marker"]').removeAttribute('data-message-streaming');waitFor(()=>header('pair')?.textContent==='Worked')`)
    assert.deepEqual(await retained(browser),expected)
    await reopenReplies(browser,['answer-1','answer-2'])
    assert.equal(await browser.evaluate(`el('answer-1')===firstAnswer&&el('final-1')===firstRoot`),true)
    await browser.evaluate(`header('pair').click();waitFor(()=>visible('tool-1'));window.noticeButton=el('async-1').querySelector('button');noticeButton.click();waitFor(()=>el('async-1').textContent.includes('Exact child report'));header('pair').click();header('pair').click()`)
    assert.equal(await browser.evaluate(`el('async-1').querySelector('button')===noticeButton&&noticeButton.getAttribute('aria-expanded')==='true'&&visible('answer-1')`),true)
  } finally {browser.close()}
})

test('reopened async history mounts every earlier final under Worked without its original action bar',async()=>{
  const browser=await fixture(pair('pair',initial.replace(actions,'')+asyncHost('async-1')+followup),['async-1'])
  try {
    await settled(browser)
    assert.deepEqual(await retained(browser),expected)
    await reopenReplies(browser,['answer-1','answer-2'])
    await browser.evaluate(`stop();window.stop=start();new Promise(r=>setTimeout(r,450))`)
    assert.deepEqual(await retained(browser),expected)
    await reopenReplies(browser,['answer-1','answer-2'])
    for(let n=3;n<=4;n++) {
      await browser.evaluate(`el('group-pair').insertAdjacentHTML('beforeend',${JSON.stringify(asyncHost('async-'+n)+message('work-'+n,md('progress-'+n)+tool('tool-'+n))+message('final-'+n,md('answer-'+n),actions))});el('final-${n-1}').querySelector('[data-slot="aui_msg-actions"]')?.remove();mountBackground('async-${n}');waitFor(()=>!visible('tool-${n}')&&!visible('answer-${n-1}'))`)
      assert.equal(await browser.evaluate(`Array.from({length:${n}},(_,i)=>visible('answer-'+(i+1))===(i+1===${n})).every(Boolean)`),true)
      await reopenReplies(browser,Array.from({length:n},(_,i)=>'answer-'+(i+1)))
    }
  } finally {browser.close()}
})

test('plain earlier replies and post-activity paragraphs fold without reclassifying them as commentary',async()=>{
  const body=message('combined',md('progress')+tool('tool')+md('old-final')+md('new-final'),actions)+message('plain-older',md('plain-final'))+message('last',md('last-answer'),actions)
  const browser=await fixture(pair('pair',body))
  try {
    await settled(browser)
    await browser.evaluate(`waitFor(()=>!visible('progress'))`) // Wait for verified asynchronous history before asserting fold.
    assert.deepEqual(await browser.evaluate(`Object.fromEntries(['progress','tool','old-final','new-final','plain-final','last-answer'].map(id=>[id,visible(id)]))`),{progress:false,tool:false,'old-final':false,'new-final':false,'plain-final':false,'last-answer':true})
    await reopenReplies(browser,['old-final','new-final','plain-final','last-answer'])
  } finally {browser.close()}
})

test('no-notice resume and independent response groups keep prior paragraphs under Worked',async()=>{
  const browser=await fixture(pair('pair',message('combined',md('progress')+tool('tool')+md('old-final'),actions)))
  try {
    await settled(browser)
    await browser.evaluate(`el('combined').querySelector('[data-slot="aui_assistant-message-content"]').insertAdjacentHTML('beforeend',${JSON.stringify(tool('new-tool')+md('new-final'))});waitFor(()=>!visible('new-tool')&&!visible('old-final'))`)
    assert.equal(await browser.evaluate(`!visible('old-final')&&visible('new-final')&&!visible('progress')`),true)
    await reopenReplies(browser,['old-final','new-final'])
    await browser.evaluate(`el('pair').insertAdjacentHTML('beforeend','<div data-slot="aui_response-group">'+${JSON.stringify(message('group-tail',md('group-answer'),actions))}+'</div>');waitFor(()=>visible('group-answer'))`)
    await browser.evaluate(`waitFor(()=>!visible('new-final'))`)
    assert.equal(await browser.evaluate(`!visible('old-final')&&!visible('new-final')&&visible('group-answer')`),true)
    await reopenReplies(browser,['old-final','new-final','group-answer'])
  } finally {browser.close()}
})

test('unknown, promoted-interim and ambiguous identities keep pre-tool prose mounted under Worked',async()=>{
  const historical=message('combined',md('first-final')+tool('tool')+md('second-final'),actions)
  const cases=[
    {history:{messages:[]}},
    {history:{messages:[{role:'assistant',timestamp:1701000004,text:'First independent final'}]}},
    {history:{messages:[{role:'assistant',timestamp:1701000004,tool_calls:[{}]},{role:'assistant',timestamp:1701000004,text:'Duplicate timestamp'}]}},
    {history:{messages:[{role:'assistant',timestamp:1701000004,tool_calls:[{}]},{role:'system',timestamp:1701000004,text:'Colliding timestamp'}]}},
    {historyError:true}
  ]
  for(const options of cases) {
    const browser=await fixture(pair('pair',historical),[],options)
    try {
      await settled(browser)
      await browser.evaluate(`new Promise(r=>setTimeout(r,100))`)
      assert.equal(await browser.evaluate(`!visible('first-final')&&visible('second-final')&&!visible('tool')`),true)
      await reopenReplies(browser,['first-final','second-final'])
    } finally {browser.close()}
  }
  const promoted=historical.replace('1701000004-0-assistant','assistant-interim-123-1')
  const browser=await fixture(pair('pair',promoted))
  try {
    await settled(browser)
    assert.equal(await browser.evaluate(`!visible('first-final')&&visible('second-final')&&!visible('tool')`),true)
    await reopenReplies(browser,['first-final','second-final'])
  } finally {browser.close()}
})

test('cold grouped history preserves every paragraph of earlier replies under Worked',async()=>{
  // Native hydration can absorb later tool rows into an earlier no-tool reply.
  // Its numeric ID still names that earlier source row, not the newest run.
  const history={messages:[{role:'assistant',timestamp:1701000004,text:'First final'},{role:'assistant',timestamp:1701000005,text:'Following work',tool_calls:[{}]},{role:'assistant',timestamp:1701000006,text:'Second final'}]}
  const firstFullAnswer = 'First final, including every paragraph. '.repeat(90)
  const browser=await fixture(pair('pair',message('combined',md('first-final',firstFullAnswer)+md('first-final-conclusion','Independent first-final conclusion')+tool('tool')+md('second-final'),actions)),[],{history})
  try {
    await settled(browser)
    assert.equal(await browser.evaluate(`!visible('first-final')&&visible('second-final')&&!visible('tool')`),true)
    assert.equal(await browser.evaluate(`visible('first-final-conclusion')`),false)
    assert.equal(await browser.evaluate(`el('first-final').textContent`),firstFullAnswer)
    await reopenReplies(browser,['first-final','first-final-conclusion','second-final'])
    await browser.evaluate(`window.savedFirst=el('first-final');window.savedCopy=el('copy');window.copyCalls=0;savedCopy.onclick=()=>copyCalls++;savedCopy.click();stop();window.stop=start();new Promise(r=>setTimeout(r,450))`)
    assert.equal(await browser.evaluate(`el('first-final')===savedFirst&&el('copy')===savedCopy&&copyCalls===1&&!visible('first-final')`),true)
    await reopenReplies(browser,['first-final','first-final-conclusion','second-final'])
  } finally {browser.close()}
})

test('a pane or route cannot borrow another owner\'s interim history evidence',async()=>{
  const own=pair('pair',message('combined',md('own-progress')+tool('own-tool')+md('own-final'),actions))
  const foreign=`<section data-session-anchor="tile-foreign">${pair('foreign',message('combined-foreign',md('foreign-final')+tool('foreign-tool')+md('foreign-new-final'),actions).replace('data-message-id="combined-foreign"','data-message-id="1701000004-0-assistant"'))}</section>`
  const browser=await fixture(own+foreign)
  try {
    await browser.evaluate(`waitFor(()=>!visible('own-progress'))`)
    assert.equal(await browser.evaluate(`!visible('foreign-final')&&visible('foreign-new-final')&&!visible('foreign-tool')&&!el('foreign-final').hasAttribute('data-codex-activity-item')`),true)
    await browser.evaluate(`header('foreign').click()`)
    assert.equal(await browser.evaluate(`visible('foreign-final')&&visible('foreign-new-final')`),true)
  } finally {browser.close()}
  const stale=await fixture(own,[],{deferHistory:true})
  try {
    await stale.evaluate(`waitFor(()=>window.resolveHistory&&header('pair'))`)
    await stale.evaluate(`window.location.hash='#/other-route';window.resolveHistory();new Promise(r=>setTimeout(r,300))`)
    assert.equal(await stale.evaluate(`visible('own-progress')&&visible('own-final')`),true)
  } finally {stale.close()}
})
