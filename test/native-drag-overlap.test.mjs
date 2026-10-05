import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// DOM/CSS seam transcribed from the installed TreeGroup, PaneTab,
// PageSearchShell and TabDropdown. CDP input proves browser handlers only:
// Electron's native macOS drag-region hit testing still needs a Mac gate.
const nativeCSS = process.env.CODEX_SKIN_NATIVE_CSS
  ? await readFile(process.env.CODEX_SKIN_NATIVE_CSS, 'utf8') : ''
const nativeSeam = `
:root{--titlebar-height:34px;--spacing:.25rem;--ui-chat-surface-background:#111;--ui-sidebar-surface-background:#222;--ui-editor-surface-background:#111;--ui-row-active-background:#333;--ui-stroke-secondary:#444;--ui-text-primary:#eee;--ui-text-tertiary:#aaa}
*{box-sizing:border-box}body{margin:0;font:14px system-ui}
.fixture-row{display:flex;height:300px}.fixture-pane{display:flex;min-width:0;flex:1}.fixture-pane:first-child:not(:only-child){flex:0 0 300px}
[data-tree-group]{position:relative;display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;overflow:hidden}
[data-panel-header]{position:relative;display:flex;min-width:0;flex-shrink:0;background:var(--ui-sidebar-surface-background)}
[data-panel-header]>[aria-hidden]{flex-shrink:0}[data-window-drag-handle]{align-self:flex-start;min-width:0;flex:1}
[data-zone-tabstrip]{position:relative;display:flex;min-width:0;flex:1;flex-shrink:0;user-select:none;height:28px}
[data-zone-tabstrip].absolute{position:absolute;left:0;right:0;bottom:0}
[role=tablist]{display:flex;min-width:0;flex:1;overflow-x:auto;overflow-y:hidden}
[data-slot=pane-tab]{position:relative;display:flex;align-items:center;flex-shrink:0;height:100%;min-width:52px;max-width:192px}
.pane-tab-content{display:flex;height:100%;min-width:0;max-width:100%;flex:1;align-items:center}
.pane-tab-content>span{display:flex;height:100%;min-width:0;max-width:100%;align-items:center;overflow:hidden;padding:0 8px}
.truncate{display:block;min-width:0;overflow:hidden;white-space:nowrap;font-size:9px;font-weight:500;letter-spacing:.025em;text-transform:uppercase}
.zone-body{position:relative;min-height:0;min-width:0;flex:1;overflow:hidden}.pane-body{position:absolute;inset:0;overflow:auto}
.page-shell{display:flex;height:100%;min-width:0;flex-direction:column;overflow:hidden}.page-head{flex-shrink:0}
.page-grid{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;padding:calc(var(--titlebar-height) + .5rem) 12px 8px}
.page-grid>div{display:flex;min-width:0;align-items:center}.page-grid>[data-tour=page-tabs]{justify-content:center}
.wide-tabs{display:none;min-width:0;flex-wrap:wrap;align-items:center;justify-content:center;column-gap:8px;row-gap:4px}
.narrow-tabs{display:block}.group\\/text-tab{display:inline-flex;height:28px;align-items:center;gap:4px;padding:0 4px;border:0;background:transparent;font:inherit}
.dropdown-trigger{display:flex;height:28px;align-items:center;gap:6px;padding:0 4px;border:0;background:transparent;font:inherit}
@media(min-width:768px){.wide-tabs{display:flex}.narrow-tabs{display:none}}
[class~='[-webkit-app-region:drag]']{-webkit-app-region:drag}
[class~='[-webkit-app-region:no-drag]']{-webkit-app-region:no-drag}
`
const groupClass = 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--ui-editor-surface-background)'
const headerClass = 'relative flex min-w-0 shrink-0 bg-(--ui-sidebar-surface-background)'
const drag = '<div aria-hidden="true" class="self-start [-webkit-app-region:drag] min-w-0 flex-1" data-window-drag-handle style="height:34px"></div>'
const tab = (id, title) => `<div id="${id}" role="tab" data-slot="pane-tab" data-tree-tab="${id}" aria-selected="false" class="group/tab relative flex shrink-0 items-center border-transparent bg-(--tab-bg) h-full min-w-0 max-w-48 min-w-13 [-webkit-app-region:no-drag]"><div class="pane-tab-content flex h-full min-w-0 max-w-full flex-1 items-center"><span class="flex h-full min-w-0 max-w-full items-center overflow-hidden px-2 text-left outline-none"><span class="truncate block min-w-0 font-medium tracking-wide uppercase">${title}</span></span></div></div>`
const tabbedGroup = (id, left, right, tabs) => `<div class="fixture-pane"><div data-tree-group="${id}" data-window-top class="${groupClass}" style="--panel-titlebar-left:${left}px;--panel-titlebar-right:${right}px"><div data-panel-header class="${headerClass}" style="height:62px"><div aria-hidden="true" class="shrink-0" style="width:var(--panel-titlebar-left)"></div><div data-zone-tabstrip="${id}" class="group/pane-header relative flex min-w-0 shrink-0 select-none bg-(--ui-sidebar-surface-background) h-7 [-webkit-app-region:no-drag] flex-1 absolute inset-x-0 bottom-0"><div role="tablist" class="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain">${tabs}</div></div>${drag}<div aria-hidden="true" class="shrink-0" style="width:var(--panel-titlebar-right)"></div></div><div class="zone-body relative min-h-0 min-w-0 flex-1 overflow-hidden"><div data-zone-body="${id}" style="display:contents"><div class="pane-body absolute inset-0 overflow-auto">Content</div></div></div></div></div>`
const textTab = (id, title) => `<button id="${id}" data-tour="tab-${id}" data-active="false" type="button" class="group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary) transition-colors hover:bg-transparent hover:text-foreground"><span>${title}</span></button>`
const page = `<section class="page-shell flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)"><div class="page-head shrink-0"><div class="page-grid grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 pb-2 pt-[calc(var(--titlebar-height)+0.5rem)]"><div class="flex min-w-0 items-center justify-start"></div><div data-tour="page-tabs" class="flex min-w-0 items-center justify-center"><div class="wide-tabs hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex justify-center">${textTab('tools','Tools')}${textTab('skills','Skills')}${textTab('plugins','Plugins')}</div><div class="narrow-tabs md:hidden"><button id="page-dropdown" type="button" class="dropdown-trigger flex h-7 cursor-pointer items-center gap-1.5 px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-foreground [-webkit-app-region:no-drag]"><span>Tools</span><span>⌄</span></button></div></div><div class="flex min-w-0 items-center justify-end"></div></div></div><div class="min-h-0 flex-1 overflow-hidden">Capabilities</div></section>`
const tablessGroup = (id, content) => `<div class="fixture-pane"><div data-tree-group="${id}" data-window-top class="${groupClass}" style="--panel-titlebar-left:0px;--panel-titlebar-right:140px"><div data-panel-header class="${headerClass}" style="height:34px"><div aria-hidden="true" class="shrink-0" style="width:0px"></div>${drag}<div aria-hidden="true" class="shrink-0" style="width:140px"></div></div><div class="zone-body relative min-h-0 min-w-0 flex-1 overflow-hidden"><div data-zone-body="${id}" style="display:contents"><div class="pane-body absolute inset-0 overflow-auto">${content}</div></div></div></div></div>`

async function fixture(b, html, width, titlebarHeight = 34) {
  const { CSS } = await loadPluginInternals(['CSS'])
  await b.call('Emulation.setDeviceMetricsOverride', { width, height:400, deviceScaleFactor:1, mobile:false })
  await b.call('Page.setDocumentContent', { frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,
    html:`<!doctype html><html><style>${nativeCSS}${nativeSeam}${CSS}:root{--titlebar-height:${titlebarHeight}px}</style><body>${html}</body></html>` })
  await b.evaluate(`window.targets=[...document.querySelectorAll('[data-tree-tab],button')];window.events=[];
    window.targets.forEach(t=>{if(t.hasAttribute('data-tree-tab'))t.onpointerdown=e=>{if(e.button===0){e.preventDefault();e.stopPropagation();t.setAttribute('aria-selected','true');window.events.push(t.id)}};else t.onclick=()=>{t.dataset.active='true';window.events.push(t.id)}});
    window.rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
    window.measure=()=>[...document.querySelectorAll('[data-tree-group]')].map(g=>{const h=g.querySelector('[data-panel-header]'),d=h.querySelector('[data-window-drag-handle]'),s=h.querySelector('[data-zone-tabstrip]');return {id:g.dataset.treeGroup,header:rect(h),drag:rect(d),dragRegion:getComputedStyle(d).webkitAppRegion,pointer:getComputedStyle(d).pointerEvents,strip:s?rect(s):null,stripRegion:s?getComputedStyle(s).webkitAppRegion:null,targets:[...g.querySelectorAll('[data-tree-tab],button')].filter(t=>t.getBoundingClientRect().width).map(t=>({id:t.id,rect:rect(t),region:getComputedStyle(t).webkitAppRegion,hit:t.contains(document.elementFromPoint(t.getBoundingClientRect().x+5,t.getBoundingClientRect().y+2))}))}});
    window.enable=()=>document.documentElement.setAttribute('data-codex-chat-look','true');
    window.disable=()=>document.documentElement.removeAttribute('data-codex-chat-look');`)
}
function disjoint(a, b) { return a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y }
async function press(b, id, sample = null) {
  const point = await b.evaluate(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();const s=${JSON.stringify(sample)};return s?{x:r.x+r.width*s[0],y:r.y+r.height*s[1]}:{x:r.x+5,y:r.y+2}})()`)
  await b.call('Input.dispatchMouseEvent', { type:'mouseMoved', ...point })
  await b.call('Input.dispatchMouseEvent', { type:'mousePressed', ...point, button:'left', clickCount:1 })
  await b.call('Input.dispatchMouseEvent', { type:'mouseReleased', ...point, button:'left', clickCount:1 })
}

for (const width of [1100, 800]) test(`native Sessions/Bots and pane tabs keep disjoint drag rectangles and pointerdown activation at ${width}px`, async () => {
  const b = await chromium()
  try {
      await fixture(b, `<div class="fixture-row">${tabbedGroup('grp-sessions',40,0,tab('sessions','Sessions')+tab('bots','Bots'))}${tabbedGroup('grp-main',0,140,tab('chat','Chat')+tab('browser','Browser'))}</div>`, width)
      const before = await b.evaluate('measure()')
      await b.evaluate('enable()')
      const on = await b.evaluate('measure()')
      console.log(JSON.stringify({ scenario:'tabbed', width, on }))
      for (const g of on) {
        assert.equal(g.header.height,48)
        assert.equal(g.strip.height,48)
        assert.equal(g.dragRegion,'drag')
        assert.equal(g.pointer,'none')
        for (const t of g.targets) {
          assert.ok(disjoint(g.drag,t.rect),`${g.id}/${t.id}: sibling native drag rectangle overlaps the tab`)
          assert.equal(t.region,'no-drag')
          assert.equal(t.hit,true)
          await press(b,t.id)
          assert.equal(await b.evaluate(`document.getElementById(${JSON.stringify(t.id)}).getAttribute('aria-selected')`),'true')
        }
        assert.equal(g.drag.height,10,'only the top padding gap belongs to the sibling native drag handle')
      }
      assert.deepEqual(await b.evaluate('events'),['sessions','bots','chat','browser'])
      assert.equal(await b.evaluate(`(()=>{const s=document.querySelector('[data-zone-tabstrip="grp-main"]'),r=s.getBoundingClientRect();return getComputedStyle(document.elementFromPoint(r.x+8,r.y+5)).webkitAppRegion})()`),'drag')
      assert.equal(await b.evaluate('targets.every(t=>t===document.getElementById(t.id))'),true)
      await b.evaluate('disable()')
      assert.deepEqual(await b.evaluate('measure()'),before,'disable restores native dimensions and app regions')
  } finally { b.close() }
})

for (const titlebarHeight of [0, 34]) for (const width of [1100, 640]) test(`tabless main PageSearchShell controls keep disjoint drag rectangles and coordinate clicks at ${width}px, titlebar ${titlebarHeight}px`, async () => {
  const b = await chromium()
  try {
      // A real page remains behind the native absolute pane/zone-body ancestry.
      await fixture(b, `<div class="fixture-row">${tablessGroup('grp-main',page)}</div>`, width, titlebarHeight)
      const before = await b.evaluate('measure()')
      await b.evaluate('enable()')
      const [on] = await b.evaluate('measure()')
      console.log(JSON.stringify({ scenario:'page', width, on }))
      assert.equal(on.header.height,48,'the top-band geometry must not shrink')
      assert.equal(on.dragRegion,'drag')
      assert.equal(on.drag.y,on.header.y)
      const ids = width >= 768 ? ['tools','skills','plugins'] : ['page-dropdown']
      assert.deepEqual(on.targets.map(t=>t.id),ids)
      for (const t of on.targets) {
        assert.equal(t.rect.y,titlebarHeight+8,'PageSearchShell uses the actual shell variable, including current 0px')
        assert.ok(disjoint(on.drag,t.rect),`${t.id}: page control overlaps native drag rectangle`)
        assert.equal(t.hit,true,'the upper edge of the page control is reachable')
        // Native wide TextTab has no app-region class; do not mask the bug
        // with a blanket button no-drag fixture rule.
        assert.equal(t.region,before[0].targets.find(n=>n.id===t.id).region,'preserve the actual native app region')
        for (const x of [.1, .5, .9]) for (const y of [.1, .5, .9]) {
          await press(b,t.id,[x,y])
          assert.equal(await b.evaluate('events.at(-1)'),t.id,'all interior click positions invoke the original button')
        }
      }
      assert.equal(on.drag.height,titlebarHeight+8,'dragging is confined to the page padding, never its buttons')
      assert.deepEqual(await b.evaluate('events'),ids.flatMap(id=>Array(9).fill(id)))
      assert.equal(await b.evaluate('targets.every(t=>t===document.getElementById(t.id))'),true)
      await b.evaluate('disable()')
      assert.deepEqual(await b.evaluate('measure()'),before)
      await b.evaluate(`document.querySelector('.pane-body').innerHTML='<div data-chat-surface>Chat</div>';enable()`)
      assert.equal((await b.evaluate('measure()'))[0].drag.height,48,'transparent chat geometry stays unchanged')
      await b.evaluate(`document.querySelector('.pane-body').innerHTML='<div data-pane-hidden style="visibility:hidden">'+${JSON.stringify(page)}+'</div><div data-chat-surface>Chat</div>'`)
      assert.equal((await b.evaluate('measure()'))[0].drag.height,48,'a cached hidden page does not change the active chat drag band')
      await b.evaluate(`document.querySelector('[data-pane-hidden]').removeAttribute('data-pane-hidden');document.querySelector('.pane-body>div').style.visibility='visible'`)
      assert.equal((await b.evaluate('measure()'))[0].drag.height,titlebarHeight+8,'returning to the page restores its safe drag band')
      await b.evaluate(`document.querySelector('[data-tree-group]').dataset.treeGroup='grp-other';document.querySelector('.pane-body').innerHTML=${JSON.stringify(page)}`)
      assert.equal((await b.evaluate('measure()'))[0].drag.height,48,'page exception is restricted to grp-main')
  } finally { b.close() }
})

test('page drag adjustment preserves search and trailing controls, top-edge scope and height cap', async () => {
  const b = await chromium()
  try {
    await fixture(b, `<div class="fixture-row">${tablessGroup('grp-main',page)}</div>`,1100,0)
    await b.evaluate(`
      const grid=document.querySelector('.page-grid');
      for (const [id,container] of [['page-search',grid.firstElementChild],['page-action',grid.lastElementChild]]) {
        const button=document.createElement('button');button.id=id;button.className='dropdown-trigger';button.textContent=id;
        button.onclick=()=>events.push(id);container.append(button);
      }
      enable();`)
    const [on] = await b.evaluate('measure()')
    for (const id of ['page-search','page-action']) {
      const t=on.targets.find(t=>t.id===id)
      assert.ok(disjoint(on.drag,t.rect))
      for (const y of [.1,.5,.9]) {
        await press(b,id,[.5,y])
        assert.equal(await b.evaluate('events.at(-1)'),id)
      }
    }
    await b.evaluate(`document.querySelector('[data-window-top]').removeAttribute('data-window-top')`)
    assert.equal((await b.evaluate('measure()'))[0].drag.height,34,'non-top pane retains its native handle')
    await b.evaluate(`document.querySelector('[data-tree-group]').setAttribute('data-window-top','');document.documentElement.style.setProperty('--titlebar-height','64px')`)
    assert.equal((await b.evaluate('measure()'))[0].drag.height,48,'large padding cannot expand the fixed 48px header band')
    await b.evaluate('disable()')
    assert.equal((await b.evaluate('measure()'))[0].drag.height,34,'disable restores native handle')
  } finally { b.close() }
})