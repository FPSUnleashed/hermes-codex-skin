// Bundled into the standalone plugin. The private feed is used only by test builds.
const UPDATE_REPO = BUILD_ID.includes('-test.') ? 'FPSUnleashed/hermes-codex-skin-dev' : 'FPSUnleashed/hermes-codex-skin'
const UPDATE_IS_TEST = BUILD_ID.includes('-test.')
const UPDATE_INTERVAL_MS = 60 * 60 * 1000
const UPDATE_PENDING_KEY = 'update-pending'
const UPDATE_CACHE_KEY = `update-cache:${UPDATE_REPO}`
const UPDATE_MAX_BYTES = 1_000_000
const UPDATE_CSS = `
[data-codex-update-anchor]{display:inline-flex;align-items:center;height:28px;position:relative}
.codex-update-button{box-sizing:border-box;position:relative;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:#0285ff;color:#fff;scale:.9;cursor:pointer;outline:none;transition:background 160ms,box-shadow 160ms;flex:none}
.codex-update-button:hover{box-shadow:0 0 0 3px rgb(2 133 255 / .12)}
.codex-update-button:focus-visible{outline:1px solid #0285ff;outline-offset:4px}
.codex-update-button svg{display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.codex-update-button .codex-update-icon{width:16px;height:16px;pointer-events:none}
.codex-update-button .codex-update-ring{position:absolute;inset:-3px;width:34px;height:34px;transform:rotate(-90deg);color:#0285ff;pointer-events:none}
.codex-update-ring circle{stroke-dasharray:113.1;stroke-dashoffset:113.1;transition:stroke-dashoffset 100ms linear}
.codex-update-button[data-phase=downloading] .codex-update-icon{animation:codex-update-download 800ms ease-in-out infinite}
.codex-update-button[data-phase=applying] .codex-update-icon,.codex-update-button[data-phase=awaiting-reload] .codex-update-icon{animation:codex-update-breathe 550ms ease-in-out infinite}
.codex-update-button:is([data-phase=done],[data-phase=vanishing]){background:#00a854;color:#fff;box-shadow:none;cursor:default}
.codex-update-button[data-phase=done]{animation:codex-update-bounce 650ms 350ms ease-in-out both}
.codex-update-button[data-phase=done] .codex-update-check{stroke-dasharray:24;stroke-dashoffset:24;animation:codex-update-draw 300ms 100ms ease forwards}
.codex-update-button[data-phase=vanishing]{animation:codex-update-exit 280ms cubic-bezier(.4,0,.65,1) both;pointer-events:none}
.codex-update-button[data-phase=error]{background:var(--ui-text-primary,#222)}
.codex-update-panel{box-sizing:border-box;position:fixed;z-index:10000;overflow:auto;overscroll-behavior:contain;width:320px;max-height:320px;padding:0 18px;border:1px solid var(--ui-stroke-secondary,#e5e5e5);border-radius:14px;background:var(--codex-color-card,var(--ui-editor-surface-background,#fff));color:var(--ui-text-primary,#171717);box-shadow:0 12px 36px #00000014,0 2px 6px #00000008;font:12px/1.65 -apple-system,system-ui,sans-serif;scrollbar-width:thin;scrollbar-color:var(--ui-stroke-secondary,#ccc) transparent}
.codex-update-panel[hidden]{display:none!important}
.codex-update-hover-bridge{position:fixed;z-index:10000;background:transparent}
.codex-update-hover-bridge[hidden]{display:none!important}
.codex-update-release{padding:16px 0;border-bottom:1px solid var(--ui-stroke-secondary,#e5e5e5)}
.codex-update-release:last-child{border:0}
.codex-update-release header{display:flex;align-items:center;gap:8px;margin-bottom:9px;font-size:11px}
.codex-update-release time{margin-left:auto;color:var(--ui-text-tertiary,#737373);font-size:10px}
.codex-update-release h3,.codex-update-release h4{font-size:12px;line-height:1.5;font-weight:600;margin:8px 0 4px}
.codex-update-release p{margin:5px 0;color:var(--ui-text-secondary,#666);overflow-wrap:anywhere;white-space:pre-wrap}
.codex-update-release ul{margin:5px 0;padding-left:16px;color:var(--ui-text-secondary,#666)}
.codex-update-release li{margin:3px 0;overflow-wrap:anywhere}
.codex-update-release figure{margin:10px 0}
.codex-update-release img{display:block;width:auto;height:auto;max-width:100%;max-height:180px;margin-inline:auto;object-fit:contain;border-radius:8px}
.codex-update-image-fallback{color:var(--ui-text-tertiary,#737373);font-size:11px}
.codex-update-tag{border-radius:99px;padding:1px 6px;background:var(--ui-row-hover-background,#f3f3f3);font-size:9px}
.codex-update-error{padding:16px 0;white-space:pre-wrap;color:var(--ui-text-primary,#171717)}
@keyframes codex-update-download{0%,100%{transform:translateY(-1px)}50%{transform:translateY(2px)}}
@keyframes codex-update-breathe{50%{opacity:.3}}
@keyframes codex-update-draw{to{stroke-dashoffset:0}}
@keyframes codex-update-bounce{0%,100%{transform:translateY(0) scale(1)}25%{transform:translateY(-3px) scale(1.12)}48%{transform:translateY(0) scale(.96)}70%{transform:translateY(-1.5px) scale(1.06)}86%{transform:translateY(0) scale(.99)}}
@keyframes codex-update-exit{from{transform:scale(1);opacity:1}to{transform:scale(0);opacity:0}}
@media(prefers-reduced-motion:reduce){.codex-update-button,.codex-update-button *{animation:none!important;transition:none!important}.codex-update-check{stroke-dashoffset:0!important}}
`

function updateVersionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-test\.(\d+))?$/.exec(String(value))
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? Infinity : Number(match[4])] : null
}
function compareUpdateVersions(left, right) {
  const a = updateVersionParts(left), b = updateVersionParts(right)
  if (!a || !b) return null
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  return 0
}
async function updateSha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('')
}
function updateSourceIdentity(source) {
  return { id: /^const ID = ['"]([^'"]+)['"]/m.exec(source)?.[1], version: /^const BUILD_ID = ['"]([^'"]+)['"]/m.exec(source)?.[1] }
}
function normalizeUpdateRoot(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid local plugin folder.')
  const path = value.replace(/\\/g, '/').replace(/\/$/, '')
  if (!/^(?:\/|[A-Za-z]:\/)/.test(path) || !path.endsWith('/desktop-plugins') || path.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid local plugin folder.')
  return path
}
function updateAssetFor(release, repo = UPDATE_REPO) {
  if (!release || release.draft || (!UPDATE_IS_TEST && release.prerelease) || !updateVersionParts(release.tag_name)) return null
  const asset = release.assets?.find(item => item.name === 'plugin.js')
  if (!asset || !Number.isSafeInteger(asset.id) || asset.url !== `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`) return null
  if (!/^sha256:[a-f0-9]{64}$/.test(asset.digest || '') || asset.size <= 0 || asset.size > UPDATE_MAX_BYTES) return null
  return asset
}
function updateImageURL(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const path = url.pathname.toLowerCase(), repo = '/fpsunleashed/hermes-codex-skin/'
    const allowed = (url.hostname === 'github.com' && (path.startsWith(repo + 'releases/download/') || path.startsWith('/user-attachments/assets/')))
      || (url.hostname === 'raw.githubusercontent.com' && path.startsWith(repo))
      || url.hostname === 'user-images.githubusercontent.com'
    return allowed ? url.href : null
  } catch { return null }
}
function decodeUpdateImageText(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, name) => {
    if (name[0] !== '#') return named[name.toLowerCase()]
    const point = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : Number(name.slice(1))
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\ufffd'
  })
}
function appendUpdateImage(parent, source, alt) {
  const url = updateImageURL(decodeUpdateImageText(source))
  const fallback = document.createElement('p')
  fallback.className = 'codex-update-image-fallback'
  fallback.textContent = decodeUpdateImageText(alt) || 'Image unavailable'
  if (!url) { parent.appendChild(fallback); return }
  const frame = document.createElement('figure'), image = document.createElement('img')
  image.alt = decodeUpdateImageText(alt)
  // GitHub release redirects support image display, not CORS pixel access.
  // No fetch/token bridge is used; keep the image's referrer empty.
  image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'
  image.dataset.updateImageSrc = url
  image.addEventListener('error', () => frame.replaceWith(fallback), { once: true })
  frame.appendChild(image); parent.appendChild(frame)
}
function activateUpdateImages(parent) {
  for (const image of parent.querySelectorAll('img[data-update-image-src]')) {
    const source = image.dataset.updateImageSrc
    delete image.dataset.updateImageSrc
    image.src = source
  }
}
function appendUpdateNotes(parent, raw) {
  // Parse only image tokens. No release HTML, attributes or event handlers enter
  // the DOM; the remainder continues to use plain text nodes.
  let list = null
  const appendText = line => {
    const text = line.trim().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
    if (!text) { list = null; return }
    const bullet = /^[-*] (.+)/.exec(text)
    if (bullet) {
      if (!list) { list = document.createElement('ul'); parent.appendChild(list) }
      const item = document.createElement('li'); item.textContent = bullet[1]; list.appendChild(item)
    } else {
      list = null
      const heading = /^#{1,6}\s+(.+)/.exec(text)
      const node = document.createElement(heading ? 'h4' : 'p'); node.textContent = heading ? heading[1] : text; parent.appendChild(node)
    }
  }
  const tokens = /!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)|<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*\/?>/gi
  for (const line of String(raw || '').split('\n')) {
    let cursor = 0
    for (const match of line.matchAll(tokens)) {
      const before = line.slice(cursor, match.index)
      if (!/^\s*[-*]\s*$/.test(before)) appendText(before)
      if (match[0].startsWith('![')) appendUpdateImage(parent, match[2].replace(/^<|>$/g, ''), match[1])
      else {
        const attributes = new Map()
        for (const field of match[0].slice(4, -1).matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
          const name = field[1].toLowerCase()
          if (!attributes.has(name)) attributes.set(name, field[2] ?? field[3] ?? field[4] ?? '')
        }
        appendUpdateImage(parent, attributes.get('src'), attributes.get('alt'))
      }
      list = null; cursor = match.index + match[0].length
    }
    appendText(line.slice(cursor))
  }
}

function createSkinUpdater(storage, native = globalThis.window?.hermesDesktop, request = (...args) => fetch(...args)) {
  const views = new Set(), abort = new AbortController(), timers = new Set()
  const capable = ['desktopPluginsRoot', 'readPluginSource', 'writeTextFile'].every(name => typeof native?.[name] === 'function')
  const state = { phase: 'idle', releases: [], target: null, progress: 0, error: '', page: 1, hasMore: false }
  let initPromise, root, token = '', disposed = false, loadingMore = false, reportChain = Promise.resolve()
  let operation = null, proof = {}
  const cache = storage?.get?.(UPDATE_CACHE_KEY, null)
  const schedule = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!disposed) fn() }, ms); timers.add(id); return id }
  const pause = ms => new Promise(resolve => schedule(resolve, ms))
  const active = () => ['downloading', 'applying', 'awaiting-reload', 'done', 'vanishing'].includes(state.phase)
  function report(extra = {}) {
    if (!UPDATE_IS_TEST || !root || disposed) return
    proof = { ...proof, ...extra }
    const payload = { ...proof, runningVersion: BUILD_ID, phase: state.phase, repository: UPDATE_REPO, targetVersion: state.target?.tag_name || null, activeBuild: document.documentElement.dataset.codexChatLookBuild || null, at: new Date().toISOString() }
    reportChain = reportChain.then(() => disposed ? undefined : native.writeTextFile(`${root}/${ID}/update-test-report.json`, JSON.stringify(payload, null, 2))).catch(() => {})
  }
  function paint() { if (!disposed) for (const view of views) view.paint() }
  function phase(value, error = '') { if (disposed) return; state.phase = value; state.error = error; paint(); report() }
  async function readSource(path) {
    const result = await native.readPluginSource(path)
    if (result.truncated || typeof result.text !== 'string') throw new Error('The local plugin could not be read completely.')
    return result.text
  }
  async function restorePrevious(pending) {
    if (!pending || pending.repository !== UPDATE_REPO || !/^[a-f0-9]{64}$/.test(pending.fromDigest || '')) throw new Error('The rollback receipt is missing.')
    const previous = await readSource(`${root}/${ID}/update-rollback.js`)
    if (await updateSha256(new TextEncoder().encode(previous)) !== pending.fromDigest || updateSourceIdentity(previous).version !== pending.fromVersion) throw new Error('The rollback copy could not be verified.')
    await native.writeTextFile(`${root}/${ID}/plugin.js`, previous)
    if (await readSource(`${root}/${ID}/plugin.js`) !== previous) throw new Error('The restored file could not be verified.')
    storage.remove(UPDATE_PENDING_KEY)
  }
  function recoverPending(pending) {
    phase('awaiting-reload')
    schedule(async () => {
      const current = storage.get(UPDATE_PENDING_KEY, null)
      if (!current || current.startedAt !== pending.startedAt || current.digest !== pending.digest) return
      try { await restorePrevious(current); phase('error', 'The interrupted update was rolled back. Click to retry.') }
      catch { phase('error', 'The update is incomplete. Its recovery receipt and rollback copy were retained.') }
    }, Math.max(0, 10000 - (Date.now() - pending.startedAt)))
  }
  async function initialize() {
    if (!capable) throw new Error('This Hermes Desktop version does not support local plugin updates.')
    if (!initPromise) initPromise = (async () => {
      root = normalizeUpdateRoot(await native.desktopPluginsRoot())
      if (UPDATE_IS_TEST) {
        const access = JSON.parse(await readSource(`${root}/${ID}/update-test-access.json`))
        if (access.repository !== UPDATE_REPO || typeof access.token !== 'string' || !access.token) throw new Error('Private update access is not configured on this computer.')
        token = access.token
      }
      const pending = storage.get(UPDATE_PENDING_KEY, null)
      if (pending?.targetVersion === BUILD_ID && pending.repository === UPDATE_REPO) {
        const installed = await readSource(`${root}/${ID}/plugin.js`)
        const hash = await updateSha256(new TextEncoder().encode(installed))
        if (hash !== pending.digest || updateSourceIdentity(installed).version !== BUILD_ID) { recoverPending(pending); return }
        storage.remove(UPDATE_PENDING_KEY)
        storage.set('last-update', { version: BUILD_ID, digest: hash, verifiedAt: Date.now() })
        phase('done')
        report({ hotReloadVerified: true, installedDigest: hash, fromVersion: pending.fromVersion })
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) schedule(() => phase('idle'), 700)
      } else if (pending?.repository === UPDATE_REPO && Number.isFinite(pending.startedAt)) recoverPending(pending)
      else report({ localAccessVerified: true })
    })()
    return initPromise
  }
  async function github(path, accept = 'application/vnd.github+json') {
    await initialize()
    const allowed = `https://api.github.com/repos/${UPDATE_REPO}/releases`
    if (!(path === allowed || path.startsWith(allowed + '?') || path.startsWith(allowed + '/assets/'))) throw new Error('Unexpected update source.')
    const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await request(path, { headers, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]) })
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub is temporarily limiting requests. Try again later.' : `GitHub request failed (${response.status}).`)
    return response
  }
  async function loadPage(page) {
    const response = await github(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=10&page=${page}`)
    const data = await response.json()
    if (!Array.isArray(data)) throw new Error('GitHub returned an invalid release list.')
    return data
  }
  async function firstPage() {
    const releases = await loadPage(1)
    const entry = { releases, checkedAt: Date.now() }
    storage.set(UPDATE_CACHE_KEY, entry)
    return entry
  }
  function accept(entry) {
    if (!entry || disposed) return
    state.releases = entry.releases.filter(release => !release.draft && (UPDATE_IS_TEST || !release.prerelease))
    state.page = 1; state.hasMore = entry.releases.length === 10
    state.target = state.releases.filter(release => updateAssetFor(release) && compareUpdateVersions(release.tag_name, BUILD_ID) === 1).sort((a, b) => -compareUpdateVersions(a.tag_name, b.tag_name))[0] || null
    if (!active() && state.phase !== 'error') phase(state.target ? 'available' : 'idle')
    else paint()
    report({ checkedAt: entry.checkedAt })
  }
  async function more() {
    if (disposed || loadingMore || !state.hasMore) return
    loadingMore = true
    try {
      const releases = await loadPage(state.page + 1)
      const seen = new Set(state.releases.map(release => release.id))
      state.releases = [...state.releases, ...releases.filter(release => !seen.has(release.id) && !release.draft && (UPDATE_IS_TEST || !release.prerelease))]
      state.page++; state.hasMore = releases.length === 10; paint()
    } catch { /* Existing notes remain usable; another scroll can retry. */ }
    finally { loadingMore = false }
  }
  async function download(asset) {
    const response = await github(asset.url, 'application/octet-stream')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('A bounded streaming download is not available in this Hermes version.')
    if (Number(response.headers?.get('content-length')) > UPDATE_MAX_BYTES) { await reader.cancel(); throw new Error('The update file is too large.') }
    let bytes
    {
      const chunks = []; let total = 0
      while (true) {
        const result = await reader.read()
        if (result.done) break
        total += result.value.length
        if (total > UPDATE_MAX_BYTES) { await reader.cancel(); throw new Error('The update file is too large.') }
        chunks.push(result.value); state.progress = Math.min(total / asset.size, 1); paint()
      }
      bytes = new Uint8Array(total); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    }
    if (bytes.length !== asset.size || bytes.length > UPDATE_MAX_BYTES) throw new Error('The update download is incomplete.')
    if (await updateSha256(bytes) !== asset.digest.slice(7)) throw new Error('The update file failed its integrity check.')
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  async function install() {
    if (operation || !state.target || !['available', 'error'].includes(state.phase)) return
    const target = state.target, asset = updateAssetFor(target)
    if (!asset) return
    const run = { touched: false, previous: '', path: '', cancelled: false }; operation = run
    try {
      phase('downloading'); state.progress = 0
      const source = await download(asset)
      const identity = updateSourceIdentity(source)
      if (identity.id !== ID || identity.version !== target.tag_name) throw new Error('The download is not the expected Codex Skin release.')
      state.progress = 1; paint(); await pause(40)
      if (disposed) return
      phase('applying')
      run.path = `${root}/${ID}/plugin.js`
      run.previous = await readSource(run.path)
      if (updateSourceIdentity(run.previous).version !== BUILD_ID) throw new Error('The local skin changed. Reload it before updating.')
      await native.writeTextFile(`${root}/${ID}/update-rollback.js`, run.previous)
      if (await readSource(`${root}/${ID}/update-rollback.js`) !== run.previous) throw new Error('The rollback copy could not be verified.')
      await native.writeTextFile(`${root}/${ID}/update-staged.js`, source)
      if (await readSource(`${root}/${ID}/update-staged.js`) !== source) throw new Error('The staged update could not be verified.')
      storage.set(UPDATE_PENDING_KEY, { repository: UPDATE_REPO, fromVersion: BUILD_ID, fromDigest: await updateSha256(new TextEncoder().encode(run.previous)), targetVersion: target.tag_name, digest: asset.digest.slice(7), startedAt: Date.now() })
      await pause(40)
      run.touched = true
      await native.writeTextFile(run.path, source)
      if (await readSource(run.path) !== source) throw new Error('The installed update could not be verified.')
      if (disposed) return
      phase('awaiting-reload')
      schedule(async () => {
        if (disposed || state.phase !== 'awaiting-reload') return
        try { await restorePrevious(storage.get(UPDATE_PENDING_KEY, null)); phase('error', 'Hermes did not reload the update. The previous file was restored.') }
        catch { phase('error', 'Hermes did not reload the update. Its recovery receipt and rollback copy were retained.') }
        operation = null
      }, 10000)
    } catch (error) {
      if (disposed) return
      let message = error.message || 'The update could not be installed.'
      if (run.touched && run.previous) {
        try { await restorePrevious(storage.get(UPDATE_PENDING_KEY, null)) }
        catch { message += ' Restoration could not be verified; the recovery receipt and rollback copy were retained.' }
      } else storage.remove(UPDATE_PENDING_KEY)
      operation = null; phase('error', message + '\nClick the update button to retry.')
    }
  }
  function mount(anchor) {
    const button = document.createElement('button'), panel = document.createElement('section'), bridge = document.createElement('div')
    button.className = 'codex-update-button'; button.type = 'button'; button.dataset.codexUpdate = 'true'
    panel.className = 'codex-update-panel'; panel.hidden = true; panel.tabIndex = 0; panel.setAttribute('aria-label', 'Codex Skin releases')
    bridge.className = 'codex-update-hover-bridge'; bridge.hidden = true; bridge.setAttribute('aria-hidden', 'true')
    anchor.dataset.codexUpdateAnchor = 'true'; anchor.appendChild(button); document.body.append(bridge, panel)
    let closedTimer, previousPhase, previousReleases, previousError, open = false
    const position = () => {
      if (!open) return
      const rect = button.getBoundingClientRect(), width = Math.min(320, innerWidth - 24)
      panel.style.width = `${width}px`; panel.style.maxHeight = `${Math.max(80, Math.min(320, rect.top - 24))}px`
      panel.style.left = `${Math.max(12, Math.min(rect.left - 32, innerWidth - width - 12))}px`
      panel.style.top = `${Math.max(12, rect.top - panel.getBoundingClientRect().height - 12)}px`
      const popup = panel.getBoundingClientRect()
      Object.assign(bridge.style, { left: `${Math.min(popup.left, rect.left)}px`, top: `${popup.bottom}px`, width: `${Math.max(popup.right, rect.right) - Math.min(popup.left, rect.left)}px`, height: `${Math.max(0, rect.top - popup.bottom + 1)}px` })
    }
    const close = () => { clearTimeout(closedTimer); open = false; panel.hidden = true; bridge.hidden = true; button.setAttribute('aria-expanded', 'false') }
    const show = () => { if (!['available', 'error'].includes(state.phase)) return; clearTimeout(closedTimer); open = true; panel.hidden = false; bridge.hidden = false; button.setAttribute('aria-expanded', 'true'); activateUpdateImages(panel); position() }
    const leave = event => { if ([panel, bridge, button].some(node => node.contains(event.relatedTarget))) return; closedTimer = setTimeout(() => { if (!panel.contains(document.activeElement)) close() }, 180) }
    button.addEventListener('pointerenter', show); button.addEventListener('pointerleave', leave); button.addEventListener('focus', show)
    panel.addEventListener('pointerenter', () => clearTimeout(closedTimer)); panel.addEventListener('pointerleave', leave)
    bridge.addEventListener('pointerenter', () => clearTimeout(closedTimer)); bridge.addEventListener('pointerleave', leave)
    const outside = event => { if (!anchor.contains(event.target) && !panel.contains(event.target) && !bridge.contains(event.target)) close() }
    const key = event => { if (event.key === 'Escape') close() }
    button.addEventListener('pointerdown', event => event.stopPropagation())
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); close(); void install() })
    panel.addEventListener('scroll', () => { if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 40) void more() })
    button.addEventListener('animationend', event => {
      if (event.target !== button) return
      if (event.animationName === 'codex-update-bounce' && state.phase === 'done') phase('vanishing')
      else if (event.animationName === 'codex-update-exit' && state.phase === 'vanishing') phase('idle')
    })
    window.addEventListener('resize', position); document.addEventListener('scroll', position, true); document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key)
    const panelResize = new ResizeObserver(position)
    panelResize.observe(panel)
    const view = { paint() {
      const visible = state.phase !== 'idle'
      anchor.style.display = visible ? 'inline-flex' : 'none'
      button.setAttribute('aria-label', state.phase === 'error' ? 'Retry Codex Skin update' : state.phase === 'done' ? 'Codex Skin is up to date' : 'Update Codex Skin')
      button.setAttribute('aria-busy', String(['downloading', 'applying', 'awaiting-reload'].includes(state.phase)))
      if (!['available', 'error'].includes(state.phase)) close()
      if (previousPhase !== state.phase) {
        previousPhase = state.phase; button.dataset.phase = state.phase
        const path = ['done', 'vanishing'].includes(state.phase) ? '<path class="codex-update-check" d="m5 13 4 4 10-10"/>' : ['applying', 'awaiting-reload'].includes(state.phase) ? '<path d="M19 8a8 8 0 0 0-13-2L3 9m0-5v5h5m-3 7a8 8 0 0 0 13 2l3-3m0 5v-5h-5"/>' : '<path d="M12 3v11m-4-4 4 4 4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>'
        // Only static, authored SVG reaches innerHTML; never release content.
        button.innerHTML = `<svg class="codex-update-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18"/></svg><svg class="codex-update-icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`
      }
      button.querySelector('circle').style.strokeDashoffset = String(state.phase === 'downloading' ? 113.1 * (1 - state.progress) : 113.1)
      if (previousReleases !== state.releases || previousError !== state.error) {
        previousReleases = state.releases; previousError = state.error; const scroll = panel.scrollTop; panel.replaceChildren()
        if (state.error) { const error = document.createElement('p'); error.className = 'codex-update-error'; error.textContent = state.error; panel.appendChild(error) }
        for (const release of state.releases) {
          const article = document.createElement('article'); article.className = 'codex-update-release'
          const header = document.createElement('header'), version = document.createElement('strong'); version.textContent = release.tag_name; header.appendChild(version)
          if (release.tag_name === state.target?.tag_name) { const badge = document.createElement('span'); badge.className = 'codex-update-tag'; badge.textContent = 'Available'; header.appendChild(badge) }
          const date = new Date(release.published_at)
          if (Number.isFinite(date.getTime())) { const time = document.createElement('time'); time.textContent = date.toLocaleDateString('en', { month: 'short', day: 'numeric' }); header.appendChild(time) }
          article.appendChild(header)
          if (release.name && release.name !== release.tag_name) { const title = document.createElement('h3'); title.textContent = release.name; article.appendChild(title) }
          appendUpdateNotes(article, release.body); panel.appendChild(article)
        }
        if (open) activateUpdateImages(panel)
        panel.scrollTop = scroll; position()
      }
    } }
    views.add(view); view.paint()
    return () => { views.delete(view); close(); panelResize.disconnect(); panel.remove(); bridge.remove(); button.remove(); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
  }
  return {
    capable, state, cache, initialize, firstPage, accept, install, mount,
    queryError(error) { report({ checkFailed: true, reason: error?.message || 'Network error' }) },
    dispose() { disposed = true; token = ''; abort.abort(); for (const timer of timers) clearTimeout(timer); timers.clear() }
  }
}

function CodexUpdateRuntime({ updater }) {
  const query = useQuery({
    queryKey: [ID, 'releases', UPDATE_REPO], queryFn: () => updater.firstPage(),
    enabled: updater.capable, staleTime: UPDATE_INTERVAL_MS, refetchInterval: UPDATE_INTERVAL_MS,
    refetchIntervalInBackground: true, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: false,
    initialData: updater.cache || undefined, initialDataUpdatedAt: updater.cache?.checkedAt || 0
  })
  useEffect(() => { void updater.initialize().catch(error => updater.queryError(error)) }, [updater])
  useEffect(() => { if (query.data) updater.accept(query.data) }, [query.data])
  useEffect(() => { if (query.error) updater.queryError(query.error) }, [query.error])
  return null
}
function CodexUpdateButton({ updater }) {
  const ref = useRef(null)
  useEffect(() => ref.current ? updater.mount(ref.current) : undefined, [])
  return jsx('span', { ref, style: { display: 'none' } })
}
