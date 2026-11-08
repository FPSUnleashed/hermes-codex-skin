import { referenceRoot } from './helpers/reference-paths.mjs'
import { resolveNativeRouterDependency, startNativeRouterServer } from './helpers/native-router-dependency.mjs'
// Run directly: executes built-candidate requests through real native HTTP.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import http from 'node:http'
import https from 'node:https'

const serverDependency=resolveNativeRouterDependency()
const root=referenceRoot()
const evidence=referenceRoot('CODEX_NATIVE_EVIDENCE_ROOT')
const scratch=referenceRoot('CODEX_NATIVE_SCRATCH_ROOT')
const require=createRequire(root+'/package.json'),ts=require('typescript')
async function complete(path){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(await readFile(root+'/'+path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(require,module,module.exports);return module.exports}
async function declarations(path,names,bindings={}){const text=await readFile(root+'/'+path,'utf8'),ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);const nodes=ast.statements.filter(n=>names.includes(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.includes(d.name.getText(ast))));assert.equal(nodes.length,names.length);const context=vm.createContext({URL,URLSearchParams,...bindings});vm.runInContext(ts.transpileModule(nodes.map(n=>n.getText(ast).replace(/^export\s+/, '')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText+'\nglobalThis.result={'+names.join(',')+'}',context);return context.result}
const children=[],servers={},requests=[],httpCalls=[],intercepts=[]
let transport
try{
 for(const source of ['A','B']){
  const server=await startNativeRouterServer({dependency:serverDependency,source,root,scratch});children.push(server)
  servers[source]={mode:'local',baseUrl:server.baseUrl,token:'synthetic',gatewayEndpoint:{profile_id:'synthetic-root'}}
 }
 transport=await complete('apps/desktop/electron/api-transport.ts')
 const routing=await declarations('apps/desktop/electron/connection-config.ts',['connectionScopeKey','SELF_PROFILE_QUERY_KEYS_BY_PATH','translateSelfProfileQuery','pathWithProfileScope','pathForRegistryBackendRequest','apiRequestRegistryConnectionId'])
 const aggregate=await complete('apps/desktop/electron/profile-session-routing.ts')
 // Warm registry descriptors are real loopback HTTP backends. The actual native
 // branch predicate must bypass global interception for every candidate read.
 const native=await declarations('apps/desktop/electron/main.ts',['fetchJson','fetchJsonForBackend','dispatchRegistryApiRequest','handleHermesApiRequest'],{
  ...transport,...routing,...aggregate,http,https,Buffer,HERMES_HOME:'synthetic-root',DEFAULT_FETCH_TIMEOUT_MS:10000,resolveTimeoutMs:(n,f)=>n??f,
  headersForRemoteRequest:(_u,_t,opts)=>opts?.headers||{},nativeGatewayHttpHeaders:async(descriptor,url)=>{const parsed=new URL(url);const profile=parsed.searchParams.get('profile')||'default';httpCalls.push({origin:parsed.origin,path:parsed.pathname+parsed.search,grant:profile});return {'x-probe-bound-profile':profile==='all'?'default':profile}},
  ensureRegistryBackend:async(id,profile)=>profile==='desk'?{...servers[id],mode:'remote',remoteProfile:'alpha'}:servers[id],
  backendScopeKey:(id,p)=>id+'::'+p,backendDialClaims:{run:async(_k,fn)=>fn()},desktopProfilePreferences:{afterProfileRequest(){}},
  interceptSessionRequestForRemote:async(request,id)=>{intercepts.push({request,id});return undefined}
 })
 const routes=['A','B'].flatMap(connectionId=>['default','desk','beta'].map(profile=>({connectionId,profile,targetProfile:profile==='desk'?'alpha':profile,mode:profile==='desk'?'remote':'local'})))
 const bundle=(await readFile(new URL('../codex-chat-look/plugin.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/export default\s*\{/,'globalThis.plugin = {')
 const state=v=>({get:()=>v,subscribe:()=>()=>{}})
 const host={state:{connectionId:state('A'),profile:state('default')},profileRoutes:async()=>routes,requestProfile:async()=>{throw Error('No live transport certified by HTTP probe')}}
 const context=vm.createContext({console,URL,URLSearchParams,AbortController,host,window:{hermesDesktop:{getAgentRoster:async()=>({sources:['A','B'].map(connectionId=>({connectionId,reachable:true})),agents:routes}),api:request=>{requests.push(request);return native.handleHermesApiRequest(request)}}}})
 vm.runInContext(bundle+'\nglobalThis.read=readCodexInboxPage;globalThis.inventory=readUniversalInboxInventory;globalThis.opened=readCodexInboxOpenedSession;',context)
 const inventory=await context.inventory();assert.equal(inventory.complete,true);assert.equal(inventory.routes.length,6)
 const output=[]
 for(const {route}of inventory.routes){
  const data=await context.read(route,1,new AbortController().signal,{model:{isSettled:()=>false,isSnoozed:()=>false}},new Map(),()=>{},()=>[],()=>{},{ownerScope:()=>route,liveOwners:new Map()})
  assert.equal(data.sessions.length,1);const row=data.sessions[0]
  assert.equal(row.id,'same-durable-id');assert.equal(row.profile,route.profile);assert.equal(row.connection_id,route.connectionId)
  assert.equal(row.title,route.connectionId+':'+route.targetProfile);assert.equal(row._codexInboxBackendOwner.profile,route.targetProfile)
  assert.ok(!('system_prompt'in row)&&!('model_config'in row));assert.equal(data.liveStatusKnown,false)
  const detail=await context.opened({id:row.id,scope:route},{followLineage:true,requireOwner:true})
  assert.equal(detail.title,row.title);assert.equal(detail._codexInboxBackendOwner.profile,route.targetProfile);assert.equal(detail._codexInboxBackendOwner.connectionId,route.connectionId)
  output.push({route,backendOwner:row._codexInboxBackendOwner,id:row.id,title:row.title})
 }
 assert.equal(intercepts.length,0,'concrete candidate reads must not activate warm global aggregate interception')
 assert.equal(new Set(output.map(x=>JSON.stringify([x.route.connectionId,x.route.profile,x.id]))).size,6)
 let red;try{await native.handleHermesApiRequest({connectionId:'A',profile:'all',path:'/api/sessions?profile=all'})}catch(error){red={statusCode:error.statusCode,message:error.message}}
 assert.equal(red.statusCode,403)
 const aliasRequests=requests.filter(r=>r.profile==='desk');assert.equal(aliasRequests.length,6);assert.ok(aliasRequests.every(r=>r.path.includes('profile=desk')))
 let registered
 const {universalFixture}=await import('./helpers/universal-fixture.mjs')
 await universalFixture(async browser=>{
  await browser.evaluate(`(async()=>{for(const route of routes){const data=await hermesDesktop.api({connectionId:route.connectionId,profile:route.profile,path:'/api/sessions?'+new URLSearchParams({profile:route.profile,limit:'100',min_messages:'1'})});const rows=data.sessions.map(row=>({...row,profile:route.profile}));runtime.admission.observe(route,rows,{workingSessions:rows})}runToggle();await flush()})()`)
  await browser.evaluate('refetch()')
  assert.equal(await browser.evaluate('rows().length'),6)
  assert.deepEqual((await browser.evaluate("rows().map(row=>row.querySelector('[data-codex-inbox-label]').textContent).sort()")),output.map(item=>item.title).sort())
  assert.equal(await browser.evaluate("rows().every(row=>row.dataset.workState!=='working'&&row.querySelector('[data-codex-inbox-settle]').disabled)"),true,'HTTP does not certify live activity')
  const point=await browser.evaluate("(()=>{const r=ownerRow('B','desk').querySelector('[data-codex-inbox-open]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
  await browser.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await browser.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await browser.evaluate('flush()')
  assert.deepEqual(await browser.evaluate('nav.at(-1)'),{id:'same-durable-id',options:{profile:'desk',route:routes.find(r=>r.connectionId==='B'&&r.profile==='desk')}})
  await browser.evaluate("state.connectionId.set('B');state.profile.set('desk');flush()")
  assert.equal(await browser.evaluate("toggle().data.detail()==='On'&&rows().length===6"),true)
  await browser.evaluate('runToggle();flush()');await browser.evaluate('refetch()')
  assert.equal(await browser.evaluate("toggle().data.detail()==='Off'&&rows().length===1&&ownerRow('B','desk')!==undefined"),true)
  assert.deepEqual(await browser.evaluate('errors'),[])
  registered={onRows:6,offRows:await browser.evaluate('rows().length'),paletteReceipt:await browser.evaluate('paletteReceipt'),navigation:await browser.evaluate('nav'),errors:await browser.evaluate('errors'),attention:'Admission seeded from six native synthetic metadata reads to model previous work; no live RPC authority invented.'}
 },{routes,nativeApi:request=>{requests.push(request);return native.handleHermesApiRequest(request)}})
 assert.equal(intercepts.length,0)
 const result={status:'PASS',serverDependency,owners:output.length,registered,output,requests,httpCalls,intercepts,flatAllRed:red,
  boundaries:'Built reader and inventory; actual native route translation, main dispatch branch and HTTP transport. Native grant scope guard and real FastAPI/SessionDB require the externally reviewed server implementation; the server hash identifies bytes, not native provenance. Six synthetic stores, colliding IDs, Desktop alias desk->alpha, shared local routes and two warm descriptors. Descriptor/grant issuance modeled; no Electron IPC, WS, SSH, auth issuance, live installation or private data. Concrete native predicate proves aggregate interception is not reached; global-aggregate implementation itself is not exercised.'}
 await mkdir(evidence+'/implementation-evidence',{recursive:true});await writeFile(evidence+'/implementation-evidence/native-candidate-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{transport?.destroyKeepaliveAgents();await Promise.all(children.map(server=>server.stop()))}
