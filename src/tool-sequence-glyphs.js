// Exact native ToolIcon filled geometries, Phosphor Icons (MIT), 256x256.
/*
MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// Source: apps/desktop/src/components/ui/tool-icon.tsx. Presentation identity
// does not establish raw tool names or hidden run membership.
const TOOL_SEQUENCE_PATHS = new Set([
  "M248,124a56.11,56.11,0,0,0-32-50.61V72a48,48,0,0,0-88-26.49A48,48,0,0,0,40,72v1.39a56,56,0,0,0,0,101.22V176a48,48,0,0,0,88,26.49A48,48,0,0,0,216,176v-1.39A56.09,56.09,0,0,0,248,124ZM88,208a32,32,0,0,1-31.81-28.56A55.87,55.87,0,0,0,64,180h8a8,8,0,0,0,0-16H64A40,40,0,0,1,51.2,86.1a8,8,0,0,0,5.6-6.83A32,32,0,0,1,120,72v75.36A47.79,47.79,0,0,0,88,136a8,8,0,0,0,0,16,32,32,0,0,1,32,32A24,24,0,0,1,88,208Zm104-44h-8a8,8,0,0,0,0,16h8a55.87,55.87,0,0,0,7.81-.56A32,32,0,1,1,136,184a32,32,0,0,1,32-32,8,8,0,0,0,0-16,47.79,47.79,0,0,0-32,11.36V72a32,32,0,0,1,63.2-7.27,8,8,0,0,0,5.6,6.83A40,40,0,0,1,192,164Z",
  "M118.18,213.08c-.11.14-.24.27-.36.4l-.16.18-.17.15a4.83,4.83,0,0,1-.42.37,3.92,3.92,0,0,1-.32.25l-.3.22-.38.23a2.91,2.91,0,0,1-.3.17l-.37.19-.34.15-.36.13a2.84,2.84,0,0,1-.38.13l-.36.1c-.14,0-.26.07-.4.09l-.42.07-.35.05a7,7,0,0,1-.79,0H64a8,8,0,0,1,0-16H92.69L55,162.34a23.85,23.85,0,0,1-7-17V95a32,32,0,1,1,16,0v50.38A8,8,0,0,0,66.34,151L104,188.69V160a8,8,0,0,1,16,0v48a7,7,0,0,1,0,.8c0,.11,0,.21,0,.32s0,.3-.07.46a2.83,2.83,0,0,1-.09.37c0,.13-.06.26-.1.39s-.08.23-.12.35l-.14.39-.15.31c-.06.13-.12.27-.19.4s-.11.18-.16.28l-.24.39-.21.28ZM208,161V110.63a23.85,23.85,0,0,0-7-17L163.31,56H192a8,8,0,0,0,0-16H143.82l-.6,0c-.14,0-.28,0-.41.06l-.37,0-.43.11-.33.08-.4.14-.34.13-.35.16-.36.18a3.14,3.14,0,0,0-.31.18c-.12.07-.25.14-.36.22a3.55,3.55,0,0,0-.31.23,3.81,3.81,0,0,0-.32.24c-.15.12-.28.24-.42.37l-.17.15-.16.18c-.12.13-.25.26-.36.4l-.26.35-.21.28-.24.39c-.05.1-.11.19-.16.28s-.13.27-.19.4l-.15.31-.14.39c0,.12-.09.23-.12.35s-.07.26-.1.39a2.83,2.83,0,0,0-.09.37c0,.16,0,.31-.07.46s0,.21-.05.32a7,7,0,0,0,0,.8V96a8,8,0,0,0,16,0V67.31L189.66,105a8,8,0,0,1,2.34,5.66V161a32,32,0,1,0,16,0Z",
  "M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM192,108.68,147.31,64l24-24L216,84.68Z",
  "M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z",
  "M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM152,88V44l44,44Z",
  "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM156,88a12,12,0,1,1-12,12A12,12,0,0,1,156,88Zm60,112H40V160.69l46.34-46.35a8,8,0,0,1,11.32,0h0L165,181.66a8,8,0,0,0,11.32-11.32l-17.66-17.65L173,138.34a8,8,0,0,1,11.31,0L216,170.07V200Z",
  "M213.66,66.34l-40-40A8,8,0,0,0,168,24H88A16,16,0,0,0,72,40V56H56A16,16,0,0,0,40,72V216a16,16,0,0,0,16,16H168a16,16,0,0,0,16-16V200h16a16,16,0,0,0,16-16V72A8,8,0,0,0,213.66,66.34ZM136,192H88a8,8,0,0,1,0-16h48a8,8,0,0,1,0,16Zm0-32H88a8,8,0,0,1,0-16h48a8,8,0,0,1,0,16Zm64,24H184V104a8,8,0,0,0-2.34-5.66l-40-40A8,8,0,0,0,136,56H88V40h76.69L200,75.31Z",
  "M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm78.36,64H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM216,128a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM128,43a115.27,115.27,0,0,1,26,45H102A115.11,115.11,0,0,1,128,43ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48Zm50.35,61.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z",
  "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,168a12,12,0,1,1,12-12A12,12,0,0,1,128,192Zm8-48.72V144a8,8,0,0,1-16,0v-8a8,8,0,0,1,8-8c13.23,0,24-9,24-20s-10.77-20-24-20-24,9-24,20v4a8,8,0,0,1-16,0v-4c0-19.85,17.94-36,40-36s40,16.15,40,36C168,125.38,154.24,139.93,136,143.28Z",
  "M168,112a56,56,0,1,1-56-56A56,56,0,0,1,168,112Zm61.66,117.66a8,8,0,0,1-11.32,0l-50.06-50.07a88,88,0,1,1,11.32-11.31l50.06,50.06A8,8,0,0,1,229.66,229.66ZM112,184a72,72,0,1,0-72-72A72.08,72.08,0,0,0,112,184Z",
  "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-91,94.25-40,32a8,8,0,1,1-10-12.5L107.19,128,75,102.25a8,8,0,1,1,10-12.5l40,32a8,8,0,0,1,0,12.5ZM176,168H136a8,8,0,0,1,0-16h40a8,8,0,0,1,0,16Z",
  "M232,96a72,72,0,0,1-100.94,66L79,222.22c-.12.14-.26.29-.39.42a32,32,0,0,1-45.26-45.26c.14-.13.28-.27.43-.39L94,124.94a72.07,72.07,0,0,1,83.54-98.78,8,8,0,0,1,3.93,13.19L144,80l5.66,26.35L176,112l40.65-37.52a8,8,0,0,1,13.19,3.93A72.6,72.6,0,0,1,232,96Z",
  "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm56,112H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z"
])
const TOOL_SEQUENCE_CODICONS = new Set([
  'codicon-terminal', 'codicon-edit', 'codicon-search', 'codicon-file',
  'codicon-files', 'codicon-globe', 'codicon-tools', 'codicon-eye',
  'codicon-brain', 'codicon-watch', 'codicon-question', 'codicon-diff', 'codicon-file-media'
])

// ReasoningAccordionGroup mounts exactly this ThinkingDisclosure shape only
// when Hermes' own showReasoning gate admits actual reasoning text. Treat its
// body as part of that one unit, never as assistant prose or hidden tool rows.
function nativeThinkingUnit(node) {
  if (!node.matches('[data-slot="aui_thinking-disclosure"][data-conversation-scaffold]')) return false
  const [row, body] = node.children
  if (node.children.length < 1 || node.children.length > 2 || !row.matches('div[class~="group/disclosure-row"]')
    || row.children.length !== 2 || !row.lastElementChild.matches('span')) return false
  const button = row.firstElementChild
  if (!button?.matches('button[type="button"][aria-expanded]:not([disabled])')
    || !['true', 'false'].includes(button.getAttribute('aria-expanded')) || button.children.length !== 2
    || !button.querySelector(':scope > span:first-child > span > span')
    || Boolean(body) !== (button.getAttribute('aria-expanded') === 'true')) return false
  if (body && (!body.matches('div[data-slot="aui_thinking-body"]')
    || body.children.length !== 1 || !body.querySelector('[data-slot="aui_reasoning-text"]'))) return false
  return ![...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim())
}

function toolSequenceGlyph(node) {
  if (nativeThinkingUnit(node)) return {kind: 'brain', value: 'thinking'}
  if (node.matches('[data-tool-group]')) {
    // Closed native summaries conceal unmounted membership. Never parse prose.
    const summary = node.querySelector(':scope > [data-tool-summary]')
    if (summary && summary.querySelector('button')?.getAttribute('aria-expanded') !== 'true') return null
    if (node.children.length !== (summary ? 2 : 1)) return null
    const wrapper = node.lastElementChild
    if (wrapper.tagName !== 'DIV' || !wrapper.children.length
      || (!summary && wrapper.children.length !== 1)
      || [...wrapper.children].some(row => !row.matches('[data-slot="tool-block"][data-tool-row]'))) return null
    const glyphs = [...wrapper.children].map(toolSequenceGlyph), first = glyphs[0]
    return first && glyphs.every(glyph => glyph?.kind === first.kind && glyph.value === first.value) ? first : null
  }
  if (!node.matches('[data-tool-row]')) return null
  // Exact ToolEntry > DisclosureRow > ScaffoldRow > ToolGlyph position.
  // Never search arbitrary SVG descendants (caret, status, timer and output).
  const cell = node.querySelector(':scope > div > [class~="group/disclosure-row"] > button > span:first-child > span > span:first-child, :scope > [class~="group/disclosure-row"] > button > span:first-child > span > span:first-child')
  if (!cell?.classList.contains('place-items-center') || cell.children.length !== 1) return null
  const icon = cell.firstElementChild
  if (icon.tagName.toLowerCase() === 'i') {
    const identities = [...icon.classList].filter(name => name.startsWith('codicon-'))
    return icon.classList.contains('codicon') && !icon.children.length && identities.length === 1
      && TOOL_SEQUENCE_CODICONS.has(identities[0]) ? {kind: 'codicon', value: identities[0]} : null
  }
  if (icon.namespaceURI !== 'http://www.w3.org/2000/svg' || icon.tagName !== 'svg'
    || icon.getAttribute('viewBox') !== '0 0 256 256' || icon.getAttribute('fill') !== 'currentColor'
    || icon.children.length !== 1 || icon.childNodes.length !== 1) return null
  // Attributes are validated, never copied. Events, href, filters, embedded
  // foreignObject and animation cannot enter the plugin-owned mask.
  const safeRootAttributes = new Set(['aria-hidden', 'class', 'fill', 'style', 'viewBox'])
  if ([...icon.attributes].some(attr => !safeRootAttributes.has(attr.name))) return null
  if (icon.getAttribute('aria-hidden') !== 'true' || (icon.getAttribute('class') || '').length > 512
    || !/^[\w\s()[\].:/%-]*$/.test(icon.getAttribute('class') || '')
    || [...icon.style].some(name => !['width', 'height'].includes(name)
      || !/^(?:\d{1,3})(?:\.\d{1,4})?(?:px|rem|em)$/.test(icon.style.getPropertyValue(name)))) return null
  const path = icon.firstElementChild, d = path.getAttribute('d')
  if (path.namespaceURI !== icon.namespaceURI || path.tagName !== 'path' || path.attributes.length !== 1
    || path.childNodes.length || !d || d.length > 4096
    || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,+\s-]+$/.test(d) || !TOOL_SEQUENCE_PATHS.has(d)) return null
  return {kind: 'svg', value: d}
}

function paintToolSequenceGlyph(header, units, selected) {
  const glyphs = units.map(toolSequenceGlyph), first = glyphs[0]
  const glyph = selected !== undefined ? selected : first && glyphs.every(item => item?.kind === first.kind && item.value === first.value) ? first : null
  const identity = glyph ? JSON.stringify(glyph) : ''
  if ((header.getAttribute('data-codex-tool-sequence-glyph-identity') || '') === identity) return
  header.querySelector('[data-codex-tool-sequence-icon]')?.remove()
  header.style.removeProperty('--codex-tool-sequence-mask')
  header.removeAttribute('data-codex-tool-sequence-glyph')
  header.removeAttribute('data-codex-tool-sequence-glyph-identity')
  if (!glyph) return
  header.setAttribute('data-codex-tool-sequence-glyph-identity', identity)
  header.setAttribute('data-codex-tool-sequence-glyph', glyph.kind)
  if (glyph.kind === 'svg') {
    // Fixed markup and allowlisted exact path only; no native innerHTML/nodes.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="black"><path d="${glyph.value}"/></svg>`
    header.style.setProperty('--codex-tool-sequence-mask', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
  } else if (glyph.kind === 'codicon') {
    const icon = document.createElement('i')
    icon.className = `codicon ${glyph.value}`
    icon.setAttribute('aria-hidden', 'true')
    icon.setAttribute('data-codex-tool-sequence-icon', '')
    header.querySelector('button').firstElementChild.append(icon)
  }
}
