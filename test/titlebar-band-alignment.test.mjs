import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Native TitlebarControls + TreeGroup structure, confirmed by read-only geometry
// on the installed v1.8.0: 24px tools at top 5px, 44px left / 48px browser strips.
const group=(id,browser=false)=>`<section data-tree-group="${id}" data-window-top><div data-panel-header style="height:34px"><div data-zone-tabstrip="${id}"><div role="tablist"><div role="tab">${browser?'Browser':'Sessions'}</div></div></div></div>${browser?'<aside data-preview-browser></aside>':''}</section>`
test('window controls center on their actual tab band and retain native placement for split rows',async()=>{
 const b=await chromium()
 try{
  const {CSS}=await loadPluginInternals(['CSS'])
  const code=(await readFile(new URL('../codex-chat-look/plugin.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.plugin = {')
  await b.call('Emulation.setDeviceMetricsOverride',{width:1000,height:600,deviceScaleFactor:1,mobile:false})
  await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look="true"><style>
  :root{--titlebar-controls-top:5px;--titlebar-controls-y-nudge:0px;--ui-editor-surface-background:white;--ui-sidebar-surface-background:#eee}*{box-sizing:border-box}body{margin:0}#layout{display:flex;width:100%}section{position:relative;width:50%;height:500px}[data-panel-header]{position:relative;display:flex;flex-shrink:0}[data-zone-tabstrip]{display:flex;flex:1}[role=tablist]{display:flex}[role=tab]{height:28px}.absolute{position:absolute;bottom:0;left:0;right:0}[data-titlebar-cluster]{position:fixed;top:var(--titlebar-controls-top);display:flex;z-index:70}[data-titlebar-cluster=left]{left:14px;translate:0 var(--titlebar-controls-y-nudge)}[data-titlebar-cluster=right]{right:14px}button{display:grid;place-items:center;padding:0;border:0;width:24px;height:24px}svg{width:14px;height:14px}${CSS}</style><body><div id="layout">${group('grp-sessions')}${group('browser',true)}</div><div data-titlebar-cluster="left"><button id="left"><svg></svg></button></div><div data-titlebar-cluster="right"><button id="right"><svg></svg></button></div></body></html>`})
  await b.evaluate(code+`;window.clicks=0;document.getElementById('left').onclick=()=>window.clicks++;window.stopAlignment=typeof installTitlebarAlignment==='function'?installTitlebarAlignment():()=>{};window.measure=()=>{const result={};for(const side of ['left','right']){const c=document.querySelector('[data-titlebar-cluster='+side+']'),r=c.getBoundingClientRect(),x=r.left+r.width/2;const p=Array.from(document.querySelectorAll('[data-window-top] > [data-panel-header]')).find(h=>{const q=h.getBoundingClientRect();return q.width&&x>=q.left&&x<=q.right});const h=p.getBoundingClientRect();const below=p.querySelector('.absolute');const scale=r.height/c.offsetHeight;result[side]={center:r.top+r.height/2,target:h.top+(below?17*scale:h.height/2),size:r.height/scale,top:getComputedStyle(c).top}}return result}`)
  const settle=()=>b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const check=async label=>{await settle();const r=await b.evaluate('measure()');for(const side of ['left','right']){assert.ok(Math.abs(r[side].center-r[side].target)<.1,`${label} ${side}: center ${r[side].center}, band ${r[side].target}`);assert.ok(Math.abs(r[side].size-24)<.1)}}
  await check('normal')
  await b.evaluate(`document.documentElement.style.setProperty('--titlebar-controls-y-nudge','3.6px');window.dispatchEvent(new Event('resize'))`);await check('native Mac nudge')
  await b.evaluate(`document.documentElement.style.zoom='.9';window.dispatchEvent(new Event('resize'))`);await check('zoom')
  await b.evaluate(`document.documentElement.style.zoom='1';document.documentElement.style.setProperty('--titlebar-controls-y-nudge','0px');document.querySelector('[data-tree-group=browser] [data-zone-tabstrip]').classList.add('absolute');window.dispatchEvent(new Event('resize'));window.measureBase=window.measure;window.measure=()=>{const out=window.measureBase();for(const side of ['left','right'])out[side].target=24;return out}`);await check('cramped browser stays in one band')
  await b.evaluate(`window.savedTabs=document.querySelector('[data-tree-group=browser] [data-zone-tabstrip]');window.savedTabs.remove()`);await check('hidden tabs retain the same control position')
  await b.evaluate(`document.querySelector('[data-tree-group=browser] > [data-panel-header]').appendChild(window.savedTabs)`);await check('restored tabs')
  await b.evaluate(`document.querySelector('[data-tree-group=browser] [data-zone-tabstrip]').classList.remove('absolute');const l=document.getElementById('layout');l.insertBefore(l.lastElementChild,l.firstElementChild)`);await check('flipped panes')
  await b.evaluate(`document.getElementById('left').click();stopAlignment()`)
  assert.equal(await b.evaluate('window.clicks'),1)
  assert.deepEqual(await b.evaluate(`Array.from(document.querySelectorAll('[data-titlebar-cluster]'),e=>({offset:e.style.getPropertyValue('--codex-titlebar-offset'),top:getComputedStyle(e).top}))`),[{offset:'',top:'5px'},{offset:'',top:'5px'}])
 }finally{b.close()}
})
