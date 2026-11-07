import assert from 'node:assert/strict'
import test from 'node:test'
import {actions, message, transcriptFixture} from './helpers/transcript-activity-fixture.mjs'

// Full shipping module + real DOM/CSS selectors. Browser paint/AX is a separate gate.
const protectedParts = [
  ['link', '<a href="#native-link">Reference</a>'],
  ['button', '<button>Native action</button>'],
  ['input', '<input aria-label="Native input">'],
  ['select', '<select aria-label="Native choice"><option>Choice</option></select>'],
  ['textarea', '<textarea aria-label="Native note">Note</textarea>'],
  ['editable', '<span contenteditable="true">Edit</span>'],
  ['focusable', '<span tabindex="0">Native focus target</span>'],
  ['role', '<span role="button">Native role action</span>'],
  ['details', '<details><summary>Native disclosure</summary>Result</details>'],
  ['object', '<object aria-label="Native object"></object>'],
  ['embed', '<embed aria-label="Native embed">'],
  ['canvas', '<canvas aria-label="Native drawing"></canvas>'],
  ['svg', '<svg aria-label="Native graphic"></svg>'],
  ['image', '<img alt="Native preview">'],
  ['audio', '<audio controls></audio>'],
  ['video', '<video controls></video>'],
  ['frame', '<iframe title="Native preview"></iframe>'],
  ['alert', '<span role="alert">Native error</span>'],
  ['failure', '<span class="text-destructive">Failed</span>'],
  ['approval', '<span data-slot="tool-approval-inline">Approve</span>'],
  ['clarify', '<span data-slot="clarify-inline">Question</span>'],
  ['setup', '<span data-slot="mcp-setup-inline">Setup</span>'],
  ['artifact', '<span data-slot="aui_artifact-card">Attachment</span>'],
  ['unknown', '<span data-slot="future-native-output">Unknown output</span>'],
]
const md = (id, text=id) => `<div class="aui-md" id="${id}">${text}</div>`
const markup = body => `<section data-session-anchor="workspace"><div id="pair" data-slot="aui_turn-pair"><div data-role="user" data-message-id="u">Question</div><div data-slot="aui_response-group">${body}${message('latest',md('latest-first','Latest complete paragraph one')+md('latest-last','Latest complete paragraph two'),actions)}</div></div></section>`

test('previous replies protect links, native actions and unknown output without losing latest prose or native identity', async () => {
  const ids=protectedParts.map(([id])=>id)
  const result=await transcriptFixture(markup(message('plain-old',md('plain','Earlier ordinary prose'),actions)+message('protected-old',protectedParts.map(([id,html])=>md(id,html)).join(''))), `
    window.nativeCalls=[];
    element('button').querySelector('button').onclick=()=>nativeCalls.push('button');
    element('link').querySelector('a').onclick=event=>{nativeCalls.push('link');event.preventDefault()};
    const ids=${JSON.stringify(ids)};
    const saved=ids.map(id=>[element(id),element(id).parentNode,element(id).innerHTML]);
    const plain=element('plain'),plainParent=plain.parentNode;
    for(let i=0;i<3;i++)reconcile();
    const closed=Object.fromEntries(ids.map(id=>[id,visible(id)&&!element(id).hasAttribute('data-codex-previous-reply')]));
    const plainCollapsed=!visible('plain')&&visible('plain-old')&&getComputedStyle(element('plain-old').querySelector('[data-slot="aui_msg-actions"]')).display==='none';
    const latest=visible('latest-first')&&visible('latest-last')&&element('latest-first').textContent==='Latest complete paragraph one'&&element('latest-last').textContent==='Latest complete paragraph two';
    const passiveClicks=nativeCalls.length;
    element('button').querySelector('button').click();element('link').querySelector('a').click();
    const nativeActions=nativeCalls.join(',');
    for(let i=0;i<2;i++){header().click();if(!visible('plain')||!ids.every(visible))throw Error('Expansion lost native content');header().click();}
    const identity=saved.every(([node,parent,html])=>node===element(node.id)&&node.parentNode===parent&&node.innerHTML===html)&&plain===element('plain')&&plain.parentNode===plainParent;
    clearTurnActivityDecorations();
    const cleanup=ids.concat('plain','latest-first','latest-last').every(visible)&&!document.querySelector('[data-codex-previous-reply]');
    return {closed,plainCollapsed,latest,passiveClicks,nativeActions,identity,cleanup};
  `)
  assert.deepEqual(result,{closed:Object.fromEntries(ids.map(id=>[id,true])),plainCollapsed:true,latest:true,passiveClicks:0,nativeActions:'button,link',identity:true,cleanup:true})
})

test('late protected descendants fail open synchronously and removal restores ordinary prose folding',async()=>{
  const result=await transcriptFixture(markup(message('old',md('earlier','Earlier prose'))),`
    window.nativeCalls=[];reconcile();
    const original=element('earlier'),parent=original.parentNode;
    const cases=[];
    for(const [id,html] of ${JSON.stringify(protectedParts)}) {
      if(visible('earlier'))throw Error('Missing initial collapse: '+id);
      original.insertAdjacentHTML('beforeend',html);
      const native=original.lastElementChild;
      const immediate=visible('earlier');
      native.remove();const removed=!visible('earlier');
      original.append(native);reconcile();
      const reconciled=visible('earlier')&&!original.hasAttribute('data-codex-previous-reply')&&native===original.lastElementChild;
      native.remove();reconcile();
      cases.push({id,immediate,removed,reconciled,refolded:!visible('earlier')});
    }
    // Self-level semantics and marked native surfaces fail open too.
    const attributes=[['role','button'],['tabindex','0'],['contenteditable','true'],['data-slot','future-native-output']];
    const self=attributes.map(([name,value])=>{original.setAttribute(name,value);const immediate=visible('earlier');reconcile();const projected=visible('earlier');original.removeAttribute(name);reconcile();return immediate&&projected&&!visible('earlier')});
    const identity=original===element('earlier')&&original.parentNode===parent&&original.textContent==='Earlier prose';
    clearTurnActivityDecorations();
    return {cases,self,identity,passiveClicks:nativeCalls.length,cleanup:visible('earlier')&&visible('latest-first')&&visible('latest-last')};
  `)
  assert.deepEqual(result,{cases:protectedParts.map(([id])=>({id,immediate:true,removed:true,reconciled:true,refolded:true})),self:[true,true,true,true],identity:true,passiveClicks:0,cleanup:true})
})

test('unwrapped native text replies retain interactive descendants and disable restores the same content nodes',async()=>{
  const result=await transcriptFixture(markup(message('old','Earlier raw text')),`
    reconcile();const content=element('old').querySelector('[data-slot="aui_assistant-message-content"]');
    const parent=content.parentNode,raw=content.firstChild;
    const collapsed=visible('old')&&getComputedStyle(content).display==='none';
    const button=document.createElement('button');button.textContent='Native action';let calls=0;button.onclick=()=>calls++;content.append(button);
    const immediate=getComputedStyle(content).display!=='none';reconcile();
    button.click();const protectedVisible=getComputedStyle(content).display!=='none';
    clearTurnActivityDecorations();
    return {collapsed,immediate,protectedVisible,calls,identity:raw===content.firstChild&&button===content.lastChild&&content.parentNode===parent,cleanup:getComputedStyle(content).display!=='none'};
  `)
  assert.deepEqual(result,{collapsed:true,immediate:true,protectedVisible:true,calls:1,identity:true,cleanup:true})
})
