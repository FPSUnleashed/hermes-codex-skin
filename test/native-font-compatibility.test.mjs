import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

// The same tests run against the frozen stable bundle for RED, not edited CSS.
const loader = process.env.CODEX_FONT_BASELINE
  ? pathToFileURL(`${process.env.CODEX_FONT_BASELINE}/test/helpers/load-plugin.mjs`)
  : new URL('./helpers/load-plugin.mjs', import.meta.url)
const { loadPluginInternals } = await import(loader)
const { CSS, UPDATE_CSS, BROWSER_PALETTE_CSS, T3_SUBAGENT_CSS } = await loadPluginInternals(['CSS', 'UPDATE_CSS', 'BROWSER_PALETTE_CSS', 'T3_SUBAGENT_CSS'])
assert.equal(typeof CSS, 'string')
assert.equal(typeof UPDATE_CSS, 'string')
assert.equal(typeof BROWSER_PALETTE_CSS, 'string')
assert.equal(typeof T3_SUBAGENT_CSS, 'string')
const sourceRoot = process.env.CODEX_FONT_BASELINE
  ? pathToFileURL(`${process.env.CODEX_FONT_BASELINE}/`)
  : new URL('../', import.meta.url)
const inboxSource = (await Promise.all(['inbox-row-ui.js', 'inbox-runtime.js'].map(name =>
  readFile(new URL(`src/${name}`, sourceRoot), 'utf8')))).join('\n')
const nativeCSS = await readFile(new URL('./fixtures/native-font-contract.css', import.meta.url), 'utf8')
const receipts = []
const families = ['"User Reading", serif', '"User Changed Live", sans-serif', '"Theme Body", serif']

// Native ancestry: sidebar > section/row; thread-content > assistant root >
// content > .aui-md; streaming > disclosure > body > reasoning > .aui-md;
// composer-root/surface/rich-input and the native shared sent-edit composer.
const markup = `
<div id="root"><div data-tree-group="grp-sessions"><aside data-slot="sidebar">
 <button id="nav" data-font-ui data-slot="sidebar-menu-button">New chat</button>
 <button class="group/section-label"><span><span id="section" data-font-ui>Projects</span></span></button>
 <div class="row-hover"><span id="thread" data-font-ui class="text-[0.8125rem]">Thread title</span></div>
 <div data-codex-inbox-row-ui><button id="inbox" data-font-ui data-slot="row-button">Inbox row</button></div>
 <div data-sessions-mode="sessions"><div data-slot="sidebar-group"><button class="group/section-label">Pinned</button></div><div data-slot="sidebar-group"><button class="group/section-label">Sessions</button></div></div>
</aside></div><main><div data-slot="aui_thread-content">
 <div data-slot="aui_user-message-root"><span id="user" data-font-ui data-slot="aui_user-inline-text">User prose</span></div>
 <div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">
  <button id="worked" data-font-ui data-codex-turn-activity>Worked for 1m</button>
  <div id="tool-row" data-font-ui data-tool-row data-conversation-scaffold><button id="tool-toggle" data-font-ui>Read file</button><pre><code id="tool-code">Native output</code></pre></div>
  <div id="tool-summary" data-font-ui data-tool-summary data-conversation-scaffold><button id="summary-toggle" data-font-ui>Read 2 files</button></div>
  <div data-slot="connector-card"><span id="connector-label" data-font-ui>Native connector</span></div>
  <div class="aui-md">
  <p id="answer" data-font-ui>Assistant prose <code id="inline-code">const inline = true</code></p>
  <pre id="pre"><code id="block-code">const block = true</code></pre>
 </div></div></div>
 <div data-streaming="true"><div data-slot="aui_thinking-disclosure"><button id="thinking" data-font-ui>Thinking <span id="thinking-label" data-font-ui>live</span></button>
  <div data-slot="aui_thinking-body"><div><div data-slot="aui_reasoning-text"><div class="aui-md"><p id="reasoning" data-font-ui>Reasoning <code id="reasoning-code">code</code></p></div></div></div></div>
 </div></div>
 <div data-slot="composer-root"><div data-slot="composer-surface"><div id="composer" data-font-ui data-slot="composer-rich-input" contenteditable="true">Draft</div>
  <div role="status" aria-live="polite"><button id="voice" data-font-ui>Playback</button></div>
 </div></div>
 <div data-slot="aui_edit-composer-root"><div data-slot="composer-surface"><div id="edit" data-font-ui data-slot="composer-rich-input" contenteditable="true">Edit</div></div>
  <button id="edit-send" data-font-ui data-codex-edit-send>Save</button><button id="edit-cancel" data-font-ui data-codex-edit-cancel>Cancel</button>
 </div>
</div><input id="input" data-font-ui><textarea id="textarea" data-font-ui></textarea><button id="button" data-font-ui>Native action</button>
<div class="cm-editor" style="font-family:var(--font-mono)"><div id="code-editor" class="cm-content" contenteditable="true">editable code</div></div>
<div class="xterm" style="font-family:'Terminal Choice',monospace"><textarea id="terminal" class="xterm-helper-textarea"></textarea><span id="terminal-text">terminal text</span></div>
<button id="icon-button" class="codicon">&#xea60;</button><span id="icon" class="codicon">&#xea60;</span><span id="wordmark" class="wordmark">Hermes</span>
<div data-codex-context-menu="true"><div id="menu-label" data-font-ui data-slot="dropdown-menu-label">Menu</div><div id="menu-item" data-font-ui data-slot="dropdown-menu-item">Item</div></div>
<div data-codex-history-preview><p id="history" data-font-ui>History preview</p></div>
<div data-codex-inbox-snooze-popup><button id="snooze" data-font-ui>Tomorrow</button></div>
<div data-codex-inbox-settle-notice><span id="notice" data-font-ui>Settled</span></div>
<div class="codex-update-panel"><p id="update" data-font-ui>Update panel</p></div>
</main></div>`

async function fixture() {
  const browser = await chromium()
  const html = `<!doctype html><html><head><style>${nativeCSS}</style><style>
  .codicon {font-family:codicon} .xterm-helper-textarea {font-family:inherit}
  </style></head><body>${markup}</body></html>`
  await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
  // Capture CSS from the actual Inbox runtime instead of duplicating its
  // popup/notice rules or silently omitting an undefined CSS export.
  await browser.evaluate(inboxSource)
  await browser.evaluate(`
    const store=new Map();window.fontInbox=installCodexInboxRuntime({storage:{get:k=>store.get(k),set:(k,v)=>store.set(k,v)},host:{state:{}},window});
    fontInbox.update({scope:{connectionId:'font-fixture',profile:'default'},sessions:[],liveSessions:[],liveStatusKnown:true});
    new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
  `)
  const inboxCSS = await browser.evaluate(`(()=>{const css=document.querySelector('style[data-codex-inbox-owned="style"]')?.textContent;fontInbox.dispose();return css})()`)
  assert.equal(typeof inboxCSS, 'string', 'the shipping Inbox runtime must inject its real stylesheet')
  await browser.evaluate(`
    window.skinCSS=${JSON.stringify([CSS, BROWSER_PALETTE_CSS, UPDATE_CSS, T3_SUBAGENT_CSS, inboxCSS].join('\n'))};
    window.paint=(family,theme,mode)=>{const r=document.documentElement;r.style.setProperty('--dt-font-sans',family);r.style.setProperty('--dt-font-mono','"Native Code", monospace');r.dataset.hermesTheme=theme;r.dataset.hermesMode=mode;r.classList.toggle('dark',mode==='dark')};
    window.enable=()=>{document.documentElement.dataset.codexChatLook='true';const s=document.createElement('style');s.id='skin-css';s.textContent=skinCSS;document.head.append(s)};
    window.disable=()=>{delete document.documentElement.dataset.codexChatLook;document.getElementById('skin-css')?.remove()};
    window.snapshot=()=>Object.fromEntries([...document.querySelectorAll('[id]')].filter(e=>!['root','skin-css'].includes(e.id)).map(e=>{const s=getComputedStyle(e);return[e.id,{family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,line:s.lineHeight,spacing:s.letterSpacing}]}));
  `)
  return browser
}

for (const [theme, mode] of [['codex-chat', 'light'], ['codex-chat', 'dark'], ['external-theme', 'light'], ['external-theme', 'dark']]) {
 for (const scale of [1, 1.75]) {
  test(`native chosen family stays live across UI/chat/composers and enable/disable (${theme}, ${mode}, ${scale})`, async () => {
    const browser = await fixture()
    const failures = []
    try {
      await browser.evaluate(`document.documentElement.style.setProperty('--chat-text-scale',${JSON.stringify(String(scale))})`)
      await browser.evaluate(`paint(${JSON.stringify(families[0])},${JSON.stringify(theme)},${JSON.stringify(mode)})`)
      const native = await browser.evaluate('snapshot()')
      await browser.evaluate('enable()')
      const initial = await browser.evaluate('snapshot()')
      for (const [step, family] of families.entries()) {
        // Exactly the native applyTheme write; no skin reload, settings writes,
        // font registration, MutationObserver, or captured font value.
        await browser.evaluate(`paint(${JSON.stringify(family)},${JSON.stringify(theme)},${JSON.stringify(mode)})`)
        const actual = await browser.evaluate('snapshot()')
        const ids = await browser.evaluate("[...document.querySelectorAll('[data-font-ui]')].map(e=>e.id)")
        for (const id of ids) {
          if (actual[id].family !== family) failures.push({ step, id, expected: family, actual: actual[id].family })
          assert.deepEqual({ ...actual[id], family: initial[id].family }, initial[id], `native family changes leave skin size/weight/line/spacing unchanged: ${id}`)
        }
        receipts.push({ theme, mode, scale, step, family, actual })
      }
      await browser.evaluate('disable()')
      const disabled = await browser.evaluate('snapshot()')
      const uiIds = await browser.evaluate("[...document.querySelectorAll('[data-font-ui]')].map(e=>e.id)")
      for (const id of uiIds) assert.equal(disabled[id].family, families.at(-1), `disable preserves the latest native preference: ${id}`)
      // All native values restore, not merely the body family.
      for (const id of Object.keys(native)) assert.deepEqual({ ...disabled[id], family: native[id].family }, native[id], `disable restores native typography: ${id}`)
      await browser.evaluate(`paint(${JSON.stringify(families[0])},${JSON.stringify(theme)},${JSON.stringify(mode)});enable()`)
      const reenabled = await browser.evaluate('snapshot()')
      assert.deepEqual(reenabled, initial, 'reenabling is deterministic')
      assert.deepEqual(failures, [], 'all regular surfaces follow the native current font')
    } finally { browser.close() }
  })
 }
}

test('native code, editable code, terminal and icon families survive skin and live family changes', async () => {
  const browser = await fixture()
  const ids = ['inline-code', 'pre', 'block-code', 'reasoning-code', 'tool-code', 'code-editor', 'terminal', 'terminal-text', 'icon-button', 'icon', 'wordmark']
  const failures = []
  try {
    await browser.evaluate(`paint(${JSON.stringify(families[0])},'external-theme','dark')`)
    const native = await browser.evaluate('snapshot()')
    assert.equal(native['inline-code'].family, '"Native Code", monospace')
    assert.equal(native['code-editor'].family, '"Native Code", monospace')
    assert.equal(native.terminal.family, '"Terminal Choice", monospace')
    assert.equal(native.icon.family, 'codicon')
    await browser.evaluate('enable()')
    for (const family of families) {
      await browser.evaluate(`paint(${JSON.stringify(family)},'external-theme','dark')`)
      const actual = await browser.evaluate('snapshot()')
      for (const id of ids) {
        const expected = id === 'wordmark' ? `Collapse, ${family}` : native[id].family
        if (actual[id].family !== expected) failures.push({ family, id, expected, actual: actual[id].family })
      }
      receipts.push({ preservation: true, family, actual: Object.fromEntries(ids.map(id => [id, actual[id]])) })
    }
    await browser.evaluate('disable()')
    const disabled = await browser.evaluate('snapshot()')
    for (const id of ids.filter(id => id !== 'wordmark')) assert.equal(disabled[id].family, native[id].family)
    assert.deepEqual(failures, [], 'skin must not flatten specialized native families')
  } finally { browser.close() }
})

test.after(async () => {
  if (process.env.CODEX_FONT_EVIDENCE) await writeFile(process.env.CODEX_FONT_EVIDENCE, JSON.stringify(receipts, null, 2))
})
