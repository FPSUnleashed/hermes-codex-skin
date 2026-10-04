// Observe a real native-row open through the supported decoration slot.
// A hidden marker supplies the durable row identity without copying native actions.
async function readCodexInboxOpenedSession(thread, { stillCurrent = () => true, expectedRootId, followLineage = false } = {}) {
  const scope = thread?.scope, id = thread?.id
  if (!id || !scope || !stillCurrent()) throw new Error('Inbox open owner changed.')
  const bridge = globalThis.window?.hermesDesktop
  if (typeof bridge?.api !== 'function') throw new Error('Inbox requires the Desktop session API.')
  let resolvedId = id, lineage = null
  if (followLineage || expectedRootId && expectedRootId !== id) {
    const rootId = expectedRootId || id
    lineage = await bridge.api({
      connectionId: scope.connectionId, profile: scope.profile,
      path: `/api/sessions/${encodeURIComponent(rootId)}/latest-descendant?${new URLSearchParams({ profile: scope.profile })}`,
      timeoutMs: 60_000
    })
    if (!stillCurrent()) throw new Error('Inbox open owner changed.')
    if (lineage?.requested_session_id !== rootId || !Array.isArray(lineage.path) || lineage.path[0] !== rootId || lineage.path.at(-1) !== lineage.session_id || lineage.path.some(value => typeof value !== 'string' || !value)) {
      throw new Error('Inbox opened-chat lineage could not be verified.')
    }
    if (expectedRootId && !lineage.path.includes(id)) throw Object.assign(new Error('Inbox opened-chat target does not belong to the clicked row.'), { code: 'OPEN_TARGET_NOT_FOCUSED' })
    if (followLineage) resolvedId = lineage.session_id
  }
  const row = await bridge.api({
    connectionId: scope.connectionId, profile: scope.profile,
    path: `/api/sessions/${encodeURIComponent(resolvedId)}?${new URLSearchParams({ profile: scope.profile })}`,
    timeoutMs: 60_000
  })
  if (!stillCurrent()) throw new Error('Inbox open owner changed.')
  if (!row || row.id !== resolvedId || typeof row.profile !== 'string') throw new Error('Inbox received incomplete opened-chat metadata.')
  let targetProfile = scope.profile
  if (row.profile !== targetProfile && typeof host.profileRoutes === 'function') {
    const routes = await host.profileRoutes()
    const matches = routes.filter(route => sameInboxScope(route, scope))
    if (matches.length === 1 && matches[0].targetProfile) targetProfile = matches[0].targetProfile
  }
  if (!stillCurrent() || row.profile !== targetProfile || row.connection_id && row.connection_id !== scope.connectionId) {
    throw new Error('Inbox opened-chat owner could not be verified.')
  }
  return { ...row, ...(lineage ? { _lineage_root_id: lineage.path[0], _lineage_ids: lineage.path } : {}), profile: scope.profile, connection_id: scope.connectionId }
}

function isCodexInboxSessionNotFound(error) {
  const status = error?.status ?? error?.statusCode
  if (status != null) return status === 404
  // Electron invoke drops statusCode. Read only the native HTTP prefix,
  // never a status mentioned inside an auth, transport or corrupt-body error.
  const nativeStatus = /^Error invoking remote method 'hermes:api': Error: (\d{3}): /.exec(error?.message || '')
  return nativeStatus?.[1] === '404'
}

async function codexInboxUnchangedOpenOwner(sessionId, scope, stillCurrent) {
  const roster = await globalThis.window?.hermesDesktop?.getAgentRoster?.()
  if (!stillCurrent() || !Array.isArray(roster?.sources) || !roster.sources.length || !Array.isArray(roster.agents)) return false
  if (roster.sources.some(source => source.reachable !== true || source.error || source.needsSignIn || !source.connectionId)) return false
  const sources = new Set(roster.sources.map(source => source.connectionId)), owners = new Map()
  for (const owner of roster.agents) {
    if (!sources.has(owner.connectionId) || typeof owner.profile !== 'string' || !owner.profile) return false
    owners.set(JSON.stringify([owner.connectionId, owner.profile]), owner)
  }
  if (!owners.has(JSON.stringify([scope.connectionId, scope.profile]))) return false
  if (owners.size === 1) return true
  // A mixed roster is not ambiguous when this exact stored id exists under
  // only one owner. Read metadata only and require a complete negative proof.
  let found = []
  const routes = [...owners.values()]
  for (let offset = 0; offset < routes.length; offset += 4) {
    const batch = await Promise.all(routes.slice(offset, offset + 4).map(async owner => {
      try {
        await readCodexInboxOpenedSession({ id: sessionId, scope: owner }, { stillCurrent })
        return owner
      } catch (error) {
        if (isCodexInboxSessionNotFound(error)) return null
        throw error
      }
    }))
    if (!stillCurrent()) return false
    found = found.concat(batch.filter(Boolean))
    if (found.length > 1 || found.some(owner => !sameInboxScope(owner, scope))) return false
  }
  return found.length === 1 && sameInboxScope(found[0], scope)
}

function bindCodexInboxNativeOpenIntent(row, sessionId, inbox, resolveGesture = null) {
  if (!row || !sessionId && !resolveGesture || !inbox) return () => {}
  let disposed = false, intent = null, timer = null, commitTimer = null, subscriptions = [], middlePress = null
  const key = thread => thread ? JSON.stringify([thread.scope.connectionId, thread.scope.profile, thread.id]) : null
  const reset = () => {
    intent = null
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (commitTimer !== null) clearTimeout(commitTimer)
    commitTimer = null
    subscriptions.forEach(stop => stop())
    subscriptions = []
  }
  const commit = async () => {
    const pending = intent, thread = codexInboxFocusedThread()
    if (disposed || !pending || pending.loading || !thread || readCodexInboxMode() !== 'on') return
    if (pending.scopeHint && !sameInboxScope(pending.scopeHint, thread.scope)) return
    if (!sameInboxScope(thread.scope, inboxOwnerScope())) return
    // The focus stores may publish owner and id separately. Never accept a
    // transitional old id as the target of a differently labelled native row.
    const targetId = pending.sessionId
    const sameLineage = thread.id === targetId || inbox.model?.key(thread.scope, targetId) === inbox.model?.key(thread.scope, thread.id)
    if (!sameLineage && key(thread) !== pending.before && thread.id === pending.beforeId) return
    pending.loading = true
    const revision = pending.revision
    const stillCurrent = () => !disposed && intent === pending && key(codexInboxFocusedThread()) === key(thread) && sameInboxScope(thread.scope, inboxOwnerScope())
    try {
      if (key(thread) === pending.before && !pending.scopeHint && !await codexInboxUnchangedOpenOwner(targetId, thread.scope, stillCurrent)) return
      const session = await readCodexInboxOpenedSession(thread, { stillCurrent, expectedRootId: sameLineage ? undefined : targetId })
      if (stillCurrent() && inbox.opened({ explicit: true, scope: thread.scope, id: thread.id, session })) reset()
    } catch (error) {
      // Native resume is asynchronous. A still-unchanged previous focus is
      // not a failed open, and must never be admitted on behalf of this row.
      if (error?.code === 'OPEN_TARGET_NOT_FOCUSED' && key(thread) === pending.before) return
      if (stillCurrent()) {
        host.notify?.({ kind: 'error', message: 'Could not return this chat to Inbox.' })
        reset()
      }
    } finally {
      if (intent === pending) {
        pending.loading = false
        if (pending.revision !== revision) scheduleCommit()
      }
    }
  }
  const scheduleCommit = () => {
    if (disposed || !intent || commitTimer !== null) return
    // Chrome can drain microtasks between capture and the native bubble handler.
    // A task boundary lets the real handler run before we inspect its result.
    commitTimer = setTimeout(() => { commitTimer = null; void commit() }, 0)
  }
  const activate = event => {
    if (disposed || readCodexInboxMode() !== 'on' || !event.isTrusted || event.shiftKey || event.defaultPrevented) return
    if (event.type === 'click' && event.button !== 0 || event.type === 'pointerup' && event.button !== 1) return
    let descriptor
    if (resolveGesture) {
      descriptor = resolveGesture(event)
      if (!descriptor || !row.contains(event.target)) return
    } else {
      const target = event.target?.closest?.('button[data-slot="row-button"]')
      if (!target || !row.contains(target) || event.target.closest?.('[data-row-actions], [data-reorder-handle]')) return
      descriptor = { sessionId, scope: null }
    }
    reset()
    const before = codexInboxFocusedThread()
    intent = { sessionId: descriptor.sessionId, scopeHint: descriptor.scope ? { ...descriptor.scope } : null, before: key(before), beforeId: before?.id, loading: false, revision: 0 }
    // Subscribe only during one verified open gesture, not once per idle row.
    subscriptions = ['focusedStoredSessionId', 'focusedSessionOwner', 'profile', 'connectionId']
      .map(name => host.state[name]?.subscribe?.(() => {
        if (intent) intent.revision++
        scheduleCommit()
      })).filter(Boolean)
    timer = setTimeout(reset, 60_000)
    // Native click/resume handlers must run first; do not prevent or forward them.
    scheduleCommit()
  }
  const pointerDown = event => {
    if (resolveGesture) return
    if (!event.isTrusted || event.button !== 1 || event.shiftKey || readCodexInboxMode() !== 'on') return
    const target = event.target?.closest?.('button[data-slot="row-button"]')
    middlePress = target && row.contains(target) && !event.target.closest?.('[data-row-actions], [data-reorder-handle]')
      ? { target, pointerId: event.pointerId } : null
  }
  const pointerUp = event => {
    const press = middlePress
    middlePress = null
    if (!press || press.pointerId !== event.pointerId || press.target !== event.target?.closest?.('button[data-slot="row-button"]')) return
    activate(event)
  }
  const pointerCancel = () => { middlePress = null }
  row.addEventListener('click', activate, true)
  if (resolveGesture) row.addEventListener('keydown', activate, true)
  row.addEventListener('pointerdown', pointerDown, true)
  row.addEventListener('pointerup', pointerUp, true)
  row.addEventListener('pointercancel', pointerCancel, true)
  return () => {
    disposed = true
    reset()
    middlePress = null
    row.removeEventListener('click', activate, true)
    if (resolveGesture) row.removeEventListener('keydown', activate, true)
    row.removeEventListener('pointerdown', pointerDown, true)
    row.removeEventListener('pointerup', pointerUp, true)
    row.removeEventListener('pointercancel', pointerCancel, true)
  }
}

function CodexInboxNativeOpenIntent({ sessionId, inbox }) {
  const marker = useRef(null)
  useEffect(() => bindCodexInboxNativeOpenIntent(marker.current?.closest?.('.row-hover'), sessionId, inbox), [sessionId, inbox])
  return jsx('span', { ref: marker, 'aria-hidden': true, style: { display: 'none' }, 'data-codex-inbox-open-observer': sessionId })
}

function startCodexInboxMenuOpenObserver(ctx, inbox) {
  const doc = globalThis.document
  if (!inbox || typeof doc?.addEventListener !== 'function') return () => {}
  const stop = bindCodexInboxNativeOpenIntent(doc, null, inbox, event => resolveCodexInboxMenuOpenGesture(event, { document: doc, queryClient }))
  ctx.onDispose(stop)
  return stop
}
