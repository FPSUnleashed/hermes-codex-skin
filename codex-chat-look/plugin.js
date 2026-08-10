import { host, THEMES_AREA, TITLEBAR_AREAS } from '@hermes/plugin-sdk'
import { useEffect, useRef } from 'react'
import { jsx } from 'react/jsx-runtime'

const ID = 'codex-chat-look'
const STYLE_ID = `${ID}-styles`
const BUILD_ID = 'native-model-menu-v4'
const STORAGE_PREFIX = `${ID}:turn:`
const LONG_USER_STATE_SUFFIX = ':long-user-expanded'
const MAX_PERSISTED_LONG_USER_STATES = 250
const RUNTIME_HANDOFF_KEY = '__hermesCodexChatLookRuntimeHandoff'

const SYSTEM_FONT = `-apple-system, system-ui, "Segoe UI", sans-serif`
const HERMES_FONT = SYSTEM_FONT

const CODEX_THEME = {
  name: 'codex-chat',
  label: 'Codex Chat',
  description: 'Codex desktop light and dark palettes with system typography',
  colors: {
    background: '#FFFFFF',
    foreground: '#0D0D0D',
    card: '#FFFFFF',
    cardForeground: '#0D0D0D',
    muted: '#F3F3F3',
    mutedForeground: '#737373',
    popover: '#FFFFFF',
    popoverForeground: '#0D0D0D',
    primary: '#0D0D0D',
    primaryForeground: '#FFFFFF',
    secondary: '#F3F3F3',
    secondaryForeground: '#0D0D0D',
    accent: '#ECECEC',
    accentForeground: '#0D0D0D',
    border: '#E5E5E5',
    input: '#E5E5E5',
    ring: '#0D0D0D',
    composerRing: '#D9D9D9',
    destructive: '#D00E17',
    destructiveForeground: '#FFFFFF',
    sidebarBackground: '#FCFCFC',
    sidebarBorder: '#E5E5E5',
    userBubble: '#F3F3F3',
    userBubbleBorder: '#F3F3F3'
  },
  darkColors: {
    background: '#212121',
    foreground: '#ECECEC',
    card: '#2F2F2F',
    cardForeground: '#ECECEC',
    muted: '#2F2F2F',
    mutedForeground: '#B4B4B4',
    popover: '#2F2F2F',
    popoverForeground: '#ECECEC',
    primary: '#ECECEC',
    primaryForeground: '#212121',
    secondary: '#2F2F2F',
    secondaryForeground: '#ECECEC',
    accent: '#424242',
    accentForeground: '#ECECEC',
    border: '#424242',
    input: '#424242',
    ring: '#ECECEC',
    composerRing: '#565656',
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',
    sidebarBackground: '#171717',
    sidebarBorder: '#2F2F2F',
    userBubble: '#2F2F2F',
    userBubbleBorder: '#424242'
  },
  typography: {
    fontSans: SYSTEM_FONT,
    fontMono: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
  }
}

const MIC_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M18.5848 13.4121C18.7715 12.9516 19.2961 12.7296 19.7567 12.916C20.217 13.1027 20.4391 13.6274 20.2528 14.0879C19.0405 17.0826 16.2438 19.2675 12.9003 19.6035V22C12.9003 22.4971 12.4969 22.9004 11.9999 22.9004C11.5029 22.9003 11.0995 22.497 11.0995 22V19.6035C7.75618 19.2673 4.96018 17.0823 3.74791 14.0879C3.56144 13.6272 3.78344 13.1026 4.244 12.916C4.70458 12.7298 5.22933 12.9517 5.41588 13.4121C6.46985 16.0157 9.02264 17.8496 12.0008 17.8496C14.9787 17.8493 17.531 16.0155 18.5848 13.4121ZM11.9999 1.34961C14.7061 1.34961 16.9003 3.5438 16.9003 6.25V10.7334C16.9003 13.4396 14.7061 15.6338 11.9999 15.6338C9.29371 15.6337 7.09947 13.4396 7.09947 10.7334V6.25C7.09947 3.54384 9.29372 1.34967 11.9999 1.34961ZM11.9999 3.15039C10.2878 3.15045 8.90025 4.53795 8.90025 6.25V10.7334C8.90025 12.4454 10.2878 13.8339 11.9999 13.834C13.7119 13.834 15.0995 12.4455 15.0995 10.7334V6.25C15.0995 4.53792 13.7119 3.15039 11.9999 3.15039Z'/%3E%3C/svg%3E")`
const SEND_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M11.25 18.25V7.56L7.53 11.28a.75.75 0 0 1-1.06-1.06l5-5a.75.75 0 0 1 1.06 0l5 5a.75.75 0 1 1-1.06 1.06l-3.72-3.72v10.69a.75.75 0 0 1-1.5 0Z'/%3E%3C/svg%3E")`

const CSS = `
html[data-codex-chat-look='true'] {
  --conversation-text-font-size: 14px;
  --conversation-line-height: 22px;
  --sticky-human-top: 0px;
  --dt-font-sans: ${SYSTEM_FONT};
  --font-sans: ${SYSTEM_FONT};
  --ui-chat-surface-background: #ffffff;
  --ui-sidebar-surface-background: #fcfcfc;
  --ui-row-active-background: #efefef;
}

html[data-codex-chat-look='true'][data-hermes-mode='light'] {
  color-scheme: light;
  --theme-primary: #0d0d0d;
  --theme-secondary: #f3f3f3;
  --theme-accent-soft: #ececec;
  --theme-midground: #0d0d0d;
  --theme-background-seed: #ffffff;
  --theme-sidebar-seed: #fcfcfc;
  --theme-bubble-seed: #f3f3f3;
  --ui-accent: #0d0d0d;
  --ui-accent-secondary: #0d0d0d;
}

html[data-codex-chat-look='true'] body,
html[data-codex-chat-look='true'] button,
html[data-codex-chat-look='true'] input,
html[data-codex-chat-look='true'] textarea,
html[data-codex-chat-look='true'] [contenteditable='true'] {
  font-family: ${SYSTEM_FONT} !important;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

html[data-codex-chat-look='true'] [data-slot='aui_thread-viewport'],
html[data-codex-chat-look='true'] [data-slot='aui_thread-content'],
html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'] {
  background: #ffffff !important;
}

/* Keep one live-tail wrapper fully laid out only while the viewport is at the
   bottom. Scrolling away removes this marker and restores native virtualization. */
html[data-codex-chat-look='true'] [data-slot='aui_thread-content'] > [data-codex-live-tail='true'] {
  content-visibility: visible !important;
  contain-intrinsic-size: none !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-root'],
html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'] {
  background: transparent !important;
  color: #0d0d0d !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'],
html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'] .aui-md,
html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'] .aui-md :where(p, li, blockquote, table),
html[data-codex-chat-look='true'] [data-slot='aui_user-inline-text'] {
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 22px !important;
  font-weight: 400 !important;
  color: #0d0d0d !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'] .aui-md li::marker {
  color: #0d0d0d !important;
  opacity: 1 !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'] {
  align-items: flex-end !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_user-bubble-actions'] {
  width: fit-content !important;
  min-width: 0 !important;
  max-width: 77% !important;
  align-self: flex-end !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'] .composer-human-message {
  width: 100% !important;
  max-width: 100% !important;
  border: 0 !important;
  border-radius: 17px !important;
  background: #f3f3f3 !important;
  color: #0d0d0d !important;
  padding: 8px 12px !important;
  text-align: left !important;
}

/* Codex keeps a useful amount of long prompts visible: 18 text lines, then a
   dedicated ellipsis row and an explicit expand control. Neutralize Hermes'
   four-line gradient first; runtime only reapplies the hard clamp to messages
   whose measured full height actually exceeds the Codex limit. */
html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'] .sticky-human-clamp {
  max-height: none !important;
  overflow: visible !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'][data-codex-long-user='true'] .composer-human-message {
  padding-bottom: 38px !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'][data-codex-long-user='true']:not([data-codex-user-expanded='true']) .sticky-human-clamp {
  position: relative;
  max-height: 198px !important;
  overflow: hidden !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'][data-codex-long-user='true']:not([data-codex-user-expanded='true']) .sticky-human-clamp::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 22px;
  background: #f3f3f3;
  color: #0d0d0d;
  content: '...';
  font: inherit;
  line-height: 22px;
}

html[data-codex-chat-look='true'] [data-codex-user-expand] {
  position: absolute;
  bottom: 8px;
  left: 12px;
  z-index: 11;
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(13, 13, 13, 0.66);
  cursor: pointer;
  font: inherit;
  line-height: 22px;
}

html[data-codex-chat-look='true'] [data-codex-user-expand]:hover {
  color: rgba(13, 13, 13, 0.86);
}

html[data-codex-chat-look='true'] [data-codex-user-chevron] {
  width: 8px;
  height: 8px;
  margin-top: -4px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
}

html[data-codex-chat-look='true'] [data-codex-user-expand][aria-expanded='true'] [data-codex-user-chevron] {
  margin-top: 4px;
  transform: rotate(225deg);
}

@media (max-width: 720px) {
  html[data-codex-chat-look='true'] [data-slot='aui_user-bubble-actions'] {
    max-width: 88% !important;
  }
}

html[data-codex-chat-look='true'][data-hermes-mode='light'] [data-slot='aui_user-message-root'] .composer-human-message {
  background: #f3f3f3 !important;
  color: #0d0d0d !important;
}

/* Keep Hermes' compact live-thinking typography. The Codex answer font must
   never leak into the streaming reasoning preview. */
html[data-codex-chat-look='true'] [data-streaming='true'] [data-slot='aui_thinking-disclosure'] {
  font-family: ${HERMES_FONT} !important;
  font-size: 11px !important;
  line-height: 16.5px !important;
  font-weight: 400 !important;
  color: rgba(13, 13, 13, 0.54) !important;
}

html[data-codex-chat-look='true'] [data-streaming='true'] [data-slot='aui_thinking-disclosure'] :where(button, span) {
  font-family: ${HERMES_FONT} !important;
  font-size: 11px !important;
  line-height: 16.5px !important;
  font-weight: 400 !important;
}

html[data-codex-chat-look='true'] [data-streaming='true'] [data-slot='aui_reasoning-text'],
html[data-codex-chat-look='true'] [data-streaming='true'] [data-slot='aui_reasoning-text'] .aui-md,
html[data-codex-chat-look='true'] [data-streaming='true'] [data-slot='aui_reasoning-text'] .aui-md :where(p, li, blockquote) {
  font-family: ${HERMES_FONT} !important;
  font-size: 12px !important;
  line-height: 15px !important;
  font-weight: 400 !important;
  color: rgba(13, 13, 13, 0.60) !important;
}

/* Codex sidebar: #fcfcfc shell and exact #efefef selected-row fill sampled
   from the Retina reference. Its 20px photographed radius is 10 CSS px. */
html[data-codex-chat-look='true'] [data-slot='sidebar'],
html[data-codex-chat-look='true'] [data-slot='sidebar-content'],
html[data-codex-chat-look='true'] [data-slot='sidebar-group'],
html[data-codex-chat-look='true'] [data-slot='sidebar-group-content'] {
  background: #fcfcfc !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] .row-hover[class*='ui-row-active-background'],
html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-active='true'],
html[data-codex-chat-look='true'] [data-slot='sidebar'] [aria-current='true'] {
  min-height: 30px !important;
  border: 0 !important;
  border-radius: 10px !important;
  outline: 0 !important;
  background: #efefef !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-working='true'] {
  --ui-accent: #0d0d0d;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [class~='group/section-label'] > span > .dither {
  display: none !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='light'] [data-slot='sidebar'] [class~='group/section-label'] > span:first-child {
  color: #0d0d0d !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] .row-hover[data-working='true'] {
  border-radius: 10px !important;
  overflow: hidden !important;
  isolation: isolate;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] .row-hover[data-working='true'] > .arc-border {
  inset: 0 !important;
  border-radius: inherit !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-working='true'] [aria-label='Session running'],
html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-working='true'] [aria-label='Session en cours'] {
  background: #0d0d0d !important;
  box-shadow: 0 0 0.625rem rgba(13, 13, 13, 0.26) !important;
}

/* A turn that finished in another chat stays a steady green attention cue.
   Keep it distinct from the black animated running dot and gray background dot. */
html[data-codex-chat-look='true'] [data-slot='sidebar'] [role='status'][class~='bg-emerald-500'] {
  width: 8px !important;
  min-width: 8px !important;
  height: 8px !important;
  flex: 0 0 8px !important;
  background: #22c55e !important;
  opacity: 1 !important;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.14), 0 0 8px rgba(34, 197, 94, 0.48) !important;
}

/* Codex sidebar scrollbar: a neutral overlay thumb exists only while the user
   is actively scrolling. Runtime attributes avoid a permanent gutter/blue
   system-accent thumb without replacing the native scroll container. */
html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-codex-scrollbar='true'] {
  scrollbar-color: transparent transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-codex-scrollbar='true']::-webkit-scrollbar {
  width: 8px !important;
  height: 8px !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-codex-scrollbar='true']::-webkit-scrollbar-track,
html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-codex-scrollbar='true']::-webkit-scrollbar-corner {
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-codex-scrollbar='true']::-webkit-scrollbar-thumb {
  min-height: 28px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: transparent;
  background-clip: padding-box;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-codex-scrollbar='true'][data-codex-scrolling='true'] {
  scrollbar-color: rgba(13, 13, 13, 0.28) transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-codex-scrollbar='true'][data-codex-scrolling='true']::-webkit-scrollbar-thumb {
  background-color: rgba(13, 13, 13, 0.28) !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true'] {
  scrollbar-color: transparent transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true']::-webkit-scrollbar {
  width: 8px !important;
  height: 8px !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true']::-webkit-scrollbar-track,
html[data-codex-chat-look='true'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true']::-webkit-scrollbar-corner {
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true']::-webkit-scrollbar-thumb {
  min-height: 28px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: transparent;
  background-clip: padding-box;
}

html[data-codex-chat-look='true'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true'][data-codex-scrolling='true'] {
  scrollbar-color: rgba(13, 13, 13, 0.28) transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true'][data-codex-scrolling='true']::-webkit-scrollbar-thumb {
  background-color: rgba(13, 13, 13, 0.28) !important;
}

/* The running activity glyph and elapsed time use Codex anthracite instead of blue. */
html[data-codex-chat-look='true'] [data-slot='tool-block'] [aria-label='Running'],
html[data-codex-chat-look='true'] [data-slot='tool-block'] [aria-label='En cours'],
html[data-codex-chat-look='true'] [data-slot='tool-block'] span[class*='tabular-nums'] {
  color: #0d0d0d !important;
  opacity: 0.70 !important;
}

@keyframes codex-compaction-spin {
  to { transform: rotate(360deg); }
}

/* Keep the ordinary duplicate loading/timer rows hidden, but restore Hermes'
   native auto-compaction signal. The aria-label is native compaction state —
   no guessed text, polling, or replacement compression logic. */
html[data-codex-chat-look='true'] [data-slot='aui_response-loading'][aria-label='Summarizing thread'] {
  width: fit-content !important;
  max-width: min(100%, 44rem) !important;
  display: flex !important;
  align-self: center !important;
  align-items: center !important;
  gap: 7px !important;
  margin: 4px auto 8px !important;
  padding: 4px 8px !important;
  border: 1px solid rgba(13, 13, 13, 0.08) !important;
  border-radius: 10px !important;
  background: #f3f3f3 !important;
  color: rgba(13, 13, 13, 0.58) !important;
  font-size: 12px !important;
  line-height: 20px !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_response-loading'][aria-label='Summarizing thread'] .dither {
  width: 12px !important;
  height: 12px !important;
  flex: 0 0 12px !important;
  border: 1.5px solid rgba(13, 13, 13, 0.22) !important;
  border-right-color: rgba(13, 13, 13, 0.72) !important;
  border-radius: 999px !important;
  background: transparent !important;
  color: transparent !important;
  animation: codex-compaction-spin 800ms linear infinite !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_response-loading'][aria-label='Summarizing thread'] .shimmer {
  color: inherit !important;
}

/* Codex keeps tool activity in the ordinary timeline. Hermes' bounded tool
   window scrolls its children behind a short viewport, which makes commands
   look stacked. Preserve every native row/action but let the group flow. */
html[data-codex-chat-look='true'] [data-tool-group],
html[data-codex-chat-look='true'] [data-tool-group] .tool-group-scroll {
  max-height: none !important;
  overflow: visible !important;
  scrollbar-width: none !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}

/* Hide the branch / dirty-files strip only. Git state and review remain intact. */
html[data-codex-chat-look='true'] .coding-status-bar {
  display: none !important;
}

/* Codex composer geometry measured from the live app. */
html[data-codex-chat-look='true'] [data-slot='composer-root'],
html[data-codex-chat-look='true'] [data-slot='composer-root'] > div,
html[data-codex-chat-look='true'] [data-slot='composer-surface'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] > [aria-hidden] {
  border-radius: 25px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] {
  min-height: 98px !important;
  border: 0 none transparent !important;
  background: #ffffff !important;
  box-shadow:
    0 0 0 0.5px rgba(13, 13, 13, 0.117),
    0 3px 7.5px rgba(0, 0, 0, 0.04),
    0 0 20px rgba(0, 0, 0, 0.05) !important;
  backdrop-filter: none !important;
  overflow: hidden !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] > [aria-hidden] {
  background: #ffffff !important;
  backdrop-filter: none !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-fade'] {
  padding: 12px 15px 10px !important;
  gap: 0 !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-fade'] > div:last-child {
  grid-template-columns: auto 1fr auto !important;
  grid-template-areas: "input input input" "menu . controls" !important;
  align-items: center !important;
  row-gap: 4px !important;
  column-gap: 5px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-rich-input'] {
  min-height: 44px !important;
  padding: 0 !important;
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 20px !important;
  font-weight: 445 !important;
  scrollbar-width: thin !important;
  scrollbar-color: rgba(13, 13, 13, 0.22) transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-rich-input']::-webkit-scrollbar {
  width: 8px !important;
  height: 8px !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-rich-input']::-webkit-scrollbar-track,
html[data-codex-chat-look='true'] [data-slot='composer-rich-input']::-webkit-scrollbar-corner {
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-rich-input']::-webkit-scrollbar-thumb {
  min-height: 28px;
  border: 2px solid transparent !important;
  border-radius: 999px !important;
  background-color: rgba(13, 13, 13, 0.22) !important;
  background-image: none !important;
  background-clip: padding-box !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-rich-input']::-webkit-scrollbar-thumb:hover {
  background-color: rgba(13, 13, 13, 0.38) !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-rich-input']::-webkit-scrollbar-button {
  display: none !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-rich-input'] {
  scrollbar-color: rgba(236, 236, 236, 0.22) transparent !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-rich-input']::-webkit-scrollbar-thumb {
  background-color: rgba(236, 236, 236, 0.22) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-rich-input']::-webkit-scrollbar-thumb:hover {
  background-color: rgba(236, 236, 236, 0.38) !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label='Add context'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label='Ajouter du contexte'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label='Voice dictation'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label='Dictée vocale'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label='Send'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label='Envoyer'] {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  border-radius: 9999px !important;
  padding: 0 !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label^='Model ·'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label^='Modèle ·'] {
  min-height: 28px !important;
  border-radius: 9999px !important;
  padding: 0 8px !important;
  color: rgba(13, 13, 13, 0.66) !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label^='Model ·'],[aria-label^='Modèle ·'])[data-state='open'] {
  background: #f3f3f3 !important;
  color: #0d0d0d !important;
}

html[data-codex-chat-look='true'] [data-codex-model-trigger='true'] [data-codex-trigger-model] {
  color: #0d0d0d;
}

html[data-codex-chat-look='true'] [data-codex-model-trigger='true'] [data-codex-trigger-effort] {
  color: rgba(13, 13, 13, 0.49);
}

/* Replace only the idle dictation/send glyphs; their actual Hermes buttons and
   handlers stay untouched. Busy stop/queue controls keep their native icons. */
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Voice dictation'],[aria-label='Dictée vocale']) > *,
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Send'],[aria-label='Envoyer']) > * {
  display: none !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Voice dictation'],[aria-label='Dictée vocale'])::before,
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Send'],[aria-label='Envoyer'])::before {
  content: '';
  display: block;
  width: 16px;
  height: 16px;
  background: currentColor;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Voice dictation'],[aria-label='Dictée vocale'])::before {
  mask-image: ${MIC_MASK};
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Voice dictation'],[aria-label='Dictée vocale']) {
  color: #0d0d0d !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Send'],[aria-label='Envoyer'])::before {
  mask-image: ${SEND_MASK};
}

/* Remove Hermes-only auto-speak and wake-word ear controls. */
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label^='Read replies aloud'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label^='Stop reading replies'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label^='Lire les réponses'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label^='Wake word'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[aria-label*='mot de réveil'] {
  display: none !important;
}

/* Codex full-width add menu. The runtime tags and positions the Radix portal
   against the real composer bounds, so it remains aligned after resize. */
html[data-codex-chat-look='true'] [data-codex-context-menu='true'] {
  width: 100% !important;
  max-height: min(40vh, 360px) !important;
  padding: 4px !important;
  border: 1px solid rgba(13, 13, 13, 0.08) !important;
  border-radius: 20px !important;
  background: rgba(255, 255, 255, 0.96) !important;
  box-shadow:
    0 0 0 0.5px rgba(13, 13, 13, 0.08),
    0 -2px 8px rgba(0, 0, 0, 0.04),
    0 -8px 24px -8px rgba(0, 0, 0, 0.10) !important;
  backdrop-filter: blur(16px) !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu-shell='true'] {
  transform: none !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-label'] {
  padding: 8px 12px 6px !important;
  color: rgba(13, 13, 13, 0.50) !important;
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 20px !important;
  font-weight: 400 !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-item'] {
  min-height: 40px !important;
  gap: 10px !important;
  padding: 8px 12px !important;
  border-radius: 12px !important;
  color: rgba(13, 13, 13, 0.78) !important;
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 20px !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-item']:is(:hover,:focus,[data-highlighted]) {
  background: rgba(13, 13, 13, 0.049) !important;
  color: #0d0d0d !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-item'] svg {
  width: 20px !important;
  height: 20px !important;
  color: rgba(13, 13, 13, 0.68) !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-separator'] {
  margin: 4px 8px !important;
  background: rgba(13, 13, 13, 0.08) !important;
}

/* Preserve Hermes' native status/Queue structure. Only inset and skin the
   shared Tasks/Queue card so it clears the composer's rounded shoulders. */
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full {
  bottom: calc(100% - 16px) !important;
  left: 19px !important;
  right: 19px !important;
  width: auto !important;
  z-index: 3 !important;
  transform: none !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  overflow: visible auto !important;
}

/* Live/legacy Hermes stack: the dock is 10px wider than its surface. Keep
   positioning offsets at auto — left/right on this relative flex item would
   translate the whole stack instead of defining an inset. */
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] {
  position: relative !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  z-index: 3 !important;
  width: auto !important;
  margin-right: 19px !important;
  margin-bottom: -16px !important;
  margin-left: 19px !important;
  transform: none !important;
  translate: none !important;
  border: 0 !important;
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'],
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child,
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child {
  margin: 0 !important;
  padding: 6px 8px 24px !important;
  border: 1px solid rgba(13, 13, 13, 0.08) !important;
  border-bottom: 0 !important;
  border-radius: 20px 20px 0 0 !important;
  background: #ffffff !important;
  box-shadow:
    0 0 0 0.5px rgba(13, 13, 13, 0.08),
    0 -2px 8px rgba(0, 0, 0, 0.04),
    0 -8px 24px -10px rgba(0, 0, 0, 0.10) !important;
  backdrop-filter: none !important;
  overflow: hidden !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='light'] [data-codex-status-card='true'],
html[data-codex-chat-look='true'][data-hermes-mode='light'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child,
html[data-codex-chat-look='true'][data-hermes-mode='light'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child {
  border: 0 !important;
  background: #f5f5f5 !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'] > div + div,
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child > div + div,
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child > div + div {
  border-top: 1px solid rgba(13, 13, 13, 0.08) !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'] button,
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child button,
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child button {
  border-radius: 12px !important;
  color: rgba(13, 13, 13, 0.68) !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'] button:hover,
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child button:hover,
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child button:hover {
  color: #0d0d0d !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'] [class~='group/status-row'],
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child [class~='group/status-row'],
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child [class~='group/status-row'] {
  min-height: 38px !important;
  padding: 7px 10px !important;
  border-radius: 12px !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='light'] [data-slot='aui_intro'] [aria-label='HERMES AGENT'] {
  color: #0d0d0d !important;
  mix-blend-mode: normal !important;
}

/* Codex dark palette. Hermes owns the mode signal and updates
   data-hermes-mode synchronously on every light/dark/system change. */
html[data-codex-chat-look='true'][data-hermes-mode='dark'] {
  color-scheme: dark;
  --ui-base: #ececec;
  --ui-accent: #ececec;
  --ui-text-primary: #ececec;
  --ui-text-secondary: #b4b4b4;
  --ui-text-tertiary: #8e8e8e;
  --ui-text-quaternary: #666666;
  --ui-stroke-primary: rgba(255, 255, 255, 0.14);
  --ui-stroke-secondary: rgba(255, 255, 255, 0.10);
  --ui-stroke-tertiary: rgba(255, 255, 255, 0.07);
  --ui-bg-primary: rgba(255, 255, 255, 0.12);
  --ui-bg-secondary: rgba(255, 255, 255, 0.08);
  --ui-bg-tertiary: rgba(255, 255, 255, 0.05);
  --ui-chat-surface-background: #212121;
  --ui-sidebar-surface-background: #171717;
  --ui-editor-surface-background: #212121;
  --ui-row-active-background: #2f2f2f;
  --ui-bg-chrome: #171717;
  --dt-background: #212121 !important;
  --dt-foreground: #ececec !important;
  --dt-card: #2f2f2f !important;
  --dt-card-foreground: #ececec !important;
  --dt-muted: #2f2f2f !important;
  --dt-muted-foreground: #8e8e8e !important;
  --dt-popover: rgba(47, 47, 47, 0.97) !important;
  --dt-popover-foreground: #ececec !important;
  --dt-secondary: #2f2f2f !important;
  --dt-secondary-foreground: #b4b4b4 !important;
  --dt-accent: #424242 !important;
  --dt-accent-foreground: #ececec !important;
  --dt-border: #424242 !important;
  --dt-input: #424242 !important;
  --dt-ring: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] body {
  background-color: #212121 !important;
  color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_thread-viewport'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_thread-content'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_user-message-root'] {
  background: #212121 !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_assistant-message-root'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_assistant-message-content'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_assistant-message-content'] .aui-md,
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_assistant-message-content'] .aui-md :where(p, li, blockquote, table),
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_user-inline-text'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_assistant-message-content'] .aui-md li::marker {
  color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_user-message-root'] .composer-human-message {
  background: #2f2f2f !important;
  color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_user-message-root'][data-codex-long-user='true']:not([data-codex-user-expanded='true']) .sticky-human-clamp::after {
  background: #2f2f2f;
  color: #ececec;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-user-expand] {
  color: rgba(236, 236, 236, 0.66);
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-user-expand]:hover {
  color: rgba(236, 236, 236, 0.86);
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-streaming='true'] [data-slot='aui_thinking-disclosure'] {
  color: rgba(236, 236, 236, 0.54) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-streaming='true'] [data-slot='aui_reasoning-text'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-streaming='true'] [data-slot='aui_reasoning-text'] .aui-md,
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-streaming='true'] [data-slot='aui_reasoning-text'] .aui-md :where(p, li, blockquote) {
  color: rgba(236, 236, 236, 0.60) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar-content'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar-group'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar-group-content'] {
  background: #171717 !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar'] .row-hover[class*='ui-row-active-background'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar'] [data-active='true'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar'] [aria-current='true'] {
  background: #2f2f2f !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar'] [data-working='true'] {
  --ui-accent: #ececec;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar'] [data-working='true'] [aria-label='Session running'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar'] [data-working='true'] [aria-label='Session en cours'] {
  background: #ececec !important;
  box-shadow: 0 0 0.625rem rgba(236, 236, 236, 0.22) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar'] [data-codex-scrollbar='true'][data-codex-scrolling='true'] {
  scrollbar-color: rgba(255, 255, 255, 0.28) transparent !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='sidebar'] [data-codex-scrollbar='true'][data-codex-scrolling='true']::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.28) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true'][data-codex-scrolling='true'] {
  scrollbar-color: rgba(255, 255, 255, 0.28) transparent !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true'][data-codex-scrolling='true']::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.28) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='tool-block'] [aria-label='Running'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='tool-block'] [aria-label='En cours'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='tool-block'] span[class*='tabular-nums'] {
  color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-surface'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-surface'] > [aria-hidden] {
  background: #2f2f2f !important;
  backdrop-filter: none !important;
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.12),
    0 3px 8px rgba(0, 0, 0, 0.24),
    0 0 20px rgba(0, 0, 0, 0.18) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-rich-input'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-rich-input'] :where(textarea, [contenteditable='true']) {
  color: #ececec !important;
  caret-color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-rich-input'] :where(textarea, [contenteditable='true'])::placeholder {
  color: #b4b4b4 !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-surface'] button[aria-label^='Model ·'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-surface'] button[aria-label^='Modèle ·'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-model-trigger='true'] [data-codex-trigger-effort] {
  color: rgba(236, 236, 236, 0.66) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-surface'] button:is([aria-label^='Model ·'],[aria-label^='Modèle ·'])[data-state='open'] {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-model-trigger='true'] [data-codex-trigger-model] {
  color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-surface'] button:is([aria-label='Voice dictation'],[aria-label='Dictée vocale']) {
  color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-context-menu='true'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-status-card='true'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child,
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child {
  border-color: rgba(255, 255, 255, 0.10) !important;
  background: #2f2f2f !important;
  backdrop-filter: none !important;
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.08),
    0 -2px 8px rgba(0, 0, 0, 0.20),
    0 -8px 24px -8px rgba(0, 0, 0, 0.34) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-label'] {
  color: rgba(236, 236, 236, 0.54) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-item'] {
  color: rgba(236, 236, 236, 0.82) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-item']:is(:hover,:focus,[data-highlighted]) {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-item'] svg {
  color: rgba(236, 236, 236, 0.70) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-separator'],
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-status-card='true'] > div + div,
html[data-codex-chat-look='true'][data-hermes-mode='dark'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child > div + div,
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child > div + div {
  background: rgba(255, 255, 255, 0.10) !important;
  border-color: rgba(255, 255, 255, 0.10) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-status-card='true'] button,
html[data-codex-chat-look='true'][data-hermes-mode='dark'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child button,
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child button {
  color: rgba(236, 236, 236, 0.68) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-codex-status-card='true'] button:hover,
html[data-codex-chat-look='true'][data-hermes-mode='dark'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child button:hover,
html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child button:hover {
  color: #ececec !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_response-loading'][aria-label='Summarizing thread'] {
  border-color: rgba(255, 255, 255, 0.10) !important;
  background: #2f2f2f !important;
  color: rgba(236, 236, 236, 0.68) !important;
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] [data-slot='aui_response-loading'][aria-label='Summarizing thread'] .dither {
  border-color: rgba(236, 236, 236, 0.24) !important;
  border-right-color: rgba(236, 236, 236, 0.82) !important;
}

`

function safeGet(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    // Storage can be unavailable in hardened/ephemeral renderer contexts.
    return false
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable in hardened/ephemeral renderer contexts.
  }
}

function profileScope(value) {
  return String(value || 'default')
}

function currentProfileScope() {
  try {
    return profileScope(host.state.profile.get())
  } catch {
    return 'default'
  }
}

function currentRuntimeSessionId() {
  try {
    return String(host.state.activeSessionId.get() || '')
  } catch {
    return ''
  }
}

function routedStoredSessionId() {
  try {
    const raw = window.location.hash.match(/^#\/([^/?#]+)/)?.[1] || ''
    if (!raw) return ''
    const decoded = decodeURIComponent(raw)
    const reserved = new Set(['agents', 'command-center', 'cron', 'new', 'profiles', 'settings', 'starmap'])
    return reserved.has(decoded) ? '' : decoded
  } catch {
    return ''
  }
}

function isProvisionalTurn(pair) {
  const messageId = pair.querySelector(':scope > [data-role="user"]')?.getAttribute('data-message-id') || ''
  return !messageId || /^user-(?:inflight|queued|pending)(?:-|$)/i.test(messageId)
}

function currentTurnScope() {
  return { profile: currentProfileScope(), routeId: routedStoredSessionId() }
}

function turnStorageKey(pair) {
  const user = pair.querySelector(':scope > [data-role="user"]')
  if (!user || isProvisionalTurn(pair)) return null
  const messageId = userMessageId(pair)
  if (!messageId) return null
  const scope = currentTurnScope()
  const sessionId = scope.routeId || currentRuntimeSessionId()
  if (!sessionId) return null
  const profile = encodeURIComponent(scope.profile)
  const session = encodeURIComponent(sessionId)
  return `${STORAGE_PREFIX}${profile}:${session}:${encodeURIComponent(messageId)}`
}

function userMessageId(pair) {
  return pair.querySelector(':scope > [data-role="user"]')?.getAttribute('data-message-id') || ''
}

const IMAGE_ATTACHMENT_MARKER_LINE_RE = /(?:^|\n)[ \t]*\[Image attached at:\s*[^\]\r\n]+\][ \t]*(?=\n|$)/gi
const IMAGE_ATTACHMENT_MARKER_RE = /\[Image attached at:\s*[^\]\r\n]+\]/gi

function hasRenderedImageAttachment(user) {
  const attachmentRow = user?.nextElementSibling
  if (!attachmentRow || attachmentRow.matches('[data-role="assistant"], [data-role="user"]')) return false
  return Boolean(
    attachmentRow.querySelector(
      'img[slot="aui_directive-image"], img[slot="aui_embedded-image"], [data-slot="aui_embedded-images"] img'
    )
  )
}

function stripImageAttachmentMarker(pair) {
  const user = pair.querySelector(':scope > [data-role="user"]')
  const messageText = user?.querySelector('[data-slot="aui_user-message-text"]')
  if (!user || !messageText || !hasRenderedImageAttachment(user)) return

  const walker = document.createTreeWalker(messageText, NodeFilter.SHOW_TEXT)
  const textNodes = []
  while (walker.nextNode()) textNodes.push(walker.currentNode)

  for (const node of textNodes) {
    if (node.parentElement?.closest('code, pre')) continue
    const current = node.nodeValue || ''
    if (!IMAGE_ATTACHMENT_MARKER_RE.test(current)) {
      IMAGE_ATTACHMENT_MARKER_RE.lastIndex = 0
      continue
    }
    IMAGE_ATTACHMENT_MARKER_RE.lastIndex = 0
    const cleaned = current
      .replace(IMAGE_ATTACHMENT_MARKER_LINE_RE, '')
      .replace(IMAGE_ATTACHMENT_MARKER_RE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()
    IMAGE_ATTACHMENT_MARKER_LINE_RE.lastIndex = 0
    IMAGE_ATTACHMENT_MARKER_RE.lastIndex = 0
    if (cleaned !== current) node.nodeValue = cleaned
  }
}

function longUserStateKey(pair) {
  if (isProvisionalTurn(pair)) return null
  const key = turnStorageKey(pair)
  return key ? `${key}${LONG_USER_STATE_SUFFIX}` : null
}

function readLongUserExpanded(pair) {
  const key = longUserStateKey(pair)
  if (!key) return false
  try {
    return JSON.parse(safeGet(key) || 'null')?.expanded === true
  } catch {
    return false
  }
}

function pruneLongUserStates() {
  try {
    const records = Object.keys(window.localStorage)
      .filter(key => key.startsWith(STORAGE_PREFIX) && key.endsWith(LONG_USER_STATE_SUFFIX))
      .map(key => {
        try {
          return { key, touchedAt: Number(JSON.parse(safeGet(key) || '{}').touchedAt) || 0 }
        } catch {
          return { key, touchedAt: 0 }
        }
      })
      .sort((left, right) => right.touchedAt - left.touchedAt)
    for (const record of records.slice(MAX_PERSISTED_LONG_USER_STATES)) safeRemove(record.key)
  } catch {
    // Ignore unavailable storage; the mounted message remains functional.
  }
}

function writeLongUserExpanded(pair, expanded) {
  const key = longUserStateKey(pair)
  if (!key) return
  if (!expanded) {
    safeRemove(key)
    return
  }
  safeSet(key, JSON.stringify({ expanded: true, touchedAt: Date.now() }))
  pruneLongUserStates()
}

function clearLongUserDecoration(user) {
  user?.removeAttribute('data-codex-long-user')
  user?.removeAttribute('data-codex-user-expanded')
  for (const control of user?.querySelectorAll?.('[data-codex-user-expand]') || []) control.remove()
}

function longUserLabels() {
  const french = (document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('fr')
  return french
    ? { more: 'Afficher plus', less: 'Afficher moins' }
    : { more: 'Show more', less: 'Show less' }
}

function decorateLongUserMessage(pair) {
  const user = pair.querySelector(':scope > [data-role="user"]')
  const clamp = user?.querySelector('.sticky-human-clamp')
  const bubble = clamp?.closest('.composer-human-message')
  const host = bubble?.parentElement
  if (!user || !clamp || !bubble || !host) {
    if (user) clearLongUserDecoration(user)
    return
  }

  const inner = clamp.firstElementChild
  const lineHeight = 22
  const measuredHeight = Number.parseFloat(clamp.style.getPropertyValue('--human-msg-full'))
  const fullHeight = Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : inner?.scrollHeight || 0
  if (fullHeight <= lineHeight * 8 + 1) {
    clearLongUserDecoration(user)
    return
  }

  user.setAttribute('data-codex-long-user', 'true')
  let control = host.querySelector(':scope > [data-codex-user-expand]')
  let persistedExpanded = false
  if (!control) {
    persistedExpanded = readLongUserExpanded(pair)
    control = document.createElement('button')
    control.type = 'button'
    control.setAttribute('data-codex-user-expand', 'true')
    const label = document.createElement('span')
    label.setAttribute('data-codex-user-expand-label', 'true')
    const chevron = document.createElement('span')
    chevron.setAttribute('data-codex-user-chevron', 'true')
    chevron.setAttribute('aria-hidden', 'true')
    control.append(label, chevron)
    control.addEventListener('pointerdown', event => event.stopPropagation())
    control.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      const expanded = user.getAttribute('data-codex-user-expanded') !== 'true'
      if (expanded) user.setAttribute('data-codex-user-expanded', 'true')
      else user.removeAttribute('data-codex-user-expanded')
      writeLongUserExpanded(pair, expanded)
      const labels = longUserLabels()
      label.textContent = expanded ? labels.less : labels.more
      control.setAttribute('aria-expanded', String(expanded))
      control.title = expanded ? labels.less : labels.more
    })
    host.appendChild(control)
  }

  const expanded = user.getAttribute('data-codex-user-expanded') === 'true' || persistedExpanded
  if (expanded) user.setAttribute('data-codex-user-expanded', 'true')
  else user.removeAttribute('data-codex-user-expanded')
  const labels = longUserLabels()
  control.querySelector('[data-codex-user-expand-label]').textContent = expanded ? labels.less : labels.more
  control.setAttribute('aria-expanded', String(expanded))
  control.title = expanded ? labels.less : labels.more
}

function rememberInlineStyle(element) {
  if (element.hasAttribute('data-codex-original-style')) return
  element.setAttribute('data-codex-original-style', element.getAttribute('style') ?? '__none__')
}

function restoreInlineStyle(element) {
  const original = element.getAttribute('data-codex-original-style')
  if (original === null) return
  if (original === '__none__') element.removeAttribute('style')
  else element.setAttribute('style', original)
  element.removeAttribute('data-codex-original-style')
}

function prettyModelName(value) {
  const raw = value.trim()
  const match = raw.match(/^GPT-(\d+(?:\.\d+)?)-(.+)$/i)
  if (!match) return raw
  const suffix = match[2]
    .split('-')
    .map(part => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
  return `${match[1]} ${suffix}`
}

function currentModelDisplay() {
  const trigger = document.querySelector('button[aria-label^="Model ·"], button[aria-label^="Modèle ·"]')
  const liveText = (trigger?.querySelector(':scope > span')?.textContent || trigger?.textContent || '').trim()
  if (trigger && liveText.includes('·')) trigger.dataset.codexNativeModelLabel = liveText
  const text = trigger?.dataset.codexNativeModelLabel || liveText
  const [rawModel = '', rawMeta = ''] = text.split('·').map(part => part.trim())
  const fast = /\bFast\b/i.test(rawMeta)
  const effortRaw = rawMeta.replace(/\bFast\b/gi, '').trim() || 'Medium'
  const effortMap = {
    Minimal: 'Minimal',
    Low: 'Faible',
    Med: 'Moyen',
    Medium: 'Moyen',
    High: 'Élevé',
    'Extra High': 'Très élevé',
    Max: 'Max',
    Ultra: 'Ultra'
  }
  return {
    model: prettyModelName(rawModel),
    effort: effortMap[effortRaw] || effortRaw,
    speed: fast ? 'Rapide' : 'Standard'
  }
}

function decorateModelTrigger() {
  const trigger = document.querySelector('button[aria-label^="Model ·"], button[aria-label^="Modèle ·"]')
  const label = trigger?.querySelector(':scope > span')
  if (!trigger || !label) return
  const current = currentModelDisplay()
  const existingModel = label.querySelector('[data-codex-trigger-model]')?.textContent
  const existingEffort = label.querySelector('[data-codex-trigger-effort]')?.textContent
  if (existingModel === current.model && existingEffort === current.effort) return
  const model = document.createElement('span')
  model.dataset.codexTriggerModel = 'true'
  model.textContent = current.model
  const effort = document.createElement('span')
  effort.dataset.codexTriggerEffort = 'true'
  effort.textContent = current.effort
  label.replaceChildren(model, document.createTextNode(' '), effort)
  trigger.dataset.codexModelTrigger = 'true'
}

function decorateComposerChrome() {
  const surface = document.querySelector('[data-slot="composer-surface"]')
  const dock = document.querySelector('[data-slot="composer-dock"]') || surface?.closest('[data-slot="composer-root"]')
  if (!surface || !dock) return

  const nativeStatusStack = dock.matches('[data-slot="composer-root"]')
    ? dock.querySelector(':scope > div.absolute.inset-x-0.bottom-full')
    : dock.matches('[data-slot="composer-dock"]')
      ? [...dock.children].find(element => {
          const className = typeof element.className === 'string' ? element.className : ''
          return className.includes('max-h-') && className.includes('overflow-y-auto')
        })
      : null
  const statusStack = nativeStatusStack || [...dock.querySelectorAll('div')].find(element => {
      const className = typeof element.className === 'string' ? element.className : ''
      return className.includes('bottom-full') && className.includes('absolute') && element.getBoundingClientRect().width > 300
    })
  if (statusStack) {
    statusStack.setAttribute('data-codex-status-stack', 'true')
    const statusCard = statusStack.firstElementChild
    statusCard?.setAttribute('data-codex-status-card', 'true')
  }
  decorateModelTrigger()

  const contextMenu = [...document.querySelectorAll('[data-slot="dropdown-menu-content"][role="menu"]')].find(menu => {
    const text = menu.textContent || ''
    return /Prompt snippets|Extraits de prompt/i.test(text) && /Files|Fichiers/i.test(text)
  })
  if (!contextMenu) return

  contextMenu.setAttribute('data-codex-context-menu', 'true')
  const shell = contextMenu.parentElement
  if (!shell) return

  shell.setAttribute('data-codex-context-menu-shell', 'true')
  rememberInlineStyle(shell)

  const surfaceRect = surface.getBoundingClientRect()
  const menuHeight = Math.min(contextMenu.scrollHeight || contextMenu.getBoundingClientRect().height, 360, window.innerHeight * 0.4)
  const top = Math.max(12, surfaceRect.top - menuHeight - 8)
  Object.assign(shell.style, {
    position: 'fixed',
    left: `${surfaceRect.left}px`,
    top: `${top}px`,
    width: `${surfaceRect.width}px`,
    transform: 'none',
    zIndex: '9999',
    pointerEvents: 'auto'
  })
}

function clearComposerChromeDecorations() {
  for (const leading of document.querySelectorAll('[data-codex-queue-leading]')) leading.remove()
  for (const element of document.querySelectorAll('[data-codex-queue-section], [data-codex-queue-header], [data-codex-queue-body], [data-codex-queue-row], [data-codex-queue-actions], [data-codex-queue-more], [data-codex-queue-send], [data-codex-queue-delete], [data-codex-has-queue], [data-codex-queue-shell]')) {
    element.removeAttribute('data-codex-queue-section')
    element.removeAttribute('data-codex-queue-header')
    element.removeAttribute('data-codex-queue-body')
    element.removeAttribute('data-codex-queue-row')
    element.removeAttribute('data-codex-queue-actions')
    element.removeAttribute('data-codex-queue-more')
    element.removeAttribute('data-codex-queue-send')
    element.removeAttribute('data-codex-queue-delete')
    element.removeAttribute('data-codex-has-queue')
    element.removeAttribute('data-codex-queue-shell')
    element.removeAttribute('data-codex-queue-state')
  }
  for (const shell of document.querySelectorAll('[data-codex-context-menu-shell]')) {
    restoreInlineStyle(shell)
    shell.removeAttribute('data-codex-context-menu-shell')
  }

  for (const element of document.querySelectorAll('[data-codex-context-menu], [data-codex-status-stack], [data-codex-status-card]')) {
    element.removeAttribute('data-codex-context-menu')
    element.removeAttribute('data-codex-status-stack')
    element.removeAttribute('data-codex-status-card')
  }

  for (const trigger of document.querySelectorAll('[data-codex-model-trigger]')) {
    const label = trigger.querySelector(':scope > span')
    if (label && trigger.dataset.codexNativeModelLabel) label.textContent = trigger.dataset.codexNativeModelLabel
    trigger.removeAttribute('data-codex-model-trigger')
    trigger.removeAttribute('data-codex-native-model-label')
  }

}

function installBehaviorRuntime(afterFinalCleanup = null) {
  const pendingHandoff = window[RUNTIME_HANDOFF_KEY]
  if (pendingHandoff?.timer) window.clearTimeout(pendingHandoff.timer)
  if (pendingHandoff) delete window[RUNTIME_HANDOFF_KEY]

  let scheduled = false
  let animationFrame = 0
  let processAllPairs = true
  let composerDirty = true
  let sidebarDirty = true
  let destroyed = false
  const dirtyPairs = new Set()
  const sessionReconcileTimers = new Set()

  const scrollbarBindings = new Map()
  let threadViewport = null
  let liveTailWrapper = null
  let threadScrollTimer = 0
  let threadScrollbarTimer = 0
  let liveTailAtBottom = true

  const updateLiveTailVisibility = () => {
    threadScrollTimer = 0
    if (!threadViewport?.isConnected || !liveTailWrapper?.isConnected) return
    liveTailAtBottom = threadViewport.scrollHeight - threadViewport.clientHeight - threadViewport.scrollTop <= 48
    if (liveTailAtBottom) {
      if (!liveTailWrapper.hasAttribute('data-codex-live-tail')) liveTailWrapper.setAttribute('data-codex-live-tail', 'true')
    } else {
      liveTailWrapper.removeAttribute('data-codex-live-tail')
    }
  }

  const onThreadScroll = () => {
    if (destroyed) return
    if (!threadViewport?.hasAttribute('data-codex-scrolling')) threadViewport?.setAttribute('data-codex-scrolling', 'true')
    window.clearTimeout(threadScrollbarTimer)
    threadScrollbarTimer = window.setTimeout(() => threadViewport?.removeAttribute('data-codex-scrolling'), 700)
    liveTailAtBottom = false
    liveTailWrapper?.removeAttribute('data-codex-live-tail')
    window.clearTimeout(threadScrollTimer)
    threadScrollTimer = window.setTimeout(updateLiveTailVisibility, 120)
  }

  const refreshLiveTail = () => {
    const content = document.querySelector('[data-slot="aui_thread-content"]')
    const viewport = document.querySelector('[data-slot="aui_thread-viewport"]')
    if (viewport !== threadViewport) {
      threadViewport?.removeEventListener('scroll', onThreadScroll)
      threadViewport?.removeAttribute('data-codex-scrollbar')
      threadViewport?.removeAttribute('data-codex-scrolling')
      window.clearTimeout(threadScrollbarTimer)
      threadViewport = viewport
      threadViewport?.setAttribute('data-codex-scrollbar', 'true')
      threadViewport?.addEventListener('scroll', onThreadScroll, { passive: true })
    }
    const latest = content
      ? [...content.querySelectorAll('[data-slot="aui_turn-pair"]')].reverse().find(pair => userMessageId(pair))
      : null
    let wrapper = latest
    while (wrapper && wrapper.parentElement !== content) wrapper = wrapper.parentElement
    if (wrapper !== liveTailWrapper) {
      liveTailWrapper?.removeAttribute('data-codex-live-tail')
      liveTailWrapper = wrapper
      if (liveTailAtBottom) liveTailWrapper?.setAttribute('data-codex-live-tail', 'true')
    }
    window.clearTimeout(threadScrollTimer)
    threadScrollTimer = window.setTimeout(updateLiveTailVisibility, 0)
  }

  const removeScrollbarBinding = (element, binding) => {
    element.removeEventListener('scroll', binding.onScroll)
    window.clearTimeout(binding.timer)
    element.removeAttribute('data-codex-scrollbar')
    element.removeAttribute('data-codex-scrolling')
    scrollbarBindings.delete(element)
  }

  const decorateSidebarScrollbars = () => {
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    for (const [element, binding] of scrollbarBindings) {
      if (!element.isConnected || !sidebar?.contains(element)) removeScrollbarBinding(element, binding)
    }
    if (!sidebar) return

    for (const element of sidebar.querySelectorAll('*')) {
      if (scrollbarBindings.has(element) || element.scrollHeight <= element.clientHeight + 1) continue
      const overflowY = getComputedStyle(element).overflowY
      if (overflowY !== 'auto' && overflowY !== 'scroll') continue
      const binding = { timer: 0, onScroll: null }
      binding.onScroll = () => {
        if (destroyed) return
        if (!element.hasAttribute('data-codex-scrolling')) element.setAttribute('data-codex-scrolling', 'true')
        window.clearTimeout(binding.timer)
        binding.timer = window.setTimeout(() => element.removeAttribute('data-codex-scrolling'), 700)
      }
      element.setAttribute('data-codex-scrollbar', 'true')
      element.addEventListener('scroll', binding.onScroll, { passive: true })
      scrollbarBindings.set(element, binding)
    }
  }

  const markPair = pair => {
    if (!pair?.matches?.('[data-slot="aui_turn-pair"]')) return
    dirtyPairs.add(pair)
  }

  const markPairsIn = node => {
    if (!(node instanceof Element)) return
    if (node.matches('[data-slot="aui_turn-pair"]')) markPair(node)
    if (!node.firstElementChild) return
    for (const pair of node.querySelectorAll('[data-slot="aui_turn-pair"]')) markPair(pair)
  }

  const markClosestPair = node => {
    const element = node instanceof Element ? node : node?.parentElement
    const pair = element?.closest?.('[data-slot="aui_turn-pair"]')
    if (pair) markPair(pair)
  }

  const schedule = () => {
    if (scheduled || destroyed) return
    scheduled = true
    animationFrame = window.requestAnimationFrame(process)
  }

  const reconcileSession = () => {
    if (destroyed) return
    for (const timer of sessionReconcileTimers) window.clearTimeout(timer)
    sessionReconcileTimers.clear()

    processAllPairs = true
    composerDirty = true
    sidebarDirty = true
    schedule()
    for (const delay of [80, 250, 600, 1200]) {
      const timer = window.setTimeout(() => {
        sessionReconcileTimers.delete(timer)
        if (destroyed) return
        processAllPairs = true
        schedule()
      }, delay)
      sessionReconcileTimers.add(timer)
    }
  }

  let observedSessionId = currentRuntimeSessionId()
  const offActiveSession = host.state.activeSessionId?.subscribe?.(value => {
    const nextSessionId = String(value || '')
    if (nextSessionId === observedSessionId) return
    observedSessionId = nextSessionId
    reconcileSession()
  })

  let observedProfile = currentProfileScope()
  const offProfileState = host.state.profile?.subscribe?.(value => {
    const nextProfile = profileScope(value)
    if (nextProfile === observedProfile) return
    observedProfile = nextProfile
    reconcileSession()
  })

  let observedGatewayState = String(host.state.gateway?.get?.() || '')
  const offGatewayState = host.state.gateway?.subscribe?.(value => {
    const nextState = String(value || '')
    const reconnected = observedGatewayState && observedGatewayState !== 'open' && nextState === 'open'
    observedGatewayState = nextState
    if (!reconnected) return
    reconcileSession()
  })

  const offSessionInfo = host.onEvent?.('session.info', event => {
    if (destroyed) return
    const runtimeId = String(event.session_id || '')
    if (runtimeId === currentRuntimeSessionId()) reconcileSession()
  })

  const process = () => {
    animationFrame = 0
    scheduled = false
    if (destroyed) return

    if (processAllPairs) {
      processAllPairs = false
      for (const pair of document.querySelectorAll('[data-slot="aui_turn-pair"]')) markPair(pair)
    }

    const pairs = [...dirtyPairs]
    dirtyPairs.clear()
    for (const pair of pairs) {
      if (!pair.isConnected) continue
      stripImageAttachmentMarker(pair)
      decorateLongUserMessage(pair)
    }

    refreshLiveTail()

    if (composerDirty) {
      composerDirty = false
      decorateComposerChrome()
    }
    if (sidebarDirty) {
      sidebarDirty = false
      decorateSidebarScrollbars()
    }
  }

  const touchesComposerChrome = element => Boolean(
    element?.closest?.('[data-slot="composer-dock"]:not([data-slot="composer-rich-input"]), [data-slot="composer-root"]:not([data-slot="composer-rich-input"])')
    || element?.matches?.('[data-slot="dropdown-menu-content"][role="menu"]')
    || (element?.firstElementChild && element.querySelector?.('[data-slot="dropdown-menu-content"][role="menu"], [data-slot="composer-dock"]'))
  )

  const handleMutations = records => {
    let relevant = false
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      if (target?.closest?.('[data-codex-queue-leading], [data-codex-user-expand]')) continue

      const region = target?.closest?.('[data-slot="aui_turn-pair"], [data-slot="composer-rich-input"], [data-slot="composer-dock"], [data-slot="composer-root"], [data-slot="sidebar"]')
      const changedNodes = [...record.addedNodes, ...record.removedNodes]
      if (record.type === 'childList' && !region) {
        const potentiallyRelevant = changedNodes.some(node => {
          if (!(node instanceof Element)) return false
          if (node.hasAttribute('data-slot') || node.getAttribute('role') === 'menu') return true
          if (!node.firstElementChild) return false
          return Boolean(node.querySelector('[data-slot="aui_turn-pair"], [data-slot="composer-dock"], [data-slot="composer-root"], [data-slot="sidebar"], [data-slot="dropdown-menu-content"][role="menu"]'))
        })
        if (!potentiallyRelevant) continue
      }

      if (record.type === 'attributes') {
        markClosestPair(target)
        relevant = true
        continue
      }

      if (target?.closest?.('[data-slot="composer-rich-input"]')) continue
      if (target?.closest?.('[data-slot="aui_turn-pair"]')) {
        markClosestPair(target)
        relevant = true
      }
      if (target?.closest?.('[data-slot="composer-dock"], [data-slot="composer-root"]')) {
        composerDirty = true
        relevant = true
      }
      if (target?.closest?.('[data-slot="sidebar"]')) {
        sidebarDirty = true
        relevant = true
      }

      for (const node of changedNodes) {
        if (!(node instanceof Element)) continue
        markPairsIn(node)
        if (node.matches('[data-slot="aui_turn-pair"]') || (node.firstElementChild && node.querySelector('[data-slot="aui_turn-pair"]'))) relevant = true
        if (touchesComposerChrome(node)) {
          composerDirty = true
          relevant = true
        }
        if (node.matches('[data-slot="sidebar"]') || (node.firstElementChild && node.querySelector('[data-slot="sidebar"]'))) {
          sidebarDirty = true
          relevant = true
        }
      }
    }
    if (relevant) {
      schedule()
    }
  }

  const observer = new MutationObserver(handleMutations)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-streaming', 'data-clamped'] })
  const onResize = () => {
    processAllPairs = true
    composerDirty = true
    schedule()
  }
  const onHashChange = () => reconcileSession()
  window.addEventListener('resize', onResize)
  window.addEventListener('hashchange', onHashChange)
  reconcileSession()

  const cleanup = () => {
    destroyed = true
    if (animationFrame) window.cancelAnimationFrame(animationFrame)
    animationFrame = 0
    scheduled = false
    observer.disconnect()

    window.clearTimeout(threadScrollTimer)
    window.clearTimeout(threadScrollbarTimer)
    for (const timer of sessionReconcileTimers) window.clearTimeout(timer)
    sessionReconcileTimers.clear()
    threadViewport?.removeEventListener('scroll', onThreadScroll)
    threadViewport?.removeAttribute('data-codex-scrollbar')
    threadViewport?.removeAttribute('data-codex-scrolling')
    liveTailWrapper?.removeAttribute('data-codex-live-tail')
    window.removeEventListener('resize', onResize)
    window.removeEventListener('hashchange', onHashChange)
    offProfileState?.()
    offGatewayState?.()
    offActiveSession?.()
    offSessionInfo?.()

    for (const [element, binding] of [...scrollbarBindings]) removeScrollbarBinding(element, binding)
    const handoff = { timer: 0 }
    handoff.timer = window.setTimeout(() => {
      if (window[RUNTIME_HANDOFF_KEY] !== handoff) return
      for (const user of document.querySelectorAll('[data-slot="aui_user-message-root"]')) clearLongUserDecoration(user)
      clearComposerChromeDecorations()
      afterFinalCleanup?.()
      delete window[RUNTIME_HANDOFF_KEY]
    }, 300)
    window[RUNTIME_HANDOFF_KEY] = handoff
  }
  cleanup.reconcileSession = reconcileSession
  return cleanup
}

function CodexChatStyleRuntime() {
  const behaviorRef = useRef(null)

  useEffect(() => {
    const root = document.documentElement
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = CSS
    style.dataset.codexChatLookBuild = BUILD_ID
    root.dataset.codexChatLook = 'true'
    root.dataset.codexChatLookBuild = BUILD_ID
    const uninstallBehavior = installBehaviorRuntime(() => {
      style?.remove()
      delete root.dataset.codexChatLook
      if (root.dataset.codexChatLookBuild === BUILD_ID) delete root.dataset.codexChatLookBuild
    })
    behaviorRef.current = uninstallBehavior

    return () => {
      if (behaviorRef.current === uninstallBehavior) behaviorRef.current = null
      uninstallBehavior()
    }
  }, [])

  return null
}

export default {
  id: ID,
  name: 'Codex Chat Look',
  register(ctx) {
    ctx.register({ id: 'theme', area: THEMES_AREA, data: CODEX_THEME })
    ctx.register({
      id: 'style-runtime',
      area: TITLEBAR_AREAS.center,
      order: 9999,
      render: () => jsx(CodexChatStyleRuntime, {})
    })
  }
}
