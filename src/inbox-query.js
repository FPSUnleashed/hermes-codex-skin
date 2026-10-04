// The native bridge reads metadata only. The existing React Query client owns
// refresh, deduplication and cancellation across renderer/plugin lifetimes.
const INBOX_MODE_KEY = 'inbox'
const INBOX_MODE_EVENT = `${ID}:inbox-mode`
const INBOX_ROWS_EVENT = `${ID}:inbox-rows`

function readCodexInboxMode() {
  try { return pluginStorage?.get(INBOX_MODE_KEY, 'on') === 'off' ? 'off' : 'on' }
  catch { return 'off' }
}

function setCodexInboxMode(mode, inbox) {
  const next = mode === 'off' ? 'off' : 'on'
  try {
    pluginStorage?.set(INBOX_MODE_KEY, next)
    if (pluginStorage?.get(INBOX_MODE_KEY, null) !== next) throw new Error('Inbox setting was not saved.')
  }
  catch {
    host.notify?.({ kind: 'error', message: 'Could not save the Inbox setting.' })
    return readCodexInboxMode()
  }
  inbox?.setMode(next === 'on')
  globalThis.window?.dispatchEvent?.(new CustomEvent(INBOX_MODE_EVENT, { detail: next }))
  return next
}

function inboxGatewayScope() {
  return {
    connectionId: String(host.state.connectionId?.get?.() || host.activeConnectionId?.() || ''),
    profile: String(host.state.profile?.get?.() || 'default')
  }
}

function inboxOwnerScope() {
  return codexInboxFocusedThread()?.scope || inboxGatewayScope()
}

function sameInboxScope(left, right) {
  return left.connectionId === right.connectionId && left.profile === right.profile
}

async function readCodexInboxRowOwner(scope) {
  // Route inventory alone can hide failed source enumerations. Require the
  // credential-free roster's complete source status for an id-only row slot.
  if (typeof window.hermesDesktop?.getAgentRoster !== 'function') return null
  try {
    const roster = await window.hermesDesktop.getAgentRoster()
    const sources = roster?.sources
    if (!Array.isArray(sources) || sources.length !== 1 || sources[0]?.reachable !== true || sources[0]?.error || sources[0]?.needsSignIn || sources[0]?.connectionId !== scope.connectionId) return null
    const routes = roster.agents
    if (!Array.isArray(routes) || !routes.length || routes.some(route =>
      typeof route?.connectionId !== 'string' || !route.connectionId || typeof route.profile !== 'string' || !route.profile)) return null
    const owners = new Map(routes.map(route => [JSON.stringify([route.connectionId, route.profile]), route]))
    const owner = owners.size === 1 ? [...owners.values()][0] : null
    return owner && sameInboxScope(owner, scope) ? { ...scope } : null
  } catch { return null }
}

function codexInboxBadgeScope(inbox, sessionId, currentScope) {
  const evidence = inbox?.rowOwnerEvidence
  return evidence?.scope && sameInboxScope(evidence.scope, currentScope) && evidence.ids.includes(sessionId)
    ? evidence.scope : null
}

function codexInboxFocusedThread() {
  const owner = host.state.focusedSessionOwner?.get?.()
  const id = host.state.focusedStoredSessionId?.get?.()
  return typeof id === 'string' && id && typeof owner?.connectionId === 'string' && owner.connectionId && typeof owner.profile === 'string' && owner.profile
    ? { id, scope: { connectionId: owner.connectionId, profile: owner.profile } } : null
}

function codexInboxLiveFocus() {
  const thread = codexInboxFocusedThread(), runtimeId = host.state.focusedSessionId?.get?.()
  return thread && typeof runtimeId === 'string' && runtimeId ? { ...thread.scope, runtimeId, storedId: thread.id } : null
}

function codexInboxLiveStoredIds(row) {
  return [row.session_key, row.stored_session_id].filter(id => typeof id === 'string' && id)
}

function codexInboxLiveStoredMatch(storedId, row, metadata) {
  const stored = codexInboxLiveStoredIds(row)
  return stored.includes(storedId) || metadata.some(session => {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    return ids.includes(storedId) && stored.some(id => ids.includes(id))
  })
}

function resolveCodexInboxLiveSessions(scope, targetProfile, rawRows, metadata, owners) {
  const liveSessions = [], unresolved = new Set()
  let liveStatusKnown = true
  for (const row of rawRows) {
    if (!row || typeof row !== 'object') { liveStatusKnown = false; continue }
    if (row.connection_id && row.connection_id !== scope.connectionId) continue
    if (row.profile && row.profile !== targetProfile) continue
    const runtimeId = row.session_id || row.id
    const proof = owners.get(JSON.stringify([scope.connectionId, runtimeId]))
    if (row.profile || proof && !proof.conflicted && codexInboxLiveStoredMatch(proof.storedId, row, metadata)) {
      if (!row.profile && proof.profile !== scope.profile) continue
      liveSessions.push({ ...row, profile: scope.profile, connection_id: scope.connectionId })
    } else {
      const ids = codexInboxLiveStoredIds(row)
      if (!ids.length) liveStatusKnown = false
      ids.forEach(id => unresolved.add(id))
    }
  }
  for (const session of metadata) {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    if (!ids.some(id => unresolved.has(id))) continue
    if (liveSessions.some(row => codexInboxLiveStoredIds(row).some(id => ids.includes(id)))) continue
    // This guards a known durable row. Never give an unowned runtime an alias
    // into this profile or use its activity as an admission/completion signal.
    liveSessions.push({ id: session.id, session_key: session.id, status: 'unknown', profile: scope.profile, connection_id: scope.connectionId })
  }
  return { liveSessions, liveStatusKnown }
}


async function readCodexInboxPage(scope, pageCount, signal, inbox, liveOwners = new Map(), onMetadata = () => {}) {
  const bridge = globalThis.window?.hermesDesktop
  if (typeof bridge?.api !== 'function') throw new Error('Inbox requires the Desktop session API.')
  const focusedBefore = codexInboxLiveFocus()
  const sessions = new Map()
  let offset = 0, total = 0
  let targetProfile = scope.profile
  for (let page = 0; page < pageCount; page++) {
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    const params = new URLSearchParams({
      limit: '100', offset: String(offset), min_messages: '1',
      archived: 'exclude', order: 'recent', profile: scope.profile
    })
    const data = await bridge.api({
      ...(scope.connectionId ? { connectionId: scope.connectionId } : {}),
      profile: scope.profile,
      path: `/api/sessions?${params}`, timeoutMs: 60_000
    })
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    if (!Array.isArray(data?.sessions) || !Number.isFinite(data.total) || data.total < 0) {
      throw new Error('Inbox received an incomplete session list.')
    }
    if (targetProfile === scope.profile && data.sessions.some(session => session.profile && session.profile !== scope.profile) && host.profileRoutes) {
      const routes = await host.profileRoutes()
      const matches = routes.filter(route => sameInboxScope(route, scope))
      if (matches.length === 1 && typeof matches[0].targetProfile === 'string' && matches[0].targetProfile) targetProfile = matches[0].targetProfile
      if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    }
    if (data.errors?.length || data.storage?.[targetProfile] === 'corrupt') {
      throw new Error('The session list could not be read completely.')
    }
    total = data.total
    for (const session of data.sessions) {
      // A scoped response may still contain a carried row from another owner.
      if (session.profile && session.profile !== targetProfile) continue
      if (session.connection_id && session.connection_id !== scope.connectionId) continue
      if (session.hidden || session.archived || !session.id) continue
      const durable = session._lineage_root_id || session.id
      const previous = sessions.get(durable)
      if (!previous || (session.last_active || 0) > (previous.last_active || 0)) sessions.set(durable, { ...session, profile: scope.profile })
    }
    // Pinned backfills can exceed the requested page. They must not advance
    // the database offset past conversations we have not fetched.
    offset += 100
    if (offset >= total) break
    if (!data.sessions.length) throw new Error('Inbox pagination stopped before the end of the session list.')
  }
  // Only known attention is fetched beyond the recent metadata page. Removing
  // manual history pagination must not truncate admitted or reopened threads.
  const explicitRequestedIds = [...new Set([
    ...(inbox?.admission?.explicitSessionIds?.(scope) || []),
    ...(inbox?.admission?.admittedSessionIds?.(scope) || [])
  ])].filter(id => !inbox.model.isSettled(scope, id) && !inbox.model.isSnoozed(scope, id))
  const listedIds = new Set([...sessions.values()].flatMap(row => [row.id, row._lineage_root_id, ...(row._lineage_ids || [])].filter(Boolean)))
  const missing = explicitRequestedIds.filter(id => !listedIds.has(id))
  for (let index = 0; index < missing.length; index += 4) {
    const rows = await Promise.all(missing.slice(index, index + 4).map(async id => {
      try {
        return await readCodexInboxOpenedSession({ id, scope }, {
          followLineage: true,
          stillCurrent: () => !signal?.aborted && sameInboxScope(scope, inboxOwnerScope())
        })
      } catch (error) {
        if (isCodexInboxSessionNotFound(error)) return null
        throw error
      }
    }))
    for (const row of rows) {
      if (row && !row.archived && !row.hidden) sessions.set(row._lineage_root_id || row.id, row)
    }
  }
  // Paint the owner-scoped list without waiting for activity/roster round trips.
  // This stage deliberately carries no authority for activity or Settle.
  onMetadata({ sessions: [...sessions.values()], explicitRequestedIds, hasMore: offset < total })
  let liveSessions = [], rawLiveSessions = [], liveStatusKnown = false, liveReadSucceeded = false, liveStatusAt = 0
  try {
    if (!sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    let live
    if (typeof host.requestProfile === 'function' && typeof host.profileRoutes === 'function') {
      const routes = (await host.profileRoutes()).filter(route => sameInboxScope(route, scope))
      if (routes.length !== 1 || signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox live owner could not be verified.')
      if (typeof routes[0].targetProfile === 'string' && routes[0].targetProfile) targetProfile = routes[0].targetProfile
      liveStatusAt = Date.now()
      live = await host.requestProfile(routes[0], 'session.active_list', { profile: targetProfile })
    } else {
      // A legacy ambient request is safe only for the gateway it actually uses.
      if (!sameInboxScope(scope, inboxGatewayScope())) throw new Error('Inbox requires explicit live-owner routing.')
      liveStatusAt = Date.now()
      live = await host.request('session.active_list', { profile: targetProfile })
    }
    if (Array.isArray(live?.sessions)) {
      liveReadSucceeded = true
      // Keep only identity/status metadata, not another profile's preview text.
      const fields = ['id', 'session_id', 'session_key', 'stored_session_id', 'profile', 'connection_id', 'status', 'state', 'busy']
      rawLiveSessions = live.sessions.map(row => row && typeof row === 'object'
        ? Object.fromEntries(fields.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]])) : null)
      const focusedAfter = codexInboxLiveFocus(), metadata = [...sessions.values()]
      if (focusedBefore && JSON.stringify(focusedBefore) === JSON.stringify(focusedAfter) && sameInboxScope(focusedBefore, scope)) {
        const matching = rawLiveSessions.filter(row => row && (row.session_id || row.id) === focusedBefore.runtimeId &&
          (!row.profile || row.profile === targetProfile) && (!row.connection_id || row.connection_id === scope.connectionId) &&
          codexInboxLiveStoredMatch(focusedBefore.storedId, row, metadata))
        if (matching.length === 1) {
          const key = JSON.stringify([scope.connectionId, focusedBefore.runtimeId]), previous = liveOwners.get(key)
          const conflict = previous && (previous.conflicted || previous.profile !== focusedBefore.profile ||
            !codexInboxLiveStoredMatch(previous.storedId, matching[0], metadata))
          liveOwners.set(key, conflict ? { ...previous, conflicted: true } : focusedBefore)
        }
      }
      ;({ liveSessions, liveStatusKnown } = resolveCodexInboxLiveSessions(scope, targetProfile, rawLiveSessions, metadata, liveOwners))
      // A send can start before SQLite moves the old thread into the recent
      // page. Backfill only positively owned work, never unowned runtime IDs.
      const knownIds = new Set(metadata.flatMap(row => [row.id, row._lineage_root_id, ...(row._lineage_ids || [])].filter(Boolean)))
      const workingIds = [...new Set(liveSessions.filter(row => codexInboxWorkStatus(row) === 'work')
        .flatMap(codexInboxLiveStoredIds))].filter(id => !knownIds.has(id))
      for (let index = 0; index < workingIds.length; index += 4) {
        const rows = await Promise.all(workingIds.slice(index, index + 4).map(async id => {
          try {
            return await readCodexInboxOpenedSession({ id, scope }, {
              stillCurrent: () => !signal?.aborted && sameInboxScope(scope, inboxOwnerScope())
            })
          } catch (error) {
            if (isCodexInboxSessionNotFound(error)) return null
            throw error
          }
        }))
        for (const row of rows) if (row && !row.hidden && !row.archived) sessions.set(row._lineage_root_id || row.id, row)
      }
      if (workingIds.length) {
        ;({ liveSessions, liveStatusKnown } = resolveCodexInboxLiveSessions(scope, targetProfile, rawLiveSessions, [...sessions.values()], liveOwners))
      }
    }
  } catch {
    // A partial live read or failed work backfill must not authorize Settle.
    liveSessions = []; rawLiveSessions = []; liveStatusKnown = false; liveReadSucceeded = false
  }
  if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
  const rowOwnerScope = await readCodexInboxRowOwner(scope)
  if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
  return { sessions: [...sessions.values()], liveSessions, rawLiveSessions, targetProfile, liveStatusKnown, liveReadSucceeded, liveStatusAt, rowOwnerScope, explicitRequestedIds, hasMore: offset < total }
}

function startCodexInboxObserver(ctx, inbox) {
  // A data service must not inherit the mount lifetime of optional UI chrome.
  // The vendored observer uses the SDK's cache, never a plugin-owned client.
  if (!inbox) return () => {}
  let scope = inboxOwnerScope(), pageCount = 1, mode = readCodexInboxMode(), disposed = false
  const liveOwners = new Map()
  let metadataPreview = null
  let liveAuthority = Symbol('Inbox live connection')
  const options = () => {
    const owner = { ...scope }, pages = pageCount
    return {
      queryKey: [ID, 'inbox', owner.connectionId, owner.profile, pages],
      queryFn: async ({ signal }) => {
        const authority = liveAuthority, proofs = new Map(liveOwners)
        const data = await readCodexInboxPage(owner, pages, signal, inbox, proofs, metadata => {
          if (disposed || signal.aborted || authority !== liveAuthority || mode !== 'on' || !sameInboxScope(owner, inboxOwnerScope())) return
          metadataPreview = metadata
          project()
        })
        // In-flight reads and native cache hits cannot carry authority across
        // a disconnect or a new plugin lifetime. Stage owner proofs likewise.
        const connected = !sameInboxScope(owner, inboxGatewayScope()) ||
          !host.state.gateway || host.state.gateway.get() === 'open'
        const current = !disposed && authority === liveAuthority && connected && !signal.aborted
        if (current && data.liveReadSucceeded) {
          for (const [key, proof] of proofs) liveOwners.set(key, proof)
        }
        if (current) metadataPreview = null
        return { ...data, _codexInboxLiveAuthority: current && data.liveReadSucceeded ? authority : null }
      },
      enabled: mode === 'on', staleTime: 10_000,
      refetchInterval: mode === 'on' ? 10_000 : false, retry: 1
    }
  }
  const observer = new CodexInboxObserverVendor.QueryObserver(queryClient, options())
  const markReady = () => {
    const query = observer.getCurrentResult()
    const ready = !disposed && mode === 'on' && sameInboxScope(scope, inboxOwnerScope()) && !query.isPending && !query.error && !!query.data
    const island = globalThis.document?.querySelector?.('[data-codex-inbox-owned="island"]')
    if (island && island.dataset.codexInboxQueryReady !== String(ready)) island.dataset.codexInboxQueryReady = String(ready)
  }
  const project = () => {
    if (disposed || !sameInboxScope(scope, inboxOwnerScope())) return
    const query = observer.getCurrentResult(), owner = { ...scope }, data = metadataPreview || query.data
    const authoritative = !query.error && data?._codexInboxLiveAuthority === liveAuthority
    const live = authoritative && Array.isArray(data?.rawLiveSessions)
      ? resolveCodexInboxLiveSessions(owner, data.targetProfile, data.rawLiveSessions, data.sessions, liveOwners)
      : { liveSessions: [], liveStatusKnown: false }
    inbox.setMode(mode === 'on')
    inbox.rowOwnerEvidence = mode === 'on' && !query.error && data?.rowOwnerScope && sameInboxScope(data.rowOwnerScope, owner)
      ? { scope: owner, ids: data.sessions.flatMap(session => [session.id, session._lineage_root_id, ...(session._lineage_ids || [])].filter(Boolean)) }
      : null
    window.dispatchEvent(new CustomEvent(INBOX_ROWS_EVENT))
    inbox.update({
      scope: owner,
      sessions: data?.sessions || [], liveSessions: live?.liveSessions || [],
      liveStatusKnown: authoritative && !!data?.liveStatusKnown && !!live?.liveStatusKnown,
      liveStatusAt: data?.liveStatusAt,
      busyBySession: host.state.busyBySession?.get?.() || {},
      // The SDK's id-only busy map cannot prove ownership across namespaces.
      // Retain it as a conservative action guard, never as admission evidence.
      busyOwnerKnown: authoritative && !!data?.rowOwnerScope && sameInboxScope(data.rowOwnerScope, owner),
      focusedStoredSessionId: host.state.focusedStoredSessionId?.get?.() || null,
      explicitRequestedIds: data?.explicitRequestedIds,
      loading: !data && (query.isPending || query.isFetching),
      error: query.error ? 'Could not refresh Inbox.' : null,
      hasMore: !!data?.hasMore,
      loadMore: () => {
        if (disposed || mode !== 'on' || !sameInboxScope(owner, scope)) return
        pageCount++
        observer.setOptions(options())
        project()
      },
      retry: () => {
        if (!disposed && mode === 'on' && sameInboxScope(owner, scope)) void observer.refetch()
      }
    })
    markReady()
  }
  const configure = () => {
    if (disposed) return
    const nextScope = inboxOwnerScope(), nextMode = readCodexInboxMode()
    if (sameInboxScope(scope, nextScope) && mode === nextMode) return
    if (!sameInboxScope(scope, nextScope)) { scope = nextScope; pageCount = 1; metadataPreview = null }
    mode = nextMode
    observer.setOptions(options())
    project()
  }
  const stopQuery = observer.subscribe(project)
  const verifyLiveEvent = event => {
    const query = observer.getCurrentResult(), data = query.data
    if (disposed || mode !== 'on' || event.replayed || !event.session_id || query.error ||
        event.connectionId !== scope.connectionId || event.profile !== scope.profile ||
        !sameInboxScope(scope, inboxOwnerScope()) || data?._codexInboxLiveAuthority !== liveAuthority) return false
    const raw = data.rawLiveSessions.filter(row => row && (row.session_id || row.id) === event.session_id)
    if (raw.some(row => row.profile && row.profile !== data.targetProfile || row.connection_id && row.connection_id !== scope.connectionId)) return false
    const proof = liveOwners.get(JSON.stringify([scope.connectionId, event.session_id]))
    if (proof && !proof.conflicted && proof.profile === scope.profile &&
        (!raw.length || raw.length === 1 && codexInboxLiveStoredMatch(proof.storedId, raw[0], data.sessions)) &&
        data.sessions.some(row => [row.id, row._lineage_root_id, ...(row._lineage_ids || [])].includes(proof.storedId))) return true
    return raw.length === 1 && raw[0].profile === data.targetProfile &&
      data.sessions.some(row => codexInboxLiveStoredMatch(row.id, raw[0], [row]))
  }
  inbox.verifyLiveEvent = verifyLiveEvent
  const subscriptions = [
    ...['profile', 'connectionId', 'focusedSessionOwner'].map(name => host.state[name]?.subscribe?.(configure)),
    host.state.focusedStoredSessionId?.subscribe?.(() => { configure(); project() }),
    host.state.busyBySession?.subscribe?.(project),
    host.state.gateway?.subscribe?.(() => {
      if (host.state.gateway.get() !== 'open') {
        liveAuthority = Symbol('Inbox live connection')
        metadataPreview = null
        liveOwners.clear()
        project()
      } else if (mode === 'on') {
        project()
        void observer.refetch()
      }
    })
  ].filter(Boolean)
  if (typeof host.onEvent === 'function') subscriptions.push(host.onEvent('*', event => {
    // SDK profile tags can describe the active surface, not the event producer.
    // They may trigger a scoped read; only that read can establish ownership.
    if (!event.replayed && ['message.start', 'message.complete', 'error'].includes(event.type) &&
        mode === 'on' && event.connectionId === scope.connectionId && event.profile === scope.profile) {
      void observer.refetch({ cancelRefetch: false })
    }
  }))
  window.addEventListener(INBOX_MODE_EVENT, configure)
  // The DOM adapter creates/recreates its island asynchronously, including on
  // navigation after a cache hit. Keep readiness accurate without refetching.
  const readiness = globalThis.document?.body && typeof window.MutationObserver === 'function'
    ? new window.MutationObserver(markReady) : null
  readiness?.observe(document.body, { childList: true, subtree: true })
  project()
  const stop = () => {
    if (disposed) return
    disposed = true
    subscriptions.forEach(unsubscribe => unsubscribe())
    window.removeEventListener(INBOX_MODE_EVENT, configure)
    readiness?.disconnect()
    stopQuery()
    observer.destroy()
    liveOwners.clear()
    if (inbox.verifyLiveEvent === verifyLiveEvent) delete inbox.verifyLiveEvent
    inbox.rowOwnerEvidence = null
    markReady()
  }
  ctx.onDispose(stop)
  return stop
}

function CodexSettledBadge({ sessionId, inbox }) {
  const profile = useValue(host.state.profile)
  const connectionId = useValue(host.state.connectionId)
  const [, repaint] = useState(0)
  useEffect(() => {
    const changed = () => repaint(value => value + 1)
    const stopModel = inbox?.model.subscribe(changed)
    window.addEventListener(INBOX_MODE_EVENT, changed)
    window.addEventListener(INBOX_ROWS_EVENT, changed)
    return () => { stopModel?.(); window.removeEventListener(INBOX_MODE_EVENT, changed); window.removeEventListener(INBOX_ROWS_EVENT, changed) }
  }, [inbox])
  const currentScope = { connectionId: String(connectionId || host.activeConnectionId?.() || ''), profile: String(profile || 'default') }
  const scope = codexInboxBadgeScope(inbox, sessionId, currentScope)
  // The native slot supplies only an id. Never decorate a mixed-owner row by
  // borrowing the active gateway's identity, even if that id exists there.
  if (!scope) return null
  if (!inbox || readCodexInboxMode() !== 'on') return null
  if (!inbox.admission?.isEligible(scope, sessionId)) return null
  const settled = inbox.model.isSettled(scope, sessionId)
  const snoozed = inbox.model.isSnoozed?.(scope, sessionId) === true
  if (!settled && !snoozed) return null
  const stop = event => { event.preventDefault(); event.stopPropagation() }
  const badge = (label, action, title, apply) => jsx('button', {
    type: 'button', key: label, 'data-codex-inbox-owned': 'badge', 'aria-label': action, title,
    onPointerDown: stop,
    onClick: async event => {
      stop(event)
      // A row from the previous owner can remain mounted during a switch.
      if (readCodexInboxMode() !== 'on' || codexInboxBadgeScope(inbox, sessionId, inboxOwnerScope()) !== scope) return
      const freshOwner = await readCodexInboxRowOwner(scope)
      if (freshOwner && readCodexInboxMode() === 'on' && codexInboxBadgeScope(inbox, sessionId, inboxOwnerScope()) === scope) apply()
    },
    children: [
      jsx('span', { className: 'codex-inbox-settled', children: label }),
      jsx('span', { className: 'codex-inbox-unsettle', children: action })
    ]
  })
  const badges = []
  if (settled) badges.push(badge('Settled', 'Un-settle', 'Un-settle', () => inbox.model.unsettle(scope, sessionId)))
  if (snoozed) {
    const deadline = new Date(inbox.model.snoozedUntil(scope, sessionId)).toLocaleString()
    badges.push(badge('Snoozed', 'Wake now', `Snoozed until ${deadline}`, () => inbox.model.cancelSnooze(scope, sessionId)))
  }
  return badges.length === 1 ? badges[0] : jsx('span', { style: { display: 'inline-flex' }, children: badges })
}

function connectCodexInboxEvents(inbox) {
  if (!inbox || !host.onEvent) return () => {}
  return host.onEvent('*', event => {
    if (event.replayed) return
    // Presentation tags alone cannot prove ownership, even when populated.
    // Verify the runtime against the observer's connected owner evidence.
    if (!event.connectionId || !event.profile || !event.session_id) return
    if (typeof inbox.verifyLiveEvent !== 'function' || !inbox.verifyLiveEvent(event)) return
    if (typeof inbox.activity === 'function') inbox.activity(event)
    else if (['message.start', 'tool.start'].includes(event.type)) {
      inbox.reactivate({ type: 'work', scope: { connectionId: event.connectionId, profile: event.profile }, session_id: event.session_id })
    }
  })
}
