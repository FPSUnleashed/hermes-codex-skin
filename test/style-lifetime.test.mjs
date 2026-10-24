import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

const source = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]*\n/gm, '')
  .replace('export default', 'const fixturePlugin =')

test('styles follow plugin lifetime, including immediate disable and rapid replacement', async () => {
  const browser = await chromium()
  try {
    await browser.call('Page.navigate', { url: 'data:text/html,<!doctype html><html><head></head><body><main>Native content</main></body></html>' })
    await browser.evaluate(`(() => {
      const host={state:{activeSessionId:{get:()=>null},profile:{get:()=> 'default'}}};
      const PALETTE_AREA='palette',THEMES_AREA='themes',jsx=()=>null;
      ${source}
      // This style-only fixture has no backend or SDK cache. Query lifecycle
      // is exercised with the real shared client in inbox-observer.test.mjs.
      startCodexInboxObserver = () => () => {};
      const saved=new Map();
      window.enableSkin=()=>{
        const disposers=[];
        fixturePlugin.register({onDispose:f=>disposers.push(f),storage:{get:(key,fallback)=>saved.has(key)?saved.get(key):fallback,set:(key,value)=>saved.set(key,value)},register:item=>{if(item.id==='toggle-floating-sidebar')window.floatingCommand=item.data}});
        return ()=>disposers.splice(0).forEach(f=>f());
      };
      window.skinState=()=>({styles:document.querySelectorAll('#codex-chat-look-styles').length,active:document.documentElement.dataset.codexChatLook||null});
      window.disableSkin=enableSkin();disableSkin();
    })()`)
    await browser.evaluate('new Promise(r=>setTimeout(r,50))')
    assert.deepEqual(await browser.evaluate('skinState()'), { styles: 0, active: null }, 'unload before deferred setup must prevent activation')

    await browser.evaluate('window.disableSkin=enableSkin();new Promise(r=>setTimeout(r,50))')
    assert.deepEqual(await browser.evaluate('skinState()'), { styles: 1, active: 'true' })
    assert.equal(await browser.evaluate('floatingCommand.detail()'), 'On')
    await browser.evaluate('floatingCommand.run()')
    assert.equal(await browser.evaluate('document.documentElement.dataset.codexFloatingSidebar'), 'off')
    await browser.evaluate('disableSkin();window.disableSkin=enableSkin();new Promise(r=>setTimeout(r,500))')
    assert.deepEqual(await browser.evaluate('skinState()'), { styles: 1, active: 'true' }, 'retired cleanup must not delete replacement styles')
    assert.equal(await browser.evaluate('document.documentElement.dataset.codexFloatingSidebar'), 'off', 'saved palette choice survives hot reload')
    await browser.evaluate('disableSkin();new Promise(r=>setTimeout(r,500))')
    assert.deepEqual(await browser.evaluate('skinState()'), { styles: 0, active: null }, 'true plugin unload restores native presentation')
    assert.equal(await browser.evaluate('document.documentElement.hasAttribute("data-codex-floating-sidebar")'), false, 'disable removes the Floating sidebar presentation attribute')
  } finally {
    browser.close()
  }
})
