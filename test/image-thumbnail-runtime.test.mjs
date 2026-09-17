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
const chrome = [process.env.CHROME_BIN, '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180"><rect width="400" height="180" fill="#47657f"/><circle cx="200" cy="90" r="65" fill="#dadada"/></svg>')
const tile = id => `<span data-slot="aui_directive-image" id="${id}"><button class="contents"><img src="${image}" alt="Test image"></button></span>`
const attachments = content => `<div class="attachment-row"><span data-slot="aui_directive-text"><span data-slot="aui_embedded-images">${content}</span></span></div>`
const chip = (id, preview) => `<div class="group/attachment" id="${id}"><button class="preview"><span class="thumb">${preview ? `<img src="${image}" alt="Test image">` : 'file'}</span><span class="label">${id}.png</span></button><button class="remove" aria-label="Remove"><i aria-hidden="true" class="codicon codicon-close" style="font-size:0.625rem"></i></button></div>`

// Native DOM shape: metadata attachments are siblings of the sticky user root;
// ZoomableImage is a span with a display:contents button, not a button tile.
test('native image attachment geometry, controls and exact dark surfaces', async t => {
  if (!chrome) return t.skip('Chrome or Chromium required')
  const { CSS, CODEX_THEME } = await loadPluginInternals(['CSS', 'CODEX_THEME'])
  const temp = await mkdtemp(path.join(os.tmpdir(), 'codex-images-'))
  const fixture = path.join(temp, 'fixture.html')
  const html = `<!doctype html><html data-codex-chat-look="true" data-hermes-theme="codex-chat" data-hermes-mode="dark"><head><meta charset="utf-8"><title>pending</title><style>
*{box-sizing:border-box}body{margin:20px;background:#111;color:#fcfcfc}button{font-family:-apple-system,system-ui,"Segoe UI",sans-serif}.contents{display:contents}
:root{--conversation-turn-gap:12px;--ui-text-primary:#eeeeee;--ui-text-secondary:#aaa;--ui-chat-surface-background:transparent;--ui-sidebar-surface-background:transparent;--ui-row-active-background:#454545;--ui-widget-surface-background:#454545;--ui-stroke-secondary:#444;--ui-stroke-tertiary:#444}
[data-slot="aui_turn-pair"]{display:flex;flex-direction:column;gap:12px;width:420px;margin-bottom:16px}[data-role=user]{display:flex;justify-content:flex-end}.composer-human-message{height:44px;border-radius:17px}.attachment-row{display:flex;flex-wrap:wrap;margin-top:-12px;margin-bottom:8px}[data-slot="aui_directive-text"]{white-space:pre-line;max-width:100%}[data-slot="aui_embedded-images"]{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}[data-slot="aui_directive-image"]{display:inline-block;max-width:100%;vertical-align:top}[data-slot="aui_directive-image"] img{max-height:192px;max-width:100%;object-fit:contain}
[data-slot="composer-surface"]{width:420px;padding:12px;margin:16px 0}[data-slot="composer-attachments"]{display:flex;flex-wrap:wrap;gap:6px}.group\\/attachment{position:relative;flex-shrink:0}.preview{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #444;border-radius:16px;background:transparent;color:inherit}.thumb{display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;overflow:hidden;border:1px solid #444;border-radius:8px}.thumb img{width:100%;height:100%;object-fit:cover}.remove{position:absolute;right:-4px;top:-4px;width:14px;height:14px;padding:0;border:1px solid #444;border-radius:50%}.label{font-size:12px}
.remove{display:flex;align-items:center;justify-content:center}.codicon{display:inline-block;width:1em;height:1em;line-height:1;font-style:normal}.codicon::before{content:'×'}
#assistant{width:320px;height:120px;object-fit:contain}aside,#panel{width:200px;padding:12px}#panel{background:var(--ui-widget-surface-background)}
${CSS}</style></head><body>
<aside data-slot="sidebar" id="sidebar"><div aria-current="true" id="selected">Selected chat</div></aside>
<div data-slot="aui_turn-pair" id="pair"><div data-role="user" data-slot="aui_user-message-root"><div class="composer-human-message" id="bubble">Caption</div></div>${attachments(tile('first')+tile('last'))}<div data-role="assistant"><img id="assistant" src="${image}" alt="Assistant output"></div></div>
<div data-slot="aui_turn-pair" id="loading-pair"><div data-role="user" data-slot="aui_user-message-root">Loading caption</div>${attachments('<span aria-hidden="true" id="loading"></span>')}</div>
<div data-slot="composer-surface" id="composer"><div data-slot="composer-attachments">${chip('photo',true)}${chip('document',false)}</div></div><div id="panel">Panel</div>
<script>
const root=document.documentElement; const themes=${JSON.stringify(CODEX_THEME)};
function apply(c){for(const [name,value] of Object.entries({'--theme-background-seed':c.background,'--theme-sidebar-seed':c.sidebarBackground,'--theme-card-seed':c.card,'--theme-elevated-seed':c.popover,'--theme-bubble-seed':c.userBubble,'--theme-foreground':c.foreground,'--theme-accent-soft':c.accent,'--dt-border':c.border,'--dt-composer-ring':c.composerRing}))root.style.setProperty(name,value)}
const el=id=>document.getElementById(id), rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,right:r.right,left:r.left,width:r.width,height:r.height,centerX:r.left+r.width/2,centerY:r.top+r.height/2}}, style=(e,p)=>getComputedStyle(e)[p];
apply(themes.darkColors);
let zoom=0,remove=0;el('first').querySelector('button').onclick=()=>zoom++;el('photo').querySelector('.remove').onclick=()=>remove++;
el('first').querySelector('button').click();el('photo').querySelector('.remove').click();
const colors=()=>({chat:style(document.body,'backgroundColor'),sidebar:style(el('sidebar'),'backgroundColor'),selected:style(el('selected'),'backgroundColor'),composer:style(el('composer'),'backgroundColor'),bubble:style(el('bubble'),'backgroundColor'),panel:style(el('panel'),'backgroundColor'),text:style(el('bubble'),'color')});
const active={first:rect(el('first')),last:rect(el('last')),bubble:rect(el('bubble')),image:rect(el('first').querySelector('img')),photo:rect(el('photo').querySelector('.preview')),photoGroup:rect(el('photo')),remove:rect(el('photo').querySelector('.remove')),removeHit:document.elementFromPoint(...(()=>{const r=el('photo').querySelector('.remove').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})())?.closest('.remove')===el('photo').querySelector('.remove'),file:rect(el('document').querySelector('.preview')),fileLabel:style(el('document').querySelector('.label'),'display'),assistant:rect(el('assistant')),loading:rect(el('loading')),loadingOrder:style(el('loading').closest('.attachment-row'),'order'),colors:colors(),zoom,removeClicks:remove};
active.glyph=rect(el('photo').querySelector('.codicon'));
el('pair').style.width='140px';const wrapped={first:rect(el('first')),last:rect(el('last')),row:rect(el('last').closest('.attachment-row'))};el('pair').style.width='420px';
root.setAttribute('data-hermes-glass','true');const glass={chat:style(document.body,'backgroundColor'),sidebar:style(el('sidebar'),'backgroundColor'),chatToken:getComputedStyle(root).getPropertyValue('--codex-color-chat').trim()};root.removeAttribute('data-hermes-glass');
root.dataset.hermesMode='light';apply(themes.colors);const light=colors();
root.removeAttribute('data-codex-chat-look');const disabled={photo:rect(el('photo').querySelector('.preview')),file:rect(el('document').querySelector('.preview')),order:style(el('last').closest('.attachment-row'),'order')};
disabled.glyph=rect(el('photo').querySelector('.codicon'));
root.dataset.codexChatLook='true';root.dataset.hermesMode='dark';apply(themes.darkColors);
document.title=btoa(JSON.stringify({active,wrapped,glass,light,disabled}));
</script></body></html>`
  try {
    await writeFile(fixture, html)
    const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=900,900', '--dump-dom']
    if (process.env.CODEX_SKIN_ARTIFACT_DIR) {
      await mkdir(process.env.CODEX_SKIN_ARTIFACT_DIR, { recursive: true })
      args.push(`--screenshot=${path.join(process.env.CODEX_SKIN_ARTIFACT_DIR, 'candidate-image-thumbnails.png')}`)
    }
    const { stdout } = await execFile(chrome, [...args, pathToFileURL(fixture).href], { maxBuffer: 2*1024*1024 })
    const match = stdout.match(/<title>([^<]+)<\/title>/)
    assert.ok(match)
    const result = JSON.parse(Buffer.from(match[1], 'base64').toString())
    const a = result.active
    assert.equal(a.first.width,80);assert.equal(a.first.height,80)
    assert.equal(a.image.width,78);assert.equal(a.image.height,78)
    assert.equal(a.last.right,a.bubble.right)
    assert.equal(a.bubble.top-a.last.bottom,8)
    assert.equal(a.photo.width,122);assert.equal(a.photo.height,122)
    assert.equal(a.remove.width,28);assert.equal(a.remove.height,28)
    assert.equal(a.remove.centerX,a.photoGroup.right-3);assert.equal(a.remove.centerY,a.photoGroup.top+3)
    assert.equal(a.glyph.width,result.disabled.glyph.width*2,'glyph enlarged once, not both its font and parent')
    assert.equal(a.glyph.height,result.disabled.glyph.height*2)
    assert.equal(a.glyph.centerX,a.remove.centerX)
    assert.equal(a.glyph.centerY,a.remove.centerY)
    assert.equal(a.removeHit,true)
    assert.equal(a.fileLabel,'block');assert.deepEqual(a.file.width,result.disabled.file.width)
    assert.equal(a.assistant.width,320);assert.equal(a.assistant.height,120)
    assert.equal(a.loading.width,80);assert.equal(a.loading.height,80);assert.equal(a.loadingOrder,'-1')
    assert.equal(a.zoom,1);assert.equal(a.removeClicks,1)
    assert.ok(result.wrapped.last.top>result.wrapped.first.top)
    assert.equal(result.wrapped.last.right,result.wrapped.row.right)
    assert.deepEqual(a.colors,{chat:'rgb(17, 17, 17)',sidebar:'rgb(28, 28, 28)',selected:'color(srgb 0.988235 0.988235 0.988235 / 0.07)',composer:'rgb(33, 33, 33)',bubble:'rgb(29, 29, 29)',panel:'rgb(36, 36, 36)',text:'rgb(252, 252, 252)'})
    assert.equal(result.glass.sidebar,'rgba(0, 0, 0, 0)')
    assert.equal(result.glass.chatToken,'transparent')
    assert.equal(result.light.composer,'rgb(255, 255, 255)')
    assert.equal(result.light.bubble,'rgb(243, 243, 243)')
    assert.ok(result.disabled.photo.height<122);assert.equal(result.disabled.order,'0')
  } finally { await rm(temp,{recursive:true,force:true}) }
})
