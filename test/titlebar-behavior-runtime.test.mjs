import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'

import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
async function render(html) {
  const process = spawn('/usr/bin/google-chrome-stable',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-pipe'],{stdio:['ignore','ignore','ignore','pipe','pipe']})
  let serial=0, buffer=''
  const pending=new Map()
  process.stdio[4].on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\0'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(new Error(JSON.stringify(message.error))):resolve(message.result)}}})
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});process.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0')})
  try {
    const {targetId}=await send('Target.createTarget',{url:'about:blank'})
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
    const call=(method,params)=>send(method,params,sessionId)
    await call('Page.enable')
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:500,y:400})
    const {frameTree}=await call('Page.getFrameTree')
    await call('Page.setDocumentContent',{frameId:frameTree.frame.id,html})
    const result=await call('Runtime.evaluate',{expression:`new Promise((resolve,reject)=>{const timer=setInterval(()=>{if(document.title){clearInterval(timer);resolve(document.title)}},30);setTimeout(()=>{clearInterval(timer);reject(new Error('probe timeout'))},12000)})`,awaitPromise:true,returnByValue:true})
    if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  } finally { process.kill() }
}

test('real titlebar runtime handles preference, hover, keyboard, menus, sidebar and teardown', {timeout:30000}, async () => {
  const original = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url),'utf8')
  const source = original.replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.fixturePlugin = {')
  const temp = await mkdtemp(path.join(tmpdir(),'codex-bar-behavior-'))
  const file = path.join(temp,'index.html')
  const script = `
const host={state:{activeSessionId:{get:()=>null},profile:{get:()=> 'default'}}},PALETTE_AREA='palette',THEMES_AREA='themes',TITLEBAR_AREAS={center:'center'},useEffect=()=>{},jsx=()=>null;
${source}
const store=new Map();fixturePlugin.register({storage:{get:(k,d)=>store.has(k)?store.get(k):d,set:(k,v)=>store.set(k,v)},register:()=>{}});
const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);
const root=document.documentElement,bar=document.getElementById('bar'),shell=document.querySelector('[data-contrib-shell]'),left=document.getElementById('left'),toggle=document.getElementById('toggle');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const snap=()=>({side:root.getAttribute('data-codex-left-sidebar'),reveal:root.getAttribute('data-codex-titlebar-revealed'),position:getComputedStyle(bar).position,chatTop:document.getElementById('chat').getBoundingClientRect().top,barTop:bar.getBoundingClientRect().top,edge:document.querySelectorAll('[data-codex-titlebar-edge-trigger]').length,edgeRect:(()=>{const r=document.querySelector('[data-codex-titlebar-edge-trigger]')?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,height:r.height}:null})()});
(async()=>{try{
syncTitlebarAutohideRoot();const dispose=installBehaviorRuntime();await wait(80);const off=snap();
setTitlebarAutohideMode('on');await wait(260);const hidden=snap();
const edge=document.querySelector('[data-codex-titlebar-edge-trigger]');const bottomBandTarget=document.elementFromPoint(500,33)?.getAttribute('data-codex-titlebar-edge-trigger');const belowBandTarget=document.elementFromPoint(500,34)?.getAttribute('data-codex-titlebar-edge-trigger') || document.elementFromPoint(500,34)?.getAttribute('data-codex-native-titlebar');edge.dispatchEvent(new PointerEvent('pointerenter'));await wait(260);const hover=snap();
const retainedBandTarget=document.elementFromPoint(500,17)?.getAttribute('data-codex-native-titlebar');bar.dispatchEvent(new PointerEvent('pointerleave',{relatedTarget:document.body}));await wait(280);const exited=snap();
toggle.focus();await wait(260);const keyboard=snap();
toggle.setAttribute('aria-expanded','true');toggle.blur();left.dispatchEvent(new PointerEvent('pointerleave'));await wait(280);const menu=snap();
toggle.setAttribute('aria-expanded','false');left.dispatchEvent(new PointerEvent('pointerleave'));await wait(280);const closedMenu=snap();
toggle.setAttribute('aria-label','Hide sidebar');await wait(280);const sidebarOpen=snap();
toggle.setAttribute('aria-label','Show sidebar');await wait(280);const sidebarClosed=snap();
const sidebar=document.getElementById('sidebar');const sidebarHost=document.createElement('div');sidebarHost.id='sidebar-host';sidebar.replaceWith(sidebarHost);sidebarHost.appendChild(sidebar);await wait(280);
sidebarHost.remove();await wait(280);const unknown=snap();
document.querySelector('[data-contrib-shell]').appendChild(sidebarHost);await wait(280);
left.dispatchEvent(new PointerEvent('pointerenter'));await wait(260);const beforeDispose=snap();
left.dispatchEvent(new PointerEvent('pointerleave'));dispose();await wait(300);const disposed=snap();
edge.dispatchEvent(new PointerEvent('pointerenter'));toggle.focus();await wait(280);const stale=snap();
document.title=btoa(JSON.stringify({off,hidden,hover,exited,keyboard,menu,closedMenu,sidebarOpen,sidebarClosed,unknown,beforeDispose,disposed,stale,bottomBandTarget,belowBandTarget,retainedBandTarget}));
}catch(error){document.title=btoa(JSON.stringify({error:String(error),stack:error.stack}))}})();`
  const html = `<!doctype html><html data-codex-chat-look="true"><head><style>*{box-sizing:border-box}html,body{margin:0}.fixed{position:fixed;z-index:70;top:5px;height:24px}.left{left:8px}.right{right:8px}[data-contrib-shell]{--titlebar-height:34px;display:flex;flex-direction:column}#bar{height:34px;flex-shrink:0;background:#222;position:relative}button{width:24px;height:24px}#chat{height:200px}</style></head><body><div data-contrib-shell><div id="bar" class="relative flex h-[34px]"><div aria-hidden="true" class="app-region"></div></div><div id="left" class="fixed z-70 left"><button id="toggle" aria-label="Show sidebar"><span class="codicon-layout-sidebar-left"></span></button></div><div class="fixed z-70 right"><button aria-label="Show right sidebar"><span class="codicon-layout-sidebar-right"></span></button></div><div data-slot="sidebar" id="sidebar" hidden></div><main id="chat">Chat</main></div><script>${script.replaceAll('</script','<\\/script')}</script></body></html>`
  try {
    await writeFile(file,html)
    const title = await render(html)
    assert.ok(title,'real runtime probe completed')
    const r = JSON.parse(Buffer.from(title,'base64').toString())
    assert.equal(r.error,undefined,JSON.stringify(r))
    assert.equal(r.off.position,'relative')
    assert.equal(r.hidden.side,'closed')
    assert.equal(r.hidden.position,'fixed')
    assert.equal(r.hidden.barTop,-34,JSON.stringify(r))
    assert.equal(r.hidden.edgeRect.top,0)
    assert.equal(r.hidden.edgeRect.bottom,34)
    assert.equal(r.hidden.edgeRect.height,34)
    assert.equal(r.bottomBandTarget,null,'reveal band must not intercept underlying controls')
    assert.equal(r.hidden.chatTop,0,'no empty header strip')
    assert.equal(r.hover.reveal,'true')
    assert.equal(r.retainedBandTarget,'true','same titlebar band must retain the reveal')
    assert.equal(r.belowBandTarget,null,'area below the titlebar must not open it')
    assert.equal(r.hover.chatTop,r.hidden.chatTop)
    assert.equal(r.hover.barTop,0)
    assert.equal(r.exited.reveal,null)
    assert.equal(r.keyboard.reveal,'true')
    assert.equal(r.menu.reveal,'true')
    assert.equal(r.closedMenu.reveal,null)
    assert.equal(r.sidebarOpen.side,'open')
    assert.equal(r.sidebarOpen.position,'relative')
    assert.equal(r.sidebarClosed.side,'closed')
    assert.equal(r.unknown.side,null)
    assert.equal(r.unknown.position,'relative')
    assert.equal(r.beforeDispose.reveal,'true')
    assert.equal(r.disposed.edge,0)
    assert.equal(r.disposed.reveal,null)
    assert.deepEqual(r.stale,r.disposed,'stale event cannot revive disposed runtime')
  } finally { await rm(temp,{recursive:true,force:true}) }
})
