import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Installed index-BlmkkJ3g.js/eJe and PaneTab. Tooltip is asChild, not a wrapper.
const button = (id, disabled = false) => `<button id="${id}" data-slot="tooltip-trigger" data-size="icon-xs" data-variant="ghost" class="inline-flex items-center justify-center shrink-0 rounded-sm" aria-label="${id}" ${disabled ? 'disabled' : ''}><span class="codicon codicon-${id === 'back' ? 'arrow-left' : id === 'forward' ? 'arrow-right' : id === 'reload' ? 'refresh' : id}" style="font-size:13px">${{back:'←',forward:'→',reload:'↻',copy:'⧉',comment:'♧',external:'↗',console:'>_',devtools:'⚙',close:'×'}[id] || id}</span></button>`
const fixture = (nativeCSS, skinCSS) => `<!doctype html><html data-codex-chat-look="true" data-hermes-theme="hermes" data-hermes-mode="light"><head><style>${nativeCSS}
/* Native preflight defaults keep this seam fixture self-contained. */
*{box-sizing:border-box}button{border:0;padding:0}input{padding:0}
#url.desktop-input-chrome[aria-invalid=true]{border-color:var(--dt-destructive)}
:root { --theme-foreground:#36342c; --theme-background-seed:#fcf7e5; --theme-sidebar-seed:#f4efda; --theme-card-seed:#fffaf0; --theme-elevated-seed:#fffaf0; --theme-bubble-seed:#ebe6d4; --theme-neutral-chrome:#f3f3f3; --theme-mix-chrome:100%; --titlebar-height:0px; --ui-editor-surface-background:#fcf7e5; --ui-chat-surface-background:#fcf7e5; --ui-sidebar-surface-background:#f4efda; --ui-control-background:#f3f1e8; --ui-row-active-background:#e8e3d1; --ui-row-hover-background:#e8e3d1; --ui-stroke-secondary:#c4bfaf; --ui-stroke-tertiary:#dfdacb; --ui-text-primary:#36342c; --ui-text-secondary:#696655; --ui-text-tertiary:#8b8776; --dt-card:#f3f1e8; --dt-destructive:#c82d37; --dt-input-bg:100%; --dt-input-border:40%; --dt-composer-ring:#c4bfaf; --dt-input-inset:none; }
body{margin:0}#pane{width:866px;height:550px}#header{display:flex;position:relative;height:34px;flex-shrink:0}#strip{display:flex;flex:1;min-width:0;height:28px}#strip>[role=tablist]{display:flex;flex:1;min-width:0}#tab{position:relative;display:flex;align-items:center;flex-shrink:0;height:100%;width:122px;background:var(--tab-bg)}.pane-tab-content{display:flex;align-items:center;min-width:0;height:100%;padding:0 8px;gap:6px}#tab .truncate{white-space:nowrap;overflow:hidden}#tab>.close-overlay{position:absolute;right:0;top:0;bottom:0;display:flex;opacity:0}#tab:hover>.close-overlay{opacity:1}#tab-close{width:20px;height:20px}aside,aside>div{display:flex;flex-direction:column;min-height:0;flex:1}#toolbar{display:flex;align-items:center;flex-shrink:0;gap:4px;padding:4px 6px;border-bottom:1px solid var(--ui-stroke-secondary)}#toolbar>button{width:20px;height:20px;background:transparent}#wrap{position:relative;flex:1;min-width:0}#url{width:100%;min-width:0;height:24px;border:1px solid var(--ui-stroke-secondary);border-radius:2.5px}#copy{position:absolute;right:4px;top:50%;transform:translateY(-50%);background:transparent}#content{position:relative;flex:1;min-height:0}iframe{width:100%;height:100%;border:0}#outside{border-radius:2.5px}
${skinCSS}</style></head><body><div id="pane" data-tree-group="browser"><div id="header" data-panel-header><div id="strip" data-zone-tabstrip="browser"><div role="tablist"><div id="tab" data-slot="pane-tab" data-closeable data-active="true" aria-selected="true" role="tab" data-tree-tab="browser"><div class="pane-tab-content"><span>◎</span><span><span class="truncate">Browser</span></span></div><span class="close-overlay"><span aria-hidden></span><button id="tab-close" aria-label="Close tab">×</button></span></div><button id="add" aria-label="Add tab">+</button></div></div></div><aside data-preview-browser="browser"><div><div id="toolbar">${button('back',true)}${button('forward',true)}${button('reload')}<div id="wrap"><input id="url" data-slot="input" inputmode="url" aria-label="Address" class="desktop-input-chrome pr-7" placeholder="Search or enter a URL" value="about:blank">${button('copy')}</div>${button('comment')}${button('external')}${button('console')}${button('devtools')}${button('close')}</div><div id="content"><iframe id="guest" srcdoc="<body style='background:white;color:rgb(12,34,56)'>Guest content</body>"></iframe></div></div></aside></div><input id="outside" data-slot="input" value="Outside browser"><script>window.counts={};window.navigated='';document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>counts[b.id]=(counts[b.id]||0)+1));url.addEventListener('keydown',e=>{if(e.key==='Enter')window.navigated=url.value;if(e.key==='Escape')url.value='about:blank'});</script></body></html>`

const measure = `(() => { const by=id=>document.getElementById(id), css=el=>getComputedStyle(el), rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},bar=by('toolbar'),s=css(bar,'::before'),p=getComputedStyle(bar,'::before');return {bar:rect(bar),address:rect(by('url')),addressRadius:css(by('url')).borderRadius,addressBackground:css(by('url')).backgroundColor,addressBorder:css(by('url')).borderTopColor,group:{content:p.content,width:p.width,height:p.height,radius:p.borderRadius,pointerEvents:p.pointerEvents,background:p.backgroundColor},tab:rect(by('tab')),header:rect(by('header')),outsideRadius:css(by('outside')).borderRadius,buttons:[...bar.querySelectorAll('button')].map(b=>{const r=rect(b),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:b.id,...r,hit:b===hit||b.contains(hit),disabled:b.disabled}})} })()`

test('Codex browser capsules retain native theme, input and all actions across narrow panes', async () => {
  const nativeCSS = process.env.CODEX_NATIVE_CSS ? await readFile(process.env.CODEX_NATIVE_CSS, 'utf8') : ''
  const { CSS, BROWSER_PALETTE_CSS } = await loadPluginInternals(['CSS', 'BROWSER_PALETTE_CSS'])
  const browser = await chromium()
  try {
    const { frameTree } = await browser.call('Page.getFrameTree')
    await browser.call('Emulation.setDeviceMetricsOverride',{width:1000,height:800,deviceScaleFactor:1,mobile:false})
    await browser.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:fixture(nativeCSS,CSS+BROWSER_PALETTE_CSS)})
    const first = await browser.evaluate(measure)
    assert.equal(first.address.height,32)
    assert.equal(first.addressRadius,'999px')
    assert.equal(first.bar.height,45) // 32px capsule, two 6px gutters, 1px divider.
    assert.equal(first.group.width,'96px')
    assert.equal(first.group.height,'32px')
    assert.equal(first.group.radius,'999px')
    assert.equal(first.group.pointerEvents,'none')
    assert.notEqual(first.group.background,'rgba(0, 0, 0, 0)')
    assert.notEqual(first.addressBackground,'rgb(243, 241, 232)','browser surface no longer inherits cold neutral control paint')
    assert.equal(first.group.background,first.addressBackground,'navigation and address share the themed surface')
    assert.equal(first.tab.height,28)
    assert.equal(first.tab.y-first.header.y,10)
    assert.equal(first.header.bottom-first.tab.bottom,10)
    assert.equal(first.outsideRadius,'2.5px')
    for (const width of [866,400,320,240]) {
      await browser.evaluate(`pane.style.width='${width}px'`)
      const r=await browser.evaluate(measure)
      assert.ok(r.address.width>=80)
      assert.equal(r.buttons.length,9)
      for(const b of r.buttons){assert.ok(b.hit,`${width}px ${b.id} hit target`);assert.ok(b.x>=r.bar.x && b.right<=r.bar.right,`${width}px ${b.id} horizontal containment`);assert.ok(b.bottom<=r.bar.bottom,`${width}px ${b.id} vertical containment`)}
      assert.equal(r.buttons[0].y,r.buttons[2].y,'navigation group remains together')
    }
    await browser.evaluate("pane.style.width='866px'")
    const r=await browser.evaluate(measure)
    for(const button of r.buttons.filter(b=>!b.disabled)){
      await browser.call('Input.dispatchMouseEvent',{type:'mousePressed',x:button.x+button.width/2,y:button.y+button.height/2,button:'left',clickCount:1})
      await browser.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:button.x+button.width/2,y:button.y+button.height/2,button:'left',clickCount:1})
    }
    const counts=await browser.evaluate('counts')
    for(const id of ['reload','copy','comment','external','console','devtools','close'])assert.equal(counts[id],1)
    assert.equal(counts.back,undefined)
    await browser.evaluate("url.focus();url.value='https://example.test';url.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
    assert.equal(await browser.evaluate('navigated'),'https://example.test')
    await browser.evaluate("url.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
    assert.equal(await browser.evaluate('url.value'),'about:blank')
    await browser.evaluate("url.classList.add('pl-6')")
    assert.equal(await browser.evaluate("getComputedStyle(url).paddingLeft"),'24px','loading icon retains its gutter')
    await browser.evaluate("url.classList.remove('pl-6');url.setAttribute('aria-invalid','true')")
    await browser.evaluate("Promise.all(url.getAnimations().map(animation=>animation.finished))")
    assert.equal(await browser.evaluate("getComputedStyle(url).borderTopColor"),'rgb(200, 45, 55)')
    await browser.evaluate("url.removeAttribute('aria-invalid')")
    const guest=await browser.evaluate("new Promise(resolve=>{const f=document.getElementById('guest');const run=()=>{if(!f.contentDocument?.body)return false;resolve({background:getComputedStyle(f.contentDocument.body).backgroundColor,color:getComputedStyle(f.contentDocument.body).color});return true};if(!run())f.addEventListener('load',run,{once:true})})")
    assert.deepEqual(guest,{background:'rgb(255, 255, 255)',color:'rgb(12, 34, 56)'})
    for(const [theme,mode,surface,control] of [['codex-chat','dark','#111111','#212121'],['codex-chat','light','#f9f9f9','#ffffff'],['external','dark','#162a30','#23434a']]){
      await browser.evaluate(`document.documentElement.dataset.hermesTheme=${JSON.stringify(theme)};document.documentElement.dataset.hermesMode=${JSON.stringify(mode)};document.documentElement.style.setProperty('--ui-editor-surface-background','${surface}');document.documentElement.style.setProperty('--ui-chat-surface-background','${surface}');document.documentElement.style.setProperty('--ui-control-background','${control}')`)
      const themed=await browser.evaluate(measure)
      assert.notEqual(themed.addressBackground,'rgba(0, 0, 0, 0)',`${theme}/${mode} visible address capsule`)
      assert.equal(themed.addressRadius,'999px')
    }
    await browser.evaluate("document.documentElement.dataset.hermesGlass='true';document.documentElement.style.setProperty('--ui-editor-surface-background','transparent');document.documentElement.style.setProperty('--ui-chat-surface-background','transparent')")
    assert.equal(await browser.evaluate("getComputedStyle(document.getElementById('toolbar')).backgroundColor"),'rgba(0, 0, 0, 0)')
    await browser.evaluate("document.documentElement.removeAttribute('data-hermes-glass');document.documentElement.removeAttribute('data-codex-chat-look')")
    const off=await browser.evaluate(measure)
    assert.equal(off.address.height,24)
    assert.equal(off.addressRadius,'2.5px')
    assert.equal(off.group.content,'none')
    if(process.env.CODEX_BROWSER_SCREENSHOT){
      await browser.evaluate("url.blur();document.documentElement.dataset.codexChatLook='true';document.documentElement.dataset.hermesTheme='hermes';document.documentElement.dataset.hermesMode='light';document.documentElement.removeAttribute('style')")
      const {data}=await browser.call('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:866,height:550,scale:1}})
      await writeFile(process.env.CODEX_BROWSER_SCREENSHOT,Buffer.from(data,'base64'))
    }
  } finally { browser.close() }
})
