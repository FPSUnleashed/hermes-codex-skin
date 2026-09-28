import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Same native inline/absolute header structures as the installed measurement.
// Compare chat to a real preview-marked group, not two generic tab strips.
test('chat, sidebar and preview tabs share a vertical baseline and balanced margins', async () => {
  const browser = await chromium()
  try {
    const { CSS, BROWSER_PALETTE_CSS } = await loadPluginInternals(['CSS', 'BROWSER_PALETTE_CSS'])
    const { frameTree } = await browser.call('Page.getFrameTree')
    const pane = (id, preview = false) => `<section data-tree-group="${id}" data-window-top><div data-panel-header style="height:34px"><div aria-hidden="true" style="width:20px"></div><div data-zone-tabstrip="${id}"><div role="tablist"><div role="tab" data-tree-tab aria-selected="true">${id}</div></div></div><div aria-hidden="true" style="width:20px"></div></div>${preview ? '<aside data-preview-browser></aside>' : '<main></main>'}</section>`
    await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<html data-codex-chat-look="true"><head><style>
      *{box-sizing:border-box}body{margin:0}.panes{display:flex;width:100%}section{display:flex;flex-direction:column;width:33.333%;height:300px;min-width:0}[data-panel-header]{position:relative;display:flex;flex-shrink:0}[data-zone-tabstrip]{display:flex;flex:1;height:100%;min-width:0}[role=tablist]{display:flex;flex:1;min-width:0}[role=tab]{display:flex;align-items:center;height:100%}.absolute{position:absolute;bottom:0;left:0;right:0}
      ${CSS}${BROWSER_PALETTE_CSS}</style></head><body><div class="panes">${pane('grp-sessions')}${pane('grp-main')}${pane('preview', true)}</div></body></html>` })
    for (const cramped of [false, true]) for (const zoom of [1, 0.8, 1.25]) {
      await browser.evaluate(`document.documentElement.style.zoom=${JSON.stringify(String(zoom))};document.querySelectorAll('[data-panel-header]').forEach(el=>el.style.height=${JSON.stringify(cramped ? '62px' : '34px')});document.querySelectorAll('[data-zone-tabstrip]').forEach(el=>el.classList.toggle('absolute',${cramped}))`)
      const rows = await browser.evaluate(`Array.from(document.querySelectorAll('section')).map(group=>{
        const header=group.querySelector('[data-panel-header]').getBoundingClientRect(),strip=group.querySelector('[data-zone-tabstrip]').getBoundingClientRect(),tab=group.querySelector('[role=tab]').getBoundingClientRect();
        return {id:group.dataset.treeGroup,header:header.height,strip:strip.height,tab:tab.height,top:tab.top,bottom:tab.bottom,above:tab.top-strip.top,below:strip.bottom-tab.bottom};
      })`)
      const reference = rows.find(row => row.id === 'preview')
      for (const row of rows) {
        for (const key of ['header', 'strip', 'tab', 'top', 'bottom', 'above', 'below']) assert.ok(Math.abs(row[key] - reference[key]) < 0.1, `${row.id} ${key} differs from preview: ${JSON.stringify(rows)}`)
        assert.ok(Math.abs(row.strip - 48 * zoom) < 0.1)
        assert.ok(Math.abs(row.tab - 28 * zoom) < 0.1)
        assert.ok(Math.abs(row.above - 10 * zoom) < 0.1)
        assert.ok(Math.abs(row.above - row.below) < 0.1)
        assert.ok(Math.abs(row.header - 48 * zoom) < 0.1, 'all control bands keep their height even when the native strip is absolute')
      }
    }
    await browser.evaluate(`document.documentElement.style.zoom='1';document.querySelectorAll('[data-zone-tabstrip]').forEach(el=>el.classList.remove('absolute'));document.querySelectorAll('[data-panel-header]').forEach(el=>el.style.height='34px');document.documentElement.removeAttribute('data-codex-chat-look')`)
    const disabled = await browser.evaluate(`Array.from(document.querySelectorAll('[data-panel-header]')).map(el=>el.getBoundingClientRect().height)`)
    assert.deepEqual(disabled, [34, 34, 34], 'disabling the skin restores native header sizing')
  } finally {
    browser.close()
  }
})
