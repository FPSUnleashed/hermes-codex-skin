import assert from 'node:assert/strict'
import test from 'node:test'
import {actions, message, transcriptFixture} from './helpers/transcript-activity-fixture.mjs'

// Full skin + real browser scheduler/styles over the public DOM and SDK seams.
// This is not an installed Hermes-window qualification.
const md = (id, text = id) => `<div class="aui-md" id="${id}">${text}</div>`
const tool = id => `<div data-slot="tool-block" id="${id}"><details><summary>Read file</summary><pre>Native output</pre></details></div>`
const pair = content => `<section data-session-anchor="workspace"><div id="pair" data-slot="aui_turn-pair"><div data-role="user" data-message-id="stable-user">Question</div><div data-slot="aui_response-group">${content}</div></div></section>`
const sdk = initiallyBusy => `
  window.location.hash = '#/stored';
  const atom = value => {
    const listeners = new Set();
    return {get:()=>value, set:next=>{value=next; for(const fn of listeners)fn(next)}, subscribe:fn=>{listeners.add(fn); return()=>listeners.delete(fn)}};
  };
  const events = new Map();
  const emit=(type,event)=>{for(const key of [type,'*'])events.get(key)?.({...event,type})};
  Object.assign(host, {
    state:{connectionId:atom('local'),profile:atom('default'),activeSessionId:atom('runtime'),focusedSessionId:atom('runtime'),focusedStoredSessionId:atom('stored'),focusedSessionOwner:atom({connectionId:'local',profile:'default'}),gateway:atom('open'),busy:atom(${initiallyBusy}),busyBySession:atom({runtime:${initiallyBusy}})},
    onEvent:(name,fn)=>{events.set(name,fn);return()=>events.delete(name)},
    request:async()=>({messages:[]}),
  });
  const busy = value => {host.state.busy.set(value);host.state.busyBySession.set({runtime:value})};
  const until = async predicate => {
    const end = performance.now()+3000;
    while(!predicate()) {if(performance.now()>end)throw Error('Browser runtime predicate timed out');await new Promise(resolve=>setTimeout(resolve,15))}
  };
  const phase = () => element('pair').getAttribute('data-codex-activity-phase');
  const stop = installBehaviorRuntime();
`

test('browser runtime honors SDK busy and event gaps, fences foreign completion, and folds settled trailing tools', async () => {
  const result = await transcriptFixture(pair(
    message('old', md('earlier-answer', 'Independent earlier answer'))
      + message('execution', tool('work'))
      + message('final', md('latest-answer', 'Latest answer'), actions)
  ), `${sdk(false)}
    try {
      await until(()=>phase()==='completed');
      const initial = {work:visible('work'),earlier:visible('earlier-answer'),latest:visible('latest-answer')};
      busy(true); await until(()=>phase()==='working' && visible('work'));
      const working = !visible('earlier-answer') && visible('latest-answer');
      header().click();
      const workingExpanded = visible('earlier-answer') && visible('latest-answer') && visible('work');
      header().click();
      emit('message.start',{session_id:'runtime',profile:'default',connectionId:'local',payload:{}});
      busy(false); await new Promise(resolve=>setTimeout(resolve,90));
      const gap = phase()==='working' && visible('work');
      emit('message.complete',{session_id:'foreign',profile:'default',connectionId:'local',payload:{}});
      await new Promise(resolve=>setTimeout(resolve,90));
      const foreignIgnored = phase()==='working' && visible('work');
      emit('message.complete',{session_id:'runtime',profile:'default',connectionId:'local',payload:{}});
      await until(()=>phase()==='completed' && !visible('work'));
      element('pair').querySelector('[data-slot="aui_response-group"]').insertAdjacentHTML('beforeend',${JSON.stringify(message('tail-root', tool('tail-work')))});
      await until(()=>!visible('tail-work'));
      const tail = phase()==='completed' && !visible('earlier-answer') && visible('latest-answer');
      const native = element('work').querySelector('details');
      header().click(); native.open=true;
      const expanded = visible('earlier-answer') && visible('latest-answer') && visible('work') && visible('tail-work') && native.open;
      header().click();
      stop(); await until(()=>header()===null);
      return {initial,working,workingExpanded,gap,foreignIgnored,tail,expanded,cleanup:visible('work')&&visible('tail-work')&&native.open};
    } finally {stop()}
  `)
  assert.deepEqual(result, {initial:{work:false,earlier:false,latest:true},working:true,workingExpanded:true,gap:true,foreignIgnored:true,tail:true,expanded:true,cleanup:true})
})

test('browser tool-only turn needs qualified SDK settling, not disappearance of a loading element', async () => {
  const result = await transcriptFixture(pair(message('execution', tool('work'))), `${sdk(true)}
    try {
      await until(()=>phase()==='working');
      const active = visible('work') && header().disabled;
      busy(false); await until(()=>phase()==='completed' && !visible('work'));
      const settled = !header().disabled;
      header().click(); const open = visible('work');
      host.state.connectionId.set('foreign'); await until(()=>header()===null);
      return {active,settled,open,quarantined:visible('work')};
    } finally {stop()}
  `)
  assert.deepEqual(result, {active:true,settled:true,open:true,quarantined:true})
})
