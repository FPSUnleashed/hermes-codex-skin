import { referenceFile } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { universalFixture } from './helpers/universal-fixture.mjs'
import { nativeSectionsScript } from './helpers/inbox-only-native-sections.mjs'

// This native-layout comparison requires the authenticated full stylesheet.
referenceFile('HERMES_INSTALLED_ROW_CSS')

test('shipping palette hides complete semantic native lists and restores handlers, collapse state and geometry', () => universalFixture(async browser => {
  const run = script => browser.evaluate(`(async()=>{${script}})()`)
  await run(`
    window.only=()=>contributions.find(e=>e.id==='toggle-inbox-only');
    window.root=document.querySelector('[data-sessions-mode]');root.dataset.sessionsMode='flat';root.dataset.slot='sidebar';root.className='flex min-h-0 flex-1 flex-col overflow-y-auto';root.style.cssText='height:520px;width:270px;display:flex;flex-direction:column';
    window.nativeClicks=0;window.collapse={pins:true,recents:true};
    window.mountNative=(owner=root,empty=false)=>{
      for(const [id,pin] of [['pins',true],['recents',false]]){
        const group=document.createElement('div');group.id=id;group.dataset.slot='sidebar-group';group.setAttribute(pin?'data-session-pin-drop':'data-session-unpin-drop','');group.className='relative flex w-full min-w-0 flex-col '+(pin?'shrink-0 p-0 pb-1':'min-h-32 flex-1 overflow-hidden p-0');
        group.innerHTML='<div class="group/section flex shrink-0 items-center justify-between gap-1 pb-1 pt-1.5"><button class="group/section-label flex w-fit min-w-0 items-center gap-1 bg-transparent text-left leading-none" type="button"><span>Localized '+id+'</span><span class="codicon codicon-chevron-right rotate-90"></span></button></div>';
        const content=document.createElement('div');content.dataset.slot='sidebar-group-content';content.className='flex min-h-0 flex-1 flex-col gap-px overflow-y-auto';
        if(empty)content.innerHTML='<div class="grid min-h-16 place-items-center">Empty list</div>';
        else for(let i=0;i<40;i++){const row=document.createElement('button');row.type='button';row.textContent=id+' row '+i;row.onclick=()=>nativeClicks++;content.append(row)}
        if(collapse[id])group.append(content);
        group.querySelector('button').onclick=()=>{collapse[id]=!collapse[id];if(collapse[id])group.append(content);else content.remove()};owner.append(group);
      }
    };
    mountNative();
    window.control=document.createElement('button');control.textContent='New chat / Bots / navigation';control.id='untouched';document.body.append(control);
    window.unrelated=document.createElement('div');unrelated.dataset.slot='sidebar-group';unrelated.innerHTML='<button>Unrelated section</button>';root.append(unrelated);
    window.geometry=()=>[...root.querySelectorAll(':scope > [data-session-pin-drop],:scope > [data-session-unpin-drop]')].map(el=>{const r=el.getBoundingClientRect();const pane=root.getBoundingClientRect();return [r.x-pane.x,r.y-pane.y,r.width,r.height,getComputedStyle(el).display]});
    window.nativeGroups=[...root.querySelectorAll(':scope > [data-session-pin-drop],:scope > [data-session-unpin-drop]')];
    await flush();root.scrollTop=0;window.before=geometry();window.markup=nativeGroups.map(el=>el.outerHTML);window.handlers=nativeGroups.map(el=>[...el.querySelectorAll('button')].map(b=>b.onclick));window.shelves=[...root.querySelectorAll('[data-codex-inbox-working-toggle],[data-codex-inbox-snoozed-toggle]')];window.shelfState=shelves.map(el=>[el.hidden,el.onclick]);
  `)
  assert.equal(await browser.evaluate('typeof only()?.data.run'), 'function', 'public palette command exists')
  assert.equal(await browser.evaluate('saved.has("inbox-only")'), false, 'default does not save a choice')
  assert.equal(await browser.evaluate('nativeGroups.every(el=>el.getBoundingClientRect().height>0)'), true)
  assert.equal(await run('only().data.run();await flush();return nativeGroups.every(el=>getComputedStyle(el).display==="none"&&el.getClientRects().length===0)'), true, 'header, children, empty space and dividers leave layout')
  assert.equal(await browser.evaluate('JSON.stringify(collapse)'), '{"pins":true,"recents":true}')
  assert.equal(await browser.evaluate('nativeGroups.every((el,i)=>el.outerHTML===markup[i]&&[...el.querySelectorAll("button")].every((b,j)=>b.onclick===handlers[i][j]))'), true, 'no mutations to native nodes or handlers')
  assert.equal(await browser.evaluate('unrelated.getBoundingClientRect().height>0&&control.getBoundingClientRect().height>0'), true)
  assert.equal(await browser.evaluate('shelves.length===2&&shelves.every((el,i)=>el.isConnected&&el.hidden===shelfState[i][0]&&el.onclick===shelfState[i][1])'), true, 'Working and Snoozed retain their visibility and handlers')
  for (const theme of ['light','dark']) {
    await browser.evaluate(`document.documentElement.dataset.hermesMode=${JSON.stringify(theme)}`)
    assert.equal(await browser.evaluate('nativeGroups.every(el=>el.getClientRects().length===0)'), true, theme+' hides entire lists')
  }
  assert.equal(await browser.evaluate('document.querySelector("[data-codex-inbox-owned=island]").getBoundingClientRect().height>0'), true)
  await browser.evaluate('document.activeElement?.blur()')
  for (let i=0;i<14;i++) {
    await browser.call('Input.dispatchKeyEvent', { type:'keyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 })
    await browser.call('Input.dispatchKeyEvent', { type:'keyUp', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 })
    assert.equal(await browser.evaluate('!!document.activeElement?.closest("[data-session-pin-drop],[data-session-unpin-drop]")'), false, 'hidden native rows are absent from keyboard navigation')
  }
  // Other modes reuse the unpin-drop section for projects/search/archive; never hide them.
  for (const mode of ['projects','project','search','archived']) {
    await run(`root.dataset.sessionsMode=${JSON.stringify(mode)};await flush()`)
    assert.equal(await browser.evaluate('getComputedStyle(nativeGroups[1]).display!=="none"'), true, mode+' content preserved')
  }
  await run('root.dataset.sessionsMode="flat";only().data.run();await flush();root.scrollTop=0')
  assert.deepEqual(await browser.evaluate('geometry()'), await browser.evaluate('before'), 'Off restores previous native layout exactly')
  await run('nativeGroups[0].querySelector("[data-slot=sidebar-group-content] button").click();nativeGroups[1].querySelector("button").click();await flush()')
  assert.equal(await browser.evaluate('nativeClicks'), 1)
  assert.equal(await browser.evaluate('collapse.recents'), false, 'native disclosure remains authoritative')
  await run('window.closedMarkup=nativeGroups[1].outerHTML;only().data.run();only().data.run();await flush()')
  assert.equal(await browser.evaluate('nativeGroups[1].outerHTML===closedMarkup&&!collapse.recents'), true, 'toggle does not expand or reset a native section')
  // Late empty sections and a second narrow pane need no discovery observer.
  await run(`
    only().data.run();window.second=document.createElement('aside');second.dataset.slot='sidebar';second.innerHTML='<div data-sessions-mode="flat" class="flex flex-col" style="width:145px;height:180px"></div>';document.body.append(second);mountNative(second.firstElementChild,true);await flush();
  `)
  assert.equal(await browser.evaluate('[...second.querySelectorAll("[data-session-pin-drop],[data-session-unpin-drop]")].every(el=>el.getClientRects().length===0)'), true)
  await run('second.firstElementChild.replaceChildren();mountNative(second.firstElementChild,true);await flush()')
  assert.equal(await browser.evaluate('[...second.querySelectorAll("[data-session-pin-drop],[data-session-unpin-drop]")].every(el=>el.getClientRects().length===0)'), true, 'remount stays hidden')
  await run('second.querySelector("[data-session-pin-drop]").remove();await flush()')
  assert.equal(await browser.evaluate('second.querySelector("[data-session-unpin-drop]").getClientRects().length'), 0, 'no pins')
  await run('second.firstElementChild.replaceChildren();mountNative(second.firstElementChild,true);second.querySelector("[data-session-unpin-drop]").remove();await flush()')
  assert.equal(await browser.evaluate('second.querySelector("[data-session-pin-drop]").getClientRects().length'), 0, 'no sessions')
  // Route/profile changes and a failing Inbox query do not own the global display setting.
  await run('state.profile.set("desk");history.pushState({},"","#/settings");failedSource="A";await refetch()')
  assert.equal(await browser.evaluate('saved.get("inbox-only")==="on"&&getComputedStyle(nativeGroups[0]).display==="none"'), true)
  assert.equal(await browser.evaluate('only().data.run()'), true, 'Off is reachable even if Inbox fails')
  await run('await flush()')
  assert.equal(await browser.evaluate('nativeGroups[0].getBoundingClientRect().height>0'), true)
  // Register the shipped bundle again, as a plugin reload; the accepted saved choice survives.
  await run(`
    only().data.run();for(const dispose of disposals.splice(0).reverse())dispose();await new Promise(r=>setTimeout(r,350));
    window.afterDisable=getComputedStyle(nativeGroups[0]).display;
    contributions.length=0;__pluginDefault.register({storage,register:e=>contributions.push(e),onDispose:fn=>disposals.push(fn)});await flush();
  `)
  assert.notEqual(await browser.evaluate('afterDisable'), 'none', 'plugin disable restores native display')
  assert.equal(await browser.evaluate('getComputedStyle(nativeGroups[0]).display'), 'none', 'reload restores saved choice')
  await run('only().data.run();await flush();nativeGroups[1].querySelector("button").click();await flush()')
  assert.equal(await browser.evaluate('collapse.recents'), true)
  assert.deepEqual(await browser.evaluate('errors'), [])
}))

test('Inbox only has no native-list gap with Inbox expanded/collapsed and either disclosure state', () => universalFixture(async browser => {
  const run = script => browser.evaluate(`(async()=>{${script}})()`)
  await run(`
    window.only=()=>contributions.find(e=>e.id==='toggle-inbox-only');window.root=document.querySelector('[data-sessions-mode]');root.dataset.sessionsMode='flat';root.style.height='520px';
    for(const pin of [true,false]){const g=document.createElement('div');g.dataset.slot='sidebar-group';g.setAttribute(pin?'data-session-pin-drop':'data-session-unpin-drop','');g.className=pin?'shrink-0 pb-1':'flex-1 min-h-32';g.innerHTML='<div class="group/section"><button class="group/section-label">Native</button></div><div data-slot="sidebar-group-content"><button>Row</button></div>';root.append(g)}await flush();if(only())only().data.run();else document.documentElement.setAttribute('data-codex-inbox-only','on');await flush();
  `)
  assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('[data-codex-inbox-owned=island]')).paddingBottom`), '0px', 'no native-list spacer left below Inbox')
  for (let i=0;i<4;i++) {
    await run(`document.querySelector('[data-codex-inbox-header]').click();await flush()`)
    assert.equal(await browser.evaluate(`[...root.querySelectorAll(':scope > [data-slot=sidebar-group]:not([data-codex-inbox-owned])')].every(g=>g.getBoundingClientRect().height===0)`), true)
  }
  await run('root.querySelectorAll(":scope > [data-slot=sidebar-group]:not([data-codex-inbox-owned])").forEach(g=>g.remove());await flush()')
  assert.equal(await browser.evaluate('only().data.run()'), true, 'empty native list ancestry is safe')
}))

test('actual native React section keeps conditional children and keyboard disclosure state through toggle and hot reload', async () => {
  const native = await nativeSectionsScript()
  await universalFixture(async browser => {
    const run = script => browser.evaluate(`(async()=>{${script}})()`)
    await browser.evaluate(native)
    await run(`
      window.only=()=>contributions.find(e=>e.id==='toggle-inbox-only');
      window.owner=document.querySelector('aside');owner.removeAttribute('data-sessions-mode');window.nativeOpens=0;window.unmountNative=nativeMount(owner);await flush();
      window.pins=()=>owner.querySelector('[data-session-pin-drop]');window.recents=()=>owner.querySelector('[data-session-unpin-drop]');
    `)
    assert.equal(await browser.evaluate('!!pins()?.querySelector("[data-slot=sidebar-group-content]")&&!recents()?.querySelector("[data-slot=sidebar-group-content]")'), true)
    assert.equal(await browser.evaluate('typeof only()?.data.run'), 'function')
    await run('only().data.run();await flush()')
    assert.equal(await browser.evaluate('pins().getClientRects().length+recents().getClientRects().length'), 0)
    await run('only().data.run();await flush();recents().querySelector("button").focus()')
    await browser.call('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'})
    await browser.call('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await run('await flush()')
    assert.equal(await browser.evaluate('nativeStates.recents&&!!recents().querySelector("[data-slot=sidebar-group-content]")'), true, 'real React disclosure mounts its native conditional body')
    await run('recents().querySelector("[data-slot=sidebar-group-content] button").click();only().data.run();await flush()')
    assert.equal(await browser.evaluate('nativeOpens'), 1, 'native row action preserved')
    for (let i=0;i<3;i++) {
      await run(`
        for(const dispose of disposals.splice(0).reverse())dispose();contributions.length=0;
        __pluginDefault.register({storage,register:e=>contributions.push(e),onDispose:fn=>disposals.push(fn)});await flush();await new Promise(r=>setTimeout(r,340));
      `)
      assert.equal(await browser.evaluate('getComputedStyle(pins()).display==="none"&&getComputedStyle(recents()).display==="none"&&nativeStates.pins&&nativeStates.recents'), true, 'hot handoff retains choice and native React state')
    }
    await run('only().data.run();await flush()')
    assert.equal(await browser.evaluate('getComputedStyle(pins()).display!=="none"&&getComputedStyle(recents()).display!=="none"&&!!recents().querySelector("[data-slot=sidebar-group-content]")'), true)
    assert.deepEqual(await browser.evaluate('errors'), [])
    await run('unmountNative();await flush()')
  })
})
