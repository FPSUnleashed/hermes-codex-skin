import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'
import { loadPluginInternals as loadInstalledBaseline } from '../../../t3-contour-color-fix/candidate/test/helpers/load-plugin.mjs'

async function registrations(load) {
  const entries=[],disposers=[]
  const {plugin}=await load()
  try {
    plugin.register({storage:{get:(_key,fallback)=>fallback,set:()=>assert.fail('No preference writes authorized')},register:entry=>entries.push(JSON.parse(JSON.stringify(entry))),onDispose:fn=>disposers.push(fn)})
    return entries
  } finally { for(const dispose of disposers.reverse())dispose() }
}

const statusRole='--codex-color-status-panel:var(--codex-t3-surface)!important;'
const replaceOnce=(text,from,to)=>{
  assert.equal(text.split(from).length-1,1,`exactly one allowed CSS fragment: ${from}`)
  return text.replace(from,to)
}
function removeHistoricalStatusRole(entries) {
  const themes=entries.filter(e=>e.area==='themes'&&e.data?.name?.startsWith('codex-t3-'))
  assert.equal(themes.length,6,'all six T3 palettes remain covered')
  for(const theme of themes) for(const mode of ['light','dark']) {
    const scope=`html[data-codex-chat-look='true'][data-hermes-theme='${theme.data.name}'][data-hermes-mode='${mode}']`
    const start=theme.data.customCSS.indexOf(scope+'{'),end=theme.data.customCSS.indexOf('}',start)
    assert.ok(start>=0&&end>start)
    const rule=theme.data.customCSS.slice(start,end+1)
    const next=replaceOnce(rule,statusRole,'')
    theme.data.customCSS=theme.data.customCSS.slice(0,start)+next+theme.data.customCSS.slice(end+1)
  }
  return entries
}
async function compareRegistrations(before,after) {
  before=removeHistoricalStatusRole(structuredClone(before))
  const universal=before.find(e=>e.area==='palette'&&e.id==='toggle-universal-inbox')
  assert.equal(universal.data.label,'Codex Skin: Universal Inbox')
  universal.data.label='Codex Skin: Universal Inbox (Beta)'
  universal.data.keywords.push('beta')
  const t3=entries=>entries.filter(e=>e.area==='themes'&&e.data?.name?.startsWith('codex-t3-'))
  assert.equal(t3(before).length,6);assert.equal(t3(after).length,6)
  const untouched=entries=>entries.filter(e=>!t3(entries).includes(e))
  assert.deepEqual(untouched(after),untouched(before))
  for(const next of t3(after)) {
  const old=t3(before).find(e=>e.data.name===next.data.name)
  assert.deepEqual({...next,data:{...next.data,customCSS:old.data.customCSS} },old)
  // Only the source-backed T3 composer endpoint and its backing override may
  // differ. Every other registration, palette and CSS byte stays exact.
  let css=next.data.customCSS
  for(const mode of ['light','dark']) {
    const scope=`html[data-codex-chat-look='true'][data-hermes-theme='${next.data.name}'][data-hermes-mode='${mode}']`
    const start=css.indexOf(scope+'{'),end=css.indexOf('}',start)
    assert.ok(start>=0&&end>start)
    const rule=css.slice(start,end+1)
    const role=next.data.name==='codex-t3-code'&&mode==='light'?'surface':'surface-raised'
    const cleaned=replaceOnce(rule,`--codex-t3-composer-fill:color-mix(in srgb, var(--codex-t3-${role}) 80%, var(--codex-t3-canvas));--codex-composer-fill:var(--codex-t3-composer-fill);`,'')
    css=css.slice(0,start)+cleaned+css.slice(end+1)
    css=replaceOnce(css,`${scope} [data-slot='composer-surface'],${scope} [data-slot='composer-surface'] > [aria-hidden='true']{--composer-fill:var(--codex-t3-composer-fill)!important;background:var(--codex-composer-fill)!important;}\n`,'')
  }
  assert.deepEqual(css,old.data.customCSS)
  }
}

test('source-backed T3 composer fills remain isolated alongside Beta and exact status-role removal', async () => {
  await compareRegistrations(await registrations(loadInstalledBaseline),await registrations(loadPluginInternals))
})

test('registration comparator rejects mutation of another T3 role', async () => {
  const before=await registrations(loadInstalledBaseline),after=await registrations(loadPluginInternals)
  const theme=after.find(e=>e.area==='themes'&&e.data?.name==='codex-t3-chat')
  const role='--ui-text-primary:var(--codex-t3-text)!important;'
  assert.equal(theme.data.customCSS.split(role).length-1,2)
  theme.data.customCSS=theme.data.customCSS.replace(role,'--ui-text-primary:red!important;')
  await assert.rejects(compareRegistrations(before,after),{code:'ERR_ASSERTION'})
})
