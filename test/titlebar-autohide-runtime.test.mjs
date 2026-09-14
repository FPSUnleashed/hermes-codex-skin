import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const execFile = promisify(execFileCallback)
const chrome = [process.env.CHROME_BIN, '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => p && existsSync(p))

test('titlebar autohide is opt-in, overlay-only on hover, and restores on sidebar open', { timeout: 30000 }, async t => {
  if (!chrome) return t.skip('Chrome required')
  const { CSS, readTitlebarAutohideMode } = await loadPluginInternals(['CSS', 'readTitlebarAutohideMode'])
  assert.equal(readTitlebarAutohideMode(), 'off')
  const temp = await mkdtemp(path.join(os.tmpdir(), 'codex-titlebar-'))
  const file = path.join(temp, 'fixture.html')
  const html = `<!doctype html><html data-codex-chat-look="true"><head><style>
*{box-sizing:border-box}html,body{margin:0;width:900px;height:600px}body{font:14px system-ui;background:#111;color:#eee}[data-contrib-shell]{position:relative;display:flex;flex-direction:column;height:600px}[data-contrib-shell]>div[class~="h-[34px]"]{position:relative;display:flex;height:34px;flex:0 0 34px;background:#222}[data-chat]{height:200px;padding:20px;background:#333}.fixed{position:fixed;z-index:70;display:flex;top:5px;height:24px}.left{left:10px}.right{right:10px}button{width:24px;height:24px;background:#555;color:#fff;border:0}#bar,#left-cluster,#right-cluster{transition:none!important}
${CSS}</style></head><body><div data-contrib-shell=""><div class="relative flex h-[34px] shrink-0 items-center" id="bar" data-codex-native-titlebar="true"><div aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-0 [-webkit-app-region:drag]"></div><div aria-hidden="true" class="pointer-events-none absolute inset-y-0 [-webkit-app-region:drag]"></div></div><div class="fixed left" id="left-cluster" data-codex-native-titlebar-cluster="true"><button id="left-toggle" aria-label="Show sidebar"><span class="codicon codicon-layout-sidebar-left"></span></button></div><div class="fixed right" id="right-cluster" data-codex-native-titlebar-cluster="true"><button aria-label="Show right sidebar"><span class="codicon codicon-layout-sidebar-right"></span></button></div><div data-slot="sidebar" id="sidebar"></div><div data-chat id="chat">chat</div></div><script>
const root=document.documentElement,bar=document.getElementById('bar'),left=document.getElementById('left-cluster'),right=document.getElementById('right-cluster'),chat=document.getElementById('chat'),toggle=document.getElementById('left-toggle');
const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,left:r.left,width:r.width,height:r.height,centerX:r.left+r.width/2,centerY:r.top+r.height/2}};
const snap=()=>({attrs:{auto:root.getAttribute('data-codex-titlebar-autohide'),side:root.getAttribute('data-codex-left-sidebar'),revealed:root.getAttribute('data-codex-titlebar-revealed'),mark:bar.getAttribute('data-codex-native-titlebar')},bar:rect(bar),left:rect(left),right:rect(right),chat:rect(chat),barPosition:getComputedStyle(bar).position,barTransform:getComputedStyle(bar).transform,leftTransform:getComputedStyle(left).transform,transition:getComputedStyle(bar).transitionDuration});
const off=snap();root.dataset.codexTitlebarAutohide='on';root.dataset.codexLeftSidebar='closed';const hidden=snap();root.dataset.codexTitlebarRevealed='true';const shown=snap();root.removeAttribute('data-codex-titlebar-revealed');toggle.setAttribute('aria-label','Hide sidebar');root.dataset.codexLeftSidebar='open';const open=snap();root.dataset.codexTitlebarAutohide='on';root.dataset.codexLeftSidebar='closed';root.dataset.codexTitlebarRevealed='true';const reduced={transition:getComputedStyle(bar).transitionDuration,position:getComputedStyle(bar).position};document.title=btoa(JSON.stringify({off,hidden,shown,open,reduced}));
</script></body></html>`
  try {
    await writeFile(file, html)
    const { stdout } = await execFile(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-prefers-reduced-motion', '--dump-dom', `file://${file}`], { maxBuffer: 2 * 1024 * 1024 })
    const title = stdout.match(/<title>([^<]+)<\/title>/)?.[1]
    assert.ok(title, 'probe completed')
    const result = JSON.parse(Buffer.from(title, 'base64').toString())
    assert.equal(result.off.barPosition, 'relative')
    assert.equal(result.hidden.barPosition, 'fixed')
    assert.equal(result.hidden.barTransform, 'matrix(1, 0, 0, 1, 0, -34)')
    assert.equal(result.hidden.leftTransform, 'matrix(1, 0, 0, 1, 0, -34)')
    assert.equal(result.shown.barTransform, 'none')
    assert.equal(result.shown.leftTransform, 'none')
    assert.equal(result.shown.chat.top, result.hidden.chat.top)
    assert.equal(result.shown.chat.left, result.hidden.chat.left)
    assert.equal(result.open.barPosition, 'relative')
    assert.equal(result.open.barTransform, 'none')
    assert.equal(result.open.leftTransform, 'none')
    assert.equal(result.reduced.transition, '0s')
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})
