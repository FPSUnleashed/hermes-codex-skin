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

test('Patched file adopts the Codex diff card without restyling ordinary tools', async t => {
  const chrome = chromeExecutable()

  if (!chrome) {
    t.skip('Chrome or Chromium is required for computed-style verification')

    return
  }

  const { CSS } = await loadPluginInternals(['CSS'])
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-patched-file-card-'))
  const fixturePath = path.join(tempDir, 'fixture.html')
  const html = `<!doctype html>
<html class="dark" data-codex-chat-look="true">
  <head>
    <meta charset="utf-8">
    <title>pending</title>
    <style>
      * { box-sizing: border-box; }
      :root {
        --ui-widget-surface-background: rgb(60, 70, 80);
        --ui-stroke-tertiary: rgb(110, 120, 130);
        --ui-text-secondary: rgb(205, 210, 215);
        --ui-diff-add-border: rgb(0, 200, 100);
        --ui-diff-add-background: rgb(0, 70, 35);
        --ui-diff-add-foreground: rgb(80, 255, 160);
        --ui-diff-remove-border: rgb(240, 80, 90);
        --ui-diff-remove-background: rgb(80, 25, 30);
        --ui-diff-remove-foreground: rgb(255, 140, 150);
      }
      [data-slot='tool-block'][data-tool-open] {
        border: 1px solid rgb(110, 120, 130);
        border-radius: 5px;
        background: rgb(20, 24, 28);
      }
      [data-tool-header] { border-bottom: 1px solid rgb(110, 120, 130); padding: 6px 8px; }
      [data-slot='file-diff-panel'] {
        max-height: 192px;
        overflow: auto;
        font: 11.2px/17px ui-monospace, monospace;
      }
      [data-slot='file-diff-panel'] > span {
        display: block;
        border-left: 2px solid transparent;
        padding: 1px 10px;
        white-space: pre;
      }
      .native-add { border-left-color: var(--ui-diff-add-border) !important; background: var(--ui-diff-add-background); color: var(--ui-diff-add-foreground); }
      .native-remove { border-left-color: var(--ui-diff-remove-border) !important; background: var(--ui-diff-remove-background); color: var(--ui-diff-remove-foreground); }
      ${CSS}
    </style>
  </head>
  <body>
    <div data-file-edit data-slot="tool-block" data-tool-open id="patched">
      <div data-tool-header id="patched-header">Patched file</div>
      <div class="relative grid w-full min-w-0 max-w-full gap-1.5 overflow-hidden p-1.5">
        <div data-slot="file-diff-panel" id="diff-panel">
          <span class="native-remove border-l-2 border-(--ui-diff-remove-border) bg-(--ui-diff-remove-background) text-(--ui-diff-remove-foreground)" id="remove-line">const oldValue = true</span>
          <span class="native-add border-l-2 border-(--ui-diff-add-border) bg-(--ui-diff-add-background) text-(--ui-diff-add-foreground)" id="add-line">const newValue = true</span>
          <span class="border-l-2" id="context-line">const stable = true</span>
        </div>
      </div>
    </div>
    <div data-slot="tool-block" data-tool-open id="ordinary">
      <div data-tool-header id="ordinary-header">Terminal</div>
      <pre id="ordinary-code">ordinary output</pre>
    </div>
    <div id="expected-add"></div>
    <script>
      const style = id => getComputedStyle(document.getElementById(id))
      const snapshot = () => ({
        patched: {
          radius: style('patched').borderRadius,
          background: style('patched').backgroundColor,
          border: style('patched').borderColor
        },
        header: {
          paddingLeft: style('patched-header').paddingLeft,
          paddingRight: style('patched-header').paddingRight
        },
        panel: {
          fontSize: style('diff-panel').fontSize,
          lineHeight: style('diff-panel').lineHeight,
          paddingTop: style('diff-panel').paddingTop,
          paddingBottom: style('diff-panel').paddingBottom
        },
        add: {
          background: style('add-line').backgroundColor,
          borderLeftWidth: style('add-line').borderLeftWidth,
          color: style('add-line').color,
          lineHeight: style('add-line').lineHeight,
          paddingLeft: style('add-line').paddingLeft,
          paddingTop: style('add-line').paddingTop
        },
        remove: {
          borderLeftWidth: style('remove-line').borderLeftWidth,
          color: style('remove-line').color
        },
        ordinary: {
          radius: style('ordinary').borderRadius,
          background: style('ordinary').backgroundColor,
          headerPaddingLeft: style('ordinary-header').paddingLeft
        }
      })
      const before = snapshot()
      document.documentElement.style.setProperty('--ui-widget-surface-background', 'rgb(90, 100, 110)')
      document.documentElement.style.setProperty('--ui-diff-add-border', 'rgb(20, 160, 240)')
      const afterThemeChange = snapshot()
      document.title = btoa(unescape(encodeURIComponent(JSON.stringify({ before, afterThemeChange }))))
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
    const { before, afterThemeChange } = decodeSnapshot(stdout)

    assert.equal(before.patched.radius, '8px')
    assert.equal(before.header.paddingLeft, '12px')
    assert.equal(before.header.paddingRight, '12px')
    assert.equal(before.panel.fontSize, '12px')
    assert.equal(before.panel.lineHeight, '18px')
    assert.equal(before.panel.paddingTop, '8px')
    assert.equal(before.panel.paddingBottom, '8px')
    assert.equal(before.add.borderLeftWidth, '0px')
    assert.equal(before.remove.borderLeftWidth, '0px')
    assert.equal(before.add.color, 'rgb(205, 210, 215)')
    assert.equal(before.remove.color, 'rgb(205, 210, 215)')
    assert.equal(before.add.lineHeight, '18px')
    assert.equal(before.add.paddingLeft, '12px')
    assert.equal(before.add.paddingTop, '0px')
    assert.equal(before.ordinary.radius, '5px')
    assert.equal(before.ordinary.background, 'rgb(20, 24, 28)')
    assert.equal(before.ordinary.headerPaddingLeft, '8px')
    assert.notEqual(before.patched.background, before.ordinary.background)
    assert.notEqual(afterThemeChange.patched.background, before.patched.background)
    assert.notEqual(afterThemeChange.add.background, before.add.background)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
