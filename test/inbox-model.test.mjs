import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

// Execute the standalone module; do not assert source patterns.
const source = await readFile(new URL('../src/inbox-runtime.js', import.meta.url), 'utf8');
const context = vm.createContext({ Date, console });
vm.runInContext(source + '\nglobalThis.inbox = {createCodexInboxModel,createCodexInboxAdmission,codexInboxKey,codexInboxWorkStatus};', context);
const { createCodexInboxModel, codexInboxKey, codexInboxWorkStatus } = context.inbox;
const a = { connectionId: 'local-a', profile: 'default' };
const b = { connectionId: 'local-b', profile: 'default' };
const c = { connectionId: 'local-a', profile: 'other' };
const session = (id = 'thread', count = 4, extra = {}) => ({ id, source: 'desktop', message_count: count, ...extra });
function memory() {
  const data = new Map();
  return { data, get: key => structuredClone(data.get(key)), set: (key, value) => data.set(key, structuredClone(value)) };
}

test('key tuple isolates connection, profile and literal durable IDs', () => {
  assert.equal(codexInboxKey(a, 'x::y'), JSON.stringify(['local-a', 'default', 'x::y']));
  assert.notEqual(codexInboxKey(a, 'thread'), codexInboxKey(b, 'thread'));
  assert.notEqual(codexInboxKey(a, 'thread'), codexInboxKey(c, 'thread'));
  assert.equal(codexInboxKey({ profile: 'default' }, 'thread'), null);
  assert.equal(codexInboxKey(a, ''), null);
});

test('settle and explicit un-settle preserve source/profile islands A to B to A', () => {
  const store = memory(), model = createCodexInboxModel(store);
  const row = session();
  assert.equal(model.settle(a, row), true);
  assert.equal(model.isSettled(a, row), true);
  assert.equal(model.isSettled(b, row), false);
  assert.equal(model.isSettled(c, row), false);
  model.ingest(b, [session('thread', 50)]);
  model.ingest(c, [session('thread', 70)]);
  assert.equal(model.isSettled(a, row), true);
  assert.equal(createCodexInboxModel(store).isSettled(a, row), true);
  assert.equal(model.unsettle(a, row), true);
  assert.equal(model.isSettled(a, row), false);
});

test('manual Settle signals a committed decision, including identical bytes, never a failed save', t => {
  t.mock.method(Date, 'now', () => 1800000000000);
  const store = memory(), model = createCodexInboxModel(store), row = session(), events = [];
  const stop = model.subscribe(event => {
    if (event?.type !== 'manual-settle') return;
    assert.equal(model.isManualSettled(event.scope, event.session), true);
    events.push(event);
  });
  model.ingest(a, [row]);
  model.settle(a, row);
  assert.equal(events.length, 0);
  assert.equal(model.settle(a, row, { manual: true }), true);
  const saved = JSON.stringify(store.get('inbox-state-v1'));
  assert.equal(model.settle(a, row, { manual: true }), true);
  assert.equal(JSON.stringify(store.get('inbox-state-v1')), saved);
  assert.equal(events.length, 2);
  assert.equal(events[0].scope, a);
  assert.equal(events[0].session, row);
  const save = store.set;
  store.set = () => {};
  assert.equal(model.settle(b, row, { manual: true }), false);
  assert.equal(events.length, 2);
  assert.equal(model.isManualSettled(b, row), false);
  store.set = save;
  stop();
  assert.equal(model.settle(c, row, { manual: true }), true);
  assert.equal(events.length, 2);
});

test('reading, title, last_active, unread and mounted is_active never wake a settled thread', () => {
  const model = createCodexInboxModel(memory());
  model.ingest(a, [session()]); model.settle(a, session());
  model.ingest(a, [session('thread', 4, { title: 'changed', last_active: 999999, unread: true, is_active: true })], {
    liveSessions: [{ session_id: 'thread', status: 'resuming' }]
  });
  assert.equal(model.isSettled(a, 'thread'), true);
  model.ingest(a, [session('thread', 4)], { liveSessions: [{ session_id: 'thread', status: 'idle' }] });
  assert.equal(model.isSettled(a, 'thread'), true);
});

test('actual new work or message-count increase wakes, including after offline persistence', () => {
  const store = memory(); let model = createCodexInboxModel(store);
  model.settle(a, session()); model = createCodexInboxModel(store);
  model.ingest(a, [session('thread', 5)]);
  assert.equal(model.isSettled(a, 'thread'), false);
  for (const status of ['waiting', 'working', 'starting', 'streaming', 'running', 'needs-input', 'queued']) {
    model.settle(a, session('thread', 5));
    model.ingest(a, [session('thread', 5)], { liveSessions: [{ session_id: 'thread', status }] });
    assert.equal(model.isSettled(a, 'thread'), false, status);
  }
});

test('stale delayed metadata cannot lower a settled message baseline', () => {
  const model = createCodexInboxModel(memory());
  model.ingest(a, [session('thread', 20)]); model.settle(a, session('thread', 20));
  model.ingest(a, [session('thread', 2)]);
  model.settle(a, session('thread', 2));
  model.ingest(a, [session('thread', 20)]);
  assert.equal(model.isSettled(a, 'thread'), true);
  model.ingest(a, [session('thread', 21)]);
  assert.equal(model.isSettled(a, 'thread'), false);
});

test('compression maps durable lineage without treating reset/new-ID counts as work', () => {
  const store = memory(), model = createCodexInboxModel(store);
  model.settle(a, session('root', 40));
  const compressed = session('compressed', 2, { _lineage_root_id: 'root', _lineage_ids: ['root', 'compressed'] });
  model.ingest(a, [compressed]);
  assert.equal(model.key(a, compressed), codexInboxKey(a, 'root'));
  assert.equal(model.isSettled(a, compressed), true);
  const again = createCodexInboxModel(store);
  assert.equal(again.isSettled(a, 'compressed'), true);
  assert.equal(again.isSettled(c, compressed), false);
  again.ingest(a, [{ ...compressed, message_count: 3 }]);
  assert.equal(again.isSettled(a, 'root'), false);
  assert.equal(again.isSettled(a, compressed), false);
});

test('late lineage discovery retains a previously settled child', () => {
  const model = createCodexInboxModel(memory());
  model.settle(a, session('child', 8));
  model.ingest(a, [session('child', 8, { _lineage_root_id: 'root', _lineage_ids: ['root', 'child'] })]);
  assert.equal(model.isSettled(a, 'root'), true);
  assert.equal(model.isSettled(a, 'child'), true);
  model.unsettle(a, 'child');
  assert.equal(model.isSettled(a, 'root'), false);
});

test('foreign metadata and live work never cross scope', () => {
  const model = createCodexInboxModel(memory()); model.settle(a, session());
  model.ingest(a, [session('thread', 100, { profile: 'other' }), session('thread', 200, { _connection_id: 'local-b' })], {
    liveSessions: [{ session_id: 'thread', status: 'working', profile: 'other' }, { session_id: 'thread', status: 'streaming', _connection_id: 'local-b' }]
  });
  assert.equal(model.isSettled(a, 'thread'), true);
  assert.equal(model.settle(a, session('foreign', 1, { profile: 'other' })), false);
});

test('persisted state contains identifiers, counters, timestamps only', () => {
  const store = memory(), model = createCodexInboxModel(store);
  model.settle(a, session('thread', 4, { title: 'private title', preview: 'private text', messages: ['secret'], prompt: 'secret prompt' }));
  const saved = store.get('inbox-state-v1');
  assert.deepEqual(Object.keys(saved).sort(), ['aliases', 'records', 'version']);
  assert.deepEqual(Object.keys(Object.values(saved.records)[0]).sort(), ['settledAt', 'snoozeUntil', 'snoozedAt', 'watermarks']);
  for (const forbidden of ['private title', 'private text', 'secret', 'prompt', 'preview']) assert.equal(JSON.stringify(saved).includes(forbidden), false);
  assert.equal(typeof Object.values(saved.records)[0].settledAt, 'number');
});

test('storage failures roll back settle and un-settle and notify subscribers', () => {
  const store = memory(), model = createCodexInboxModel(store); let notifications = 0;
  const off = model.subscribe(() => notifications++);
  const save = store.set;
  store.set = () => { throw Error('quota'); };
  assert.equal(model.settle(a, session()), false);
  assert.equal(model.isSettled(a, 'thread'), false);
  assert.ok(model.error); assert.equal(notifications, 1);
  store.set = save; model.settle(a, session()); assert.equal(model.error, null);
  store.set = () => { throw Error('quota'); };
  assert.equal(model.unsettle(a, 'thread'), false);
  assert.equal(model.isSettled(a, 'thread'), true);
  off();
});

test('corrupt or unreadable storage reports an error rather than fabricating settled state', () => {
  for (const get of [() => '{invalid', () => ({ version: 999 }), () => { throw Error('denied'); }]) {
    let recovered = false, saved;
    const model = createCodexInboxModel({ get: key => recovered ? saved : get(key), set: (key, value) => { saved = structuredClone(value); recovered = true; } });
    assert.ok(model.error);
    assert.equal(model.isSettled(a, 'thread'), false);
    assert.equal(model.settle(a, session()), true);
    assert.equal(model.error, null);
  }
});

test('subscriber errors cannot turn a committed save into a failed settle', () => {
  const store = memory(), model = createCodexInboxModel(store);
  model.subscribe(() => { throw Error('view failed'); });
  assert.equal(model.settle(a, session()), true);
  assert.equal(model.isSettled(a, 'thread'), true);
  assert.equal(model.error, null);
  assert.equal(createCodexInboxModel(store).isSettled(a, 'thread'), true);
});

test('implicit local source remains its own literal key and persists through reload', () => {
  const local = { connectionId: '', profile: 'default' }, store = memory(), model = createCodexInboxModel(store);
  assert.equal(codexInboxKey(local, 'thread'), JSON.stringify(['', 'default', 'thread']));
  assert.equal(model.settle(local, session()), true);
  assert.equal(createCodexInboxModel(store).isSettled(local, 'thread'), true);
  assert.equal(model.isSettled(a, 'thread'), false);
});

test('literal special-object-property IDs retain offline count watermarks', () => {
  for (const id of ['__proto__', 'constructor', 'toString']) {
    const store = memory(); let model = createCodexInboxModel(store);
    assert.equal(model.settle(a, session(id, 4)), true);
    model = createCodexInboxModel(store);
    model.ingest(a, [session(id, 4)]);
    assert.equal(model.isSettled(a, id), true);
    model.ingest(a, [session(id, 5)]);
    assert.equal(model.isSettled(a, id), false);
  }
});

test('snooze persists an absolute deadline, isolates scopes and expires by wall clock', () => {
  const store = memory(), model = createCodexInboxModel(store), until = Date.now() + 3600000;
  assert.equal(model.snooze(a, session(), until), true);
  assert.equal(model.snoozedUntil(a, 'thread'), until);
  assert.equal(model.isSnoozed(a, 'thread', until - 1), true);
  assert.equal(model.isSnoozed(a, 'thread', until), false);
  assert.equal(model.isSnoozed(b, 'thread'), false);
  assert.equal(model.isSnoozed(c, 'thread'), false);
  const reloaded = createCodexInboxModel(store);
  assert.equal(reloaded.snoozedUntil(a, 'thread'), until);
  assert.equal(reloaded.cancelSnooze(a, 'thread'), true);
  assert.equal(reloaded.snoozedUntil(a, 'thread'), null);
  assert.equal(reloaded.isSnoozed(a, 'thread'), false);
});

test('snooze and cancellation leave settlement, counters and pinned metadata independent', () => {
  const store = memory(), model = createCodexInboxModel(store), row = session('thread', 4, { pinned: true });
  model.settle(a, row);
  const before = store.get('inbox-state-v1').records[codexInboxKey(a, row)];
  const until = Date.now() + 60000;
  assert.equal(model.snooze(a, row, until), true);
  assert.equal(model.isSettled(a, row), true);
  const after = store.get('inbox-state-v1').records[codexInboxKey(a, row)];
  assert.equal(after.settledAt, before.settledAt);
  assert.deepEqual(after.watermarks, before.watermarks);
  assert.equal(after.snoozeUntil, until);
  assert.ok(after.snoozedAt > 0);
  assert.equal(model.cancelSnooze(a, row), true);
  assert.equal(model.isSettled(a, row), true);
  assert.equal(row.pinned, true);
});

test('chosen snooze duration survives reading, busy activity, message growth and compression', () => {
  const store = memory(), model = createCodexInboxModel(store), until = Date.now() + 10800000;
  model.settle(a, session('child', 4));
  model.snooze(a, session('child', 4), until);
  const compressed = session('child', 5, { _lineage_root_id: 'root', _lineage_ids: ['root', 'child'], title: 'renamed', is_active: true });
  model.ingest(a, [compressed], { liveSessions: [{ session_id: 'child', status: 'working' }] });
  assert.equal(model.isSettled(a, 'root'), false, 'settlement activity wake remains independent');
  assert.equal(model.snoozedUntil(a, 'root'), until);
  assert.equal(model.isSnoozed(a, compressed), true);
  model.unsettle(a, compressed);
  model.ingest(a, [compressed], { liveSessions: [{ session_id: 'child', status: 'resuming' }] });
  assert.equal(model.snoozedUntil(a, compressed), until);
  assert.equal(createCodexInboxModel(store).snoozedUntil(a, 'child'), until);
});

test('legacy v1 settlement loads without snooze and late lineage keeps latest chosen duration', () => {
  const store = memory(), root = codexInboxKey(a, 'root');
  store.set('inbox-state-v1', { version: 1, records: { [root]: { settledAt: 1234, watermarks: { root: 4 } } }, aliases: { [root]: root } });
  const model = createCodexInboxModel(store), until = Date.now() + 60000;
  assert.equal(model.isSettled(a, 'root'), true);
  assert.equal(model.snoozedUntil(a, 'root'), null);
  model.snooze(a, session('child'), until);
  model.ingest(a, [session('child', 4, { _lineage_root_id: 'root', _lineage_ids: ['root', 'child'] })]);
  assert.equal(model.snoozedUntil(a, 'root'), until);
  assert.equal(model.isSettled(a, 'root'), true);
});

test('invalid snooze deadlines and foreign rows cannot mutate persisted state', () => {
  const store = memory(), model = createCodexInboxModel(store);
  for (const until of [null, '123', NaN, Infinity, 0, -1, Date.now() - 1, Date.now() + 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal(model.snooze(a, session(), until), false, String(until));
  }
  assert.equal(model.snooze(a, session('foreign', 1, { profile: 'other' }), Date.now() + 60000), false);
  assert.equal(store.data.size, 0);
});

test('snooze and cancellation storage failures roll back and notify without exposing content', () => {
  const store = memory(), model = createCodexInboxModel(store), save = store.set, until = Date.now() + 60000;
  let notices = 0; model.subscribe(() => notices++);
  store.set = () => { throw Error('quota'); };
  assert.equal(model.snooze(a, session(), until), false);
  assert.equal(model.isSnoozed(a, 'thread'), false);
  assert.ok(model.error); assert.equal(notices, 1);
  store.set = save;
  assert.equal(model.snooze(a, session('thread', 4, { title: 'private title', preview: 'private text' }), until), true);
  store.set = () => { throw Error('quota'); };
  assert.equal(model.cancelSnooze(a, 'thread'), false);
  assert.equal(model.isSnoozed(a, 'thread'), true);
  assert.equal(JSON.stringify(store.get('inbox-state-v1')).includes('private'), false);
});

test('deadline expiry notifies model subscribers once without storage writes or clearing settlement', () => {
  const store = memory(), model = createCodexInboxModel(store), until = Date.now() + 60000;
  model.settle(a, session()); model.snooze(a, session(), until);
  let notices = 0; model.subscribe(() => notices++);
  store.set = () => { throw Error('expiry must not write storage'); };
  assert.equal(model.nextSnoozeDeadline(until - 1), until);
  assert.equal(model.expireSnoozes(until - 1), false);
  assert.equal(model.expireSnoozes(until), true);
  assert.equal(notices, 1);
  assert.equal(model.expireSnoozes(until + 1000), false);
  assert.equal(model.nextSnoozeDeadline(until), null);
  assert.equal(model.isSettled(a, 'thread'), true);
  assert.equal(model.error, null);
});

test('silent SDK writes cannot commit settle, snooze or cancellation without exact readback', () => {
  const store = memory(), model = createCodexInboxModel(store), save = store.set, until = Date.now() + 60000;
  model.ingest(a, [session()]);
  let notices = 0; model.subscribe(() => notices++);
  store.set = () => {};
  assert.equal(model.settle(a, session()), false);
  assert.equal(model.isSettled(a, 'thread'), false);
  assert.equal(model.snooze(a, session(), until), false);
  assert.equal(model.isSnoozed(a, 'thread'), false);
  assert.ok(model.error); assert.equal(notices, 2);
  store.set = save; model.snooze(a, session(), until);
  store.set = () => {};
  assert.equal(model.cancelSnooze(a, 'thread'), false);
  assert.equal(model.isSnoozed(a, 'thread'), true);
});

test('storage readback accepts JSON strings and reordered object keys but rejects partial writes', () => {
  let saved;
  const store = { get: () => saved, set: (key, value) => { saved = JSON.stringify({ aliases: value.aliases, records: value.records, version: value.version }); } };
  const model = createCodexInboxModel(store), until = Date.now() + 60000;
  assert.equal(model.snooze(a, session(), until), true);
  const previous = saved;
  store.set = (key, value) => { saved = JSON.stringify({ ...value, records: {} }); };
  assert.equal(model.cancelSnooze(a, 'thread'), false);
  assert.equal(model.snoozedUntil(a, 'thread'), until);
  assert.ok(model.error);
  saved = previous; assert.equal(createCodexInboxModel(store).isSnoozed(a, 'thread'), true);
});

test('late lineage chooses a newer shorter snooze or cancellation rather than the longest deadline', () => {
  const until = Date.now() + 3600000, root = codexInboxKey(a, 'root'), child = codexInboxKey(a, 'child');
  for (const chosen of [until - 1800000, null]) {
    const store = memory();
    store.set('inbox-state-v1', { version: 1, records: {
      [root]: { settledAt: 1234, watermarks: { root: 4 }, snoozeUntil: until, snoozedAt: 100 },
      [child]: { settledAt: null, watermarks: { child: 4 }, snoozeUntil: chosen, snoozedAt: 200 }
    }, aliases: { [root]: root, [child]: child } });
    const model = createCodexInboxModel(store);
    model.ingest(a, [session('child', 4, { _lineage_root_id: 'root', _lineage_ids: ['root', 'child'] })]);
    assert.equal(model.snoozedUntil(a, 'root'), chosen);
    assert.equal(model.snoozedUntil(a, 'child'), chosen);
    assert.equal(model.isSettled(a, 'root'), true);
    assert.equal(createCodexInboxModel(store).snoozedUntil(a, 'child'), chosen);
  }
});

test('corrupt persisted snooze timestamps are ignored without losing legacy settlement', () => {
  const key = codexInboxKey(a, 'thread');
  for (const value of [-1, '9999999999999', Infinity, Number.MAX_SAFE_INTEGER]) {
    const store = memory(); store.set('inbox-state-v1', { version: 1, records: { [key]: { settledAt: 1234, watermarks: {}, snoozeUntil: value, snoozedAt: value } }, aliases: {} });
    const model = createCodexInboxModel(store);
    assert.equal(model.snoozedUntil(a, 'thread'), null);
    assert.equal(model.isSettled(a, 'thread'), true);
    assert.equal(model.nextSnoozeDeadline(), null);
  }
});

test('same-millisecond explicit decisions retain their order after late lineage and reload', () => {
  const now = Date.now(), store = memory();
  const fixed = vm.createContext({ Date: class extends Date { static now() { return now; } } });
  vm.runInContext(source + '\nglobalThis.createModel = createCodexInboxModel;', fixed);
  let model = fixed.createModel(store);
  model.snooze(a, session('root'), now + 3600000);
  model.snooze(a, session('child'), now + 60000);
  model = fixed.createModel(store);
  model.ingest(a, [session('child', 4, { _lineage_root_id: 'root', _lineage_ids: ['root', 'child'] })]);
  assert.equal(model.snoozedUntil(a, 'root'), now + 60000);
  assert.equal(model.cancelSnooze(a, 'child'), true);
  assert.equal(fixed.createModel(store).snoozedUntil(a, 'root'), null);
});

test('manual settlement suppresses passive count and working wakes across reload while preserving watermarks', () => {
  const store = memory(); let model = createCodexInboxModel(store);
  assert.equal(model.settle(a, session('thread', 4, { title: 'private' }), { manual: true }), true);
  assert.equal(model.isManualSettled(a, 'thread'), true);
  for (const status of ['running', 'working', 'needs-input', 'resuming', 'idle']) {
    model.ingest(a, [session('thread', 20)], { liveSessions: [{ session_id: 'thread', status }] });
    assert.equal(model.isSettled(a, 'thread'), true, status);
  }
  const record = store.get('inbox-state-v1').records[codexInboxKey(a, 'thread')];
  assert.equal(record.manualSettled, true);
  assert.equal(record.watermarks.thread, 20);
  assert.equal(JSON.stringify(store.get('inbox-state-v1')).includes('private'), false);
  model = createCodexInboxModel(store);
  model.ingest(a, [session('thread', 30)], { liveSessions: [{ session_id: 'thread', status: 'working' }] });
  assert.equal(model.isManualSettled(a, 'thread'), true);
  assert.equal(model.isManualSettled(b, 'thread'), false);
  assert.equal(model.isManualSettled(c, 'thread'), false);
  assert.equal(model.unsettle(a, 'thread'), true);
  assert.equal(model.isManualSettled(a, 'thread'), false);
  assert.equal('manualSettled' in store.get('inbox-state-v1').records[codexInboxKey(a, 'thread')], false);
  model.settle(a, session(), { manual: true });
  model.reopen(a, session());
  assert.equal(model.isManualSettled(a, 'thread'), false);
  assert.equal(model.isSettled(a, 'thread'), false);
});

test('manual flag is strict, follows carried late lineage and rejects foreign metadata', () => {
  const store = memory(), model = createCodexInboxModel(store);
  model.settle(a, session('child'), { manual: true });
  model.ingest(a, [session('root')]);
  const child = session('child', 30, { _lineage_root_id: 'root', _lineage_ids: ['root', 'child'] });
  model.ingest(a, [child], { liveSessions: [{ ...child, status: 'running' }] });
  assert.equal(model.isManualSettled(a, 'root'), true);
  assert.equal(createCodexInboxModel(store).isManualSettled(a, 'child'), true);
  model.ingest(a, [session('child', 99, { profile: 'other' })]);
  assert.equal(model.settle(a, session('foreign', 1, { connection_id: b.connectionId }), { manual: true }), false);
  assert.equal(model.isManualSettled(a, 'foreign'), false);
  for (const value of ['true', 1, false, null]) {
    const key = codexInboxKey(a, 'strict'), saved = memory();
    saved.set('inbox-state-v1', { version: 1, aliases: {}, records: { [key]: { settledAt: 1234, watermarks: { strict: 1 }, manualSettled: value } } });
    const loaded = createCodexInboxModel(saved);
    assert.equal(loaded.isManualSettled(a, 'strict'), false);
    loaded.ingest(a, [session('strict', 2)]);
    assert.equal(loaded.isSettled(a, 'strict'), false);
  }
  model.settle(a, session('legacy'), { manual: 'true' });
  assert.equal(model.isManualSettled(a, 'legacy'), false);
  model.ingest(a, [session('legacy', 5)]);
  assert.equal(model.isSettled(a, 'legacy'), false);
});

test('manual settlement and explicit restoration keep verified storage rollback guards', () => {
  const store = memory(), model = createCodexInboxModel(store), save = store.set;
  model.ingest(a, [session()]); store.set = () => {};
  assert.equal(model.settle(a, session(), { manual: true }), false);
  assert.equal(model.isManualSettled(a, 'thread'), false);
  store.set = save; model.settle(a, session(), { manual: true }); store.set = () => {};
  assert.equal(model.unsettle(a, session()), false);
  assert.equal(model.reopen(a, session()), false);
  assert.equal(model.isManualSettled(a, 'thread'), true);
});

test('unknown and history-hydration statuses are distinct from actual work', () => {
  assert.equal(codexInboxWorkStatus('resuming'), 'reading');
  assert.equal(codexInboxWorkStatus('unknown-status'), 'unknown');
  assert.equal(codexInboxWorkStatus(true), 'work');
  assert.equal(codexInboxWorkStatus(false), 'idle');
  assert.equal(codexInboxWorkStatus({ state: 'working' }), 'work');
});

function admissionFixture(store = memory(), now = 1800000000000) {
  const clock = vm.createContext({ Date: class extends Date { static now() { return now; } } });
  vm.runInContext(source + '\nglobalThis.makeAdmission = createCodexInboxAdmission;', clock);
  const model = createCodexInboxModel(store);
  return { store, model, make: () => clock.makeAdmission(store, model) };
}

test('admission starts empty and excludes creation-only chats and loaded history pages', () => {
  const { make } = admissionFixture(), admission = make(), cutoff = 1800000000000;
  const history = session('old', 40, { started_at: (cutoff - 10000) / 1000, last_active: cutoff + 1000, is_active: true });
  assert.equal(admission.observe(a, [history]), true);
  assert.equal(admission.cutoff(a), null);
  assert.equal(admission.isEligible(a, history), false);
  const cases = [
    ['seconds', { started_at: (cutoff + 1000) / 1000 }, false],
    ['millis', { created_at: cutoff + 1 }, false],
    ['created-seconds', { created_at: (cutoff + 1000) / 1000 }, false],
    ['iso', { created_at: new Date(cutoff + 1000).toISOString() }, false],
    ['boundary', { started_at: cutoff / 1000 }, false],
    ['missing', { updated_at: cutoff + 1000, last_active: cutoff + 1000, message_count: 900 }, false],
    ['invalid', { created_at: 'yesterday', started_at: null }, false],
    ['numeric-string', { created_at: String(cutoff + 1000) }, false],
    ['foreign', { started_at: (cutoff + 1000) / 1000, profile: 'other' }, false]
  ];
  for (const [id, extra, eligible] of cases) {
    const row = session(id, 2, extra); admission.observe(a, [row]);
    assert.equal(admission.isEligible(a, row), eligible, id);
  }
  const page = Array.from({ length: 150 }, (_, i) => session('history-' + i, i, { started_at: (cutoff - 1000) / 1000 }));
  admission.observe(a, page);
  assert.equal(page.some(row => admission.isEligible(a, row)), false);
  admission.observe(a, [{ ...history, message_count: 90, updated_at: cutoff + 5000 }]);
  assert.equal(admission.isEligible(a, history), false, 'message growth is not admission');
});

test('old real work is durably admitted; hydration, reading, focus and foreign work are not', () => {
  const { make } = admissionFixture(), admission = make(), old = session('old', 4);
  admission.observe(a, [old]);
  for (const status of ['resuming', 'idle', 'completed', 'alien']) {
    admission.observe(a, [old], { liveSessions: [{ session_id: 'old', status, is_active: true }] });
    assert.equal(admission.isEligible(a, old), false, status);
  }
  admission.observe(a, [old], { liveSessions: [{ session_id: 'old', status: 'resuming', busy: true }] });
  assert.equal(admission.isEligible(a, old), false, 'resuming is not work even with a stale busy flag');
  admission.observe(a, [old], { liveSessions: [{ session_id: 'old', status: 'working', _connection_id: b.connectionId }] });
  assert.equal(admission.isEligible(a, old), false);
  for (const status of ['starting', 'working', 'streaming', 'waiting']) {
    const row = session(status);
    admission.observe(a, [row], { liveSessions: [{ session_id: status, status }] });
    assert.equal(admission.isEligible(a, row), true, status);
    const again = make(); again.observe(a, [row], { liveSessions: [{ session_id: status, status: 'idle' }] });
    assert.equal(again.isEligible(a, row), true, 'reload after completion ' + status);
  }
  admission.observe(a, [old], { workingSessions: [old] });
  assert.equal(make().isEligible(a, old), true);
});

test('admission scope and lineage survive reload without global backfill or user-state mutation', () => {
  const { store, model, make } = admissionFixture(), root = session('root'), child = session('child');
  model.settle(a, root); model.snooze(a, root, Date.now() + 3600000);
  const userState = JSON.stringify(store.get('inbox-state-v1'));
  let admission = make();
  admission.observe(a, [root], { workingSessions: [root] });
  const lineage = session('child', 2, { _lineage_root_id: 'root', _lineage_ids: ['root', 'middle', 'child'] });
  admission.observe(a, [lineage]);
  admission = make();
  assert.equal(admission.cutoff(a), null);
  for (const id of ['root', 'middle', 'child']) assert.equal(admission.isEligible(a, id), true, id);
  admission.observe(b, [lineage]); admission.observe(c, [lineage]);
  assert.equal(admission.isEligible(b, lineage), false);
  assert.equal(admission.isEligible(c, lineage), false);
  assert.equal(admission.isEligible(a, child), true);
  assert.equal(JSON.stringify(store.get('inbox-state-v1')), userState, 'admission does not write Settle/Snooze records');
  assert.equal(JSON.stringify(store.get('inbox-admission-v2')).includes('private'), false);
});

test('late lineage merges earlier admitted child and fences new compression timestamps', () => {
  const { make } = admissionFixture(), admission = make(), cutoff = 1800000000000;
  admission.observe(a, [session('child')], { workingSessions: [session('child')] });
  const row = session('child', 2, { _lineage_root_id: 'root', _lineage_ids: ['root', 'child'] });
  admission.observe(a, [row]);
  assert.equal(make().isEligible(a, 'root'), true);
  const compressedHistory = session('history-tip', 2, { _lineage_root_id: 'old-root', _lineage_ids: ['old-root', 'history-tip'], started_at: (cutoff + 5000) / 1000 });
  admission.observe(a, [compressedHistory]);
  assert.equal(admission.isEligible(a, compressedHistory), false, 'new compression segment is not a new chat');
});

test('admission fails closed on thrown, silent, partial and unreadable storage without losing prior admissions', () => {
  for (const fail of [() => () => { throw Error('quota'); }, () => () => {}, save => (key, value) => { save(key, { ...value, admitted: {} }); }]) {
    const { store, make } = admissionFixture();
    let admission = make(), saved = store.set;
    admission.observe(a, [session('prior')], { workingSessions: [session('prior')] });
    store.set = fail(saved);
    assert.equal(admission.observe(b, [session('new', 4, { started_at: 1800000001 })], { workingSessions: [session('new')] }), false);
    assert.equal(admission.isEligible(b, 'new'), false);
    assert.equal(admission.cutoff(b), null);
    assert.equal(admission.isEligible(a, 'prior'), true);
    assert.ok(admission.error);
    store.set = saved;
  }
  const { store, make } = admissionFixture(); let admission = make();
  admission.observe(a, [session('prior')], { workingSessions: [session('prior')] });
  const read = store.get; store.get = () => { throw Error('denied'); };
  admission = make(); assert.ok(admission.error);
  assert.equal(admission.observe(a, [session('fresh', 1, { started_at: 1800000001 })]), false);
  assert.equal(admission.isEligible(a, 'fresh'), false);
  store.get = read;
  assert.equal(admission.observe(a, []), true);
  assert.equal(admission.isEligible(a, 'prior'), true, 'recovery reloads previous admissions rather than overwriting them');
});

test('native creation timestamps of any precision never backfill without work', () => {
  const cutoff = 1800000000123, { make } = admissionFixture(memory(), cutoff), admission = make();
  for (const [id, started_at, expected] of [
    ['same-second-old', 1800000000, false],
    ['exact-cutoff', cutoff / 1000, false],
    ['millisecond-new', (cutoff + 1) / 1000, false]
  ]) {
    const row = session(id, 1, { started_at }); admission.observe(a, [row]);
    assert.equal(admission.isEligible(a, row), expected, id);
  }
});

test('failed work admission stays pending through completion and is committed on storage recovery', () => {
  const { store, make } = admissionFixture(), admission = make(), save = store.set;
  admission.observe(a, []);
  store.set = () => {};
  assert.equal(admission.observe(a, [session('old-work')], { workingSessions: [session('old-work')] }), false);
  assert.equal(admission.isEligible(a, 'old-work'), false);
  assert.ok(admission.error);
  store.set = save;
  assert.equal(admission.observe(a, [session('old-work')]), true);
  assert.equal(admission.isEligible(a, 'old-work'), true);
  assert.equal(make().isEligible(a, 'old-work'), true);
  assert.equal(admission.error, null);
});

test('invalid v2 admission storage fails closed without overwriting old records', () => {
  const invalidMaps = [true, 1, 'map', []].flatMap(value => [
    { version: 2, blocked: value, admitted: {} },
    { version: 2, blocked: {}, admitted: value }
  ]);
  for (const corrupt of ['{invalid', { version: 3, blocked: {}, admitted: {} }, { version: 2, blocked: { global: true }, admitted: {} }, ...invalidMaps]) {
    const store = memory(); store.set('inbox-admission-v2', corrupt);
    const { model, make } = admissionFixture(store); model.settle(a, session());
    const before = JSON.stringify(store.get('inbox-state-v1')), admission = make();
    assert.ok(admission.error);
    assert.equal(admission.observe(a, [session('new', 1, { started_at: 1800000001 })]), false);
    assert.equal(admission.isEligible(a, 'new'), false);
    assert.equal(admission.cutoff(a), null);
    assert.equal(JSON.stringify(store.get('inbox-state-v1')), before);
    assert.deepEqual(store.get('inbox-admission-v2'), corrupt);
  }
});

test('scope-native connection_id and transient runtime work never create a foreign or fake durable admission', () => {
  const { make } = admissionFixture(), admission = make();
  const foreign = session('foreign', 1, { connection_id: b.connectionId, started_at: 1800000001 });
  admission.observe(a, [foreign], { liveSessions: [{ session_id: 'foreign', status: 'working' }] });
  assert.equal(admission.isEligible(a, foreign), false);
  admission.observe(a, [], { liveSessions: [{ session_id: 'runtime-only', status: 'working' }] });
  assert.equal(admission.isEligible(a, 'runtime-only'), false);
  admission.observe(a, [{ id: '', started_at: 1800000001 }]);
  assert.equal(admission.isEligible(a, ''), false);
});
