import assert from 'node:assert/strict'
import test from 'node:test'
import {fixture,part,wait,click} from './helpers/native-thought.mjs'

test('Thought uses exactly the Thinking mask, alone and homogeneous, without changing native controls',async()=>{
 const b=await fixture([part('thought')]);try{
 await wait(b,`el('thought')`)
 assert.equal(await b.evaluate(`mask(el('thought').querySelector('button'))`),await b.evaluate(`mask(el('thinking-reference'))`),'exact recovered Brain, not a similar outline')
 assert.equal(await b.evaluate(`!header()&&vis('thought')`),true)
 await click(b,'#thought button');await wait(b,`el('thought').querySelector('[data-slot="aui_reasoning-text"]')`)
 await b.evaluate(`window.original=el('thought');window.originalButton=original.querySelector('button');change(c=>{c[0].parts.push({id:'second',type:'thought'});return c})`)
 await wait(b,`header()&&!vis('thought')&&!vis('second')`)
 assert.equal(await b.evaluate(`mask(header())`),await b.evaluate(`mask(el('thinking-reference'))`),'homogeneous reasoning retains Brain')
 await click(b,'[data-codex-tool-sequence] button')
 assert.equal(await b.evaluate(`el('thought')===original&&original.querySelector('button')===originalButton&&originalButton.getAttribute('aria-expanded')==='true'&&vis('thought')&&vis('second')&&!!original.querySelector('[data-slot="aui_reasoning-text"]')&&nativeClicks===0`),true)
 }finally{b.close()}
})

test('native reasoning preference absent/enabled, mixed tool + reasoning, prose boundaries and hydrated roots',async()=>{
 const b=await fixture([part('hidden','thought',{enabled:false}),part('tool','tool')]);try{
 await wait(b,`el('tool')`);assert.equal(await b.evaluate(`!header()&&!el('hidden')&&vis('tool')`),true,'disabled native reasoning is neither synthesized nor persisted')
 await b.evaluate(`change(c=>{c[0].parts[0].enabled=true;return c})`);await wait(b,`header()&&!vis('hidden')&&!vis('tool')`)
 assert.equal(await b.evaluate(`document.querySelector('[data-codex-tool-sequence]').hasAttribute('data-codex-tool-sequence-glyph')`),false,'mixed glyphs retain Hammer')
 await b.evaluate(`change(c=>[{id:'history-a',parts:[{id:'intro',type:'prose'},{id:'first',type:'thought'},{id:'a',type:'tool'}]},{id:'history-b',parts:[{id:'second',type:'thought'},{id:'middle',type:'prose'},{id:'third',type:'thought'},{id:'b',type:'tool'},{id:'answer',type:'prose'}]}])`)
 await wait(b,`document.querySelectorAll('[data-codex-tool-sequence]').length===2`)
 // Latest-only prose is independent of tool-sequence boundaries.
 assert.equal(await b.evaluate(`!vis('intro')&&!vis('middle')&&vis('answer')&&document.querySelectorAll('[data-codex-tool-sequence]').length===2`),true)
 await b.evaluate(`document.querySelector('[data-codex-turn-activity]').click()`)
 assert.equal(await b.evaluate(`vis('intro')&&vis('middle')&&vis('answer')&&!vis('first')&&!vis('second')&&!vis('third')`),true,'reasoning body is a unit, assistant prose is always a boundary')
 await b.evaluate(`change(c=>{for(const r of c)for(const p of r.parts)if(p.type==='thought')p.enabled=false;return c})`)
 await wait(b,`!document.querySelector('[data-slot="aui_thinking-disclosure"]')&&!header()`)
 assert.equal(await b.evaluate(`vis('a')&&vis('b')&&vis('answer')`),true)
 }finally{b.close()}
})

test('streaming preview remains mounted, native accessibility/Stop survives, no programmatic native toggles',async()=>{
 const b=await fixture([part('live','thought',{live:true}),part('t','tool')],{live:true});try{
 await wait(b,`header()&&!vis('live')`)
 await b.evaluate(`window.thought=el('live');window.body=thought.querySelector('[data-slot="aui_thinking-body"]');window.control=thought.querySelector('button');window.parent=thought.parentNode;window.nativeChanges=0;control.addEventListener('click',()=>nativeChanges++)`)
 await click(b,'[data-codex-tool-sequence] button')
 assert.equal(await b.evaluate(`vis('live')&&el('live')===thought&&thought.parentNode===parent&&thought.querySelector('[data-slot="aui_thinking-body"]')===body&&control.getAttribute('aria-expanded')==='true'&&thought.querySelector('[aria-live="polite"]')&&thought.querySelector('[role="status"]')&&vis('stop')&&nativeChanges===0`),true)
 await b.evaluate(`change(c=>{c[0].parts[0].text='Reasoning streamed onward';return c})`);await wait(b,`body.textContent.includes('streamed onward')`)
 await b.evaluate(`change(c=>{c[0].live=false;c[0].parts[0].live=false;return c})`);await wait(b,`control.textContent.includes('Thought')`)
 assert.equal(await b.evaluate(`thought.querySelector('[data-slot="aui_thinking-body"]')===body&&nativeChanges===0`),true,'native sawLivePreview latch is not reset')
 await click(b,'#live button');await wait(b,`!thought.querySelector('[data-slot="aui_thinking-body"]')`)
 assert.equal(await b.evaluate(`nativeChanges===1&&nativeClicks===0`),true)
 }finally{b.close()}
})

test('critical UI and unknown topology fail open; owner ABA and teardown revoke callbacks',async()=>{
 const b=await fixture([part('thought','thought',{live:true}),part('t','tool')],{live:true});try{
 await wait(b,`header()`)
 for(const unsafe of ['tool-approval-inline','clarify-inline','mcp-setup-inline','alert']){
  await b.evaluate(`change(c=>{c[0].parts[0].unsafe=${JSON.stringify(unsafe)};return c})`);await wait(b,`!header()&&vis('thought')&&vis('t')`)
  await b.evaluate(`change(c=>{delete c[0].parts[0].unsafe;return c})`);await wait(b,`header()`)
 }
 await b.evaluate(`window.old=header();fixtureState.profile.set('other');fixtureState.profile.set('default');old.click()`)
 assert.equal(await b.evaluate(`old.getAttribute('aria-expanded')`),'false','ABA cannot revive retained callbacks')
 await wait(b,`header()!==old`)
 await b.evaluate(`el('thought').append(Object.assign(document.createElement('div'),{textContent:'Unknown native child'}))`);await wait(b,`!header()&&vis('thought')&&vis('t')`)
 await b.evaluate(`el('thought').lastElementChild.remove()`);await wait(b,`header()`)
 await b.evaluate(`window.old=header();stopRuntime();old.click()`)
 await wait(b,`!document.querySelector('[data-codex-tool-sequence], [data-codex-tool-sequence-item]')`)
 assert.equal(await b.evaluate(`vis('thought')&&vis('t')&&vis('stop')`),true)
 }finally{b.close()}
})

test('no-op reconcile mutation work is measured on unchanged tool-only native seam',async()=>{
 const b=await fixture([part('a','tool'),part('b','tool')]);try{
 await wait(b,`header()`)
 const counts=await b.evaluate(`(()=>{stopRuntime();const r=makeSequenceRuntime(),pair=el('pair');r.reconcile(pair,'measure');const observer=new MutationObserver(()=>{});observer.observe(pair,{subtree:true,attributes:true,childList:true,characterData:true});for(let i=0;i<20;i++)r.reconcile(pair,'measure');const records=observer.takeRecords();observer.disconnect();r.cleanup();return{passes:20,total:records.length,childList:records.filter(m=>m.type==='childList').length,attributes:records.filter(m=>m.type==='attributes').length}})()`)
 console.log('THOUGHT_NOOP_MUTATIONS '+JSON.stringify(counts));assert.equal(counts.childList,0);assert.equal(counts.total,0,'unchanged activity reconciliation is mutation-idempotent')
 }finally{b.close()}
})
