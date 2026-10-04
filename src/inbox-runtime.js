// Standalone block: bundled by the parent plugin. No imports or network access.
const CODEX_INBOX_STORE = 'inbox-state-v1';


function codexInboxScope(scope) {
  if (!scope || typeof scope.profile !== 'string' || !scope.profile) return null;
  if (typeof scope.connectionId !== 'string') return null;
  return { connectionId: scope.connectionId, profile: scope.profile };
}

function codexInboxId(session) {
  const id = typeof session === 'string' ? session : session?.id ?? session?.session_id;
  return typeof id === 'string' && id ? id : null;
}

function codexInboxOwnedBy(scope, session) {
  return !!scope && (!session?.profile || session.profile === scope.profile) &&
    (session?._connection_id == null || session._connection_id === scope.connectionId) &&
    (session?.connectionId == null || session.connectionId === scope.connectionId) &&
    (session?.connection_id == null || session.connection_id === scope.connectionId);
}

function codexInboxKey(scope, durableId) {
  const valid = codexInboxScope(scope);
  const id = codexInboxId(durableId);
  return valid && id ? JSON.stringify([valid.connectionId, valid.profile, id]) : null;
}

function codexInboxWorkStatus(value) {
  const status = typeof value === 'string' ? value : value?.status ?? value?.state;
  if (status === 'resuming') return 'reading';
  if (value === true || value?.busy === true) return 'work';
  if (value === false) return 'idle';
  if (['starting', 'running', 'working', 'streaming', 'waiting', 'needs-input', 'queued'].includes(status)) return 'work';
  if (['idle', 'resuming', 'completed', 'done', 'stopped'].includes(status)) return status === 'resuming' ? 'reading' : 'idle';
  return 'unknown';
}

function createCodexInboxModel(storage, { restoreAttention } = {}) {
  let state = { version: 1, records: {}, aliases: {} };
  let error = null;
  const listeners = new Set();
  const expired = new Map();
  const validTimestamp = value => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
  const notify = event => { for (const fn of listeners) { try { fn(event); } catch { /* A view subscriber cannot undo a saved model transaction. */ } } };
  const validKey = key => {
    try { const p = JSON.parse(key); return Array.isArray(p) && p.length === 3 && typeof p[0] === 'string' && p.slice(1).every(v => typeof v === 'string' && v); }
    catch { return false; }
  };
  try {
    const raw = storage?.get?.(CODEX_INBOX_STORE);
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (saved != null) {
      if (saved.version !== 1 || !saved.records || !saved.aliases) throw Error('Invalid Inbox state');
      for (const [key, record] of Object.entries(saved.records)) {
        if (!validKey(key) || !record || typeof record !== 'object') continue;
        const watermarks = {};
        for (const [id, count] of Object.entries(record.watermarks || {})) {
          if (id && Number.isSafeInteger(count) && count >= 0) Object.defineProperty(watermarks, id, { value: count, enumerable: true, writable: true, configurable: true });
        }
        state.records[key] = {
          settledAt: Number.isFinite(record.settledAt) && record.settledAt > 0 ? record.settledAt : null, watermarks,
          snoozeUntil: validTimestamp(record.snoozeUntil) ? record.snoozeUntil : null,
          snoozedAt: validTimestamp(record.snoozedAt) ? record.snoozedAt : validTimestamp(record.snoozeUntil) ? 1 : null,
          ...(record.manualSettled === true ? { manualSettled: true } : {})
        };
      }
      for (const [alias, root] of Object.entries(saved.aliases)) {
        if (!validKey(alias) || !validKey(root)) continue;
        const a = JSON.parse(alias), r = JSON.parse(root);
        if (a[0] === r[0] && a[1] === r[1] && state.records[root]) state.aliases[alias] = root;
      }
    }
  } catch { error = 'Inbox state could not be read. Settle and Snooze are unavailable until storage recovers.'; }

  const putCount = (record, id, count) => {
    const previous = Object.prototype.hasOwnProperty.call(record.watermarks, id) ? record.watermarks[id] : 0;
    Object.defineProperty(record.watermarks, id, { value: Math.max(previous, count), enumerable: true, writable: true, configurable: true });
  };
  const accept = (scope, session) => {
    if (!codexInboxKey(scope, session)) return false;
    if (typeof session !== 'object' || !session) return true;
    return codexInboxOwnedBy(scope, session);
  };
  const rootKey = (draft, scope, session) => {
    if (!accept(scope, session)) return null;
    const own = codexInboxKey(scope, session);
    const declared = typeof session === 'object' ? codexInboxKey(scope, session._lineage_root_id) : null;
    return draft.aliases[declared] || declared || draft.aliases[own] || own;
  };
  const associate = (draft, scope, session) => {
    const key = rootKey(draft, scope, session);
    if (!key) return null;
    const own = codexInboxKey(scope, session);
    const ids = [codexInboxId(session), ...(Array.isArray(session?._lineage_ids) ? session._lineage_ids : [])];
    if (session?._lineage_root_id) ids.push(session._lineage_root_id);
    const record = draft.records[key] || { settledAt: null, watermarks: {}, snoozeUntil: null, snoozedAt: null };
    // A lineage discovered after settling retains its prior durable record.
    for (const id of ids) {
      const alias = codexInboxKey(scope, id);
      if (!alias) continue;
      const priorKey = draft.aliases[alias] || alias;
      const prior = draft.records[priorKey];
      if (prior && prior !== record) {
        record.settledAt = Math.max(record.settledAt || 0, prior.settledAt || 0) || null;
        if (prior.settledAt && prior.manualSettled === true) record.manualSettled = true;
        // Keep the most recent explicit duration/cancellation when lineage arrives late.
        if ((prior.snoozedAt || 0) > (record.snoozedAt || 0) ||
            (prior.snoozedAt && prior.snoozedAt === record.snoozedAt && !prior.snoozeUntil)) {
          record.snoozeUntil = prior.snoozeUntil; record.snoozedAt = prior.snoozedAt;
        }
        for (const [pid, count] of Object.entries(prior.watermarks)) putCount(record, pid, count);
        for (const [a, target] of Object.entries(draft.aliases)) if (target === priorKey) draft.aliases[a] = key;
        delete draft.records[priorKey];
      }
      draft.aliases[alias] = key;
    }
    draft.aliases[own] = key;
    draft.records[key] = record;
    return { key, record, id: codexInboxId(session) };
  };
  const snoozeTime = draft => {
    // Millisecond ordering keeps two rapid decisions unambiguous during late lineage
    // discovery, even when the system clock moves backwards between those decisions.
    let at = Date.now();
    for (const record of Object.values(draft.records)) at = Math.max(at, (record.snoozedAt || 0) + 1);
    return Math.min(at, 8640000000000000);
  };
  const transaction = (change, event) => {
    const draft = JSON.parse(JSON.stringify(state));
    const result = change(draft);
    if (result === false) return false;
    if (JSON.stringify(draft) === JSON.stringify(state)) {
      // A repeated manual decision still fences earlier queued work, even
      // when it saves identical bytes within the same clock millisecond.
      if (event) notify(event);
      return result;
    }
    try {
      if (typeof storage?.set !== 'function') throw Error('Storage unavailable');
      storage.set(CODEX_INBOX_STORE, draft);
      // The desktop SDK can silently swallow quota/permission errors. A write is
      // committed only after an exact structural readback, including string stores.
      const saved = storage.get?.(CODEX_INBOX_STORE);
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
      if (canonical(parsed) !== canonical(draft)) throw Error('Inbox storage readback failed');
      state = draft;
      error = null;
      notify(event);
      return result;
    } catch {
      error = 'Inbox state could not be saved. No Inbox changes were applied.';
      notify();
      return false;
    }
  };
  return {
    key: (scope, session) => rootKey(state, scope, session),
    isSettled(scope, session) { const key = rootKey(state, scope, session); return !!(key && state.records[key]?.settledAt); },
    isManualSettled(scope, session) { const key = rootKey(state, scope, session); return !!(key && state.records[key]?.settledAt && state.records[key].manualSettled === true); },
    snoozedUntil(scope, session) { const key = rootKey(state, scope, session); return key && state.records[key]?.snoozeUntil || null; },
    isSnoozed(scope, session, now = Date.now()) {
      const key = rootKey(state, scope, session);
      return !!(key && state.records[key]?.snoozeUntil > now);
    },
    snooze(scope, session, until) {
      if (!validTimestamp(until) || until <= Date.now()) return false;
      return transaction(draft => {
        const item = associate(draft, scope, session);
        if (!item) return false;
        item.record.snoozeUntil = until; item.record.snoozedAt = snoozeTime(draft);
        return true;
      });
    },
    cancelSnooze(scope, session) {
      const restoreKey = rootKey(state, scope, session);
      if (state.records[restoreKey]?.snoozeUntil && restoreAttention?.(scope, session) === false) { notify(); return false; }
      return transaction(draft => {
        const key = rootKey(draft, scope, session);
        if (!key) return false;
        if (draft.records[key]?.snoozeUntil) {
          draft.records[key].snoozeUntil = null; draft.records[key].snoozedAt = snoozeTime(draft);
        }
        return true;
      });
    },
    nextSnoozeDeadline(now = Date.now()) {
      let next = null;
      for (const record of Object.values(state.records)) {
        if (record.snoozeUntil > now && (next === null || record.snoozeUntil < next)) next = record.snoozeUntil;
      }
      return next;
    },
    // Runtime-owned timers call this on expiry/resume. No persistence write is needed:
    // isSnoozed always reads the wall clock, and subscribe wakes native React badges.
    expireSnoozes(now = Date.now()) {
      let changed = false;
      for (const [key, record] of Object.entries(state.records)) {
        const token = JSON.stringify([record.snoozedAt, record.snoozeUntil]);
        if (record.snoozeUntil && record.snoozeUntil <= now && expired.get(key) !== token) {
          expired.set(key, token); changed = true;
        }
      }
      if (changed) notify();
      return changed;
    },
    settle(scope, session, options = {}) {
      return transaction(draft => {
        const item = associate(draft, scope, session);
        if (!item) return false;
        const count = session?.message_count;
        if (Number.isSafeInteger(count) && count >= 0) putCount(item.record, item.id, count);
        item.record.settledAt = Date.now();
        if (options.manual === true) item.record.manualSettled = true;
        else delete item.record.manualSettled;
        return true;
      }, options.manual === true ? { type: 'manual-settle', scope, session } : undefined);
    },
    unsettle(scope, session) {
      const restoreKey = rootKey(state, scope, session);
      if (state.records[restoreKey]?.settledAt && restoreAttention?.(scope, session) === false) { notify(); return false; }
      return transaction(draft => {
        const key = rootKey(draft, scope, session);
        if (!key) return false;
        if (draft.records[key]) { draft.records[key].settledAt = null; delete draft.records[key].manualSettled; }
        return true;
      });
    },
    reopen(scope, session) {
      if (restoreAttention?.(scope, session) === false) { notify(); return false; }
      return transaction(draft => {
        const item = associate(draft, scope, session);
        if (!item) return false;
        item.record.settledAt = null; delete item.record.manualSettled;
        if (item.record.snoozeUntil) {
          item.record.snoozeUntil = null; item.record.snoozedAt = snoozeTime(draft);
        }
        return true;
      });
    },
    ingest(scope, sessions = [], options = {}) {
      if (!codexInboxScope(scope)) return false;
      return transaction(draft => {
        for (const session of sessions) {
          const item = associate(draft, scope, session);
          if (!item) continue;
          const count = session?.message_count;
          if (Number.isSafeInteger(count) && count >= 0) {
            const previous = Object.prototype.hasOwnProperty.call(item.record.watermarks, item.id) ? item.record.watermarks[item.id] : undefined;
            if (previous !== undefined && count > previous && item.record.manualSettled !== true) item.record.settledAt = null;
            putCount(item.record, item.id, count);
          }
        }
        for (const session of options.liveSessions || []) {
          if (!accept(scope, session) || codexInboxWorkStatus(session) !== 'work') continue;
          const item = associate(draft, scope, session);
          if (item && item.record.manualSettled !== true) item.record.settledAt = null;
        }
        return true;
      });
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get error() { return error; }
  };
}

// REST list/detail metadata retains source and immutable created_source.
// Unknown/new source kinds require an explicit compatibility review, not a guess.
function codexInboxSource(session) {
  if (!session || typeof session !== 'object') return 'unknown';
  const source = session.source, created = session.created_source;
  if (source === 'cron' || created === 'cron') return 'cron';
  const known = ['desktop', 'tui', 'cli', 'web', 'local', 'api', 'api_server', 'tool', 'subagent', 'kanban',
    'telegram', 'discord', 'whatsapp', 'whatsapp_cloud', 'slack', 'signal', 'mattermost', 'matrix',
    'homeassistant', 'email', 'sms', 'dingtalk', 'webhook', 'msgraph_webhook', 'feishu', 'wecom',
    'wecom_callback', 'weixin', 'bluebubbles', 'qqbot', 'yuanbao', 'relay',
    'line', 'teams', 'ntfy', 'simplex', 'irc', 'a2a', 'raft', 'buzz', 'photon', 'google_chat'];
  if (!known.includes(source) || created != null && (!known.includes(created) || created !== source)) return 'unknown';
  return 'noncron';
}

// v1 admissions mixed creation/open/work and cannot certify which happened.
// Keep that store untouched as a backup; v2 starts with verified work only.
// User Settle/Snooze records and aliases live in their unchanged separate store.
function createCodexInboxAdmission(storage, model) {
  const storeKey = 'inbox-admission-v2';
  let state = { version: 2, admitted: {}, blocked: {} }, error = null, readable = false;
  const pendingAdmissions = new Map(), blocked = new Set(), sources = new Map();
  const scopeKey = scope => { const valid = codexInboxScope(scope); return valid ? JSON.stringify([valid.connectionId, valid.profile]) : null; };
  const validKey = (key, length) => {
    try { const tuple = JSON.parse(key); return Array.isArray(tuple) && tuple.length === length && typeof tuple[0] === 'string' && tuple.slice(1).every(v => typeof v === 'string' && v); }
    catch { return false; }
  };
  const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
  const load = () => {
    try {
      if (typeof storage?.get !== 'function') throw Error('Storage unavailable');
      const raw = storage.get(storeKey), saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (saved != null) {
        const objectMap = value => value && typeof value === 'object' && !Array.isArray(value);
        if (saved.version !== 2 || !objectMap(saved.admitted) || !objectMap(saved.blocked)) throw Error('Invalid Inbox admission');
        for (const records of [saved.admitted, saved.blocked]) {
          for (const [key, value] of Object.entries(records)) if (!validKey(key, 3) || value !== true) throw Error('Invalid Inbox admission');
        }
        state = JSON.parse(JSON.stringify(saved));
        Object.keys(state.blocked).forEach(key => blocked.add(key));
      }
      readable = true; error = null; return true;
    } catch {
      readable = false; error = 'Inbox admission could not be read. Historical chats remain excluded until storage recovers.'; return false;
    }
  };
  load();
  const ids = session => [...new Set([codexInboxId(session), session?._lineage_root_id,
    ...(Array.isArray(session?._lineage_ids) ? session._lineage_ids : [])].filter(id => typeof id === 'string' && id))];
  const keys = (scope, session) => [...new Set([...ids(session).map(id => codexInboxKey(scope, id)), model?.key(scope, session)].filter(Boolean))];
  const allowed = (scope, session) => {
    if (!scopeKey(scope) || !codexInboxOwnedBy(scope, session)) return false;
    const rowKeys = keys(scope, session);
    if (!rowKeys.length || rowKeys.some(key => blocked.has(key) || state.blocked[key])) return false;
    // Strings and captured Undo identities use known, already verified work.
    // A full metadata row cannot borrow a previous safe classification.
    if (session && typeof session === 'object' && Object.hasOwn(session, 'source')) {
      if (codexInboxSource(session) !== 'noncron') return false;
    } else if (session && typeof session === 'object' && Object.keys(session).some(key =>
      !['id', 'session_id', 'profile', 'connectionId', 'connection_id', '_connection_id', '_lineage_root_id', '_lineage_ids'].includes(key))) return false;
    return !rowKeys.some(key => sources.has(key) && sources.get(key) !== 'noncron');
  };
  const eligible = (draft, scope, session) => allowed(scope, session) && keys(scope, session).some(key => draft.admitted[key] === true);
  const recordSessionIds = (scope, records) => {
    if (!readable || !scopeKey(scope)) return [];
    const owner = scopeKey(scope), ids = new Map();
    for (const key of Object.keys(records)) {
      const tuple = JSON.parse(key);
      if (JSON.stringify(tuple.slice(0, 2)) === owner) ids.set(model?.key(scope, tuple[2]) || key, tuple[2]);
    }
    return [...ids.values()];
  };
  return {
    cutoff: () => null,
    isEligible: (scope, session) => readable && eligible(state, scope, session),
    restore: (scope, session) => readable && eligible(state, scope, session),
    explicitSessionIds() { return []; },
    admittedSessionIds(scope) { return recordSessionIds(scope, state.admitted).filter(id => allowed(scope, id)); },
    observe(scope, sessions = [], options = {}) {
      const owner = scopeKey(scope);
      if (!owner) return false;
      if (!pendingAdmissions.has(owner)) pendingAdmissions.set(owner, new Set());
      const pending = pendingAdmissions.get(owner), working = new Set();
      // Classify the complete snapshot before admitting anything. Cron taint
      // follows only supported lineage/aliases, including late discovery.
      const rows = sessions.filter(session => codexInboxId(session) && codexInboxOwnedBy(scope, session));
      const classifications = new Map(), provenance = new Map();
      for (const session of rows) {
        const source = codexInboxSource(session);
        for (const key of keys(scope, session)) {
          const prior = classifications.get(key);
          const conflict = prior === 'noncron' && source === 'noncron' && provenance.get(key) !== session.source;
          classifications.set(key, prior === 'cron' || source === 'cron' ? 'cron' : conflict || prior && prior !== source ? 'unknown' : source);
          if (!provenance.has(key)) provenance.set(key, session.source);
        }
      }
      classifications.forEach((source, key) => { sources.set(key, source); if (source === 'cron') blocked.add(key); });
      let changed;
      do {
        changed = false;
        for (const session of rows) {
          const rowKeys = keys(scope, session);
          if (rowKeys.some(key => blocked.has(key))) for (const key of rowKeys) if (!blocked.has(key)) { blocked.add(key); changed = true; }
        }
      } while (changed);
      for (const session of options.workingSessions || []) if (allowed(scope, session) && codexInboxSource(session) === 'noncron') keys(scope, session).forEach(key => working.add(key));
      for (const live of options.liveSessions || []) {
        if (!codexInboxOwnedBy(scope, live) || codexInboxWorkStatus(live) !== 'work') continue;
        const liveIds = [...ids(live), live.session_key, live.stored_session_id].filter(Boolean);
        // Do not invent a durable chat from a transient runtime ID.
        for (const row of rows) if (allowed(scope, row) && codexInboxSource(row) === 'noncron' && ids(row).some(id => liveIds.includes(id))) keys(scope, row).forEach(key => working.add(key));
      }
      // Keep verified work intent pending across a failed save and subsequent
      // idle refresh. It is still excluded until a durable readback succeeds.
      working.forEach(key => pending.add(key));
      if (!readable && !load()) return false;
      const draft = JSON.parse(JSON.stringify(state));
      for (const session of rows) {
        if (!allowed(scope, session) || codexInboxSource(session) !== 'noncron') continue;
        const rowKeys = keys(scope, session);
        if (eligible(draft, scope, session) || rowKeys.some(key => working.has(key))) {
          for (const key of rowKeys) { draft.admitted[key] = true; pending.add(key); }
        }
      }
      for (const key of pending) if (!blocked.has(key) && sources.get(key) === 'noncron') draft.admitted[key] = true;
      for (const key of blocked) { draft.blocked[key] = true; delete draft.admitted[key]; pending.delete(key); }
      if (canonical(draft) === canonical(state) && !error) { pending.clear(); return true; }
      try {
        if (typeof storage?.set !== 'function') throw Error('Storage unavailable');
        storage.set(storeKey, draft);
        const raw = storage.get(storeKey), saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (canonical(saved) !== canonical(draft)) throw Error('Inbox admission readback failed');
        state = draft; pending.clear(); error = null; return true;
      } catch {
        error = 'Inbox admission could not be saved. New admissions were not applied; existing attention is preserved.'; return false;
      }
    },
    get error() { return error; }
  };
}

function installCodexInboxRuntime({ storage, host, document: doc = document, window: win = window }) {
  // Hot reload replaces only this DOM adapter, never the host's native children.
  const registryKey = '__codexInboxRuntimeDispose';
  doc[registryKey]?.();
  let admission;
  const model = createCodexInboxModel(storage, {
    restoreAttention: (scope, session) => admission.restore(scope, session)
  });
  admission = createCodexInboxAdmission(storage, model);
  let on = false;
  try { on = storage?.get?.('inbox', 'on') !== 'off'; } catch { /* Fail closed until the parent supplies a mode. */ }
  let disposed = false, raf = null, island = null, style = null, container = null;
  let deadlineTimer = null, armingDeadline = false, snoozePopup = null;
  const rowBindings = new Map();
  const settleNotices = new Map();
  const activityByKey = new Map();
  const timerHost = win.setTimeout ? win : doc.defaultView;
  const clearDeadline = () => { if (deadlineTimer !== null) timerHost.clearTimeout(deadlineTimer); deadlineTimer = null; };
  const refreshDeadline = () => {
    if (armingDeadline) return;
    armingDeadline = true;
    try {
      clearDeadline();
      if (disposed || !on) return;
      model.expireSnoozes();
      const next = model.nextSnoozeDeadline();
      if (next !== null) deadlineTimer = timerHost.setTimeout(() => {
        deadlineTimer = null; refreshDeadline(); requestRender();
      }, Math.max(1, Math.min(2147483647, next - Date.now())));
    } finally { armingDeadline = false; }
  };
  let inboxOpen = true, signature = null, currentScope = null;
  let input = { sessions: [], liveSessions: [], liveStatusKnown: false, loading: true };
  const badgeBindings = new Map();
  const settledBadgeBindings = new Map();
  const externalBindings = new Map();
  const own = 'data-codex-inbox-owned';
  const owns = node => node?.nodeType === 1 ? !!node.closest(`[${own}]`) : !!node?.parentElement?.closest(`[${own}]`);
  const setAttr = (el, name, value) => { if (el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value)); };
  const visibleSessions = () => {
    const rows = new Map();
    for (const session of input.sessions) {
      if (!codexInboxId(session) || session.archived || session.hidden || !codexInboxOwnedBy(currentScope, session)) continue;
      const key = model.key(currentScope, session);
      if (!rows.has(key)) rows.set(key, session);
    }
    return [...rows.values()];
  };
  const inboxSessions = () => visibleSessions().filter(session => admission.isEligible(currentScope, session));
  const findSession = id => visibleSessions().find(s => codexInboxId(s) === id || s._lineage_root_id === id || s._lineage_ids?.includes(id));
  const runtimeAliases = session => {
    const aliases = new Set([codexInboxId(session), session?._lineage_root_id, ...(session?._lineage_ids || [])].filter(Boolean));
    const owner = codexInboxScope(host.state?.focusedSessionOwner?.get?.());
    const stored = host.state?.focusedStoredSessionId?.get?.();
    if (owner && JSON.stringify(owner) === JSON.stringify(currentScope) && aliases.has(stored)) {
      const runtimeId = host.state?.focusedSessionId?.get?.();
      if (typeof runtimeId === 'string' && runtimeId) aliases.add(runtimeId);
    }
    for (const live of input.liveSessions || []) {
      if (!codexInboxOwnedBy(currentScope, live)) continue;
      const ids = [live.session_id, live.id, live.session_key, live.stored_session_id, live._lineage_root_id, ...(live._lineage_ids || [])].filter(Boolean);
      if (ids.some(id => aliases.has(id))) ids.forEach(id => aliases.add(id));
    }
    return aliases;
  };
  const safety = (session, admissionCheck = false) => {
    const ids = runtimeAliases(session);
    let unresolved = input.liveStatusKnown !== true;
    let reading = false;
    for (const live of input.liveSessions || []) {
      if (!codexInboxOwnedBy(currentScope, live)) continue;
      if (![live.id, live.session_id, live.session_key, live.stored_session_id, live._lineage_root_id].some(id => ids.has(id))) continue;
      const status = codexInboxWorkStatus(live);
      if (status === 'work') return 'work';
      if (status === 'unknown') unresolved = true;
      if (status === 'reading') reading = true;
    }
    for (const id of admissionCheck && input.busyOwnerKnown === false ? [] : ids) {
      const busy = input.busyBySession instanceof Map ? input.busyBySession.get(id) : input.busyBySession?.[id];
      if (busy === undefined) continue;
      const status = codexInboxWorkStatus(busy);
      if (status === 'work') return 'work';
      if (status === 'unknown') unresolved = true;
      if (status === 'reading') reading = true;
    }
    return unresolved ? 'unknown' : reading ? 'reading' : 'idle';
  };
  const reconcileAdmission = () => {
    const sessions = visibleSessions(), working = input.loading || input.error || input.liveStatusKnown !== true ? [] : sessions.filter(session => safety(session, true) === 'work');
    // Rendering deduplicates lineage rows, never their source evidence. A late
    // cron ancestor/alias must taint the whole thread whichever row comes first.
    admission.observe(currentScope, input.sessions, { workingSessions: working });
    model.ingest(currentScope, sessions, { liveSessions: working.map(session => ({ ...session, status: 'working' })) });
  };
  const reconcileActivity = () => {
    if (input.loading || input.error) return;
    for (const session of inboxSessions()) {
      const key = model.key(currentScope, session), previous = activityByKey.get(key);
      const status = safety(session, true), newer = Number.isFinite(input.liveStatusAt) && input.liveStatusAt > (previous?.at || 0);
      // A terminal frame precedes backend cleanup. A late working snapshot
      // cannot cancel that receipt; a new positive work event can.
      if (status === 'work' && previous?.phase !== 'completed' && (!previous || newer)) {
        activityByKey.set(key, { phase: 'working', at: input.liveStatusAt || Date.now(), children: previous?.children || new Set() });
      } else if (status === 'idle' && previous?.phase === 'working' && !previous.children.size && newer) {
        activityByKey.set(key, { ...previous, phase: session.unread === true ? 'completed' : 'unknown', at: input.liveStatusAt });
      }
    }
  };
  const workState = session => {
    if (input.loading || input.error) return 'unknown';
    const status = safety(session, true), activity = activityByKey.get(model.key(currentScope, session));
    if (status === 'unknown' || status === 'reading') return status;
    if (activity?.phase === 'completed') return 'completed';
    if (status === 'work' || activity?.phase === 'working') return 'working';
    if (activity?.phase === 'unknown') return 'unknown';
    // Native unread marks a completed reply. Merely idle/busy:false does not.
    return session.unread === true ? 'completed' : 'idle';
  };
  const requestRender = () => {
    if (!disposed && raf === null) raf = win.requestAnimationFrame(() => { raf = null; render(); });
  };
  const button = (label, handler) => {
    const el = doc.createElement('button');
    el.type = 'button'; el.textContent = label; el.addEventListener('click', handler);
    return el;
  };
  const stop = event => { event.preventDefault(); event.stopPropagation(); };
  const routeOptions = () => ({ profile: currentScope.profile, route: { ...currentScope } });
  const open = session => { if (!disposed && on && currentScope && codexInboxOwnedBy(currentScope, session)) host.openSession?.(codexInboxId(session), routeOptions()); };
  const active = session => {
    const stored = host.state?.focusedStoredSessionId?.get?.();
    const id = stored || host.state?.activeSessionId?.get?.();
    const focusedOwner = host.state?.focusedSessionOwner?.get?.();
    if (focusedOwner != null) {
      const owner = codexInboxScope(focusedOwner);
      if (!owner || owner.profile !== currentScope.profile || owner.connectionId !== currentScope.connectionId) return false;
    } else {
      const profile = host.state?.focusedSessionProfile?.get?.() || host.state?.profile?.get?.();
      const connection = host.state?.connectionId?.get?.();
      if (profile && profile !== currentScope.profile || typeof connection === 'string' && connection !== currentScope.connectionId) return false;
    }
    return !!id && runtimeAliases(session).has(id);
  };
  const removeFromInbox = (session, save) => {
    const isCurrent = active(session);
    const all = inboxSessions();
    const index = all.findIndex(s => model.key(currentScope, s) === model.key(currentScope, session));
    const following = [...all.slice(index + 1), ...all.slice(0, Math.max(0, index))];
    const candidates = following.filter(s => model.key(currentScope, s) !== model.key(currentScope, session) && !model.isSettled(currentScope, s) && !model.isSnoozed(currentScope, s));
    if (!save()) return false;
    if (isCurrent) {
      if (candidates.length) open(candidates[0]);
      else host.newChat?.({ ...currentScope });
    }
    requestRender();
    return true;
  };
  const sameScope = scope => JSON.stringify(codexInboxScope(scope)) === JSON.stringify(currentScope);
  const clearSettleNotice = item => {
    if (settleNotices.get(item.key) !== item) return;
    timerHost.clearTimeout(item.timer); settleNotices.delete(item.key);
  };
  const clearSettleNotices = () => { for (const item of settleNotices.values()) clearSettleNotice(item); };
  const undoSettle = item => {
    if (disposed || !on || !sameScope(item.scope) || settleNotices.get(item.key) !== item) return false;
    // Check the deadline in the handler too: sleeping/throttled timers confer no
    // extra time. The captured owner and durable identity never follow new focus.
    if (Date.now() >= item.until) { clearSettleNotice(item); requestRender(); return false; }
    if (!model.unsettle(item.scope, item.session)) { requestRender(); return false; }
    clearSettleNotice(item); requestRender(); return true;
  };
  const settle = session => {
    if (disposed || !on || !currentScope || !codexInboxOwnedBy(currentScope, session)) return false;
    const fresh = findSession(codexInboxId(session));
    if (!fresh || codexInboxId(fresh) !== codexInboxId(session) || !admission.isEligible(currentScope, fresh) ||
        model.isSettled(currentScope, fresh) || model.isSnoozed(currentScope, fresh)) return false;
    const scope = { ...currentScope };
    const result = removeFromInbox(fresh, () => {
      if (!model.settle(scope, fresh, { manual: true })) return false;
      const key = model.key(scope, fresh);
      clearSettleNotices();
      const captured = { id: codexInboxId(fresh), ...scope };
      if (fresh._lineage_root_id) captured._lineage_root_id = fresh._lineage_root_id;
      if (Array.isArray(fresh._lineage_ids)) captured._lineage_ids = [...fresh._lineage_ids];
      const item = { key, scope, session: captured, until: Date.now() + 3000, timer: null };
      settleNotices.set(key, item);
      item.timer = timerHost.setTimeout(() => { clearSettleNotice(item); requestRender(); }, 3000);
      return true;
    });
    if (result) render();
    return result;
  };
  const snooze = (session, until, scope = currentScope) => {
    if (disposed || !on || !currentScope || !sameScope(scope) || input.loading || input.error ||
        !codexInboxOwnedBy(currentScope, session) || model.isSettled(currentScope, session)) return false;
    const fresh = findSession(codexInboxId(session));
    return fresh ? removeFromInbox(fresh, () => model.snooze(currentScope, fresh, until)) : false;
  };
  const cancelSnooze = (session, scope = currentScope) => {
    if (disposed || !on || !currentScope || !sameScope(scope)) return false;
    return model.cancelSnooze(currentScope, session);
  };
  const closeSnoozePopup = (restoreFocus = true) => {
    const item = snoozePopup;
    if (!item) return;
    snoozePopup = null; item.element.remove();
    item.anchor.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', item.outside, true);
    doc.removeEventListener('keydown', item.keydown, true);
    win.removeEventListener?.('resize', item.position);
    doc.removeEventListener('scroll', item.position, true);
    if (restoreFocus && item.anchor.isConnected) item.anchor.focus();
  };
  const rowSession = row => {
    const binding = rowBindings.get(row.getAttribute('data-codex-inbox-key'));
    return !disposed && on && binding?.row === row && row.isConnected && sameScope(binding.scope) ? findSession(binding.id) : null;
  };
  const showSnoozePopup = (session, anchor, event) => {
    if (disposed || !on || !currentScope || input.loading || input.error) return;
    if (snoozePopup?.anchor === anchor) {
      const pointer = event?.detail > 0;
      closeSnoozePopup(!pointer);
      if (pointer && doc.activeElement === anchor) anchor.blur();
      return;
    }
    closeSnoozePopup(false);
    const element = doc.createElement('div');
    element.setAttribute(own, 'popup'); element.setAttribute('data-codex-inbox-snooze-popup', '');
    element.setAttribute('role', 'menu'); element.setAttribute('aria-label', 'Snooze thread');
    const item = { element, anchor, id: codexInboxId(session), scope: { ...currentScope } };
    snoozePopup = item; anchor.setAttribute('aria-expanded', 'true');
    const choose = duration => {
      if (snoozePopup !== item || !sameScope(item.scope) || disposed || !on) return;
      const fresh = findSession(item.id);
      if (fresh && snooze(fresh, Date.now() + duration, item.scope)) closeSnoozePopup(false);
      // A failed save keeps this exact menu open. Errors paint in the Inbox,
      // never as extra menu options, fields or a footer.
      else requestRender();
    };
    const controls = [];
    for (const [label, duration] of [['15 min', 900000], ['30 min', 1800000], ['1 hour', 3600000], ['3 hours', 10800000], ['1 day', 86400000]]) {
      const option = button(label, event => { stop(event); choose(duration); });
      option.setAttribute('role', 'menuitem'); option.tabIndex = -1;
      option.addEventListener('pointermove', () => {
        if (snoozePopup === item && doc.activeElement !== option) option.focus({ preventScroll: true });
      });
      controls.push(option); element.appendChild(option);
    }
    item.position = () => {
      const rect = anchor.getBoundingClientRect();
      const view = doc.defaultView, width = Math.min(160, Math.max(0, view.innerWidth - 16));
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(8, Math.min(rect.right - width, view.innerWidth - width - 8))}px`;
      const height = element.getBoundingClientRect().height;
      element.style.top = `${Math.max(8, Math.min(rect.bottom + 4, view.innerHeight - height - 8))}px`;
    };
    item.outside = event => { if (!element.contains(event.target) && !anchor.contains(event.target)) closeSnoozePopup(false); };
    item.keydown = event => {
      // Dismissal never cancels the host's original event or steals an outside
      // click. Only menu-owned navigation/activation consumes a key.
      if (event.key === 'Escape') { closeSnoozePopup(element.contains(doc.activeElement)); return; }
      if (!element.contains(event.target)) return;
      if (event.key === 'Tab') { closeSnoozePopup(false); return; }
      const index = controls.indexOf(doc.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        stop(event);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 :
          (Math.max(0, index) + (event.key === 'ArrowDown' ? 1 : controls.length - 1)) % controls.length;
        controls[next].focus();
      } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
        stop(event); if (!event.repeat) controls[index].click();
      }
    };
    doc.body.appendChild(element); item.position();
    doc.addEventListener('pointerdown', item.outside, true); doc.addEventListener('keydown', item.keydown, true);
    win.addEventListener?.('resize', item.position); doc.addEventListener('scroll', item.position, true);
    element.querySelector('button')?.focus();
  };
  const cleanupDOM = () => {
    closeSnoozePopup(false); clearSettleNotices(); rowBindings.clear();
    island?.remove(); island = null; signature = null; container = null;
    style?.remove(); style = null;
    for (const badge of badgeBindings.values()) badge.remove();
    badgeBindings.clear();
    for (const badge of settledBadgeBindings.values()) badge.remove();
    settledBadgeBindings.clear();
  };
  const nativeHeaderTemplate = root => {
    // Copy only a native header button and its wrapper, never rows, actions,
    // React ownership, or native listeners. Structural matching is locale-safe.
    let wrapper, header;
    for (const section of root.children) {
      if (owns(section) || !section.matches('[data-slot="sidebar-group"]')) continue;
      const candidate = [...section.children].find(el => el.classList.contains('group/section'));
      const source = [...(candidate?.children || [])].find(el => el.matches('button') && el.classList.contains('group/section-label'));
      if (!source?.querySelector('.dither') || !source.querySelector('.codicon-chevron-right') || !source.querySelector('.dither').parentElement.querySelector('.truncate')) continue;
      wrapper = candidate.cloneNode(false); header = source.cloneNode(true); break;
    }
    if (!header) {
      // Exact installed SidebarSectionHeader / SidebarPanelLabel / DisclosureCaret
      // shape, until native Pinned or Sessions mounts. Its classes inherit host fonts.
      wrapper = doc.createElement('div');
      wrapper.className = 'group/section flex shrink-0 items-center justify-between gap-1 pb-1 pt-1.5';
      header = doc.createElement('button');
      header.className = 'group/section-label flex w-fit min-w-0 items-center gap-1 bg-transparent text-left leading-none';
      const label = doc.createElement('span');
      label.className = 'flex min-w-0 items-center gap-2 pl-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-(--theme-primary)';
      const dot = doc.createElement('span'); dot.setAttribute('aria-hidden', 'true'); dot.className = 'dither inline-block size-2 shrink-0 rounded-[1px]';
      const text = doc.createElement('span'); text.className = 'min-w-0 truncate leading-none';
      label.append(dot, text);
      const caret = doc.createElement('i'); caret.setAttribute('aria-hidden', 'true'); caret.style.fontSize = '0.75rem';
      caret.className = 'codicon codicon-chevron-right shrink-0 duration-150 text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100';
      header.append(label, caret);
    }
    wrapper.appendChild(header);
    for (const node of [wrapper, ...wrapper.querySelectorAll('*')]) {
      for (const attr of [...node.attributes]) {
        if (/^on/i.test(attr.name) || attr.name === 'id' || attr.name.startsWith('data-codex-inbox-') || ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-expanded', 'title'].includes(attr.name)) node.removeAttribute(attr.name);
      }
    }
    header.type = 'button'; header.removeAttribute('disabled');
    header.querySelector('.dither').parentElement.querySelector('.truncate').textContent = 'Inbox';
    header.querySelector('.codicon-chevron-right').classList.remove('rotate-90');
    return { wrapper, header, fingerprint: wrapper.outerHTML };
  };
  const ensureStyle = () => {
    if (style?.isConnected) return;
    style = doc.createElement('style'); style.setAttribute(own, 'style');
    style.textContent = CODEX_INBOX_ROW_UI_CSS + `
/* Native Sessions keeps a growing, minimum-height viewport even when closed.
   Allocate the remaining height to Inbox; cap native lists without moving or
   rewriting their React-owned nodes. Removing the island restores the host. */
html[data-codex-chat-look='true'] [data-sessions-mode]:has(> [data-codex-inbox-owned='island']) { overflow:hidden; }
html[data-codex-chat-look='true'] [data-sessions-mode]:has(> [data-codex-inbox-owned='island']) > [data-slot='sidebar-group']:not([data-codex-inbox-owned]) { flex:0 1 auto!important; min-height:0!important; max-height:35%; overflow:hidden; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'] + [data-slot='sidebar-group'] { margin-top:auto; }
html[data-codex-chat-look='true'] [data-sessions-mode]:has(> [data-codex-inbox-owned='island']) > [data-slot='sidebar-group']:not([data-codex-inbox-owned]) > [data-slot='sidebar-group-content'] { min-height:0; overflow-y:auto; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'] { flex:1 1 0; min-height:3.5rem; color:var(--ui-text-primary); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'][data-codex-inbox-expanded='false'] { flex:0 0 auto; min-height:0; padding-bottom:0; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'] > [data-slot='sidebar-group-content'] { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'] > [data-slot='sidebar-group-content'][hidden] { display:none!important; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)) { color:inherit; background:transparent; border:0; cursor:pointer; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)):not([data-codex-inbox-header]):hover { background:var(--ui-control-hover-background); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)):focus-visible { outline:1px solid var(--ui-accent); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)):disabled { color:var(--ui-text-quaternary); cursor:default; }
html[data-codex-chat-look='true'] [data-codex-inbox-snooze-popup] { position:fixed; z-index:var(--z-modal-popover, 140); box-sizing:border-box; display:flex; flex-direction:column; padding:4px; max-height:calc(100vh - 16px); overflow:auto; border:1px solid var(--ui-stroke-secondary); border-radius:8px; background:color-mix(in srgb, var(--ui-bg-elevated) 96%, transparent); color:var(--ui-text-primary); font:12px var(--font-sans, system-ui); backdrop-filter:blur(12px); }
html[data-codex-chat-look='true'] [data-codex-inbox-snooze-popup] button { padding:4px 8px; text-align:left; border-radius:6px; font:inherit; line-height:16px; }
html[data-codex-chat-look='true'] [data-codex-inbox-snooze-popup] button:is(:hover,:focus) { background:var(--ui-control-active-background); color:var(--ui-text-primary); outline:none; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge'] { display:inline-flex; font-size:10px; padding:1px 4px; color:var(--ui-text-tertiary); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge'] .codex-inbox-unsettle { display:none; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge']:hover .codex-inbox-settled,
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge']:focus-within .codex-inbox-settled { display:none; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge']:hover .codex-inbox-unsettle,
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge']:focus-within .codex-inbox-unsettle { display:inline; }
html[data-codex-chat-look='true'] [data-codex-inbox-status] { padding:6px 8px; font-size:11px; color:var(--ui-text-tertiary); }
html[data-codex-chat-look='true'] [data-codex-inbox-settle-notice] { position:relative; overflow:hidden; display:flex; align-items:center; justify-content:space-between; gap:8px; margin:2px 4px; padding:4px 8px; border:1px solid var(--ui-stroke-secondary); border-radius:6px; background:var(--ui-sidebar-surface-background,var(--ui-bg-sidebar,var(--ui-bg-elevated))); color:var(--ui-text-primary); font:11px var(--font-sans, system-ui); }
html[data-codex-chat-look='true'] [data-codex-inbox-settle-notice] button { padding:2px 4px; border-radius:4px; font:inherit; }
html[data-codex-chat-look='true'] [data-codex-inbox-undo-track] { pointer-events:none; position:absolute; left:0; right:0; bottom:0; height:2px; background:color-mix(in srgb,var(--ui-accent,var(--ui-text-primary)) 12%,transparent); }
html[data-codex-chat-look='true'] [data-codex-inbox-undo-progress] { display:block; width:100%; height:100%; background:var(--ui-accent,var(--ui-text-primary)); transform-origin:left center; animation:codex-inbox-undo-progress 3s linear both; }
@keyframes codex-inbox-undo-progress { from { transform:scaleX(0); } to { transform:scaleX(1); } }
@media(prefers-reduced-motion:reduce) { html[data-codex-chat-look='true'] [data-codex-inbox-undo-progress] { animation:none; transform:scaleX(1); } }
`;
    (doc.head || doc.documentElement).appendChild(style);
  };
  const nativeSession = row => {
    const bound = externalBindings.get(row);
    return bound && bound.scope.connectionId === currentScope.connectionId && bound.scope.profile === currentScope.profile &&
      admission.isEligible(currentScope, bound.session) ? bound.session : null;
  };
  const renderBadges = root => {
    // Explicit opt-in bindings only. The shipping parent uses SESSION_ROW_AREAS;
    // do not infer identity from native labels, DOM order or conversation anchors.
    const rows = new Set(externalBindings.keys());
    for (const [row, badge] of settledBadgeBindings) {
      const session = rows.has(row) && row.isConnected && root.contains(row) && nativeSession(row);
      if (!session || !model.isSettled(currentScope, session) || !model.isSnoozed(currentScope, session)) { badge.remove(); settledBadgeBindings.delete(row); }
    }
    for (const [row, badge] of badgeBindings) {
      const session = rows.has(row) && row.isConnected && root.contains(row) && nativeSession(row);
      if (!session || !model.isSettled(currentScope, session) && !model.isSnoozed(currentScope, session)) { badge.remove(); badgeBindings.delete(row); }
    }
    for (const row of rows) {
      if (!root.contains(row) || owns(row)) continue;
      const session = nativeSession(row);
      const snoozed = session && model.isSnoozed(currentScope, session);
      if (!session || !model.isSettled(currentScope, session) && !snoozed) continue;
      let badge = badgeBindings.get(row);
      if (!badge?.isConnected) {
        badge?.remove();
        const scope = { ...currentScope };
        badge = button('', event => {
          stop(event);
          if (disposed || !on || !sameScope(scope)) return;
          const fresh = nativeSession(row);
          if (fresh) {
            if (model.isSnoozed(currentScope, fresh)) cancelSnooze(fresh, scope);
            else model.unsettle(currentScope, fresh);
          }
        });
        badge.setAttribute(own, 'badge');
        const label = doc.createElement('span'); label.className = 'codex-inbox-settled';
        const action = doc.createElement('span'); action.className = 'codex-inbox-unsettle';
        badge.append(label, action);
        const target = row.querySelector('[data-row-actions]') || row;
        // Never nest a button inside a native button; use an explicit sibling slot.
        if (target.closest('button')) continue;
        target.appendChild(badge); badgeBindings.set(row, badge);
      }
      const label = badge.querySelector('.codex-inbox-settled'), action = badge.querySelector('.codex-inbox-unsettle');
      const name = snoozed ? 'Wake now' : 'Un-settle', text = snoozed ? 'Snoozed' : 'Settled';
      if (label.textContent !== text) label.textContent = text;
      if (action.textContent !== name) action.textContent = name;
      setAttr(badge, 'aria-label', name);
      const title = snoozed ? `Snoozed until ${new Date(model.snoozedUntil(currentScope, session)).toLocaleString()}. Wake now` : name;
      if (badge.title !== title) badge.title = title;
      // Both states remain independently reversible, including while snoozed.
      if (snoozed && model.isSettled(currentScope, session)) {
        let settledBadge = settledBadgeBindings.get(row);
        if (!settledBadge?.isConnected) {
          settledBadge?.remove();
          const scope = { ...currentScope };
          settledBadge = button('', event => {
            stop(event);
            if (disposed || !on || !sameScope(scope)) return;
            const fresh = nativeSession(row); if (fresh) model.unsettle(currentScope, fresh);
          });
          settledBadge.setAttribute(own, 'badge'); settledBadge.setAttribute('aria-label', 'Un-settle'); settledBadge.title = 'Un-settle';
          const label = doc.createElement('span'); label.className = 'codex-inbox-settled'; label.textContent = 'Settled';
          const action = doc.createElement('span'); action.className = 'codex-inbox-unsettle'; action.textContent = 'Un-settle';
          settledBadge.append(label, action); badge.parentElement.appendChild(settledBadge); settledBadgeBindings.set(row, settledBadge);
        }
      }
    }
  };
  function render() {
    if (disposed) return;
    if (!on || !currentScope) { cleanupDOM(); return; }
    const root = doc.querySelector('[data-sessions-mode]');
    if (!root) { if (container) cleanupDOM(); return; }
    if (container !== root || !island?.isConnected) {
      cleanupDOM(); container = root; ensureStyle();
      island = doc.createElement('div'); island.setAttribute(own, 'island');
      island.setAttribute('data-slot', 'sidebar-group'); island.setAttribute('data-sidebar', 'group');
      island.className = 'relative flex w-full min-w-0 min-h-0 flex-col p-0 pb-1';
      const first = [...root.children].find(el => el.matches('[data-slot="sidebar-group"]'));
      root.insertBefore(island, first || root.firstChild);
    }
    setAttr(island, 'aria-busy', input.loading === true);
    const headerTemplate = nativeHeaderTemplate(root);
    for (const item of settleNotices.values()) {
      if (Date.now() >= item.until || !model.isManualSettled(item.scope, item.session)) clearSettleNotice(item);
    }
    const sessions = inboxSessions().filter(s => !model.isSettled(currentScope, s) && !model.isSnoozed(currentScope, s));
    const shown = sessions;
    const nextSignature = JSON.stringify([currentScope, inboxOpen, input.loading, !!input.error, model.error, admission.error, headerTemplate.fingerprint,
      [...settleNotices.values()].map(item => [item.key, item.until]), sessions.length, shown.map(s => [model.key(currentScope, s), codexInboxId(s), s.title, safety(s), workState(s), active(s)])]);
    if (signature !== nextSignature) {
      signature = nextSignature;
      setAttr(island, 'data-codex-inbox-expanded', inboxOpen);
      const focusedElement = island.contains(doc.activeElement) ? doc.activeElement : null;
      const focusedHeader = focusedElement?.hasAttribute('data-codex-inbox-header');
      const oldHeader = island.querySelector('[data-codex-inbox-header]');
      const scrollTop = island.querySelector('[data-slot="sidebar-group-content"]')?.scrollTop || 0;
      island.replaceChildren();
      const reuseHeader = oldHeader?.__codexInboxTemplate === headerTemplate.fingerprint;
      const header = reuseHeader ? oldHeader : headerTemplate.header;
      const wrapper = reuseHeader ? oldHeader.parentElement : headerTemplate.wrapper;
      if (!reuseHeader) {
        header.__codexInboxTemplate = headerTemplate.fingerprint;
        const toggle = event => {
          if (disposed || !on || !header.isConnected || !island.contains(header)) return;
          stop(event); inboxOpen = !inboxOpen; requestRender();
        };
        header.addEventListener('click', toggle);
        header.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { stop(event); if (!event.repeat) toggle(event); }
        });
      }
      header.setAttribute('aria-expanded', String(inboxOpen)); header.setAttribute('data-codex-inbox-header', '');
      header.querySelector('.codicon-chevron-right').classList.toggle('rotate-90', inboxOpen);
      island.appendChild(wrapper);
      const content = doc.createElement('div'); content.setAttribute('data-slot', 'sidebar-group-content'); content.className = 'w-full text-sm scrollbar-fade'; content.hidden = !inboxOpen;
      island.appendChild(content);
      const status = text => { const el = doc.createElement('div'); el.setAttribute('data-codex-inbox-status', ''); el.setAttribute('role', 'status'); el.textContent = text; content.appendChild(el); };
      if (input.error) {
        status('Inbox could not be loaded. Refresh Sessions to retry.');
        if (typeof input.retry === 'function') content.appendChild(button('Retry Inbox', () => input.retry()));
      }

      if (model.error) status(model.error);
      if (admission.error) status(admission.error);
      if (!input.loading && !input.error && !model.error && !admission.error && !sessions.length) status('Inbox is clear. Settled and snoozed threads remain in Sessions and Pinned.');
      const kept = new Set();
      for (const session of shown) {
        const key = model.key(currentScope, session);
        if (kept.has(key)) continue;
        kept.add(key);
        let binding = rowBindings.get(key);
        if (!binding) {
          const ui = createCodexInboxRowUI({
            document: doc,
            onOpen: () => { const fresh = rowSession(ui.row); if (fresh) open(fresh); },
            onMenu: event => { stop(event); const fresh = rowSession(ui.row); if (fresh) settle(fresh); },
            onSnooze: event => { stop(event); const fresh = rowSession(ui.row); if (fresh) showSnoozePopup(fresh, ui.clock, event); }
          });
          ui.row.setAttribute('data-codex-inbox-key', key);

          ui.clock.setAttribute('aria-haspopup', 'menu'); ui.clock.setAttribute('aria-expanded', 'false');
          binding = { ...ui, action: ui.menu }; rowBindings.set(key, binding);
        }
        binding.id = codexInboxId(session); binding.scope = { ...currentScope };
        const { row, clock, action } = binding;
        setAttr(row, 'data-codex-inbox-row', binding.id);
        const title = typeof session.title === 'string' && session.title ? session.title : 'Untitled thread';
        binding.update({
          title, selected: active(session), settleAction: true, workState: workState(session),
          menuDisabled: false,
          menuTitle: 'Remove from Inbox only. Work continues.'
        });
        setAttr(action, 'aria-label', `Settle ${title}`); setAttr(clock, 'aria-label', `Snooze ${title}`);
        // Opening stays enabled as before; Snooze does not depend on work status.
        clock.disabled = !!input.loading || !!input.error; clock.title = 'Hide from Inbox for a chosen duration. Work continues.';
        content.appendChild(row);
      }
      for (const item of settleNotices.values()) {
        const notice = doc.createElement('div');
        notice.setAttribute('data-codex-inbox-settle-notice', codexInboxId(item.session)); notice.setAttribute('role', 'status');
        const label = doc.createElement('span'); label.textContent = 'Settled';
        const undo = button('Undo', event => { stop(event); if (undo.isConnected && island?.contains(undo)) undoSettle(item); });
        const track = doc.createElement('span'); track.setAttribute('data-codex-inbox-undo-track', ''); track.setAttribute('aria-hidden', 'true');
        const progress = doc.createElement('span'); progress.setAttribute('data-codex-inbox-undo-progress', '');
        // A metadata repaint must not restart the visual deadline.
        progress.style.animationDelay = `-${Math.max(0, 3000 - (item.until - Date.now()))}ms`;
        track.appendChild(progress); notice.append(label, undo, track); content.appendChild(notice);
      }
      for (const key of rowBindings.keys()) if (!kept.has(key)) rowBindings.delete(key);
      if (snoozePopup && !snoozePopup.anchor.isConnected) closeSnoozePopup(false);

      content.scrollTop = scrollTop;
      if (focusedElement?.isConnected) focusedElement.focus({ preventScroll: true });
      else if (focusedHeader) header.focus();
      if (snoozePopup) snoozePopup.position();
    }
    renderBadges(root);
  }
  const observer = new win.MutationObserver(records => {
    if (records.some(record => {
      if (owns(record.target)) return false;
      if (record.type === 'attributes' && ['class', 'style'].includes(record.attributeName)) {
        return record.target.closest?.('[data-slot="sidebar-group"]')?.parentElement === container &&
          (record.target.classList.contains('group/section') || !!record.target.closest?.('button.group\\/section-label'));
      }
      if (record.type === 'attributes') return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => !owns(node));
    })) requestRender();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sessions-mode', 'aria-expanded', 'class', 'style'] });
  const offModel = model.subscribe(() => { refreshDeadline(); requestRender(); });
  const resume = () => { if (!disposed && on) { refreshDeadline(); requestRender(); } };
  doc.addEventListener('visibilitychange', resume);
  win.addEventListener?.('focus', resume);
  const offActive = ['activeSessionId', 'focusedStoredSessionId', 'focusedSessionOwner', 'focusedSessionProfile', 'profile', 'connectionId'].map(name => host.state?.[name]?.subscribe?.(requestRender)).filter(Boolean);
  const api = {
    model, admission, snooze, cancelSnooze,
    opened() {
      // Native navigation and metadata discovery are not attention decisions.
      return false;
    },
    update(next) {
      if (disposed) return;
      const scope = codexInboxScope(next.scope);
      if (JSON.stringify(scope) !== JSON.stringify(currentScope)) { cleanupDOM(); activityByKey.clear(); inboxOpen = true; }
      currentScope = scope;
      input = { ...next, sessions: Array.isArray(next.sessions) ? next.sessions : [], liveSessions: Array.isArray(next.liveSessions) ? next.liveSessions : [], liveStatusKnown: next.liveStatusKnown ?? Array.isArray(next.liveSessions) };
      if (scope && on) { reconcileAdmission(); reconcileActivity(); }
      refreshDeadline(); requestRender();
    },
    // Positive work/input events only. Callers must supply authoritative scope and ID.
    // Background reads/resuming and explicit UI opens do nothing.
    reactivate(event) {
      if (disposed || !on || !currentScope || !event || !codexInboxOwnedBy(currentScope, event) || JSON.stringify(codexInboxScope(event.scope)) !== JSON.stringify(currentScope)) return false;
      if (!['work', 'input', 'busy'].includes(event.type) && codexInboxWorkStatus(event) !== 'work') return false;
      const id = event.session_id || event.id || event.session_key;
      const session = findSession(id) || visibleSessions().find(s => runtimeAliases(s).has(id));
      if (!session || input.loading || input.error || input.liveStatusKnown !== true ||
          !admission.observe(currentScope, input.sessions, { workingSessions: [session] }) || !admission.isEligible(currentScope, session)) { requestRender(); return false; }
      if (model.isManualSettled(currentScope, session) && !model.unsettle(currentScope, session)) { requestRender(); return false; }
      const key = model.key(currentScope, session), previous = activityByKey.get(key);
      activityByKey.set(key, { phase: 'working', at: Date.now(), children: previous?.children || new Set() });
      const result = model.ingest(currentScope, [session], { liveSessions: [{ ...session, status: 'working' }] });
      requestRender(); return result;
    },
    activity(event) {
      if (disposed || !on || !currentScope || event?.replayed || !event?.session_id ||
          !sameScope({ connectionId: event.connectionId, profile: event.profile })) return false;
      const session = findSession(event.session_id) || visibleSessions().find(row => runtimeAliases(row).has(event.session_id));
      if (!session) return false;
      if (['message.start', 'tool.start'].includes(event.type)) {
        if (event.type === 'tool.start' && model.isManualSettled(currentScope, session)) return false;
        return api.reactivate({ type: 'work', scope: currentScope, session_id: event.session_id });
      }
      const key = model.key(currentScope, session), previous = activityByKey.get(key);
      const activity = { phase: previous?.phase || 'idle', at: Date.now(), children: new Set(previous?.children || []) };
      if (['subagent.spawn_requested', 'subagent.start', 'subagent.complete'].includes(event.type)) {
        const child = event.payload?.subagent_id;
        if (typeof child !== 'string' || !child) return false;
        if (event.type === 'subagent.complete') activity.children.delete(child);
        else { activity.children.add(child); activity.phase = 'working'; }
      } else if (event.type === 'message.complete') {
        activity.phase = activity.children.size ? 'working' : event.payload?.status === 'complete' && !event.payload.error ? 'completed' : 'unknown';
      } else if (event.type === 'error') activity.phase = 'unknown';
      else return false;
      activityByKey.set(key, activity);
      requestRender(); return true;
    },
    // Parent row-slot integration can bind an exact element without guessing React identity.
    // The row must be outside the Inbox island, inside the native sessions container.
    bindNativeRow(row, session, scope = currentScope) {
      const valid = codexInboxScope(scope);
      if (disposed || !row || !valid || !codexInboxId(session)) return () => {};
      const binding = { session, scope: valid }; externalBindings.set(row, binding); requestRender();
      return () => { if (externalBindings.get(row) === binding) { externalBindings.delete(row); badgeBindings.get(row)?.remove(); badgeBindings.delete(row); settledBadgeBindings.get(row)?.remove(); settledBadgeBindings.delete(row); requestRender(); } };
    },
    setMode(value) {
      if (disposed) return false;
      // Parent owns the string-valued preference and any persistence errors.
      on = !!value;
      if (!on) cleanupDOM();
      else if (currentScope) reconcileAdmission();
      refreshDeadline(); requestRender(); return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true; clearDeadline(); observer.disconnect(); offModel(); offActive.forEach(fn => fn());
      doc.removeEventListener('visibilitychange', resume); win.removeEventListener?.('focus', resume);
      if (raf !== null) win.cancelAnimationFrame(raf);
      cleanupDOM(); externalBindings.clear(); activityByKey.clear();
      if (doc[registryKey] === api.dispose) delete doc[registryKey];
    }
  };
  doc[registryKey] = api.dispose;
  refreshDeadline(); requestRender();
  return api;
}
