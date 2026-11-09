import { testDependencyRequire } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {loadPluginInternals} from './helpers/load-plugin.mjs'

const require=testDependencyRequire()
const {JSDOM}=require('jsdom')
const actions='<div data-slot="aui_msg-actions"><button>Copy</button></div>'
const md=(id,text=id)=>`<div class="aui-md" id="${id}">${text}</div>`
const message=(id,body,footer='')=>`<div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="${id}"><div data-slot="aui_assistant-message-content">${body}</div>${footer}</div>`
const notice='<div data-slot="aui_system-message-root"><div data-slot="aui_background-result"><div data-conversation-scaffold><button><span class="truncate">Subagent Task Completed: inspect</span></button></div></div></div>'
async function fixture(body){
 const dom=new JSDOM(`<html data-codex-chat-look="true"><body><section data-session-anchor="workspace"><div data-slot="aui_turn-pair"><div data-role="user" data-message-id="user-real">Question</div><div data-slot="aui_response-group">${body}</div></div></section></body></html>`,{pretendToBeVisual:true})
 const w=dom.window
 const {reconcileTurnActivity,CSS}=await loadPluginInternals(['reconcileTurnActivity','CSS'],{window:w,document:w.document,Node:w.Node})
 const style=w.document.createElement('style');style.textContent=CSS;w.document.head.append(style)
 const pair=w.document.querySelector('[data-slot="aui_turn-pair"]')
 return{w,pair,project:(history=null)=>reconcileTurnActivity(pair,'',history,'scope'),el:id=>w.document.getElementById(id),hidden(id){for(let n=w.document.getElementById(id);n;n=n.parentElement)if(w.getComputedStyle(n).display==='none')return true;return false},close:()=>w.close()}
}
const check=(name,fn)=>test(name,async()=>{const f=await fixture(message('assistant-interim-1',md('progress-a'))+message('assistant-interim-2',md('progress-b'))+message('tool-root','<div data-slot="tool-block" id="tool">Read file</div>')+message('final-root',md('answer-a')+md('answer-b'),actions));try{await fn(f)}finally{f.close()}})
const narrationEvidence=f=>{
 f.el('progress-a').closest('[data-role="assistant"]').dataset.messageId='100-0-assistant'
 f.el('progress-b').closest('[data-role="assistant"]').dataset.messageId='101-1-assistant'
 return new Map([['100','interim'],['101','interim']])
}
check('source-identified completed narration folds while preserving every final paragraph and native node',f=>{
 const node=f.el('progress-a'),parent=node.parentNode;f.project(narrationEvidence(f))
 assert.equal(f.hidden('progress-a'),true);assert.equal(f.hidden('progress-b'),true)
 assert.equal(f.hidden('answer-a'),false);assert.equal(f.hidden('answer-b'),false)
 assert.equal(node.parentNode,parent);assert.equal(node.isConnected,true)
 f.pair.querySelector('[data-codex-turn-activity]').click()
 assert.equal(f.hidden('progress-a'),false);assert.equal(f.hidden('tool'),false)
 f.pair.querySelector('[data-codex-turn-activity]').click();assert.equal(f.hidden('progress-a'),true)
})
check('live and uncertain responses keep earlier plain prose under reversible Working expansion',f=>{
 const root=f.el('answer-a').closest('[data-role="assistant"]');root.dataset.streaming='true';f.project();assert.equal(f.hidden('progress-a'),true)
 f.pair.querySelector('[data-codex-turn-activity]').click();assert.equal(f.hidden('progress-a'),false)
 f.pair.querySelector('[data-codex-turn-activity]').click()
 root.removeAttribute('data-streaming');root.querySelector('[data-slot="aui_msg-actions"]').remove();f.project();assert.equal(f.hidden('progress-a'),true)
 assert.equal(f.hidden('answer-a'),false);assert.equal(f.hidden('answer-b'),false)
 f.pair.querySelector('[data-codex-turn-activity]').click();assert.equal(f.hidden('progress-a'),false)
})
check('promoting an older standalone node does not displace the latest reply or prevent expansion',f=>{
 const evidence=narrationEvidence(f);f.project(evidence);assert.equal(f.hidden('progress-a'),true)
 const root=f.el('progress-a').closest('[data-role="assistant"]');root.insertAdjacentHTML('beforeend',actions)
 assert.equal(f.w.getComputedStyle(f.el('progress-a')).display,'none')
 f.project(evidence);assert.equal(f.hidden('progress-a'),true)
 const node=f.el('progress-a'),parent=node.parentNode
 f.pair.querySelector('[data-codex-turn-activity]').click();assert.equal(f.hidden('progress-a'),false)
 assert.equal(node.parentNode,parent);assert.equal(node.isConnected,true)
})
check('explicit source answers and duplicate-footer groups fold only as previous replies',f=>{
 const root=f.el('progress-a').closest('[data-role="assistant"]');root.dataset.messageId='100-0-assistant'
 f.project(new Map([['100','answer']]))
 assert.equal(f.hidden('progress-a'),true)
 assert.equal(f.el('progress-a').hasAttribute('data-codex-activity-item'),false)
 f.project();assert.equal(f.hidden('progress-a'),true)
 root.insertAdjacentHTML('beforeend',actions);f.project();assert.equal(f.hidden('progress-b'),true)
 f.pair.querySelector('[data-codex-turn-activity]').click()
 assert.equal(f.hidden('progress-a'),false);assert.equal(f.hidden('progress-b'),false)
})
test('background boundary keeps every earlier final paragraph mounted under Worked on cold history',async()=>{
 const f=await fixture(message('old',md('old-a')+md('old-b'))+notice+message('progress',md('new-progress'))+message('new',md('new-answer'),actions))
 try{f.project();assert.equal(f.hidden('old-a'),true);assert.equal(f.hidden('old-b'),true);assert.equal(f.hidden('new-progress'),true);assert.equal(f.hidden('new-answer'),false)
  f.pair.querySelector('[data-codex-turn-activity]').click()
  for(const id of ['old-a','old-b','new-progress','new-answer'])assert.equal(f.hidden(id),false)
 }finally{f.close()}
})
test('unrelated media, links and input controls in standalone narration stay visible',async()=>{
 const f=await fixture(message('progress',md('linked','Reference <a href="https://example.invalid/file">file</a>')+md('plain')+md('image','Image <img alt="preview">')+'<div data-slot="aui_artifact-card" id="artifact">Attachment</div>')+message('final',md('answer'),actions))
 try{f.project();assert.equal(f.hidden('linked'),false);assert.equal(f.hidden('image'),false);assert.equal(f.hidden('artifact'),false);assert.equal(f.hidden('answer'),false)}finally{f.close()}
})
test('a witnessed independent final reopens after module reload on identical nodes without notice or source identity',async()=>{
 const f=await fixture(message('old-opaque',md('old-a')+md('old-b'),actions))
 try{
  f.project()
  f.pair.querySelector('[data-slot="aui_msg-actions"]').remove()
  f.pair.querySelector('[data-slot="aui_response-group"]').insertAdjacentHTML('beforeend',message('progress-opaque',md('followup-progress'))+message('new-opaque',md('new-final'),actions))
  f.project();assert.equal(f.hidden('old-a'),true);assert.equal(f.hidden('old-b'),true)
  const node=f.el('old-b'),parent=node.parentNode
  const next=await loadPluginInternals(['reconcileTurnActivity'],{window:f.w,document:f.w.document,Node:f.w.Node})
  next.reconcileTurnActivity(f.pair,'',null,'scope')
  assert.equal(f.hidden('old-a'),true);assert.equal(f.hidden('old-b'),true)
  assert.equal(f.w.getComputedStyle(node).display,'none')
  assert.equal(f.hidden('followup-progress'),true);assert.equal(f.hidden('new-final'),false)
  f.pair.querySelector('[data-codex-turn-activity]').click()
  for(const id of ['old-a','old-b','followup-progress','new-final'])assert.equal(f.hidden(id),false)
  assert.equal(node.parentNode,parent);assert.equal(node.isConnected,true)
 }finally{f.close()}
})
test('reload classification uses exact native nodes; another owner or cloned pair cannot borrow expansion',async()=>{
 const f=await fixture(message('old-opaque',md('old'),actions))
 try{
  f.project();f.pair.querySelector('[data-slot="aui_msg-actions"]').remove()
  const next=await loadPluginInternals(['turnLatestAnswerParts','turnPreviousReplyParts','reconcileTurnActivity'],{window:f.w,document:f.w.document,Node:f.w.Node})
  const roots=[...f.pair.querySelectorAll('[data-role="assistant"]')]
  roots[0].querySelector('[data-slot="aui_assistant-message-content"]').insertAdjacentHTML('beforeend','<div data-slot="tool-block">Late tool</div>'+md('unwitnessed-tail'))
  const original=f.el('old'),parent=original.parentNode
  const classify=(pair,ownedRoots,scope)=>{
   const latest=next.turnLatestAnswerParts(ownedRoots),previous=next.turnPreviousReplyParts(ownedRoots,latest)
   next.reconcileTurnActivity(pair,'',null,scope)
   return{latest,previous}
  }
  const own=classify(f.pair,roots,'scope')
  assert.equal(own.latest.has(f.el('unwitnessed-tail')),true);assert.equal(own.previous.has(original),true)
  assert.equal(own.latest.has(original),false);assert.equal(f.hidden('old'),true)
  f.pair.querySelector('[data-codex-turn-activity]').click();assert.equal(f.hidden('old'),false)
  const foreign=classify(f.pair,roots,'other-owner')
  assert.equal(foreign.latest.has(f.el('unwitnessed-tail')),true);assert.equal(foreign.previous.has(original),true)
  assert.equal(f.hidden('old'),true,'another owner cannot borrow the expanded choice')
  assert.equal(original.parentNode,parent);assert.equal(original.isConnected,true)
  const clone=f.pair.cloneNode(true),cloneRoot=clone.querySelector('[data-role="assistant"]')
  const cloned=classify(clone,[cloneRoot],'scope'),clonedOld=cloneRoot.querySelector('#old')
  assert.equal(cloned.latest.has(cloneRoot.querySelector('#unwitnessed-tail')),true)
  assert.equal(cloned.previous.has(clonedOld),true);assert.equal(cloned.previous.has(original),false)
  assert.equal(clone.getAttribute('data-codex-activity-expanded'),'false')
  assert.notEqual(clonedOld,original)

 }finally{f.close()}
})
