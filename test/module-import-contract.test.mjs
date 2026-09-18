import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const asModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
test('installed plugin parses as an actual ESM module after SDK import rewriting', async () => {
  const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url),'utf8')
  assert.ok(!source.includes('\u0000'),'no literal NUL in runtime module')
  const modules = {
    '@hermes/plugin-sdk': asModule('export const host={};export const useQuery=()=>({});export const PALETTE_AREA="palette", THEMES_AREA="themes", TITLEBAR_AREAS={center:"center"};'),
    react: asModule('export function useEffect(){};export const useRef=()=>({current:null});'),
    'react/jsx-runtime': asModule('export function jsx(){return null}')
  }
  const rewritten = source.replace(/from\s+(['"])([^'"]+)\1/g, (all,quote,name) => {
    assert.ok(modules[name],`unsupported bare import: ${name}`)
    return `from ${JSON.stringify(modules[name])}`
  })
  const loaded = await import(asModule(rewritten))
  assert.equal(loaded.default.id,'codex-chat-look')
  assert.equal(typeof loaded.default.register,'function')
  const contributions=[]
  loaded.default.register({storage:{get:(key,fallback)=>fallback,set:()=>{}},register:item=>contributions.push(item)})
  assert.ok(contributions.some(item=>item.id==='theme'))
  assert.ok(contributions.some(item=>item.id==='style-runtime'))
  assert.ok(!contributions.some(item=>item.id==='toggle-titlebar-autohide'))
})
