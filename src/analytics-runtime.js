// Inlined by the builder. Only the separate project's PUBLIC token belongs here.
// No fallback to another project's key, personal API credential or runtime lookup.
const CODEX_ANALYTICS_PROJECT = Object.freeze({ token: 'phc_C5rFsRfQypCeJSiAjw67pWUnsB5RRhAmj44Mh5craJWV', host: 'https://eu.i.posthog.com' })
const CODEX_ANALYTICS_KEY = 'usage-consent-v1'
const CODEX_ANALYTICS_FEATURES = Object.freeze(['inbox', 'snooze', 'restore', 'settle', 'settings', 'theme', 'complete_messages', 'collapse'])
const CODEX_ANALYTICS_FAILURES = Object.freeze(['storage_write', 'storage_readback', 'action_failed'])

function codexAnalyticsOS(platform) {
  if (typeof platform !== 'string') return 'other'
  if (/^Mac/i.test(platform)) return 'macos'
  if (/^Win/i.test(platform)) return 'windows'
  if (/^Linux/i.test(platform)) return 'linux'
  return 'other'
}

function createCodexSkinAnalytics({ storage, token = null, host = null, version = 'unknown', isTest = false,
  document: doc = globalThis.document, navigator: nav = globalThis.navigator,
  request = (...args) => globalThis.fetch(...args), crypto: random = globalThis.crypto,
  timers = globalThis, now = () => Date.now() } = {}) {
  const configured = typeof token === 'string' && /^phc_[A-Za-z0-9]{16,160}$/.test(token) &&
    ['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(host)
  const publicVersion = typeof version === 'string' && /^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,40})?$/.test(version) ? version : 'unknown'
  const base = Object.freeze({ plugin_version: publicVersion, os_family: codexAnalyticsOS(nav?.platform), is_test: isTest === true, $process_person_profile: false, $geoip_disable: true })
  const validId = id => typeof id === 'string' && /^cs_[a-f0-9]{32}$/.test(id)
  const blocked = () => nav?.globalPrivacyControl === true || nav?.doNotTrack === '1' || nav?.doNotTrack === 'yes'
  let enabled = false, disposed = false, id = null, generation = 0, heartbeat = null, flushTimer = null, flight = null
  let minute = -1, minuteCount = 0, day = '', dayCount = 0
  const queue = []
  const read = () => storage?.get?.(CODEX_ANALYTICS_KEY, null)
  const verifiedWrite = value => {
    if (!storage?.set || !storage?.get) throw Error('Storage unavailable')
    storage.set(CODEX_ANALYTICS_KEY, value)
    const saved = read()
    if (!saved || JSON.stringify(saved) !== JSON.stringify(value)) throw Error('Storage readback failed')
  }
  const stop = () => {
    enabled = false; id = null; generation++; queue.length = 0
    if (heartbeat !== null) timers.clearInterval(heartbeat)
    if (flushTimer !== null) timers.clearTimeout(flushTimer)
    heartbeat = flushTimer = null
    if (flight) { timers.clearTimeout(flight.timeout); flight.abort.abort(); flight = null }
    doc?.removeEventListener?.('visibilitychange', visibility)
  }
  const consentCurrent = () => {
    if (disposed || !enabled || blocked()) { if (enabled) stop(); return false }
    try {
      const saved = read()
      if (saved?.v !== 1 || saved.enabled !== true || saved.id !== id) { stop(); return false }
      return true
    } catch { stop(); return false }
  }
  const schedule = () => {
    if (enabled && !disposed && queue.length && !flight && flushTimer === null) {
      flushTimer = timers.setTimeout(() => { flushTimer = null; void flush() }, 250)
    }
  }
  async function flush() {
    if (!consentCurrent() || flight || !queue.length) return
    const event = queue.shift(), epoch = generation
    const abort = new AbortController()
    const current = { abort, timeout: timers.setTimeout(() => abort.abort(), 5000) }
    flight = current
    try {
      // Official JSON capture contract; browser CORS still applies. No cookies,
      // referrer, beacon, keepalive, SDK enrichment or automatic retries.
      await request(host + '/i/v0/e/', {
        method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
        cache: 'no-store', redirect: 'error', keepalive: false,
        headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ api_key: token, event: event.name, distinct_id: id,
          properties: event.properties, timestamp: new Date(event.at).toISOString() })
      })
    } catch { /* Lost telemetry must never fail a user action. No retry. */ }
    finally {
      timers.clearTimeout(current.timeout)
      if (flight === current) flight = null
      if (generation === epoch) schedule()
    }
  }
  const capture = (name, properties = {}) => {
    try {
      // Reject unexpected keys rather than forwarding or stringifying content.
      if (!properties || Object.getPrototypeOf(properties) !== Object.prototype) return false
      const expected = name === 'codex_skin_active' ? [] : name === 'codex_skin_feature_used' ? ['feature'] :
        name === 'codex_skin_feature_failed' ? ['feature', 'failure_category'] : null
      if (!expected || Object.keys(properties).length !== expected.length || expected.some(key => !Object.hasOwn(properties, key))) return false
      if (expected.includes('feature') && !CODEX_ANALYTICS_FEATURES.includes(properties.feature)) return false
      if (expected.includes('failure_category') && !CODEX_ANALYTICS_FAILURES.includes(properties.failure_category)) return false
      if (!consentCurrent() || doc?.visibilityState !== 'visible') return false
      const at = now(), nextMinute = Math.floor(at / 60000), nextDay = new Date(at).toISOString().slice(0, 10)
      if (nextMinute !== minute) { minute = nextMinute; minuteCount = 0 }
      if (nextDay !== day) { day = nextDay; dayCount = 0 }
      if (queue.length >= 20 || minuteCount >= 30 || dayCount >= 1200) return false
      queue.push({ name, at, properties: { ...base, ...properties } }); minuteCount++; dayCount++
      schedule(); return true
    } catch { return false }
  }
  const active = () => {
    if (!consentCurrent() || doc?.visibilityState !== 'visible') return
    try {
      const saved = read(), today = new Date(now()).toISOString().slice(0, 10)
      if (saved.lastActiveDay === today) return
      // Readback before claiming the daily event prevents hot-reload repetition.
      if (capture('codex_skin_active')) verifiedWrite({ v: 1, enabled: true, id, lastActiveDay: today })
    } catch { stop() }
  }
  function visibility() { active() }
  const start = saved => {
    if (!configured || disposed || blocked() || saved?.v !== 1 || saved.enabled !== true || !validId(saved.id)) return false
    id = saved.id; enabled = true
    doc?.addEventListener?.('visibilitychange', visibility)
    heartbeat = timers.setInterval(active, 60000)
    active()
    return enabled
  }
  const setConsent = value => {
    if (disposed || typeof value !== 'boolean') return false
    stop()
    try {
      if (!value) {
        // Even native storage's swallowed quota failures must be detected.
        verifiedWrite({ v: 1, enabled: false })
        return true
      }
      if (!configured || blocked() || typeof random?.getRandomValues !== 'function') return false
      const bytes = new Uint8Array(16); random.getRandomValues(bytes)
      const saved = { v: 1, enabled: true, id: 'cs_' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''), lastActiveDay: '' }
      verifiedWrite(saved)
      return start(saved)
    } catch { stop(); return false }
  }
  // Startup reads the opt-in only. A fresh install writes nothing and creates
  // no identifier, timer, listener or request for analytics.
  try { start(read()) } catch { stop() }
  return Object.freeze({
    configured, isEnabled: () => enabled && !disposed,
    setConsent, capture,
    used: feature => capture('codex_skin_feature_used', { feature }),
    failed: (feature, failure_category) => capture('codex_skin_feature_failed', { feature, failure_category }),
    dispose() { if (!disposed) { stop(); disposed = true } }
  })
}

// This seam accepts only fixed categorical signals from plugin-owned handlers.
// It never inspects a DOM event, native atom, session object or exception.
let codexSkinAnalytics = null
function codexSkinFeatureUsed(feature) { codexSkinAnalytics?.used(feature) }
function codexSkinFeatureFailed(feature, category) { codexSkinAnalytics?.failed(feature, category) }
function codexSkinSettingAction(feature, key, expected, action) {
  let result
  try { result = action() }
  catch (error) { codexSkinFeatureFailed(feature, 'action_failed'); throw error }
  if (!codexSkinAnalytics?.isEnabled()) return result
  try {
    if (pluginStorage?.get(key, null) === expected) codexSkinFeatureUsed(feature)
    else codexSkinFeatureFailed(feature, 'storage_readback')
  } catch { codexSkinFeatureFailed(feature, 'storage_readback') }
  return result
}
function installCodexSkinAnalytics(ctx, project = CODEX_ANALYTICS_PROJECT) {
  codexSkinAnalytics?.dispose()
  const analytics = createCodexSkinAnalytics({ storage: ctx.storage, token: project.token, host: project.host, version: BUILD_ID })
  codexSkinAnalytics = analytics
  ctx.onDispose(() => { analytics.dispose(); if (codexSkinAnalytics === analytics) codexSkinAnalytics = null })
  ctx.register({ id: 'share-usage-statistics', area: PALETTE_AREA, data: {
    id: 'codex-chat-look.share-usage-statistics',
    label: 'Codex Skin: Share usage statistics',
    detail: () => analytics.isEnabled() ? 'On (pseudonymous installation)' : 'Off',
    detailVariant: 'state', keepOpen: false,
    keywords: ['codex', 'skin', 'privacy', 'analytics', 'statistics'],
    run: () => {
      const next = !analytics.isEnabled()
      if (next) {
        // Native confirm supplies a keyboard-accessible explicit consent step.
        const accepted = globalThis.window?.confirm?.('Share Codex Skin usage statistics with PostHog? This uses a random persistent installation ID (pseudonymous, not fully anonymous), plugin version, OS family and fixed feature/failure categories. No conversations, prompts, titles, files or raw errors. PostHog receives network metadata, including your IP address. Opting out stops collection and removes the local ID; it does not delete previously received events. You can turn this off here at any time.')
        if (accepted !== true) return false
      }
      const saved = analytics.setConsent(next)
      host.notify?.({ kind: saved ? 'info' : 'error', message: saved ? (next ? 'Usage statistics are on.' : 'Usage statistics are off. The local installation ID was removed.') :
        (!analytics.configured ? 'Usage statistics are unavailable until the separate PostHog project is configured.' : 'Usage statistics are off for this session. The preference could not be saved or a privacy signal blocks collection.') })
      return saved
    }
  } })
  return analytics
}
