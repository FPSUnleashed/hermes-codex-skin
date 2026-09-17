import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

for (const mode of ['dark', 'light', 'external', 'glass']) {
  test(`sidebar contrast keeps names prominent and status colors intact (${mode})`, async () => {
    const { CSS } = await loadPluginInternals(['CSS'])
    const baseline = process.env.CODEX_SIDEBAR_BASELINE_CSS
      ? await readFile(process.env.CODEX_SIDEBAR_BASELINE_CSS, 'utf8') : CSS
    const dark = mode !== 'light'
    const bg = dark ? '#1c1c1c' : '#f3f3f3'
    const fg = dark ? '#fcfcfc' : '#222222'
    const browser = await chromium()
    try {
      await browser.call('Emulation.setDeviceMetricsOverride', { width: 640, height: 650, deviceScaleFactor: 1, mobile: false })
      const html = `<!doctype html><html data-codex-chat-look="true" data-hermes-theme="${mode === 'external' ? 'other' : 'codex-chat'}" data-hermes-mode="${dark ? 'dark' : 'light'}" ${mode === 'glass' ? 'data-hermes-glass="true"' : ''}>
      <head><style>
      :root { --theme-foreground:${fg}; --theme-sidebar-seed:${bg}; --theme-background-seed:${bg}; --theme-accent-soft:${dark ? '#3e3e3e' : '#ddd'};
      --ui-text-primary:${fg}; --ui-text-secondary:${dark ? '#aaa' : '#666'}; --ui-text-tertiary:${dark ? '#888' : '#777'};
      --ui-sidebar-surface-background:${mode === 'glass' ? 'transparent' : bg}; --ui-chat-surface-background:${bg};
      --ui-row-active-background:${dark ? '#3e3e3e' : '#ddd'}; --ui-row-hover-background:${dark ? '#333' : '#e4e4e4'}; }
      *{box-sizing:border-box}body{margin:0;background:${bg};color:${fg};font:14px system-ui,sans-serif}
      aside{width:310px;min-height:620px;padding:18px 12px}button{font:inherit;color:inherit;border:0;background:transparent;text-align:left}
      [data-slot=sidebar-menu-button]{display:flex;gap:10px;align-items:center;width:100%;height:34px;padding:0 10px}
      [data-slot=sidebar-menu-button] svg{width:16px;height:16px;stroke:currentColor;fill:none}
      [class~='group/section-label']{margin:24px 0 8px;padding:0 10px;color:${fg}}
      .row-hover{display:flex;align-items:center;gap:8px;padding:0 10px;height:34px;border-radius:10px}
      .row-hover:hover{background:var(--ui-row-hover-background)}.row-hover[aria-current]{background:var(--ui-row-active-background)}
      .truncate{color:var(--ui-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .meta{margin-left:auto;font-size:11px;color:var(--ui-text-tertiary)}
      .status{display:inline-block;width:7px;height:7px;background:rgb(34,197,94);border-radius:50%}
      #other{position:absolute;left:340px;top:20px;color:rgb(200,100,50)}
      </style><style id="skin">${baseline}</style></head><body>
      <div data-tree-group="grp-sessions"><aside data-slot="sidebar">
        <button data-slot="sidebar-menu-button" id="nav"><svg id="nav-icon" viewBox="0 0 16 16"><path d="M3 12L12 3M8 3h4v4"/></svg><span>New chat</span></button>
        <button data-slot="sidebar-menu-button">Pull requests</button>
        <button data-slot="sidebar-menu-button">Scheduled</button>
        <button class="group/section-label"><span><span id="section">Projects</span></span></button>
        <div class="row-hover" aria-current="true" id="selected"><span class="truncate text-[0.8125rem]" id="selected-name">Interface project</span></div>
        <div class="row-hover" id="idle"><span class="truncate text-[0.8125rem]" id="name">Review sidebar contrast</span><span class="meta" id="meta">2h</span></div>
        <div class="row-hover"><span class="truncate text-[0.8125rem]">Prepare next release</span><span class="status" id="status"></span></div>
        <button class="group/section-label"><span><span>Recent</span></span></button>
        <div class="row-hover"><span class="truncate text-[0.8125rem]">Compare model names</span></div>
        <div class="row-hover"><span class="truncate text-[0.8125rem]">A longer conversation title that truncates</span></div>
      </aside></div><span id="other">Other pane</span>
      <script>
      window.snapshot=()=>{
        const by=id=>document.getElementById(id), style=id=>getComputedStyle(by(id));
        const rgba=color=>{let c=document.createElement('canvas');c.width=c.height=1;let x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data]};
        const geometry=id=>{let e=by(id),r=e.getBoundingClientRect(),s=style(id);return [r.x,r.y,r.width,r.height,s.fontSize,s.fontWeight,s.lineHeight,s.borderRadius]};
        return {section:rgba(style('section').color),name:rgba(style('name').color),selectedName:rgba(style('selected-name').color),icon:rgba(style('nav-icon').color),nav:rgba(style('nav').color),selected:rgba(style('selected').backgroundColor),idle:rgba(style('idle').backgroundColor),status:style('status').backgroundColor,meta:style('meta').color,other:style('other').color,bg:rgba('${bg}'),geometry:['section','name','nav','selected','idle'].map(geometry)};
      };
      </script></body></html>`
      await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
      const before = await browser.evaluate('snapshot()')
      const capture = async name => {
        if (!process.env.CODEX_SKIN_ARTIFACT_DIR || mode !== 'dark') return
        const { data } = await browser.call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 310, height: 620, scale: 1 } })
        await writeFile(path.join(process.env.CODEX_SKIN_ARTIFACT_DIR, `${name}.png`), Buffer.from(data, 'base64'))
      }
      await capture('sidebar-before')
      await browser.evaluate(`document.getElementById('skin').textContent=${JSON.stringify(CSS)}`)
      const after = await browser.evaluate('snapshot()')

      await capture('sidebar-after')
      const composite = (color, bg) => color.slice(0, 3).map((v, i) => v * color[3] / 255 + bg[i] * (1 - color[3] / 255))
      const luminance = rgb => rgb.slice(0, 3).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
      const contrast = (color, bg) => { const a = luminance(composite(color, bg)), b = luminance(bg); return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05) }
      assert.ok(contrast(after.name, after.bg) > contrast(after.section, after.bg), 'conversation names outrank section headings')
      assert.ok(contrast(after.section, after.bg) >= 4.5, 'section labels remain readable')
      assert.ok(contrast(after.name, after.bg) >= 4.5, 'conversation names remain readable')
      assert.deepEqual(after.icon, after.section, 'utility icons share the quieter hierarchy')
      assert.deepEqual(after.geometry, before.geometry, 'contrast changes do not change layout or typography')
      for (const key of ['status','meta','other']) assert.equal(after[key], before[key], `${key} remains native`)
      const point = await browser.evaluate(`(()=>{let r=document.getElementById('selected').getBoundingClientRect();return {x:r.x+4,y:r.y+4}})()`)
      await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', ...point })
      assert.deepEqual((await browser.evaluate('snapshot()')).selected, after.selected, 'hover does not erase selection')
      const idlePoint = await browser.evaluate(`(()=>{let r=document.getElementById('idle').getBoundingClientRect();return {x:r.x+4,y:r.y+4}})()`)
      await browser.call('Input.dispatchMouseEvent', { type:'mouseMoved', ...idlePoint })
      const hovered = await browser.evaluate('snapshot()')
      assert.ok(hovered.idle[3] > 0 && hovered.idle[3] < after.selected[3], 'hover is subtler than selection')
      await browser.evaluate(`document.documentElement.removeAttribute('data-codex-chat-look')`)
      assert.equal((await browser.evaluate('snapshot()')).status, before.status)
      console.log(JSON.stringify({ mode, nameContrast:contrast(after.name,after.bg), sectionContrast:contrast(after.section,after.bg), selectedAlpha:after.selected[3] }))
    } finally { browser.close() }
  })
}
