import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const execFile = promisify(execFileCallback)
const chrome = [process.env.CHROME_BIN, '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => p && existsSync(p))
// use-composer-actions attaches the image BEFORE awaiting queuedAttachmentPreview;
// AttachmentPill renders ImageIcon until thumbnailUrl exists. Native ImageIcon is
// Tabler IconPhoto (lib/icons.ts). No plugin observer may be needed for geometry.
test('image frame is reserved before thumbnail resolution and survives error/remount', async t => {
  if (!chrome) return t.skip('Chrome required')
  const { CSS } = await loadPluginInternals(['CSS'])
  const temp = await mkdtemp(path.join(os.tmpdir(), 'codex-first-paint-'))
  const source = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="gray"/></svg>')
  const file = path.join(temp, 'fixture.html')
  await writeFile(file, `<!doctype html><html data-codex-chat-look="true"><head><title>pending</title><style>
*{box-sizing:border-box}.group\\/attachment{position:relative;display:inline-block}.preview{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid gray;border-radius:16px}.thumb{display:grid;place-items:center;width:32px;height:32px;overflow:hidden;border:1px solid gray}.thumb img{width:100%;height:100%;object-fit:cover}.label{font-size:12px}.remove{position:absolute;top:-4px;right:-4px;width:14px;height:14px}.icon-tabler-photo,.icon-tabler-file-text{width:14px;height:14px}
${CSS}</style></head><body><div data-slot="composer-attachments">
<div class="group/attachment" id="photo"><button class="preview" aria-label="Preview photograph"><span class="thumb"><svg class="icon icon-tabler icon-tabler-photo" viewBox="0 0 24 24"></svg></span><span class="label">photo.png</span></button><button class="remove">×</button></div>
<div class="group/attachment" id="document"><button class="preview"><span class="thumb"><svg class="icon icon-tabler icon-tabler-file-text"></svg></span><span class="label">report.pdf</span></button></div></div>
<script>
const measurements=[];const photo=document.querySelector('#photo');const thumb=photo.querySelector('.thumb');const icon=thumb.innerHTML;let count=0;photo.querySelector('.remove').onclick=()=>count++;
const sample=phase=>{const r=photo.querySelector('.preview').getBoundingClientRect();measurements.push({phase,width:r.width,height:r.height,label:getComputedStyle(photo.querySelector('.label')).display})};
const frames=()=>new Promise(resolve=>setTimeout(resolve,50));
(async()=>{
sample('first-dom');await frames();sample('painted-placeholder');
thumb.innerHTML='<img alt="photo" src="${source}">';sample('thumbnail-inserted');await frames();sample('thumbnail-painted');
thumb.innerHTML=icon;photo.querySelector('.preview').setAttribute('aria-busy','true');sample('upload');await frames();sample('upload-painted');
photo.querySelector('.preview').removeAttribute('aria-busy');thumb.insertAdjacentHTML('beforeend','<span class="error">!</span>');sample('error');
const fileLabel=getComputedStyle(document.querySelector('#document .label')).display;photo.querySelector('.remove').click();
const clone=photo.cloneNode(true);photo.replaceWith(clone);const r=clone.querySelector('.preview').getBoundingClientRect();
document.title=btoa(JSON.stringify({measurements,fileLabel,count,remount:{width:r.width,height:r.height},accessibleName:clone.querySelector('.preview').getAttribute('aria-label')}));
})()</script></body></html>`)
  try {
    const { stdout } = await execFile(chrome, ['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--run-all-compositor-stages-before-draw','--virtual-time-budget=3000','--dump-dom',pathToFileURL(file).href], { maxBuffer: 2*1024*1024 })
    const match = stdout.match(/<title>([^<]+)<\/title>/)
    assert.ok(match)
    assert.notEqual(match[1], 'pending', 'asynchronous thumbnail sequence finished')
    const result = JSON.parse(Buffer.from(match[1], 'base64').toString())
    for (const frame of result.measurements) {
      assert.equal(frame.width,122,`${frame.phase} width`)
      assert.equal(frame.height,122,`${frame.phase} height`)
    }
    assert.equal(result.fileLabel,'block')
    assert.equal(result.count,1)
    assert.deepEqual(result.remount,{width:122,height:122})
    assert.equal(result.accessibleName,'Preview photograph')
  } finally { await rm(temp,{recursive:true,force:true}) }
})
