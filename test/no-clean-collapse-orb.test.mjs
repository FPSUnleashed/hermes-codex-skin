import assert from 'node:assert/strict'
import test from 'node:test'
import { actions, message, transcriptFixture } from './helpers/transcript-activity-fixture.mjs'

test('replacement Worked disclosure waits for final, preserves protected content, and fails open on resume', async () => {
  const html = `<div data-slot="aui_turn-pair" id="pair">
    <div data-role="user" id="user">User prompt</div>
    ${message('interim', '<p id="unclassified">Intermediate commentary</p><div data-slot="tool-block" id="interim-tool"><button id="native-tool">Read file</button></div>')}
    <div data-role="system" data-slot="aui_system-message-root" id="system-note">steered</div>
    ${message('image-root', '<div data-slot="aui_generated-image" id="generated-image">Generated image</div>')}
    ${message('final', '<div class="aui-md" id="final-answer">Final answer</div><div data-slot="aui_thinking-disclosure" id="thinking">Thought</div><div data-slot="tool-block" id="final-tool">Terminal</div><div data-slot="tool-block" id="media-tool"><div data-slot="aui_generated-image" id="nested-image">Generated image in tool</div></div><div data-slot="tool-block" id="artifact-tool"><div data-slot="aui_artifact-card" id="nested-artifact">Artifact in tool</div></div><div role="alert" id="final-alert">Important error</div>', actions+'<div data-slot="aui_changed-files" id="changed-files">2 files changed</div><span data-slot="aui_turn-duration">⏱ 1m 5s</span>')}
  </div><div role="alert" id="global-alert">Global warning</div>`
  const result = await transcriptFixture(html, `
    const pair=element('pair'),original=pair.innerHTML;
    const ids=['user','unclassified','interim-tool','system-note','generated-image','final-answer','final-tool','media-tool','nested-image','artifact-tool','nested-artifact','thinking','changed-files','final-alert','global-alert'];
    const saved=Object.fromEntries(ids.map(id=>[id,{node:element(id),parent:element(id).parentNode,text:element(id).textContent}]));
    const state=()=>({phase:pair.getAttribute('data-codex-activity-phase'),label:header()?.textContent??null,expanded:header()?.getAttribute('aria-expanded')??null,disabled:header()?.disabled??null,visible:Object.fromEntries(ids.map(id=>[id,visible(id)])),actions:getComputedStyle(pair.querySelector('[data-slot="aui_msg-actions"]')).display!=='none'});
    document.documentElement.dataset.codexCleanTranscript='off';reconcile();const legacyOff=state();
    document.documentElement.dataset.codexCleanTranscript='on';element('interim').dataset.streaming='true';reconcile();const live=state();
    element('interim').removeAttribute('data-streaming');
    const awaiting={};
    for(const slot of ['tool-approval-inline','clarify-inline','mcp-setup-inline']){
      const control=document.createElement('button');control.id='approval';control.dataset.slot=slot;control.textContent='Approve';let clicks=0;control.onclick=()=>clicks++;element('interim-tool').append(control);reconcile();control.click();awaiting[slot]={state:state(),visible:visible('approval'),sameNode:document.getElementById('approval')===control,clicks};control.remove();
    }
    reconcile();const settled=state();
    let clicks=0;element('native-tool').onclick=()=>clicks++;header().click();element('native-tool').click();const expanded={state:state(),clicks};
    header().click();reconcile();const foldedAgain=state();
    element('final').dataset.streaming='true';reconcile();const resumed=state();
    element('final').removeAttribute('data-streaming');
    const shell=document.createElement('div');shell.dataset.role='assistant';shell.dataset.slot='aui_assistant-message-root';pair.append(shell);reconcile();const emptyTrailingShell=state();
    shell.textContent='Unclassified late content';reconcile();const lateContent=state();shell.remove();
    const failure=document.createElement('span');failure.className='text-destructive';failure.textContent='Failed';element('final-tool').append(failure);reconcile();const failed=state();failure.remove();
    const stopped=document.createElement('span');stopped.dataset.slot='aui_assistant-message-stopped';element('final').append(stopped);reconcile();const interrupted=state();stopped.remove();reconcile();
    document.documentElement.dataset.codexChatLook='false';const disabled=state();
    clearTurnActivityDecorations(pair);const cleaned=state();
    return {legacyOff,live,awaiting,settled,expanded,foldedAgain,resumed,emptyTrailingShell,lateContent,failed,interrupted,disabled,cleaned,restored:pair.innerHTML===original,preserved:Object.entries(saved).every(([id,saved])=>element(id)===saved.node&&saved.node.parentNode===saved.parent&&saved.node.textContent===saved.text)};
  `)
  const protectedIds=['user','unclassified','system-note','generated-image','final-answer','media-tool','nested-image','artifact-tool','nested-artifact','final-alert','global-alert']
  const phases={legacyOff:result.legacyOff,live:result.live,settled:result.settled,expanded:result.expanded.state,foldedAgain:result.foldedAgain,resumed:result.resumed,emptyTrailingShell:result.emptyTrailingShell,lateContent:result.lateContent,failed:result.failed,interrupted:result.interrupted,disabled:result.disabled,cleaned:result.cleaned}
  for(const [label,phase] of Object.entries(phases)) {
    for(const id of protectedIds) assert.equal(phase.visible[id],true,`${label}: preserve ${id}`)
    assert.equal(phase.actions,true,`${label}: preserve native final controls`)
  }
  for(const [label,phase] of Object.entries({legacyOff:result.legacyOff,settled:result.settled,foldedAgain:result.foldedAgain,emptyTrailingShell:result.emptyTrailingShell})) {
    assert.equal(phase.phase,'completed',label)
    assert.equal(phase.label,'Worked for 1m 5s',label)
    assert.equal(phase.expanded,'false',label)
    assert.equal(phase.disabled,false,label)
    for(const id of ['interim-tool','final-tool','thinking','changed-files']) assert.equal(phase.visible[id],false,`${label}: fold only ${id}`)
  }
  for(const [label,phase] of Object.entries({live:result.live,resumed:result.resumed,lateContent:result.lateContent})) {
    assert.equal(phase.disabled,true,`${label}: no completed disclosure`)
    assert.equal(phase.expanded,'true',label)
    for(const id of ['interim-tool','final-tool','thinking','changed-files']) assert.equal(phase.visible[id],true,`${label}: fail open for ${id}`)
  }
  for(const [slot,receipt] of Object.entries(result.awaiting)) {
    assert.equal(receipt.visible,true,slot);assert.equal(receipt.sameNode,true,slot);assert.equal(receipt.clicks,1,slot)
    assert.equal(receipt.state.phase,'working',slot)
    for(const [id,visible] of Object.entries(receipt.state.visible)) assert.equal(visible,true,`${slot}: ${id}`)
  }
  assert.equal(result.expanded.clicks,1,'original native tool handler is retained')
  assert.equal(result.expanded.state.expanded,'true')
  for(const [id,visible] of Object.entries(result.expanded.state.visible)) assert.equal(visible,true,id)
  for(const [label,phase] of Object.entries({failed:result.failed,interrupted:result.interrupted,disabled:result.disabled,cleaned:result.cleaned})) {
    for(const [id,visible] of Object.entries(phase.visible)) assert.equal(visible,true,`${label}: ${id}`)
  }
  assert.equal(result.failed.label,null)
  assert.equal(result.interrupted.label,null)
  assert.equal(result.cleaned.label,null)
  assert.equal(result.cleaned.phase,null)
  assert.equal(result.restored,true,'cleanup restores native DOM byte-for-byte')
  assert.equal(result.preserved,true,'every native node, parent and text is retained')
})
