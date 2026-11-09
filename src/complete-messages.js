// The host-pinned StreamdownTextPrimitive exposes each TEXT PART's status on
// .aui-md[data-status]. Message/turn status is too broad: a running message may
// already contain sealed commentary or a previous final after a child wake.
const COMPLETE_MESSAGES_KEY = 'show-complete-messages'
const COMPLETE_MESSAGES_OWNER = Symbol.for('codex-chat-look.complete-messages')
// Native markdown can contain media, alerts and preview/action cards before
// its text part completes. Unknown native slots also fail open. CSS :has keeps
// late-mounted content accessible without an observer or a remembered node.
const COMPLETE_MESSAGES_PROTECTED_SELECTOR = `${TURN_PROTECTED_SELECTOR}, ${TURN_REPLY_PROTECTED_SELECTOR}, [data-slot]`
const COMPLETE_MESSAGES_CSS = `
html[data-codex-chat-look="true"][data-codex-complete-messages="true"]
[data-slot="aui_assistant-message-content"] > .aui-md[data-status="running"]:not(${COMPLETE_MESSAGES_PROTECTED_SELECTOR}):not(:has(${COMPLETE_MESSAGES_PROTECTED_SELECTOR})) {
  display: none !important;
}
`

function registerCompleteMessages(ctx, paletteArea, host, onFeatureUsed = () => {}) {
  let active = true
  let enabled
  const report = message => host.notify?.({ kind: 'error', message })
  try {
    enabled = ctx.storage.get(COMPLETE_MESSAGES_KEY, true) !== false
  } catch {
    // A read failure is not proof that a user never saved Off.
    enabled = false
    report('Could not read Show complete messages. Text streaming remains on.')
  }
  const root = globalThis.document?.body ? document.documentElement : null
  const style = root ? document.createElement('style') : null
  const owner = { root, style }
  if (style) {
    style.dataset.codexCompleteMessages = ''
    style.textContent = COMPLETE_MESSAGES_CSS
    document.head.append(style)
    globalThis[COMPLETE_MESSAGES_OWNER] = owner
  }
  const apply = () => {
    if (!root || globalThis[COMPLETE_MESSAGES_OWNER] !== owner) return
    if (enabled) root.setAttribute('data-codex-complete-messages', 'true')
    else root.removeAttribute('data-codex-complete-messages')
  }
  apply()
  ctx.register({
    id: 'toggle-complete-messages',
    area: paletteArea,
    data: {
      id: 'codex-chat-look.toggle-complete-messages',
      label: 'Codex Skin: Show complete messages',
      detail: () => enabled ? 'On' : 'Off',
      detailVariant: 'state',
      keepOpen: true,
      keywords: ['codex', 'skin', 'complete', 'messages', 'text', 'streaming', 'tokens'],
      run: () => {
        if (!active) return
        const next = !enabled
        try {
          ctx.storage.set(COMPLETE_MESSAGES_KEY, next)
          // The SDK storage layer can swallow persistence failures.
          if (ctx.storage.get(COMPLETE_MESSAGES_KEY, null) !== next) throw new Error('Preference readback mismatch')
        } catch {
          report('Could not save Show complete messages. The current display is unchanged.')
          return
        }
        enabled = next
        apply()
        onFeatureUsed('complete_messages')
      }
    }
  })
  ctx.onDispose(() => {
    active = false
    style?.remove()
    if (globalThis[COMPLETE_MESSAGES_OWNER] !== owner) return
    root?.removeAttribute('data-codex-complete-messages')
    delete globalThis[COMPLETE_MESSAGES_OWNER]
  })
}
