import assert from 'node:assert/strict'
import test from 'node:test'
import {fixture,part,wait} from './helpers/native-thought.mjs'

test('later completed native tool supersedes an earlier Thought without borrowing private body or remounting native controls',async()=>{
 const b=await fixture([part('reason','thought',{live:true,text:'PRIVATE_BODY_MUST_NOT_BECOME_CAPTION'}),part('done','tool',{label:'Completed native call'})],{live:true})
 try {
  const caption=`header()?.querySelector('[data-codex-tool-sequence-label]')?.textContent`
  await wait(b,`${caption}==='Completed native call'`)
  await b.evaluate(`window.savedReason=el('reason');window.savedControl=savedReason.querySelector('button');window.savedBody=savedReason.querySelector('[data-slot="aui_thinking-body"]');window.savedParent=savedReason.parentNode;window.savedSequence=header()`)
  assert.equal(await b.evaluate(`!header().textContent.includes('PRIVATE_BODY')&&!vis('reason')&&nativeClicks===0`),true)
  await b.evaluate(`change(c=>{c[0].parts[0].live=false;return c})`)
  await wait(b,`${caption}==='Completed native call'`)
  assert.equal(await b.evaluate(`header()===savedSequence&&el('reason')===savedReason&&savedReason.querySelector('button')===savedControl&&savedReason.querySelector('[data-slot="aui_thinking-body"]')===savedBody&&savedReason.parentNode===savedParent&&!header().querySelector('[data-codex-activity-sweep]')&&nativeClicks===0`),true)
  await b.evaluate(`el('reason').append(Object.assign(document.createElement('div'),{textContent:'Unknown native output'}))`)
  await wait(b,`!header()&&vis('reason')&&vis('done')`)
  assert.equal(await b.evaluate(`savedControl===el('reason').querySelector('button')&&savedBody===el('reason').querySelector('[data-slot="aui_thinking-body"]')&&nativeClicks===0`),true)
 } finally {b.close()}
})
