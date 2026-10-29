import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

const source = (await readFile(process.env.CODEX_EDIT_PLUGIN_FILE || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')
const nativeCSS = await readFile(process.env.CODEX_NATIVE_CSS || new URL('./fixtures/native-sent-edit.css', import.meta.url), 'utf8')

test('sent edit keeps the bubble and native actions across themes, remount and cleanup', async () => {
  const browser = await chromium()
  try {
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html: '<!doctype html><html lang="en" data-codex-chat-look="true"><head></head><body><main style="width:640px;margin:24px"></main><div data-slot="composer-root"><div data-slot="composer-surface"><button id="main-send">↑</button></div></div><div data-codex-edit-banner="true" id="queue"><button>Save</button></div></body></html>' })
    await browser.evaluate(`window.errors=[];addEventListener('error',e=>errors.push(String(e.error)));window.host={state:Object.fromEntries(['profile','activeSessionId','gateway'].map(k=>[k,{get:()=>k==='gateway'?'open':'default',subscribe:()=>()=>{}}])),onEvent:()=>()=>{}};window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA='themes';window.TITLEBAR_AREAS={};window.PALETTE_AREA='palette';`)
    await browser.evaluate(source)
    await browser.evaluate(`(() => {
      const native=document.createElement('style');native.textContent=${JSON.stringify(nativeCSS)};document.head.append(native);
      const skin=document.createElement('style');skin.id='skin';skin.textContent=CSS;document.head.append(skin);
      window.flush=()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
      window.counts={send:0,cancel:0};window.mount=(id='edit')=>{
        const root=document.createElement('form');root.id=id;root.dataset.slot='aui_edit-composer-root';root.className='contents';
        root.innerHTML='<div class="composer-human-message-container human-execution-message-top relative flex w-full items-start rounded-md"><div class="composer-human-message standalone-glass relative flex w-full min-w-0 max-w-full flex-col gap-1.5 overflow-y-auto rounded-xl border px-3 py-2 text-left ui-prompt-input__container"><div contenteditable="true" role="textbox" data-slot="composer-rich-input" class="ui-prompt-input-editor__input max-h-48 w-full resize-none overflow-y-auto bg-transparent p-0 pr-7 outline-none">Message edited by Gabriel</div><textarea class="sr-only" aria-hidden="true" tabindex="-1"></textarea><button type="button" aria-label="Send edited message" class="absolute right-2 bottom-2 size-5"><span class="codicon codicon-arrow-up">↑</span></button></div></div>';
        const editor=root.querySelector('[contenteditable]'),send=root.querySelector('button');
        send.onpointerdown=e=>e.preventDefault();send.onclick=()=>counts.send++;
        editor.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();if(window.triggerOpen){window.triggerOpen=false;return}counts.cancel++;root.remove()}};
        document.querySelector('main').append(root);return root;
      };
      window.setTheme=(mode)=>{document.documentElement.dataset.hermesMode=mode;document.documentElement.style.cssText=mode==='light'?'--ui-base:#161616;--ui-bg-editor:#fff;--ui-chat-bubble-background:#f4f4f4;--ui-text-primary:#161616;--ui-text-secondary:#555;--ui-stroke-secondary:#ddd':'--ui-base:#eee;--ui-bg-editor:#191919;--ui-chat-bubble-background:#292929;--ui-text-primary:#eee;--ui-text-secondary:#bbb;--ui-stroke-secondary:#555';};
      setTheme('light');mount();window.cleanup=installBehaviorRuntime();
    })()`)
    await browser.evaluate('flush()')
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-codex-edit-cancel]').length"), 1, 'one real Cancel button')
    for (const mode of ['light','dark']) {
      const state=await browser.evaluate(`(async()=>{setTheme('${mode}');await flush();const root=document.querySelector('#edit'),panel=root.querySelector('.composer-human-message'),input=root.querySelector('[contenteditable]'),send=root.querySelector('[data-codex-edit-send]'),cancel=root.querySelector('[data-codex-edit-cancel]');const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};return {panel:r(panel),input:r(input),send:r(send),cancel:r(cancel),bg:getComputedStyle(panel).backgroundColor,border:getComputedStyle(panel).borderTopWidth,sendBg:getComputedStyle(send).backgroundColor,sendColor:getComputedStyle(send).color,cancelBg:getComputedStyle(cancel).backgroundColor,main:document.querySelector('#main-send').textContent,queue:document.querySelector('#queue').textContent,hit:[send,cancel].every(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})}})()`)
      assert.equal(state.bg,mode==='light'?'rgb(244, 244, 244)':'rgb(41, 41, 41)')
      assert.equal(state.border,'0px')
      assert.equal(state.sendBg,mode==='light'?'rgb(22, 22, 22)':'rgb(238, 238, 238)')
      assert.equal(state.sendColor,mode==='light'?'rgb(255, 255, 255)':'rgb(25, 25, 25)')
      assert.ok(state.send.w>=64 && state.send.h>=32)
      assert.ok(state.cancel.x<state.send.x && Math.abs(state.cancel.y-state.send.y)<1)
      assert.ok(state.input.bottom<=state.send.y && state.send.right<=state.panel.right)
      assert.ok(state.hit)
      assert.equal(state.main,'↑');assert.equal(state.queue,'Save')
    }
    await browser.evaluate("document.querySelector('[data-codex-edit-send]').click()")
    assert.equal(await browser.evaluate('counts.send'),1)
    await browser.evaluate("document.querySelector('[data-codex-edit-send]').disabled=true;document.querySelector('[data-codex-edit-send]').click()")
    assert.equal(await browser.evaluate('counts.send'),1)
    await browser.evaluate("document.querySelector('[contenteditable]').focus();window.triggerOpen=true;document.querySelector('[data-codex-edit-cancel]').click();flush()")
    assert.equal(await browser.evaluate('counts.cancel'),1)
    await browser.evaluate("document.documentElement.lang='fr';mount('second');flush()")
    assert.equal(await browser.evaluate("document.querySelector('[data-codex-edit-cancel]').textContent"),'Annuler')
    assert.equal(await browser.evaluate("document.querySelector('[data-codex-edit-send]').dataset.codexEditSend"),'Envoyer')
    await browser.evaluate("document.querySelector('main').style.width='260px';flush()")
    assert.ok(await browser.evaluate("(()=>{const p=document.querySelector('.composer-human-message'),s=document.querySelector('[data-codex-edit-send]');return s.getBoundingClientRect().right<=p.getBoundingClientRect().right})()"))
    await browser.evaluate('cleanup();window.cleanup=installBehaviorRuntime();flush()')
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-codex-edit-cancel]').length"),1,'hot reload does not duplicate Cancel')
    await browser.evaluate("window.triggerOpen=true;document.querySelector('[data-codex-edit-cancel]').click();cleanup();flush()")
    assert.equal(await browser.evaluate('counts.cancel'),1,'cleanup fences a pending Cancel retry')
    assert.equal(await browser.evaluate("document.querySelector('#second').isConnected"),true,'teardown leaves the native editor mounted')
    await browser.evaluate('new Promise(done=>setTimeout(done,350))')
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-codex-edit-cancel], [data-codex-edit-send]').length"),0)
    assert.equal(await browser.evaluate("document.querySelector('#second button').textContent"),'↑')
    assert.deepEqual(await browser.evaluate('errors'),[])
  } finally { browser.close() }
})
