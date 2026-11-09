import assert from 'node:assert/strict'
import test from 'node:test'
import { actions, message, transcriptFixture } from './helpers/transcript-activity-fixture.mjs'

test('replacement activity crosses native response groups, reversibly preserving final, media and running turns', async () => {
  const html = `<div data-slot="aui_turn-pair" id="settled"><div data-role="user" id="user">Question</div><div data-slot="aui_response-group">${message('interim', '<div class="aui-md" id="commentary">Commentary</div>')}${message('tools', '<div data-slot="tool-block" id="tool"><button id="native-tool">Ran command</button><pre id="result">Native result</pre></div><div data-slot="aui_thinking-disclosure" id="thought">Thought</div>')}${message('media', '<div data-slot="aui_generated-image" id="image">Generated image</div>')}${message('final', '<div class="aui-md" id="answer">Final answer</div>', actions)}</div></div><div data-slot="aui_turn-pair" id="running"><div data-slot="aui_response-group">${message('live', '<div class="aui-md">Working</div><div data-slot="tool-block" id="live-tool">Running command</div>', '', 'data-streaming="true"')}${message('previous', '<div class="aui-md">Previous</div>', actions)}</div></div>`
  const r = await transcriptFixture(html, `
    const ids=['commentary','tool','result','thought','image','answer','final-actions','user','live','live-tool'];
    element('final').querySelector('[data-slot="aui_msg-actions"]').id='final-actions';
    const nodes=Object.fromEntries(ids.map(id=>[id,{node:element(id),parent:element(id).parentNode,text:element(id).textContent}]));
    const original=element('settled').innerHTML;let clicks=0;element('native-tool').onclick=()=>clicks++;
    reconcile();
    const collapsed={phase:element('settled').dataset.codexActivityPhase,label:header('settled').textContent,expanded:header('settled').getAttribute('aria-expanded'),commentary:visible('commentary'),tool:visible('tool'),result:visible('result'),thought:visible('thought'),final:visible('answer'),media:visible('image'),actions:visible('final-actions'),live:visible('live'),liveTool:visible('live-tool'),runningPhase:element('running').dataset.codexActivityPhase,runningDisabled:header('running').disabled};
    // Earlier replies remain inspectable while the latest reply is active.
    header('running').click();
    const runningExpanded=header('running').getAttribute('aria-expanded')==='true'&&visible('previous')&&visible('live-tool');
    header('running').click();
    const runningRefolded=header('running').getAttribute('aria-expanded')==='false'&&visible('previous')&&visible('live-tool');
    header('settled').click();element('native-tool').click();
    const expanded={commentary:visible('commentary'),tool:visible('tool'),result:visible('result'),thought:visible('thought'),aria:header('settled').getAttribute('aria-expanded'),clicks};
    header('settled').click();reconcile();
    const refolded=!visible('tool')&&!visible('commentary');
    const preserved=Object.entries(nodes).every(([id,saved])=>element(id)===saved.node&&saved.node.parentNode===saved.parent&&saved.node.isConnected&&saved.node.textContent===saved.text);
    document.documentElement.dataset.codexCleanTranscript='off';reconcile();
    const retiredOffDoesNotDriveProjection=!visible('tool')&&visible('answer');
    document.documentElement.dataset.codexChatLook='false';
    const disabled=ids.every(visible);
    clearTurnActivityDecorations();
    return {collapsed,runningExpanded,runningRefolded,expanded,refolded,preserved,retiredOffDoesNotDriveProjection,disabled,restored:element('settled').innerHTML===original,cleaned:!header('settled')&&ids.every(id=>marked(id)===null)};
  `)
  assert.deepEqual(r.collapsed, { phase:'completed', label:'Worked', expanded:'false', commentary:false, tool:false, result:false, thought:false, final:true, media:true, actions:true, live:true, liveTool:true, runningPhase:'working', runningDisabled:false })
  assert.deepEqual(r.expanded, { commentary:true, tool:true, result:true, thought:true, aria:'true', clicks:1 })
  for (const field of ['runningExpanded','runningRefolded','refolded','preserved','retiredOffDoesNotDriveProjection','disabled','restored','cleaned']) assert.equal(r[field], true, field)
})
