import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Tooltip is asChild: eight DIRECT buttons, with the copy button inside the address div.
const direct = ['back', 'forward', 'reload', 'comment', 'external', 'console', 'devtools', 'close']
const button = (pane, name) => `<button id="${pane}-${name}" data-slot="tooltip-trigger" data-size="icon-xs" data-variant="ghost" class="inline-flex items-center justify-center shrink-0 rounded-sm" aria-label="${name}" ${['back', 'forward'].includes(name) ? 'disabled' : ''}><span class="codicon" style="font-size:13px">${{ back: '←', forward: '→', reload: '↻', copy: '⧉', comment: '♧', external: '↗', console: '>_', devtools: '⚙', close: '×' }[name]}</span></button>`
const pane = id => `<div id="${id}" class="pane" data-tree-group="${id}"><div data-panel-header><div data-zone-tabstrip="${id}"><div role="tablist"><div data-slot="pane-tab" data-tree-tab="${id}" data-active="true" role="tab"><div class="pane-tab-content">Browser ${id}</div></div></div></div></div><aside data-preview-browser="${id}"><div><div id="${id}-toolbar" class="toolbar">${direct.slice(0, 3).map(name => button(id, name)).join('')}<div class="address"><input id="${id}-url" data-slot="input" class="desktop-input-chrome pr-7" inputmode="url" aria-label="Address ${id}" value="about:blank">${button(id, 'copy')}</div>${direct.slice(3).map(name => button(id, name)).join('')}</div><div class="content"><iframe srcdoc="<body style='background:white;color:rgb(12,34,56)'><input style='border-radius:3px;background:rgb(211,222,233)' value='Guest input'>Guest content</body>"></iframe></div></div></aside></div>`
const fixture = (native, skin) => `<!doctype html><html data-hermes-theme="hermes" data-hermes-mode="light"><head><style>${native}
/* Native preflight defaults keep this seam fixture self-contained. */
*{box-sizing:border-box}button{border:0;padding:0}input{padding:0}
:root { --theme-foreground:#36342c; --theme-background-seed:#fcf7e5; --theme-sidebar-seed:#f4efda; --theme-card-seed:#fffaf0; --theme-elevated-seed:#fffaf0; --theme-bubble-seed:#ebe6d4; --theme-neutral-chrome:#f3f3f3; --theme-mix-chrome:100%; --titlebar-height:0px; --ui-editor-surface-background:#fcf7e5; --ui-chat-surface-background:#fcf7e5; --ui-sidebar-surface-background:#f4efda; --ui-control-background:#f3f1e8; --ui-row-active-background:#e8e3d1; --ui-row-hover-background:#e8e3d1; --ui-stroke-secondary:#c4bfaf; --ui-stroke-tertiary:#dfdacb; --ui-text-primary:#36342c; --ui-text-secondary:#696655; --ui-text-tertiary:#8b8776; --dt-card:#f3f1e8; --dt-input-bg:100%; --dt-input-border:40%; --dt-composer-ring:#c4bfaf; --dt-input-inset:none; }
body{margin:0}.pane{width:866px;height:440px}#b{width:520px;margin:16px 0 0 42px}[data-panel-header]{display:flex;position:relative;height:34px}[data-zone-tabstrip]{display:flex;flex:1;min-width:0;height:28px}[role=tablist]{display:flex;flex:1;min-width:0}[data-slot=pane-tab]{position:relative;display:flex;align-items:center;flex-shrink:0;height:100%;width:122px;background:var(--tab-bg)}.pane-tab-content{display:flex;align-items:center;min-width:0;height:100%;padding:0 8px;gap:6px}aside,aside>div{display:flex;flex-direction:column;min-height:0;flex:1}.toolbar{display:flex;align-items:center;flex-shrink:0;gap:4px;padding:4px 6px;border-bottom:1px solid var(--ui-stroke-secondary)}.toolbar>button{width:20px;height:20px;background:transparent}.address{position:relative;flex:1;min-width:0}.address>input{width:100%;min-width:0;height:24px;border:1px solid var(--ui-stroke-secondary);border-radius:2.5px}.address>button{position:absolute;right:4px;top:50%;transform:translateY(-50%);background:transparent}.content{position:relative;flex:1;min-height:0}iframe{width:100%;height:100%;border:0}#outside{border-radius:2.5px;width:150px;height:24px;background:rgb(211,222,233)}
${skin}</style></head><body>${pane('a')}${pane('b')}<div id="outside-bar"><button id="outside-button" data-slot="tooltip-trigger">Outside action</button><input id="outside" data-slot="input" value="Outside browser"></div><script>window.counts={};window.navigated='';window.nativeNodes=[...document.querySelectorAll('.toolbar button')];document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>counts[b.id]=(counts[b.id]||0)+1));document.querySelectorAll('.address>input').forEach(input=>input.addEventListener('keydown',e=>{if(e.key==='Enter')window.navigated=input.value;if(e.key==='Escape')input.value='about:blank'}));</script></body></html>`

// The shared helper currently has no environment override. Reuse its loader unchanged,
// except its plugin URL, in an in-memory module for the explicitly requested RED run.
async function shippingCSS() {
  let loader = loadPluginInternals
  if (process.env.CODEX_SKIN_PLUGIN_JS) {
    const helper = await readFile(new URL('./helpers/load-plugin.mjs', import.meta.url), 'utf8')
    const source = helper.replace("new URL('../../codex-chat-look/plugin.js', import.meta.url)", `new URL(${JSON.stringify(pathToFileURL(resolve(process.env.CODEX_SKIN_PLUGIN_JS)).href)})`)
    loader = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).loadPluginInternals
  }
  const { CSS, BROWSER_PALETTE_CSS } = await loader(['CSS', 'BROWSER_PALETTE_CSS'])
  return CSS + BROWSER_PALETTE_CSS
}

const measurement = `(() => {
  const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  const paint = (el,pseudo) => {const s=getComputedStyle(el,pseudo);return {content:s.content,background:s.backgroundColor,shadow:s.boxShadow,radius:s.borderRadius,pointerEvents:s.pointerEvents,width:s.width,height:s.height}};
  return ['a','b'].map(id=>{const bar=document.getElementById(id+'-toolbar'),url=document.getElementById(id+'-url');return {id,bar:rect(bar),address:{...paint(url),...rect(url)},nav:paint(bar,'::before'),group:paint(bar,'::after'),separator:paint(document.getElementById(id+'-reload'),'::before'),direct:[...bar.children].map(el=>el.tagName),buttons:[...bar.querySelectorAll('button')].map(b=>{const r=rect(b),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:b.id,...r,hit:b===hit||b.contains(hit),disabled:b.disabled}})}});
})()`

// CDP returns the rendered pseudo-element BORDER QUAD, not inferred CSS offsets.
async function pseudoBoxes(browser) {
  const { root } = await browser.call('DOM.getDocument', { depth: -1 })
  const found = {}
  function visit(node) {
    const attributes = node.attributes || [], id = attributes[attributes.indexOf('id') + 1]
    if (['a-toolbar', 'b-toolbar', 'a-reload', 'b-reload'].includes(id)) {
      for (const pseudo of node.pseudoElements || []) found[`${id}:${pseudo.pseudoType}`] = pseudo.nodeId
    }
    for (const child of node.children || []) visit(child)
  }
  visit(root)
  const boxes = {}
  for (const [name, nodeId] of Object.entries(found)) {
    const { model } = await browser.call('DOM.getBoxModel', { nodeId })
    const q = model.border
    boxes[name] = { x: q[0], y: q[1], right: q[2], bottom: q[5], width: q[2] - q[0], height: q[5] - q[1] }
  }
  return boxes
}
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.1, `${label}: actual=${actual}, expected=${expected}`)
const scopeSnapshot = `(() => {const paint=el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,radius:s.borderRadius,shadow:s.boxShadow,height:s.height,width:s.width}};return {outside:paint(document.getElementById('outside')),button:paint(document.getElementById('outside-button')),guests:[...document.querySelectorAll('iframe')].map(f=>({body:paint(f.contentDocument.body),input:paint(f.contentDocument.querySelector('input'))}))}})()`
const offSnapshot = `(() => {const s=el=>{const c=getComputedStyle(el);return [c.height,c.borderRadius,c.backgroundColor,c.boxShadow]};return ['a','b'].map(id=>({address:s(document.getElementById(id+'-url')),buttons:[...document.getElementById(id+'-toolbar').querySelectorAll('button')].map(s),nav:getComputedStyle(document.getElementById(id+'-toolbar'),'::before').content,group:getComputedStyle(document.getElementById(id+'-toolbar'),'::after').content}))})()`

async function click(browser, button) {
  const coordinates = { x: button.x + button.width / 2, y: button.y + button.height / 2, button: 'left', clickCount: 1 }
  await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...coordinates })
  await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...coordinates })
}

function verifyGeometry(panes, boxes, width) {
  for (const p of panes) {
    const wide = p.id === 'b' || width >= 520, prefix = `${width}px/${p.id}`
    assert.deepEqual(p.direct, ['BUTTON', 'BUTTON', 'BUTTON', 'DIV', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON'], `${prefix} native direct ancestry`)
    assert.equal(p.buttons.length, 9)
    assert.equal(p.address.height, 32)
    assert.ok(p.address.width >= 80, `${prefix} address minimum`)
    for (const button of p.buttons) {
      assert.ok(button.hit, `${prefix}/${button.id} unobstructed hit target`)
      assert.ok(button.x >= p.bar.x && button.right <= p.bar.right && button.y >= p.bar.y && button.bottom <= p.bar.bottom, `${prefix}/${button.id} contained: ${JSON.stringify(button)}`)
    }
    const by = name => p.buttons.find(b => b.id === `${p.id}-${name}`)
    near(by('back').y, by('reload').y, `${prefix} nav stays together`)
    const nav = boxes[`${p.id}-toolbar:before`]
    assert.equal(nav.height, 32)
    assert.ok(nav.x <= by('back').x && nav.right >= by('reload').right, `${prefix} navigation capsule bounds`)
    const separator = boxes[`${p.id}-reload:before`]
    assert.ok(separator, `${prefix} actual reload separator`)
    assert.equal(separator.width, 1)
    assert.equal(separator.height, 14)
    assert.ok(separator.x >= by('forward').right && separator.right <= by('reload').x, `${prefix} separator lies between forward and reload`)
    assert.notEqual(p.separator.background, 'rgba(0, 0, 0, 0)')
    const group = boxes[`${p.id}-toolbar:after`]
    if (wide) {
      assert.ok(group, `${prefix} actual action capsule`)
      near(group.x, by('comment').x - 4, `${prefix} capsule starts at own first action`)
      near(group.right, by('devtools').right + 4, `${prefix} capsule ends at own last action`)
      near(group.y, by('comment').y - 4, `${prefix} capsule own vertical anchor`)
      assert.equal(group.height, 32)
      for (const name of ['comment', 'external', 'console', 'devtools']) {
        const b = by(name)
        assert.ok(b.x >= group.x && b.right <= group.right && b.y >= group.y && b.bottom <= group.bottom, `${prefix}/${name} inside capsule`)
      }
      assert.ok(group.right < by('close').x, `${prefix} close excluded`)
      assert.equal(by('close').width, 32)
      assert.equal(by('close').height, 32)
      assert.equal(p.group.pointerEvents, 'none')
      assert.notEqual(p.group.shadow, 'none')
      near(by('comment').y, by('devtools').y, `${prefix} grouped actions same row`)
    } else {
      assert.equal(p.group.content, 'none', `${prefix} grouped capsule absent below 520`)
      assert.equal(group, undefined, `${prefix} no rendered grouped capsule`)
    }
    if (p.id === 'a' && width <= 320) assert.ok(by('close').y > by('reload').y, `${prefix} narrow actions really wrap`)
  }
}

test('shipping browser material: theme paint, real anchors, native interaction, narrow wrapping and disable', { timeout: 60000 }, async () => {
  const native = process.env.CODEX_NATIVE_CSS ? await readFile(process.env.CODEX_NATIVE_CSS, 'utf8') : ''
  const skin = await shippingCSS()
  const browser = await chromium()
  try {
    assert.equal(await browser.evaluate("CSS.supports('anchor-name','--material-requirement')"), true, 'available Chromium MUST support CSS anchors; no fallback pass')
    await browser.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1200, deviceScaleFactor: 1, mobile: false })
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: fixture(native, skin) })
    await browser.evaluate("Promise.all([...document.querySelectorAll('iframe')].map(f=>new Promise(resolve=>{if(f.contentDocument?.querySelector('input'))resolve();else f.addEventListener('load',resolve,{once:true})})))")
    const nativeOff = await browser.evaluate(offSnapshot)
    const originalScope = await browser.evaluate(scopeSnapshot)
    await browser.evaluate("document.documentElement.dataset.codexChatLook='true'")
    const first = await browser.evaluate(measurement)
    for (const p of first) {
      assert.notEqual(p.nav.shadow, 'none', `${p.id} navigation has a real material shadow`)
      assert.notEqual(p.address.shadow, 'none', `${p.id} address has a real material shadow`)
      assert.equal(p.nav.background, p.address.background)
      assert.equal(p.group.background, p.address.background)
    }
    for (const [theme, mode, backdrop, foreground, cold] of [
      ['hermes', 'light', '#fcf7e5', '#36342c', '#f3f1e8'],
      ['external', 'light', '#f2e9ff', '#3c214c', '#f3f3f3'],
      ['external', 'dark', '#162a30', '#dcebe4', '#212121'],
    ]) {
      const paint = await browser.evaluate(`(() => {const root=document.documentElement;root.dataset.hermesTheme=${JSON.stringify(theme)};root.dataset.hermesMode=${JSON.stringify(mode)};for(const [key,value] of Object.entries({'--ui-editor-surface-background':'${backdrop}','--ui-chat-surface-background':'${backdrop}','--theme-background-seed':'${backdrop}','--ui-text-primary':'${foreground}','--theme-foreground':'${foreground}','--ui-control-background':'${cold}'}))root.style.setProperty(key,value);const sample=document.createElement('div');sample.style.background='color-mix(in srgb, ${backdrop} 97%, ${foreground})';document.body.append(sample);const expected=getComputedStyle(sample).backgroundColor;sample.style.background='${cold}';const neutral=getComputedStyle(sample).backgroundColor;sample.remove();return {expected,neutral,addresses:['a','b'].map(id=>getComputedStyle(document.getElementById(id+'-url')).backgroundColor)}})()`)
      for (const address of paint.addresses) {
        assert.equal(address, paint.expected, `${theme}/${mode} surface follows backdrop + foreground, not native neutral`)
        assert.notEqual(address, paint.neutral)
      }
    }
    await browser.evaluate("document.documentElement.removeAttribute('style');document.documentElement.dataset.hermesTheme='hermes';document.documentElement.dataset.hermesMode='light'")
    assert.deepEqual(await browser.evaluate(scopeSnapshot), originalScope, 'no guest-page or outside-browser restyle')
    for (const width of [866, 520, 519, 320, 240]) {
      await browser.evaluate(`document.getElementById('a').style.width='${width}px'`)
      const measured = await browser.evaluate(measurement)
      const boxes = await pseudoBoxes(browser)
      verifyGeometry(measured, boxes, width)
      for (const p of measured) for (const button of p.buttons) await click(browser, button)
      console.log(`material geometry verified: ${width}px; panes a/b; capsule=${measured[0].group.content}; toolbar=${measured[0].bar.height}px`)
    }
    const counts = await browser.evaluate('counts')
    for (const id of ['a', 'b']) for (const name of [...direct, 'copy']) {
      assert.equal(counts[`${id}-${name}`], ['back', 'forward'].includes(name) ? undefined : 5, `${id}/${name} real native click handler / disabled behavior`)
    }
    assert.equal(await browser.evaluate("nativeNodes.every((node,i)=>node===[...document.querySelectorAll('.toolbar button')][i])"), true, 'native controls retain identity and ancestry')
    await browser.evaluate("document.getElementById('a').style.width='866px';document.getElementById('a-url').focus();document.getElementById('a-url').value='https://example.test'")
    await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    assert.equal(await browser.evaluate('navigated'), 'https://example.test')
    await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    assert.equal(await browser.evaluate("document.getElementById('a-url').value"), 'about:blank')
    await browser.evaluate('document.activeElement.blur()')
    if (process.env.CODEX_BROWSER_MATERIAL_SCREENSHOT) {
      const { data } = await browser.call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1000, height: 1050, scale: 1 } })
      await writeFile(process.env.CODEX_BROWSER_MATERIAL_SCREENSHOT, Buffer.from(data, 'base64'))
    }
    await browser.evaluate("document.documentElement.removeAttribute('data-codex-chat-look')")
    assert.deepEqual(await browser.evaluate(offSnapshot), nativeOff, 'disable restores original native controls and removes material pseudos')
    assert.deepEqual(await browser.evaluate(scopeSnapshot), originalScope, 'disable retains guest-page and outside-browser appearance')
  } finally { browser.close() }
})

test('browser divider is quieter without changing toolbar or capsule borders', { timeout: 30000 }, async () => {
  const native = process.env.CODEX_NATIVE_CSS ? await readFile(process.env.CODEX_NATIVE_CSS, 'utf8') : ''
  const browser = await chromium()
  try {
    await browser.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1200, deviceScaleFactor: 1, mobile: false })
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: fixture(native, await shippingCSS()) })
    const restored = await browser.evaluate("['a','b'].map(id=>{const s=getComputedStyle(document.getElementById(id+'-toolbar'));return [s.borderBottomColor,s.borderBottomWidth]})")
    await browser.evaluate("document.documentElement.dataset.codexChatLook='true'")
    for (const [theme, mode] of [['hermes', 'light'], ['external', 'dark'], ['codex-chat', 'light'], ['codex-chat', 'dark']]) {
      await browser.evaluate(`document.documentElement.dataset.hermesTheme='${theme}';document.documentElement.dataset.hermesMode='${mode}'`)
      await browser.evaluate("Promise.all([...document.querySelectorAll('.address>input')].flatMap(input=>{getComputedStyle(input).borderTopColor;return input.getAnimations().map(animation=>animation.finished)}))")
      const painted = await browser.evaluate(`['a','b'].map(id=>{
        const bar=document.getElementById(id+'-toolbar'),s=getComputedStyle(bar),input=document.getElementById(id+'-url');
        const sample=document.createElement('span');sample.style.position='absolute';
        sample.style.borderBottom='1px solid color-mix(in srgb, '+s.getPropertyValue('--codex-browser-divider')+' 35%, transparent)';
        sample.style.borderTop='1px solid '+s.getPropertyValue('--codex-browser-border');
        bar.append(sample);const expected=getComputedStyle(sample);
        const result={line:s.borderBottomColor,expectedLine:expected.borderBottomColor,width:s.borderBottomWidth,
          height:bar.getBoundingClientRect().height,capsule:getComputedStyle(input).borderTopColor,expectedCapsule:expected.borderTopColor};
        sample.remove();return result;
      })`)
      for (const p of painted) {
        assert.equal(p.line, p.expectedLine, `${theme}/${mode} divider blends to 35% of the original theme color`)
        assert.equal(p.width, '1px')
        assert.equal(p.height, 45)
        assert.equal(p.capsule, p.expectedCapsule, `${theme}/${mode} address outline stays unchanged`)
      }
    }
    await browser.evaluate("document.documentElement.dataset.hermesTheme='hermes';document.documentElement.dataset.hermesMode='light';document.documentElement.removeAttribute('data-codex-chat-look')")
    assert.deepEqual(await browser.evaluate("['a','b'].map(id=>{const s=getComputedStyle(document.getElementById(id+'-toolbar'));return [s.borderBottomColor,s.borderBottomWidth]})"), restored)
  } finally { browser.close() }
})
