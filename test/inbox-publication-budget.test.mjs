import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { universalFixture } from './helpers/universal-fixture.mjs'

const source = (await Promise.all(['inbox-runtime.js', 'inbox-open-intent.js', 'inbox-query.js'].map(name => readFile(process.env.INBOX_BUDGET_SOURCE_ROOT ? `${process.env.INBOX_BUDGET_SOURCE_ROOT}/src/${name}` : new URL('../src/' + name, import.meta.url), 'utf8')))).join('\n')
async function pageFixture({ abortAtYield = false } = {}) {
  const scope = { connectionId: 'A', profile: 'default' }, controller = new AbortController()
  const calls = [], metadata = [], progress = [], tasks = []
  let yields = 0, liveRead = false
  const context = vm.createContext({ ID: 'codex-chat-look', URLSearchParams,
    setTimeout: (fn, delay) => { yields++; return setTimeout(() => { tasks.push(calls.length); if (abortAtYield) controller.abort(); fn() }, delay) }, clearTimeout,
    host: { state: { connectionId: { get: () => 'A' }, profile: { get: () => 'default' } }, request: async () => { liveRead = true; return { sessions: [] } } },
    window: { hermesDesktop: {
      getAgentRoster: async () => ({ sources: [{ connectionId: 'A', reachable: true }], agents: [scope] }),
      api: async request => {
        calls.push(request.path)
        const url = new URL(request.path, 'http://fixture'), id = url.pathname.split('/')[3]
        if (url.pathname === '/api/sessions') return { total: 132, sessions: [{ id: 'fresh', source: 'desktop', profile: 'default' }] }
        // Let the independent live proof arrive before the history burst.
        await Promise.resolve(); await Promise.resolve()
        if (url.pathname.endsWith('/latest-descendant')) return { requested_session_id: id, session_id: id, path: [id] }
        return { id, profile: 'default', connection_id: 'A', source: id === 'old4' ? 'cron' : 'desktop', message_count: 1 }
      }
    } }
  })
  vm.runInContext(source + '\nglobalThis.readPage = readCodexInboxPage', context)
  const inbox = { admission: { admittedSessionIds: () => Array.from({ length: 32 }, (_, i) => 'old' + i) }, model: { isSettled: () => false, isSnoozed: () => false } }
  const result = context.readPage(scope, 1, controller.signal, inbox, new Map(), data => metadata.push({ n: data.sessions.length, liveRead }), () => [], data => progress.push(data))
  return { result, calls, metadata, progress, tasks, controller, yields: () => yields }
}

test('backfill yields bounded tasks, projects fresh metadata once, and keeps each authority-bearing progression', async () => {
  const f = await pageFixture()
  const result = await f.result
  assert.equal(result.sessions.length, 33)
  assert.equal(f.calls.length, 65, 'one recent-page response plus detail and lineage for every admitted thread')
  assert.equal(f.metadata.filter(s => s.n === 1).length, 1, 'first fresh page must not be published twice')
  assert.ok(f.yields() >= 7, 'cached history cannot run all batches in one microtask chain')
  assert.ok(f.tasks[0] < 65, 'the task queue gets control before all history reads finish')
  assert.equal(f.progress.filter(p => p.sessions.length === 33).length, 1)
  assert.equal(f.metadata.filter(s => s.n > 1).length, 0, 'a live progression already includes its matching metadata')
  assert.ok(f.progress.some(p => p.sessions.some(row => row.id === 'old4' && row.source === 'cron')), 'cron source evidence is never coalesced away')
  assert.deepEqual(f.progress.map(p => p.sessions.length).filter(n => n > 1), [5, 9, 13, 17, 21, 25, 29, 33])
})

test('cancellation during a backfill task stops reads and cannot publish later metadata', async () => {
  const f = await pageFixture({ abortAtYield: true })
  await assert.rejects(f.result, /scope changed|cancelled/)
  const counts = [f.calls.length, f.metadata.length, f.progress.length]
  await new Promise(resolve => setTimeout(resolve, 15))
  assert.deepEqual([f.calls.length, f.metadata.length, f.progress.length], counts)
  assert.ok(f.calls.length < 65)
})

test('registered Universal publications retain unchanged owner references and ingest only the changed owner', () => universalFixture(async browser => {
  await browser.evaluate(`(()=>{
    for(const route of routes){const row={...metadata(route),profile:route.profile};runtime.admission.observe(route,[row],{workingSessions:[row]})}
    host.requestProfile=async(_,m)=>m==='session.active_list'?{sessions:[]}:{subagents:[]};
    window.ingests=[];const ingest=runtime.model.ingest;runtime.model.ingest=(scope,...args)=>{ingests.push(scope.connectionId+':'+scope.profile);return ingest(scope,...args)};
    window.published=[];const update=runtime.updateOwners;runtime.updateOwners=snapshots=>{published.push(snapshots);return update(snapshots)};
    runToggle()
  })()`)
  await browser.evaluate('refetch()')
  const receipt = await browser.evaluate(`(async()=>{
    const before=published.at(-1), untouched=before.find(s=>s.scope.connectionId==='B');ingests.length=0;published.length=0;
    const old=metadata;metadata=route=>({...old(route),...(route.connectionId==='A'&&route.profile==='default'?{title:'Changed owner'}:{})});
    const query=queryClient.getQueryCache().getAll().find(q=>q.getObserversCount()&&q.queryKey[1]==='inbox'&&q.queryKey[2]==='A'&&q.queryKey[3]==='default');await query.fetch();await flush();
    return {ingests:[...ingests],stable:published.every(snapshots=>snapshots.find(s=>s.scope.connectionId==='B')===untouched),rows:rows().length,queries:queryClient.getQueryCache().getAll().filter(q=>q.getObserversCount()).map(q=>q.getObserversCount()),errors}
  })()`)
  assert.ok(receipt.ingests.length > 0)
  assert.ok(receipt.ingests.every(owner => owner === 'A:default'), JSON.stringify(receipt.ingests))
  assert.equal(receipt.stable, true)
  assert.equal(receipt.rows, 3)
  assert.deepEqual(receipt.queries, [1, 1, 1, 1])
  assert.deepEqual(receipt.errors, [])
}))

test('identical runtime owner snapshots and repeated setMode are no-op reconciliations', () => universalFixture(async browser => {
  const result = await browser.evaluate(`(async()=>{
    for(const fn of disposals.splice(0).reverse())fn();queryClient.clear();
    runtime=installCodexInboxRuntime({storage,host});const snapshots=routes.map(route=>({scope:route,route,ownerGeneration:Symbol(),routeAvailable:true,sessions:[{...metadata(route),profile:route.profile}],liveSessions:[],liveStatusKnown:true}));
    runtime.updateOwners(snapshots);let ingests=0;const ingest=runtime.model.ingest;runtime.model.ingest=(...args)=>{ingests++;return ingest(...args)};
    runtime.updateOwners(snapshots);const same=ingests;runtime.updateOwners([snapshots[0],{...snapshots[1],sessions:[{...snapshots[1].sessions[0],title:'New'}]},snapshots[2]]);const changed=ingests;
    runtime.resetOwners();runtime.update(snapshots[0]);ingests=0;runtime.setMode(true);runtime.setMode(true);const mode=ingests;runtime.dispose();return {same,changed,mode}
  })()`)
  assert.deepEqual(result, { same: 0, changed: 1, mode: 0 })
}))
