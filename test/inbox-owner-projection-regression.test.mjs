import assert from 'node:assert/strict'
import test from 'node:test'
import { universalFixture } from './helpers/universal-fixture.mjs'

test('unchanged Universal owner proofs do not fan out costly projections to every owner, while metadata still refreshes',()=>universalFixture(async browser=>{
  await browser.evaluate(`(()=>{
    window.ownerReprojections=0
    const original=startCodexInboxObserver
    startCodexInboxObserver=(ctx,inbox,context)=>{const stop=original(ctx,inbox,context);const project=inbox.reproject;inbox.reproject=()=>{ownerReprojections++;return project()};return stop}
    for(const r of routes){const row={...metadata(r),profile:r.profile};runtime.admission.observe(r,[row],{workingSessions:[row]})}
    host.requestProfile=async(_,method)=>{if(method==='session.active_list')return {sessions:[]};if(method==='subagent.list')return {subagents:[]};throw Error('No identity RPC')}
    runToggle()
  })()`)
  await browser.evaluate('refetch()')
  assert.equal(await browser.evaluate('rows().length'),3,'all independently routed owners must still be visible')
  await browser.evaluate('window.ownerReprojections=0')
  await browser.evaluate('refetch()')
  assert.equal(await browser.evaluate('ownerReprojections'),0,'no changed proof means no cross-owner projection wave')
  await browser.evaluate(`(()=>{const before=metadata;window.metadata=route=>({...before(route),title:'Updated '+route.connectionId+':'+route.profile})})()`)
  await browser.evaluate('refetch()')
  assert.equal(await browser.evaluate("rows().length===3&&rows().every(row=>row.querySelector('[data-codex-inbox-label]').textContent.startsWith('Updated '))"),true,'suppressing no-op proof notifications must not suppress real metadata refreshes')
  assert.equal(await browser.evaluate('ownerReprojections'),0)
  assert.deepEqual(await browser.evaluate('errors'),[])
}))

test('new verified owner proof still propagates, then identical proved snapshots stay quiet',()=>universalFixture(async browser=>{
  await browser.evaluate(`(()=>{
    window.ownerReprojections=0
    const original=startCodexInboxObserver
    startCodexInboxObserver=(ctx,inbox,context)=>{const stop=original(ctx,inbox,context);const project=inbox.reproject;inbox.reproject=()=>{ownerReprojections++;return project()};return stop}
    host.requestProfile=async(route,method,payload)=>{
      if(method==='session.active_list')return {sessions:[{id:'R-default',session_key:'same',status:'working'},{id:'R-desk',session_key:'same',status:'working'}]}
      if(method==='subagent.list')return {subagents:[]}
      if(method==='session.status')return {output:'Hermes TUI Status\\n\\nSession ID: same\\nPath: /'+route.connectionId+'/'+(payload.session_id==='R-default'?'default':'alpha')}
      throw Error('unsupported')
    }
    runToggle()
  })()`)
  await browser.evaluate('refetch()')
  assert.equal(await browser.evaluate('rows().length'),0,'unproved legacy rows must not admit attention')
  await browser.evaluate("state.focusedSessionOwner.set(routes[0]);state.focusedStoredSessionId.set('same');state.focusedSessionId.set('R-default');flush()")
  await browser.evaluate('refetch()')
  assert.equal(await browser.evaluate("ownerReprojections>0&&rows().length===1&&ownerRow('A','default').dataset.workState==='working'"),true,'a genuinely new proof must still invalidate other owner projections')
  await browser.evaluate('window.ownerReprojections=0')
  await browser.evaluate('refetch()')
  assert.equal(await browser.evaluate('ownerReprojections'),0,'identical nonempty owner proofs are not new evidence')
  assert.equal(await browser.evaluate("rows().length===1&&ownerRow('A','default').dataset.workState==='working'"),true)
  assert.deepEqual(await browser.evaluate('errors'),[])
}))
