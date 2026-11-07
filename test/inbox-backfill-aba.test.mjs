import assert from 'node:assert/strict'
import test from 'node:test'
import { universalFixture } from './helpers/universal-fixture.mjs'

test('Off/On ABA during an admitted-history read cannot reuse the previous live authority', () => universalFixture(async browser => {
  await browser.evaluate(`(async()=>{
    for(const fn of disposals.splice(0).reverse())fn();queryClient.clear();routes=[routes[0]];saved.set('universal-inbox',false);
    const scope=routes[0];const rows=Array.from({length:9},(_,i)=>({id:'s'+i,profile:'default',connection_id:'A',source:'desktop',title:'Old lifetime',message_count:1}));const admitted={};rows.forEach(row=>admitted[JSON.stringify(['A','default',row.id])]=true);saved.set('inbox-admission-v2',{version:2,admitted,blocked:{}});
    let release;const held=new Promise(resolve=>release=resolve);window.releaseBackfill=release;window.backfillStarted=false;window.listReads=0;
    hermesDesktop.getAgentRoster=async()=>({sources:[{connectionId:'A',reachable:true}],agents:routes});
    hermesDesktop.api=async request=>{const u=new URL(request.path,'http://fixture');if(u.pathname==='/api/sessions'){listReads++;return {total:9,sessions:[rows[0]]}}backfillStarted=true;await held;const id=u.pathname.split('/')[3];if(u.pathname.endsWith('/latest-descendant'))return {requested_session_id:id,session_id:id,path:[id]};return rows.find(row=>row.id===id)};
    host.requestProfile=async()=>({sessions:[]});window.receipts=[];
    const install=installCodexInboxRuntime;installCodexInboxRuntime=options=>{const runtime=install(options),update=runtime.update;runtime.update=snapshot=>{receipts.push(snapshot.liveStatusKnown);return update(snapshot)};return runtime};
    __pluginDefault.register({storage,register:c=>contributions.push(c),onDispose:fn=>disposals.push(fn)});await flush()
  })()`)
  assert.equal(await browser.evaluate('backfillStarted'), true)
  await browser.evaluate("setCodexInboxMode('off',runtime);setCodexInboxMode('on',runtime);receipts.length=0;releaseBackfill();flush()")
  const receipt = await browser.evaluate('({receipts,listReads,errors})')
  assert.equal(receipt.listReads, 1, 'the test isolates the old read, not a new successful proof')
  assert.ok(receipt.receipts.length > 0)
  assert.ok(receipt.receipts.every(known => !known), JSON.stringify(receipt))
  assert.deepEqual(receipt.errors, [])
}))
