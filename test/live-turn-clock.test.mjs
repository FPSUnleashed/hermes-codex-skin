import assert from 'node:assert/strict'
import test from 'node:test'
import {loadPluginInternals} from './helpers/load-plugin.mjs'

const api = await loadPluginInternals(['formatLiveTurnActivityDuration','createLiveTurnClock'])
for (const [seconds, expected] of [[0,'0s'],[8,'8s'],[59,'59s'],[60,'1min 0s'],[61,'1min 1s'],[3599,'59min 59s'],[3600,'1hour 0min'],[3661,'1hour 1min'],[7200,'2hour 0min'],[90120,'25hour 2min']]) {
  test(`live duration boundary ${seconds}`,()=>assert.equal(api.formatLiveTurnActivityDuration(seconds),expected))
}
test('invalid numeric values never invent a duration',()=>{
  for(const value of [undefined,null,NaN,Infinity,-1,'60']) assert.equal(api.formatLiveTurnActivityDuration(value),'')
})
test('no hydration clock, no cross-turn binding and no tool-driven reset',()=>{
  let now=1000000
  const clock=api.createLiveTurnClock(()=>now)
  assert.equal(clock.label('s','user',true),'')
  clock.start('s');now+=8000
  assert.equal(clock.label('s','user',false),'')
  assert.equal(clock.label('s','user',true),'8s')
  clock.start('s');now+=5000
  assert.equal(clock.label('s','user',true),'13s')
  assert.equal(clock.label('s','other-user',true),'')
  assert.equal(clock.label('s','',true),'')
  clock.finish('s');now+=10000
  assert.equal(clock.label('s','user',true),'13s')
  assert.equal(clock.running('s'),false)
  clock.start('s');now+=1000
  assert.equal(clock.label('s','other-user',true),'1s')
})
test('backend whole-turn origin survives heartbeat and overrides receipt latency',()=>{
  let now=1000000
  const clock=api.createLiveTurnClock(()=>now)
  clock.start('s');clock.label('s','u',true)
  clock.info('s',{running:true,turn_started_at:900})
  assert.equal(clock.label('s','u',true),'1min 40s')
  now+=1000;clock.info('s',{running:true,turn_started_at:900})
  assert.equal(clock.label('s','u',true),'1min 41s')
  clock.info('s',{running:true,turn_started_at:800})
  assert.equal(clock.label('s','u',true),'1min 41s')
  clock.info('s',{running:false})
  now+=10000;assert.equal(clock.label('s','u',true),'1min 41s')
})
test('scope departure, profile round-trip and explicit cleanup cannot resurrect clocks',()=>{
  let now=1000000
  const clock=api.createLiveTurnClock(()=>now)
  clock.info('profile-a/route-a',{running:true,turn_started_at:900})
  assert.equal(clock.running('profile-b/route-b'),false)
  assert.equal(clock.label('profile-a/route-a','u',true),'')
  clock.start('profile-a/route-a');clock.clear();now+=1000
  assert.equal(clock.label('profile-a/route-a','u',true),'')
  for(const payload of [{running:true,turn_started_at:1002},{running:true,turn_started_at:'900'},{running:true,turn_started_at:NaN},{running:true,turn_started_at:-1},{turn_started_at:900}]) clock.info('s',payload)
  assert.equal(clock.label('s','u',true),'')
})
