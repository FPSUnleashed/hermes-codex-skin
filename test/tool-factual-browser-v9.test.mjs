import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {chromium, waitForRendered} from './helpers/chromium.mjs'
import {nativeFactualBundle, sequenceSource, installSequence} from './helpers/native-factual-v9.mjs'
import {shippingCSS} from './helpers/native-background.mjs'
import {T3_SOURCE_PALETTES} from '../src/t3-themes.js'
import {t3ThemePaintCSS} from '../src/t3-theme-paint.js'
// Do not set this until the shared-browser owner explicitly releases its lease.
const authorized = process.env.CODEX_V9_BROWSER_AUTHORIZED === '1'
test('v9 browser matrix: public captions, opaque native groups, Hammer paint, bounds and AX', {skip:!authorized}, async () => {
  const css = await shippingCSS()
  const nativeCSS = await readFile(process.env.HERMES_INSTALLED_ROW_CSS, 'utf8')
  const native = await nativeFactualBundle(), runtime = await sequenceSource()
  const matrix = []
  for (const width of [320, 900]) for (const locale of ['en','fr']) for (const live of [false,true]) {
    const b = await chromium()
    try {
      const config = {live,summary:locale==='fr'?'Exploration de 4 fichiers, exécution de 17 commandes':'Explored 4 files, ran 17 commands',tool:locale==='fr'?'Fichier wiring.tsx modifié':'Edited wiring.tsx'}
      const expected = live ? config.tool : `${config.summary} · ${config.tool}`
      await b.call('Emulation.setDeviceMetricsOverride', {width,height:600,deviceScaleFactor:1,mobile:false})
      await b.call('Page.setDocumentContent', {frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html data-codex-chat-look="true" data-hermes-theme="codex-t3-chat" data-hermes-mode="dark"><head><style>${nativeCSS}</style><style>${css}</style><style>${t3ThemePaintCSS('t3-chat',T3_SOURCE_PALETTES['t3-chat'])}</style><style>body{margin:0;padding:16px;box-sizing:border-box}section{width:100%;max-width:760px}:root{--conversation-tool-font-size:14px;--conversation-line-height:24px}</style></head><body><div id="fixture"></div></body></html>`})
      await b.evaluate(`window.config=${JSON.stringify(config)}`)
      await b.evaluate(native)
      await waitForRendered(b,`document.querySelector('#t button')`,'React native rows')
      await b.evaluate(`window.nativeRunButton=document.querySelector('#g button');window.nativeTargets=[];document.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.closest('[data-codex-tool-sequence]'))nativeTargets.push(button===nativeRunButton?'run':button.closest('[id]')?.id||'other')},true)`)
      await b.evaluate(installSequence(runtime))
      const snapshot = await b.evaluate(`(()=>{const b=header(),r=b.getBoundingClientRect(),face=b.querySelector('[data-codex-activity-face]'),f=face.getBoundingClientRect();return {label:b.getAttribute('aria-label'),visible:b.querySelector('[data-codex-tool-sequence-label]').textContent,expanded:b.getAttribute('aria-expanded'),nativeClicks,nativeOpen:document.querySelector('#g button').getAttribute('aria-expanded'),bounds:[r.x,r.y,r.width,r.height],face:[f.x,f.y,f.width,f.height],overflow:document.documentElement.scrollWidth>innerWidth}})()`)
      assert.equal(snapshot.label, expected)
      assert.equal(snapshot.visible, expected)
      assert.equal(snapshot.nativeClicks,0)
      assert.equal(snapshot.nativeOpen,'false')
      assert.equal(snapshot.overflow,false)
      assert.ok(snapshot.bounds[2]>0 && snapshot.bounds[3]>=24)
      assert.ok(snapshot.face[0]>=0 && snapshot.face[0]+snapshot.face[2]<=width)
      const ax = (await b.call('Accessibility.getFullAXTree')).nodes.filter(n=>n.role?.value==='button'&&!n.ignored).map(n=>n.name?.value)
      assert.ok(ax.includes(expected))
      assert.ok(!ax.includes('Tool activity'))
      // Reconciliation never clicks. Explicit expansion opens only the native run.
      await b.evaluate('header().focus()')
      for (const type of ['keyDown','keyUp']) await b.call('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})})
      assert.equal(await b.evaluate('header().getAttribute("aria-expanded")'),'true')
      await waitForRendered(b,`document.querySelector('#g button').getAttribute('aria-expanded')==='true'`,'native run opened by explicit Enter')
      assert.deepEqual(await b.evaluate(`({targets:nativeTargets,nestedOpen:document.querySelector('#nested button')?.getAttribute('aria-expanded'),toolOpen:document.querySelector('#t button').getAttribute('aria-expanded'),results:document.querySelectorAll('pre').length,sameButton:document.querySelector('#g button')===nativeRunButton})`),{targets:['run'],nestedOpen:'false',toolOpen:'false',results:0,sameButton:true})
      // The requested Hammer role now follows the same scaffold text as Thinking.
      const paint = await b.evaluate(`(()=>{const s=getComputedStyle(document.querySelector('#g button'),'::before');const reference=getComputedStyle(document.querySelector('#g [class~="text-(--conversation-scaffold-text)"]')).color;return{color:s.color,reference,background:s.backgroundColor,mask:s.maskImage,width:s.width,height:s.height,nativeClicks}})()`)
      assert.equal(paint.color,paint.reference)
      assert.equal(paint.background,paint.reference)
      assert.notEqual(paint.mask,'none')
      assert.equal(paint.width,'24px');assert.equal(paint.height,'24px')
      assert.equal(paint.nativeClicks,1)
      for (const type of ['keyDown','keyUp']) await b.call('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32,...(type==='keyDown'?{text:' '}:{})})
      assert.equal(await b.evaluate('header().getAttribute("aria-expanded")'),'false')
      await b.evaluate('sync();runtime.reconcileObserved(pair,scope)')
      assert.deepEqual(await b.evaluate(`({clicks:nativeClicks,targets:nativeTargets,runOpen:document.querySelector('#g button').getAttribute('aria-expanded'),results:document.querySelectorAll('pre').length})`),{clicks:1,targets:['run'],runOpen:'true',results:0})
      if (process.env.CODEX_V9_SCREENSHOTS) {
        await mkdir(process.env.CODEX_V9_SCREENSHOTS,{recursive:true})
        const {data}=await b.call('Page.captureScreenshot',{format:'png'})
        await writeFile(`${process.env.CODEX_V9_SCREENSHOTS}/v9-${width}-${locale}-${live?'active':'settled'}.png`,Buffer.from(data,'base64'))
      }
      matrix.push({width,locale,live,snapshot,paint,ax})
    } finally {b.close()}
  }
  console.log('V9_BROWSER_MATRIX '+JSON.stringify(matrix))
})
