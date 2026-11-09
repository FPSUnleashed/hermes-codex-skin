import { testDependencyRequire } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import test from 'node:test'
import {universalFixture} from './helpers/universal-fixture.mjs'

const nativeRequire = testDependencyRequire()
const React = nativeRequire('react')
const {renderToStaticMarkup} = nativeRequire('react-dom/server')
const moduleUrl = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64')
// T3 removed the old Clean transcript setting; require every current command.
const paletteIds = ['share-usage-statistics', 'toggle-complete-messages', 'toggle-composer-width', 'toggle-pinned-user-messages', 'toggle-floating-sidebar', 'toggle-inbox-only', 'toggle-universal-inbox', 'toggle-inbox']

// Rewrite only supported package imports, as the Desktop ESM loader does.
// Do not strip imports, evaluate as a classic script or inject production bindings.
async function loadShippingPlugin(file) {
  const source = await readFile(file, 'utf8')
  const sdk = moduleUrl(`export const host={state:{profile:{get:()=> 'default'},focusedSessionOwner:{get:()=>null}}},PALETTE_AREA='palette',THEMES_AREA='themes',queryClient={};export const useQuery=()=>({}),useValue=atom=>atom?.get?.(),profileColor=()=>null,profileColorSoft=()=>null;`)
  const imports = {
    '@hermes/plugin-sdk': sdk,
    react: pathToFileURL(nativeRequire.resolve('react')).href,
    'react/jsx-runtime': pathToFileURL(nativeRequire.resolve('react/jsx-runtime')).href
  }
  const rewritten = source.replace(/from '([^']+)'/g, (_match, name) => {
    assert.ok(imports[name], 'Unexpected shipping import: ' + name)
    return `from '${imports[name]}'`
  })
  const directory = await mkdtemp(join(tmpdir(), 'palette-esm-'))
  try {
    const path = join(directory, 'plugin.mjs')
    await writeFile(path, rewritten)
    return (await import(pathToFileURL(path).href)).default
  } finally { await rm(directory, {recursive:true,force:true}) }
}

for (const name of ['plugin.js', 'desktop/plugin.js']) {
  test(`shipping ESM palette icons and contribution components render with real React (${name})`, async () => {
    assert.equal('Codicon' in globalThis, false, 'Missing production bindings must not be injected')
    // Reload-retention WeakMaps need window, not a browser document or consent UI.
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    assert.equal('document' in globalThis, false)
    assert.equal('confirm' in globalThis, false)
    globalThis.window = Object.create(null)
    const entries = [], disposals = []
    try {
      const plugin = await loadShippingPlugin(process.env.CODEX_INBOX_TEST_BUNDLE || new URL('../codex-chat-look/' + name, import.meta.url))
      plugin.register({storage:{get:(_key, fallback)=>fallback},register:entry=>entries.push(entry),onDispose:fn=>disposals.push(fn)})
      const palette = entries.filter(entry=>entry.area==='palette')
      assert.deepEqual(palette.map(entry=>entry.id), paletteIds)
      assert.ok(palette.some(entry=>entry.id==='toggle-universal-inbox'))
      for (const entry of palette) {
        assert.equal(typeof entry.data.detail(), 'string', entry.id)
        if (entry.data.icon) renderToStaticMarkup(React.createElement(entry.data.icon, {className:'palette-icon'}))
      }
      for (const entry of entries) {
        const render = entry.render || entry.data?.render
        if (render) renderToStaticMarkup(React.createElement(render, {sessionId:'fixture-session'}))
      }
    } finally {
      try { for (const dispose of disposals.reverse()) dispose() }
      finally {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
        else delete globalThis.window
      }
    }
  })
}

test('registered palette callbacks cycle settings without injected icons or no-op JSX',()=>universalFixture(async browser=>{
  assert.equal(await browser.evaluate("'Codicon' in window"), false)
  const receipts = await browser.evaluate(`(async()=>{
    const result=[];
    for(const entry of contributions.filter(c=>c.area===PALETTE_AREA&&c.id!=='share-usage-statistics')){
      const before=entry.data.detail();
      await entry.data.run();await flush();
      const after=entry.data.detail();
      let turns=1;
      while(entry.data.detail()!==before&&turns<4){await entry.data.run();await flush();turns++}
      result.push({id:entry.id,before,after,restored:entry.data.detail()===before});
    }
    return result;
  })()`)
  assert.deepEqual(receipts.map(receipt=>receipt.id), paletteIds.filter(id=>id!=='share-usage-statistics'))
  for(const receipt of receipts){assert.notEqual(receipt.after,receipt.before,receipt.id);assert.equal(receipt.restored,true,receipt.id)}
  assert.deepEqual(await browser.evaluate('errors'),[])
}))
