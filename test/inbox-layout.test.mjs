import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const source = (await Promise.all(['inbox-row-ui.js', 'inbox-runtime.js'].map(file => readFile(new URL('../src/' + file, import.meta.url), 'utf8')))).join('\n')
// The packaged renderer was inspected read-only. Its section keeps flex-1 and
// min-h-32 even when closed; an open Pinned section has intrinsic row height.
const utilities = `.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.shrink-0{flex-shrink:0}.min-h-0{min-height:0}.min-h-32{min-height:8rem}.w-full{width:100%}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.p-0{padding:0}.pb-1{padding-bottom:4px}.gap-px{gap:1px}.relative{position:relative}`
const installedCSS = process.env.CODEX_INBOX_NATIVE_CSS ? await readFile(process.env.CODEX_INBOX_NATIVE_CSS, 'utf8') : utilities

for (const height of [520, 260, 150]) {
  test(`Inbox remains usable above bottom-anchored native sections at ${height}px`, async t => {
    const browser = await chromium()
    try {
      const { CSS } = await loadPluginInternals(['CSS'])
      await browser.call('Emulation.setDeviceMetricsOverride', { width: 640, height: 640, deviceScaleFactor: 1, mobile: false })
      const html = `<!doctype html><html data-codex-chat-look="true" data-hermes-theme="codex-chat" data-hermes-mode="light"><head><style>${installedCSS}</style><style>${CSS}</style><style>
        :root{font-size:16px;--spacing:.25rem;--ui-text-primary:#222;--ui-text-secondary:#555;--ui-text-tertiary:#777;--ui-text-quaternary:#888;--ui-success:#168b52;--ui-accent:#222;--ui-bg-elevated:#fff;--ui-sidebar-surface-background:#eee;--ui-chat-surface-background:#eee;--theme-foreground:#222;--theme-sidebar-seed:#eee;--theme-background-seed:#eee;--theme-accent-soft:#ddd;--theme-card-seed:#fff;--theme-elevated-seed:#fff}
        body{margin:20px;font:14px system-ui}#pane{height:${height}px;width:280px;display:flex;flex-direction:column;overflow:hidden}button{font:inherit}#native-groups{padding:0}#native-groups>div>[class~='group/section']{display:flex;flex:0 0 auto;height:24px}#native-groups>div>[class~='group/section']>button{height:24px}#native-groups .native-row{height:26px;flex:0 0 26px}
      </style></head><body><div data-tree-group="grp-sessions"><aside data-slot="sidebar"><div id="pane"><div id="native-groups" data-sessions-mode="sessions" class="flex min-h-0 flex-1 flex-col overflow-y-auto"></div></div></aside></div><button id="outside">Outside</button></body></html>`
      await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
      await browser.evaluate(`
        window.root=document.getElementById('native-groups');
        for(const [id,label,classes] of [['pins','Pinned','shrink-0 p-0 pb-1'],['recents','Sessions','min-h-32 flex-1 overflow-hidden p-0']]){
          const group=document.createElement('div');group.id=id;group.dataset.slot='sidebar-group';group.className='relative flex w-full min-w-0 flex-col '+classes;
          const heading=document.createElement('div');heading.className='group/section';const button=document.createElement('button');button.type='button';button.className='group/section-label';button.textContent=label;button.setAttribute('aria-expanded','false');heading.append(button);group.append(heading);root.append(group);
          button.onclick=()=>{window.nativeToggles++;const old=group.querySelector('[data-slot="sidebar-group-content"]');if(old){old.remove();button.setAttribute('aria-expanded','false')}else{const content=document.createElement('div');content.dataset.slot='sidebar-group-content';content.className='flex min-h-0 flex-1 flex-col gap-px overflow-y-auto';for(let i=0;i<80;i++){const row=document.createElement('button');row.type='button';row.className='native-row';row.textContent='Native row '+i;row.onclick=()=>window.nativeClicks++;content.append(row)}group.append(content);button.setAttribute('aria-expanded','true')}};
        }
        window.nativeToggles=0;window.nativeClicks=0;window.nativeGroups=[...root.children];window.nativeHeaders=nativeGroups.map(group=>group.firstElementChild.firstElementChild);window.nativeHTML=nativeGroups.map(group=>group.outerHTML);
        window.rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width}};
        window.nativeBefore=nativeGroups.map(rect);
        window.frames=new Map();window.serial=0;window.scheduler={MutationObserver,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id)};
        window.flush=async()=>{for(let i=0;i<15;i++){await Promise.resolve();await Promise.resolve();if(!frames.size)return;const todo=[...frames.values()];frames.clear();todo.forEach(fn=>fn())}throw Error('Render loop')};
        window.store=new Map();window.storage={get:key=>store.get(key),set:(key,value)=>store.set(key,structuredClone(value))};window.scope={connectionId:'source-A',profile:'default'};window.loads=0;window.opens=[];
        window.rows=[{id:'fresh',title:'Inbox task',message_count:1,started_at:(Date.now()+60000)/1000}];window.host={state:{},openSession:(id,route)=>opens.push({id,route}),newChat:()=>{}};
      `)
      await browser.evaluate(source)
      await browser.evaluate(`
        window.runtime=installCodexInboxRuntime({storage,host,window:scheduler});window.update=(extra={})=>runtime.update({scope,sessions:rows.map(r=>({...r,source:'desktop'})),liveSessions:rows.map(r=>({session_id:r.id,status:'working'})),liveStatusKnown:true,hasMore:true,loadMore:()=>loads++,...extra});window.island=()=>document.querySelector('[data-codex-inbox-owned="island"]');window.content=()=>island().querySelector('[data-slot="sidebar-group-content"]');update();flush();
      `)
      const geometry = () => browser.evaluate(`({root:rect(root),inbox:rect(island()),header:rect(island().firstElementChild),content:rect(content()),native:nativeGroups.map(rect),hit:document.elementFromPoint(rect(island()).width/2+20,rect(island()).top+38)?.closest('[data-codex-inbox-owned]')===island()})`)
      const collapsed = await geometry()
      assert.ok(Math.abs(collapsed.native.at(-1).bottom - collapsed.root.bottom) < 2, 'closed native sections sit at the bottom, not halfway down the pane')
      assert.ok(collapsed.native[1].height <= 26, 'collapsed Sessions cannot reserve a blank flex-1 viewport')
      assert.ok(collapsed.inbox.height > 26 && collapsed.content.height >= 26, 'Inbox has room for an actionable row')
      assert.equal(await browser.evaluate('nativeGroups.every((group,i)=>group.outerHTML===nativeHTML[i])'), true, 'native markup is untouched')
      assert.equal(await browser.evaluate("island().textContent.includes('Load more threads')"), false, 'history pagination does not become an Inbox action')
      for (const header of [0, 1]) {
        await browser.evaluate(`nativeHeaders[${header}].click();flush()`)
        const g = await geometry()
        assert.ok(g.content.height >= 26, 'opening a native section cannot squeeze the Inbox out')
        assert.ok(g.inbox.bottom <= g.native[0].top + 1, 'Inbox precedes native sections without overlap')
        assert.ok(g.native[0].bottom <= g.native[1].top + 1, 'native sections do not overlap')
        assert.ok(g.native.at(-1).bottom <= g.root.bottom + 1, 'native sections stay inside the pane')
        assert.equal(g.hit, true, 'Inbox row is visible and hit-testable while native sections are open')
      }
      assert.equal(await browser.evaluate('nativeToggles'), 2)
      assert.equal(await browser.evaluate("nativeGroups.every(group=>group.querySelector('[data-slot=\"sidebar-group-content\"]').scrollHeight>group.querySelector('[data-slot=\"sidebar-group-content\"]').clientHeight)"), true, 'each expanded native list remains scrollable')
      await browser.evaluate("nativeGroups[1].querySelector('[data-slot=\"sidebar-group-content\"]').lastElementChild.click()")
      assert.equal(await browser.evaluate('nativeClicks'), 1, 'native handlers remain functional')
      await browser.evaluate("rows=Array.from({length:205},(_,i)=>({id:'inbox-'+i,title:'Inbox '+i,message_count:1,started_at:(Date.now()+60000)/1000}));update();flush()")
      assert.equal(await browser.evaluate("island().querySelectorAll('[data-codex-inbox-row]').length"), 205, 'all admitted rows are reachable by scrolling, not pagination controls')
      assert.equal(await browser.evaluate("[...island().querySelectorAll('button')].some(el=>/^(Load more|Next|Previous) threads$/.test(el.textContent))"), false)
      assert.equal(await browser.evaluate('loads'), 0, 'no obsolete pagination callback is invoked')
      assert.equal(await browser.evaluate('content().scrollHeight>content().clientHeight&&content().clientHeight>=26'), true)
      await browser.evaluate('content().scrollTop=content().scrollHeight')
      const last = await browser.evaluate(`(()=>{const row=island().querySelector('[data-codex-inbox-row="inbox-204"]');const r=rect(row),c=rect(content());return r.bottom<=c.bottom+1&&r.top>=c.top-1})()`)
      assert.equal(last, true, 'last Inbox row remains accessible with both native lists open')
      const expandedInbox = await geometry()
      await browser.evaluate(`
        window.openNativeHTML=nativeGroups.map(group=>group.outerHTML);
        window.openNativeNodes=nativeGroups.map(group=>[group,...group.querySelectorAll('*')]);
        window.openNativeHandlers=openNativeNodes.map(nodes=>nodes.map(node=>node.onclick));
        window.nativeUnchanged=()=>nativeGroups.every((group,i)=>group.outerHTML===openNativeHTML[i]&&[group,...group.querySelectorAll('*')].every((node,j)=>node===openNativeNodes[i][j]&&node.onclick===openNativeHandlers[i][j]));
        window.nativeMutations=[];window.nativeObserver=new MutationObserver(records=>nativeMutations.push(...records));
        nativeGroups.forEach(group=>nativeObserver.observe(group,{childList:true,subtree:true,attributes:true,characterData:true}));
        island().querySelector('[data-codex-inbox-header]').click();flush();
      `)
      const collapsedInbox = await geometry()
      t.diagnostic(JSON.stringify({ height, collapsedInbox }))
      assert.equal(await browser.evaluate("island().dataset.codexInboxExpanded==='false'&&island().querySelector('[data-codex-inbox-header]').getAttribute('aria-expanded')==='false'&&content().hidden"), true)
      assert.equal(collapsedInbox.content.height, 0, 'collapsed Inbox content occupies no height')
      assert.ok(Math.abs(collapsedInbox.inbox.height - collapsedInbox.header.height) <= 1, 'collapsed Inbox shrinks to its intrinsic header height')
      assert.ok(collapsedInbox.inbox.bottom <= collapsedInbox.native[0].top + 1, 'collapsed Inbox stays above native sections')
      assert.ok(collapsedInbox.native[0].bottom <= collapsedInbox.native[1].top + 1, 'native sections do not overlap while Inbox is collapsed')
      assert.ok(Math.abs(collapsedInbox.native.at(-1).bottom - collapsedInbox.root.bottom) <= 1, 'native sections remain bottom-anchored while Inbox is collapsed')
      assert.equal(await browser.evaluate('nativeUnchanged()&&nativeMutations.length===0&&nativeToggles===2'), true, 'Inbox collapse does not mutate native markup, nodes or handlers')
      await browser.evaluate("island().querySelector('[data-codex-inbox-header]').click();flush()")
      const reopenedInbox = await geometry()
      t.diagnostic(JSON.stringify({ height, reopenedInbox }))
      assert.equal(await browser.evaluate("island().dataset.codexInboxExpanded==='true'&&island().querySelector('[data-codex-inbox-header]').getAttribute('aria-expanded')==='true'&&!content().hidden"), true)
      assert.ok(reopenedInbox.inbox.height >= 56 && reopenedInbox.content.height >= 26, 're-expansion restores the usable expanded minimum height')
      assert.ok(Math.abs(reopenedInbox.inbox.height - expandedInbox.inbox.height) <= 1 && Math.abs(reopenedInbox.content.height - expandedInbox.content.height) <= 1, 're-expansion restores the admitted scrolling viewport')
      assert.equal(await browser.evaluate("island().querySelectorAll('[data-codex-inbox-row]').length===205&&content().scrollHeight>content().clientHeight"), true, 'all admitted rows remain scrollable after re-expansion')
      await browser.evaluate('content().scrollTop=content().scrollHeight')
      assert.equal(await browser.evaluate(`(()=>{const r=rect(island().querySelector('[data-codex-inbox-row="inbox-204"]')),c=rect(content());return r.bottom<=c.bottom+1&&r.top>=c.top-1})()`), true, 'the last admitted Inbox row is visible after re-expansion')
      assert.ok(reopenedInbox.inbox.bottom <= reopenedInbox.native[0].top + 1 && reopenedInbox.native[0].bottom <= reopenedInbox.native[1].top + 1, 'native sections remain below the re-expanded Inbox without overlap')
      assert.ok(Math.abs(reopenedInbox.native.at(-1).bottom - reopenedInbox.root.bottom) <= 1, 'native sections remain bottom-anchored after re-expansion')
      assert.equal(await browser.evaluate('nativeUnchanged()&&nativeMutations.length===0&&nativeToggles===2'), true, 'Inbox re-expansion does not mutate native markup, nodes or handlers')
      await browser.evaluate("nativeObserver.disconnect();nativeGroups[1].querySelector('[data-slot=\"sidebar-group-content\"]').lastElementChild.click()")
      assert.equal(await browser.evaluate('nativeClicks'), 2, 'native row handlers still work after Inbox collapse and re-expansion')
      if (process.env.CODEX_INBOX_LAYOUT_PREVIEW) {
        const { data } = await browser.call('Page.captureScreenshot', { format: 'png' })
        await writeFile(`${process.env.CODEX_INBOX_LAYOUT_PREVIEW}-${height}.png`, Buffer.from(data, 'base64'))
      }
      await browser.evaluate('nativeHeaders.forEach(button=>button.click());flush();runtime.setMode(false);flush()')
      assert.deepEqual(await browser.evaluate('nativeGroups.map(rect)'), await browser.evaluate('nativeBefore'), 'disable restores native layout without restoring mutated host styles')
      assert.equal(await browser.evaluate('nativeGroups.every((group,i)=>group.outerHTML===nativeHTML[i])&&nativeHeaders.every((header,i)=>header===nativeGroups[i].firstElementChild.firstElementChild)'), true)
      await browser.evaluate('runtime.dispose();flush()')
      assert.equal(await browser.evaluate("document.querySelector('[data-codex-inbox-owned]')===null"), true)
    } finally { browser.close() }
  })
}
