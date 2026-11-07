import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

// Native timeline structure verified against the installed renderer, including
// hover events that used to build/scroll the full popover. No React internals.
const surface = (id, count = 6) => `<section data-session-anchor="session-tile:${id}" data-chat-surface>
  <div data-slot="aui_thread-viewport"><div data-slot="aui_thread-content">${Array.from({ length: count }, (_, i) => `<div data-slot="aui_turn-pair">
    <div data-role="user" data-slot="aui_user-message-root" data-message-id="${id}-${i}"><div data-slot="aui_user-message-text">Question ${i}</div></div>
    <div data-role="assistant" data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content"><div class="aui-md">Interim must not win</div></div></div>
    <div data-role="assistant" data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content"><div class="aui-md"><p>Answer <strong>${id}-${i}</strong></p><p>Second paragraph, with details.</p></div></div><div data-slot="aui_msg-actions"></div></div>
  </div>`).join('')}</div></div>
  <div data-slot="thread-timeline" data-suppress-pane-reveal role="navigation" aria-label="Conversation timeline"><div data-slot="thread-timeline-ticks"><div class="thread-timeline-track" style="height:${count * 7}px">${Array.from({ length: count }, (_, i) => `<div data-slot="tooltip-wrapper" style="display:contents"><button class="thread-timeline-tick" data-timeline-id="${id}-${i}" data-timeline-index="${i}" ${i === count - 1 ? 'aria-current="location"' : ''} aria-label="Question ${i}" type="button" style="top:${i * 7}px;height:7px"><span data-slot="timeline-bar" class="${i === count - 1 ? 'active' : 'dither'}"></span></button></div>`).join('')}</div></div><div data-slot="thread-timeline-popover"></div></div></section>`

async function setup(count = 6) {
  const browser = await chromium()
  const { call, evaluate } = browser
  try {
    await call('Emulation.setDeviceMetricsOverride', { width: 2000, height: 700, deviceScaleFactor: 1, mobile: false })
    const { frameTree } = await call('Page.getFrameTree')
    await call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<!doctype html><html data-codex-chat-look="true"><head><style>
    :root{--ui-text-primary:#202020;--ui-text-secondary:#5e5e5e;--ui-chat-surface-background:#fff;--ui-widget-surface-background:#fff;--ui-stroke-secondary:#e2e2e2}
    *{box-sizing:border-box}body{margin:0;display:flex;font-family:Arial}button{font:inherit;border:0;background:none}
    [data-chat-surface]{position:relative;flex:0 0 auto;width:900px;height:700px;overflow:hidden;isolation:isolate}
    [data-slot=aui_thread-viewport]{height:600px;overflow:auto}[data-slot=aui_turn-pair]{height:180px;padding:30px 60px}
    [data-slot=thread-timeline]{position:absolute;right:0;top:50%;transform:translateY(-50%);z-index:40}
    [data-slot=thread-timeline-ticks]{width:48px;height:100%;overflow:hidden auto;display:block}
    [data-slot=thread-timeline-track]{position:relative;width:100%}
    [data-slot=tooltip-wrapper]{display:contents}
    .thread-timeline-tick{display:flex;position:absolute;align-items:center;justify-content:flex-end;width:100%;padding:0 4px 0 0}
    .thread-timeline-tick>[data-slot=timeline-bar]{width:12px;height:1px;background:#777}
    [data-slot=thread-timeline-popover]{position:absolute;right:100%;width:320px;max-height:300px;overflow:auto}
    </style></head><body>${surface('a', count)}${surface('b', count)}</body></html>` })
    // Native Tip uses asChild: the React tooltip component creates no wrapper.
    await evaluate(`document.querySelectorAll('[data-slot="tooltip-wrapper"]').forEach(wrapper=>wrapper.replaceWith(...wrapper.childNodes))`)
    const source = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.fixturePlugin = {')
    await evaluate(`(() => {
      const host={state:{activeSessionId:{get:()=>null},profile:{get:()=> 'default'}}},PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},useEffect=()=>{},jsx=()=>null;
      window.fixtureHost=host;
      window.stateListeners=[];
      host.state.activeSessionId.subscribe=callback=>{stateListeners.push(callback);callback();return ()=>{stateListeners=stateListeners.filter(item=>item!==callback)}};
      ${source}
      const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);
      window.nativeOpens=0;window.jumps=[];window.nativeKeys=0;
      for(const rail of document.querySelectorAll('[data-slot="thread-timeline"]')) {
        rail.addEventListener('mouseover',()=>{window.nativeOpens++;rail.querySelector('[data-slot="thread-timeline-popover"]').textContent='ALL MESSAGES'});
        // Radix's trigger opens on pointer movement, not just mouseover.
        document.addEventListener('pointermove',event=>{if(rail.contains(event.target))window.nativeOpens++});
        [...rail.querySelectorAll('.thread-timeline-tick')].forEach((b,i)=>b.onclick=()=>window.jumps.push(rail.closest('[data-session-anchor]').dataset.sessionAnchor+':'+i));
        rail.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){window.nativeKeys++;const b=event.target.closest('.thread-timeline-tick');const all=[...rail.querySelectorAll('.thread-timeline-tick')];all[Math.min(all.length-1,all.indexOf(b)+1)]?.focus()}});
      }
      const fixtureSections=new Map(['a','b'].map(id=>[id,document.querySelector('[data-session-anchor="session-tile:'+id+'"]')]));
      window.dispose=installBehaviorRuntime();
      window.rail=(id='a')=>fixtureSections.get(id).querySelector('[data-slot="thread-timeline"]');
      window.ticks=(id='a')=>[...rail(id).querySelectorAll('.thread-timeline-track button.thread-timeline-tick')];
      window.tickPoint=(i,id='a')=>{const r=ticks(id)[i].getBoundingClientRect();return {x:r.left+3,y:r.top+r.height/2}};
      window.preview=()=>document.querySelector('[data-codex-history-preview]:not([hidden])');
    })()`)
    return browser
  } catch (error) { browser.close(); throw error }
}

test('left history rail: proximity hover, one question/reply card, native clicks, isolated splits and cleanup', { timeout: 40000 }, async () => {
  const { call, evaluate, close } = await setup()
  const settle = () => evaluate('new Promise(r=>setTimeout(r,220))')
  const moveTick = async (i, id = 'a') => { const p = await evaluate(`tickPoint(${i},${JSON.stringify(id)})`); await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p }); await settle(); return p }
  try {
    await settle()
    const idle = await evaluate(`(()=>{const track=rail().querySelector('.thread-timeline-track');const tick=ticks()[0];return {left:rail().getBoundingClientRect().left,width:tick.firstElementChild.getBoundingClientRect().width,height:tick.firstElementChild.getBoundingClientRect().height,trackHeight:track.style.height,offsets:ticks().map(t=>t.style.top)}})()`)
    assert.ok(Math.abs(idle.width - 24*.333) < .05)
    assert.deepEqual({...idle,width:0}, { left: 16, width: 0, height: 2, trackHeight: '42px', offsets: ['0px','7px','14px','21px','28px','35px'] })
    assert.deepEqual(await evaluate(`ticks().map(b=>getComputedStyle(b.firstElementChild,'::after').opacity)`),['0','0','0','0','0','1'],'current location remains owned by native aria-current')
    const p = await moveTick(3)
    const widths = await evaluate('ticks().map(b=>b.firstElementChild.getBoundingClientRect().width)')
    assert.ok(widths[0] < widths[1] && widths[1] < widths[2] && widths[2] < widths[3])
    assert.ok(Math.abs(widths[3] - 24) < .05)
    assert.ok(Math.abs(widths[2] - widths[4]) < .05 && Math.abs(widths[1] - widths[5]) < .05)
    assert.equal(await evaluate(`getComputedStyle(ticks()[5].firstElementChild,'::after').opacity`),'1','current overlay persists independently of the hovered item')
    const hover = await evaluate(`(()=>{const c=preview(),r=c.getBoundingClientRect(),t=ticks()[3].getBoundingClientRect();return {count:document.querySelectorAll('[data-codex-history-preview]:not([hidden])').length,text:c.textContent,bold:c.querySelector('strong')?.textContent,left:r.left,width:r.width,center:r.top+r.height/2,tickCenter:t.top+t.height/2,scroll:[...document.querySelectorAll('[data-slot="aui_thread-viewport"]')].map(v=>v.scrollTop),nativeOpens}})()`)
    assert.equal(hover.count, 1)
    assert.match(hover.text, /Question 3/); assert.match(hover.text, /Answer a-3/); assert.doesNotMatch(hover.text, /Question 2|Interim|Answer b/)
    assert.equal(hover.bold, 'a-3'); assert.equal(hover.left, 52); assert.equal(hover.width, 320)
    assert.deepEqual(await evaluate(`(()=>{return [getComputedStyle(preview()).backgroundColor,getComputedStyle(preview().querySelector('[data-codex-history-answer]')).color]})()`), ['rgb(255, 255, 255)','rgb(94, 94, 94)'])
    assert.ok(Math.abs(hover.center-hover.tickCenter)<2)
    assert.deepEqual(hover.scroll, [0,0]); assert.equal(hover.nativeOpens, 0, 'native all-message list must never open or scroll')
    if (process.env.CODEX_HISTORY_SCREENSHOT) {
      const { data } = await call('Page.captureScreenshot', { format: 'png' })
      await writeFile(process.env.CODEX_HISTORY_SCREENSHOT, Buffer.from(data, 'base64'))
    }
    for (const type of ['mousePressed','mouseReleased']) await call('Input.dispatchMouseEvent', {type, ...p, button:'left',clickCount:1})
    assert.deepEqual(await evaluate('jumps'), ['session-tile:a:3'])
    await moveTick(1)
    assert.match(await evaluate('preview().textContent'), /Answer a-1/)
    await evaluate('ticks()[2].focus()'); await settle()
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40})
    assert.equal(await evaluate('document.activeElement===ticks()[3]'), true, 'native keyboard focus navigation remains owned by the button rail')
    assert.equal(await evaluate('nativeKeys'), 1)
    await moveTick(3, 'b')
    assert.match(await evaluate('preview().textContent'), /Answer b-3/)
    assert.equal(await evaluate('document.querySelectorAll("[data-codex-history-preview]:not([hidden])").length'), 1)
    await call('Input.dispatchMouseEvent', {type:'mouseMoved',x:950,y:650}); await settle()
    assert.equal(await evaluate('preview()'), null)
    await evaluate('ticks()[2].focus()'); await settle()
    assert.match(await evaluate('preview().textContent'), /Answer a-2/)
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    assert.equal(await evaluate('preview()'), null)
    await evaluate('document.activeElement.blur();dispose()'); await settle()
    assert.equal(await evaluate('document.querySelectorAll("[data-codex-history-preview], [data-codex-history-rail]").length'), 0)
    assert.equal(await evaluate('rail().getBoundingClientRect().left'), 852, 'native right-hand rail restored on disable')
  } finally { close() }
})

test('T3 painter is discrete by native target, with fixed width and 150ms transforms', { timeout: 40000 }, async () => {
  const { call, evaluate, close } = await setup()
  const settle = () => evaluate('new Promise(r=>setTimeout(r,220))')
  try {
    await settle()
    const center = await evaluate('tickPoint(2)')
    const samples = []
    for (const offset of [-3, -2, -1, 0, 1, 2, 6, 7]) {
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y + offset })
      await settle()
      samples.push(await evaluate('ticks().map(b=>b.firstElementChild.getBoundingClientRect().width)'))
    }
    for (let i = 1; i < 6; i++) assert.deepEqual(samples[i],samples[0], 'same native target must retain the exact discrete state')
    for (let i=0;i<6;i++) assert.ok(Math.abs(samples[6][i]-24*[.333,.417,.667,1,.667,.417][i])<.05)
    assert.deepEqual(samples[6],samples[7])
    assert.deepEqual(await evaluate(`(()=>{const s=getComputedStyle(ticks()[3].firstElementChild);return {duration:s.transitionDuration,property:s.transitionProperty,scale:ticks()[3].firstElementChild.style.getPropertyValue('--codex-history-scale')}})()`),{duration:'0.15s',property:'transform',scale:'1'})
    assert.match(await evaluate('preview().textContent'), /Answer a-3/)
    assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-slot=aui_thread-viewport]")].map(v=>v.scrollTop)'),[0,0])
    await call('Input.dispatchMouseEvent', {type:'mouseMoved',x:950,y:650}); await settle(); await settle()
    assert.ok((await evaluate('ticks().map(b=>b.firstElementChild.getBoundingClientRect().width)')).every(width=>Math.abs(width-24*.333)<.05))
    await evaluate('dispose()'); await settle()
    assert.equal(await evaluate('document.querySelectorAll("[data-codex-history-rail]").length'), 0)
  } finally { close() }
})

test('history wave invalidates screen coordinates between hover visits', async () => {
  const { call, evaluate, close } = await setup()
  const settle = () => evaluate('new Promise(r=>setTimeout(r,200))')
  const hover = async () => {
    const point = await evaluate('tickPoint(3)')
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await settle()
  }
  try {
    await settle(); await hover()
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 850, y: 650 })
    await settle()
    await evaluate("rail().closest('section').style.top='40px'")
    await hover()
    const width = await evaluate('ticks()[3].firstElementChild.getBoundingClientRect().width')
    assert.ok(Math.abs(width-24)<.1, `re-entered hovered bar must use its new screen position, got ${width}`)
  } finally { close() }
})

test('history wave reuses stable rail geometry while pointer motion is animated', { timeout: 40000 }, async () => {
  const { call, evaluate, close } = await setup(240)
  const settle = () => evaluate('new Promise(r=>setTimeout(r,220))')
  try {
    await settle()
    const point = await evaluate('tickPoint(2)')
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await settle()
    await evaluate(`(() => {
      window.geometryReads = 0
      const original = Element.prototype.getBoundingClientRect
      window.__codexOriginalRect = original
      Element.prototype.getBoundingClientRect = function (...args) {
        if (this.matches?.('[data-slot="thread-timeline-ticks"] .thread-timeline-tick, [data-slot="thread-timeline-ticks"] .thread-timeline-track')) window.geometryReads++
        return original.apply(this, args)
      }
    })()`)
    await evaluate(`window.pointY = ${point.y}`)
    await evaluate(`(async () => {
      for (const offset of [-1, -0.5, 0, 0.5, 1, 0.2, -0.2]) {
        ticks()[2].dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: pointY + offset }))
        await new Promise(resolve => setTimeout(resolve, 24))
      }
    })()`)
    await settle()
    const reads = await evaluate('geometryReads')
    console.log('HISTORY_GEOMETRY_PRE_ASSERT '+JSON.stringify({reads}))
    assert.equal(reads, 0, `stable geometry must not be reread during pointer animation; got ${reads}`)
    assert.ok((await evaluate('ticks().map(b=>b.firstElementChild.getBoundingClientRect().width)')).some(width => width > 24*.333+.1))
    await evaluate('Element.prototype.getBoundingClientRect = __codexOriginalRect; dispose()')
  } finally { close() }
})

test('unmounted primary history: lazy runtime RPC, final prose, cache, exact alignment and stale-response isolation', { timeout: 40000 }, async () => {
  const { call, evaluate, close } = await setup()
  const settle = () => evaluate('new Promise(r=>setTimeout(r,200))')
  const move = async index => {
    const point = await evaluate(`(()=>{const r=primary.querySelectorAll('[data-slot="thread-timeline-ticks"] .thread-timeline-tick')[${index}].getBoundingClientRect();return {x:r.left+3,y:r.top+r.height/2}})()`)
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point}); await settle()
  }
  try {
    await settle()
    await evaluate(`(()=>{
      window.primary=rail();primary.closest('section').setAttribute('data-session-anchor','workspace');
      primary.closest('section').querySelector('[data-slot="aui_thread-content"]').replaceChildren();
      ticks().forEach((button,i)=>button.setAttribute('data-timeline-id','history:'+(1000+i)));
      window.runtime='runtime-a';fixtureHost.state.activeSessionId.get=()=>runtime;
      window.requests=[];window.resolveHistory=null;
      fixtureHost.request=(method,params)=>{requests.push({method,params});return new Promise(resolve=>window.resolveHistory=resolve)};
      window.historyRows=Array.from({length:6},(_,i)=>[{role:'user',row_id:1000+i,text:'Question '+i},{role:'assistant',text:'Interim'},{role:'tool',name:'terminal',context:'Tool text must not win'},{role:'assistant',text:'Final **answer '+i+'**'}]).flat();
    })()`)
    assert.deepEqual(await evaluate('requests'), [], 'no eager history request')
    await move(1)
    assert.deepEqual(await evaluate('requests'), [{method:'session.history',params:{session_id:'runtime-a'}}])
    await evaluate('resolveHistory({messages:historyRows})'); await settle()
    assert.match(await evaluate('preview().textContent'), /Final answer 1/)
    assert.equal(await evaluate('preview().querySelector("strong").textContent'), 'answer 1')
    await move(2)
    assert.match(await evaluate('preview().textContent'), /Final answer 2/)
    assert.equal(await evaluate('requests.length'), 1)
    await evaluate("runtime='runtime-b'")
    await move(3)
    assert.equal(await evaluate('requests.length'), 2)
    await evaluate("runtime='runtime-c';resolveHistory({messages:historyRows})"); await settle()
    assert.doesNotMatch(await evaluate('preview().textContent'), /Final answer/)
    await move(4)
    await evaluate("resolveHistory({messages:historyRows.slice(4)})"); await settle()
    assert.doesNotMatch(await evaluate('preview().textContent'), /Final answer/, 'mismatched full index must not pair by ordinal')
    await evaluate('stateListeners.forEach(callback=>callback())')
    assert.equal(await evaluate('preview()'),null,'context invalidation closes an existing preview')
    await evaluate('dispose()'); await settle()
    assert.equal(await evaluate('stateListeners.length'),0)
    assert.equal(await evaluate('document.querySelectorAll("[data-codex-history-preview]").length'), 0)
  } finally { close() }
})

test('history remounts, duplicate questions, inert formatting and bounded long/narrow rails', { timeout: 40000 }, async () => {
  const { call, evaluate, close } = await setup()
  const settle = () => evaluate('new Promise(r=>setTimeout(r,200))')
  const hover = async (index,id='a') => {const point=await evaluate(`tickPoint(${index},${JSON.stringify(id)})`);await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await settle()}
  try {
    await settle()
    await evaluate(`(()=>{
      const pairs=rail().closest('section').querySelectorAll('[data-slot="aui_turn-pair"]');
      for(const i of [0,3]){pairs[i].querySelector('[data-slot="aui_user-message-text"]').textContent='Repeated';ticks()[i].setAttribute('aria-label','Repeated')}
      pairs[3].querySelectorAll('.aui-md')[1].innerHTML='<p onclick="window.bad=1">Answer <strong id="private-id">safe</strong><img onerror="window.bad=1"><script>window.bad=1</script></p>';
      window.bad=0;
    })()`)
    await hover(3)
    assert.match(await evaluate('preview().textContent'), /RepeatedAnswer safe/)
    assert.equal(await evaluate('preview().querySelectorAll("[onclick], [onerror], img, script, #private-id").length'),0)
    assert.equal(await evaluate('window.bad'),0)
    await evaluate("rail().remove()")
    await settle()
    assert.equal(await evaluate('document.querySelectorAll("[data-codex-history-preview]").length'),1,'detached rail leaves no preview behind')
    await evaluate(`(()=>{const root=rail('b').cloneNode(true);root.removeAttribute('data-codex-history-rail');root.querySelectorAll('[data-slot="thread-timeline-ticks"] .thread-timeline-tick').forEach((button,i)=>button.setAttribute('data-timeline-id','a-'+i));for(const i of [0,3])root.querySelectorAll('[data-slot="thread-timeline-ticks"] .thread-timeline-tick')[i].setAttribute('aria-label','Repeated');document.querySelector('[data-session-anchor="session-tile:a"]').appendChild(root)})()`)
    await settle(); await hover(1)
    assert.match(await evaluate('preview().textContent'),/Answer a-1/)
    await evaluate(`(()=>{const s=rail().closest('section');s.style.width='230px';s.style.height='200px';const strip=rail().querySelector('[data-slot="thread-timeline-ticks"]');for(let i=0;i<100;i++)strip.appendChild(ticks()[0].cloneNode(true))})()`)
    await settle()
    const bounds=await evaluate(`(()=>{const s=rail().closest('section').getBoundingClientRect(),r=rail().getBoundingClientRect();return {top:r.top,bottom:r.bottom,sBottom:s.bottom}})()`)
    assert.ok(bounds.top>=0 && bounds.bottom<=bounds.sBottom,JSON.stringify(bounds))
    assert.equal(await evaluate('getComputedStyle(rail()).display'),'none')
    assert.equal(await evaluate('preview()'),null,'shrinking the pane closes the history card')
    await evaluate('dispose()'); await settle()
  } finally { close() }
})

// Native-shaped DOM integration, not the real React virtualizer. Kept separate
// from that pending gate so a fixture pass cannot be reported as native proof.
test('virtualized DOM slice from 40: duplicate labels, independent transcript window, delayed RPC and retained click', { timeout: 40000 }, async () => {
  const {call,evaluate,close}=await setup(8)
  const settle=()=>evaluate('new Promise(r=>setTimeout(r,220))')
  const move=async index=>{const p=await evaluate(`tickPoint(${index})`);await call('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await settle();return p}
  try {
    await settle()
    await evaluate(`(()=>{
      const section=rail().closest('section'),track=rail().querySelector('.thread-timeline-track');
      section.setAttribute('data-session-anchor','workspace');track.style.height='700px';
      ticks().forEach((b,i)=>{b.dataset.timelineIndex=40+i;b.dataset.timelineId='history:'+(1040+i);b.setAttribute('aria-label','Repeated');b.style.top=(40+i)*7+'px'});
      const pairs=[...section.querySelectorAll('[data-slot="aui_turn-pair"]')];
      pairs.forEach((p,i)=>{p.querySelector('[data-slot="aui_user-message-root"]').dataset.messageId='history:'+(1040+i);p.querySelector('[data-slot="aui_user-message-text"]').textContent='Repeated';p.querySelectorAll('.aui-md')[1].innerHTML='<p>DOM answer '+(40+i)+'</p>'});
      pairs[0].remove();pairs.at(-1).remove();rail().querySelector('[data-slot="thread-timeline-ticks"]').scrollTop=280;
      window.runtime='runtime-a';fixtureHost.state.activeSessionId.get=()=>runtime;
      window.requests=[];window.pendingHistory=[];fixtureHost.request=(method,params)=>{requests.push({method,params});return new Promise(resolve=>pendingHistory.push(resolve))};
      window.historyRows=Array.from({length:100},(_,i)=>[{role:'user',row_id:1000+i,text:'Repeated'},{role:'assistant',text:'RPC answer '+i}]).flat();
    })()`)
    await settle();const p=await move(2)
    assert.match(await evaluate('preview().textContent'),/DOM answer 42/)
    assert.doesNotMatch(await evaluate('preview().textContent'),/DOM answer 41/)
    assert.equal(await evaluate('rail().querySelector("[data-slot=thread-timeline-ticks]").scrollTop'),280)
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1})
    assert.deepEqual(await evaluate('jumps'),['workspace:2'])
    await evaluate(`rail().closest('section').querySelector('[data-slot="aui_thread-content"]').replaceChildren()`);await settle()
    assert.equal(await evaluate('requests.length'),1)
    await evaluate('pendingHistory.shift()({messages:historyRows})');await settle()
    assert.match(await evaluate('preview().textContent'),/RPC answer 42/)
    await move(3);assert.match(await evaluate('preview().textContent'),/RPC answer 43/)
    assert.equal(await evaluate('requests.length'),1)
    await evaluate(`runtime='runtime-b';stateListeners.forEach(callback=>callback())`);await move(4)
    await evaluate(`runtime='runtime-c';pendingHistory.shift()({messages:historyRows})`);await settle()
    assert.doesNotMatch(await evaluate('preview().textContent'),/RPC answer/)
    await evaluate('dispose()');await settle()
    assert.equal(await evaluate('document.querySelectorAll("[data-codex-history-preview], [data-codex-history-rail]").length'),0)
    assert.equal(await evaluate('ticks().some(b=>b.firstElementChild.style.getPropertyValue("--codex-history-scale"))'),false)
  } finally {close()}
})
