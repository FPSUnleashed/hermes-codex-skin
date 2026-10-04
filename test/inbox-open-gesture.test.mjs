import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { before, after } from 'node:test'
import vm from 'node:vm'
import { chromium } from './helpers/chromium.mjs'

// Execute the standalone global helper, not assertions about source spelling.
const source = await readFile(new URL('../src/inbox-open-gesture.js', import.meta.url), 'utf8')
const scope = { connectionId: 'source-A', profile: 'default' }
const row = (id = 'sid', extra = {}) => ({ id, title: 'Title', preview: 'Preview', connection_id: scope.connectionId, profile: scope.profile, ...extra })
const expected = (sessionId = 'sid', kind = 'picker', owner = scope) => ({ sessionId, scope: owner, kind })
let browser
before(async () => {
  browser = await chromium()
  await browser.evaluate(`${source}\nwindow.resolveGesture = resolveCodexInboxMenuOpenGesture`)
})
after(() => browser?.close())

async function fixture({ picker = [], palette = [], value = 'Title Preview sid', otherValue = 'Other Preview other' } = {}) {
  await browser.evaluate(`(() => {
    document.body.innerHTML = '<section data-slot="command" id="first" tabindex="0"><input data-slot="command-input" id="input"><div data-slot="command-item" data-selected="true" id="item" tabindex="-1"><span id="child">Title</span></div></section><section data-slot="command" id="second" tabindex="0"><input data-slot="command-input" id="other-input"><div data-slot="command-item" data-selected="true" id="other-item">Other</div></section><input id="outside">';
    document.getElementById('item').setAttribute('data-value', ${JSON.stringify(value)});
    document.getElementById('other-item').setAttribute('data-value', ${JSON.stringify(otherValue)});
    window.cache = { picker: ${JSON.stringify(picker)}, palette: ${JSON.stringify(palette)} };
    window.cacheReads = [];
    window.queryClient = { getQueryData(key) {
      cacheReads.push(key);
      if (key.length !== 2 || key[1] !== 'sessions') throw new Error('Unexpected cache key');
      if (key[0] === 'session-picker') return { sessions: cache.picker };
      if (key[0] === 'command-palette') return { sessions: cache.palette };
      throw new Error('Unexpected native cache');
    } };
    window.decode = (patch = {}, targetId = 'child') => resolveGesture({
      type: 'click', button: 0, isTrusted: true, target: document.getElementById(targetId), ...patch
    }, { document, queryClient });
  })()`)
}
async function decode(patch = {}, target = 'child') {
  return browser.evaluate(`decode(${JSON.stringify(patch)}, ${JSON.stringify(target)})`)
}

test('standalone global is inert without a live document/event/client', () => {
  const context = vm.createContext({})
  vm.runInContext(source, context)
  assert.equal(context.resolveCodexInboxMenuOpenGesture(), null)
  assert.equal(context.resolveCodexInboxMenuOpenGesture({ isTrusted: false }), null)
})

test('picker compares full native whitespace/title/preview signatures including both native fallbacks', async () => {
  for (const [session, value] of [
    [row('sid', { title: '  Title\n with  spaces  ', preview: ' \tPreview\n next  ' }), 'Title\n with  spaces Preview\n next sid'],
    [row('sid', { title: '  ', preview: '  Preview only \n' }), 'Preview only Preview only sid'],
    [row('sid', { title: '', preview: ' ' }), 'Untitled session  sid'],
    [row('sid', { title: null, preview: null }), 'Untitled session  sid'],
    [row('sid', { title: 'Title', preview: undefined }), 'Title  sid'],
    [row('sid', { title: 'Title\u0001 with separator', preview: 'Preview' }), 'Title\u0001 with separator Preview sid']
  ]) {
    await fixture({ picker: [session], value })
    assert.deepEqual(await decode(), expected())
    assert.deepEqual(await decode({ type: 'keydown', key: 'Enter' }, 'input'), expected())
  }
  await fixture({ picker: [row()] })
  for (const value of ['sid', 'Anything sid', 'Title Preview  sid', ' Title Preview sid', 'Title Preview sid ', 'Other Preview sid', 'Title Preview root']) {
    await browser.evaluate(`document.getElementById('item').setAttribute('data-value', ${JSON.stringify(value)})`)
    assert.equal(await decode(), null)
  }
  await fixture({ picker: [row('sid', { title: 12 })] })
  assert.equal(await decode(), null)
})

test('cache scope is exact, never normalized/coerced or inferred from window state', async () => {
  for (const fields of [
    { connection_id: '', profile: 'default' }, { connection_id: 'source-A', profile: '' },
    { connection_id: 123, profile: 'default' }, { connection_id: 'source-A', profile: 123 },
    { connection_id: undefined, profile: undefined }
  ]) {
    await fixture({ picker: [row('sid', fields)] })
    assert.deepEqual(await decode(), expected('sid', 'picker', null))
  }
  const exact = { connection_id: ' Source-A ', profile: ' Default ' }
  await fixture({ picker: [row('sid', exact)] })
  assert.deepEqual(await decode(), expected('sid', 'picker', { connectionId: exact.connection_id, profile: exact.profile }))
})

test('same-owner duplicates dedupe; clones across profiles/connections and caches are ambiguous', async () => {
  await fixture({ picker: [row(), row()], palette: [row('sid', { title: 'Different native title' })] })
  assert.deepEqual(await decode(), expected())
  for (const other of [
    row('sid', { connection_id: 'source-B', title: 'Different' }),
    row('sid', { profile: 'other', title: 'Different' }),
    row('sid', { connection_id: undefined, title: 'Different' }),
    row('tip', { _lineage_root_id: 'sid', profile: 'other' }),
    row('tip', { _lineage_ids: ['sid', 'tip'], connection_id: 'source-B' })
  ]) {
    await fixture({ picker: [row()], palette: [other] })
    assert.equal(await decode(), null, 'an exact title is not an owner disambiguator')
    await fixture({ palette: [row(), other], value: 'Title\u0001session-sid' })
    assert.equal(await decode(), null)
  }
  await fixture({ palette: [row(), row()], value: 'Title\u0001pinned-sid' })
  assert.deepEqual(await decode(), expected('sid', 'palette'))
})

test('palette exact session/pinned/goto prefixes exclude archived/settings/unrelated command menus', async () => {
  for (const prefix of ['session-', 'pinned-']) {
    // The native palette overlays live renames. Only the metadata id is decoded.
    await fixture({ palette: [row()], value: `Renamed title\u0001${prefix}sid` })
    assert.deepEqual(await decode(), expected('sid', 'palette'))
  }
  for (const value of ['Title\u0001archived-sid', 'Title\u0001settings-sid', 'Title\u0001sp-session-sid', 'Title\u0001sessions-sid', 'Title\u0001session-', 'Title\u0001pinned-missing', 'Title\u0001session-missing', 'Title\u0001goto-not-a-native-id', 'Title sid', 'settings sid']) {
    await fixture({ picker: [row()], palette: [row()], value })
    assert.equal(await decode(), null)
  }
  const id = '20261003_120000_abcdef'
  await fixture({ value: `Go to session\u0001goto-${id}` })
  assert.deepEqual(await decode(), expected(id, 'palette', null))
  await fixture({ palette: [row(id)], value: `Go to session\u0001goto-${id}` })
  assert.deepEqual(await decode(), expected(id, 'palette'))
  await fixture({ palette: [row()], value: 'Title with\u0001control\u0001session-sid' })
  assert.deepEqual(await decode(), expected('sid', 'palette'))
})

test('lineage cannot substitute native canonical row ids; goto can carry a verified root or segment unchanged', async () => {
  const root = '20261003_120000_abcdef', segment = '20261003_120001_abcdef', tip = '20261003_120002_abcdef'
  const lineage = row(tip, { _lineage_root_id: root, _lineage_ids: [root, segment, tip] })
  for (const id of [root, segment]) {
    await fixture({ picker: [lineage], palette: [lineage], value: `Title Preview ${id}` })
    assert.equal(await decode(), null)
    await fixture({ palette: [lineage], value: `Title\u0001session-${id}` })
    assert.equal(await decode(), null)
    await fixture({ palette: [lineage], value: `Title\u0001pinned-${id}` })
    assert.equal(await decode(), null)
    await fixture({ palette: [lineage], value: `Go to\u0001goto-${id}` })
    assert.deepEqual(await decode(), expected(id, 'palette'))
    await fixture({ palette: [lineage, row(id, { profile: 'other' })], value: `Go to\u0001goto-${id}` })
    assert.equal(await decode(), null)
    await fixture({ picker: [row(id), lineage], value: `Title Preview ${id}` })
    assert.deepEqual(await decode(), expected(id))
  }
  await fixture({ picker: [lineage], value: `Title Preview ${tip}` })
  assert.deepEqual(await decode(), expected(tip))
})

test('IME, prevented/synthetic gestures, modifiers, nonprimary clicks, other keys and disabled/closed items fail closed', async () => {
  await fixture({ picker: [row()] })
  for (const patch of [
    { isTrusted: false }, { isTrusted: 1 }, { defaultPrevented: true }, { isComposing: true }, { keyCode: 229 },
    { shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true },
    { button: 1 }, { button: 2 }, { type: 'pointerup' }, { type: 'keydown', key: 'Space' },
    { type: 'keydown', key: 'Enter', repeat: true }
  ]) assert.equal(await decode(patch), null)
  for (const [id, name, value] of [
    ['item', 'data-disabled', 'true'], ['item', 'aria-disabled', 'true'], ['item', 'disabled', ''],
    ['child', 'disabled', ''], ['first', 'inert', ''], ['first', 'hidden', ''],
    ['first', 'data-state', 'closed'], ['first', 'aria-hidden', 'true']
  ]) {
    await browser.evaluate(`document.getElementById('${id}').setAttribute('${name}', ${JSON.stringify(value)})`)
    assert.equal(await decode(), null, `${id}[${name}] click`)
    // A disabled clicked child is not a disabled CommandItem. Enter never
    // targets that child and still selects the enabled item itself.
    assert.deepEqual(await decode({ type: 'keydown', key: 'Enter' }, 'input'), id === 'child' ? expected() : null, `${id}[${name}] Enter`)
    await browser.evaluate(`document.getElementById('${id}').removeAttribute('${name}')`)
  }
  await browser.evaluate("document.getElementById('item').setAttribute('data-disabled', 'false')")
  assert.deepEqual(await decode(), expected())
  assert.equal(await browser.evaluate('decode({view: {}})'), null)
  assert.equal(await browser.evaluate('decode({target: window})'), null)
  await browser.evaluate('window.queryClient = { getQueryData() { throw new Error("Disposed cache") } }')
  assert.equal(await decode(), null)
})

test('Enter stays within its originating Command, requires one selection, and ignores disconnected/foreign documents', async () => {
  await fixture({ picker: [row(), row('other', { title: 'Other' })] })
  assert.deepEqual(await decode({ type: 'keydown', key: 'Enter' }, 'input'), expected())
  assert.deepEqual(await decode({ type: 'keydown', key: 'Enter' }, 'other-input'), expected('other'))
  assert.deepEqual(await decode({ type: 'keydown', key: 'Enter' }, 'first'), expected())
  assert.deepEqual(await decode({ type: 'keydown', key: 'Enter' }, 'other-item'), expected('other'))
  assert.equal(await decode({ type: 'keydown', key: 'Enter' }, 'outside'), null)
  await browser.evaluate(`document.getElementById('first').insertAdjacentHTML('beforeend', '<section data-slot="command"><div data-slot="command-item" data-selected="true" data-value="unrelated"></div></section><input id="unrelated-input">')`)
  assert.deepEqual(await decode({ type: 'keydown', key: 'Enter' }, 'input'), expected())
  assert.equal(await decode({ type: 'keydown', key: 'Enter' }, 'unrelated-input'), null)
  await browser.evaluate("document.getElementById('item').removeAttribute('data-selected')")
  assert.equal(await decode({ type: 'keydown', key: 'Enter' }, 'input'), null)
  await browser.evaluate("document.getElementById('item').setAttribute('data-selected','true');document.getElementById('first').append(document.getElementById('other-item'))")
  assert.equal(await decode({ type: 'keydown', key: 'Enter' }, 'input'), null)
  assert.equal(await browser.evaluate(`(() => { const target=document.getElementById('child'); document.getElementById('first').remove(); return decode({target}); })()`), null)
  assert.equal(await browser.evaluate(`decode({target: document.implementation.createHTMLDocument().body})`), null)
})

test('real trusted Chromium click/Enter decode without consuming native actions; synthetic dispatch and disposal remain inert', async () => {
  await fixture({ picker: [row(), row('other', { title: 'Other' })] })
  await browser.evaluate(`(() => {
    window.results=[]; window.nativeActions=0; window.domChanges=0;
    window.observe = event => results.push({ trusted:event.isTrusted, prevented:event.defaultPrevented, result:resolveGesture(event,{document,queryClient}) });
    document.addEventListener('click', observe, true); document.addEventListener('keydown', observe, true);
    window.nativeClick=() => nativeActions++;
    window.nativeEnter=event => { if(event.key==='Enter') nativeActions++ };
    document.getElementById('item').addEventListener('click',nativeClick);
    document.getElementById('first').addEventListener('keydown',nativeEnter);
    window.mutationObserver = new MutationObserver(records=>domChanges+=records.length);
    mutationObserver.observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true});
    window.beforeCache=JSON.stringify(cache);
    const r=document.getElementById('child').getBoundingClientRect(); window.point={x:r.x+r.width/2,y:r.y+r.height/2};
  })()`)
  const point = await browser.evaluate('point')
  await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
  await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
  await browser.evaluate("document.getElementById('input').focus()")
  await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  assert.deepEqual(await browser.evaluate('results'), [
    { trusted: true, prevented: false, result: expected() },
    { trusted: true, prevented: false, result: expected() }
  ])
  assert.equal(await browser.evaluate('nativeActions'), 2)
  assert.equal(await browser.evaluate('domChanges'), 0)
  assert.equal(await browser.evaluate('beforeCache === JSON.stringify(cache)'), true)
  assert.deepEqual(await browser.evaluate('cacheReads'), [
    ['session-picker', 'sessions'], ['command-palette', 'sessions'],
    ['session-picker', 'sessions'], ['command-palette', 'sessions']
  ])
  await browser.evaluate(`document.getElementById('child').dispatchEvent(new MouseEvent('click',{button:0,bubbles:true}));document.getElementById('input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
  assert.deepEqual(await browser.evaluate('results.slice(2)'), [
    { trusted: false, prevented: false, result: null }, { trusted: false, prevented: false, result: null }
  ])
  // Lifetime belongs to the caller. The helper owns no listener/timer to dispose.
  await browser.evaluate(`document.removeEventListener('click',observe,true);document.removeEventListener('keydown',observe,true);mutationObserver.disconnect()`)
  await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  assert.equal(await browser.evaluate('results.length'), 4)
  assert.equal(await browser.evaluate('nativeActions'), 5)
  await browser.evaluate("document.getElementById('item').removeEventListener('click',nativeClick);document.getElementById('first').removeEventListener('keydown',nativeEnter)")
})
