import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

test('the native queued-message edit banner is identified and cleaned up', () => {
  assert.match(source, /editBanner\?\.setAttribute\('data-codex-edit-banner', 'true'\)/)
  assert.match(source, /\[data-codex-context-menu\], \[data-codex-status-card\], \[data-codex-edit-banner\]/)
  assert.match(source, /element\.removeAttribute\('data-codex-edit-banner'\)/)
})

test('the queued-message edit banner uses compact neutral Codex chrome', () => {
  assert.match(source, /\[data-codex-edit-banner='true'\] \{[\s\S]{0,260}min-height: 32px !important/)
  assert.match(source, /\[data-codex-edit-banner='true'\] \{[\s\S]{0,260}border-radius: 10px !important/)
  assert.match(source, /\[data-codex-edit-banner='true'\] > div:first-child \{[\s\S]{0,220}font-size: 12px !important/)
  assert.match(source, /\[data-codex-edit-banner='true'\] button:last-child \{[\s\S]{0,180}border-radius: 999px !important/)
})

test('queued-message editing inherits its border and Save colors from the active theme', () => {
  assert.match(source, /\[data-codex-edit-banner='true'\] \{[\s\S]{0,260}border: 1px solid var\(--codex-color-border-subtle\) !important/)
  assert.match(source, /\[data-codex-edit-banner='true'\] button:last-child \{[\s\S]{0,180}background: var\(--codex-color-primary\) !important/)
  assert.match(source, /\[data-codex-edit-banner='true'\] button:last-child \{[\s\S]{0,220}color: var\(--codex-color-primary-foreground\) !important/)
  assert.doesNotMatch(source, /data-codex-edit-banner[^}]{0,300}#4d687b/)
})

test('the native inline message editor reuses the Codex user bubble', () => {
  assert.match(source, /\[data-slot='aui_edit-composer-root'\] \.composer-human-message-container \{[\s\S]{0,160}background: transparent !important/)
  assert.match(source, /\[data-slot='aui_edit-composer-root'\] \.composer-human-message \{[\s\S]{0,260}border-radius: 17px !important/)
  assert.match(source, /\[data-slot='aui_edit-composer-root'\] \[data-slot='composer-rich-input'\] \{[\s\S]{0,340}font-size: 14px !important/)
  assert.match(source, /\[data-slot='aui_edit-composer-root'\] \[data-slot='composer-rich-input'\] \{[\s\S]{0,220}color: var\(--codex-color-text\) !important/)
  assert.match(source, /\[data-slot='aui_edit-composer-root'\] \.composer-human-message > button:last-child \{[\s\S]{0,240}border-radius: 9999px !important/)
})
