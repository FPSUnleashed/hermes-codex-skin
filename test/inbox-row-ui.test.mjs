import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Executable helper load, not a source-shape assertion. Browser executes the
// same artifact below. Fixture is transcribed native compact chrome, not React
// SidebarSessionRow or its private menu. Native utility geometry is represented
// here; actual shipped skin paint is loaded by the existing plugin helper.
const source = await readFile(new URL('../src/inbox-row-ui.js', import.meta.url), 'utf8')
const context = vm.createContext({})
vm.runInContext(source, context, { filename: 'inbox-row-ui.js' })
const fallback = context.CODEX_INBOX_ROW_UI_CSS
assert.equal(typeof context.createCodexInboxRowUI, 'function')
assert.equal(typeof fallback, 'string')
const nativeFixture = `<div id="native" class="min-h-[1.625rem] pr-2 grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md group row-hover relative"><button type="button" data-slot="row-button" class="pl-2 pr-2 gap-1.5 flex h-full min-w-0 items-center self-stretch py-0.5 bg-transparent text-left z-0"><span class="grid size-3.5 shrink-0 place-items-center overflow-hidden" aria-hidden="true"></span><span class="min-w-0 flex-1 self-center"><span class="min-w-0 truncate text-[0.8125rem] text-(--ui-text-secondary) leading-[1.35] hover-marquee block font-normal group-hover:text-foreground group-data-[working=true]:text-foreground/90"><span class="hover-marquee-inner">A native-shaped conversation title that must truncate</span></span></span></button><div class="flex shrink-0 items-center self-stretch" data-row-actions><button type="button" aria-label="Fixture options"></button><button type="button" aria-label="Fixture clock"></button></div></div>`
const nativeGeometryCSS = `
#native{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:stretch;min-height:1.625rem;padding-right:.5rem;border-radius:.375rem;position:relative}
#native:hover{background:var(--ui-row-hover-background)}#native[data-active=true]{background:var(--ui-row-active-background)}
#native>[data-slot=row-button]{display:flex;height:100%;min-width:0;align-items:center;align-self:stretch;gap:.375rem;padding:.125rem .5rem;background:transparent;text-align:left;z-index:0}
#native>[data-slot=row-button]>span:first-child{display:grid;width:.875rem;height:.875rem;flex-shrink:0;place-items:center;overflow:hidden}
#native>[data-slot=row-button]>span:last-child{min-width:0;flex:1;align-self:center}
#native .truncate{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem;line-height:1.35;font-weight:400;color:var(--ui-text-secondary)}
#native:is(:hover,:focus-within,[data-active=true]) .truncate{color:var(--ui-text-primary)}
#native>[data-row-actions]{display:flex;flex-shrink:0;align-items:center;align-self:stretch}
#native>[data-row-actions]>button{display:inline-flex;width:1.5rem;height:1.5rem;flex-shrink:0;padding:0;border-radius:4px}
`

for (const mode of ['fallback', 'dark', 'light']) {
  test(`plugin-owned row matches compact native geometry and preserves event boundaries (${mode})`, async () => {
    const { CSS } = await loadPluginInternals(['CSS'])
    const browser = await chromium()
    try {
      const dark = mode !== 'light'
      const html = `<!doctype html><html ${mode !== 'fallback' ? 'data-codex-chat-look="true"' : ''} data-hermes-theme="codex-chat" data-hermes-mode="${dark ? 'dark' : 'light'}"><head><style>
      :root{font-size:16px;--ui-text-primary:${dark ? '#fcfcfc' : '#222'};--ui-text-secondary:${dark ? '#aaa' : '#666'};--ui-text-tertiary:#888;--ui-text-quaternary:#777;--ui-row-active-background:${dark ? '#3e3e3e' : '#ddd'};--ui-row-hover-background:${dark ? '#333' : '#e4e4e4'};--ui-sidebar-surface-background:${dark ? '#1c1c1c' : '#f3f3f3'};--ui-chat-surface-background:var(--ui-sidebar-surface-background);--theme-foreground:var(--ui-text-primary);--theme-sidebar-seed:var(--ui-sidebar-surface-background);--theme-background-seed:var(--ui-sidebar-surface-background);--theme-accent-soft:var(--ui-row-active-background);--ui-accent:#4488dd}
      *{box-sizing:border-box}body{margin:0;font:14px system-ui;color:var(--ui-text-primary)}button{font:inherit;color:inherit;border:0;background:transparent}aside{margin:20px;width:300px} ${nativeGeometryCSS}
      </style><style>${mode === 'fallback' ? '' : CSS}</style></head><body><div data-tree-group="grp-sessions"><aside data-slot="sidebar">${nativeFixture}<div id="mount"></div></aside></div></body></html>`
      await browser.call('Emulation.setDeviceMetricsOverride', { width: 640, height: 480, deviceScaleFactor: 1, mobile: false })
      await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
      await browser.evaluate(`
      window.nativeRow=document.getElementById('native');window.nativeHTML=nativeRow.outerHTML;
      window.measure=row=>{const go=row.querySelector('[data-slot="row-button"]'),lead=go.firstElementChild,label=go.lastElementChild.firstElementChild,actions=row.querySelector('[data-row-actions]');const r=row.getBoundingClientRect();const box=el=>{const b=el.getBoundingClientRect();return [b.x-r.x,b.y-r.y,b.width,b.height]};const s=getComputedStyle(label);return {row:[r.width,r.height],go:box(go),lead:box(lead),label:box(label),actions:box(actions),slots:[...actions.children].map(box),type:[s.fontSize,s.lineHeight,s.fontWeight],paint:[getComputedStyle(row).backgroundColor,getComputedStyle(row).borderRadius,s.color]}};
      window.nativeBefore=measure(nativeRow);window.nativeClicks=0;nativeRow.firstElementChild.onclick=()=>nativeClicks++;
      window.bubbled=0;document.querySelector('aside').addEventListener('click',()=>bubbled++);document.querySelector('aside').addEventListener('pointerdown',()=>bubbled++);
      `)
      await browser.evaluate(source)
      await browser.evaluate(`
      const style=document.createElement('style');style.textContent=CODEX_INBOX_ROW_UI_CSS;document.head.append(style);
      window.events=[];const record=(name,event)=>events.push({name,same:event===window.lastEvent,type:event.type,target:event.target===event.currentTarget,defaultPrevented:event.defaultPrevented,ctrl:event.ctrlKey});
      window.ui=createCodexInboxRowUI({document,onOpen:e=>record('open',e),onMenu:e=>{record('menu',e);e.currentTarget.setAttribute('aria-expanded','true')},onSnooze:e=>record('snooze',e)});
      ui.update({title:'A native-shaped conversation title that must truncate',menuTitle:'Inbox conversation options'});document.getElementById('mount').append(ui.row);
      window.visibility=()=>[ui.menu,ui.clock].map(e=>({opacity:getComputedStyle(e).opacity,display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,tabIndex:e.tabIndex,pointerEvents:getComputedStyle(e).pointerEvents}));
      `)
      const initial = await browser.evaluate(`({native:measure(nativeRow),plugin:measure(ui.row),unchanged:nativeRow.outerHTML===nativeHTML,structure:[ui.row.tagName,ui.go.tagName,ui.lead.tagName,ui.label.tagName,ui.actions.tagName],order:[...ui.actions.children].map(e=>e.hasAttribute('data-codex-inbox-menu')?'menu':'snooze'),text:ui.row.textContent,visible:visibility(),nativeBefore})`)
      assert.deepEqual(initial.native, initial.nativeBefore, 'scoped CSS leaves native fixture unchanged')
      assert.equal(initial.unchanged, true)
      assert.deepEqual(initial.plugin, initial.native, 'geometry, typography and skin paint match')
      assert.deepEqual(initial.structure, ['DIV', 'BUTTON', 'SPAN', 'SPAN', 'DIV'])
      assert.deepEqual(initial.order, ['menu', 'snooze'])
      assert.equal(await browser.evaluate(`ui.go.className===nativeRow.firstElementChild.className && ui.lead.className===nativeRow.firstElementChild.firstElementChild.className && ui.label.className===nativeRow.querySelector('.truncate').className`), true, 'native body/lead/label classes match')
      await browser.evaluate(`document.querySelector('aside').style.width='180px'`)
      assert.deepEqual(await browser.evaluate('measure(ui.row)'), await browser.evaluate('measure(nativeRow)'), 'narrow titles truncate with fixed control slots')
      await browser.evaluate(`document.querySelector('aside').style.width='300px'`)
      assert.equal(initial.text, 'A native-shaped conversation title that must truncate', 'no permanent text action')
      assert.equal(initial.plugin.lead[2], 14)
      assert.equal(initial.plugin.label[0], 28)
      assert.equal(initial.plugin.row[1], 26)
      for (const control of initial.visible) {
        assert.equal(control.opacity, '0'); assert.equal(control.tabIndex, 0)
        assert.equal(control.visibility, 'visible'); assert.notEqual(control.display, 'none')
        assert.equal(control.pointerEvents, 'none')
      }
      const point = await browser.evaluate(`(()=>{const r=ui.go.getBoundingClientRect();return {x:r.x+10,y:r.y+10}})()`)
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
      await browser.evaluate('new Promise(r=>setTimeout(r,130))')
      assert.deepEqual((await browser.evaluate('visibility()')).map(s => s.opacity), ['1', '1'])
      assert.deepEqual((await browser.evaluate('measure(ui.row)')).row, initial.plugin.row, 'hover does not change slots')
      const hoverPaint = (await browser.evaluate('measure(ui.row)')).paint
      const nativePoint = await browser.evaluate(`(()=>{const r=nativeRow.getBoundingClientRect();return {x:r.x+10,y:r.y+10}})()`)
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...nativePoint })
      assert.deepEqual((await browser.evaluate('measure(nativeRow)')).paint, hoverPaint, 'native and plugin hover paint match')
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 400 })
      await browser.evaluate('ui.go.focus();new Promise(r=>setTimeout(r,130))')
      assert.deepEqual((await browser.evaluate('visibility()')).map(s => s.opacity), ['1', '1'])
      await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      assert.equal(await browser.evaluate('document.activeElement===ui.menu'), true)
      await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      assert.equal(await browser.evaluate('document.activeElement===ui.clock'), true, 'hidden clock remains keyboard reachable')
      await browser.evaluate(`document.activeElement.blur();new Promise(r=>setTimeout(r,130))`)
      assert.deepEqual((await browser.evaluate('visibility()')).map(s => s.opacity), ['0', '0'])
      await browser.evaluate(`
      ui.update({selected:true});nativeRow.classList.add('bg-(--ui-row-active-background)');nativeRow.dataset.active='true';
      `)
      assert.deepEqual(await browser.evaluate('measure(ui.row)'), await browser.evaluate('measure(nativeRow)'))
      assert.equal(await browser.evaluate('getComputedStyle(ui.go).backgroundColor'), await browser.evaluate('getComputedStyle(nativeRow.firstElementChild).backgroundColor'), 'selection paints shell only, not an inset body band')
      assert.equal(await browser.evaluate('ui.row.getAttribute("aria-current")'), 'true')
      await browser.evaluate(`
      for(const e of [ui.go,ui.menu,ui.clock]){window.lastEvent=new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});e.dispatchEvent(lastEvent)}
      ui.clock.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      `)
      assert.deepEqual(await browser.evaluate('events'), ['open', 'menu', 'snooze'].map(name => ({ name, same: true, type: 'click', target: true, defaultPrevented: false, ctrl: true })))
      assert.equal(await browser.evaluate('bubbled'), 0)
      assert.equal(await browser.evaluate('ui.menu.getAttribute("aria-haspopup")'), 'menu')
      assert.equal(await browser.evaluate('ui.menu.getAttribute("aria-expanded")'), 'true', 'parent controls expansion, no fake menu')
      assert.equal(await browser.evaluate('ui.menu.getAttribute("aria-label")'), 'Inbox conversation options')
      await browser.evaluate(`ui.update({disabled:true});ui.go.click();ui.menu.click();ui.clock.click()`)
      assert.equal(await browser.evaluate('events.length'), 3)
      await browser.evaluate(`ui.update({disabled:false,menuDisabled:true,title:'<b>literal</b>',selected:false});ui.menu.click();`)
      assert.equal(await browser.evaluate('events.length'), 3)
      assert.equal(await browser.evaluate('ui.label.textContent'), '<b>literal</b>')
      assert.equal(await browser.evaluate('ui.label.querySelector("b")'), null)
      assert.equal(await browser.evaluate('ui.go.hasAttribute("aria-current")'), false)
      await browser.evaluate(`ui.update({menuDisabled:false});ui.menu.click();nativeRow.firstElementChild.click()`)
      assert.equal(await browser.evaluate('events.length'), 4)
      assert.equal(await browser.evaluate('nativeClicks'), 1, 'native fixture keeps its original event handler')
      console.log(JSON.stringify({ mode, geometry: initial.plugin, controls: initial.order, nativeUntouched: initial.unchanged }))
    } finally { browser.close() }
  })
}

async function activityFixture(browser, mode = 'fallback') {
  const { CSS } = await loadPluginInternals(['CSS'])
  const dark = mode !== 'light'
  const html = `<!doctype html><html ${mode !== 'fallback' ? 'data-codex-chat-look="true"' : ''} data-hermes-theme="codex-chat" data-hermes-mode="${dark ? 'dark' : 'light'}"><head><style>
  :root{font-size:16px;--ui-text-primary:${dark ? '#fcfcfc' : '#222'};--ui-text-secondary:${dark ? '#aaa' : '#666'};--ui-text-tertiary:#888;--ui-text-quaternary:#777;--ui-success:#15803d;--theme-foreground:var(--ui-text-primary);--ui-row-active-background:#ddd;--ui-row-hover-background:#ccc;--ui-sidebar-surface-background:${dark ? '#1c1c1c' : '#f3f3f3'};--ui-chat-surface-background:var(--ui-sidebar-surface-background);--theme-sidebar-seed:var(--ui-sidebar-surface-background);--theme-background-seed:var(--ui-sidebar-surface-background);--theme-accent-soft:var(--ui-row-active-background);--ui-accent:#4488dd}
  *{box-sizing:border-box}body{margin:0;font:14px system-ui;color:var(--ui-text-primary)}button{font:inherit;color:inherit;border:0;background:transparent}aside{margin:20px;width:300px}${nativeGeometryCSS}
  </style><style>${mode === 'fallback' ? '' : CSS}</style></head><body><div data-tree-group="grp-sessions"><aside data-slot="sidebar">${nativeFixture}<div id="mount"></div></aside></div></body></html>`
  await browser.call('Emulation.setDeviceMetricsOverride', { width: 640, height: 480, deviceScaleFactor: 1, mobile: false })
  await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
  await browser.evaluate(`window.nativeRow=document.getElementById('native');window.nativeHTML=nativeRow.outerHTML;
  window.rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};
  window.nativePaint=[nativeRow,...nativeRow.querySelectorAll('*')].map(e=>[rect(e),getComputedStyle(e).color,getComputedStyle(e).backgroundColor]);
  window.nativeClicks=0;nativeRow.firstElementChild.onclick=()=>nativeClicks++;`)
  await browser.evaluate(source)
  await browser.evaluate(`const style=document.createElement('style');style.textContent=CODEX_INBOX_ROW_UI_CSS;document.head.append(style);
  window.events=[];window.bubbled=0;document.querySelector('aside').addEventListener('click',()=>bubbled++);
  window.ui=createCodexInboxRowUI({document,onOpen:e=>events.push('open'),onMenu:e=>events.push('settle'),onSnooze:e=>events.push('snooze')});
  ui.update({title:'A native-shaped conversation title that must truncate'});document.getElementById('mount').append(ui.row);
  window.geometry=()=>({row:rect(ui.row),go:rect(ui.go),lead:rect(ui.lead),label:rect(ui.label),slots:[...ui.actions.children].map(rect)});
  window.visible=()=>[ui.menu,ui.clock].map(e=>({opacity:getComputedStyle(e).opacity,pointerEvents:getComputedStyle(e).pointerEvents}));
  window.probe=()=>{const dot=ui.lead.querySelector('[data-codex-inbox-work-dot]'),arc=ui.row.querySelector('[data-codex-inbox-running-arc]');if(!dot||!arc)return null;const d=getComputedStyle(dot),a=getComputedStyle(arc),p=getComputedStyle(arc,'::before');return {state:ui.row.dataset.workState,dot:rect(dot),dotOpacity:d.opacity,background:d.backgroundColor,color:d.color,borderWidth:d.borderTopWidth,arcSize:rect(arc).slice(2),arcParent:arc.parentElement===ui.row,arcOpacity:a.opacity,animation:p.animationName,duration:p.animationDuration,timing:p.animationTimingFunction,iterations:p.animationIterationCount,transform:p.transform,gradient:p.backgroundImage,mask:a.maskComposite,layer:[p.width,p.height],pointerEvents:a.pointerEvents,arcColor:a.getPropertyValue('--codex-inbox-arc-c1').trim()}};
  window.theme=()=>{const e=document.createElement('span');ui.row.append(e);const color=v=>{e.style.color='var('+v+')';return getComputedStyle(e).color};const result={foreground:color('--ui-text-primary'),success:color('--ui-success'),neutral:color('--ui-text-quaternary')};e.remove();return result};`)
}

async function assertNativeUntouched(browser) {
  assert.equal(await browser.evaluate('nativeRow.outerHTML===nativeHTML'), true)
  assert.deepEqual(await browser.evaluate(`[nativeRow,...nativeRow.querySelectorAll('*')].map(e=>[rect(e),getComputedStyle(e).color,getComputedStyle(e).backgroundColor])`), await browser.evaluate('nativePaint'), 'plugin-scoped styles do not paint or move native nodes')
  await browser.evaluate('nativeRow.firstElementChild.click()')
  assert.equal(await browser.evaluate('nativeClicks'), 1, 'native handler is untouched')
}

for (const mode of ['fallback', 'dark', 'light']) {
  test(`Inbox work states have theme dots and a stable compact lead (${mode})`, async () => {
    const browser = await chromium()
    try {
      await activityFixture(browser, mode)
      const initial = await browser.evaluate('probe()')
      assert.ok(initial, 'plugin-owned row contains the work dot and contour')
      assert.equal(initial.state, 'idle')
      const colors = await browser.evaluate('theme()')
      assert.equal(initial.dotOpacity, '0', 'idle has no painted indicator, while retaining the lead slot')
      assert.equal(initial.borderWidth, '0px', 'no hollow indicator')
      const geometry = await browser.evaluate('geometry()')
      assert.deepEqual(geometry.row.slice(2), [300, 26])
      assert.equal(geometry.lead[2], 14)
      assert.equal(geometry.label[0] - geometry.row[0], 28)
      assert.deepEqual(geometry.slots.map(r => r.slice(2)), [[24, 24], [24, 24]])
      for (const state of ['working', 'completed', 'reading', 'unknown', 'idle', 'working']) {
        await browser.evaluate(`ui.update({workState:${JSON.stringify(state)}})`)
        const current = await browser.evaluate('probe()')
        assert.equal(current.state, state)
        assert.deepEqual(current.dot.slice(2), [6, 6])
        assert.equal(current.dot[0] + 3, geometry.lead[0] + 7, 'dot is horizontally centered in the existing lead')
        assert.equal(current.dot[1] + 3, geometry.lead[1] + 7, 'dot is vertically centered in the existing lead')
        assert.deepEqual(await browser.evaluate('geometry()'), geometry, 'state changes never shift titles or control slots')
        assert.equal(current.dotOpacity, ['working','completed'].includes(state) ? '1' : '0', 'only actual working/completed states paint a dot')
        assert.equal(current.borderWidth, '0px', 'idle, reading and unknown never paint hollow dots')
        assert.equal(current.arcOpacity, state === 'working' ? '1' : '0')
        assert.equal(current.arcParent, true, 'contour belongs to the row outline, not the leading dot')
        assert.deepEqual(current.arcSize, [300, 26], 'zero-standoff contour follows the complete row')
        assert.equal(current.pointerEvents, 'none', 'outline never steals Settle/Snooze presses')
        if (state === 'working') {
          assert.equal(current.background, colors.foreground)
          assert.notEqual(current.animation, 'none')
          assert.equal(current.duration, '2.23s', 'native arc-row clock')
          assert.equal(current.timing, 'linear')
          assert.equal(current.iterations, 'infinite')
          assert.ok(current.mask.split(',').every(value => value.trim() === 'exclude'), 'native hollow contour mask, not a rotating semicircle')
          assert.deepEqual(current.layer, ['900px', '78px'], 'native gradient layer is 300% of the row')
          assert.match(current.gradient, /^linear-gradient\(160deg, /)
          assert.match(current.gradient, /95%/)
        } else {
          assert.equal(current.animation, 'none', 'no invisible ongoing animation')
          if (state === 'completed') assert.equal(current.background, colors.success)
        }
      }
      const before = await browser.evaluate('probe().transform')
      await browser.evaluate('new Promise(r=>setTimeout(r,140))')
      assert.notEqual(await browser.evaluate('probe().transform'), before, 'real Chromium advances the running arc')
      await browser.evaluate(`document.documentElement.style.setProperty('--ui-text-primary','#101010');document.documentElement.style.setProperty('--ui-success','#329b51')`)
      assert.equal((await browser.evaluate('probe()')).background, (await browser.evaluate('theme()')).foreground, 'working follows theme foreground rather than fixed black')
      await browser.evaluate(`ui.update({workState:'completed'});ui.update({title:'Renamed'})`)
      assert.equal((await browser.evaluate('probe()')).state, 'completed', 'partial updates preserve work state')
      assert.equal((await browser.evaluate('probe()')).background, (await browser.evaluate('theme()')).success, 'completion follows the live success token')
      await browser.evaluate(`ui.update({workState:'not-a-status'})`)
      assert.equal((await browser.evaluate('probe()')).state, 'unknown', 'invalid work states fail neutral, never success')
      await browser.evaluate(`document.documentElement.style.removeProperty('--ui-text-primary');document.documentElement.style.removeProperty('--ui-success')`)
      await assertNativeUntouched(browser)
      console.log(JSON.stringify({ mode, workStates: ['idle','working','completed','reading','unknown'], geometry, nativeUntouched: true }))
    } finally { browser.close() }
  })

  test(`Settle is identifiable at rest while Snooze stays hover/focus only (${mode})`, async () => {
    const browser = await chromium()
    try {
      await activityFixture(browser, mode)
      await browser.evaluate(`ui.update({settleAction:true,menuTitle:'Settle this thread'});new Promise(r=>setTimeout(r,130))`)
      assert.equal(await browser.evaluate(`ui.row.querySelector('[data-codex-inbox-settle]')===ui.menu`), true, 'dedicated Settle marker on the existing action, not a third slot')
      assert.equal(await browser.evaluate(`ui.menu.getAttribute('aria-label')`), 'Settle this thread')
      assert.equal(await browser.evaluate(`ui.menu.title`), 'Settle this thread')
      const settleAX = (await browser.call('Accessibility.getFullAXTree')).nodes.find(n=>n.role?.value === 'button' && n.name?.value === 'Settle this thread')
      assert.ok(settleAX && !settleAX.ignored, 'Settle has an identifiable real Chromium accessible button')
      assert.equal(await browser.evaluate(`ui.menu.hasAttribute('aria-haspopup')||ui.menu.hasAttribute('aria-expanded')`), false, 'Settle is not a pretend menu')
      assert.equal(await browser.evaluate(`ui.menu.querySelector('path').getAttribute('d')`), 'M3.5 8.5l3 3 6-7', 'visible check rather than ellipsis')
      assert.deepEqual(await browser.evaluate(`(()=>{const svg=ui.menu.firstChild,s=getComputedStyle(svg);return [rect(svg).slice(2),s.display,s.stroke,s.strokeWidth]})()`), [[12,12],'block',await browser.evaluate('getComputedStyle(ui.menu).color'),'1.25px'], 'the check glyph has rendered dimensions and stroke')
      assert.deepEqual(await browser.evaluate('visible()'), [{ opacity:'1', pointerEvents:'auto' }, { opacity:'0', pointerEvents:'none' }])
      assert.equal(await browser.evaluate('ui.actions.firstElementChild===ui.clock && ui.actions.lastElementChild===ui.menu'), true, 'Inbox DOM order is Snooze then Settle')
      const geometry = await browser.evaluate('geometry()')
      assert.ok(geometry.slots[0][0] < geometry.slots[1][0], 'Snooze actually renders left of Settle in Chromium')
      assert.equal(await browser.evaluate('rect(ui.clock)[0] < rect(ui.menu)[0]'), true, 'named control positions follow the requested order')
      await browser.evaluate('ui.go.focus()')
      await browser.call('Input.dispatchKeyEvent', { type:'keyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 })
      assert.equal(await browser.evaluate('document.activeElement===ui.clock'), true, 'first Inbox action in Tab order is Snooze')
      await browser.call('Input.dispatchKeyEvent', { type:'keyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 })
      assert.equal(await browser.evaluate('document.activeElement===ui.menu'), true, 'second Inbox action in Tab order is Settle')
      await browser.evaluate('document.activeElement.blur()')
      assert.equal(await browser.evaluate('ui.actions.children.length'), 2)
      assert.deepEqual(geometry.slots.map(r => r.slice(2)), [[24,24],[24,24]])
      const settlePoint = await browser.evaluate(`(()=>{const r=ui.menu.getBoundingClientRect();return {x:r.x+12,y:r.y+12}})()`)
      await browser.call('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', clickCount:1, ...settlePoint })
      await browser.call('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', clickCount:1, ...settlePoint })
      assert.deepEqual(await browser.evaluate('events'), ['settle'], 'visible check invokes the same parent callback')
      assert.equal(await browser.evaluate('bubbled'), 0)
      await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', x:600, y:400 })
      await browser.evaluate(`document.activeElement.blur();ui.menu.focus();ui.update({menuDisabled:true});new Promise(r=>setTimeout(r,130))`)
      assert.equal(await browser.evaluate('document.activeElement===ui.menu'), false, 'disabling Settle releases focus before hiding it')
      assert.equal(await browser.evaluate('ui.menu.disabled'), true)
      assert.deepEqual(await browser.evaluate('visible()'), [{ opacity:'0', pointerEvents:'none' }, { opacity:'0', pointerEvents:'none' }])
      assert.equal(await browser.evaluate('getComputedStyle(ui.menu).visibility'), 'hidden', 'unavailable Settle is absent, not a grey check')
      assert.deepEqual(await browser.evaluate('geometry()'), geometry, 'hidden Settle retains its 24px slot')
      for (const state of ['idle','working','reading','unknown']) {
        await browser.evaluate(`ui.update({workState:${JSON.stringify(state)}});ui.menu.focus()`)
        assert.equal(await browser.evaluate('document.activeElement===ui.menu'), false, 'disabled Settle cannot accept keyboard focus')
        const p = await browser.evaluate(`(()=>{const r=ui.go.getBoundingClientRect();return {x:r.x+10,y:r.y+10}})()`)
        await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', ...p })
        await browser.evaluate('new Promise(r=>setTimeout(r,130))')
        assert.deepEqual((await browser.evaluate('visible()'))[0], { opacity:'0', pointerEvents:'none' }, 'hover never revives disabled Settle')
        assert.equal(await browser.evaluate('getComputedStyle(ui.menu).visibility'), 'hidden')
        await browser.evaluate('ui.go.focus()')
        await browser.call('Input.dispatchKeyEvent', { type:'keyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 })
        assert.equal(await browser.evaluate('document.activeElement===ui.clock'), true, 'Tab skips unavailable Settle but keeps Snooze reachable')
        await browser.evaluate('document.activeElement.blur()')
        assert.deepEqual(await browser.evaluate('geometry()'), geometry)
      }
      await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', x:600,y:400 })
      await browser.evaluate('ui.menu.click();ui.update({disabled:true});ui.go.click();ui.clock.click();ui.update({disabled:false});ui.menu.click()')
      assert.deepEqual(await browser.evaluate('events'), ['settle'], 'global disabled and independent menuDisabled retain their semantics')
      assert.equal(await browser.evaluate('ui.menu.disabled'), true, 'reenabling the row preserves menuDisabled')
      await browser.evaluate('ui.update({menuDisabled:false});ui.menu.click()')
      assert.deepEqual(await browser.evaluate('events'), ['settle','settle'])
      const hoverPoint = await browser.evaluate(`(()=>{const r=ui.go.getBoundingClientRect();return {x:r.x+10,y:r.y+10}})()`)
      await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', ...hoverPoint })
      await browser.evaluate('new Promise(r=>setTimeout(r,130))')
      assert.deepEqual((await browser.evaluate('visible()')).map(s=>s.opacity), ['1','1'])
      assert.deepEqual(await browser.evaluate('geometry()'), geometry)
      await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', x:600,y:400 })
      await browser.evaluate('ui.clock.focus();new Promise(r=>setTimeout(r,130))')
      assert.equal((await browser.evaluate('visible()'))[1].opacity, '1', 'keyboard focus reveals Snooze')
      await browser.evaluate(`document.activeElement.blur();ui.update({settleAction:false});new Promise(r=>setTimeout(r,130))`)
      assert.equal(await browser.evaluate('ui.actions.firstElementChild===ui.menu && ui.actions.lastElementChild===ui.clock'), true, 'generic ellipsis mode keeps its original DOM order')
      assert.equal(await browser.evaluate('rect(ui.menu)[0] < rect(ui.clock)[0]'), true, 'generic options remain left of Snooze')
      assert.equal(await browser.evaluate(`ui.menu.hasAttribute('data-codex-inbox-settle')`), false)
      assert.equal(await browser.evaluate(`ui.menu.getAttribute('aria-haspopup')`), 'menu')
      assert.equal(await browser.evaluate(`ui.menu.getAttribute('aria-label')`), 'Settle this thread', 'explicit caller labels remain compatible')
      assert.deepEqual((await browser.evaluate('visible()')).map(s=>s.opacity), ['0','0'])
      await browser.evaluate(`ui.update({menuDisabled:true})`)
      await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', ...hoverPoint })
      await browser.evaluate('new Promise(r=>setTimeout(r,130))')
      assert.equal((await browser.evaluate('visible()'))[0].opacity, '0.5', 'generic disabled ellipsis keeps its existing hover treatment')
      assert.equal(await browser.evaluate('getComputedStyle(ui.menu).visibility'), 'visible')
      await browser.evaluate(`ui.update({settleAction:true,menuTitle:null,menuDisabled:false})`)
      assert.equal(await browser.evaluate(`ui.menu.getAttribute('aria-label')`), 'Settle', 'mode-aware default name')
      await assertNativeUntouched(browser)
    } finally { browser.close() }
  })
}

test('running arc respects real Chromium reduced-motion preference without dropping working status', async () => {
  const browser = await chromium()
  try {
    await browser.call('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'reduce'}] })
    await activityFixture(browser)
    await browser.evaluate(`ui.update({workState:'working'})`)
    assert.equal(await browser.evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`), true)
    const reduced = await browser.evaluate('probe()')
    assert.ok(reduced, 'work indicator exists under reduced motion')
    assert.equal(reduced.state, 'working')
    assert.equal(reduced.background, (await browser.evaluate('theme()')).foreground)
    assert.equal(reduced.arcOpacity, '1', 'motionless contour retains the working cue')
    assert.equal(reduced.animation, 'none')
    await browser.evaluate('new Promise(r=>setTimeout(r,140))')
    assert.equal((await browser.evaluate('probe()')).transform, reduced.transform)
    await browser.call('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'no-preference'}] })
    assert.notEqual((await browser.evaluate('probe()')).animation, 'none', 'motion preference change restores scoped running animation')
  } finally { browser.close() }
})
