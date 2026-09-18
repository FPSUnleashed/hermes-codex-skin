import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Native StatusRow / QueuePanel topology and status-stack.css declarations.
// Only the queue's trailing actions change alignment; other status rows stay native.
test('queue actions center on full rows and the plus uses symmetric unrotated strokes', async () => {
 const { CSS } = await loadPluginInternals(['CSS'])
 const b = await chromium()
 const row = (id, metadata = '', icon = 'comment') => `<div id="${id}" class="status-row group/status-row" data-slot="status-row"><span class="status-row-dismiss">×</span><span class="status-row-icon"><i class="codicon-${icon}"></i></span><div class="status-row-content"><div><p>Queued message</p>${metadata?`<div class="meta">${metadata}</div>`:''}</div></div><div class="status-row-actions"><button type="button" aria-label="Edit queued message">✎</button><button type="button" aria-label="Send now">↵</button></div></div>`
 try {
  await b.call('Emulation.setDeviceMetricsOverride',{width:660,height:450,deviceScaleFactor:2,mobile:false})
  const html=`<!doctype html><html data-codex-chat-look="true" data-hermes-mode="light"><style>
  *{box-sizing:border-box}body{margin:0;font:12px system-ui;background:white;--theme-foreground:#171717;--theme-card-seed:#f4f4f4;--theme-background-seed:#fff;--theme-sidebar-seed:#fafafa;--theme-accent-soft:#eee;--theme-primary:#171717;--ui-text-primary:#171717}p{margin:0;line-height:16px}.meta{margin-top:2px;line-height:15px;font-size:10px}button{display:grid;place-items:center;width:20px;height:20px;padding:0;border:0;background:transparent}
  [data-slot='composer-status-stack']{--status-nest:.25rem;--status-section-indent:0rem;--status-action-width:.75rem;--status-icon-width:.8rem;--status-gap:.375rem}
  [data-slot='composer-status-stack'] .status-row{display:grid;grid-template-columns:var(--status-action-width) var(--status-icon-width) minmax(0,1fr) auto;align-items:start;gap:var(--status-gap);padding:.25rem .625rem .25rem .5rem;min-height:24px}
  [data-slot='composer-status-stack'] .status-row-icon{grid-column:2;grid-row:1;height:16px}
  [data-slot='composer-status-stack'] .status-row-content{grid-column:3;grid-row:1;display:flex;align-items:start}
  [data-slot='composer-status-stack'] .status-row-dismiss{grid-column:1;grid-row:1;height:16px}
  [data-slot='composer-status-stack'] .status-row-actions{grid-column:4;grid-row:1;align-self:start;display:flex;gap:2px}
  [data-slot='composer-status-stack'] .status-row-actions>button{margin-top:-2px}
  #surface{position:relative;margin-top:20px;height:50px}#plus{position:absolute;top:10px;left:20px;width:28px;height:28px}
  ${CSS}</style><body><div data-slot="composer-status-stack"><div data-codex-status-card="true">${row('single')}${row('attachment','1 attachment')}${row('editing','Editing in composer')}${row('other','Native multiline detail','file')}</div></div><div id="surface" data-slot="composer-surface"><button id="plus" type="button" aria-label="Add"><i class="codicon-add">+</i></button></div><script>window.clicks={};document.querySelectorAll('button').forEach((button,i)=>button.onclick=()=>{window.clicks[i]=(window.clicks[i]||0)+1})</script></body></html>`
  await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html})
  for(const mode of ['light','dark']) {
   await b.evaluate(`document.documentElement.dataset.hermesMode='${mode}'`)
   for(const id of ['single','attachment','editing']) {
    const state = await b.evaluate(`(()=>{const row=document.getElementById('${id}'),r=row.getBoundingClientRect();return{centers:[...row.querySelectorAll('button')].map(button=>{const b=button.getBoundingClientRect();return{delta:(b.y+b.height/2)-(r.y+r.height/2),margin:getComputedStyle(button).marginTop}}),dismissAlign:getComputedStyle(row.querySelector('.status-row-dismiss')).alignSelf}})()`)
    for(const button of state.centers){assert.ok(Math.abs(button.delta)<.1,`${id} ${mode} action offset ${button.delta}px`);assert.equal(button.margin,'0px')}
    assert.equal(state.dismissAlign,'auto','the leading controls retain native first-line alignment')
   }
  }
  const plus = await b.evaluate(`(()=>{const p=document.getElementById('plus'),a=getComputedStyle(p,'::before'),b=getComputedStyle(p,'::after');return{button:p.getBoundingClientRect().width,aw:a.width,ah:a.height,bw:b.width,bh:b.height,m:new DOMMatrix(b.transform).toString(),colorA:a.backgroundColor,colorB:b.backgroundColor}})()`)
  assert.equal(plus.button,28);assert.equal(plus.aw,'13px');assert.equal(plus.ah,'1.5px');assert.equal(plus.bw,'1.5px');assert.equal(plus.bh,'13px');assert.match(plus.m,/matrix\(1, 0, 0, 1,/);assert.equal(plus.colorA,plus.colorB)
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('#other .status-row-actions')).alignSelf`),'start')
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('#other button')).marginTop`),'-2px')
  await b.evaluate(`document.querySelectorAll('#attachment button,#plus').forEach(b=>b.click())`)
  assert.equal(await b.evaluate(`Object.values(clicks).reduce((a,b)=>a+b,0)`),3)
  await b.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('#attachment .status-row-actions')).alignSelf`),'start')
 } finally {b.close()}
})
