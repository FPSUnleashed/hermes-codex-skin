import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('the custom Composing orb is completely absent', () => {
  for (const marker of [
    'COMPOSING_ORB',
    'composingOrb',
    'data-codex-composing-orb',
    'drawComposingOrbFrame',
    'thinking-orbs'
  ]) {
    assert.doesNotMatch(source, new RegExp(marker))
  }
  assert.doesNotMatch(source, /createElement\('canvas'\)/)
})

test('orb-only observers and listeners are absent', () => {
  assert.doesNotMatch(source, /visibilitychange|ResizeObserver\(positionComposingOrb\)/)
  assert.doesNotMatch(source, /attributeFilter: \['data-hermes-mode'\]/)
  assert.doesNotMatch(source, /CLEAN_CONVERSATION_EVENT/)
})

test('the ordinary runtime and post-turn collapse remain installed', () => {
  assert.match(source, /function installBehaviorRuntime/)
  assert.match(source, /decorateExecutionSummary\(pair\)/)
  assert.match(source, /window\.requestAnimationFrame\(process\)/)
  assert.match(source, /window\.addEventListener\('resize', onResize\)/)
  assert.match(source, /window\.addEventListener\('hashchange', onHashChange\)/)
})
