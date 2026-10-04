import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from './helpers/chromium.mjs';

const source = (await Promise.all(['inbox-row-ui.js', 'inbox-runtime.js'].map(file =>
  readFile(new URL('../src/' + file, import.meta.url), 'utf8')))).join('\n');

async function fixture(run, theme = 'light') {
  const palettes = {
    light: { text: '#222', surface: '#f3f3f3', accent: '#526579' },
    dark: { text: '#eee', surface: '#202020', accent: '#a6b8c8' },
    solarized: { text: '#657b83', surface: '#fdf6e3', accent: '#839496' },
    'solarized-dark': { text: '#93a1a1', surface: '#002b36', accent: '#586e75' }
  };
  const palette = palettes[theme];
  const browser = await chromium();
  try {
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><html data-codex-chat-look="true"><style>
      :root{--ui-text-primary:${palette.text};--ui-sidebar-surface-background:${palette.surface};--ui-text-tertiary:#777;--ui-bg-elevated:#ffffff;--ui-stroke-secondary:${palette.text};--ui-control-hover-background:#888;--ui-accent:${palette.accent}}
      body{font:14px Arial;margin:0;background:${theme === 'light' ? '#fff' : '#171717'}}[data-sessions-mode]{width:280px;height:420px;display:flex;flex-direction:column}.flex{display:flex}.flex-col{flex-direction:column}.shrink-0{flex-shrink:0}
      </style><div id="theme-reference" style="color:var(--ui-text-primary);background:var(--ui-sidebar-surface-background);border:1px solid var(--ui-stroke-secondary)"></div><div id="accent-reference" style="color:var(--ui-accent)"></div><aside data-sessions-mode="sessions"><div id="native" data-slot="sidebar-group"><button id="native-button">Native Sessions</button><div data-slot="sidebar-group-content">History</div></div></aside></html>` });
    await browser.evaluate(source);
    await browser.evaluate(`(() => {
      window.now = 1800000000000; Date.now = () => now;
      window.scope = {connectionId:'a',profile:'default'}; window.other = {connectionId:'b',profile:'default'};
      const atom = value => ({get:()=>value,subscribe:()=>()=>{},set:next=>value=next});
      window.store = new Map(); window.storage = {get:key=>structuredClone(store.get(key)),set:(key,value)=>store.set(key,structuredClone(value))};
      window.savedSet = storage.set; window.nav=[];
      window.host = {state:{focusedStoredSessionId:atom(null),focusedSessionOwner:atom(scope)},openSession:(id,options)=>nav.push({id,options}),newChat:options=>nav.push({newChat:options}),request:()=>{throw Error('No runtime network allowed')}};
      window.frames = new Map(); window.timers = new Map(); let serial=0;
      window.scheduler = {MutationObserver,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id),setTimeout:(fn,delay)=>{timers.set(++serial,{fn,at:now+delay,delay});return serial},clearTimeout:id=>timers.delete(id)};
      window.flush = async()=>{for(let i=0;i<15;i++){await Promise.resolve();await Promise.resolve();if(!frames.size)return;const todo=[...frames.values()];frames.clear();todo.forEach(fn=>fn())}throw Error('Render loop')};
      window.advance = async ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now&&timers.delete(id))t.fn();await flush()};
      window.rows = ['one','two','three'].map(id=>({id,source:'desktop',title:'Thread '+id,profile:'default',connectionId:'a',started_at:(now+1000)/1000,message_count:1}));
      window.runtime = installCodexInboxRuntime({storage,host,window:scheduler});
      window.input = {scope,sessions:rows,liveSessions:rows.map(r=>({session_id:r.id,status:'working'})),liveStatusKnown:true};
      window.update = (extra={})=>runtime.update(input={...input,...extra});
      window.row = id=>document.querySelector('[data-codex-inbox-row="'+id+'"]');
      window.check = id=>row(id)?.querySelector('[data-codex-inbox-settle]');
      window.notices = ()=>[...document.querySelectorAll('[data-codex-inbox-settle-notice]')];
      window.undo = id=>document.querySelector('[data-codex-inbox-settle-notice="'+id+'"] button');
      window.native = document.getElementById('native'); window.nativeBefore = native.outerHTML; window.nativeButton = document.getElementById('native-button'); window.nativeClicks=0;nativeButton.onclick=()=>nativeClicks++;
      update();
    })()`);
    await browser.evaluate('flush()');
    await run(browser);
    assert.equal(await browser.evaluate('native.outerHTML===nativeBefore&&nativeButton===document.getElementById("native-button")'), true, 'native controls and markup untouched');
    await browser.evaluate('nativeButton.click();runtime.dispose();flush()');
    assert.equal(await browser.evaluate('nativeClicks===1&&timers.size===0&&frames.size===0&&!document.querySelector("[data-codex-inbox-owned]")'), true);
  } finally { browser.close(); }
}

for (const theme of ['light', 'dark', 'solarized', 'solarized-dark']) test(`Settle available for every admitted activity and metadata state (${theme})`, () => fixture(async browser => {
  for (const extra of [
    {liveSessions:[{session_id:'one',status:'working'}]},
    {liveSessions:[],liveStatusKnown:true},
    {liveSessions:[{session_id:'one',status:'resuming'}]},
    {liveSessions:[],liveStatusKnown:false},
    {loading:true},
    {loading:false,error:'metadata failed'}
  ]) {
    await browser.evaluate(`update({loading:false,error:null,liveStatusKnown:true,liveSessions:[],...${JSON.stringify(extra)}});flush()`);
    assert.equal(await browser.evaluate('!check("one").disabled&&getComputedStyle(check("one")).opacity==="1"'), true, JSON.stringify(extra));
    await browser.evaluate('check("one").click();flush()');
    assert.equal(await browser.evaluate('!row("one")&&runtime.model.isManualSettled(scope,rows[0])&&!!undo("one")'), true);
    assert.equal(await browser.evaluate('notices()[0].textContent'), 'SettledUndo');
    assert.equal(await browser.evaluate('notices()[0].closest("[data-codex-inbox-owned=island]")!==null'), true);
    assert.equal(await browser.evaluate('getComputedStyle(notices()[0]).color===getComputedStyle(document.getElementById("theme-reference")).color'), true, 'notice follows active theme foreground');
    assert.equal(await browser.evaluate('getComputedStyle(notices()[0]).backgroundColor===getComputedStyle(document.getElementById("theme-reference")).backgroundColor'), true, 'notice uses sidebar theme surface rather than a contrasting elevated surface');
    assert.equal(await browser.evaluate('getComputedStyle(notices()[0]).borderTopColor===getComputedStyle(document.getElementById("theme-reference")).borderTopColor'), true);
    assert.equal(await browser.evaluate('(() => {const n=notices()[0];const last=[...document.querySelectorAll("[data-codex-inbox-row]")].at(-1);return !!(last.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING)&&n.getBoundingClientRect().top>=last.getBoundingClientRect().bottom})()'), true, 'notice sits below the remaining threads');
    await browser.evaluate('undo("one").click();flush()');
    assert.equal(await browser.evaluate('!!row("one")&&!runtime.model.isSettled(scope,rows[0])&&notices().length===0&&nav.length===0'), true, 'Undo restores attention without navigation');
  }
}, theme));

test('manual Settle survives passive polls, ongoing tool/completion and reload; positive new input wakes', () => fixture(async browser => {
  await browser.evaluate('update({liveSessions:[{session_id:"one",status:"working"}]});flush();check("one").click();flush()');
  assert.equal(await browser.evaluate('!row("one")&&!!undo("one")'), true);
  for (const extra of [{replayed:true}, {connectionId:'b'}, {profile:'other'}, {session_id:'foreign-runtime'}]) {
    await browser.evaluate(`runtime.activity({type:'message.start',...scope,session_id:'one',...${JSON.stringify(extra)}});flush()`);
    assert.equal(await browser.evaluate('!row("one")&&runtime.model.isManualSettled(scope,rows[0])'), true, 'foreign/replayed input cannot wake manual settlement');
  }
  await browser.evaluate(`
    runtime.activity({type:'tool.start',...scope,session_id:'one'});
    runtime.activity({type:'subagent.start',...scope,session_id:'one',payload:{subagent_id:'child'}});
    runtime.activity({type:'subagent.complete',...scope,session_id:'one',payload:{subagent_id:'child'}});
    runtime.activity({type:'message.complete',...scope,session_id:'one',payload:{status:'complete'}});
    rows[0]={...rows[0],message_count:20};update({sessions:rows,liveStatusAt:now+1,liveSessions:[{session_id:'one',status:'working'}]});flush();
  `);
  assert.equal(await browser.evaluate('!row("one")&&runtime.model.isManualSettled(scope,rows[0])'), true);
  await browser.evaluate('runtime.dispose();runtime=installCodexInboxRuntime({storage,host,window:scheduler});update();flush()');
  assert.equal(await browser.evaluate('!row("one")&&runtime.model.isManualSettled(scope,rows[0])&&notices().length===0'), true);
  for (const event of ["runtime.activity({type:'message.start',...scope,session_id:'one'})", "runtime.reactivate({scope,type:'input',session_id:'one'})", "runtime.reactivate({scope,type:'work',session_id:'one'})"]) {
    await browser.evaluate(event + ';flush()');
    assert.equal(await browser.evaluate('!!row("one")&&!runtime.model.isManualSettled(scope,rows[0])'), true, event);
    await browser.evaluate('check("one").click();flush()');
  }
  await browser.evaluate('storage.set=()=>{};runtime.activity({type:"message.start",...scope,session_id:"one"});flush()');
  assert.equal(await browser.evaluate('!row("one")&&runtime.model.isManualSettled(scope,rows[0])&&!!runtime.model.error'), true, 'failed wake cannot claim restoration');
  await browser.evaluate('storage.set=savedSet;runtime.opened({explicit:true,scope,session:rows[0]});flush()');
  assert.equal(await browser.evaluate('!row("one")&&runtime.model.isManualSettled(scope,rows[0])'), true, 'opening alone never clears Settle');
  await browser.evaluate('runtime.reactivate({scope,type:"input",session_id:"one"});flush()');
  assert.equal(await browser.evaluate('!!row("one")&&!runtime.model.isManualSettled(scope,rows[0])'), true);
}));

test('one latest 3000ms Undo, exact expiry before delayed timeout, and current-row navigation', () => fixture(async browser => {
  await browser.evaluate('host.state.focusedStoredSessionId.set("one");check("one").click();flush()');
  assert.equal(await browser.evaluate('nav.length===1&&nav[0].id==="two"'), true);
  assert.equal(await browser.evaluate('[...timers.values()][0].delay'), 3000);
  await browser.evaluate('window.replacedUndo=undo("one");now+=1000;check("two").click();flush();replacedUndo.click();flush()');
  assert.equal(await browser.evaluate('notices().length===1&&timers.size===1&&!undo("one")&&!!undo("two")&&!row("one")&&nav.length===1'), true, 'new Settle replaces the prior notice and fences its old handler');
  await browser.evaluate('now+=2999;undo("two").click();flush()');
  assert.equal(await browser.evaluate('!row("one")&&!!row("two")&&notices().length===0&&nav.length===1'), true);
  await browser.evaluate('check("two").click();flush();window.expiredUndo=undo("two");now+=3000;expiredUndo.click();flush()');
  assert.equal(await browser.evaluate('!row("two")&&runtime.model.isSettled(scope,rows[1])&&!undo("two")&&timers.size===0'), true, 'at exactly 3000ms late click rejected before delayed callback');
  await browser.evaluate('check("three").click();flush();advance(3000)');
  assert.equal(await browser.evaluate('!row("three")&&notices().length===0&&timers.size===0&&runtime.model.isSettled(scope,rows[2])'), true);
}));

test('storage refusals leave row/no notice; failed Undo keeps saved settlement and error', () => fixture(async browser => {
  for (const fail of ['()=>{}', '()=>{throw Error("quota")}']) {
    await browser.evaluate(`storage.set=${fail};check('one').click();flush()`);
    assert.equal(await browser.evaluate('!!row("one")&&notices().length===0&&nav.length===0&&timers.size===0&&!!runtime.model.error'), true);
  }
  await browser.evaluate('storage.set=savedSet;check("one").click();flush();storage.set=()=>{};undo("one").click();flush()');
  assert.equal(await browser.evaluate('!row("one")&&!!undo("one")&&runtime.model.isManualSettled(scope,rows[0])&&!!(runtime.model.error||runtime.admission.error)'), true);
  await browser.evaluate('storage.set=savedSet;undo("one").click();flush()');
  assert.equal(await browser.evaluate('!!row("one")&&!runtime.model.error&&notices().length===0&&timers.size===0'), true);
}));

test('native browser timeout retires Undo without undoing persisted settlement', () => fixture(async browser => {
  await browser.evaluate(`runtime.dispose();scheduler.setTimeout=window.setTimeout.bind(window);scheduler.clearTimeout=window.clearTimeout.bind(window);
    runtime=installCodexInboxRuntime({storage,host,window:scheduler});update();flush()`);
  await browser.evaluate('check("one").click()');
  assert.equal(await browser.evaluate('!row("one")&&!!undo("one")'), true, 'hide and notice are synchronous with the committed click');
  await browser.evaluate('new Promise(resolve=>window.setTimeout(resolve,3150)).then(()=>flush())');
  assert.equal(await browser.evaluate('!row("one")&&!undo("one")&&runtime.model.isManualSettled(scope,rows[0])'), true);
}));

test('left-to-right themed progress tracks the 3000ms deadline across repaint and replacement', () => fixture(async browser => {
  await browser.evaluate('check("one").click();flush()');
  assert.equal(await browser.evaluate('!!notices()[0].querySelector("[data-codex-inbox-undo-progress]")'), true);
  assert.equal(await browser.evaluate('getComputedStyle(notices()[0].querySelector("[data-codex-inbox-undo-progress]")).backgroundColor===getComputedStyle(document.getElementById("accent-reference")).color'), true);
  for (const [time, fraction] of [[0, 0], [1500, .5], [2999, 2999 / 3000]]) {
    const geometry = await browser.evaluate(`(() => {
      const p=notices()[0].querySelector('[data-codex-inbox-undo-progress]');
      const a=p.getAnimations()[0]; a.pause(); a.currentTime=${time};
      const r=p.getBoundingClientRect(),track=p.parentElement.getBoundingClientRect();
      return {fraction:r.width/track.width,left:r.left,trackLeft:track.left,duration:a.effect.getTiming().duration};
    })()`);
    assert.equal(geometry.duration, 3000);
    assert.ok(Math.abs(geometry.fraction - fraction) < .02);
    assert.ok(Math.abs(geometry.left - geometry.trackLeft) < .1, 'fill stays anchored at left');
  }
  await browser.evaluate('now+=1200;update({loading:true});flush()');
  assert.equal(await browser.evaluate(`(() => {const p=notices()[0].querySelector('[data-codex-inbox-undo-progress]');const a=p.getAnimations()[0];a.pause();a.currentTime=0;return Math.abs(p.getBoundingClientRect().width/p.parentElement.getBoundingClientRect().width-.4)<.02})()`), true, 'repaint preserves elapsed deadline rather than restarting the bar');
  await browser.evaluate('update({loading:false});flush();check("two").click();flush()');
  assert.equal(await browser.evaluate('notices().length===1&&timers.size===1'), true);
  assert.equal(await browser.evaluate(`(() => {const p=notices()[0].querySelector('[data-codex-inbox-undo-progress]');const a=p.getAnimations()[0];a.pause();a.currentTime=0;return p.getBoundingClientRect().width<.1})()`), true, 'newest successful Settle starts a fresh bar');
  await browser.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await browser.evaluate('getComputedStyle(notices()[0].querySelector("[data-codex-inbox-undo-progress]")).animationName'), 'none');
  await browser.evaluate('advance(3000)');
  assert.equal(await browser.evaluate('notices().length===0&&timers.size===0'), true);
}, 'solarized'));

test('scope A-B-A, mode, unmount, hot reload and disposal fence old Undo and row handles', () => fixture(async browser => {
  for (const change of ['scope','mode','unmount','reload','dispose']) {
    await browser.evaluate('check("one").click();flush();window.oldUndo=undo("one");window.oldRuntime=runtime');
    if (change === 'scope') {
      await browser.evaluate('update({scope:other,sessions:rows.map(r=>({...r,connectionId:"b"}))});flush()');
      assert.equal(await browser.evaluate('!!check("one")'), true, 'scope B has independently admitted row');
      await browser.evaluate('window.foreignCheck=check("one");update({scope,sessions:rows});flush();foreignCheck.click();oldUndo.click();flush()');
      assert.equal(await browser.evaluate('!runtime.model.isSettled(other,"one")'), true, 'detached foreign row cannot mutate either scope');
    } else if (change === 'mode') await browser.evaluate('runtime.setMode(false);flush();runtime.setMode(true);flush();oldUndo.click();flush()');
    else if (change === 'unmount') {
      await browser.evaluate('window.root=document.querySelector("[data-sessions-mode]");root.remove();oldUndo.click();flush()');
      assert.equal(await browser.evaluate('timers.size'), 0, 'unmount retires transient timers');
      await browser.evaluate('document.body.append(root);flush()');
      await browser.evaluate('oldUndo.click();flush()');
    }
    else await browser.evaluate(`${change === 'dispose' ? 'runtime.dispose();' : ''}runtime=installCodexInboxRuntime({storage,host,window:scheduler});update();flush();oldUndo.click();oldRuntime.setMode(false);flush()`);
    assert.equal(await browser.evaluate('!row("one")&&runtime.model.isSettled(scope,rows[0])&&notices().length===0&&timers.size===0'), true, change);
    await browser.evaluate('runtime.model.unsettle(scope,rows[0]);flush()');
  }
  await browser.evaluate('window.staleCheck=check("one");update({sessions:rows.slice(1)});staleCheck.click();flush()');
  assert.equal(await browser.evaluate('!runtime.model.isSettled(scope,rows[0])&&notices().length===0'), true, 'fresh metadata validation even before scheduled paint');
  await browser.evaluate('update({sessions:[{...rows[0],profile:"other"},...rows.slice(1)]});flush()');
  assert.equal(await browser.evaluate('!row("one")'), true, 'foreign metadata is never admitted');
}));
