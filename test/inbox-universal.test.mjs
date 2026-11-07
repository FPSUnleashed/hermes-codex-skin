import assert from 'node:assert/strict'
import test from 'node:test'
import {universalFixture} from './helpers/universal-fixture.mjs'
import {mkdir,writeFile} from 'node:fs/promises'
async function capture(b,name){
  if(!process.env.CODEX_UNIVERSAL_EVIDENCE)return
  await mkdir(process.env.CODEX_UNIVERSAL_EVIDENCE,{recursive:true})
  const {data}=await b.call('Page.captureScreenshot',{format:'png'})
  await writeFile(`${process.env.CODEX_UNIVERSAL_EVIDENCE}/${name}.png`,Buffer.from(data,'base64'))
}
async function admitted(b) {
  await b.evaluate(`for(const r of routes){const row={...metadata(r),profile:r.profile};runtime.admission.observe(r,[row],{workingSessions:[row]})};host.requestProfile=async(_,m)=>{if(m==='session.active_list')return {sessions:[]};if(m==='subagent.list')return {subagents:[]};throw Error('No identity RPC')};runToggle();flush()`)
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate('rows().length'),3)
}
async function pointer(b, expression) {
  const p=await b.evaluate(`(()=>{const el=${expression},r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})})
  await b.evaluate('flush()')
}
async function key(b,key,code,n,text) {
  for(const type of ['keyDown','keyUp'])await b.call('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:n,...(text&&type==='keyDown'?{text}:{})})
  await b.evaluate('flush()')
}
test('registered global Universal Inbox toggles observer rows without a message, across profiles, drafts and readback failure',()=>universalFixture(async b=>{
  assert.equal(await b.evaluate('!!toggle()'),true,'native boolean palette contribution must exist')
  assert.equal(await b.evaluate('toggle().data.detail()'),'Off')
  assert.equal(await b.evaluate('toggle().data.keepOpen'),true)
  await b.evaluate("import('/palette-ui.mjs').then(({mountPalette})=>{window.unmountPalette=mountPalette()}).then(flush)")
  await pointer(b,"document.querySelector('#native-palette-trigger')")
  await b.evaluate('window.failSave=true')
  await pointer(b,"document.querySelector('#native-universal-toggle')")
  assert.equal(await b.evaluate('toggle().data.detail()'),'Off')
  assert.equal(await b.evaluate('notifications.at(-1).kind'),'error')
  assert.deepEqual(await b.evaluate('paletteReceipt'),{tick:1,closed:0},'actual native palette select keeps the boolean row open and requests live readback')
  await b.evaluate("window.failSave=false;document.querySelector('#native-universal-toggle').focus()")
  await key(b,'Enter','Enter',13,'\r')
  assert.equal(await b.evaluate('toggle().data.detail()'),'On')
  assert.equal(await b.evaluate("document.querySelector('#native-universal-toggle').textContent.endsWith('On')&&document.activeElement===document.querySelector('#native-universal-toggle')"),true)
  await key(b,'Escape','Escape',27)
  assert.equal(await b.evaluate("!document.querySelector('[role=dialog]')&&document.activeElement===document.querySelector('#native-palette-trigger')"),true)
  assert.equal(await b.evaluate('rows().length'),0,'aggregation must not admit idle historical metadata')
  assert.deepEqual(await b.evaluate("[...new Set(calls.filter(x=>x.path).map(x=>x.connectionId+':'+x.profile))].sort()"),['A:default','A:desk','B:desk'])
  assert.equal(await b.evaluate("calls.filter(x=>x.path).every(x=>x.path.startsWith('/api/sessions?')&&!x.path.includes('profile=all'))"),true)
  await b.evaluate("state.connectionId.set('B');state.profile.set('desk');state.focusedSessionOwner.set(null);state.focusedStoredSessionId.set(null);flush()")
  assert.equal(await b.evaluate('toggle().data.detail()'),'On','setting is one global boolean, not owner-indexed')
  await b.evaluate('runToggle();flush()')
  assert.equal(await b.evaluate('toggle().data.detail()'),'Off')
  assert.deepEqual(await b.evaluate('nav'),[])
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('registered Universal Off preserves the stable owner-scoped manual Settle behavior under unknown activity',()=>universalFixture(async b=>{
  await b.evaluate("const owner=routes[0],row=metadata(owner);runtime.admission.observe(owner,[row],{workingSessions:[row]});flush()")
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate("toggle().data.detail()==='Off'&&rows().length===1&&ownerRow('A','default').dataset.workState!=='working'&&!ownerRow('A','default').querySelector('[data-codex-inbox-settle]').disabled"),true)
  await pointer(b,"ownerRow('A','default').querySelector('[data-codex-inbox-settle]')")
  assert.equal(await b.evaluate("runtime.model.isManualSettled(routes[0],'root')&&rows().length===0"),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

for(const theme of ['light','dark'])test(`registered owner-collision journey, native icon/action slot, Snooze, Settle and persistence (${theme})`,()=>universalFixture(async b=>{
  await admitted(b)
  await b.evaluate(`document.documentElement.classList.toggle('dark',${JSON.stringify(theme)}==='dark');document.querySelector('aside').style.width='220px';localStorage.setItem('hermes.desktop.profileColors',JSON.stringify({desk:'#fa1234'}));dispatchEvent(new StorageEvent('storage',{key:'hermes.desktop.profileColors'}));flush()`)
  assert.equal(await b.evaluate("rows().filter(el=>!el.querySelector('[data-codex-inbox-profile-slot]')?.hidden&&el.querySelector('[data-codex-inbox-profile-slot]')).length"),2)
  assert.equal(await b.evaluate("ownerRow('A','default').querySelector('[data-codex-inbox-profile-slot]')===null"),true)
  assert.equal(await b.evaluate("ownerRow('B','desk').querySelector('[data-codex-inbox-profile-glyph]').textContent"),'F')
  assert.equal(await b.evaluate("inboxProfileAppearance(routes[2],{profileMetadata:{display_name:'👩‍💻 Focus',has_avatar:true}}).letter"),'👩‍💻')
  assert.equal(await b.evaluate("rows().every(row=>!row.querySelector('img'))"),true,'has_avatar is not an image URL')
  assert.equal(await b.evaluate("getComputedStyle(ownerRow('B','desk').querySelector('[data-codex-inbox-profile-glyph]')).color"),'rgb(250, 18, 52)')
  await b.evaluate("window.foreign=ownerRow('B','desk');window.beforeRect=JSON.stringify([...foreign.querySelectorAll('button')].map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}));window.icon=foreign.querySelector('[data-codex-inbox-profile-slot]')")
  assert.equal(await b.evaluate("getComputedStyle(icon).visibility"),'visible')
  await capture(b,`slot-${theme}-idle`)
  await pointer(b,"ownerRow('B','desk').querySelector('[data-codex-inbox-open]')")
  assert.equal(await b.evaluate("getComputedStyle(icon).visibility"),'hidden')
  await capture(b,`slot-${theme}-hover`)
  assert.equal(await b.evaluate("JSON.stringify([...foreign.querySelectorAll('button')].map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}))===beforeRect"),true)
  assert.deepEqual(await b.evaluate('nav.at(-1)'),{id:'same',options:{profile:'desk',route:{connectionId:'B',profile:'desk',targetProfile:'alpha',mode:'remote'}}})
  await b.evaluate("ownerRow('B','desk').querySelector('[data-codex-inbox-snooze]').focus()")
  await key(b,'Enter','Enter',13,'\r')
  assert.equal(await b.evaluate("document.querySelector('[data-codex-inbox-snooze-popup]').children.length"),4)
  await key(b,'Enter','Enter',13,'\r')
  assert.equal(await b.evaluate("runtime.model.isSnoozed(routes[2],'root')&&!runtime.model.isSnoozed(routes[1],'root')&&!runtime.model.isSnoozed(routes[0],'root')"),true)
  await pointer(b,"document.querySelector('[data-codex-inbox-snoozed-toggle]')")
  assert.equal(await b.evaluate("ownerRow('B','desk')===foreign&&!!foreign.querySelector('[data-codex-inbox-cancel-snooze]')&&!foreign.querySelector('[data-codex-inbox-settle]')&&foreign.querySelector('[data-codex-inbox-snooze]').inert"),true)
  await capture(b,`slot-${theme}-snoozed`)
  await pointer(b,"foreign.querySelector('[data-codex-inbox-open]')")
  assert.equal(await b.evaluate("runtime.model.isSnoozed(routes[2],'same')"),true)
  await pointer(b,"foreign.querySelector('[data-codex-inbox-cancel-snooze]')")
  assert.equal(await b.evaluate("!runtime.model.isSnoozed(routes[2],'root')&&ownerRow('B','desk')===foreign"),true)
  await b.evaluate("state.connectionId.set('B');state.profile.set('desk');flush()")
  assert.equal(await b.evaluate("foreign.querySelector('[data-codex-inbox-profile-slot]').hidden"),true)
  await pointer(b,"ownerRow('A','desk').querySelector('[data-codex-inbox-settle]')")
  assert.equal(await b.evaluate("runtime.model.isManualSettled(routes[1],'root')&&!runtime.model.isManualSettled(routes[2],'root')&&!runtime.model.isManualSettled(routes[0],'root')&&rows().length===2"),true)
  await b.evaluate("disposals.reverse().forEach(fn=>fn());disposals=[];contributions=[];__pluginDefault.register({storage,register:c=>contributions.push(c),onDispose:fn=>disposals.push(fn)});flush()")
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate("toggle().data.detail()==='On'&&rows().length===2&&runtime.model.isManualSettled(routes[1],'root')"),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('registered partial inventory/read failure retains exact nodes, blocks stale actions and recovers automatically',()=>universalFixture(async b=>{
  await admitted(b)
  await b.evaluate("window.before=rows();window.stale=ownerRow('B','desk').querySelector('[data-codex-inbox-settle]');window.failedSource='B';refetch()")
  assert.equal(await b.evaluate('rows().length===3&&before.every(el=>rows().includes(el))'),true)
  assert.equal(await b.evaluate("!document.body.textContent.includes('Retry Inbox')&&!document.body.textContent.includes('Inbox could not be loaded')&&!document.body.textContent.includes('Inbox is clear')"),true)
  await b.evaluate("window.beforeSave=JSON.stringify([...saved]);stale.click();flush()")
  assert.equal(await b.evaluate('JSON.stringify([...saved])===beforeSave'),true)
  await b.evaluate("window.failedSource=null;refetch()")
  assert.equal(await b.evaluate("rows().length===3&&before.every(el=>rows().includes(el))&&!ownerRow('B','desk').querySelector('[data-codex-inbox-settle]').disabled"),true)
  await b.evaluate("window.holdRoute='B:desk';window.refreshing=refetch();flush()")
  assert.equal(await b.evaluate('typeof releaseRoute'),'function')
  await b.evaluate("runToggle();window.holdRoute=null;releaseRoute();refreshing;flush()")
  assert.equal(await b.evaluate("toggle().data.detail()==='Off'&&rows().every(el=>JSON.parse(el.dataset.codexInboxKey)[0]==='A'&&JSON.parse(el.dataset.codexInboxKey)[1]==='default')"),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('registered legacy process-wide rows need independent owner proof; modern shape and surface hints do not authorize work',()=>universalFixture(async b=>{
  await b.evaluate(`window.liveStatus='working';host.requestProfile=async(r,m,p)=>{if(m==='session.active_list')return {sessions:[{id:'R-default',session_key:'same',status:liveStatus},{id:'R-desk',session_key:'same',status:liveStatus}]};if(m==='subagent.list')return {subagents:[]};if(m==='session.status')return {output:'Hermes TUI Status\\n\\nSession ID: same\\nPath: /'+r.connectionId+'/'+(p.session_id==='R-default'?'default':'alpha')};throw Error('unsupported')};runToggle();flush()`)
  assert.equal(await b.evaluate('rows().length'),0,'no admission from process-wide legacy rows')
  await b.evaluate("events.forEach(fn=>fn({type:'message.start',connectionId:'A',profile:'desk',session_id:'R-desk',payload:{}}));flush()")
  assert.equal(await b.evaluate('rows().length'),0)
  await b.evaluate("state.focusedSessionOwner.set(routes[1]);state.focusedStoredSessionId.set('same');state.focusedSessionId.set('R-desk');flush()")
  assert.equal(await b.evaluate("rows().length===1&&ownerRow('A','desk').dataset.workState==='working'"),true)
  await b.evaluate("window.holdRoute='A:desk';window.refreshing=refetch();flush()")
  await b.evaluate("state.gateway.set('closed');window.holdRoute=null;releaseRoute();refreshing.then(flush)")
  assert.equal(await b.evaluate("rows().every(el=>el.dataset.workState!=='working'&&el.querySelector('[data-codex-inbox-settle]').disabled)"),true,'late disconnected proof cannot restore authority')
  await b.evaluate("refetch()")
  assert.equal(await b.evaluate("rows().every(el=>el.dataset.workState!=='working'&&el.querySelector('[data-codex-inbox-settle]').disabled)"),true,'inventory polling while closed cannot restart live authority')
  await b.evaluate("state.focusedSessionOwner.set(null);state.focusedStoredSessionId.set(null);state.focusedSessionId.set(null);host.requestProfile=async(_,m)=>m==='session.active_list'?{sessions:[{id:'same',session_key:'same',status:'working'}]}:{subagents:[]};state.gateway.set('open');refetch()")
  assert.equal(await b.evaluate("rows().every(el=>el.dataset.workState!=='working')"),true,'modern id==durable is not an exact transport certificate')
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('registered native metadata partial errors, malformed bodies and carried owner rows cannot become authoritative empty',()=>universalFixture(async b=>{
  await admitted(b)
  await b.evaluate("window.prior=rows();window.originalApi=hermesDesktop.api;window.damage=null;hermesDesktop.api=async request=>request.connectionId==='B'&&damage?structuredClone(damage):originalApi(request)")
  for(const body of [
    {total:0,sessions:[],errors:[{profile:'alpha',error:'locked'}]},
    {total:0,sessions:[],storage:{alpha:'unavailable'}},
    {sessions:[]},
    {total:1,sessions:[{id:'same',profile:'alpha',connection_id:'A'}]},
    {total:1,sessions:[{id:'same',profile:'desk',connection_id:'B'}]}
  ]){
    await b.evaluate(`window.damage=${JSON.stringify(body)};refetch()`)
    assert.equal(await b.evaluate("rows().length===3&&prior.every(el=>rows().includes(el))&&ownerRow('B','desk').querySelector('[data-codex-inbox-settle]').disabled"),true)
    await b.evaluate('window.damage=null;refetch()')
    assert.equal(await b.evaluate("!ownerRow('B','desk').querySelector('[data-codex-inbox-settle]').disabled"),true)
  }
  await b.evaluate("host.requestProfile=async(_,m)=>m==='session.active_list'?{sessions:[{id:'same',session_key:'same',status:'working'}]}:{subagents:[]};refetch()")
  assert.equal(await b.evaluate("rows().every(el=>el.dataset.workState!=='working'&&el.querySelector('[data-codex-inbox-settle]').disabled)"),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

test('registered inventory quarantines ambiguous aliases and duplicate owners, while real owner reads are bounded',()=>universalFixture(async b=>{
  await b.evaluate("window.roster=hermesDesktop.getAgentRoster;window.rosterAgents=null;hermesDesktop.getAgentRoster=async()=>({...await roster(),...(rosterAgents?{agents:rosterAgents}:{})});window.duplicate={connectionId:'A',profile:'alias',targetProfile:'alpha',mode:'remote'};routes.push(duplicate)")
  assert.equal(await b.evaluate("readUniversalInboxInventory().then(data=>!data.complete&&data.routes.every(x=>x.route.connectionId!=='A'||!['alias','desk'].includes(x.route.profile)))"),true)
  await b.evaluate("routes.pop();routes.push(routes[1])")
  assert.equal(await b.evaluate("readUniversalInboxInventory().then(data=>!data.complete&&data.routes.every(x=>x.route.connectionId!=='A'||x.route.profile!=='desk'))"),true)
  await b.evaluate("routes.pop();window.running=0;window.maxReads=0;window.finished=0;window.more=Array.from({length:9},(_,i)=>({connectionId:'A',profile:'extra'+i,targetProfile:'extra'+i,mode:'local'}));routes.push(...more);host.requestProfile=async(_,m)=>m==='session.active_list'?{sessions:[]}:{subagents:[]};hermesDesktop.api=async q=>{const universal=readUniversalInbox();if(universal){running++;maxReads=Math.max(maxReads,running)}await new Promise(r=>setTimeout(r,75));const route=routes.find(r=>r.connectionId===q.connectionId&&r.profile===q.profile);if(universal)running--;finished++;return {total:1,sessions:[metadata(route)]}};runToggle();flush()")
  await b.evaluate('runToggle();runToggle();flush()')
  await b.evaluate('refetch()')
  assert.equal(await b.evaluate('maxReads<=4&&finished>=12&&running===0'),true)
  assert.deepEqual(await b.evaluate('errors'),[])
}))
