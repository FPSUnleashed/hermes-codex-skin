import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { loadPluginInternals } from './helpers/load-plugin.mjs';
import { chromium } from './helpers/chromium.mjs';

// Emitted by the installed native bundled adapters, not invented source aliases.
const platforms = ['line', 'teams', 'ntfy', 'simplex', 'irc', 'a2a', 'raft', 'buzz', 'photon', 'google_chat'];
const scope = { connectionId: 'platform-owner', profile: 'default' };
const source = (await Promise.all(['inbox-row-ui.js', 'inbox-runtime.js'].map(name => readFile(new URL('../src/' + name, import.meta.url), 'utf8')))).join('\n');
const context = vm.createContext({ Date, console });
vm.runInContext(source + '\nglobalThis.factories={createCodexInboxModel,createCodexInboxAdmission}', context);

function storage() {
  const saved = new Map();
  return { get: key => structuredClone(saved.get(key)), set: (key, value) => saved.set(key, structuredClone(value)) };
}

test('native bundled platforms require work, preserve attention and cannot bypass cron provenance', () => {
  for (const platform of platforms) {
    const store = storage(), model = context.factories.createCodexInboxModel(store);
    const admission = context.factories.createCodexInboxAdmission(store, model);
    const row = { id: platform, source: platform, created_source: platform, ...scope, message_count: 2 };
    admission.observe(scope, [row]);
    assert.equal(admission.isEligible(scope, row), false, platform + ' metadata alone');
    model.settle(scope, row, { manual: true });
    model.snooze(scope, row, Date.now() + 60000);
    admission.observe(scope, [row], { workingSessions: [row] });
    assert.equal(admission.isEligible(scope, row), true, platform + ' verified work');
    assert.equal(model.isManualSettled(scope, row), true, platform + ' preserves Settle');
    assert.equal(model.isSnoozed(scope, row), true, platform + ' preserves Snooze');
    for (const provenance of [{ source: 'cron', created_source: platform }, { source: platform, created_source: 'cron' }]) {
      const cron = { ...row, id: platform + '-cron', ...provenance };
      admission.observe(scope, [cron], { workingSessions: [cron] });
      assert.equal(admission.isEligible(scope, cron), false, platform + ' cannot override cron');
    }
  }
});

test('shipping query verifies platform runtime ownership and browser renders work but never cron or unknown', async () => {
  const atom = value => ({ get: () => value, subscribe: () => () => {} });
  const metadata = [...platforms, 'desktop', 'cron', 'unknown', 'unrecognized-source'].map(platform => ({
    id: 'stored-' + platform, profile: scope.profile, source: platform, created_source: platform,
    hidden: false, archived: false, message_count: 2
  }));
  const live = metadata.map(row => ({ session_id: 'runtime-' + row.source, session_key: row.id,
    profile: scope.profile, connection_id: scope.connectionId, status: 'working' }));
  const host = { state: { connectionId: atom(scope.connectionId), profile: atom(scope.profile) },
    profileRoutes: async () => [{ ...scope, targetProfile: scope.profile }],
    requestProfile: async (_route, method) => {
      assert.equal(method, 'session.active_list');
      return { sessions: live };
    }
  };
  const f = await loadPluginInternals(['readCodexInboxPage', 'createCodexInboxModel', 'createCodexInboxAdmission'], {
    host, URLSearchParams, window: { hermesDesktop: {
      api: async () => ({ total: metadata.length, sessions: metadata }),
      getAgentRoster: async () => ({ sources: [{ connectionId: scope.connectionId, reachable: true }], agents: [scope] })
    } }
  });
  const store = storage(), model = f.createCodexInboxModel(store), admission = f.createCodexInboxAdmission(store, model);
  const page = await f.readCodexInboxPage(scope, 1, undefined, { model, admission });
  assert.equal(page.liveStatusKnown, true);
  assert.equal(page.liveSessions.length, live.length);
  for (const row of page.liveSessions) {
    assert.equal(row.connection_id, scope.connectionId);
    assert.equal(row.profile, scope.profile);
    assert.ok(metadata.some(item => item.id === row.session_key));
  }
  const bundled = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8');
  const browser = await chromium();
  try {
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id,
      html: '<!doctype html><html data-codex-chat-look="true"><aside data-sessions-mode="sessions"></aside></html>' });
    await browser.evaluate('window.host={state:{},onEvent:()=>()=>{}};window.jsx=()=>null;window.useEffect=()=>{};window.useRef=()=>({current:null});window.useQuery=()=>({});window.THEMES_AREA="themes";window.TITLEBAR_AREAS={};window.PALETTE_AREA="palette";');
    await browser.evaluate(bundled.replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {'));
    await browser.evaluate(`(() => {
      const saved=new Map();const storage={get:k=>structuredClone(saved.get(k)),set:(k,v)=>saved.set(k,structuredClone(v))};
      window.runtime=installCodexInboxRuntime({storage,host,window});
      runtime.update(${JSON.stringify({ ...page, scope, liveStatusAt: Date.now(), busyOwnerKnown: false })});
      return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    })()`);
    const shown = await browser.evaluate('Array.from(document.querySelectorAll("[data-codex-inbox-row]")).map(row=>row.dataset.codexInboxRow).sort()');
    assert.deepEqual(shown, [...platforms, 'desktop'].map(platform => 'stored-' + platform).sort());
  } finally {
    await browser.evaluate('runtime?.dispose()').catch(() => {});
    browser.close();
  }
});
