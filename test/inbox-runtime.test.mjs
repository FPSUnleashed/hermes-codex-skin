import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { chromium } from './helpers/chromium.mjs';

const execFile = promisify(execFileCallback);
const source = (await Promise.all(['inbox-row-ui.js', 'inbox-runtime.js'].map(file =>
  readFile(new URL('../src/' + file, import.meta.url), 'utf8')))).join('\n');

function fixture() {
  return `<!doctype html><html data-codex-chat-look="true"><head><meta charset="utf-8"><title>pending</title><style>
  :root{--ui-text-primary:CanvasText;--ui-text-tertiary:GrayText;--ui-text-quaternary:GrayText;--ui-accent:Highlight;--ui-control-hover-background:ButtonFace}
  body{margin:0} [data-sessions-mode]{width:260px;height:420px;display:flex;flex-direction:column}button{font:inherit}
  .flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.shrink-0{flex-shrink:0}
  </style></head><body><main id="mount"></main><script>
  ${source.replaceAll('</script', '<\\/script')}
  const results={}, failures=[];
  function check(name, condition) { results[name]=!!condition; if(!condition)failures.push(name); }
  function atom(value){const listeners=new Set();return {get:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:next=>{value=next;for(const fn of listeners)fn()}}}
  const scope={connectionId:'source-a',profile:'default'}, other={connectionId:'source-b',profile:'default'};
  const data=new Map(),storage={get:key=>data.get(key),set:(key,value)=>data.set(key,structuredClone(value))};
  const opens=[],drafts=[],native={clicks:0,pins:0,toggles:0};
  const host={state:{activeSessionId:atom('a'),focusedStoredSessionId:atom('a'),profile:atom('default'),connectionId:atom('source-a')},
    openSession:(id,options)=>{opens.push({id,options});host.state.focusedStoredSessionId.set(id);host.state.activeSessionId.set(id)},
    newChat:route=>drafts.push(route),request:()=>{throw Error('Runtime may not call backend')},notify:()=>{}};
  let frameId=0,frames=new Map(),totalFrames=0;
  const scheduler={MutationObserver,requestAnimationFrame:fn=>{const id=++frameId;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)};
  async function flush(){for(let turn=0;turn<12;turn++){await Promise.resolve();await Promise.resolve();if(!frames.size)return;const todo=[...frames.values()];frames.clear();totalFrames+=todo.length;for(const fn of todo)fn();}throw Error('Observer/RAF loop')}
  function mount(){document.getElementById('mount').innerHTML='<div data-sessions-mode="sessions"><div data-slot="sidebar-group" id="pinned" class="shrink-0 p-0 pb-1"><div class="group/section"><button class="group/section-label" id="pin-header">Épinglées</button><button id="native-add">+</button></div><div data-slot="sidebar-group-content"><div id="native-pin-a" class="row-hover"><button id="pin-open-a">A</button><div data-row-actions><button id="pin-action-a">Pin</button></div></div></div></div><div data-slot="sidebar-group" id="sessions" class="flex-1 p-0"><div class="group/section"><button class="group/section-label" id="session-header">Conversations</button></div><div data-slot="sidebar-group-content"><div id="native-a" class="row-hover"><button id="native-open-a">A</button><div data-row-actions><button id="native-pin-action-a">Pin</button></div></div><div id="native-b" class="row-hover"><button id="native-open-b">B</button><div data-row-actions></div></div></div></div></div>';
    for(const id of ['native-open-a','native-open-b','pin-open-a'])document.getElementById(id).onclick=()=>native.clicks++;
    for(const id of ['native-pin-action-a','pin-action-a'])document.getElementById(id).onclick=()=>native.pins++;
    for(const id of ['pin-header','session-header'])document.getElementById(id).onclick=()=>native.toggles++;
  }
  const created=(Date.now()+60000)/1000;
  const rows=[{id:'a',source:'desktop',title:'Thread A',started_at:created,message_count:2,is_active:true},{id:'b',source:'desktop',title:'Thread B',started_at:created,message_count:5}];
  // Layout/action fixtures begin after one verified work snapshot, never creation.
  const update=(runtime,extra={})=>{const next={scope,sessions:rows,liveSessions:[],liveStatusKnown:true,...extra};next.sessions=next.sessions.map(r=>({source:'desktop',...r}));const first=next.sessions.filter(r=>!runtime.admission.isEligible(next.scope,r));if(first.length)runtime.update({...next,loading:false,error:null,liveStatusKnown:true,liveSessions:first.map(r=>({session_id:r.id,status:'working'}))});runtime.update(next)};
  const inboxRow=id=>document.querySelector('[data-codex-inbox-row="'+id+'"]');
  const settleButton=id=>inboxRow(id)?.querySelector('[data-codex-inbox-settle]');
  let runtime=installCodexInboxRuntime({storage,host,window:scheduler});
  (async()=>{
    update(runtime);await flush();check('late_mount_initially_absent',!document.querySelector('[data-codex-inbox-owned="island"]'));
    mount(); const root=document.querySelector('[data-sessions-mode]'),nativeA=document.getElementById('native-a'),nativePinned=document.getElementById('native-pin-a');
    const nativeClick=document.getElementById('native-open-a'),nativePin=document.getElementById('native-pin-action-a');
    runtime.bindNativeRow(nativeA,rows[0],scope);runtime.bindNativeRow(nativePinned,rows[0],scope);runtime.bindNativeRow(document.getElementById('native-b'),rows[1],scope);
    await flush();
    check('island_before_native_groups',root.firstElementChild.getAttribute('data-codex-inbox-owned')==='island');
    check('initial_inbox_open',document.querySelector('[data-codex-inbox-header]').getAttribute('aria-expanded')==='true');
    document.querySelector('[data-codex-inbox-header]').focus();document.querySelector('[data-codex-inbox-header]').click();await flush();check('inbox_collapses_and_retains_header_focus',getComputedStyle(document.querySelector('[data-codex-inbox-owned="island"] > [data-slot="sidebar-group-content"]')).display==='none'&&document.activeElement.hasAttribute('data-codex-inbox-header'));document.querySelector('[data-codex-inbox-header]').click();await flush();
    check('initial_native_state_untouched',['pinned','sessions'].every(id=>!document.getElementById(id).hasAttribute('data-codex-inbox-collapse')));
    check('native_children_never_moved',root.children[1].id==='pinned'&&root.children[2].id==='sessions'&&nativeA.parentElement.parentElement.id==='sessions');
    check('mounted_is_active_not_working',!settleButton('a').disabled);
    document.getElementById('session-header').click();document.getElementById('pin-header').click();await flush();
    check('native_expansion_handler_untouched',native.toggles===2&&!document.getElementById('sessions').hasAttribute('data-codex-inbox-collapse'));
    update(runtime);await flush();check('native_header_not_intercepted_on_refresh',native.toggles===2&&!document.getElementById('session-header').hasAttribute('data-codex-inbox-disclosure'));
    settleButton('a').click();await flush();
    check('settle_removes_only_inbox',!inboxRow('a')&&nativeA===document.getElementById('native-a')&&nativePinned===document.getElementById('native-pin-a'));
    check('current_settle_opens_next_scoped',opens.length===1&&opens[0].id==='b'&&opens[0].options.route.connectionId==='source-a'&&opens[0].options.profile==='default');
    check('badges_in_sessions_and_pinned',document.querySelectorAll('[data-codex-inbox-owned="badge"]').length===2);
    nativeClick.click();nativePin.click();check('native_click_and_pin_preserved',native.clicks===1&&native.pins===1&&nativeClick===document.getElementById('native-open-a')&&nativePin===document.getElementById('native-pin-action-a'));
    const badge=nativeA.querySelector('[data-codex-inbox-owned="badge"]');badge.focus();
    check('focus_exposes_unsettle',getComputedStyle(badge.querySelector('.codex-inbox-unsettle')).display!=='none'&&getComputedStyle(badge.querySelector('.codex-inbox-settled')).display==='none');
    const clicks=native.clicks;badge.click();await flush();
    check('unsettle_returns_inbox_without_navigation',!!inboxRow('a')&&opens.length===1&&native.clicks===clicks&&!nativeA.querySelector('[data-codex-inbox-owned="badge"]'));
    settleButton('a').click();await flush();check('noncurrent_settle_never_navigates',opens.length===1&&drafts.length===0);
    update(runtime,{sessions:[{...rows[0],last_active:999,unread:true,title:'Renamed'},rows[1]],liveSessions:[{session_id:'a',status:'resuming'}]});await flush();
    check('reread_and_resuming_stay_settled',!inboxRow('a')&&runtime.model.isSettled(scope,'a'));
    runtime.reactivate({scope,type:'read',session_id:'a'});await flush();check('read_event_ignored',runtime.model.isSettled(scope,'a'));
    runtime.reactivate({scope:other,type:'work',session_id:'a'});await flush();check('foreign_event_ignored',runtime.model.isSettled(scope,'a'));
    runtime.reactivate({scope,type:'input',session_id:'a'});await flush();check('input_event_reactivates',!!inboxRow('a'));
    update(runtime,{liveSessions:[{session_id:'a',session_key:'runtime-a',status:'working'}],busyBySession:{'runtime-a':true}});await flush();
    check('work_keeps_settle_available',!!inboxRow('a')&&!settleButton('a').disabled);
    update(runtime,{liveSessions:[{session_id:'a',status:'resuming'}]});await flush();check('hydration_keeps_settle_available',!settleButton('a').disabled);
    update(runtime,{liveStatusKnown:false});await flush();check('unknown_live_keeps_settle_available',!settleButton('a').disabled&&!settleButton('b').disabled);
    update(runtime,{liveSessions:[{session_id:'a',status:'alien'}]});await flush();check('unknown_thread_status_keeps_settle_available',!settleButton('a').disabled&&!settleButton('b').disabled);
    for(const status of ['starting','waiting','working','streaming','running','needs-input','queued']){update(runtime,{liveSessions:[{session_id:'a',status}]});await flush();check('busy_'+status,!settleButton('a').disabled)}
    runtime.activity({type:'message.complete',...scope,session_id:'a',payload:{status:'complete'}});update(runtime,{liveSessions:[{session_id:'a',session_key:'foreign-runtime',profile:'other',status:'working'}],busyBySession:{'foreign-runtime':true}});await flush();check('foreign_alias_cannot_block',!settleButton('a').disabled);
    update(runtime,{loading:true,sessions:[]});await flush();check('quiet_loading_not_false_zero',document.querySelector('[data-codex-inbox-owned="island"]').getAttribute('aria-busy')==='true'&&!document.querySelector('[data-codex-inbox-owned="island"]').textContent.includes('Loading Inbox')&&!document.querySelector('[data-codex-inbox-header]').textContent.includes('(0)'));
    update(runtime,{error:new Error('failed'),sessions:[]});await flush();check('error_not_false_zero',document.querySelector('[data-codex-inbox-owned="island"]').textContent.includes('could not be loaded')&&!document.querySelector('[data-codex-inbox-header]').textContent.includes('(0)'));
    let loads=0;const many=Array.from({length:205},(_,i)=>({id:'page-'+i,title:'Row '+i,started_at:created,message_count:1}));
    update(runtime,{sessions:many,hasMore:true,loadMore:()=>loads++});await flush();check('all_admitted_rows_preserved',document.querySelectorAll('[data-codex-inbox-row]').length===many.length);
    const scroll=document.querySelector('[data-codex-inbox-owned="island"] > [data-slot="sidebar-group-content"]');check('bounded_inbox_scrolls_within_native_pane',scroll.clientHeight>0&&scroll.scrollHeight>scroll.clientHeight&&scroll.clientHeight<root.clientHeight);
    scroll.scrollTop=scroll.scrollHeight;await flush();check('scroll_reaches_last_admitted_row',inboxRow(many.at(-1).id).getBoundingClientRect().bottom<=scroll.getBoundingClientRect().bottom+1&&!!inboxRow('page-0'));
    check('no_manual_pagination_or_parent_callback',![...document.querySelectorAll('[data-codex-inbox-owned="island"] button')].some(el=>['Next threads','Previous threads','Load more threads'].includes(el.textContent))&&loads===0);
    const ordered=[{id:'order-first',started_at:created,message_count:1},{id:'order-middle',started_at:created,message_count:1},{id:'order-last',started_at:created,message_count:1}];update(runtime,{sessions:ordered});host.state.focusedStoredSessionId.set('order-middle');host.state.activeSessionId.set('order-middle');await flush();settleButton('order-middle').click();await flush();check('current_middle_chooses_following_not_first',opens[opens.length-1].id==='order-last');
    update(runtime,{sessions:[{id:'evil',started_at:created,title:'<img src=x onerror=alert(1)>',message_count:1}]});await flush();check('title_safe_text_only',!!inboxRow('evil')&&!inboxRow('evil').querySelector('img')&&inboxRow('evil').textContent.includes('<img'));
    const savedSet=storage.set;storage.set=(key,value)=>{if(key==='inbox-state-v1')throw Error('quota');return savedSet(key,value)};
    settleButton('evil').click();await flush();check('persist_failure_does_not_hide_row',!!inboxRow('evil')&&document.querySelector('[data-codex-inbox-owned="island"]').textContent.includes('could not be saved'));
    storage.set=savedSet;
    update(runtime,{sessions:[rows[1]]});await flush();host.state.focusedStoredSessionId.set('b');host.state.activeSessionId.set('b');await flush();settleButton('b').click();await flush();
    check('last_current_settle_starts_fresh_scoped',drafts.length===1&&drafts[0].connectionId===scope.connectionId&&drafts[0].profile===scope.profile);
    runtime.setMode(false);await flush();check('off_complete_cleanup',!document.querySelector('[data-codex-inbox-owned]')&&!document.querySelector('[data-codex-inbox-collapse]')&&!document.getElementById('session-header').hasAttribute('aria-expanded'));
    document.getElementById('session-header').click();nativeClick.click();nativePin.click();check('off_native_controls_work',native.toggles===3&&native.clicks===2&&native.pins===2);
    runtime.setMode(true);update(runtime);await flush();check('on_remount_once',document.querySelectorAll('[data-codex-inbox-owned="island"]').length===1);
    const framesBefore=totalFrames;for(let i=0;i<20;i++)update(runtime);await flush();check('coalesced_no_observer_loop',totalFrames-framesBefore<=2);
    const old=runtime;runtime=installCodexInboxRuntime({storage,host,window:scheduler});update(runtime);await flush();check('hot_reload_no_duplicates',document.querySelectorAll('[data-codex-inbox-owned="island"]').length===1&&document.querySelectorAll('[data-codex-inbox-owned="style"]').length===1);check('unbound_native_rows_are_not_inferred',!document.querySelector('[data-codex-inbox-owned="badge"]'));
    old.setMode(false);await flush();check('stale_runtime_cannot_remove_current',!!document.querySelector('[data-codex-inbox-owned="island"]'));
    runtime.bindNativeRow(nativeA,rows[0],scope);runtime.model.settle(scope,rows[0]);await flush();check('bind_row_restores_badge_after_hot_reload',!!nativeA.querySelector('[data-codex-inbox-owned="badge"]'));
    // Native remount is observed, but identity is supplied only by the binding seam.
    nativeA.querySelector('[data-codex-inbox-owned="badge"]').remove();nativeA.appendChild(document.createElement('span'));await flush();check('late_badge_remount',nativeA.querySelectorAll('[data-codex-inbox-owned="badge"]').length===1);
    update(runtime,{scope:other});await flush();check('scope_switch_isolated',!!inboxRow('a')&&!nativeA.querySelector('[data-codex-inbox-owned="badge"]'));
    update(runtime);await flush();check('scope_return_preserves_settlement',!inboxRow('a')&&!!nativeA.querySelector('[data-codex-inbox-owned="badge"]'));
    root.remove();await flush();check('native_root_unmount_cleans',!document.querySelector('[data-codex-inbox-owned]'));
    mount();await flush();check('native_root_late_remount',document.querySelectorAll('[data-codex-inbox-owned="island"]').length===1);
    runtime.dispose();await flush();check('dispose_removes_every_owned_node',!document.querySelector('[data-codex-inbox-owned]')&&!document.querySelector('[data-codex-inbox-collapse]')&&frames.size===0);
    data.set('inbox','off');runtime=installCodexInboxRuntime({storage,host,window:scheduler});update(runtime);await flush();check('saved_off_survives_install',!document.querySelector('[data-codex-inbox-owned="island"]'));
    const preferencesBefore=data.get('inbox');runtime.setMode(true);await flush();check('set_mode_is_presentation_only',data.get('inbox')===preferencesBefore&&!!document.querySelector('[data-codex-inbox-owned="island"]'));runtime.dispose();await flush();
    const failingStorage={get:()=>{throw Error('unavailable')},set:()=>{throw Error('unavailable')}};
    runtime=installCodexInboxRuntime({storage:failingStorage,host,window:scheduler});update(runtime);await flush();check('storage_read_failure_fails_mode_off',!document.querySelector('[data-codex-inbox-owned="island"]'));runtime.dispose();await flush();
    document.title=btoa(JSON.stringify({results,failures,totalFrames}));
  })().catch(error=>{document.title=btoa(JSON.stringify({error:String(error),stack:error.stack,results,failures}))});
  </script></body></html>`;
}

function snoozeFixture() {
  return `<!doctype html><html data-codex-chat-look="true"><head><meta charset="utf-8"><title>pending</title><style>
  :root{--ui-text-primary:CanvasText;--ui-text-tertiary:GrayText;--ui-accent:Highlight;--ui-control-hover-background:ButtonFace;--ui-bg-panel:Canvas}
  body{margin:0} [data-sessions-mode]{width:260px;height:420px;display:flex;flex-direction:column;overflow:hidden} button,input,select{font:inherit}
  .flex{display:flex}.flex-col{flex-direction:column}.shrink-0{flex-shrink:0}
  </style></head><body><div data-sessions-mode="sessions"><div data-slot="sidebar-group"><div class="group/section"><button class="group/section-label">Sessions</button></div><div data-slot="sidebar-group-content"><div id="native-a"><button id="native-open">A</button><div data-row-actions></div></div><div id="native-b"><div data-row-actions></div></div></div></div></div><script>
  ${source.replaceAll('</script', '<\\/script')}
  const results={},failures=[];
  function check(name,condition){results[name]=!!condition;if(!condition)failures.push(name)}
  function atom(value){const listeners=new Set();return {get:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:next=>{value=next;for(const fn of listeners)fn()}}}
  const realNow=Date.now;let now=1800000000000;Date.now=()=>now;
  let id=0,frames=new Map(),timers=new Map(),totalFrames=0;
  const scheduler={MutationObserver,requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay,at:now+delay});return id},clearTimeout:id=>timers.delete(id)};
  async function flush(){for(let i=0;i<12;i++){await Promise.resolve();await Promise.resolve();if(!frames.size)return;const todo=[...frames.values()];frames.clear();totalFrames+=todo.length;todo.forEach(fn=>fn())}throw Error('RAF loop')}
  async function advance(ms){now+=ms;const due=[...timers].filter(([id,t])=>t.at<=now);for(const [id,t]of due){if(timers.delete(id))t.fn()}await flush()}
  const scope={connectionId:'source-a',profile:'default'},other={connectionId:'source-b',profile:'default'},third={connectionId:'source-a',profile:'other'};
  const data=new Map(),storage={get:key=>data.get(key),set:(key,value)=>data.set(key,structuredClone(value))};
  const opens=[],drafts=[];let nativeClicks=0;
  const host={state:{activeSessionId:atom('a'),focusedStoredSessionId:atom('a'),focusedSessionOwner:atom(null),profile:atom('default'),connectionId:atom('source-a')},
    openSession:(id,options)=>{opens.push({id,options});host.state.focusedStoredSessionId.set(id);host.state.activeSessionId.set(id)},newChat:route=>drafts.push(route),request:()=>{throw Error('snooze must not stop backend work')}};
  document.getElementById('native-open').onclick=()=>nativeClicks++;
  const created=(now+1000)/1000;
  const rows=[{id:'a',source:'desktop',title:'A',started_at:created,message_count:2,pinned:true},{id:'b',source:'desktop',title:'B',started_at:created,message_count:3},{id:'c',source:'desktop',title:'C',started_at:created,message_count:1}];
  const row=id=>document.querySelector('[data-codex-inbox-row="'+id+'"]'),trigger=id=>row(id)?.querySelector('[data-codex-inbox-snooze]');
  const popup=()=>document.querySelector('[data-codex-inbox-snooze-popup]');
  const update=(runtime,extra={})=>{const next={scope,sessions:rows,liveSessions:[],liveStatusKnown:true,...extra};const first=next.sessions.filter(r=>!runtime.admission.isEligible(next.scope,r));if(first.length)runtime.update({...next,loading:false,error:null,liveStatusKnown:true,liveSessions:first.map(r=>({session_id:r.id,status:'working'}))});runtime.update(next)};
  let runtime=installCodexInboxRuntime({storage,host,window:scheduler});
  (async()=>{
    update(runtime);runtime.bindNativeRow(document.getElementById('native-a'),rows[0],scope);runtime.bindNativeRow(document.getElementById('native-b'),rows[1],scope);await flush();
    check('clock_control_keyboard_label',trigger('a')?.getAttribute('aria-label')==='Snooze A');
    trigger('a').focus();trigger('a').click();await flush();
    check('popup_accessible_and_unclipped',popup()?.getAttribute('role')==='menu'&&popup().parentElement===document.body&&getComputedStyle(popup()).position==='fixed'&&popup().contains(document.activeElement));
    check('exact_five_presets_no_custom_or_footer',JSON.stringify([...popup().children].map(el=>el.textContent))===JSON.stringify(['15 min','30 min','1 hour','3 hours','1 day'])&&popup().querySelectorAll('[role="menuitem"]').length===5&&!popup().querySelector('input,select,form,[role="status"]'));
    const controls=[...popup().querySelectorAll('button')];controls[controls.length-1].focus();controls[controls.length-1].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));check('popup_arrow_wraps',document.activeElement===controls[0]);
    controls[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));check('popup_arrow_navigation',document.activeElement===controls[1]);
    const oldTrigger=trigger('a');
    popup().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await flush();check('escape_returns_focus',!popup()&&document.activeElement===oldTrigger);
    trigger('a').click();document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));await flush();check('outside_dismissal',!popup());
    trigger('a').click();const stalePreset=popup().querySelector('button'),staleRow=row('a');update(runtime,{scope:other});await flush();stalePreset.click();staleRow.querySelector('[data-codex-inbox-open]').click();staleRow.querySelector('[data-codex-inbox-settle]').click();staleRow.querySelector('[data-codex-inbox-snooze]').click();await flush();
    check('scope_switch_fences_detached_popup_and_row_actions',!popup()&&!runtime.model.isSnoozed(scope,'a')&&!runtime.model.isSnoozed(other,'a')&&!runtime.model.isSettled(other,'a')&&opens.length===0);
    update(runtime,{scope:third});await flush();check('profile_switch_unsnoozed',!!row('a'));update(runtime);await flush();
    const stableA=row('a'),stableTrigger=trigger('a');stableTrigger.focus();
    update(runtime,{sessions:[{...rows[0],title:'Renamed'},rows[1],rows[2]],liveSessions:[{session_id:'b',status:'working'}]});await flush();
    check('row_and_keyboard_identity_stable',row('a')===stableA&&trigger('a')===stableTrigger&&document.activeElement===stableTrigger);
    update(runtime);await flush();
    for(const [label,duration]of [['1 hour',3600000],['3 hours',10800000],['1 day',86400000]]){trigger('b').click();[...popup().querySelectorAll('button')].find(el=>el.textContent===label).click();await flush();check('preset_'+label,runtime.model.snoozedUntil(scope,'b')===now+duration&&opens.length===0&&drafts.length===0);runtime.cancelSnooze(rows[1]);await flush()}
    trigger('b').click();const second=popup().querySelectorAll('button')[1];second.focus();second.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await flush();check('30_min_keyboard_commits_immediately',runtime.model.snoozedUntil(scope,'b')===now+1800000&&!popup());runtime.cancelSnooze(rows[1]);await flush();
    update(runtime,{liveSessions:[{session_id:'b',status:'working'}]});await flush();check('snooze_and_settle_enabled_while_busy',!trigger('b').disabled&&!row('b').querySelector('[data-codex-inbox-settle]').disabled);trigger('b').click();popup().querySelector('button').click();await flush();check('busy_thread_can_be_snoozed_without_stopping',runtime.model.isSnoozed(scope,'b')&&!row('b'));runtime.cancelSnooze(rows[1]);update(runtime);await flush();
    for(const owner of [other,third,{connectionId:'',profile:'default'}]){host.state.focusedSessionOwner.set(owner);runtime.snooze(rows[0],now+60000);await flush();check('focused_other_owner_'+owner.connectionId+'_'+owner.profile,opens.length===0&&drafts.length===0&&!row('a'));runtime.cancelSnooze(rows[0]);await flush()}
    host.state.focusedSessionOwner.set(scope);runtime.snooze(rows[0],now+60000);await flush();check('focused_matching_owner_navigates',opens.length===1&&opens[0].id==='b');runtime.cancelSnooze(rows[0]);host.state.focusedSessionOwner.set(null);host.state.focusedStoredSessionId.set('a');host.state.activeSessionId.set('a');opens.length=0;await flush();
    runtime.model.settle(scope,rows[2]);runtime.model.snooze(scope,rows[1],now+3600000);await flush();
    trigger('a').click();[...popup().querySelectorAll('button')].find(el=>el.textContent==='15 min').click();await flush();
    check('preset_saves_absolute_deadline',runtime.model.snoozedUntil(scope,'a')===now+900000&&!row('a'));
    check('current_snooze_skips_settled_and_snoozed_to_new_chat',opens.length===0&&drafts.length===1&&drafts[0].connectionId===scope.connectionId);
    check('nearest_deadline_single_timer',timers.size===1&&[...timers.values()][0].delay===900000);
    const badge=document.getElementById('native-a').querySelector('[data-codex-inbox-owned="badge"]');
    check('native_snoozed_badge_deadline',badge?.textContent.includes('Snoozed')&&badge.title.includes(new Date(now+900000).toLocaleString())&&badge.getAttribute('aria-label')==='Wake now');
    document.getElementById('native-open').click();check('native_read_does_not_cancel',nativeClicks===1&&runtime.model.isSnoozed(scope,'a'));
    const until=runtime.model.snoozedUntil(scope,'a');
    update(runtime,{sessions:[{...rows[0],message_count:9},rows[1],rows[2]],liveSessions:[{session_id:'a',status:'working'}]});runtime.reactivate({scope,type:'input',session_id:'a'});await flush();
    check('busy_and_input_keep_user_deadline',!row('a')&&runtime.model.snoozedUntil(scope,'a')===until);
    let expiryNotices=0;const off=runtime.model.subscribe(()=>expiryNotices++);const nav=opens.length+drafts.length;
    await advance(900000);check('timer_expiry_returns_busy_without_navigation',!!row('a')&&!row('a').querySelector('[data-codex-inbox-settle]').disabled&&opens.length+drafts.length===nav);
    check('expiry_notifies_model_badge_subscribers',expiryNotices===1&&!document.getElementById('native-a').querySelector('[data-codex-inbox-owned="badge"]'));off();
    check('next_deadline_rearmed',timers.size===1&&[...timers.values()][0].delay===2700000);
    runtime.activity({type:'message.complete',...scope,session_id:'a',payload:{status:'complete'}});update(runtime);await flush();runtime.model.cancelSnooze(scope,'b');runtime.model.unsettle(scope,'c');await flush();
    host.state.focusedStoredSessionId.set('a');host.state.activeSessionId.set('a');
    check('runtime_api_rejects_stale_scope',runtime.snooze(rows[0],now+60000,other)===false);check('runtime_snooze_api',runtime.snooze(rows[0],now+60000));await flush();check('runtime_cancel_rejects_stale_scope',runtime.cancelSnooze(rows[0],other)===false&&runtime.model.isSnoozed(scope,'a'));check('current_snooze_opens_next',opens.length===1&&opens[0].id==='b');
    check('runtime_cancel_api',runtime.cancelSnooze(rows[0]));await flush();check('cancel_does_not_navigate',!!row('a')&&opens.length===1);
    trigger('a').click();const tab=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});popup().dispatchEvent(tab);await flush();check('tab_dismisses_without_trapping',!popup()&&!tab.defaultPrevented&&!runtime.model.isSnoozed(scope,'a'));
    trigger('a').click();popup().querySelectorAll('button')[1].click();await flush();check('30_min_click_commits_immediately',runtime.model.snoozedUntil(scope,'a')===now+1800000&&!popup()&&opens.length===1);
    const navBefore=opens.length+drafts.length;document.getElementById('native-a').querySelector('[data-codex-inbox-owned="badge"]').click();await flush();
    check('badge_wake_now_no_navigation',!!row('a')&&opens.length+drafts.length===navBefore&&nativeClicks===1);
    const set=storage.set;storage.set=()=>{throw Error('quota')};trigger('a').click();popup().querySelector('button').click();await flush();
    check('save_failure_keeps_row_and_navigation',!!row('a')&&!!popup()&&!runtime.model.isSnoozed(scope,'a')&&opens.length+drafts.length===navBefore&&document.querySelector('[data-codex-inbox-owned="island"]').textContent.includes('could not be saved'));
    storage.set=()=>{};popup().querySelector('button').click();await flush();check('silent_save_failure_keeps_row_popup_and_navigation',!!row('a')&&!!popup()&&!runtime.model.isSnoozed(scope,'a')&&opens.length+drafts.length===navBefore);
    popup().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));host.state.focusedStoredSessionId.set('a');host.state.activeSessionId.set('a');await flush();row('a').querySelector('[data-codex-inbox-settle]').click();await flush();
    check('silent_settle_failure_keeps_current_row',!!row('a')&&!runtime.model.isSettled(scope,'a')&&opens.length+drafts.length===navBefore);
    storage.set=set;runtime.snooze(rows[0],now+60000);await flush();storage.set=()=>{throw Error('quota')};
    check('cancel_failure_keeps_hidden',runtime.cancelSnooze(rows[0])===false&&!row('a'));storage.set=set;
    trigger('b').click();runtime.setMode(false);await flush();check('disabled_timer_and_dom_removed',timers.size===0&&!document.querySelector('[data-codex-inbox-owned]'));now+=120000;
    check('off_action_guard',runtime.snooze(rows[1],now+60000)===false&&runtime.cancelSnooze(rows[0])===false);runtime.setMode(true);await flush();
    check('reenable_wall_clock_expiry',!!row('a')&&timers.size===0);
    runtime.model.snooze(scope,rows[1],now+60000);host.state.focusedStoredSessionId.set('a');host.state.activeSessionId.set('a');await flush();row('a').querySelector('[data-codex-inbox-settle]').click();await flush();check('settle_navigation_skips_snoozed',opens[opens.length-1].id==='c');runtime.model.unsettle(scope,'a');runtime.model.cancelSnooze(scope,'b');await flush();
    runtime.model.settle(scope,rows[0]);runtime.model.snooze(scope,rows[0],now+1000);await flush();const combinedBadge=document.getElementById('native-a').querySelector('[data-codex-inbox-owned="badge"]');const independentSettle=[...document.getElementById('native-a').querySelectorAll('[data-codex-inbox-owned="badge"]')].find(el=>el.getAttribute('aria-label')==='Un-settle');check('both_native_states_have_independent_controls',!!independentSettle&&combinedBadge.getAttribute('aria-label')==='Wake now');independentSettle.click();await flush();check('unsettle_keeps_chosen_snooze',!runtime.model.isSettled(scope,'a')&&runtime.model.isSnoozed(scope,'a')&&!row('a'));runtime.model.settle(scope,rows[0]);await flush();combinedBadge.click();await flush();check('wake_now_preserves_independent_settlement',runtime.model.isSettled(scope,'a')&&!runtime.model.isSnoozed(scope,'a')&&!row('a')&&combinedBadge.textContent.includes('Settled'));runtime.model.snooze(scope,rows[0],now+1000);await advance(1000);check('expiry_preserves_settled_badge',runtime.model.isSettled(scope,'a')&&!row('a')&&combinedBadge.textContent.includes('Settled'));runtime.model.unsettle(scope,'a');await flush();
    runtime.snooze(rows[0],now+10000);await flush();trigger('b').click();const old=runtime;runtime=installCodexInboxRuntime({storage,host,window:scheduler});update(runtime);await flush();
    check('reload_rearms_existing_deadline_and_closes_popup',!row('a')&&!popup()&&timers.size===1&&[...timers.values()][0].delay===10000);check('stale_runtime_actions_rejected',old.snooze(rows[1],now+60000)===false&&old.cancelSnooze(rows[0])===false);old.dispose();check('old_dispose_cannot_cancel_new_timer',timers.size===1);
    now+=20000;document.dispatchEvent(new Event('visibilitychange'));await flush();check('sleep_visibility_reconciles_expiry',!!row('a')&&timers.size===0);
    runtime.snooze(rows[0],now+2147483647+60000);await flush();check('long_deadline_timer_capped',timers.size===1&&[...timers.values()][0].delay===2147483647);
    await advance(2147483647);check('long_deadline_not_early',!row('a')&&timers.size===1&&[...timers.values()][0].delay===60000);
    trigger('b').click();runtime.dispose();await flush();check('dispose_clears_timer_popup_and_dom',timers.size===0&&frames.size===0&&!document.querySelector('[data-codex-inbox-owned]'));
    // Exercise the native browser timeout path as well as deterministic sleep jumps.
    Date.now=realNow;runtime=installCodexInboxRuntime({storage,host,window:{...scheduler,setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window)}});update(runtime);runtime.model.cancelSnooze(scope,'a');runtime.model.snooze(scope,rows[0],Date.now()+50);
    await new Promise(resolve=>setTimeout(resolve,150));await flush();check('native_browser_timeout_expires',!runtime.model.isSnoozed(scope,'a')&&!!row('a'));runtime.dispose();
    document.title=btoa(JSON.stringify({results,failures,totalFrames}));
  })().catch(error=>{document.title=btoa(JSON.stringify({error:String(error),stack:error.stack,results,failures}))});
  </script></body></html>`;
}

async function runChromeFixture(html, label, minimumChecks) {
  const temp = await mkdtemp(path.join(process.env.TMPDIR || os.tmpdir(), 'codex-inbox-runtime-'));
  try {
    const file = path.join(temp, 'index.html');
    await writeFile(file, html);
    const { stdout } = await execFile(process.env.CHROME_BIN || '/usr/bin/google-chrome-stable', [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--allow-file-access-from-files',
      '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(file).href
    ], { maxBuffer: 4 * 1024 * 1024, timeout: 30000 });
    const match = stdout.match(/<title>([^<]+)<\/title>/);
    assert.ok(match, 'Chrome returned a title snapshot');
    assert.notEqual(match[1], 'pending', 'browser fixture completed');
    const result = JSON.parse(Buffer.from(match[1], 'base64').toString());
    assert.equal(result.error, undefined, result.stack || result.error);
    assert.deepEqual(result.failures, [], JSON.stringify(result.results, null, 2));
    assert.ok(Object.keys(result.results).length >= minimumChecks, 'all lifecycle checks ran');
    console.log(`${label}: ${Object.keys(result.results).length} passed; ${result.totalFrames} coalesced render frames`);
  } finally { await rm(temp, { recursive: true, force: true }); }
}

function correctionsFixture() {
  return `<!doctype html><html data-codex-chat-look="true"><head><meta charset="utf-8"><title>pending</title><style>
  :root{--ui-text-primary:#163043;--ui-text-tertiary:#586e75;--ui-text-quaternary:#586e75;--ui-accent:#268bd2;--theme-primary:#268bd2;--ui-bg-elevated:#eee8d5;--ui-stroke-secondary:#839496;--ui-control-active-background:#d6e7e7;--ui-control-hover-background:#dae9e9;--dt-popover:#ffffff;--codex-color-elevated:#ffffff;--z-modal-popover:140}
  html{font:16px Arial}body{margin:16px;background:#fdf6e3;font-size:14px}button{font:inherit;border:0;background:transparent;padding:0} [data-sessions-mode]{display:flex;flex-direction:column;width:280px;height:440px}
  .flex{display:flex}.flex-col{flex-direction:column}.w-full{width:100%}.shrink-0{flex-shrink:0}.items-center{align-items:center}.min-w-0{min-width:0}.gap-1{gap:4px}.gap-2{gap:8px}.w-fit{width:fit-content}.justify-between{justify-content:space-between}.pb-1{padding-bottom:4px}.pt-1\\.5{padding-top:6px}.pl-2{padding-left:8px}.bg-transparent{background:transparent}.text-left{text-align:left}.leading-none{line-height:1}.font-semibold{font-weight:600}.uppercase{text-transform:uppercase}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dither{background:currentColor;width:8px;height:8px}.codicon{display:inline-block;font:normal normal normal 12px Arial}.codicon-chevron-right:before{content:'›'}.rotate-90{transform:rotate(90deg)}
  [class~='text-[0.64rem]']{font-size:.64rem}[class~='tracking-[0.16em]']{letter-spacing:.16em}[class~='text-(--theme-primary)']{color:var(--theme-primary)}[class~='text-(--ui-text-tertiary)']{color:var(--ui-text-tertiary)}.opacity-0{opacity:0}button:hover [class~='group-hover/section-label:opacity-100']{opacity:1}
  #reference{position:absolute;left:320px;top:24px;width:180px;background:color-mix(in srgb,var(--ui-bg-elevated) 96%,transparent);color:var(--ui-text-primary);border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:4px;font-size:12px}#reference-row{padding:4px 8px;background:var(--ui-control-active-background)}
  </style></head><body><div data-sessions-mode="sessions"></div><div id="reference"><div id="reference-row">Native menu paint</div></div><button id="outside">Native outside</button><script>
  ${source.replaceAll('</script', '<\\/script')}
  const results={},failures=[];function check(name,condition){results[name]=!!condition;if(!condition)failures.push(name)}
  let now=1800000000000;Date.now=()=>now;const scope={connectionId:'source-a',profile:'default'},other={connectionId:'source-b',profile:'default'};
  const data=new Map(),storage={get:key=>data.get(key),set:(key,value)=>data.set(key,structuredClone(value))};
  const host={state:{},openSession:()=>{},newChat:()=>{}};let frameId=0,frames=new Map(),totalFrames=0;
  const scheduler={MutationObserver,requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id)};
  async function flush(){for(let i=0;i<12;i++){await Promise.resolve();await Promise.resolve();if(!frames.size)return;const todo=[...frames.values()];frames.clear();totalFrames+=todo.length;todo.forEach(fn=>fn())}throw Error('RAF loop')}
  const root=document.querySelector('[data-sessions-mode]'),old={id:'old',source:'desktop',title:'Historical chat',started_at:(now-60000)/1000,message_count:50,is_active:true},fresh={id:'new',source:'desktop',title:'Current work',started_at:(now+1000)/1000,message_count:2};
  let runtime=installCodexInboxRuntime({storage,host,window:scheduler});let rows=[old];const update=(extra={})=>runtime.update({scope,sessions:rows.map(r=>({source:'desktop',...r})),liveSessions:[],liveStatusKnown:true,...extra});
  const row=id=>document.querySelector('[data-codex-inbox-row="'+id+'"]'),header=()=>document.querySelector('[data-codex-inbox-header]'),popup=()=>document.querySelector('[data-codex-inbox-snooze-popup]');
  const nativeMarkup='<div data-slot="sidebar-group"><div class="group/section flex shrink-0 items-center justify-between gap-1 pb-1 pt-1.5"><button id="native-header" type="button" class="group/section-label flex w-fit min-w-0 items-center gap-1 bg-transparent text-left leading-none"><span class="flex min-w-0 items-center gap-2 pl-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-(--theme-primary)"><span aria-hidden="true" class="dither inline-block size-2 shrink-0 rounded-[1px]"></span><span class="min-w-0 truncate leading-none">Pinned</span></span><i aria-hidden="true" style="font-size:.75rem" class="codicon codicon-chevron-right shrink-0 duration-150 rotate-90 text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100"></i></button><button id="native-add">+</button></div><div data-slot="sidebar-group-content" id="native-content">Pinned rows</div></div>';
  window.correctionsDone=(async()=>{
    update();await flush();check('initial_history_empty',!row('old'));check('header_label_no_count',header().textContent==='Inbox');
    check('fallback_canonical_header',!!header().querySelector('.dither')&&!!header().querySelector('.codicon-chevron-right')&&header().parentElement.classList.contains('group/section'));
    root.insertAdjacentHTML('beforeend',nativeMarkup);const original=document.getElementById('native-header');let nativeClicks=0;original.onclick=()=>{nativeClicks++;const content=document.getElementById('native-content');content.hidden=!content.hidden};await flush();
    const label=el=>el.querySelector('.dither').parentElement,caret=el=>el.querySelector('.codicon-chevron-right');
    if(header().querySelector('.dither')){
      const properties=['fontSize','fontFamily','fontWeight','letterSpacing','textTransform','lineHeight','color','paddingLeft','gap'];
      check('header_computed_typography_equals_native',properties.every(key=>getComputedStyle(label(header()))[key]===getComputedStyle(label(original))[key]));
      check('header_native_dom_shape',header().className===original.className&&header().parentElement.className===original.parentElement.className&&label(header()).className===label(original).className&&header().querySelector('.truncate').textContent==='Inbox'&&header().parentElement.children.length===1);
      check('header_caret_open',caret(header()).classList.contains('rotate-90')&&caret(header()).classList.contains('group-hover/section-label:opacity-100'));
    }else{check('header_computed_typography_equals_native',false);check('header_native_dom_shape',false);check('header_caret_open',false)}
    header().focus();header().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await flush();check('header_keyboard_collapses',header().getAttribute('aria-expanded')==='false'&&!!header().querySelector('.codicon-chevron-right')&&!caret(header()).classList.contains('rotate-90'));header().click();await flush();check('header_click_expands',header().getAttribute('aria-expanded')==='true');
    original.click();await flush();check('native_header_handler_and_content_untouched',nativeClicks===1&&document.getElementById('native-content').hidden&&!original.hasAttribute('data-codex-inbox-disclosure')&&!original.parentElement.parentElement.hasAttribute('data-codex-inbox-collapse'));
    rows=[old,fresh];update();await flush();check('new_nonworking_excluded',!row('new')&&!row('old'));update({liveSessions:[{session_id:'new',status:'working'}]});update({liveSessions:[{session_id:'old',status:'resuming'}]});await flush();check('old_resuming_ignored',!row('old'));update({liveSessions:[{session_id:'old',status:'working'}]});await flush();check('old_work_admitted',!!row('old'));update();await flush();check('completed_old_work_stays',!!row('old'));
    rows.push({id:'page-old',title:'Loaded history',started_at:(now-120000)/1000,message_count:30});update({hasMore:true});await flush();check('load_more_history_not_admitted',!row('page-old'));
    runtime.setMode(false);runtime.setMode(true);await flush();check('toggle_admission_persists',!!row('old')&&!row('page-old'));runtime.dispose();runtime=installCodexInboxRuntime({storage,host,window:scheduler});update();await flush();check('reload_admission_persists',!!row('old')&&!row('page-old'));update({scope:other});await flush();check('scope_no_old_backfill',!row('old'));update();await flush();check('scope_return_admission',!!row('old'));
    const compressed={...old,id:'old-tip',_lineage_root_id:'old',_lineage_ids:['old','middle','old-tip'],started_at:(now+5000)/1000};rows=[compressed,fresh,rows[2]];update();await flush();check('lineage_attention_persists',!!row('old-tip')&&!row('old'));runtime.dispose();runtime=installCodexInboxRuntime({storage,host,window:scheduler});update();await flush();check('lineage_reload_attention_persists',!!row('old-tip'));rows=[old,fresh,rows[2]];
    const legacySettle={id:'legacy-settled',source:'desktop',title:'Legacy settled',started_at:(now-60000)/1000,message_count:4},legacySnooze={id:'legacy-snoozed',source:'desktop',title:'Legacy snoozed',started_at:(now-60000)/1000,message_count:4},legacyExpiry={id:'legacy-expiry',source:'desktop',title:'Legacy expiry',started_at:(now-60000)/1000,message_count:4};rows.push(legacySettle,legacySnooze,legacyExpiry);runtime.model.settle(scope,legacySettle);runtime.model.snooze(scope,legacySnooze,now+60000);runtime.model.snooze(scope,legacyExpiry,now+1000);update();await flush();now+=2000;runtime.model.expireSnoozes();await flush();check('legacy_expiry_never_admits_history',!row('legacy-expiry')&&!runtime.admission.isEligible(scope,legacyExpiry));check('ambiguous_legacy_unsettle_does_not_admit',runtime.model.unsettle(scope,legacySettle)===false);check('ambiguous_legacy_wake_does_not_admit',runtime.model.cancelSnooze(scope,legacySnooze)===false);await flush();check('ambiguous_legacy_attention_preserved',!row('legacy-settled')&&!row('legacy-snoozed')&&!row('legacy-expiry')&&runtime.model.isSettled(scope,legacySettle)&&runtime.model.isSnoozed(scope,legacySnooze));
    const failed={id:'failed-work',source:'desktop',title:'Working during storage failure',started_at:(now-60000)/1000,message_count:2};rows.push(failed);const savedSet=storage.set;storage.set=(key,value)=>{if(key!=='inbox-admission-v2')savedSet(key,value)};update({liveSessions:[{session_id:'failed-work',status:'working'}]});await flush();check('silent_admission_failure_excludes_and_reports',!row('failed-work')&&document.querySelector('[data-codex-inbox-owned="island"]').textContent.includes('admission could not be saved'));storage.set=savedSet;update();await flush();check('failed_work_recovers_after_completion',!!row('failed-work')&&runtime.admission.error===null);
    const never={connectionId:'never-on',profile:'default'};runtime.setMode(false);update({scope:never});await flush();check('off_scope_has_no_activation_cutoff',runtime.admission.cutoff(never)===null);update();runtime.setMode(true);await flush();
    // The row helper fades controls over 100ms; inspect settled browser paint.
    document.getElementById('outside').focus();await new Promise(resolve=>setTimeout(resolve,140));check('clock_hidden_without_row_hover_or_focus',getComputedStyle(row('new').querySelector('[data-codex-inbox-snooze]')).opacity==='0');row('new').querySelector('[data-codex-inbox-open]').focus();await new Promise(resolve=>setTimeout(resolve,140));check('clock_exposed_by_keyboard_row_focus',getComputedStyle(row('new').querySelector('[data-codex-inbox-snooze]')).opacity==='1');
    row('new').querySelector('[data-codex-inbox-snooze]').click();await flush();check('menu_exact_five_no_custom',popup().getAttribute('role')==='menu'&&JSON.stringify([...popup().children].map(el=>[el.getAttribute('role'),el.textContent]))===JSON.stringify(['15 min','30 min','1 hour','3 hours','1 day'].map(text=>['menuitem',text]))&&!popup().querySelector('input,select,form,[role="status"]'));
    const items=[...popup().querySelectorAll('button')];items[0].dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));check('menu_end_last',document.activeElement===items[4]);items[4].dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));check('menu_home_first',document.activeElement===items[0]);items[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));check('menu_arrow_second',document.activeElement===items[1]);
    let escapes=0;const observeEscape=event=>{if(event.key==='Escape'&&!event.defaultPrevented)escapes++};document.addEventListener('keydown',observeEscape);popup().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));check('escape_preserves_native_event',!popup()&&escapes===1);document.removeEventListener('keydown',observeEscape);
    row('new').querySelector('[data-codex-inbox-snooze]').click();let outsideClicks=0;document.getElementById('outside').onpointerdown=event=>{if(!event.defaultPrevented)outsideClicks++};document.getElementById('outside').dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,cancelable:true}));check('outside_preserves_native_event',!popup()&&outsideClicks===1);
    row('new').querySelector('[data-codex-inbox-snooze]').click();[...popup().children].find(el=>el.textContent==='30 min')?.click();await flush();check('30_min_immediate_commit_close',runtime.model.snoozedUntil(scope,'new')===now+1800000&&!popup());runtime.cancelSnooze(fresh);await flush();if(popup())popup().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    const themes=[['light','#fcfcfc','#141414','#d8d8d8','#e1e9f0'],['dark','#242a30','#e5e5e5','#53616a','#43545e'],['Solarized','#002b36','#93a1a1','#586e75','#073642'],['Glass','rgba(244,247,250,.78)','#182334','rgba(74,89,101,.4)','rgba(160,185,202,.45)']];
    for(const [name,bg,fg,border,active]of themes){for(const [key,value]of Object.entries({'--ui-bg-elevated':bg,'--ui-text-primary':fg,'--ui-stroke-secondary':border,'--ui-control-active-background':active}))document.documentElement.style.setProperty(key,value);row('new').querySelector('[data-codex-inbox-snooze]').click();const paint=getComputedStyle(popup()),ref=getComputedStyle(document.getElementById('reference')),item=getComputedStyle(document.activeElement),rowRef=getComputedStyle(document.getElementById('reference-row'));check('native_paint_'+name,paint.backgroundColor===ref.backgroundColor&&paint.color===ref.color&&paint.borderTopColor===ref.borderTopColor&&item.backgroundColor===rowRef.backgroundColor&&paint.fontSize==='12px'&&paint.borderRadius==='8px'&&paint.padding==='4px'&&item.padding==='4px 8px');if(failures.includes('native_paint_'+name))throw Error(name+' paint mismatch '+JSON.stringify({paint:[paint.backgroundColor,paint.color,paint.borderTopColor,paint.fontSize,paint.borderRadius,paint.padding],reference:[ref.backgroundColor,ref.color,ref.borderTopColor],item:[item.backgroundColor,item.padding,document.activeElement.outerHTML],rowRef:rowRef.backgroundColor,focus:document.hasFocus()}));popup().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
    row('new').querySelector('[data-codex-inbox-snooze]').click();document.title=btoa(JSON.stringify({results,failures,totalFrames}));
  })().catch(error=>{document.title=btoa(JSON.stringify({error:String(error),stack:error.stack,results,failures}))});</script></body></html>`;
}

test('real Chrome input: heading/menu keyboard ownership, hover-only clock and native reference screenshot', async () => {
  const browser = await chromium();
  try {
    // --dump-dom can have activeElement without an active browsing context;
    // real :focus paint must be tested with the foreground context explicitly set.
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await browser.call('Emulation.setDeviceMetricsOverride', { width: 800, height: 560, deviceScaleFactor: 1, mobile: false });
    const { frameTree } = await browser.call('Page.getFrameTree');
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: correctionsFixture() });
    const result = await browser.evaluate('correctionsDone.then(()=>flush()).then(()=>JSON.parse(atob(document.title)))');
    assert.equal(result.error, undefined, result.stack || result.error);
    assert.deepEqual(result.failures, []);
    const key = async (value, code, number) => {
      await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, windowsVirtualKeyCode: number, ...(value === 'Enter' ? { text: '\r' } : value === ' ' ? { text: ' ' } : {}) });
      await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode: number });
      await browser.evaluate('flush()');
    };
    await key('Escape', 'Escape', 27);
    await browser.evaluate('header().focus()');
    await key('Enter', 'Enter', 13);
    assert.equal(await browser.evaluate("header().getAttribute('aria-expanded')"), 'false', 'trusted Enter collapses once');
    assert.equal(await browser.evaluate("header().querySelector('.codicon-chevron-right').classList.contains('rotate-90')"), false);
    await key(' ', 'Space', 32);
    assert.equal(await browser.evaluate("header().getAttribute('aria-expanded')"), 'true', 'trusted Space expands once');
    const nativeBefore = await browser.evaluate("document.getElementById('native-content').hidden");
    await browser.evaluate("document.getElementById('native-header').focus()");
    await key('Enter', 'Enter', 13);
    assert.equal(await browser.evaluate("document.getElementById('native-content').hidden"), !nativeBefore, 'native keyboard action remains native');
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 780, y: 540 });
    await browser.evaluate("document.getElementById('outside').focus();new Promise(resolve=>setTimeout(resolve,140))");
    assert.equal(await browser.evaluate("getComputedStyle(row('new').querySelector('[data-codex-inbox-snooze]')).opacity"), '0');
    const box = await browser.evaluate("(()=>{const r=row('new').getBoundingClientRect();return {x:r.left+20,y:r.top+r.height/2}})()");
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...box });
    await browser.evaluate('new Promise(resolve=>setTimeout(resolve,140))');
    assert.equal(await browser.evaluate("getComputedStyle(row('new').querySelector('[data-codex-inbox-snooze]')).opacity"), '1', 'real pointer hover exposes the clock');
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 780, y: 540 });
    await browser.evaluate("row('new').querySelector('[data-codex-inbox-snooze]').focus();new Promise(resolve=>setTimeout(resolve,140))");
    assert.equal(await browser.evaluate("getComputedStyle(row('new').querySelector('[data-codex-inbox-snooze]')).opacity"), '1', 'keyboard focus exposes the clock');
    await key('Enter', 'Enter', 13);
    assert.equal(await browser.evaluate("document.activeElement.textContent"), '15 min');
    await key('End', 'End', 35); assert.equal(await browser.evaluate('document.activeElement.textContent'), '1 day');
    await key('Home', 'Home', 36); assert.equal(await browser.evaluate('document.activeElement.textContent'), '15 min');
    await key('ArrowDown', 'ArrowDown', 40); assert.equal(await browser.evaluate('document.activeElement.textContent'), '30 min');
    const before = await browser.evaluate('Date.now()');
    await key('Enter', 'Enter', 13);
    assert.equal(await browser.evaluate("runtime.model.snoozedUntil(scope,'new')"), before + 1800000);
    assert.equal(await browser.evaluate('!!popup()'), false);
    await browser.evaluate("runtime.cancelSnooze(fresh);flush()");
    await browser.evaluate("row('new').querySelector('[data-codex-inbox-snooze]').focus()");
    await key('Enter', 'Enter', 13);
    await browser.evaluate("window.trustedEscapes=0;document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&event.isTrusted)trustedEscapes++})");
    await key('Escape', 'Escape', 27);
    assert.equal(await browser.evaluate('trustedEscapes'), 1);
    assert.equal(await browser.evaluate('!!popup()'), false);
    if (process.env.CODEX_INBOX_PREVIEW) {
      await browser.evaluate("for(const [key,value]of Object.entries({'--ui-bg-elevated':'#eee8d5','--ui-text-primary':'#586e75','--ui-text-secondary':'#657b83','--ui-stroke-secondary':'#839496','--ui-control-active-background':'#dcd6c7'}))document.documentElement.style.setProperty(key,value);document.body.style.background='#fdf6e3';row('new').querySelector('[data-codex-inbox-snooze]').focus()");
      await key('Enter', 'Enter', 13);
      const { data } = await browser.call('Page.captureScreenshot', { format: 'png' });
      await writeFile(process.env.CODEX_INBOX_PREVIEW, Buffer.from(data, 'base64'));
      console.log('Inbox headless screenshot: ' + process.env.CODEX_INBOX_PREVIEW);
    }
  } finally { browser.close(); }
});

test('real Chrome DOM: corrections exclude history, clone native heading and paint a five-item native menu', async () => {
  const browser = await chromium();
  try {
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    const { frameTree } = await browser.call('Page.getFrameTree');
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: correctionsFixture() });
    const result = await browser.evaluate('correctionsDone.then(()=>flush()).then(()=>JSON.parse(atob(document.title)))');
    assert.equal(result.error, undefined, result.stack || result.error);
    assert.deepEqual(result.failures, [], JSON.stringify(result.results, null, 2));
    assert.ok(Object.keys(result.results).length >= 40, 'all correction lifecycle checks ran');
    console.log(`Chrome corrections assertions: ${Object.keys(result.results).length} passed; ${result.totalFrames} coalesced render frames`);
  } finally { browser.close(); }
});
test('real Chrome DOM: scrolling Inbox, stable native rows, activity, reversible cleanup and hot reload', async () => runChromeFixture(fixture(), 'Chrome Inbox assertions', 50));
test('real Chrome DOM: snooze duration picker, scoped actions, deadlines, notifications and lifecycle', () => runChromeFixture(snoozeFixture(), 'Chrome Snooze assertions', 35));
