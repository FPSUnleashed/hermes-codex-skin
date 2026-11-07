import assert from 'node:assert/strict'
import test from 'node:test'
import {railFixture} from './helpers/history-rail-pure.mjs'

const sourcePath=process.env.CODEX_RAIL_SOURCE
for(const count of [48,240,1000])test(`non-Mac shipping painter stress ${count}: discrete coefficients, distant no-op, cached preview`,()=>{
 const f=railFixture({count,sourcePath});f.over(2)
 const scale=i=>f.buttons[i].firstElementChild.style.getPropertyValue('--codex-history-scale')||'0.333'
 f.stats.writes.length=0;const before={queries:f.stats.queries,fragments:f.stats.fragments,geometry:f.stats.geometry}
 for(let i=0;i<60;i++)f.move(2,117.5+Math.sin(i)*0.5)
 const stableWrites=f.stats.writes.length
 console.log(JSON.stringify({case:'non-Mac stable operation counts',mounted:count,samples:60,presentationWrites:stableWrites}))
 assert.equal(f.stats.writes.length,0,'same discrete target has no presentation writes, including distant bars')
 assert.deepEqual({queries:f.stats.queries,fragments:f.stats.fragments,geometry:f.stats.geometry},before,'no transcript reads, preview rebuild or geometry on stable pointer samples')
 assert.deepEqual([0,1,2,3,4,5].map(scale),['0.417','0.667','1','0.667','0.417','0.333'])
 f.over(3);assert.equal(scale(3),'1');assert.equal(scale(0),'0.333')
 const painterWrites=f.stats.writes.filter(w=>w.node.getAttribute('data-slot')==='timeline-bar')
 assert.ok(painterWrites.every(w=>w.name==='--codex-history-scale'),'painter writes transforms only')
 assert.ok(painterWrites.length<=7,'only changed neighborhood gets writes')
 assert.ok(painterWrites.every(w=>Number(w.node.parentElement.getAttribute('data-timeline-index'))<=5),'distant bars remain untouched')
 console.log(JSON.stringify({case:'non-Mac changed-target operation counts',mounted:count,painterWrites:painterWrites.length}))
 f.runtimeRail.cleanup();assert.equal(f.frames.size,0);assert.equal(f.subscriptions.length,0)
 for(const b of f.buttons)assert.equal(b.firstElementChild.style.getPropertyValue('--codex-history-scale'),'')
})

test('slice from GLOBAL 40: duplicated labels resolve by native identity, never mounted ordinal',()=>{
 const f=railFixture({count:8,start:40,total:100,duplicate:true,sourcePath})
 f.strip.scrollTop=280
 // The viewport and rail are independently virtualized, not equal-length slices.
 f.users[0].closest('[data-slot="aui_turn-pair"]').remove()
 f.users.at(-1).closest('[data-slot="aui_turn-pair"]').remove();f.over(2)
 assert.match(f.card().textContent,/RepeatedAnswer 42/)
 assert.doesNotMatch(f.card().textContent,/Answer 40|Answer 47/)
 assert.equal(f.buttons[2].getAttribute('data-timeline-index'),'42')
 assert.equal(f.strip.scrollTop,280,'hover never scrolls the independent native tick window')
 assert.deepEqual(f.buttons.slice(0,6).map(b=>b.firstElementChild.style.getPropertyValue('--codex-history-scale')||'0.333'),['0.417','0.667','1','0.667','0.417','0.333'])
 f.runtimeRail.cleanup()
})

test('lazy RPC slice from 40: global index and identity verification, stale response/session and cleanup',async()=>{
 const f=railFixture({count:8,start:40,total:100,duplicate:true,workspace:true,sourcePath});f.content.replaceChildren();f.over(2);await f.settle()
 assert.equal(f.stats.requests.length,1);f.pending.shift()({messages:f.history()});await f.settle()
 assert.match(f.card().textContent,/RPC answer 42/)
 f.over(3);await f.settle();assert.match(f.card().textContent,/RPC answer 43/);assert.equal(f.stats.requests.length,1)
 f.setRuntime('runtime-b');f.invalidate();f.over(4);await f.settle();assert.equal(f.stats.requests.length,2)
 f.setRuntime('runtime-c');f.pending.shift()({messages:f.history()});await f.settle();assert.doesNotMatch(f.card().textContent,/RPC answer/)
 f.invalidate();f.over(4);await f.settle();f.pending.shift()({messages:f.history().slice(2)});await f.settle()
 assert.doesNotMatch(f.card().textContent,/RPC answer/,'identity/global-index disagreement is fail closed despite repeated labels')
 f.invalidate();f.over(4);await f.settle();const delayed=f.pending.shift();f.runtimeRail.cleanup();delayed({messages:f.history()});await f.settle()
 assert.equal(f.surface.querySelector('[data-codex-history-preview]'),null)
})

test('pane/size/slice/content invalidation and native click/End ownership seams',()=>{
 const f=railFixture({count:8,start:40,total:100,sourcePath});let click=0,key=0
 f.buttons[2].addEventListener('click',()=>click++)
 f.strip.addEventListener('keydown',e=>{if(e.key==='End'){key++;f.buttons.at(-1).focus()}})
 f.over(2);f.buttons[2].dispatch('click');assert.equal(click,1)
 f.buttons[2].dispatch('keydown',{key:'End'});f.flush();assert.equal(key,1);assert.equal(f.doc.activeElement,f.buttons.at(-1));assert.match(f.card().textContent,/Answer 47/)
 const resize=f.observers.find(o=>o.target===f.surface)
 resize.fn([{contentRect:{height:700}}]);assert.equal(f.card().hidden,false,'identical geometry must retain the preview')
 // The seam has no layout engine: change measured geometry as well as the notification.
 const surfaceRect=f.surface.getBoundingClientRect.bind(f.surface)
 f.surface.getBoundingClientRect=()=>({...surfaceRect(),height:500})
 resize.fn([{contentRect:{height:500}}]);assert.equal(f.card().hidden,true)
 f.over(2);f.strip.dispatch('scroll');assert.equal(f.card().hidden,true)
 f.over(2);f.buttons[2].setAttribute('data-timeline-id','foreign');f.records([{type:'attributes',target:f.buttons[2],attributeName:'data-timeline-id'}]);assert.equal(f.card().hidden,true)
 f.buttons[2].setAttribute('data-timeline-id','history:1042');f.records([{type:'attributes',target:f.buttons[2],attributeName:'data-timeline-id'}]);f.over(2)
 f.users[2].closest('[data-slot="aui_turn-pair"]').querySelector('.aui-md').firstElementChild.textContent='Changed answer 42'
 f.mutate();f.flush();assert.match(f.card().textContent,/Changed answer 42/)
 f.surface.setAttribute('data-session-anchor','session-tile:b');f.records([{type:'attributes',target:f.surface,attributeName:'data-session-anchor'}]);assert.equal(f.card().hidden,true)
 f.runtimeRail.cleanup();assert.ok(f.observers.every(o=>!o.connected));assert.equal(f.root.listeners.get('pointermove').length,0)
})

test('frames coalesce, duplicate/missing identities fail closed and async pane changes cannot fill',async()=>{
 const f=railFixture({count:8,start:40,total:100,workspace:true,duplicate:true,sourcePath})
 f.over(2);f.stats.writes.length=0
 for(let i=0;i<25;i++)f.buttons[3].dispatch('mouseover',{clientY:500})
 assert.equal(f.frames.size,1);f.flush()
 assert.equal(f.buttons[3].firstElementChild.style.getPropertyValue('--codex-history-scale'),'1')
 f.content.replaceChildren();f.mutate();await f.settle()
 const duplicate=f.history();duplicate[0].row_id=1043;f.pending.shift()({messages:duplicate});await f.settle()
 assert.doesNotMatch(f.card().textContent,/RPC answer/,'globally duplicated IDs are ambiguous even outside the mounted slice')
 f.invalidate();f.over(2);await f.settle()
 const resolve=f.pending.shift();f.surface.setAttribute('data-session-anchor','session-tile:foreign');resolve({messages:f.history()});await f.settle()
 assert.doesNotMatch(f.card().textContent,/RPC answer/,'pane guard holds even before mutation delivery')
 f.runtimeRail.cleanup()
})
