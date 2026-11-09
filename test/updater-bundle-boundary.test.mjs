import assert from 'node:assert/strict'
import test from 'node:test'
import {bundleUpdater} from '../scripts/build-updater.mjs'

test('adding the complete-message runtime produces the same bytes as later rebuilds',()=>{
  const existing=bundleUpdater('export default {register(){}}\n','const style = `body{}`','T3 SUBAGENT STYLE')
  const compose=source=>bundleUpdater(bundleUpdater(source,'const style = `body{}`','T3 SUBAGENT STYLE'),'function registerCompleteMessages() {}','COMPLETE MESSAGES')
  const first=compose(existing)
  assert.equal(compose(first),first)
  assert.equal(compose(compose(first)),first)
  assert.equal(first.split('function registerCompleteMessages() {}').length,2)
})
