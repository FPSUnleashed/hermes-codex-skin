import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

// Optional exact shipping baseline for RED, without copying or editing it.
const bundlePath = process.env.SIDEBAR_MUTATION_BUNDLE || new URL('../codex-chat-look/plugin.js', import.meta.url)
const source = (await readFile(bundlePath, 'utf8')).replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.plugin = {')
const atom = value => ({ get: () => value, subscribe: () => () => {} })
const context = vm.createContext({ host: { state: { activeSessionId: atom('test'), profile: atom('default'), gateway: atom('open') }, onEvent: () => () => {} }, jsx: () => null, useEffect: () => {}, useRef: () => ({}), useQuery: () => ({}), AbortController, THEMES_AREA: 'themes', TITLEBAR_AREAS: { center: 'center' }, PALETTE_AREA: 'palette', window: { location: { hash: '#/test' } }, console })
vm.runInContext(source + '\nglobalThis.sidebar = {installT3SidebarActions,T3_SIDEBAR_ACTIONS_CSS}', context)
const { installT3SidebarActions, T3_SIDEBAR_ACTIONS_CSS } = context.sidebar
const markup = `<aside data-tour="sessions-sidebar" style="position:relative;width:260px"><div data-slot="sidebar-content"><div data-slot="sidebar-menu-item"><button data-sidebar="menu-button"><span data-tour="sidebar-nav-new-session">New session</span><kbd>⌘N</kbd></button></div><div class="search-row"><div><input placeholder="Find sessions"></div></div><div data-sessions-mode="flat">Sessions</div></div></aside>`
const instrument = `(() => {
  const nativeRAF=requestAnimationFrame.bind(window), rect=Element.prototype.getBoundingClientRect, computed=getComputedStyle, query=Document.prototype.querySelectorAll;
  window.counts={scans:0,rects:0,styles:0,frames:0};
  Document.prototype.querySelectorAll=function(s){if(s==='[data-tour="sessions-sidebar"]')counts.scans++;return query.call(this,s)};
  Element.prototype.getBoundingClientRect=function(){counts.rects++;return rect.call(this)};
  window.getComputedStyle=(...args)=>{counts.styles++;return computed(...args)};
  window.requestAnimationFrame=fn=>{counts.frames++;return nativeRAF(fn)};
  window.frames=n=>new Promise(resolve=>{const next=()=>{if(--n<=0)resolve();else nativeRAF(next)};nativeRAF(next)});
  window.reset=()=>{for(const key in counts)counts[key]=0};
  const RO=ResizeObserver;window.resizeOwners=new Set();
  window.ResizeObserver=class extends RO{observe(e){resizeOwners.add(e);super.observe(e)}unobserve(e){resizeOwners.delete(e);super.unobserve(e)}disconnect(){resizeOwners.clear();super.disconnect()}};
})()`
async function mount(b, late = false) {
  await b.call('Page.setDocumentContent', { frameId: (await b.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><html data-codex-chat-look="true"><head><style>body{margin:0}aside{height:300px}button,input{font:inherit}.search-row>div{display:flex}input{box-sizing:border-box;min-width:0}${T3_SIDEBAR_ACTIONS_CSS}</style></head><body><main id="transcript"><div class="aui-md">Reply</div></main><div id="owner">${late ? '' : markup}</div></body></html>` })
  await b.evaluate(instrument)
  await b.evaluate(`window.install=${installT3SidebarActions.toString()};window.stop=install();window.markup=${JSON.stringify(markup)}`)
  await b.evaluate('frames(6)')
}
const settle = b => b.evaluate('frames(6)')
const decorated = b => b.evaluate(`document.querySelectorAll('[data-codex-t3-new-session]').length`)
async function alignment(b) {
  return b.evaluate(`(()=>{const button=document.querySelector('[data-codex-t3-new-session]'),field=document.querySelector('[data-codex-t3-search-field]'),a=button.getBoundingClientRect(),r=field.getBoundingClientRect();return{gap:a.left-r.right,center:a.top+a.height/2-r.top-r.height/2,same:button===window.original,width:a.width}})()`)
}
function aligned(r) { assert.ok(Math.abs(r.gap-4)<.1, JSON.stringify(r)); assert.ok(Math.abs(r.center)<.1, JSON.stringify(r)); assert.equal(r.width,28) }

test('six separate transcript child mutations do not schedule, scan or measure sidebar', async t => {
  const b=await chromium();try {
    await mount(b)
    assert.equal(await decorated(b),1)
    await b.evaluate('reset()')
    for(let i=0;i<6;i++) {
      await b.evaluate(`document.querySelector('.aui-md').append(document.createElement('span'))`)
      await settle(b)
    }
    const counts=await b.evaluate('counts')
    t.diagnostic(JSON.stringify({sixTranscriptMutations:counts}))
    assert.deepEqual(counts,{scans:0,rects:0,styles:0,frames:0})
    await b.evaluate(`reset();document.querySelector('.aui-md').setAttribute('data-tour','unrelated');document.querySelector('.aui-md').setAttribute('placeholder','unrelated');document.querySelector('.aui-md').setAttribute('data-sessions-mode','unrelated')`)
    await settle(b)
    assert.deepEqual(await b.evaluate('counts'),{scans:0,rects:0,styles:0,frames:0})
  } finally { b.close() }
})

test('late mount, SearchField replacement, detached removal and wrapper replacement restore native nodes', async () => {
  const b=await chromium();try {
    await mount(b,true)
    await b.evaluate(`document.getElementById('owner').innerHTML=markup`);await settle(b)
    assert.equal(await decorated(b),1)
    await b.evaluate(`window.original=document.querySelector('[data-codex-t3-new-session]');window.oldField=document.querySelector('[data-codex-t3-search-field]');window.oldInput=oldField.querySelector('input');window.oldRow=oldField.parentElement;window.nativeCalls=[];original.addEventListener('click',()=>nativeCalls.push('new'));original.addEventListener('pointerdown',()=>nativeCalls.push('drag'));original.addEventListener('contextmenu',()=>nativeCalls.push('split'));const row=document.createElement('div');row.className='search-row';row.innerHTML='<div><input placeholder="Search replacement"></div>';oldRow.replaceWith(row)`)
    await settle(b)
    assert.equal(await b.evaluate(`oldInput.placeholder`),'Find sessions')
    assert.equal(await b.evaluate(`oldRow.hasAttribute('data-codex-t3-search-row')||oldField.hasAttribute('data-codex-t3-search-field')`),false)
    assert.equal(await b.evaluate(`document.querySelector('aside input').placeholder`),'Search')
    aligned(await alignment(b))
    assert.equal((await alignment(b)).same,true)
    await b.evaluate(`for(const type of ['click','pointerdown','contextmenu'])original.dispatchEvent(new Event(type,{bubbles:true}))`)
    assert.deepEqual(await b.evaluate('nativeCalls'),['new','drag','split'])
    await b.evaluate(`window.detached=document.querySelector('aside');detached.remove()`);await settle(b)
    assert.equal(await b.evaluate(`detached.querySelectorAll('[data-codex-t3-new-session],[data-codex-t3-search-row],[data-codex-t3-search-field],[data-codex-t3-new-item]').length`),0)
    assert.equal(await b.evaluate(`detached.querySelector('input').placeholder`),'Search replacement')
    assert.equal(await b.evaluate(`resizeOwners.size`),0)
    await b.evaluate(`document.getElementById('owner').append(detached)`);await settle(b)
    assert.equal(await decorated(b),1)
    await b.evaluate(`window.oldOwner=document.getElementById('owner');const owner=document.createElement('div');owner.id='owner';owner.innerHTML=markup;oldOwner.replaceWith(owner)`);await settle(b)
    assert.equal(await decorated(b),1)
    assert.equal(await b.evaluate(`oldOwner.querySelectorAll('[data-codex-t3-new-session]').length`),0)
    assert.equal(await b.evaluate('resizeOwners.size'),2)
  } finally { b.close() }
})

test('structural owner attributes, native placeholder, root skin, hide/reveal and resize remain live', async () => {
  const b=await chromium();try {
    await mount(b)
    await b.evaluate(`window.original=document.querySelector('[data-codex-t3-new-session]')`)
    aligned(await alignment(b))
    await b.evaluate(`document.querySelector('aside').removeAttribute('data-tour')`);await settle(b)
    assert.equal(await decorated(b),0,'previous observed owner loses its structural marker')
    await b.evaluate(`document.querySelector('aside').setAttribute('data-tour','sessions-sidebar')`);await settle(b)
    assert.equal(await decorated(b),1)
    await b.evaluate(`document.querySelector('aside input').placeholder='Sitzungen durchsuchen'`);await settle(b)
    assert.equal(await b.evaluate(`document.querySelector('aside input').placeholder`),'Search')
    await b.evaluate(`document.querySelector('aside').style.width='180px';document.querySelector('.search-row').style.paddingTop='30px'`);await settle(b)
    aligned(await alignment(b))
    await b.evaluate(`document.getElementById('owner').style.display='none'`);await settle(b)
    await b.evaluate(`document.getElementById('owner').style.display='';document.querySelector('aside').style.width='300px'`);await settle(b)
    aligned(await alignment(b))
    await b.evaluate(`reset();window.dispatchEvent(new Event('resize'))`);await settle(b)
    assert.ok((await b.evaluate('counts')).scans>0,'window resize still schedules discovery')
    await b.evaluate(`delete document.documentElement.dataset.codexChatLook`);await settle(b)
    assert.equal(await decorated(b),0)
    assert.equal(await b.evaluate(`document.querySelector('aside input').placeholder`),'Sitzungen durchsuchen')
    await b.evaluate(`document.documentElement.dataset.codexChatLook='true'`);await settle(b)
    aligned(await alignment(b));assert.equal((await alignment(b)).same,true)
    await b.evaluate(`window.dispatchEvent(new Event('resize'));stop();reset()`);await settle(b)
    assert.deepEqual(await b.evaluate('counts'),{scans:0,rects:0,styles:0,frames:0},'queued sync cancelled on dispose')
    assert.equal(await b.evaluate('resizeOwners.size'),0)
    assert.equal(await decorated(b),0)
    assert.equal(await b.evaluate(`document.querySelector('aside input').placeholder`),'Sitzungen durchsuchen')
  } finally { b.close() }
})
