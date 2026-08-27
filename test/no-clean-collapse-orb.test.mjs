import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('Clean, post-turn collapse, and the Clean orb are completely retired', () => {
  for (const marker of [
    'CLEAN_CONVERSATION',
    'data-codex-clean-conversation',
    'toggle-clean-conversation',
    'Clean conversation',
    'COMPOSING_ORB',
    'composingOrb',
    'data-codex-composing-orb',
    'drawComposingOrbFrame',
    'thinking-orbs',
    'data-codex-execution-summary',
    'data-codex-execution-hidden',
    'Show work',
    'Hide work'
  ]) {
    assert.doesNotMatch(source, new RegExp(marker))
  }
})

test('retirement preserves long user-message folding and independent controls', () => {
  assert.match(source, /function decorateLongUserMessage\(pair\)/)
  assert.match(source, /data-codex-user-expand/)
  assert.match(source, /Show more/)
  assert.match(source, /const COMPOSER_WIDTH_STORAGE_KEY = 'composer-width'/)
  assert.match(source, /function installBehaviorRuntime/)
})
