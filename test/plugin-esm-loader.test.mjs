import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const moduleUrl = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64')

test('runtime ESM import registers autohide On by default and preserves saved choices', async () => {
  const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
  const shims = {
    '@hermes/plugin-sdk': moduleUrl("export const host={state:{activeSessionId:{get:()=>null},profile:{get:()=> 'default'}}},PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'};"),
    react: moduleUrl('export const useEffect=()=>{};'),
    'react/jsx-runtime': moduleUrl('export const jsx=()=>null;')
  }
  const rewritten = source.replace(/from '([^']+)'/g, (match, name) => {
    assert.ok(shims[name], 'Unexpected runtime import: ' + name)
    return `from '${shims[name]}'`
  })
  const { default: plugin } = await import(moduleUrl(rewritten))
  assert.equal(plugin.id, 'codex-chat-look')
  for (const saved of [undefined, 'off', 'on']) {
    const registrations = []
    plugin.register({
      storage: { get: (_key, fallback) => saved === undefined ? fallback : saved },
      register: entry => registrations.push(entry)
    })
    const command = registrations.find(entry => entry.id === 'toggle-titlebar-autohide').data
    assert.equal(command.detail(), saved === 'off' ? 'Off' : 'On')
  }
})
