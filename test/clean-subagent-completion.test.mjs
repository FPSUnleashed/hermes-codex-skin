import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

// The same browser contract can be run against the installed snapshot before repair.
const pluginUrl = process.env.CODEX_CLEAN_TEST_PLUGIN
  ? new URL(process.env.CODEX_CLEAN_TEST_PLUGIN, `file://${process.cwd()}/`)
  : new URL('../codex-chat-look/plugin.js', import.meta.url)
const source = (await readFile(pluginUrl, 'utf8'))
  .replace(/^import .*$/gm, '')
  .replace(/export default\s*\{/, 'globalThis.testPlugin = {')
const heading = 'Subagent Tasks Completed: inspect, verify'
const message = (id, text, actions = '') => `<div id="${id}" data-role="assistant" data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">${text}</div>${actions}</div>`
const actions = '<div data-slot="aui_msg-actions">Copy</div>'
// Native BackgroundResult > ScaffoldRow > DisclosureRow ancestry, verified
// against the installed index-esaFDn00.js renderer and its source components.
const notice = (id, label = heading, body = 'Worker results', extra = '') => `<div id="${id}" data-slot="aui_background-result" ${extra}><div data-conversation-scaffold><div class="group/disclosure-row relative flex w-full"><button type="button" aria-expanded="true"><span class="flex min-w-0 flex-col gap-0.5"><span class="flex min-w-0 items-center gap-1.5"><span class="min-w-0 truncate">${label}</span></span></span><span aria-hidden="true">⌄</span></button><span data-slot="timeline-timestamp">12:00</span></div></div><div class="whitespace-pre-wrap">${body}</div></div>`

async function fixture(html, body) {
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', {
      frameId: frameTree.frame.id,
      html: `<html data-codex-chat-look="true" data-codex-clean-transcript="on"><head></head><body>${html}</body></html>`
    })
    return await browser.evaluate(`(async () => {
      const host = {}, PALETTE_AREA = 'palette', THEMES_AREA = 'themes', TITLEBAR_AREAS = { center: 'center' }, jsx = () => null, useEffect = () => {};
      ${source}
      const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
      const element = id => document.getElementById(id);
      const visible = id => { const node = element(id); return Boolean(node.getClientRects().length) && getComputedStyle(node).visibility !== 'hidden'; };
      const marked = id => element(id).getAttribute('data-codex-clean-interim');
      const reconcile = () => { for (const pair of document.querySelectorAll('[data-slot="aui_turn-pair"]')) reconcileCleanTranscript(pair); };
      ${body}
    })()`)
  } finally {
    browser.close()
  }
}

test('Clean transcript hides only settled native subagent completion notices in both renderer placements', async () => {
  const html = `<div data-slot="aui_turn-pair" id="pair">
    <div data-role="user" data-slot="aui_user-message-root" id="user">${heading}</div>
    <div data-slot="aui_response-group">
      ${message('interim', 'Working')}
      <div data-role="system" data-slot="aui_system-message-root" id="system-wrapper">${notice('system-completion')}<p id="system-sibling">Keep this system detail</p></div>
      ${message('final', heading, actions)}
    </div>
    ${notice('direct-completion')}
  </div>`
  const result = await fixture(html, `
    const original = element('pair').innerHTML;
    reconcile();
    const settled = { system: visible('system-completion'), direct: visible('direct-completion'), systemMarked: marked('system-completion'), directMarked: marked('direct-completion'), final: visible('final'), user: visible('user'), sibling: visible('system-sibling'), text: element('final').textContent };
    element('final').setAttribute('data-streaming', 'true'); reconcile();
    const resumed = { system: visible('system-completion'), direct: visible('direct-completion'), marked: marked('direct-completion') };
    element('final').removeAttribute('data-streaming'); reconcile();
    document.documentElement.dataset.codexCleanTranscript = 'off';
    const cssOff = { system: visible('system-completion'), direct: visible('direct-completion') };
    reconcile();
    const off = { system: visible('system-completion'), direct: visible('direct-completion'), marked: marked('direct-completion') };
    document.documentElement.dataset.codexCleanTranscript = 'on'; reconcile(); clearCleanTranscriptDecorations();
    return { settled, resumed, cssOff, off, restored: element('pair').innerHTML === original, cleanedVisible: visible('system-completion') && visible('direct-completion') };
  `)
  assert.equal(result.settled.direct, false, 'direct native completion remains visible after the final answer')
  assert.equal(result.settled.system, false, 'system-wrapped native completion remains visible after the final answer')
  assert.equal(result.settled.systemMarked, 'true')
  assert.equal(result.settled.directMarked, 'true')
  assert.equal(result.settled.final, true)
  assert.equal(result.settled.user, true)
  assert.equal(result.settled.sibling, true)
  assert.equal(result.settled.text, `${heading}Copy`)
  assert.deepEqual(result.resumed, { system: true, direct: true, marked: null })
  assert.deepEqual(result.cssOff, { system: true, direct: true })
  assert.deepEqual(result.off, { system: true, direct: true, marked: null })
  assert.equal(result.restored, true, 'cleanup restores native DOM byte-for-byte')
  assert.equal(result.cleanedVisible, true)
})

test('Clean transcript preserves active, unproven, unrelated, error and genuine message content', async () => {
  const html = `<div data-slot="aui_turn-pair" id="settled">
    <div data-role="user" data-slot="aui_user-message-root" id="genuine-user">${heading}${notice('user-lookalike')}</div>
    <div data-slot="aui_response-group"><div data-role="system" data-slot="aui_system-message-root" id="unrelated-system">Connection restored</div>
    <div data-role="system" data-slot="aui_system-message-root">${notice('process', 'Process completed: command', heading)}</div></div>
    ${notice('direct-process', 'Background process finished', heading)}
    ${notice('nonanchored', `Quoted ${heading}`)}
    ${notice('body-only', 'Worker status', `<span class="font-medium">${heading}</span>`)}
    ${notice('error', heading, '<div role="alert">Worker failed</div>')}
    <div role="alert" id="ancestor-error">${notice('error-inside-alert')}</div>
    <div data-role="system" data-slot="aui_system-message-root" id="system-error"><div role="alert">Connection failed</div></div>
    <div data-slot="aui_response-group">${message('genuine-assistant', `${heading}${notice('assistant-lookalike')}`, actions)}</div>
    <div data-slot="aui_turn-pair" id="nested-unproven">${notice('nested-completion')}</div>
  </div>
  <div data-slot="aui_turn-pair" id="active">${notice('active-completion')}${message('active-final', 'Previous answer', actions)}<div role="status">Running</div></div>
  <div data-slot="aui_turn-pair" id="unproven">${notice('unproven-completion')}${message('unproven-answer', 'Answer without actions')}</div>
  <div data-slot="aui_turn-pair" id="late-content">${notice('late-completion')}${message('old-final', 'Final', actions)}${message('new-content', 'More work')}</div>
  ${notice('orphan-completion')}`
  const ids = ['genuine-user', 'user-lookalike', 'unrelated-system', 'process', 'direct-process', 'nonanchored', 'body-only', 'error', 'ancestor-error', 'error-inside-alert', 'system-error', 'genuine-assistant', 'assistant-lookalike', 'nested-completion', 'active-completion', 'unproven-completion', 'late-completion', 'orphan-completion']
  const result = await fixture(html, `
    reconcile();
    return Object.fromEntries(${JSON.stringify(ids)}.map(id => [id, { visible: visible(id), marker: marked(id) }]));
  `)
  for (const id of ids) {
    assert.equal(result[id].visible, true, `${id} must remain visible`)
    assert.equal(result[id].marker, null, `${id} must not acquire a completion marker`)
  }
})

test('native runtime reconciles late direct notifications and restores them on resume and teardown', async () => {
  const result = await fixture(`<div data-slot="aui_thread-content"><div data-slot="aui_turn-pair" id="pair">${message('final', 'Final answer', actions)}</div></div>`, `
    const atom = value => ({ get: () => value, subscribe: () => () => {} });
    host.state = { activeSessionId: atom('test'), profile: atom('default'), gateway: atom('open') };
    const waitFor = async predicate => {
      const limit = performance.now() + 3000;
      while (!predicate()) {
        if (performance.now() > limit) throw new Error('Runtime reconciliation timed out');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    const stop = installBehaviorRuntime();
    try {
      await waitFor(() => element('pair').hasAttribute('data-codex-clean-settled'));
      element('pair').insertAdjacentHTML('beforeend', ${JSON.stringify(notice('late-direct'))});
      await waitFor(() => marked('late-direct') === 'true');
      const hidden = !visible('late-direct');
      element('final').dataset.streaming = 'true';
      await waitFor(() => marked('late-direct') === null);
      const resumed = visible('late-direct');
      element('final').removeAttribute('data-streaming');
      await waitFor(() => marked('late-direct') === 'true');
      stop();
      await waitFor(() => marked('late-direct') === null);
      return { hidden, resumed, restored: visible('late-direct'), final: visible('final'), settled: element('pair').hasAttribute('data-codex-clean-settled') };
    } catch (error) { stop(); throw error; }
  `)
  assert.deepEqual(result, { hidden: true, resumed: true, restored: true, final: true, settled: false })
})
