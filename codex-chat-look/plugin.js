import { host, PALETTE_AREA, THEMES_AREA, TITLEBAR_AREAS } from '@hermes/plugin-sdk'
import { useEffect } from 'react'
import { jsx } from 'react/jsx-runtime'

const ID = 'codex-chat-look'
const STYLE_ID = `${ID}-styles`
const BUILD_ID = 'v1.3.1-main-attach-menu'
const STORAGE_PREFIX = `${ID}:turn:`
const LONG_USER_STATE_SUFFIX = ':long-user-expanded'
const MAX_PERSISTED_LONG_USER_STATES = 250
const RUNTIME_HANDOFF_KEY = '__hermesCodexChatLookRuntimeHandoff'
const COMPOSER_WIDTH_STORAGE_KEY = 'composer-width'
const PINNED_USER_MESSAGES_STORAGE_KEY = 'pinned-user-messages'
const PLAYBACK_CLOSE_GRACE_MS = 250
const PLAYBACK_MOTION_MS = 240
let pluginStorage = null

const SYSTEM_FONT = `-apple-system, system-ui, "Segoe UI", sans-serif`
const HERMES_FONT = SYSTEM_FONT

const CODEX_THEME = {
  name: 'codex-chat',
  label: 'Codex Skin',
  description: 'Codex-inspired light and dark palettes with system typography',
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
  --dt-font-sans: ${SYSTEM_FONT} !important;
  --font-sans: ${SYSTEM_FONT} !important;
  --codex-color-chat: var(--ui-chat-surface-background);
  --codex-color-sidebar: var(--ui-sidebar-surface-background);
  --codex-color-card: var(--dt-card, var(--ui-editor-surface-background));
  --codex-color-elevated: var(--dt-popover, var(--ui-widget-surface-background));
  --codex-color-bubble: var(--ui-chat-bubble-background);
  --codex-color-status-panel: color-mix(
    in srgb,
    var(--ui-bg-tertiary, var(--codex-color-card)) 32.5%,
    var(--codex-color-chat)
  );
  --codex-color-text: var(--ui-text-primary);
  --codex-color-text-secondary: var(--ui-text-secondary);
  --codex-color-text-tertiary: var(--ui-text-tertiary);
  --codex-color-text-quaternary: var(--ui-text-quaternary);
  --codex-color-border: var(--ui-stroke-secondary);
  --codex-color-border-subtle: var(--ui-stroke-tertiary);
  --codex-color-hover: var(--ui-row-hover-background);
  --codex-color-active: var(--ui-row-active-background);
  --codex-color-primary: var(--dt-primary);
  --codex-color-primary-foreground: var(--dt-primary-foreground);
  --codex-color-success: var(--ui-green);
  --codex-color-destructive: var(--dt-destructive);
  --codex-shadow-floating: var(--shadow-md);
}

/* The bundled Codex theme keeps its exact palette seeds. Other Hermes themes
   flow through the shared semantic UI tokens above. */
html[data-codex-chat-look='true'][data-hermes-theme='codex-chat'] {
  --codex-color-card: var(--theme-card-seed);
  --codex-color-elevated: var(--theme-elevated-seed);
  --codex-color-bubble: var(--theme-bubble-seed);
}

/* The field colors are exact Codex seeds only in the ordinary opaque page.
   Glass makes Hermes' semantic chat/sidebar fields transparent; do not repaint
   them after the native material layer has taken ownership. */
html[data-codex-chat-look='true'][data-hermes-theme='codex-chat']:not([data-hermes-glass]) {
  --codex-color-chat: var(--theme-background-seed);
  --ui-chat-surface-background: var(--codex-color-chat);
  --codex-color-sidebar: var(--theme-sidebar-seed);
}

html[data-codex-chat-look='true'][data-hermes-theme='codex-chat'][data-hermes-glass] {
  --codex-color-chat: var(--ui-chat-surface-background);
  --codex-color-sidebar: var(--ui-sidebar-surface-background);
}

html[data-codex-chat-look='true'][data-hermes-theme='codex-chat']:not([data-hermes-glass]),
html[data-codex-chat-look='true'][data-hermes-theme='codex-chat']:not([data-hermes-glass]) body {
  background-color: var(--codex-color-chat) !important;
}

html[data-codex-chat-look='true'][data-codex-composer-width='codex'] {
  --composer-width: 736px;
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
html[data-codex-chat-look='true'] [data-slot='aui_thread-content'] {
  background: var(--codex-color-chat) !important;
}

/* The full-width sticky row is layout only. It never paints or clips the
   transcript; the visible sent-message surface remains its own child. */
html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'] {
  background: transparent !important;
}

/* Hermes pins each user prompt to the top of the thread. Keep that native
   behavior unless the user explicitly opts out through the plugin setting. */
html[data-codex-chat-look='true'][data-codex-pinned-user-messages='off'] [data-slot='aui_user-message-root'] {
  position: static !important;
  top: auto !important;
  z-index: auto !important;
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
  color: var(--codex-color-text) !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'],
html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'] .aui-md,
html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'] .aui-md :where(p, li, blockquote, table),
html[data-codex-chat-look='true'] [data-slot='aui_user-inline-text'] {
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 22px !important;
  font-weight: 400 !important;
  color: var(--codex-color-text) !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'] .aui-md li::marker {
  color: var(--codex-color-text) !important;
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
  background: var(--codex-color-bubble) !important;
  color: var(--codex-color-text) !important;
  padding: 8px 12px !important;
  text-align: left !important;
}

html[data-codex-chat-look='true'] [data-codex-image-marker='true'] {
  display: none !important;
}

/* Keep long prompts compact: 4 text lines, then a dedicated ellipsis row and an
   explicit expand control. The 110px clamp covers four 22px content lines plus
   the 22px ellipsis row. Neutralize Hermes'
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
  max-height: 110px !important;
  overflow: hidden !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_user-message-root'][data-codex-long-user='true']:not([data-codex-user-expanded='true']) .sticky-human-clamp::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 22px;
  background: var(--codex-color-bubble);
  color: var(--codex-color-text);
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
  color: color-mix(in srgb, var(--codex-color-text) 66%, transparent);
  cursor: pointer;
  font: inherit;
  line-height: 22px;
}

html[data-codex-chat-look='true'] [data-codex-user-expand]:hover {
  color: color-mix(in srgb, var(--codex-color-text) 86%, transparent);
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

/* Both sent-message editing and Queue editing stay native. The skin only gives
   their existing contenteditable/actions the same bubble language as Codex. */
html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] .composer-human-message-container {
  border-radius: 17px !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] .composer-human-message {
  width: 100% !important;
  max-width: 100% !important;
  padding: 8px 12px !important;
  border: 1px solid var(--codex-color-border) !important;
  border-radius: 17px !important;
  background: var(--codex-color-bubble) !important;
  color: var(--codex-color-text) !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] [data-slot='composer-rich-input'] {
  min-height: 44px !important;
  padding: 0 30px 0 0 !important;
  background: transparent !important;
  color: var(--codex-color-text) !important;
  caret-color: var(--codex-color-text) !important;
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 22px !important;
  font-weight: 400 !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] .composer-human-message > button:last-child {
  right: 8px !important;
  bottom: 8px !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  border: 0 !important;
  border-radius: 9999px !important;
  background: var(--codex-color-primary) !important;
  color: var(--codex-color-primary-foreground) !important;
}

/* Keep Hermes' compact live-thinking typography. The Codex answer font must
   never leak into the streaming reasoning preview. */
html[data-codex-chat-look='true'] [data-streaming='true'] [data-slot='aui_thinking-disclosure'] {
  font-family: ${HERMES_FONT} !important;
  font-size: 11px !important;
  line-height: 16.5px !important;
  font-weight: 400 !important;
  color: color-mix(in srgb, var(--codex-color-text) 54%, transparent) !important;
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
  color: color-mix(in srgb, var(--codex-color-text) 60%, transparent) !important;
}

/* Codex sidebar geometry, painted by the active Hermes theme. */
html[data-codex-chat-look='true'] [data-slot='sidebar'],
html[data-codex-chat-look='true'] [data-slot='sidebar-content'],
html[data-codex-chat-look='true'] [data-slot='sidebar-group'],
html[data-codex-chat-look='true'] [data-slot='sidebar-group-content'] {
  background: var(--codex-color-sidebar) !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] .row-hover[class*='ui-row-active-background'],
html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-active='true'],
html[data-codex-chat-look='true'] [data-slot='sidebar'] [aria-current='true'] {
  border: 0 !important;
  border-radius: 10px !important;
  outline: 0 !important;
  background: var(--codex-color-active) !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [class~='group/section-label'] > span > .dither {
  display: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [class~='group/section-label'] > span:first-child {
  color: var(--codex-color-text) !important;
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
  background: var(--codex-color-primary) !important;
  box-shadow: 0 0 0.625rem color-mix(in srgb, var(--codex-color-text) 26%, transparent) !important;
}

/* A turn that finished in another chat stays a steady green attention cue.
   Keep it distinct from the black animated running dot and gray background dot. */
html[data-codex-chat-look='true'] [data-slot='sidebar'] [role='status'][class~='bg-emerald-500'] {
  width: 8px !important;
  min-width: 8px !important;
  height: 8px !important;
  flex: 0 0 8px !important;
  background: var(--codex-color-success) !important;
  opacity: 1 !important;
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--codex-color-success) 14%, transparent),
    0 0 8px color-mix(in srgb, var(--codex-color-success) 48%, transparent) !important;
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
  scrollbar-color: color-mix(in srgb, var(--codex-color-text) 28%, transparent) transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [data-codex-scrollbar='true'][data-codex-scrolling='true']::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--codex-color-text) 28%, transparent) !important;
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
  scrollbar-color: color-mix(in srgb, var(--codex-color-text) 28%, transparent) transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true'][data-codex-scrolling='true']::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--codex-color-text) 28%, transparent) !important;
}

/* Tool activity follows the selected theme's foreground instead of a fixed blue. */
html[data-codex-chat-look='true'] [data-slot='tool-block'] [aria-label='Running'],
html[data-codex-chat-look='true'] [data-slot='tool-block'] [aria-label='En cours'],
html[data-codex-chat-look='true'] [data-slot='tool-block'] span[class*='tabular-nums'] {
  color: var(--codex-color-text) !important;
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
  border: 1px solid var(--codex-color-border-subtle) !important;
  border-radius: 10px !important;
  background: var(--codex-color-bubble) !important;
  color: color-mix(in srgb, var(--codex-color-text) 58%, transparent) !important;
  font-size: 12px !important;
  line-height: 20px !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_response-loading'][aria-label='Summarizing thread'] .dither {
  width: 12px !important;
  height: 12px !important;
  flex: 0 0 12px !important;
  border: 1.5px solid color-mix(in srgb, var(--codex-color-text) 22%, transparent) !important;
  border-right-color: color-mix(in srgb, var(--codex-color-text) 72%, transparent) !important;
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

/* The Codex reference is 1472 Retina pixels wide at DPR 2: 736 CSS px.
   Hermes keeps the 5px peel-out margin on each side, hence the +10px dock. */
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='composer-dock']:not([data-popped-out]) {
  width: calc(min(736px, calc(100% - 2rem)) + 10px) !important;
  max-width: calc(100% - 22px) !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-root'],
html[data-codex-chat-look='true'] [data-slot='composer-root'] > div,
html[data-codex-chat-look='true'] [data-slot='composer-surface'],
html[data-codex-chat-look='true'] [data-slot='composer-surface'] > [aria-hidden] {
  border-radius: 21px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] {
  min-height: 98px !important;
  border: 0.5px solid var(--codex-color-border-subtle) !important;
  background: var(--codex-color-card) !important;
  box-shadow: var(--shadow-nous) !important;
  backdrop-filter: none !important;
  overflow: hidden !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] > [aria-hidden] {
  background: var(--codex-color-card) !important;
  backdrop-filter: none !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-fade'] {
  --codex-playback-edge-gap: 12px;
  padding: 12px 15px 10px !important;
  gap: 0 !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface']:has([data-codex-playback-floating='true']),
html[data-codex-chat-look='true'] [data-slot='composer-fade']:has(> [data-codex-playback-floating='true']) {
  overflow: visible !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-fade'] > div:last-child {
  grid-template-columns: auto 1fr auto !important;
  grid-template-areas: "input input input" "menu . controls" !important;
  align-items: center !important;
  row-gap: 4px !important;
  column-gap: 5px !important;
}

html[data-codex-chat-look='true'] [data-codex-edit-banner='true'] {
  min-height: 32px !important;
  gap: 8px !important;
  padding: 3px 4px 3px 10px !important;
  border: 1px solid var(--codex-color-border-subtle) !important;
  border-radius: 10px !important;
  background: var(--ui-bg-tertiary) !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] [data-codex-edit-banner='true'] > div:first-child {
  color: color-mix(in srgb, var(--codex-color-text) 56%, transparent) !important;
  font-size: 12px !important;
  line-height: 18px !important;
  font-weight: 400 !important;
}

html[data-codex-chat-look='true'] [data-codex-edit-banner='true'] > div:last-child {
  gap: 4px !important;
}

html[data-codex-chat-look='true'] [data-codex-edit-banner='true'] button {
  height: 26px !important;
  min-height: 26px !important;
  padding: 0 8px !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: color-mix(in srgb, var(--codex-color-text) 66%, transparent) !important;
  font-size: 11px !important;
  line-height: 16px !important;
  font-weight: 400 !important;
}

html[data-codex-chat-look='true'] [data-codex-edit-banner='true'] button:last-child {
  padding: 0 10px !important;
  border-radius: 999px !important;
  background: var(--codex-color-primary) !important;
  color: var(--codex-color-primary-foreground) !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-rich-input'] {
  min-height: 44px !important;
  padding: 0 !important;
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 20px !important;
  font-weight: 445 !important;
  scrollbar-width: thin !important;
  scrollbar-color: color-mix(in srgb, var(--codex-color-text) 22%, transparent) transparent !important;
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
  background-color: color-mix(in srgb, var(--codex-color-text) 22%, transparent) !important;
  background-image: none !important;
  background-clip: padding-box !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-rich-input']::-webkit-scrollbar-thumb:hover {
  background-color: color-mix(in srgb, var(--codex-color-text) 38%, transparent) !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-rich-input']::-webkit-scrollbar-button {
  display: none !important;
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
  color: color-mix(in srgb, var(--codex-color-text) 66%, transparent) !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label^='Model ·'],[aria-label^='Modèle ·'])[data-state='open'] {
  background: var(--codex-color-active) !important;
  color: var(--codex-color-text) !important;
}

html[data-codex-chat-look='true'] [data-codex-model-trigger='true'] [data-codex-trigger-model] {
  color: var(--codex-color-text);
}

html[data-codex-chat-look='true'] [data-codex-model-trigger='true'] [data-codex-trigger-effort] {
  color: color-mix(in srgb, var(--codex-color-text) 49%, transparent);
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
  color: var(--codex-color-text) !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Stop dictation'],[aria-label='Transcribing dictation']) {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  border-radius: 9999px !important;
  background: transparent !important;
  color: var(--codex-color-text) !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Stop dictation'],[aria-label='Transcribing dictation']) svg {
  width: 14px !important;
  height: 14px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:is([aria-label='Send'],[aria-label='Envoyer'])::before {
  mask-image: ${SEND_MASK};
}

/* Keep Hermes' native dictation and playback lifecycles, but fold both banners
   into the same quiet Codex status-row language. */
html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button),
html[data-codex-chat-look='true'] [data-slot='composer-fade'] > [role='status'][aria-live='polite']:not(:has(> button)) {
  height: 28px;
  margin-bottom: var(--codex-playback-edge-gap);
  gap: 6px !important;
  padding: 0 4px !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  font-family: ${SYSTEM_FONT} !important;
  font-size: 12px !important;
  line-height: 18px !important;
}

/* Reserve one 40px lane per native audio row at the top of the dock. The
   composer stays bottom-anchored, while Hermes' own dock measurement includes
   the lane in thread clearance. */
html[data-codex-chat-look='true'] [data-slot='composer-dock']:has([data-codex-playback-floating='true']) {
  padding-top: 40px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-dock']:has([data-codex-audio-dictation='true']):has([data-codex-audio-playback='true']) {
  padding-top: 80px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-fade'] > [data-codex-playback-floating='true'] {
  position: absolute !important;
  top: var(--codex-audio-lane-top, calc(-28px - var(--codex-playback-edge-gap))) !important;
  right: 15px !important;
  left: 15px !important;
  width: auto !important;
  margin: 0 !important;
  z-index: 6;
}

/* Native order is Dictation then Playback. When both exist, Playback occupies
   the second reserved row nearest the rest of the dock. */
html[data-codex-chat-look='true'] [data-slot='composer-fade']:has(> [data-codex-audio-dictation='true']):has(> [data-codex-audio-playback='true']) > [data-codex-audio-playback='true'] {
  top: calc(var(--codex-audio-lane-top) + 40px) !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button) > div:first-child,
html[data-codex-chat-look='true'] [data-slot='composer-fade'] > [role='status'][aria-live='polite']:not(:has(> button)) > div:first-child {
  width: 18px !important;
  height: 18px !important;
  flex: 0 0 18px !important;
  border-radius: 5px !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button) > div:first-child svg,
html[data-codex-chat-look='true'] [data-slot='composer-fade'] > [role='status'][aria-live='polite']:not(:has(> button)) > div:first-child svg {
  width: 14px !important;
  height: 14px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button) > div:nth-child(2),
html[data-codex-chat-look='true'] [data-slot='composer-fade'] > [role='status'][aria-live='polite']:not(:has(> button)) > div:nth-child(2) {
  gap: 6px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button) > div:nth-child(2) > span,
html[data-codex-chat-look='true'] [data-slot='composer-fade'] > [role='status'][aria-live='polite']:not(:has(> button)) > div:nth-child(2) > span {
  color: inherit !important;
  font-size: 12px !important;
  line-height: 18px !important;
  font-weight: 400 !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button) canvas {
  width: 56px !important;
  height: 12px !important;
  opacity: 0.72 !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button) > button {
  height: 24px !important;
  min-height: 24px !important;
  gap: 4px !important;
  padding: 0 7px !important;
  border: 0 !important;
  border-radius: 7px !important;
  background: transparent !important;
  font-size: 11px !important;
  line-height: 16px !important;
  font-weight: 400 !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button) > button svg {
  width: 12px !important;
  height: 12px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button),
html[data-codex-chat-look='true'] [data-slot='composer-fade'] > [role='status'][aria-live='polite']:not(:has(> button)) {
  color: var(--codex-color-text-secondary) !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button) canvas {
  color: var(--codex-color-text-tertiary) !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [role='status'][aria-live='polite']:has(> button) > button:hover {
  background: var(--codex-color-hover) !important;
  color: var(--codex-color-text) !important;
}

@keyframes codex-playback-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes codex-playback-exit {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(6px);
  }
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [data-codex-playback-enter='true'] {
  min-height: 0 !important;
  overflow: hidden !important;
  contain: paint !important;
  will-change: transform, opacity;
  animation: codex-playback-enter 240ms cubic-bezier(0.22, 1, 0.36, 1) both !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [data-codex-playback-exit='true'] {
  min-height: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
  user-select: none !important;
  contain: paint !important;
  will-change: transform, opacity;
  animation: codex-playback-exit 240ms cubic-bezier(0.22, 1, 0.36, 1) both !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] [data-codex-playback-hold='true'] {
  pointer-events: none !important;
  user-select: none !important;
}

@media (prefers-reduced-motion: reduce) {
  html[data-codex-chat-look='true'] [data-slot='composer-surface'] [data-codex-playback-enter='true'] {
    animation: none !important;
  }

  html[data-codex-chat-look='true'] [data-slot='composer-surface'] [data-codex-playback-exit='true'] {
    display: none !important;
  }
}

/* Keep the native Attach menu compact and let Radix own its placement against
   the + trigger. Codex Skin changes only its visual density and chrome. */
html[data-codex-chat-look='true'] [data-codex-context-menu='true'] {
  width: 240px !important;
  max-width: calc(100vw - 24px) !important;
  max-height: min(40vh, 360px) !important;
  padding: 4px !important;
  border: 0.5px solid var(--codex-color-border-subtle) !important;
  border-radius: 12px !important;
  background: var(--codex-color-card) !important;
  box-shadow: var(--shadow-nous) !important;
  backdrop-filter: none !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-label'] {
  padding: 2px 8px !important;
  color: color-mix(in srgb, var(--codex-color-text) 50%, transparent) !important;
  font-family: ${SYSTEM_FONT} !important;
  font-size: 10px !important;
  line-height: 14px !important;
  font-weight: 600 !important;
  letter-spacing: 0.05em !important;
  text-transform: uppercase !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-item'] {
  height: 28px !important;
  min-height: 28px !important;
  gap: 8px !important;
  padding: 0 8px !important;
  border-radius: 6px !important;
  color: color-mix(in srgb, var(--codex-color-text) 78%, transparent) !important;
  font-family: ${SYSTEM_FONT} !important;
  font-size: 12px !important;
  line-height: 16px !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-item']:is(:hover,:focus,[data-highlighted]) {
  background: var(--codex-color-hover) !important;
  color: var(--codex-color-text) !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-item'] svg {
  width: 14px !important;
  height: 14px !important;
  color: color-mix(in srgb, var(--codex-color-text) 68%, transparent) !important;
}

html[data-codex-chat-look='true'] [data-codex-context-menu='true'] [data-slot='dropdown-menu-separator'] {
  margin: 4px !important;
  background: color-mix(in srgb, var(--codex-color-text) 8%, transparent) !important;
}

/* Keep the rear status card clear of the composer's rounded corner shoulders.
   The native dock is 10px wider than the visible composer, so a 26px dock
   inset produces a 21px visible step per side, flush with the 21px radius. The
   vertical seam stays flush so Queue is never hidden behind the composer. */
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full {
  right: 26px !important;
  bottom: 100% !important;
  left: 26px !important;
  z-index: 3 !important;
  width: auto !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  filter: none !important;
  transform: none !important;
  backdrop-filter: none !important;
  overflow: visible auto !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] {
  position: relative !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  z-index: 3 !important;
  width: auto !important;
  margin-right: 26px !important;
  margin-bottom: 0 !important;
  margin-left: 26px !important;
  border: 0 !important;
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  filter: none !important;
  transform: none !important;
  translate: none !important;
  backdrop-filter: none !important;
}

/* The scroll owner wraps the rounded card, so an opaque native gutter paints a
   square outside the top-right radius on long task lists. Keep the native scroll
   behavior, but make its track/buttons transparent and reveal only a quiet thumb. */
html[data-codex-chat-look='true'] [data-slot='composer-status-stack'] {
  scrollbar-width: thin !important;
  scrollbar-color: transparent transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-status-stack']::-webkit-scrollbar {
  width: 8px !important;
  height: 8px !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-status-stack']::-webkit-scrollbar-track,
html[data-codex-chat-look='true'] [data-slot='composer-status-stack']::-webkit-scrollbar-corner {
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-status-stack']::-webkit-scrollbar-button {
  display: none !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-status-stack']::-webkit-scrollbar-thumb {
  min-height: 28px !important;
  border: 2px solid transparent !important;
  border-radius: 999px !important;
  background: transparent !important;
  background-clip: padding-box !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-status-stack']:hover {
  scrollbar-color: color-mix(in srgb, var(--codex-color-text) 22%, transparent) transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-status-stack']:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--codex-color-text) 22%, transparent) !important;
}

/* Keep sibling status groups visible. The shared stack stops scrolling when a
   Tasks section exists; only the expanded Tasks body receives the overflow. */
html[data-codex-chat-look='true'] [data-slot='composer-status-stack'][data-codex-has-task-section='true'] {
  overflow: hidden !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true']:has([data-codex-task-section='true']) {
  display: flex !important;
  min-height: 0 !important;
  max-height: 40vh !important;
  flex-direction: column !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true']:has([data-codex-task-section='true']) > div:not([data-codex-task-section='true']) {
  flex: 0 0 auto !important;
}

html[data-codex-chat-look='true'] [data-codex-task-section='true'] {
  display: flex !important;
  min-height: 0 !important;
  flex: 0 1 auto !important;
  overflow: hidden !important;
}

html[data-codex-chat-look='true'] [data-codex-task-section='true'] > div {
  display: flex !important;
  width: 100% !important;
  min-height: 0 !important;
  flex-direction: column !important;
}

html[data-codex-chat-look='true'] [data-codex-task-section='true'] > div > div:first-child {
  flex: 0 0 auto !important;
}

html[data-codex-chat-look='true'] [data-codex-task-section='true'] > div > div:nth-child(2) {
  min-height: 0 !important;
  flex: 1 1 auto !important;
  overflow-y: auto !important;
  overscroll-behavior: contain;
  scrollbar-width: thin !important;
  scrollbar-color: transparent transparent !important;
}

html[data-codex-chat-look='true'] [data-codex-task-section='true'] > div > div:nth-child(2):hover {
  scrollbar-color: color-mix(in srgb, var(--codex-color-text) 22%, transparent) transparent !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'],
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child,
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child {
  margin: 0 !important;
  padding: 4px 8px 2px !important;
  border: 0 none transparent !important;
  border-radius: 20px 20px 0 0 !important;
  background: var(--codex-color-status-panel) !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  overflow: hidden !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'] > div + div,
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child > div + div,
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child > div + div {
  border-top: 0 !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'] button,
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child button,
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child button {
  border-radius: 12px !important;
  color: color-mix(in srgb, var(--codex-color-text) 68%, transparent) !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'] button:hover,
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child button:hover,
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child button:hover {
  color: var(--codex-color-text) !important;
}

html[data-codex-chat-look='true'] [data-codex-status-card='true'] [class~='group/status-row'],
html[data-codex-chat-look='true'] :is([data-slot='composer-root'], [data-slot='composer-dock']) div.absolute.inset-x-0.bottom-full > div:first-child [class~='group/status-row'],
html[data-codex-chat-look='true'] [data-slot='composer-dock'] > div[class~='overflow-y-auto'][class*='max-h-'] > div:first-child [class~='group/status-row'] {
  min-height: 24px !important;
  gap: 6px !important;
  padding: 1px 8px !important;
  border-radius: 8px !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_intro'] [aria-label='HERMES AGENT'] {
  color: var(--codex-color-text) !important;
  mix-blend-mode: normal !important;
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
  return storedSessionIdFromHash(window.location.hash)
}

function storedSessionIdFromHash(hash) {
  try {
    const raw = String(hash || '').match(/^#\/([^/?#]+)/)?.[1] || ''
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

const IMAGE_ATTACHMENT_MARKER_RE = /(?:^|\n)[ \t]*\[Image attached at:\s*[^\]\r\n]+\][ \t]*(?=\n|$)|\[Image attached at:\s*[^\]\r\n]+\]/gi

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
    if (node.parentElement?.closest('code, pre, [data-codex-image-marker]')) continue
    const current = node.nodeValue || ''
    const matches = [...current.matchAll(new RegExp(IMAGE_ATTACHMENT_MARKER_RE.source, IMAGE_ATTACHMENT_MARKER_RE.flags))]
    for (const match of matches.reverse()) {
      const marker = node.splitText(match.index)
      marker.splitText(match[0].length)
      const wrapper = document.createElement('span')
      wrapper.setAttribute('data-codex-image-marker', 'true')
      marker.replaceWith(wrapper)
      wrapper.appendChild(marker)
    }
  }
}

function clearImageAttachmentMarkers() {
  for (const wrapper of document.querySelectorAll('[data-codex-image-marker]')) {
    wrapper.replaceWith(...wrapper.childNodes)
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
  return { more: 'Show more', less: 'Show less' }
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
  if (fullHeight <= lineHeight * 4 + 1) {
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
  const effortRaw = rawMeta.replace(/\bFast\b/gi, '').trim() || 'Medium'
  const effortMap = {
    Minimal: 'Minimal',
    Low: 'Low',
    Med: 'Medium',
    Medium: 'Medium',
    High: 'High',
    'Extra High': 'Extra High',
    Faible: 'Low',
    Moyen: 'Medium',
    'Élevé': 'High',
    'Très élevé': 'Extra High',
    Max: 'Max',
    Ultra: 'Ultra'
  }
  return {
    model: prettyModelName(rawModel),
    effort: effortMap[effortRaw] || effortRaw
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
    const statusCard = statusStack.firstElementChild
    statusCard?.setAttribute('data-codex-status-card', 'true')
    const taskSection = statusCard
      ? [...statusCard.querySelectorAll(':scope > div')].find(section => section.querySelector('.codicon-checklist'))
      : null
    for (const section of statusCard?.querySelectorAll(':scope > div') || []) {
      if (section === taskSection) section.setAttribute('data-codex-task-section', 'true')
      else section.removeAttribute('data-codex-task-section')
    }
    if (taskSection) statusStack.setAttribute('data-codex-has-task-section', 'true')
    else statusStack.removeAttribute('data-codex-has-task-section')
    taskSection?.setAttribute('data-codex-task-section', 'true')
  }
  const editBanner = [...surface.querySelectorAll('[data-slot="composer-fade"] > div')].find(element =>
    element.matches('.flex.items-center.justify-between.gap-2.rounded-lg.border')
    && element.querySelectorAll(':scope > div:last-child > button').length === 2
  )
  editBanner?.setAttribute('data-codex-edit-banner', 'true')
  decorateModelTrigger()

  const contextMenu = [...document.querySelectorAll('[data-slot="dropdown-menu-content"][role="menu"]')].find(menu => {
    const text = menu.textContent || ''
    return /Prompt snippets|Extraits de prompt/i.test(text) && /Files|Fichiers/i.test(text)
  })
  if (!contextMenu) return

  contextMenu.setAttribute('data-codex-context-menu', 'true')
}

function clearComposerChromeDecorations() {
  for (const element of document.querySelectorAll('[data-codex-context-menu], [data-codex-status-card], [data-codex-edit-banner], [data-codex-task-section], [data-codex-has-task-section]')) {
    element.removeAttribute('data-codex-context-menu')
    element.removeAttribute('data-codex-status-card')
    element.removeAttribute('data-codex-edit-banner')
    element.removeAttribute('data-codex-task-section')
    element.removeAttribute('data-codex-has-task-section')
  }

  for (const trigger of document.querySelectorAll('[data-codex-model-trigger]')) {
    const label = trigger.querySelector(':scope > span')
    if (label && trigger.dataset.codexNativeModelLabel) label.textContent = trigger.dataset.codexNativeModelLabel
    trigger.removeAttribute('data-codex-model-trigger')
    trigger.removeAttribute('data-codex-native-model-label')
  }

}

function readComposerWidthMode() {
  try {
    const mode = pluginStorage?.get(COMPOSER_WIDTH_STORAGE_KEY, 'codex')
    return mode === 'hermes' ? 'hermes' : 'codex'
  } catch {
    return 'codex'
  }
}

function syncComposerWidthRoot() {
  const mode = readComposerWidthMode()
  const root = document.documentElement
  root.setAttribute('data-codex-composer-width', mode)
  return mode
}

function setComposerWidthMode(mode) {
  const normalized = mode === 'hermes' ? 'hermes' : 'codex'
  pluginStorage?.set(COMPOSER_WIDTH_STORAGE_KEY, normalized)
  syncComposerWidthRoot()
  window.requestAnimationFrame(() => decorateComposerChrome())
}

function readPinnedUserMessagesMode() {
  try {
    const mode = pluginStorage?.get(PINNED_USER_MESSAGES_STORAGE_KEY, 'hermes')
    return mode === 'off' ? 'off' : 'hermes'
  } catch {
    return 'hermes'
  }
}

function syncPinnedUserMessagesRoot() {
  const mode = readPinnedUserMessagesMode()
  document.documentElement.setAttribute('data-codex-pinned-user-messages', mode)
  return mode
}

function setPinnedUserMessagesMode(mode) {
  const normalized = mode === 'off' ? 'off' : 'hermes'
  pluginStorage?.set(PINNED_USER_MESSAGES_STORAGE_KEY, normalized)
  syncPinnedUserMessagesRoot()
}

function installBehaviorRuntime(afterFinalCleanup = null) {
  const pendingHandoff = window[RUNTIME_HANDOFF_KEY]
  if (pendingHandoff?.timer) window.clearTimeout(pendingHandoff.timer)
  if (pendingHandoff) delete window[RUNTIME_HANDOFF_KEY]

  let scheduled = false
  let animationFrame = 0
  let processAllPairs = true
  let historicalPairScanPending = false
  let pairWorkHandle = 0
  let pairWorkUsesIdleCallback = false
  let composerDirty = true
  let destroyed = false
  const dirtyPairs = new Set()
  const animatedPlaybackNodes = new WeakSet()
  const playbackAnimationTimers = new Set()
  const audioLaneDocks = new Set()
  const playbackReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const PAIR_WORK_BATCH_SIZE = 8
  let threadViewport = null
  let liveTailWrapper = null
  let threadScrollTimer = 0
  let threadScrollbarTimer = 0
  let liveTailAtBottom = true

  function composerFadeForDock(dock) {
    const composer = dock?.querySelector?.(':scope > [data-slot="composer-root"]')
    return composer?.querySelector('[data-slot="composer-fade"]') || null
  }

  function syncAudioLaneGeometry(dock) {
    if (destroyed || !(dock instanceof Element) || !dock.isConnected) return
    const fade = composerFadeForDock(dock)
    if (!fade) return
    const hasAudioRow = Boolean(fade.querySelector(':scope > [data-codex-playback-floating="true"]'))
    if (!hasAudioRow) {
      fade.style.removeProperty('--codex-audio-lane-top')
      fade.removeAttribute('data-codex-audio-lane')
      return
    }
    const dockRect = dock.getBoundingClientRect()
    const fadeRect = fade.getBoundingClientRect()
    if (dockRect.width <= 0 || fadeRect.width <= 0) return
    const laneTop = dockRect.top - fadeRect.top
    const next = `${laneTop}px`
    if (fade.style.getPropertyValue('--codex-audio-lane-top') !== next) {
      fade.style.setProperty('--codex-audio-lane-top', next)
    }
    fade.setAttribute('data-codex-audio-lane', 'true')
  }

  const audioLaneResizeObserver = new window.ResizeObserver(entries => {
    if (destroyed) return
    for (const entry of entries) syncAudioLaneGeometry(entry.target)
  })

  function refreshAudioLaneDocks() {
    const current = new Set(document.querySelectorAll('[data-slot="composer-dock"]'))
    for (const dock of audioLaneDocks) {
      if (current.has(dock) && dock.isConnected) continue
      audioLaneResizeObserver.unobserve(dock)
      audioLaneDocks.delete(dock)
    }
    for (const dock of current) {
      if (!audioLaneDocks.has(dock)) {
        audioLaneDocks.add(dock)
        audioLaneResizeObserver.observe(dock)
      }
      syncAudioLaneGeometry(dock)
    }
  }

  function clearAudioLaneGeometry() {
    audioLaneResizeObserver.disconnect()
    audioLaneDocks.clear()
    for (const fade of document.querySelectorAll('[data-codex-audio-lane]')) {
      fade.style.removeProperty('--codex-audio-lane-top')
      fade.removeAttribute('data-codex-audio-lane')
    }
  }

  function playbackStatusesIn(node) {
    if (!(node instanceof Element)) return []
    const statuses = []
    if (
      node.matches('[role="status"][aria-live="polite"]')
      && (node.parentElement?.matches('[data-slot="composer-fade"]') || node.hasAttribute('data-codex-playback-floating'))
    ) statuses.push(node)
    for (const status of node.querySelectorAll('[role="status"][aria-live="polite"]')) {
      if (status.parentElement?.matches('[data-slot="composer-fade"]')) statuses.push(status)
    }
    return statuses
  }

  function floatPlaybackStatus(status) {
    status.setAttribute('data-codex-playback-floating', 'true')
    const playback = Boolean(status.querySelector(':scope > button'))
    status.setAttribute(playback ? 'data-codex-audio-playback' : 'data-codex-audio-dictation', 'true')
    syncAudioLaneGeometry(status.closest('[data-slot="composer-dock"]'))
  }

  function clearPlaybackStatusFloat(status) {
    const dock = status.closest('[data-slot="composer-dock"]')
    status.removeAttribute('data-codex-playback-floating')
    status.removeAttribute('data-codex-audio-playback')
    status.removeAttribute('data-codex-audio-dictation')
    syncAudioLaneGeometry(dock)
  }

  function animatePlaybackEntry(status) {
    if (
      destroyed
      || status.hasAttribute('data-codex-playback-hold')
      || status.hasAttribute('data-codex-playback-exit')
      || animatedPlaybackNodes.has(status)
    ) return
    animatedPlaybackNodes.add(status)
    floatPlaybackStatus(status)
    const pendingGhost = status.parentElement?.querySelector?.(
      ':scope > [data-codex-playback-hold], :scope > [data-codex-playback-exit]'
    ) || null
    pendingGhost?.__codexCancelPlaybackExit?.()
    pendingGhost?.remove()
    if (pendingGhost) return
    if (playbackReducedMotion.matches) return
    status.setAttribute('data-codex-playback-enter', 'true')
    let timer = 0
    const finish = () => {
      if (timer) {
        window.clearTimeout(timer)
        playbackAnimationTimers.delete(timer)
        timer = 0
      }
      status.removeAttribute('data-codex-playback-enter')
    }
    status.addEventListener('animationend', finish, { once: true })
    timer = window.setTimeout(finish, PLAYBACK_MOTION_MS + 80)
    playbackAnimationTimers.add(timer)
  }

  function animatePlaybackExit(status, parent, nextSibling) {
    if (
      destroyed
      || status.hasAttribute('data-codex-playback-hold')
      || status.hasAttribute('data-codex-playback-exit')
      || !parent?.closest?.('[data-slot="composer-surface"]')
    ) return
    const ghost = status.cloneNode(true)
    ghost.removeAttribute('data-codex-playback-enter')
    ghost.setAttribute('data-codex-playback-hold', 'true')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    for (const button of ghost.querySelectorAll('button')) {
      button.disabled = true
      button.tabIndex = -1
    }
    const sourceCanvases = [...status.querySelectorAll('canvas')]
    const ghostCanvases = [...ghost.querySelectorAll('canvas')]
    for (let index = 0; index < sourceCanvases.length; index += 1) {
      const sourceCanvas = sourceCanvases[index]
      const ghostCanvas = ghostCanvases[index]
      if (!ghostCanvas) continue
      ghostCanvas.width = sourceCanvas.width
      ghostCanvas.height = sourceCanvas.height
      try {
        const ghostContext = ghostCanvas.getContext('2d')
        if (ghostContext) ghostContext.drawImage(sourceCanvas, 0, 0)
      } catch {}
    }
    if (nextSibling?.parentNode === parent) parent.insertBefore(ghost, nextSibling)
    else parent.appendChild(ghost)
    syncAudioLaneGeometry(parent.closest('[data-slot="composer-dock"]'))
    let graceTimer = 0
    let exitTimer = 0
    let exitStartTimer = 0
    const removeGhost = () => {
      if (graceTimer) {
        window.clearTimeout(graceTimer)
        playbackAnimationTimers.delete(graceTimer)
        graceTimer = 0
      }
      if (exitTimer) {
        window.clearTimeout(exitTimer)
        playbackAnimationTimers.delete(exitTimer)
        exitTimer = 0
      }
      if (exitStartTimer) {
        window.clearTimeout(exitStartTimer)
        playbackAnimationTimers.delete(exitStartTimer)
        exitStartTimer = 0
      }
      delete ghost.__codexCancelPlaybackExit
      const dock = ghost.closest('[data-slot="composer-dock"]')
      ghost.remove()
      syncAudioLaneGeometry(dock)
    }
    ghost.__codexCancelPlaybackExit = removeGhost
    ghost.addEventListener('animationend', removeGhost, { once: true })
    const beginExit = () => {
      if (graceTimer) {
        playbackAnimationTimers.delete(graceTimer)
        graceTimer = 0
      }
      if (playbackReducedMotion.matches) {
        removeGhost()
        return
      }
      // Start from a separately committed held frame. A zero-delay task is
      // reliable even when the renderer is background-throttled; RAF is not.
      exitStartTimer = window.setTimeout(() => {
        playbackAnimationTimers.delete(exitStartTimer)
        exitStartTimer = 0
        if (!ghost.isConnected) return
        ghost.setAttribute('data-codex-playback-exit', 'true')
        exitTimer = window.setTimeout(removeGhost, PLAYBACK_MOTION_MS + 80)
        playbackAnimationTimers.add(exitTimer)
      }, 0)
      playbackAnimationTimers.add(exitStartTimer)
    }
    graceTimer = window.setTimeout(beginExit, PLAYBACK_CLOSE_GRACE_MS)
    playbackAnimationTimers.add(graceTimer)
  }

  function clearPlaybackAnimations() {
    for (const timer of playbackAnimationTimers) window.clearTimeout(timer)
    playbackAnimationTimers.clear()
    for (const status of document.querySelectorAll('[data-codex-playback-enter]')) {
      status.removeAttribute('data-codex-playback-enter')
    }
    for (const ghost of document.querySelectorAll('[data-codex-playback-hold], [data-codex-playback-exit]')) {
      ghost.__codexCancelPlaybackExit?.()
      ghost.remove()
    }
    for (const status of document.querySelectorAll('[data-codex-playback-floating]')) {
      clearPlaybackStatusFloat(status)
    }
  }

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

  const latestTurnPairFromEnd = content => {
    if (!content) return null
    let node = content.lastElementChild
    while (node) {
      if (node.matches?.('[data-slot="aui_turn-pair"]') && userMessageId(node)) return node
      if (node.lastElementChild) {
        node = node.lastElementChild
        continue
      }
      while (node && node !== content && !node.previousElementSibling) node = node.parentElement
      if (!node || node === content) return null
      node = node.previousElementSibling
    }
    return null
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
    const latest = latestTurnPairFromEnd(content)
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

  const markPair = pair => {
    if (!pair?.matches?.('[data-slot="aui_turn-pair"]')) return
    dirtyPairs.add(pair)
  }

  const markPairsIn = node => {
    if (!(node instanceof Element)) return
    if (node.matches('[data-slot="aui_turn-pair"]')) markPair(node)
    else if (
      node.matches('[data-session-anchor], [data-slot="aui_thread-content"]')
      || node.closest?.('[data-slot="aui_thread-content"]')
    ) {
      historicalPairScanPending = true
    }
  }


  const cancelPairWork = () => {
    if (!pairWorkHandle) return
    if (pairWorkUsesIdleCallback) window.cancelIdleCallback?.(pairWorkHandle)
    else window.clearTimeout(pairWorkHandle)
    pairWorkHandle = 0
  }

  const runPairWork = deadline => {
    pairWorkHandle = 0
    if (destroyed) return
    if (historicalPairScanPending) {
      historicalPairScanPending = false
      for (const pair of document.querySelectorAll('[data-slot="aui_turn-pair"]')) markPair(pair)
    }
    let processed = 0
    while (dirtyPairs.size && processed < PAIR_WORK_BATCH_SIZE && (processed === 0 || deadline.timeRemaining() > 1)) {
      const pair = dirtyPairs.values().next().value
      dirtyPairs.delete(pair)
      if (!pair?.isConnected) continue
      stripImageAttachmentMarker(pair)
      decorateLongUserMessage(pair)
      processed += 1
    }
    if (dirtyPairs.size) schedulePairWork()
  }

  const schedulePairWork = () => {
    if (pairWorkHandle || destroyed) return
    if (typeof window.requestIdleCallback === 'function') {
      pairWorkUsesIdleCallback = true
      pairWorkHandle = window.requestIdleCallback(runPairWork, { timeout: 800 })
    } else {
      pairWorkUsesIdleCallback = false
      pairWorkHandle = window.setTimeout(() => runPairWork({ timeRemaining: () => 4 }), 16)
    }
  }

  const schedule = () => {
    if (scheduled || destroyed) return
    scheduled = true
    animationFrame = window.requestAnimationFrame(process)
  }

  const reconcileSession = () => {
    if (destroyed) return
    historicalPairScanPending = true
    composerDirty = true
    schedule()
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

  function process() {
    animationFrame = 0
    scheduled = false
    if (destroyed) return

    if (processAllPairs) {
      processAllPairs = false
      historicalPairScanPending = true
    }
    schedulePairWork()

    refreshLiveTail()

    if (composerDirty) {
      composerDirty = false
      decorateComposerChrome()
      refreshAudioLaneDocks()
    }
  }

  const touchesComposerChrome = element => Boolean(
    element?.closest?.('[data-slot="composer-dock"]:not([data-slot="composer-rich-input"]), [data-slot="composer-root"]:not([data-slot="composer-rich-input"])')
    || element?.matches?.('[data-slot="dropdown-menu-content"][role="menu"]')
    || (element?.firstElementChild && element.querySelector?.('[data-slot="dropdown-menu-content"][role="menu"], [data-slot="composer-dock"]'))
  )

  const runtimeSignalSelector = [
    '[data-slot="aui_user-message-root"]',
    '[data-slot="aui_turn-pair"]',
    '[role="status"]',
    '[data-slot="dropdown-menu-content"][role="menu"]',
    '[data-slot="composer-dock"]',
    '[data-slot="composer-root"]',
    '[data-session-anchor]'
  ].join(', ')

  const carriesRuntimeSignal = node => Boolean(
    node instanceof Element
    && (
      node.matches(runtimeSignalSelector)
      || (node.firstElementChild && node.querySelector(runtimeSignalSelector))
    )
  )

  const handleMutations = records => {
    let relevant = false
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      if (target?.closest?.('[data-codex-user-expand]')) continue
      if (target?.closest?.('[data-slot="sidebar"]')) continue

      const pair = target?.closest?.('[data-slot="aui_turn-pair"]')
      if (record.type === 'attributes') {
        if (record.attributeName === 'data-clamped' && target?.closest?.('[data-role="user"]')) {
          if (pair) markPair(pair)
          relevant = true
        } else if (record.attributeName === 'role' && target?.matches?.('[role="status"]')) {
          if (pair) markPair(pair)
          relevant = true
        } else if (target?.closest?.('[data-slot="composer-dock"], [data-slot="composer-root"]')) {
          composerDirty = true
          relevant = true
        }
        continue
      }

      if (target?.closest?.('[data-slot="composer-rich-input"]')) continue
      const addedElements = [...record.addedNodes].filter(node => node instanceof Element)
      const removedElements = [...record.removedNodes].filter(node => node instanceof Element)
      const changedElements = [...addedElements, ...removedElements]
      if (target?.closest?.('[data-slot="composer-surface"]')) {
        for (const node of addedElements) {
          for (const status of playbackStatusesIn(node)) animatePlaybackEntry(status)
        }
        for (const node of removedElements) {
          for (const status of playbackStatusesIn(node)) animatePlaybackExit(status, target, record.nextSibling)
        }
      }
      const signalChanged = changedElements.some(carriesRuntimeSignal)

      if (pair && (target?.closest?.('[data-role="user"]') || signalChanged)) {
        markPair(pair)
        relevant = true
      }
      if (signalChanged) relevant = true
      if (target?.closest?.('[data-slot="composer-dock"], [data-slot="composer-root"]')) {
        composerDirty = true
        relevant = true
      }

      for (const node of changedElements) {
        if (node.matches('[data-slot="sidebar"]') || node.closest?.('[data-slot="sidebar"]')) continue
        if (node.matches('[data-session-anchor], [data-slot="aui_turn-pair"], [data-slot="aui_thread-content"]')) {
          markPairsIn(node)
          relevant = true
        }
        if (touchesComposerChrome(node)) {
          composerDirty = true
          relevant = true
        }
      }
    }
    if (relevant) schedule()
  }

  const observer = new MutationObserver(handleMutations)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'role', 'data-clamped']
  })
  for (const status of document.querySelectorAll('[data-slot="composer-fade"] > [role="status"][aria-live="polite"]')) {
    animatePlaybackEntry(status)
  }
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
    cancelPairWork()
    clearPlaybackAnimations()
    clearAudioLaneGeometry()

    window.clearTimeout(threadScrollTimer)
    window.clearTimeout(threadScrollbarTimer)
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

    const handoff = { timer: 0 }
    handoff.timer = window.setTimeout(() => {
      if (window[RUNTIME_HANDOFF_KEY] !== handoff) return
      for (const user of document.querySelectorAll('[data-slot="aui_user-message-root"]')) clearLongUserDecoration(user)
      clearImageAttachmentMarkers()
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
    syncComposerWidthRoot()
    syncPinnedUserMessagesRoot()
    const uninstallBehavior = installBehaviorRuntime(() => {
      style?.remove()
      delete root.dataset.codexChatLook
      root.removeAttribute('data-codex-composer-width')
      root.removeAttribute('data-codex-pinned-user-messages')
      if (root.dataset.codexChatLookBuild === BUILD_ID) delete root.dataset.codexChatLookBuild
      if (root.dataset.codexChatLookRuntime === BUILD_ID) delete root.dataset.codexChatLookRuntime
    })
    root.dataset.codexChatLookRuntime = BUILD_ID
    return () => {
      uninstallBehavior()
    }
  }, [])

  return null
}

export default {
  id: ID,
  name: 'Codex Skin',
  register(ctx) {
    pluginStorage = ctx.storage
    ctx.register({ id: 'theme', area: THEMES_AREA, data: CODEX_THEME })
    ctx.register({
      id: 'toggle-composer-width',
      area: PALETTE_AREA,
      data: {
        id: 'codex-chat-look.toggle-composer-width',
        label: 'Codex Skin: Composer width',
        detail: () => (readComposerWidthMode() === 'codex' ? 'Codex' : 'Hermes'),
        detailVariant: 'state',
        keepOpen: true,
        keywords: ['codex', 'skin', 'composer', 'width', 'narrow', 'full', 'hermes'],
        run: () => setComposerWidthMode(readComposerWidthMode() === 'codex' ? 'hermes' : 'codex')
      }
    })
    ctx.register({
      id: 'toggle-pinned-user-messages',
      area: PALETTE_AREA,
      data: {
        id: 'codex-chat-look.toggle-pinned-user-messages',
        label: 'Codex Skin: Pinned user messages',
        detail: () => (readPinnedUserMessagesMode() === 'hermes' ? 'Hermes' : 'Off'),
        detailVariant: 'state',
        keepOpen: true,
        keywords: ['codex', 'skin', 'pinned', 'sticky', 'user', 'message', 'prompt', 'hermes'],
        run: () => setPinnedUserMessagesMode(readPinnedUserMessagesMode() === 'hermes' ? 'off' : 'hermes')
      }
    })
    ctx.register({
      id: 'style-runtime',
      area: TITLEBAR_AREAS.center,
      order: 9999,
      render: () => jsx(CodexChatStyleRuntime, {})
    })
  }
}
