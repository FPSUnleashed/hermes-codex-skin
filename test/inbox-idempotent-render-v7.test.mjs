import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

// This override executes the exact frozen v6 sources without copying or editing
// them. Assertions are identical for RED and GREEN, with no function rewrites.
const root = process.env.INBOX_RENDER_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url))
const rowSource = await readFile(resolve(root, 'src/inbox-row-ui.js'), 'utf8')
const runtimeSource = await readFile(resolve(root, 'src/inbox-runtime.js'), 'utf8')
async function fixture(run) {
  const b = await chromium()
  try {
    await b.call('Emulation.setFocusEmulationEnabled', { enabled: true })
    await b.call('Page.setDocumentContent', { frameId: (await b.call('Page.getFrameTree')).frameTree.frame.id, html: '<!doctype html><aside data-sessions-mode="sessions"><div data-slot="sidebar-group"><div class="group/section"><button class="group/section-label">Sessions</button></div><div data-slot="sidebar-group-content"><button id="native">Native</button></div></div></aside><div id="ui"></div>' })
    await b.evaluate(rowSource)
    await b.evaluate(runtimeSource)
    await b.evaluate(`
      window.errors=[];addEventListener('error',e=>errors.push(String(e.error)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
      window.api=0;window.fetch=async()=>{api++;throw Error('unexpected API')};
      window.atom=value=>{const listeners=new Set();return {get:()=>value,set:next=>{value=next;listeners.forEach(fn=>fn())},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}};
      window.tick=()=>new Promise(r=>requestAnimationFrame(()=>requestIdleCallback(r,{timeout:1000})));
      window.drain=async()=>{await tick();await tick();await tick()};
      window.scope={connectionId:'A',profile:'default'};window.saved=new Map([['inbox','on']]);window.storage={get:(k,f)=>structuredClone(saved.get(k)??f),set:(k,v)=>saved.set(k,structuredClone(v))};
      window.nav=[];window.host={state:{connectionId:atom('A'),profile:atom('default'),focusedStoredSessionId:atom(null),activeSessionId:atom(null)},openSession:(...x)=>nav.push(x),newChat:(...x)=>nav.push(x),request:async()=>{api++;throw Error('unexpected RPC')}};
      window.rows=()=>[...document.querySelectorAll('[data-codex-inbox-row]')];window.row=id=>rows().find(r=>r.dataset.codexInboxRow===id);
      window.records=[];window.mo=new MutationObserver(rs=>records.push(...rs));
      mo.observe(document.querySelector('aside'),{subtree:true,childList:true,attributes:true,characterData:true});
      window.reset=()=>{mo.takeRecords();records=[]};
      window.sample=()=>{const changes=records.map(r=>({type:r.type,attr:r.attributeName,key:(r.target.nodeType===1?r.target:r.target.parentElement).closest('[data-codex-inbox-row]')?.dataset.codexInboxKey})).filter(r=>r.key);return {mutations:changes.length,keys:[...new Set(changes.map(r=>r.key))].sort(),changes,api,errors:[...errors]}};
      window.runtime=installCodexInboxRuntime({storage,host});
    `)
    await run(b)
  } finally {
    await b.evaluate('mo?.disconnect();runtime?.dispose()').catch(()=>{})
    b.close()
  }
}

for (const delta of [1, 4]) test(`600 rows, title delta ${delta}: unchanged subtrees never mutate after RAF to idle`, () => fixture(async b => {
  await b.evaluate(`(async()=>{
    window.sessions=Array.from({length:600},(_,i)=>({id:'s'+i,title:'Conversation '+i,profile:'default',connection_id:'A',source:'desktop',message_count:2,started_at:(Date.now()+60000)/1000}));
    window.update=(extra={})=>runtime.update({scope,sessions,liveSessions:[],liveStatusKnown:true,...extra});
    update({liveSessions:sessions.map(s=>({session_id:s.id,status:'working'}))});update();await drain();document.querySelector('[data-codex-inbox-working-toggle][aria-expanded="false"]')?.click();await drain();
    window.beforeNodes=new Map(rows().map(r=>[r.dataset.codexInboxKey,[r,...r.querySelectorAll('*')]]));
    window.beforeKeys=[...beforeNodes.keys()].sort();window.safety=sessions.map(s=>runtime.admission.isEligible(scope,s));
    row('s20').querySelector('[data-codex-inbox-open]').focus();await drain();reset();
    sessions=sessions.map((s,i)=>i<${delta}?{...s,title:s.title+' changed'}:s);update();await drain();
  })()`)
  const actual = await b.evaluate(`({...sample(),count:rows().length,qualifiedKeys:rows().map(r=>r.dataset.codexInboxKey).sort(),same:rows().every(r=>[r,...r.querySelectorAll('*')].every((n,i)=>beforeNodes.get(r.dataset.codexInboxKey)[i]===n)),safetySame:JSON.stringify(safety)===JSON.stringify(sessions.map(s=>runtime.admission.isEligible(scope,s))),focused:document.activeElement===row('s20').querySelector('[data-codex-inbox-open]'),titles:sessions.slice(0,${delta}).every(s=>row(s.id).querySelector('[data-codex-inbox-label]').textContent===s.title)})`)
  console.log('RAW_TITLE_DELTA '+JSON.stringify({delta,mutations:actual.mutations,mutatedRows:actual.keys.length,api:actual.api}))
  assert.equal(actual.count,600)
  assert.deepEqual(actual.qualifiedKeys,await b.evaluate('beforeKeys'))
  assert.equal(actual.same,true)
  assert.equal(actual.safetySame,true)
  assert.equal(actual.focused,true)
  assert.equal(actual.titles,true)
  assert.equal(actual.api,0)
  assert.deepEqual(actual.errors,[])
  assert.deepEqual(actual.keys,Array.from({length:delta},(_,i)=>JSON.stringify(['A','default','s'+i])).sort(),'only changed row subtrees may mutate')
}))

test('600 unchanged rows stay mutation-free, including loading and retained presentation rows', () => fixture(async b => {
  await b.evaluate(`(async()=>{
    window.sessions=Array.from({length:600},(_,i)=>({id:'s'+i,title:'Conversation '+i,source:'desktop',message_count:2,started_at:(Date.now()+60000)/1000}));
    window.update=(extra={})=>runtime.update({scope,sessions,liveSessions:[],liveStatusKnown:true,...extra});
    update({liveSessions:sessions.map(s=>({session_id:s.id,status:'working'}))});update();await drain();
  })()`)
  const samples=[]
  for (const extra of [{},{loading:true},{sessions:[],retainedSessions:'all'}]) {
    const code = extra.retainedSessions ? '{sessions:[],retainedSessions:sessions}' : JSON.stringify(extra)
    await b.evaluate(`(async()=>{update(${code});await drain();reset();update(${code});document.querySelector('[data-codex-inbox-working-toggle]').click();await drain()})()`)
    samples.push(await b.evaluate('sample()'))
  }
  console.log('RAW_UNCHANGED '+JSON.stringify(samples.map(s=>({mutations:s.mutations,mutatedRows:s.keys.length,api:s.api}))))
  for(const sample of samples){assert.equal(sample.api,0);assert.deepEqual(sample.errors,[]);assert.equal(sample.mutations,0,'no write for identical row properties, even when Snooze remains disabled')}
}))

test('row UI is idempotent, repairs real DOM drift, and consumes in-place foreign appearance changes', () => fixture(async b => {
  await b.evaluate(`(async()=>{
    window.ui=createCodexInboxRowUI({document});document.getElementById('ui').append(ui.row);
    window.appearance={name:'alpha',label:'Alpha',color:'#ff0000',background:'#001122',letter:'A'};
    window.visual={title:'Same',selected:true,disabled:false,menuDisabled:false,workState:'working',foreignProfile:true,profileAppearance:appearance,settleAction:true,cancelSnoozeAction:false};
    ui.update(visual);ui.menu.focus();await drain();mo.observe(ui.row,{subtree:true,childList:true,attributes:true,characterData:true});reset();ui.update(visual);await drain();
    window.noop=records.length;window.identity=[ui.row,...ui.row.querySelectorAll('*')];
    appearance.color='#00ff00';appearance.background='#112233';appearance.letter='B';appearance.label='Beta';ui.update(visual);await drain();
  })()`)
  const changed=await b.evaluate(`({noop,color:ui.actions.querySelector('[data-codex-inbox-profile-glyph]').style.color,background:ui.actions.querySelector('[data-codex-inbox-profile-glyph]').style.background,letter:ui.actions.querySelector('[data-codex-inbox-profile-glyph]').textContent,label:ui.actions.querySelector('[data-codex-inbox-profile-slot]').title,focus:document.activeElement===ui.menu})`)
  assert.equal(changed.color,'rgb(0, 255, 0)');assert.equal(changed.background,'rgb(17, 34, 51)');assert.equal(changed.letter,'B');assert.equal(changed.label,'Beta');assert.equal(changed.focus,true)
  await b.evaluate(`(async()=>{reset();ui.update(visual);await drain();window.normalizedNoop=records.length;
    ui.go.title='drift';ui.label.firstChild.textContent='drift';ui.row.dataset.active='false';ui.row.classList.remove('bg-(--ui-row-active-background)');ui.row.dataset.workState='idle';ui.menu.querySelector('path').setAttribute('d','M0 0');ui.menu.disabled=true;
    ui.actions.querySelector('[data-codex-inbox-profile-glyph]').style.color='blue';ui.update(visual);await drain();})()`)
  assert.deepEqual(await b.evaluate(`({normalizedNoop,title:ui.go.title,text:ui.label.textContent,active:ui.row.dataset.active,selected:ui.row.classList.contains('bg-(--ui-row-active-background)'),work:ui.row.dataset.workState,enabled:!ui.menu.disabled,path:ui.menu.querySelector('path').getAttribute('d'),color:ui.actions.querySelector('[data-codex-inbox-profile-glyph]').style.color})`),{normalizedNoop:0,title:'Same',text:'Same',active:'true',selected:true,work:'working',enabled:true,path:'M3.5 8.5l3 3 6-7',color:'rgb(0, 255, 0)'})
  await b.evaluate(`(async()=>{appearance.name='default';ui.update(visual);await drain();window.home=ui.actions.querySelector('.codicon-home');reset();ui.update(visual);await drain();window.homeNoop=records.length;window.sameHome=home===ui.actions.querySelector('.codicon-home');ui.update({foreignProfile:false});window.hidden=ui.actions.querySelector('[data-codex-inbox-profile-slot]').hidden;})()`)
  assert.equal(await b.evaluate('sameHome&&hidden'),true)
  assert.equal(await b.evaluate('homeNoop'),0)
  assert.equal(changed.noop,0,'identical full UI updates do not touch any subtree')
}))

test('partial disabled ledgers and Cancel snooze retain priorities; generic menu stays accessible', () => fixture(async b => {
  await b.evaluate(`window.ui=createCodexInboxRowUI({document});document.getElementById('ui').append(ui.row);window.flags=()=>[ui.go.disabled,ui.menu.disabled,ui.clock.disabled,ui.clock.inert,ui.clock.tabIndex]`)
  const steps=[
    [{snoozeDisabled:true},[false,false,true,false,0]],
    [{title:'partial'},[false,false,true,false,0]],
    [{menuDisabled:true,disabled:true},[true,true,true,false,0]],
    [{disabled:false},[false,true,true,false,0]],
    [{snoozeDisabled:false},[false,true,false,false,0]],
    [{cancelSnoozeAction:true},[false,true,true,true,-1]],
    [{title:'still cancelled',snoozeDisabled:false},[false,true,true,true,-1]],
    [{cancelSnoozeAction:false},[false,true,false,false,0]],
    [{menuDisabled:false},[false,false,false,false,0]],
    [{disabled:true,snoozeDisabled:false},[true,true,true,false,0]],
    [{disabled:false},[false,false,false,false,0]]
  ]
  for(const [state,expected] of steps){await b.evaluate(`ui.update(${JSON.stringify(state)})`);assert.deepEqual(await b.evaluate('flags()'),expected,JSON.stringify(state))}
  await b.evaluate(`ui.menu.focus();ui.menu.setAttribute('aria-expanded','true');ui.update({title:'rename only'})`)
  assert.deepEqual(await b.evaluate(`({focus:document.activeElement===ui.menu,hasPopup:ui.menu.getAttribute('aria-haspopup'),expanded:ui.menu.getAttribute('aria-expanded')})`),{focus:true,hasPopup:'menu',expanded:'true'})
  for(const workState of ['needs-input','working','completed','idle','bad']){
    await b.evaluate(`ui.update({workState:${JSON.stringify(workState)},selected:${workState==='working'}})`)
    assert.equal(await b.evaluate('ui.row.dataset.workState'),workState==='bad'?'unknown':workState)
    assert.equal(await b.evaluate(`ui.lead.firstChild.hasAttribute('role')`),workState==='needs-input')
  }
  await b.evaluate(`ui.update({menuTitle:'Action tooltip',menuLabel:'Named action'});ui.update({title:'partial'})`)
  assert.deepEqual(await b.evaluate(`[ui.menu.title,ui.menu.getAttribute('aria-label')]`),['Action tooltip','Named action'])
  await b.evaluate(`ui.update({menuLabel:null})`)
  assert.equal(await b.evaluate(`ui.menu.getAttribute('aria-label')`),'Action tooltip')
}))

test('presentation cannot act, fresh metadata restores Snooze, and cron revocation removes the exact key', () => fixture(async b => {
  await b.evaluate(`(async()=>{
    window.session={id:'s',title:'Thread',source:'desktop',message_count:2,started_at:(Date.now()+60000)/1000};
    window.update=(extra={})=>runtime.update({scope,sessions:[session],liveSessions:[],liveStatusKnown:true,...extra});
    update({liveSessions:[{session_id:'s',status:'working'}]});update();await drain();window.stable=row('s');
    update({sessions:[],retainedSessions:[session]});await drain();window.savedBefore=JSON.stringify([...saved]);
    stable.querySelector('[data-codex-inbox-menu]').click();stable.querySelector('[data-codex-inbox-snooze]').click();stable.querySelector('[data-codex-inbox-open]').click();await drain();
  })()`)
  assert.deepEqual(await b.evaluate(`({same:row('s')===stable,disabled:stable.querySelector('[data-codex-inbox-snooze]').disabled,noAction:nav.length===0&&savedBefore===JSON.stringify([...saved])})`),{same:true,disabled:true,noAction:true})
  await b.evaluate(`(async()=>{update();await drain();stable.querySelector('[data-codex-inbox-snooze]').click();await drain()})()`)
  assert.equal(await b.evaluate(`row('s')===stable&&!stable.querySelector('[data-codex-inbox-snooze]').disabled&&!!document.querySelector('[data-codex-inbox-snooze-popup]')`),true)
  await b.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));update({sessions:[{...session,source:'cron'}]});drain()`)
  assert.equal(await b.evaluate(`!row('s')&&!runtime.admission.isEligible(scope,{...session,source:'cron'})`),true)
  assert.equal(await b.evaluate('api'),0)
  assert.deepEqual(await b.evaluate('errors'),[])
}))

for (const phase of ['loading','presentation']) test(`600 ${phase} rows: a title-only repaint never double-toggles disabled Snooze`, () => fixture(async b => {
  await b.evaluate(`(async()=>{
    window.sessions=Array.from({length:600},(_,i)=>({id:'s'+i,title:'Thread '+i,source:'desktop',message_count:2,started_at:(Date.now()+60000)/1000}));
    window.update=(extra={})=>runtime.update({scope,sessions,liveSessions:[],liveStatusKnown:true,...extra});
    update({liveSessions:sessions.map(s=>({session_id:s.id,status:'working'}))});update();await drain();
    window.phase=${JSON.stringify(phase)};window.paint=()=>update(phase==='loading'?{loading:true}:{sessions:[],retainedSessions:sessions});
    sessions=sessions.map((s,i)=>i===0?{...s,title:s.title+' prime'}:s);paint();await drain();
    window.stable=new Map(rows().map(r=>[r.dataset.codexInboxKey,r]));reset();
    sessions=sessions.map((s,i)=>i===0?{...s,title:s.title+' delta'}:s);paint();await drain();
  })()`)
  const actual=await b.evaluate(`({...sample(),count:rows().length,same:rows().every(r=>stable.get(r.dataset.codexInboxKey)===r),disabled:rows().every(r=>r.querySelector('[data-codex-inbox-snooze]').disabled),disabledWrites:records.filter(r=>r.attributeName==='disabled').length})`)
  console.log('RAW_DISABLED '+JSON.stringify({phase,mutations:actual.mutations,mutatedRows:actual.keys.length,disabledWrites:actual.disabledWrites,api:actual.api}))
  assert.equal(actual.count,600);assert.equal(actual.same,true);assert.equal(actual.disabled,true)
  assert.deepEqual(actual.keys,[JSON.stringify(['A','default','s0'])])
  assert.equal(actual.disabledWrites,0,'Snooze has one final writer, not false then true')
  assert.equal(actual.api,0);assert.deepEqual(actual.errors,[])
}))
