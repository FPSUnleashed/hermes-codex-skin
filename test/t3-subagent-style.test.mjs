import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { pathToFileURL } from 'node:url'
const { loadPluginInternals } = await import(process.env.T3_SUBAGENT_BASELINE
  ? pathToFileURL(`${process.env.T3_SUBAGENT_BASELINE}/test/helpers/load-plugin.mjs`)
  : new URL('./helpers/load-plugin.mjs', import.meta.url))

const core = referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const capturedCSS = await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
const iconFont = (await readFile(new URL('./fixtures/subagent-codicons/codicon.ttf', import.meta.url))).toString('base64')
// Resolve the captured stylesheet's otherwise unavailable font asset, without
// changing its rules. Native package-lock pins codicons 0.0.45; same agent U+EC67.
const nativeCSS = capturedCSS.replace(/url\(\.\/codicon-[^)]+\)/, `url(data:font/ttf;base64,${iconFont})`)
const require = createRequire(`${core}/package.json`)
// Real native row/model/store/ticker/timers; only view, i18n and window transport
// are fixture boundaries. Store updates below are test inputs, not skin APIs.
const edges = {
  '@/app/chat/session-view': `import{atom}from'nanostores';const view={$runtimeId:atom('parent'),$storedId:atom('stored-parent')};export const useSessionView=()=>view;`,
  '@/i18n': `export const useI18n=()=>({t:{assistant:{tool:{statusRunning:'Running',statusError:'Failed',statusDone:'Done'}}}});`,
  '@/store/subagents': `export*from'./apps/desktop/src/store/subagents';import{$subagentsBySession,upsertSubagent}from'./apps/desktop/src/store/subagents';window.updateAgents=items=>$subagentsBySession.set({parent:items});window.completeAgent=p=>upsertSubagent('parent',p,true,'subagent.complete');`,
  '@/store/windows': `export const openSessionInNewWindow=(id,options)=>{window.opens.push({id,options});};`
}
const { outputFiles } = await require('esbuild').build({
  stdin: { resolveDir: core, contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{DelegateTool}from'./apps/desktop/src/components/assistant-ui/tool/delegate';
    const h=React.createElement;window.opens=[];
    const goal='Resolve combined-candidate gate intermittent animation and focus assertions through authentic native behavior with a very long task title '.repeat(2);
    const preview='Terminal("python - reading native source, not a fabricated report")';
    const agents=[
      {id:'delegate-tool:call:0',goal,status:'running',sessionId:'child',model:'gpt-6.1-sol',startedAt:Date.now()-617000,taskIndex:0,stream:[{text:'Old output one'},{text:'Old output two'},{text:preview}]},
      {id:'delegate-tool:call:1',goal:'Completed child',status:'completed',sessionId:'completed-child',model:'gpt-6.1-sol',durationSeconds:126,taskIndex:1,stream:[{text:'**Audit read-only captured.** Verified 10 real results from native summary'}]},
      {id:'delegate-tool:call:2',goal:'Failed child',status:'failed',sessionId:'failed-child',model:'gpt-6.1-sol',taskIndex:2,stream:[{text:'Native failure details'}]},
      {id:'delegate-tool:call:3',goal:'Unavailable child',status:'queued',model:'an-extremely-long-provider/model-identifier-without-spaces',taskIndex:3,stream:[]},
      {id:'delegate-tool:call:4',goal:'Cancelled child',status:'running',sessionId:'cancelled-child',model:'gpt-6.1-sol',taskIndex:4,stream:[]}
    ];window.agents=agents;window.updateAgents(agents);
    const children=h(DelegateTool,{args:{tasks:agents.map(a=>({goal:a.goal}))},toolCallId:'call'});
    createRoot(document.getElementById('fixture')).render(h('div',null,
      ...['pane','split'].map(id=>h('main',{id,'data-slot':'aui_thread-content'},
        h('div',{'data-slot':'aui_assistant-message-content'},children))),
      h('div',{'data-slot':'tool-block',id:'ordinary'},h('button',null,'Unrelated native details'),h('a',{href:'#native-details'},'Open details')),
      h('div',{'data-slot':'composer-subagents',id:'composer'},h('button',null,'Native composer controls'))));
  ` },
  bundle: true, format: 'iife', write: false, jsx: 'automatic', outdir: 't3-subagent-fixture',
  tsconfigRaw: { compilerOptions: { baseUrl: core, paths: { '@/*': ['apps/desktop/src/*'] } } },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'native-boundaries', setup(build) {
    build.onResolve({ filter: /^@\// }, args => args.path in edges ? { path: args.path, namespace: 'fixture-edge' } : args.path === '@/lib/icons' ? { path: 'fixture-icons', namespace: 'fixture-edge' } : undefined)
    build.onResolve({ filter: /^\.\/fallback-model$/ }, () => ({ path: 'fixture-format', namespace: 'fixture-edge' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture-edge' }, args => ({ contents: args.path === 'fixture-icons' ? `export {AlertCircle,CheckCircle2} from 'lucide-react';` : args.path === 'fixture-format' ? `export {formatDurationSeconds,numberValue,parseMaybeObject} from './apps/desktop/src/components/assistant-ui/tool/fallback-model/format';` : edges[args.path], resolveDir: core }))
  } }]
})
const shipped = await loadPluginInternals(['CSS','BROWSER_PALETTE_CSS','UPDATE_CSS','T3_SUBAGENT_CSS'])
const fullCSS = ['CSS','BROWSER_PALETTE_CSS','UPDATE_CSS','T3_SUBAGENT_CSS'].map(k=>{assert.equal(typeof shipped[k],'string',`shipping ${k} present`);return shipped[k]}).join('\n')
async function settle(b) {
  await b.evaluate(`(async()=>{document.body.getBoundingClientRect();await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))})()`)
}
async function fixture(theme='dark',scale=1) {
  const b=await chromium()
  try {
    await b.call('Emulation.setFocusEmulationEnabled',{enabled:true})
    await b.call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false})
    const colors={dark:['#201b25','#ededed','#b9aebb','#46404c'],light:['#fff','#202020','#555','#ccc'],colored:['#073642','#eee8d5','#93a1a1','#586e75']}[theme]
    await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html class="${theme==='light'?'light':'dark'}" data-hermes-mode="${theme==='light'?'light':'dark'}"><head><style>${nativeCSS}</style><style>${outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n')}</style><style id="shipped-style">${fullCSS}</style><style>

      :root{--chat-text-scale:${scale};--dt-font-sans:Arial;--ui-base:${colors[1]};--ui-chat-surface-background:${colors[0]};--ui-text-primary:${colors[1]};--ui-text-secondary:${colors[2]};--ui-text-tertiary:${colors[2]};--ui-accent:#3b82f6;--ui-stroke-tertiary:${colors[3]};--ui-bg-tertiary:${colors[3]};--codex-color-text:${colors[1]};--codex-color-text-secondary:${colors[2]};--codex-color-chat:${colors[0]};--tool-row-gap:4px}
      body{margin:0;background:${colors[0]};color:${colors[1]}}#pane{width:1050px}#split{width:360px}
      </style></head><body><div id="fixture"></div></body></html>`})
    await b.evaluate(outputFiles.find(f=>f.path.endsWith('.js')).text)
    await b.evaluate(`new Promise((resolve,reject)=>{let n=0;const check=()=>document.querySelector('[data-delegate-card] button')?resolve():n++<200?setTimeout(check,10):reject(Error('Native DelegateTool did not mount'));check()})`)
    await b.evaluate('document.fonts.ready');await settle(b);return b
  } catch(e){b.close();throw e}
}
async function enable(b,on=true){await b.evaluate(on?`document.documentElement.setAttribute('data-codex-chat-look','true')`:`document.documentElement.removeAttribute('data-codex-chat-look')`);await settle(b)}
async function key(b,key,code,windowsVirtualKeyCode,text){await b.call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,...(text?{text}:{})});await b.call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});await settle(b)}
async function click(b,expression){const p=await b.evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await b.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await settle(b)}
const cards=`document.querySelector('#pane [data-delegate-card]')`
const textFits=`(()=>{const errors=[];for(const list of document.querySelectorAll('[data-delegate-card]'))for(const row of list.children){const h=row.firstElementChild;for(const e of [...h.querySelectorAll('button,button ~ span'),row.querySelector('.tool-ticker__row:last-child > span')].filter(Boolean)){const range=document.createRange();range.selectNodeContents(e);const box=e.getBoundingClientRect();for(const text of range.getClientRects()){if(text.top<box.top-1||text.bottom>box.bottom+1)errors.push({label:e.textContent,where:'vertical text crop',text:{top:text.top,bottom:text.bottom},box:{top:box.top,bottom:box.bottom}})}const m=h.querySelector('button ~ span:not(.inline-flex)'),b=h.querySelector('button');if(m&&m.getBoundingClientRect().top<b.getBoundingClientRect().bottom&&m.getBoundingClientRect().left<b.getBoundingClientRect().right-1)errors.push({where:'title/metadata overlap'})}}return errors})()`
const probe=`(()=>{const list=${cards},row=list.firstElementChild,h=row.firstElementChild,title=h.querySelector('button'),dot=h.firstElementChild,avatar=h.lastElementChild,ticker=row.querySelector('[data-tool-ticker]'),preview=ticker.querySelector('.tool-ticker__row:last-child > span'),meta=title.nextElementSibling,r=e=>e.getBoundingClientRect(),s=e=>getComputedStyle(e);return{width:r(list).width,pane:r(h.closest('[data-slot="aui_assistant-message-content"]')).width-parseFloat(s(h.closest('[data-slot="aui_assistant-message-content"]')).paddingLeft)-parseFloat(s(h.closest('[data-slot="aui_assistant-message-content"]')).paddingRight),height:r(row).height,title:s(title).fontSize,meta:s(meta).fontSize,preview:s(preview).fontSize,border:s(row).borderTopWidth,background:s(row).backgroundColor,header:s(h).display,avatar:r(avatar).width,avatarH:r(avatar).height,avatarRadius:s(avatar).borderRadius,dot:r(dot).width,titleX:r(title).x,previewX:r(preview).x,gap:r(title).x-r(avatar).right,avatarMid:r(avatar).y+r(avatar).height/2,rowMid:r(row).y+r(row).height/2,tickerH:r(ticker).height,tickerY:r(ticker).y,previewY:r(preview).y,hasStatus:!!h.querySelector('[role="status"]'),titleOverflow:title.scrollWidth>title.clientWidth,chevron:getComputedStyle(row,'::after').content}})()`

for(const theme of ['dark','light','colored']) test(`shipping T3 avatar/title/preview row, no rectangular card (${theme})`,async()=>{
  const b=await fixture(theme)
  try{
    await enable(b);const p=await b.evaluate(probe)
    assert.equal(p.border,'0px','T3 SubagentTimelineLink has no card outline')
    assert.equal(p.width,p.pane);assert.equal(p.title,'12px');assert.equal(p.meta,'12px');assert.equal(p.preview,'11px')
    assert.equal(p.header,'contents','one row grid, not header plus separated card body')
    assert.equal(p.avatar,24);assert.equal(p.avatarH,24);assert.equal(p.avatarRadius,'50%');assert.equal(p.dot,8)
    assert.equal(p.gap,10);assert.equal(p.titleX,p.previewX);assert.ok(Math.abs(p.avatarMid-p.rowMid)<1)
    assert.ok(p.height>=45&&p.height<=48,JSON.stringify(p));assert.ok(Math.abs(p.tickerY-p.previewY)<1)
    assert.equal(p.hasStatus,true);assert.equal(p.titleOverflow,true);assert.notEqual(p.chevron,'none')
    const paint=await b.evaluate(`(()=>{const h=${cards}.firstElementChild.firstElementChild,t=h.querySelector('button'),m=t.nextElementSibling;return{title:getComputedStyle(t).color,meta:getComputedStyle(m).color,avatar:getComputedStyle(h.lastElementChild).backgroundColor,titleFamily:getComputedStyle(t).fontFamily,metaOpacity:getComputedStyle(m).opacity}})()`)
    assert.equal(paint.metaOpacity,'1');assert.notEqual(paint.avatar,'rgba(0, 0, 0, 0)');assert.ok(paint.titleFamily.includes('Arial'))
    assert.equal(await b.evaluate(`document.fonts.check('14px codicon')`),true,JSON.stringify(await b.evaluate(`({family:getComputedStyle(${cards}.querySelector('.codicon')).fontFamily,fonts:[...document.fonts].filter(f=>f.family==='codicon').map(f=>({family:f.family,status:f.status}))})`)))
    assert.deepEqual(await b.evaluate(textFits),[])
    if(theme==='dark'&&process.env.T3_SUBAGENT_SCREENSHOT){
      const clip=await b.evaluate(`(()=>{const r=${cards}.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:2}})()`)
      const shot=await b.call('Page.captureScreenshot',{format:'png',clip});await writeFile(process.env.T3_SUBAGENT_SCREENSHOT,Buffer.from(shot.data,'base64'))
      console.log('Shipping row geometry:',JSON.stringify(p))
    }
  }finally{b.close()}
})

test('source-scaled metrics and narrow split panes retain model, timer and native targets',async()=>{
  const b=await fixture('dark',1.75)
  try{
    await enable(b);const p=await b.evaluate(probe);assert.equal(p.title,'21px');assert.equal(p.meta,'21px');assert.equal(p.preview,'19.25px')
    for(const width of [480,360,280]){
      await b.evaluate(`pane.style.width='${width}px'`);await settle(b)
      const narrow=await b.evaluate(`(()=>{const list=${cards},r=e=>e.getBoundingClientRect();return{scroll:pane.scrollWidth,width:pane.clientWidth,rows:[...list.children].map(row=>{const h=row.firstElementChild,b=h.querySelector('button'),m=b.nextElementSibling;return{title:r(b).width,meta:m?.textContent,metaWidth:m?r(m).width:0,visible:[...h.children].every(e=>r(e).right<=r(row).right+1&&r(e).left>=r(row).left-1),timer:h.querySelector('button ~ span.inline-flex')?.textContent}})}})()`)
      assert.ok(narrow.scroll<=narrow.width+1,JSON.stringify(narrow));assert.ok(narrow.rows.every(r=>r.visible&&r.title>0&&r.metaWidth>0),JSON.stringify(narrow))
      assert.ok(narrow.rows[0].meta.includes('GPT-6.1-sol'));assert.ok(narrow.rows[1].meta.includes('2m'));assert.ok(narrow.rows[0].timer)
      assert.deepEqual(await b.evaluate(textFits),[])
    }
    assert.equal(await b.evaluate(`document.querySelectorAll('[data-delegate-card]').length`),2)
  }finally{b.close()}
})

test('whole-row pointer and real Tab/Enter/Space use unchanged native watch handler; disabled stays disabled',async()=>{
  const b=await fixture()
  try{
    await enable(b);await b.evaluate(`window.nativeTitle=${cards}.firstElementChild.querySelector('button');document.activeElement.blur()`)
    await key(b,'Tab','Tab',9)
    const f=await b.evaluate(`(()=>{const e=document.activeElement,r=e.closest('[data-delegate-card] > div'),s=getComputedStyle(r);return{same:e===nativeTitle,visible:e.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth)}})()`)
    assert.equal(f.same,true);assert.equal(f.visible,true);assert.equal(f.style,'solid');assert.equal(f.width,2)
    await key(b,'Enter','Enter',13,'\r');await key(b,' ','Space',32,' ')
    await click(b,`${cards}.firstElementChild.querySelector('[data-tool-ticker]')`)
    await click(b,`${cards}.firstElementChild.firstElementChild.lastElementChild`)
    assert.deepEqual(await b.evaluate(`opens`),Array.from({length:4},()=>({id:'child',options:{watch:true,parentSessionId:'stored-parent'}})))
    const n=await b.evaluate(`opens.length`);await click(b,`${cards}.children[3]`);assert.equal(await b.evaluate(`opens.length`),n)
    assert.equal(await b.evaluate(`${cards}.children[3].querySelector('button').disabled`),true)
    assert.equal(await b.evaluate(`getComputedStyle(${cards}.children[3],'::after').content`),'none')
    assert.equal(await b.evaluate(`ordinary.querySelector('a').getAttribute('href')`),'#native-details')
    await enable(b,false);assert.equal(await b.evaluate(`${cards}.firstElementChild.querySelector('button')===nativeTitle`),true)
  }finally{b.close()}
})

test('real native state: running activity, completed summary, failure and cancellation normalization',async()=>{
  const b=await fixture()
  try{
    const before=await b.evaluate(`(()=>{const l=${cards};return{fail:getComputedStyle(l.children[2].querySelector('svg')).color,done:getComputedStyle(l.children[1].querySelector('svg')).color}})()`)
    await enable(b)
    assert.equal(await b.evaluate(`${cards}.children[1].querySelector('.tool-ticker__row:last-child').textContent`),'**Audit read-only captured.** Verified 10 real results from native summary')
    assert.equal(await b.evaluate(`getComputedStyle(${cards}.children[2].querySelector('svg')).color`),before.fail)
    assert.equal(await b.evaluate(`getComputedStyle(${cards}.children[1].querySelector('svg')).color`),before.done)
    assert.notEqual(before.fail,before.done)
    const initial=await b.evaluate(probe)
    await b.evaluate(`agents[0]={...agents[0],stream:[...agents[0].stream,{text:'Newest actual tool activity'}]};updateAgents([...agents]);completeAgent({subagent_id:'delegate-tool:call:4',status:'cancelled',summary:'Cancelled by operator',duration_seconds:12});`);await settle(b)
    const after=await b.evaluate(probe);assert.equal(after.height,initial.height);assert.ok(Math.abs(after.tickerY-after.previewY)<1)
    assert.equal(await b.evaluate(`${cards}.querySelector('.tool-ticker__row:last-child').textContent`),'Newest actual tool activity')
    assert.equal(await b.evaluate(`${cards}.children[4].querySelector('[role="status"]')!==null`),false)
    assert.equal(await b.evaluate(`${cards}.children[4].querySelector('svg').getAttribute('aria-label')`),'Failed','preserve native interrupted label, do not forge green completion')
    assert.equal(await b.evaluate(`${cards}.children[4].querySelector('.tool-ticker__row:last-child').textContent`),'Cancelled by operator')
    await b.evaluate(`window.liveTitle=${cards}.querySelector('button');completeAgent({subagent_id:'delegate-tool:call:0',status:'completed',summary:'Verified report supplied by the native completion event',duration_seconds:126})`);await settle(b)
    assert.equal(await b.evaluate(`${cards}.querySelector('button')===liveTitle`),true)
    assert.equal(await b.evaluate(`${cards}.firstElementChild.querySelector('[role="status"]')!==null`),false)
    assert.equal(await b.evaluate(`${cards}.firstElementChild.querySelector('.tool-ticker__row:last-child').textContent`),'Verified report supplied by the native completion event')
    assert.ok(await b.evaluate(`${cards}.firstElementChild.firstElementChild.querySelector('button + span').textContent.includes('2m')`))
    if(process.env.T3_SUBAGENT_SCREENSHOT){const clip=await b.evaluate(`(()=>{const r=${cards}.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:2}})()`);const shot=await b.call('Page.captureScreenshot',{format:'png',clip});await writeFile(process.env.T3_SUBAGENT_SCREENSHOT.replace('.png','-settled.png'),Buffer.from(shot.data,'base64'))}
    await b.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await settle(b)
    assert.equal(await b.evaluate(`${cards}.firstElementChild.getAnimations({subtree:true}).filter(a=>a.playState==='running').length`),0)
  }finally{b.close()}
})

test('theme/font changes, disable and stylesheet hot reload restore native nodes without orphan DOM',async()=>{
  const b=await fixture()
  try{
    const read=`(()=>{const row=${cards}.firstElementChild,s=e=>{const c=getComputedStyle(e);return[c.fontSize,c.color,c.backgroundColor,c.borderRadius,c.opacity,c.padding,c.display]};return{row:s(row),title:s(row.querySelector('button')),composer:s(composer),details:s(ordinary)}})()`
    const before=await b.evaluate(read);await enable(b)
    await b.evaluate(`window.retained=[...document.querySelectorAll('[data-delegate-card] *')];window.count=document.querySelectorAll('*').length;document.documentElement.style.setProperty('--dt-font-sans','Georgia');document.documentElement.style.setProperty('--codex-color-text','rgb(10, 70, 90)')`);await settle(b)
    assert.ok(await b.evaluate(`${cards}.querySelector('button')&&getComputedStyle(${cards}.querySelector('button')).fontFamily.includes('Georgia')`))
    assert.equal(await b.evaluate(`getComputedStyle(${cards}.querySelector('button')).color`),'rgb(10, 70, 90)')
    await b.evaluate(`document.documentElement.style.removeProperty('--dt-font-sans');document.documentElement.style.removeProperty('--codex-color-text')`)
    for(let i=0;i<3;i++){await enable(b,false);await enable(b);await b.evaluate(`(()=>{const old=document.getElementById('shipped-style'),fresh=old.cloneNode(true);old.replaceWith(fresh)})()`)}
    assert.equal(await b.evaluate(`document.querySelectorAll('*').length===count&&retained.every(e=>e.isConnected)`),true)
    const on=await b.evaluate(read);assert.deepEqual(on.composer,before.composer);assert.deepEqual(on.details,before.details)
    await enable(b,false);assert.deepEqual(await b.evaluate(read),before)
  }finally{b.close()}
})

test('T3 palette bridge roles paint the native avatar and metadata without changing geometry',async()=>{
  const b=await fixture()
  try{
    await enable(b);const before=await b.evaluate(probe)
    // Distinct synthetic role inputs verify consumers, not the upstream palette.
    // t3-theme-paint.test.mjs independently compiles T3's actual CSS for producers.
    await b.evaluate(`(()=>{const r=document.documentElement;for(const[k,v]of Object.entries({'--codex-subagent-text':'rgb(30, 60, 90)','--codex-subagent-meta':'rgb(90, 120, 150)','--codex-subagent-avatar-background':'rgb(40, 50, 60)','--codex-subagent-avatar-border':'rgb(70, 80, 90)','--codex-subagent-hover':'rgb(20, 30, 40)','--codex-subagent-focus':'rgb(50, 100, 150)'}))r.style.setProperty(k,v)})()`)
    // Read the final paint, not the native transition-colors' first frame.
    await settle(b)
    const p=await b.evaluate(`(()=>{const h=${cards}.firstElementChild.firstElementChild,s=e=>getComputedStyle(e);return{title:s(h.querySelector('button')).color,meta:s(h.querySelector('button + span')).color,preview:s(h.parentElement.querySelector('.tool-ticker__row:last-child > span')).color,avatar:s(h.lastElementChild).backgroundColor,border:s(h.lastElementChild).borderTopColor}})()`)
    assert.deepEqual(p,{title:'rgb(30, 60, 90)',meta:'rgb(90, 120, 150)',preview:'rgb(90, 120, 150)',avatar:'rgb(40, 50, 60)',border:'rgb(70, 80, 90)'})
    await b.evaluate(`${cards}.querySelector('button').focus()`)
    assert.equal(await b.evaluate(`getComputedStyle(${cards}.firstElementChild).outlineColor`),'rgb(50, 100, 150)')
    const rect=await b.evaluate(`(()=>{const r=${cards}.firstElementChild.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',...rect});await settle(b)
    assert.equal(await b.evaluate(`getComputedStyle(${cards}.firstElementChild).backgroundColor`),'rgb(20, 30, 40)')
    const after=await b.evaluate(probe)
    for(const k of ['width','height','title','meta','preview','avatar','avatarH','dot','titleX','previewX','gap','tickerH'])assert.equal(after[k],before[k],k)
  }finally{b.close()}
})
