import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp,writeFile,rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'
const execFile=promisify(execFileCallback)
const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(p=>p&&existsSync(p))
test('native browser header reservation spacers match tabstrip color',async()=>{
 const {CSS,BROWSER_PALETTE_CSS}=await loadPluginInternals(['CSS','BROWSER_PALETTE_CSS'])
 const dir=await mkdtemp(path.join(tmpdir(),'codex-header-color-'))
 const file=path.join(dir,'test.html')
 try{
  await writeFile(file,`<!doctype html><html data-codex-chat-look="true" data-hermes-theme="codex-chat" data-hermes-mode="dark"><head><style>
:root{--theme-background-seed:#111;--theme-sidebar-seed:#1c1c1c;--theme-foreground:#fcfcfc;--theme-card-seed:#212121;--theme-accent-soft:#2c2c2c;--ui-editor-surface-background:rgb(17,17,17);--ui-sidebar-surface-background:rgb(28,28,28);--ui-row-active-background:rgb(44,44,44)}
body{margin:0}#header{display:flex;height:34px;background:var(--ui-sidebar-surface-background)}#tabs{display:flex;flex:1;height:100%;background:var(--ui-sidebar-surface-background)}.reservation{width:100px;flex-shrink:0}
${CSS}${BROWSER_PALETTE_CSS}</style></head><body><div data-tree-group="browser-group" data-window-top><div data-panel-header id="header"><div aria-hidden="true" class="reservation"></div><div data-zone-tabstrip="browser-group" id="tabs"><div role="tablist"><div role="tab" aria-selected="true">Browser</div><span><button id="add">+</button></span></div></div><div aria-hidden="true" class="reservation"></div></div></div><script>
const header=document.getElementById('header'),tabs=document.getElementById('tabs');let clicks=0;document.getElementById('add').onclick=()=>clicks++;document.getElementById('add').click();document.getElementById('add').click();const enabled={header:getComputedStyle(header).backgroundColor,tabs:getComputedStyle(tabs).backgroundColor,clicks};document.documentElement.removeAttribute('data-codex-chat-look');const disabled=getComputedStyle(header).backgroundColor;document.title=btoa(JSON.stringify({enabled,disabled}));</script></body></html>`)
  const {stdout}=await execFile(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--dump-dom',pathToFileURL(file).href],{maxBuffer:1024*1024})
  const result=JSON.parse(Buffer.from(stdout.match(/<title>([^<]+)<\/title>/)[1],'base64').toString())
  assert.equal(result.enabled.tabs,'rgb(17, 17, 17)')
  assert.equal(result.enabled.header,result.enabled.tabs,'left/right control reservations must not paint gray blocks around black tabs')
  assert.equal(result.enabled.clicks,2)
  assert.equal(result.disabled,'rgb(28, 28, 28)')
 }finally{await rm(dir,{recursive:true,force:true})}
})
