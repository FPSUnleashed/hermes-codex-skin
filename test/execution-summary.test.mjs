import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
const classifierStart = source.indexOf('function classifyExecutionRoots(')
const classifierEnd = source.indexOf('function decorateExecutionSummary(', classifierStart)
const context = vm.createContext({
  EXECUTION_LIVE_SELECTOR: '__live__',
  EXECUTION_TECHNICAL_SELECTOR: '__technical__'
})
vm.runInContext(
  `${source.slice(classifierStart, classifierEnd)}\n` +
    'globalThis.classify = classifyExecutionRoots; globalThis.hidden = executionHiddenNodes',
  context
)

function root({ final = false, live = false, streaming = false, technical = [] } = {}) {
  return {
    getAttribute(name) {
      return name === 'data-streaming' && streaming ? 'true' : null
    },
    querySelector(selector) {
      if (selector === '__live__') return live ? {} : null
      return selector === '[data-slot="aui_msg-actions"]' && final ? {} : null
    },
    querySelectorAll(selector) {
      return selector === '__technical__' ? technical : []
    }
  }
}

test('live turns never collapse', () => {
  const interim = root()
  const running = root({ streaming: true })
  assert.equal(context.classify([interim, running]), null)
  assert.equal(context.classify([interim, root({ live: true })]), null)
})

test('zero, duplicate, or non-tail finals fail open', () => {
  assert.equal(context.classify([root(), root()]), null)
  assert.equal(context.classify([root({ final: true }), root({ final: true })]), null)
  assert.equal(context.classify([root({ final: true }), root()]), null)
})

test('one settled tail final is the sole completion signal', () => {
  const first = root()
  const second = root()
  const final = root({ final: true })
  const result = context.classify([first, second, final])
  assert.equal(result.finalRoot, final)
})

test('all assistant commentary before the unique final is owned by Show work', () => {
  const first = root()
  const second = root()
  const finalTool = {}
  const final = root({ final: true, technical: [finalTool] })
  const hidden = context.hidden([first, second, final], final)

  assert.equal(hidden.length, 3)
  assert.equal(hidden[0], first)
  assert.equal(hidden[1], second)
  assert.equal(hidden[2], finalTool)
  assert.ok(!hidden.includes(final))
  assert.match(source, /const interimRoots = assistantRoots\.filter\(root => root !== finalRoot\)/)
  assert.match(source, /const finalTechnicalNodes = \[\.\.\.finalRoot\.querySelectorAll\(EXECUTION_TECHNICAL_SELECTOR\)\]/)
  assert.match(source, /return \[\.\.\.interimRoots, \.\.\.finalTechnicalNodes\]/)
  assert.doesNotMatch(source, /finalRoot\.setAttribute\('data-codex-execution-hidden'/)
  assert.match(source, /summary\.setAttribute\('aria-expanded', 'false'\)/)
  assert.match(source, /pair\.setAttribute\('data-codex-execution-expanded', 'true'\)/)
  assert.match(source, /const anchor = expanded \? assistantRoots\[0\] : finalRoot/)
  assert.match(source, /pair\.insertBefore\(summary, anchor\)/)
  assert.match(source, /positionExecutionSummary\(pair, summary, assistantRoots, finalRoot, expanded\)/)
  assert.match(source, /pair\.insertBefore\(summary, finalRoot\)/)
  assert.match(source, /'\[data-codex-execution-summary\]'/)
  assert.match(source, /clearExecutionSummaries\(\)/)
  assert.match(source, /data-codex-execution-collapsed='true'/)
  assert.match(source, /data-codex-execution-collapsed='true'\]\:not\(\[data-codex-execution-expanded='true'\]\) \[data-slot='aui_turn-duration'\]/)
})

test('generated images are never admitted to the automatic technical hide set', () => {
  const selectorBlock = source.slice(
    source.indexOf('const EXECUTION_TECHNICAL_SELECTOR'),
    source.indexOf('function clearExecutionDecoration')
  )
  assert.doesNotMatch(selectorBlock, /aui_generated-image/)
  assert.match(selectorBlock, /clarify-inline/)
  assert.match(selectorBlock, /tool-approval-inline/)
  assert.match(selectorBlock, /img, video, audio/)
})

test('Show work reuses the exact Codex Took row appearance without changing its behavior', () => {
  const start = source.indexOf("[data-codex-execution-summary='true'] {")
  const block = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(block, /width: 100%/)
  assert.match(block, /min-height: 42px/)
  assert.match(block, /gap: 7px/)
  assert.match(block, /padding: 8px 0 10px/)
  assert.match(block, /margin: 0 0 12px/)
  assert.match(block, /border-bottom: 1px solid #e5e5e5/)
  assert.match(block, /border-radius: 0/)
  assert.match(block, /color: rgba\(13, 13, 13, 0\.56\)/)
  assert.match(block, /font-size: 13px/)
  assert.match(block, /font-weight: 445/)

  const hoverStart = source.indexOf("[data-codex-execution-summary='true']:hover {")
  const hoverBlock = source.slice(hoverStart, source.indexOf('\n}', hoverStart) + 2)
  assert.doesNotMatch(hoverBlock, /background:/)

  const darkStart = source.indexOf("[data-hermes-mode='dark'] [data-codex-execution-summary='true'] {")
  const darkBlock = source.slice(darkStart, source.indexOf('\n}', darkStart) + 2)
  assert.match(darkBlock, /border-bottom-color: #424242/)
  assert.match(darkBlock, /color: rgba\(236, 236, 236, 0\.60\)/)

  assert.match(source, /chevron\.textContent = '›'/)
  assert.match(source, /summary\.append\(label, chevron\)/)
  assert.match(source, /function syncExecutionSummaryLook\(summary\)/)
  assert.match(source, /syncExecutionSummaryLook\(existing\)/)
  assert.match(source, /font-size: 20px/)
  assert.match(source, /transform: translateY\(-0\.5px\)/)
  assert.match(source, /transform: rotate\(90deg\)/)
})
