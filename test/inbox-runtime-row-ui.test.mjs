import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Execute the real renderer directly so this gate does not depend on a shipping
// bundle being rebuilt by the parent. The bundle supplies skin paint only.
const rowSource = await readFile(new URL('../src/inbox-row-ui.js', import.meta.url), 'utf8')
const runtimeSource = await readFile(new URL('../src/inbox-runtime.js', import.meta.url), 'utf8')
const title = 'A conversation title long enough to truncate in a compact sidebar'
const nativeFixture = `<div id="native" class="row-hover"><button type="button" data-slot="row-button"><span aria-hidden="true"></span><span><span class="truncate text-[0.8125rem]"><span>${title}</span></span></span></button><div data-row-actions><button type="button" aria-label="Native options">⋯</button><button type="button" aria-label="Native clock">◷</button></div></div>`
const nativeCSS = `
#native{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:stretch;min-height:1.625rem;padding-right:.5rem;border-radius:.375rem;position:relative}
#native>[data-slot=row-button]{box-sizing:border-box;display:flex;height:100%;min-width:0;align-items:center;align-self:stretch;gap:.375rem;padding:.125rem .5rem;background:transparent;text-align:left;z-index:0}
#native>[data-slot=row-button]>span:first-child{display:grid;width:.875rem;height:.875rem;flex-shrink:0;place-items:center;overflow:hidden}
#native>[data-slot=row-button]>span:last-child{min-width:0;flex:1;align-self:center}
#native .truncate{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem;line-height:1.35;font-weight:400;color:var(--ui-text-secondary)}
#native>[data-row-actions]{display:flex;flex-shrink:0;align-items:center;align-self:stretch}
#native>[data-row-actions]>button{box-sizing:border-box;display:inline-flex;width:1.5rem;height:1.5rem;flex-shrink:0;padding:0;border-radius:4px}
`

for (const mode of ['standalone', 'dark', 'light']) {
  test(`production Inbox renderer uses compact row helper and preserves native actions (${mode})`, async () => {
    const { CSS } = await loadPluginInternals(['CSS'])
    const browser = await chromium()
    try {
      await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true })
      await browser.call('Emulation.setDeviceMetricsOverride', { width: 640, height: 480, deviceScaleFactor: 1, mobile: false })
      const dark = mode !== 'light'
      const html = `<!doctype html><html data-codex-chat-look="true" data-hermes-theme="codex-chat" data-hermes-mode="${dark ? 'dark' : 'light'}"><head><style>
      :root{font-size:16px;--ui-text-primary:${dark ? '#eee' : '#222'};--ui-text-secondary:${dark ? '#aaa' : '#666'};--ui-text-tertiary:#888;--ui-text-quaternary:#777;--ui-row-active-background:${dark ? '#3e3e3e' : '#ddd'};--ui-row-hover-background:${dark ? '#333' : '#e4e4e4'};--ui-sidebar-surface-background:${dark ? '#1c1c1c' : '#f3f3f3'};--ui-chat-surface-background:${dark ? '#1c1c1c' : '#f3f3f3'};--theme-foreground:${dark ? '#eee' : '#222'};--theme-sidebar-seed:${dark ? '#1c1c1c' : '#f3f3f3'};--theme-background-seed:${dark ? '#1c1c1c' : '#f3f3f3'};--theme-accent-soft:${dark ? '#3e3e3e' : '#ddd'};--theme-card-seed:${dark ? '#242424' : '#fff'};--theme-elevated-seed:${dark ? '#242424' : '#fff'};--ui-accent:#4488dd;--ui-bg-elevated:${dark ? '#242424' : '#fff'};--ui-stroke-secondary:${dark ? '#555' : '#ccc'};--ui-control-active-background:${dark ? '#333' : '#e4e4e4'}}
      *{box-sizing:border-box}body{margin:20px;font:14px system-ui;color:var(--ui-text-primary);background:var(--ui-sidebar-surface-background)}button{font:inherit;color:inherit;border:0;background:transparent}.flex{display:flex}.flex-col{flex-direction:column}.w-full{width:100%}.shrink-0{flex-shrink:0}[data-sessions-mode]{width:300px;height:380px;display:flex;flex-direction:column}${nativeCSS}
      </style><style>${mode === 'standalone' ? '' : CSS}</style></head><body><div data-tree-group="grp-sessions"><aside data-slot="sidebar"><div data-sessions-mode="sessions"><div data-slot="sidebar-group" id="native-group"><div class="group/section"><button class="group/section-label" id="native-header">Sessions</button></div><div data-slot="sidebar-group-content">${nativeFixture}</div></div></div></aside></div><button id="outside">Outside native control</button></body></html>`
      await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
      await browser.evaluate(`
        window.measure=row=>{const go=row.querySelector('[data-slot="row-button"]'),lead=go.firstElementChild,label=go.lastElementChild.firstElementChild,actions=row.querySelector('[data-row-actions]'),r=row.getBoundingClientRect();const box=el=>{const b=el.getBoundingClientRect();return [b.x-r.x,b.y-r.y,b.width,b.height]};const s=getComputedStyle(label);return {row:[r.width,r.height],go:box(go),lead:box(lead),label:box(label),actions:box(actions),slots:[...actions.children].map(box),type:[s.fontSize,s.lineHeight,s.fontWeight]}};
        window.nativeRow=document.getElementById('native');window.nativeBefore=measure(nativeRow);window.nativeHTML=nativeRow.outerHTML;window.nativeNodes=[nativeRow,...nativeRow.querySelectorAll('*')];
        window.nativeClicks=0;window.nativeMenus=0;window.nativeToggles=0;nativeRow.firstElementChild.onclick=()=>nativeClicks++;nativeRow.querySelector('[aria-label="Native options"]').onclick=()=>nativeMenus++;document.getElementById('native-header').onclick=()=>nativeToggles++;
        window.bubbled=0;document.querySelector('[data-sessions-mode]').addEventListener('click',()=>bubbled++);document.querySelector('[data-sessions-mode]').addEventListener('pointerdown',()=>bubbled++);
      `)
      await browser.evaluate(rowSource)
      await browser.evaluate(runtimeSource)
      await browser.evaluate(`
        window.atom=value=>{const fns=new Set();return {get:()=>value,subscribe:fn=>{fns.add(fn);return()=>fns.delete(fn)},set:next=>{value=next;fns.forEach(fn=>fn())}}};
        window.scope={connectionId:'source-a',profile:'default'};window.data=new Map();window.storage={get:key=>data.get(key),set:(key,value)=>data.set(key,structuredClone(value))};
        window.opens=[];window.drafts=[];window.host={state:{activeSessionId:atom('a'),focusedStoredSessionId:atom('a'),profile:atom('default'),connectionId:atom('source-a')},openSession:(id,options)=>{opens.push({id,options});host.state.focusedStoredSessionId.set(id)},newChat:route=>drafts.push(route)};
        window.frames=new Map();window.frameID=0;window.scheduler={MutationObserver,requestAnimationFrame:fn=>{frames.set(++frameID,fn);return frameID},cancelAnimationFrame:id=>frames.delete(id)};
        window.flush=async()=>{for(let i=0;i<12;i++){await Promise.resolve();await Promise.resolve();if(!frames.size)return;const todo=[...frames.values()];frames.clear();todo.forEach(fn=>fn())}throw Error('RAF loop')};
        window.rows=[{id:'a',source:'desktop',title:${JSON.stringify(title)},message_count:2,started_at:(Date.now()+60000)/1000},{id:'b',source:'desktop',title:'Second thread',message_count:3,started_at:(Date.now()+60000)/1000}];
        window.runtime=installCodexInboxRuntime({storage,host,window:scheduler});window.update=(extra={})=>runtime.update({scope,sessions:rows,liveSessions:[],liveStatusKnown:true,...extra});
        window.row=id=>document.querySelector('[data-codex-inbox-row="'+id+'"]');window.controls=id=>[...row(id).querySelector('[data-row-actions]').children];window.settle=id=>row(id).querySelector('[data-codex-inbox-settle]');window.snooze=id=>row(id).querySelector('[data-codex-inbox-snooze]');window.visibility=id=>controls(id).map(el=>({opacity:getComputedStyle(el).opacity,pointerEvents:getComputedStyle(el).pointerEvents,disabled:el.disabled}));
        update({liveSessions:rows.map(r=>({session_id:r.id,status:'working'}))});update();flush();
      `)
      assert.equal(await browser.evaluate("row('a').hasAttribute('data-codex-inbox-row-ui')"), true, 'production renderer must use the helper shell')
      const initial = await browser.evaluate("({geometry:measure(row('a')),native:measure(nativeRow),nativeBefore,nativeUnchanged:nativeRow.outerHTML===nativeHTML,order:controls('a').map(el=>el.hasAttribute('data-codex-inbox-settle')?'settle':el.hasAttribute('data-codex-inbox-snooze')?'snooze':'unexpected'),key:row('a').getAttribute('data-codex-inbox-key'),selected:row('a').getAttribute('aria-current'),display:getComputedStyle(row('a')).display})")
      assert.deepEqual(initial.native, initial.nativeBefore, 'scoped renderer CSS does not restyle native rows')
      assert.equal(initial.nativeUnchanged, true)
      assert.deepEqual(initial.geometry, initial.nativeBefore, 'real production geometry matches the compact native fixture')
      assert.equal(initial.display, 'grid')
      assert.equal(initial.geometry.row[1], 26)
      assert.equal(initial.geometry.lead[2], 14)
      assert.equal(initial.geometry.label[0], 28)
      assert.deepEqual(initial.geometry.slots.map(box => box.slice(2)), [[24, 24], [24, 24]])
      assert.deepEqual(initial.order, ['snooze', 'settle'], 'Inbox DOM order matches visual order: Snooze left, Settle right')
      assert.equal(await browser.evaluate("snooze('a').getBoundingClientRect().x < settle('a').getBoundingClientRect().x"), true, 'Chromium renders named controls in the requested positions')
      assert.equal(initial.key, JSON.stringify(['source-a', 'default', 'a']))
      assert.equal(initial.selected, 'true')
      assert.equal(await browser.evaluate("row('a').querySelector('[data-codex-inbox-menu]').hasAttribute('aria-haspopup')"), false, 'Settle is an action, not an advertised native menu')
      assert.equal(await browser.evaluate("row('a').textContent"), title, 'glyph controls do not leave permanent action text')
      await browser.evaluate("document.querySelector('[data-sessions-mode]').style.width='180px'")
      assert.deepEqual(await browser.evaluate("measure(row('a'))"), await browser.evaluate('measure(nativeRow)'), 'production title truncates while control slots stay fixed at narrow width')
      assert.deepEqual(await browser.evaluate("measure(row('a')).slots.map(box=>box.slice(2))"), [[24, 24], [24, 24]])
      await browser.evaluate("document.querySelector('[data-sessions-mode]').style.width='300px'")
      const capture = async state => {
        if (!process.env.CODEX_INBOX_ROW_PREVIEW) return
        const { data } = await browser.call('Page.captureScreenshot', { format: 'png' })
        const file = `${process.env.CODEX_INBOX_ROW_PREVIEW}-${mode}-${state}.png`
        await writeFile(file, Buffer.from(data, 'base64'))
        console.log('Production row screenshot: ' + file)
      }
      const waitPaint = () => browser.evaluate('new Promise(resolve=>setTimeout(resolve,140))')
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 620, y: 450 })
      await browser.evaluate("document.getElementById('outside').focus()")
      await waitPaint()
      assert.deepEqual((await browser.evaluate("visibility('a')")).map(s => [s.opacity, s.pointerEvents]), [['0', 'none'], ['1', 'auto']], 'Settle remains identifiable at rest; selection alone does not expose Snooze')
      await capture('idle')
      const point = await browser.evaluate("(()=>{const r=row('a').getBoundingClientRect();return {x:r.left+10,y:r.top+r.height/2}})()")
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
      await waitPaint()
      assert.deepEqual((await browser.evaluate("visibility('a')")).map(s => [s.opacity, s.pointerEvents]), [['1', 'auto'], ['1', 'auto']])
      assert.deepEqual(await browser.evaluate("measure(row('a'))"), initial.geometry, 'hover does not change geometry')
      await capture('hover')
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 620, y: 450 })
      await browser.evaluate("row('a').querySelector('[data-codex-inbox-open]').focus()")
      await waitPaint()
      assert.deepEqual((await browser.evaluate("visibility('a')")).map(s => s.opacity), ['1', '1'])
      await capture('focus')
      const key = async (value, code, number) => {
        await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, windowsVirtualKeyCode: number, ...(value === 'Enter' ? { text: '\r' } : {}) })
        await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode: number })
        await browser.evaluate('flush()')
      }
      await key('Enter', 'Enter', 13)
      assert.deepEqual(await browser.evaluate('opens'), [{ id: 'a', options: { profile: 'default', route: { connectionId: 'source-a', profile: 'default' } } }], 'trusted open keeps the existing callback and route')
      assert.equal(await browser.evaluate('bubbled'), 0)
      await key('Tab', 'Tab', 9)
      assert.equal(await browser.evaluate("document.activeElement===snooze('a')"), true, 'Tab first reaches the left Snooze slot')
      await key('Tab', 'Tab', 9)
      assert.equal(await browser.evaluate("document.activeElement===settle('a')"), true, 'Tab next reaches the right Settle slot')
      await browser.evaluate("window.stable=row('a');window.stableMenu=settle('a');window.stableGo=row('a').firstElementChild;window.stableClock=snooze('a');rows=[{...rows[0],title:'<b>Renamed literally</b>'},rows[1]];update();flush()")
      assert.equal(await browser.evaluate("row('a')===stable&&settle('a')===stableMenu&&snooze('a')===stableClock&&row('a').firstElementChild===stableGo&&document.activeElement===stableMenu"), true, 'update retains keyed nodes, controls and keyboard focus')
      assert.equal(await browser.evaluate("row('a').querySelector('[data-codex-inbox-label]').textContent"), '<b>Renamed literally</b>')
      assert.equal(await browser.evaluate("row('a').querySelector('b')"), null)
      await browser.evaluate("window.rootRows=rows;rows=[{...rows[0],id:'a-tip',_lineage_root_id:'a',_lineage_ids:['a','a-tip']},rows[1]];update();flush()")
      assert.equal(await browser.evaluate("row('a-tip')===stable&&document.activeElement===stableMenu&&row('a-tip').getAttribute('aria-current')==='true'"), true, 'lineage changes durable ID, not the keyed row, focus or selected owner')
      assert.equal(await browser.evaluate("row('a-tip').getAttribute('data-codex-inbox-key')"), initial.key)
      await browser.evaluate("row('a-tip').firstElementChild.focus()")
      await key('Enter', 'Enter', 13)
      assert.equal(await browser.evaluate('opens.at(-1).id'), 'a-tip', 'reused callbacks resolve the current durable ID')
      await browser.evaluate("rows=rootRows;host.state.focusedStoredSessionId.set('a');update();flush().then(()=>settle('a').focus())")
      for (const extra of [{ liveSessions: [{ session_id: 'a', status: 'working' }] }, { liveSessions: [{ session_id: 'a', status: 'resuming' }] }, { liveStatusKnown: false }, { loading: true }, { error: 'unavailable' }]) {
        await browser.evaluate(`update(${JSON.stringify(extra)});flush()`)
        assert.equal(await browser.evaluate("settle('a').disabled"), false, 'local attention Settle is independent of activity and metadata loading')
        await waitPaint()
        assert.equal(await browser.evaluate("getComputedStyle(settle('a')).visibility"), 'visible', 'working/unknown/loading/error Settle remains visible')
        assert.equal((await browser.evaluate("visibility('a')"))[1].opacity, '1')
        assert.equal(await browser.evaluate("document.activeElement===settle('a')"), true, 'activity changes preserve keyboard focus on Settle')
        await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', ...point })
        await waitPaint()
        assert.equal((await browser.evaluate("visibility('a')"))[1].opacity, '1', 'hover leaves Settle available')
        assert.equal(await browser.evaluate("getComputedStyle(settle('a')).visibility"), 'visible')
        assert.deepEqual(await browser.evaluate("measure(row('a'))"), initial.geometry, 'activity-independent Settle keeps its 24px slot and title/Snooze positions')
        await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', x:620,y:450 })
        assert.equal(await browser.evaluate("snooze('a').disabled"), Boolean(extra.loading || extra.error), 'Snooze remains enabled while work is busy')
        assert.equal(await browser.evaluate("row('a').firstElementChild.disabled"), false, 'open retains its existing enabled state')
      }
      await browser.evaluate("runtime.activity({connectionId:scope.connectionId,profile:scope.profile,session_id:'a',type:'message.complete',payload:{status:'complete'}});update();flush().then(()=>settle('a').focus())")
      assert.equal(await browser.evaluate("settle('a').disabled"), false)
      await key('Enter', 'Enter', 13)
      assert.equal(await browser.evaluate("runtime.model.isSettled(scope,'a')&&!row('a')&&!document.querySelector('[data-codex-inbox-snooze-popup]')"), true, 'dedicated check preserves Settle behavior without a fake native menu')
      assert.equal(await browser.evaluate('opens.at(-1).id'), 'b', 'settling current row keeps next-thread navigation')
      assert.equal(await browser.evaluate('nativeRow.outerHTML===nativeHTML'), true)
      await browser.evaluate("row('b').firstElementChild.focus()")
      await key('Tab', 'Tab', 9)
      assert.equal(await browser.evaluate("document.activeElement===snooze('b')"), true, 'Snooze is first in Inbox keyboard order')
      await key('Enter', 'Enter', 13)
      assert.deepEqual(await browser.evaluate("[...document.querySelector('[data-codex-inbox-snooze-popup]').children].map(el=>el.textContent)"), ['15 min', '30 min', '1 hour', '3 hours', '1 day'])
      await capture('snooze-popup')
      await key('Enter', 'Enter', 13)
      assert.equal(await browser.evaluate("runtime.model.isSnoozed(scope,'b')&&!row('b')&&!document.querySelector('[data-codex-inbox-snooze-popup]')"), true, 'trusted Snooze preset commits through existing callback')
      assert.deepEqual(await browser.evaluate('drafts'), [{ connectionId: 'source-a', profile: 'default' }])
      await browser.evaluate("nativeRow.firstElementChild.click();nativeRow.querySelector('[aria-label=\"Native options\"]').click();document.getElementById('native-header').click()")
      assert.deepEqual(await browser.evaluate('({clicks:nativeClicks,menus:nativeMenus,toggles:nativeToggles,bubbled})'), { clicks: 1, menus: 1, toggles: 1, bubbled: 3 })
      assert.equal(await browser.evaluate("nativeNodes.every((el,i)=>el===[nativeRow,...nativeRow.querySelectorAll('*')][i])&&nativeRow.outerHTML===nativeHTML"), true, 'native identity, markup and handlers stay intact')
      await browser.evaluate("runtime.dispose();flush()")
      assert.equal(await browser.evaluate("!!document.querySelector('[data-codex-inbox-owned]')"), false)
      assert.deepEqual(await browser.evaluate('measure(nativeRow)'), initial.nativeBefore)
      console.log(JSON.stringify({ mode, productionGeometry: initial.geometry, controls: initial.order, nativeUntouched: true }))
    } finally { browser.close() }
  })
}
