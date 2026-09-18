import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// PaneTab/PaneTabLabel topology verified against the installed Hermes renderer
// index-D3VitlYS.js and index-Br4MZL1l.css. Optional exact host CSS strengthens
// local verification; the isolated native declarations keep this test portable.
const native = process.env.CODEX_SKIN_NATIVE_CSS
  ? await readFile(process.env.CODEX_SKIN_NATIVE_CSS, 'utf8') : ''
const nativeSeam = `
*{box-sizing:border-box}body{margin:0;font:14px system-ui}button{font:inherit;border:0;padding:0;color:inherit}
[data-zone-tabstrip]{display:flex;height:28px}[role=tablist]{display:flex;min-width:0;flex:1;overflow:auto}
[data-slot=pane-tab]{position:relative;display:flex;flex-shrink:0;align-items:center;height:100%;min-width:52px;max-width:192px;background:var(--tab-bg)}
[data-slot=pane-tab][data-closeable]{--pane-tab-close-width:1.5rem}
.pane-tab-content{display:flex;height:100%;min-width:0;max-width:100%;flex:1;align-items:center}
.pane-tab-content>span{display:flex;height:100%;min-width:0;max-width:100%;align-items:center;overflow:hidden;padding:0 8px}
.truncate{display:block;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:clip;font-size:9px;font-weight:500;letter-spacing:.025em;text-transform:uppercase}
.close-wrap{pointer-events:none;position:absolute;top:0;bottom:0;right:0;display:flex;align-items:stretch;opacity:0}
[data-slot=pane-tab]:hover>.close-wrap{pointer-events:auto;opacity:1}
.close-wrap>button{display:grid;width:var(--pane-tab-close-width);place-items:center;background:transparent}
[data-slot=pane-tab][data-closeable]:hover>.pane-tab-content{mask-image:linear-gradient(to right,#000 calc(100% - var(--pane-tab-close-width) - 1rem),transparent calc(100% - var(--pane-tab-close-width)))}
[data-slot=pane-tab][data-vertical]{writing-mode:vertical-rl}
.glyph{width:11px;height:11px;stroke:currentColor;stroke-width:1.5;fill:none}
`
function tab(id, title, width, extra='') {
 return `<div id="${id}" role="tab" data-slot="pane-tab" data-active="true" aria-selected="true" data-closeable="true" ${extra} style="width:${width}px" class="group/tab relative flex shrink-0 items-center border-transparent bg-(--tab-bg) h-full min-w-0 max-w-48 min-w-13">
 <div class="pane-tab-content flex h-full min-w-0 max-w-full flex-1 items-center"><span class="flex h-full min-w-0 max-w-full items-center overflow-hidden px-2 text-left outline-none"><span class="truncate block min-w-0 text-[9px] font-medium tracking-wide uppercase group-data-[closeable]/tab:text-clip">${title}</span></span></div>
 <span class="close-wrap pointer-events-none absolute inset-y-0 right-0 flex items-stretch opacity-0 transition-opacity group-hover/tab:pointer-events-auto group-hover/tab:opacity-100"><button type="button" aria-label="Fermer" class="grid w-(--pane-tab-close-width) cursor-pointer place-items-center bg-transparent text-(--ui-text-tertiary) outline-none hover:text-foreground"><svg class="glyph" viewBox="0 0 12 12"><path d="m2 2 8 8m0-8-8 8"/></svg></button></span></div>`
}
test('horizontal skin tab close circle has equal insets and a separate title area', async()=>{
 const {CSS,BROWSER_PALETTE_CSS}=await loadPluginInternals(['CSS','BROWSER_PALETTE_CSS'])
 const b=await chromium()
 try {
 const html=`<!doctype html><html data-codex-chat-look="true" data-hermes-theme="warm" data-hermes-mode="light"><style>${native}${nativeSeam}
 :root{--theme-foreground:#3b3b34;--theme-background-seed:#faf7eb;--theme-sidebar-seed:#faf7eb;--theme-card-seed:#f3efe0;--theme-accent-soft:#eee8d4;--ui-text-primary:#3b3b34;--ui-text-tertiary:#777469;--ui-row-active-background:#eee8d4;--ui-editor-surface-background:#faf7eb;--ui-stroke-secondary:#ddd;--spacing:.25rem}
 ${CSS}${BROWSER_PALETTE_CSS}</style><body><div data-tree-group="grp-main"><div data-panel-header><div data-zone-tabstrip="grp-main"><div role="tablist">${tab('long','● Concevoir notifications d’actualisation',192)}${tab('short','Hi',70)}${tab('narrow','A very long conversation',120)}</div></div></div></div>
 <div data-tree-group="grp-sessions"><div data-zone-tabstrip="grp-sessions"><div role="tablist">${tab('excluded','Sessions',120)}</div></div></div>
 <div data-tree-group="browser"><div data-zone-tabstrip="browser"><div role="tablist">${tab('browser','Browser preview',160)}</div></div></div>
 <script>window.closes=0;window.activations=0;document.querySelectorAll('[data-slot=pane-tab]').forEach(t=>{t.onclick=()=>window.activations++;t.querySelector('button').onclick=e=>{e.preventDefault();e.stopPropagation();window.closes++}})</script></body></html>`
 await b.call('Emulation.setDeviceMetricsOverride',{width:700,height:300,deviceScaleFactor:1,mobile:false})
 await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html})
 for(const mode of ['light','dark']) {
 await b.evaluate(`document.documentElement.dataset.hermesMode=${JSON.stringify(mode)}; document.documentElement.style.setProperty('--theme-foreground',${JSON.stringify(mode==='dark'?'#fcfcfc':'#3b3b34')})`)
 for(const id of ['long','short','narrow','browser']) {
 const before=await b.evaluate(`document.getElementById('${id}').getBoundingClientRect().width`)
 const target=await b.evaluate(`(()=>{const r=document.querySelector('#${id} button').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
 await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',...target})
 const value=await b.evaluate(`(()=>{const t=document.getElementById('${id}'),b=t.querySelector('button'),label=t.querySelector('.truncate'),r=b.getBoundingClientRect(),tr=t.getBoundingClientRect(),lr=label.getBoundingClientRect(),s=getComputedStyle(b);return{width:r.width,height:r.height,top:r.top-tr.top,bottom:tr.bottom-r.bottom,right:tr.right-r.right,gap:r.left-lr.right,background:s.backgroundColor,radius:s.borderRadius,mask:getComputedStyle(t.querySelector('.pane-tab-content')).maskImage,tabWidth:tr.width,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()`)
 assert.equal(value.width,20,`${id}: compact circular control`)
 assert.equal(value.height,20)
 for(const edge of ['top','bottom','right']) assert.equal(value[edge],4,`${id}: ${edge} inset`)
 assert.ok(value.gap>=6,`${id}: title must end before the circle (${value.gap})`)
 assert.equal(value.radius,'50%');assert.notEqual(value.background,'rgba(0, 0, 0, 0)')
 assert.equal(value.mask,'none');assert.equal(value.tabWidth,before);assert.equal(value.hit,true)
 await b.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...target})
 await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...target})
 }
 }
 assert.equal(await b.evaluate('window.closes'),8);assert.equal(await b.evaluate('window.activations'),0)
 assert.equal(await b.evaluate("getComputedStyle(document.querySelector('#excluded button')).borderRadius"),'0px')
 if(process.env.CODEX_SKIN_TAB_SCREENSHOT){const {data}=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(process.env.CODEX_SKIN_TAB_SCREENSHOT,Buffer.from(data,'base64'))}
 await b.evaluate("document.documentElement.removeAttribute('data-codex-chat-look')")
 assert.equal(await b.evaluate("document.querySelector('#long button').getBoundingClientRect().width"),24)
 } finally {b.close()}
})
