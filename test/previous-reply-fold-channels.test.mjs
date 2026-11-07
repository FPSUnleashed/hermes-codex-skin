import assert from 'node:assert/strict'
import test from 'node:test'
import {actions,message,transcriptFixture} from './helpers/transcript-activity-fixture.mjs'
const md=(id)=>`<div class="aui-md" id="${id}">Earlier prose</div>`
for(const mixed of [false,true])test(`source-classified previous prose fails open across both fold channels, mixed=${mixed}`,async()=>{
 const tool='<div data-slot="tool-block" id="work"><button>Read file</button></div>'
 const body=mixed?message('100-0-assistant',md('earlier')+tool):message('100-0-assistant',md('earlier'))+message('work-root',tool)
 const html=`<section data-session-anchor="workspace"><div id="pair" data-slot="aui_turn-pair"><div data-role="user" data-message-id="u">Question</div><div data-slot="aui_response-group">${body}${message('final','<div class="aui-md" id="latest">Latest complete answer</div>',actions)}</div></div></section>`
 const result=await transcriptFixture(html,`
  const project=()=>reconcileTurnActivity(element('pair'),'',new Map([['100','interim']]),'scope');
  project();const earlier=element('earlier'),parent=earlier.parentNode;
  const samples=[];
  for(const html of ['<a href="#reference">Reference</a>','<button>Native action</button>','<span data-slot="unknown-native-output">Native output</span>','<span tabindex="0">Native focus</span>','<details><summary>Native disclosure</summary>Result</details>']){
   const folded=!visible('earlier');earlier.insertAdjacentHTML('beforeend',html);const native=earlier.lastElementChild;
   const immediate=visible('earlier');project();const projected=visible('earlier');native.remove();project();
   samples.push({folded,immediate,projected,refolded:!visible('earlier')});
  }
  clearTurnActivityDecorations();
  return {samples,identity:earlier===element('earlier')&&earlier.parentNode===parent,cleanup:visible('earlier')&&visible('work')&&visible('latest')};
 `)
 assert.deepEqual(result,{samples:Array.from({length:5},()=>({folded:true,immediate:true,projected:true,refolded:true})),identity:true,cleanup:true})
})
