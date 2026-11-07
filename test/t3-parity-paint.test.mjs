import assert from 'node:assert/strict'
import test from 'node:test'
import {actions, message, transcriptFixture} from './helpers/transcript-activity-fixture.mjs'

// Public DOM-seam regression, not a complete Hermes window. Execute the full
// shipping module, Chromium styles, accessibility tree and native controls.
const markdown = (id, text) => `<div class="aui-md" id="${id}">${text}</div>`
const tool = '<div data-slot="tool-block" id="work"><details id="native"><summary>Read file</summary><pre>Exact native output</pre></details></div>'
const pair = content => `<section data-session-anchor="workspace"><div id="pair" data-slot="aui_turn-pair"><div data-role="user" data-message-id="user">Question</div><div data-slot="aui_response-group">${content}</div></div></section>`

test('cold earlier answer reopens after collapse, native toggles and older-footer promotion', async () => {
  const result = await transcriptFixture(pair(
    message('old-answer', markdown('old-first', 'Independent earlier answer.') + markdown('old-second', 'Earlier answer paragraph two.'))
      + message('tool-root', tool)
      + message('last-answer', markdown('last-prose', 'Latest answer.'), actions)
  ), `
    const previous = element('old-first'), parent = previous.parentNode;
    const details = element('native');
    reconcile();
    const initial = {oldFirst:visible('old-first'), oldSecond:visible('old-second'), last:visible('last-prose'), work:visible('work')};
    header().click();
    details.open = true;
    const expanded = visible('old-first') && visible('work') && details.open;
    header().click();
    element('old-answer').insertAdjacentHTML('beforeend', ${JSON.stringify(actions)});
    reconcile();
    const promoted = !visible('old-first') && !visible('old-second') && visible('last-prose');
    header().click();
    const reopened = visible('old-first') && visible('old-second') && visible('last-prose');
    header().click();
    clearTurnActivityDecorations();
    return {initial, expanded, promoted, reopened, cleanup:visible('work') && visible('old-first'), nativeIdentity:details===element('native') && details.open, messageIdentity:previous===element('old-first') && previous.parentNode===parent};
  `)
  assert.deepEqual(result, {
    initial: {oldFirst:false, oldSecond:false, last:true, work:false},
    expanded:true,
    promoted:true,
    reopened:true,
    cleanup:true,
    nativeIdentity:true,
    messageIdentity:true,
  })
})

test('plain inline and standalone earlier replies share the reversible latest-only boundary', async () => {
  const inline = await transcriptFixture(pair(message('inline', markdown('before', 'Earlier answer.') + tool + markdown('after', 'Latest answer.'), actions)), `
    reconcile();
    const closed = {before:visible('before'), after:visible('after'), work:visible('work')};
    const previous = element('before'), parent = previous.parentNode;
    header().click();
    const reopened = visible('before') && visible('after') && previous===element('before') && previous.parentNode===parent;
    return {...closed,reopened};
  `)
  const standalone = await transcriptFixture(pair(message('earlier', markdown('before', 'Earlier answer.')) + message('tool-root', tool) + message('final', markdown('after', 'Latest answer.'), actions)), `
    reconcile();
    const closed = {before:visible('before'), after:visible('after'), work:visible('work')};
    const previous = element('before'), parent = previous.parentNode;
    header().click();
    const reopened = visible('before') && visible('after') && previous===element('before') && previous.parentNode===parent;
    return {...closed,reopened};
  `)
  assert.deepEqual(inline, {before:false, after:true, work:false,reopened:true})
  assert.deepEqual(standalone, inline)
})
