import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from './helpers/chromium.mjs';

const source = (await Promise.all(['inbox-row-ui.js', 'inbox-runtime.js'].map(name =>
  readFile(new URL('../src/' + name, import.meta.url), 'utf8')))).join('\n');

async function fixture(run) {
  const browser = await chromium();
  try {
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await browser.call('Page.setDocumentContent', {
      frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id,
      html: '<!doctype html><html data-codex-chat-look="true"><style>body{margin:0}aside{width:280px;height:420px;display:flex;flex-direction:column}:root{--ui-text-primary:#222;--ui-text-secondary:#555;--ui-text-tertiary:#777;--ui-bg-elevated:#fff;--ui-stroke-secondary:#999}</style><aside data-sessions-mode="sessions"><div data-slot="sidebar-group"><button>Sessions</button><div data-slot="sidebar-group-content">History</div></div></aside></html>'
    });
    await browser.evaluate(source);
    await browser.evaluate(`(() => {
      window.scope={connectionId:'source-a',profile:'default'};
      window.data=new Map(); window.storage={get:k=>data.get(k),set:(k,v)=>data.set(k,structuredClone(v))};
      const atom=v=>({get:()=>v,subscribe:()=>()=>{}});
      window.host={state:{focusedStoredSessionId:atom('a'),activeSessionId:atom('a'),profile:atom('default'),connectionId:atom('source-a')},openSession:()=>{},newChat:()=>{}};
      let serial=0;const frames=new Map();
      const scheduler={MutationObserver,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id)};
      window.flush=async()=>{for(let i=0;i<15;i++){await Promise.resolve();if(!frames.size)return;const todo=[...frames.values()];frames.clear();todo.forEach(fn=>fn())}throw Error('RAF loop')};
      window.rows=['a','b','history'].map(id=>({id,source:'desktop',title:id,started_at:(Date.now()-60000)/1000,message_count:2}));
      window.runtime=installCodexInboxRuntime({storage,host,window:scheduler});
      runtime.update({scope,sessions:rows,liveSessions:[],liveStatusKnown:true});
      for(const row of rows.slice(0,2))runtime.activity({type:'message.start',...scope,session_id:row.id});
      window.row=id=>document.querySelector('[data-codex-inbox-row="'+id+'"]');
      window.clock=id=>row(id)?.querySelector('[data-codex-inbox-snooze]');
      window.popup=()=>document.querySelector('[data-codex-inbox-snooze-popup]');
    })()`);
    await browser.evaluate('flush()');
    const click = async selector => {
      const p = await browser.evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
      await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p });
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p });
      await browser.evaluate('flush()');
    };
    await run(browser, click);
  } finally { browser.close(); }
}

test('same-trigger pointer dismissal hides the clock on exit while Escape restores keyboard focus', () => fixture(async (browser, click) => {
  const selector = '[data-codex-inbox-row="a"] [data-codex-inbox-snooze]';
  await click(selector);
  assert.equal(await browser.evaluate('!!popup()&&popup().contains(document.activeElement)'), true);
  await click(selector);
  await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 500 });
  assert.equal(await browser.evaluate(`(() => {const c=clock('a');getComputedStyle(c).opacity;for(const a of c.getAnimations())a.finish();return !popup()&&c.getAttribute('aria-expanded')==='false'&&document.activeElement!==c&&getComputedStyle(c).opacity==='0'})()`), true, 'pointer dismissal must not leave the hover-only clock focused');
  await browser.evaluate('clock("a").focus();clock("a").click();flush()');
  await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await browser.evaluate('!popup()&&document.activeElement===clock("a")'), true);
}));

test('verified Snooze commit cleans the menu and row even when subsequent navigation throws; failed saves retain both', () => fixture(async (browser, click) => {
  const selector = '[data-codex-inbox-row="a"] [data-codex-inbox-snooze]';
  await browser.evaluate('window.savedSet=storage.set;storage.set=()=>{}');
  await click(selector);
  await click('[data-codex-inbox-snooze-popup] button');
  assert.equal(await browser.evaluate('!!popup()&&!!row("a")&&!runtime.model.isSnoozed(scope,"a")&&!!runtime.model.error'), true);
  await browser.evaluate('storage.set=savedSet;host.openSession=()=>{throw Error("Navigation rejected")};window.navigationErrors=0;window.addEventListener("error",e=>{if(e.message.includes("Navigation rejected")){navigationErrors++;e.preventDefault()}})');
  await click('[data-codex-inbox-snooze-popup] button');
  assert.equal(await browser.evaluate('runtime.model.isSnoozed(scope,"a")&&!popup()&&!row("a")&&navigationErrors===1'), true, 'committed Snooze still cleans the menu and row after a navigation error');
}));

test('explicit opening changes neither historical admission nor existing Settle and Snooze decisions', () => fixture(async browser => {
  await browser.evaluate('runtime.model.settle(scope,rows[0],{manual:true});runtime.model.snooze(scope,rows[1],Date.now()+60000);flush();window.before=JSON.stringify([...data])');
  await browser.evaluate('for(const session of rows)runtime.opened({explicit:true,scope,session});flush()');
  assert.equal(await browser.evaluate('JSON.stringify([...data])===before&&!row("history")&&!runtime.admission.isEligible(scope,rows[2])&&runtime.model.isManualSettled(scope,"a")&&runtime.model.isSnoozed(scope,"b")'), true);
}));
