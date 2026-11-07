import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { universalFixture } from './helpers/universal-fixture.mjs'

// The complete shipping registration runs first. The supported project injection
// is then used with a synthetic token and a fetch double. No PostHog traffic.
test('shipping own-button boundaries: verified saves, rejected saves, Snooze, restore, settle, opt-out and hot reload', () => universalFixture(async browser => {
  const receipt = await browser.evaluate(`(async()=>{
    const telemetry=[];window.fetch=async(url,options)=>{telemetry.push({url,options:{credentials:options.credentials,referrerPolicy:options.referrerPolicy},event:JSON.parse(options.body)});return {ok:true,status:200}};
    const analyticsEntries=[],analyticsDisposals=[];
    const analyticsCtx={storage,register:entry=>analyticsEntries.push(entry),onDispose:fn=>analyticsDisposals.push(fn)};
    const analytics=installCodexSkinAnalytics(analyticsCtx,{token:'phc_OnlySyntheticPublicProjectToken1234',host:'https://eu.i.posthog.com'});
    const command=analyticsEntries[0].data;
    const before={id:saved.get('usage-consent-v1'),requests:telemetry.length,detail:command.detail()};
    window.confirm=()=>false;const declined=command.run();
    const afterDecline={saved:saved.get('usage-consent-v1'),requests:telemetry.length};
    window.confirm=()=>true;const accepted=command.run();
    const drain=async()=>{await new Promise(r=>setTimeout(r,900));await flush()};
    await drain();
    const width=contributions.find(entry=>entry.id==='toggle-composer-width');width.data.run();await drain();
    failSave=true;width.data.run();await drain();failSave=false;
    const owner=routes[0],ownedRow={...metadata(owner),profile:owner.profile};runtime.admission.observe(owner,[ownedRow],{workingSessions:[ownedRow]});await refetch();
    const rowsBefore=rows().length;
    const snooze=rows()[0]?.querySelector('[data-codex-inbox-snooze]');snooze?.click();await flush();
    document.querySelector('[data-codex-inbox-snooze-popup] [role=menuitem]')?.click();await flush();await drain();
    const restore=document.querySelector('[data-codex-inbox-cancel-snooze]');restore?.click();await flush();await drain();
    const settle=rows()[0]?.querySelector('[data-codex-inbox-settle]');settle?.click();await flush();await drain();
    const pair=document.createElement('section');pair.dataset.slot='aui_turn-pair';pair.innerHTML='<div data-role="user"><div><div class="composer-human-message"><div class="sticky-human-clamp" style="--human-msg-full:220px"><div>PRIVATE_PROMPT_MUST_NOT_LEAVE</div></div></div></div></div><div data-role="assistant" data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content"><div data-slot="tool-block">PRIVATE_TOOL_MUST_NOT_LEAVE</div></div></div><div data-role="assistant" data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content"><div class="aui-md">PRIVATE_REPLY_MUST_NOT_LEAVE</div></div><div data-slot="aui_msg-actions"></div></div>';document.body.append(pair);
    decorateLongUserMessage(pair);pair.querySelector('[data-codex-user-expand]')?.click();reconcileTurnActivity(pair);pair.querySelector('[data-codex-turn-activity]')?.click();await drain();pair.remove();
    const inboxCommand=contributions.find(entry=>entry.id==='toggle-inbox');inboxCommand.data.run();inboxCommand.data.run();await drain();
    const usedBefore=telemetry.filter(t=>t.event.event==='codex_skin_feature_used').length;
    // Exercise a new, admitted row rather than a retained settled callback.
    runtime.model.unsettle({connectionId:'A',profile:'default'},'same');await flush();
    failSave=true;
    rows()[0]?.querySelector('[data-codex-inbox-settle]')?.click();await flush();await drain();failSave=false;
    const usedAfter=telemetry.filter(t=>t.event.event==='codex_skin_feature_used').length;
    const declinedAfterActive=(()=>{window.confirm=()=>false;return null})();
    // Opt-out requires no confirmation, never emits a consent event.
    const optedOut=command.run();const requestsAtOptOut=telemetry.length;
    width.data.run();await drain();
    const localAfterOptOut=saved.get('usage-consent-v1');
    const offRequests=telemetry.length;
    analyticsDisposals.reverse().forEach(fn=>fn());const oldEnabled=analytics.isEnabled();
    return {before,declined,afterDecline,accepted,rowsBefore,telemetry,usedBefore,usedAfter,optedOut,requestsAtOptOut,offRequests,localAfterOptOut,oldEnabled,errors};
  })()`)
  assert.deepEqual(receipt.before, { requests: 0, detail: 'Off' })
  assert.equal(receipt.declined, false)
  assert.deepEqual(receipt.afterDecline, { requests: 0 })
  assert.equal(receipt.accepted, true); assert.ok(receipt.rowsBefore > 0)
  const events = receipt.telemetry.map(row => row.event)
  assert.ok(events.some(row => row.event === 'codex_skin_active'))
  assert.ok(events.some(row => row.event === 'codex_skin_feature_used' && row.properties.feature === 'settings'))
  assert.ok(events.some(row => row.event === 'codex_skin_feature_failed' && row.properties.feature === 'settings' && row.properties.failure_category === 'storage_readback'))
  for (const feature of ['inbox', 'snooze', 'restore', 'settle', 'complete_messages', 'collapse']) assert.ok(events.some(row => row.event === 'codex_skin_feature_used' && row.properties.feature === feature), feature)
  assert.ok(events.some(row => row.event === 'codex_skin_feature_failed' && row.properties.feature === 'settle' && row.properties.failure_category === 'storage_write'))
  assert.equal(JSON.stringify(receipt.telemetry).includes('PRIVATE_'), false)
  assert.equal(receipt.usedAfter, receipt.usedBefore, 'failed save is not feature success')
  assert.equal(receipt.optedOut, true); assert.equal(receipt.offRequests, receipt.requestsAtOptOut)
  assert.deepEqual(receipt.localAfterOptOut, { v: 1, enabled: false }); assert.equal(receipt.oldEnabled, false)
  for (const row of receipt.telemetry) {
    assert.equal(row.url, 'https://eu.i.posthog.com/i/v0/e/')
    const allowed = new Set(['plugin_version', 'os_family', 'is_test', '$process_person_profile', '$geoip_disable', 'feature', 'failure_category'])
    assert.ok(Object.keys(row.event.properties).every(key => allowed.has(key)))
    assert.equal(row.event.properties.$process_person_profile, false)
    assert.equal(row.event.properties.$geoip_disable, true)
    assert.equal(row.options.credentials, 'omit'); assert.equal(row.options.referrerPolicy, 'no-referrer')
    assert.match(row.event.distinct_id, /^cs_[a-f0-9]{32}$/)
  }
  assert.deepEqual(receipt.errors, [])
}))

test('real Chromium fetch/CORS reaches a labelled loopback receiver without cookies or referrer', async () => {
  const requests = []
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    if (req.method === 'OPTIONS') { requests.push({ method: req.method }); res.writeHead(204).end(); return }
    let body = ''; for await (const chunk of req) body += chunk
    requests.push({ method: req.method, contentType: req.headers['content-type'], cookie: req.headers.cookie, referer: req.headers.referer, userAgentPresent: !!req.headers['user-agent'], body: JSON.parse(body) })
    res.setHeader('Content-Type', 'application/json'); res.end('{"status":1}')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await universalFixture(async browser => {
      const receipt = await browser.evaluate(`(async()=>{
        document.cookie='PRIVATE_TEST_COOKIE=do_not_send';const records=new Map(),officialTargets=[];
        const a=createCodexSkinAnalytics({storage:{get:(key,fallback)=>records.get(key)??fallback,set:(key,value)=>records.set(key,structuredClone(value))},token:'phc_OnlySyntheticPublicProjectToken1234',host:'https://eu.i.posthog.com',version:'v1.12.0',isTest:true,
          request:(url,options)=>{officialTargets.push(url);return fetch('http://127.0.0.1:${server.address().port}/capture-double',options)}});
        const before=officialTargets.length;const accepted=a.setConsent(true);await new Promise(resolve=>setTimeout(resolve,700));a.dispose();return{before,accepted,officialTargets};
      })()`)
      assert.equal(receipt.before, 0); assert.equal(receipt.accepted, true)
      assert.deepEqual(receipt.officialTargets, ['https://eu.i.posthog.com/i/v0/e/'])
    })
    const posts = requests.filter(request => request.method === 'POST')
    assert.equal(posts.length, 1); assert.ok(requests.some(request => request.method === 'OPTIONS'))
    assert.equal(posts[0].contentType, 'application/json'); assert.equal(posts[0].cookie, undefined); assert.equal(posts[0].referer, undefined)
    assert.equal(posts[0].userAgentPresent, true, 'browser transport metadata still exists and is disclosed')
    assert.equal(posts[0].body.event, 'codex_skin_active'); assert.equal(posts[0].body.properties.is_test, true)
    assert.equal(posts[0].body.properties.$process_person_profile, false)
    assert.equal(posts[0].body.properties.$geoip_disable, true)
    assert.equal(JSON.stringify(posts).includes('PRIVATE_TEST_COOKIE'), false)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
