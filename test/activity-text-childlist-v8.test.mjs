import assert from 'node:assert/strict'
import test from 'node:test'
import {fixture,part,wait} from './helpers/native-thought.mjs'

const label = `header()?.querySelector('[data-codex-tool-sequence-label]')?.textContent`
const title = `el('thought').querySelector(':scope > [class~="group/disclosure-row"] > button > span:first-child > span > span')`
async function drain(b) {
  await b.evaluate(`(async()=>{for(let i=0;i<2;i++)await new Promise(resolve=>requestAnimationFrame(()=>requestIdleCallback(()=>resolve(),{timeout:800})))})()`)
}

test('ACTIVITY-OBS-01 text-only childList add replace remove stays quiet in private reasoning prose and timer',async()=>{
  const b=await fixture([part('prose','md'),part('thought','thought',{live:true})],{live:true})
  try {
    await wait(b,`${label}==='Thinking'`)
    await b.evaluate(`window.rail=document.createElement('div');rail.dataset.slot='thread-timeline';rail.innerHTML='<div data-slot="thread-timeline-ticks"></div>';document.querySelector('[data-session-anchor]').append(rail)`)
    await wait(b,`rail.hasAttribute('data-codex-history-rail')`)
    await drain(b)
    await b.evaluate(`window.nativeNodes=[...el('pair').querySelectorAll('*')].filter(n=>!n.closest('[data-codex-tool-sequence]')).map(n=>[n,n.parentNode]);window.targets=[el('thought').querySelector('[data-slot="aui_reasoning-text"]'),el('prose'),el('thought').querySelector('[role="status"]')];window.nativeQueries=0;window.railChecks=0;const pair=el('pair'),native=pair.querySelectorAll;pair.querySelectorAll=function(...args){nativeQueries++;return native.apply(this,args)};const connected=Object.getOwnPropertyDescriptor(Node.prototype,'isConnected').get;Object.defineProperty(rail,'isConnected',{configurable:true,get(){railChecks++;return connected.call(this)}})`)
    const observations=[]
    for(let i=0;i<3;i++)for(const operation of ['add','replace','remove']) {
      const before=await b.evaluate(`({queries:nativeQueries,railChecks})`)
      await b.evaluate(`{const target=targets[${i}];${operation==='add'?`target.append(document.createTextNode(' fixture token'))`:operation==='replace'?`target.replaceChild(document.createTextNode(' replacement token'),target.lastChild)`:`target.lastChild.remove()`}}`)
      await drain(b)
      const after=await b.evaluate(`({queries:nativeQueries,railChecks,label:${label},identity:nativeNodes.every(([n,p])=>n.isConnected&&n.parentNode===p)})`)
      observations.push({target:i,operation,queries:after.queries-before.queries,railChecks:after.railChecks-before.railChecks,label:after.label,identity:after.identity})
    }
    console.log('ACTIVITY_TEXT_CHILDREN '+JSON.stringify(observations))
    assert.deepEqual(observations,Array.from({length:3},(_,target)=>['add','replace','remove'].map(operation=>({target,operation,queries:0,railChecks:0,label:'Thinking',identity:true}))).flat())
  } finally { b.close() }
})

test('text-only compact captions remain observed through textContent and replaceChild',async()=>{
  const b=await fixture([part('thought','thought',{live:true})],{live:true})
  try {
    await wait(b,`${label}==='Thinking'`);await drain(b)
    await b.evaluate(`window.originalThought=el('thought');window.originalLabel=${title};originalLabel.textContent='Native compact update'`)
    await wait(b,`${label}==='Native compact update'`);await drain(b)
    await b.evaluate(`originalLabel.replaceChild(document.createTextNode('Another compact update'),originalLabel.firstChild)`)
    await wait(b,`${label}==='Another compact update'`)
    assert.equal(await b.evaluate(`originalThought===el('thought')&&originalLabel===${title}`),true)
  } finally { b.close() }
})

test('unknown direct Thought elements and critical children remain fail-open and restore without resize',async()=>{
  const b=await fixture([part('thought','thought',{live:true}),part('tool','tool')],{live:true})
  try {
    await wait(b,`${label}==='Native command'`)
    await b.evaluate(`window.originalThought=el('thought');window.originalTool=el('tool');true`)
    for(const kind of ['unknown','alert','clarify-inline','tool-approval-inline']) {
      await drain(b)
      await b.evaluate(`{const n=document.createElement('div');n.id='critical';n.textContent='Required native action';${kind==='alert'?`n.role='alert'`:kind==='unknown'?'':`n.dataset.slot=${JSON.stringify(kind)}`};${kind==='unknown'?`el('thought')`:`el('thought').querySelector('[data-slot="aui_reasoning-text"]')`}.append(n)}`)
      await wait(b,`!header()&&vis('thought')&&vis('tool')`)
      assert.equal(await b.evaluate(`el('critical').isConnected&&getComputedStyle(el('critical')).display!=='none'`),true,kind)
      await drain(b);await b.evaluate(`el('critical').remove()`)
      await wait(b,`${label}==='Native command'`)
    }
    assert.equal(await b.evaluate(`originalThought===el('thought')&&originalTool===el('tool')`),true)
  } finally { b.close() }
})
