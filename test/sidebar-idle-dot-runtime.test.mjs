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

test('sidebar hides only the pure-idle grey dot', async t => {
  const chrome = chromeExecutable()

  if (!chrome) {
    t.skip('Chrome or Chromium is required for computed-style verification')

    return
  }

  const { CSS } = await loadPluginInternals(['CSS'])
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-sidebar-idle-dot-'))
  const fixturePath = path.join(tempDir, 'fixture.html')
  const states = [
    ['idle-grey', "aria-hidden='true' class='size-1 rounded-full bg-(--ui-text-quaternary)'"],
    [
      'idle-project',
      "aria-hidden='true' class='size-1 rounded-full bg-(--ui-text-quaternary)' style='background-color: rgb(123, 45, 67)'"
    ],
    ['draft', "aria-hidden='true' class='size-1.5 rounded-full border border-(--ui-text-quaternary)'"],
    ['needs-input', "aria-label='Needs input' role='status' class='size-1.5 rounded-full bg-amber-500'"],
    ['working', "aria-label='Session running' role='status' class='size-1.5 rounded-full bg-(--ui-accent)'"],
    ['stalled', "aria-label='Session running' role='status' class='size-1.5 rounded-full border border-(--ui-accent)'"],
    ['background', "aria-label='Running in background' role='status' class='size-1.5 rounded-full border border-(--ui-text-tertiary)'"],
    ['unread', "aria-label='Finished' role='status' class='size-1.5 rounded-full bg-emerald-500'"]
  ]
  const rows = states
    .map(([id, attributes]) => `<div class="row-hover"><span class="flex items-center gap-0.5"><span id="${id}" ${attributes}></span></span><span>${id}</span></div>`)
    .join('')
  const snapshotScript = `
    const ids = ${JSON.stringify(states.map(([id]) => id))}
    const snapshot = Object.fromEntries(ids.map(id => {
      const element = document.getElementById(id)
      const style = getComputedStyle(element)

      return [id, {
        display: style.display,
        height: style.height,
        visibility: style.visibility,
        width: style.width
      }]
    }))

    document.title = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))))
  `
  const html = `<!doctype html>
<html data-codex-chat-look="true">
  <head>
    <meta charset="utf-8">
    <title>pending</title>
    <style>
      :root {
        --ui-accent: rgb(10, 20, 30);
        --ui-text-tertiary: rgb(100, 100, 100);
        --ui-text-quaternary: rgb(150, 150, 150);
      }
      * { box-sizing: border-box; }
      .size-1 { width: 4px; height: 4px; }
      .size-1\\.5 { width: 6px; height: 6px; }
      ${CSS}
    </style>
  </head>
  <body>
    <aside data-slot="sidebar">${rows}</aside>
    <script>${snapshotScript}</script>
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

    assert.equal(result['idle-grey'].display, 'none')

    for (const id of states.map(([id]) => id).filter(id => id !== 'idle-grey')) {
      assert.notEqual(result[id].display, 'none', `${id} must remain visible`)
      assert.notEqual(result[id].visibility, 'hidden', `${id} must remain visible`)
      assert.notEqual(result[id].width, '0px', `${id} must retain its native geometry`)
      assert.notEqual(result[id].height, '0px', `${id} must retain its native geometry`)
    }
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
