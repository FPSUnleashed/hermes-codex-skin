import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

test('legacy titlebar autohide state is inert and no palette option is registered', async () => {
  const { CSS, plugin } = await loadPluginInternals(['CSS'])
  assert.doesNotMatch(CSS, /data-codex-titlebar-autohide|data-codex-titlebar-edge-trigger|data-codex-titlebar-revealed/)

  const contributions = []
  plugin.register({
    onDispose: () => {},
    storage: { get: () => 'on', set: () => {} },
    register: item => contributions.push(item)
  })
  assert.ok(contributions.some(item => item.id === 'update-runtime'))
  assert.ok(!contributions.some(item => item.id === 'toggle-titlebar-autohide'))

  const html = `<!doctype html><html data-codex-chat-look="true" data-codex-titlebar-autohide="on" data-codex-left-sidebar="closed"><head><style>${CSS}</style></head><body><div data-codex-native-titlebar id="bar"></div><div data-codex-native-titlebar-cluster id="cluster"></div></body></html>`
  const { chromium } = await import('./helpers/chromium.mjs')
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html })
    const source = (await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
      .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.fixturePlugin = {')
    await browser.evaluate(`(() => {
      window.registeredListeners=[];window.storageReads=[];
      const add=EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener=function(type,callback,...rest){
        registeredListeners.push({type,name:callback?.name||''});return add.call(this,type,callback,...rest)
      };
      const host={state:{activeSessionId:{get:()=>null},profile:{get:()=> 'default'}}},
        PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'titleBar.center',left:'titleBar.left',right:'titleBar.right'},
        useEffect=()=>{},jsx=()=>null;
      ${source}
      window.pluginDisposers=[];
      fixturePlugin.register({onDispose:f=>pluginDisposers.push(f),storage:{get:(key,fallback)=>{storageReads.push(key);return key==='titlebar-autohide'?'on':fallback},set:()=>{}},register:()=>{}});
    })()`)
    const state = await browser.evaluate(`(() => {
      const bar = document.getElementById('bar'), cluster = document.getElementById('cluster')
      return {
        barTransform: getComputedStyle(bar).transform,
        clusterTransform: getComputedStyle(cluster).transform,
        barPosition: getComputedStyle(bar).position,
        edgeTriggers: document.querySelectorAll('[data-codex-titlebar-edge-trigger]').length,
        listeners: registeredListeners.filter(x=>/titlebar/i.test(x.name)||/titlebar-autohide/i.test(x.type)).length,
        legacyRead: storageReads.includes('titlebar-autohide')
      }
    })()`)
    assert.equal(state.barTransform, 'none')
    assert.equal(state.clusterTransform, 'none')
    assert.equal(state.barPosition, 'static')
    assert.equal(state.edgeTriggers, 0)
    assert.equal(state.listeners, 0)
    assert.equal(state.legacyRead, false)
    await browser.evaluate('pluginDisposers.forEach(f=>f())')
  } finally {
    browser.close()
  }
})