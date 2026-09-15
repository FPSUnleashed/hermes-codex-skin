import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const execFile = promisify(execFileCallback)

function fixture(css) {
  return `<!doctype html><html data-codex-chat-look="true"><head><title>pending</title><style>
  *{box-sizing:border-box}body{margin:0}button{width:24px;height:24px}
  [data-tree-group]{width:240px}[data-zone-tabstrip]{display:flex;height:28px}
  [role=tablist]{display:flex;flex:1}[role=tab]{display:flex;align-items:center;padding:0 8px}
  ${css}</style></head><body>
  <button id="full-toggle" aria-label="Toggle sidebar"><span class="codicon codicon-layout-sidebar-left"></span></button>
  <section data-tree-group="grp-sessions"><div data-zone-tabstrip="grp-sessions">
    <div role="tablist"><div role="tab" tabindex="0" data-tree-tab="sessions">Sessions</div><div role="tab" tabindex="0" data-tree-tab="hermes-bots:pane">Bots</div></div>
    <button id="minimize" aria-label="Minimize"><span class="codicon codicon-chevron-down"></span></button>
  </div><div id="panel">Sessions content</div></section>
  <section data-tree-group="grp-terminal"><div data-zone-tabstrip="grp-terminal"><button id="other-minimize"><span class="codicon codicon-chevron-down"></span></button></div></section>
  <button id="other-down"><span class="codicon codicon-chevron-down"></span></button>
  <script>
  const root=document.documentElement,button=document.getElementById('minimize'),group=document.querySelector('[data-tree-group="grp-sessions"]'),panel=document.getElementById('panel');
  const visible=el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0;
  const clickPoint=el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(hit===el||el.contains(hit)){hit.click();return true}return false};
  button.onclick=()=>{button.firstElementChild.className='codicon codicon-chevron-down';panel.textContent='Restored'};
  document.getElementById('full-toggle').onclick=()=>{group.hidden=!group.hidden};
  for(const tab of group.querySelectorAll('[role=tab]'))tab.onclick=()=>panel.textContent=tab.textContent;
  button.focus();
  const hidden={visible:visible(button),focusable:document.activeElement===button,rects:button.getClientRects().length};
  const tabs=[...group.querySelectorAll('[role=tab]')].map(tab=>({clicked:clickPoint(tab),text:panel.textContent}));
  const others=['full-toggle','other-minimize','other-down'].map(id=>visible(document.getElementById(id)));
  const hide=clickPoint(document.getElementById('full-toggle'))&&group.hidden;
  const show=clickPoint(document.getElementById('full-toggle'))&&!group.hidden;
  // An already-minimized saved layout must retain its native way back out.
  button.firstElementChild.className='codicon codicon-chevron-up';
  const restoreVisible=visible(button),restored=clickPoint(button)&&panel.textContent==='Restored';
  const hiddenAgain=!visible(button);
  root.removeAttribute('data-codex-chat-look');
  const disabledVisible=visible(button);
  root.setAttribute('data-codex-chat-look','true');
  document.title=btoa(JSON.stringify({hidden,tabs,others,hide,show,restoreVisible,restored,hiddenAgain,disabledVisible,reenabledHidden:!visible(button)}));
  </script></body></html>`
}

test('hide only Sessions/Bots minimize, retaining full toggle, tabs, restore and plugin-off behavior', async () => {
  const { CSS } = await loadPluginInternals(['CSS'])
  const temp = await mkdtemp(path.join(os.tmpdir(), 'codex-hide-minimize-'))
  try {
    const file = path.join(temp, 'index.html')
    await writeFile(file, fixture(CSS))
    const { stdout } = await execFile('/usr/bin/google-chrome-stable', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--dump-dom', pathToFileURL(file).href], { maxBuffer: 3 * 1024 * 1024 })
    const match = stdout.match(/<title>([^<]+)<\/title>/)
    assert.ok(match)
    const r = JSON.parse(Buffer.from(match[1], 'base64').toString())
    assert.deepEqual(r.hidden, { visible: false, focusable: false, rects: 0 })
    assert.deepEqual(r.tabs, [{ clicked: true, text: 'Sessions' }, { clicked: true, text: 'Bots' }])
    assert.deepEqual(r.others, [true, true, true])
    for (const key of ['hide', 'show', 'restoreVisible', 'restored', 'hiddenAgain', 'disabledVisible', 'reenabledHidden']) assert.equal(r[key], true, key)
  } finally { await rm(temp, { recursive: true, force: true }) }
})
