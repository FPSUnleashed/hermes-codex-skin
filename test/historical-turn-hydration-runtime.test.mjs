import assert from 'node:assert/strict'
import test from 'node:test'
import { actions, message, transcriptFixture } from './helpers/transcript-activity-fixture.mjs'

// Exercise the shipping observer, not the retired clean-transcript functions.
// Earlier plain replies fold by approved display policy, never by deletion.
// Preserve native controls, protected output and the separate scan budget.
test('historical wrappers reconcile source-identified interim text incrementally and preserve delivered finals', async () => {
  const result = await transcriptFixture(`
    <section data-session-anchor="workspace"><div data-slot="aui_thread-content" id="thread">
      <div class="historical-turn-row" id="historical-wrapper"><div class="virtualizer-spacer"></div>
        <div data-slot="aui_turn-pair" id="historical-pair">
          <div data-role="user" data-message-id="historical-user">Old prompt</div>
          <div data-slot="aui_response-group">
            ${message('100-0-assistant', '<div class="aui-md" id="interim">Old intermediate message</div><div data-slot="tool-block" id="work"><details><summary>Read file</summary><pre>Native output</pre></details></div>')}
            ${message('artifact-root', '<div class="aui-md" id="artifact"><div data-slot="aui_artifact-card">Artifact</div></div>')}
            ${message('200-1-assistant', '<span data-slot="timeline-timestamp" id="final-timestamp">12:01</span><div class="aui-md" id="final">Old final answer</div>', actions)}
          </div>
        </div>
      </div><div id="unrelated"><span>ordinary node</span></div>
    </div></section>
    <div data-slot="sidebar"><div id="sidebar-wrapper"><div data-slot="aui_turn-pair"></div></div></div>
  `, `
    const atom = value => ({get:()=>value,subscribe:()=>()=>{}});
    window.location.hash = '#/stored';
    Object.assign(host, {
      state:{connectionId:atom('local'),profile:atom('default'),activeSessionId:atom('runtime'),focusedSessionId:atom('runtime'),focusedStoredSessionId:atom('stored'),focusedSessionOwner:atom({connectionId:'local',profile:'default'}),gateway:atom('open')},
      request:async()=>({messages:[{role:'assistant',timestamp:100,tool_calls:[{id:'call'}]},{role:'assistant',timestamp:200,content:'Old final answer'}]}),
      onEvent:()=>()=>{},
    });
    const until = async predicate => {
      const end = performance.now()+3000;
      while(!predicate()) {if(performance.now()>end)throw Error('Historical observer timed out');await new Promise(resolve=>setTimeout(resolve,15))}
    };
    const originalFinal = element('final'), originalCopy = element('200-1-assistant').querySelector('button');
    const wrapper = element('historical-wrapper');
    const collected = collectNestedTurnPairs(wrapper).map(pair=>pair.id);
    const boundaries = isTurnPairMutationRoot(wrapper) && isTurnPairMutationRoot(element('historical-pair'))
      && !isTurnPairMutationRoot(element('unrelated')) && !isTurnPairMutationRoot(element('sidebar-wrapper'))
      && collectNestedTurnPairs(element('sidebar-wrapper')).length===0;
    const stop = installBehaviorRuntime();
    const originalQuery = document.querySelectorAll;
    let globalPairScans = 0;
    try {
      await until(()=>element('historical-pair').dataset.codexActivityPhase==='completed' && !visible('interim'));
      const initial = {interim:visible('interim'),work:visible('work'),artifact:visible('artifact'),final:visible('final'),timestamp:visible('final-timestamp')};
      document.querySelectorAll = function(selector) {
        if(selector.includes('aui_turn-pair')) globalPairScans++;
        return originalQuery.call(this,selector);
      };
      element('historical-pair').querySelector('[data-slot="aui_response-group"]').insertAdjacentHTML('beforeend', ${JSON.stringify(message('300-2-assistant', '<span data-slot="timeline-timestamp" id="late-timestamp">12:02</span><div class="aui-md" id="late">Late authoritative answer</div>', actions))});
      await new Promise(resolve=>setTimeout(resolve,150));
      const after = {oldFinal:visible('final'),oldTimestamp:visible('final-timestamp'),late:visible('late'),lateTimestamp:visible('late-timestamp'),artifact:visible('artifact'),interim:visible('interim'),work:visible('work')};
      const identity = element('final')===originalFinal && element('200-1-assistant').querySelector('button')===originalCopy;
      header('historical-pair').click();
      const reopened = visible('final') && visible('late') && visible('work') && element('final')===originalFinal;
      header('historical-pair').click();
      const lateAdmitted = isCleanPartMutationNode(element('late'));
      document.querySelectorAll = originalQuery;
      stop();
      await until(()=>header('historical-pair')===null);
      return {collected,boundaries,initial,after,identity,reopened,lateAdmitted,globalPairScans,cleanup:visible('interim')&&visible('work')&&visible('final')&&visible('late')};
    } finally {document.querySelectorAll=originalQuery;stop()}
  `)
  assert.equal(result.globalPairScans,0,'incremental historical hydration does not scan the document')
  assert.deepEqual(result, {
    collected:['historical-pair'], boundaries:true,
    initial:{interim:false,work:false,artifact:true,final:true,timestamp:true},
    after:{oldFinal:false,oldTimestamp:true,late:true,lateTimestamp:true,artifact:true,interim:false,work:false},
    identity:true,reopened:true,lateAdmitted:true,globalPairScans:0,cleanup:true,
  })
})
