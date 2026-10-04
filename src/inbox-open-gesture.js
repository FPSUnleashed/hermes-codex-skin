// Pure metadata decoder for the native Command surfaces. No listeners, actions,
// fetches, logs, persistence or ownership inference from the active connection.
// The controller must call it before cmdk consumes Enter/removes the menu and
// independently verify focus/API ownership before admitting an explicit open.
function resolveCodexInboxMenuOpenGesture(event, { document: doc, queryClient } = {}) {
  if (!doc || !event || event.isTrusted !== true || event.defaultPrevented ||
      event.isComposing || event.keyCode === 229 || event.shiftKey || event.ctrlKey ||
      event.metaKey || event.altKey || event.repeat ||
      (event.view && event.view !== doc.defaultView)) return null
  if (event.type !== 'click' && event.type !== 'keydown') return null
  if (event.type === 'click' ? event.button !== 0 : event.key !== 'Enter') return null
  if (typeof queryClient?.getQueryData !== 'function') return null

  const commandSelector = '[data-slot="command"]'
  const itemSelector = '[data-slot="command-item"][data-value]'
  const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target
  if (!target?.closest || target.ownerDocument !== doc || !target.isConnected) return null
  const command = target.closest(commandSelector)
  if (!command) return null

  // Reject disabled/closed surfaces as well as disabled children of an item.
  const unavailable = element => {
    for (let node = element; node; node = node.parentElement) {
      if (node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true' ||
          node.getAttribute('data-disabled') === 'true' || node.hasAttribute('inert') ||
          node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' ||
          node.getAttribute('data-state') === 'closed') return true
    }
    return false
  }
  if (unavailable(target)) return null

  let item
  if (event.type === 'click') {
    item = target.closest(itemSelector)
  } else {
    // cmdk selects the highlighted item, not necessarily the event target.
    // Never borrow another Command's selection (including a nested Command).
    if (target.matches('input, textarea, [contenteditable="true"]') &&
        !target.matches('[data-slot="command-input"]')) return null
    const selected = [...command.querySelectorAll(`${itemSelector}[data-selected="true"]`)]
      .filter(node => node.closest(commandSelector) === command)
    if (selected.length !== 1) return null
    item = selected[0]
  }
  if (!item || item.closest(commandSelector) !== command || !item.isConnected || unavailable(item)) return null
  const value = item.getAttribute('data-value')
  if (typeof value !== 'string' || !value) return null

  // Read only the SDK's two native caches, not private stores/components/Fiber.
  let pickerRows, paletteRows
  try {
    const picker = queryClient.getQueryData(['session-picker', 'sessions'])
    const palette = queryClient.getQueryData(['command-palette', 'sessions'])
    pickerRows = Array.isArray(picker?.sessions) ? picker.sessions : []
    paletteRows = Array.isArray(palette?.sessions) ? palette.sessions : []
  } catch { return null }
  const validId = id => typeof id === 'string' && id.length > 0
  const rows = [...pickerRows, ...paletteRows].filter(row => row && validId(row.id))
  const idsOf = row => [row.id, row._lineage_root_id,
    ...(Array.isArray(row._lineage_ids) ? row._lineage_ids : [])].filter(validId)
  const scopeOf = row => validId(row.connection_id) && validId(row.profile)
    ? { connectionId: row.connection_id, profile: row.profile } : null
  // Keep incomplete owners distinct too: unknown metadata cannot prove that a
  // qualified clone belongs to the same owner. Never trim/coerce owner tokens.
  const ownerKey = row => JSON.stringify([
    typeof row.connection_id === 'string' ? row.connection_id : null,
    typeof row.profile === 'string' ? row.profile : null
  ])
  const resolveOwner = (sessionId, candidates, kind) => {
    if (!candidates.length) return null
    const owners = new Set(rows.filter(row => idsOf(row).includes(sessionId)).map(ownerKey))
    if (owners.size !== 1) return null
    return { sessionId, scope: scopeOf(candidates[0]), kind }
  }

  // Native sessionTitle: title.trim() || preview.trim() || 'Untitled session'.
  // The verified fallback is completely reconstructible from cache, so do NOT
  // fall back to arbitrary displayed text or accept just an id suffix. Native
  // picker signatures always end in row.id, never a substituted lineage id.
  // Test this first: a legitimate picker title/preview may contain U+0001.
  const pickerCandidates = pickerRows.filter(row => {
    if (!row || !validId(row.id) ||
        (row.title != null && typeof row.title !== 'string') ||
        (row.preview != null && typeof row.preview !== 'string')) return false
    const preview = row.preview?.trim() ?? ''
    const title = row.title?.trim() || preview || 'Untitled session'
    return value === `${title} ${preview} ${row.id}`
  })
  if (pickerCandidates.length) {
    const sessionIds = new Set(pickerCandidates.map(row => row.id))
    if (sessionIds.size !== 1) return null
    return resolveOwner(pickerCandidates[0].id, pickerCandidates, 'picker')
  }

  // Native paletteValue appends the id after the LAST separator; a title may
  // itself contain that character. Labels/previews never become output/logs.
  const separator = value.lastIndexOf('\u0001')
  if (separator !== -1) {
    const nativeId = value.slice(separator + 1)
    const match = /^(session-|pinned-|goto-)(.+)$/.exec(nativeId)
    if (!match) return null // archived-* restores only; settings/others do not open.
    const prefix = match[1], sessionId = match[2]
    if (prefix === 'goto-' && !/^\d{8}_\d{6}_[a-f0-9]{6}$/.test(sessionId)) return null
    // session/pinned native entries use row.id unchanged (toSessionEntry).
    // A lineage alias alone cannot manufacture a native entry for that alias.
    const candidates = paletteRows.filter(row => row && row.id === sessionId)
    if (candidates.length) return resolveOwner(sessionId, candidates, 'palette')
    if (prefix !== 'goto-' || !/^\d{8}_\d{6}_[a-f0-9]{6}$/.test(sessionId)) return null
    // goto accepts a native-format stored root/segment as typed, without
    // rewriting it to a tip. Explicit native lineage metadata may qualify it.
    const lineageRows = rows.filter(row => idsOf(row).includes(sessionId))
    if (lineageRows.length) return resolveOwner(sessionId, lineageRows, 'palette')
    return { sessionId, scope: null, kind: 'palette' } // parent verifies focus/API.
  }

  return null
}
