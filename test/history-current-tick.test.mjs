import assert from 'node:assert/strict'
import test from 'node:test'
import {chromium,waitForRendered} from './helpers/chromium.mjs'
import {loadPluginInternals} from './helpers/load-plugin.mjs'

// Intentional approved contract migration, not v14 color equivalence:
// ACCEPTANCE.md:5 supersedes the old opaque palette and instantaneous motion.
// Independent T3 recipe: 2359643cffa6ba9ee84d6f2694b935de54a8013e,
// apps/web/src/components/chat/TimelineMinimap.tsx:217-241 (MIT), SHA-256
// 34d7da77f82dd7656fa4d4837eb60ec62620f6ad893eb84fb7f63bb6e47743c0.
// bg-muted-foreground/25 or /60, bg-foreground/55 in-view overlay;
// transform and overlay opacity each animate for 150ms. Hermes role mapping
// uses ui-text-secondary/primary. Never derive this reference from plugin CSS.
const referenceCSS=`
 #t3-reference{background:var(--ui-chat-surface-background)}
 .t3-reference-bar{display:block;position:relative;width:24px;height:2px;
  border-radius:999px;transform-origin:left;transform:scaleX(var(--reference-scale,.333));
  background:color-mix(in srgb,var(--ui-text-secondary) 25%,transparent);
  transition:transform 150ms cubic-bezier(.4,0,.2,1)}
 .t3-reference-bar[data-active]{background:color-mix(in srgb,var(--ui-text-secondary) 60%,transparent)}
 .t3-reference-overlay{position:absolute;inset:0;border-radius:inherit;
  background:color-mix(in srgb,var(--ui-text-primary) 55%,transparent);
  opacity:0;transition:opacity 150ms cubic-bezier(.4,0,.2,1)}
 .t3-reference-bar[data-in-view=true]>.t3-reference-overlay{opacity:1}
`

test('approved T3 migration: strict theme-aware RGBA, persistent current overlay and 150ms motion',async()=>{
 const browser=await chromium()
 try{
  const {CSS}=await loadPluginInternals(['CSS'])
  const {frameTree}=await browser.call('Page.getFrameTree')
  await browser.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look="true"><head>
   <style>:root{--ui-text-primary:#fcfcfc;--ui-text-secondary:#aaa;--ui-chat-surface-background:#111}
    .thread-timeline-tick{display:flex;height:7px}[data-slot=timeline-bar]{display:block}
   </style><style>${CSS}</style><style>${referenceCSS}</style></head><body>
   <div data-codex-history-rail><div data-slot="thread-timeline-ticks"><div class="thread-timeline-track">
    ${['a','b','c'].map(id=>`<button id="${id}" class="thread-timeline-tick"><span data-slot="timeline-bar" class="dither"></span></button>`).join('')}
   </div></div></div>
   <div id="t3-reference">${['a','b','c'].map(id=>`<span id="reference-${id}" class="t3-reference-bar" data-in-view="false"><span class="t3-reference-overlay"></span></span>`).join('')}</div>
   </body></html>`})
  await browser.evaluate(`
   window.setRailState=(current,hover)=>{
    document.querySelector('[data-codex-history-rail]').toggleAttribute('data-codex-history-open',hover!==null);
    for(const id of ['a','b','c']){
     const button=document.getElementById(id),reference=document.getElementById('reference-'+id);
     if(id===current)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
     button.toggleAttribute('data-codex-history-hover',id===hover);
     reference.setAttribute('data-in-view',String(id===current));
     reference.toggleAttribute('data-active',id===hover);
     const scale=hover===null?'.333':id===hover?'1':'.667';
     button.firstElementChild.style.setProperty('--codex-history-scale',scale);
     reference.style.setProperty('--reference-scale',scale);
    }
   };
   window.snap=()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');
    const pixels=layers=>{
     context.clearRect(0,0,1,1);
     for(const [color,opacity] of layers){context.fillStyle=color;context.globalAlpha=Number(opacity);context.fillRect(0,0,1,1)}
     return [...context.getImageData(0,0,1,1).data];
    };
    const sample=(bar,overlay)=>{
     const base=getComputedStyle(bar),top=overlay;
     const background=getComputedStyle(document.documentElement).getPropertyValue('--ui-chat-surface-background');
     return {
      baseRGBA:pixels([[base.backgroundColor,1]]),overlayRGBA:pixels([[top.backgroundColor,1]]),
      compositeRGBA:pixels([[background,1],[base.backgroundColor,base.opacity],[top.backgroundColor,top.opacity]]),
      opacity:base.opacity,overlayOpacity:top.opacity,width:base.width,
      transitionProperty:base.transitionProperty,transitionDuration:base.transitionDuration,
      overlayTransitionProperty:top.transitionProperty,overlayTransitionDuration:top.transitionDuration
     };
    };
    return ['a','b','c'].map(id=>{
     const bar=document.getElementById(id).firstElementChild,reference=document.getElementById('reference-'+id);
     return {actual:sample(bar,getComputedStyle(bar,'::after')),reference:sample(reference,getComputedStyle(reference.firstElementChild))};
    });
   };
  `)
  const widths=(await browser.evaluate('snap()')).map(x=>x.actual.width)
  for(const width of widths)assert.ok(Number.parseFloat(width)>0,'fixture bar must have a real layout width')
  const check=async(label,current,hover)=>{
   await browser.evaluate(`setRailState(${JSON.stringify(current)},${JSON.stringify(hover)})`)
   const endpoints=['a','b','c'].map(id=>id===current?'1':'0')
   await waitForRendered(browser,`snap().every((pair,i)=>pair.actual.overlayOpacity===${JSON.stringify(endpoints)}[i]&&pair.reference.overlayOpacity===${JSON.stringify(endpoints)}[i])`,label+' overlay endpoints',1500)
   const rows=await browser.evaluate('snap()')
   for(const [i,{actual,reference}] of rows.entries()){
    const id=['a','b','c'][i],context=label+' / '+id
    assert.equal(reference.baseRGBA[3],id===hover?153:64,context+' independent base alpha')
    assert.equal(reference.overlayRGBA[3],140,context+' independent overlay alpha')
    // Canvas performs RGBA8 quantization and source-over composition. Compare
    // every channel exactly, without epsilon, rounding or CSS-string matching.
    for(const key of ['baseRGBA','overlayRGBA','compositeRGBA'])assert.deepEqual(actual[key],reference[key],context+' '+key)
    assert.equal(actual.compositeRGBA[3],255,context+' opaque chat composite')
    assert.equal(actual.opacity,'1',context+' base opacity must not encode hover or width')
    assert.equal(actual.overlayOpacity,endpoints[i],context+' native current overlay')
    assert.equal(actual.width,widths[i],context+' layout width stays fixed while scale changes')
    assert.equal(actual.transitionProperty,'transform',context+' no width/color transition')
    assert.equal(actual.transitionDuration,'0.15s',context+' T3 transform duration')
    assert.equal(actual.overlayTransitionProperty,'opacity',context+' overlay animation channel')
    assert.equal(actual.overlayTransitionDuration,'0.15s',context+' T3 overlay duration')
   }
   return rows
  }
  const composites=[]
  for(const theme of [
   {name:'dark',primary:'#fcfcfc',secondary:'#aaa',background:'#111'},
   {name:'light',primary:'#202020',secondary:'#5e5e5e',background:'#fff'}
  ]){
   await browser.evaluate(`(()=>{const root=document.documentElement;root.style.setProperty('--ui-text-primary',${JSON.stringify(theme.primary)});root.style.setProperty('--ui-text-secondary',${JSON.stringify(theme.secondary)});root.style.setProperty('--ui-chat-surface-background',${JSON.stringify(theme.background)})})()`)
   // On theme switch b is still current: verify that endpoint before resetting.
   if(theme.name==='light')await check('light retained current','b',null)
   await check(theme.name+' idle',null,null)
   const current=await check(theme.name+' current','a',null)
   const hover=await check(theme.name+' hover other item','a','b')
   assert.deepEqual(hover[0].actual.compositeRGBA,current[0].actual.compositeRGBA,'hovering b preserves current a overlay and color')
   assert.notDeepEqual(hover[1].actual.baseRGBA,current[1].actual.baseRGBA,'hover must change b base paint')
   await check(theme.name+' hover removed','a',null)
   composites.push((await check(theme.name+' changed aria-current','b',null))[1].actual.compositeRGBA)
  }
  assert.notDeepEqual(composites[0],composites[1],'real theme tokens must change the rendered composite')
 }finally{browser.close()}
})
