import assert from 'node:assert/strict'
import test from 'node:test'
import {fixture,part,wait} from './helpers/native-thought.mjs'

const label = `header()?.querySelector('[data-codex-tool-sequence-label]')?.textContent`
const title = `el('thought').querySelector(':scope > [class~="group/disclosure-row"] > button > span:first-child > span > span')`

// Cross the real scheduling boundary so an initial queued projection cannot
// accidentally repair a later, otherwise unobserved native edit.
async function drainInitialProjection(b) {
  await b.evaluate(`(async()=>{for(let i=0;i<2;i++)await new Promise(resolve=>requestAnimationFrame(()=>requestIdleCallback(()=>resolve(),{timeout:800})))})()`)
}

async function observedAfterMutation(b, predicate) {
  try {
    await wait(b, predicate)
    return true
  } catch (error) {
    const before = await b.evaluate(`({header:header()?.outerHTML,thought:el('thought')?.outerHTML})`)
    await b.evaluate(`window.dispatchEvent(new Event('resize'))`)
    let afterResize = false
    try { await wait(b, predicate); afterResize = true } catch {}
    console.log('NATIVE_WAKEUP_FAILURE ' + JSON.stringify({predicate,afterResize,before}))
    return false
  }
}

test('unknown Thought child insertion and removal revoke then restore the verified group without resize',async()=>{
  const b=await fixture([part('thought','thought',{live:true}),part('t','tool')],{live:true})
  try {
    await wait(b,`${label}==='Native command'`)
    await b.evaluate(`window.original=el('thought');original.append(Object.assign(document.createElement('div'),{id:'unknown-child',textContent:'Unknown native child'}))`)
    assert.equal(await observedAfterMutation(b,`!header()&&vis('thought')&&vis('t')`),true,'unknown topology invalidates immediately')
    await drainInitialProjection(b)
    await b.evaluate(`el('unknown-child').remove()`)
    assert.equal(await observedAfterMutation(b,`${label}==='Native command'`),true,'removal restores grouping without an unrelated wakeup')
    assert.equal(await b.evaluate(`original===el('thought')`),true)
  } finally { b.close() }
})

test('native Thought shimmer-only changes stop and restart the active sweep without resize',async()=>{
  const b=await fixture([part('thought','thought',{live:true})],{live:true})
  try {
    await wait(b,`${label}==='Thinking'&&header()?.querySelector('[data-codex-activity-sweep]')`)
    await drainInitialProjection(b)
    await b.evaluate(`${title}.classList.remove('shimmer')`)
    assert.equal(await observedAfterMutation(b,`header()&&!header().querySelector('[data-codex-activity-sweep]')`),true,'class-only native completion is observed')
    await b.evaluate(`${title}.classList.add('shimmer')`)
    assert.equal(await observedAfterMutation(b,`!!header()?.querySelector('[data-codex-activity-sweep]')`),true,'class-only native restart is observed')
  } finally { b.close() }
})

test('native compact Thought label characterData updates refresh the current face without resize',async()=>{
  const b=await fixture([part('thought','thought',{live:true})],{live:true})
  try {
    await wait(b,`${label}==='Thinking'`)
    await drainInitialProjection(b)
    await b.evaluate(`window.originalLabel=${title};originalLabel.firstChild.nodeValue='Updated native thought'`)
    assert.equal(await observedAfterMutation(b,`${label}==='Updated native thought'`),true,'React text-node updates reach the current face')
    assert.equal(await b.evaluate(`${title}===originalLabel`),true)
  } finally { b.close() }
})

test('native compact tool label characterData updates refresh the current face without resize',async()=>{
  const b=await fixture([part('t','tool',{running:true,label:'Reading native file'})],{live:true})
  try {
    await wait(b,`${label}==='Reading native file'`)
    await drainInitialProjection(b)
    await b.evaluate(`const cells=el('t').querySelector('button > span:first-child > span');window.originalLabel=cells.children[1];originalLabel.firstChild.nodeValue='Read native file'`)
    assert.equal(await observedAfterMutation(b,`${label}==='Read native file'`),true,'tool text-node updates reach the current face')
    assert.equal(await b.evaluate(`el('t').querySelector('button > span:first-child > span').children[1]===originalLabel`),true)
  } finally { b.close() }
})

test('streamed prose, private reasoning and native timer text do not rescan the turn',async()=>{
  const b=await fixture([part('prose','md'),part('thought','thought',{live:true})],{live:true})
  try {
    await wait(b,`${label}==='Thinking'`)
    await b.evaluate(`window.rail=document.createElement('div');rail.dataset.slot='thread-timeline';rail.innerHTML='<div data-slot="thread-timeline-ticks"></div>';document.querySelector('[data-session-anchor]').append(rail)`)
    await wait(b,`rail.hasAttribute('data-codex-history-rail')`)
    await drainInitialProjection(b)
    await b.evaluate(`window.bodyText=el('thought').querySelector('[data-slot="aui_reasoning-text"]').firstChild;window.timerText=el('thought').querySelector('[role="status"]').firstChild;window.proseText=el('prose').firstChild;window.nativeQueries=0;window.railChecks=0;const pair=el('pair'),native=pair.querySelectorAll;pair.querySelectorAll=function(...args){nativeQueries++;return native.apply(this,args)};const connected=Object.getOwnPropertyDescriptor(Node.prototype,'isConnected').get;Object.defineProperty(rail,'isConnected',{configurable:true,get(){railChecks++;return connected.call(this)}});bodyText.nodeValue+=' streamed private token';timerText.nodeValue='4s';proseText.nodeValue+=' streamed prose token'`)
    await drainInitialProjection(b)
    const actual=await b.evaluate(`({queries:nativeQueries,railChecks,label:${label}})`)
    assert.deepEqual(actual,{queries:0,railChecks:0,label:'Thinking'})
  } finally { b.close() }
})
