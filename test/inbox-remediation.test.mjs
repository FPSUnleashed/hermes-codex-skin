import assert from 'node:assert/strict'
import test from 'node:test'
import {universalFixture} from './helpers/universal-fixture.mjs'

async function seed(b) {
  await b.evaluate(`for(const r of routes){const row={...metadata(r),profile:r.profile};runtime.admission.observe(r,[row],{workingSessions:[row]})};host.requestProfile=async(_,m)=>m==='session.active_list'?{sessions:[]}:{subagents:[]};runToggle();flush()`)
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate('rows().length'),3)
}

test('UI01 retained Snooze menu and public callback cannot follow alias alpha to beta',()=>universalFixture(async b=>{
  await seed(b)
  await b.evaluate(`window.oldSession={...metadata(routes[2]),profile:'desk',_codexInboxRoute:{...routes[2]}};window.oldRow=ownerRow('B','desk');oldRow.querySelector('[data-codex-inbox-snooze]').click();window.oldOption=document.querySelector('[data-codex-inbox-snooze-popup] button');routes[2]={...routes[2],targetProfile:'beta'};refetch()`)
  assert.equal(await b.evaluate("!!document.querySelector('[data-codex-inbox-snooze-popup]')"),false,'retarget must retire popup immediately')
  assert.equal(await b.evaluate('oldRow.isConnected'),false)
  await b.evaluate(`window.before=JSON.stringify([...saved]);window.navBefore=nav.length;oldOption.click();oldRow.querySelector('[data-codex-inbox-open]').click();oldRow.querySelector('[data-codex-inbox-settle]').click();window.staleResult=runtime.snooze(oldSession,Date.now()+60000);flush()`)
  assert.deepEqual(await b.evaluate('({same:before===JSON.stringify([...saved]),result:staleResult,navSame:nav.length===navBefore,errors})'),{same:true,result:false,navSame:true,errors:[]})
}))

test('UI01 exact backend identity isolates settlement, Snooze and reply receipts with colliding lineage across reload',()=>universalFixture(async b=>{
  await seed(b)
  await b.evaluate(`window.alpha={...routes[2]};window.row={...metadata(alpha),profile:alpha.profile};runtime.model.snooze(alpha,row,Date.now()+600000);runtime.model.settle(alpha,row,{manual:true});runtime.model.recordReply(alpha,row,'read');routes[2]={...alpha,targetProfile:'beta'};refetch()`)
  assert.deepEqual(await b.evaluate(`({settled:runtime.model.isSettled(routes[2],'root'),snoozed:runtime.model.isSnoozed(routes[2],'root'),reply:runtime.model.replyState(routes[2],{...row}),admitted:runtime.admission.isEligible(routes[2],row)})`),{settled:false,snoozed:false,reply:null,admitted:false})
  await b.evaluate(`disposals.reverse().forEach(fn=>fn());disposals=[];contributions=[];__pluginDefault.register({storage,register:c=>contributions.push(c),onDispose:fn=>disposals.push(fn)});flush()`)
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate(`runtime.model.isSettled(alpha,'root')&&runtime.model.isSnoozed(alpha,'root')&&runtime.model.replyState(alpha,row)==='read'&&!runtime.model.isSettled(routes[2],'root')`),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('UI02 primary closed before Universal On still reads all independently reachable metadata with unknown actions',()=>universalFixture(async b=>{
  await b.evaluate(`state.gateway.set('closed');for(const r of routes){const row={...metadata(r),profile:r.profile};runtime.admission.observe(r,[row],{workingSessions:[row]})};window.before=calls.filter(q=>q.path).length;runToggle();flush()`)
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate('rows().length'),3)
  assert.equal(await b.evaluate('calls.filter(q=>q.path).length>before'),true)
  assert.equal(await b.evaluate("rows().every(row=>row.dataset.workState==='unknown'&&row.querySelector('[data-codex-inbox-settle]').disabled)"),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('UI02 closed primary refreshes healthy metadata, retains failed source nodes and recovers',()=>universalFixture(async b=>{
  await seed(b)
  await b.evaluate(`window.prior=rows();window.originalMetadata=metadata;window.version=1;metadata=r=>({...originalMetadata(r),title:r.connectionId+':'+r.profile+':'+version});state.gateway.set('closed');window.failedSource='B';refetch()`)
  assert.equal(await b.evaluate('rows().length===3&&prior.every(el=>rows().includes(el))'),true)
  assert.equal(await b.evaluate("ownerRow('A','default').textContent.includes(':1')&&ownerRow('B','desk').querySelector('[data-codex-inbox-settle]').disabled"),true)
  await b.evaluate("window.failedSource=null;window.version=2;refetch()")
  assert.equal(await b.evaluate("ownerRow('B','desk').textContent.includes(':2')&&rows().every(row=>row.dataset.workState==='unknown')"),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

async function captureSession(b) {
  await b.evaluate(`window.captured=null;window.originalKey=runtime.model.key;runtime.model.key=(scope,row)=>{if(row?._codexInboxRoute?.connectionId==='B')captured=row;return originalKey(scope,row)};refetch()`)
  assert.equal(await b.evaluate('!!captured'),true)
}

test('UI01 ABA retarget retires real retained row, menu and public generation handles',()=>universalFixture(async b=>{
  await seed(b);await captureSession(b)
  await b.evaluate(`window.oldHandle=captured;window.oldRow=ownerRow('B','desk');oldRow.querySelector('[data-codex-inbox-snooze]').click();window.oldOption=document.querySelector('[data-codex-inbox-snooze-popup] button');window.alpha={...routes[2]};routes[2]={...alpha,targetProfile:'beta'};refetch()`)
  await b.evaluate('routes[2]=alpha;refetch()')
  assert.equal(await b.evaluate("ownerRow('B','desk')!==oldRow&&!oldRow.isConnected"),true)
  await b.evaluate(`window.before=JSON.stringify([...saved]);window.navBefore=nav.length;oldOption.click();oldRow.querySelector('[data-codex-inbox-open]').click();oldRow.querySelector('[data-codex-inbox-settle]').click();window.result=runtime.snooze(oldHandle,Date.now()+60000);flush()`)
  assert.deepEqual(await b.evaluate('({same:before===JSON.stringify([...saved]),result,navSame:navBefore===nav.length,errors})'),{same:true,result:false,navSame:true,errors:[]})
  await b.evaluate(`ownerRow('B','desk').querySelector('[data-codex-inbox-snooze]').click();document.querySelector('[data-codex-inbox-snooze-popup] button').click();flush()`)
  assert.equal(await b.evaluate("runtime.model.isSnoozed(alpha,'root')"),true,'fresh generation remains useful')
}))

test('UI01 complete route removal and identical readdition cannot resurrect retained callbacks',()=>universalFixture(async b=>{
  await seed(b);await captureSession(b)
  await b.evaluate(`window.oldHandle=captured;window.oldRow=ownerRow('B','desk');window.removed=routes.pop();refetch()`)
  assert.equal(await b.evaluate('oldRow.isConnected'),false)
  await b.evaluate('routes.push(removed);refetch()')
  await b.evaluate(`window.before=JSON.stringify([...saved]);window.result=runtime.snooze(oldHandle,Date.now()+60000);oldRow.querySelector('[data-codex-inbox-settle]').click();flush()`)
  assert.deepEqual(await b.evaluate('({same:before===JSON.stringify([...saved]),result,errors})'),{same:true,result:false,errors:[]})
}))

test('UI01 retained cancel and Undo cannot mutate a newly retargeted backend',()=>universalFixture(async b=>{
  await seed(b);await captureSession(b)
  await b.evaluate(`window.oldHandle=captured;window.alpha={...routes[2]};ownerRow('B','desk').querySelector('[data-codex-inbox-settle]').click();flush()`)
  assert.equal(await b.evaluate("runtime.model.isSettled(alpha,'root')"),true)
  await b.evaluate(`window.oldUndo=document.querySelector('[data-codex-inbox-settle-notice] button');oldUndo.click();flush()`)
  assert.equal(await b.evaluate("runtime.model.isSettled(alpha,'root')"),false,'same-generation Undo works')
  await b.evaluate(`ownerRow('B','desk').querySelector('[data-codex-inbox-settle]').click();flush()`)
  await b.evaluate(`window.oldUndo=document.querySelector('[data-codex-inbox-settle-notice] button');runtime.model.unsettle(alpha,{...metadata(alpha),profile:alpha.profile});runtime.model.snooze(alpha,{...metadata(alpha),profile:alpha.profile},Date.now()+600000);flush()`)
  await b.evaluate(`window.oldCancel=ownerRow('B','desk').querySelector('[data-codex-inbox-cancel-snooze]');routes[2]={...alpha,targetProfile:'beta'};const row={...metadata(routes[2]),profile:'desk'};runtime.admission.observe(routes[2],[row],{workingSessions:[row]});runtime.model.snooze(routes[2],row,Date.now()+1200000);runtime.model.settle(routes[2],row,{manual:true});refetch()`)
  await b.evaluate(`window.before=JSON.stringify([...saved]);oldUndo.click();oldCancel.click();window.result=runtime.cancelSnooze(oldHandle);flush()`)
  assert.deepEqual(await b.evaluate('({same:before===JSON.stringify([...saved]),result,errors})'),{same:true,result:false,errors:[]})
}))

test('UI01 failed-source suspension blocks actions and preserves unchanged owner nodes through recovery',()=>universalFixture(async b=>{
  await seed(b);await captureSession(b)
  await b.evaluate(`window.oldHandle=captured;window.oldRow=ownerRow('B','desk');window.beforeSaved=JSON.stringify([...saved]);failedSource='B';refetch()`)
  assert.equal(await b.evaluate("oldRow.isConnected&&ownerRow('B','desk')===oldRow"),true,'failed owner attention remains mounted during outage')
  await b.evaluate(`window.result=runtime.snooze(oldHandle,Date.now()+60000);oldRow.querySelector('[data-codex-inbox-settle]').click();flush()`)
  assert.deepEqual(await b.evaluate('({same:beforeSaved===JSON.stringify([...saved]),result,errors})'),{same:true,result:false,errors:[]})
  await b.evaluate(`failedSource=null;refetch()`)
  assert.equal(await b.evaluate("oldRow.isConnected&&ownerRow('B','desk')===oldRow"),true)
}))

test('UI01 unchanged backend state survives Universal Off/On and route-correct opening',()=>universalFixture(async b=>{
  await seed(b)
  await b.evaluate(`ownerRow('B','desk').querySelector('[data-codex-inbox-snooze]').click();document.querySelector('[data-codex-inbox-snooze-popup] button').click();state.connectionId.set('B');state.profile.set('desk');runToggle();flush()`)
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate("toggle().data.detail()==='Off'&&runtime.model.isSnoozed(routes[2],'root')&&rows().length===1"),true)
  await b.evaluate(`ownerRow('B','desk').querySelector('[data-codex-inbox-open]').click();flush()`)
  assert.deepEqual(await b.evaluate('nav.at(-1).options.route'),{connectionId:'B',profile:'desk',targetProfile:'alpha',mode:'remote'})
  await b.evaluate('runToggle();flush()');await b.evaluate('refetch()')
  assert.equal(await b.evaluate("runtime.model.isSnoozed(routes[2],'root')&&rows().length===3"),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('UI01 legacy local state is unchanged while uncertified alias-only remote state stays quarantined',()=>universalFixture(async b=>{
  await b.evaluate(`const row={...metadata(routes[0]),profile:'default'};runtime.admission.observe({connectionId:'A',profile:'default'},[row],{workingSessions:[row]});runtime.model.snooze({connectionId:'A',profile:'default'},row,Date.now()+600000);const legacy={connectionId:'B',profile:'desk'},foreign={...metadata(routes[2]),profile:'desk'};runtime.admission.observe(legacy,[foreign],{workingSessions:[foreign]});runtime.model.snooze(legacy,foreign,Date.now()+600000);runToggle();flush()`)
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate("runtime.model.isSnoozed(routes[0],'root')&&!runtime.model.isSnoozed(routes[2],'root')&&!runtime.admission.isEligible(routes[2],{...metadata(routes[2]),profile:'desk'})"),true)
  assert.equal(await b.evaluate("runtime.model.isSnoozed({connectionId:'B',profile:'desk'},'root')"),true,'uncertified legacy bytes are retained, not deleted or migrated')
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('UI02 late primary-era proof cannot restore activity after disconnect, but metadata continues',()=>universalFixture(async b=>{
  await seed(b)
  await b.evaluate(`window.originalRequest=host.requestProfile;host.requestProfile=async(r,m,p)=>{if(r.connectionId==='B'&&m==='session.active_list')await new Promise(resolve=>window.releaseLive=resolve);return originalRequest(r,m,p)};window.pending=refetch();flush()`)
  assert.equal(await b.evaluate('typeof releaseLive'),'function')
  await b.evaluate(`state.gateway.set('closed');releaseLive();pending.then(flush)`)
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate("rows().length===3&&rows().every(row=>row.dataset.workState==='unknown'&&row.querySelector('[data-codex-inbox-settle]').disabled)"),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('UI03 native grapheme rule retains Regional Indicators, composed flags and display_name glyph in shipped rows',()=>universalFixture(async b=>{
  const pairs=[['🇫🇷 Focus','🇫🇷'],['🇺🇸','🇺🇸'],['🇦','🇦'],['👩‍💻 Focus','👩‍💻'],[' 🏳️‍🌈 Focus','🏳️‍🌈'],[' é label','é'],[' -- 42','4'],['...','?']]
  for(const [display_name,glyph]of pairs)assert.equal(await b.evaluate(`inboxProfileAppearance(routes[2],{profileMetadata:{display_name:${JSON.stringify(display_name)}}}).letter`),glyph)
  await b.evaluate(`window.roster=hermesDesktop.getAgentRoster;hermesDesktop.getAgentRoster=async()=>{const data=await roster();data.agents.forEach(a=>a.profileMetadata.display_name='🇫🇷 Focus');return data}`)
  await seed(b)
  assert.equal(await b.evaluate("ownerRow('B','desk').querySelector('[data-codex-inbox-profile-glyph]').textContent"),'🇫🇷')
  assert.deepEqual(await b.evaluate('errors'),[])
}))
