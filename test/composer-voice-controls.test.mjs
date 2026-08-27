import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

function hidingRuleFor(labelFragment) {
  return [...source.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
    .filter(([, selector, declarations]) => selector.includes(labelFragment) && /display:\s*none\s*!important/.test(declarations))
    .map(match => match[0])
}

test('Codex Skin leaves Hermes auto-speak and wake-word controls visible in the composer', () => {
  for (const label of [
    'Read replies aloud',
    'Stop reading replies',
    'Lire les réponses',
    'Wake word',
    'mot de réveil'
  ]) {
    assert.deepEqual(hidingRuleFor(label), [], `${label} must remain visible`)
  }
})

test('Codex Skin does not replace the native TTS or ear controls', () => {
  assert.doesNotMatch(source, /data-codex-(?:tts|auto-speak|wake-word|ear)/i)
  assert.doesNotMatch(source, /createElement\(['"]button['"]\)[\s\S]{0,300}(?:Read replies|Wake word)/i)
})
