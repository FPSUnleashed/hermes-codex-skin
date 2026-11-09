import { readFile } from 'node:fs/promises'
import { chromium } from './chromium.mjs'
import { testDependencyRequire } from './reference-paths.mjs'

// Both modes execute the complete shipping module and stylesheet. DOM mode
// checks projection/handlers only, never native layout or Web Animations.
const pluginUrl = process.env.CODEX_CLEAN_TEST_PLUGIN
  ? new URL(process.env.CODEX_CLEAN_TEST_PLUGIN, `file://${process.cwd()}/`)
  : new URL('../../codex-chat-look/plugin.js', import.meta.url)
const source = (await readFile(pluginUrl, 'utf8'))
  .replace(/^import .*$/gm, '')
  .replace(/export default\s*\{/, 'globalThis.testPlugin = {')

export const actions = '<div data-slot="aui_msg-actions"><button>Copy</button></div>'
export const message = (id, text, footer = '', extra = '') => `<div id="${id}" data-message-id="${id}" data-role="assistant" data-slot="aui_assistant-message-root" ${extra}><div data-slot="aui_assistant-message-content">${text}</div>${footer}</div>`

export async function transcriptFixture(html, body) {
  const markup = `<html data-codex-chat-look="true" data-codex-clean-transcript="on"><head></head><body>${html}</body></html>`
  let browser, dom
  try {
    if (process.env.CODEX_TRANSCRIPT_TEST_DOM === '1') {
      const { JSDOM } = testDependencyRequire()('jsdom')
      dom = new JSDOM(markup, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://transcript-fixture.invalid/#/test' })
      dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
      dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    } else {
      browser = await chromium()
      const { frameTree } = await browser.call('Page.getFrameTree')
      await browser.call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: markup })
    }
    const script = `(async () => {
      const host = {}, PALETTE_AREA = 'palette', THEMES_AREA = 'themes', TITLEBAR_AREAS = { center: 'center' }, jsx = () => null, useEffect = () => {}, useRef = () => ({current:null}), useQuery = () => ({});
      ${source}
      const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
      const runtimeErrors = [];
      const onError = event => runtimeErrors.push(String(event.error || event.reason || event.message));
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onError);
      const element = id => document.getElementById(id);
      // Walk ancestors: a child's computed display alone does not establish
      // visibility when its owning native activity row is collapsed.
      const visible = id => {
        const node = element(id);
        if (!node?.isConnected) return false;
        for (let current = node; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
      };
      const marked = id => element(id).getAttribute('data-codex-activity-item');
      const header = (id = 'pair') => element(id).querySelector(':scope > [data-codex-turn-activity]');
      const reconcile = () => { for (const pair of document.querySelectorAll('[data-slot="aui_turn-pair"]')) reconcileTurnActivity(pair); };
      try {
        const result = await (async () => { ${body} })();
        if (runtimeErrors.length) throw Error('Transcript runtime errors: ' + runtimeErrors.join('; '));
        return result;
      } finally {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onError);
      }
    })()`
    const result = dom ? await dom.window.eval(script) : await browser.evaluate(script)
    return JSON.parse(JSON.stringify(result))
  } finally {
    dom?.window.close()
    browser?.close()
  }
}
