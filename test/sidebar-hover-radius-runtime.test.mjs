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

test('sidebar rows own the selected radius before hover or focus', async t => {
  const chrome = chromeExecutable()

  if (!chrome) {
    t.skip('Chrome or Chromium is required for computed-style verification')

    return
  }

  const { CSS } = await loadPluginInternals(['CSS'])
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-sidebar-hover-radius-'))
  const fixturePath = path.join(tempDir, 'fixture.html')
  const html = `<!doctype html>
<html data-codex-chat-look="true">
  <head>
    <meta charset="utf-8">
    <title>pending</title>
    <style>
      * { box-sizing: border-box; }
      .row-hover { border-radius: 6px; }
      ${CSS}
    </style>
  </head>
  <body>
    <aside data-slot="sidebar">
      <div class="row-hover" id="focus-row"><button id="focus-button">Focus row</button></div>
      <div aria-current="true" class="row-hover" id="selected-row"><button>Selected row</button></div>
    </aside>
    <script>
      const focusRow = document.getElementById('focus-row')
      const selectedRow = document.getElementById('selected-row')
      const before = getComputedStyle(focusRow).borderRadius
      document.getElementById('focus-button').focus()
      const snapshot = {
        before,
        focused: getComputedStyle(focusRow).borderRadius,
        selected: getComputedStyle(selectedRow).borderRadius
      }

      document.title = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))))
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

    assert.deepEqual(result, { before: '10px', focused: '10px', selected: '10px' })
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
