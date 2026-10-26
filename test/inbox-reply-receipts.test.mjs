import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const context = vm.createContext({ Date, console })
vm.runInContext((await readFile(new URL('../src/inbox-runtime.js', import.meta.url), 'utf8')) + '\nglobalThis.createModel=createCodexInboxModel', context)
const make = context.createModel
const scope = { connectionId: 'a', profile: 'default' }
const row = { id: 'chat', source: 'desktop', message_count: 4 }
function storage() {
  const saved = new Map()
  return { get: k => structuredClone(saved.get(k)), set: (k, v) => saved.set(k, structuredClone(v)) }
}

test('reply receipts survive refresh/reload while attention and owner islands stay independent', () => {
  const saved = storage(), model = make(saved)
  model.ingest(scope, [row])
  assert.equal(model.recordReply(scope, row, 'completed'), true)
  model.ingest(scope, [{ ...row, unread: false, title: 'renamed', last_active: 999 }])
  assert.equal(make(saved).replyState(scope, row), 'completed')
  assert.equal(model.replyState({ ...scope, connectionId: 'b' }, row), null)
  assert.equal(model.replyState({ ...scope, profile: 'other' }, row), null)
  assert.equal(model.recordReply(scope, { ...row, profile: 'foreign' }, 'read'), false)
  model.snooze(scope, row, Date.now() + 60_000)
  model.settle(scope, row, { manual: true })
  assert.equal(model.recordReply(scope, row, 'read'), true)
  assert.equal(make(saved).replyState(scope, row), 'read')
  assert.equal(model.isManualSettled(scope, row), true)
  assert.equal(model.isSnoozed(scope, row), true)
})

test('new native unread requires increasing same-session count to release read, not negative metadata', () => {
  const model = make(storage())
  model.recordReply(scope, row, 'read')
  assert.equal(model.replyState(scope, { ...row, unread: true }), 'read')
  assert.equal(model.replyState(scope, { ...row, message_count: 3, unread: true }), 'read')
  assert.equal(model.replyState(scope, { ...row, message_count: 8, unread: false }), 'read')
  assert.equal(model.replyState(scope, { ...row, message_count: 8, unread: true }), null)
  model.recordReply(scope, row, 'none')
  assert.equal(model.replyState(scope, row), null)
})

test('late compression lineage retains latest receipt even with a fixed/backwards clock', t => {
  t.mock.method(Date, 'now', () => 10000)
  const saved = storage(), model = make(saved), child = { ...row, id: 'child' }
  model.recordReply(scope, row, 'completed')
  model.recordReply(scope, child, 'read')
  model.ingest(scope, [{ ...child, _lineage_root_id: row.id, _lineage_ids: [row.id, child.id] }])
  assert.equal(model.replyState(scope, row), 'read')
  assert.equal(make(saved).replyState(scope, child), 'read')
})

test('failed read acknowledgement preserves green and never schedules a self-retrying paint', () => {
  for (const failure of ['throw', 'silent']) {
    const saved = storage(), model = make(saved)
    model.recordReply(scope, row, 'completed')
    let notifications = 0
    model.subscribe(() => notifications++)
    saved.set = () => { if (failure === 'throw') throw Error('quota') }
    assert.equal(model.recordReply(scope, row, 'read'), false)
    assert.equal(model.replyState(scope, row), 'completed')
    assert.equal(make(saved).replyState(scope, row), 'completed')
    assert.equal(notifications, 0)
    assert.match(model.error, /could not be saved/)
  }
})
