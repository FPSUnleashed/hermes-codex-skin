import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
const PLAYBACK = "[data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button)"

function rule(selector) {
  const start = source.indexOf(selector)
  assert.notEqual(start, -1, `missing selector: ${selector}`)
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return source.slice(start, close + 1)
}

test('Reading aloud becomes a compact neutral Codex row', () => {
  const playback = rule(PLAYBACK)
  assert.match(playback, /height: 28px;/)
  assert.doesNotMatch(playback, /height: 28px !important/)
  assert.match(playback, /padding: 0 4px !important/)
  assert.match(playback, /border: 0 !important/)
  assert.match(playback, /border-radius: 8px !important/)
  assert.match(playback, /background: transparent !important/)
  assert.match(playback, /box-shadow: none !important/)
  assert.match(playback, /backdrop-filter: none !important/)
})

test('Reading aloud uses a quiet icon and shorter waveform', () => {
  const icon = rule(`${PLAYBACK} > div:first-child`)
  assert.match(icon, /width: 18px !important/)
  assert.match(icon, /height: 18px !important/)
  assert.match(icon, /background: transparent !important/)

  const canvas = rule(`${PLAYBACK} canvas`)
  assert.match(canvas, /width: 56px !important/)
  assert.match(canvas, /height: 12px !important/)
})

test('Reading aloud keeps the native Stop button but gives it Codex chrome', () => {
  const stop = rule(`${PLAYBACK} > button`)
  assert.match(stop, /height: 24px !important/)
  assert.match(stop, /border-radius: 7px !important/)
  assert.match(stop, /font-size: 11px !important/)
  assert.match(stop, /background: transparent !important/)
})

test('Reading aloud has explicit light and dark neutral colors', () => {
  assert.match(source, new RegExp(`data-hermes-mode='light'[^\\n]+${PLAYBACK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.match(source, new RegExp(`data-hermes-mode='dark'[^\\n]+${PLAYBACK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
})

test('Reading aloud uses the same exact 12px gap above and below', () => {
  assert.match(
    source,
    /\[data-slot='composer-fade'\] \{[\s\S]{0,180}--codex-playback-edge-gap: 12px;[\s\S]{0,100}padding: 12px 15px 10px !important;[\s\S]{0,60}gap: 0 !important/
  )
  assert.match(rule(PLAYBACK), /margin-bottom: var\(--codex-playback-edge-gap\);/)
})

test('Reading aloud opens and closes with one continuous layout motion', () => {
  assert.match(source, /@keyframes codex-playback-enter/)
  assert.match(source, /@keyframes codex-playback-exit/)
  assert.match(source, /\[data-codex-playback-enter='true'\]/)
  assert.match(source, /\[data-codex-playback-exit='true'\]/)
  assert.match(source, /animation: codex-playback-enter 100ms linear both !important/)
  assert.match(source, /animation: codex-playback-exit 100ms linear both !important/)
  assert.match(source, /height: 0;[\s\S]{0,120}margin-bottom: 0/)
  assert.match(source, /height: 28px;[\s\S]{0,120}margin-bottom: var\(--codex-playback-edge-gap\)/)
  assert.match(source, /contain: paint !important/)
  assert.match(source, /will-change: opacity/)
  assert.doesNotMatch(source, /data-codex-playback-(?:enter|exit)[^}]{0,360}(?:max-height|translateY|will-change:[^;]*(?:height|margin-bottom|transform))/)
})

test('the exit copy is visual-only, bounded, and removed', () => {
  assert.match(source, /function animatePlaybackExit\(/)
  assert.match(source, /cloneNode\(true\)/)
  assert.match(source, /setAttribute\('aria-hidden', 'true'\)/)
  assert.match(source, /ghost\.inert = true/)
  assert.match(source, /pointer-events: none !important/)
  assert.match(source, /drawImage\(sourceCanvas, 0, 0\)/)
  assert.match(source, /addEventListener\('animationend', removeGhost, \{ once: true \}\)/)
  assert.match(source, /window\.setTimeout\(removeGhost, 160\)/)
})

test('playback motion respects reduced motion and cleans up on hot reload', () => {
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(source, /\[data-codex-playback-enter='true'\][\s\S]{0,200}animation: none !important/)
  assert.match(source, /\[data-codex-playback-exit='true'\][\s\S]{0,200}display: none !important/)
  assert.match(source, /clearPlaybackAnimations\(\)/)
})

test('consecutive audio bridges a short idle gap instead of closing and reopening', () => {
  assert.match(source, /const PLAYBACK_CLOSE_GRACE_MS = 250/)
  assert.match(source, /data-codex-playback-hold/)
  assert.ok((source.match(/status\.hasAttribute\('data-codex-playback-hold'\)/g) || []).length >= 2)
  assert.match(source, /pendingGhost\?\.__codexCancelPlaybackExit\?\.\(\)/)
  assert.match(source, /if \(pendingGhost\) return/)
  assert.match(source, /window\.setTimeout\(beginExit, PLAYBACK_CLOSE_GRACE_MS\)/)
  assert.match(source, /exitStartTimer = window\.setTimeout\(\(\) => \{/)
})
