import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

const source = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.testPlugin = {')
const md = (id, text = id) => `<div class="aui-md" id="${id}">${text}</div>`
const footer = id => `<div data-slot="aui_msg-actions" id="${id}"><button onclick="nativeClicks++">Copy</button></div>`
const root = (id, body, tail = '') => `<div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="${id}" id="${id}"><div data-slot="aui_assistant-message-content">${body}</div>${tail}</div>`
async function fixture(body) {
  const b = await chromium()
  try {
  await b.call('Emulation.setFocusEmulationEnabled', { enabled: true })
  const { frameTree } = await b.call('Page.getFrameTree')
  await b.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<!doctype html><html data-codex-chat-look="true"><head></head><body><section data-session-anchor="workspace"><div data-slot="aui_turn-pair"><div data-role="user" data-message-id="native-user">Question</div>${body}</div></section></body></html>` })
  await b.evaluate(`(() => {
    const atom = value => ({ get: () => value, subscribe: () => () => {} });
    const host = { state: { activeSessionId: atom('test'), profile: atom('default'), gateway: atom('open') }, onEvent: () => () => {} };
    const jsx = () => null, useEffect = () => {}, useRef = () => ({}), useQuery = () => ({});
    const THEMES_AREA = 'themes', PALETTE_AREA = 'palette', TITLEBAR_AREAS = { center: 'center' };
    ${source}
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    window.el = id => document.getElementById(id); window.p = document.querySelector('[data-slot="aui_turn-pair"]');
    window.project = active => reconcileTurnActivity(p, '', null, 'owner', undefined, active ? '5s' : '', { active, settled: !active });
    window.reset = () => clearTurnActivityDecorations(); window.nativeClicks = 0;
    window.visible = id => { let n = el(id); if (!n) return false; for (; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return true; };
  })()`)
  return b
  } catch (error) { b.close(); throw error }
}
async function key(b, key, code, windowsVirtualKeyCode) {
  for (const type of ['keyDown', 'keyUp']) await b.call('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, ...(type === 'keyDown' ? { text: key === 'Enter' ? '\r' : key } : {}) })
}

test('Chrome: identical live/history prose shows only the latest and real keyboard expands without native clicks', async () => {
  const b = await fixture(root('history', md('earlier', 'Same response'), footer('old-actions')) + root('assistant-stream-real', md('latest', 'Same response'), footer('current-actions')))
  try {
    await b.evaluate(`window.saved = [...p.querySelectorAll('[data-role="assistant"],.aui-md,[data-slot="aui_msg-actions"]')].map(n => [n,n.parentNode,n.textContent]); project(true)`)
    assert.deepEqual(await b.evaluate(`[visible('earlier'), visible('latest'), visible('old-actions'), visible('current-actions'), p.querySelector('[data-codex-turn-activity]').disabled, nativeClicks]`), [false, true, false, true, false, 0])
    await b.evaluate(`p.querySelector('[data-codex-turn-activity]').focus()`)
    await key(b, ' ', 'Space', 32)
    assert.deepEqual(await b.evaluate(`[visible('earlier'), visible('latest'), visible('old-actions'), nativeClicks, document.activeElement.getAttribute('aria-expanded')]`), [true, true, true, 0, 'true'])
    await key(b, 'Enter', 'Enter', 13)
    await b.evaluate(`project(true); project(false)`)
    assert.deepEqual(await b.evaluate(`[visible('earlier'), visible('latest'), nativeClicks, saved.every(([n,parent,text]) => n.isConnected && n.parentNode === parent && n.textContent === text)]`), [false, true, 0, true])
    await b.evaluate(`reset()`)
    assert.deepEqual(await b.evaluate(`[visible('earlier'), visible('old-actions'), p.querySelectorAll('[data-codex-previous-reply],[data-codex-latest-reply],[data-codex-turn-activity]').length]`), [true, true, 0])
  } finally { b.close() }
})

test('Chrome: composite history, tools and separate live final use the same reversible display policy', async () => {
  const body = root('composite', md('progress') + '<div data-slot="tool-block" id="tool"><button>Read file</button></div>' + md('old-final', 'Final')) + root('live', md('final-a', 'Final introduction') + '<div data-slot="aui_generated-image"><img id="media" alt="Generated result"></div>' + md('final-b', 'Final conclusion'), footer('actions'))
  const b = await fixture(body)
  try {
    await b.evaluate(`project(true)`)
    assert.deepEqual(await b.evaluate(`['progress','old-final','final-a','final-b','media','tool'].map(visible)`), [false, false, true, true, true, true])
    await b.evaluate(`project(false)`)
    assert.deepEqual(await b.evaluate(`['progress','old-final','final-a','final-b','media','tool'].map(visible)`), [false, false, true, true, true, false])
    await b.evaluate(`p.querySelector('[data-codex-turn-activity]').click()`)
    assert.deepEqual(await b.evaluate(`['progress','old-final','final-a','final-b','media','tool'].map(visible)`), [true, true, true, true, true, true])
  } finally { b.close() }
})

test('Chrome: late approvals fail open immediately, removing the latest reply reveals previous prose before reconciliation', async () => {
  const b = await fixture(root('old', md('previous')) + root('current', md('newest'), footer('actions')))
  try {
    await b.evaluate(`project(true); el('previous').insertAdjacentHTML('beforeend','<div data-slot="tool-approval-inline"><button id="approve">Approve</button></div>')`)
    assert.deepEqual(await b.evaluate(`[visible('previous'), visible('approve'), nativeClicks]`), [true, true, 0])
    await b.evaluate(`el('approve').parentNode.remove(); el('current').remove()`)
    assert.equal(await b.evaluate(`visible('previous')`), true)
    await b.evaluate(`project(true)`)
    assert.equal(await b.evaluate(`visible('previous') && !p.querySelector('[data-codex-previous-reply]')`), true)
  } finally { b.close() }
})
