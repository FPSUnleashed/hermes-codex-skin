import { referenceFile } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {chromium} from './helpers/chromium.mjs'
import {nativeBackgroundBundle,shippingCSS,nativeProvenance} from './helpers/native-background.mjs'

const nativeCSSPath=referenceFile('HERMES_INSTALLED_ROW_CSS')
const nativeCSS=await readFile(nativeCSSPath,'utf8')
const bundle=await nativeBackgroundBundle(),css=await shippingCSS()
const baselineCSS=await shippingCSS(referenceFile('BACKGROUND_BASELINE_BUNDLE'))
const header='#short [data-slot="aui_background-result"] > [data-conversation-scaffold]'
const label=`${header} button [class*="conversation-tool-font-size"]`
async function settle(b){await b.evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`)}
async function fixture(theme='dark',scale=1,family='sans-serif'){
  const b=await chromium()
  try{
    await b.call('Emulation.setDeviceMetricsOverride',{width:900,height:1000,deviceScaleFactor:1,mobile:false})
    const fg=theme==='light'?'#242424':'#e8e8e8',bg=theme==='light'?'#fff':'#111'
    await b.call('Page.setDocumentContent',{frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look="true"><head><style>${nativeCSS}</style><style id="skin">${css}</style><style>
      :root{--chat-text-scale:${scale};--dt-font-sans:${family};--font-sans:var(--dt-font-sans);--ui-text-primary:${fg};--ui-text-secondary:${fg};--ui-base:${fg};--ui-text-tertiary:#777;--ui-accent:#3b82f6;--ui-stroke-tertiary:#555;--ui-chat-surface-background:${bg};--message-text-indent:20px}
      body{color:${fg};background:${bg}}#pane{width:720px}
      </style></head><body><div id="fixture"></div></body></html>`})
    await b.evaluate(bundle)
    await b.evaluate(`new Promise((resolve,reject)=>{let n=0;const f=()=>document.querySelector('#short button')?resolve():n++<100?setTimeout(f,10):reject(Error('Native BackgroundResult did not mount'));f()})`)
    await settle(b);return b
  }catch(e){b.close();throw e}
}
async function click(b,selector){
  const p=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()`)
  assert.equal(p.hit,true,'native disclosure is hit-testable')
  await b.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:p.x,y:p.y})
  await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:p.x,y:p.y})
  await settle(b)
}
async function key(b,key,code,n,text){
  await b.call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:n,...(text?{text}:{})})
  await b.call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:n});await settle(b)
}
const metricProbe=`(()=>{const s=e=>{const x=getComputedStyle(e);return{size:x.fontSize,line:x.lineHeight,family:x.fontFamily,color:x.color,weight:x.fontWeight,opacity:x.opacity}},header=document.querySelector(${JSON.stringify(header)}),label=document.querySelector(${JSON.stringify(label)}),button=header.querySelector('button'),caret=button.lastElementChild;return{label:s(label),header:s(header),height:button.getBoundingClientRect().height,meta:s(header.querySelector('.tabular-nums')),caret:getComputedStyle(caret).opacity,rootIndent:getComputedStyle(header.parentElement).paddingLeft,toolToken:getComputedStyle(header).getPropertyValue('--conversation-tool-font-size')}})()`

for(const theme of ['light','dark'])for(const scale of [1,1.75])for(const family of ['sans-serif','serif']){
  test(`native completion header T3 metrics/containment (${theme}, ${scale}x, ${family})`,async()=>{
    const b=await fixture(theme,scale,family)
    try{
      const m=await b.evaluate(metricProbe)
      console.log('BACKGROUND_METRICS '+JSON.stringify({theme,scale,family,...m}))
      assert.equal(parseFloat(m.label.size),14*scale,'same T3 label type, not native tiny scaffold token')
      assert.ok(Math.abs(parseFloat(m.label.line)-22.75*scale)<.06,JSON.stringify(m))
      assert.equal(m.header.opacity,'1','no native compounded scaffold fade')
      assert.equal(m.label.color,m.header.color)
      assert.equal(parseFloat(m.meta.size),12*scale)
      assert.ok(m.height>=24)
      assert.ok(+m.caret>=.6)
      assert.equal(m.rootIndent,'20px','do not alter native result indentation')
      assert.ok(m.label.family.includes(family),'native selected family propagates')
      await b.evaluate(`pane.style.width='280px'`)
      const rows=await b.evaluate(`['short','long','empty','process'].map(id=>{const root=document.querySelector('#'+id+' [data-slot="aui_background-result"]'),header=root.firstElementChild,label=header.querySelector('[class*="conversation-tool-font-size"]'),range=document.createRange();range.selectNodeContents(label);const text=range.getBoundingClientRect(),anc=[];for(let e=label;e;e=e.parentElement){const s=getComputedStyle(e),r=e.getBoundingClientRect();if(['hidden','auto','scroll','clip'].includes(s.overflowY))anc.push({top:r.top,bottom:r.bottom});if(e===header)break}return{id,size:getComputedStyle(label).fontSize,overflow:getComputedStyle(label).textOverflow,clippedHoriz:label.scrollWidth>label.clientWidth,text:{top:text.top,bottom:text.bottom},anc,scroll:root.scrollWidth,width:root.clientWidth}})`)
      for(const r of rows){
        assert.equal(parseFloat(r.size),14*scale,JSON.stringify(r))
        assert.ok(r.scroll<=r.width+1,JSON.stringify(r))
        for(const a of r.anc)assert.ok(r.text.top>=a.top-.1&&r.text.bottom<=a.bottom+.1,JSON.stringify(r))
      }
      const glyph=await b.evaluate(`(()=>{const svg=document.querySelector('#process button svg'),cell=svg.parentElement;return{cell:cell.getBoundingClientRect().width,icon:svg.getBoundingClientRect().width}})()`)
      assert.deepEqual(glyph,{cell:24,icon:16},'native background process keeps its own glyph with T3 geometry')
      const stamps=await b.evaluate(`['short','long','empty','process'].map(id=>{const stamp=document.querySelector('#'+id+' time'),range=document.createRange();range.selectNodeContents(stamp);const text=range.getBoundingClientRect(),row=stamp.closest('[class~="group/disclosure-row"]').getBoundingClientRect();return{id,textTop:text.top,textBottom:text.bottom,rowTop:row.top,rowBottom:row.bottom}})`)
      for(const s of stamps)assert.ok(s.textTop>=s.rowTop-.1&&s.textBottom<=s.rowBottom+.1,JSON.stringify(s))
      assert.equal(rows.find(r=>r.id==='long').overflow,'ellipsis')
      assert.equal(rows.find(r=>r.id==='long').clippedHoriz,true,'long native label truncates rather than pushing caret away')
      assert.deepEqual(await b.evaluate('errors'),[])
    }finally{b.close()}
  })
}

test('native completion report opens/collapses with pointer, Enter and Space without remounting',async()=>{
  const b=await fixture()
  try{
    await b.evaluate(`window.nativeRoot=document.querySelector('#short [data-slot="aui_background-result"]');window.nativeButton=nativeRoot.querySelector('button');window.nativeLabel=nativeButton.querySelector('[class*="conversation-tool-font-size"]');void 0`)
    assert.equal(await b.evaluate(`nativeButton.getAttribute('aria-expanded')`),'false')
    await click(b,'#short button')
    assert.equal(await b.evaluate(`nativeButton.getAttribute('aria-expanded')==='true'&&!!nativeRoot.querySelector('[data-report-adapter] p').offsetHeight`),true)
    await key(b,'Enter','Enter',13,'\r')
    assert.equal(await b.evaluate(`nativeButton.getAttribute('aria-expanded')==='false'&&!nativeRoot.querySelector('[data-report-adapter]')`),true)
    await key(b,' ','Space',32,' ')
    assert.equal(await b.evaluate(`nativeButton.getAttribute('aria-expanded')==='true'&&!!nativeRoot.querySelector('code')`),true)
    await click(b,'#short button')
    assert.equal(await b.evaluate(`nativeButton.getAttribute('aria-expanded')==='false'&&document.querySelector('#short button')===nativeButton&&nativeRoot===document.querySelector('#short [data-slot="aui_background-result"]')&&nativeLabel===nativeButton.querySelector('[class*="conversation-tool-font-size"]')`),true)
    await click(b,'#process button')
    assert.equal(await b.evaluate(`document.querySelector('#process pre').textContent`),'command output')
    assert.equal(await b.evaluate(`document.querySelector('#empty button').disabled&&!document.querySelector('#empty button').hasAttribute('aria-expanded')`),true)
    assert.deepEqual(await b.evaluate('errors'),[])
  }finally{b.close()}
})

test('native keyboard focus is visible, selected fonts update, disable restores the exact native header',async()=>{
  const b=await fixture()
  try{
    await b.evaluate(`document.activeElement.blur();document.documentElement.removeAttribute('data-codex-chat-look');void 0`)
    const native=await b.evaluate(metricProbe)
    await b.evaluate(`document.documentElement.dataset.codexChatLook='true'`)
    await key(b,'Tab','Tab',9)
    const focus=await b.evaluate(`(()=>{const b=document.activeElement,s=getComputedStyle(b);return{native:b===document.querySelector('#short button'),visible:b.matches(':focus-visible'),style:s.outlineStyle,width:s.outlineWidth,offset:s.outlineOffset}})()`)
    assert.deepEqual(focus,{native:true,visible:true,style:'solid',width:'2px',offset:'-2px'})
    for(const family of ['serif','monospace','sans-serif']){
      await b.evaluate(`document.documentElement.style.setProperty('--dt-font-sans',${JSON.stringify(family)})`)
      assert.ok((await b.evaluate(metricProbe)).label.family.includes(family))
    }
    await b.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
    assert.deepEqual(await b.evaluate(metricProbe),native)
    await key(b,'Enter','Enter',13,'\r')
    assert.equal(await b.evaluate(`document.querySelector('#short button').getAttribute('aria-expanded')`),'true','disable never takes native disclosure authority away')
  }finally{b.close()}
})

const untouchedProbe=`(()=>{const selectors=['#short [data-report-adapter] p','#short [data-report-adapter] pre','#short [data-report-adapter] code','#controls','#generic [data-slot="aui_system-message-root"]','#steer [data-slot="aui_system-message-root"]','#slash [data-slot="aui_system-message-root"]','[role="alert"]','#approval','#before','#after'];return selectors.map(selector=>{const e=document.querySelector(selector),s=getComputedStyle(e);return{selector,display:s.display,color:s.color,opacity:s.opacity,size:s.fontSize,line:s.lineHeight,family:s.fontFamily,weight:s.fontWeight,tool:s.getPropertyValue('--conversation-tool-font-size'),scaffold:s.getPropertyValue('--conversation-scaffold-text'),padding:s.padding,margin:s.margin}})})()`
test('header-only source delta leaves expanded prose/code and unrelated notices/errors/approvals unchanged',async()=>{
  const b=await fixture('light',1.75,'serif')
  try{
    await click(b,'#short button')
    const actual=await b.evaluate(untouchedProbe)
    await b.evaluate(`document.querySelector('#skin').textContent=${JSON.stringify(baselineCSS)}`)
    const frozen=await b.evaluate(untouchedProbe)
    assert.deepEqual(actual,frozen,'only the native background-result scaffold header is restyled')
    assert.equal(actual.find(x=>x.selector.endsWith(' code')).family.includes('mono'),true,'specialized code family survives')
    await click(b,'#approval')
    assert.equal(await b.evaluate('approved'),1)
    console.log('BACKGROUND_NATIVE_PROVENANCE '+JSON.stringify(nativeProvenance))
  }finally{b.close()}
})
