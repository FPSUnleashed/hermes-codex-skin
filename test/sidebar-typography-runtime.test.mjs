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

// Source contract from Codex Desktop app.asar, build installed 2026-08-31:
// nav = text-base (14px, 21px, 400); thread/project title = text-base +
// leading-5 (14px, 20px, 400); section title = text-base + font-medium
// (14px, 21px, 500), with the macOS system font and normal tracking/case.
test('sidebar typography matches the installed Codex hierarchy', async t => {
  const chrome = chromeExecutable()

  if (!chrome) {
    t.skip('Chrome or Chromium is required for computed-style verification')

    return
  }

  const { CSS } = await loadPluginInternals(['CSS'])
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-sidebar-typography-'))
  const fixturePath = path.join(tempDir, 'fixture.html')
  const html = `<!doctype html>
<html data-codex-chat-look="true">
  <head>
    <meta charset="utf-8">
    <title>pending</title>
    <style>
      * { box-sizing: border-box; }
      .native-nav { font-size: 13px; font-weight: 500; line-height: normal; }
      .native-primary { font-size: 13px; font-weight: 400; line-height: 13px; }
      .native-section-root {
        font-size: 10.24px;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      .native-section-copy { line-height: 10.24px; }
      ${CSS}
    </style>
  </head>
  <body>
    <aside data-slot="sidebar">
      <button class="native-nav" data-slot="sidebar-menu-button"><span>New chat</span></button>
      <button class="group/section-label">
        <span class="native-section-root">
          <span aria-hidden="true" class="dither"></span>
          <span class="native-section-copy">Projects</span>
        </span>
      </button>
      <div class="row-hover">
        <span class="native-primary hover-marquee block font-normal text-[0.8125rem] leading-none">
          <span class="hover-marquee-inner">Conversation title</span>
        </span>
      </div>
      <div class="group/workspace">
        <button><span class="native-primary min-w-0 truncate text-[0.8125rem] leading-none">Project title</span></button>
      </div>
    </aside>
    <script>
      const styles = id => {
        const style = getComputedStyle(document.querySelector(id))

        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
          lineHeight: style.lineHeight,
          textTransform: style.textTransform
        }
      }
      const snapshot = {
        nav: styles('[data-slot="sidebar-menu-button"]'),
        project: styles('[class~="group/workspace"] .native-primary'),
        section: styles('.native-section-copy'),
        thread: styles('.row-hover .hover-marquee')
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
    const systemFont = '-apple-system, system-ui, "Segoe UI", sans-serif'

    assert.deepEqual(result.nav, {
      fontFamily: systemFont,
      fontSize: '14px',
      fontWeight: '400',
      letterSpacing: 'normal',
      lineHeight: '21px',
      textTransform: 'none'
    })
    for (const level of ['project', 'thread']) {
      assert.deepEqual(result[level], {
        fontFamily: systemFont,
        fontSize: '14px',
        fontWeight: '400',
        letterSpacing: 'normal',
        lineHeight: '20px',
        textTransform: 'none'
      })
    }
    assert.deepEqual(result.section, {
      fontFamily: systemFont,
      fontSize: '14px',
      fontWeight: '500',
      letterSpacing: 'normal',
      lineHeight: '21px',
      textTransform: 'none'
    })
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
