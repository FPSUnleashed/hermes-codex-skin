import assert from 'node:assert/strict'
import test from 'node:test'
import {writeFile} from 'node:fs/promises'
import {chromium,waitForRendered} from './helpers/chromium.mjs'
import {fixture,click} from './r3-ui-native-fixture.mjs'

const parts=[['image','<img alt="Late preview" width="20" height="20">'],['audio','<audio controls></audio>'],['video','<video controls width="80" height="40"></video>'],['frame','<iframe title="Late preview"></iframe>'],['alert','<div role="alert">Native alert</div>'],['approval','<div data-slot="tool-approval-inline"><button>Approve</button></div>'],['clarify','<div data-slot="clarify-inline"><input aria-label="Clarify"></div>'],['setup','<div data-slot="mcp-setup-inline"><button>Setup</button></div>'],['artifact','<div data-slot="aui_artifact-card"><button>Open artifact</button></div>'],['generated','<div data-slot="aui_generated-image">Generated image</div>'],['markdown-alert','<div data-slot="aui_markdown-alert">Alert</div>'],['zoomable','<div data-slot="aui_zoomable-image">Preview</div>'],['failure','<span class="text-destructive">Failed</span>']]

test('R3-05 completed native tool blocks fail open synchronously before observer delivery, refold and retain actions',async()=>{
 const b=await chromium()
 try{
  await fixture(b,900)
  await b.evaluate(`change(c=>{c.roots[0].live=false;c.roots[0].parts.forEach(p=>p.result='done');c.roots[0].prose='Final answer';c.live=false;return c});fixtureState.busy.set(false);fixtureState.busyBySession.set({runtime:false})`)
  await waitForRendered(b,`pair.dataset.codexActivityPhase==='completed'&&!!pair.querySelector('[data-tool-group][data-codex-activity-item="collapsed"]')`,'completed native group is folded',4000)
  const results=await b.evaluate(`(()=>{
   window.group=pair.querySelector('[data-tool-group]');window.groupParent=group.parentNode;window.calls=0;
   window.visible=node=>{for(let n=node;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.clipPath==='inset(50%)')return false}return node.getBoundingClientRect().height>0};
   const before=!visible(group),cases=[];const markers=()=>[group,...group.querySelectorAll('[data-codex-activity-item]')].map(n=>n.getAttribute('data-codex-activity-item'));
   for(const [id,html] of ${JSON.stringify(parts)}){
    const wrapper=document.createElement('div');wrapper.innerHTML=html;const node=wrapper.firstElementChild;const markerBefore=markers();group.append(wrapper);
    const immediate=visible(node),outerDisplay=getComputedStyle(group).display,unchanged=JSON.stringify(markerBefore)===JSON.stringify(markers());
    const action=node.matches('button,input')?node:node.querySelector('button,input');let focused=null;
    if(action){action.onclick=()=>calls++;action.focus();focused=document.activeElement===action;action.click()}
    wrapper.remove();const removed=!visible(group);group.append(wrapper);const reinserted=visible(node);wrapper.remove();
    cases.push({id,immediate,outerDisplay,unchanged,focused,removed,reinserted});
   }
   return{before,cases,calls,nativeClicks,identity:group===pair.querySelector('[data-tool-group]')&&group.parentNode===groupParent,latest:visible(pair.querySelector('.aui-md'))};
  })()`)
  console.log('R3_05_SYNCHRONOUS',JSON.stringify(results))
  if(process.env.UI_EVIDENCE_RUN)await writeFile(process.env.UI_EVIDENCE_RUN+'/r3-05.json',JSON.stringify(results,null,2))
  assert.equal(results.before,true)
  assert.ok(results.cases.every(c=>c.unchanged),'all immediate reads occur before observer delivery')
  assert.equal(results.identity,true);assert.equal(results.latest,true);assert.equal(results.nativeClicks,0)
  assert.equal(results.calls,4,'late action handlers survive insertion/removal with no passive native clicks')
  assert.ok(results.cases.every(c=>c.immediate&&c.reinserted&&c.removed&&c.focused!==false),'late protected descendants must be accessible before idle reconciliation: '+JSON.stringify(results.cases))
  await b.evaluate(`window.late=document.createElement('button');late.dataset.slot='tool-approval-inline';late.textContent='Required approval';late.onclick=()=>calls++;group.append(late)`)
  await waitForRendered(b,`!group.hasAttribute('data-codex-activity-item')&&visible(late)`,'existing observer removes stale outer fold')
  await b.evaluate(`late.focus()`)
  await click(b,'[data-slot="tool-approval-inline"]')
  assert.equal(await b.evaluate(`document.activeElement===late&&late.parentNode===group&&calls===5`),true)
  const ax=await b.call('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>!n.ignored&&n.role?.value==='button'&&n.name?.value==='Required approval'))
  await b.evaluate(`late.remove()`)
  await waitForRendered(b,`group.dataset.codexActivityItem==='collapsed'&&!visible(group)`,'observer restores ordinary fold after removal')
  await click(b,'[data-codex-turn-activity]')
  assert.equal(await b.evaluate(`visible(group)&&visible(pair.querySelector('.aui-md'))`),true)
  await click(b,'[data-codex-turn-activity]')
  assert.equal(await b.evaluate(`!visible(group)&&visible(pair.querySelector('.aui-md'))`),true)
  await b.evaluate(`stopSkin()`)
  await waitForRendered(b,`!group.hasAttribute('data-codex-activity-item')`,'existing hot-reload handoff clears outer fold')
  assert.equal(await b.evaluate(`visible(group)&&group.parentNode===groupParent`),true)
 }finally{b.close()}
})
