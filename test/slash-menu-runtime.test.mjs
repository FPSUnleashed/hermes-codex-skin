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

test('slash drawer copies the reference frame without changing native internals', async t => {
  const chrome = chromeExecutable()

  if (!chrome) {
    t.skip('Chrome or Chromium is required for computed-style verification')

    return
  }

  const { CSS } = await loadPluginInternals(['CSS'])
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-slash-runtime-'))
  const fixturePath = path.join(tempDir, 'fixture.html')
  const nativePlacement = [
    'position:absolute',
    'left:8px',
    'bottom:4px',
    'transform:translateX(3px)',
    'display:block',
    'pointer-events:auto'
  ].join(';')
  const runtimeProbe = `
    const shell = element => {
      const style = getComputedStyle(element)

      return {
        width: style.width,
        padding: style.padding,
        borderWidth: style.borderWidth,
        borderStyle: style.borderStyle,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
        overflowX: style.overflowX,
        overflowY: style.overflowY
      }
    }
    const row = element => {
      const style = getComputedStyle(element)

      return {
        height: style.height,
        minHeight: style.minHeight,
        gap: style.gap,
        padding: style.padding,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontFamily: style.fontFamily
      }
    }
    const pickedStyles = (element, properties) => {
      const style = getComputedStyle(element)

      return Object.fromEntries(properties.map(property => [property, style[property]]))
    }
    const internals = element => ({
      group: pickedStyles(element.querySelector(':scope > .completion-group'), [
        'paddingLeft', 'paddingRight', 'paddingBottom', 'fontSize', 'fontWeight',
        'letterSpacing', 'lineHeight', 'textTransform'
      ]),
      row: pickedStyles(element.querySelector(':scope > .completion-row'), [
        'height', 'minHeight', 'gap', 'padding', 'borderRadius',
        'fontSize', 'lineHeight', 'fontFamily'
      ]),
      icon: pickedStyles(element.querySelector('.completion-icon'), [
        'display', 'width', 'height', 'minWidth', 'fontSize'
      ]),
      name: pickedStyles(element.querySelector('.completion-name'), [
        'fontSize', 'fontWeight', 'lineHeight'
      ]),
      description: pickedStyles(element.querySelector('.completion-description'), [
        'fontSize', 'fontWeight', 'lineHeight', 'overflow', 'textOverflow', 'whiteSpace'
      ])
    })
    const placement = element => {
      const style = getComputedStyle(element)

      return {
        position: style.position,
        left: style.left,
        right: style.right,
        bottom: style.bottom,
        transform: style.transform,
        display: style.display,
        pointerEvents: style.pointerEvents
      }
    }
    const scrollbar = element => {
      const track = getComputedStyle(element, '::-webkit-scrollbar-track')
      const thumb = getComputedStyle(element, '::-webkit-scrollbar-thumb')

      return {
        trackMarginBlockStart: track.marginBlockStart,
        trackMarginBlockEnd: track.marginBlockEnd,
        trackBackgroundColor: track.backgroundColor,
        thumbBorderRadius: thumb.borderRadius,
        thumbBackgroundClip: thumb.backgroundClip
      }
    }
    const attach = document.querySelector('#attach')
    const slash = document.querySelector('#slash')
    const native = document.querySelector('#native')
    const narrow = document.querySelector('#slash-narrow')
    const attachRow = attach.querySelector(':scope > button')
    const slashRow = slash.querySelector(':scope > button')
    const snapshot = () => ({
      attachShell: shell(attach),
      slashShell: shell(slash),
      attachRow: row(attachRow),
      slashRow: row(slashRow),
      nativeInternals: internals(native),
      slashInternals: internals(slash),
      slashScrollbar: scrollbar(slash)
    })
    const initial = snapshot()
    const root = document.documentElement

    root.style.setProperty('--dt-card', 'rgb(32, 32, 32)')
    root.style.setProperty('--ui-stroke-tertiary', 'rgb(69, 69, 69)')
    root.style.setProperty('--ui-text-primary', 'rgb(238, 238, 238)')
    root.style.setProperty('--ui-row-hover-background', 'rgb(51, 51, 51)')

    const themed = snapshot()
    const result = {
      initial,
      themed,
      placement: placement(slash),
      responsive: {
        shellWidth: getComputedStyle(narrow).width,
        left: getComputedStyle(narrow).left,
        right: getComputedStyle(narrow).right,
        rowInsideFrame:
          narrow.querySelector('.completion-row').getBoundingClientRect().right <=
          narrow.getBoundingClientRect().right,
        descriptionHasRoom: slash.querySelector('.completion-description').clientWidth > 0,
        descriptionFits:
          slash.querySelector('.completion-description').scrollWidth <=
          slash.querySelector('.completion-description').clientWidth
      },
      semantics: {
        role: slash.getAttribute('role'),
        groups: [...slash.querySelectorAll(':scope > div[class~="select-none"]')].map(element => element.textContent),
        commands: [...slash.querySelectorAll(':scope > button')].map(element => ({
          tag: element.tagName,
          type: element.getAttribute('type'),
          text: element.textContent
        }))
      }
    }

    document.title = btoa(unescape(encodeURIComponent(JSON.stringify(result))))
  `
  const html = `<!doctype html>
<html data-codex-chat-look="true">
  <head>
    <meta charset="utf-8">
    <title>pending</title>
    <style>
      :root {
        --dt-card: rgb(243, 243, 243);
        --ui-editor-surface-background: rgb(243, 243, 243);
        --ui-stroke-tertiary: rgb(200, 200, 200);
        --ui-text-primary: rgb(17, 17, 17);
        --ui-row-hover-background: rgb(229, 229, 229);
        --shadow-nous: 0 8px 24px rgba(0, 0, 0, 0.14);
      }
      * { box-sizing: border-box; }
      body { margin: 20px; }
      button { border: 0; background: transparent; color: inherit; font: inherit; }
      .native-drawer {
        position: absolute;
        left: 8px;
        bottom: 4px;
        width: 320px;
        max-width: calc(100% - 16px);
        overflow-y: auto;
        padding: 4px;
        color: var(--ui-text-primary);
      }
      .completion-group {
        user-select: none;
        padding: 2px 8px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.05em;
        line-height: normal;
        text-transform: uppercase;
      }
      .completion-row {
        position: relative;
        display: flex;
        width: 100%;
        align-items: center;
        gap: 8px;
        border-radius: 6px;
        padding: 4px 8px;
        text-align: left;
      }
      .completion-icon {
        display: grid;
        width: 16px;
        height: 16px;
        min-width: 16px;
        place-items: center;
        font-size: 14px;
      }
      .completion-name,
      .completion-description {
        min-width: 0;
        overflow: hidden;
        line-height: 20px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .completion-name { flex-shrink: 1; font-weight: 500; }
      .completion-description { flex: 1 1 0%; }
      ${CSS}
    </style>
  </head>
  <body>
    <div data-codex-context-menu="true" id="attach" role="menu">
      <div data-slot="dropdown-menu-label">Commands</div>
      <button data-highlighted data-slot="dropdown-menu-item" type="button">
        <svg aria-hidden width="14" height="14"></svg><span>Files</span>
      </button>
    </div>
    <div id="composer" style="position:relative;width:746px;height:420px">
      <div data-slot="composer-completion-drawer" id="slash" role="listbox" style="${nativePlacement}">
        <div class="completion-group select-none">Commands</div>
        <button class="completion-row" data-highlighted type="button"><span class="completion-icon" data-ref="command">›</span><span class="completion-name">/help</span><span class="completion-description">Show available commands and shortcuts</span></button>
        <div class="completion-group select-none">Skills</div>
        <button class="completion-row" type="button"><span class="completion-icon" data-ref="skill">›</span><span class="completion-name">/audit</span><span class="completion-description">Run the complete skill audit</span></button>
      </div>
    </div>
    <div id="native-composer" style="position:relative;width:746px;height:420px">
      <div class="native-drawer" id="native" role="listbox">
        <div class="completion-group select-none">Commands</div>
        <button class="completion-row" type="button"><span class="completion-icon">›</span><span class="completion-name">/help</span><span class="completion-description">Show available commands and shortcuts</span></button>
      </div>
    </div>
    <div id="narrow-composer" style="position:relative;width:240px;height:420px">
      <div class="native-drawer" data-slot="composer-completion-drawer" id="slash-narrow" role="listbox">
        <div class="completion-group select-none">Skills</div>
        <button class="completion-row" type="button"><span class="completion-icon">›</span><span class="completion-name">/very-long-skill-name</span><span class="completion-description">A deliberately long native description that must remain inside the frame</span></button>
      </div>
    </div>
    <script>${runtimeProbe}</script>
  </body>
</html>`

  try {
    await writeFile(fixturePath, html)
    const { stdout } = await execFile(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--dump-dom',
        pathToFileURL(fixturePath).href
      ],
      { maxBuffer: 2 * 1024 * 1024 }
    )
    const result = decodeSnapshot(stdout)

    for (const property of ['padding', 'borderWidth', 'borderStyle', 'backgroundColor', 'boxShadow', 'backdropFilter']) {
      assert.equal(result.initial.slashShell[property], result.initial.attachShell[property])
      assert.equal(result.themed.slashShell[property], result.themed.attachShell[property])
    }
    assert.deepEqual(result.initial.slashInternals, result.initial.nativeInternals)
    assert.deepEqual(result.themed.slashInternals, result.themed.nativeInternals)

    assert.equal(result.initial.attachShell.width, '240px')
    assert.equal(result.initial.attachShell.borderRadius, '12px')
    assert.equal(result.initial.slashShell.width, '736px')
    assert.equal(result.initial.slashShell.borderRadius, '12px')

    assert.deepEqual(result.initial.slashScrollbar, {
      trackMarginBlockStart: '8px',
      trackMarginBlockEnd: '8px',
      trackBackgroundColor: 'rgba(0, 0, 0, 0)',
      thumbBorderRadius: '999px',
      thumbBackgroundClip: 'padding-box'
    })
    assert.notEqual(result.themed.slashShell.backgroundColor, result.initial.slashShell.backgroundColor)
    assert.deepEqual(result.responsive, {
      shellWidth: '230px',
      left: '5px',
      right: '5px',
      rowInsideFrame: true,
      descriptionHasRoom: true,
      descriptionFits: true
    })

    assert.deepEqual(result.placement, {
      position: 'absolute',
      left: '5px',
      right: '5px',
      bottom: '4px',
      transform: 'matrix(1, 0, 0, 1, 3, 0)',
      display: 'block',
      pointerEvents: 'auto'
    })
    assert.equal(result.semantics.role, 'listbox')
    assert.deepEqual(result.semantics.groups, ['Commands', 'Skills'])
    assert.deepEqual(
      result.semantics.commands,
      [
        { tag: 'BUTTON', type: 'button', text: '›/helpShow available commands and shortcuts' },
        { tag: 'BUTTON', type: 'button', text: '›/auditRun the complete skill audit' }
      ]
    )
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
