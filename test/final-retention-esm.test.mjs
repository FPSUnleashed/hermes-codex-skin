import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'

const core=referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require=createRequire(core+'/package.json')
const pluginPath=process.env.CODEX_ACTIVITY_TEST_PLUGIN||fileURLToPath(new URL('../codex-chat-look/plugin.js',import.meta.url))
const system=await readFile(core+'/apps/desktop/src/components/assistant-ui/thread/system-message.tsx','utf8')
const background=system.slice(system.indexOf('export const BackgroundResult:'),system.indexOf('\nexport const SystemMessage:'))
const nativeCSS=await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'),'utf8')
const sdk=`
import {QueryClient} from '@tanstack/query-core';
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
export const host=window.fixtureHost,PALETTE_AREA='palette',THEMES_AREA='themes';
export const useQuery=()=>({}),useValue=a=>a?.get?.(),profileColor=()=>null,profileColorSoft=()=>null;
`
const {outputFiles}=await require('esbuild').build({
  stdin:{resolveDir:core,sourcefile:'retention-esm-native.tsx',loader:'tsx',contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS}from'./apps/desktop/src/components/chat/scaffold-row';
import{cn}from'./apps/desktop/src/lib/utils';
import plugin from ${JSON.stringify(pluginPath)};
const MessageTimelineTimestamp=()=>null,ToolIcon=()=>null;
const MarkdownTextContent=({text})=>text,LogView=({children})=>children;
${background}
window.activate=()=>{window.disposals=[];window.contributions=[];plugin.register({storage:{get:(_key,fallback)=>fallback},register:c=>contributions.push(c),onDispose:f=>disposals.push(f)})};
window.deactivate=()=>{for(const f of disposals.splice(0).reverse())f()};
window.mountNotice=id=>createRoot(document.getElementById(id)).render(React.createElement(BackgroundResult,{text:'Subagent Task Completed: inspect',report:'Exact native report'}));
`},bundle:true,format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
  tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},
  plugins:[{name:'supported-sdk',setup(build){
    build.onResolve({filter:/^(?:react|react-dom\/client|react\/jsx-runtime)$/},args=>({path:require.resolve(args.path)}))
    build.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:'sdk',namespace:'fixture'}))
    build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:sdk,resolveDir:core}))
    build.onResolve({filter:/^@tanstack\/query-core$/},()=>({path:fileURLToPath(new URL('../node_modules/@tanstack/query-core/build/modern/index.js',import.meta.url))}))
    build.onResolve({filter:/^@\/components\/assistant-ui\/(?:markdown-text|thread\/timeline-timestamp)$/},args=>({path:args.path,namespace:'leaf'}))
    build.onLoad({filter:/.*/,namespace:'leaf'},()=>({contents:'export const MessageTimelineTimestamp=()=>null;export const MarkdownTextContent=({text})=>text;'}))
  }}]
})
const actions='<div data-slot="aui_msg-actions"><button>Copy</button></div>'
const message=(id,body,footer='')=>`<div id="${id}" data-role="assistant" data-message-id="${id}" data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">${body}</div>${footer}<span hidden data-slot="aui_message-streaming-marker"></span></div>`
const first=message('first-work','<div data-slot="tool-block" id="first-tool">Native work</div>')+message('first-final','<div class="aui-md" id="first-answer">First complete answer</div><div class="aui-md" id="first-end">Its complete conclusion</div>',actions)
const following='<div data-role="system" data-slot="aui_system-message-root" id="native-notice"></div>'+message('second-work','<div data-slot="tool-block" id="second-tool">Follow-up work</div>')+message('second-final','<div class="aui-md" id="second-answer">Second complete answer</div>',actions)

test('shipping ESM registration mounts full earlier replies under Working and Worked on cold reopen with native BackgroundResult',async()=>{
  const browser=await chromium()
  try{
    const {frameTree}=await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html><head><style>${nativeCSS}</style></head><body><section data-session-anchor="workspace"><div data-slot="aui_thread-content"><div id="pair" data-slot="aui_turn-pair"><div data-role="user" data-message-id="user-test">Question</div><div id="response" data-slot="aui_response-group">${first}</div></div></div></section></body></html>`})
    await browser.evaluate(`(()=>{const atom=value=>({get:()=>value,subscribe:()=>()=>{}});window.errors=[];addEventListener('error',e=>errors.push(String(e.error)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.fixtureHost={state:{connectionId:atom('local'),profile:atom('default'),gateway:atom('open'),focusedSessionOwner:atom(null),focusedStoredSessionId:atom(null),focusedSessionId:atom(null),activeSessionId:atom(null),busyBySession:atom({})},onEvent:()=>()=>{},notify:()=>{}};window.waitFor=async f=>{const end=performance.now()+5000;while(!f()){if(performance.now()>end)throw Error('ESM retention timed out');await new Promise(r=>setTimeout(r,20))}};window.el=id=>document.getElementById(id);window.visible=id=>Boolean((id==='native-notice'?el(id)?.querySelector('[data-slot="aui_background-result"]'):el(id))?.getClientRects().length);window.header=()=>el('pair').querySelector('[data-codex-turn-activity]')})()`)
    await browser.evaluate(outputFiles[0].text)
    await browser.evaluate(`activate();waitFor(()=>header()?.getAttribute('aria-expanded')==='false')`)
    await browser.evaluate(`window.originalAnswer=el('first-answer');el('first-final').querySelector('[data-slot="aui_msg-actions"]').remove();el('response').insertAdjacentHTML('beforeend',${JSON.stringify(following)});el('second-final').querySelector('[data-slot="aui_message-streaming-marker"]').dataset.messageStreaming='true';mountNotice('native-notice');waitFor(()=>header()?.textContent==='Working'&&el('native-notice').querySelector('button'))`)
    assert.equal(await browser.evaluate(`!visible('first-answer')&&!visible('first-end')&&visible('second-answer')&&el('first-answer')===originalAnswer`),true)
    await browser.evaluate(`el('second-final').querySelector('[data-slot="aui_message-streaming-marker"]').removeAttribute('data-message-streaming');waitFor(()=>header()?.textContent==='Worked'&&header()?.getAttribute('aria-expanded')==='false')`)
    assert.deepEqual(await browser.evaluate(`Object.fromEntries(['first-answer','first-end','second-answer','first-tool','second-tool','native-notice'].map(id=>[id,visible(id)]))`),{'first-answer':false,'first-end':false,'second-answer':true,'first-tool':false,'second-tool':false,'native-notice':false})
    await browser.evaluate(`header().click();el('native-notice').querySelector('button').click();waitFor(()=>el('native-notice').textContent.includes('Exact native report'))`)
    assert.equal(await browser.evaluate(`el('native-notice').querySelector('button').getAttribute('aria-expanded')`),'true')
    assert.equal(await browser.evaluate(`visible('first-answer')&&visible('first-end')&&el('first-answer')===originalAnswer`),true)
    // Persist the collapsed choice explicitly; cold hydration preserves it.
    await browser.evaluate(`header().click();waitFor(()=>header()?.getAttribute('aria-expanded')==='false')`)
    await browser.evaluate(`deactivate();document.querySelector('[data-slot="aui_thread-content"]').innerHTML=${JSON.stringify('<div id="pair" data-slot="aui_turn-pair"><div data-role="user" data-message-id="user-test">Question</div><div id="response" data-slot="aui_response-group">'+first.replace(actions,'')+following+'</div></div>')};activate();mountNotice('native-notice');waitFor(()=>header()?.getAttribute('aria-expanded')==='false'&&el('native-notice').querySelector('button'))`)
    assert.equal(await browser.evaluate(`!visible('first-answer')&&!visible('first-end')&&visible('second-answer')&&!visible('first-tool')&&!visible('second-tool')`),true)
    await browser.evaluate(`header().click()`)
    assert.equal(await browser.evaluate(`visible('first-answer')&&visible('first-end')&&visible('second-answer')`),true)
    assert.deepEqual(await browser.evaluate('errors'),[])
  }finally{await browser.evaluate('deactivate()').catch(()=>{});browser.close()}
})
