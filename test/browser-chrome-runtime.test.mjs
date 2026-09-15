import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const execFile = promisify(execFileCallback)
const chrome = [process.env.CHROME_BIN, '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => p && existsSync(p))
const tab = (id, label, active) => `<div id="${id}" role="tab" data-active="${active}" data-tree-tab="${id}"><span class="label"><span class="truncate">${label}</span></span><span class="close-overlay"><span aria-hidden></span><button aria-label="Close ${label}">×</button></span></div>`
const button = (id, glyph, extra='') => `<button id="${id}" aria-label="${id}" ${extra}>${glyph}</button>`

// Native hierarchy from PreviewPane, PreviewBrowserBar, TreeGroup and PaneTab.
// Assertions exercise CSS behavior, not source shape. No webview is restyled.
test('browser chrome preserves control hit targets, page content, modes and pane resizing', async t => {
  if (!chrome) return t.skip('Chrome required')
  const { CSS: layoutCSS, BROWSER_PALETTE_CSS, CODEX_THEME } = await loadPluginInternals(['CSS','BROWSER_PALETTE_CSS','CODEX_THEME'])
  const CSS = layoutCSS + BROWSER_PALETTE_CSS
  const temp = await mkdtemp(path.join(os.tmpdir(),'codex-browser-'))
  const file = path.join(temp,'fixture.html')
  const html = `<!doctype html><html data-codex-chat-look="true" data-hermes-theme="codex-chat" data-hermes-mode="dark"><head><title>pending</title><style>
*{box-sizing:border-box}body{margin:0;background:#111;color:#fcfcfc;font:12px system-ui,sans-serif}button{font:inherit;color:inherit;border:0;cursor:pointer}button:disabled{opacity:.35;cursor:default}input{font:inherit;width:100%;min-width:0;height:24px;border:1px solid #555;border-radius:4px}input[aria-invalid=true]{border-color:rgb(200,30,30)}
:root{--ui-editor-surface-background:var(--theme-background-seed);--ui-text-primary:var(--theme-foreground);--ui-text-secondary:#aaa;--ui-text-tertiary:#898989;--ui-control-background:var(--theme-card-seed);--ui-row-active-background:var(--theme-accent-soft);--ui-row-hover-background:#333;--ui-stroke-secondary:var(--dt-border);--ui-stroke-tertiary:var(--dt-border);--ui-accent:#aaa}
[data-tree-group]{position:relative;display:flex;flex-direction:column;overflow:hidden;width:660px;height:420px;background:var(--ui-editor-surface-background)}[data-zone-tabstrip]{display:flex;flex-shrink:0;height:28px;background:#333}[role=tablist]{display:flex;flex:1;min-width:0;overflow-x:auto;overflow-y:hidden}[role=tab]{position:relative;display:flex;flex-shrink:0;align-items:center;height:100%;max-width:200px;background:var(--tab-face,#333);box-shadow:inset 0 -2px 0 var(--pane-tab-active-accent,blue)}.label{display:flex;align-items:center;overflow:hidden;padding:0 28px 0 8px;height:100%}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase;font-size:9px}.close-overlay{position:absolute;display:flex;right:0;top:0;bottom:0;opacity:0}.close-overlay>span{width:8px}.close-overlay button{padding:0 6px;background:var(--tab-face,#333);box-shadow:inset 0 -2px 0 var(--pane-tab-active-accent,blue)}[role=tab]:hover .close-overlay{opacity:1}
aside{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}aside>div{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}.toolbar{display:flex;align-items:center;flex-shrink:0;min-height:28px;gap:4px;padding:4px 6px;border-bottom:1px solid gray}.toolbar>button{width:20px;height:20px;flex-shrink:0;background:transparent}.address-wrap{position:relative;flex:1;min-width:0}.copy{position:absolute;right:4px;top:50%;transform:translateY(-50%);padding:4px;background:transparent}.content{position:relative;flex:1;min-height:0;overflow:hidden}iframe{width:100%;height:100%;border:0}#other{width:200px;height:40px}#other [role=tab]{border-radius:0}
.close-overlay{pointer-events:none;position:absolute;inset-block:0;right:0;display:flex;align-items:stretch}.close-overlay>[aria-hidden]{width:16px;background-image:linear-gradient(to right,transparent,var(--tab-face))}.close-overlay>button{background:var(--tab-face)}
${CSS}</style></head><body>
<div data-tree-group="browser" id="pane"><div data-zone-tabstrip="browser"><div role="tablist">${tab('tab1','Browser',true)}${tab('tab2','Second tab',false)}</div>${button('minimize','⌄')}</div><aside data-preview-browser="p1"><div><div class="toolbar" id="toolbar">${button('back','←','disabled')}${button('forward','→','disabled')}${button('reload','↻')}<div class="address-wrap"><input data-slot="input" id="address" value="https://example.test" aria-label="Address"><button id="copy" class="copy" aria-label="Copy URL">⧉</button></div>${button('external','↗')}${button('console','▣','aria-pressed="false"')}${button('devtools','⚙','aria-pressed="false"')}</div><div class="content"><iframe id="guest" title="Page" srcdoc="<body style='background:white;color:rgb(12,34,56);font:16px system-ui;padding:24px'>Page content stays untouched</body>"></iframe></div></div></aside></div>
<div data-tree-group="grp-sessions" id="other"><div data-zone-tabstrip="grp-sessions"><div role="tablist">${tab('unrelated','Other panel',true)}</div></div></div>
<script>
const themes=${JSON.stringify(CODEX_THEME)};const root=document.documentElement;const by=id=>document.getElementById(id);const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};const cs=el=>getComputedStyle(el);
function theme(c){for(const [k,v] of Object.entries({'--theme-background-seed':c.background,'--theme-card-seed':c.card,'--theme-elevated-seed':c.popover,'--theme-sidebar-seed':c.sidebarBackground,'--theme-bubble-seed':c.userBubble,'--theme-foreground':c.foreground,'--theme-accent-soft':c.accent,'--dt-border':c.border}))root.style.setProperty(k,v)}
theme(themes.darkColors);const count={};document.querySelectorAll('button').forEach(b=>b.onclick=()=>{const key=b.id||b.getAttribute('aria-label');count[key]=(count[key]||0)+1});
const appearance=el=>{const s=cs(el);return [s.backgroundColor,s.borderRadius,s.height,s.boxShadow,cs(el.querySelector('.truncate')).fontSize,cs(el.querySelector('.truncate')).textTransform]};
const sharedDark={browser:appearance(by('tab1')),chat:appearance(by('unrelated'))};
const names=['back','forward','reload','copy','external','console','devtools'];const targets=width=>{by('pane').style.width=width+'px';const bar=rect(by('toolbar'));return {width,bar,address:rect(by('address')),buttons:names.map(id=>{const el=by(id),r=rect(el),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {id,...r,visible:cs(el).display!=='none',hit:hit===el||el.contains(hit)}})}};
const sizes=[660,320,240].map(targets);targets(660);
const dark={tab:cs(by('tab1')).backgroundColor,address:cs(by('address')).backgroundColor,border:cs(by('address')).borderTopColor,divider:cs(by('toolbar')).borderBottomColor,tabRadius:cs(by('tab1')).borderRadius,tabHeight:rect(by('tab1')).height,stripHeight:rect(by('tab1').closest('[data-zone-tabstrip]')).height,closeShadow:cs(by('tab1').querySelector('button')).boxShadow,closeRunway:cs(by('tab1').querySelector('.close-overlay > [aria-hidden]')).backgroundImage,closeRunwayColor:cs(by('tab1').querySelector('.close-overlay > [aria-hidden]')).backgroundColor,closeButtonColor:cs(by('tab1').querySelector('.close-overlay > button')).backgroundColor,labelCase:cs(by('tab1').querySelector('.truncate')).textTransform,unrelatedRadius:cs(by('unrelated')).borderRadius};
names.forEach(id=>by(id).click());by('minimize').click();by('tab1').querySelector('button').click();by('console').setAttribute('aria-pressed','true');const pressed=cs(by('console')).backgroundColor;
by('address').setAttribute('aria-invalid','true');const invalid=cs(by('address')).borderTopColor;by('address').removeAttribute('aria-invalid');by('address').focus();const focus=cs(by('address')).outlineStyle;by('address').blur();
root.dataset.hermesMode='light';theme(themes.colors);const light={address:cs(by('address')).backgroundColor,tab:cs(by('tab1')).backgroundColor};const sharedLight={browser:appearance(by('tab1')),chat:appearance(by('unrelated'))};
root.dataset.hermesMode='dark';theme(themes.darkColors);root.setAttribute('data-hermes-glass','true');const glass=cs(by('toolbar')).backgroundColor;root.removeAttribute('data-hermes-glass');
root.removeAttribute('data-codex-chat-look');const disabled={addressRadius:cs(by('address')).borderRadius,tabRadius:cs(by('tab1')).borderRadius};root.dataset.codexChatLook='true';
window.addEventListener('load',()=>{const doc=by('guest').contentDocument;document.title=btoa(JSON.stringify({sizes,dark,count,pressed,invalid,focus,light,glass,disabled,sharedDark,sharedLight,guest:{background:cs(doc.body).backgroundColor,color:cs(doc.body).color,text:doc.body.textContent}}))});
</script></body></html>`
  try {
    await writeFile(file,html)
    const args=['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--window-size=900,600','--dump-dom']
    if(process.env.CODEX_SKIN_ARTIFACT_DIR){await mkdir(process.env.CODEX_SKIN_ARTIFACT_DIR,{recursive:true});await writeFile(path.join(process.env.CODEX_SKIN_ARTIFACT_DIR,'browser-final.html'),html);args.push(`--screenshot=${path.join(process.env.CODEX_SKIN_ARTIFACT_DIR,'browser-final.png')}`)}
    const {stdout}=await execFile(chrome,[...args,pathToFileURL(file).href],{maxBuffer:2*1024*1024})
    const title=stdout.match(/<title>([^<]+)<\/title>/)?.[1]
    assert.ok(title && title!=='pending','probe completed')
    const r=JSON.parse(Buffer.from(title,'base64').toString())
    for(const size of r.sizes){
      assert.ok(size.address.width>=80)
      for(const b of size.buttons){assert.ok(b.visible && b.hit,`${size.width}px ${b.id} reachable`);assert.ok(b.left>=size.bar.left && b.right<=size.bar.right,`${size.width}px ${b.id} inside bar`);assert.ok(b.bottom<=size.bar.bottom,`${size.width}px ${b.id} inside height`)}
    }
    assert.equal(r.dark.tab,'rgb(29, 29, 29)');assert.equal(r.dark.address,'rgb(34, 34, 34)');assert.equal(r.dark.border,'rgb(50, 50, 50)');assert.equal(r.dark.divider,'rgb(35, 35, 35)')
    assert.equal(r.dark.tabRadius,'10px');assert.equal(r.dark.tabHeight,28);assert.equal(r.dark.stripHeight,44);assert.equal(r.dark.labelCase,'none');assert.equal(r.dark.unrelatedRadius,'0px')
    assert.equal(r.dark.closeShadow,'none');assert.equal(r.dark.closeRunway,'none');assert.equal(r.dark.closeRunwayColor,'rgba(0, 0, 0, 0)');assert.equal(r.dark.closeButtonColor,'rgba(0, 0, 0, 0)')
    for(const id of ['reload','copy','external','console','devtools','minimize','Close Browser'])assert.equal(r.count[id],1,id)
    assert.equal(r.count.back,undefined);assert.equal(r.count.forward,undefined)
    assert.equal(r.invalid,'rgb(200, 30, 30)');assert.equal(r.focus,'solid');assert.equal(r.pressed,'rgb(51, 51, 51)')
    assert.equal(r.light.address,'rgb(255, 255, 255)');assert.equal(r.glass,'rgba(0, 0, 0, 0)')
    assert.equal(r.disabled.addressRadius,'4px');assert.equal(r.disabled.tabRadius,'0px')
    assert.deepEqual(r.guest,{background:'rgb(255, 255, 255)',color:'rgb(12, 34, 56)',text:'Page content stays untouched'})
  } finally {await rm(temp,{recursive:true,force:true})}
})
