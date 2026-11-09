import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'
import vm from 'node:vm'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

for (const target of ['source', 'shipping bundle']) {
  test(`fixed GeoIP suppression covers every event family (${target})`, async () => {
    let create
    if (target === 'source') {
      const source = await readFile(new URL('../src/analytics-runtime.js', import.meta.url), 'utf8')
      const context = vm.createContext({ AbortController })
      vm.runInContext(source + '\nglobalThis.create = createCodexSkinAnalytics', context)
      create = context.create
    } else {
      create = (await loadPluginInternals(['createCodexSkinAnalytics'])).createCodexSkinAnalytics
    }
    const saved = new Map(), sent = []
    const analytics = create({
      token: 'phc_OnlySyntheticPublicProjectToken1234', host: 'https://eu.i.posthog.com',
      version: 'v1.12.0', isTest: true,
      storage: { get: (key, fallback) => saved.get(key) ?? fallback, set: (key, value) => saved.set(key, value) },
      crypto: webcrypto, timers: globalThis,
      document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
      navigator: { platform: 'Linux x86_64' },
      request: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true } }
    })
    try {
      assert.equal(sent.length, 0)
      assert.equal(analytics.setConsent(true), true)
      assert.equal(analytics.used('settings'), true)
      assert.equal(analytics.failed('settle', 'action_failed'), true)
      const deadline = Date.now() + 3000
      while (sent.length < 3 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
      assert.deepEqual(sent.map(event => event.event), ['codex_skin_active', 'codex_skin_feature_used', 'codex_skin_feature_failed'])
      for (const event of sent) {
        assert.equal(event.properties.$geoip_disable, true, event.event + ' must reject server-side location enrichment')
        assert.equal(event.properties.$process_person_profile, false)
        assert.equal(event.properties.is_test, true)
        assert.equal(Object.hasOwn(event.properties, '$ip'), false)
      }
    } finally {
      analytics.setConsent(false)
      analytics.dispose()
    }
  })
}
