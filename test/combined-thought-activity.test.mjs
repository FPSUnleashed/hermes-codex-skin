import assert from 'node:assert/strict'
import test from 'node:test'
import {fixture,part,wait,click} from './helpers/native-thought.mjs'

const label = `header()?.querySelector('[data-codex-tool-sequence-label]')?.textContent`

test('combined native Thought live alone -> tool -> quiet gap -> Thought -> prose -> settled preserves order and identity',async()=>{
 const b=await fixture([part('first','thought',{live:true,text:'PRIVATE_REASONING_BODY'})],{live:true})
 try {
  await wait(b,`${label}==='Thinking'`)
  assert.equal(await b.evaluate(`header().closest('[data-codex-tool-sequence]').getAttribute('data-codex-tool-sequence-glyph')==='brain'&&!header().textContent.includes('PRIVATE_REASONING_BODY')&&!header().textContent.includes('3s')&&el('first').querySelector('[role="status"]')!==null&&!vis('first')`),true)
  await b.evaluate(`window.savedHeader=header();window.first=el('first');window.firstButton=first.querySelector('button');window.firstBody=first.querySelector('[data-slot="aui_thinking-body"]');window.firstParent=first.parentNode;change(c=>{c[0].parts[0].live=false;c[0].parts.push({id:'tool',type:'tool',running:true,label:'Running command'});return c})`)
  await wait(b,`${label}==='Running command'`)
  assert.equal(await b.evaluate(`header()===savedHeader`),true)
  await b.evaluate(`change(c=>{c[0].parts[1].running=false;c[0].parts[1].label='Ran command';return c})`)
  await wait(b,`${label}==='Ran command'`)
  await b.evaluate(`new Promise(r=>setTimeout(r,100))`)
  assert.equal(await b.evaluate(`${label}`),'Ran command','quiet gap retains the last verified tool')
  await b.evaluate(`change(c=>{c[0].parts.push({id:'second',type:'thought',live:true,text:'SECOND_REASONING_BODY'});return c})`)
  await wait(b,`${label}==='Thinking'`)
  assert.equal(await b.evaluate(`header()===savedHeader&&header().closest('[data-codex-tool-sequence]').hasAttribute('data-codex-activity-running')&&header().querySelector('[data-codex-activity-sweep]')!==null`),true)
  await click(b,'[data-codex-tool-sequence] button')
  assert.deepEqual(await b.evaluate(`[...firstParent.children].filter(n=>n.id).map(n=>n.id)`),['first','tool','second'])
  assert.equal(await b.evaluate(`el('first')===first&&first.querySelector('button')===firstButton&&first.querySelector('[data-slot="aui_thinking-body"]')===firstBody&&first.parentNode===firstParent&&vis('first')&&vis('tool')&&vis('second')&&nativeClicks===0`),true)
  await click(b,'#tool button');await wait(b,`el('tool').querySelector('pre')`)
  assert.equal(await b.evaluate(`nativeClicks`),1)
  await b.evaluate(`change(c=>{c[0].parts[2].live=false;c[0].parts.push({id:'prose',type:'prose',text:'New assistant prose'});return c})`)
  await wait(b,`${label}==='Ran command'&&vis('prose')`)
  await b.evaluate(`change(c=>{c[0].parts.push({id:'third',type:'thought',live:true});return c})`)
  await wait(b,`document.querySelectorAll('[data-codex-tool-sequence]').length===2`)
  assert.equal(await b.evaluate(`el('prose').nextElementSibling.hasAttribute('data-codex-tool-sequence')&&vis('prose')`),true)
  await b.evaluate(`change(c=>{c[0].live=false;c[0].parts[4].live=false;return c})`)
  await wait(b,`document.querySelectorAll('[data-codex-tool-sequence]').length===1&&vis('third')`)
  assert.equal(await b.evaluate(`first===el('first')&&firstButton===first.querySelector('button')&&firstBody===first.querySelector('[data-slot="aui_thinking-body"]')&&header()===savedHeader&&nativeClicks===1&&vis('prose')`),true)
 } finally {b.close()}
})

test('running Thought face shares canonical Brain geometry, moves only the highlight and reconciles with ZERO mutations',async()=>{
 const b=await fixture([part('thought','thought',{live:true})],{live:true})
 try {
  await wait(b,`${label}==='Thinking'`)
  const state=await b.evaluate(`(()=>{const h=header(),icon=h.querySelector('[data-codex-activity-icon]'),native=el('thought').querySelector('button'),s=getComputedStyle(icon),n=getComputedStyle(native,'::before');return{face:s.maskImage,native:n.maskImage,thinking:mask(el('thinking-reference')),width:s.width,height:s.height,nativeSize:n.maskSize,aria:h.querySelector('[data-codex-activity-face]').getAttribute('aria-hidden'),pointer:getComputedStyle(h.querySelector('[data-codex-activity-face]')).pointerEvents}})()`)
  assert.equal(state.face,state.native);assert.equal(state.face,state.thinking)
  assert.deepEqual([state.width,state.height,state.nativeSize,state.aria,state.pointer],['16px','16px','16px 16px','true','none'])
  const phases=await b.evaluate(`(()=>{const f=header().querySelector('[data-codex-activity-face]'),base=f.firstElementChild,sweep=f.querySelector('[data-codex-activity-sweep]');return[0,550,1100,1650].map(t=>{for(const a of f.getAnimations({subtree:true})){a.pause();a.currentTime=t}const r=base.getBoundingClientRect();return{rect:[r.x,r.y,r.width,r.height],transform:getComputedStyle(sweep).transform,counter:getComputedStyle(sweep.firstElementChild).transform}})})()`)
  assert.ok(new Set(phases.map(p=>p.transform)).size>2);assert.ok(new Set(phases.map(p=>p.counter)).size>2)
  assert.ok(phases.every(p=>JSON.stringify(p.rect)===JSON.stringify(phases[0].rect)))
  const mutations=await b.evaluate(`(()=>{stopRuntime();const r=makeSequenceRuntime();r.reconcile(el('pair'),'measure');const o=new MutationObserver(()=>{});o.observe(el('pair'),{subtree:true,attributes:true,characterData:true,childList:true});for(let i=0;i<20;i++)r.reconcile(el('pair'),'measure');const n=o.takeRecords().length;o.disconnect();r.cleanup();return n})()`)
  console.log('COMBINED_THOUGHT_NOOP_MUTATIONS '+mutations);assert.equal(mutations,0)
 } finally {b.close()}
})

test('first text in a later empty native Thought becomes current, then settles without leaking its private body',async()=>{
 const b=await fixture([part('tool','tool',{label:'Completed native tool'}),part('empty','thought',{text:'',live:true}),part('disabled','thought',{enabled:false,live:true})],{live:true})
 try {
  await wait(b,`${label}==='Completed native tool'`)
  assert.equal(await b.evaluate(`!el('empty')&&!el('disabled')&&!document.querySelector('[data-slot="aui_thinking-disclosure"]')&&!header().querySelector('[data-codex-activity-sweep]')`),true)
  await b.evaluate(`window.savedTool=el('tool');window.savedToolButton=savedTool.querySelector('button');window.savedToolParent=savedTool.parentNode;change(c=>{c[0].parts[1].text='PRIVATE_LATER_REASONING_BODY';return c})`)
  await wait(b,`${label}==='Thinking'&&header()?.querySelector('[data-codex-activity-sweep]')`)
  assert.equal(await b.evaluate(`el('empty').querySelector('[role="status"]')!==null&&header().closest('[data-codex-tool-sequence]').hasAttribute('data-codex-activity-running')&&!header().textContent.includes('PRIVATE_LATER_REASONING_BODY')&&!el('disabled')&&savedTool===el('tool')&&savedToolButton===savedTool.querySelector('button')&&savedToolParent===savedTool.parentNode&&nativeClicks===0`),true)
  await b.evaluate(`window.savedThought=el('empty');window.savedThoughtButton=savedThought.querySelector('button');window.savedThoughtBody=savedThought.querySelector('[data-slot="aui_thinking-body"]');change(c=>{c[0].parts[1].live=false;return c})`)
  await wait(b,`${label}==='Thought'&&!header()?.querySelector('[data-codex-activity-sweep]')`)
  assert.equal(await b.evaluate(`!header().closest('[data-codex-tool-sequence]').hasAttribute('data-codex-activity-running')&&getComputedStyle(header().querySelector('[data-codex-tool-sequence-label]')).animationName==='none'&&!header().textContent.includes('PRIVATE_LATER_REASONING_BODY')&&savedThought===el('empty')&&savedThoughtButton===savedThought.querySelector('button')&&savedThoughtBody===savedThought.querySelector('[data-slot="aui_thinking-body"]')&&nativeClicks===0`),true)
 } finally {b.close()}
})

test('native absent/empty/disabled reasoning stays absent, and ending Thought shimmer follows its own compact label',async()=>{
 const b=await fixture([part('empty','thought',{text:'',live:true}),part('disabled','thought',{enabled:false,live:true}),part('tool','tool',{label:'Actual native tool'})],{live:true})
 try {
  await wait(b,`${label}==='Actual native tool'`)
  assert.equal(await b.evaluate(`!el('empty')&&!el('disabled')&&!document.querySelector('[data-slot="aui_thinking-disclosure"]')&&!header().closest('[data-codex-tool-sequence]').querySelector('[data-codex-activity-sweep]')`),true)
  await b.evaluate(`change(c=>{c[0].parts[0].text='Actual visible reasoning';return c})`)
  await wait(b,`${label}==='Actual native tool'`)
  await b.evaluate(`change(c=>{c[0].parts[0].live=false;return c})`)
  await wait(b,`${label}==='Actual native tool'`)
  await b.evaluate(`change(c=>{c[0].parts.push({id:'finished',type:'thought'});return c})`)
  await wait(b,`${label}==='Thought'`)
  assert.equal(await b.evaluate(`!header().closest('[data-codex-tool-sequence]').hasAttribute('data-codex-activity-running')&&!header().querySelector('[data-codex-activity-sweep]')&&getComputedStyle(header().querySelector('[data-codex-tool-sequence-label]')).animationName==='none'`),true,'a mounted timer or body does not imply running')
 } finally {b.close()}
})
