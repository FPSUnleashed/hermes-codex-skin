import { testDependencyRequire } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {nativeRunBundle,installSequence,tool,provenance} from './helpers/native-run-stream.mjs'
const require=testDependencyRequire()
const {JSDOM}=require('jsdom')
const native=await nativeRunBundle()
const source=await readFile(new URL('../src/tool-sequence-glyphs.js',import.meta.url),'utf8')+'\n'+await readFile(new URL('../src/tool-sequences.js',import.meta.url),'utf8')
console.log('NATIVE_RUN_PROVENANCE',JSON.stringify(provenance))
for(const acrossRoots of [false,true])test(`sequential native arrivals and quiet gaps retain one current projection, acrossRoots=${acrossRoots}`,async()=>{
 const dom=new JSDOM('<div id="fixture"></div>',{runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window
 try{
  w.config={live:true,roots:[{id:'a',live:true,parts:[tool('t1')]}]};w.eval(native);w.eval(installSequence(source))
  const samples=[]
  const sample=phase=>{w.sync();const headers=[...w.pair.querySelectorAll('[data-codex-tool-sequence]')];const current=[...w.pair.querySelectorAll('[data-codex-activity-native-current]')];samples.push({phase,headers:headers.length,current:current.length,label:headers.at(-1)?.textContent,groups:w.pair.querySelectorAll('[data-tool-group]').length});assert.equal(current.length,1,JSON.stringify(samples));assert.equal(headers.length,1,JSON.stringify(samples))}
  sample('first-start')
  for(let i=1;i<=6;i++){
   w.change(c=>{const last=c.roots.at(-1);last.parts[last.parts.length-1]=tool('t'+i,true);return c});sample('result-'+i)
   await new Promise(r=>w.setTimeout(r,30));sample('quiet-'+i)
   if(i<6){w.change(c=>{if(acrossRoots){c.roots.at(-1).live=false;c.roots.push({id:'a'+i,live:true,parts:[tool('t'+(i+1))]})}else c.roots[0].parts.push(tool('t'+(i+1)));return c});sample('arrival-'+(i+1))}
  }
  console.log('NATIVE_STREAM_SAMPLES',JSON.stringify({acrossRoots,samples}))
  const firstHeader=w.pair.querySelector('[data-codex-tool-sequence] button');firstHeader.click();assert.equal(firstHeader.getAttribute('aria-expanded'),'true');firstHeader.click();assert.equal(firstHeader.getAttribute('aria-expanded'),'false')
  w.runtime.cleanup();assert.equal(w.pair.querySelector('[data-codex-tool-sequence]'),null)
 }finally{w.nativeRoot?.unmount();dom.window.close()}
})
