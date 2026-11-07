// Presentation only: origins are observed message.start or native
// session.info.turn_started_at, never mount age or a tool/Thinking timer.
function formatLiveTurnActivityDuration(value) {
  if (!Number.isFinite(value) || value < 0) return ''
  const seconds = Math.floor(value)
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}hour ${Math.floor(seconds / 60) % 60}min`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}min ${seconds % 60}s`
  return `${seconds}s`
}

function createLiveTurnClock(now = () => Date.now()) {
  let record = null
  const current = scope => {
    if (record && record.scope !== scope) record = null
    return record
  }
  const fresh = (scope, startedAt, authoritative) => {
    record = { scope, startedAt, authoritative, endedAt: null, userId: '' }
  }
  const finish = scope => {
    const item = current(scope)
    if (item && item.endedAt === null) item.endedAt = now()
  }
  return {
    start(scope) {
      const item = current(scope)
      if (!item || item.endedAt !== null) fresh(scope, now(), false)
    },
    info(scope, payload) {
      const item = current(scope)
      if (payload?.running === false) { finish(scope); return }
      const seconds = payload?.turn_started_at
      if (payload?.running !== true || typeof seconds !== 'number' || !Number.isFinite(seconds)
        || seconds <= 0 || seconds * 1000 > now()) return
      const startedAt = seconds * 1000
      if (!item) fresh(scope, startedAt, true)
      else if (!item.authoritative && item.endedAt === null) {
        item.startedAt = startedAt
        item.authoritative = true
      } else if (startedAt > item.startedAt) fresh(scope, startedAt, true)
    },
    finish,
    running(scope) { const item = current(scope); return Boolean(item && item.endedAt === null) },
    label(scope, userId, uniquelyLive) {
      const item = current(scope)
      if (!item || !uniquelyLive || !userId || item.userId && item.userId !== userId) return ''
      item.userId = userId
      return formatLiveTurnActivityDuration(Math.max(0, Math.floor(((item.endedAt ?? now()) - item.startedAt) / 1000)))
    },
    clear() { record = null }
  }
}
