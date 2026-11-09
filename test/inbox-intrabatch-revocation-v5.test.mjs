import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFile } from 'node:fs/promises'
import { universalFixture } from './helpers/universal-fixture.mjs'

for (const on of [false, true]) for (const violation of ['cron', '404', 'archived', 'hidden']) {
  test(`a resolved ${violation} detail revokes before its same-batch sibling, Universal ${on}`, async () => {
    let receipt
    await universalFixture(async browser => {
      await browser.evaluate(`(async()=>{
        for(const fn of disposals.splice(0).reverse())fn();queryClient.clear();contributions.length=0;
        saved.set('universal-inbox',${on});const owners=${on ? 3 : 1},count=105;
        routes=Array.from({length:owners},(_,i)=>({connectionId:'A',profile:i?'desk'+i:'default',targetProfile:i?'desk'+i:'default',mode:'local'}));
        window.historyRows=r=>Array.from({length:count},(_,i)=>({id:'s'+i,title:r.profile+' conversation '+i,profile:r.targetProfile,connection_id:'A',source:'desktop',message_count:200+i,started_at:1700000000,last_active:1700000000+i,unread:false,_lineage_root_id:'s'+i,_lineage_ids:['s'+i]}));
        const admitted={};for(const r of routes)for(const row of historyRows(r))admitted[JSON.stringify(['A',r.profile,row.id])]=true;
        saved.set('inbox-state-v1',{version:1,records:{},aliases:{}});saved.set('inbox-admission-v2',{version:2,admitted,blocked:{}});
        window.held=false;window.negative=false;window.blockedOwners=new Set();window.releases=[];
        hermesDesktop.getAgentRoster=async()=>({sources:[{connectionId:'A',reachable:true}],agents:routes});
        hermesDesktop.api=async request=>{
          const r=routes.find(r=>r.profile===request.profile),u=new URL(request.path,'http://fixture');
          if(u.pathname==='/api/sessions')return {total:count,sessions:historyRows(r).slice(0,100)};
          const parts=u.pathname.split('/'),id=decodeURIComponent(parts[3]);
          if(held&&id==='s103'&&parts[4]!=='latest-descendant'){blockedOwners.add(r.profile);await new Promise(resolve=>releases.push(resolve))}
          if(parts[4]==='latest-descendant')return {requested_session_id:id,session_id:id,path:[id]};
          const row=historyRows(r).find(x=>x.id===id);
          if(negative&&id==='s100'){
            const violation=${JSON.stringify(violation)};
            if(violation==='404')throw Object.assign(Error('not found'),{statusCode:404});
            if(violation==='cron')row.source='cron';
            if(violation==='archived')row.archived=true;
            if(violation==='hidden')row.hidden=true;
          }
          return row;
        };
        host.requestProfile=async(_,method)=>{if(method==='session.active_list')return {sessions:[]};throw Error('unexpected RPC '+method)};
        window.drain=async()=>{for(let i=0;i<1000;i++){if(!queryClient.getQueryCache().getAll().some(q=>q.getObserversCount()&&q.state.fetchStatus==='fetching')){await flush();return}await new Promise(r=>setTimeout(r,10))}throw Error('read drain timeout')};
        __pluginDefault.register({storage,register:c=>contributions.push(c),onDispose:fn=>disposals.push(fn)});await drain();
        window.beforeNodes=new Map(rows().map(row=>[row.dataset.codexInboxKey,row]));
        if(beforeNodes.size!==count*owners)throw Error('initial fixture not complete');
        held=true;negative=true;window.readDone=refetch();
        for(let i=0;i<1000;i++){
          if(blockedOwners.size===owners){await flush();await new Promise(r=>requestIdleCallback(r));return}
          await new Promise(r=>setTimeout(r,10));
        }
        throw Error('same-batch barrier not reached');
      })()`)
      const during=await browser.evaluate(`(()=>{
        const state=JSON.stringify([...saved]),n=nav.length;
        for(const [key,node] of beforeNodes)if(JSON.parse(key)[2]==='s100'){
          node.querySelector('[data-codex-inbox-settle]').click();node.querySelector('[data-codex-inbox-open]').click();
        }
        return {count:rows().length,revoked:!rows().some(row=>JSON.parse(row.dataset.codexInboxKey)[2]==='s100'),pendingCount:rows().filter(row=>JSON.parse(row.dataset.codexInboxKey)[2]==='s103').length,sameNodes:rows().every(row=>beforeNodes.get(row.dataset.codexInboxKey)===row),noAction:JSON.stringify([...saved])===state&&nav.length===n,errors:[...errors]};
      })()`)
      await browser.evaluate('(async()=>{held=false;for(const fn of releases.splice(0))fn();await readDone;await drain()})()')
      const after=await browser.evaluate(`({count:rows().length,revoked:!rows().some(row=>JSON.parse(row.dataset.codexInboxKey)[2]==='s100'),sameNodes:rows().every(row=>beforeNodes.get(row.dataset.codexInboxKey)===row),errors:[...errors]})`)
      receipt={on,violation,during,after}
    })
    if(process.env.INTRABATCH_RECEIPT_DIR)await writeFile(`${process.env.INTRABATCH_RECEIPT_DIR}/${violation}-${on}.json`,JSON.stringify(receipt,null,2)+'\n')
    const owners=on?3:1
    assert.equal(receipt.during.revoked,true,JSON.stringify(receipt))
    assert.equal(receipt.during.count,104*owners)
    assert.equal(receipt.during.pendingCount,owners)
    assert.equal(receipt.during.sameNodes,true)
    assert.equal(receipt.during.noAction,true)
    assert.deepEqual(receipt.during.errors,[])
    assert.equal(receipt.after.revoked,true)
    assert.equal(receipt.after.count,104*owners)
    assert.equal(receipt.after.sameNodes,true)
    assert.deepEqual(receipt.after.errors,[])
  })
}
