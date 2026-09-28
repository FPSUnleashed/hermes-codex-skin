import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

// Current native ancestry: dock > drawer > clip > content > stack. The
// drawer owns collapse; the skin must find the stack without taking that over.
const stack = id => `<div data-slot="composer-status-stack" class="stack"><div class="frame"><div data-slot="status-stack-scroll"><div data-slot="status-stack-content" id="${id}"><div data-slot="status-stack-section"><div data-slot="status-section"><div class="status-section-header"><button class="toggle"><span class="codicon-checklist"></span>Tasks</button></div><div class="status-section-body">${Array.from({ length: 35 }, (_, i) => `<div class="status-row" data-slot="status-row">Task ${i}</div>`).join('')}</div></div></div><div data-slot="status-stack-section"><button class="queue">Queued message</button></div></div></div></div></div>`
const dock = (id, wrapped) => `<div data-slot="composer-dock" style="position:relative;width:450px">${wrapped ? `<div class="status-drawer"><div class="status-drawer-clip"><div class="status-drawer-content">${stack(id)}</div></div></div>` : stack(id)}<div data-slot="composer-root"><div data-slot="composer-surface">Composer</div></div></div>`

async function setup(browser, html) {
  const { CSS, decorateComposerChrome, clearComposerChromeDecorations } = await loadPluginInternals(['CSS', 'decorateComposerChrome', 'clearComposerChromeDecorations'])
  const { frameTree } = await browser.call('Page.getFrameTree')
  await browser.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false })
  await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<html><head><style>
    * { box-sizing: border-box } body { margin: 0; display: flex; gap: 12px; font: 12px sans-serif }
    :root { --background:#002b36; --foreground:#93a1a1; --card:#073642; --ui-bg-tertiary:#073642; --ui-chat-surface-background:var(--background); --ui-editor-surface-background:var(--card); --ui-text-primary:var(--foreground) }
    .status-drawer { display:grid; grid-template-rows:1fr }
    .status-drawer[data-collapsed] { grid-template-rows:0fr }
    .status-drawer-clip { min-height:0; overflow:hidden }
    .status-drawer[data-collapsed] .status-drawer-content { visibility:hidden; opacity:0 }
    .stack { display:flex; max-height:40vh; min-height:0; flex-direction:column; overflow:hidden }
    .frame { background:var(--card); display:flex; min-height:0; max-height:inherit; flex-direction:column; overflow:hidden; border-radius:16px 16px 0 0 }
    [data-slot="status-stack-scroll"] { min-height:0; overflow-y:auto }
    .status-row { height:24px } button { height:24px }
    </style><style id="skin">${CSS}</style></head><body>${html}</body></html>` })
  await browser.evaluate(`window.decorate = ${decorateComposerChrome.toString()}; window.clearDecorations = ${clearComposerChromeDecorations.toString()}; window.enable = () => { document.documentElement.dataset.codexChatLook = 'true'; decorate() }; window.disable = () => { clearDecorations(); document.documentElement.removeAttribute('data-codex-chat-look') }`)
}

const painted = `id => { const el=document.getElementById(id); const s=getComputedStyle(el); return {decorated:el.dataset.codexStatusCard, background:s.backgroundColor, radius:s.borderTopLeftRadius, task:el.firstElementChild.dataset.codexTaskSection, scroll:getComputedStyle(el.querySelector('.status-section-body')).overflowY} }`

for (const theme of ['dark', 'light', 'solarized']) {
  test(`status drawer receives its themed card and retains native collapse (${theme})`, async () => {
    const b = await chromium()
    try {
      await setup(b, dock('wrapped', true) + dock('legacy', false))
      const result = await b.evaluate(`(() => {
        const colors = {dark:['#181818','#eaeaea','#242424'],light:['#ffffff','#222222','#ededed'],solarized:['#002b36','#93a1a1','#073642']}[${JSON.stringify(theme)}];
        ['--background','--foreground','--card'].forEach((key,i)=>document.documentElement.style.setProperty(key,colors[i]));
        document.documentElement.style.setProperty('--ui-bg-tertiary',colors[2]);
        const frame=document.querySelector('.frame'), nativePaint=getComputedStyle(frame).backgroundColor;
        window.queueClicks=0; document.querySelector('.queue').onclick=()=>queueClicks++;
        enable(); decorate();
        const inspect=${painted};
        const wrapped=inspect('wrapped'), legacy=inspect('legacy');
        const body=document.querySelector('.status-section-body'); body.scrollTop=120;
        const scrolled=body.scrollTop;
        document.querySelector('.queue').click();
        const drawer=document.querySelector('.status-drawer'); drawer.setAttribute('data-collapsed',''); drawer.inert=true;
        const collapsed={height:drawer.getBoundingClientRect().height,visibility:getComputedStyle(drawer.querySelector('.status-drawer-content')).visibility,inert:drawer.inert};
        drawer.removeAttribute('data-collapsed'); drawer.inert=false;
        const reopened=drawer.getBoundingClientRect().height;
        disable();
        return {wrapped,legacy,nativePaint,scrolled,collapsed,reopened,queueClicks,restored:getComputedStyle(frame).backgroundColor,decorations:document.querySelectorAll('[data-codex-status-card],[data-codex-task-section],[data-codex-has-task-section]').length};
      })()`)
      for (const card of [result.wrapped, result.legacy]) {
        assert.equal(card.decorated, 'true', 'native stack must be discovered behind drawer wrappers')
        assert.notEqual(card.background, 'rgba(0, 0, 0, 0)', 'replacement card must actually paint')
        assert.equal(card.radius, '20px')
        assert.equal(card.task, 'true')
        assert.equal(card.scroll, 'auto')
      }
      assert.equal(result.wrapped.background, result.legacy.background)
      assert.ok(result.scrolled > 0, 'long Tasks body must scroll')
      assert.equal(result.collapsed.height, 0)
      assert.equal(result.collapsed.visibility, 'hidden')
      assert.equal(result.collapsed.inert, true)
      assert.ok(result.reopened > 0)
      assert.equal(result.queueClicks, 1)
      assert.equal(result.restored, result.nativePaint)
      assert.equal(result.decorations, 0)
    } finally { b.close() }
  })
}

test('late mounted and replaced drawers decorate independently and clean up', async () => {
  const b = await chromium()
  try {
    await setup(b, dock('first', true))
    const result = await b.evaluate(`(() => {
      enable();
      document.body.insertAdjacentHTML('beforeend',${JSON.stringify(dock('second', true))}); decorate();
      const inspect=${painted}; const first=inspect('first'), second=inspect('second');
      document.getElementById('first').closest('.status-drawer-content').innerHTML=${JSON.stringify(stack('replacement'))}; decorate();
      const replacement=inspect('replacement');
      clearDecorations(); decorate(); const reloaded=inspect('second');
      disable(); return {first,second,replacement,reloaded,remaining:document.querySelectorAll('[data-codex-status-card]').length};
    })()`)
    for (const card of [result.first, result.second, result.replacement, result.reloaded]) {
      assert.equal(card.decorated, 'true')
      assert.notEqual(card.background, 'rgba(0, 0, 0, 0)')
    }
    assert.equal(result.remaining, 0)
  } finally { b.close() }
})
