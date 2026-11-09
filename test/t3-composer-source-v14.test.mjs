import { referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

// Execute the authenticated component, then follow its selected source role.
// This non-browser seam checks endpoints only, not compositor/material paint.
const host=referenceRoot('HERMES_THEME_SOURCE_ROOT', 'HERMES_DESKTOP_SOURCE_ROOT')
const upstream=referenceRoot('T3_THEME_SOURCE_ROOT')
assert.ok(upstream,'Explicit authenticated T3 source root is required')
const target=process.env.T3_COMPOSER_TARGET_ROOT||fileURLToPath(new URL('../',import.meta.url))
const ts=createRequire(pathToFileURL(`${host}/package.json`))('typescript')
const component=await readFile(`${upstream}/apps/web/src/components/chat/ComposerSurface.tsx`,'utf8')
const sourceCSS=await readFile(`${upstream}/apps/web/src/index.css`,'utf8')
const context={exports:{},React:{createElement:(type,props,...children)=>({type,props,children})},cn:(...values)=>values.flat().filter(Boolean).join(' ')}
vm.runInNewContext(ts.transpileModule(component.replace(/^import[^\n]+\n/gm,''),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText,context)
const shell=context.exports.ComposerSurface.Shell({}).props.className.split(/\s+/)
const declaration=prefix=>{
  const matches=shell.filter(c=>c.startsWith(`${prefix}[--chat-composer-glass-surface:`))
  assert.equal(matches.length,1)
  return matches[0].slice(`${prefix}[--chat-composer-glass-surface:`.length,-1)
}
assert.ok(shell.includes('before:bg-(--chat-composer-glass-surface)/(--glass-opacity)'))
assert.match(sourceCSS,/--glass-opacity:\s*80%;/)
const roleFor=(id,mode)=>{
  const variable=declaration(id==='t3-code'?(mode==='dark'?'dark:':''):'[html[data-theme-id]_&]:')
  if(variable==='var(--card)')return 'surface'
  if(variable==='var(--surface-raised)')return 'surface-raised'
  assert.equal(variable,'var(--app-theme-surface-raised)')
  return 'surface-raised'
}
const {loadPluginInternals}=await import(pathToFileURL(`${target}/test/helpers/load-plugin.mjs`))
const {plugin,t3ThemePaintCSS,T3_SOURCE_PALETTES}=await loadPluginInternals(['t3ThemePaintCSS','T3_SOURCE_PALETTES'])
const themes=[],disposers=[]
plugin.register({storage:{get:(_k,f)=>f,set:()=>assert.fail('Preference write')},register:e=>{if(e.area==='themes'&&e.data.name.startsWith('codex-t3-'))themes.push(e.data)},onDispose:fn=>disposers.push(fn)})
test.after(()=>{for(const fn of disposers.reverse())fn()})
assert.equal(themes.length,6)
for(const theme of themes)for(const mode of ['light','dark'])test(`${theme.name}/${mode}: executed Shell role and 80% endpoint feed composer, backing and status`,()=>{
  const id=theme.name==='codex-t3-chat'?'t3-chat':theme.name==='codex-t3-code'?'t3-code':theme.name.slice('codex-t3-'.length)
  const scope=`html[data-codex-chat-look='true'][data-hermes-theme='${theme.name}'][data-hermes-mode='${mode}']`
  const start=theme.customCSS.indexOf(scope+'{'),end=theme.customCSS.indexOf('}',start)
  assert.ok(start>=0&&end>start)
  const rule=theme.customCSS.slice(start,end+1)
  const expected=`--codex-t3-composer-fill:color-mix(in srgb, var(--codex-t3-${roleFor(id,mode)}) 80%, var(--codex-t3-canvas));--codex-composer-fill:var(--codex-t3-composer-fill);`
  assert.ok(rule.includes(expected),`${id}/${mode}: missing source-selected endpoint ${expected}`)
  assert.ok(theme.customCSS.includes(`${scope} [data-slot='composer-surface'],${scope} [data-slot='composer-surface'] > [aria-hidden='true']{--composer-fill:var(--codex-t3-composer-fill)!important;background:var(--codex-composer-fill)!important;}`))
  assert.equal(t3ThemePaintCSS(id,T3_SOURCE_PALETTES[id]),theme.customCSS,'Shipping factory and registered CSS agree')
})