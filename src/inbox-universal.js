// Global plugin preference, deliberately independent of selected/focused owner.
const UNIVERSAL_INBOX_KEY = 'universal-inbox'
const UNIVERSAL_INBOX_EVENT = `${ID}:universal-inbox`
function readUniversalInbox() {
  try { return pluginStorage?.get(UNIVERSAL_INBOX_KEY, false) === true }
  catch { return false }
}
function setUniversalInbox(value) {
  const next = value === true
  try {
    if (!pluginStorage?.set || !pluginStorage?.get) throw new Error('Storage unavailable')
    pluginStorage.set(UNIVERSAL_INBOX_KEY, next)
    if (pluginStorage.get(UNIVERSAL_INBOX_KEY, null) !== next) throw new Error('Setting was not saved')
  } catch {
    host.notify?.({ kind: 'error', message: 'Could not save the Universal Inbox setting.' })
    return readUniversalInbox()
  }
  window.dispatchEvent(new CustomEvent(UNIVERSAL_INBOX_EVENT))
  return next
}

function inboxProfileAppearance(route, agent) {
  const name = route.profile.trim(), label = agent?.profileMetadata?.display_name?.trim() || route.profile
  let color = typeof profileColor === 'function' ? profileColor(name) : null
  // Approved compatibility seam: read only this native, credential-free key.
  // Never patch the storage/store; normal projection and storage events reread it.
  if (name && name !== 'default') try {
    const overrides = JSON.parse(window.localStorage.getItem('hermes.desktop.profileColors') || '{}')
    const value = Object.hasOwn(overrides || {}, name) ? overrides[name] : null
    if (typeof value === 'string' && value.length <= 128 && window.CSS.supports('color', value) && !/var\(|url\(/i.test(value)) color = value
  } catch { /* Public deterministic native color remains the fallback. */ }
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(label.trim())
  const letter = [...segments].map(part => part.segment).find(part => /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(part)) || '?'
  return { name, label, letter, color, background: color && typeof profileColorSoft === 'function' ? profileColorSoft(color, 22) : null }
}

function codexInboxReadLimiter(limit = 4) {
  let running = 0
  const queue = []
  const drain = () => {
    while (running < limit && queue.length) {
      const item = queue.shift()
      item.signal?.removeEventListener('abort', item.abort)
      if (item.signal?.aborted) { item.reject(new Error('Inbox read cancelled')); continue }
      running++
      let released = false
      item.resolve(() => { if (!released) { released = true; running--; drain() } })
    }
  }
  return signal => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Inbox read cancelled')); return }
    const item = { signal, resolve, reject, abort: () => {
      const index = queue.indexOf(item)
      if (index >= 0) queue.splice(index, 1)
      reject(new Error('Inbox read cancelled'))
    } }
    queue.push(item); signal?.addEventListener('abort', item.abort, { once: true }); drain()
  })
}

async function readUniversalInboxInventory() {
  if (!host.profileRoutes || !window.hermesDesktop?.getAgentRoster) throw new Error('Universal Inbox requires exact profile routes and roster')
  const [routes, roster] = await Promise.all([host.profileRoutes(), window.hermesDesktop.getAgentRoster()])
  if (!Array.isArray(routes) || !Array.isArray(roster?.agents) || !Array.isArray(roster?.sources) || !roster.sources.length) throw new Error('Incomplete Inbox inventory')
  const sources = new Map(roster.sources.map(source => [source.connectionId, source]))
  const routeCounts = new Map()
  for (const route of routes) {
    const key = JSON.stringify([route?.connectionId, route?.profile])
    routeCounts.set(key, (routeCounts.get(key) || 0) + 1)
  }
  const available = [], seen = new Set(), backendAliases = new Map()
  let complete = roster.sources.every(source => source.reachable === true && !source.error && !source.needsSignIn)
  for (const route of routes) {
    if (!route || !['connectionId', 'profile', 'targetProfile'].every(field => typeof route[field] === 'string' && route[field] && route[field] !== '*') || route.profile === 'all' || route.targetProfile === 'all' || !['local', 'remote'].includes(route.mode)) { complete = false; continue }
    const key = JSON.stringify([route.connectionId, route.profile])
    const agents = roster.agents.filter(agent => sameInboxScope(agent, route) && (!agent.targetProfile || agent.targetProfile === route.targetProfile))
    const source = sources.get(route.connectionId)
    if (routeCounts.get(key) !== 1 || agents.length !== 1 || source?.reachable !== true || source.error || source.needsSignIn) { complete = false; continue }
    seen.add(key)
    const backendKey = JSON.stringify([route.connectionId, route.targetProfile])
    backendAliases.set(backendKey, (backendAliases.get(backendKey) || 0) + 1)
    available.push({ key, route: { ...route }, agent: agents[0], backendKey })
  }
  if (roster.agents.some(agent => !seen.has(JSON.stringify([agent.connectionId, agent.profile])))) complete = false
  const verified = available.filter(item => {
    if (backendAliases.get(item.backendKey) === 1) return true
    complete = false; return false
  })
  return { complete, routes: verified, sources: roster.sources, ambiguous: !complete }
}

function startUniversalInboxObserver(ctx, inbox, acquire = codexInboxReadLimiter(4)) {
  let disposed = false
  const owners = new Map(), liveOwners = new Map(), stamp = Symbol('Universal inventory')
  let projectionQueued = false
  const onOwnersChanged = () => {
    if (projectionQueued || disposed) return
    projectionQueued = true
    queueMicrotask(() => {
      projectionQueued = false
      if (!disposed) for (const item of owners.values()) if (item.active) item.proxy?.reproject?.()
    })
  }
  const publish = () => {
    if (disposed) return
    inbox.updateOwners([...owners.values()].filter(item => item.snapshot).map(item => {
      const appearance = inboxProfileAppearance(item.route, item.agent), previous = item.published
      // Only this owner's new projection/availability/appearance invalidates its
      // published reference. An unrelated owner's progress must not clone it.
      if (!previous || item.publishedSource !== item.snapshot || previous.routeAvailable !== item.active ||
          Object.keys(appearance).some(key => appearance[key] !== previous.appearance[key])) {
        item.publishedSource = item.snapshot
        item.published = { ...item.snapshot, scope: item.route, route: item.route, appearance,
          routeAvailable: item.active, ownerGeneration: item.generation }
      }
      return item.published
    }))
  }
  const retire = (item, remove = false) => {
    item.active = false; item.stop?.(); item.stop = null
    for (const [key, proof] of liveOwners) if (sameInboxScope(proof, item.route) && !proof.conflicted) liveOwners.delete(key)
    onOwnersChanged()
    if (remove) owners.delete(item.key)
    else if (item.snapshot) item.snapshot = { ...item.snapshot, liveSessions: [], childSnapshots: [], busyBySession: {}, liveStatusKnown: false, error: 'Owner inventory unavailable' }
  }
  const reconcile = () => {
    if (disposed) return

    const query = observer.getCurrentResult(), data = query.data
    if (query.error || data?.stamp !== stamp) {
      if (query.error) for (const item of owners.values()) retire(item)
      publish(); return
    }
    const present = new Set(data.routes.map(item => item.key))
    for (const item of owners.values()) if (!present.has(item.key)) retire(item, data.complete && !data.ambiguous)
    for (const discovered of data.routes) {
      let item = owners.get(discovered.key)
      if (item && JSON.stringify(item.route) !== JSON.stringify(discovered.route)) { retire(item, true); item = null }
      if (!item) { item = { ...discovered, generation: Symbol('Universal owner'), active: true, snapshot: null }; owners.set(item.key, item) }
      item.agent = discovered.agent
      if (item.stop) continue
      item.active = true
      const localDisposals = []
      const proxy = { model: inbox.model, admission: inbox.admission, setMode() {},
        activity: event => item.active && !disposed && owners.get(item.key) === item && inbox.activity({ ...event, scope: { ...item.route, _codexInboxGeneration: item.generation } }),
        update: snapshot => {
          if (disposed || !item.active || owners.get(item.key) !== item) return
          item.snapshot = snapshot; publish()
        }
      }
      item.proxy = proxy
      startCodexInboxObserver({ onDispose: fn => localDisposals.push(fn) }, proxy, {
        ownerScope: () => item.active && !disposed ? item.route : null,
        mode: () => item.active && !disposed && readUniversalInbox() ? readCodexInboxMode() : 'off',
        queryKey: ['universal', item.route.targetProfile, item.route.mode], acquire, liveOwners, onOwnersChanged,
        liveAvailable: () => !host.state.gateway?.get || host.state.gateway.get() === 'open'
      })
      item.stop = () => localDisposals.reverse().forEach(fn => fn())
    }
    publish()
  }
  const observer = new CodexInboxObserverVendor.QueryObserver(queryClient, {
    queryKey: [ID, 'universal-inbox-inventory'],
    queryFn: async () => ({ ...await readUniversalInboxInventory(), stamp }),
    staleTime: 0, refetchInterval: 10_000, retry: 1
  })
  const resolve = event => {
    const item = owners.get(JSON.stringify([event.connectionId, event.profile]))
    const resolved = item?.active && item.proxy?.resolveLiveEvent?.(event)
    return resolved ? { ...resolved, scope: { ...item.route, _codexInboxGeneration: item.generation } } : null
  }
  inbox.resolveLiveEvent = resolve
  const stopQuery = observer.subscribe(reconcile)
  const storageChanged = event => { if (!event.key || event.key === 'hermes.desktop.profileColors') publish() }
  window.addEventListener('storage', storageChanged)
  const stopGateway = host.state.gateway?.subscribe?.(() => {
    // The selected socket is not the availability of independent HTTP owners.
    // Per-owner observers revoke live proof; metadata remains roster-routed.
    liveOwners.clear()
    onOwnersChanged()
    void observer.refetch()
  })
  reconcile()
  const stop = () => {
    if (disposed) return
    disposed = true; stopQuery(); observer.destroy(); stopGateway?.()
    window.removeEventListener('storage', storageChanged)
    for (const item of owners.values()) retire(item)
    owners.clear()
    if (inbox.resolveLiveEvent === resolve) delete inbox.resolveLiveEvent
  }
  ctx.onDispose(stop)
  return stop
}

function startCodexInboxService(ctx, inbox) {
  if (!inbox) return () => {}
  // Keep the bound across retired generations whose native IPC cannot abort.
  const acquire = codexInboxReadLimiter(4)
  let disposed = false, signature = null, disposals = []
  const configure = () => {
    if (disposed) return
    const next = JSON.stringify([readUniversalInbox(), readUniversalInbox() ? readCodexInboxMode() : null])
    if (signature === next) return
    signature = next; disposals.reverse().forEach(fn => fn()); disposals = []
    const local = { onDispose: fn => disposals.push(fn) }
    inbox.resetOwners?.()
    inbox.setMode(readCodexInboxMode() === 'on')
    if (readUniversalInbox() && readCodexInboxMode() === 'on') startUniversalInboxObserver(local, inbox, acquire)
    else startCodexInboxObserver(local, inbox)
  }
  window.addEventListener(UNIVERSAL_INBOX_EVENT, configure)
  window.addEventListener(INBOX_MODE_EVENT, configure)
  configure()
  const stop = () => {
    if (disposed) return
    disposed = true; disposals.reverse().forEach(fn => fn()); disposals = []
    window.removeEventListener(UNIVERSAL_INBOX_EVENT, configure); window.removeEventListener(INBOX_MODE_EVENT, configure)
  }
  ctx.onDispose(stop)
  return stop
}
