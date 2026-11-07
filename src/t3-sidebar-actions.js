// T3 6d450a4 SidebarThreadHeader.tsx:62-87,113-132,138-173.
// SquarePen paths: lucide-react 0.564.0, pinned by that tree's pnpm-lock.yaml.
export const T3_SIDEBAR_ACTIONS_CSS = `
html[data-codex-chat-look='true'] [data-codex-t3-search-row] {
  display:flex!important; align-items:center!important; gap:0.25rem!important; padding:0.25rem 0.5rem!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field] {
  display:flex!important; flex:0 1 calc(100% - 2rem)!important; width:calc(100% - 2rem)!important;
  height:2rem!important; min-width:0!important; gap:0.5rem!important; padding:0.375rem 0.5rem!important;
  box-sizing:border-box!important; border:0!important; border-radius:0.375rem!important;
  opacity:1!important; color:var(--codex-sidebar-muted)!important; background:transparent!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field]:is(:hover,:focus-within) {
  background:var(--codex-sidebar-hover)!important; color:var(--codex-color-text)!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field]:focus-within {
  box-shadow:inset 0 0 0 1px var(--ui-accent)!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field] > input {
  width:100%!important; min-width:0!important; height:1.25rem!important; padding:0!important;
  font-size:0.875rem!important; font-weight:500!important; line-height:1.25rem!important;
  color:inherit!important; field-sizing:initial!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field] > input::placeholder { color:inherit!important; opacity:1!important; }
html[data-codex-chat-look='true'] [data-codex-t3-search-field] > svg { width:1rem!important; height:1rem!important; color:inherit!important; }
html[data-codex-chat-look='true'] [data-codex-t3-new-item] { height:0!important; min-height:0!important; margin:0!important; padding:0!important; }
html[data-codex-chat-look='true'] [data-codex-t3-new-session] {
  position:absolute!important; left:var(--codex-t3-new-left)!important; top:var(--codex-t3-new-top)!important;
  width:1.75rem!important; height:1.75rem!important; min-width:1.75rem!important; min-height:1.75rem!important;
  display:flex!important; align-items:center!important; justify-content:center!important;
  margin:0!important; padding:0!important; border:0!important; border-radius:0.375rem!important;
  background:transparent!important; color:var(--codex-sidebar-muted)!important; box-shadow:none!important;
  overflow:hidden!important; z-index:2; -webkit-app-region:no-drag;
}
html[data-codex-chat-look='true'] [data-codex-t3-new-session]:is(:hover,:focus-visible) {
  background:var(--codex-sidebar-hover)!important; color:var(--codex-color-text)!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-new-session]:focus-visible { outline:2px solid var(--ui-accent)!important; outline-offset:-2px!important; }
/* Keep Hermes' accessible label, native shortcut hint/tooltip and handlers.
   Only their visual presentation disappears; the control itself is the original. */
html[data-codex-chat-look='true'] [data-codex-t3-new-session] > :not(svg):not(.codicon) {
  position:absolute!important; width:1px!important; height:1px!important; margin:-1px!important;
  padding:0!important; overflow:hidden!important; clip-path:inset(50%)!important; white-space:nowrap!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-new-session] > :is(svg,.codicon) { display:none!important; }
html[data-codex-chat-look='true'] [data-codex-t3-new-session]::before {
  content:''; width:1rem; height:1rem; flex:none; background:currentColor;
  mask:center/contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/%3E%3Cpath d='M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z'/%3E%3C/svg%3E");
}
`

// Position the *native* action without reparenting React nodes, proxy clicks,
// private stores, captured profile callbacks or additional keyboard controls.
export function installT3SidebarActions() {
  const bindings = new Map()
  let frame = 0, disposed = false
  const clear = binding => {
    const { input, button, item, row, field, placeholder, hadStyle } = binding
    if (input.getAttribute('placeholder') === 'Search') {
      if (placeholder === null) input.removeAttribute('placeholder')
      else input.setAttribute('placeholder', placeholder)
    }
    for (const [element, name] of [[button,'new-session'],[item,'new-item'],[row,'search-row'],[field,'search-field']]) element.removeAttribute(`data-codex-t3-${name}`)
    button.style.removeProperty('--codex-t3-new-left'); button.style.removeProperty('--codex-t3-new-top')
    if (!hadStyle && !button.getAttribute('style')) button.removeAttribute('style')
  }
  const sync = () => {
    frame = 0
    if (disposed) return
    const current = new Set()
    if (document.documentElement.dataset.codexChatLook === 'true') {
      for (const sidebar of document.querySelectorAll('[data-tour="sessions-sidebar"]')) {
        const content = sidebar.querySelector(':scope > [data-slot="sidebar-content"]')
        const label = content?.querySelector('[data-tour="sidebar-nav-new-session"]')
        // Radix ContextMenu/Tooltip asChild can overwrite data-slot. The
        // native menu-button semantic marker survives those prop merges.
        const button = label?.closest('button[data-sidebar="menu-button"], button[data-slot="sidebar-menu-button"]')
        const item = button?.closest('[data-slot="sidebar-menu-item"]')
        // Exact native SearchField sibling, not generic text/aria-label matching.
        const row = content && [...content.children].find(el => el.nextElementSibling?.hasAttribute('data-sessions-mode') && el.querySelector(':scope > div > input'))
        const field = row?.firstElementChild, input = field?.querySelector(':scope > input')
        if (!button || !item || !input || button.closest('[data-tour="sessions-sidebar"]') !== sidebar) continue
        current.add(input)
        let binding = bindings.get(input)
        if (binding && binding.button !== button) { clear(binding); bindings.delete(input); binding = null }
        if (!binding) {
          binding = { input, button, item, row, field, placeholder:input.getAttribute('placeholder'), hadStyle:button.hasAttribute('style') }
          bindings.set(input, binding)
        }
        if (input.getAttribute('placeholder') !== 'Search') { binding.placeholder = input.getAttribute('placeholder'); input.setAttribute('placeholder','Search') }
        for (const [element, name] of [[button,'new-session'],[item,'new-item'],[row,'search-row'],[field,'search-field']]) {
          if (!element.hasAttribute(`data-codex-t3-${name}`)) element.setAttribute(`data-codex-t3-${name}`, '')
        }
        const parent = button.offsetParent
        if (!parent) continue // Hidden/collapsed native sidebar, recomputed on reveal.
        const p = parent.getBoundingClientRect(), r = field.getBoundingClientRect()
        const scale = p.width / parent.offsetWidth || 1
        const gap = parseFloat(getComputedStyle(row).columnGap)
        const size = button.getBoundingClientRect().height / scale
        const coordinates = { left:(r.right - p.left) / scale + gap - parent.clientLeft + parent.scrollLeft, top:(r.top - p.top) / scale + (r.height / scale - size) / 2 - parent.clientTop + parent.scrollTop }
        for (const [key, value] of Object.entries(coordinates)) {
          const next = `${Math.round(value * 100) / 100}px`
          if (button.style.getPropertyValue(`--codex-t3-new-${key}`) !== next) button.style.setProperty(`--codex-t3-new-${key}`,next)
        }
      }
    }
    for (const [input, binding] of bindings) if (!current.has(input)) { clear(binding); bindings.delete(input) }
    const owners = new Set([...bindings.values()].flatMap(b => [b.row,b.button.closest('[data-tour="sessions-sidebar"]')]))
    for (const element of observed) if (!owners.has(element)) { resize.unobserve(element); observed.delete(element) }
    for (const element of owners) if (!observed.has(element)) { resize.observe(element); observed.add(element) }
  }
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(sync) }
  const observed = new Set(), resize = new ResizeObserver(schedule)
  const sidebarSelector = '[data-tour="sessions-sidebar"]'
  const containsSidebar = node => node.nodeType === 1 && (node.matches(sidebarSelector) || node.querySelector(sidebarSelector))
  const mutations = new MutationObserver(records => {
    // Keep body discovery, including detached removals, without coupling layout to transcript streaming.
    if (records.some(record => record.target.closest?.(sidebarSelector)
      || (record.type === 'attributes' && observed.has(record.target))
      || (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(containsSidebar)))) schedule()
  })
  mutations.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['placeholder','data-tour','data-sessions-mode']})
  const rootChanges = new MutationObserver(schedule)
  rootChanges.observe(document.documentElement,{attributes:true,attributeFilter:['data-codex-chat-look']})
  window.addEventListener('resize',schedule)
  sync()
  return () => {
    disposed = true; cancelAnimationFrame(frame); mutations.disconnect(); rootChanges.disconnect(); resize.disconnect()
    window.removeEventListener('resize',schedule)
    for (const binding of bindings.values()) clear(binding)
    bindings.clear(); observed.clear()
  }
}
