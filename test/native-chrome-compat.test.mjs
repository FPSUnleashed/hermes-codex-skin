import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const execFile = promisify(execFileCallback)
const chrome = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/google-chrome-stable'].find(p => p && existsSync(p))
// Structural fixture transcribed from installed index-BxMEAvI6.js: TreeGroup,
// PreviewBrowserBar/JKe, Input, and ComposerStatusStack. No application startup
// or native Electron behavior is claimed by this DOM/CSS seam regression.
const nativeTab = (id, selected) => `<div id="${id}" data-slot="pane-tab" role="tab" aria-selected="${selected}" data-active="${selected}" data-tree-tab="${id}"><div class="pane-tab-content"><span class="label"><span class="truncate">${id}</span></span></div><span class="close-overlay"><span aria-hidden="true"></span><button aria-label="Close ${id}">×</button></span></div>`
const nativeStatus = (id, tasks = false) => `<div data-slot="composer-dock" id="dock-${id}"><div data-slot="composer-status-stack" id="stack-${id}" class="flex max-h-[40vh] min-h-0 flex-col overflow-hidden"><div id="frame-${id}" class="mx-2 flex min-h-0 max-h-[inherit] shrink flex-col overflow-hidden rounded-b-none border-b border-b-transparent"><div data-slot="status-stack-scroll" id="scroll-${id}" class="min-h-0 overflow-y-auto overscroll-y-contain"><div data-slot="status-stack-content" id="content-${id}" class="transition-opacity duration-200 ease-out opacity-100">${tasks ? '<div data-slot="status-stack-section" id="tasks"><div><div><span class="codicon-checklist"></span>Tasks</div><div id="tasks-body">'+Array.from({length:30}, (_,i)=>'<div class="task-row">Task '+i+'</div>').join('')+'</div></div></div>' : ''}<div data-slot="status-stack-section" id="queue-${id}"><div><button id="queue-toggle-${id}">1 Queued</button><div class="group/status-row"><button id="queue-remove-${id}">×</button>Attachment-only turn</div></div></div></div></div></div></div><div data-slot="composer-surface" id="composer-${id}"><div data-slot="composer-fade"><div data-slot="composer-rich-input">Draft</div></div></div></div>`

test('native nested panel headers, browser controls and status scroll wrappers retain the skin', async t => {
  assert.ok(chrome, 'Chromium must be installed for this gate')
  const internals = await loadPluginInternals(['CSS', 'BROWSER_PALETTE_CSS', 'decorateComposerChrome', 'clearComposerChromeDecorations'])
  const temp = await mkdtemp(path.join(os.tmpdir(), 'codex-native-chrome-'))
  const file = path.join(temp, 'fixture.html')
  const nativeCSS = process.env.CODEX_NATIVE_CSS ? await readFile(process.env.CODEX_NATIVE_CSS, 'utf8') : ''
  const html = `<!doctype html><html data-codex-chat-look="true" data-hermes-theme="codex-chat" data-hermes-mode="dark"><head><title>pending</title><style>${nativeCSS}
:root{--theme-background-seed:#111;--theme-card-seed:#212121;--theme-elevated-seed:#242424;--theme-sidebar-seed:#1c1c1c;--theme-bubble-seed:#1d1d1d;--theme-foreground:#fcfcfc;--theme-accent-soft:#2c2c2c;--dt-border:#2e2e2e;--ui-editor-surface-background:#111;--ui-sidebar-surface-background:#1c1c1c;--ui-text-primary:#fcfcfc;--ui-text-secondary:#aaa;--ui-text-tertiary:#999;--ui-control-background:#212121;--ui-row-active-background:#2c2c2c;--ui-row-hover-background:#333;--ui-stroke-secondary:#2e2e2e;--ui-stroke-tertiary:#2e2e2e}
*{box-sizing:border-box}body{margin:0;background:#111;color:#fcfcfc;font:12px system-ui}button,input{font:inherit;color:inherit}button{cursor:pointer}button:disabled{cursor:default}button{border:0}input{width:100%;height:24px;border:1px solid gray;border-radius:2.5px}
[data-tree-split]{display:flex}[data-tree-split]>div{display:flex;position:relative}[data-tree-group]{display:flex;flex-direction:column;position:relative;overflow:hidden;background:#111;min-width:0;flex:1}[data-tree-group="grp-sessions"]{width:160px}[data-panel-header]{display:flex;position:relative;flex-shrink:0;background:#1c1c1c}[data-zone-tabstrip]{display:flex;position:relative;flex:1;height:28px;min-width:0}[role=tablist]{display:flex;flex:1;min-width:0;overflow-x:auto}[role=tab]{position:relative;display:flex;align-items:center;flex-shrink:0;height:100%;max-width:200px;background:var(--tab-face,#333)}.pane-tab-content{display:flex;flex:1;align-items:center;min-width:0;height:100%}.label{display:flex;align-items:center;height:100%;padding:0 28px 0 8px}.truncate{font-size:9px;text-transform:uppercase;letter-spacing:.5px}.close-overlay{position:absolute;right:0;top:0;bottom:0;display:flex;opacity:0}.close-overlay>span{width:8px}.close-overlay button{padding:0 6px;background:var(--tab-face,#333);box-shadow:inset 0 -2px blue}[role=tab]:hover .close-overlay{opacity:1}
aside{display:flex;flex:1;min-height:0;flex-direction:column}aside>div{display:flex;flex-direction:column}.toolbar{display:flex;align-items:center;flex-shrink:0;gap:4px;padding:4px 6px}.toolbar>span{display:contents}.toolbar button{background:transparent;width:20px;height:20px;flex-shrink:0}.address-wrap{position:relative;flex:1;min-width:0}.copy{position:absolute;right:4px;top:50%;transform:translateY(-50%)}
[data-slot=composer-dock]{display:flex;flex-direction:column;position:relative;width:600px;margin-top:12px}[data-slot=composer-status-stack]{display:flex;max-height:40vh;min-height:0;flex-direction:column;overflow:hidden}[data-slot=composer-status-stack]>div{display:flex;min-height:0;max-height:inherit;flex-shrink:1;flex-direction:column;overflow:hidden;margin:0 8px;border:1px solid #888;border-radius:4px 4px 0 0;background:#222}[data-slot=status-stack-scroll]{min-height:0;overflow-y:auto}[data-slot=composer-surface]{height:80px;min-height:80px;flex-shrink:0;border-radius:21px;background:#222;margin:0 5px}.task-row{height:24px}[data-slot=status-stack-section]{min-height:0}[id^=queue-] button{height:24px}
${internals.CSS}${internals.BROWSER_PALETTE_CSS}</style></head><body>
<div data-tree-split="root"><div><div data-tree-group="grp-sessions"><div data-panel-header><div data-zone-tabstrip="grp-sessions"><div role="tablist">${nativeTab('sessions',true)}</div></div></div></div></div><div style="width:700px"><div id="main" data-tree-group="grp-main"><div data-panel-header id="header"><div data-zone-tabstrip="grp-main" id="strip"><div role="tablist">${nativeTab('browser',true)}${nativeTab('second',false)}</div></div></div><aside data-preview-browser="browser"><div><div id="toolbar" class="toolbar"><span><button id="back" disabled>←</button></span><span><button id="reload">↻</button></span><div class="address-wrap"><input id="address" data-slot="input" inputmode="url" aria-label="Address" value="https://example.test"><button id="copy" class="copy">⧉</button></div><span><button id="console" aria-pressed="false">▣</button></span></div><div id="guest" style="background:white;color:rgb(12,34,56)">Guest page stays untouched</div></div></aside></div></div></div>
${nativeStatus('one')}${nativeStatus('two',true)}
<script>
${internals.decorateComposerChrome.toString()}
${internals.clearComposerChromeDecorations.toString()}
const by=id=>document.getElementById(id), cs=el=>getComputedStyle(el), rect=el=>{let r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
let clicks=0;by('reload').onclick=()=>clicks++;by('queue-remove-one').onclick=()=>clicks++;decorateComposerChrome();
const measure=()=>({tabRadius:cs(by('browser')).borderTopLeftRadius,labelSize:cs(by('browser').querySelector('.truncate')).fontSize,labelCase:cs(by('browser').querySelector('.truncate')).textTransform,tabHeight:rect(by('browser')).height,stripHeight:rect(by('strip')).height,headerHeight:rect(by('header')).height,corner:cs(by('main')).borderTopLeftRadius,addressRadius:cs(by('address')).borderRadius,toolbarHeight:rect(by('toolbar')).height,cardMarked:by('content-one').dataset.codexStatusCard,frameRadius:cs(by('frame-one')).borderTopLeftRadius,frameBorder:cs(by('frame-one')).borderTopWidth,frameBackground:cs(by('frame-one')).backgroundColor,cardBackground:cs(by('content-one')).backgroundColor,stack:rect(by('stack-one')),composer:rect(by('composer-one')),frame:rect(by('frame-one')),secondCard:by('content-two').dataset.codexStatusCard,tasksMarked:by('tasks').dataset.codexTaskSection,taskOverflow:cs(by('tasks-body')).overflowY,taskScrollHeight:by('tasks-body').scrollHeight,taskClientHeight:by('tasks-body').clientHeight,queue:rect(by('queue-two')),queueStack:rect(by('stack-two')),guestColor:cs(by('guest')).color});
const enabled=measure();by('reload').click();by('queue-remove-one').click();by('main').parentElement.style.width='260px';const bar=rect(by('toolbar'));const narrow=[...by('toolbar').querySelectorAll('button,input')].map(e=>({id:e.id,...rect(e)}));clearComposerChromeDecorations();document.documentElement.removeAttribute('data-codex-chat-look');const disabled={tabRadius:cs(by('browser')).borderRadius,frameRadius:cs(by('frame-one')).borderTopLeftRadius,marks:document.querySelectorAll('[data-codex-status-card],[data-codex-task-section]').length};document.title=btoa(JSON.stringify({enabled,clicks,narrow,bar,disabled}));
</script></body></html>`
  try {
    await writeFile(file,html)
    if (process.env.CODEX_SKIN_ARTIFACT_DIR) await writeFile(path.join(process.env.CODEX_SKIN_ARTIFACT_DIR,'native-chrome.html'),html)
    const {stdout} = await execFile(chrome,['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--window-size=1000,1100','--dump-dom',pathToFileURL(file).href],{maxBuffer:3*1024*1024})
    const title=stdout.match(/<title>([^<]+)<\/title>/)?.[1]
    assert.ok(title && title!=='pending', 'native DOM probe completed')
    const r=JSON.parse(Buffer.from(title,'base64').toString())
    console.log(JSON.stringify(r))
    assert.equal(r.enabled.tabRadius,'10px','wrapped tabs retain rounded corners')
    assert.equal(r.enabled.labelSize,'12px');assert.equal(r.enabled.labelCase,'none')
    assert.equal(r.enabled.tabHeight,28);assert.equal(r.enabled.stripHeight,48)
    assert.ok(r.enabled.headerHeight>=48,'header contains its tabstrip')
    assert.equal(r.enabled.corner,'0px','integrated header owns the upper corner')
    assert.equal(r.enabled.addressRadius,'10px');assert.ok(r.enabled.toolbarHeight>=39)
    assert.equal(r.enabled.cardMarked,'true');assert.equal(r.enabled.secondCard,'true')
    assert.equal(r.enabled.frameRadius,'20px');assert.equal(r.enabled.frameBorder,'0px')
    assert.equal(r.enabled.frameBackground,'rgba(0, 0, 0, 0)')
    assert.notEqual(r.enabled.cardBackground,'rgba(0, 0, 0, 0)')
    assert.equal(r.enabled.frame.left-r.enabled.composer.left,21)
    assert.equal(r.enabled.composer.top,r.enabled.stack.bottom)
    assert.equal(r.enabled.tasksMarked,'true');assert.equal(r.enabled.taskOverflow,'auto')
    assert.ok(r.enabled.taskScrollHeight>r.enabled.taskClientHeight,'long task list owns its scroll')
    assert.ok(r.enabled.queue.bottom<=r.enabled.queueStack.bottom,'Queue is not hidden by long Tasks')
    assert.equal(r.enabled.guestColor,'rgb(12, 34, 56)');assert.equal(r.clicks,2)
    for(const c of r.narrow) assert.ok(c.left>=r.bar.left && c.right<=r.bar.right,`${c.id} fits narrow toolbar`)
    assert.equal(r.disabled.frameRadius,'4px');assert.equal(r.disabled.marks,0)
  } finally { await rm(temp,{recursive:true,force:true}) }
})
