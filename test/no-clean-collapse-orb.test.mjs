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

function chromeExecutable() {
  return [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].find(candidate => candidate && existsSync(candidate))
}

function decodeSnapshot(output) {
  const encoded = output.match(/<title>([^<]+)<\/title>/)?.[1]
  assert.ok(encoded, 'runtime fixture did not emit its snapshot')
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
}

const internals = await loadPluginInternals([
  'CSS',
  'cleanPairActive',
  'cleanPartMustStayVisible',
  'cleanRootHasMeaningfulContent',
  'cleanRootMustStayVisible',
  'clearCleanTranscriptDecorations',
  'reconcileCleanTranscript'
])

test('Clean transcript waits for final, hides settled execution chrome, and fails open on resume', async t => {
  const chrome = chromeExecutable()
  if (!chrome) {
    t.skip('Chrome or Chromium is required for computed-style verification')
    return
  }

  for (const name of [
    'cleanPairActive',
    'cleanPartMustStayVisible',
    'cleanRootHasMeaningfulContent',
    'cleanRootMustStayVisible',
    'clearCleanTranscriptDecorations',
    'reconcileCleanTranscript'
  ]) {
    assert.equal(typeof internals[name], 'function', `${name} must be executable runtime code`)
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-clean-transcript-'))
  const fixturePath = path.join(tempDir, 'fixture.html')
  const definitions = [
    internals.clearCleanTranscriptDecorations,
    internals.cleanPairActive,
    internals.cleanPartMustStayVisible,
    internals.cleanRootHasMeaningfulContent,
    internals.cleanRootMustStayVisible,
    internals.reconcileCleanTranscript
  ].map(fn => fn.toString()).join('\n')

  const html = `<!doctype html>
<html data-codex-chat-look="true" data-codex-clean-transcript="off">
<head><meta charset="utf-8"><style>${internals.CSS}</style></head>
<body>
  <div data-slot="aui_turn-pair" id="pair">
    <div data-role="user" id="user">User prompt</div>
    <div data-role="assistant" data-slot="aui_assistant-message-root" id="interim">
      <div data-slot="aui_assistant-message-content">
        <p>Intermediate commentary</p>
        <div data-slot="tool-block" id="interim-tool">Read file</div>
      </div>
    </div>
    <div data-role="system" data-slot="aui_system-message-root" id="system-note">steered</div>
    <div data-role="assistant" data-slot="aui_assistant-message-root" id="image-root">
      <div data-slot="aui_assistant-message-content">
        <div data-slot="aui_generated-image" id="generated-image">Generated image</div>
      </div>
    </div>
    <div data-role="assistant" data-slot="aui_assistant-message-root" id="final">
      <div data-slot="aui_assistant-message-content">
        <p id="final-answer">Final answer</p>
        <div data-slot="aui_thinking-disclosure" id="thinking">Thought</div>
        <div data-slot="tool-block" id="final-tool">Terminal</div>
        <div data-slot="tool-block" id="media-tool"><div data-slot="aui_generated-image" id="nested-image">Generated image in tool</div></div>
        <div data-slot="tool-block" id="artifact-tool"><div data-slot="aui_artifact-card" id="nested-artifact">Artifact in tool</div></div>
        <div role="alert" id="final-alert">Important error</div>
      </div>
      <div data-slot="aui_msg-actions" id="final-actions">Copy</div>
      <div data-slot="aui_changed-files" id="changed-files">2 files changed</div>
    </div>
  </div>
  <div role="alert" id="global-alert">Global warning</div>
  <script>
    ${definitions}
    const pair = document.getElementById('pair')
    const display = id => getComputedStyle(document.getElementById(id)).display
    const state = () => ({
      settled: pair.getAttribute('data-codex-clean-settled'),
      interimMarked: document.getElementById('interim').getAttribute('data-codex-clean-interim'),
      imageMarked: document.getElementById('image-root').getAttribute('data-codex-clean-interim'),
      interim: display('interim'),
      interimTool: display('interim-tool'),
      system: display('system-note'),
      image: display('generated-image'),
      finalAnswer: display('final-answer'),
      finalActions: display('final-actions'),
      finalTool: display('final-tool'),
      mediaTool: display('media-tool'),
      nestedImage: display('nested-image'),
      artifactTool: display('artifact-tool'),
      nestedArtifact: display('nested-artifact'),
      thinking: display('thinking'),
      changedFiles: display('changed-files'),
      finalAlert: display('final-alert'),
      globalAlert: display('global-alert')
    })

    reconcileCleanTranscript(pair)
    const off = state()

    document.documentElement.setAttribute('data-codex-clean-transcript', 'on')
    document.getElementById('interim').setAttribute('data-streaming', 'true')
    reconcileCleanTranscript(pair)
    const live = state()

    document.getElementById('interim').removeAttribute('data-streaming')
    const approval = document.createElement('div')
    approval.setAttribute('data-slot', 'tool-approval-inline')
    document.getElementById('interim-tool').appendChild(approval)
    reconcileCleanTranscript(pair)
    const awaitingApproval = state()

    approval.remove()
    reconcileCleanTranscript(pair)
    const settled = state()

    document.getElementById('final').setAttribute('data-streaming', 'true')
    reconcileCleanTranscript(pair)
    const resumed = state()

    document.getElementById('final').removeAttribute('data-streaming')
    const emptyShell = document.createElement('div')
    emptyShell.id = 'empty-shell'
    emptyShell.setAttribute('data-role', 'assistant')
    emptyShell.setAttribute('data-slot', 'aui_assistant-message-root')
    pair.appendChild(emptyShell)
    reconcileCleanTranscript(pair)
    const emptyTrailingShell = state()

    emptyShell.textContent = 'Unclassified late content'
    reconcileCleanTranscript(pair)
    const lateContent = state()

    clearCleanTranscriptDecorations(pair)
    const cleaned = state()

    const snapshot = { off, live, awaitingApproval, settled, resumed, emptyTrailingShell, lateContent, cleaned }
    document.title = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))))
  </script>
</body>
</html>`

  try {
    await writeFile(fixturePath, html)
    const { stdout } = await execFile(
      chrome,
      ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--dump-dom', `file://${fixturePath}`],
      { maxBuffer: 4 * 1024 * 1024, timeout: 30_000 }
    )
    const result = decodeSnapshot(stdout)

    for (const [label, phase] of Object.entries({
      off: result.off,
      live: result.live,
      awaitingApproval: result.awaitingApproval,
      resumed: result.resumed,
      lateContent: result.lateContent
    })) {
      assert.equal(phase.settled, null, `${label} must fail open`)
      assert.notEqual(phase.interim, 'none', `${label} must keep interim content visible`)
      assert.notEqual(phase.finalTool, 'none', `${label} must keep tools visible`)
      assert.notEqual(phase.thinking, 'none', `${label} must keep thinking visible`)
    }

    assert.equal(result.settled.settled, 'true')
    assert.equal(result.settled.interimMarked, 'true')
    assert.equal(result.settled.imageMarked, null)
    assert.equal(result.settled.interim, 'none')
    assert.equal(result.settled.interimTool, 'none')
    assert.equal(result.settled.system, 'none')
    assert.equal(result.settled.finalTool, 'none')
    assert.notEqual(result.settled.mediaTool, 'none')
    assert.notEqual(result.settled.nestedImage, 'none')
    assert.notEqual(result.settled.artifactTool, 'none')
    assert.notEqual(result.settled.nestedArtifact, 'none')
    assert.equal(result.settled.thinking, 'none')
    assert.equal(result.settled.changedFiles, 'none')
    assert.notEqual(result.settled.image, 'none')
    assert.notEqual(result.settled.finalAnswer, 'none')
    assert.notEqual(result.settled.finalActions, 'none')
    assert.notEqual(result.settled.finalAlert, 'none')
    assert.notEqual(result.settled.globalAlert, 'none')

    assert.equal(result.emptyTrailingShell.settled, 'true')
    assert.equal(result.cleaned.settled, null)
    assert.equal(result.cleaned.interimMarked, null)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
