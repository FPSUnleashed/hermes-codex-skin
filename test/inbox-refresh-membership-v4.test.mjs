import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFile } from 'node:fs/promises'
import { universalFixture } from './helpers/universal-fixture.mjs'

for (const on of [false, true]) for (const total of [105, 600]) {
  test(`pending history retains painted membership and identity, ${total}, Universal ${on}`, async () => {
    let receipt
    await universalFixture(async browser => {
      await browser.evaluate(`(async()=>{
        for(const fn of disposals.splice(0).reverse())fn();queryClient.clear();contributions.length=0;
        saved.set('universal-inbox',${on});const owners=${on && total === 600 ? 3 : 1},count=${total}/owners;
        routes=Array.from({length:owners},(_,i)=>({connectionId:'A',profile:i?'desk'+i:'default',targetProfile:i?'desk'+i:'default',mode:'local'}));
        window.historyRows=r=>Array.from({length:count},(_,i)=>({id:'s'+i,title:r.profile+' conversation '+i,profile:r.targetProfile,connection_id:'A',source:'desktop',message_count:200+i,started_at:1700000000,last_active:1700000000+i,unread:false,_lineage_root_id:'s'+i,_lineage_ids:['s'+i]}));
        const admitted={};for(const r of routes)for(const row of historyRows(r))admitted[JSON.stringify(['A',r.profile,row.id])]=true;
        saved.set('inbox-state-v1',{version:1,records:{},aliases:{}});saved.set('inbox-admission-v2',{version:2,admitted,blocked:{}});
        window.held=false;window.blockedOwners=new Set();window.releases=[];window.negative=false;
        hermesDesktop.getAgentRoster=async()=>({sources:[{connectionId:'A',reachable:true}],agents:routes});
        hermesDesktop.api=async request=>{const r=routes.find(r=>r.profile===request.profile),u=new URL(request.path,'http://fixture');if(u.pathname==='/api/sessions')return {total:count,sessions:historyRows(r).slice(0,100)};
          const parts=u.pathname.split('/'),id=decodeURIComponent(parts[3]);if(held&&id==='s104'&&parts[4]!=='latest-descendant'){blockedOwners.add(r.profile);await new Promise(resolve=>releases.push(resolve))}
          if(parts[4]==='latest-descendant')return {requested_session_id:id,session_id:id,path:[id]};
          const row=historyRows(r).find(x=>x.id===id);if(negative){if(id==='s100')row.source='cron';if(id==='s101')throw Object.assign(Error('not found'),{statusCode:404});if(id==='s102')row.archived=true;if(id==='s103')row.hidden=true}return row};
        host.requestProfile=async(_,method)=>{if(method==='session.active_list')return {sessions:[]};throw Error('unexpected RPC '+method)};
        window.drain=async()=>{for(let i=0;i<1000;i++){if(!queryClient.getQueryCache().getAll().some(q=>q.getObserversCount()&&q.state.fetchStatus==='fetching')){await flush();return}await new Promise(r=>setTimeout(r,10))}throw Error('read drain timeout')};
        window.block=async()=>{held=true;blockedOwners.clear();window.beforeNodes=new Map(rows().map(row=>[row.dataset.codexInboxKey,row]));window.readDone=refetch();for(let i=0;i<1000;i++){if(blockedOwners.size===owners){await flush();await new Promise(r=>requestIdleCallback(r));return}await new Promise(r=>setTimeout(r,10))}throw Error('barrier not reached')};
        window.release=async()=>{held=false;for(const fn of releases.splice(0))fn();await readDone;await drain()};
        window.sample=()=>({count:rows().length,same:rows().every(row=>beforeNodes.get(row.dataset.codexInboxKey)===row),missing:[...beforeNodes].filter(([key,row])=>!row.isConnected).map(([key])=>key),errors:[...errors]});
        __pluginDefault.register({storage,register:c=>contributions.push(c),onDispose:fn=>disposals.push(fn)});await drain();
      })()`)
      const samples=[]
      for (let iteration=0;iteration<2;iteration++) {
        await browser.evaluate('block()')
        samples.push(await browser.evaluate(`(()=>{const before=JSON.stringify([...saved]),n=nav.length;const pending=beforeNodes.get(JSON.stringify(['A','default','s104']));pending.querySelector('[data-codex-inbox-settle]').click();pending.querySelector('[data-codex-inbox-open]').click();return {...sample(),noAction:JSON.stringify([...saved])===before&&nav.length===n}})()`))
        await browser.evaluate('release()')
        samples.push(await browser.evaluate('sample()'))
      }
      await browser.evaluate('negative=true;block()')
      const negative=await browser.evaluate(`({...sample(),revoked:['s100','s101','s102','s103'].every(id=>!rows().some(row=>JSON.parse(row.dataset.codexInboxKey)[2]===id)),pendingPresent:rows().some(row=>JSON.parse(row.dataset.codexInboxKey)[2]==='s104')})`)
      await browser.evaluate('release()')
      receipt = {samples,negative}
    })
    if(process.env.MEMBERSHIP_RECEIPT_DIR)await writeFile(`${process.env.MEMBERSHIP_RECEIPT_DIR}/membership-${total}-${on}.json`,JSON.stringify(receipt,null,2)+'\n')
    for(const sample of receipt.samples){assert.equal(sample.count,total,JSON.stringify(sample));assert.equal(sample.same,true);assert.deepEqual(sample.errors,[]);if('noAction' in sample)assert.equal(sample.noAction,true)}
    assert.equal(receipt.negative.count,total-(on&&total===600?12:4),JSON.stringify(receipt.negative))
    assert.equal(receipt.negative.revoked,true)
    assert.equal(receipt.negative.pendingPresent,true)
    assert.deepEqual(receipt.negative.errors,[])
  })
}
