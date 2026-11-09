import assert from 'node:assert/strict'
import test from 'node:test'
import { universalFixture } from './helpers/universal-fixture.mjs'

for (const universal of [false, true]) test(`lifecycle/input/child events between metadata progressions are delivered synchronously in order (Universal ${universal})`, () => universalFixture(async browser => {
  const receipt = await browser.evaluate(`(async()=>{
    for(const fn of disposals.splice(0).reverse())fn();queryClient.clear();
    const route={connectionId:'A',profile:'default',targetProfile:'default',mode:'local'};routes=[route];saved.set('universal-inbox',${universal});
    const rows=Array.from({length:33},(_,i)=>({id:'s'+i,title:'Thread '+i,source:'desktop',profile:'default',connection_id:'A',message_count:1,_lineage_root_id:'s'+i,_lineage_ids:['s'+i]}));
    const admitted={};rows.forEach(row=>admitted[JSON.stringify(['A','default',row.id])]=true);saved.set('inbox-state-v1',{version:1,records:{},aliases:{}});saved.set('inbox-admission-v2',{version:2,admitted,blocked:{}});
    hermesDesktop.getAgentRoster=async()=>({sources:[{connectionId:'A',reachable:true}],agents:routes});
    hermesDesktop.api=async request=>{const u=new URL(request.path,'http://fixture');if(u.pathname==='/api/sessions')return {total:33,sessions:[rows[0]]};const id=u.pathname.split('/')[3];if(u.pathname.endsWith('/latest-descendant'))return {requested_session_id:id,session_id:id,path:[id]};return rows.find(row=>row.id===id)};
    host.requestProfile=async(_,method)=>method==='session.active_list'?{sessions:[{id:'R',session_key:'s0',profile:'default',connection_id:'A',status:'idle'}]}:{subagents:[]};
    const expected=['message.start','clarify.request','clarify.settled','subagent.spawn_requested','message.complete','subagent.complete','error','message.start','message.complete'];
    const stages=new Map([[5,[expected[0]]],[9,[expected[1]]],[13,[expected[2]]],[17,[expected[3]]],[21,[expected[4]]],[25,[expected[5]]],[29,[expected[6]]],[33,expected.slice(7)]]),seen=new Set(),receipts=[];
    const install=installCodexInboxRuntime;installCodexInboxRuntime=options=>{const runtime=install(options),activity=runtime.activity;runtime.activity=event=>{const ok=activity(event);receipts.push({type:event.type,ok});return ok};
      for(const name of ['update','updateOwners']){const update=runtime[name];runtime[name]=(...args)=>{const result=update(...args),snapshot=name==='update'?args[0]:args[0].find(s=>s.scope.profile==='default');const count=snapshot?.sessions.length;
        if(snapshot?.liveStatusKnown&&stages.has(count)&&!seen.has(count)){seen.add(count);for(const type of stages.get(count)){const before=receipts.length;events.forEach(fn=>fn({type,connectionId:'A',profile:'default',session_id:'R',payload:{status:'complete',prompt_id:'prompt',subagent_id:'child'}}));if(receipts.length!==before+1)throw Error('event not synchronous: '+type)}}return result}}
      return runtime};
    __pluginDefault.register({storage,register:c=>contributions.push(c),onDispose:fn=>disposals.push(fn)});
    window.eventReceipt=()=>({expected,receipts,stages:[...seen],errors});
  })()`)
  await browser.evaluate('refetch()')
  const result = await browser.evaluate('eventReceipt()')
  assert.deepEqual(result.receipts.map(event => event.type), result.expected)
  assert.ok(result.receipts.every(event => event.ok), JSON.stringify(result.receipts))
  assert.deepEqual(result.stages, [5, 9, 13, 17, 21, 25, 29, 33])
  assert.deepEqual(result.errors, [])
}))
