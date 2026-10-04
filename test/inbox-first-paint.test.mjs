import assert from 'node:assert/strict'
import test from 'node:test'
import { flush, loadHostQueryCore, observerFixture } from './helpers/inbox-observer.mjs'

const core = await loadHostQueryCore()
assert.ok(core, 'Supply the pinned host QueryClient')

test('metadata paints before the live-status and owner-roster round trips finish', async t => {
  const f = await observerFixture(core)
  await flush()
  f.stop()
  f.queryClient.removeQueries({ queryKey: f.key, exact: true })
  let completeLive
  f.host.request = () => new Promise(resolve => { completeLive = resolve })
  f.snapshots.length = 0
  const stop = f.startCodexInboxObserver({ onDispose() {} }, f.inbox)
  t.after(() => { completeLive?.({ sessions: [] }); stop(); f.cleanup() })
  await flush()
  assert.equal(f.last().sessions[0]?.id, 'one', 'session metadata must not wait for live activity')
  assert.equal(f.last().loading, false, 'rows are present, not replaced with Loading Inbox')
  assert.equal(f.last().liveStatusKnown, false, 'early paint is not activity authority')
  assert.equal(f.last().busyOwnerKnown, false, 'early paint cannot certify the busy map')
  const island = f.addIsland()
  assert.equal(island.dataset.codexInboxQueryReady, 'false')
  completeLive({ sessions: [] })
  await flush()
  assert.equal(f.last().liveStatusKnown, true)
  assert.equal(island.dataset.codexInboxQueryReady, 'true')
})

test('a pending old-owner activity read cannot hide or authorize new-owner metadata', async t => {
  const f = await observerFixture(core)
  await flush()
  f.stop()
  f.queryClient.removeQueries({ queryKey: f.key, exact: true })
  let completeOld
  f.host.request = (_, params) => params.profile === 'default'
    ? new Promise(resolve => { completeOld = resolve }) : Promise.resolve({ sessions: [] })
  const stop = f.startCodexInboxObserver({ onDispose() {} }, f.inbox)
  t.after(() => { completeOld?.({ sessions: [] }); stop(); f.cleanup() })
  await flush()
  assert.equal(f.last().sessions[0]?.profile, 'default')
  f.state.profile.set('other')
  await flush()
  assert.equal(f.last().scope.profile, 'other')
  assert.equal(f.last().sessions[0]?.profile, 'other')
  completeOld({ sessions: [] })
  await flush()
  assert.equal(f.last().scope.profile, 'other')
  assert.equal(f.last().sessions[0]?.profile, 'other')
})
