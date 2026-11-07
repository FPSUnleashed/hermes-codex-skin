import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import test from 'node:test'
import {chromium,waitForRendered} from './helpers/chromium.mjs'
import {shippingCSS} from './helpers/native-background.mjs'

const core=referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require=createRequire(`${core}/package.json`)
const nativeCSS=await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
const {outputFiles}=await require('esbuild').build({
 stdin:{resolveDir:core,loader:'tsx',contents:`
  import React,{useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS} from './apps/desktop/src/components/chat/scaffold-row';
  import {DisclosureRow} from './apps/desktop/src/components/chat/disclosure-row';
  import {ToolIcon} from './apps/desktop/src/components/ui/tool-icon';
  const h=React.createElement;
  function Tool({name}) {const [open,setOpen]=useState(false);return h('div',{id:name,'data-tool-row':'','data-conversation-scaffold':''},
   h(DisclosureRow,{open,onToggle:()=>setOpen(!open)},h('span',{className:'flex min-w-0 items-center gap-1.5'},
    h('span',{className:SCAFFOLD_GLYPH_CLASS},h(ToolIcon,{name})),h('span',{className:SCAFFOLD_LABEL_CLASS},name))),open?h('pre',null,'Native output'):null)}
  function Group(){const [open,setOpen]=useState(true);return h('div',{'data-tool-group':''},
   h('div',{'data-tool-summary':'','data-conversation-scaffold':''},h(ScaffoldRow,{open,onToggle:()=>{window.summaryToggles++;setOpen(!open)}},h('span',{className:SCAFFOLD_LABEL_CLASS},'Ran command and code'))),
   open?h('div',{id:'native-calls'},h(Tool,{name:'terminal'}),h(Tool,{name:'code'})):null)}
  function Thinking(){const [open,setOpen]=useState(false);return h('div',{'data-slot':'aui_thinking-disclosure','data-conversation-scaffold':''},h(ScaffoldRow,{open,onToggle:()=>setOpen(!open)},h('span',{className:SCAFFOLD_LABEL_CLASS},'Thought for 2s')))}
  window.summaryToggles=0;createRoot(document.getElementById('fixture')).render(h('main',null,h(Group),h(Thinking)));
 `},bundle:true,format:'iife',write:false,jsx:'automatic',outdir:'summary-icon-fixture',
 tsconfigRaw:{compilerOptions:{baseUrl:core,paths:{'@/*':['apps/desktop/src/*']}}},define:{'process.env.NODE_ENV':'"production"'}
})
const hammerPaths=['m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9','m18 15 4-4','m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5']
const brainSVG=(await readFile(new URL('./fixtures/brain/brain.svg',import.meta.url),'utf8')).trim()
const maskState=`(()=>{const style=getComputedStyle(document.querySelector('[data-tool-summary] button'),'::before');const mask=decodeURIComponent(style.maskImage);const xml=mask.slice(mask.indexOf('<svg'),mask.lastIndexOf('</svg>')+6);const svg=new DOMParser().parseFromString(xml,'image/svg+xml').documentElement;return{paths:[...svg.querySelectorAll('path')].map(p=>p.getAttribute('d')),viewBox:svg.getAttribute('viewBox'),fill:svg.getAttribute('fill'),stroke:svg.getAttribute('stroke-width'),cap:svg.getAttribute('stroke-linecap'),join:svg.getAttribute('stroke-linejoin'),width:style.width,height:style.height,flex:style.flexBasis,size:style.maskSize,position:style.maskPosition,repeat:style.maskRepeat,transform:style.transform}})()`
async function click(browser,selector){const point=await browser.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await browser.call('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point})}
async function key(browser,key,code,value){for(const type of ['keyDown','keyUp'])await browser.call('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:value,...(type==='keyDown'?{text:key==='Enter'?'\r':key}:{})})}

test('native tool-summary uses exact recovered hammer; native individual icons, brain and disclosure handlers survive',async()=>{
 const browser=await chromium()
 try {
  const css=await shippingCSS()
  await browser.call('Page.setDocumentContent',{frameId:(await browser.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html><head><style>${nativeCSS}</style><style>${css}</style><style>:root{--ui-text-secondary:#ddd;--ui-text-tertiary:#aaa;--ui-accent:#69f;--conversation-tool-font-size:14px;--conversation-line-height:24px}body{background:#171717;color:#ddd;padding:30px}main{width:600px}</style></head><body><div id="fixture"></div></body></html>`})
  await browser.evaluate(outputFiles.find(f=>f.path.endsWith('.js')).text)
  await waitForRendered(browser,`document.querySelector('#code button')`,'native disclosures mounted')
  await browser.evaluate(`window.summary=document.querySelector('[data-tool-summary] button');window.nativeIcons=['terminal','code'].map(id=>document.getElementById(id).querySelector('button > span:first-child > span > span:first-child'));window.iconMarkup=nativeIcons.map(e=>e.innerHTML);window.caret=summary.lastElementChild;window.toggle=()=>summary.getAttribute('aria-expanded');document.documentElement.setAttribute('data-codex-chat-look','true')`)
  assert.deepEqual(await browser.evaluate(maskState),{paths:hammerPaths,viewBox:'0 0 24 24',fill:'none',stroke:'2',cap:'round',join:'round',width:'24px',height:'24px',flex:'24px',size:'16px 16px',position:'50% 50%',repeat:'no-repeat',transform:'none'})
  const brain=await browser.evaluate(`getComputedStyle(document.querySelector('[data-slot="aui_thinking-disclosure"] button'),'::before').maskImage`)
  assert.equal(Buffer.from(brain.match(/base64,([^"]+)/)[1],'base64').toString(),brainSVG,'Thought shares the exact recovered Thinking brain')
  assert.equal(await browser.evaluate(`nativeIcons.every((e,i)=>e.isConnected&&e.innerHTML===iconMarkup[i]&&getComputedStyle(e,'::before').maskImage==='none')&&document.querySelectorAll('[data-codex-turn-hammer]').length===0`),true)
  assert.equal(await browser.evaluate(`nativeIcons[0].querySelector('svg').getAttribute('viewBox')==='0 0 256 256'&&!!nativeIcons[1].querySelector('[class*="codicon-code"]')`),true,'real native terminal SVG and code codicon, not stand-ins')
  for(const id of ['terminal','code']){await click(browser,`#${id} button`);await waitForRendered(browser,`document.getElementById('${id}').querySelector('pre')`,'native individual output opens')}
  assert.equal(await browser.evaluate(`nativeIcons.every((e,i)=>e.isConnected&&e.innerHTML===iconMarkup[i])`),true,'individual icon identity survives disclosure')
  if(process.env.CODEX_HEADER_SCREENSHOTS){await mkdir(process.env.CODEX_HEADER_SCREENSHOTS,{recursive:true});const {data}=await browser.call('Page.captureScreenshot',{format:'png'});await writeFile(`${process.env.CODEX_HEADER_SCREENSHOTS}/native-summary-hammer.png`,Buffer.from(data,'base64'))}
  await click(browser,'[data-tool-summary] button')
  await waitForRendered(browser,`toggle()==='false'&&!document.getElementById('native-calls')`,'native click collapses calls')
  assert.equal(await browser.evaluate(`summaryToggles===1&&document.querySelector('[data-tool-summary] button')===summary&&summary.lastElementChild===caret`),true)
  await browser.evaluate(`summary.focus()`)
  await key(browser,'Enter','Enter',13)
  await waitForRendered(browser,`toggle()==='true'&&document.getElementById('native-calls')`,'native Enter expands calls')
  await key(browser,' ','Space',32)
  await waitForRendered(browser,`toggle()==='false'&&!document.getElementById('native-calls')`,'native Space collapses calls')
  assert.equal(await browser.evaluate(`summaryToggles`),3)
  assert.deepEqual(await browser.evaluate(maskState),{paths:hammerPaths,viewBox:'0 0 24 24',fill:'none',stroke:'2',cap:'round',join:'round',width:'24px',height:'24px',flex:'24px',size:'16px 16px',position:'50% 50%',repeat:'no-repeat',transform:'none'})
  await browser.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
  assert.equal(await browser.evaluate(`getComputedStyle(summary,'::before').content`),'none','disable restores native summary')
 }finally{browser.close()}
})
