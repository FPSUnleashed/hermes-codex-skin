import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

class FakeNode {
  constructor() {
    this.parentNode = null
  }

  get parentElement() {
    return this.parentNode instanceof FakeElement ? this.parentNode : null
  }

  replaceWith(...nodes) {
    const siblings = this.parentNode.childNodes
    const index = siblings.indexOf(this)
    for (const node of nodes) node.parentNode = this.parentNode
    siblings.splice(index, 1, ...nodes)
    this.parentNode = null
  }
}

class FakeText extends FakeNode {
  constructor(value) {
    super()
    this.nodeValue = value
  }

  get textContent() {
    return this.nodeValue
  }

  splitText(offset) {
    const tail = new FakeText(this.nodeValue.slice(offset))
    this.nodeValue = this.nodeValue.slice(0, offset)
    const siblings = this.parentNode.childNodes
    const index = siblings.indexOf(this)
    tail.parentNode = this.parentNode
    siblings.splice(index + 1, 0, tail)
    return tail
  }
}

class FakeElement extends FakeNode {
  constructor(tagName = 'div', attributes = {}) {
    super()
    this.tagName = tagName.toUpperCase()
    this.attributes = new Map(Object.entries(attributes))
    this.childNodes = []
    this.nextElementSibling = null
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode?.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1)
      node.parentNode = this
      this.childNodes.push(node)
    }
  }

  appendChild(node) {
    this.append(node)
    return node
  }

  get children() {
    return this.childNodes.filter(node => node instanceof FakeElement)
  }

  get firstElementChild() {
    return this.children[0] || null
  }

  get textContent() {
    return this.childNodes.map(node => node.textContent).join('')
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  matches(selector) {
    if (selector === '[data-role="assistant"], [data-role="user"]') {
      return ['assistant', 'user'].includes(this.getAttribute('data-role'))
    }
    return false
  }

  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector.includes('code, pre') && ['CODE', 'PRE'].includes(node.tagName)) return node
      if (selector.includes('[data-codex-image-marker]') && node.hasAttribute('data-codex-image-marker')) return node
    }
    return null
  }

  querySelector(selector) {
    if (selector === ':scope > [data-role="user"]') {
      return this.children.find(child => child.getAttribute('data-role') === 'user') || null
    }
    if (selector === '[data-slot="aui_user-message-text"]') {
      return walkElements(this).find(element => element.getAttribute('data-slot') === 'aui_user-message-text') || null
    }
    if (selector.includes('img[slot="aui_directive-image"]')) {
      return walkElements(this).find(element => element.tagName === 'IMG') || null
    }
    return null
  }
}

function walkElements(root) {
  const elements = []
  for (const child of root.childNodes) {
    if (!(child instanceof FakeElement)) continue
    elements.push(child, ...walkElements(child))
  }
  return elements
}

function makeFixture({ withImage = true } = {}) {
  const pair = new FakeElement('div')
  const user = new FakeElement('div', { 'data-role': 'user' })
  const message = new FakeElement('div', { 'data-slot': 'aui_user-message-text' })
  const code = new FakeElement('code')
  message.append(
    new FakeText('Alpha\n  [Image attached at: C:\\captures\\shot.png]  \nOmega\n'),
    code,
    new FakeText('\nTail')
  )
  code.append(new FakeText('[Image attached at: keep-inside-code.png]'))
  user.append(message)
  pair.append(user)

  if (withImage) {
    const attachments = new FakeElement('div')
    attachments.append(new FakeElement('img'))
    user.nextElementSibling = attachments
  }
  return { pair, message }
}

function makeDocument(message) {
  return {
    createTreeWalker(root) {
      const textNodes = []
      const visit = node => {
        if (node instanceof FakeText) textNodes.push(node)
        else for (const child of node.childNodes) visit(child)
      }
      visit(root)
      let index = -1
      return {
        currentNode: null,
        nextNode() {
          this.currentNode = textNodes[++index] || null
          return Boolean(this.currentNode)
        }
      }
    },
    createElement(tagName) {
      return new FakeElement(tagName)
    },
    querySelectorAll(selector) {
      if (selector === '[data-codex-image-marker]') {
        return walkElements(message).filter(element => element.hasAttribute('data-codex-image-marker'))
      }
      return []
    }
  }
}

async function loadMarkerRuntime(document) {
  let source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
  source = source
    .replace(/^import .*$/gm, '')
    .replace(/export default \{[\s\S]*$/, '')
  const context = vm.createContext({
    document,
    NodeFilter: { SHOW_TEXT: 4 },
    Element: FakeElement,
    window: {},
    host: {},
    console
  })
  vm.runInContext(`${source}\nglobalThis.markerRuntime = { stripImageAttachmentMarker, clearImageAttachmentMarkers }`, context)
  return context.markerRuntime
}

test('image marker cleanup restores the exact native message text', async () => {
  const { pair, message } = makeFixture()
  const document = makeDocument(message)
  const original = message.textContent
  const runtime = await loadMarkerRuntime(document)

  runtime.stripImageAttachmentMarker(pair)
  const wrappers = document.querySelectorAll('[data-codex-image-marker]')
  assert.equal(wrappers.length, 1)
  assert.equal(wrappers[0].textContent, '\n  [Image attached at: C:\\captures\\shot.png]  ')
  runtime.clearImageAttachmentMarkers()

  assert.equal(message.textContent, original)
})

test('image marker wrapping is gated by rendered media and idempotent across hot reload', async () => {
  const withoutImage = makeFixture({ withImage: false })
  const inactiveDocument = makeDocument(withoutImage.message)
  const inactiveRuntime = await loadMarkerRuntime(inactiveDocument)
  const inactiveText = withoutImage.message.textContent
  inactiveRuntime.stripImageAttachmentMarker(withoutImage.pair)
  assert.equal(inactiveDocument.querySelectorAll('[data-codex-image-marker]').length, 0)
  assert.equal(withoutImage.message.textContent, inactiveText)

  const active = makeFixture()
  const activeDocument = makeDocument(active.message)
  const activeRuntime = await loadMarkerRuntime(activeDocument)
  activeRuntime.stripImageAttachmentMarker(active.pair)
  activeRuntime.stripImageAttachmentMarker(active.pair)
  assert.equal(activeDocument.querySelectorAll('[data-codex-image-marker]').length, 1)
})
