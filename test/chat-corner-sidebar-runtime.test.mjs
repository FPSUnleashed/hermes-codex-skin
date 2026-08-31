import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import { loadPluginInternals } from './helpers/load-plugin.mjs'

const execFile = promisify(execFileCallback)

function chromeExecutable() {
  return [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].find(candidate => candidate && existsSync(candidate))
}

function decodeSnapshot(output) {
  const match = output.match(/<title>([^<]+)<\/title>/)

  assert.ok(match, 'headless browser did not return the runtime snapshot')

  return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'))
}

test('the chat top-left corner rounds only beside a visible sessions sidebar', async t => {
  const chrome = chromeExecutable()

  if (!chrome) {
    t.skip('Chrome or Chromium is required for computed-style verification')

    return
  }

  const { CSS } = await loadPluginInternals(['CSS'])
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-chat-corner-'))
  const fixturePath = path.join(tempDir, 'fixture.html')
  const html = `<!doctype html>
<html data-codex-chat-look="true">
  <head>
    <meta charset="utf-8">
    <title>pending</title>
    <style>
      :root { --ui-sidebar-surface-background: rgb(23, 23, 23); }
      * { box-sizing: border-box; }
      [data-tree-split] { display: flex; background: rgb(28, 28, 28); }
      [data-tree-split] > div { position: relative; display: flex; }
      [data-tree-group] { width: 160px; height: 120px; border-radius: 0; background: white; overflow: hidden; }
      [role='separator'] { position: absolute; z-index: 20; width: 8px; cursor: col-resize; pointer-events: auto; }
      [role='separator'] > span { opacity: 0.1; }
      [role='separator'].force-hover > span { opacity: 1; }
      ${CSS}
    </style>
  </head>
  <body>
    <div data-tree-split="spl-root" id="default-split">
      <div id="sessions-track" style="flex: 0 1 180px">
        <div data-tree-group="grp-sessions"></div>
      </div>
      <div id="main-track" style="flex: 1 1 0px">
        <div id="separator" role="separator"><span></span><span></span></div>
        <div data-tree-group="grp-main" id="main-chat"></div>
      </div>
    </div>
    <div data-tree-split="spl-flipped" id="flipped-split">
      <div style="flex: 1 1 0px"><div data-tree-group="grp-main" id="flipped-chat"></div></div>
      <div style="flex: 0 1 180px"><div data-tree-group="grp-sessions"></div></div>
    </div>
    <script>
      const main = document.getElementById('main-chat')
      const mainTrack = main.parentElement
      const separator = document.getElementById('separator')
      const sessionsTrack = document.getElementById('sessions-track')
      const visible = getComputedStyle(main).borderTopLeftRadius
      const visibleBackdrop = getComputedStyle(mainTrack, '::before')
      const separatorAtRest = Array.from(separator.children, node => getComputedStyle(node).opacity)
      separator.classList.add('force-hover')
      const separatorOnHover = Array.from(separator.children, node => getComputedStyle(node).opacity)
      const separatorHitbox = {
        width: getComputedStyle(separator).width,
        cursor: getComputedStyle(separator).cursor,
        pointerEvents: getComputedStyle(separator).pointerEvents
      }
      separator.classList.remove('force-hover')
      sessionsTrack.style.display = 'none'
      const hidden = getComputedStyle(main).borderTopLeftRadius
      const hiddenBackdrop = getComputedStyle(mainTrack, '::before').content
      sessionsTrack.style.display = 'flex'
      const restored = getComputedStyle(main).borderTopLeftRadius
      const flipped = getComputedStyle(document.getElementById('flipped-chat')).borderTopLeftRadius
      const flippedBackdrop = getComputedStyle(document.getElementById('flipped-chat').parentElement, '::before')
      document.title = btoa(JSON.stringify({
        visible,
        hidden,
        restored,
        flipped,
        visibleBackdrop: {
          content: visibleBackdrop.content,
          width: visibleBackdrop.width,
          height: visibleBackdrop.height,
          backgroundColor: visibleBackdrop.backgroundColor
        },
        hiddenBackdrop,
        flippedBackdrop: flippedBackdrop.content,
        separatorAtRest,
        separatorOnHover,
        separatorHitbox
      }))
    </script>
  </body>
</html>`

  try {
    await writeFile(fixturePath, html)
    const { stdout } = await execFile(
      chrome,
      ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--dump-dom', pathToFileURL(fixturePath).href],
      { maxBuffer: 2 * 1024 * 1024 }
    )
    const result = decodeSnapshot(stdout)

    assert.deepEqual(result, {
      visible: '16px',
      hidden: '0px',
      restored: '16px',
      flipped: '0px',
      visibleBackdrop: {
        content: '""',
        width: '16px',
        height: '16px',
        backgroundColor: 'rgb(23, 23, 23)'
      },
      hiddenBackdrop: 'none',
      flippedBackdrop: 'none',
      separatorAtRest: ['0', '0'],
      separatorOnHover: ['0', '0'],
      separatorHitbox: {
        width: '8px',
        cursor: 'col-resize',
        pointerEvents: 'auto'
      }
    })
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
