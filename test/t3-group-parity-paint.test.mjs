import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {chromium} from './helpers/chromium.mjs'
import {referenceFile, referenceRoot} from './helpers/reference-paths.mjs'

// Chromium only: no jsdom geometry, Web Animation substitutes or core writes.
// Exercise the complete shipping module/CSS against real native DisclosureRow,
// ScaffoldRow and ToolIcon. As in native-factual-v9, fixture tool wrappers and
// explicit captions are public inputs; the fixed timestamp has no clock store.
// The direct clarification card is the documented clarify-inline DOM seam,
// not an assertion that this fixture runs the entire native clarification UI.
const core = referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require = createRequire(`${core}/package.json`)
const nativeCSS = await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
const shipping = (await readFile(process.env.CODEX_CLEAN_TEST_PLUGIN || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '')
  .replace(/export default\s*\{/, 'globalThis.testPlugin = {')
const nativeBuild = await require('esbuild').build({
  stdin: {resolveDir: core, loader: 'tsx', contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {ScaffoldRow,SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS} from './apps/desktop/src/components/chat/scaffold-row';
    import {ToolIcon} from './apps/desktop/src/components/ui/tool-icon';
    const h=React.createElement;
    function Tool({id,failed=false,running=false}) {
      const [open,setOpen]=useState(false);
      const caption=failed?'Failed native unit':running?'Running '+id:'Read '+id;
      return h('div',{id,'data-slot':'tool-block','data-tool-row':'','data-conversation-scaffold':''},
        h(ScaffoldRow,{open,onToggle:()=>{window.nativeClicks[id]++;setOpen(!open)},
          trailing:h('span',{'data-slot':'timeline-timestamp'},'23:59')},
          h('span',{className:SCAFFOLD_GLYPH_CLASS},running?h('span',{role:'status'},h('i',{className:'glyph-spinner'})):h(ToolIcon,{name:'terminal'})),
          h('span',{className:SCAFFOLD_LABEL_CLASS},failed?h('span',{className:'text-destructive'},caption):caption)),
        open?h('pre',{id:id+'-output'},'Exact native output '+id):null);
    }
    function Fixture() {
      const c=window.config;
      const barrier=c.kind==='failure'?h(Tool,{id:'failed',failed:true}):
        h('div',{id:'clarify','data-slot':'clarify-inline'},h('button',{id:'answer',onClick:()=>window.nativeClicks.answer++},'Answer clarification'));
      return h('section',{'data-session-anchor':'workspace'},h('div',{id:'pair','data-slot':'aui_turn-pair'},
        h('div',{'data-role':'user','data-message-id':'user'},'Question'),
        h('div',{'data-role':'assistant','data-slot':'aui_assistant-message-root','data-message-id':'assistant','data-streaming':c.live?'true':undefined},
          h('div',{'data-slot':'aui_assistant-message-content'},h(Tool,{id:'A'}),h(Tool,{id:'B'}),barrier,h(Tool,{id:'C'}),h(Tool,{id:'D',running:c.live})))));
    }
    window.nativeClicks={A:0,B:0,C:0,D:0,failed:0,answer:0};
    window.nativeRoot=createRoot(document.getElementById('fixture'));
    flushSync(()=>window.nativeRoot.render(h(Fixture)));
  `},
  bundle: true, write: false, format: 'iife', jsx: 'automatic', outdir: 't3-group-parity-paint',
  tsconfigRaw: {compilerOptions: {baseUrl: core, paths: {'@/*': ['apps/desktop/src/*']}}},
  define: {'process.env.NODE_ENV': '"production"'},
})
const native = nativeBuild.outputFiles.find(file => file.path.endsWith('.js')).text

async function fixture(browser, config) {
  const {frameTree} = await browser.call('Page.getFrameTree')
  await browser.call('Page.setDocumentContent', {frameId: frameTree.frame.id, html: '<html data-codex-chat-look="true" data-codex-clean-transcript="on"><head></head><body><div id="fixture"></div></body></html>'})
  await browser.call('Emulation.setDeviceMetricsOverride', {width: 900, height: 900, deviceScaleFactor: 1, mobile: false})
  await browser.call('Emulation.setFocusEmulationEnabled', {enabled: true})
  await browser.evaluate(`window.config=${JSON.stringify(config)};${native}`)
  await browser.evaluate(`(() => {
    const host = {}, PALETTE_AREA = 'palette', THEMES_AREA = 'themes', TITLEBAR_AREAS = {center:'center'}, jsx = () => null, useEffect = () => {}, useRef = () => ({current:null}), useQuery = () => ({});
    ${shipping}
    const base=document.createElement('style');base.textContent=${JSON.stringify(nativeCSS)};document.head.append(base);
    const skin=document.createElement('style');skin.textContent=CSS;document.head.append(skin);
    const pair=document.getElementById('pair');
    const runtime=createToolSequenceRuntime(()=> 'public-fixture-scope',()=>0);
    const controls=[...pair.querySelectorAll('button')];
    const parents=controls.map(node=>node.parentNode);
    const units=[...pair.querySelectorAll('[data-tool-row]')];
    const unitParents=units.map(node=>node.parentNode);
    const painted=node=>{
      if(!node?.isConnected)return false;
      const rect=node.getBoundingClientRect();
      if(rect.width<=1||rect.height<=1)return false;
      for(let current=node;current;current=current.parentElement){
        const style=getComputedStyle(current);
        if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||style.clipPath!=='none')return false;
      }
      return true;
    };
    window.groupFixture={pair,runtime,painted,
      sync:()=>runtime.reconcile(pair,'public-fixture-scope'),
      headers:()=>[...pair.querySelectorAll('[data-codex-tool-sequence] button')],
      unchanged:()=>controls.every((node,index)=>node.isConnected&&node.parentNode===parents[index])&&units.every((node,index)=>node.isConnected&&node.parentNode===unitParents[index]),
      cleanup:()=>runtime.cleanup()};
    groupFixture.sync();
  })()`)
}

async function ax(browser, selector) {
  const {root} = await browser.call('DOM.getDocument')
  const {nodeId} = await browser.call('DOM.querySelector', {nodeId: root.nodeId, selector})
  assert.ok(nodeId, `Missing AX target: ${selector}`)
  const {node} = await browser.call('DOM.describeNode', {nodeId})
  const {nodes} = await browser.call('Accessibility.getPartialAXTree', {backendNodeId: node.backendNodeId, fetchRelatives: false})
  return {backend: node.backendNodeId, ignored: nodes[0].ignored, role: nodes[0].role?.value, name: nodes[0].name?.value}
}

async function clickNative(browser, selector) {
  const point = await browser.evaluate(`(() => {
    const node=document.querySelector(${JSON.stringify(selector)}),r=node.getBoundingClientRect();
    const x=r.x+r.width/2,y=r.y+r.height/2;
    return {x,y,painted:groupFixture.painted(node),hit:node.contains(document.elementFromPoint(x,y))};
  })()`)
  assert.equal(point.painted, true, `${selector} must be painted before click`)
  assert.equal(point.hit, true, `${selector} must own its native hit target`)
  await browser.call('Input.dispatchMouseEvent', {type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1})
  await browser.call('Input.dispatchMouseEvent', {type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1})
}

for (const live of [false, true]) for (const kind of ['clarification', 'failure']) {
  test(`direct ${kind} barrier paints independently compacted A,B / C,D; live=${live}`, async () => {
    const browser = await chromium()
    try {
      await fixture(browser, {kind, live})
      const selector = kind === 'failure' ? '#failed button' : '#answer'
      const barrierBefore = await ax(browser, selector)
      assert.equal(barrierBefore.ignored, false)
      assert.equal(barrierBefore.role, 'button')
      const closed = await browser.evaluate(`({
        labels:groupFixture.headers().map(node=>node.getAttribute('aria-label')),
        expanded:groupFixture.headers().map(node=>node.getAttribute('aria-expanded')),
        headerPaint:groupFixture.headers().map(groupFixture.painted),
        local:groupFixture.pair.hasAttribute('data-codex-tool-sequence-local-safe'),
        hiddenAB:['A','B'].every(id=>!groupFixture.painted(document.getElementById(id))),
        tail:document.getElementById('D').getAttribute('data-codex-tool-sequence-item'),
        current:document.getElementById('D').hasAttribute('data-codex-activity-native-current'),
        barrierMarked:document.querySelector(${JSON.stringify(selector)}).closest('[data-codex-tool-sequence-item]')!==null,
        barrierTabindex:document.querySelector(${JSON.stringify(selector)}).getAttribute('tabindex'),
        identity:groupFixture.unchanged()
      })`)
      assert.deepEqual(closed, {
        labels: ['Read A · Read B', live ? 'Running D' : 'Read C · Read D'],
        expanded: ['false', 'false'], headerPaint: [true, true], local: true, hiddenAB: true,
        tail: live ? 'live-collapsed' : 'collapsed', current: live, barrierMarked: false, barrierTabindex: null, identity: true,
      })
      assert.equal((await ax(browser, '#A button')).ignored, true)
      if (!live) assert.equal((await ax(browser, '#D button')).ignored, true)
      const {nodes} = await browser.call('Accessibility.getFullAXTree')
      const buttons = nodes.filter(node => !node.ignored && node.role?.value === 'button').map(node => node.name?.value)
      assert.ok(buttons.includes('Read A · Read B'))
      assert.ok(buttons.includes(live ? 'Running D' : 'Read C · Read D'))
      await clickNative(browser, selector)
      assert.equal(await browser.evaluate(`nativeClicks.${kind === 'failure' ? 'failed' : 'answer'}`), 1)
      // Native keyboard path remains live, without replacing the action node.
      assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.activeElement===document.querySelector(${JSON.stringify(selector)})`), true)
      await browser.call('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r'})
      await browser.call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter'})
      assert.equal(await browser.evaluate(`nativeClicks.${kind === 'failure' ? 'failed' : 'answer'}`), 2)
      await browser.evaluate('groupFixture.headers()[0].click()')
      assert.equal((await ax(browser, '#A button')).ignored, false)
      await clickNative(browser, '#A button')
      assert.deepEqual(await browser.evaluate(`({opened:!!document.getElementById('A-output'),clicks:nativeClicks.A,other:groupFixture.headers()[1].getAttribute('aria-expanded'),same:groupFixture.unchanged()})`), {opened: true, clicks: 1, other: 'false', same: true})
      await browser.evaluate('groupFixture.headers()[0].click();groupFixture.cleanup()')
      assert.deepEqual(await browser.evaluate(`({
        markers:!!groupFixture.pair.querySelector('[data-codex-tool-sequence],[data-codex-tool-sequence-item],[data-codex-activity-native-current]'),
        local:groupFixture.pair.hasAttribute('data-codex-tool-sequence-local-safe'),
        native:groupFixture.unchanged(),opened:!!document.getElementById('A-output'),
        painted:['A','B','C','D'].every(id=>groupFixture.painted(document.querySelector('#'+id+' button'))),
        tabindex:[...groupFixture.pair.querySelectorAll('button')].some(node=>node.getAttribute('tabindex')==='-1')
      })`), {markers: false, local: false, native: true, opened: true, painted: true, tabindex: false})
      assert.deepEqual(await ax(browser, selector), barrierBefore)
      assert.equal((await ax(browser, '#D button')).ignored, false)
    } finally { browser.close() }
  })
}

const insertions = [
  ['approval', '<div data-slot="tool-approval-inline"><button id="injected">Approve inserted action</button></div>'],
  ['clarification', '<div data-slot="clarify-inline"><button id="injected">Answer inserted action</button></div>'],
  ['setup', '<div data-slot="mcp-setup-inline"><button id="injected">Configure inserted action</button></div>'],
  ['failure', '<div class="text-destructive"><button id="injected">Inspect inserted failure</button></div>'],
  ['warning', '<div class="text-amber-700"><button id="injected">Inspect inserted warning</button></div>'],
  ['dark-warning', '<div class="dark:text-amber-300"><button id="injected">Inspect inserted warning</button></div>'],
  ['alert', '<div role="alert"><button id="injected">Inspect inserted alert</button></div>'],
  ['image', '<img id="injected" alt="Inserted native image" width="32" height="32" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22%3E%3Crect width=%2232%22 height=%2232%22 fill=%22red%22/%3E%3C/svg%3E">'],
  ['artifact', '<div data-slot="aui_artifact-card"><button id="injected">Open inserted artifact</button></div>'],
  ['generated-image', '<div data-slot="aui_generated-image"><button id="injected">Open inserted image</button></div>'],
  ['markdown-alert', '<div data-slot="aui_markdown-alert"><button id="injected">Inspect inserted markdown alert</button></div>'],
  ['zoomable-image', '<div data-slot="aui_zoomable-image"><button id="injected">Zoom inserted image</button></div>'],
]

for (const live of [false, true]) test(`stale local-safe never hides new nested controls/media before reconciliation; live=${live}`, async () => {
  const browser = await chromium()
  try {
    await fixture(browser, {kind: 'clarification', live})
    // B is settled/hidden. In a live tail C is clipped and D is the native
    // current row whose button/body would otherwise be suppressed. No plugin
    // observer is installed: AX, layout and hit testing occur with stale marks.
    for (const target of live ? ['B', 'C', 'D'] : ['B', 'D']) for (const [kind, html] of insertions) {
      await browser.evaluate(`(() => {
        const container=document.createElement('div');container.id='injection';container.innerHTML=${JSON.stringify(html)};
        document.getElementById(${JSON.stringify(target)}).append(container);
        window.injectedClicks=0;document.getElementById('injected').onclick=()=>window.injectedClicks++;
      })()`)
      const stale = await browser.evaluate(`({
        local:groupFixture.pair.hasAttribute('data-codex-tool-sequence-local-safe'),
        item:document.getElementById(${JSON.stringify(target)}).hasAttribute('data-codex-tool-sequence-item'),
        painted:groupFixture.painted(document.getElementById('injected')),
        nativePainted:groupFixture.painted(document.querySelector('#'+${JSON.stringify(target)}+' button')),
        same:groupFixture.unchanged()
      })`)
      assert.deepEqual(stale, {local: true, item: true, painted: true, nativePainted: true, same: true}, `${target}/${kind}: stale attributes must fail open in CSS`)
      const injectedAX = await ax(browser, '#injected')
      assert.equal(injectedAX.ignored, false, `${target}/${kind}: new content must enter AX before reconciliation`)
      if (kind !== 'image') {
        await clickNative(browser, '#injected')
        assert.equal(await browser.evaluate('injectedClicks'), 1, `${target}/${kind}: action must work before reconciliation`)
        assert.equal(await browser.evaluate(`document.getElementById('injected').focus();document.activeElement===document.getElementById('injected')`), true)
      }
      await browser.evaluate('groupFixture.sync()')
      assert.equal(await browser.evaluate(`groupFixture.painted(document.getElementById('injected'))`), true, `${target}/${kind}: reconciliation must not rehide protected content`)
      assert.equal((await ax(browser, '#injected')).ignored, false)
      await browser.evaluate(`document.getElementById('injection').remove();groupFixture.sync()`)
      assert.equal(await browser.evaluate(`groupFixture.headers().length===2&&!groupFixture.painted(document.getElementById('B'))`), true)
    }
    await browser.evaluate('groupFixture.cleanup()')
    assert.equal(await browser.evaluate(`groupFixture.unchanged()&&['A','B','C','D'].every(id=>groupFixture.painted(document.querySelector('#'+id+' button')))&&!groupFixture.pair.hasAttribute('data-codex-tool-sequence-local-safe')`), true)
  } finally { browser.close() }
})