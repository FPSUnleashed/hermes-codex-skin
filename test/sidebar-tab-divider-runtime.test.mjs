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

test('Sessions and Bots keep their tab geometry without a visible divider', async t => {
  const chrome = chromeExecutable()

  if (!chrome) {
    t.skip('Chrome or Chromium is required for computed-style verification')

    return
  }

  const { CSS } = await loadPluginInternals(['CSS'])
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-sidebar-tabs-'))
  const fixturePath = path.join(tempDir, 'fixture.html')
  const html = `<!doctype html>
<html data-codex-chat-look="true">
  <head>
    <meta charset="utf-8">
    <title>pending</title>
    <style>
      * { box-sizing: border-box; }
      [data-zone-tabstrip] { display: flex; height: 28px; }
      [role='tablist'] { display: flex; }
      [role='tab'] { width: 64px; height: 28px; pointer-events: auto; }
      [role='tab'] + [role='tab'] { border-left: 1px solid rgb(224, 218, 198); }
      [data-active='true'] { box-shadow: inset 0 -2px 0 rgb(103, 94, 53); }
      ${CSS}
    </style>
  </head>
  <body>
    <div data-tree-group="grp-sessions">
      <div data-zone-tabstrip="grp-sessions">
        <div role="tablist">
          <div data-active="true" data-tree-tab="sessions" role="tab">SESSIONS</div>
          <div data-active="false" data-tree-tab="hermes-bots:pane" role="tab">BOTS</div>
        </div>
      </div>
    </div>
    <div data-tree-group="grp-other">
      <div data-zone-tabstrip="grp-other">
        <div role="tablist">
          <div data-tree-tab="one" role="tab">ONE</div>
          <div data-tree-tab="two" id="other-second" role="tab">TWO</div>
        </div>
      </div>
    </div>
    <script>
      const sessions = document.querySelector('[data-tree-tab="sessions"]')
      const bots = document.querySelector('[data-tree-tab="hermes-bots:pane"]')
      const other = document.getElementById('other-second')
      const sessionsStyle = getComputedStyle(sessions)
      const botsStyle = getComputedStyle(bots)
      const otherStyle = getComputedStyle(other)
      document.title = btoa(JSON.stringify({
        sessionsUnderline: sessionsStyle.boxShadow,
        botsBorderWidth: botsStyle.borderLeftWidth,
        botsBorderColor: botsStyle.borderLeftColor,
        botsPointerEvents: botsStyle.pointerEvents,
        otherBorderColor: otherStyle.borderLeftColor
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

    assert.equal(result.botsBorderWidth, '1px')
    assert.equal(result.botsBorderColor, 'rgba(0, 0, 0, 0)')
    assert.equal(result.botsPointerEvents, 'auto')
    assert.notEqual(result.sessionsUnderline, 'none')
    assert.equal(result.otherBorderColor, 'rgb(224, 218, 198)')
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
