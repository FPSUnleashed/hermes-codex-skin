import {readFileSync} from 'node:fs'
import vm from 'node:vm'

// Deliberately not a browser/layout simulator. Executes the shipping closures
// with instrumented DOM seams; native React/virtualizer/CDP remains a gate.
export function railFixture({count=48,start=0,total=count,sourcePath,duplicate=false,workspace=false}={}) {
  const stats={writes:[],geometry:0,queries:0,fragments:0,requests:[]}
  let doc
  const matches=(el,selector)=>selector.split(',').some(raw=>{
    const s=raw.trim().split(/\s+>\s+|\s+(?=[.\[])/).at(-1)
    const tag=s.match(/^[a-z]+/i)?.[0]
    if(tag&&el.tagName!==tag.toUpperCase())return false
    for(const c of s.matchAll(/\.([\w-]+)/g))if(!el.className.split(' ').includes(c[1]))return false
    for(const a of s.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
      if(!el.hasAttribute(a[1])||(a[2]!==undefined&&el.getAttribute(a[1])!==a[2]))return false
    }
    return true
  })
  class Element {
    constructor(tag='div',attrs={}) {
      this.tagName=tag.toUpperCase();this.nodeType=1;this.attrs=new Map(Object.entries(attrs));this.childNodes=[];this.listeners=new Map();this.hidden=false;this.isConnected=true
      const values=new Map()
      this.style={setProperty:(name,value)=>{stats.writes.push({node:this,name,value});values.set(name,value)},getPropertyValue:name=>values.get(name)||'',removeProperty:name=>{if(values.has(name))stats.writes.push({node:this,name,value:null});values.delete(name)}}
    }
    get className(){return this.getAttribute('class')||''}
    get firstElementChild(){return this.children[0]||null}
    get children(){return this.childNodes.filter(x=>x instanceof Element)}
    get textContent(){return this.childNodes.map(n=>n.nodeValue??n.textContent).join('')}
    set textContent(t){this.replaceChildren({nodeType:3,nodeValue:String(t)})}
    getAttribute(k){return this.attrs.get(k)??null}
    hasAttribute(k){return this.attrs.has(k)}
    setAttribute(k,v){this.attrs.set(k,String(v))}
    removeAttribute(k){this.attrs.delete(k)}
    toggleAttribute(k,on){if(on??!this.hasAttribute(k))this.setAttribute(k,'');else this.removeAttribute(k)}
    matches(s){return matches(this,s)}
    closest(s){for(let e=this;e;e=e.parentElement)if(e.matches(s))return e;return null}
    querySelectorAll(s){stats.queries++;return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)])}
    querySelector(s){return this.querySelectorAll(s)[0]||null}
    contains(el){return el===this||this.children.some(c=>c.contains(el))}
    append(...nodes){for(const n of nodes)this.appendChild(n)}
    appendChild(n){if(n.fragment){for(const child of [...n.childNodes])this.appendChild(child);return n}n.parentElement=this;this.childNodes.push(n);return n}
    replaceChildren(...nodes){for(const n of this.childNodes)n.parentElement=null;this.childNodes=[];this.append(...nodes)}
    remove(){this.isConnected=false;if(this.parentElement)this.parentElement.childNodes=this.parentElement.childNodes.filter(c=>c!==this)}
    getBoundingClientRect(){stats.geometry++;const index=Number(this.getAttribute('data-timeline-index')||0);return {top:100+index*7,left:16,width:900,height:this.hasAttribute('data-timeline-index')?7:700}}
    addEventListener(type,fn,opts){const list=this.listeners.get(type)||[];list.push({fn,capture:opts===true||opts?.capture});this.listeners.set(type,list)}
    removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x.fn!==fn))}
    dispatch(type,detail={}){const event={type,target:this,relatedTarget:null,clientY:0,...detail,stopPropagation(){this.stopped=true}};const path=[];for(let p=this;p;p=p.parentElement)path.push(p);for(const el of [...path].reverse())for(const l of el.listeners.get(type)||[])if(l.capture)l.fn(event);for(const el of path){for(const l of el.listeners.get(type)||[])if(!l.capture)l.fn(event);if(event.stopped)break}return event}
    focus(){doc.activeElement=this;this.dispatch('focusin')}
  }
  const make=(slot,attrs={})=>new Element('div',{'data-slot':slot,...attrs})
  const surface=new Element('section',{'data-session-anchor':workspace?'workspace':'session-tile:a'})
  const viewport=make('aui_thread-viewport'),content=make('aui_thread-content'),root=make('thread-timeline'),strip=make('thread-timeline-ticks'),track=new Element('div',{class:'thread-timeline-track'})
  strip.scrollTop=0;track.style.height=`${total*7}px`;root.append(strip);strip.append(track);surface.append(viewport,root);viewport.append(content)
  const buttons=[]
  const users=[]
  const label=i=>duplicate?'Repeated':`Question ${i}`
  for(let i=start;i<start+count;i++) {
    const b=new Element('button',{class:'thread-timeline-tick','data-timeline-id':`history:${1000+i}`,'data-timeline-index':String(i),'aria-label':label(i)})
    b.append(make('timeline-bar'));track.append(b);buttons.push(b)
    const pair=make('aui_turn-pair'),user=make('aui_user-message-root',{'data-message-id':`history:${1000+i}`}),text=make('aui_user-message-text')
    text.textContent=label(i);user.append(text);pair.append(user);users.push(user)
    const assistant=make('aui_assistant-message-root',{'data-role':'assistant'}),prose=make('aui_assistant-message-content'),md=new Element('div',{class:'aui-md'})
    md.append(new Element('p'));md.firstElementChild.textContent=`Answer ${i}`;prose.append(md);assistant.append(prose,make('aui_msg-actions'));pair.append(assistant);content.append(pair)
  }
  doc=new Element('document');doc.append(surface);doc.createElement=t=>new Element(t);doc.createDocumentFragment=()=>{stats.fragments++;const f=new Element('fragment');f.fragment=true;return f};doc.createTextNode=t=>({nodeType:3,nodeValue:t})
  let frameId=0;const frames=new Map(),timers=new Map(),subscriptions=[],observers=[]
  const window=new Element('window');Object.assign(window,{requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>{timers.set(++frameId,fn);return frameId},clearTimeout:id=>timers.delete(id)})
  class Observer {constructor(fn){this.fn=fn;this.connected=true;observers.push(this)}observe(target){this.target=target}disconnect(){this.connected=false}}
  class MutationObserver extends Observer {constructor(fn){super(fn);this.kind='mutation'}}
  let runtime='runtime-a',profile='default'
  const state=()=>({subscribe:fn=>{subscriptions.push(fn);return ()=>subscriptions.splice(subscriptions.indexOf(fn),1)}})
  const host={state:{activeSessionId:state(),profile:state(),gateway:state()},request:(method,params)=>{stats.requests.push({method,params});return new Promise(resolve=>pending.push(resolve))}}
  const pending=[]
  const path=sourcePath||new URL('../../codex-chat-look/plugin.js',import.meta.url)
  const source=readFileSync(path,'utf8'),a=source.indexOf('function historyPreviewFragment('),b=source.indexOf('function installChatWidthRuntime(',a)
  const context={Element,document:doc,window,ResizeObserver:Observer,MutationObserver,host,console,currentRuntimeSessionId:()=>runtime,currentProfileScope:()=>profile,routedStoredSessionId:()=>null}
  vm.createContext(context);vm.runInContext(source.slice(a,b)+';globalThis.install=installHistoryRailRuntime;',context)
  const runtimeRail=context.install()
  const card=()=>surface.querySelector('[data-codex-history-preview]')
  const flush=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn())}
  const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();flush()}
  const over=i=>{buttons[i].dispatch('mouseover',{clientY:100+(start+i)*7+3.5});flush()}
  return {stats,buttons,users,root,strip,track,surface,viewport,content,doc,window,card,frames,observers,subscriptions,pending,flush,settle,over,runtimeRail,context,
    move:(i,y=0)=>{buttons[i].dispatch('pointermove',{clientY:y});flush()},
    setRuntime:id=>{runtime=id},setProfile:id=>{profile=id},invalidate:()=>subscriptions.forEach(fn=>fn()),
    records:records=>runtimeRail.observe(records),
    mutate:()=>{for(const o of observers)if(o.connected&&o.kind==='mutation')o.fn([{type:'characterData',target:content}])},
    history:()=>Array.from({length:total},(_,i)=>[{role:'user',row_id:1000+i,text:label(i)},{role:'assistant',text:`RPC answer ${i}`}]).flat()}
}
