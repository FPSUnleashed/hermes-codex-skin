import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { chromium } from './helpers/chromium.mjs';

const source = (await Promise.all(['inbox-row-ui.js', 'inbox-runtime.js'].map(name => readFile(new URL('../src/' + name, import.meta.url), 'utf8')))).join('\n');
const context = vm.createContext({ Date, console });
vm.runInContext(source + '\nglobalThis.factories={createCodexInboxModel,createCodexInboxAdmission,codexInboxKey}', context);
const { createCodexInboxModel, createCodexInboxAdmission, codexInboxKey } = context.factories;
const A = { connectionId: 'a', profile: 'default' }, B = { connectionId: 'b', profile: 'default' }, P = { connectionId: 'a', profile: 'other' };
const row = (id = 'old', extra = {}) => ({ id, source: 'desktop', profile: 'default', message_count: 2, started_at: 1, ...extra });
function fixture() {
  const data = new Map(), storage = { get: key => structuredClone(data.get(key)), set: (key, value) => data.set(key, structuredClone(value)) };
  const model = createCodexInboxModel(storage), admission = createCodexInboxAdmission(storage, model);
  return { data, storage, model, admission };
}

test('old verified non-cron work is retained idle and across reload', () => {
  const f = fixture(), s = row();
  f.admission.observe(A, [s], { workingSessions: [s] });
  assert.equal(f.admission.isEligible(A, s), true);
  f.admission.observe(A, [s]);
  assert.equal(createCodexInboxAdmission(f.storage, f.model).isEligible(A, s), true);
});

test('new blank/nonworking and creation timestamps never admit', () => {
  const f = fixture(); f.admission.observe(A, []);
  for (const s of [row('blank', { message_count: 0, started_at: (Date.now() + 60000) / 1000 }), row('new', { created_at: Date.now() + 60000 })]) {
    f.admission.observe(A, [s]); assert.equal(f.admission.isEligible(A, s), false);
  }
});

test('explicit open is not admission and cannot clear Settle or Snooze', () => {
  const f = fixture(), s = row(); f.model.settle(A, s, { manual: true }); f.model.snooze(A, s, Date.now() + 60000);
  f.admission.observe(A, [s], { explicitOpenedSessions: [s] });
  assert.equal(f.admission.isEligible(A, s), false);
  assert.equal(f.model.isManualSettled(A, s), true); assert.equal(f.model.isSnoozed(A, s), true);
});

for (const extra of [{ source: 'cron' }, { source: 'desktop', created_source: 'cron' }, { source: 'cron', created_source: 'desktop' }]) test('cron exclusion wins over work and open ' + JSON.stringify(extra), () => {
  const f = fixture(), s = row('scheduled', extra);
  f.admission.observe(A, [s], { workingSessions: [s], explicitOpenedSessions: [s], liveSessions: [{ ...s, status: 'working' }] });
  assert.equal(f.admission.isEligible(A, s), false);
});

test('retained legacy cron and cron aliases are excluded without erasing attention', () => {
  const f = fixture(), root = row('root', { source: 'cron' }), tip = row('tip', { _lineage_root_id: 'root', _lineage_ids: ['root', 'tip'] });
  const key = codexInboxKey(A, 'root'), legacy = { version: 1, cutoffs: { '["a","default"]': 1 }, admitted: { [key]: true }, opened: { [key]: true } };
  f.storage.set('inbox-admission-v1', legacy); f.model.settle(A, root, { manual: true }); f.model.snooze(A, root, Date.now() + 60000);
  const attention = f.storage.get('inbox-state-v1'), admission = createCodexInboxAdmission(f.storage, f.model);
  admission.observe(A, [root, tip], { workingSessions: [tip] });
  assert.equal(admission.isEligible(A, root), false); assert.equal(admission.isEligible(A, tip), false);
  assert.deepEqual(f.storage.get('inbox-admission-v1'), legacy); assert.deepEqual(f.storage.get('inbox-state-v1'), attention);
});

test('same ID across connections and profiles never borrows admission or cron provenance', () => {
  const f = fixture(), s = row(); f.admission.observe(A, [s], { workingSessions: [s] });
  f.admission.observe(B, [row('old', { source: 'cron' })], { workingSessions: [row('old', { source: 'cron' })] });
  assert.equal(f.admission.isEligible(A, s), true); assert.equal(f.admission.isEligible(B, s), false); assert.equal(f.admission.isEligible(P, row('old', { profile: 'other' })), false);
});

test('missing and unknown provenance fail closed even with work', () => {
  for (const extra of [{ source: undefined }, { source: 'unknown' }, { source: 'unrecognized-source' }, { source: 'desktop', created_source: 'unknown' }, { source: 'desktop', created_source: 'unrecognized-source' }]) {
    const f = fixture(), s = row('unknown', extra); f.admission.observe(A, [s], { workingSessions: [s] });
    assert.equal(f.admission.isEligible(A, s), false, JSON.stringify(extra));
  }
});

test('known current and immutable creation surfaces may differ without admitting history', () => {
  for (const created_source of ['tui', 'cli', 'telegram']) {
    const f = fixture(), s = row('migrated', { pinned: true, created_source });
    f.admission.observe(A, [s]);
    assert.equal(f.admission.isEligible(A, s), false, 'surface migration itself is not work');
    f.admission.observe(A, [s], { workingSessions: [s] });
    assert.equal(f.admission.isEligible(A, s), true, created_source);
    f.admission.observe(A, [s]);
    assert.equal(createCodexInboxAdmission(f.storage, f.model).isEligible(A, s), true, 'verified work survives idle and reload');
  }
});

test('cron word in a legitimate title or ID is not an exclusion', () => {
  const f = fixture(), s = row('cron-discussion', { title: 'Debug cron scheduling' }); f.admission.observe(A, [s], { workingSessions: [s] });
  assert.equal(f.admission.isEligible(A, s), true);
});

test('conflicting supported sources for one snapshot lineage cannot borrow work', () => {
  const f = fixture(), s = row(), conflicting = row('tip', { source: 'telegram', _lineage_root_id: 'old', _lineage_ids: ['old', 'tip'] });
  f.admission.observe(A, [s, conflicting], { workingSessions: [s, conflicting] });
  assert.equal(f.admission.isEligible(A, s), false);
  assert.equal(f.admission.isEligible(A, conflicting), false);
});

test('a missing-source metadata row cannot borrow retained admission; captured Undo identity can', () => {
  const f = fixture(), s = row(); f.admission.observe(A, [s], { workingSessions: [s] });
  const reloaded = createCodexInboxAdmission(f.storage, f.model);
  assert.equal(reloaded.isEligible(A, { id: 'old', title: 'Metadata missing provenance' }), false);
  assert.equal(reloaded.restore(A, { id: 'old', ...A }), true);
});

test('v1 migration quarantines ambiguous creation/open admissions, preserves ALL attention and aliases', () => {
  const f = fixture(), s = row(), key = codexInboxKey(A, s), alias = codexInboxKey(A, 'tip');
  f.model.settle(A, s, { manual: true }); f.model.snooze(A, s, Date.now() + 60000);
  f.model.ingest(A, [row('tip', { _lineage_root_id: 'old', _lineage_ids: ['old', 'tip'] })]);
  const attention = f.storage.get('inbox-state-v1'), legacy = { version: 1, cutoffs: { '["a","default"]': 1 }, admitted: { [key]: true, [alias]: true }, opened: { [key]: true } };
  f.storage.set('inbox-admission-v1', legacy); const admission = createCodexInboxAdmission(f.storage, f.model);
  admission.observe(A, [s]); assert.equal(admission.isEligible(A, s), false);
  assert.deepEqual(f.storage.get('inbox-admission-v1'), legacy); assert.deepEqual(f.storage.get('inbox-state-v1'), attention);
  admission.observe(A, [s], { workingSessions: [s] }); assert.equal(admission.isEligible(A, s), true);
  assert.equal(f.model.isManualSettled(A, s), true); assert.equal(f.model.isSnoozed(A, s), true);
});

test('known cron cannot reenter from prior v2 work or an ID-only restore', () => {
  const f = fixture(), s = row(); f.admission.observe(A, [s], { workingSessions: [s] });
  f.admission.observe(A, [row('old', { source: 'cron' })]);
  assert.equal(f.admission.isEligible(A, s), false); assert.equal(f.admission.isEligible(A, 'old'), false);
});

test('actual browser runtime: work-only, freshness, cron, manual polls, new work and intentional Undo', async () => {
  const browser = await chromium();
  try {
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html: '<html data-codex-chat-look="true"><aside data-sessions-mode="sessions"></aside></html>' });
    await browser.evaluate(source);
    await browser.evaluate(`(() => {
      window.scope={connectionId:'a',profile:'default'};window.data=new Map();window.storage={get:k=>structuredClone(data.get(k)),set:(k,v)=>data.set(k,structuredClone(v))};
      window.runtime=installCodexInboxRuntime({storage,host:{state:{},openSession(){},newChat(){}},window});
      window.rows=[{id:'old',source:'desktop',message_count:2},{id:'cron',source:'cron',message_count:2},{id:'blank',source:'desktop',started_at:(Date.now()+60000)/1000,message_count:0},{id:'unknown',message_count:2}];
      window.update=(extra={})=>runtime.update({scope,sessions:rows,liveSessions:[],liveStatusKnown:true,busyOwnerKnown:false,...extra});
      window.flush=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));window.row=id=>document.querySelector('[data-codex-inbox-row="'+id+'"]');update();
    })()`);
    await browser.evaluate('flush()'); assert.equal(await browser.evaluate('document.querySelectorAll("[data-codex-inbox-row]").length'), 0);
    await browser.evaluate('update({liveSessions:rows.map(s=>({session_id:s.id,status:"working"})),liveStatusKnown:false});flush()');
    assert.equal(await browser.evaluate('!!row("old")'), false, 'untrusted live data cannot admit');
    await browser.evaluate('update({error:"disconnected",liveSessions:rows.map(s=>({session_id:s.id,status:"working"}))});flush()');
    assert.equal(await browser.evaluate('!!row("old")'), false, 'error cannot admit');
    await browser.evaluate('update({liveSessions:rows.map(s=>({session_id:s.id,status:"working"})),liveStatusAt:1});flush()');
    assert.equal(await browser.evaluate('!!row("old")&&!row("cron")&&!row("unknown")'), true);
    await browser.evaluate('row("old").querySelector("[data-codex-inbox-settle]").click();flush()');
    for (const extra of [{ liveSessions: [{ session_id: 'old', status: 'working' }], liveStatusAt: 2 }, {}, { liveSessions: [{ session_id: 'old', status: 'working' }], liveStatusAt: 3 }]) {
      await browser.evaluate(`update(${JSON.stringify(extra)});runtime.opened({explicit:true,scope,session:rows[0]});flush()`);
      assert.equal(await browser.evaluate('!row("old")&&runtime.model.isManualSettled(scope,"old")'), true);
    }
    await browser.evaluate('document.querySelector("[data-codex-inbox-settle-notice=old] button").click();flush()');
    assert.equal(await browser.evaluate('!!row("old")'), true, 'intentional Undo restores a known admission');
    await browser.evaluate('row("old").querySelector("[data-codex-inbox-settle]").click();runtime.activity({type:"message.start",...scope,session_id:"old"});flush()');
    assert.equal(await browser.evaluate('!!row("old")'), true, 'subsequent verified message start restores');
    await browser.evaluate('runtime.snooze(rows[0],Date.now()+60000);runtime.opened({explicit:true,scope,session:rows[0]});update();flush()');
    assert.equal(await browser.evaluate('!row("old")&&runtime.model.isSnoozed(scope,"old")'), true);
    await browser.evaluate('runtime.activity({type:"message.start",...scope,session_id:"cron"});flush()');
    assert.equal(await browser.evaluate('!!row("cron")'), false);
    await browser.evaluate('runtime.cancelSnooze(rows[0]);update();flush()'); assert.equal(await browser.evaluate('!!row("old")'), true);
    // Both rows share a model lineage key; rendering may deduplicate them, but
    // source validation must inspect the complete authoritative snapshot.
    await browser.evaluate('rows.push({id:"cron-tip",source:"cron",_lineage_root_id:"old",_lineage_ids:["old","cron-tip"],message_count:2});update();flush()');
    assert.equal(await browser.evaluate('!row("old")&&!row("cron-tip")&&!runtime.admission.isEligible(scope,"old")'), true, 'late cron alias cannot be hidden by render deduplication');
  } finally { await browser.evaluate('runtime.dispose()').catch(() => {}); browser.close(); }
});