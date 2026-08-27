import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')
const cleanCss = source.slice(
  source.indexOf('/* Clean conversation is deliberately opt-in.'),
  source.indexOf("html[data-codex-chat-look='true'][data-hermes-mode='light']")
)

test('clean conversation is a persisted public setting that defaults off', () => {
  assert.match(source, /const CLEAN_CONVERSATION_STORAGE_KEY = 'clean-conversation'/)
  assert.match(source, /pluginStorage\?\.get\(CLEAN_CONVERSATION_STORAGE_KEY, false\) === true/)
  assert.match(source, /id: 'codex-chat-look\.toggle-clean-conversation'/)
  assert.match(source, /label: 'Codex Skin: Clean conversation'/)
  assert.match(source, /detail: \(\) => \(readCleanConversationEnabled\(\) \? 'on' : 'off'\)/)
})

test('clean conversation hides owned technical chrome without hiding assistant prose', () => {
  assert.match(cleanCss, /\[data-slot='tool-block'\]:not\(:has\(/)
  assert.match(cleanCss, /\[data-slot='aui_changed-files'\]/)
  assert.match(cleanCss, /\[data-slot='aui_thinking-disclosure'\]\s*\{\s*display: none !important;/)
  assert.doesNotMatch(cleanCss, /aui_assistant-message-root/)
})

test('clean conversation preserves generated images and their parent tool block', () => {
  const toolRule = cleanCss.slice(cleanCss.indexOf("[data-slot='tool-block']:not(:has("), cleanCss.indexOf(')),\n'))
  assert.match(toolRule, /\[data-slot='aui_generated-image'\]/)
  assert.doesNotMatch(
    cleanCss,
    /\[data-slot='aui_changed-files'\],\s*\n\s*\[data-slot='aui_generated-image'\]/
  )
})

test('clean conversation preserves Hermes native working and loading status', () => {
  assert.doesNotMatch(cleanCss, /aui_response-loading|aui_stream-stall|aui_turn-activity/)
  assert.match(source, /\[data-slot='aui_response-loading'\]\[aria-label='Summarizing thread'\]/)
})

test('clarify questions and approvals remain visible while tool errors stay hidden', () => {
  const toolRule = source.slice(source.indexOf("[data-slot='tool-block']:not(:has("), source.indexOf("[data-slot='aui_changed-files']"))
  assert.match(toolRule, /\[data-slot='clarify-inline'\]:not\(\[data-clarify-settled\]\)/)
  assert.match(toolRule, /\[data-slot='tool-approval-inline'\]/)
  assert.match(toolRule, /\[data-slot='tool-approval-fallback'\]/)
  assert.doesNotMatch(toolRule, /role='alert'|Tool failed|Tool recovered|text-amber/)
})

test('clean filtering is reversible and leaves the shared status card native', () => {
  assert.match(source, /else root\.removeAttribute\('data-codex-clean-conversation'\)/)
  assert.match(source, /root\.removeAttribute\('data-codex-clean-conversation'\)/)
  assert.doesNotMatch(source, /data-codex-clean-hidden|applyCleanConversation|cleanConversationDirty/)
  assert.doesNotMatch(source, /setCleanHidden\(statusCard|function applyCleanComposerStatus/)
})
