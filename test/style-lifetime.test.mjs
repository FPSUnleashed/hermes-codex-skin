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
      window.enableSkin=()=>{
        const disposers=[];
        fixturePlugin.register({onDispose:f=>disposers.push(f),storage:{get:(_key,fallback)=>fallback,set:()=>{}},register:()=>{}});
        return ()=>disposers.splice(0).forEach(f=>f());
      };
      window.skinState=()=>({styles:document.querySelectorAll('#codex-chat-look-styles').length,active:document.documentElement.dataset.codexChatLook||null});
      window.disableSkin=enableSkin();disableSkin();
    })()`)
    await browser.evaluate('new Promise(r=>setTimeout(r,50))')
    assert.deepEqual(await browser.evaluate('skinState()'), { styles: 0, active: null }, 'unload before deferred setup must prevent activation')

    await browser.evaluate('window.disableSkin=enableSkin();new Promise(r=>setTimeout(r,50))')
    assert.deepEqual(await browser.evaluate('skinState()'), { styles: 1, active: 'true' })
    await browser.evaluate('disableSkin();window.disableSkin=enableSkin();new Promise(r=>setTimeout(r,500))')
    assert.deepEqual(await browser.evaluate('skinState()'), { styles: 1, active: 'true' }, 'retired cleanup must not delete replacement styles')
    await browser.evaluate('disableSkin();new Promise(r=>setTimeout(r,500))')
    assert.deepEqual(await browser.evaluate('skinState()'), { styles: 0, active: null }, 'true plugin unload restores native presentation')
  } finally {
    browser.close()
  }
})
