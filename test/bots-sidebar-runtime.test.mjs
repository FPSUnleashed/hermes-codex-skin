import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Roster button classes and transparent pane ancestry from the installed
// Electron renderer (app.asar SHA-256 87b27675115617c1e1acf2eee1066c88a3ef62b906305b0079eb604f533a2408).
// Bots and group chats share this button, not Sessions' .row-hover primitive.
const rowClass = 'flex w-full min-w-0 max-w-full items-center gap-2.5 overflow-hidden rounded-md px-2 py-2 text-left transition-colors hover:bg-(--chrome-action-hover)'
const activeClass = 'bg-(--ui-row-active-background)'

for (const mode of ['light', 'dark', 'external', 'glass']) {
  test(`Bots sidebar matches Sessions without recoloring identity (${mode})`, async () => {
    const browser = await chromium()
    try {
      const { CSS } = await loadPluginInternals(['CSS'])
      const dark = mode === 'dark'
      const html = `<!doctype html><html data-codex-chat-look="true"
        data-hermes-theme="${mode === 'external' ? 'other' : 'codex-chat'}"
        data-hermes-mode="${dark ? 'dark' : 'light'}" ${mode === 'glass' ? 'data-hermes-glass="true"' : ''}>
        <head><style>
        :root {
          --ui-sidebar-surface-background: ${mode === 'glass' ? 'transparent' : dark ? '#181818' : '#ededed'};
          --ui-editor-surface-background: ${dark ? '#292929' : '#fafafa'};
          --ui-chat-surface-background: var(--ui-editor-surface-background);
          --ui-text-primary: ${dark ? '#eeeeee' : '#222222'};
          --ui-text-tertiary: ${dark ? '#b0b0b0' : '#666666'};
          --ui-row-hover-background: ${dark ? '#333333' : '#dddddd'};
          --ui-row-active-background: ${dark ? '#444444' : '#cccccc'};
          --chrome-action-hover: ${dark ? '#555555' : '#bbbbbb'};
          --theme-accent-soft: #3e3e3e;
          --theme-foreground: #eeeeee;
          --theme-sidebar-seed: ${dark ? '#191919' : '#f3f3f3'};
          --theme-background-seed: ${dark ? '#212121' : '#ffffff'};
        }
        body { margin: 0; color: var(--ui-text-primary); }
        [data-tree-group] { background: var(--ui-editor-surface-background); width: 300px; }
        [data-zone-tabstrip], [data-slot='sidebar'] { background: var(--ui-sidebar-surface-background); }
        button { display: block; width: 260px; height: 50px; border: 0; background: transparent; color: inherit; }
        .rounded-md, .row-hover { border-radius: 6px; }
        .row-hover:hover { background: var(--ui-row-hover-background); }
        [class~='${activeClass}'] { background: var(--ui-row-active-background); }
        [class~='hover:bg-(--chrome-action-hover)']:hover { background: var(--chrome-action-hover); }
        .secondary { color: var(--ui-text-tertiary); }
        .avatar { background: rgb(72, 115, 180); }
        .status { color: rgb(220, 150, 30); }
        ${CSS}
        </style></head><body>
        <div data-tree-group="grp-sessions" id="group">
          <div data-zone-tabstrip="grp-sessions">Sessions / Bots</div>
          <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div id="sessions" class="absolute inset-0 overflow-auto">
              <aside data-slot="sidebar" id="reference">
                <button class="row-hover" id="session-idle">Session</button>
                <button class="row-hover ${activeClass}" id="session-active">Selected session</button>
                <span class="secondary" id="session-secondary">Preview</span>
              </aside>
            </div>
            <div id="bots" class="absolute inset-0 overflow-auto" style="visibility:hidden" aria-hidden="true">
              <div class="flex h-full min-h-0 flex-col">
                <button aria-label="Bot" class="${rowClass}" id="bot-idle">
                  <span class="avatar" id="avatar">Avatar</span><span class="status" id="status">Working</span>
                  <span class="secondary" id="bot-secondary">Preview</span>
                </button>
                <button aria-label="Group" class="${rowClass} ${activeClass}" id="bot-active">Selected group</button>
                <button id="toolbar">Create bot</button>
              </div>
            </div>
          </div>
        </div>
        <div data-tree-group="grp-main" id="main">
          <button aria-label="Unrelated" class="${rowClass} ${activeClass}" id="unrelated">Other pane</button>
        </div>
        </body></html>`
      await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
      await browser.evaluate(`window.styleOf = (id, key) => getComputedStyle(document.getElementById(id))[key]`)
      const style = (id, key) => browser.evaluate(`styleOf(${JSON.stringify(id)}, ${JSON.stringify(key)})`)
      const identity = await browser.evaluate(`[styleOf('avatar','backgroundColor'), styleOf('status','color')]`)
      const other = await browser.evaluate(`[styleOf('main','backgroundColor'), styleOf('unrelated','backgroundColor'), styleOf('unrelated','borderRadius')]`)
      const sessionBackground = await style('reference', 'backgroundColor')
      const sessionSelected = await style('session-active', 'backgroundColor')
      const sessionRadius = await style('session-active', 'borderRadius')
      const sessionSecondary = await style('session-secondary', 'color')
      const hover = async id => {
        const point = await browser.evaluate(`(() => { const r=document.getElementById('${id}').getBoundingClientRect(); return {x:r.x+10,y:r.y+10}; })()`)
        await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
        return style(id, 'backgroundColor')
      }
      const sessionHover = await hover('session-idle')
      // Both panes stay mounted during a tab switch, as in the native renderer.
      await browser.evaluate(`document.getElementById('sessions').style.visibility='hidden'; document.getElementById('sessions').setAttribute('aria-hidden','true'); document.getElementById('bots').style.visibility='visible'; document.getElementById('bots').removeAttribute('aria-hidden')`)
      assert.equal(await style('group', 'backgroundColor'), sessionBackground, 'Bots must not expose the editor background')
      assert.equal(await style('bot-active', 'backgroundColor'), sessionSelected)
      assert.equal(await style('bot-active', 'borderRadius'), sessionRadius)
      assert.equal(await style('bot-idle', 'borderRadius'), sessionRadius)
      assert.equal(await style('bot-secondary', 'color'), sessionSecondary)
      assert.equal(await hover('bot-idle'), sessionHover)
      assert.equal(await hover('bot-active'), sessionSelected, 'hover must preserve selection')
      assert.equal(await style('toolbar', 'backgroundColor'), 'rgba(0, 0, 0, 0)', 'do not restyle toolbar buttons as rows')
      assert.deepEqual(await browser.evaluate(`[styleOf('avatar','backgroundColor'), styleOf('status','color')]`), identity)
      assert.deepEqual(await browser.evaluate(`[styleOf('main','backgroundColor'), styleOf('unrelated','backgroundColor'), styleOf('unrelated','borderRadius')]`), other)
      await browser.evaluate(`document.getElementById('bots').style.visibility='hidden'; document.getElementById('sessions').style.visibility='visible'`)
      assert.equal(await style('reference', 'backgroundColor'), sessionBackground)
      // Disable the skin: native paint and geometry must return without cleanup JS.
      await browser.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
      assert.equal(await style('group', 'backgroundColor'), await style('main', 'backgroundColor'))
      assert.equal(await style('bot-idle', 'borderRadius'), '6px')
    } finally {
      browser.close()
    }
  })
}
