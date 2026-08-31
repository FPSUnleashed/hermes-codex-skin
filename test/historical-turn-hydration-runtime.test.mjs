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
  'collectNestedTurnPairs',
  'isCleanPartMutationNode',
  'isTurnPairMutationRoot',
  'reconcileCleanTranscript'
])

test('historical wrappers reconcile their folded interim text without a full transcript scan', async t => {
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
    'collectNestedTurnPairs',
    'isCleanPartMutationNode',
    'isTurnPairMutationRoot',
    'reconcileCleanTranscript'
  ]) {
    assert.equal(typeof internals[name], 'function', `${name} must be executable runtime code`)
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-historical-turn-'))
  const fixturePath = path.join(tempDir, 'fixture.html')
  const definitions = [
    internals.clearCleanTranscriptDecorations,
    internals.cleanPairActive,
    internals.cleanPartMustStayVisible,
    internals.cleanRootHasMeaningfulContent,
    internals.cleanRootMustStayVisible,
    internals.reconcileCleanTranscript,
    internals.isCleanPartMutationNode,
    internals.isTurnPairMutationRoot,
    internals.collectNestedTurnPairs
  ].map(fn => fn.toString()).join('\n')

  const html = `<!doctype html>
<html data-codex-chat-look="true" data-codex-clean-transcript="on">
<head><meta charset="utf-8"><style>${internals.CSS}</style></head>
<body>
  <div data-slot="aui_thread-content" id="thread">
    <div class="historical-turn-row" id="historical-wrapper">
      <div class="virtualizer-spacer"></div>
      <div data-slot="aui_turn-pair" id="historical-pair">
        <div data-role="user">Old prompt</div>
        <div data-role="assistant" data-slot="aui_assistant-message-root" id="folded-assistant">
          <div data-slot="aui_assistant-message-content">
            <span data-slot="timeline-timestamp" id="interim-timestamp">12:00</span>
            <div class="aui-md" id="old-interim-part">Old intermediate message</div>
            <div data-slot="tool-block" id="old-tool">Read file</div>
            <span data-slot="timeline-timestamp" id="artifact-timestamp">12:00:30</span>
            <div class="aui-md" id="old-artifact-part"><div data-slot="aui_artifact-card">Artifact</div></div>
            <span data-slot="timeline-timestamp" id="final-timestamp">12:01</span>
            <div class="aui-md" id="old-final-part">Old final answer</div>
          </div>
          <div data-slot="aui_msg-actions">Copy</div>
        </div>
      </div>
    </div>
    <div id="unrelated"><span>ordinary node</span></div>
  </div>
  <div data-slot="sidebar" id="sidebar">
    <div id="sidebar-wrapper"><div data-slot="aui_turn-pair"></div></div>
  </div>
  <script>
    ${definitions}
    const wrapper = document.getElementById('historical-wrapper')
    const pairs = collectNestedTurnPairs(wrapper)
    for (const pair of pairs) reconcileCleanTranscript(pair)
    const initialFinalPart = getComputedStyle(document.getElementById('old-final-part')).display
    const initialFinalTimestamp = getComputedStyle(document.getElementById('final-timestamp')).display
    const content = document.querySelector('#folded-assistant > [data-slot="aui_assistant-message-content"]')
    const lateTimestamp = document.createElement('span')
    lateTimestamp.id = 'late-timestamp'
    lateTimestamp.setAttribute('data-slot', 'timeline-timestamp')
    lateTimestamp.textContent = '12:02'
    const latePart = document.createElement('div')
    latePart.id = 'late-part'
    latePart.className = 'aui-md'
    latePart.textContent = 'Late authoritative answer'
    content.append(lateTimestamp, latePart)
    const lateAdmitted = isCleanPartMutationNode(latePart)
    if (lateAdmitted) reconcileCleanTranscript(document.getElementById('historical-pair'))
    const snapshot = {
      admitted: isTurnPairMutationRoot(wrapper),
      collected: pairs.map(pair => pair.id),
      directPair: isTurnPairMutationRoot(document.getElementById('historical-pair')),
      unrelated: isTurnPairMutationRoot(document.getElementById('unrelated')),
      sidebar: isTurnPairMutationRoot(document.getElementById('sidebar-wrapper')),
      sidebarCollected: collectNestedTurnPairs(document.getElementById('sidebar-wrapper')).length,
      settled: document.getElementById('historical-pair').getAttribute('data-codex-clean-settled'),
      interimPart: getComputedStyle(document.getElementById('old-interim-part')).display,
      interimTimestamp: getComputedStyle(document.getElementById('interim-timestamp')).display,
      tool: getComputedStyle(document.getElementById('old-tool')).display,
      artifactPart: getComputedStyle(document.getElementById('old-artifact-part')).display,
      artifactTimestamp: getComputedStyle(document.getElementById('artifact-timestamp')).display,
      finalPart: initialFinalPart,
      finalTimestamp: initialFinalTimestamp,
      lateAdmitted,
      previousFinalAfterLate: getComputedStyle(document.getElementById('old-final-part')).display,
      previousFinalTimestampAfterLate: getComputedStyle(document.getElementById('final-timestamp')).display,
      latePart: getComputedStyle(latePart).display,
      lateTimestamp: getComputedStyle(lateTimestamp).display,
      assistant: getComputedStyle(document.getElementById('folded-assistant')).display
    }
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

    assert.deepEqual(result, {
      admitted: true,
      collected: ['historical-pair'],
      directPair: true,
      unrelated: false,
      sidebar: false,
      sidebarCollected: 0,
      settled: 'true',
      interimPart: 'none',
      interimTimestamp: 'none',
      tool: 'none',
      artifactPart: 'block',
      artifactTimestamp: 'inline',
      finalPart: 'block',
      finalTimestamp: 'inline',
      lateAdmitted: true,
      previousFinalAfterLate: 'none',
      previousFinalTimestampAfterLate: 'none',
      latePart: 'block',
      lateTimestamp: 'inline',
      assistant: 'block'
    })
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
