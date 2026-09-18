import assert from 'node:assert/strict'
import { webcrypto, createHash } from 'node:crypto'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

test('public release channel uses no private credentials or diagnostic files', async () => {
 const { createSkinUpdater, BUILD_ID, UPDATE_REPO, UPDATE_IS_TEST } = await loadPluginInternals(['createSkinUpdater','BUILD_ID','UPDATE_REPO','UPDATE_IS_TEST'], { crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,AbortSignal,setTimeout,clearTimeout })
 assert.equal(BUILD_ID,'v1.8.1');assert.equal(UPDATE_REPO,'FPSUnleashed/hermes-codex-skin');assert.equal(UPDATE_IS_TEST,false)
 const root='/local/desktop-plugins',path=root+'/codex-chat-look/plugin.js'
 const next="const ID = 'codex-chat-look'\nconst BUILD_ID = 'v1.9.0'\n"
 const files=new Map([[path,"const ID = 'codex-chat-look'\nconst BUILD_ID = 'v1.8.1'\n"]]),values=new Map(),reads=[],writes=[],requests=[]
 const asset={id:201,name:'plugin.js',size:Buffer.byteLength(next),digest:'sha256:'+createHash('sha256').update(next).digest('hex'),url:'https://api.github.com/repos/FPSUnleashed/hermes-codex-skin/releases/assets/201'}
 const release={id:20,tag_name:'v1.9.0',prerelease:false,draft:false,assets:[asset]}
 const updater=createSkinUpdater({get:(k,f)=>values.has(k)?values.get(k):f,set:(k,v)=>values.set(k,v),remove:k=>values.delete(k)}, {
  desktopPluginsRoot:async()=>root,
  readPluginSource:async p=>{reads.push(p);assert.ok(files.has(p),p);return{text:files.get(p),truncated:false}},
  writeTextFile:async(p,text)=>{writes.push(p);files.set(p,text);return{path:p}}
 },async(url,opts)=>{requests.push({url,opts});return url.includes('/assets/')?new Response(next):Response.json([release])})
 try{
  updater.accept(await updater.firstPage());await updater.install()
  assert.equal(updater.state.phase,'awaiting-reload');assert.equal(files.get(path),next)
  assert.ok(requests.every(r=>r.url.startsWith('https://api.github.com/repos/FPSUnleashed/hermes-codex-skin/releases')))
  assert.ok(requests.every(r=>!r.opts.headers.Authorization))
  assert.ok(reads.every(p=>!p.includes('update-test-access')));assert.ok(writes.every(p=>!p.includes('update-test-report')))
 }finally{updater.dispose()}
})
