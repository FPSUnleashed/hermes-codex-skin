import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
const PLAYBACK = "[data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button)"
const DICTATION = "[data-slot='composer-fade'] > [role='status'][aria-live='polite']:not(:has(> button))"

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

test('Voice dictation uses the same compact neutral row language', () => {
  const dictation = rule(DICTATION)
  assert.match(dictation, /height: 28px;/)
  assert.match(dictation, /margin-bottom: var\(--codex-playback-edge-gap\);/)
  assert.match(dictation, /padding: 0 4px !important/)
  assert.match(dictation, /border: 0 !important/)
  assert.match(dictation, /background: transparent !important/)
  assert.match(rule(`${DICTATION} > div:first-child`), /width: 18px !important/)
  assert.match(rule(`${DICTATION} > div:nth-child\(2\) > span`), /font-weight: 400 !important/)
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

test('Reading aloud uses compositor-only motion instead of stepped layout animation', () => {
  assert.match(source, /@keyframes codex-playback-enter/)
  assert.match(source, /@keyframes codex-playback-exit/)
  assert.match(source, /\[data-codex-playback-enter='true'\]/)
  assert.match(source, /\[data-codex-playback-exit='true'\]/)
  assert.match(source, /animation: codex-playback-enter 240ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both !important/)
  assert.match(source, /animation: codex-playback-exit 240ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both !important/)
  assert.match(source, /transform: translateY\(6px\)/)
  assert.match(source, /contain: paint !important/)
  assert.match(source, /will-change: transform, opacity/)
  const enterFrames = source.slice(source.indexOf('@keyframes codex-playback-enter'), source.indexOf('@keyframes codex-playback-exit'))
  const exitFrames = source.slice(source.indexOf('@keyframes codex-playback-exit'), source.indexOf("[data-codex-playback-enter='true']"))
  assert.doesNotMatch(enterFrames + exitFrames, /\bheight:|margin-bottom:/)
  assert.match(source, /function floatPlaybackStatus\(/)
  assert.match(source, /data-codex-playback-floating='true'/)
  assert.match(source, /position: absolute !important/)
  assert.doesNotMatch(source, /function (?:animatePlaybackShift|holdPlaybackShift)\(/)
})

test('the exit copy is visual-only, bounded, and removed', () => {
  assert.match(source, /function animatePlaybackExit\(/)
  assert.match(source, /cloneNode\(true\)/)
  assert.match(source, /setAttribute\('aria-hidden', 'true'\)/)
  assert.match(source, /ghost\.inert = true/)
  assert.match(source, /pointer-events: none !important/)
  assert.match(source, /data-codex-playback-floating/)
  assert.match(source, /drawImage\(sourceCanvas, 0, 0\)/)
  assert.match(source, /addEventListener\('animationend', removeGhost, \{ once: true \}\)/)
  assert.match(source, /window\.setTimeout\(removeGhost, PLAYBACK_MOTION_MS \+ 80\)/)
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
  assert.match(source, /pendingGhost\?\.__codexCancelPlaybackExit\?\.\(\)/)
})

test('voice rows are removed from layout so the composer stays vertically anchored', () => {
  const floating = rule("[data-slot='composer-fade'] > [data-codex-playback-floating='true']")
  assert.match(floating, /position: absolute !important/)
  assert.match(floating, /top: calc\(-28px - var\(--codex-playback-edge-gap\)\) !important/)
  assert.match(floating, /margin: 0 !important/)
  assert.match(source, /\[data-slot='composer-surface'\]:has\(\[data-codex-playback-floating='true'\]\)/)
})
