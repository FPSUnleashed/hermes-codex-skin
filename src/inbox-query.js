// The native bridge reads metadata only. The existing React Query client owns
// refresh, deduplication and cancellation across renderer/plugin lifetimes.
const INBOX_MODE_KEY = 'inbox'
const INBOX_MODE_EVENT = `${ID}:inbox-mode`
const INBOX_PROFILES_KEY = 'inbox-profiles'
const INBOX_PROFILES_EVENT = `${ID}:inbox-profiles`
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

function readCodexInboxProfiles() {
  try {
    const raw = pluginStorage?.get(INBOX_PROFILES_KEY)
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(saved) ? saved.filter(value => typeof value === 'string') : []
  } catch { return [] }
}

function setCodexInboxProfiles(profiles, inbox) {
  const next = Array.isArray(profiles) ? profiles.filter(value => typeof value === 'string') : []
  try {
    pluginStorage?.set(INBOX_PROFILES_KEY, next)
    const saved = pluginStorage?.get(INBOX_PROFILES_KEY, null)
    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved
    if (JSON.stringify(parsed) !== JSON.stringify(next)) throw new Error('Inbox profiles were not saved.')
  }
  catch {
    host.notify?.({ kind: 'error', message: 'Could not save the Inbox profile selection.' })
    return readCodexInboxProfiles()
  }
  globalThis.window?.dispatchEvent?.(new CustomEvent(INBOX_PROFILES_EVENT, { detail: next }))
  return next
}

function codexInboxProfileSelected(profile) {
  if (typeof profile !== 'string' || !profile || profile === '*') return false
  const selected = readCodexInboxProfiles()
  if (!selected.length) return false
  return selected.includes('*') || selected.includes(profile)
}

function inboxGatewayScope() {
  const selected = readCodexInboxProfiles()
  return {
    connectionId: String(host.state.connectionId?.get?.() || host.activeConnectionId?.() || ''),
    profile: selected.length ? '*' : String(host.state.profile?.get?.() || 'default')
  }
}

function inboxOwnerScope() {
  return codexInboxFocusedThread()?.scope || inboxGatewayScope()
}

function sameInboxScope(left, right) {
  if (!left || !right || left.connectionId !== right.connectionId) return false
  if (left.profile === '*' || right.profile === '*') return true
  return left.profile === right.profile
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
  const values = [row.session_key, row.stored_session_id]
  if (values.some(id => id != null && typeof id !== 'string')) return []
  return [...new Set(values.filter(id => typeof id === 'string' && id))]
}

function codexInboxLiveStoredMatch(storedId, row, metadata) {
  const stored = codexInboxLiveStoredIds(row)
  if (!stored.length) return false
  const touched = metadata.filter(session => {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    return stored.some(id => ids.includes(id))
  })
  const roots = new Set(touched.map(session => session._lineage_root_id || session.id))
  if (!touched.length) return stored.length === 1 && stored[0] === storedId
  return roots.size === 1 && touched.some(session => {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    return ids.includes(storedId) && stored.every(id => ids.includes(id))
  })
}

function codexInboxUniqueLiveRow(runtimeId, rows) {
  if (typeof runtimeId !== 'string' || !runtimeId) return null
  const matching = rows.filter(row => row && [row.id, row.session_id].includes(runtimeId))
  const row = matching.length === 1 ? matching[0] : null
  return row && (!row.id || !row.session_id || row.id === row.session_id) ? row : null
}

function codexInboxCanonicalRuntime(scope, targetProfile, runtimeId, rawRows, metadata, owners) {
  if (typeof runtimeId !== 'string' || !runtimeId) return null
  const rows = rawRows.filter(row => row && [row.id, row.session_id].includes(runtimeId))
  const row = codexInboxUniqueLiveRow(runtimeId, rawRows), proof = owners.get(JSON.stringify([scope.connectionId, runtimeId]))
  if (rows.length && !row) return null
  if (proof && (proof.conflicted || !sameInboxScope(proof, scope))) return null
  if (row && (row.connection_id && row.connection_id !== scope.connectionId || (targetProfile && targetProfile !== '*' && row.profile && row.profile !== targetProfile))) return null
  if (!proof && targetProfile && targetProfile !== '*' && (!row || row.profile !== targetProfile)) return null
  const stored = row ? codexInboxLiveStoredIds(row) : []
  if (row && (!stored.length || !stored.every(id => codexInboxLiveStoredMatch(id, row, metadata)))) return null
  const candidates = new Set(metadata.filter(session => {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    return (!proof || ids.includes(proof.storedId)) && stored.every(id => ids.includes(id))
  }).map(session => session._lineage_root_id || session.id))
  return candidates.size === 1 ? [...candidates][0] : null
}

function resolveCodexInboxLiveSessions(scope, targetProfile, rawRows, metadata, owners) {
  const liveSessions = [], unresolved = new Set()
  let liveStatusKnown = true
  for (const row of rawRows) {
    if (!row || typeof row !== 'object') { liveStatusKnown = false; continue }
    if (row.connection_id && row.connection_id !== scope.connectionId) continue
    if (targetProfile && targetProfile !== '*' && row.profile && row.profile !== targetProfile) continue
    const runtimeId = row.session_id || row.id
    const ids = codexInboxLiveStoredIds(row)
    const canonicalId = codexInboxCanonicalRuntime(scope, targetProfile, runtimeId, rawRows, metadata, owners)
    if (canonicalId) {
      const session = metadata.find(session => (session._lineage_root_id || session.id) === canonicalId)
      liveSessions.push({ ...row, session_key: session.id, stored_session_id: session.id,
        profile: session?.profile || row.profile || row._codexInboxRouteProfile || (scope.profile === '*' ? row.profile : scope.profile),
        connection_id: scope.connectionId, _codexInboxCanonicalId: canonicalId })
    } else {
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
    liveSessions.push({ id: session.id, session_key: session.id, _codexInboxCanonicalId: session._lineage_root_id || session.id, status: 'unknown', profile: scope.profile, connection_id: scope.connectionId })
  }
  return { liveSessions, liveStatusKnown }
}


async function readCodexInboxLiveIdentity(read, row) {
  try {
    const result = await read(row.session_id || row.id)
    const lines = typeof result?.output === 'string' ? result.output.split('\n') : []
    // The native status header is producer-owned. Never search titles or
    // trailing text for a path that could impersonate a profile identity.
    if (lines[0] !== 'Hermes TUI Status' || lines[1] !== '' ||
        !lines[2]?.startsWith('Session ID: ') || !lines[3]?.startsWith('Path: ')) return null
    const storedId = lines[2].slice(12), home = lines[3].slice(6)
    return storedId && home && codexInboxLiveStoredIds(row).includes(storedId) ? { storedId, home } : null
  } catch { return null }
}

async function proveCodexInboxBackgroundOwners(scope, targetProfile, rows, metadata, owners, focus, read, stillCurrent, onProof = () => {}) {
  const focusKey = focus && JSON.stringify([scope.connectionId, focus.runtimeId])
  const anchor = focusKey && owners.get(focusKey)
  if (!anchor || anchor.conflicted || !sameInboxScope(anchor, scope) || !stillCurrent()) return
  const focusedRow = codexInboxUniqueLiveRow(focus.runtimeId, rows)
  if (!focusedRow || focusedRow.profile && focusedRow.profile !== targetProfile ||
      focusedRow.connection_id && focusedRow.connection_id !== scope.connectionId ||
      !metadata.some(session => codexInboxLiveStoredMatch(session.id, focusedRow, metadata)) ||
      !codexInboxLiveStoredMatch(focus.storedId, focusedRow, metadata) ||
      !codexInboxLiveStoredMatch(anchor.storedId, focusedRow, metadata)) return
  let home = anchor.home
  if (!home) {
    const identity = await readCodexInboxLiveIdentity(read, focusedRow)
    if (!identity || !stillCurrent() || JSON.stringify(codexInboxLiveFocus()) !== JSON.stringify(focus)) return
    home = identity.home
    owners.set(focusKey, { ...anchor, home })
  }
  // A home shared by contradictory owner proofs cannot certify either owner.
  if ([...owners.values()].some(proof => proof.home === home && (proof.conflicted || !sameInboxScope(proof, scope)))) return
  onProof()
  const candidates = rows.filter(row => {
    if (!row || row.profile || row.connection_id && row.connection_id !== scope.connectionId) return false
    const runtimeId = row.session_id || row.id
    if (!runtimeId || owners.has(JSON.stringify([scope.connectionId, runtimeId]))) return false
    if (codexInboxUniqueLiveRow(runtimeId, rows) !== row) return false
    return metadata.some(session => codexInboxLiveStoredMatch(session.id, row, metadata))
  })
  for (let offset = 0; offset < candidates.length; offset += 4) {
    await Promise.all(candidates.slice(offset, offset + 4).map(async row => {
      const identity = await readCodexInboxLiveIdentity(read, row)
      if (!stillCurrent() || JSON.stringify(codexInboxLiveFocus()) !== JSON.stringify(focus) || identity?.home !== home) return
      owners.set(JSON.stringify([scope.connectionId, row.session_id || row.id]), {
        ...scope, runtimeId: row.session_id || row.id, storedId: identity.storedId, home
      })
      onProof()
    }))
    if (!stillCurrent() || JSON.stringify(codexInboxLiveFocus()) !== JSON.stringify(focus)) return
  }
}

async function readCodexInboxChildSnapshots(scope, liveSessions, read, stillCurrent, onProgress = () => {}) {
  const byThread = new Map(), unknown = new Set()
  const rows = liveSessions.filter(row => row._codexInboxCanonicalId && row.status !== 'unknown')
  const remaining = new Map()
  for (const row of rows) remaining.set(row._codexInboxCanonicalId, (remaining.get(row._codexInboxCanonicalId) || 0) + 1)
  const at = Date.now()
  const snapshot = () => ({
    childSnapshots: [...byThread].filter(([id]) => !unknown.has(id) && remaining.get(id) === 0).map(([session_id, ids]) => ({ session_id, childIds: [...ids], at })),
    childUnknownSessionIds: [...unknown].filter(id => remaining.get(id) === 0)
  })
  for (let offset = 0; offset < rows.length; offset += 4) {
    await Promise.all(rows.slice(offset, offset + 4).map(async row => {
      let result
      try {
        result = await read(row.session_id || row.id)
      } catch { result = null }
      if (!stillCurrent()) throw new Error('Inbox child snapshot lost its owner.')
      const id = row._codexInboxCanonicalId
      const valid = Array.isArray(result?.subagents) && !result.subagents.some(child =>
        typeof child?.subagent_id !== 'string' || !child.subagent_id || typeof child.status !== 'string')
      remaining.set(id, remaining.get(id) - 1)
      if (!valid) unknown.add(id)
      else {
        if (!byThread.has(id)) byThread.set(id, new Set())
        result.subagents.filter(child => ['running', 'pending', 'queued'].includes(child.status)).forEach(child => byThread.get(id).add(child.subagent_id))
      }
      onProgress(snapshot())
    }))
    if (!stillCurrent()) throw new Error('Inbox child snapshot lost its owner.')
  }
  return snapshot()
}

async function readCodexInboxPage(scope, pageCount, signal, inbox, liveOwners = new Map(), onMetadata = () => {}, nominations = () => [], onProgress = () => {}) {
  const bridge = globalThis.window?.hermesDesktop
  if (typeof bridge?.api !== 'function') throw new Error('Inbox requires the Desktop session API.')
  const focusedBefore = codexInboxLiveFocus()
  const sessions = new Map()
  let offset = 0, total = 0
  const aggregated = scope.profile === '*'
  const selectedProfiles = readCodexInboxProfiles()
  const allProfiles = selectedProfiles.includes('*')
  let targetProfile = scope.profile
  for (let page = 0; page < pageCount; page++) {
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    const routeProfile = aggregated ? 'all' : scope.profile
    const params = new URLSearchParams({
      limit: '100', offset: String(offset), min_messages: '1',
      archived: 'exclude', order: 'recent', profile: routeProfile
    })
    const data = await bridge.api({
      ...(scope.connectionId ? { connectionId: scope.connectionId } : {}),
      profile: routeProfile,
      path: `/api/sessions?${params}`, timeoutMs: 60_000
    })
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    if (!Array.isArray(data?.sessions) || !Number.isFinite(data.total) || data.total < 0) {
      throw new Error('Inbox received an incomplete session list.')
    }
    if (!aggregated && targetProfile === scope.profile && data.sessions.some(session => session.profile && session.profile !== scope.profile) && host.profileRoutes) {
      const routes = await host.profileRoutes()
      const matches = routes.filter(route => sameInboxScope(route, scope))
      if (matches.length === 1 && typeof matches[0].targetProfile === 'string' && matches[0].targetProfile) targetProfile = matches[0].targetProfile
      if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    }
    const rowsReturned = Array.isArray(data?.sessions) && data.sessions.length > 0
    const corruptProfile = aggregated
      ? Object.values(data?.storage || {}).some(value => value === 'corrupt')
      : data?.storage?.[targetProfile] === 'corrupt'
    if ((data?.errors?.length || corruptProfile) && !rowsReturned) {
      throw new Error('The session list could not be read completely.')
    }
    if (aggregated) {
      const totals = data?.totals || data?.profileTotals || data?.totalByProfile || data?.totalsByProfile
      if (totals && typeof totals === 'object' && !Array.isArray(totals)) {
        const profilesToSum = allProfiles ? Object.keys(totals) : selectedProfiles.filter(profile => profile !== '*')
        total = profilesToSum.reduce((sum, profile) => sum + (Number.isFinite(totals[profile]) ? totals[profile] : 0), 0)
      } else if (Array.isArray(data?.profiles)) {
        const profilesToSum = allProfiles ? data.profiles.map(item => item?.profile) : selectedProfiles.filter(profile => profile !== '*')
        total = data.profiles
          .filter(item => profilesToSum.includes(item?.profile))
          .reduce((sum, item) => sum + (Number.isFinite(item?.total) ? item.total : 0), 0)
      } else {
        total = Number.isFinite(data?.total) ? data.total : 0
      }
    } else {
      total = data.total
    }
    for (const session of data.sessions) {
      // A scoped response may still contain a carried row from another owner.
      if (aggregated) {
        if (!session.profile || session.profile === '*' || (!allProfiles && !selectedProfiles.includes(session.profile))) continue
      } else if (session.profile && session.profile !== targetProfile) continue
      if (session.connection_id && session.connection_id !== scope.connectionId) continue
      if (session.hidden || session.archived || !session.id) continue
      const durable = session._lineage_root_id || session.id
      const previous = sessions.get(durable)
      if (aggregated) codexInboxRememberProfile(scope, session)
      if (!previous || (session.last_active || 0) > (previous.last_active || 0)) sessions.set(durable, { ...session, profile: aggregated ? session.profile : scope.profile })
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
  // Discover a just-started old thread even if it is settled and still outside
  // the recent page. Discovery alone carries no attention authority.
  const pendingWorkIds = inbox?.pendingWorkSessionIds?.(scope) || []
  const listedIds = new Set([...sessions.values()].flatMap(row => [row.id, row._lineage_root_id, ...(row._lineage_ids || [])].filter(Boolean)))
  const nominatedIds = nominations().filter(focus => sameInboxScope(focus, scope)).map(focus => focus.storedId)
  const missing = [...new Set([...explicitRequestedIds, ...pendingWorkIds, ...nominatedIds])].filter(id => !listedIds.has(id))
  onMetadata({ sessions: [...sessions.values()], explicitRequestedIds, hasMore: offset < total })
  let publishProgress = () => {}
  const readMissing = async ids => {
  for (let index = 0; index < ids.length; index += 4) {
    const rows = await Promise.all(ids.slice(index, index + 4).map(async id => {
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
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    onMetadata({ sessions: [...sessions.values()], explicitRequestedIds, hasMore: offset < total })
    publishProgress()
  }
  }
  // Only the focused anchor can block ownership proof. Unrelated saved history
  // hydrates concurrently and cannot hold current activity behind its latency.
  const anchorIds = focusedBefore && missing.includes(focusedBefore.storedId) ? [focusedBefore.storedId] : []
  const anchorBackfill = readMissing(anchorIds).then(() => null, error => error)
  const historyBackfill = readMissing(missing.filter(id => !anchorIds.includes(id))).then(() => null, error => error)
  // Paint the owner-scoped list without waiting for activity/roster round trips.
  // This stage deliberately carries no authority for activity or Settle.
  onMetadata({ sessions: [...sessions.values()], explicitRequestedIds, hasMore: offset < total })
  let liveSessions = [], rawLiveSessions = [], liveStatusKnown = false, liveReadSucceeded = false, liveStatusAt = 0
  let childSnapshots = [], childUnknownSessionIds = []
  publishProgress = () => {
    if (!liveReadSucceeded || signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) return
    ;({ liveSessions, liveStatusKnown } = resolveCodexInboxLiveSessions(scope, targetProfile, rawLiveSessions, [...sessions.values()], liveOwners))
    onProgress({ sessions: [...sessions.values()], liveSessions, rawLiveSessions, childSnapshots, childUnknownSessionIds, targetProfile,
      liveStatusKnown, liveSnapshotComplete: false, liveReadSucceeded, liveStatusAt, rowOwnerScope: null, explicitRequestedIds, hasMore: offset < total })
  }
  try {
    if (!sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    let live, readIdentity, readChildren
    if (typeof host.requestProfile === 'function' && typeof host.profileRoutes === 'function') {
      const routes = (await host.profileRoutes()).filter(route => sameInboxScope(route, scope))
      const selectedRoutes = aggregated
        ? routes.filter(route => allProfiles || selectedProfiles.includes(route.profile) || route.profile === '*')
        : routes
      if (!selectedRoutes.length || signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox live owner could not be verified.')
      if (!aggregated) {
        if (selectedRoutes.length !== 1 || signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox live owner could not be verified.')
        if (typeof selectedRoutes[0].targetProfile === 'string' && selectedRoutes[0].targetProfile) targetProfile = selectedRoutes[0].targetProfile
      }
      liveStatusAt = Date.now()
      const routeByProfile = new Map(selectedRoutes.map(route => [route.profile, route]))
      if (aggregated) {
        const collected = []
        let succeeded = false
        for (const route of selectedRoutes) {
          try {
            const result = await host.requestProfile(route, 'session.active_list', { profile: route.targetProfile || route.profile || 'all' })
            if (Array.isArray(result?.sessions)) {
              succeeded = true
              for (const row of result.sessions) if (row && typeof row === 'object') collected.push({ ...row, _codexInboxRouteProfile: route.profile })
            }
          } catch { /* one unreachable profile must not blank the others */ }
        }
        if (!succeeded) throw new Error('Inbox live owner could not be verified.')
        live = { sessions: collected }
        const routeByRuntime = new Map()
        for (const row of collected) {
          codexInboxRememberProfile(scope, row)
          const runtimeId = row.session_id || row.id
          const profile = row.profile || row._codexInboxRouteProfile
          const route = routeByProfile.get(profile) || selectedRoutes[0]
          if (runtimeId && route) routeByRuntime.set(runtimeId, route)
        }
        readIdentity = sessionId => {
          const route = routeByRuntime.get(sessionId) || selectedRoutes[0]
          return host.requestProfile(route, 'session.status', { session_id: sessionId })
        }
        readChildren = sessionId => {
          const route = routeByRuntime.get(sessionId) || selectedRoutes[0]
          return host.requestProfile(route, 'subagent.list', { session_id: sessionId })
        }
      } else {
        live = await host.requestProfile(selectedRoutes[0], 'session.active_list', { profile: targetProfile })
        readIdentity = sessionId => host.requestProfile(selectedRoutes[0], 'session.status', { session_id: sessionId })
        readChildren = sessionId => host.requestProfile(selectedRoutes[0], 'subagent.list', { session_id: sessionId })
      }
    } else {
      // A legacy ambient request is safe only for the gateway it actually uses.
      if (!sameInboxScope(scope, inboxGatewayScope())) throw new Error('Inbox requires explicit live-owner routing.')
      liveStatusAt = Date.now()
      live = await host.request('session.active_list', { profile: targetProfile })
      readIdentity = sessionId => host.request('session.status', { session_id: sessionId })
      readChildren = sessionId => host.request('subagent.list', { session_id: sessionId })
    }
    if (Array.isArray(live?.sessions)) {
      liveReadSucceeded = true
      // Keep only identity/status metadata, not another profile's preview text.
      const fields = ['id', 'session_id', 'session_key', 'stored_session_id', 'profile', 'connection_id', 'status', 'state', 'busy', '_codexInboxRouteProfile']
      rawLiveSessions = live.sessions.map(row => row && typeof row === 'object'
        ? Object.fromEntries(fields.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]])) : null)
      if (aggregated) rawLiveSessions = rawLiveSessions.filter(row => row && (!row.profile || allProfiles || selectedProfiles.includes(row.profile)))
      const anchorError = await anchorBackfill
      if (anchorError) throw anchorError
      const focusedAfter = codexInboxLiveFocus(), metadata = [...sessions.values()]
      const stableFocus = focusedBefore && JSON.stringify(focusedBefore) === JSON.stringify(focusedAfter) ? [focusedBefore] : []
      // Departure preserves a nomination, not authority. The owner-routed
      // durable row and exactly one matching live runtime must validate it.
      for (const focus of [...stableFocus, ...nominations()]) {
        if (!sameInboxScope(focus, scope)) continue
        const row = codexInboxUniqueLiveRow(focus.runtimeId, rawLiveSessions)
        if (!row || (targetProfile && targetProfile !== '*' && row.profile && row.profile !== targetProfile) || row.connection_id && row.connection_id !== scope.connectionId ||
            !metadata.some(session => [session.id, session._lineage_root_id, ...(session._lineage_ids || [])].includes(focus.storedId)) ||
            !codexInboxLiveStoredMatch(focus.storedId, row, metadata)) continue
        const key = JSON.stringify([scope.connectionId, focus.runtimeId]), previous = liveOwners.get(key)
        const conflict = previous && (previous.conflicted || previous.profile !== focus.profile ||
          !codexInboxLiveStoredMatch(previous.storedId, row, metadata))
        liveOwners.set(key, conflict ? { ...previous, conflicted: true } : focus)
        if (!conflict && typeof previous?.home === 'string' && previous.home && sameInboxScope(previous, focus)) {
          liveOwners.set(key, { ...focus, home: previous.home })
        }
      }
      publishProgress()
      if (stableFocus.length && sameInboxScope(focusedBefore, scope)) {
        await proveCodexInboxBackgroundOwners(scope, targetProfile, rawLiveSessions, metadata, liveOwners, focusedBefore, readIdentity,
          () => !signal?.aborted && sameInboxScope(scope, inboxOwnerScope()), publishProgress)
      }
      ;({ liveSessions, liveStatusKnown } = resolveCodexInboxLiveSessions(scope, targetProfile, rawLiveSessions, metadata, liveOwners))
      // A send can start before SQLite moves the old thread into the recent
      // page. Backfill only positively owned work, never unowned runtime IDs.
      const knownIds = new Set(metadata.flatMap(row => [row.id, row._lineage_root_id, ...(row._lineage_ids || [])].filter(Boolean)))
      // Qualified producer rows can discover missing metadata, but receive no
      // canonical activity authority until that exact-owner metadata is read.
      const discovery = rawLiveSessions.filter(row => row && (aggregated ? (!row.profile || allProfiles || selectedProfiles.includes(row.profile)) : row.profile === targetProfile) &&
        (!row.connection_id || row.connection_id === scope.connectionId) &&
        codexInboxUniqueLiveRow(row.session_id || row.id, rawLiveSessions) === row &&
        new Set(codexInboxLiveStoredIds(row)).size === 1)
      const workingIds = [...new Set([...liveSessions, ...discovery].filter(row => codexInboxWorkStatus(row) === 'work')
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
      ;({ childSnapshots, childUnknownSessionIds } = await readCodexInboxChildSnapshots(scope, liveSessions, readChildren,
        () => !signal?.aborted && sameInboxScope(scope, inboxOwnerScope()), progress => {
          ;({ childSnapshots, childUnknownSessionIds } = progress)
          publishProgress()
        }))
    }
  } catch {
    // A partial live read or failed work backfill must not authorize Settle.
    liveSessions = []; rawLiveSessions = []; childSnapshots = []; childUnknownSessionIds = []; liveStatusKnown = false; liveReadSucceeded = false
  }
  const backfillErrors = await Promise.all([anchorBackfill, historyBackfill])
  const backfillError = backfillErrors.find(Boolean)
  if (backfillError) throw backfillError
  if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
  const rowOwnerScope = await readCodexInboxRowOwner(scope)
  if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
  return { sessions: [...sessions.values()], liveSessions, rawLiveSessions, childSnapshots, childUnknownSessionIds, targetProfile, liveStatusKnown, liveReadSucceeded, liveStatusAt, rowOwnerScope, explicitRequestedIds, hasMore: offset < total }
}

function startCodexInboxObserver(ctx, inbox) {
  // A data service must not inherit the mount lifetime of optional UI chrome.
  // The vendored observer uses the SDK's cache, never a plugin-owned client.
  if (!inbox) return () => {}
  let scope = inboxOwnerScope(), pageCount = 1, mode = readCodexInboxMode(), disposed = false
  const liveOwners = new Map()
  const nominatedFocus = new Map()
  const pendingEvents = []
  let refreshVersion = 0, refreshing = false
  let lastFocus = JSON.stringify(codexInboxLiveFocus()), lastBusy = new Set()
  let metadataPreview = null
  let progressSnapshot = null
  let liveAuthority = Symbol('Inbox live connection')
  const nominations = () => {
    for (const [key, item] of nominatedFocus) if (Date.now() - item.at > 10_000) nominatedFocus.delete(key)
    return [...nominatedFocus.values()].map(item => item.focus)
  }
  const rememberFocus = () => {
    const focus = codexInboxLiveFocus()
    const connected = !sameInboxScope(scope, inboxGatewayScope()) || !host.state.gateway || host.state.gateway.get() === 'open'
    if (disposed || mode !== 'on' || !connected || !focus || !sameInboxScope(focus, scope)) return
    nominations()
    const key = JSON.stringify(focus)
    nominatedFocus.delete(key)
    nominatedFocus.set(key, { focus, at: Date.now() })
    if (nominatedFocus.size > 64) nominatedFocus.delete(nominatedFocus.keys().next().value)
  }
  const options = () => {
    const owner = { ...scope }, pages = pageCount
    return {
      queryKey: [ID, 'inbox', owner.connectionId, owner.profile, pages],
      queryFn: async ({ signal }) => {
        const authority = liveAuthority, proofs = new Map(liveOwners)
        rememberFocus()
        const data = await readCodexInboxPage(owner, pages, signal, inbox, proofs, metadata => {
          if (disposed || signal.aborted || authority !== liveAuthority || mode !== 'on' || !sameInboxScope(owner, inboxOwnerScope())) return
          metadataPreview = metadata
          project()
        }, nominations, progress => {
          const connected = !sameInboxScope(owner, inboxGatewayScope()) || !host.state.gateway || host.state.gateway.get() === 'open'
          if (disposed || signal.aborted || authority !== liveAuthority || !connected || mode !== 'on' || !sameInboxScope(owner, inboxOwnerScope())) return
          for (const [key, proof] of proofs) liveOwners.set(key, proof)
          progressSnapshot = { ...progress, _codexInboxLiveAuthority: authority }
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
        if (current) { metadataPreview = null; progressSnapshot = null }
        return { ...data, _codexInboxLiveAuthority: current && data.liveReadSucceeded ? authority : null }
      },
      enabled: mode === 'on', staleTime: 10_000,
      refetchInterval: mode === 'on' ? 10_000 : false, retry: 1
    }
  }
  const observer = new CodexInboxObserverVendor.QueryObserver(queryClient, options())
  const refreshLiveIdentity = () => {
    // Capture transitions even while an older read awaits proof. A microtask
    // sees only the final focus after a synchronous departure.
    rememberFocus()
    refreshVersion++
    if (refreshing || disposed || mode !== 'on') return
    refreshing = true
    // Atom changes settle together. If an old fetch is already in flight,
    // finish it before requesting proof for the newly focused runtime.
    void Promise.resolve().then(async () => {
      try {
        while (!disposed && mode === 'on') {
          const version = refreshVersion
          rememberFocus()
          if (observer.getCurrentResult().isFetching) await observer.refetch({ cancelRefetch: false })
          if (disposed || mode !== 'on') break
          await observer.refetch()
          if (version === refreshVersion) break
        }
      } finally { refreshing = false }
    })
  }
  const pendingWorkSessionIds = owner => [...new Set(pendingEvents.filter(item => sameInboxScope(item.focus, owner) &&
    Date.now() - item.at <= 10_000).flatMap(item => item.storedIds))]
  inbox.pendingWorkSessionIds = pendingWorkSessionIds
  const markReady = () => {
    const query = observer.getCurrentResult()
    const ready = !disposed && mode === 'on' && sameInboxScope(scope, inboxOwnerScope()) && !query.isPending && !query.error && !!query.data
    const island = globalThis.document?.querySelector?.('[data-codex-inbox-owned="island"]')
    if (island && island.dataset.codexInboxQueryReady !== String(ready)) island.dataset.codexInboxQueryReady = String(ready)
  }
  const project = () => {
    if (disposed || !sameInboxScope(scope, inboxOwnerScope())) return
    const query = observer.getCurrentResult(), owner = { ...scope }, snapshot = progressSnapshot || query.data, data = metadataPreview || snapshot
    // Metadata can arrive before live RPCs. Retain this connection's last
    // proof, but revalidate it against the newest metadata before projecting.
    const authoritative = !query.error && snapshot?._codexInboxLiveAuthority === liveAuthority
    const live = authoritative && Array.isArray(snapshot?.rawLiveSessions)
      ? resolveCodexInboxLiveSessions(owner, snapshot.targetProfile, snapshot.rawLiveSessions, data.sessions, liveOwners)
      : { liveSessions: [], liveStatusKnown: false }
    if (authoritative) for (const id of snapshot.childUnknownSessionIds || []) {
      live.liveSessions.push({ id, session_key: id, _codexInboxCanonicalId: id, profile: owner.profile, connection_id: owner.connectionId, status: 'unknown' })
    }
    const verifiedRows = (live.liveSessions || []).filter(row =>
      row.profile === owner.profile && row.connection_id === owner.connectionId &&
      codexInboxUniqueLiveRow(row.session_id || row.id, snapshot.rawLiveSessions) && row.status !== 'unknown')
    const childSnapshots = authoritative ? (snapshot.childSnapshots || []).filter(child =>
      verifiedRows.some(row => row._codexInboxCanonicalId === child.session_id)) : []
    const busy = host.state.busyBySession?.get?.() || {}
    const busyBySession = {}, priority = { idle: 0, reading: 1, unknown: 2, work: 3 }
    for (const row of verifiedRows) {
      const runtimeId = row.session_id || row.id, storedId = row.session_key
      if (!storedId || !Object.hasOwn(busy, runtimeId)) continue
      const value = busy[runtimeId], previous = busyBySession[storedId]
      if (!Object.hasOwn(busyBySession, storedId) ||
          priority[codexInboxWorkStatus(value)] > priority[codexInboxWorkStatus(previous)]) busyBySession[storedId] = value
    }
    inbox.setMode(mode === 'on')
    inbox.rowOwnerEvidence = mode === 'on' && authoritative && snapshot?.rowOwnerScope && sameInboxScope(snapshot.rowOwnerScope, owner)
      ? { scope: owner, ids: data.sessions.flatMap(session => [session.id, session._lineage_root_id, ...(session._lineage_ids || [])].filter(Boolean)) }
      : null
    window.dispatchEvent(new CustomEvent(INBOX_ROWS_EVENT))
    inbox.update({
      scope: owner,
      sessions: data?.sessions || [], liveSessions: live?.liveSessions || [],
      liveStatusKnown: authoritative && !!snapshot?.liveStatusKnown && !!live?.liveStatusKnown,
      liveSnapshotComplete: snapshot?.liveSnapshotComplete !== false,
      liveStatusAt: authoritative ? snapshot?.liveStatusAt : undefined,
      childSnapshots,
      // ID-only busy flags borrow only independently verified runtime identity.
      busyBySession,
      busyOwnerKnown: authoritative && !!snapshot?.rowOwnerScope && sameInboxScope(snapshot.rowOwnerScope, owner),
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
    if (authoritative && pendingEvents.length) {
      for (let index = 0; index < pendingEvents.length;) {
        const item = pendingEvents[index]
        if (Date.now() - item.at > 10_000 || !sameInboxScope(item.focus, owner)) {
          pendingEvents.splice(index, 1); continue
        }
        const resolved = resolveLiveEvent(item.event)
        const session = resolved && data.sessions.find(session => session.id === resolved.session_id)
        const ids = session && [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
        if (!session || !item.storedIds.some(id => ids.includes(id))) { index++; continue }
        const key = inbox.model.key(owner, session)
        if (!key) { index++; continue }
        pendingEvents.splice(index, 1)
        // Resolve decisions after lineage is known, not against a transitional
        // focus tuple. An unrelated Settle must not discard this runtime's work.
        if ([...item.settledKeys].some(settled => inbox.model.key(owner, JSON.parse(settled)[2]) === key)) continue
        inbox.activity?.({ ...resolved, canonicalSessionId: resolved.session_id })
      }
    }
    markReady()
  }
  const configure = () => {
    if (disposed) return
    const nextScope = inboxOwnerScope(), nextMode = readCodexInboxMode()
    if (sameInboxScope(scope, nextScope) && mode === nextMode) return
    pendingEvents.length = 0
    nominatedFocus.clear()
    if (!sameInboxScope(scope, nextScope)) { scope = nextScope; pageCount = 1; metadataPreview = null; progressSnapshot = null }
    mode = nextMode
    observer.setOptions(options())
    project()
  }
  const stopQuery = observer.subscribe(project)
  const resolveLiveEvent = event => {
    const query = observer.getCurrentResult(), data = progressSnapshot || query.data
    const eventProfileOk = scope.profile === '*'
      ? (typeof event.profile === 'string' && event.profile && event.profile !== '*' && codexInboxProfileSelected(event.profile))
      : event.profile === scope.profile
    if (disposed || mode !== 'on' || event.replayed || !event.session_id || query.error ||
        event.connectionId !== scope.connectionId || !eventProfileOk ||
        !sameInboxScope(scope, inboxOwnerScope()) || data?._codexInboxLiveAuthority !== liveAuthority) return null
    const metadata = metadataPreview?.sessions || data.sessions
    const canonicalId = codexInboxCanonicalRuntime(scope, data.targetProfile, event.session_id, data.rawLiveSessions, metadata, liveOwners)
    if (!canonicalId) return null
    const matches = metadata.filter(session => (session._lineage_root_id || session.id) === canonicalId)
    return matches.length ? { ...event, session_id: matches[0].id } : null
  }
  const verifyLiveEvent = event => !!resolveLiveEvent(event)
  inbox.verifyLiveEvent = verifyLiveEvent
  inbox.resolveLiveEvent = resolveLiveEvent
  const profilesChanged = () => {
    if (disposed || mode !== 'on') return
    pendingEvents.length = 0
    nominatedFocus.clear()
    liveOwners.clear()
    metadataPreview = null
    progressSnapshot = null
    liveAuthority = Symbol('Inbox live connection')
    pageCount = 1
    observer.setOptions(options())
    void observer.refetch()
    project()
  }
  window.addEventListener(INBOX_PROFILES_EVENT, profilesChanged)
  const focusChanged = () => {
    configure(); rememberFocus(); project()
    const next = JSON.stringify(codexInboxLiveFocus())
    if (next !== lastFocus) {
      lastFocus = next
      refreshLiveIdentity()
    }
  }
  const busyChanged = () => {
    project()
    const values = host.state.busyBySession?.get?.() || {}
    const busy = new Set(Object.entries(values).filter(([, value]) => value === true).map(([id]) => id))
    if ([...busy].some(id => !lastBusy.has(id))) refreshLiveIdentity()
    lastBusy = busy
  }
  const subscriptions = [
    inbox.model?.subscribe?.(event => {
      if (event?.type !== 'manual-settle') return
      const settledKey = inbox.model.key(event.scope, event.session)
      if (!settledKey) return
      // Verification can finish after Settle. Only work received after that
      // successful decision may restore attention; wall-clock order is unsafe.
      for (let index = pendingEvents.length - 1; index >= 0; index--) {
        const item = pendingEvents[index]
        if (!sameInboxScope(item.focus, event.scope)) continue
        item.settledKeys.add(settledKey)
        if (item.settledKeys.size > 64) pendingEvents.splice(index, 1)
      }
    }),
    ...['profile', 'connectionId', 'focusedSessionOwner', 'focusedStoredSessionId', 'focusedSessionId'].map(name => host.state[name]?.subscribe?.(focusChanged)),
    host.state.busyBySession?.subscribe?.(busyChanged),
    host.state.gateway?.subscribe?.(() => {
      if (host.state.gateway.get() !== 'open') {
        liveAuthority = Symbol('Inbox live connection')
        metadataPreview = null
        progressSnapshot = null
        pendingEvents.length = 0
        nominatedFocus.clear()
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
    if (!event.replayed && ['message.start', 'message.complete', 'error', 'clarify.request', 'clarify.settled', 'approval.request', 'approval.settled', 'tool.complete', 'subagent.spawn_requested', 'subagent.start', 'subagent.complete'].includes(event.type) &&
        mode === 'on' && event.connectionId === scope.connectionId && (scope.profile === '*' ? (typeof event.profile === 'string' && event.profile && event.profile !== '*' && codexInboxProfileSelected(event.profile)) : event.profile === scope.profile)) {
      const currentFocus = codexInboxLiveFocus()
      if (currentFocus?.runtimeId === event.session_id) rememberFocus()
      const candidates = nominations().filter(focus => sameInboxScope(focus, scope) && focus.runtimeId === event.session_id)
      if (!verifyLiveEvent(event) && candidates.length) {
        // Keep only lifecycle + the nominated identity, never message content.
        // Runtime/stored atoms are not atomic. Retain alternatives and require
        // their independently proved durable lineage before releasing the event.
        const payload = {}
        if (typeof event.payload?.status === 'string') payload.status = event.payload.status
        if (typeof event.payload?.prompt_id === 'string') payload.prompt_id = event.payload.prompt_id
        if (typeof event.payload?.request_id === 'string') payload.request_id = event.payload.request_id
        if (event.payload?.error) payload.error = true
        if (typeof event.payload?.subagent_id === 'string') payload.subagent_id = event.payload.subagent_id
        pendingEvents.push({ focus: { ...scope }, storedIds: [...new Set(candidates.map(focus => focus.storedId))],
          settledKeys: new Set(), at: Date.now(), event: {
          type: event.type, ...scope, session_id: event.session_id, payload
        } })
        if (pendingEvents.length > 64) pendingEvents.splice(0, pendingEvents.length - 64)
      }
      refreshLiveIdentity()
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
    pendingEvents.length = 0
    nominatedFocus.clear()
    subscriptions.forEach(unsubscribe => unsubscribe())
    window.removeEventListener(INBOX_MODE_EVENT, configure)
    window.removeEventListener(INBOX_PROFILES_EVENT, profilesChanged)
    readiness?.disconnect()
    stopQuery()
    observer.destroy()
    liveOwners.clear()
    if (inbox.verifyLiveEvent === verifyLiveEvent) delete inbox.verifyLiveEvent
    if (inbox.resolveLiveEvent === resolveLiveEvent) delete inbox.resolveLiveEvent
    if (inbox.pendingWorkSessionIds === pendingWorkSessionIds) delete inbox.pendingWorkSessionIds
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
    const resolved = inbox.resolveLiveEvent?.(event)
    if (!resolved) return
    if (typeof inbox.activity === 'function') inbox.activity({ ...resolved, canonicalSessionId: resolved.session_id })
    else if (['message.start', 'tool.start'].includes(event.type)) {
      inbox.reactivate({ type: 'work', scope: { connectionId: resolved.connectionId, profile: resolved.profile }, session_id: resolved.session_id, canonicalSessionId: resolved.session_id })
    }
  })
}
