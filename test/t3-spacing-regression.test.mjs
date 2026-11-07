import { referenceFile, referenceRoot } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { T3_SUBAGENT_CSS } from '../src/t3-subagent-style.js'

const core = referenceRoot('HERMES_DESKTOP_SOURCE_ROOT')
const t3 = referenceRoot('T3_REFERENCE_SOURCE_ROOT')
const cssPath = referenceFile('HERMES_INSTALLED_ROW_CSS')
const nativeCSS = await readFile(cssPath, 'utf8')
// Read once: concurrent CSS work cannot change the candidate during a run.
const pluginSource = await readFile(process.env.CODEX_SPACING_TEST_PLUGIN || new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
const sha = text => createHash('sha256').update(text).digest('hex')
const require = createRequire(`${core}/package.json`)
const ts = require('typescript')
const sources = {}
async function source(relative, root = core) {
  const text = await readFile(`${root}/${relative}`, 'utf8')
  sources[`${root}/${relative}`] = sha(text)
  return ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}
function nodes(file, predicate) {
  const found = []
  function visit(node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit) }
  visit(file)
  return found
}
function slot(file, name) {
  const found = nodes(file, n => ts.isJsxElement(n) && n.openingElement.attributes.properties.some(a =>
    ts.isJsxAttribute(a) && a.name.getText(file) === 'data-slot' && a.initializer?.text === name))
  assert.equal(found.length, 1, `native wrapper ${name} must be unambiguous`)
  return found[0]
}
// Render the actual wrapper JSX from native source, not a copied class list or
// a simplified hand-authored DOM. Only children/context boundaries are replaced.
function shell(node, file, children) {
  return `${node.openingElement.getText(file)}${children}${node.closingElement.getText(file)}`
}
function declaration(file, name) {
  const found = nodes(file, n => (ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name?.getText(file) === name)
  assert.equal(found.length, 1, `native declaration ${name}`)
  return ts.isFunctionDeclaration(found[0]) ? found[0].getText(file) : `const ${found[0].getText(file)};`
}
const assistant = await source('apps/desktop/src/components/assistant-ui/thread/assistant-message.tsx')
const list = await source('apps/desktop/src/components/assistant-ui/thread/list.tsx')
const response = await source('apps/desktop/src/components/assistant-ui/thread/response-group.tsx')
const markdown = await source('apps/desktop/src/components/assistant-ui/markdown-text.tsx')
const fallback = await source('apps/desktop/src/components/assistant-ui/tool/fallback.tsx')
const worklog = await source('apps/web/src/components/chat/WorkLog.tsx', t3)
const timestamp = await source('apps/desktop/src/components/assistant-ui/thread/timeline-timestamp.tsx')
const footerDeclaration = nodes(assistant, n => ts.isVariableDeclaration(n) && n.name?.getText(assistant) === 'AssistantFooter')[0]
const footerOuter = nodes(footerDeclaration, n => ts.isJsxElement(n))[0]
const nativeFooter = shell(footerOuter, assistant, '{children}')
const nativeActions = shell(slot(assistant, 'aui_msg-actions'), assistant, '{children}')
const nativeActionOuter = shell(slot(assistant, 'aui_msg-actions').parent, assistant, '{children}')
const nativeStamp = shell(slot(timestamp, 'timeline-timestamp'), timestamp, '<time>12:14:05</time>')
const hoverTime = await source('apps/desktop/src/components/assistant-ui/thread/message-hover-time.tsx')
const nativeHoverTime = shell(nodes(hoverTime, n => ts.isJsxElement(n) && n.openingElement.tagName.getText(hoverTime) === 'time')[0], hoverTime, '12:14')
const nativeAssistant = shell(slot(assistant, 'aui_assistant-message-root'), assistant,
  shell(slot(assistant, 'aui_assistant-message-content'), assistant, '{children}') + '{stamp}{footer}')
const nativeResponse = shell(slot(response, 'aui_response-group'), response, '{children}')
const nativePair = shell(slot(list, 'aui_turn-pair'), list, '{children}')
const nativeGroup = shell(slot(list, 'aui_message-group'), list, '{children}')
const nativeLane = shell(slot(list, 'aui_thread-content'), list, '{children}')
const edges = {
  '@/app/chat/session-view': `import{atom}from'nanostores';const view={$runtimeId:atom('parent'),$storedId:atom('stored-parent')};export const useSessionView=()=>view;`,
  '@/i18n': `export const useI18n=()=>({t:{assistant:{tool:{statusRunning:'Running',statusError:'Failed',statusDone:'Done'}}}});`,
  '@/store/subagents': `import{atom}from'nanostores';export const $subagentsBySession=atom({parent:[{id:'delegate-tool:delegate:0',goal:'Audit child task',status:'completed',sessionId:'child',model:'gpt-6.1-sol',durationSeconds:64,taskIndex:0,stream:[{text:'Verified child output'}]}]});`,
  '@/store/windows': `export const openSessionInNewWindow=(id,options)=>window.opens.push({id,options});`
}
const { outputFiles } = await require('esbuild').build({
  stdin: { resolveDir: core, loader: 'tsx', contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{cn}from'./apps/desktop/src/lib/utils';
    import{DisclosureRow}from'./apps/desktop/src/components/chat/disclosure-row';
    import{ScaffoldRow,SCAFFOLD_LABEL_CLASS}from'./apps/desktop/src/components/chat/scaffold-row';
    import{FadeText}from'./apps/desktop/src/components/ui/fade-text';
    import{Button}from'./apps/desktop/src/components/ui/button';
    import{DelegateTool}from'./apps/desktop/src/components/assistant-ui/tool/delegate';
    const h=React.createElement,MessagePrimitive={Root:'div'},ActionBarPrimitive={Root:'div'},TimelineTimestamp=()=>null;
    const collapsedNotice=null,approval=false,activityOnly=false,onDoubleClick=undefined,enterRef=undefined;
    const virtualized=false,renderEmpty=false,threadContentTopPad='',contentRef=undefined;
    ${declaration(markdown, 'MARKDOWN_CONTAINER_CLASS_NAME')}
    ${declaration(fallback, 'ToolRunHeader')}
    ${declaration(worklog, 'WorkLogBlock')}
    function NativeAssistant({children,footer,stamp}){return (${nativeAssistant})}
    function NativeFooter({children}){return (${nativeFooter})}
    function NativeActions({children}){return (${nativeActions})}
    function NativeActionOuter({children}){return (${nativeActionOuter})}
    function Stamp({className='px-(--message-text-indent) pt-0.5'}){const title='Recorded message timestamp';return (${nativeStamp})}
    function HoverTime(){const className='mr-1 px-0.5',date=new Date('2026-10-31T12:14:05Z');return (${nativeHoverTime})}
    function NativeResponse({children}){return (${nativeResponse})}
    function NativePair({children}){return (${nativePair})}
    function NativeGroup({children}){return (${nativeGroup})}
    function NativeLane({children}){return (${nativeLane})}
    function Prose({id,text}){return <div id={id} className={MARKDOWN_CONTAINER_CLASS_NAME}><p>{text}</p></div>}
    function Tool({id}){const[open,setOpen]=useState(false);return <div id={id} data-slot="tool-block" data-tool-row="" data-conversation-scaffold="" data-tool-open={open?'':undefined} className="group/tool-block min-w-0 max-w-full overflow-hidden text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)"><DisclosureRow open={open} onToggle={()=>{window.toggles++;setOpen(!open)}}><span className={SCAFFOLD_LABEL_CLASS}>Read native file</span></DisclosureRow>{open&&<div data-native-detail=""><pre>Exact native output</pre><button onClick={()=>window.details++}>Inspect output</button></div>}</div>}
    function Summary({id}){const[open,setOpen]=useState(false);return <div id={id} data-slot="tool-block" data-tool-group="" className="grid min-w-0 max-w-full gap-(--tool-row-gap) overflow-hidden"><ToolRunHeader live={false} open={open} onToggle={()=>{window.toggles++;setOpen(!open)}} summary={window.shortLabels?'Read 2 files and ran 1 command':'Read '+Array.from({length:12},(_,i)=>'long/path/to/source-file-'+i+'.tsx').join(', ')+' and ran 1 command'}/>{open&&<div className="grid min-w-0 max-w-full gap-(--tool-row-gap)"><Tool id={id+'-call'}/><Tool id={id+'-call2'}/></div>}</div>}
    function Footer(){return <NativeFooter><NativeActionOuter><NativeActions><div className="aui-message-actions-desktop flex items-center justify-end gap-1.5"><HoverTime/><Button className="aui-button-icon" size="icon-xs" variant="ghost" aria-label="Copy message" onClick={()=>window.copies++}><svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 3h10v10H3z"/></svg></Button></div></NativeActions></NativeActionOuter></NativeFooter>}
    const parts=p=>[
      <Prose key="before" id={p+'-before'} text="Last assistant prose line before activity."/>,
      <Summary key="first" id={p+'-first'}/>,
      <Prose key="after" id={p+'-after'} text="Assistant prose after tool output."/>,
      <Summary key="second" id={p+'-second'}/>,<Summary key="third" id={p+'-third'}/>,
      <DelegateTool key="delegate" toolCallId="delegate" args={{tasks:[{goal:'Audit child task'}]}}/>,
      <Summary key="last" id={p+'-last'}/>,
      <Prose key="answer" id={p+'-answer'} text="Final answer remains visible and usable."/>
    ];
    function Scenario({id,split}){const children=parts(id);return <section id={id}><NativeGroup><NativePair><div data-role="user">Question</div><NativeResponse>{split?children.map((part,i)=><NativeAssistant key={i} stamp={i===2?<Stamp/>:null} footer={i===0||i===children.length-1?<Footer/>:null}>{part}</NativeAssistant>):<NativeAssistant footer={<Footer/>}>{children}</NativeAssistant>}</NativeResponse></NativePair></NativeGroup></section>}
    function Reference(){return <section id="t3-reference"><div id="t3-standalone"><WorkLogBlock><div data-reference-row="" style={{height:28}}/></WorkLogBlock><div data-next=""/></div><div id="t3-adjacent"><WorkLogBlock continues><div data-reference-row="" style={{height:28}}/></WorkLogBlock><div data-next=""/></div><div id="t3-expanded"><WorkLogBlock layout="group-content"><div data-reference-row="" style={{height:24}}/></WorkLogBlock><div data-next=""/></div></section>}
    window.toggles=0;window.details=0;window.copies=0;window.opens=[];
    createRoot(document.getElementById('fixture')).render(<NativeLane><Scenario id="same" split={false}/><Scenario id="split" split/><Reference/></NativeLane>);
  ` },
  bundle: true, format: 'iife', write: false, jsx: 'automatic', outdir: 't3-spacing-fixture',
  tsconfigRaw: { compilerOptions: { baseUrl: core, paths: { '@/*': ['apps/desktop/src/*'] } } },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'native-context-boundaries', setup(build) {
    build.onResolve({ filter: /^@\// }, args => args.path in edges ? { path: args.path, namespace: 'fixture-edge' } : args.path === '@/lib/icons' ? { path: 'fixture-icons', namespace: 'fixture-edge' } : undefined)
    build.onResolve({ filter: /^\.\/fallback-model$/ }, () => ({ path: 'fixture-format', namespace: 'fixture-edge' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture-edge' }, args => ({ contents: args.path === 'fixture-icons' ? `export {AlertCircle,CheckCircle2,Loader2} from 'lucide-react';` : args.path === 'fixture-format' ? `export {formatDurationSeconds,numberValue,parseMaybeObject} from './apps/desktop/src/components/assistant-ui/tool/fallback-model/format';` : edges[args.path], resolveDir: core }))
  } }]
})
const pluginRuntime = pluginSource.replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.fixturePlugin = {')
const receipt = { plugin: sha(pluginSource), nativeCSS: sha(nativeCSS), subagentCSS: sha(T3_SUBAGENT_CSS), sources }
console.log('SPACING_PROVENANCE ' + JSON.stringify(receipt))
async function settle(b) {
  await b.evaluate(`(async()=>{await document.fonts.ready;document.body.getBoundingClientRect();await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`)
}
async function fixture(scale = 1, width = 720, shortLabels = false) {
  const b = await chromium()
  try {
    await b.call('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 1, mobile: false })
    await b.call('Emulation.setFocusEmulationEnabled', { enabled: true })
    await b.call('Page.setDocumentContent', { frameId: (await b.call('Page.getFrameTree')).frameTree.frame.id, html: `<!doctype html><html><head><style>${nativeCSS}</style><style>${T3_SUBAGENT_CSS}</style><style>:root{font-size:16px;--chat-text-scale:${scale};--ui-base:#eee;--ui-chat-surface-background:#181818;--ui-text-primary:#eee;--ui-text-secondary:#aaa;--ui-text-tertiary:#888;--ui-stroke-secondary:#555;--ui-stroke-tertiary:#444;--ui-accent:#3b82f6}body{margin:0}[data-slot="aui_thread-content"]{width:${width}px}</style></head><body><div id="fixture"></div></body></html>` })
    await b.evaluate(`window.shortLabels=${shortLabels};` + outputFiles.find(f => f.path.endsWith('.js')).text)
    await b.evaluate(`new Promise((resolve,reject)=>{const end=performance.now()+3000;function ready(){if(document.querySelector('#split-answer'))resolve();else if(performance.now()>end)reject(Error('Native wrappers did not mount'));else requestAnimationFrame(ready)}ready()})`)
    await b.evaluate(`(()=>{const state=value=>({get:()=>value,subscribe:()=>()=>{}});const host={state:{activeSessionId:state('fixture'),gateway:state('open'),profile:state('default')},onEvent:()=>()=>{}};const jsx=()=>null,useEffect=()=>{},useRef=()=>({current:null}),useQuery=()=>({}),THEMES_AREA='themes',PALETTE_AREA='palette',TITLEBAR_AREAS={};${pluginRuntime};const style=document.createElement('style');style.textContent=CSS;document.head.append(style);window.reconcile=()=>document.querySelectorAll('[data-slot="aui_turn-pair"]').forEach(p=>reconcileTurnActivity(p));window.clearActivity=()=>clearTurnActivityDecorations();})()`)
    await settle(b)
    return b
  } catch (e) { b.close(); throw e }
}
async function enable(b, on = true) {
  await b.evaluate(on ? `document.documentElement.setAttribute('data-codex-chat-look','true');reconcile()` : `clearActivity();document.documentElement.removeAttribute('data-codex-chat-look')`)
  await settle(b)
}
async function click(b, selector) {
  await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`)
  await settle(b)
  const point = await b.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!el.contains(document.elementFromPoint(x,y)))throw Error('Native click target is covered');return{x,y}})()`)
  await b.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
  await b.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
  await settle(b)
}
async function expand(b) {
  for (const id of ['same', 'split']) await click(b, `#${id} [data-codex-turn-activity]`)
}
const geometryProbe = `(()=>{const r=e=>e.getBoundingClientRect(),s=e=>getComputedStyle(e),gap=(a,b)=>r(b).top-r(a).bottom;
 const style=e=>({slot:e.dataset.slot,display:s(e).display,gap:s(e).rowGap,mt:s(e).marginTop,mb:s(e).marginBottom,pt:s(e).paddingTop,pb:s(e).paddingBottom,height:r(e).height});
 return Object.fromEntries(['same','split'].map(id=>{const base=document.getElementById(id),q=x=>base.querySelector(x),before=q('#'+id+'-before'),first=q('#'+id+'-first'),after=q('#'+id+'-after'),second=q('#'+id+'-second'),third=q('#'+id+'-third'),delegate=q('[data-delegate-card]'),last=q('#'+id+'-last'),answer=q('#'+id+'-answer'),header=q('[data-codex-turn-activity]'),group=q('[data-slot="aui_response-group"]'),pair=q('[data-slot="aui_turn-pair"]');
 return[id,{proseToTools:gap(before,first),toolsToProse:gap(first,after),headerToFirst:header?gap(header,before):null,consecutiveSummaries:gap(second,third),toolToSubagent:gap(third,delegate),lastToFinal:gap(last,answer),proseLineToSummary:gap(before.querySelector('p'),first.querySelector('[data-tool-summary] button')),interimFooter:style(before.closest('[data-slot="aui_assistant-message-root"]').querySelector('[data-slot="aui_msg-actions"]')?.parentElement?.parentElement||before),timestamp:q('[data-slot="timeline-timestamp"]')?style(q('[data-slot="timeline-timestamp"]')):null,summaryWidths:[...base.querySelectorAll('[data-tool-summary]')].map(e=>({width:r(e).width,lane:r(e.closest('[data-slot="aui_assistant-message-content"]')).width-parseFloat(s(e.closest('[data-slot="aui_assistant-message-content"]')).paddingLeft),right:r(e).right,edge:r(e.closest('[data-slot="aui_assistant-message-content"]')).right})),root:style(first.closest('[data-slot="aui_assistant-message-root"]')),content:style(first.closest('[data-slot="aui_assistant-message-content"]')),response:style(group),pair:style(pair),summary:style(first),header:header?style(header):null,paragraph:style(before.querySelector('p')),width:base.scrollWidth,outerWidth:r(base).width,rootFont:s(document.documentElement).fontSize,scale:s(first).getPropertyValue('--conversation-text-scale')}]}))})()`
function close(actual, expected, label) { assert.ok(Math.abs(actual - expected) < 0.1, `${label}: expected ${expected}px; got ${actual}px`) }

// WorkLogBlock is evaluated from the pinned source, not inferred from the skin.
test('pinned T3 WorkLog trailing geometry is 8 / 0 / 4 CSS px at root 16', async () => {
  const b = await fixture()
  try {
    const result = await b.evaluate(`Object.fromEntries(['standalone','adjacent','expanded'].map(id=>{const e=document.getElementById('t3-'+id),a=e.querySelector('[data-reference-row]'),z=e.querySelector('[data-next]');return[id,z.getBoundingClientRect().top-a.getBoundingClientRect().bottom]}))`)
    assert.deepEqual(result, { standalone: 8, adjacent: 0, expanded: 4 })
  } finally { b.close() }
})
for (const { scale, width } of [{ scale: 1, width: 720 }, { scale: 1.75, width: 280 }]) {
  test(`T3 spacing through real native wrappers (${scale}x, ${width}px)`, async t => {
    const b = await fixture(scale, width)
    try {
      await enable(b); await expand(b)
      const actual = await b.evaluate(geometryProbe)
      console.log(`SPACING_GEOMETRY ${JSON.stringify({ scale, width, actual })}`)
      for (const shape of ['same', 'split']) {
        const g = actual[shape]
        await t.test(`${shape}: assistant prose -> tools`, () => close(g.proseToTools, 8, 'ordinary assistant block trailing space'))
        await t.test(`${shape}: tools -> prose`, () => close(g.toolsToProse, 8, 'standalone work block trailing space'))
        await t.test(`${shape}: header -> first activity`, () => close(g.headerToFirst, 6, 'turn-fold outer pb-1.5 after its border'))
        await t.test(`${shape}: consecutive summaries`, () => close(g.consecutiveSummaries, 0, 'continuesWorkLog suppresses space'))
        await t.test(`${shape}: tool -> subagent`, () => close(g.toolToSubagent, 8, 'subagent is not an adjacent WorkLog row'))
        await t.test(`${shape}: last activity -> final answer`, () => close(g.lastToFinal, 8, 'ordinary activity block trailing space'))
        await t.test(`${shape}: no horizontal overflow`, () => assert.ok(g.width <= g.outerWidth + 1, JSON.stringify(g)))
        await t.test(`${shape}: long native summaries remain inside the content lane`, () => assert.ok(g.summaryWidths.every(row=>row.width<=row.lane+1&&row.right<=row.edge+1),JSON.stringify(g.summaryWidths)))
      }
    } finally { b.close() }
  })
}
test('expanded native tool group contributes 4px at its end, not an outer prose block gap', async () => {
  const b = await fixture(1, 720, true)
  try {
    await enable(b); await expand(b); await click(b, '#same-first [data-tool-summary] button')
    const g = await b.evaluate(`(()=>{const a=document.getElementById('same-first'),last=a.querySelector('#same-first-call2'),next=document.getElementById('same-after');return{outside:next.getBoundingClientRect().top-a.getBoundingClientRect().bottom,fromLast:next.getBoundingClientRect().top-last.getBoundingClientRect().bottom}})()`)
    console.log('SPACING_EXPANDED '+JSON.stringify(g))
    close(g.fromLast, 4, 'expanded group-content pb-1')
  } finally { b.close() }
})
test('native disclosures, nested detail actions, subagent watch and disable survive wrapper-aware skinning', async () => {
  const b = await fixture(1, 720, true)
  try {
    const before = await b.evaluate(geometryProbe)
    await enable(b); await expand(b)
    await b.evaluate(`window.savedSummary=document.querySelector('#same-first [data-tool-summary] button');window.savedParent=savedSummary.parentNode;window.savedAnswer=document.getElementById('same-answer');void 0`)
    await click(b, '#same-first [data-tool-summary] button')
    await click(b, '#same-first-call button')
    assert.equal(await b.evaluate(`document.querySelector('#same-first-call button').getAttribute('aria-expanded')`), 'true')
    await click(b, '#same-first-call [data-native-detail] button')
    assert.deepEqual(await b.evaluate(`({toggles,details})`), { toggles: 2, details: 1 })
    await click(b, '#same [data-delegate-card] button')
    assert.deepEqual(await b.evaluate('opens'), [{ id: 'child', options: { watch: true, parentSessionId: 'stored-parent' } }])
    assert.equal(await b.evaluate(`document.querySelector('#split [data-slot="timeline-timestamp"]').getBoundingClientRect().height>0`), true, 'keep the separate native timestamp visible')
    await b.evaluate(`document.querySelector('#split [data-codex-turn-activity]').focus();void 0`)
    await b.call('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
    await b.call('Input.dispatchKeyEvent', {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
    await settle(b)
    assert.equal(await b.evaluate(`document.activeElement===document.querySelector('#split [data-slot="aui_msg-actions"] button')`), true, 'native interim action remains in the Tab order')
    const action=await b.evaluate(`(()=>{const b=document.activeElement,r=b.getBoundingClientRect(),root=b.closest('[data-slot="aui_assistant-message-root"]').getBoundingClientRect();return{visible:r.height>0&&r.top>=root.top&&r.bottom<=root.bottom,focus:b.matches(':focus-visible')}})()`)
    assert.equal(action.visible,true,'native interim action is not clipped by the message root');assert.equal(action.focus,true)
    await b.call('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'})
    await b.call('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    assert.equal(await b.evaluate('copies'),1,'keyboard still invokes the original interim action')
    await click(b, '#same-first-call button'); await click(b, '#same-first [data-tool-summary] button')
    await enable(b, false)
    assert.deepEqual(await b.evaluate(geometryProbe), before, 'disable restores complete native wrapper geometry')
    assert.equal(await b.evaluate(`document.querySelector('#same-first [data-tool-summary] button')===savedSummary&&savedSummary.parentNode===savedParent&&document.getElementById('same-answer')===savedAnswer`), true)
  } finally { b.close() }
})
