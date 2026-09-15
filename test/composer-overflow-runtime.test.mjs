import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

// Contenteditable/overflow ancestry matches the installed Hermes renderer.
const composer = id => `<div data-slot="composer-dock"><div data-slot="composer-root"><div data-slot="composer-surface"><div data-slot="composer-fade"><div class="grid"><div class="input-area"><div id="${id}" data-slot="composer-rich-input" contenteditable="true" role="textbox"></div></div></div></div></div></div></div>`

for (const mode of ['light', 'dark']) {
  test(`composer overflow lifecycle (${mode}): typing, clearing, resizing, remount and teardown`, { timeout: 30000 }, async () => {
    const browser = await chromium()
    const { call, evaluate } = browser
    const settle = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))')
    const snapshot = (id = 'a') => evaluate(`(() => {
      const e=document.getElementById(${JSON.stringify(id)});
      return {mask:getComputedStyle(e).maskImage,overflow:e.hasAttribute('data-codex-composer-overflow'),top:e.scrollTop,height:e.clientHeight,scroll:e.scrollHeight,text:e.textContent};
    })()`)
    const faded = state => state.mask.includes('rgba(0, 0, 0, 0)')
    const replace = async (text, id = 'a') => {
      await evaluate(`(() => {const e=document.getElementById(${JSON.stringify(id)});e.focus();const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r)})()`)
      await call('Input.insertText', { text })
      await settle()
    }
    const long = Array(30).fill('A line of draft text').join('\n')
    try {
      const { frameTree } = await call('Page.getFrameTree')
      await call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<!doctype html><html data-codex-chat-look="true" data-hermes-mode="${mode}"><head><style>
        *{box-sizing:border-box}body{margin:10px}[data-slot=composer-dock]{width:350px}
        [data-slot=composer-fade]{display:flex;flex-direction:column}.grid{display:grid}.input-area{grid-area:input;min-width:0}
        [data-slot=composer-rich-input]{overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere}
        #edit{height:60px;overflow-y:auto}
      </style></head><body>${composer('a')}${composer('b')}<div data-slot="aui_edit-composer-root"><div id="edit" data-slot="composer-rich-input" contenteditable="true">Existing message</div></div></body></html>` })
      const source = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.fixturePlugin = {')
      await evaluate(`(() => {
        const host={state:{activeSessionId:{get:()=>null},profile:{get:()=> 'default'}}},PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},useEffect=()=>{},jsx=()=>null;
        ${source}
        const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);
        window.mount=()=>installBehaviorRuntime();window.dispose=mount();
      })()`)
      await settle()
      for (const short of ['Salut', 'Deux lignes\ncourtes']) {
        await replace(short)
        assert.equal(faded(await snapshot()), false)
      }
      for (const short of ['Message court', '']) {
        await replace(long)
        await evaluate("document.getElementById('a').scrollTop=100")
        await settle()
        assert.equal(faded(await snapshot()), true, 'long scrolled draft keeps its fade')
        assert.equal(faded(await snapshot('b')), false, 'other composer stays independent')
        await replace(short)
        const cleared = await snapshot()
        assert.equal(cleared.top, 0)
        assert.equal(cleared.height, cleared.scroll)
        assert.equal(cleared.overflow, false)
        assert.equal(faded(cleared), false, 'no stale mask after replacement or deletion')
        await call('Input.insertText', { text: 'x' })
        await settle()
        assert.equal(faded(await snapshot()), false, 'ordinary typing must not revive the mask')
      }
      await replace('wrapping draft '.repeat(20))
      await evaluate("document.getElementById('a').closest('[data-slot=composer-dock]').style.width='150px'")
      await settle()
      await evaluate("document.getElementById('a').scrollTop=100")
      await settle()
      assert.equal(faded(await snapshot()), true)
      await evaluate("document.getElementById('a').closest('[data-slot=composer-dock]').style.width='700px'")
      await settle()
      assert.equal(faded(await snapshot()), false, 'widening until content fits clears the mask')
      await replace(long)
      await evaluate("document.getElementById('a').scrollTop=100")
      await settle()
      assert.equal(faded(await snapshot()), true)
      await evaluate(`window.oldComposer=document.getElementById('a');oldComposer.closest('[data-slot="composer-dock"]').remove();document.body.insertAdjacentHTML('afterbegin',${JSON.stringify(composer('a'))})`)
      await settle()
      assert.equal(await evaluate("oldComposer.hasAttribute('data-codex-composer-overflow')"), false)
      assert.equal(faded(await snapshot()), false)
      await replace(long)
      await evaluate("document.getElementById('a').scrollTop=100")
      await settle()
      assert.equal(faded(await snapshot()), true, 'replacement composer is automatically observed')
      assert.equal((await snapshot('edit')).overflow, false, 'native sent-message editor is excluded')
      await evaluate('dispose()')
      await settle()
      assert.equal(await evaluate("document.querySelectorAll('[data-codex-composer-overflow]').length"), 0)
      assert.equal(faded(await snapshot()), false)
      await evaluate('window.dispose=mount()')
      await settle()
      assert.equal(faded(await snapshot()), true, 'hot reload restores overflowing editor state')
      await evaluate("document.documentElement.removeAttribute('data-codex-chat-look')")
      await settle()
      assert.equal((await snapshot()).mask, 'none', 'all styling stays scoped to enabled skin')
      await evaluate('dispose()')
    } finally { browser.close() }
  })
}
