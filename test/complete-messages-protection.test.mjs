import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

async function fixture(run) {
  const dom = new JSDOM('<!doctype html><html data-codex-chat-look="true"><head></head><body></body></html>')
  const disposals = []
  try {
    const { registerCompleteMessages } = await loadPluginInternals(['registerCompleteMessages'], {
      document: dom.window.document, window: dom.window
    })
    registerCompleteMessages({
      storage: { get: (_key, fallback) => fallback },
      register: () => {}, onDispose: fn => disposals.push(fn)
    }, 'palette', {})
    await run(dom.window)
  } finally {
    for (const dispose of disposals.reverse()) dispose()
    dom.window.close()
  }
}

const protectedParts = [
  ['image', '<span data-slot="aui_markdown-image"><span data-slot="aui_zoomable-image"><img src="data:image/png;base64,AA=="></span></span>'],
  ['audio', '<audio controls></audio>'],
  ['video', '<video controls></video>'],
  ['embedded preview', '<iframe title="preview"></iframe>'],
  ['native alert', '<div data-slot="aui_markdown-alert" role="alert">Action needed</div>'],
  ['artifact', '<div data-slot="aui_artifact-card"><button>Open preview</button></div>'],
  ['unknown native card', '<div data-slot="future-preview-card">Preview ready</div>'],
  ['native link', '<a href="#native-result">Open result</a>'],
  ['focusable target', '<span tabindex="0">Native result</span>'],
  ['ARIA action', '<span role="button">Native action</span>'],
  ['editable content', '<span contenteditable>Editable result</span>'],
  ['SVG output', '<svg aria-label="Native plot"><path d="M0 0h1"></path></svg>'],
  ['unmarked action', '<button>Open preview</button>'],
  ['widget action', '<span data-hermes-send="continue">Continue</span>'],
  ['input', '<input aria-label="Answer">']
]

for (const [name, html] of protectedParts) {
  test(`running markdown keeps ${name} accessible, including after late insertion`, () => fixture(window => {
    const { document } = window
    document.body.innerHTML = '<div data-slot="aui_assistant-message-content"><div class="aui-md" data-status="running"><p>Partial prose</p></div></div>'
    const part = document.querySelector('.aui-md')
    assert.equal(window.getComputedStyle(part).display, 'none', 'plain streaming prose stays hidden')
    part.insertAdjacentHTML('beforeend', html)
    const native = part.lastElementChild
    let calls = 0
    native.addEventListener('native-protection-check', () => calls++)
    assert.notEqual(window.getComputedStyle(part).display, 'none', 'protected descendants must fail open immediately')
    part.dataset.status = 'complete'
    assert.notEqual(window.getComputedStyle(part).display, 'none')
    part.dataset.status = 'running'
    assert.notEqual(window.getComputedStyle(part).display, 'none')
    native.remove()
    assert.equal(window.getComputedStyle(part).display, 'none', 'plain prose policy returns after native output leaves')
    part.append(native)
    assert.notEqual(window.getComputedStyle(part).display, 'none', 'the same protected native output survives remount')
    assert.equal(part.lastElementChild, native)
    native.dispatchEvent(new window.Event('native-protection-check'))
    assert.equal(calls, 1, 'native node handler remains installed')
  }))
}

test('protected root stays visible and removing a late protected descendant restores plain-text policy', () => fixture(window => {
  const { document } = window
  document.body.innerHTML = '<div data-slot="aui_assistant-message-content"><div class="aui-md" data-status="running" role="alert">Important</div></div>'
  const part = document.querySelector('.aui-md')
  assert.notEqual(window.getComputedStyle(part).display, 'none')
  part.removeAttribute('role')
  assert.equal(window.getComputedStyle(part).display, 'none')
  part.innerHTML = '<button>Action</button>'
  assert.notEqual(window.getComputedStyle(part).display, 'none')
  part.innerHTML = '<p>Only prose remains</p>'
  assert.equal(window.getComputedStyle(part).display, 'none')
  for (const [name, value] of [['role', 'button'], ['tabindex', '0'], ['contenteditable', '']]) {
    part.setAttribute(name, value)
    assert.notEqual(window.getComputedStyle(part).display, 'none', 'protected root remains visible: ' + name)
    part.removeAttribute(name)
    assert.equal(window.getComputedStyle(part).display, 'none')
  }
}))

test('standalone shipping copies include the complete existing Phosphor notice', async () => {
  const provenance = await readFile(new URL('../docs/reference-provenance.md', import.meta.url), 'utf8')
  const notice = provenance.split('## Full notice — Phosphor Icons\n\n')[1].split('\n## Scope of this record')[0].trim()
  assert.ok(notice.startsWith('MIT License\n\nCopyright (c) 2023 Phosphor Icons'))
  for (const path of ['../codex-chat-look/plugin.js', '../codex-chat-look/desktop/plugin.js']) {
    const bundle = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.ok(bundle.includes(notice), path)
  }
})
