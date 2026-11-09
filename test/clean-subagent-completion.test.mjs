import assert from 'node:assert/strict'
import test from 'node:test'
import { actions, message, transcriptFixture as fixture } from './helpers/transcript-activity-fixture.mjs'

const heading = 'Subagent Tasks Completed: inspect, verify'
// Native BackgroundResult > ScaffoldRow > DisclosureRow ancestry, retained
// from the old test; no private host component is reimplemented here.
const notice = (id, label = heading, body = 'Worker results', extra = '') => `<div id="${id}" data-slot="aui_background-result" ${extra}><div data-conversation-scaffold><div class="group/disclosure-row relative flex w-full"><button type="button" aria-expanded="true"><span class="flex min-w-0 flex-col gap-0.5"><span class="flex min-w-0 items-center gap-1.5"><span class="min-w-0 truncate">${label}</span></span></span><span aria-hidden="true">⌄</span></button><span data-slot="timeline-timestamp">12:00</span></div></div><div class="whitespace-pre-wrap">${body}</div></div>`

test('replacement activity reversibly folds settled subagent completion in both native placements', async () => {
  const html = `<div data-slot="aui_turn-pair" id="pair">
    <div data-role="user" data-slot="aui_user-message-root" id="user">${heading}</div>
    <div data-slot="aui_response-group">
      ${message('interim', '<div class="aui-md">Working</div>')}
      <div data-role="system" data-slot="aui_system-message-root" id="system-wrapper">${notice('system-completion')}<p id="system-sibling">Keep this system detail</p></div>
      ${message('final', '<div class="aui-md">'+heading+'</div>', actions)}
    </div>
    ${notice('direct-completion')}
  </div>`
  const result = await fixture(html, `
    const original=element('pair').innerHTML;
    const nodes=['system-completion','direct-completion','system-sibling','final','user'].map(id=>[id,element(id),element(id).parentNode]);
    let nativeClicks=0;element('direct-completion').querySelector('button').onclick=()=>nativeClicks++;
    reconcile();
    const settled={system:visible('system-completion'),direct:visible('direct-completion'),systemMarked:marked('system-completion'),directMarked:marked('direct-completion'),final:visible('final'),user:visible('user'),sibling:visible('system-sibling'),text:element('final').textContent,label:header().textContent};
    header().click();element('direct-completion').querySelector('button').click();
    const expanded={system:visible('system-completion'),direct:visible('direct-completion'),aria:header().getAttribute('aria-expanded'),nativeClicks};
    header().click();
    element('final').setAttribute('data-streaming','true');reconcile();
    const resumed={system:visible('system-completion'),direct:visible('direct-completion'),marked:marked('direct-completion'),disabled:header().disabled};
    header().click();
    const resumedExpanded=header().getAttribute('aria-expanded')==='true'&&visible('final')&&visible('system-completion')&&visible('direct-completion');
    element('final').removeAttribute('data-streaming');reconcile();
    document.documentElement.dataset.codexCleanTranscript='off';reconcile();
    const retiredOff={system:visible('system-completion'),direct:visible('direct-completion')};
    document.documentElement.dataset.codexChatLook='false';
    const cssOff={system:visible('system-completion'),direct:visible('direct-completion')};
    clearTurnActivityDecorations();
    return {settled,expanded,resumed,resumedExpanded,retiredOff,cssOff,restored:element('pair').innerHTML===original,cleanedVisible:visible('system-completion')&&visible('direct-completion'),preserved:nodes.every(([id,node,parent])=>element(id)===node&&node.parentNode===parent)};
  `)
  assert.equal(result.settled.direct, false)
  assert.equal(result.settled.system, false)
  assert.equal(result.settled.systemMarked, 'collapsed')
  assert.equal(result.settled.directMarked, 'collapsed')
  assert.equal(result.settled.final, true)
  assert.equal(result.settled.user, true)
  assert.equal(result.settled.sibling, true)
  assert.equal(result.settled.text, `${heading}Copy`)
  assert.equal(result.settled.label, 'Worked')
  assert.deepEqual(result.expanded, {system:true,direct:true,aria:'true',nativeClicks:1})
  assert.deepEqual(result.resumed, {system:true,direct:true,marked:'expanded',disabled:false})
  assert.equal(result.resumedExpanded, true, 'earlier replies remain inspectable during resumed work')
  assert.deepEqual(result.retiredOff, {system:false,direct:false})
  assert.deepEqual(result.cssOff, {system:true,direct:true})
  assert.equal(result.restored, true, 'cleanup restores native DOM byte-for-byte')
  assert.equal(result.cleanedVisible, true)
  assert.equal(result.preserved, true)
})

test('replacement activity preserves active, unproven, unrelated, error and genuine message content', async () => {
  const html = `<div data-slot="aui_turn-pair" id="settled">
    <div data-role="user" data-slot="aui_user-message-root" id="genuine-user">${heading}${notice('user-lookalike')}</div>
    <div data-slot="aui_response-group"><div data-role="system" data-slot="aui_system-message-root" id="unrelated-system">Connection restored</div>
    <div data-role="system" data-slot="aui_system-message-root">${notice('process', 'Process completed: command', heading)}</div></div>
    ${notice('direct-process', 'Background process finished', heading)}
    ${notice('nonanchored', `Quoted ${heading}`)}
    ${notice('body-only', 'Worker status', `<span class="font-medium">${heading}</span>`)}
    ${notice('error', heading, '<div role="alert">Worker failed</div>')}
    <div role="alert" id="ancestor-error">${notice('error-inside-alert')}</div>
    <div data-role="system" data-slot="aui_system-message-root" id="system-error"><div role="alert">Connection failed</div></div>
    <div data-slot="aui_response-group">${message('genuine-assistant', `${heading}${notice('assistant-lookalike')}`, actions)}</div>
    <div data-slot="aui_turn-pair" id="nested-unproven">${notice('nested-completion')}</div>
  </div>
  <div data-slot="aui_turn-pair" id="active">${notice('active-completion')}${message('active-final', 'Previous answer', actions)}<div role="status">Running</div></div>
  <div data-slot="aui_turn-pair" id="unproven">${notice('unproven-completion')}${message('unproven-answer', 'Answer without actions')}</div>
  <div data-slot="aui_turn-pair" id="late-content">${notice('late-completion')}${message('old-final', 'Final', actions)}${message('new-content', 'More work')}</div>
  ${notice('orphan-completion')}`
  const ids = ['genuine-user','user-lookalike','unrelated-system','process','direct-process','nonanchored','body-only','error','ancestor-error','error-inside-alert','system-error','genuine-assistant','assistant-lookalike','nested-completion','active-completion','unproven-completion','late-completion','orphan-completion']
  const result = await fixture(html, `
    const saved=Object.fromEntries(${JSON.stringify(ids)}.map(id=>[id,{node:element(id),parent:element(id).parentNode,text:element(id).textContent}]));
    reconcile();
    return Object.fromEntries(${JSON.stringify(ids)}.map(id=>[id,{visible:visible(id),marker:marked(id),preserved:element(id)===saved[id].node&&element(id).parentNode===saved[id].parent&&element(id).textContent===saved[id].text}]));
  `)
  const activeTargets=new Set(['nested-completion','active-completion','unproven-completion','late-completion'])
  for (const id of ids) {
    assert.equal(result[id].visible, true, `${id} must remain visible`)
    assert.equal(result[id].marker, activeTargets.has(id)?'expanded':null, `${id} must never acquire a hide-all marker`)
    assert.equal(result[id].preserved, true, `${id}: node, parent and text preserved`)
  }
})

test('native runtime reconciles late direct notifications and restores them on resume and teardown', async () => {
  const result = await fixture(`<div data-slot="aui_thread-content"><div data-slot="aui_turn-pair" id="pair">${message('final', '<div class="aui-md">Final answer</div>', actions)}</div></div>`, `
    const atom=value=>({get:()=>value,subscribe:()=>()=>{}});
    host.state={activeSessionId:atom('test'),profile:atom('default'),gateway:atom('open')};
    const waitFor=async predicate=>{const limit=performance.now()+3000;while(!predicate()){if(performance.now()>limit)throw Error('Runtime reconciliation timed out');await new Promise(resolve=>setTimeout(resolve,20))}};
    const stop=installBehaviorRuntime();
    try {
      element('pair').insertAdjacentHTML('beforeend', ${JSON.stringify(notice('late-direct'))});
      const node=element('late-direct'),parent=node.parentNode;let clicks=0;node.querySelector('button').onclick=()=>clicks++;
      await waitFor(()=>marked('late-direct')==='collapsed');
      const hidden=!visible('late-direct');header().click();node.querySelector('button').click();
      const manuallyExpanded=visible('late-direct')&&clicks===1;header().click();
      element('final').dataset.streaming='true';await waitFor(()=>marked('late-direct')==='expanded');
      const resumed=visible('late-direct');
      element('final').removeAttribute('data-streaming');await waitFor(()=>marked('late-direct')==='collapsed');
      stop();await waitFor(()=>marked('late-direct')===null);
      return {hidden,manuallyExpanded,resumed,restored:visible('late-direct'),final:visible('final'),headerRemoved:header()===null,preserved:element('late-direct')===node&&node.parentNode===parent};
    } catch(error) {stop();throw error}
  `)
  assert.deepEqual(result, {hidden:true,manuallyExpanded:true,resumed:true,restored:true,final:true,headerRemoved:true,preserved:true})
})
