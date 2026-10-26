import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// CI uses the pinned native excerpt; opt in to a full installed stylesheet.
const nativeCSS = await readFile(process.env.HERMES_INSTALLED_ROW_CSS || new URL('./fixtures/native-inbox-colors.css', import.meta.url), 'utf8')
const { CSS, CODEX_INBOX_ROW_UI_CSS, createCodexInboxRowUI } = await loadPluginInternals(['CSS', 'CODEX_INBOX_ROW_UI_CSS', 'createCodexInboxRowUI'])

for (const mode of ['light', 'dark']) {
  test(`shipping Inbox dots match native semantic colors and follow theme changes (${mode})`, async () => {
    const browser = await chromium()
    try {
      await browser.call('Page.setDocumentContent', {
        frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id,
        html: `<!doctype html><html class="${mode === 'dark' ? 'dark' : ''}" data-codex-chat-look="true" data-hermes-mode="${mode}"><style>${nativeCSS}</style><style>${CSS}</style><style>${CODEX_INBOX_ROW_UI_CSS}</style><style>:root{--ui-accent:#d97316;--ui-success:#71b14d;--ui-text-primary:#161616;--ui-text-secondary:#555;--ui-text-quaternary:#888;--dt-foreground:#161616;--dt-midground:#d97316;--theme-foreground:#161616;--theme-primary:#d97316;--theme-background-seed:#fafafa;--theme-sidebar-seed:#fafafa;--ui-sidebar-surface-background:#fafafa}aside{width:300px}</style><aside id="mount"></aside><span id="native-working" class="bg-(--ui-accent)"></span><span id="native-completed" class="bg-(--ui-success)"></span><span id="native-needs-input" class="bg-amber-500"></span></html>`
      })
      await browser.evaluate(`window.createCodexInboxRowUI=${createCodexInboxRowUI.toString()};window.rows={};for(const state of ['working','completed','needs-input','idle','reading','unknown']){const ui=createCodexInboxRowUI({document});ui.update({title:state,workState:state});document.getElementById('mount').append(ui.row);rows[state]=ui}window.sample=()=>Object.fromEntries(Object.entries(rows).map(([state,ui])=>{const dot=ui.row.querySelector('[data-codex-inbox-work-dot]'),arc=ui.row.querySelector('[data-codex-inbox-running-arc]');return [state,{color:getComputedStyle(dot).backgroundColor,opacity:getComputedStyle(dot).opacity,arc:getComputedStyle(arc).opacity,animation:getComputedStyle(arc,'::before').animationName,native:document.getElementById('native-'+state)?getComputedStyle(document.getElementById('native-'+state)).backgroundColor:null}]}));window.arcAnimation=rows.working.row.querySelector('[data-codex-inbox-running-arc]').getAnimations({subtree:true})[0];`)
      const before = await browser.evaluate('sample()')
      for (const state of ['working', 'completed', 'needs-input']) {
        assert.notEqual(before[state].native, 'rgba(0, 0, 0, 0)', 'native reference must resolve')
        assert.equal(before[state].color, before[state].native, `${state} dot must match the installed native Hermes color`)
        assert.equal(before[state].opacity, '1')
      }
      assert.equal(before.working.animation, 'codex-inbox-row-contour')
      assert.equal(before['needs-input'].animation, 'none')
      for (const state of ['idle', 'reading', 'unknown']) assert.equal(before[state].opacity, '0')
      await browser.evaluate(`document.documentElement.style.setProperty('--ui-accent','#8855ee');document.documentElement.style.setProperty('--ui-success','#268c91');document.documentElement.style.setProperty('--dt-midground','#8855ee');new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
      const after = await browser.evaluate('sample()')
      for (const state of ['working', 'completed']) {
        assert.notEqual(after[state].color, before[state].color, `${state} follows a theme change without rerender`)
        assert.equal(after[state].color, after[state].native)
      }
      assert.equal(after['needs-input'].color, after['needs-input'].native, 'attention stays consistent with native Hermes')
      assert.equal(await browser.evaluate(`arcAnimation===rows.working.row.querySelector('[data-codex-inbox-running-arc]').getAnimations({subtree:true})[0]`), true, 'theme change must not recreate the running animation')
    } finally { browser.close() }
  })
}
