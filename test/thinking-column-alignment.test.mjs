import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { chromium, waitForRendered } from './helpers/chromium.mjs'

const core = referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const require = createRequire(`${core}/package.json`)
const ts = require('typescript')
const sources = {}
async function source(relative) {
  const text = await readFile(`${core}/${relative}`, 'utf8')
  sources[relative] = createHash('sha256').update(text).digest('hex')
  return ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}
function nodes(file, predicate) {
  const result = []
  function visit(n) { if (predicate(n)) result.push(n); ts.forEachChild(n, visit) }
  visit(file)
  return result
}
function unique(matches, label) { assert.equal(matches.length, 1, label); return matches[0] }
function slot(file, name) {
  return unique(nodes(file, n => ts.isJsxElement(n) && n.openingElement.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(file) === 'data-slot' && a.initializer?.text === name)), name)
}
function shell(node, file, children) { return node.openingElement.getText(file) + children + node.closingElement.getText(file) }
function declaration(file, name) {
  const n = unique(nodes(file, n => (ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name?.getText(file) === name), name)
  return ts.isFunctionDeclaration(n) ? n.getText(file) : `const ${n.getText(file)};`
}
const assistant = await source('apps/desktop/src/components/assistant-ui/thread/assistant-message.tsx')
const list = await source('apps/desktop/src/components/assistant-ui/thread/list.tsx')
const response = await source('apps/desktop/src/components/assistant-ui/thread/response-group.tsx')
const fallback = await source('apps/desktop/src/components/assistant-ui/tool/fallback.tsx')
const tool = unique(nodes(fallback, n => ts.isJsxElement(n) && n.openingElement.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(fallback) === 'data-tool-row')), 'native ToolEntry row')
const header = unique(tool.children.filter(ts.isJsxElement), 'native ToolEntry header')
const toolJSX = shell(tool, fallback, header.getText(fallback))
const wrappers = [
  ['NativeContent', assistant, 'aui_assistant-message-content'],
  ['NativeAssistant', assistant, 'aui_assistant-message-root'],
  ['NativeResponse', response, 'aui_response-group'],
  ['NativePair', list, 'aui_turn-pair'],
  ['NativeGroup', list, 'aui_message-group'],
  ['NativeLane', list, 'aui_thread-content']
].map(([name, file, nameSlot]) => `function ${name}({children}){return (${shell(slot(file, nameSlot), file, '{children}')})}`).join('\n')

// Extend the existing native status/Stop harness at its fixture boundary only.
// The tool header, glyph, title, wrappers and DisclosureRow are original native
// producers. Settled tool context is fixed; no hand-authored padding/row DOM.
let harness = await readFile(new URL('./helpers/native-busy.mjs', import.meta.url), 'utf8')
// A data: module has no relative URL base; preserve the helper's file import.
harness = harness.replace("from './reference-paths.mjs'", `from '${new URL('./helpers/reference-paths.mjs', import.meta.url).href}'`)
function replaceOnce(before, after) {
  assert.equal(harness.split(before).length, 2, 'native fixture boundary must be unique')
  harness = harness.replace(before, () => after)
}
replaceOnce("import {SCAFFOLD_LABEL_CLASS} from './apps/desktop/src/components/chat/scaffold-row';", `
import {SCAFFOLD_LABEL_CLASS,SCAFFOLD_GLYPH_CLASS,SCAFFOLD_META_CLASS} from './apps/desktop/src/components/chat/scaffold-row';
import {DisclosureRow} from './apps/desktop/src/components/chat/disclosure-row';
import {ToolIcon} from './apps/desktop/src/components/ui/tool-icon';
import {FadeText} from './apps/desktop/src/components/ui/fade-text';`)
replaceOnce('function Fixture(){', `
const MessagePrimitive={Root:'div'},collapsedNotice=null,approval=false,activityOnly=false,onDoubleClick=undefined,enterRef=undefined;
const virtualized=false,renderEmpty=false,threadContentTopPad='',contentRef=undefined;
${wrappers}
${['TOOL_HEADER_GLYPH_WRAP_CLASS','ToolGlyph','leadingStatus','ToolTitle'].map(name => declaration(fallback, name)).join('\n')}
function NativeTool(){
 const open=false,isFileEdit=false,isPending=false,hasExpandableContent=false,dismissAction=undefined,trailing=null,memoryLegendary=false,showDiffStats=false,diffStats=null,memoryMetaClass='',copy={};
 const view={title:'Read native file',icon:'terminal',status:'success'};
 return (${toolJSX});
}
function Fixture(){`)
replaceOnce(`<main id='pane' data-slot='aui_thread-content'><div data-slot='aui_assistant-message-root'><div data-slot='aui_assistant-message-content'>
        {s.mode==='loading'?<ResponseLoadingIndicator/>:s.mode==='turn'?<TurnActivityIndicator thinking={s.thinking}/>:null}
      </div></div></main>`, `<NativeLane><NativeGroup><NativePair><NativeResponse><NativeAssistant><NativeContent>
 <NativeTool/>{s.mode==='loading'?<ResponseLoadingIndicator/>:s.mode==='turn'?<TurnActivityIndicator thinking={s.thinking}/>:null}
 </NativeContent></NativeAssistant></NativeResponse></NativePair></NativeGroup></NativeLane>`)
const { fixtureJS, fixtureCSS } = await import('data:text/javascript;base64,' + Buffer.from(harness).toString('base64'))
const nativeCSS = await readFile(referenceFile('HERMES_INSTALLED_ROW_CSS'), 'utf8')
const pluginSource = await readFile(process.env.THINKING_ALIGNMENT_BUNDLE || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
const pluginRuntime = pluginSource.replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.fixturePlugin = {')
console.log('THINKING_ALIGNMENT_PROVENANCE ' + JSON.stringify({sources, plugin:createHash('sha256').update(pluginSource).digest('hex')}))

// CDP exposes generated boxes directly: no CSS arithmetic or substituted label
// is used to measure the Brain center or Thinking's actual inline start.
async function geometry(b, dir) {
  const selector = '[data-slot="aui_response-loading"],[data-slot="aui_turn-activity"][data-state="active"]'
  await b.evaluate(`new Promise(resolve=>{document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();requestAnimationFrame(()=>requestAnimationFrame(resolve))})`)
  const {root} = await b.call('DOM.getDocument')
  const {nodeId} = await b.call('DOM.querySelector', {nodeId:root.nodeId,selector})
  const {node} = await b.call('DOM.describeNode', {nodeId,depth:1})
  const box = async type => {
    const pseudo = unique(node.pseudoElements.filter(n => n.pseudoType === type), type)
    return (await b.call('DOM.getBoxModel', {backendNodeId:pseudo.backendNodeId})).model.content
  }
  const icon = await box('before'), label = await box('after')
  const native = await b.evaluate(`(()=>{
    const row=document.querySelector(${JSON.stringify(selector)}),before=getComputedStyle(row,'::before');
    const button=document.querySelector('[data-tool-row] button'),inner=button.firstElementChild.firstElementChild,icon=inner.firstElementChild.getBoundingClientRect(),label=inner.children[1].getBoundingClientRect();
    return{toolCenter:icon.x+icon.width/2,toolLabel:${dir === 'rtl'}?label.right:label.left,width:parseFloat(before.width),after:getComputedStyle(row,'::after').content,timer:row.lastElementChild.textContent,toolWidth:icon.width};
  })()`)
  return {...native,iconCenter:(icon[0]+icon[2])/2,labelStart:dir==='rtl'?label[2]:label[0]}
}
for (const scale of [1, 1.75]) for (const dir of ['ltr', 'rtl']) test(`Thinking shares native tool icon center and text start (${scale}x ${dir})`, async () => {
  const b = await chromium()
  try {
    await b.call('Emulation.setDeviceMetricsOverride', {width:960,height:900,deviceScaleFactor:1,mobile:false})
    await b.call('Page.setDocumentContent', {frameId:(await b.call('Page.getFrameTree')).frameTree.frame.id,html:`<!doctype html><html dir="${dir}"><head><style>${nativeCSS}</style><style>${fixtureCSS}</style><style>:root{font-size:16px;--chat-text-scale:${scale};--ui-base:#eee;--ui-text-primary:#eee;--ui-text-secondary:#aaa;--ui-text-tertiary:#888;--ui-chat-surface-background:#181818}body{margin:0}[data-slot="aui_thread-content"]{width:720px}</style></head><body><div id="fixture"></div></body></html>`})
    await b.evaluate(fixtureJS)
    await waitForRendered(b, `document.querySelector('[data-tool-row] button')&&document.querySelector('[data-slot="aui_response-loading"]')`, 'native producers mounted')
    await b.evaluate(`(()=>{const state=value=>({get:()=>value,subscribe:()=>()=>{}});const host={state:{activeSessionId:state('fixture'),gateway:state('open'),profile:state('default')},onEvent:()=>()=>{}};const jsx=()=>null,useEffect=()=>{},useRef=()=>({current:null}),useQuery=()=>({}),THEMES_AREA='themes',PALETTE_AREA='palette',TITLEBAR_AREAS={};${pluginRuntime};const style=document.createElement('style');style.textContent=CSS;document.head.append(style);document.documentElement.setAttribute('data-codex-chat-look','true');window.qualifyQuietStatus=()=>{const row=document.querySelector('[data-slot="aui_response-loading"],[data-slot="aui_turn-activity"][data-state="active"]');document.querySelectorAll('[data-slot="aui_turn-pair"]').forEach(p=>reconcileTurnActivity(p));const style=getComputedStyle(row),rect=row.getBoundingClientRect();return {same:row===document.querySelector('[data-slot="aui_response-loading"],[data-slot="aui_turn-activity"][data-state="active"]'),clip:style.clipPath,width:rect.width,height:rect.height,timer:row.lastElementChild.textContent,header:!!document.querySelector('[data-codex-turn-activity]')}};window.restoreQuietStatus=()=>clearTurnActivityDecorations();})()`)
    for (const mode of ['loading', 'turn']) {
      if (mode === 'turn') {
        await b.evaluate(`window.updateBusy({mode:'turn'})`)
        await waitForRendered(b, `document.querySelector('[data-slot="aui_turn-activity"][data-state="active"]')`, 'native quiet window activates', 3000)
      }
      const g = await geometry(b, dir)
      console.log('THINKING_ALIGNMENT_GEOMETRY '+JSON.stringify({scale,dir,mode,...g}))
      assert.ok(Math.abs(g.iconCenter-g.toolCenter)<.1, 'Brain center must match the actual native tool icon: '+JSON.stringify(g))
      assert.ok(Math.abs(g.labelStart-g.toolLabel)<.15, 'Thinking inline start must match the actual native tool title: '+JSON.stringify(g))
      assert.equal(g.after, '"Thinking"')
      assert.equal(g.width,16*scale, 'Brain glyph keeps its original chat scaling')
      assert.ok(g.timer.length, 'native timer retained')
      assert.equal(g.toolWidth,24, 'tool column unchanged')
      // Independently measured duplicate status is a clipped 1px native leaf
      // once Working owns the row, not a visible misaligned Brain. Keep both
      // the visible initial-wait geometry and this suppression contract.
      const quiet=await b.evaluate('qualifyQuietStatus()')
      console.log('THINKING_QUIET_STATUS '+JSON.stringify({scale,dir,mode,...quiet}))
      assert.deepEqual(quiet,{same:true,clip:'inset(50%)',width:1,height:1,timer:g.timer,header:true})
      await b.evaluate('restoreQuietStatus();true')
    }
  } finally { b.close() }
})
