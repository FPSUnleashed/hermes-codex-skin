// Public DOM seam: native fallback.tsx ToolRun / ToolFallback, ScaffoldRow.
// Native parts never move. Only this runtime's sibling headers and attributes
// are owned here; unknown parts, user input and actionable content are barriers.
function createToolSequenceDisclosureMemory(rootSelector, surface, owned, skip) {
  // Ephemeral presentation choices only. No transcript, labels or storage.
  const disclosures = new Map()
  let owner = '', qualified = false
  function completeOwner(scope) {
    // groupingScope's published connection/profile/runtime/stored owner. A
    // draft, unresolved owner or focused tile must not inherit workspace UI.
    if (typeof scope !== 'string' || scope.length > 8192) return false
    let value
    try { value = JSON.parse(scope) } catch { return false }
    return Array.isArray(value) && value.length === 7
      && [value[0], value[2], value[3], value[4], value[5], value[6]].every(part => typeof part === 'string' && part.length > 0)
      && Array.isArray(value[1]) && value[1].length === 2
      && value[1][0] === value[0] && value[1][1] === value[2]
      && value[3] === value[5] && value[4] === value[6]
  }
  return {
    syncOwner(scope, incarnation) {
      const next = JSON.stringify([scope, incarnation])
      if (owner !== next) { disclosures.clear(); owner = next; qualified = completeOwner(scope) }
    },
    identity(pair, units, key) {
      if (!qualified || surface(pair)?.getAttribute('data-session-anchor') !== 'workspace') return ''
      const content = units[0].parentElement, root = content?.parentElement
      if (!content?.matches('[data-slot="aui_assistant-message-content"]') || !root?.matches(rootSelector)) return ''
      const id = root.getAttribute('data-message-id'), users = owned(pair, '[data-role="user"][data-message-id]')
      const stable = value => typeof value === 'string' && value.length > 0 && value.length <= 1024
        && !/^(?:user|assistant)-(?:inflight|queued|pending)(?:-|$)/i.test(value)
      if (!stable(id) || users.length !== 1 || !stable(users[0].getAttribute('data-message-id'))
        || owned(pair, rootSelector).filter(node => node.getAttribute('data-message-id') === id).length !== 1) return ''
      const parts = [...content.childNodes].filter(node => node instanceof Element ? !skip(node) : node.textContent.trim())
      // Hermes publishes message IDs, not ToolRun/call IDs. Only an entire
      // execution-only message is uniquely owned by that native ID. Never key
      // multiple within-message groups by ordinal, glyph or a localized label.
      return parts.length === units.length && parts.every((node, index) => node === units[index])
        ? JSON.stringify([key, id]) : ''
    },
    initial(key, fallback) { return disclosures.has(key) ? disclosures.get(key) : fallback },
    remember(record) {
      if (!record.memoryKey) return
      disclosures.delete(record.memoryKey)
      disclosures.set(record.memoryKey, record.open)
      if (disclosures.size > 100) disclosures.delete(disclosures.keys().next().value)
    },
    clear() { disclosures.clear() }
  }
}

function toolSequenceFactualSummary(units, nativeRows, compact) {
  const captions = []
  let more = false
  // Match T3's settled mixed-group policy without reading reasoning bodies.
  // A native reasoning disclosure can fold several parts; its mounted count
  // cannot establish T3's Thought (×N), so reasoning-only captions stay native.
  const tools = units.filter(node => !nativeThinkingUnit(node))
  for (const node of tools.length ? tools : units) {
    // A native group owns its summary even when its members are unmounted.
    // Read only ScaffoldRow's label, never its clock, body, or hidden rows.
    const summary = node.matches('[data-tool-group]') && node.querySelector(':scope > [data-tool-summary]')
    let caption
    if (summary) {
      const title = summary.querySelector(':scope > [class~="group/disclosure-row"] > button > span:first-child > span > span:first-child')
      if (!title?.className.includes('conversation-scaffold-text')
        || [...title.children].some(child => !child.matches('span.shimmer') || child.children.length)
        || title.textContent.length > 1024) return null
      caption = title.textContent.trim()
    } else if (node.matches('[data-tool-group]')) {
      const rows = nativeRows([node])
      if (rows.length === 1) caption = compact(rows[0])?.label
    } else caption = compact(node)?.label
    // No authoritative caption means no aggregate: leave that run native.
    // Identical captions are a sample, not a count or category inference.
    if (!caption || /^tool activity$/i.test(caption)) return null
    if (!captions.includes(caption)) {
      if (captions.length < 3) captions.push(caption)
      else more = true
    }
  }
  return captions.join(' · ') + (more ? ' · …' : '')
}

function createToolSequenceRuntime(currentScope, currentIncarnation) {
  const states = new Map()
  const rootSelector = '[data-role="assistant"][data-slot="aui_assistant-message-root"]'
  const ownedSelector = '[data-codex-tool-sequence]'
  const itemAttribute = 'data-codex-tool-sequence-item'
  const busySelector = '[data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"]'
  const pairUnsafeSelector = `${TURN_ACTION_SELECTOR}, ${TURN_FAILURE_SELECTOR}, [role="alert"], [data-slot="aui_assistant-message-stopped"]`
  const unsafeSelector = `${pairUnsafeSelector}, [data-slot="aui_generated-image"], [data-slot="aui_artifact-card"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"], img, audio, video, iframe`
  let active = true
  const surface = pair => pair.closest('[data-session-anchor], [data-slot="aui_thread-content"]')
  const owned = (pair, selector) => [...pair.querySelectorAll(selector)].filter(node => node.closest('[data-slot="aui_turn-pair"]') === pair)
  const identity = (pair, scope) => {
    const user = owned(pair, '[data-role="user"][data-message-id]')[0]?.getAttribute('data-message-id')
    const first = owned(pair, rootSelector)[0]?.getAttribute('data-message-id')
    return user && first ? JSON.stringify([scope, surface(pair)?.getAttribute('data-session-anchor') || '', user, first]) : ''
  }
  const nativeOwner = unit => {
    const root = unit.closest(rootSelector)
    return {root, id: root?.getAttribute('data-message-id') || ''}
  }
  const nativeOwnersMatch = (record, units) => units.every(unit => {
    const previous = record.nativeOwners?.get(unit)
    if (!previous) return true // Appending new units is not a native rebind.
    const current = nativeOwner(unit)
    return previous.root === current.root && previous.id === current.id
  })
  const protectedPart = node => node.matches(unsafeSelector) || node.querySelector(unsafeSelector)
  const skip = node => node.matches(`${ownedSelector}, [data-codex-turn-activity], [data-slot="timeline-timestamp"]`)
    || node.matches(busySelector)
    || (node.matches('[data-slot="aui_message-streaming-marker"]') && !node.textContent.trim() && !node.children.length)
  const toolUnitSelector = '[data-slot="tool-block"]:is([data-tool-group], [data-tool-row])'
  const unit = node => (node.matches(toolUnitSelector) || nativeThinkingUnit(node))
    && !node.matches(ownedSelector) && !protectedPart(node)
  const disclosures = createToolSequenceDisclosureMemory(rootSelector, surface, owned, skip)
  function safeBoundaries(pair) {
    for (const node of owned(pair, pairUnsafeSelector)) {
      if (node.matches('[data-slot="aui_assistant-message-stopped"]')) return false
      let part = node
      while (part.parentElement && !part.parentElement.matches('[data-slot="aui_assistant-message-content"]')) part = part.parentElement
      const root = part.parentElement?.parentElement
      if (!root?.matches(rootSelector) || root.closest('[data-slot="aui_turn-pair"]') !== pair) return false
      // Native action cards are direct message parts. An unknown wrapper or
      // action nested inside a tool establishes no narrower ownership scope.
      if (part.matches(TURN_ACTION_SELECTOR)) continue
      if (!part.matches(toolUnitSelector) || part.matches(ownedSelector)
        || part.querySelector(TURN_ACTION_SELECTOR)) return false
    }
    return true
  }

  function runs(pair) {
    const result = []
    let pending = []
    const boundary = () => { if (pending.length) result.push(pending); pending = [] }
    const part = node => {
      if (node.nodeType === 3) { if (node.textContent.trim()) boundary(); return }
      if (!(node instanceof Element) || skip(node)) return
      if (unit(node)) pending.push(node)
      else boundary()
    }
    const visit = parent => {
      for (const node of parent.childNodes) {
        if (!(node instanceof Element)) { part(node); continue }
        if (skip(node)) continue
        if (node.matches(rootSelector) && node.closest('[data-slot="aui_turn-pair"]') === pair) {
          for (const child of node.childNodes) {
            if (child instanceof Element && child.matches('[data-slot="aui_assistant-message-content"]')) {
              for (const directPart of child.childNodes) part(directPart)
            } else part(child)
          }
        } else if (node.matches('[data-slot="aui_response-group"]')) visit(node)
        else boundary()
      }
    }
    visit(pair)
    const tail = pending
    boundary()
    return {groups: result, tail}
  }
  const attr = (node, name, value) => {
    if (value === null) { if (node.hasAttribute(name)) node.removeAttribute(name) }
    else if (node.getAttribute(name) !== value) node.setAttribute(name, value)
  }
  const nativeRows = units => units.flatMap(node => {
    if (node.matches('[data-tool-row]') || nativeThinkingUnit(node)) return [node]
    const ticker = node.querySelector(':scope > [data-tool-ticker] > .tool-ticker__reel')
    if (ticker) {
      const rows = [...ticker.children]
      return rows.every(row => row.matches('.tool-ticker__row') && row.children.length === 1
        && row.firstElementChild.matches('[data-slot="tool-block"][data-tool-row]'))
        ? rows.map(row => row.firstElementChild) : []
    }
    const wrapper = node.lastElementChild
    return wrapper?.tagName === 'DIV' && !wrapper.matches('[data-tool-summary]')
      && [...wrapper.children].every(row => row.matches('[data-slot="tool-block"][data-tool-row]'))
      ? [...wrapper.children] : []
  })
  function compact(row) {
    if (nativeThinkingUnit(row)) {
      // Only the native label is public activity metadata. Neither the body
      // nor the trailing clock establishes the label or its running state.
      const title = row.querySelector(':scope > [class~="group/disclosure-row"] > button > span:first-child > span > span')
      if (!title?.className.includes('conversation-scaffold-text') || title.children.length
        || !title.textContent.trim() || title.textContent.length > 1024) return null
      return {row, label: title.textContent.trim(), running: title.classList.contains('shimmer'), glyph: toolSequenceGlyph(row)}
    }
    const cells = row.querySelector(':scope > div > [class~="group/disclosure-row"] > button > span:first-child > span, :scope > [class~="group/disclosure-row"] > button > span:first-child > span')
    if (!cells || cells.children.length < 2 || !cells.firstElementChild.classList.contains('place-items-center')) return null
    const title = cells.children[1]
    if (!title.className.includes('conversation-scaffold-text') || title.querySelector('button,input,img,svg,code,pre')
      || title.textContent.length > 1024 || !title.textContent.trim()) return null
    const running = !!cells.firstElementChild.querySelector(':scope > [role="status"] > .glyph-spinner')
    return {row, label: title.textContent.trim(), running, glyph: toolSequenceGlyph(row)}
  }
  function thinking(pair, enabled) {
    for (const row of owned(pair, `${busySelector}, [data-codex-activity-busy]`)) {
      const generic = enabled && row.matches(busySelector) && row.getAttribute('aria-label') !== 'Summarizing thread'
        && !row.querySelector('.shimmer') && row.querySelector(':scope > .dither')
      attr(row, 'data-codex-activity-busy', generic ? '' : null)
      let face = row.querySelector(':scope > [data-codex-activity-face]')
      if (!generic) { face?.remove(); continue }
      if (!face) {
        face = document.createElement('span')
        face.setAttribute('data-codex-activity-face', '')
        face.setAttribute('aria-hidden', 'true')
        face.innerHTML = '<span data-codex-activity-content><span data-codex-activity-icon></span><span>Thinking</span></span><span data-codex-activity-sweep><span><span data-codex-activity-content><span data-codex-activity-icon></span><span>Thinking</span></span></span></span>'
        row.insertBefore(face, row.lastElementChild)
      }
    }
  }
  const clearPair = pair => {
    for (const record of states.get(pair)?.records.values() || []) restoreFocus(record)
    for (const node of owned(pair, `[${itemAttribute}]`)) node.removeAttribute(itemAttribute)
    for (const node of owned(pair, '[data-codex-activity-native-current]')) node.removeAttribute('data-codex-activity-native-current')
    thinking(pair, false)
    for (const row of owned(pair, '[data-codex-activity-owned]')) row.removeAttribute('data-codex-activity-owned')
    for (const header of owned(pair, ownedSelector)) { header.querySelector('button').onclick = null; header.remove() }
    attr(pair, 'data-codex-tool-sequence-local-safe', null)
    states.delete(pair)
  }
  function restoreFocus(record) {
    for (const [node, value] of record.focus || []) {
      if (node.getAttribute('tabindex') === '-1') attr(node, 'tabindex', value)
    }
    record.focus?.clear()
  }
  const apply = record => {
    attr(record.button, 'aria-expanded', String(record.open))
    attr(record.header, 'data-codex-activity-live', record.current ? '' : null)
    // A remembered caption has no mounted native row to supply overlay height.
    attr(record.header, 'data-codex-activity-overlay', record.current?.row ? '' : null)
    for (const node of record.units) {
      attr(node, itemAttribute, record.open ? null : record.current ? 'live-collapsed' : 'collapsed')
    }
    for (const row of nativeRows(record.units)) attr(row, 'data-codex-activity-native-current', !record.open && row === record.current?.row ? '' : null)
    const focusables = new Set(!record.open && record.current
      ? record.units.flatMap(unit => [...unit.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')]) : [])
    record.focus ||= new Map()
    for (const [node, value] of record.focus) if (!focusables.has(node)) {
      if (node.getAttribute('tabindex') === '-1') attr(node, 'tabindex', value)
      record.focus.delete(node)
    }
    for (const node of focusables) {
      if (!record.focus.has(node)) record.focus.set(node, node.getAttribute('tabindex'))
      attr(node, 'tabindex', '-1')
    }
  }
  function reconcile(pair, scope) {
    if (!active) return
    const key = identity(pair, scope), owner = surface(pair), incarnation = currentIncarnation()
    disclosures.syncOwner(scope, incarnation)
    if (!owner || !key || !safeBoundaries(pair)
      || owned(pair, '[data-slot="aui_thinking-disclosure"]').some(node => !nativeThinkingUnit(node))) { clearPair(pair); return }
    let state = states.get(pair)
    if (state && (state.key !== key || state.surface !== owner || state.incarnation !== incarnation)) { clearPair(pair); state = null }
    const previous = state?.records || new Map(), records = new Map()
    const {groups, tail} = runs(pair)
    // CSS integration may admit this certified local topology, never the
    // protected units themselves. Global/unknown failures still clear above.
    attr(pair, 'data-codex-tool-sequence-local-safe', owned(pair, pairUnsafeSelector).length ? '' : null)

    const live = pair.getAttribute('data-codex-activity-phase') === 'working'
      || owned(pair, '[data-role="assistant"][data-streaming="true"], [data-message-streaming="true"]')
      .length > 0 || owned(pair, busySelector).length > 0
    let hasCurrent = false
    for (const units of groups) {
      const first = units[0]
      let record = previous.get(first)
      if (record && !nativeOwnersMatch(record, units)) {
        restoreFocus(record)
        record.button.onclick = null
        record.header.remove()
        record = null
      }
      const isTail = units === tail && live
      const lastUnit = units.at(-1)
      const terminalRows = isTail ? nativeRows([lastUnit]) : []
      const terminal = terminalRows.length ? compact(terminalRows.at(-1)) : null
      // An older opaque run cannot veto a newer mounted activity. But an
      // opaque terminal unit proves no latest name, even if an older row runs.
      // Match ToolRunTicker: the last row of the last native unit is current.
      const current = terminal
        || (isTail && !terminalRows.length && lastUnit.matches('[data-tool-group]')
          && record?.lastUnit === lastUnit && record.current
          && toolSequenceFactualSummary([lastUnit], nativeRows, compact)
          ? {label: record.current.label, glyph: record.current.glyph, running: false, row: null} : null
        )
      if (units.length < 2 && !current) continue
      // Native ToolRun may unmount its ticker while the owning turn still
      // works. Keep only its witnessed public caption until a prose boundary;
      // never retain a detached row, infer a spinner or borrow another unit.
      const label = current?.label || toolSequenceFactualSummary(units, nativeRows, compact)
      if (!label || /^tool activity$/i.test(label)) continue
      const memoryKey = disclosures.identity(pair, units, key)
      if (!record) {
        // A header can survive the existing 300ms plugin hot-reload handoff.
        const old = first.previousElementSibling
        const header = old?.matches(ownedSelector) && old.getAttribute('data-codex-tool-sequence-owner') === key ? old : document.createElement('div')
        if (header !== old) {
          header.setAttribute('data-codex-tool-sequence', '')
          header.setAttribute('data-codex-tool-sequence-owner', key)
          header.setAttribute('data-slot', 'tool-block')
          header.setAttribute('data-tool-summary', '')
          header.setAttribute('data-conversation-scaffold', '')
          header.innerHTML = '<div class="group/disclosure-row"><button type="button" aria-expanded="false"><span data-codex-activity-face aria-hidden="true"><span data-codex-activity-content><span data-codex-activity-icon></span><span data-codex-tool-sequence-label></span></span></span><span aria-hidden="true">›</span></button></div>'
          first.before(header)
        }
        const button = header.querySelector('button')
        record = {header, button, units, open: disclosures.initial(memoryKey, button.getAttribute('aria-expanded') === 'true')}
      }
      record.units = units
      record.nativeOwners = new Map(units.map(unit => [unit, nativeOwner(unit)]))
      record.memoryKey = memoryKey
      record.current = current
      record.lastUnit = units.at(-1)
      hasCurrent ||= !!current
      paintToolSequenceGlyph(record.header, units, current ? current.glyph : undefined)
      attr(record.header, 'data-codex-activity-running', current?.running ? '' : null)
      // React may insert a new prose boundary before the same first tool.
      // Reposition only our sibling, never any native part.
      if (record.header.parentElement !== first.parentElement || record.header.nextElementSibling !== first) first.before(record.header)
      // Native summary counts stay verbatim in their own clause. Never add
      // them to mounted rows or infer commands/files from glyphs or locale.
      const labelNode = record.header.querySelector('[data-codex-tool-sequence-label]')
      if (labelNode.textContent !== label) labelNode.textContent = label
      // Reconstruct only the safe face, never a React-owned reasoning row.
      const face = record.header.querySelector('[data-codex-activity-face]')
      let sweep = face.querySelector('[data-codex-activity-sweep]')
      const brainRunning = current?.glyph?.kind === 'brain' && current.running
      if (!brainRunning) sweep?.remove()
      else {
        if (!sweep) {
          sweep = document.createElement('span')
          sweep.setAttribute('data-codex-activity-sweep', '')
          sweep.innerHTML = '<span><span data-codex-activity-content><span data-codex-activity-icon></span><span data-codex-activity-caption></span></span></span>'
          face.append(sweep)
        }
        const caption = sweep.querySelector('[data-codex-activity-caption]')
        if (caption.textContent !== label) caption.textContent = label
      }
      attr(record.button, 'aria-label', label)
      if (!record.bound) record.button.onclick = () => {
        // Fence late clicks before the dirty-pair scheduler sees a new route.
        if (!active || !pair.isConnected || currentScope() !== scope || currentIncarnation() !== incarnation || surface(pair) !== owner
          || identity(pair, currentScope()) !== key || states.get(pair)?.records.get(first) !== record) return
        if (!safeBoundaries(pair)) { clearPair(pair); return }
        if (!nativeOwnersMatch(record, record.units)) { reconcile(pair, scope); return }
        if (!runs(pair).groups.some(units => units.length === record.units.length && units.every((node, index) => node === record.units[index]))) {
          reconcile(pair, scope)
          return
        }
        record.open = !record.open
        // Revalidate the complete native message on interaction as React may
        // have changed its parts before the observer has reconciled them.
        record.memoryKey = disclosures.identity(pair, record.units, key)
        disclosures.remember(record)
        apply(record)
        // This explicit user click opens native run disclosures, not tool
        // result/action controls. Reconciliation never clicks native UI.
        if (record.open) for (const unit of record.units) {
          // Mounted rows already expose their native controls on expansion.
          // Forward only an opaque run summary whose members are unmounted;
          // opening a live ticker would replace those nodes and their handlers.
          if (!unit.matches('[data-tool-group]') || nativeRows([unit]).length) continue
          const toggle = unit.querySelector(':scope > [data-tool-summary] > [class~="group/disclosure-row"] > button')
          if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click()
        }
      }
      record.bound = true
      apply(record)
      records.set(first, record)
    }
    const retained = new Set([...records.values()].map(record => record.header))
    for (const record of previous.values()) if (!retained.has(record.header)) restoreFocus(record)
    const retainedUnits = new Set([...records.values()].flatMap(record => record.units))
    for (const node of owned(pair, `[${itemAttribute}]`)) if (!retainedUnits.has(node)) attr(node, itemAttribute, null)
    for (const node of owned(pair, '[data-codex-activity-native-current]')) {
      if (![...records.values()].some(record => !record.open && record.current?.row === node)) attr(node, 'data-codex-activity-native-current', null)
    }
    // The native status and timer stay mounted. Only its duplicate visual face
    // is suppressed while an observed active tail owns the activity slot.
    for (const row of owned(pair, busySelector)) attr(row, 'data-codex-activity-owned', hasCurrent ? '' : null)
    thinking(pair, !hasCurrent)
    for (const header of owned(pair, ownedSelector)) if (!retained.has(header)) { header.querySelector('button').onclick = null; header.remove() }
    states.set(pair, {key, surface: owner, incarnation, records})
  }
  return {
    reconcile,
    reconcileObserved(pair, scope) {
      const state = states.get(pair)
      // Only refresh an already-owned projection before paint. New pairs and
      // owner handoffs still enter through the normal bounded scheduler.
      if (!active || !pair.isConnected || !state?.records.size
        || state.key !== identity(pair, scope) || state.surface !== surface(pair)
        || state.incarnation !== currentIncarnation()) return
      reconcile(pair, scope)
    },
    pruneDisconnected() {
      for (const [pair] of states) if (!pair.isConnected) clearPair(pair)
    },
    deactivate() {
      active = false
      disclosures.clear()
      for (const state of states.values()) for (const record of state.records.values()) restoreFocus(record)
    },
    cleanup() {
      active = false
      // Disable may precede the first scheduled adoption after hot reload.
      const pairs = new Set(states.keys())
      for (const node of document.querySelectorAll(`${ownedSelector}, [${itemAttribute}], [data-codex-activity-busy], [data-codex-activity-owned], [data-codex-tool-sequence-local-safe]`)) {
        const pair = node.closest('[data-slot="aui_turn-pair"]')
        if (pair) pairs.add(pair)
      }
      for (const pair of pairs) clearPair(pair)
      states.clear()
      disclosures.clear()
    }
  }
}
