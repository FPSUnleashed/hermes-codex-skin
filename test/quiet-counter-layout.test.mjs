import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {chromium} from './helpers/chromium.mjs'
import {referenceFile} from './helpers/reference-paths.mjs'

// Native-shaped status leaves from thread/status.tsx, not a full Hermes window.
// Exercise the shipping CSS before any observer/reconciliation, including mounts.
const nativeCSS = await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
const shipping = (await readFile(process.env.CODEX_CLEAN_TEST_PLUGIN || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '')
  .replace(/export default\s*\{/, 'globalThis.testPlugin = {')

async function fixture(browser, width = 900) {
  const {frameTree} = await browser.call('Page.getFrameTree')
  await browser.call('Emulation.setDeviceMetricsOverride', {width, height: 700, deviceScaleFactor: 1, mobile: false})
  await browser.call('Page.setDocumentContent', {frameId: frameTree.frame.id, html: `
    <html data-codex-chat-look="true"><head></head><body>
      <div id="viewport" style="height:320px;overflow:auto">
        <div style="height:800px"></div>
        <section data-slot="aui_thread-content">
          <div id="pair" data-slot="aui_turn-pair" data-codex-activity-phase="working">
            <div data-role="user" data-message-id="user">Question</div>
            <button data-codex-turn-activity disabled><span>working 9s</span></button>
            <div data-slot="aui_response-group">
              <div data-role="assistant" data-slot="aui_assistant-message-root" data-message-id="assistant" data-streaming="true">
                <div id="content" data-slot="aui_assistant-message-content">
                  <div id="tool" data-slot="tool-block">Read reference</div>
                </div>
              </div>
            </div>
          </div>
          <div id="sentinel" style="height:20px">End</div>
          <div id="alerts" role="alert">Existing error</div>
          <div id="approval" data-slot="tool-approval-inline"><button>Approve</button></div>
          <div id="clarify" data-slot="clarify-inline"><button>Answer</button></div>
          <span id="duration" data-slot="aui_turn-duration">⏱ 32s</span>
        </section>
      </div>
    </body></html>`})
  await browser.evaluate(`(() => {
    const host = {}, PALETTE_AREA = 'palette', THEMES_AREA = 'themes', TITLEBAR_AREAS = {center:'center'}, jsx = () => null, useEffect = () => {}, useRef = () => ({current:null}), useQuery = () => ({});
    ${shipping}
    const base = document.createElement('style'); base.textContent = ${JSON.stringify(nativeCSS)}; document.head.append(base);
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    const viewport = document.getElementById('viewport'); viewport.scrollTop = viewport.scrollHeight;
    let mountedRow = null;
    window.statusFixture = {
      mount: {replaceChildren(...nodes) {mountedRow?.remove(); mountedRow = nodes[0] || null; if (mountedRow) document.getElementById('content').append(mountedRow)}},
      row(slot, hint = '', active = true) {
        const row = document.createElement('div');
        row.setAttribute('data-slot', slot); row.setAttribute('role', 'status'); row.setAttribute('aria-live', 'polite');
        row.setAttribute('aria-label', hint || (slot === 'aui_response-loading' ? 'Loading response' : 'Hermes is working'));
        if (slot === 'aui_turn-activity') row.dataset.state = active ? 'active' : 'idle';
        row.className = active ? 'flex min-w-0 max-w-full items-center gap-1.5 self-start' : 'sr-only';
        if (active) {
          row.innerHTML = '<span class="dither inline-block size-3" aria-hidden="true"></span>' +
            (hint ? '<span class="shimmer min-w-0 flex-1 truncate">' + hint + '</span>' : '') +
            '<span aria-hidden="true" class="shrink-0 text-[0.56rem] leading-none">12s</span>';
        }
        return row;
      },
      visible(node) {
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        return rect.height > 1 && rect.width > 1 && style.display !== 'none' && style.visibility !== 'hidden' && style.clipPath === 'none';
      },
      geometry() {
        return {
          height: viewport.scrollHeight, scroll: viewport.scrollTop,
          sentinel: document.getElementById('sentinel').getBoundingClientRect().top,
          tool: document.getElementById('tool').getBoundingClientRect().top,
          working: document.querySelector('[data-codex-turn-activity]').getBoundingClientRect().height
        };
      },
      frame: () => new Promise(resolve => requestAnimationFrame(() => resolve()))
    };
  })()`)
}

for (const width of [390, 900]) {
  test(`quiet/tool handoffs add no transcript height at ${width}px`, async () => {
    const browser = await chromium()
    try {
      await fixture(browser, width)
      const result = await browser.evaluate(`(async () => {
        const f = statusFixture, baseline = f.geometry(), samples = [];
        for (const slot of ['aui_turn-activity', 'aui_response-loading']) {
          for (let cycle = 0; cycle < 4; cycle++) {
            const row = f.row(slot); f.mount.replaceChildren(row);
            await f.frame(); samples.push({geometry:f.geometry(), visible:f.visible(row), role:row.getAttribute('role'), display:getComputedStyle(row).display});
            row.lastElementChild.textContent = (30 + cycle) + 's';
            document.querySelector('[data-codex-turn-activity] span').textContent = 'working ' + (30 + cycle) + 's';
            await f.frame(); samples.push({geometry:f.geometry(), visible:f.visible(row), role:row.getAttribute('role'), display:getComputedStyle(row).display});
            f.mount.replaceChildren(); await f.frame(); samples.push({geometry:f.geometry()});
          }
        }
        return {baseline,samples,working:document.querySelector('[data-codex-turn-activity] span').textContent};
      })()`)
      for (const sample of result.samples) {
        assert.deepEqual(sample.geometry, result.baseline, 'counter must not alter height, viewport anchoring or tool/header position')
        if ('visible' in sample) {
          assert.equal(sample.visible, false, 'ordinary duplicate must not paint')
          assert.equal(sample.role, 'status', 'preserve native live-region node')
          assert.notEqual(sample.display, 'none', 'retain accessibility rather than deleting the native status')
        }
      }
      assert.equal(result.working, 'working 33s')
    } finally { browser.close() }
  })
}

test('named waits, alerts, initial wait, other turns and skin disable remain native', async () => {
  const browser = await chromium()
  try {
    await fixture(browser)
    const result = await browser.evaluate(`(async () => {
      const f = statusFixture, named = [];
      for (const slot of ['aui_turn-activity', 'aui_response-loading']) {
        for (const hint of ['Summarizing thread', 'Provider waiting', 'Reading reference', 'Loading local model']) {
          const row = f.row(slot,hint); f.mount.replaceChildren(row); await f.frame(); named.push(f.visible(row));
        }
      }
      const row = f.row('aui_turn-activity'); f.mount.replaceChildren(row); await f.frame();
      const hidden = !f.visible(row), same = row;
      document.getElementById('pair').removeAttribute('data-codex-activity-phase'); await f.frame();
      const noWorkingOwnerVisible = f.visible(row);
      document.getElementById('pair').setAttribute('data-codex-activity-phase','working');
      const header = document.querySelector('[data-codex-turn-activity]'); header.remove(); await f.frame();
      const initialWaitVisible = f.visible(row);
      document.getElementById('pair').prepend(header);
      const unrelated = document.createElement('div'); unrelated.setAttribute('data-slot','aui_turn-pair');
      const other = f.row('aui_turn-activity'); unrelated.append(other); document.querySelector('section').append(unrelated); await f.frame();
      const otherTurnVisible = f.visible(other);
      document.documentElement.removeAttribute('data-codex-chat-look'); await f.frame();
      return {named,hidden,noWorkingOwnerVisible,initialWaitVisible,otherTurnVisible,
        disabledVisible:f.visible(row),sameNode:row===same&&row.isConnected,
        protected:['alerts','approval','clarify','duration'].map(id=>f.visible(document.getElementById(id)))};
    })()`)
    assert.deepEqual(result, {named:Array(8).fill(true),hidden:true,noWorkingOwnerVisible:true,initialWaitVisible:true,otherTurnVisible:true,disabledVisible:true,sameNode:true,protected:Array(4).fill(true)})
  } finally { browser.close() }
})
