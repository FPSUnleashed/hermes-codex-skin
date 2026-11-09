import assert from 'node:assert/strict'
import test from 'node:test'
import { universalFixture } from './helpers/universal-fixture.mjs'

// Exercise the native scrolling box, not a fake scrollTop implementation. The
// forwarding accessor verifies restoration without post-mutation reads.
test('Inbox preserves native scroll and focus without redundant stable shell mutations', () => universalFixture(async browser => {
  const receipt = await browser.evaluate(`(async()=>{
    for(const fn of disposals.splice(0).reverse())fn();queryClient.clear();
    // Claim the skin style owner after teardown so its deferred retirement
    // cannot remove scoped layout styles during either isolated Inbox case.
    disposals.push(installChatStyleRuntime());
    const nativeScroll=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');
    const nativeMove=Element.prototype.moveBefore;
    const cases=[];
    try {
      for(const fallback of [false,true]) {
        if(fallback)Element.prototype.moveBefore=undefined;
        const frames=new Map();let serial=0;
        saved.set('inbox-state-v1',{version:1,records:{},aliases:{}});
        saved.set('inbox-admission-v2',{version:2,admitted:{},blocked:{}});
        const route=routes[0];
        const make=i=>({...metadata(route),id:'scroll-'+i,title:'Thread '+i,_lineage_root_id:'scroll-'+i,_lineage_ids:['scroll-'+i],last_active:1700000000+i});
        let sessions=Array.from({length:80},(_,i)=>make(i));
        const runtime=installCodexInboxRuntime({storage,host,window:{MutationObserver,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id),setTimeout:setTimeout.bind(window),clearTimeout:clearTimeout.bind(window)}});
        const paint=()=>{for(const [key,fn]of [...frames]){frames.delete(key);fn()}};
        const update=(extra={})=>{runtime.update({route,sessions,liveSessions:[],liveStatusKnown:true,routeAvailable:true,...extra});paint()};
        runtime.admission.observe(route,sessions,{workingSessions:sessions});update();
        const content=document.querySelector('[data-codex-inbox-owned="island"] [data-slot="sidebar-group-content"]');
        const header=document.querySelector('[data-codex-inbox-header]');
        const originalRows=new Map(rows().map(row=>[row.dataset.codexInboxRow,row]));
        const focused=originalRows.get('scroll-20').querySelector('[data-codex-inbox-open]');
        // Use actual overflow and scroll anchoring (default auto), and preserve
        // fractional offsets where the browser supports them.
        const overflow=content.scrollHeight>content.clientHeight&&content.clientHeight>0;
        let reads=0,writes=[];
        Object.defineProperty(content,'scrollTop',{configurable:true,get(){reads++;return nativeScroll.get.call(this)},set(value){writes.push(value);nativeScroll.set.call(this,value)}});
        const samples=[];
        const shell=new Set([header,content,...content.querySelectorAll('[data-codex-inbox-working-toggle], [data-codex-inbox-working-rows], [data-codex-inbox-snoozed-toggle], [data-codex-inbox-snoozed-rows]')]);
        const mutations=new MutationObserver(()=>{});mutations.observe(content.parentElement,{subtree:true,childList:true,attributes:true});
        const sample=async(label,mutate,{at=0,focus=focused}={})=>{
          focus.focus({preventScroll:true});nativeScroll.set.call(content,at);
          const before=nativeScroll.get.call(content);reads=0;writes=[];
          mutations.takeRecords();mutate();
          const immediate=nativeScroll.get.call(content),synchronousReads=reads,restores=[...writes];
          const shellMutations=mutations.takeRecords().filter(record=>shell.has(record.target)).map(record=>({type:record.type,attribute:record.attributeName,target:record.target.tagName}));
          const identity=[...originalRows].filter(([id])=>sessions.some(s=>s.id===id)).every(([id,node])=>document.querySelector('[data-codex-inbox-row="'+id+'"]')===node);
          const sameFocus=document.activeElement===focus;
          await new Promise(resolve=>requestAnimationFrame(resolve));
          const next=nativeScroll.get.call(content);
          samples.push({label,before,immediate,next,reads:synchronousReads,writes:restores,identity,sameFocus,shellMutations});
        };
        await sample('top metadata',()=>{sessions=sessions.map(s=>({...s,title:s.title+' changed'}));update()});
        await sample('top insertion and reorder',()=>{const first=make(80);runtime.admission.observe(route,[first],{workingSessions:[first]});sessions=[first,...sessions].reverse();update()});
        await sample('scrolled metadata',()=>{sessions=sessions.map(s=>({...s,title:s.title+' again'}));update()},{at:137.5});
        await sample('scrolled reorder',()=>{sessions=[...sessions].reverse();update()},{at:241.5});
        await sample('top working transfer',()=>update({liveSessions:[{id:'R',session_key:'scroll-0',status:'working'}]}));
        const working=document.querySelector('[data-codex-inbox-working-rows]');
        const workingIdentity=working.contains(originalRows.get('scroll-0'));
        // Collapse and expand use the same content owner and header. Both must
        // remain at the origin without an asynchronous compensating jump.
        await sample('top collapse',()=>{header.click();paint()},{focus:header});
        await sample('top expand',()=>{header.click();paint()},{focus:header});
        const contentIdentity=content===document.querySelector('[data-codex-inbox-owned="island"] [data-slot="sidebar-group-content"]');
        // A pending retained row keeps its node but must not borrow actions.
        const retained=sessions.find(s=>s.id==='scroll-20');
        sessions=sessions.filter(s=>s!==retained);
        await sample('top retained row',()=>update({retainedSessions:[retained],loading:true}));
        const beforeSave=JSON.stringify([...saved]),beforeNav=nav.length;
        focused.click();originalRows.get('scroll-20').querySelector('[data-codex-inbox-settle]').click();
        const gated=beforeSave===JSON.stringify([...saved])&&beforeNav===nav.length&&originalRows.get('scroll-20').isConnected;
        cases.push({fallback,overflow,workingIdentity,contentIdentity,gated,samples});
        mutations.disconnect();runtime.dispose();
      }
    } finally { Element.prototype.moveBefore=nativeMove; }
    return {cases,errors};
  })()`)
  console.log('INBOX_SCROLL_RECEIPT '+JSON.stringify(receipt))
  assert.deepEqual(receipt.errors, [])
  assert.equal(receipt.cases.length, 2)
  for (const scenario of receipt.cases) {
    assert.equal(scenario.overflow, true, 'native scrolling box must really overflow')
    assert.equal(scenario.workingIdentity, true)
    assert.equal(scenario.contentIdentity, true)
    assert.equal(scenario.gated, true, 'retained pending rows cannot open or settle')
    for (const sample of scenario.samples) {
      assert.equal(sample.immediate, sample.before, sample.label+': synchronous restoration')
      assert.equal(sample.next, sample.before, sample.label+': no next-frame jump')
      assert.equal(sample.identity, true, sample.label+': row identity')
      assert.equal(sample.sameFocus, true, sample.label+': focus identity')
      assert.equal(sample.reads, 1, sample.label+': no post-mutation scroll read')
    }
  }
  // Keep the complete native scroll/focus matrix before the cost contract.
  for (const scenario of receipt.cases) for (const sample of scenario.samples) {
    assert.deepEqual(sample.writes, [sample.before], sample.label+': preserve zero and nonzero synchronous native restoration')
  }
  // Title-only projections do not change scaffold content or shelf state. They
  // must not replace unchanged labels or rewrite unchanged shell attributes.
  for (const scenario of receipt.cases) for (const sample of scenario.samples.filter(s => s.label.endsWith('metadata'))) {
    assert.deepEqual(sample.shellMutations, [], sample.label+': stable shell must not invalidate layout')
  }
}))
