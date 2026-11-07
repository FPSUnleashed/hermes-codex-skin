import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFile } from 'node:fs/promises'
import { universalFixture } from './helpers/universal-fixture.mjs'

for (const on of [false, true]) test(`600 admitted rows survive activation and refetch with bounded owner work (Universal ${on ? 'ON' : 'OFF'})`, () => universalFixture(async browser => {
  await browser.evaluate(`(async()=>{
    for(const fn of disposals.splice(0).reverse())fn();queryClient.clear();
    window.eventOwners=new Map();const subscribe=host.onEvent;host.onEvent=(type,fn)=>{const stack=new Error().stack;eventOwners.set(fn,{type,stack});const off=subscribe(type,fn);return()=>{eventOwners.delete(fn);off()}};
    const on=${on};saved.set('universal-inbox',on);routes=Array.from({length:on?3:1},(_,i)=>({connectionId:'A',profile:i?'desk'+i:'default',targetProfile:i?'desk'+i:'default',mode:'local'}));
    const count=on?200:600;
    window.historyRows=route=>Array.from({length:count},(_,i)=>({id:'s'+i,title:route.profile+' thread '+i,profile:route.targetProfile,connection_id:'A',source:'desktop',message_count:200+i,started_at:1700000000,last_active:1700000000+i,unread:false,_lineage_root_id:'s'+i,_lineage_ids:['s'+i]}));
    const admitted={};for(const route of routes)for(const row of historyRows(route))admitted[JSON.stringify(['A',route.profile,row.id])]=true;
    saved.set('inbox-state-v1',{version:1,records:{},aliases:{}});saved.set('inbox-admission-v2',{version:2,admitted,blocked:{}});
    let api=0,rpc=0,ingests=0,visits=0,publications=0;
    const activeObservers=new Set(),NativeObserver=MutationObserver;window.MutationObserver=class extends NativeObserver{constructor(fn){super(fn);activeObservers.add(this)}disconnect(){activeObservers.delete(this);return super.disconnect()}};
    hermesDesktop.getAgentRoster=async()=>({sources:[{connectionId:'A',reachable:true}],agents:routes});
    hermesDesktop.api=async request=>{api++;const route=routes.find(r=>r.profile===request.profile);const u=new URL(request.path,'http://fixture');if(u.pathname==='/api/sessions')return {total:count,sessions:historyRows(route).slice(0,100)};const parts=u.pathname.split('/'),id=decodeURIComponent(parts[3]);if(parts[4]==='latest-descendant')return {requested_session_id:id,session_id:id,path:[id]};return historyRows(route).find(row=>row.id===id)};
    host.requestProfile=async(_,method)=>{rpc++;if(method==='session.active_list')return {sessions:[]};throw Error('unexpected RPC '+method)};
    const install=installCodexInboxRuntime;installCodexInboxRuntime=options=>{const result=install(options),ingest=result.model.ingest;result.model.ingest=(scope,rows,...args)=>{ingests++;visits+=rows.length;return ingest(scope,rows,...args)};for(const name of ['update','updateOwners']){const fn=result[name];result[name]=(...args)=>{publications++;return fn(...args)}}return result};
    window.drainReads=async()=>{for(let i=0;i<1000;i++){if(!queryClient.getQueryCache().getAll().some(q=>q.getObserversCount()&&q.state.fetchStatus==='fetching')){await flush();return}await new Promise(r=>setTimeout(r,10))}throw Error('backfill did not drain')};
    window.counterSample=()=>({api,rpc,ingests,visits,publications,rows:rows().length,observers:queryClient.getQueryCache().getAll().filter(q=>q.getObserversCount()).map(q=>q.getObserversCount()),mutationObservers:activeObservers.size,eventListeners:events.size,eventOwners:[...eventOwners.values()],errors:[...errors]});
    window.resetCounters=()=>{api=rpc=ingests=visits=publications=0};
    __pluginDefault.register({storage,register:c=>contributions.push(c),onDispose:fn=>disposals.push(fn)});
  })()`)
  await browser.evaluate('drainReads()')
  const activation = await browser.evaluate('counterSample()')
  console.log('BACKFILL_ACTIVATION_PRE_ASSERT '+JSON.stringify({on,activation}))
  if (process.env.INBOX_COUNTER_RECEIPT_DIR) await writeFile(`${process.env.INBOX_COUNTER_RECEIPT_DIR}/activation-600-${on ? 'on' : 'off'}.json`, JSON.stringify(activation, null, 2) + '\n')
  await browser.evaluate('resetCounters();refetch()')
  await browser.evaluate('drainReads()')
  const samples = { activation, refresh: await browser.evaluate('counterSample()') }
  console.log('BACKFILL_PRE_ASSERT '+JSON.stringify({on,...samples}))
  if (process.env.INBOX_COUNTER_RECEIPT_DIR) await writeFile(`${process.env.INBOX_COUNTER_RECEIPT_DIR}/counters-600-${on ? 'on' : 'off'}.json`, JSON.stringify(samples, null, 2) + '\n')
  for (const [phase, sample] of Object.entries(samples)) {
    assert.equal(sample.rows, 600, phase)
    assert.equal(sample.api, on ? 603 : 1001, phase + ': no history response omitted')
    assert.equal(sample.rpc, on ? 3 : 1, phase + ': one active-list RPC per owner')
    assert.ok(sample.ingests <= (on ? 90 : 135), phase + ': ' + JSON.stringify(sample))
    assert.deepEqual(sample.observers, on ? [1, 1, 1, 1] : [1])
    assert.ok(sample.eventListeners <= (on ? 6 : 4))
    assert.equal(sample.eventListeners, activation.eventListeners)
    assert.equal(sample.mutationObservers, activation.mutationObservers)
    assert.ok(sample.mutationObservers <= (on ? 12 : 10))
    assert.deepEqual(sample.errors, [])
  }
  if (process.env.INBOX_COUNTER_RECEIPT_DIR) await writeFile(`${process.env.INBOX_COUNTER_RECEIPT_DIR}/counters-600-${on ? 'on' : 'off'}.json`, JSON.stringify(samples, null, 2) + '\n')
}))

test('retained rows, popup, Undo and public handles are revoked before a deferred paint, including ABA', () => universalFixture(async browser => {
  const receipt = await browser.evaluate(`(async()=>{
    for(const fn of disposals.splice(0).reverse())fn();queryClient.clear();const frames=new Map();let serial=0;
    runtime=installCodexInboxRuntime({storage,host,window:{MutationObserver,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id),setTimeout:setTimeout.bind(window),clearTimeout:clearTimeout.bind(window)}});
    const route=routes[0], rows=[{...metadata(route),profile:route.profile}, {...metadata(route),id:'second',_lineage_root_id:'second',_lineage_ids:['second'],profile:route.profile}];
    runtime.admission.observe(route,rows,{workingSessions:rows});const first={scope:route,route,ownerGeneration:Symbol(),routeAvailable:true,sessions:rows,liveSessions:[],liveStatusKnown:true};
    const paint=()=>{for(const [key,fn]of [...frames]){frames.delete(key);fn()}};runtime.updateOwners([first]);paint();
    const oldRow=document.querySelector('[data-codex-inbox-row]');oldRow.querySelector('[data-codex-inbox-settle]').click();paint();const undo=document.querySelector('[data-codex-inbox-settle-notice] button');
    let captured;const key=runtime.model.key;runtime.model.key=(scope,row)=>{if(row?.id==='second'&&row._codexInboxRoute)captured=row;return key(scope,row)};
    const second=document.querySelector('[data-codex-inbox-row]');paint();
    second.querySelector('[data-codex-inbox-snooze]').click();const option=document.querySelector('[data-codex-inbox-snooze-popup] button');
    const oldHandle=captured,before=JSON.stringify([...saved]),navBefore=nav.length;
    runtime.updateOwners([]);const removed=!second.isConnected&&!document.querySelector('[data-codex-inbox-snooze-popup]');
    const afterRemoval=frames.size;runtime.updateOwners([{...first,ownerGeneration:Symbol()}]);
    undo.click();option.click();second.querySelector('[data-codex-inbox-open]').click();second.querySelector('[data-codex-inbox-settle]').click();
    const publicResult=runtime.snooze(oldHandle,Date.now()+60000);
    const safe=!!oldHandle&&publicResult===false&&before===JSON.stringify([...saved])&&navBefore===nav.length;runtime.dispose();return {removed,safe,queued:afterRemoval>0,errors}
  })()`)
  assert.deepEqual(receipt, { removed: true, safe: true, queued: true, errors: [] })
}))
