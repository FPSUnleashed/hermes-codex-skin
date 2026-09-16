import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

for (const mode of ['light', 'dark']) {
  test(`sidebar glass lifecycle (${mode}): mount, native handoff, disable and hot reload`, async () => {
    const browser = await chromium()
    const { call, evaluate } = browser
    const settle = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))')
    const snapshot = () => evaluate(`({edge:document.documentElement.style.getPropertyValue('--glass-rail-edge'),calls:window.resizeCalls})`)
    try {
      const { frameTree } = await call('Page.getFrameTree')
      await call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<!doctype html><html data-hermes-mode="${mode}" data-hermes-glass data-hermes-glass-scope="sidebar"><head></head><body></body></html>` })
      const source = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
        .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.fixturePlugin = {')
      await evaluate(`(() => {
        const atom={get:()=>null,subscribe:()=>()=>{}};
        const host={state:{activeSessionId:atom,profile:atom,gateway:atom},onEvent:()=>()=>{}},PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'};
        const useEffect=fn=>{window.dispose=fn()},jsx=(type,props)=>({type,props});
        ${source}
        // Model the old host contract: resize acquires the rail, then its
        // ResizeObserver owns geometry. The plugin must not set the seam itself.
        const root=document.documentElement;
        window.resizeCalls=0;window.cleanups={behavior:0,glass:0};
        const nativeObserver=new ResizeObserver(()=>measure());let observed=null;
        function measure(){const rail=document.querySelector('[data-slot="sidebar"]');if(rail!==observed){if(observed)nativeObserver.unobserve(observed);observed=rail;if(rail)nativeObserver.observe(rail)}root.style.setProperty('--glass-rail-edge',rail?Math.round(rail.getBoundingClientRect().right)+'px':'0px')}
        window.addEventListener('resize',()=>{resizeCalls++;measure()});measure();
        const behavior=installBehaviorRuntime;installBehaviorRuntime=(...args)=>{const stop=behavior(...args);return()=>{cleanups.behavior++;stop()}};
        const glass=installSidebarGlassRecovery;installSidebarGlassRecovery=(...args)=>{const stop=glass(...args);return()=>{cleanups.glass++;stop()}};
        window.mount=()=>CodexChatStyleRuntime();
        window.rail=width=>{const e=document.createElement('div');e.dataset.slot='sidebar';e.style.cssText='position:absolute;left:0;top:0;height:500px;width:'+width+'px';document.body.append(e)};
        mount();
      })()`)
      await settle()
      assert.equal((await snapshot()).edge, '0px')
      await evaluate('rail(280)')
      await settle()
      assert.equal((await snapshot()).edge, '280px')
      const calls = (await snapshot()).calls
      await evaluate(`document.querySelector('[data-slot="sidebar"]').append(document.createElement('span'))`)
      await settle()
      assert.equal((await snapshot()).calls, calls, 'ordinary sidebar content must not trigger resize')
      await evaluate(`document.querySelector('[data-slot="sidebar"]').style.width='320px'`)
      await settle()
      assert.equal((await snapshot()).edge, '320px', 'native ResizeObserver owns width changes')
      await evaluate(`document.querySelector('[data-slot="sidebar"]').remove()`)
      await settle()
      assert.equal((await snapshot()).edge, '0px')
      await evaluate('rail(340)')
      await settle()
      assert.equal((await snapshot()).edge, '340px')
      await evaluate(`document.documentElement.removeAttribute('data-hermes-glass')`)
      await settle()
      const clearCalls = (await snapshot()).calls
      await evaluate(`document.querySelector('[data-slot="sidebar"]').remove();rail(360)`)
      await settle()
      assert.equal((await snapshot()).calls, clearCalls, 'clear mode is untouched')
      await evaluate(`document.documentElement.setAttribute('data-hermes-glass','')`)
      await settle()
      assert.equal((await snapshot()).edge, '360px')
      await evaluate('dispose()')
      assert.deepEqual(await evaluate('cleanups'), { behavior: 1, glass: 1 }, 'both runtime cleanups run')
      const disabledCalls = (await snapshot()).calls
      await evaluate(`document.querySelector('[data-slot="sidebar"]').remove();rail(380)`)
      await settle()
      assert.equal((await snapshot()).calls, disabledCalls, 'disabled recovery cannot wake the host')
      await evaluate('mount()')
      await settle()
      assert.equal((await snapshot()).edge, '380px', 'hot reload repairs an already-mounted rail')
      const restoredCalls = (await snapshot()).calls
      await evaluate('dispose();mount()')
      await settle()
      assert.equal((await snapshot()).calls, restoredCalls, 'correct native seam needs no recovery')
      await evaluate(`document.querySelector('[data-slot="sidebar"]').remove();rail(400);dispose()`)
      await settle()
      assert.equal((await snapshot()).calls, restoredCalls, 'cleanup cancels pending recovery')
    } finally { browser.close() }
  })
}
