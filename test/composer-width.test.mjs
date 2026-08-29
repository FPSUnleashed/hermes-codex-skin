import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('Codex mode uses the measured 736 CSS px column', () => {
  assert.match(
    source,
    /html\[data-codex-chat-look='true'\]\[data-codex-composer-width='codex'\] \{[\s\S]{0,100}--composer-width: 736px/
  )
  const unscopedStart = source.indexOf("html[data-codex-chat-look='true'] {")
  const unscoped = source.slice(unscopedStart, source.indexOf('\n}', unscopedStart) + 2)
  assert.doesNotMatch(unscoped, /--composer-width/)
})

test('only Codex mode overrides dock width and keeps a 736px visible surface', () => {
  assert.match(
    source,
    /\[data-codex-composer-width='codex'\] \[data-slot='composer-dock'\]:not\(\[data-popped-out\]\) \{[\s\S]{0,180}width: calc\(min\(736px, calc\(100% - 2rem\)\) \+ 10px\) !important/
  )
  assert.match(
    source,
    /\[data-codex-composer-width='codex'\] \[data-slot='composer-dock'\]:not\(\[data-popped-out\]\) \{[\s\S]{0,240}max-width: calc\(100% - 22px\) !important/
  )
  assert.doesNotMatch(source, /data-codex-composer-width='hermes'[^}]{0,220}(?:width|max-width)\s*:/)
})

test('the composer uses the measured 21px Codex radius', () => {
  const start = source.indexOf("[data-slot='composer-root'],")
  const block = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(block, /border-radius: 21px !important/)
  assert.doesNotMatch(block, /border-radius: 25px/)
})

test('composer width is a persistent Codex versus Hermes palette setting', () => {
  assert.match(source, /const COMPOSER_WIDTH_STORAGE_KEY = 'composer-width'/)
  assert.match(source, /pluginStorage\?\.get\(COMPOSER_WIDTH_STORAGE_KEY, 'codex'\)/)
  assert.match(source, /root\.setAttribute\('data-codex-composer-width', mode\)/)
  assert.match(source, /label: 'Codex Skin: Composer width'/)
  assert.match(source, /detail: \(\) => \(readComposerWidthMode\(\) === 'codex' \? 'Codex' : 'Hermes'\)/)
  assert.match(source, /run: \(\) => setComposerWidthMode\(readComposerWidthMode\(\) === 'codex' \? 'hermes' : 'codex'\)/)
})

test('the Attach menu keeps its native compact width and Radix anchoring', () => {
  const menuStart = source.indexOf("[data-codex-context-menu='true'] {")
  const menuRule = source.slice(menuStart, source.indexOf('\n}', menuStart) + 2)
  assert.match(menuRule, /width: 240px !important/)
  assert.doesNotMatch(menuRule, /width: 100%/)
  assert.doesNotMatch(source, /--codex-context-menu-width/)
  assert.doesNotMatch(source, /data-codex-context-menu-shell/)
  assert.doesNotMatch(source, /Object\.assign\(shell\.style/)
})

test('floating composers keep their Hermes-owned width', () => {
  const blockStart = source.indexOf("[data-slot='composer-dock']:not([data-popped-out])")
  const block = source.slice(blockStart, source.indexOf('\n}', blockStart) + 2)
  assert.doesNotMatch(block, /composer-popout-width/)
})
