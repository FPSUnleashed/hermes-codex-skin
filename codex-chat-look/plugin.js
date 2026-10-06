import { host, PALETTE_AREA, THEMES_AREA, queryClient, useQuery, useValue } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx } from 'react/jsx-runtime'

const ID = 'codex-chat-look'
const STYLE_ID = `${ID}-styles`
const BUILD_ID = 'v1.9.0'
const STORAGE_PREFIX = `${ID}:turn:`
const LONG_USER_STATE_SUFFIX = ':long-user-expanded'
const MAX_PERSISTED_LONG_USER_STATES = 250
const RUNTIME_HANDOFF_KEY = '__hermesCodexChatLookRuntimeHandoff'
const COMPOSER_WIDTH_STORAGE_KEY = 'composer-width'
const PINNED_USER_MESSAGES_STORAGE_KEY = 'pinned-user-messages'
const CLEAN_TRANSCRIPT_STORAGE_KEY = 'clean-transcript'
const CLEAN_TRANSCRIPT_EVENT = `${ID}:clean-transcript`

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
    background: '#111111',
    foreground: '#FCFCFC',
    card: '#212121',
    cardForeground: '#FCFCFC',
    muted: '#242424',
    mutedForeground: '#B4B4B4',
    popover: '#242424',
    popoverForeground: '#FCFCFC',
    primary: '#FCFCFC',
    primaryForeground: '#111111',
    secondary: '#242424',
    secondaryForeground: '#FCFCFC',
    accent: '#2C2C2C',
    accentForeground: '#FCFCFC',
    border: '#2E2E2E',
    input: '#2E2E2E',
    ring: '#FCFCFC',
    composerRing: '#2E2E2E',
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',
    sidebarBackground: '#1C1C1C',
    sidebarBorder: '#242424',
    userBubble: '#1D1D1D',
    userBubbleBorder: '#1D1D1D'
  },
  typography: {
    fontSans: SYSTEM_FONT,
    fontMono: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
  }
}

const MIC_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M18.5848 13.4121C18.7715 12.9516 19.2961 12.7296 19.7567 12.916C20.217 13.1027 20.4391 13.6274 20.2528 14.0879C19.0405 17.0826 16.2438 19.2675 12.9003 19.6035V22C12.9003 22.4971 12.4969 22.9004 11.9999 22.9004C11.5029 22.9003 11.0995 22.497 11.0995 22V19.6035C7.75618 19.2673 4.96018 17.0823 3.74791 14.0879C3.56144 13.6272 3.78344 13.1026 4.244 12.916C4.70458 12.7298 5.22933 12.9517 5.41588 13.4121C6.46985 16.0157 9.02264 17.8496 12.0008 17.8496C14.9787 17.8493 17.531 16.0155 18.5848 13.4121ZM11.9999 1.34961C14.7061 1.34961 16.9003 3.5438 16.9003 6.25V10.7334C16.9003 13.4396 14.7061 15.6338 11.9999 15.6338C9.29371 15.6337 7.09947 13.4396 7.09947 10.7334V6.25C7.09947 3.54384 9.29372 1.34967 11.9999 1.34961ZM11.9999 3.15039C10.2878 3.15045 8.90025 4.53795 8.90025 6.25V10.7334C8.90025 12.4454 10.2878 13.8339 11.9999 13.834C13.7119 13.834 15.0995 12.4455 15.0995 10.7334V6.25C15.0995 4.53792 13.7119 3.15039 11.9999 3.15039Z'/%3E%3C/svg%3E")`
const SEND_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M11.25 18.25V7.56L7.53 11.28a.75.75 0 0 1-1.06-1.06l5-5a.75.75 0 0 1 1.06 0l5 5a.75.75 0 1 1-1.06 1.06l-3.72-3.72v10.69a.75.75 0 0 1-1.5 0Z'/%3E%3C/svg%3E")`

// Palette data stays separate from the theme-inheriting layout rules.
const BROWSER_PALETTE_CSS = `
html[data-codex-chat-look='true'][data-hermes-theme='codex-chat'][data-hermes-mode='dark'] {
  --codex-browser-background: var(--codex-color-chat);
  --codex-browser-tab: #1d1d1d;
  --codex-browser-address: transparent;
  --codex-browser-border: transparent;
  --codex-browser-divider: #232323;
  --codex-sidebar-divider: #2c2c2c;
}
`

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
  --codex-sidebar-label: color-mix(in srgb, var(--codex-color-text) 90%, var(--codex-color-sidebar));
  --codex-sidebar-muted: color-mix(in srgb, var(--codex-color-text) 65%, var(--codex-color-sidebar));
  --codex-sidebar-hover: color-mix(in srgb, var(--codex-color-text) 4%, transparent);
  --codex-sidebar-active: color-mix(in srgb, var(--codex-color-text) 7%, transparent);
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

/* Keep the measured dark palette exact instead of tinting its neutral seeds. */
html[data-codex-chat-look='true'][data-hermes-theme='codex-chat'][data-hermes-mode='dark'] {
  --codex-color-text: var(--theme-foreground);
  --codex-color-active: var(--theme-accent-soft);
  --codex-color-border: var(--dt-border);
  --codex-color-border-subtle: var(--dt-composer-ring);
  --ui-row-active-background: var(--theme-accent-soft);
  --ui-widget-surface-background: var(--theme-elevated-seed);
}

/* The field colors are exact Codex seeds only in the ordinary opaque page.
   Glass makes Hermes' semantic chat/sidebar fields transparent; do not repaint
   them after the native material layer has taken ownership. */
html[data-codex-chat-look='true'][data-hermes-theme='codex-chat']:not([data-hermes-glass]) {
  --codex-color-chat: var(--theme-background-seed);
  --ui-chat-surface-background: var(--codex-color-chat);
  --codex-color-sidebar: var(--theme-sidebar-seed);
}

html[data-codex-chat-look='true'][data-hermes-theme='codex-chat'][data-hermes-mode='dark']:not([data-hermes-glass]) {
  --ui-sidebar-surface-background: var(--theme-sidebar-seed);
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

/* Clean transcript is post-turn only. Runtime adds the settled marker after
   Hermes mounts a real final message and while no native liveness or human
   action remains in that turn. */
html[data-codex-chat-look='true'][data-codex-clean-transcript='on']
  [data-slot='aui_turn-pair'][data-codex-clean-settled='true']
  [data-codex-clean-interim='true'],
html[data-codex-chat-look='true'][data-codex-clean-transcript='on']
  [data-slot='aui_turn-pair'][data-codex-clean-settled='true']
  [data-codex-clean-interim-part='true'],
html[data-codex-chat-look='true'][data-codex-clean-transcript='on']
  [data-slot='aui_turn-pair'][data-codex-clean-settled='true']
  > [data-role='system']:not(:has([role='alert'])),
html[data-codex-chat-look='true'][data-codex-clean-transcript='on']
  [data-slot='aui_turn-pair'][data-codex-clean-settled='true']
  [data-slot='tool-block']:not(:has([data-slot='aui_generated-image'], [data-slot='aui_artifact-card'])),
html[data-codex-chat-look='true'][data-codex-clean-transcript='on']
  [data-slot='aui_turn-pair'][data-codex-clean-settled='true']
  [data-slot='aui_thinking-disclosure'],
html[data-codex-chat-look='true'][data-codex-clean-transcript='on']
  [data-slot='aui_turn-pair'][data-codex-clean-settled='true']
  [data-slot='aui_changed-files'] {
  display: none !important;
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

/* Native Hermes leaves sent attachments as a sibling after the sticky user
   root. Order them before the bubble without reparenting React nodes, then
   make only those user-owned images Codex thumbnails. The selector is anchored
   to the user root so assistant output images keep their full native size and
   lightbox behavior. */
html[data-codex-chat-look='true'] [data-slot='aui_turn-pair']
  > [data-role='user']
  + *:not([data-role]):has([data-slot='aui_embedded-images']) {
  order: -1 !important;
  width: 100% !important;
  align-self: stretch !important;
  justify-content: flex-end !important;
  gap: 8px !important;
  margin: 0 0 calc(-1 * var(--conversation-turn-gap, 12px) + 8px) !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_turn-pair'] > [data-role='user']
  + *:not([data-role]) [data-slot='aui_embedded-images'] {
  display: flex !important;
  flex-wrap: wrap !important;
  justify-content: flex-end !important;
  margin-top: 0 !important;
  gap: 8px !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_turn-pair'] > [data-role='user']
  + *:not([data-role]) [data-slot='aui_embedded-images'] > [aria-hidden] {
  width: 80px !important;
  height: 80px !important;
  border-radius: 10px !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_turn-pair']
  > [data-role='user']
  + *:not([data-role]):has([data-slot='aui_directive-image'], [data-slot='aui_embedded-image'])
  :is([data-slot='aui_directive-image'], [data-slot='aui_embedded-image']) {
  width: 80px !important;
  height: 80px !important;
  max-width: 80px !important;
  max-height: 80px !important;
  flex: 0 0 80px !important;
  overflow: hidden !important;
  border: 1px solid var(--codex-color-border-subtle) !important;
  border-radius: 10px !important;
  padding: 0 !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_turn-pair']
  > [data-role='user']
  + *:not([data-role]):has([data-slot='aui_directive-image'], [data-slot='aui_embedded-image'])
  :is([data-slot='aui_directive-image'], [data-slot='aui_embedded-image']) img {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  display: block !important;
  box-sizing: border-box !important;
  padding: 0 !important;
  object-fit: cover !important;
  border: 0 !important;
  border-radius: inherit !important;
}

/* Legacy inline image directives can live inside the user bubble rather than
   the metadata attachment row. Keep them bounded to user content and preserve
   the native zoomable element. */
html[data-codex-chat-look='true'] [data-slot='aui_user-message-root']
  .composer-human-message [data-slot='aui_embedded-images'] {
  justify-content: flex-end !important;
  gap: 8px !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_turn-pair']
  > [data-role='user']
  + *:not([data-role]):has([data-slot='aui_directive-image'], [data-slot='aui_embedded-image'])
  [data-slot='aui_embedded-images'] {
  justify-content: flex-end !important;
  gap: 8px !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_user-message-root']
  .composer-human-message [data-slot='aui_embedded-images']
  :is([data-slot='aui_directive-image'], [data-slot='aui_embedded-image']) {
  width: 80px !important;
  height: 80px !important;
  max-width: 80px !important;
  max-height: 80px !important;
  overflow: hidden !important;
  border: 1px solid var(--codex-color-border-subtle) !important;
  border-radius: 10px !important;
  padding: 0 !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_user-message-root']
  .composer-human-message [data-slot='aui_embedded-images']
  :is([data-slot='aui_directive-image'], [data-slot='aui_embedded-image']) img {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: cover !important;
  border-radius: inherit !important;
}

/* The native composer inserts ImageIcon before its asynchronous thumbnail.
   Reserve the frame from that first state, not from the later img insertion.
   IconPhoto is the image-kind fallback in AttachmentPill; file-kind icons do
   not match. Native labels remain available through aria-label and tooltip,
   and upload/error overlays and removal buttons retain their handlers. */
html[data-codex-chat-look='true'] [data-slot='composer-attachments'] {
  gap: 12px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-attachments'] .group\\/attachment:has(> button:first-child > span:first-child > :is(img, svg.icon-tabler-photo)) > button:first-child {
  width: 122px !important;
  height: 122px !important;
  max-width: 122px !important;
  padding: 0 !important;
  align-items: stretch !important;
  gap: 0 !important;
  border-radius: 12px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-attachments'] .group\\/attachment:has(> button:first-child > span:first-child > :is(img, svg.icon-tabler-photo)) > button:first-child > span:first-child {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  border: 0 !important;
  border-radius: inherit !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-attachments'] .group\\/attachment:has(> button:first-child > span:first-child > :is(img, svg.icon-tabler-photo)) > button:first-child > span:last-child {
  display: none !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-attachments'] .group\\/attachment:has(> button:first-child img) > button:first-child img {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: cover !important;
  border-radius: inherit !important;
}

/* Scale the native removal button once, including its native 10px glyph.
   Center origin preserves its location. Do not also increase the glyph font:
   that compounds the scale and makes the cross overflow its circle. */
html[data-codex-chat-look='true'] [data-slot='composer-attachments']
  .group\\/attachment:has(> button:first-child > span:first-child > :is(img, svg.icon-tabler-photo))
  > button:nth-child(2) {
  transform: scale(2) !important;
  transform-origin: center !important;
  z-index: 2;
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
html[data-codex-chat-look='true'] [data-tree-group='grp-sessions'],
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
  background: var(--codex-sidebar-active) !important;
  box-shadow: none !important;
}

/* Keep row geometry invariant across pointer state. If 10 px begins only at
   :hover, Chromium can paint one native 6 px frame before the hover cascade. */
html[data-codex-chat-look='true'] [data-slot='sidebar'] .row-hover {
  border-radius: 10px !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] .row-hover:hover:not([class*='ui-row-active-background']):not([data-active='true']):not([aria-current='true']) {
  background: var(--codex-sidebar-hover) !important;
}

/* Native Bots/group rows are full-width buttons, not .row-hover elements.
   Scope their paint to the left sidebar; leave avatars, status colors and
   toolbar actions alone. Selected rows keep their fill under the pointer. */
html[data-codex-chat-look='true'] [data-tree-group='grp-sessions']
  button[aria-label][class~='w-full'][class~='text-left'][class~='hover:bg-(--chrome-action-hover)'] {
  border-radius: 10px !important;
}

html[data-codex-chat-look='true'] [data-tree-group='grp-sessions']
  button[aria-label][class~='w-full'][class~='text-left'][class~='hover:bg-(--chrome-action-hover)']:hover {
  background: var(--codex-sidebar-hover) !important;
}

html[data-codex-chat-look='true'] [data-tree-group='grp-sessions']
  button[aria-label][class~='w-full'][class~='text-left'][class~='hover:bg-(--chrome-action-hover)'][class~='bg-(--ui-row-active-background)'] {
  background: var(--codex-sidebar-active) !important;
}

/* Round the chat surface beside the visible sessions sidebar, with or without tabs. */
html[data-codex-chat-look='true']
  [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div:has(> [data-tree-group='grp-main'])::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 16px;
  height: 16px;
  background: var(--ui-sidebar-surface-background);
  pointer-events: none;
}

html[data-codex-chat-look='true']
  [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div
  > [data-tree-group='grp-main'] {
  border-top-left-radius: 16px !important;
}

/* With an integrated panel header, the visible chat starts below that header.
   Its rounded cutout must reveal sidebar paint, not the chat's own background. */
html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div > [data-tree-group='grp-main']:has(> [data-panel-header]) {
  background: var(--ui-sidebar-surface-background) !important;
}

html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div > [data-tree-group='grp-main'] > [data-panel-header] + div {
  border-top-left-radius: 0 !important;
  background: var(--ui-editor-surface-background) !important;
}

/* Integrated headers and their content share a square edge. The standalone
   chat surface above remains rounded only when it has no integrated header. */
html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div:has(> [data-tree-group='grp-main'] > [data-panel-header])::before {
  content: none !important;
  width: 0 !important;
  height: 0 !important;
}

html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div > [data-tree-group='grp-main']:has(> [data-panel-header]) {
  border-top-left-radius: 0 !important;
}

html[data-codex-chat-look='true']
  [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div
  > [role='separator']
  > span {
  opacity: 0 !important;
}

html[data-codex-chat-look='true']
  [data-tree-group='grp-sessions']
  [data-zone-tabstrip='grp-sessions']
  [role='tab'][data-tree-tab] {
  border-left-color: transparent !important;
}

/* Transparent tabless main overlay: the scroller reaches the pane's top while
   the native drag handle and separate window controls stay in a 48px band. */
html[data-codex-chat-look='true'] [data-tree-group='grp-main'] > [data-panel-header]:not(:has([data-zone-tabstrip])) {
  position: absolute !important;
  inset: 0 0 auto !important;
  height: 48px !important;
  min-height: 48px !important;
  z-index: 30;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  pointer-events: none;
}

html[data-codex-chat-look='true'] [data-tree-group='grp-main'] > [data-panel-header]:not(:has([data-zone-tabstrip])) > [data-window-drag-handle] {
  pointer-events: auto;
}

/* Match the shared 48px header row while preserving the original square
   Sessions/Bots tabs, underline and divider behavior. */
html[data-codex-chat-look='true']
  [data-tree-group='grp-sessions']
  [data-zone-tabstrip='grp-sessions'] {
  height: 48px !important;
  min-height: 48px !important;
  box-sizing: border-box !important;
  padding-block: 10px !important;
}

html[data-codex-chat-look='true']
  [data-tree-group='grp-sessions']
  [data-zone-tabstrip='grp-sessions']
  > [role='tablist'] {
  align-items: center !important;
}

html[data-codex-chat-look='true']
  [data-tree-group='grp-sessions']
  [data-zone-tabstrip='grp-sessions']
  [role='tab'][data-tree-tab] {
  height: 28px !important;
  min-height: 28px !important;
}

/* Prefer the full sidebar toggle to partial minimization. Keep Restore
   available for layouts saved before this control was hidden. */
html[data-codex-chat-look='true']
  [data-tree-group='grp-sessions']
  [data-zone-tabstrip='grp-sessions']
  > button:has(> .codicon-chevron-down) {
  display: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [class~='group/section-label'] > span > .dither {
  display: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [class~='group/section-label'] > span:first-child {
  color: var(--codex-sidebar-muted) !important;
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 21px !important;
  font-weight: 500 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [class~='group/section-label'] > span:first-child > span:last-child {
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 21px !important;
  font-weight: 500 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar-menu-button'] {
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 21px !important;
  font-weight: 400 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] span[class*='text-[0.8125rem]'] {
  font-family: ${SYSTEM_FONT} !important;
  font-size: 14px !important;
  line-height: 20px !important;
  font-weight: 400 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
}

/* Names carry the hierarchy; section labels and utility icons stay quieter.
   Never dim a whole row: its native status and project colors must survive. */
html[data-codex-chat-look='true'] [data-slot='sidebar'] .row-hover span[class*='text-[0.8125rem]'],
html[data-codex-chat-look='true'] [data-slot='sidebar-menu-button'] {
  color: var(--codex-sidebar-label) !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] .row-hover:is(:hover, [data-active='true'], [aria-current='true'], [class*='ui-row-active-background']) span[class*='text-[0.8125rem]'] {
  color: var(--codex-color-text) !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar-menu-button'] > :is(svg, .codicon):not([style*='color']) {
  color: var(--codex-sidebar-muted) !important;
}

/* Pure idle has no information to communicate. Hide only Hermes' uncolored
   grey fallback dot; keep project-colored idle identity and every semantic
   state (draft, working, stalled, background, unread and needs-input). */
html[data-codex-chat-look='true'] [data-slot='sidebar'] .row-hover
  span[aria-hidden='true'][class~='size-1'][class*='bg-(--ui-text-quaternary)']:not([style*='background-color']) {
  display: none !important;
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

/* Left-edge history index. Native buttons still own message navigation; only
   the hover presentation is replaced. Dimensions follow the 2x reference. */
html[data-codex-chat-look='true'] [data-codex-history-rail] {
  /* Local units compensate the zoom: 16px left and 36px wide on screen. */
  left: 11.2px !important;
  right: auto !important;
  width: 25.2px !important;
  align-items: flex-start !important;
  /* Scale the whole native coordinate space, including its hit targets.
     The virtualizer still owns unchanged 7px offsets and scrollTop values. */
  zoom: calc(10 / 7);
  transform: translateY(-50%) !important;
  transform-origin: center !important;
  max-height: calc(min(60vh, 360px, var(--codex-history-rail-height, 360px)) * .7);
}
html[data-codex-chat-look='true'] [data-session-anchor]:has([data-slot='thread-timeline']) {
  container-type: inline-size;
  container-name: codex-history-pane;
}
@container codex-history-pane (max-width: 862px) {
  html[data-codex-chat-look='true'] [data-codex-history-rail] { display: none !important; }
}
html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='thread-timeline-ticks'] {
  align-items: flex-start !important;
  width: 25.2px !important;
  max-height: min(60vh, 360px, var(--codex-history-rail-height, 360px));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: none;
  padding: 0 !important;
}
html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='thread-timeline-ticks'] > .thread-timeline-track {
  width: 25.2px !important;
  position: relative !important;
}
html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='thread-timeline-ticks'] > .thread-timeline-track button.thread-timeline-tick {
  width: 25.2px !important;
  justify-content: flex-start !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  cursor: pointer;
}
html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='thread-timeline-ticks'] > .thread-timeline-track button.thread-timeline-tick > [data-slot='timeline-bar'] {
  width: calc(var(--codex-history-tick-width, 6px) * .7) !important;
  height: 1.4px !important;
  flex: none !important;
  border-radius: 0 !important;
  background: color-mix(in srgb, var(--codex-color-text) 19.148936%, var(--codex-color-chat)) !important;
  background-image: none !important;
  opacity: 1 !important;
  transition: width 140ms cubic-bezier(.2,.8,.2,1), opacity 140ms ease !important;
}
/* Pointer motion already updates the continuous wave once per frame. Do not
   restart a trailing width animation on every sample; animate only its exit. */
html[data-codex-chat-look='true'] [data-codex-history-rail][data-codex-history-open] [data-slot='thread-timeline-ticks'] > .thread-timeline-track button.thread-timeline-tick > [data-slot='timeline-bar'] {
  transition: none !important;
}
/* The hover preview temporarily replaces Hermes' visible-message highlight. */
html[data-codex-chat-look='true'] [data-codex-history-rail]:not([data-codex-history-open]) [data-slot='thread-timeline-ticks'] > .thread-timeline-track button.thread-timeline-tick[aria-current='location'] > [data-slot='timeline-bar'] {
  background: color-mix(in srgb, var(--codex-color-text) 60%, var(--codex-color-chat)) !important;
}
html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='thread-timeline-ticks'] > .thread-timeline-track button.thread-timeline-tick[data-codex-history-hover] > [data-slot='timeline-bar'] {
  background: var(--codex-color-text) !important;
}
html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='thread-timeline-popover'] {
  display: none !important;
}
html[data-codex-chat-look='true'] [data-codex-history-preview] {
  position: absolute;
  z-index: 50;
  box-sizing: border-box;
  overflow: hidden;
  padding: 10px 8px;
  border: 1px solid color-mix(in srgb, var(--codex-color-text) 12%, transparent);
  border-radius: 12px;
  background: var(--codex-color-elevated);
  color: var(--codex-color-text);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--codex-color-text) 12%, transparent);
  font-family: ${SYSTEM_FONT};
  font-size: 13px;
  line-height: 18px;
  text-align: left;
  overflow-wrap: anywhere;
  -webkit-app-region: no-drag;
}
html[data-codex-chat-look='true'] [data-codex-history-preview][hidden] { display: none !important; }
html[data-codex-chat-look='true'] [data-codex-history-question],
html[data-codex-chat-look='true'] [data-codex-history-answer] {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  -webkit-line-clamp: 2;
}
html[data-codex-chat-look='true'] [data-codex-history-question] { font-weight: 500; }
html[data-codex-chat-look='true'] [data-codex-history-answer] {
  -webkit-line-clamp: 4;
  margin-top: 8px;
  color: var(--codex-color-text-secondary);
  font-weight: 400;
}
html[data-codex-chat-look='true'] [data-codex-history-answer] p { margin: 0 0 8px; }
html[data-codex-chat-look='true'] [data-codex-history-answer] p:last-child { margin-bottom: 0; }
html[data-codex-chat-look='true'] [data-codex-history-answer] strong { font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='thread-timeline-ticks'] .thread-timeline-tick > [data-slot='timeline-bar'] { transition: none !important; }
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

/* Codex file diffs are quiet resource cards, not dark editor islands. Keep
   Hermes in charge of every color and borrow only Codex's geometry, density,
   and 80/20 semantic tint ratio. Ordinary tool rows are deliberately outside
   this data-file-edit scope. */
html[data-codex-chat-look='true'] [data-slot='tool-block'][data-file-edit][data-tool-open] {
  --codex-diff-card-surface: color-mix(in srgb, var(--codex-color-elevated) 50%, transparent);
  --codex-diff-add-surface: color-mix(
    in srgb,
    var(--codex-diff-card-surface) 80%,
    var(--ui-diff-add-border)
  );
  --codex-diff-remove-surface: color-mix(
    in srgb,
    var(--codex-diff-card-surface) 80%,
    var(--ui-diff-remove-border)
  );
  background: var(--codex-diff-card-surface) !important;
  border-color: color-mix(in srgb, var(--codex-color-border-subtle) 50%, transparent) !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true']
  [data-slot='tool-block'][data-file-edit][data-tool-open]
  > div:first-child {
  padding-left: 12px !important;
  padding-right: 12px !important;
  border-bottom-color: color-mix(in srgb, var(--codex-color-border-subtle) 50%, transparent) !important;
}

html[data-codex-chat-look='true']
  [data-slot='tool-block'][data-file-edit][data-tool-open]
  [data-slot='file-diff-panel'] {
  background: transparent !important;
  color: var(--codex-color-text-secondary) !important;
  font-size: 12px !important;
  line-height: 18px !important;
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}

html[data-codex-chat-look='true']
  [data-slot='tool-block'][data-file-edit][data-tool-open]
  [data-slot='file-diff-panel'] span[class*='border-l-2'] {
  border-left-width: 0 !important;
  line-height: 18px !important;
  padding: 0 12px !important;
}

html[data-codex-chat-look='true']
  [data-slot='tool-block'][data-file-edit][data-tool-open]
  [data-slot='file-diff-panel'] span[class*='border-(--ui-diff-add-border)'] {
  background: var(--codex-diff-add-surface) !important;
  border-left-width: 0 !important;
  color: var(--codex-color-text-secondary) !important;
}

html[data-codex-chat-look='true']
  [data-slot='tool-block'][data-file-edit][data-tool-open]
  [data-slot='file-diff-panel'] span[class*='border-(--ui-diff-remove-border)'] {
  background: var(--codex-diff-remove-surface) !important;
  border-left-width: 0 !important;
  color: var(--codex-color-text-secondary) !important;
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

/* Remove Hermes' outer composer wash; the Codex surface already owns its fill. */
html[data-codex-chat-look='true']
  [data-slot='composer-root']
  > .pointer-events-none.absolute.inset-0 {
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-fade'] {
  --codex-playback-edge-gap: 12px;
  padding: 11px 7px 7px !important;
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
  row-gap: 0 !important;
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
  font-weight: 400 !important;
  scrollbar-width: thin !important;
  scrollbar-color: color-mix(in srgb, var(--codex-color-text) 22%, transparent) transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-fade'] > [data-slot='composer-attachments'] {
  padding: 0 4px !important;
  margin-bottom: 4px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-fade'] > div:last-child > div:has(> [data-slot='composer-rich-input']),
html[data-codex-chat-look='true'] [data-slot='composer-fade'] > div:last-child > div:has(> div > [data-slot='composer-rich-input']) {
  padding-inline: 4px !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-fade'] > div:last-child > div:has(button > .codicon-add) {
  translate: none !important;
  transform: none !important;
  align-self: center !important;
}

/* Twelve text lines before scrolling; sent-message editing stays native. */
html[data-codex-chat-look='true'] [data-slot='composer-surface'] [data-slot='composer-rich-input'] {
  min-height: 50px !important;
  max-height: 240px !important;
  padding-top: 2px !important;
  color: var(--codex-color-text) !important;
}

/* Match the sampled placeholder with 24% foreground mixed into the fill;
   entered text remains at the sampled full foreground intensity. */
html[data-codex-chat-look='true'][data-hermes-theme='codex-chat'][data-hermes-mode='dark'] [data-slot='composer-surface'] [data-slot='composer-rich-input']:is(:empty, [data-empty])::before {
  color: color-mix(in srgb, var(--codex-color-text) 24%, var(--codex-color-card)) !important;
}

@supports (animation-timeline: scroll(self block)) {
  @keyframes codex-composer-scroll-edge {
    from { mask-image: linear-gradient(to bottom, black, black); }
    to { mask-image: linear-gradient(to bottom, transparent, black 16px); }
  }
  html[data-codex-chat-look='true'] [data-slot='composer-surface'] [data-slot='composer-rich-input'][data-codex-composer-overflow] {
    animation: codex-composer-scroll-edge 1s steps(1, end) both;
    animation-timeline: scroll(self block);
    animation-range: 0px 1px;
  }
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

/* Odd-length, unrotated strokes keep the small plus visually symmetric.
   Match the native send/stop circle's foreground, not the theme accent.
   Retain the native menu button and handler. */
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:has(> .codicon-add) {
  position: relative;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  color: var(--dt-foreground, var(--codex-color-text)) !important;
}
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button > .codicon-add {
  visibility: hidden;
}
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:has(> .codicon-add)::before,
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:has(> .codicon-add)::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 13px;
  height: 1.5px;
  border-radius: 1px;
  background: currentColor;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button:has(> .codicon-add)::after {
  width: 1.5px;
  height: 13px;
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

/* The slash completion drawer keeps Hermes' native groups, rows, icons and
   typography. Codex Skin owns only the reference frame and scrollbar paint. */
html[data-codex-chat-look='true'] [data-slot='composer-completion-drawer'] {
  right: 5px !important;
  left: 5px !important;
  width: auto !important;
  max-width: none !important;
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

html[data-codex-chat-look='true'] [data-slot='composer-completion-drawer']::-webkit-scrollbar {
  width: 8px !important;
  height: 8px !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-completion-drawer']::-webkit-scrollbar-track {
  margin-block: 8px !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-completion-drawer']::-webkit-scrollbar-corner {
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-completion-drawer']::-webkit-scrollbar-button {
  display: none !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-completion-drawer']::-webkit-scrollbar-thumb {
  min-height: 24px !important;
  border: 2px solid transparent !important;
  border-radius: 999px !important;
  background: color-mix(in srgb, var(--codex-color-text) 22%, transparent) !important;
  background-clip: padding-box !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-completion-drawer']::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--codex-color-text) 36%, transparent) !important;
  background-clip: padding-box !important;
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

/* Session-control notices keep their native alert, text, icon and dismiss
   handler. Only the direct error row gets a Codex card; nested validation
   errors and notifications outside the composer retain their native style. */
html[data-codex-chat-look='true'] [data-slot='composer-status-stack']
  [data-slot='status-stack-section'] > [role='alert']:has(> div > .codicon-error) {
  min-width: 0 !important;
  margin: 8px !important;
  padding: 8px 10px !important;
  gap: 10px !important;
  align-items: flex-start !important;
  border: 1px solid color-mix(in srgb, var(--codex-color-destructive) 18%, var(--codex-color-border-subtle)) !important;
  border-radius: 12px !important;
  background: var(--codex-color-card) !important;
  color: var(--codex-color-text) !important;
  font-size: 12px !important;
  line-height: 20px !important;
}
html[data-codex-chat-look='true'] [data-slot='composer-status-stack']
  [data-slot='status-stack-section'] > [role='alert']:has(> div > .codicon-error) > div {
  flex: 1 !important;
  min-width: 0 !important;
  align-items: flex-start !important;
  gap: 8px !important;
  white-space: normal !important;
  overflow: visible !important;
}
html[data-codex-chat-look='true'] [data-slot='composer-status-stack']
  [data-slot='status-stack-section'] > [role='alert']:has(> div > .codicon-error) > div > span {
  min-width: 0 !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  overflow: visible !important;
  text-overflow: clip !important;
}
html[data-codex-chat-look='true'] [data-slot='composer-status-stack']
  [data-slot='status-stack-section'] > [role='alert'] > div > .codicon-error {
  color: var(--codex-color-destructive) !important;
}
html[data-codex-chat-look='true'] [data-slot='composer-status-stack']
  [data-slot='status-stack-section'] > [role='alert']:has(> div > .codicon-error) > button {
  border-radius: 999px !important;
  color: var(--codex-color-text-secondary) !important;
}
html[data-codex-chat-look='true'] [data-slot='composer-status-stack']
  [data-slot='status-stack-section'] > [role='alert']:has(> div > .codicon-error) > button:hover {
  background: var(--codex-color-hover) !important;
}

/* Current Hermes separates frame, scroll owner and content. Paint the content,
   clip at the frame's radius, and retain the native scroll owner's constraints. */
html[data-codex-chat-look='true'] [data-slot='composer-status-stack'] > div:has(> [data-slot='status-stack-scroll']) {
  margin: 0 26px !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 20px 20px 0 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}

html[data-codex-chat-look='true'] [data-slot='status-stack-scroll'] {
  scrollbar-width: thin !important;
  scrollbar-color: transparent transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='status-stack-scroll']:hover {
  scrollbar-color: color-mix(in srgb, var(--codex-color-text) 22%, transparent) transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-status-stack'][data-codex-has-task-section='true'] [data-slot='status-stack-scroll'] {
  display: flex !important;
  min-height: 0 !important;
  flex-direction: column !important;
  overflow: hidden !important;
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

/* Artifact rows are single-line. Center the native grid's dismiss/icon/text
   within our taller compact row, without changing multiline status rows. */
html[data-codex-chat-look='true'] [data-codex-status-card='true'] .status-artifacts > [data-slot='status-row'] {
  align-items: center !important;
}

/* Queue actions center on the complete row, including attachment/editing
   metadata. Leave other status rows and leading dismiss/icons first-line aligned. */
html[data-codex-chat-look='true'] [data-slot='composer-status-stack']
  [data-slot='status-row']:has(> .status-row-icon > .codicon-comment) > .status-row-actions {
  align-self: center !important;
}
html[data-codex-chat-look='true'] [data-slot='composer-status-stack']
  [data-slot='status-row']:has(> .status-row-icon > .codicon-comment) > .status-row-actions > button {
  margin-top: 0 !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_intro'] [aria-label='HERMES AGENT'] {
  color: var(--codex-color-text) !important;
  mix-blend-mode: normal !important;
}

/* Shared pane tabs and browser chrome; controls and guest documents stay owned
   by Hermes. Exact sampled colors apply only to the Codex dark palette. */
html[data-codex-chat-look='true'] {
  --codex-browser-background: var(--ui-editor-surface-background);
  --codex-browser-tab: var(--ui-row-active-background);
  --codex-browser-address: var(--ui-control-background, var(--codex-color-card));
  --codex-browser-border: var(--ui-stroke-secondary);
  --codex-browser-divider: var(--ui-stroke-tertiary);
}

/* Native control reservations sit beside the tabstrip in its parent header. */
html[data-codex-chat-look='true'] [data-titlebar-cluster][data-codex-titlebar-aligned] {
  top: calc(var(--titlebar-controls-top, 5px) + var(--codex-titlebar-offset, 0px)) !important;
}


html[data-codex-chat-look='true'] [data-window-top] > [data-panel-header],
html[data-codex-chat-look='true'] [data-tree-group] > [data-panel-header]:has([data-zone-tabstrip]) {
  height: 48px !important;
  min-height: 48px !important;
}

/* Keep a single band even when the host chooses a second row. Its measured
   control gutters still reserve the buttons; overflowing tabs scroll natively. */
html[data-codex-chat-look='true'] [data-window-top] > [data-panel-header] [data-zone-tabstrip][class~='absolute'] {
  top: 0 !important;
  bottom: auto !important;
  left: var(--panel-titlebar-left, 0px) !important;
  right: var(--panel-titlebar-right, 0px) !important;
  -webkit-app-region: drag !important;
}

html[data-codex-chat-look='true'] [data-window-top] > [data-panel-header] > [data-window-drag-handle] {
  height: 48px !important;
}

/* A sibling drag rectangle must not overlap explicit no-drag tabs. Keep the
   native handle in the strip's top padding; pointer-events alone is not a
   boundary for Electron's native window dragging. */
html[data-codex-chat-look='true'] [data-window-top] > [data-panel-header]:has([data-zone-tabstrip]) > [data-window-drag-handle] {
  position: absolute !important;
  inset: 0 0 auto !important;
  height: 10px !important;
  pointer-events: none;
}

/* Page controls start at the shell's actual titlebar padding (currently 0px
   plus 0.5rem), not Electron's 34px constant. Keep the native drag rectangle
   above their hit areas; a cached hidden page must not shorten the chat band. */
html[data-codex-chat-look='true'] [data-tree-group='grp-main'][data-window-top]:has([data-tour='page-tabs']:not([data-pane-hidden] *)) > [data-panel-header]:not(:has([data-zone-tabstrip])) > [data-window-drag-handle] {
  height: min(48px, calc(var(--titlebar-height, 0px) + 0.5rem)) !important;
}

html[data-codex-chat-look='true'] [data-tree-group]:not([data-tree-group='grp-sessions']) > [data-panel-header]:has([data-zone-tabstrip]) {
  background: var(--codex-browser-background) !important;
}

html[data-codex-chat-look='true'] [data-tree-group]:not([data-tree-group='grp-sessions']) [data-zone-tabstrip] {
  --pane-tab-active-accent: transparent;
  --pane-tab-active-bg: var(--codex-browser-tab);
  height: 48px !important;
  min-height: 48px !important;
  box-sizing: border-box !important;
  padding: 10px 8px !important;
  gap: 4px !important;
  border: 0 !important;
  background: var(--codex-browser-background) !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] [data-tree-group]:not([data-tree-group='grp-sessions']) [data-zone-tabstrip] > [role='tablist'] {
  align-items: center !important;
  gap: 4px !important;
}

html[data-codex-chat-look='true'] [data-tree-group]:not([data-tree-group='grp-sessions']) [data-zone-tabstrip] [role='tab'] {
  --tab-bg: var(--codex-browser-background);
  --tab-face: var(--codex-browser-background);
  height: 28px !important;
  min-height: 28px !important;
  border-radius: 10px !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: hidden !important;
}

html[data-codex-chat-look='true'] [data-tree-group]:not([data-tree-group='grp-sessions']) [data-zone-tabstrip] [role='tab']:is([aria-selected='true'], [data-active='true']) {
  --tab-bg: var(--codex-browser-tab);
  --tab-face: var(--codex-browser-tab);
  background: var(--codex-browser-tab) !important;
  color: var(--ui-text-primary) !important;
}

/* Only PaneTabLabel text: preserve glyphs, dirty dots and close controls. */
html[data-codex-chat-look='true'] [data-tree-group]:not([data-tree-group='grp-sessions']) [data-zone-tabstrip] [role='tab'] > :is(span, button) > span.truncate,
html[data-codex-chat-look='true'] [data-tree-group]:not([data-tree-group='grp-sessions']) [data-zone-tabstrip] [role='tab'] > .pane-tab-content > :is(span, button) > span.truncate {
  font-size: 12px !important;
  font-weight: 400 !important;
  text-transform: none !important;
  letter-spacing: normal !important;
}

/* Keep the close control readable without a dark runway or button block. */
html[data-codex-chat-look='true']
  [data-tree-group]:not([data-tree-group='grp-sessions'])
  [data-zone-tabstrip]
  [role='tab']
  > span:last-child:has(> button[aria-label])
  > [aria-hidden],
html[data-codex-chat-look='true']
  [data-tree-group]:not([data-tree-group='grp-sessions'])
  [data-zone-tabstrip]
  [role='tab']
  > span:last-child:has(> button[aria-label])
  > button[aria-label] {
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
}

/* The skin's 28px pill reserves a real title-free close area. Keep native
   close handlers and hover visibility; only its geometry and paint change. */
html[data-codex-chat-look='true']
  [data-tree-group]:not([data-tree-group='grp-sessions'])
  [data-zone-tabstrip]
  [data-slot='pane-tab'][data-closeable]:not([data-vertical='true'])
  > .pane-tab-content {
  padding-inline-end: 28px !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}

html[data-codex-chat-look='true']
  [data-tree-group]:not([data-tree-group='grp-sessions'])
  [data-zone-tabstrip]
  [data-slot='pane-tab'][data-closeable]:not([data-vertical='true'])
  > span:last-child:has(> button[aria-label]) {
  inset: 4px 4px 4px auto !important;
  align-items: center !important;
}

html[data-codex-chat-look='true']
  [data-tree-group]:not([data-tree-group='grp-sessions'])
  [data-zone-tabstrip]
  [data-slot='pane-tab'][data-closeable]:not([data-vertical='true'])
  > span:last-child:has(> button[aria-label])
  > button[aria-label] {
  width: 20px !important;
  height: 20px !important;
  padding: 0 !important;
  border-radius: 50% !important;
  background: color-mix(in srgb, var(--codex-color-text, var(--ui-text-primary)) 10%, transparent) !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] {
  background: var(--codex-browser-background) !important;
}

/* Width responds to the pane, not the whole window. Keep every native action
   reachable when a split narrows: wrap instead of clipping the address. */
html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) {
  height: auto !important;
  min-height: 40px !important;
  flex: 0 0 auto !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  box-sizing: border-box !important;
  padding: 5px 8px 6px !important;
  gap: 4px !important;
  border: 0 !important;
  border-bottom: 1px solid var(--codex-browser-divider) !important;
  border-radius: 0 !important;
  background: var(--codex-browser-background) !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > div:has(> input[data-slot='input']) {
  min-width: 80px !important;
  flex: 1 1 80px !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) input[data-slot='input'] {
  width: 100% !important;
  height: 28px !important;
  min-height: 28px !important;
  box-sizing: border-box !important;
  border-radius: 10px !important;
  border-width: 1px !important;
  border-style: solid !important;
  background: var(--codex-browser-address) !important;
  color: var(--ui-text-primary) !important;
  padding-left: 10px !important;
  padding-right: 28px !important;
  font-size: 12px !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] input[data-slot='input']:not([aria-invalid='true']) {
  border-color: var(--codex-browser-border) !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] input[data-slot='input']:focus-visible {
  outline: 1px solid var(--ui-text-tertiary) !important;
  outline-offset: 1px !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) button {
  width: 24px !important;
  min-width: 24px !important;
  height: 24px !important;
  min-height: 24px !important;
  flex-shrink: 0 !important;
  border-radius: 7px !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button:not([aria-pressed='true']) {
  background: transparent !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button:is(:hover, :focus-visible):not(:disabled),
html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button[aria-pressed='true'] {
  background: var(--ui-row-hover-background) !important;
  color: var(--ui-text-primary) !important;
}

/* Shared tabs retain the screenshot's 28px pills and 10px vertical margins.
   Keep the browser navigation row compact without changing native actions. */
html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) {
  min-height: 39px !important;
  padding: 5px 10px !important;
  gap: 5px !important;
}

/* Paint the reference hairlines without narrowing native resize hit targets. */
html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div > [role='separator'][class~='inset-y-0'] {
  --codex-split-scale: .25;
  --codex-split-color: var(--codex-sidebar-divider, var(--ui-stroke-secondary));
}
html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group] aside[data-preview-browser]) > [role='separator'][class~='inset-y-0'] {
  --codex-split-scale: .5;
  --codex-split-color: var(--codex-browser-divider);
}
html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div > [role='separator'][class~='inset-y-0'] > span:first-child,
html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group] aside[data-preview-browser]) > [role='separator'][class~='inset-y-0'] > span:first-child {
  width: 1px !important;
  left: 1px !important;
  transform: scaleX(var(--codex-split-scale)) !important;
  transform-origin: left center !important;
  opacity: 1 !important;
  background: var(--codex-split-color) !important;
}
html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group='grp-sessions']):not([style*='display: none'])
  + div > [role='separator'][class~='inset-y-0'] > span:nth-child(2),
html[data-codex-chat-look='true'] [data-tree-split]
  > div:has(> [data-tree-group] aside[data-preview-browser]) > [role='separator'][class~='inset-y-0'] > span:nth-child(2) {
  opacity: 0 !important;
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

function decorateComposerChrome() {
  const surface = document.querySelector('[data-slot="composer-surface"]')
  const dock = document.querySelector('[data-slot="composer-dock"]') || surface?.closest('[data-slot="composer-root"]')
  if (!surface || !dock) return

  // Decorate every mounted composer independently, including split chat panes.
  for (const statusDock of document.querySelectorAll('[data-slot="composer-dock"], [data-slot="composer-root"]')) {
    // Native drawers may wrap the stack; keep discovery owned by this composer.
    const nativeStatusStack = [...statusDock.querySelectorAll('[data-slot="composer-status-stack"]')]
      .find(stack => stack.closest('[data-slot="composer-dock"], [data-slot="composer-root"]') === statusDock)
      || (statusDock.matches('[data-slot="composer-root"]')
        ? statusDock.querySelector(':scope > div.absolute.inset-x-0.bottom-full')
        : [...statusDock.children].find(element => {
            const className = typeof element.className === 'string' ? element.className : ''
            return className.includes('max-h-') && className.includes('overflow-y-auto')
          }))
    const statusStack = nativeStatusStack || [...statusDock.querySelectorAll('div')].find(element => {
      const className = typeof element.className === 'string' ? element.className : ''
      return className.includes('bottom-full') && className.includes('absolute') && element.getBoundingClientRect().width > 300
    })
    if (!statusStack) continue
    const statusCard = statusStack.querySelector('[data-slot="status-stack-content"]') || statusStack.firstElementChild
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

function readCleanTranscriptMode() {
  try {
    const mode = pluginStorage?.get(CLEAN_TRANSCRIPT_STORAGE_KEY, 'off')
    return mode === 'on' ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

function syncCleanTranscriptRoot() {
  const mode = readCleanTranscriptMode()
  document.documentElement.setAttribute('data-codex-clean-transcript', mode)
  return mode
}

function setCleanTranscriptMode(mode) {
  const normalized = mode === 'on' ? 'on' : 'off'
  pluginStorage?.set(CLEAN_TRANSCRIPT_STORAGE_KEY, normalized)
  syncCleanTranscriptRoot()
  window.dispatchEvent(new window.Event(CLEAN_TRANSCRIPT_EVENT))
}

function clearCleanTranscriptDecorations(scope = document) {
  const pairs = scope?.matches?.('[data-slot="aui_turn-pair"]')
    ? [scope]
    : [...(scope?.querySelectorAll?.('[data-slot="aui_turn-pair"]') || [])]

  for (const pair of pairs) {
    pair.removeAttribute('data-codex-clean-settled')
    for (const element of pair.querySelectorAll('[data-codex-clean-interim], [data-codex-clean-interim-part]')) {
      element.removeAttribute('data-codex-clean-interim')
      element.removeAttribute('data-codex-clean-interim-part')
    }
  }
}

function cleanPairActive(pair) {
  return Boolean(
    pair.querySelector(
      '[data-role="assistant"][data-streaming="true"], '
      + '[role="status"], '
      + '[data-slot="tool-approval-inline"], '
      + '[data-slot="clarify-inline"], '
      + '[data-slot="mcp-setup-inline"]'
    )
  )
}

function cleanRootHasMeaningfulContent(root) {
  const content = root.querySelector('[data-slot="aui_assistant-message-content"]')
  if ((content?.textContent || '').trim()) return true
  if ((root.textContent || '').trim()) return true

  return Boolean(
    root.querySelector(
      '[data-slot="tool-block"], '
      + '[data-slot="aui_thinking-disclosure"], '
      + '[data-slot="aui_generated-image"], '
      + '[data-slot="aui_artifact-card"], '
      + '[data-slot="aui_changed-files"], '
      + '[data-slot="clarify-inline"], '
      + '[data-slot="mcp-setup-inline"], '
      + '[role="alert"]'
    )
  )
}

function cleanRootMustStayVisible(root) {
  return Boolean(
    root.querySelector(
      '[data-slot="aui_generated-image"], '
      + '[data-slot="aui_artifact-card"], '
      + '[data-slot="clarify-inline"], '
      + '[data-slot="mcp-setup-inline"], '
      + '[data-slot="tool-approval-inline"], '
      + '[role="alert"]'
    )
  )
}

function cleanPartMustStayVisible(part) {
  return Boolean(
    part.querySelector(
      '[data-slot="aui_generated-image"], '
      + '[data-slot="aui_artifact-card"], '
      + '[data-slot="aui_markdown-alert"], '
      + '[data-slot="aui_zoomable-image"], '
      + '[role="alert"], img, audio, video'
    )
  )
}

function reconcileCleanTranscript(pair) {
  clearCleanTranscriptDecorations(pair)
  if (document.documentElement.getAttribute('data-codex-clean-transcript') !== 'on') return
  if (cleanPairActive(pair)) return

  const roots = [...pair.querySelectorAll('[data-role="assistant"][data-slot="aui_assistant-message-root"]')]
    .filter(root => root.closest('[data-slot="aui_turn-pair"]') === pair)
  const finalIndex = roots.findLastIndex(root => Boolean(root.querySelector('[data-slot="aui_msg-actions"]')))
  if (finalIndex < 0) return

  /* An empty trailing shell is a harmless renderer remnant. Any actual content
     after the identified final is uncertain, so keep the whole turn visible. */
  if (roots.slice(finalIndex + 1).some(cleanRootHasMeaningfulContent)) return

  pair.setAttribute('data-codex-clean-settled', 'true')
  for (const root of roots.slice(0, finalIndex)) {
    if (!cleanRootMustStayVisible(root)) root.setAttribute('data-codex-clean-interim', 'true')
  }

  /* Hydrated history folds the live turn's separate assistant bubbles into one
     message containing several markdown parts. Keep the last text part as the
     final answer and hide earlier commentary plus its timestamp. */
  const finalRoot = roots[finalIndex]
  const content = finalRoot.querySelector(':scope > [data-slot="aui_assistant-message-content"]')
  const markdownParts = [...(content?.children || [])].filter(element => element.matches('.aui-md'))
  for (const part of markdownParts.slice(0, -1)) {
    if (cleanPartMustStayVisible(part)) continue
    part.setAttribute('data-codex-clean-interim-part', 'true')
    const timestamp = part.previousElementSibling
    if (timestamp?.matches?.('[data-slot="timeline-timestamp"]')) {
      timestamp.setAttribute('data-codex-clean-interim-part', 'true')
    }
  }
}

function collectNestedTurnPairs(node) {
  if (!(node instanceof Element)) return []
  if (node.matches('[data-slot="sidebar"]') || node.closest?.('[data-slot="sidebar"]')) return []
  if (node.matches('[data-slot="aui_turn-pair"]')) return [node]

  const pairs = []
  const descendants = [...node.children]
  for (let index = 0; index < descendants.length; index += 1) {
    const current = descendants[index]
    if (current.matches('[data-slot="aui_turn-pair"]')) {
      pairs.push(current)
      continue
    }
    descendants.push(...current.children)
  }
  return pairs
}

function isCleanPartMutationNode(node) {
  if (!(node instanceof Element)) return false
  const selector = '.aui-md, [data-slot="aui_assistant-message-content"]'
  return node.matches(selector) || Boolean(node.firstElementChild && node.querySelector(selector))
}

function isTurnPairMutationRoot(node) {
  if (!(node instanceof Element)) return false
  if (node.matches('[data-slot="sidebar"]') || node.closest?.('[data-slot="sidebar"]')) return false
  if (node.matches('[data-session-anchor], [data-slot="aui_turn-pair"], [data-slot="aui_thread-content"]')) return true

  const insideTranscript = node.closest?.('[data-session-anchor], [data-slot="aui_thread-content"]')
  return Boolean(insideTranscript && node.firstElementChild && node.querySelector('[data-slot="aui_turn-pair"]'))
}

// Keep preview markup inert: copy only text and a small formatting vocabulary,
// never message attributes, links, media, event handlers or tool-card controls.
function historyPreviewFragment(source) {
  const fragment = document.createDocumentFragment()
  let remaining = 600
  let visited = 0
  const copy = (node, parent) => {
    if (remaining <= 0 || ++visited > 160) return
    if (node.nodeType === 3) {
      const text = (node.nodeValue || '').slice(0, remaining)
      remaining -= text.length
      parent.appendChild(document.createTextNode(text))
      return
    }
    if (!(node instanceof Element) || node.matches('script, style, button, svg, img, video, audio, iframe, [aria-hidden="true"]')) return
    const tag = node.tagName.toLowerCase()
    const destination = ['p', 'strong', 'b', 'em', 'i', 'code', 'br'].includes(tag) ? document.createElement(tag) : parent
    if (destination !== parent) parent.appendChild(destination)
    for (const child of node.childNodes) copy(child, destination)
  }
  for (const child of source.childNodes) copy(child, fragment)
  if (!remaining) fragment.appendChild(document.createTextNode('…'))
  return fragment
}

function historyPromptPreview(text) {
  const collapsed = String(text || '').replace(/\s+/g, ' ').trim()
  return collapsed.length > 120 ? `${collapsed.slice(0, 119).trimEnd()}…` : collapsed
}

function historyTranscriptEntries(messages) {
  const entries = []
  let turn = null
  for (const message of messages || []) {
    if (typeof message?.text !== 'string') continue
    if (message.display_kind && message.display_kind !== 'skill_invocation') continue
    const text = message.text.trim()
    if (message.role === 'user') {
      if (!text || /^\[IMPORTANT: Background process [\s\S]*\]$/.test(text)) continue
      turn = { question: text, answer: '' }
      entries.push(turn)
    } else if (message.role === 'assistant' && turn && text) {
      turn.answer = text.slice(0, 600)
    }
  }
  return entries
}

function historyPlainFragment(text) {
  const fragment = document.createDocumentFragment()
  for (const paragraph of text.slice(0, 600).split(/\n\s*\n/).slice(0, 5)) {
    const p = document.createElement('p')
    // Tiny, inert emphasis support for RPC excerpts; no HTML/Markdown engine.
    for (const token of paragraph.split(/(\*\*[^*]+\*\*)/g)) {
      const node = document.createElement(token.startsWith('**') && token.endsWith('**') ? 'strong' : 'span')
      node.textContent = node.tagName === 'STRONG' ? token.slice(2, -2) : token
      p.appendChild(node)
    }
    fragment.appendChild(p)
  }
  return fragment
}

function installHistoryRailRuntime() {
  const selector = '[data-slot="thread-timeline"]'
  const rails = new Map()
  let serial = 0
  const mount = root => {
    if (rails.has(root)) return
    const surface = root.closest('[data-session-anchor]')
    const strip = root.querySelector('[data-slot="thread-timeline-ticks"]')
    if (!surface || !strip) return
    const card = document.createElement('div')
    card.setAttribute('data-codex-history-preview', '')
    card.setAttribute('data-suppress-pane-reveal', '')
    card.setAttribute('role', 'tooltip')
    card.id = `codex-history-preview-${++serial}`
    card.hidden = true
    const question = document.createElement('div')
    question.setAttribute('data-codex-history-question', '')
    const answer = document.createElement('div')
    answer.setAttribute('data-codex-history-answer', '')
    card.append(question, answer)
    surface.appendChild(card)
    root.setAttribute('data-codex-history-rail', '')
    let buttons = []
    let hovered = null
    let previousDescription = null
    let closeTimer = 0
    let revision = 0
    let historyCache = null
    let labels = ''
    let waveFrame = 0
    let waveY = 0
    let waveGeometry = null
    const cancelClose = () => window.clearTimeout(closeTimer)
    const queueWave = y => {
      waveY = y
      if (waveFrame) return
      waveFrame = window.requestAnimationFrame(() => {
        waveFrame = 0
        if (!hovered || !buttons.length) return
        // All hit targets have the same fixed height. Read the track geometry
        // before any writes; changing a line's width never moves its neighbors.
        if (!waveGeometry) {
          const first = buttons[0].getBoundingClientRect()
          if (!first.height) return
          const pitch = buttons.length > 1 ? buttons[1].getBoundingClientRect().top - first.top : first.height
          waveGeometry = { top: first.top, height: first.height, pitch }
        }
        const { top, height, pitch } = waveGeometry
        const radius = Math.max(height, pitch) * 3.2
        buttons.forEach((tick, index) => {
          const distance = Math.abs(top + height / 2 + index * pitch - waveY)
          const phase = Math.min(1, distance / radius)
          const width = 6 + 10 * (1 + Math.cos(Math.PI * phase))
          tick.style.setProperty('--codex-history-tick-width', `${width}px`)
        })
      })
    }
    const close = (resetWave = true) => {
      revision += 1
      waveGeometry = null
      cancelClose()
      window.cancelAnimationFrame(waveFrame)
      waveFrame = 0
      if (hovered) {
        if (previousDescription === null) hovered.removeAttribute('aria-describedby')
        else hovered.setAttribute('aria-describedby', previousDescription)
      }
      hovered = null
      card.hidden = true
      question.textContent = ''
      answer.replaceChildren()
      root.removeAttribute('data-codex-history-open')
      for (const button of buttons) {
        if (resetWave !== false) button.style.removeProperty('--codex-history-tick-width')
        button.removeAttribute('data-codex-history-hover')
      }
    }
    const refresh = () => {
      const next = [...strip.querySelectorAll('.thread-timeline-tick')]
        .filter(button => button.closest('[data-slot="thread-timeline-ticks"]') === strip)
      const nextLabels = JSON.stringify(next.map(button => button.getAttribute('aria-label')))
      if (nextLabels !== labels || next.length !== buttons.length || next.some((b, i) => b !== buttons[i])) {
        waveGeometry = null
        close()
      }
      labels = nextLabels
      buttons = next
      if (!waveGeometry && buttons.length) {
        const first = buttons[0].getBoundingClientRect()
        if (first.height) {
          const pitch = buttons.length > 1 ? buttons[1].getBoundingClientRect().top - first.top : first.height
          waveGeometry = { top: first.top, height: first.height, pitch }
        }
      }
    }
    const position = () => {
      if (!hovered || card.hidden) return
      const boundary = surface.getBoundingClientRect()
      const tick = hovered.getBoundingClientRect()
      const edge = root.getBoundingClientRect().left - boundary.left + 36
      card.style.left = `${edge}px`
      card.style.width = `${Math.max(0, Math.min(320, boundary.width - edge - 8))}px`
      card.style.maxHeight = `${Math.max(0, boundary.height - 16)}px`
      const height = card.getBoundingClientRect().height
      card.style.top = `${Math.max(8, Math.min(boundary.height - height - 8, tick.top + tick.height / 2 - boundary.top - height / 2))}px`
    }
    const fillUnloaded = (button, index) => {
      // The SDK's active runtime belongs to the primary workspace, not a tile's
      // stored ID. Never send a tile's identifier to this runtime-only RPC.
      if (surface.getAttribute('data-session-anchor') !== 'workspace' || typeof host.request !== 'function') return
      const sessionId = currentRuntimeSessionId()
      if (!sessionId) return
      const scope = JSON.stringify([sessionId, currentProfileScope(), routedStoredSessionId(), labels])
      const expectedRevision = revision
      if (!historyCache || historyCache.scope !== scope || Date.now() - historyCache.time > 20000) {
        historyCache = { scope, time: Date.now(), promise: Promise.resolve().then(() => host.request('session.history', { session_id: sessionId })).then(result => historyTranscriptEntries(result?.messages)) }
      }
      historyCache.promise.then(entries => {
        if (revision !== expectedRevision || hovered !== button || !root.isConnected || card.hidden) return
        if (JSON.stringify([currentRuntimeSessionId(), currentProfileScope(), routedStoredSessionId(), labels]) !== scope) return
        // Optimistic/filtered UI turns may differ from stored history. Require
        // the entire index to match before resolving even a duplicated prompt.
        if (entries.length !== buttons.length || entries.some((entry, i) => historyPromptPreview(entry.question) !== buttons[i].getAttribute('aria-label'))) return
        const entry = entries[index]
        question.textContent = entry.question
        answer.replaceChildren(historyPlainFragment(entry.answer))
        answer.hidden = !entry.answer
        position()
      }).catch(() => { /* Keep the native question preview on missing history. */ })
    }
    const show = (button, pointerY = null) => {
      cancelClose()
      if (button === hovered) {
        if (pointerY !== null) queueWave(pointerY)
        return
      }
      for (const [otherRoot, state] of rails) state.close(otherRoot !== root)
      refresh()
      const index = buttons.indexOf(button)
      if (index < 0) return
      hovered = button
      previousDescription = button.getAttribute('aria-describedby')
      button.setAttribute('aria-describedby', [previousDescription, card.id].filter(Boolean).join(' '))
      root.setAttribute('data-codex-history-open', '')
      buttons.forEach((tick, i) => {
        tick.toggleAttribute('data-codex-history-hover', i === index)
      })
      const rect = button.getBoundingClientRect()
      queueWave(pointerY ?? rect.top + rect.height / 2)
      question.textContent = button.getAttribute('aria-label') || ''
      answer.replaceChildren()
      // Virtualized content is a suffix of the same native prompt index. Verify
      // the entire suffix before pairing; never match duplicate text globally.
      const viewport = surface.querySelector('[data-slot="aui_thread-viewport"]')
      const users = [...(viewport?.querySelectorAll('[data-slot="aui_user-message-root"]') || [])]
        .map(user => ({ user, text: user.querySelector('[data-slot="aui_user-message-text"]')?.textContent || '' }))
        .filter(row => row.text.trim() && !/^\[IMPORTANT: Background process [\s\S]*\]$/.test(row.text.trim()))
      const offset = buttons.length - users.length
      const aligned = offset >= 0 && users.every((row, i) => historyPromptPreview(row.text) === buttons[offset + i].getAttribute('aria-label'))
      const row = aligned && users[index - offset]
      const pair = row?.user?.closest('[data-slot="aui_turn-pair"]')
      if (pair) {
        question.textContent = row.text
        const roots = [...pair.querySelectorAll('[data-role="assistant"][data-slot="aui_assistant-message-root"]')]
          .filter(root => root.closest('[data-slot="aui_turn-pair"]') === pair)
        const final = roots.findLast(node => node.querySelector('[data-slot="aui_msg-actions"]')) || roots.at(-1)
        const parts = final?.querySelectorAll('[data-slot="aui_assistant-message-content"] > .aui-md')
        const text = parts?.[parts.length - 1]
        if (text) answer.appendChild(historyPreviewFragment(text))
      }
      answer.hidden = !answer.textContent.trim()
      card.hidden = false
      position()
      if (!pair) fillUnloaded(button, index)
    }
    const onOver = event => {
      // Stop only native hover expansion. Click/keyboard navigation remains on
      // the original buttons and never goes through reconstructed message IDs.
      event.stopPropagation()
      const button = event.target.closest?.('button')
      if (buttons.includes(button)) show(button, event.clientY)
    }
    const onMove = event => {
      // Tip's asChild trigger handles pointermove at React's root. Suppress
      // only native hover here; clicks and keyboard navigation still bubble.
      event.stopPropagation()
      if (hovered && strip.contains(event.target)) queueWave(event.clientY)
    }
    const onOut = event => {
      event.stopPropagation()
      if (root.contains(event.relatedTarget) || card.contains(event.relatedTarget)) return
      cancelClose()
      closeTimer = window.setTimeout(close, 120)
    }
    const onFocus = event => { if (buttons.includes(event.target)) show(event.target) }
    const onKey = event => { if (event.key === 'Escape') { close(); event.stopPropagation() } }
    root.addEventListener('mouseover', onOver, true)
    root.addEventListener('pointermove', onMove, { passive: true })
    root.addEventListener('mouseout', onOut, true)
    root.addEventListener('focusin', onFocus)
    root.addEventListener('focusout', onOut)
    root.addEventListener('keydown', onKey)
    const onScroll = () => { waveGeometry = null; close() }
    strip.addEventListener('scroll', onScroll, { passive: true })
    card.addEventListener('mouseover', cancelClose)
    card.addEventListener('mouseout', onOut)
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
      root.style.setProperty('--codex-history-rail-height', `${Math.max(10, entries[0].contentRect.height - 32)}px`)
      waveGeometry = null
      close()
    }) : null
    resize?.observe(surface)
    const cleanup = () => {
      close()
      historyCache = null
      resize?.disconnect()
      root.removeEventListener('mouseover', onOver, true)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('mouseout', onOut, true)
      root.removeEventListener('focusin', onFocus)
      root.removeEventListener('focusout', onOut)
      root.removeEventListener('keydown', onKey)
      strip.removeEventListener('scroll', onScroll)
      root.removeAttribute('data-codex-history-rail')
      root.style.removeProperty('--codex-history-rail-height')
      card.remove()
    }
    rails.set(root, { close, cleanup, refresh, surface, invalidate: () => { close(); historyCache = null } })
    refresh()
  }
  const scan = node => {
    if (!(node instanceof Element)) return
    if (node.matches(selector)) mount(node)
    if (node.firstElementChild) node.querySelectorAll(selector).forEach(mount)
  }
  document.querySelectorAll(selector).forEach(mount)
  const closeAll = () => { for (const state of rails.values()) state.close() }
  window.addEventListener('resize', closeAll)
  window.addEventListener('hashchange', closeAll)
  const invalidateAll = () => { for (const state of rails.values()) state.invalidate() }
  const subscriptions = ['activeSessionId', 'profile', 'gateway']
    .map(key => host.state[key]?.subscribe?.(invalidateAll))
    .filter(unsubscribe => typeof unsubscribe === 'function')
  return {
    observe(records) {
      for (const record of records) {
        const root = record.target.closest?.(selector)
        if (record.type === 'childList') for (const node of record.addedNodes) scan(node)
        if (root) { mount(root); rails.get(root)?.refresh() }
      }
      for (const [root, state] of rails) {
        if (!root.isConnected || root.closest('[data-session-anchor]') !== state.surface) {
          state.cleanup(); rails.delete(root)
        }
      }
    },
    cleanup() {
      window.removeEventListener('resize', closeAll)
      window.removeEventListener('hashchange', closeAll)
      subscriptions.forEach(unsubscribe => unsubscribe())
      for (const state of rails.values()) state.cleanup()
      rails.clear()
    }
  }
}

function installComposerOverflowRuntime() {
  const selector = '[data-slot="composer-surface"] [data-slot="composer-rich-input"]'
  const attribute = 'data-codex-composer-overflow'
  const editors = new Set()
  // Chromium can retain a forwards-filled scroll animation when its timeline
  // becomes inactive. Remove the animation itself once the editor fits again.
  // Auto-height editors resize at the overflow boundary; no per-key layout read.
  const sync = editor => {
    const overflowing = editor.clientHeight > 0 && editor.scrollHeight > editor.clientHeight
    if (editor.hasAttribute(attribute) !== overflowing) editor.toggleAttribute(attribute, overflowing)
  }
  const observer = new window.ResizeObserver(entries => {
    for (const { target } of entries) if (editors.has(target)) sync(target)
  })
  return {
    refresh() {
      for (const editor of editors) {
        if (editor.isConnected && editor.matches(selector)) continue
        observer.unobserve(editor)
        editor.removeAttribute(attribute)
        editors.delete(editor)
      }
      for (const editor of document.querySelectorAll(selector)) {
        if (editors.has(editor)) continue
        editors.add(editor)
        sync(editor)
        observer.observe(editor)
      }
    },
    cleanup() {
      observer.disconnect()
      for (const editor of editors) editor.removeAttribute(attribute)
      editors.clear()
    }
  }
}

function installBehaviorRuntime(afterFinalCleanup = null) {
  const pendingHandoff = window[RUNTIME_HANDOFF_KEY]
  if (pendingHandoff?.timer) window.clearTimeout(pendingHandoff.timer)
  if (pendingHandoff) delete window[RUNTIME_HANDOFF_KEY]

  const historyRail = installHistoryRailRuntime()
  const composerOverflow = installComposerOverflowRuntime()
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
    else if (node.matches('[data-session-anchor], [data-slot="aui_thread-content"]')) {
      historicalPairScanPending = true
    } else {
      for (const pair of collectNestedTurnPairs(node)) markPair(pair)
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
      reconcileCleanTranscript(pair)
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
      composerOverflow.refresh()
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
    '[data-role="assistant"][data-slot="aui_assistant-message-root"]',
    '[data-role="system"][data-slot="aui_system-message-root"]',
    '[data-slot="aui_turn-pair"]',
    '[data-slot="aui_msg-actions"]',
    '[data-slot="tool-block"]',
    '[data-slot="aui_thinking-disclosure"]',
    '[data-slot="aui_changed-files"]',
    '[data-slot="aui_generated-image"]',
    '[data-slot="clarify-inline"]',
    '[data-slot="mcp-setup-inline"]',
    '[data-slot="tool-approval-inline"]',
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
    historyRail.observe(records)
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
        } else if (
          (record.attributeName === 'role' && target?.matches?.('[role="status"]'))
          || (record.attributeName === 'data-streaming' && target?.matches?.('[data-role="assistant"]'))
        ) {
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
      const cleanPartChanged = changedElements.some(isCleanPartMutationNode)

      if (pair && (target?.closest?.('[data-role="user"]') || signalChanged || cleanPartChanged)) {
        markPair(pair)
        relevant = true
      }
      if (signalChanged || cleanPartChanged) relevant = true
      if (target?.closest?.('[data-slot="composer-dock"], [data-slot="composer-root"]')) {
        composerDirty = true
        relevant = true
      }

      for (const node of changedElements) {
        if (node.matches('[data-slot="sidebar"]') || node.closest?.('[data-slot="sidebar"]')) continue
        if (isTurnPairMutationRoot(node)) {
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
    attributeFilter: ['aria-label', 'role', 'data-clamped', 'data-streaming']
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
  const onCleanTranscriptChange = () => reconcileSession()
  window.addEventListener('resize', onResize)
  window.addEventListener('hashchange', onHashChange)
  window.addEventListener(CLEAN_TRANSCRIPT_EVENT, onCleanTranscriptChange)
  reconcileSession()

  const cleanup = () => {
    destroyed = true
    if (animationFrame) window.cancelAnimationFrame(animationFrame)
    animationFrame = 0
    scheduled = false
    observer.disconnect()
    historyRail.cleanup()
    composerOverflow.cleanup()
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
    window.removeEventListener(CLEAN_TRANSCRIPT_EVENT, onCleanTranscriptChange)

    offProfileState?.()
    offGatewayState?.()
    offActiveSession?.()
    offSessionInfo?.()

    const handoff = { timer: 0 }
    handoff.timer = window.setTimeout(() => {
      if (window[RUNTIME_HANDOFF_KEY] !== handoff) return
      for (const user of document.querySelectorAll('[data-slot="aui_user-message-root"]')) clearLongUserDecoration(user)
      clearCleanTranscriptDecorations()
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

function installTitlebarAlignment() {
  const observed = new Set(), marked = new Set()
  const selector = '[data-titlebar-cluster], [data-window-top], [data-panel-header]'
  let frame = 0, disposed = false
  const clear = element => {
    element.style.removeProperty('--codex-titlebar-offset')
    element.removeAttribute('data-codex-titlebar-aligned')
    marked.delete(element)
  }
  const sync = () => {
    frame = 0
    if (disposed) return
    const clusters = [...document.querySelectorAll('[data-titlebar-cluster]')]
    const headers = [...document.querySelectorAll('[data-window-top] > [data-panel-header]')]
    const current = new Set([...clusters, ...headers])
    for (const element of observed) if (!current.has(element)) { resize.unobserve(element); observed.delete(element) }
    for (const element of current) if (!observed.has(element)) { resize.observe(element); observed.add(element) }
    for (const element of marked) if (!clusters.includes(element)) clear(element)
    for (const cluster of clusters) {
      const box = cluster.getBoundingClientRect(), x = box.left + box.width / 2
      const header = headers.find(element => {
        const r = element.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && getComputedStyle(element).visibility !== 'hidden'
      })
      // Visible top-edge headers always use the same band, including empty
      // and cramped strips. Routes without a panel header remain native.
      if (document.documentElement.dataset.codexChatLook !== 'true' || !box.width || !box.height || !header) { clear(cluster); continue }
      const band = header.getBoundingClientRect(), scale = box.height / cluster.offsetHeight
      const previous = parseFloat(cluster.style.getPropertyValue('--codex-titlebar-offset')) || 0
      const next = Math.round((previous + (band.top + band.height / 2 - box.top - box.height / 2) / scale) * 100) / 100
      if (Math.abs(next) < .02) { clear(cluster); continue }
      if (Math.abs(next - previous) > .02 || !marked.has(cluster)) {
        cluster.style.setProperty('--codex-titlebar-offset', `${next}px`)
        cluster.setAttribute('data-codex-titlebar-aligned', '')
        marked.add(cluster)
      }
    }
  }
  const schedule = () => { if (!disposed && !frame) frame = window.requestAnimationFrame(sync) }
  const resize = new ResizeObserver(schedule)
  const relevant = node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector))
  const mutations = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' || record.target.closest?.('[data-panel-header]') || [...record.addedNodes, ...record.removedNodes].some(relevant))) schedule()
  })
  mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-window-top'] })
  window.addEventListener('resize', schedule)
  sync()
  return () => {
    disposed = true
    window.cancelAnimationFrame(frame)
    resize.disconnect(); mutations.disconnect()
    window.removeEventListener('resize', schedule)
    for (const element of marked) clear(element)
  }
}

function installChatStyleRuntime() {
  const root = document.documentElement
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = CSS + BROWSER_PALETTE_CSS + UPDATE_CSS
  style.dataset.codexChatLookBuild = BUILD_ID
  root.dataset.codexChatLook = 'true'
  root.dataset.codexChatLookBuild = BUILD_ID
  syncComposerWidthRoot()
  syncPinnedUserMessagesRoot()
  syncCleanTranscriptRoot()
  const uninstallTitlebarAlignment = installTitlebarAlignment()
  const uninstallBehavior = installBehaviorRuntime(() => {
    style?.remove()
    delete root.dataset.codexChatLook
    root.removeAttribute('data-codex-composer-width')
    root.removeAttribute('data-codex-pinned-user-messages')
    root.removeAttribute('data-codex-clean-transcript')
    if (root.dataset.codexChatLookBuild === BUILD_ID) delete root.dataset.codexChatLookBuild
    if (root.dataset.codexChatLookRuntime === BUILD_ID) delete root.dataset.codexChatLookRuntime
  })
  root.dataset.codexChatLookRuntime = BUILD_ID
  console.info(`[codex-chat-look] activated ${BUILD_ID}`, JSON.stringify({
    panelHeaders: document.querySelectorAll('[data-window-top] > [data-panel-header]').length,
    browserBars: document.querySelectorAll('aside[data-preview-browser] input[data-slot="input"]').length,
    cornerTargets: document.querySelectorAll('[data-tree-split] > div:has(> [data-tree-group="grp-sessions"]):not([style*="display: none"]) + div > [data-tree-group="grp-main"]').length
  }))
  return () => {
    uninstallTitlebarAlignment()
    uninstallBehavior()
  }
}

export default {
  id: ID,
  name: 'Codex Skin',
  register(ctx) {
    pluginStorage = ctx.storage
    const updater = createSkinUpdater(ctx.storage)
    const inbox = globalThis.document?.body ? installCodexInboxRuntime({ storage: ctx.storage, host }) : null
    startCodexInboxObserver(ctx, inbox)
    startCodexInboxMenuOpenObserver(ctx, inbox)
    // The controller belongs to the plugin, not to a route-mounted UI slot.
    ctx.onDispose(() => updater.dispose())
    ctx.onDispose(() => inbox?.dispose())
    ctx.onDispose(connectCodexInboxEvents(inbox))
    let uninstallStyle
    let disposed = false
    ctx.onDispose(() => {
      disposed = true
      uninstallStyle?.()
    })
    // Let host contribution removals settle before taking over a hot-reloaded
    // style node. Styles then outlive route slots and never claim page chrome.
    if (globalThis.document?.body) queueMicrotask(() => {
      if (!disposed) uninstallStyle = installChatStyleRuntime()
    })
    ctx.register({ id: 'update-runtime', area: 'composer.leading', order: 19, render: () => jsx(CodexUpdateRuntime, { updater }) })
    ctx.register({ id: 'update-button', area: 'composer.leading', order: 20, render: () => jsx(CodexUpdateButton, { updater }) })
    ctx.register({ id: 'inbox-settled-badge', area: 'sessionRow.trailing', data: { render: ({ sessionId }) => jsx(CodexSettledBadge, { sessionId, inbox }) } })
    ctx.register({ id: 'inbox-open-intent', area: 'sessionRow.leading', data: { render: ({ sessionId }) => jsx(CodexInboxNativeOpenIntent, { sessionId, inbox }) } })

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
      id: 'toggle-clean-transcript',
      area: PALETTE_AREA,
      data: {
        id: 'codex-chat-look.toggle-clean-transcript',
        label: 'Codex Skin: Clean transcript',
        detail: () => (readCleanTranscriptMode() === 'on' ? 'On' : 'Off'),
        detailVariant: 'state',
        keepOpen: true,
        keywords: ['codex', 'skin', 'clean', 'transcript', 'tool', 'calls', 'interim', 'messages'],
        run: () => setCleanTranscriptMode(readCleanTranscriptMode() === 'on' ? 'off' : 'on')
      }
    })
    ctx.register({
      id: 'toggle-inbox',
      area: PALETTE_AREA,
      data: {
        id: 'codex-chat-look.toggle-inbox',
        label: 'Codex Skin: Inbox',
        detail: () => readCodexInboxMode() === 'on' ? 'On' : 'Off',
        detailVariant: 'state',
        keepOpen: true,
        keywords: ['codex', 'skin', 'inbox', 'settle', 'threads', 'sessions'],
        run: () => setCodexInboxMode(readCodexInboxMode() === 'on' ? 'off' : 'on', inbox)
      }
    })
  }
}

// BEGIN GENERATED UPDATE RUNTIME
// Bundled into the standalone plugin. The private feed is used only by test builds.
const UPDATE_REPO = BUILD_ID.includes('-test.') ? 'FPSUnleashed/hermes-codex-skin-dev' : 'FPSUnleashed/hermes-codex-skin'
const UPDATE_IS_TEST = BUILD_ID.includes('-test.')
const UPDATE_INTERVAL_MS = 60 * 60 * 1000
const UPDATE_PENDING_KEY = 'update-pending'
const UPDATE_CACHE_KEY = `update-cache:${UPDATE_REPO}`
const UPDATE_MAX_BYTES = 1_000_000
const UPDATE_CSS = `
[data-codex-update-anchor]{display:inline-flex;align-items:center;height:28px;position:relative}
.codex-update-button{box-sizing:border-box;position:relative;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:#0285ff;color:#fff;scale:.9;cursor:pointer;outline:none;transition:background 160ms,box-shadow 160ms;flex:none}
.codex-update-button:hover{box-shadow:0 0 0 3px rgb(2 133 255 / .12)}
.codex-update-button:focus-visible{outline:1px solid #0285ff;outline-offset:4px}
.codex-update-button svg{display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.codex-update-button .codex-update-icon{width:16px;height:16px;pointer-events:none}
.codex-update-button .codex-update-ring{position:absolute;inset:-3px;width:34px;height:34px;transform:rotate(-90deg);color:#0285ff;pointer-events:none}
.codex-update-ring circle{stroke-dasharray:113.1;stroke-dashoffset:113.1;transition:stroke-dashoffset 100ms linear}
.codex-update-button[data-phase=downloading] .codex-update-icon{animation:codex-update-download 800ms ease-in-out infinite}
.codex-update-button[data-phase=applying] .codex-update-icon,.codex-update-button[data-phase=awaiting-reload] .codex-update-icon{animation:codex-update-breathe 550ms ease-in-out infinite}
.codex-update-button:is([data-phase=done],[data-phase=vanishing]){background:#00a854;color:#fff;box-shadow:none;cursor:default}
.codex-update-button[data-phase=done]{animation:codex-update-bounce 650ms 350ms ease-in-out both}
.codex-update-button[data-phase=done] .codex-update-check{stroke-dasharray:24;stroke-dashoffset:24;animation:codex-update-draw 300ms 100ms ease forwards}
.codex-update-button[data-phase=vanishing]{animation:codex-update-exit 280ms cubic-bezier(.4,0,.65,1) both;pointer-events:none}
.codex-update-button[data-phase=error]{background:var(--ui-text-primary,#222)}
.codex-update-panel{box-sizing:border-box;position:fixed;z-index:10000;overflow:auto;overscroll-behavior:contain;width:320px;max-height:320px;padding:0 18px;border:1px solid var(--ui-stroke-secondary,#e5e5e5);border-radius:14px;background:var(--codex-color-card,var(--ui-editor-surface-background,#fff));color:var(--ui-text-primary,#171717);box-shadow:0 12px 36px #00000014,0 2px 6px #00000008;font:12px/1.65 -apple-system,system-ui,sans-serif;scrollbar-width:thin;scrollbar-color:var(--ui-stroke-secondary,#ccc) transparent}
.codex-update-panel[hidden]{display:none!important}
.codex-update-hover-bridge{position:fixed;z-index:10000;background:transparent}
.codex-update-hover-bridge[hidden]{display:none!important}
.codex-update-release{padding:16px 0;border-bottom:1px solid var(--ui-stroke-secondary,#e5e5e5)}
.codex-update-release:last-child{border:0}
.codex-update-release header{display:flex;align-items:center;gap:8px;margin-bottom:9px;font-size:11px}
.codex-update-release time{margin-left:auto;color:var(--ui-text-tertiary,#737373);font-size:10px}
.codex-update-release h3,.codex-update-release h4{font-size:12px;line-height:1.5;font-weight:600;margin:8px 0 4px}
.codex-update-release p{margin:5px 0;color:var(--ui-text-secondary,#666);overflow-wrap:anywhere;white-space:pre-wrap}
.codex-update-release ul{margin:5px 0;padding-left:16px;color:var(--ui-text-secondary,#666)}
.codex-update-release li{margin:3px 0;overflow-wrap:anywhere}
.codex-update-release figure{margin:10px 0}
.codex-update-release img{display:block;width:auto;height:auto;max-width:100%;max-height:180px;margin-inline:auto;object-fit:contain;border-radius:8px}
.codex-update-image-fallback{color:var(--ui-text-tertiary,#737373);font-size:11px}
.codex-update-tag{border-radius:99px;padding:1px 6px;background:var(--ui-row-hover-background,#f3f3f3);font-size:9px}
.codex-update-error{padding:16px 0;white-space:pre-wrap;color:var(--ui-text-primary,#171717)}
@keyframes codex-update-download{0%,100%{transform:translateY(-1px)}50%{transform:translateY(2px)}}
@keyframes codex-update-breathe{50%{opacity:.3}}
@keyframes codex-update-draw{to{stroke-dashoffset:0}}
@keyframes codex-update-bounce{0%,100%{transform:translateY(0) scale(1)}25%{transform:translateY(-3px) scale(1.12)}48%{transform:translateY(0) scale(.96)}70%{transform:translateY(-1.5px) scale(1.06)}86%{transform:translateY(0) scale(.99)}}
@keyframes codex-update-exit{from{transform:scale(1);opacity:1}to{transform:scale(0);opacity:0}}
@media(prefers-reduced-motion:reduce){.codex-update-button,.codex-update-button *{animation:none!important;transition:none!important}.codex-update-check{stroke-dashoffset:0!important}}
`

function updateVersionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-test\.(\d+))?$/.exec(String(value))
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? Infinity : Number(match[4])] : null
}
function compareUpdateVersions(left, right) {
  const a = updateVersionParts(left), b = updateVersionParts(right)
  if (!a || !b) return null
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  return 0
}
async function updateSha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('')
}
function updateSourceIdentity(source) {
  return { id: /^const ID = ['"]([^'"]+)['"]/m.exec(source)?.[1], version: /^const BUILD_ID = ['"]([^'"]+)['"]/m.exec(source)?.[1] }
}
function normalizeUpdateRoot(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid local plugin folder.')
  const path = value.replace(/\\/g, '/').replace(/\/$/, '')
  if (!/^(?:\/|[A-Za-z]:\/)/.test(path) || !path.endsWith('/desktop-plugins') || path.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid local plugin folder.')
  return path
}
function updateAssetFor(release, repo = UPDATE_REPO) {
  if (!release || release.draft || (!UPDATE_IS_TEST && release.prerelease) || !updateVersionParts(release.tag_name)) return null
  const asset = release.assets?.find(item => item.name === 'plugin.js')
  if (!asset || !Number.isSafeInteger(asset.id) || asset.url !== `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`) return null
  if (!/^sha256:[a-f0-9]{64}$/.test(asset.digest || '') || asset.size <= 0 || asset.size > UPDATE_MAX_BYTES) return null
  return asset
}
function updateImageURL(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const path = url.pathname.toLowerCase(), repo = '/fpsunleashed/hermes-codex-skin/'
    const allowed = (url.hostname === 'github.com' && (path.startsWith(repo + 'releases/download/') || path.startsWith('/user-attachments/assets/')))
      || (url.hostname === 'raw.githubusercontent.com' && path.startsWith(repo))
      || url.hostname === 'user-images.githubusercontent.com'
    return allowed ? url.href : null
  } catch { return null }
}
function decodeUpdateImageText(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, name) => {
    if (name[0] !== '#') return named[name.toLowerCase()]
    const point = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : Number(name.slice(1))
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\ufffd'
  })
}
function appendUpdateImage(parent, source, alt) {
  const url = updateImageURL(decodeUpdateImageText(source))
  const fallback = document.createElement('p')
  fallback.className = 'codex-update-image-fallback'
  fallback.textContent = decodeUpdateImageText(alt) || 'Image unavailable'
  if (!url) { parent.appendChild(fallback); return }
  const frame = document.createElement('figure'), image = document.createElement('img')
  image.alt = decodeUpdateImageText(alt)
  // GitHub release redirects support image display, not CORS pixel access.
  // No fetch/token bridge is used; keep the image's referrer empty.
  image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'
  image.dataset.updateImageSrc = url
  image.addEventListener('error', () => frame.replaceWith(fallback), { once: true })
  frame.appendChild(image); parent.appendChild(frame)
}
function activateUpdateImages(parent) {
  for (const image of parent.querySelectorAll('img[data-update-image-src]')) {
    const source = image.dataset.updateImageSrc
    delete image.dataset.updateImageSrc
    image.src = source
  }
}
function appendUpdateNotes(parent, raw) {
  // Parse only image tokens. No release HTML, attributes or event handlers enter
  // the DOM; the remainder continues to use plain text nodes.
  let list = null
  const appendText = line => {
    const text = line.trim().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
    if (!text) { list = null; return }
    const bullet = /^[-*] (.+)/.exec(text)
    if (bullet) {
      if (!list) { list = document.createElement('ul'); parent.appendChild(list) }
      const item = document.createElement('li'); item.textContent = bullet[1]; list.appendChild(item)
    } else {
      list = null
      const heading = /^#{1,6}\s+(.+)/.exec(text)
      const node = document.createElement(heading ? 'h4' : 'p'); node.textContent = heading ? heading[1] : text; parent.appendChild(node)
    }
  }
  const tokens = /!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)|<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*\/?>/gi
  for (const line of String(raw || '').split('\n')) {
    let cursor = 0
    for (const match of line.matchAll(tokens)) {
      const before = line.slice(cursor, match.index)
      if (!/^\s*[-*]\s*$/.test(before)) appendText(before)
      if (match[0].startsWith('![')) appendUpdateImage(parent, match[2].replace(/^<|>$/g, ''), match[1])
      else {
        const attributes = new Map()
        for (const field of match[0].slice(4, -1).matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
          const name = field[1].toLowerCase()
          if (!attributes.has(name)) attributes.set(name, field[2] ?? field[3] ?? field[4] ?? '')
        }
        appendUpdateImage(parent, attributes.get('src'), attributes.get('alt'))
      }
      list = null; cursor = match.index + match[0].length
    }
    appendText(line.slice(cursor))
  }
}

function createSkinUpdater(storage, native = globalThis.window?.hermesDesktop, request = (...args) => fetch(...args)) {
  const views = new Set(), abort = new AbortController(), timers = new Set()
  const capable = ['desktopPluginsRoot', 'readPluginSource', 'writeTextFile'].every(name => typeof native?.[name] === 'function')
  const state = { phase: 'idle', releases: [], target: null, progress: 0, error: '', page: 1, hasMore: false }
  let initPromise, root, token = '', disposed = false, loadingMore = false, reportChain = Promise.resolve()
  let operation = null, proof = {}
  const cache = storage?.get?.(UPDATE_CACHE_KEY, null)
  const schedule = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!disposed) fn() }, ms); timers.add(id); return id }
  const pause = ms => new Promise(resolve => schedule(resolve, ms))
  const active = () => ['downloading', 'applying', 'awaiting-reload', 'done', 'vanishing'].includes(state.phase)
  function report(extra = {}) {
    if (!UPDATE_IS_TEST || !root || disposed) return
    proof = { ...proof, ...extra }
    const payload = { ...proof, runningVersion: BUILD_ID, phase: state.phase, repository: UPDATE_REPO, targetVersion: state.target?.tag_name || null, activeBuild: document.documentElement.dataset.codexChatLookBuild || null, at: new Date().toISOString() }
    reportChain = reportChain.then(() => disposed ? undefined : native.writeTextFile(`${root}/${ID}/update-test-report.json`, JSON.stringify(payload, null, 2))).catch(() => {})
  }
  function paint() { if (!disposed) for (const view of views) view.paint() }
  function phase(value, error = '') { if (disposed) return; state.phase = value; state.error = error; paint(); report() }
  async function readSource(path) {
    const result = await native.readPluginSource(path)
    if (result.truncated || typeof result.text !== 'string') throw new Error('The local plugin could not be read completely.')
    return result.text
  }
  async function restorePrevious(pending) {
    if (!pending || pending.repository !== UPDATE_REPO || !/^[a-f0-9]{64}$/.test(pending.fromDigest || '')) throw new Error('The rollback receipt is missing.')
    const previous = await readSource(`${root}/${ID}/update-rollback.js`)
    if (await updateSha256(new TextEncoder().encode(previous)) !== pending.fromDigest || updateSourceIdentity(previous).version !== pending.fromVersion) throw new Error('The rollback copy could not be verified.')
    await native.writeTextFile(`${root}/${ID}/plugin.js`, previous)
    if (await readSource(`${root}/${ID}/plugin.js`) !== previous) throw new Error('The restored file could not be verified.')
    storage.remove(UPDATE_PENDING_KEY)
  }
  function recoverPending(pending) {
    phase('awaiting-reload')
    schedule(async () => {
      const current = storage.get(UPDATE_PENDING_KEY, null)
      if (!current || current.startedAt !== pending.startedAt || current.digest !== pending.digest) return
      try { await restorePrevious(current); phase('error', 'The interrupted update was rolled back. Click to retry.') }
      catch { phase('error', 'The update is incomplete. Its recovery receipt and rollback copy were retained.') }
    }, Math.max(0, 10000 - (Date.now() - pending.startedAt)))
  }
  async function initialize() {
    if (!capable) throw new Error('This Hermes Desktop version does not support local plugin updates.')
    if (!initPromise) initPromise = (async () => {
      root = normalizeUpdateRoot(await native.desktopPluginsRoot())
      if (UPDATE_IS_TEST) {
        const access = JSON.parse(await readSource(`${root}/${ID}/update-test-access.json`))
        if (access.repository !== UPDATE_REPO || typeof access.token !== 'string' || !access.token) throw new Error('Private update access is not configured on this computer.')
        token = access.token
      }
      const pending = storage.get(UPDATE_PENDING_KEY, null)
      if (pending?.targetVersion === BUILD_ID && pending.repository === UPDATE_REPO) {
        const installed = await readSource(`${root}/${ID}/plugin.js`)
        const hash = await updateSha256(new TextEncoder().encode(installed))
        if (hash !== pending.digest || updateSourceIdentity(installed).version !== BUILD_ID) { recoverPending(pending); return }
        storage.remove(UPDATE_PENDING_KEY)
        storage.set('last-update', { version: BUILD_ID, digest: hash, verifiedAt: Date.now() })
        phase('done')
        report({ hotReloadVerified: true, installedDigest: hash, fromVersion: pending.fromVersion })
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) schedule(() => phase('idle'), 700)
      } else if (pending?.repository === UPDATE_REPO && Number.isFinite(pending.startedAt)) recoverPending(pending)
      else report({ localAccessVerified: true })
    })()
    return initPromise
  }
  async function github(path, accept = 'application/vnd.github+json') {
    await initialize()
    const allowed = `https://api.github.com/repos/${UPDATE_REPO}/releases`
    if (!(path === allowed || path.startsWith(allowed + '?') || path.startsWith(allowed + '/assets/'))) throw new Error('Unexpected update source.')
    const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await request(path, { headers, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]) })
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub is temporarily limiting requests. Try again later.' : `GitHub request failed (${response.status}).`)
    return response
  }
  async function loadPage(page) {
    const response = await github(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=10&page=${page}`)
    const data = await response.json()
    if (!Array.isArray(data)) throw new Error('GitHub returned an invalid release list.')
    return data
  }
  async function firstPage() {
    const releases = await loadPage(1)
    const entry = { releases, checkedAt: Date.now() }
    storage.set(UPDATE_CACHE_KEY, entry)
    return entry
  }
  function accept(entry) {
    if (!entry || disposed) return
    state.releases = entry.releases.filter(release => !release.draft && (UPDATE_IS_TEST || !release.prerelease))
    state.page = 1; state.hasMore = entry.releases.length === 10
    state.target = state.releases.filter(release => updateAssetFor(release) && compareUpdateVersions(release.tag_name, BUILD_ID) === 1).sort((a, b) => -compareUpdateVersions(a.tag_name, b.tag_name))[0] || null
    if (!active() && state.phase !== 'error') phase(state.target ? 'available' : 'idle')
    else paint()
    report({ checkedAt: entry.checkedAt })
  }
  async function more() {
    if (disposed || loadingMore || !state.hasMore) return
    loadingMore = true
    try {
      const releases = await loadPage(state.page + 1)
      const seen = new Set(state.releases.map(release => release.id))
      state.releases = [...state.releases, ...releases.filter(release => !seen.has(release.id) && !release.draft && (UPDATE_IS_TEST || !release.prerelease))]
      state.page++; state.hasMore = releases.length === 10; paint()
    } catch { /* Existing notes remain usable; another scroll can retry. */ }
    finally { loadingMore = false }
  }
  async function download(asset) {
    const response = await github(asset.url, 'application/octet-stream')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('A bounded streaming download is not available in this Hermes version.')
    if (Number(response.headers?.get('content-length')) > UPDATE_MAX_BYTES) { await reader.cancel(); throw new Error('The update file is too large.') }
    let bytes
    {
      const chunks = []; let total = 0
      while (true) {
        const result = await reader.read()
        if (result.done) break
        total += result.value.length
        if (total > UPDATE_MAX_BYTES) { await reader.cancel(); throw new Error('The update file is too large.') }
        chunks.push(result.value); state.progress = Math.min(total / asset.size, 1); paint()
      }
      bytes = new Uint8Array(total); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    }
    if (bytes.length !== asset.size || bytes.length > UPDATE_MAX_BYTES) throw new Error('The update download is incomplete.')
    if (await updateSha256(bytes) !== asset.digest.slice(7)) throw new Error('The update file failed its integrity check.')
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  async function install() {
    if (operation || !state.target || !['available', 'error'].includes(state.phase)) return
    const target = state.target, asset = updateAssetFor(target)
    if (!asset) return
    const run = { touched: false, previous: '', path: '', cancelled: false }; operation = run
    try {
      phase('downloading'); state.progress = 0
      const source = await download(asset)
      const identity = updateSourceIdentity(source)
      if (identity.id !== ID || identity.version !== target.tag_name) throw new Error('The download is not the expected Codex Skin release.')
      state.progress = 1; paint(); await pause(40)
      if (disposed) return
      phase('applying')
      run.path = `${root}/${ID}/plugin.js`
      run.previous = await readSource(run.path)
      if (updateSourceIdentity(run.previous).version !== BUILD_ID) throw new Error('The local skin changed. Reload it before updating.')
      await native.writeTextFile(`${root}/${ID}/update-rollback.js`, run.previous)
      if (await readSource(`${root}/${ID}/update-rollback.js`) !== run.previous) throw new Error('The rollback copy could not be verified.')
      await native.writeTextFile(`${root}/${ID}/update-staged.js`, source)
      if (await readSource(`${root}/${ID}/update-staged.js`) !== source) throw new Error('The staged update could not be verified.')
      storage.set(UPDATE_PENDING_KEY, { repository: UPDATE_REPO, fromVersion: BUILD_ID, fromDigest: await updateSha256(new TextEncoder().encode(run.previous)), targetVersion: target.tag_name, digest: asset.digest.slice(7), startedAt: Date.now() })
      await pause(40)
      run.touched = true
      await native.writeTextFile(run.path, source)
      if (await readSource(run.path) !== source) throw new Error('The installed update could not be verified.')
      if (disposed) return
      phase('awaiting-reload')
      schedule(async () => {
        if (disposed || state.phase !== 'awaiting-reload') return
        try { await restorePrevious(storage.get(UPDATE_PENDING_KEY, null)); phase('error', 'Hermes did not reload the update. The previous file was restored.') }
        catch { phase('error', 'Hermes did not reload the update. Its recovery receipt and rollback copy were retained.') }
        operation = null
      }, 10000)
    } catch (error) {
      if (disposed) return
      let message = error.message || 'The update could not be installed.'
      if (run.touched && run.previous) {
        try { await restorePrevious(storage.get(UPDATE_PENDING_KEY, null)) }
        catch { message += ' Restoration could not be verified; the recovery receipt and rollback copy were retained.' }
      } else storage.remove(UPDATE_PENDING_KEY)
      operation = null; phase('error', message + '\nClick the update button to retry.')
    }
  }
  function mount(anchor) {
    const button = document.createElement('button'), panel = document.createElement('section'), bridge = document.createElement('div')
    button.className = 'codex-update-button'; button.type = 'button'; button.dataset.codexUpdate = 'true'
    panel.className = 'codex-update-panel'; panel.hidden = true; panel.tabIndex = 0; panel.setAttribute('aria-label', 'Codex Skin releases')
    bridge.className = 'codex-update-hover-bridge'; bridge.hidden = true; bridge.setAttribute('aria-hidden', 'true')
    anchor.dataset.codexUpdateAnchor = 'true'; anchor.appendChild(button); document.body.append(bridge, panel)
    let closedTimer, previousPhase, previousReleases, previousError, open = false
    const position = () => {
      if (!open) return
      const rect = button.getBoundingClientRect(), width = Math.min(320, innerWidth - 24)
      panel.style.width = `${width}px`; panel.style.maxHeight = `${Math.max(80, Math.min(320, rect.top - 24))}px`
      panel.style.left = `${Math.max(12, Math.min(rect.left - 32, innerWidth - width - 12))}px`
      panel.style.top = `${Math.max(12, rect.top - panel.getBoundingClientRect().height - 12)}px`
      const popup = panel.getBoundingClientRect()
      Object.assign(bridge.style, { left: `${Math.min(popup.left, rect.left)}px`, top: `${popup.bottom}px`, width: `${Math.max(popup.right, rect.right) - Math.min(popup.left, rect.left)}px`, height: `${Math.max(0, rect.top - popup.bottom + 1)}px` })
    }
    const close = () => { clearTimeout(closedTimer); open = false; panel.hidden = true; bridge.hidden = true; button.setAttribute('aria-expanded', 'false') }
    const show = () => { if (!['available', 'error'].includes(state.phase)) return; clearTimeout(closedTimer); open = true; panel.hidden = false; bridge.hidden = false; button.setAttribute('aria-expanded', 'true'); activateUpdateImages(panel); position() }
    const leave = event => { if ([panel, bridge, button].some(node => node.contains(event.relatedTarget))) return; closedTimer = setTimeout(() => { if (!panel.contains(document.activeElement)) close() }, 180) }
    button.addEventListener('pointerenter', show); button.addEventListener('pointerleave', leave); button.addEventListener('focus', show)
    panel.addEventListener('pointerenter', () => clearTimeout(closedTimer)); panel.addEventListener('pointerleave', leave)
    bridge.addEventListener('pointerenter', () => clearTimeout(closedTimer)); bridge.addEventListener('pointerleave', leave)
    const outside = event => { if (!anchor.contains(event.target) && !panel.contains(event.target) && !bridge.contains(event.target)) close() }
    const key = event => { if (event.key === 'Escape') close() }
    button.addEventListener('pointerdown', event => event.stopPropagation())
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); close(); void install() })
    panel.addEventListener('scroll', () => { if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 40) void more() })
    button.addEventListener('animationend', event => {
      if (event.target !== button) return
      if (event.animationName === 'codex-update-bounce' && state.phase === 'done') phase('vanishing')
      else if (event.animationName === 'codex-update-exit' && state.phase === 'vanishing') phase('idle')
    })
    window.addEventListener('resize', position); document.addEventListener('scroll', position, true); document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key)
    const panelResize = new ResizeObserver(position)
    panelResize.observe(panel)
    const view = { paint() {
      const visible = state.phase !== 'idle'
      anchor.style.display = visible ? 'inline-flex' : 'none'
      button.setAttribute('aria-label', state.phase === 'error' ? 'Retry Codex Skin update' : state.phase === 'done' ? 'Codex Skin is up to date' : 'Update Codex Skin')
      button.setAttribute('aria-busy', String(['downloading', 'applying', 'awaiting-reload'].includes(state.phase)))
      if (!['available', 'error'].includes(state.phase)) close()
      if (previousPhase !== state.phase) {
        previousPhase = state.phase; button.dataset.phase = state.phase
        const path = ['done', 'vanishing'].includes(state.phase) ? '<path class="codex-update-check" d="m5 13 4 4 10-10"/>' : ['applying', 'awaiting-reload'].includes(state.phase) ? '<path d="M19 8a8 8 0 0 0-13-2L3 9m0-5v5h5m-3 7a8 8 0 0 0 13 2l3-3m0 5v-5h-5"/>' : '<path d="M12 3v11m-4-4 4 4 4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>'
        // Only static, authored SVG reaches innerHTML; never release content.
        button.innerHTML = `<svg class="codex-update-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18"/></svg><svg class="codex-update-icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`
      }
      button.querySelector('circle').style.strokeDashoffset = String(state.phase === 'downloading' ? 113.1 * (1 - state.progress) : 113.1)
      if (previousReleases !== state.releases || previousError !== state.error) {
        previousReleases = state.releases; previousError = state.error; const scroll = panel.scrollTop; panel.replaceChildren()
        if (state.error) { const error = document.createElement('p'); error.className = 'codex-update-error'; error.textContent = state.error; panel.appendChild(error) }
        for (const release of state.releases) {
          const article = document.createElement('article'); article.className = 'codex-update-release'
          const header = document.createElement('header'), version = document.createElement('strong'); version.textContent = release.tag_name; header.appendChild(version)
          if (release.tag_name === state.target?.tag_name) { const badge = document.createElement('span'); badge.className = 'codex-update-tag'; badge.textContent = 'Available'; header.appendChild(badge) }
          const date = new Date(release.published_at)
          if (Number.isFinite(date.getTime())) { const time = document.createElement('time'); time.textContent = date.toLocaleDateString('en', { month: 'short', day: 'numeric' }); header.appendChild(time) }
          article.appendChild(header)
          if (release.name && release.name !== release.tag_name) { const title = document.createElement('h3'); title.textContent = release.name; article.appendChild(title) }
          appendUpdateNotes(article, release.body); panel.appendChild(article)
        }
        if (open) activateUpdateImages(panel)
        panel.scrollTop = scroll; position()
      }
    } }
    views.add(view); view.paint()
    return () => { views.delete(view); close(); panelResize.disconnect(); panel.remove(); bridge.remove(); button.remove(); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
  }
  return {
    capable, state, cache, initialize, firstPage, accept, install, mount,
    queryError(error) { report({ checkFailed: true, reason: error?.message || 'Network error' }) },
    dispose() { disposed = true; token = ''; abort.abort(); for (const timer of timers) clearTimeout(timer); timers.clear() }
  }
}

function CodexUpdateRuntime({ updater }) {
  const query = useQuery({
    queryKey: [ID, 'releases', UPDATE_REPO], queryFn: () => updater.firstPage(),
    enabled: updater.capable, staleTime: UPDATE_INTERVAL_MS, refetchInterval: UPDATE_INTERVAL_MS,
    refetchIntervalInBackground: true, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: false,
    initialData: updater.cache || undefined, initialDataUpdatedAt: updater.cache?.checkedAt || 0
  })
  useEffect(() => { void updater.initialize().catch(error => updater.queryError(error)) }, [updater])
  useEffect(() => { if (query.data) updater.accept(query.data) }, [query.data])
  useEffect(() => { if (query.error) updater.queryError(query.error) }, [query.error])
  return null
}
function CodexUpdateButton({ updater }) {
  const ref = useRef(null)
  useEffect(() => ref.current ? updater.mount(ref.current) : undefined, [])
  return jsx('span', { ref, style: { display: 'none' } })
}
// END GENERATED UPDATE RUNTIME
// BEGIN GENERATED INBOX RUNTIME
// Vendored QueryObserver from @tanstack/query-core@5.101.2.
// Upstream: https://github.com/TanStack/query (packages/query-core).
// Generated with esbuild@0.28.1, browser IIFE, es2022, minify, no external imports.
// Regenerate explicitly: node scripts/build-updater.mjs --vendor-observer=/path/to/pinned/node_modules/parent
// Normal builds concatenate this checked-in file and require no npm dependencies.
/*
MIT License

Copyright (c) 2021-present Tanner Linsley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// BEGIN PINNED OBSERVER BUNDLE
var CodexInboxObserverVendor=(()=>{var I=Object.defineProperty;var st=Object.getOwnPropertyDescriptor;var it=Object.getOwnPropertyNames;var nt=Object.prototype.hasOwnProperty;var ot=(t,e)=>{for(var r in e)I(t,r,{get:e[r],enumerable:!0})},at=(t,e,r,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of it(e))!nt.call(t,i)&&i!==r&&I(t,i,{get:()=>e[i],enumerable:!(s=st(e,i))||s.enumerable});return t};var ut=t=>at(I({},"__esModule",{value:!0}),t);var bt={};ot(bt,{QueryObserver:()=>A});var b=class{constructor(){this.listeners=new Set,this.subscribe=this.subscribe.bind(this)}subscribe(t){return this.listeners.add(t),this.onSubscribe(),()=>{this.listeners.delete(t),this.onUnsubscribe()}}hasListeners(){return this.listeners.size>0}onSubscribe(){}onUnsubscribe(){}};var ht=class extends b{#e;#t;#s;constructor(){super(),this.#s=t=>{if(typeof window<"u"&&window.addEventListener){let e=()=>t();return window.addEventListener("visibilitychange",e,!1),()=>{window.removeEventListener("visibilitychange",e)}}}}onSubscribe(){this.#t||this.setEventListener(this.#s)}onUnsubscribe(){this.hasListeners()||(this.#t?.(),this.#t=void 0)}setEventListener(t){this.#s=t,this.#t?.(),this.#t=t(e=>{typeof e=="boolean"?this.setFocused(e):this.onFocus()})}setFocused(t){this.#e!==t&&(this.#e=t,this.onFocus())}onFocus(){let t=this.isFocused();this.listeners.forEach(e=>{e(t)})}isFocused(){return typeof this.#e=="boolean"?this.#e:globalThis.document?.visibilityState!=="hidden"}},_=new ht;var ct={setTimeout:(t,e)=>setTimeout(t,e),clearTimeout:t=>clearTimeout(t),setInterval:(t,e)=>setInterval(t,e),clearInterval:t=>clearInterval(t)},lt=class{#e=ct;#t=!1;setTimeoutProvider(t){this.#e=t}setTimeout(t,e){return this.#e.setTimeout(t,e)}clearTimeout(t){this.#e.clearTimeout(t)}setInterval(t,e){return this.#e.setInterval(t,e)}clearInterval(t){this.#e.clearInterval(t)}},F=new lt;function V(t){setTimeout(t,0)}var $=typeof window>"u"||"Deno"in globalThis;function G(){}function P(t){return typeof t=="number"&&t>=0&&t!==1/0}function W(t,e){return Math.max(t+(e||0)-Date.now(),0)}function g(t,e){return typeof t=="function"?t(e):t}function c(t,e){return typeof t=="function"?t(e):t}var ft=Object.prototype.hasOwnProperty;function J(t,e,r=0){if(t===e)return t;if(r>500)return e;let s=H(t)&&H(e);if(!s&&!(z(t)&&z(e)))return e;let h=(s?t:Object.keys(t)).length,d=s?e:Object.keys(e),n=d.length,u=s?new Array(n):{},v=0;for(let a=0;a<n;a++){let f=s?a:d[a],o=t[f],p=e[f];if(o===p){u[f]=o,(s?a<h:ft.call(t,f))&&v++;continue}if(o===null||p===null||typeof o!="object"||typeof p!="object"){u[f]=p;continue}let S=J(o,p,r+1);u[f]=S,S===o&&v++}return h===n&&v===h?t:u}function E(t,e){if(!e||Object.keys(t).length!==Object.keys(e).length)return!1;for(let r in t)if(t[r]!==e[r])return!1;return!0}function H(t){return Array.isArray(t)&&t.length===Object.keys(t).length}function z(t){if(!B(t))return!1;let e=t.constructor;if(e===void 0)return!0;let r=e.prototype;return!(!B(r)||!r.hasOwnProperty("isPrototypeOf")||Object.getPrototypeOf(t)!==Object.prototype)}function B(t){return Object.prototype.toString.call(t)==="[object Object]"}function Q(t,e,r){return typeof r.structuralSharing=="function"?r.structuralSharing(t,e):r.structuralSharing!==!1?J(t,e):e}var U=(()=>{let t=()=>$;return{isServer(){return t()},setIsServer(e){t=e}}})();function x(){let t,e,r=new Promise((i,h)=>{t=i,e=h});r.status="pending",r.catch(()=>{});function s(i){Object.assign(r,i),delete r.resolve,delete r.reject}return r.resolve=i=>{s({status:"fulfilled",value:i}),t(i)},r.reject=i=>{s({status:"rejected",reason:i}),e(i)},r}var dt=V;function pt(){let t=[],e=0,r=n=>{n()},s=n=>{n()},i=dt,h=n=>{e?t.push(n):i(()=>{r(n)})},d=()=>{let n=t;t=[],n.length&&i(()=>{s(()=>{n.forEach(u=>{r(u)})})})};return{batch:n=>{let u;e++;try{u=n()}finally{e--,e||d()}return u},batchCalls:n=>(...u)=>{h(()=>{n(...u)})},schedule:h,setNotifyFunction:n=>{r=n},setBatchNotifyFunction:n=>{s=n},setScheduler:n=>{i=n}}}var Z=pt();var yt=class extends b{#e=!0;#t;#s;constructor(){super(),this.#s=t=>{if(typeof window<"u"&&window.addEventListener){let e=()=>t(!0),r=()=>t(!1);return window.addEventListener("online",e,!1),window.addEventListener("offline",r,!1),()=>{window.removeEventListener("online",e),window.removeEventListener("offline",r)}}}}onSubscribe(){this.#t||this.setEventListener(this.#s)}onUnsubscribe(){this.hasListeners()||(this.#t?.(),this.#t=void 0)}setEventListener(t){this.#s=t,this.#t?.(),this.#t=t(this.setOnline.bind(this))}setOnline(t){this.#e!==t&&(this.#e=t,this.listeners.forEach(r=>{r(t)}))}isOnline(){return this.#e}},X=new yt;function Y(t){return(t??"online")==="online"?X.isOnline():!0}function tt(t,e){return{fetchFailureCount:0,fetchFailureReason:null,fetchStatus:Y(e.networkMode)?"fetching":"paused",...t===void 0&&{error:null,status:"pending"}}}var A=class extends b{constructor(t,e){super(),this.options=e,this.#e=t,this.#n=null,this.#i=x(),this.bindMethods(),this.setOptions(e)}#e;#t=void 0;#s=void 0;#r=void 0;#a;#l;#i;#n;#y;#f;#d;#u;#h;#o;#p=new Set;bindMethods(){this.refetch=this.refetch.bind(this)}onSubscribe(){this.listeners.size===1&&(this.#t.addObserver(this),et(this.#t,this.options)?this.#c():this.updateResult(),this.#g())}onUnsubscribe(){this.hasListeners()||this.destroy()}shouldFetchOnReconnect(){return k(this.#t,this.options,this.options.refetchOnReconnect)}shouldFetchOnWindowFocus(){return k(this.#t,this.options,this.options.refetchOnWindowFocus)}destroy(){this.listeners=new Set,this.#S(),this.#O(),this.#t.removeObserver(this)}setOptions(t){let e=this.options,r=this.#t;if(this.options=this.#e.defaultQueryOptions(t),this.options.enabled!==void 0&&typeof this.options.enabled!="boolean"&&typeof this.options.enabled!="function"&&typeof c(this.options.enabled,this.#t)!="boolean")throw new Error("Expected enabled to be a boolean or a callback that returns a boolean");this.#F(),this.#t.setOptions(this.options),e._defaulted&&!E(this.options,e)&&this.#e.getQueryCache().notify({type:"observerOptionsUpdated",query:this.#t,observer:this});let s=this.hasListeners();s&&rt(this.#t,r,this.options,e)&&this.#c(),this.updateResult(),s&&(this.#t!==r||c(this.options.enabled,this.#t)!==c(e.enabled,this.#t)||g(this.options.staleTime,this.#t)!==g(e.staleTime,this.#t))&&this.#m();let i=this.#v();s&&(this.#t!==r||c(this.options.enabled,this.#t)!==c(e.enabled,this.#t)||i!==this.#o)&&this.#b(i)}getOptimisticResult(t){let e=this.#e.getQueryCache().build(this.#e,t),r=this.createResult(e,t);return vt(this,r)&&(this.#r=r,this.#l=this.options,this.#a=this.#t.state),r}getCurrentResult(){return this.#r}trackResult(t,e){return new Proxy(t,{get:(r,s)=>(this.trackProp(s),e?.(s),s==="promise"&&(this.trackProp("data"),!this.options.experimental_prefetchInRender&&this.#i.status==="pending"&&this.#i.reject(new Error("experimental_prefetchInRender feature flag is not enabled"))),Reflect.get(r,s))})}trackProp(t){this.#p.add(t)}getCurrentQuery(){return this.#t}refetch({...t}={}){return this.fetch({...t})}fetchOptimistic(t){let e=this.#e.defaultQueryOptions(t),r=this.#e.getQueryCache().build(this.#e,e);return r.fetch().then(()=>this.createResult(r,e))}fetch(t){return this.#c({...t,cancelRefetch:t.cancelRefetch??!0}).then(()=>(this.updateResult(),this.#r))}#c(t){this.#F();let e=this.#t.fetch(this.options,t);return t?.throwOnError||(e=e.catch(G)),e}#m(){this.#S();let t=g(this.options.staleTime,this.#t);if(U.isServer()||this.#r.isStale||!P(t))return;let r=W(this.#r.dataUpdatedAt,t)+1;this.#u=F.setTimeout(()=>{this.#r.isStale||this.updateResult()},r)}#v(){return(typeof this.options.refetchInterval=="function"?this.options.refetchInterval(this.#t):this.options.refetchInterval)??!1}#b(t){this.#O(),this.#o=t,!(U.isServer()||c(this.options.enabled,this.#t)===!1||!P(this.#o)||this.#o===0)&&(this.#h=F.setInterval(()=>{(this.options.refetchIntervalInBackground||_.isFocused())&&this.#c()},this.#o))}#g(){this.#m(),this.#b(this.#v())}#S(){this.#u!==void 0&&(F.clearTimeout(this.#u),this.#u=void 0)}#O(){this.#h!==void 0&&(F.clearInterval(this.#h),this.#h=void 0)}createResult(t,e){let r=this.#t,s=this.options,i=this.#r,h=this.#a,d=this.#l,u=t!==r?t.state:this.#s,{state:v}=t,a={...v},f=!1,o;if(e._optimisticResults){let l=this.hasListeners(),O=!l&&et(t,e),w=l&&rt(t,r,e,s);(O||w)&&(a={...a,...tt(v.data,t.options)}),e._optimisticResults==="isRestoring"&&(a.fetchStatus="idle")}let{error:p,errorUpdatedAt:S,status:m}=a;o=a.data;let q=!1;if(e.placeholderData!==void 0&&o===void 0&&m==="pending"){let l;i?.isPlaceholderData&&e.placeholderData===d?.placeholderData?(l=i.data,q=!0):l=typeof e.placeholderData=="function"?e.placeholderData(this.#d?.state.data,this.#d):e.placeholderData,l!==void 0&&(m="success",o=Q(i?.data,l,e),f=!0)}if(e.select&&o!==void 0&&!q)if(i&&o===h?.data&&e.select===this.#y)o=this.#f;else try{this.#y=e.select,o=e.select(o),o=Q(i?.data,o,e),this.#f=o,this.#n=null}catch(l){this.#n=l}this.#n&&(p=this.#n,o=this.#f,S=Date.now(),m="error");let D=a.fetchStatus==="fetching",T=m==="pending",M=m==="error",L=T&&D,N=o!==void 0,y={status:m,fetchStatus:a.fetchStatus,isPending:T,isSuccess:m==="success",isError:M,isInitialLoading:L,isLoading:L,data:o,dataUpdatedAt:a.dataUpdatedAt,error:p,errorUpdatedAt:S,failureCount:a.fetchFailureCount,failureReason:a.fetchFailureReason,errorUpdateCount:a.errorUpdateCount,isFetched:t.isFetched(),isFetchedAfterMount:a.dataUpdateCount>u.dataUpdateCount||a.errorUpdateCount>u.errorUpdateCount,isFetching:D,isRefetching:D&&!T,isLoadingError:M&&!N,isPaused:a.fetchStatus==="paused",isPlaceholderData:f,isRefetchError:M&&N,isStale:j(t,e),refetch:this.refetch,promise:this.#i,isEnabled:c(e.enabled,t)!==!1};if(this.options.experimental_prefetchInRender){let l=y.data!==void 0,O=y.status==="error"&&!l,w=R=>{O?R.reject(y.error):l&&R.resolve(y.data)},K=()=>{let R=this.#i=y.promise=x();w(R)},C=this.#i;switch(C.status){case"pending":t.queryHash===r.queryHash&&w(C);break;case"fulfilled":(O||y.data!==C.value)&&K();break;case"rejected":(!O||y.error!==C.reason)&&K();break}}return y}updateResult(){let t=this.#r,e=this.createResult(this.#t,this.options);if(this.#a=this.#t.state,this.#l=this.options,this.#a.data!==void 0&&(this.#d=this.#t),E(e,t))return;this.#r=e;let r=()=>{if(!t)return!0;let{notifyOnChangeProps:s}=this.options,i=typeof s=="function"?s():s;if(i==="all"||!i&&!this.#p.size)return!0;let h=new Set(i??this.#p);return this.options.throwOnError&&h.add("error"),Object.keys(this.#r).some(d=>{let n=d;return this.#r[n]!==t[n]&&h.has(n)})};this.#w({listeners:r()})}#F(){let t=this.#e.getQueryCache().build(this.#e,this.options);if(t===this.#t)return;let e=this.#t;this.#t=t,this.#s=t.state,this.hasListeners()&&(e?.removeObserver(this),t.addObserver(this))}onQueryUpdate(){this.updateResult(),this.hasListeners()&&this.#g()}#w(t){Z.batch(()=>{t.listeners&&this.listeners.forEach(e=>{e(this.#r)}),this.#e.getQueryCache().notify({query:this.#t,type:"observerResultsUpdated"})})}};function mt(t,e){return c(e.enabled,t)!==!1&&t.state.data===void 0&&!(t.state.status==="error"&&c(e.retryOnMount,t)===!1)}function et(t,e){return mt(t,e)||t.state.data!==void 0&&k(t,e,e.refetchOnMount)}function k(t,e,r){if(c(e.enabled,t)!==!1&&g(e.staleTime,t)!=="static"){let s=typeof r=="function"?r(t):r;return s==="always"||s!==!1&&j(t,e)}return!1}function rt(t,e,r,s){return(t!==e||c(s.enabled,t)===!1)&&(!r.suspense||t.state.status!=="error")&&j(t,r)}function j(t,e){return c(e.enabled,t)!==!1&&t.isStaleByTime(g(e.staleTime,t))}function vt(t,e){return!E(t.getCurrentResult(),e)}return ut(bt);})();


// The native bridge reads metadata only. The existing React Query client owns
// refresh, deduplication and cancellation across renderer/plugin lifetimes.
const INBOX_MODE_KEY = 'inbox'
const INBOX_MODE_EVENT = `${ID}:inbox-mode`
const INBOX_ROWS_EVENT = `${ID}:inbox-rows`

function readCodexInboxMode() {
  try { return pluginStorage?.get(INBOX_MODE_KEY, 'on') === 'off' ? 'off' : 'on' }
  catch { return 'off' }
}

function setCodexInboxMode(mode, inbox) {
  const next = mode === 'off' ? 'off' : 'on'
  try {
    pluginStorage?.set(INBOX_MODE_KEY, next)
    if (pluginStorage?.get(INBOX_MODE_KEY, null) !== next) throw new Error('Inbox setting was not saved.')
  }
  catch {
    host.notify?.({ kind: 'error', message: 'Could not save the Inbox setting.' })
    return readCodexInboxMode()
  }
  inbox?.setMode(next === 'on')
  globalThis.window?.dispatchEvent?.(new CustomEvent(INBOX_MODE_EVENT, { detail: next }))
  return next
}

function inboxGatewayScope() {
  return {
    connectionId: String(host.state.connectionId?.get?.() || host.activeConnectionId?.() || ''),
    profile: String(host.state.profile?.get?.() || 'default')
  }
}

function inboxOwnerScope() {
  return codexInboxFocusedThread()?.scope || inboxGatewayScope()
}

function sameInboxScope(left, right) {
  return left.connectionId === right.connectionId && left.profile === right.profile
}

async function readCodexInboxRowOwner(scope) {
  // Route inventory alone can hide failed source enumerations. Require the
  // credential-free roster's complete source status for an id-only row slot.
  if (typeof window.hermesDesktop?.getAgentRoster !== 'function') return null
  try {
    const roster = await window.hermesDesktop.getAgentRoster()
    const sources = roster?.sources
    if (!Array.isArray(sources) || sources.length !== 1 || sources[0]?.reachable !== true || sources[0]?.error || sources[0]?.needsSignIn || sources[0]?.connectionId !== scope.connectionId) return null
    const routes = roster.agents
    if (!Array.isArray(routes) || !routes.length || routes.some(route =>
      typeof route?.connectionId !== 'string' || !route.connectionId || typeof route.profile !== 'string' || !route.profile)) return null
    const owners = new Map(routes.map(route => [JSON.stringify([route.connectionId, route.profile]), route]))
    const owner = owners.size === 1 ? [...owners.values()][0] : null
    return owner && sameInboxScope(owner, scope) ? { ...scope } : null
  } catch { return null }
}

function codexInboxBadgeScope(inbox, sessionId, currentScope) {
  const evidence = inbox?.rowOwnerEvidence
  return evidence?.scope && sameInboxScope(evidence.scope, currentScope) && evidence.ids.includes(sessionId)
    ? evidence.scope : null
}

function codexInboxFocusedThread() {
  const owner = host.state.focusedSessionOwner?.get?.()
  const id = host.state.focusedStoredSessionId?.get?.()
  return typeof id === 'string' && id && typeof owner?.connectionId === 'string' && owner.connectionId && typeof owner.profile === 'string' && owner.profile
    ? { id, scope: { connectionId: owner.connectionId, profile: owner.profile } } : null
}

function codexInboxLiveFocus() {
  const thread = codexInboxFocusedThread(), runtimeId = host.state.focusedSessionId?.get?.()
  return thread && typeof runtimeId === 'string' && runtimeId ? { ...thread.scope, runtimeId, storedId: thread.id } : null
}

function codexInboxLiveStoredIds(row) {
  return [row.session_key, row.stored_session_id].filter(id => typeof id === 'string' && id)
}

function codexInboxLiveStoredMatch(storedId, row, metadata) {
  const stored = codexInboxLiveStoredIds(row)
  return stored.includes(storedId) || metadata.some(session => {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    return ids.includes(storedId) && stored.some(id => ids.includes(id))
  })
}

function resolveCodexInboxLiveSessions(scope, targetProfile, rawRows, metadata, owners) {
  const liveSessions = [], unresolved = new Set()
  let liveStatusKnown = true
  for (const row of rawRows) {
    if (!row || typeof row !== 'object') { liveStatusKnown = false; continue }
    if (row.connection_id && row.connection_id !== scope.connectionId) continue
    if (row.profile && row.profile !== targetProfile) continue
    const runtimeId = row.session_id || row.id
    const proof = owners.get(JSON.stringify([scope.connectionId, runtimeId]))
    if (row.profile || proof && !proof.conflicted && codexInboxLiveStoredMatch(proof.storedId, row, metadata)) {
      if (!row.profile && proof.profile !== scope.profile) continue
      liveSessions.push({ ...row, profile: scope.profile, connection_id: scope.connectionId })
    } else {
      const ids = codexInboxLiveStoredIds(row)
      if (!ids.length) liveStatusKnown = false
      ids.forEach(id => unresolved.add(id))
    }
  }
  for (const session of metadata) {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    if (!ids.some(id => unresolved.has(id))) continue
    if (liveSessions.some(row => codexInboxLiveStoredIds(row).some(id => ids.includes(id)))) continue
    // This guards a known durable row. Never give an unowned runtime an alias
    // into this profile or use its activity as an admission/completion signal.
    liveSessions.push({ id: session.id, session_key: session.id, status: 'unknown', profile: scope.profile, connection_id: scope.connectionId })
  }
  return { liveSessions, liveStatusKnown }
}


async function readCodexInboxPage(scope, pageCount, signal, inbox, liveOwners = new Map(), onMetadata = () => {}) {
  const bridge = globalThis.window?.hermesDesktop
  if (typeof bridge?.api !== 'function') throw new Error('Inbox requires the Desktop session API.')
  const focusedBefore = codexInboxLiveFocus()
  const sessions = new Map()
  let offset = 0, total = 0
  let targetProfile = scope.profile
  for (let page = 0; page < pageCount; page++) {
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    const params = new URLSearchParams({
      limit: '100', offset: String(offset), min_messages: '1',
      archived: 'exclude', order: 'recent', profile: scope.profile
    })
    const data = await bridge.api({
      ...(scope.connectionId ? { connectionId: scope.connectionId } : {}),
      profile: scope.profile,
      path: `/api/sessions?${params}`, timeoutMs: 60_000
    })
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    if (!Array.isArray(data?.sessions) || !Number.isFinite(data.total) || data.total < 0) {
      throw new Error('Inbox received an incomplete session list.')
    }
    if (targetProfile === scope.profile && data.sessions.some(session => session.profile && session.profile !== scope.profile) && host.profileRoutes) {
      const routes = await host.profileRoutes()
      const matches = routes.filter(route => sameInboxScope(route, scope))
      if (matches.length === 1 && typeof matches[0].targetProfile === 'string' && matches[0].targetProfile) targetProfile = matches[0].targetProfile
      if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    }
    if (data.errors?.length || data.storage?.[targetProfile] === 'corrupt') {
      throw new Error('The session list could not be read completely.')
    }
    total = data.total
    for (const session of data.sessions) {
      // A scoped response may still contain a carried row from another owner.
      if (session.profile && session.profile !== targetProfile) continue
      if (session.connection_id && session.connection_id !== scope.connectionId) continue
      if (session.hidden || session.archived || !session.id) continue
      const durable = session._lineage_root_id || session.id
      const previous = sessions.get(durable)
      if (!previous || (session.last_active || 0) > (previous.last_active || 0)) sessions.set(durable, { ...session, profile: scope.profile })
    }
    // Pinned backfills can exceed the requested page. They must not advance
    // the database offset past conversations we have not fetched.
    offset += 100
    if (offset >= total) break
    if (!data.sessions.length) throw new Error('Inbox pagination stopped before the end of the session list.')
  }
  // Only known attention is fetched beyond the recent metadata page. Removing
  // manual history pagination must not truncate admitted or reopened threads.
  const explicitRequestedIds = [...new Set([
    ...(inbox?.admission?.explicitSessionIds?.(scope) || []),
    ...(inbox?.admission?.admittedSessionIds?.(scope) || [])
  ])].filter(id => !inbox.model.isSettled(scope, id) && !inbox.model.isSnoozed(scope, id))
  // Discover a just-started old thread even if it is settled and still outside
  // the recent page. Discovery alone carries no attention authority.
  const pendingWorkIds = inbox?.pendingWorkSessionIds?.(scope) || []
  const listedIds = new Set([...sessions.values()].flatMap(row => [row.id, row._lineage_root_id, ...(row._lineage_ids || [])].filter(Boolean)))
  const missing = [...new Set([...explicitRequestedIds, ...pendingWorkIds])].filter(id => !listedIds.has(id))
  for (let index = 0; index < missing.length; index += 4) {
    const rows = await Promise.all(missing.slice(index, index + 4).map(async id => {
      try {
        return await readCodexInboxOpenedSession({ id, scope }, {
          followLineage: true,
          stillCurrent: () => !signal?.aborted && sameInboxScope(scope, inboxOwnerScope())
        })
      } catch (error) {
        if (isCodexInboxSessionNotFound(error)) return null
        throw error
      }
    }))
    for (const row of rows) {
      if (row && !row.archived && !row.hidden) sessions.set(row._lineage_root_id || row.id, row)
    }
  }
  // Paint the owner-scoped list without waiting for activity/roster round trips.
  // This stage deliberately carries no authority for activity or Settle.
  onMetadata({ sessions: [...sessions.values()], explicitRequestedIds, hasMore: offset < total })
  let liveSessions = [], rawLiveSessions = [], liveStatusKnown = false, liveReadSucceeded = false, liveStatusAt = 0
  try {
    if (!sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    let live
    if (typeof host.requestProfile === 'function' && typeof host.profileRoutes === 'function') {
      const routes = (await host.profileRoutes()).filter(route => sameInboxScope(route, scope))
      if (routes.length !== 1 || signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox live owner could not be verified.')
      if (typeof routes[0].targetProfile === 'string' && routes[0].targetProfile) targetProfile = routes[0].targetProfile
      liveStatusAt = Date.now()
      live = await host.requestProfile(routes[0], 'session.active_list', { profile: targetProfile })
    } else {
      // A legacy ambient request is safe only for the gateway it actually uses.
      if (!sameInboxScope(scope, inboxGatewayScope())) throw new Error('Inbox requires explicit live-owner routing.')
      liveStatusAt = Date.now()
      live = await host.request('session.active_list', { profile: targetProfile })
    }
    if (Array.isArray(live?.sessions)) {
      liveReadSucceeded = true
      // Keep only identity/status metadata, not another profile's preview text.
      const fields = ['id', 'session_id', 'session_key', 'stored_session_id', 'profile', 'connection_id', 'status', 'state', 'busy']
      rawLiveSessions = live.sessions.map(row => row && typeof row === 'object'
        ? Object.fromEntries(fields.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]])) : null)
      const focusedAfter = codexInboxLiveFocus(), metadata = [...sessions.values()]
      if (focusedBefore && JSON.stringify(focusedBefore) === JSON.stringify(focusedAfter) && sameInboxScope(focusedBefore, scope)) {
        const matching = rawLiveSessions.filter(row => row && (row.session_id || row.id) === focusedBefore.runtimeId &&
          (!row.profile || row.profile === targetProfile) && (!row.connection_id || row.connection_id === scope.connectionId) &&
          codexInboxLiveStoredMatch(focusedBefore.storedId, row, metadata))
        if (matching.length === 1) {
          const key = JSON.stringify([scope.connectionId, focusedBefore.runtimeId]), previous = liveOwners.get(key)
          const conflict = previous && (previous.conflicted || previous.profile !== focusedBefore.profile ||
            !codexInboxLiveStoredMatch(previous.storedId, matching[0], metadata))
          liveOwners.set(key, conflict ? { ...previous, conflicted: true } : focusedBefore)
        }
      }
      ;({ liveSessions, liveStatusKnown } = resolveCodexInboxLiveSessions(scope, targetProfile, rawLiveSessions, metadata, liveOwners))
      // A send can start before SQLite moves the old thread into the recent
      // page. Backfill only positively owned work, never unowned runtime IDs.
      const knownIds = new Set(metadata.flatMap(row => [row.id, row._lineage_root_id, ...(row._lineage_ids || [])].filter(Boolean)))
      const workingIds = [...new Set(liveSessions.filter(row => codexInboxWorkStatus(row) === 'work')
        .flatMap(codexInboxLiveStoredIds))].filter(id => !knownIds.has(id))
      for (let index = 0; index < workingIds.length; index += 4) {
        const rows = await Promise.all(workingIds.slice(index, index + 4).map(async id => {
          try {
            return await readCodexInboxOpenedSession({ id, scope }, {
              stillCurrent: () => !signal?.aborted && sameInboxScope(scope, inboxOwnerScope())
            })
          } catch (error) {
            if (isCodexInboxSessionNotFound(error)) return null
            throw error
          }
        }))
        for (const row of rows) if (row && !row.hidden && !row.archived) sessions.set(row._lineage_root_id || row.id, row)
      }
      if (workingIds.length) {
        ;({ liveSessions, liveStatusKnown } = resolveCodexInboxLiveSessions(scope, targetProfile, rawLiveSessions, [...sessions.values()], liveOwners))
      }
    }
  } catch {
    // A partial live read or failed work backfill must not authorize Settle.
    liveSessions = []; rawLiveSessions = []; liveStatusKnown = false; liveReadSucceeded = false
  }
  if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
  const rowOwnerScope = await readCodexInboxRowOwner(scope)
  if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
  return { sessions: [...sessions.values()], liveSessions, rawLiveSessions, targetProfile, liveStatusKnown, liveReadSucceeded, liveStatusAt, rowOwnerScope, explicitRequestedIds, hasMore: offset < total }
}

function startCodexInboxObserver(ctx, inbox) {
  // A data service must not inherit the mount lifetime of optional UI chrome.
  // The vendored observer uses the SDK's cache, never a plugin-owned client.
  if (!inbox) return () => {}
  let scope = inboxOwnerScope(), pageCount = 1, mode = readCodexInboxMode(), disposed = false
  const liveOwners = new Map()
  const pendingEvents = []
  let refreshVersion = 0, refreshing = false
  let lastFocus = JSON.stringify(codexInboxLiveFocus()), lastBusy = new Set()
  let metadataPreview = null
  let liveAuthority = Symbol('Inbox live connection')
  const options = () => {
    const owner = { ...scope }, pages = pageCount
    return {
      queryKey: [ID, 'inbox', owner.connectionId, owner.profile, pages],
      queryFn: async ({ signal }) => {
        const authority = liveAuthority, proofs = new Map(liveOwners)
        const data = await readCodexInboxPage(owner, pages, signal, inbox, proofs, metadata => {
          if (disposed || signal.aborted || authority !== liveAuthority || mode !== 'on' || !sameInboxScope(owner, inboxOwnerScope())) return
          metadataPreview = metadata
          project()
        })
        // In-flight reads and native cache hits cannot carry authority across
        // a disconnect or a new plugin lifetime. Stage owner proofs likewise.
        const connected = !sameInboxScope(owner, inboxGatewayScope()) ||
          !host.state.gateway || host.state.gateway.get() === 'open'
        const current = !disposed && authority === liveAuthority && connected && !signal.aborted
        if (current && data.liveReadSucceeded) {
          for (const [key, proof] of proofs) liveOwners.set(key, proof)
        }
        if (current) metadataPreview = null
        return { ...data, _codexInboxLiveAuthority: current && data.liveReadSucceeded ? authority : null }
      },
      enabled: mode === 'on', staleTime: 10_000,
      refetchInterval: mode === 'on' ? 10_000 : false, retry: 1
    }
  }
  const observer = new CodexInboxObserverVendor.QueryObserver(queryClient, options())
  const refreshLiveIdentity = () => {
    refreshVersion++
    if (refreshing || disposed || mode !== 'on') return
    refreshing = true
    // Atom changes settle together. If an old fetch is already in flight,
    // finish it before requesting proof for the newly focused runtime.
    void Promise.resolve().then(async () => {
      try {
        while (!disposed && mode === 'on') {
          const version = refreshVersion
          if (observer.getCurrentResult().isFetching) await observer.refetch({ cancelRefetch: false })
          if (disposed || mode !== 'on') break
          await observer.refetch()
          if (version === refreshVersion) break
        }
      } finally { refreshing = false }
    })
  }
  const pendingWorkSessionIds = owner => pendingEvents.filter(item => sameInboxScope(item.focus, owner) &&
    Date.now() - item.at <= 10_000).map(item => item.focus.storedId)
  inbox.pendingWorkSessionIds = pendingWorkSessionIds
  const markReady = () => {
    const query = observer.getCurrentResult()
    const ready = !disposed && mode === 'on' && sameInboxScope(scope, inboxOwnerScope()) && !query.isPending && !query.error && !!query.data
    const island = globalThis.document?.querySelector?.('[data-codex-inbox-owned="island"]')
    if (island && island.dataset.codexInboxQueryReady !== String(ready)) island.dataset.codexInboxQueryReady = String(ready)
  }
  const project = () => {
    if (disposed || !sameInboxScope(scope, inboxOwnerScope())) return
    const query = observer.getCurrentResult(), owner = { ...scope }, data = metadataPreview || query.data
    const authoritative = !query.error && data?._codexInboxLiveAuthority === liveAuthority
    const live = authoritative && Array.isArray(data?.rawLiveSessions)
      ? resolveCodexInboxLiveSessions(owner, data.targetProfile, data.rawLiveSessions, data.sessions, liveOwners)
      : { liveSessions: [], liveStatusKnown: false }
    const verifiedRuntimeIds = new Set((live.liveSessions || []).filter(row =>
      row.profile === owner.profile && row.connection_id === owner.connectionId &&
      data.rawLiveSessions.some(raw => raw && (raw.session_id || raw.id) === (row.session_id || row.id)))
      .map(row => row.session_id || row.id))
    const busyBySession = Object.fromEntries(Object.entries(host.state.busyBySession?.get?.() || {})
      .filter(([id]) => verifiedRuntimeIds.has(id)))
    inbox.setMode(mode === 'on')
    inbox.rowOwnerEvidence = mode === 'on' && !query.error && data?.rowOwnerScope && sameInboxScope(data.rowOwnerScope, owner)
      ? { scope: owner, ids: data.sessions.flatMap(session => [session.id, session._lineage_root_id, ...(session._lineage_ids || [])].filter(Boolean)) }
      : null
    window.dispatchEvent(new CustomEvent(INBOX_ROWS_EVENT))
    inbox.update({
      scope: owner,
      sessions: data?.sessions || [], liveSessions: live?.liveSessions || [],
      liveStatusKnown: authoritative && !!data?.liveStatusKnown && !!live?.liveStatusKnown,
      liveStatusAt: data?.liveStatusAt,
      // ID-only busy flags borrow only independently verified runtime identity.
      busyBySession,
      busyOwnerKnown: authoritative && !!data?.rowOwnerScope && sameInboxScope(data.rowOwnerScope, owner),
      focusedStoredSessionId: host.state.focusedStoredSessionId?.get?.() || null,
      explicitRequestedIds: data?.explicitRequestedIds,
      loading: !data && (query.isPending || query.isFetching),
      error: query.error ? 'Could not refresh Inbox.' : null,
      hasMore: !!data?.hasMore,
      loadMore: () => {
        if (disposed || mode !== 'on' || !sameInboxScope(owner, scope)) return
        pageCount++
        observer.setOptions(options())
        project()
      },
      retry: () => {
        if (!disposed && mode === 'on' && sameInboxScope(owner, scope)) void observer.refetch()
      }
    })
    if (authoritative && pendingEvents.length) {
      const focus = JSON.stringify(codexInboxLiveFocus())
      for (let index = 0; index < pendingEvents.length;) {
        const item = pendingEvents[index]
        if (Date.now() - item.at > 10_000 || JSON.stringify(item.focus) !== focus) {
          pendingEvents.splice(index, 1); continue
        }
        if (!verifyLiveEvent(item.event)) { index++; continue }
        pendingEvents.splice(index, 1)
        inbox.activity?.(item.event)
      }
    }
    markReady()
  }
  const configure = () => {
    if (disposed) return
    const nextScope = inboxOwnerScope(), nextMode = readCodexInboxMode()
    if (sameInboxScope(scope, nextScope) && mode === nextMode) return
    pendingEvents.length = 0
    if (!sameInboxScope(scope, nextScope)) { scope = nextScope; pageCount = 1; metadataPreview = null }
    mode = nextMode
    observer.setOptions(options())
    project()
  }
  const stopQuery = observer.subscribe(project)
  const verifyLiveEvent = event => {
    const query = observer.getCurrentResult(), data = query.data
    if (disposed || mode !== 'on' || event.replayed || !event.session_id || query.error ||
        event.connectionId !== scope.connectionId || event.profile !== scope.profile ||
        !sameInboxScope(scope, inboxOwnerScope()) || data?._codexInboxLiveAuthority !== liveAuthority) return false
    const raw = data.rawLiveSessions.filter(row => row && (row.session_id || row.id) === event.session_id)
    if (raw.some(row => row.profile && row.profile !== data.targetProfile || row.connection_id && row.connection_id !== scope.connectionId)) return false
    const proof = liveOwners.get(JSON.stringify([scope.connectionId, event.session_id]))
    if (proof && !proof.conflicted && proof.profile === scope.profile &&
        (!raw.length || raw.length === 1 && codexInboxLiveStoredMatch(proof.storedId, raw[0], data.sessions)) &&
        data.sessions.some(row => [row.id, row._lineage_root_id, ...(row._lineage_ids || [])].includes(proof.storedId))) return true
    return raw.length === 1 && raw[0].profile === data.targetProfile &&
      data.sessions.some(row => codexInboxLiveStoredMatch(row.id, raw[0], [row]))
  }
  inbox.verifyLiveEvent = verifyLiveEvent
  const focusChanged = () => {
    configure(); project()
    const next = JSON.stringify(codexInboxLiveFocus())
    if (next !== lastFocus) {
      pendingEvents.length = 0; lastFocus = next
      refreshLiveIdentity()
    }
  }
  const busyChanged = () => {
    project()
    const values = host.state.busyBySession?.get?.() || {}
    const busy = new Set(Object.entries(values).filter(([, value]) => value === true).map(([id]) => id))
    if ([...busy].some(id => !lastBusy.has(id))) refreshLiveIdentity()
    lastBusy = busy
  }
  const subscriptions = [
    inbox.model?.subscribe?.(event => {
      if (event?.type !== 'manual-settle') return
      const settledKey = inbox.model.key(event.scope, event.session)
      if (!settledKey) return
      // Verification can finish after Settle. Only work received after that
      // successful decision may restore attention; wall-clock order is unsafe.
      for (let index = pendingEvents.length - 1; index >= 0; index--) {
        const item = pendingEvents[index]
        if (sameInboxScope(item.focus, event.scope) &&
            inbox.model.key(item.focus, item.focus.storedId) === settledKey) pendingEvents.splice(index, 1)
      }
    }),
    ...['profile', 'connectionId', 'focusedSessionOwner', 'focusedStoredSessionId', 'focusedSessionId'].map(name => host.state[name]?.subscribe?.(focusChanged)),
    host.state.busyBySession?.subscribe?.(busyChanged),
    host.state.gateway?.subscribe?.(() => {
      if (host.state.gateway.get() !== 'open') {
        liveAuthority = Symbol('Inbox live connection')
        metadataPreview = null
        pendingEvents.length = 0
        liveOwners.clear()
        project()
      } else if (mode === 'on') {
        project()
        void observer.refetch()
      }
    })
  ].filter(Boolean)
  if (typeof host.onEvent === 'function') subscriptions.push(host.onEvent('*', event => {
    // SDK profile tags can describe the active surface, not the event producer.
    // They may trigger a scoped read; only that read can establish ownership.
    if (!event.replayed && ['message.start', 'message.complete', 'error'].includes(event.type) &&
        mode === 'on' && event.connectionId === scope.connectionId && event.profile === scope.profile) {
      const focus = codexInboxLiveFocus()
      if (!verifyLiveEvent(event) && focus && sameInboxScope(focus, scope) && focus.runtimeId === event.session_id) {
        // Keep only lifecycle + the nominated identity, never message content.
        // Release it only after a fresh connected read verifies that identity.
        const payload = {}
        if (typeof event.payload?.status === 'string') payload.status = event.payload.status
        if (event.payload?.error) payload.error = true
        pendingEvents.push({ focus, at: Date.now(), event: {
          type: event.type, ...scope, session_id: focus.runtimeId, payload
        } })
        if (pendingEvents.length > 64) pendingEvents.splice(0, pendingEvents.length - 64)
      }
      refreshLiveIdentity()
    }
  }))
  window.addEventListener(INBOX_MODE_EVENT, configure)
  // The DOM adapter creates/recreates its island asynchronously, including on
  // navigation after a cache hit. Keep readiness accurate without refetching.
  const readiness = globalThis.document?.body && typeof window.MutationObserver === 'function'
    ? new window.MutationObserver(markReady) : null
  readiness?.observe(document.body, { childList: true, subtree: true })
  project()
  const stop = () => {
    if (disposed) return
    disposed = true
    pendingEvents.length = 0
    subscriptions.forEach(unsubscribe => unsubscribe())
    window.removeEventListener(INBOX_MODE_EVENT, configure)
    readiness?.disconnect()
    stopQuery()
    observer.destroy()
    liveOwners.clear()
    if (inbox.verifyLiveEvent === verifyLiveEvent) delete inbox.verifyLiveEvent
    if (inbox.pendingWorkSessionIds === pendingWorkSessionIds) delete inbox.pendingWorkSessionIds
    inbox.rowOwnerEvidence = null
    markReady()
  }
  ctx.onDispose(stop)
  return stop
}

function CodexSettledBadge({ sessionId, inbox }) {
  const profile = useValue(host.state.profile)
  const connectionId = useValue(host.state.connectionId)
  const [, repaint] = useState(0)
  useEffect(() => {
    const changed = () => repaint(value => value + 1)
    const stopModel = inbox?.model.subscribe(changed)
    window.addEventListener(INBOX_MODE_EVENT, changed)
    window.addEventListener(INBOX_ROWS_EVENT, changed)
    return () => { stopModel?.(); window.removeEventListener(INBOX_MODE_EVENT, changed); window.removeEventListener(INBOX_ROWS_EVENT, changed) }
  }, [inbox])
  const currentScope = { connectionId: String(connectionId || host.activeConnectionId?.() || ''), profile: String(profile || 'default') }
  const scope = codexInboxBadgeScope(inbox, sessionId, currentScope)
  // The native slot supplies only an id. Never decorate a mixed-owner row by
  // borrowing the active gateway's identity, even if that id exists there.
  if (!scope) return null
  if (!inbox || readCodexInboxMode() !== 'on') return null
  if (!inbox.admission?.isEligible(scope, sessionId)) return null
  const settled = inbox.model.isSettled(scope, sessionId)
  const snoozed = inbox.model.isSnoozed?.(scope, sessionId) === true
  if (!settled && !snoozed) return null
  const stop = event => { event.preventDefault(); event.stopPropagation() }
  const badge = (label, action, title, apply) => jsx('button', {
    type: 'button', key: label, 'data-codex-inbox-owned': 'badge', 'aria-label': action, title,
    onPointerDown: stop,
    onClick: async event => {
      stop(event)
      // A row from the previous owner can remain mounted during a switch.
      if (readCodexInboxMode() !== 'on' || codexInboxBadgeScope(inbox, sessionId, inboxOwnerScope()) !== scope) return
      const freshOwner = await readCodexInboxRowOwner(scope)
      if (freshOwner && readCodexInboxMode() === 'on' && codexInboxBadgeScope(inbox, sessionId, inboxOwnerScope()) === scope) apply()
    },
    children: [
      jsx('span', { className: 'codex-inbox-settled', children: label }),
      jsx('span', { className: 'codex-inbox-unsettle', children: action })
    ]
  })
  const badges = []
  if (settled) badges.push(badge('Settled', 'Un-settle', 'Un-settle', () => inbox.model.unsettle(scope, sessionId)))
  if (snoozed) {
    const deadline = new Date(inbox.model.snoozedUntil(scope, sessionId)).toLocaleString()
    badges.push(badge('Snoozed', 'Wake now', `Snoozed until ${deadline}`, () => inbox.model.cancelSnooze(scope, sessionId)))
  }
  return badges.length === 1 ? badges[0] : jsx('span', { style: { display: 'inline-flex' }, children: badges })
}

function connectCodexInboxEvents(inbox) {
  if (!inbox || !host.onEvent) return () => {}
  return host.onEvent('*', event => {
    if (event.replayed) return
    // Presentation tags alone cannot prove ownership, even when populated.
    // Verify the runtime against the observer's connected owner evidence.
    if (!event.connectionId || !event.profile || !event.session_id) return
    if (typeof inbox.verifyLiveEvent !== 'function' || !inbox.verifyLiveEvent(event)) return
    if (typeof inbox.activity === 'function') inbox.activity(event)
    else if (['message.start', 'tool.start'].includes(event.type)) {
      inbox.reactivate({ type: 'work', scope: { connectionId: event.connectionId, profile: event.profile }, session_id: event.session_id })
    }
  })
}


// Pure metadata decoder for the native Command surfaces. No listeners, actions,
// fetches, logs, persistence or ownership inference from the active connection.
// The controller must call it before cmdk consumes Enter/removes the menu and
// independently verify focus/API ownership before admitting an explicit open.
function resolveCodexInboxMenuOpenGesture(event, { document: doc, queryClient } = {}) {
  if (!doc || !event || event.isTrusted !== true || event.defaultPrevented ||
      event.isComposing || event.keyCode === 229 || event.shiftKey || event.ctrlKey ||
      event.metaKey || event.altKey || event.repeat ||
      (event.view && event.view !== doc.defaultView)) return null
  if (event.type !== 'click' && event.type !== 'keydown') return null
  if (event.type === 'click' ? event.button !== 0 : event.key !== 'Enter') return null
  if (typeof queryClient?.getQueryData !== 'function') return null

  const commandSelector = '[data-slot="command"]'
  const itemSelector = '[data-slot="command-item"][data-value]'
  const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target
  if (!target?.closest || target.ownerDocument !== doc || !target.isConnected) return null
  const command = target.closest(commandSelector)
  if (!command) return null

  // Reject disabled/closed surfaces as well as disabled children of an item.
  const unavailable = element => {
    for (let node = element; node; node = node.parentElement) {
      if (node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true' ||
          node.getAttribute('data-disabled') === 'true' || node.hasAttribute('inert') ||
          node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' ||
          node.getAttribute('data-state') === 'closed') return true
    }
    return false
  }
  if (unavailable(target)) return null

  let item
  if (event.type === 'click') {
    item = target.closest(itemSelector)
  } else {
    // cmdk selects the highlighted item, not necessarily the event target.
    // Never borrow another Command's selection (including a nested Command).
    if (target.matches('input, textarea, [contenteditable="true"]') &&
        !target.matches('[data-slot="command-input"]')) return null
    const selected = [...command.querySelectorAll(`${itemSelector}[data-selected="true"]`)]
      .filter(node => node.closest(commandSelector) === command)
    if (selected.length !== 1) return null
    item = selected[0]
  }
  if (!item || item.closest(commandSelector) !== command || !item.isConnected || unavailable(item)) return null
  const value = item.getAttribute('data-value')
  if (typeof value !== 'string' || !value) return null

  // Read only the SDK's two native caches, not private stores/components/Fiber.
  let pickerRows, paletteRows
  try {
    const picker = queryClient.getQueryData(['session-picker', 'sessions'])
    const palette = queryClient.getQueryData(['command-palette', 'sessions'])
    pickerRows = Array.isArray(picker?.sessions) ? picker.sessions : []
    paletteRows = Array.isArray(palette?.sessions) ? palette.sessions : []
  } catch { return null }
  const validId = id => typeof id === 'string' && id.length > 0
  const rows = [...pickerRows, ...paletteRows].filter(row => row && validId(row.id))
  const idsOf = row => [row.id, row._lineage_root_id,
    ...(Array.isArray(row._lineage_ids) ? row._lineage_ids : [])].filter(validId)
  const scopeOf = row => validId(row.connection_id) && validId(row.profile)
    ? { connectionId: row.connection_id, profile: row.profile } : null
  // Keep incomplete owners distinct too: unknown metadata cannot prove that a
  // qualified clone belongs to the same owner. Never trim/coerce owner tokens.
  const ownerKey = row => JSON.stringify([
    typeof row.connection_id === 'string' ? row.connection_id : null,
    typeof row.profile === 'string' ? row.profile : null
  ])
  const resolveOwner = (sessionId, candidates, kind) => {
    if (!candidates.length) return null
    const owners = new Set(rows.filter(row => idsOf(row).includes(sessionId)).map(ownerKey))
    if (owners.size !== 1) return null
    return { sessionId, scope: scopeOf(candidates[0]), kind }
  }

  // Native sessionTitle: title.trim() || preview.trim() || 'Untitled session'.
  // The verified fallback is completely reconstructible from cache, so do NOT
  // fall back to arbitrary displayed text or accept just an id suffix. Native
  // picker signatures always end in row.id, never a substituted lineage id.
  // Test this first: a legitimate picker title/preview may contain U+0001.
  const pickerCandidates = pickerRows.filter(row => {
    if (!row || !validId(row.id) ||
        (row.title != null && typeof row.title !== 'string') ||
        (row.preview != null && typeof row.preview !== 'string')) return false
    const preview = row.preview?.trim() ?? ''
    const title = row.title?.trim() || preview || 'Untitled session'
    return value === `${title} ${preview} ${row.id}`
  })
  if (pickerCandidates.length) {
    const sessionIds = new Set(pickerCandidates.map(row => row.id))
    if (sessionIds.size !== 1) return null
    return resolveOwner(pickerCandidates[0].id, pickerCandidates, 'picker')
  }

  // Native paletteValue appends the id after the LAST separator; a title may
  // itself contain that character. Labels/previews never become output/logs.
  const separator = value.lastIndexOf('\u0001')
  if (separator !== -1) {
    const nativeId = value.slice(separator + 1)
    const match = /^(session-|pinned-|goto-)(.+)$/.exec(nativeId)
    if (!match) return null // archived-* restores only; settings/others do not open.
    const prefix = match[1], sessionId = match[2]
    if (prefix === 'goto-' && !/^\d{8}_\d{6}_[a-f0-9]{6}$/.test(sessionId)) return null
    // session/pinned native entries use row.id unchanged (toSessionEntry).
    // A lineage alias alone cannot manufacture a native entry for that alias.
    const candidates = paletteRows.filter(row => row && row.id === sessionId)
    if (candidates.length) return resolveOwner(sessionId, candidates, 'palette')
    if (prefix !== 'goto-' || !/^\d{8}_\d{6}_[a-f0-9]{6}$/.test(sessionId)) return null
    // goto accepts a native-format stored root/segment as typed, without
    // rewriting it to a tip. Explicit native lineage metadata may qualify it.
    const lineageRows = rows.filter(row => idsOf(row).includes(sessionId))
    if (lineageRows.length) return resolveOwner(sessionId, lineageRows, 'palette')
    return { sessionId, scope: null, kind: 'palette' } // parent verifies focus/API.
  }

  return null
}


// Observe a real native-row open through the supported decoration slot.
// A hidden marker supplies the durable row identity without copying native actions.
async function readCodexInboxOpenedSession(thread, { stillCurrent = () => true, expectedRootId, followLineage = false } = {}) {
  const scope = thread?.scope, id = thread?.id
  if (!id || !scope || !stillCurrent()) throw new Error('Inbox open owner changed.')
  const bridge = globalThis.window?.hermesDesktop
  if (typeof bridge?.api !== 'function') throw new Error('Inbox requires the Desktop session API.')
  let resolvedId = id, lineage = null
  if (followLineage || expectedRootId && expectedRootId !== id) {
    const rootId = expectedRootId || id
    lineage = await bridge.api({
      connectionId: scope.connectionId, profile: scope.profile,
      path: `/api/sessions/${encodeURIComponent(rootId)}/latest-descendant?${new URLSearchParams({ profile: scope.profile })}`,
      timeoutMs: 60_000
    })
    if (!stillCurrent()) throw new Error('Inbox open owner changed.')
    if (lineage?.requested_session_id !== rootId || !Array.isArray(lineage.path) || lineage.path[0] !== rootId || lineage.path.at(-1) !== lineage.session_id || lineage.path.some(value => typeof value !== 'string' || !value)) {
      throw new Error('Inbox opened-chat lineage could not be verified.')
    }
    if (expectedRootId && !lineage.path.includes(id)) throw Object.assign(new Error('Inbox opened-chat target does not belong to the clicked row.'), { code: 'OPEN_TARGET_NOT_FOCUSED' })
    if (followLineage) resolvedId = lineage.session_id
  }
  const row = await bridge.api({
    connectionId: scope.connectionId, profile: scope.profile,
    path: `/api/sessions/${encodeURIComponent(resolvedId)}?${new URLSearchParams({ profile: scope.profile })}`,
    timeoutMs: 60_000
  })
  if (!stillCurrent()) throw new Error('Inbox open owner changed.')
  if (!row || row.id !== resolvedId || typeof row.profile !== 'string') throw new Error('Inbox received incomplete opened-chat metadata.')
  let targetProfile = scope.profile
  if (row.profile !== targetProfile && typeof host.profileRoutes === 'function') {
    const routes = await host.profileRoutes()
    const matches = routes.filter(route => sameInboxScope(route, scope))
    if (matches.length === 1 && matches[0].targetProfile) targetProfile = matches[0].targetProfile
  }
  if (!stillCurrent() || row.profile !== targetProfile || row.connection_id && row.connection_id !== scope.connectionId) {
    throw new Error('Inbox opened-chat owner could not be verified.')
  }
  return { ...row, ...(lineage ? { _lineage_root_id: lineage.path[0], _lineage_ids: lineage.path } : {}), profile: scope.profile, connection_id: scope.connectionId }
}

function isCodexInboxSessionNotFound(error) {
  const status = error?.status ?? error?.statusCode
  if (status != null) return status === 404
  // Electron invoke drops statusCode. Read only the native HTTP prefix,
  // never a status mentioned inside an auth, transport or corrupt-body error.
  const nativeStatus = /^Error invoking remote method 'hermes:api': Error: (\d{3}): /.exec(error?.message || '')
  return nativeStatus?.[1] === '404'
}

async function codexInboxUnchangedOpenOwner(sessionId, scope, stillCurrent) {
  const roster = await globalThis.window?.hermesDesktop?.getAgentRoster?.()
  if (!stillCurrent() || !Array.isArray(roster?.sources) || !roster.sources.length || !Array.isArray(roster.agents)) return false
  if (roster.sources.some(source => source.reachable !== true || source.error || source.needsSignIn || !source.connectionId)) return false
  const sources = new Set(roster.sources.map(source => source.connectionId)), owners = new Map()
  for (const owner of roster.agents) {
    if (!sources.has(owner.connectionId) || typeof owner.profile !== 'string' || !owner.profile) return false
    owners.set(JSON.stringify([owner.connectionId, owner.profile]), owner)
  }
  if (!owners.has(JSON.stringify([scope.connectionId, scope.profile]))) return false
  if (owners.size === 1) return true
  // A mixed roster is not ambiguous when this exact stored id exists under
  // only one owner. Read metadata only and require a complete negative proof.
  let found = []
  const routes = [...owners.values()]
  for (let offset = 0; offset < routes.length; offset += 4) {
    const batch = await Promise.all(routes.slice(offset, offset + 4).map(async owner => {
      try {
        await readCodexInboxOpenedSession({ id: sessionId, scope: owner }, { stillCurrent })
        return owner
      } catch (error) {
        if (isCodexInboxSessionNotFound(error)) return null
        throw error
      }
    }))
    if (!stillCurrent()) return false
    found = found.concat(batch.filter(Boolean))
    if (found.length > 1 || found.some(owner => !sameInboxScope(owner, scope))) return false
  }
  return found.length === 1 && sameInboxScope(found[0], scope)
}

function bindCodexInboxNativeOpenIntent(row, sessionId, inbox, resolveGesture = null) {
  if (!row || !sessionId && !resolveGesture || !inbox) return () => {}
  let disposed = false, intent = null, timer = null, commitTimer = null, subscriptions = [], middlePress = null
  const key = thread => thread ? JSON.stringify([thread.scope.connectionId, thread.scope.profile, thread.id]) : null
  const reset = () => {
    intent = null
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (commitTimer !== null) clearTimeout(commitTimer)
    commitTimer = null
    subscriptions.forEach(stop => stop())
    subscriptions = []
  }
  const commit = async () => {
    const pending = intent, thread = codexInboxFocusedThread()
    if (disposed || !pending || pending.loading || !thread || readCodexInboxMode() !== 'on') return
    if (pending.scopeHint && !sameInboxScope(pending.scopeHint, thread.scope)) return
    if (!sameInboxScope(thread.scope, inboxOwnerScope())) return
    // The focus stores may publish owner and id separately. Never accept a
    // transitional old id as the target of a differently labelled native row.
    const targetId = pending.sessionId
    const sameLineage = thread.id === targetId || inbox.model?.key(thread.scope, targetId) === inbox.model?.key(thread.scope, thread.id)
    if (!sameLineage && key(thread) !== pending.before && thread.id === pending.beforeId) return
    pending.loading = true
    const revision = pending.revision
    const stillCurrent = () => !disposed && intent === pending && key(codexInboxFocusedThread()) === key(thread) && sameInboxScope(thread.scope, inboxOwnerScope())
    try {
      if (key(thread) === pending.before && !pending.scopeHint && !await codexInboxUnchangedOpenOwner(targetId, thread.scope, stillCurrent)) return
      const session = await readCodexInboxOpenedSession(thread, { stillCurrent, expectedRootId: sameLineage ? undefined : targetId })
      if (stillCurrent() && inbox.opened({ explicit: true, scope: thread.scope, id: thread.id, session })) reset()
    } catch (error) {
      // Native resume is asynchronous. A still-unchanged previous focus is
      // not a failed open, and must never be admitted on behalf of this row.
      if (error?.code === 'OPEN_TARGET_NOT_FOCUSED' && key(thread) === pending.before) return
      if (stillCurrent()) {
        // This is passive metadata discovery, not a requested restore. A failed
        // read must leave attention unchanged without announcing a failed action.
        reset()
      }
    } finally {
      if (intent === pending) {
        pending.loading = false
        if (pending.revision !== revision) scheduleCommit()
      }
    }
  }
  const scheduleCommit = () => {
    if (disposed || !intent || commitTimer !== null) return
    // Chrome can drain microtasks between capture and the native bubble handler.
    // A task boundary lets the real handler run before we inspect its result.
    commitTimer = setTimeout(() => { commitTimer = null; void commit() }, 0)
  }
  const activate = event => {
    if (disposed || readCodexInboxMode() !== 'on' || !event.isTrusted || event.shiftKey || event.defaultPrevented) return
    if (event.type === 'click' && event.button !== 0 || event.type === 'pointerup' && event.button !== 1) return
    let descriptor
    if (resolveGesture) {
      descriptor = resolveGesture(event)
      if (!descriptor || !row.contains(event.target)) return
    } else {
      const target = event.target?.closest?.('button[data-slot="row-button"]')
      if (!target || !row.contains(target) || event.target.closest?.('[data-row-actions], [data-reorder-handle]')) return
      descriptor = { sessionId, scope: null }
    }
    reset()
    const before = codexInboxFocusedThread()
    intent = { sessionId: descriptor.sessionId, scopeHint: descriptor.scope ? { ...descriptor.scope } : null, before: key(before), beforeId: before?.id, loading: false, revision: 0 }
    // Subscribe only during one verified open gesture, not once per idle row.
    subscriptions = ['focusedStoredSessionId', 'focusedSessionOwner', 'profile', 'connectionId']
      .map(name => host.state[name]?.subscribe?.(() => {
        if (intent) intent.revision++
        scheduleCommit()
      })).filter(Boolean)
    timer = setTimeout(reset, 60_000)
    // Native click/resume handlers must run first; do not prevent or forward them.
    scheduleCommit()
  }
  const pointerDown = event => {
    if (resolveGesture) return
    if (!event.isTrusted || event.button !== 1 || event.shiftKey || readCodexInboxMode() !== 'on') return
    const target = event.target?.closest?.('button[data-slot="row-button"]')
    middlePress = target && row.contains(target) && !event.target.closest?.('[data-row-actions], [data-reorder-handle]')
      ? { target, pointerId: event.pointerId } : null
  }
  const pointerUp = event => {
    const press = middlePress
    middlePress = null
    if (!press || press.pointerId !== event.pointerId || press.target !== event.target?.closest?.('button[data-slot="row-button"]')) return
    activate(event)
  }
  const pointerCancel = () => { middlePress = null }
  row.addEventListener('click', activate, true)
  if (resolveGesture) row.addEventListener('keydown', activate, true)
  row.addEventListener('pointerdown', pointerDown, true)
  row.addEventListener('pointerup', pointerUp, true)
  row.addEventListener('pointercancel', pointerCancel, true)
  return () => {
    disposed = true
    reset()
    middlePress = null
    row.removeEventListener('click', activate, true)
    if (resolveGesture) row.removeEventListener('keydown', activate, true)
    row.removeEventListener('pointerdown', pointerDown, true)
    row.removeEventListener('pointerup', pointerUp, true)
    row.removeEventListener('pointercancel', pointerCancel, true)
  }
}

function CodexInboxNativeOpenIntent({ sessionId, inbox }) {
  const marker = useRef(null)
  useEffect(() => bindCodexInboxNativeOpenIntent(marker.current?.closest?.('.row-hover'), sessionId, inbox), [sessionId, inbox])
  return jsx('span', { ref: marker, 'aria-hidden': true, style: { display: 'none' }, 'data-codex-inbox-open-observer': sessionId })
}

function startCodexInboxMenuOpenObserver(ctx, inbox) {
  const doc = globalThis.document
  if (!inbox || typeof doc?.addEventListener !== 'function') return () => {}
  const stop = bindCodexInboxNativeOpenIntent(doc, null, inbox, event => resolveCodexInboxMenuOpenGesture(event, { document: doc, queryClient }))
  ctx.onDispose(stop)
  return stop
}


// Plugin-owned DOM chrome, transcribed from desktop sidebar/chrome.tsx,
// row-geometry.ts, session-row.tsx and ui/row-button.tsx. These are not imports
// or instances of the private SidebarSessionRow / SessionActionsMenu components.
// Parent installs this scoped fallback CSS once and owns all menu/action logic.
const CODEX_INBOX_ROW_UI_CSS = `
[data-codex-inbox-row-ui] { box-sizing:border-box; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:stretch; min-height:1.625rem; padding-right:.5rem; border-radius:.375rem; position:relative; }
[data-codex-inbox-row-ui]:hover { background:var(--ui-row-hover-background,transparent); }
[data-codex-inbox-row-ui][data-active='true'] { background:var(--ui-row-active-background,transparent); }
[data-codex-inbox-row-ui] > [data-slot='row-button'] { box-sizing:border-box; display:flex; height:100%; min-width:0; align-items:center; align-self:stretch; gap:.375rem; padding:.125rem .5rem; border:0; background:transparent; text-align:left; color:inherit; font:inherit; cursor:pointer; z-index:0; }
[data-codex-inbox-row-ui] [data-codex-inbox-lead] { display:grid; width:.875rem; height:.875rem; flex-shrink:0; place-items:center; overflow:hidden; position:relative; }
[data-codex-inbox-row-ui] [data-codex-inbox-work-dot] { box-sizing:border-box; width:6px; height:6px; border-radius:50%; background:var(--ui-text-quaternary,currentColor); color:var(--ui-text-quaternary,currentColor); opacity:0; }
[data-codex-inbox-row-ui][data-work-state='working'] [data-codex-inbox-work-dot] { background:var(--ui-text-primary,currentColor); opacity:1; }
[data-codex-inbox-row-ui][data-work-state='completed'] [data-codex-inbox-work-dot] { background:var(--ui-success,var(--ui-text-quaternary,currentColor)); opacity:1; }
/* Plugin-owned transcription of the installed host's private arc-border arc-row:
   styles.css:1111-1157,1202-1231,1246-1261,1274-1277. The installed SDK has
   no RunningBorder export; native session-row.tsx paints an aria-hidden span.
   Keep the native masked 300% gradient and diagonal translation, not rotation. */
[data-codex-inbox-row-ui] > [data-codex-inbox-running-arc] {
  --codex-inbox-arc-c0:color-mix(in srgb,var(--dt-foreground,var(--ui-text-primary,currentColor)) 0%,transparent);
  --codex-inbox-arc-c1:var(--dt-midground,var(--ui-text-primary,currentColor));
  --codex-inbox-arc-c2:color-mix(in srgb,var(--codex-inbox-arc-c1) 45%,transparent);
  --codex-inbox-arc-angle:160deg; --codex-inbox-arc-width:.078125rem;
  --codex-inbox-arc-standoff:0rem; --codex-inbox-arc-duration:2.23s;
  box-sizing:border-box; pointer-events:none; position:absolute; overflow:hidden;
  border-radius:inherit;
  inset:calc(var(--codex-inbox-arc-standoff) * -1); padding:var(--codex-inbox-arc-width);
  mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude; opacity:0;
}
:root:is(.dark,[data-hermes-mode='dark']) [data-codex-inbox-row-ui] > [data-codex-inbox-running-arc] { --codex-inbox-arc-c1:var(--dt-foreground,var(--ui-text-primary,currentColor)); }
[data-codex-inbox-row-ui][data-work-state='working'] > [data-codex-inbox-running-arc] { opacity:1; }
[data-codex-inbox-row-ui][data-work-state='working'] > [data-codex-inbox-running-arc]::before {
  content:''; position:absolute; top:0; left:0; width:300%; height:300%;
  background:linear-gradient(var(--codex-inbox-arc-angle),transparent 0%,var(--codex-inbox-arc-c0) 15%,var(--codex-inbox-arc-c1) 20%,var(--codex-inbox-arc-c2) 25%,transparent 35%,transparent 40%,var(--codex-inbox-arc-c0) 55%,var(--codex-inbox-arc-c1) 60%,var(--codex-inbox-arc-c2) 65%,transparent 75%,transparent 80%,var(--codex-inbox-arc-c0) 95%,var(--codex-inbox-arc-c1) 100%);
  will-change:transform; animation:codex-inbox-row-contour var(--codex-inbox-arc-duration) linear infinite;
}
@keyframes codex-inbox-row-contour { 0% { transform:translate(-10%,-10%); } 100% { transform:translate(-50%,-50%); } }
[data-codex-inbox-row-ui] [data-codex-inbox-title-wrap] { min-width:0; flex:1; align-self:center; }
[data-codex-inbox-row-ui] [data-codex-inbox-label] { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.8125rem; line-height:1.35; font-weight:400; color:var(--ui-text-secondary,inherit); }
[data-codex-inbox-row-ui]:is(:hover,:focus-within,[data-active='true']) [data-codex-inbox-label] { color:var(--ui-text-primary,inherit); }
[data-codex-inbox-row-ui] > [data-row-actions] { display:flex; flex-shrink:0; align-items:center; align-self:stretch; }
[data-codex-inbox-row-ui] > [data-row-actions] > button { box-sizing:border-box; display:inline-flex; width:1.5rem; height:1.5rem; flex-shrink:0; align-items:center; justify-content:center; padding:0; border:0; border-radius:4px; background:transparent; color:var(--ui-text-secondary,inherit); font:inherit; cursor:pointer; opacity:0; pointer-events:none; transition:opacity 100ms; }
[data-codex-inbox-row-ui]:is(:hover,:focus-within) > [data-row-actions] > button { opacity:1; pointer-events:auto; }
[data-codex-inbox-row-ui] > [data-row-actions] > button:hover { background:var(--chrome-action-hover,var(--ui-control-hover-background,transparent)); color:var(--ui-text-primary,inherit); }
[data-codex-inbox-row-ui] button:focus-visible { outline:1px solid var(--ui-accent,currentColor); outline-offset:-1px; }
[data-codex-inbox-row-ui] button:disabled { cursor:default; }
[data-codex-inbox-row-ui] > [data-row-actions] > button:disabled { pointer-events:none; }
[data-codex-inbox-row-ui]:is(:hover,:focus-within) > [data-row-actions] > button:disabled { opacity:.5; }
[data-codex-inbox-row-ui] > [data-row-actions] > [data-codex-inbox-settle] { opacity:1; pointer-events:auto; }
[data-codex-inbox-row-ui] > [data-row-actions] > [data-codex-inbox-settle]:disabled,
[data-codex-inbox-row-ui]:is(:hover,:focus-within) > [data-row-actions] > [data-codex-inbox-settle]:disabled { opacity:0; visibility:hidden; pointer-events:none; transition:none; }
[data-codex-inbox-row-ui] svg { display:block; width:.75rem; height:.75rem; pointer-events:none; flex-shrink:0; }
@media (prefers-reduced-motion:reduce) {
  [data-codex-inbox-row-ui][data-work-state='working'] > [data-codex-inbox-running-arc]::before { animation:none; }
  [data-codex-inbox-row-ui] > [data-row-actions] > button { transition:none; }
}
`;

function createCodexInboxRowUI({ document: doc, onOpen, onMenu, onSnooze }) {
  if (!doc || typeof doc.createElement !== 'function') throw new TypeError('document is required');
  const make = (tag, className, marker) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (marker) node.setAttribute(marker, '');
    return node;
  };
  const row = make('div', 'min-h-[1.625rem] pr-2 grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md group row-hover relative', 'data-codex-inbox-row-ui');
  const go = make('button', 'pl-2 pr-2 gap-1.5 flex h-full min-w-0 items-center self-stretch py-0.5 bg-transparent text-left z-0', 'data-codex-inbox-open');
  go.type = 'button';
  go.setAttribute('data-slot', 'row-button');
  const lead = make('span', 'grid size-3.5 shrink-0 place-items-center overflow-hidden', 'data-codex-inbox-lead');
  lead.setAttribute('aria-hidden', 'true');
  const workDot = make('span', '', 'data-codex-inbox-work-dot');
  const runningArc = make('span', '', 'data-codex-inbox-running-arc');
  runningArc.setAttribute('aria-hidden', 'true');
  lead.append(workDot);
  const wrap = make('span', 'min-w-0 flex-1 self-center', 'data-codex-inbox-title-wrap');
  const label = make('span', 'min-w-0 truncate text-[0.8125rem] text-(--ui-text-secondary) leading-[1.35] hover-marquee block font-normal group-hover:text-foreground group-data-[working=true]:text-foreground/90', 'data-codex-inbox-label');
  const text = make('span', 'hover-marquee-inner');
  label.append(text); wrap.append(label); go.append(lead, wrap);
  const actions = make('div', 'flex shrink-0 items-center self-stretch', 'data-row-actions');
  const glyphButton = (marker, name, paths) => {
    const button = make('button', 'inline-flex shrink-0 cursor-pointer items-center justify-center size-6 rounded-[4px] text-(--ui-text-secondary) bg-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100', marker);
    button.type = 'button';
    button.setAttribute('data-slot', 'button');
    button.setAttribute('data-size', 'icon-xs');
    button.setAttribute('data-variant', 'ghost');
    button.setAttribute('aria-label', name); button.title = name;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.25'); svg.setAttribute('stroke-linecap', 'round');
    for (const d of paths) {
      const path = doc.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path);
    }
    button.append(svg); return button;
  };
  const menu = glyphButton('data-codex-inbox-menu', 'Inbox row options', ['M3 8h.01M8 8h.01M13 8h.01']);
  menu.firstChild.setAttribute('stroke-width', '2.5');
  menu.setAttribute('aria-haspopup', 'menu'); menu.setAttribute('aria-expanded', 'false');
  const clock = glyphButton('data-codex-inbox-snooze', 'Snooze', ['M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5', 'M8 4.5V8l2.5 1.5']);
  actions.append(menu, clock); row.append(go, actions, runningArc);
  // Do not let plugin-owned clicks/presses enter an ancestor's native gestures.
  // Preserve the actual event and its defaults/modifiers for parent callbacks.
  row.addEventListener('pointerdown', event => event.stopPropagation());
  for (const [button, callback] of [[go, onOpen], [menu, onMenu], [clock, onSnooze]]) {
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (!button.disabled && typeof callback === 'function') callback(event);
    });
  }
  // The action remains the same button/callback and disabled ledger. Only
  // callers opting in get a Settle check rather than the generic options menu.
  let settleAction = false;
  let menuTitle = null;
  const workStates = new Set(['working', 'completed', 'reading', 'unknown', 'idle']);
  const update = (state = {}) => {
    if ('title' in state) { text.textContent = String(state.title ?? ''); go.title = text.textContent; }
    if ('selected' in state) {
      row.classList.toggle('bg-(--ui-row-active-background)', Boolean(state.selected));
      row.setAttribute('data-active', String(Boolean(state.selected)));
      // The shipped skin paints aria-current; keep it on the shell, not the
      // transparent body, so selection does not create a second inset band.
      if (state.selected) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
    }
    if ('disabled' in state) { go.disabled = Boolean(state.disabled); clock.disabled = Boolean(state.disabled); }
    if ('menuDisabled' in state || 'disabled' in state) {
      if ('menuDisabled' in state) menu.dataset.menuDisabled = String(Boolean(state.menuDisabled));
      menu.disabled = go.disabled || menu.dataset.menuDisabled === 'true';
    }
    if ('workState' in state) {
      // Rendering consumes an explicit state; it never guesses completion from
      // inactivity, selection or a missing runtime slice.
      row.setAttribute('data-work-state', workStates.has(state.workState) ? state.workState : 'unknown');
    }
    if ('settleAction' in state) {
      settleAction = Boolean(state.settleAction);
      // Only Inbox opts into Snooze-left / Settle-right. Generic options keep
      // their original order. Move a sibling only on mode changes so ordinary
      // keyed updates cannot detach controls or disturb their keyboard focus.
      const firstAction = settleAction ? clock : menu;
      if (actions.firstElementChild !== firstAction) actions.insertBefore(firstAction, actions.firstChild);
      menu.toggleAttribute('data-codex-inbox-settle', settleAction);
      menu.firstChild.firstChild.setAttribute('d', settleAction ? 'M3.5 8.5l3 3 6-7' : 'M3 8h.01M8 8h.01M13 8h.01');
      menu.firstChild.setAttribute('stroke-width', settleAction ? '1.25' : '2.5');
      if (settleAction) {
        menu.removeAttribute('aria-haspopup'); menu.removeAttribute('aria-expanded');
      } else {
        menu.setAttribute('aria-haspopup', 'menu'); menu.setAttribute('aria-expanded', 'false');
      }
    }
    if ('menuTitle' in state) menuTitle = state.menuTitle == null ? null : String(state.menuTitle);
    if ('menuTitle' in state || 'settleAction' in state) {
      const name = menuTitle ?? (settleAction ? 'Settle' : 'Inbox row options');
      menu.title = name; menu.setAttribute('aria-label', name);
    }
  };
  update({ title: '', selected: false, disabled: false, menuDisabled: false, workState: 'idle' });
  return { row, go, label, lead, actions, menu, clock, update };
}

globalThis.CODEX_INBOX_ROW_UI_CSS = CODEX_INBOX_ROW_UI_CSS;
globalThis.createCodexInboxRowUI = createCodexInboxRowUI;


// Standalone block: bundled by the parent plugin. No imports or network access.
const CODEX_INBOX_STORE = 'inbox-state-v1';


function codexInboxScope(scope) {
  if (!scope || typeof scope.profile !== 'string' || !scope.profile) return null;
  if (typeof scope.connectionId !== 'string') return null;
  return { connectionId: scope.connectionId, profile: scope.profile };
}

function codexInboxId(session) {
  const id = typeof session === 'string' ? session : session?.id ?? session?.session_id;
  return typeof id === 'string' && id ? id : null;
}

function codexInboxOwnedBy(scope, session) {
  return !!scope && (!session?.profile || session.profile === scope.profile) &&
    (session?._connection_id == null || session._connection_id === scope.connectionId) &&
    (session?.connectionId == null || session.connectionId === scope.connectionId) &&
    (session?.connection_id == null || session.connection_id === scope.connectionId);
}

function codexInboxKey(scope, durableId) {
  const valid = codexInboxScope(scope);
  const id = codexInboxId(durableId);
  return valid && id ? JSON.stringify([valid.connectionId, valid.profile, id]) : null;
}

function codexInboxWorkStatus(value) {
  const status = typeof value === 'string' ? value : value?.status ?? value?.state;
  if (status === 'resuming') return 'reading';
  if (value === true || value?.busy === true) return 'work';
  if (value === false) return 'idle';
  if (['starting', 'running', 'working', 'streaming', 'waiting', 'needs-input', 'queued'].includes(status)) return 'work';
  if (['idle', 'resuming', 'completed', 'done', 'stopped'].includes(status)) return status === 'resuming' ? 'reading' : 'idle';
  return 'unknown';
}

function createCodexInboxModel(storage, { restoreAttention } = {}) {
  let state = { version: 1, records: {}, aliases: {} };
  let error = null;
  const listeners = new Set();
  const expired = new Map();
  const validTimestamp = value => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
  const notify = event => { for (const fn of listeners) { try { fn(event); } catch { /* A view subscriber cannot undo a saved model transaction. */ } } };
  const validKey = key => {
    try { const p = JSON.parse(key); return Array.isArray(p) && p.length === 3 && typeof p[0] === 'string' && p.slice(1).every(v => typeof v === 'string' && v); }
    catch { return false; }
  };
  try {
    const raw = storage?.get?.(CODEX_INBOX_STORE);
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (saved != null) {
      if (saved.version !== 1 || !saved.records || !saved.aliases) throw Error('Invalid Inbox state');
      for (const [key, record] of Object.entries(saved.records)) {
        if (!validKey(key) || !record || typeof record !== 'object') continue;
        const watermarks = {};
        for (const [id, count] of Object.entries(record.watermarks || {})) {
          if (id && Number.isSafeInteger(count) && count >= 0) Object.defineProperty(watermarks, id, { value: count, enumerable: true, writable: true, configurable: true });
        }
        state.records[key] = {
          settledAt: Number.isFinite(record.settledAt) && record.settledAt > 0 ? record.settledAt : null, watermarks,
          snoozeUntil: validTimestamp(record.snoozeUntil) ? record.snoozeUntil : null,
          snoozedAt: validTimestamp(record.snoozedAt) ? record.snoozedAt : validTimestamp(record.snoozeUntil) ? 1 : null,
          ...(record.manualSettled === true ? { manualSettled: true } : {})
        };
      }
      for (const [alias, root] of Object.entries(saved.aliases)) {
        if (!validKey(alias) || !validKey(root)) continue;
        const a = JSON.parse(alias), r = JSON.parse(root);
        if (a[0] === r[0] && a[1] === r[1] && state.records[root]) state.aliases[alias] = root;
      }
    }
  } catch { error = 'Inbox state could not be read. Settle and Snooze are unavailable until storage recovers.'; }

  const putCount = (record, id, count) => {
    const previous = Object.prototype.hasOwnProperty.call(record.watermarks, id) ? record.watermarks[id] : 0;
    Object.defineProperty(record.watermarks, id, { value: Math.max(previous, count), enumerable: true, writable: true, configurable: true });
  };
  const accept = (scope, session) => {
    if (!codexInboxKey(scope, session)) return false;
    if (typeof session !== 'object' || !session) return true;
    return codexInboxOwnedBy(scope, session);
  };
  const rootKey = (draft, scope, session) => {
    if (!accept(scope, session)) return null;
    const own = codexInboxKey(scope, session);
    const declared = typeof session === 'object' ? codexInboxKey(scope, session._lineage_root_id) : null;
    return draft.aliases[declared] || declared || draft.aliases[own] || own;
  };
  const associate = (draft, scope, session) => {
    const key = rootKey(draft, scope, session);
    if (!key) return null;
    const own = codexInboxKey(scope, session);
    const ids = [codexInboxId(session), ...(Array.isArray(session?._lineage_ids) ? session._lineage_ids : [])];
    if (session?._lineage_root_id) ids.push(session._lineage_root_id);
    const record = draft.records[key] || { settledAt: null, watermarks: {}, snoozeUntil: null, snoozedAt: null };
    // A lineage discovered after settling retains its prior durable record.
    for (const id of ids) {
      const alias = codexInboxKey(scope, id);
      if (!alias) continue;
      const priorKey = draft.aliases[alias] || alias;
      const prior = draft.records[priorKey];
      if (prior && prior !== record) {
        record.settledAt = Math.max(record.settledAt || 0, prior.settledAt || 0) || null;
        if (prior.settledAt && prior.manualSettled === true) record.manualSettled = true;
        // Keep the most recent explicit duration/cancellation when lineage arrives late.
        if ((prior.snoozedAt || 0) > (record.snoozedAt || 0) ||
            (prior.snoozedAt && prior.snoozedAt === record.snoozedAt && !prior.snoozeUntil)) {
          record.snoozeUntil = prior.snoozeUntil; record.snoozedAt = prior.snoozedAt;
        }
        for (const [pid, count] of Object.entries(prior.watermarks)) putCount(record, pid, count);
        for (const [a, target] of Object.entries(draft.aliases)) if (target === priorKey) draft.aliases[a] = key;
        delete draft.records[priorKey];
      }
      draft.aliases[alias] = key;
    }
    draft.aliases[own] = key;
    draft.records[key] = record;
    return { key, record, id: codexInboxId(session) };
  };
  const snoozeTime = draft => {
    // Millisecond ordering keeps two rapid decisions unambiguous during late lineage
    // discovery, even when the system clock moves backwards between those decisions.
    let at = Date.now();
    for (const record of Object.values(draft.records)) at = Math.max(at, (record.snoozedAt || 0) + 1);
    return Math.min(at, 8640000000000000);
  };
  const transaction = (change, event) => {
    const draft = JSON.parse(JSON.stringify(state));
    const result = change(draft);
    if (result === false) return false;
    if (JSON.stringify(draft) === JSON.stringify(state)) {
      // A repeated manual decision still fences earlier queued work, even
      // when it saves identical bytes within the same clock millisecond.
      if (event) notify(event);
      return result;
    }
    try {
      if (typeof storage?.set !== 'function') throw Error('Storage unavailable');
      storage.set(CODEX_INBOX_STORE, draft);
      // The desktop SDK can silently swallow quota/permission errors. A write is
      // committed only after an exact structural readback, including string stores.
      const saved = storage.get?.(CODEX_INBOX_STORE);
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
      if (canonical(parsed) !== canonical(draft)) throw Error('Inbox storage readback failed');
      state = draft;
      error = null;
      notify(event);
      return result;
    } catch {
      error = 'Inbox state could not be saved. No Inbox changes were applied.';
      notify();
      return false;
    }
  };
  return {
    key: (scope, session) => rootKey(state, scope, session),
    isSettled(scope, session) { const key = rootKey(state, scope, session); return !!(key && state.records[key]?.settledAt); },
    isManualSettled(scope, session) { const key = rootKey(state, scope, session); return !!(key && state.records[key]?.settledAt && state.records[key].manualSettled === true); },
    snoozedUntil(scope, session) { const key = rootKey(state, scope, session); return key && state.records[key]?.snoozeUntil || null; },
    isSnoozed(scope, session, now = Date.now()) {
      const key = rootKey(state, scope, session);
      return !!(key && state.records[key]?.snoozeUntil > now);
    },
    snooze(scope, session, until) {
      if (!validTimestamp(until) || until <= Date.now()) return false;
      return transaction(draft => {
        const item = associate(draft, scope, session);
        if (!item) return false;
        item.record.snoozeUntil = until; item.record.snoozedAt = snoozeTime(draft);
        return true;
      });
    },
    cancelSnooze(scope, session) {
      const restoreKey = rootKey(state, scope, session);
      if (state.records[restoreKey]?.snoozeUntil && restoreAttention?.(scope, session) === false) { notify(); return false; }
      return transaction(draft => {
        const key = rootKey(draft, scope, session);
        if (!key) return false;
        if (draft.records[key]?.snoozeUntil) {
          draft.records[key].snoozeUntil = null; draft.records[key].snoozedAt = snoozeTime(draft);
        }
        return true;
      });
    },
    nextSnoozeDeadline(now = Date.now()) {
      let next = null;
      for (const record of Object.values(state.records)) {
        if (record.snoozeUntil > now && (next === null || record.snoozeUntil < next)) next = record.snoozeUntil;
      }
      return next;
    },
    // Runtime-owned timers call this on expiry/resume. No persistence write is needed:
    // isSnoozed always reads the wall clock, and subscribe wakes native React badges.
    expireSnoozes(now = Date.now()) {
      let changed = false;
      for (const [key, record] of Object.entries(state.records)) {
        const token = JSON.stringify([record.snoozedAt, record.snoozeUntil]);
        if (record.snoozeUntil && record.snoozeUntil <= now && expired.get(key) !== token) {
          expired.set(key, token); changed = true;
        }
      }
      if (changed) notify();
      return changed;
    },
    settle(scope, session, options = {}) {
      return transaction(draft => {
        const item = associate(draft, scope, session);
        if (!item) return false;
        const count = session?.message_count;
        if (Number.isSafeInteger(count) && count >= 0) putCount(item.record, item.id, count);
        item.record.settledAt = Date.now();
        if (options.manual === true) item.record.manualSettled = true;
        else delete item.record.manualSettled;
        return true;
      }, options.manual === true ? { type: 'manual-settle', scope, session } : undefined);
    },
    unsettle(scope, session) {
      const restoreKey = rootKey(state, scope, session);
      if (state.records[restoreKey]?.settledAt && restoreAttention?.(scope, session) === false) { notify(); return false; }
      return transaction(draft => {
        const key = rootKey(draft, scope, session);
        if (!key) return false;
        if (draft.records[key]) { draft.records[key].settledAt = null; delete draft.records[key].manualSettled; }
        return true;
      });
    },
    reopen(scope, session) {
      if (restoreAttention?.(scope, session) === false) { notify(); return false; }
      return transaction(draft => {
        const item = associate(draft, scope, session);
        if (!item) return false;
        item.record.settledAt = null; delete item.record.manualSettled;
        if (item.record.snoozeUntil) {
          item.record.snoozeUntil = null; item.record.snoozedAt = snoozeTime(draft);
        }
        return true;
      });
    },
    ingest(scope, sessions = [], options = {}) {
      if (!codexInboxScope(scope)) return false;
      return transaction(draft => {
        for (const session of sessions) {
          const item = associate(draft, scope, session);
          if (!item) continue;
          const count = session?.message_count;
          if (Number.isSafeInteger(count) && count >= 0) {
            const previous = Object.prototype.hasOwnProperty.call(item.record.watermarks, item.id) ? item.record.watermarks[item.id] : undefined;
            if (previous !== undefined && count > previous && item.record.manualSettled !== true) item.record.settledAt = null;
            putCount(item.record, item.id, count);
          }
        }
        for (const session of options.liveSessions || []) {
          if (!accept(scope, session) || codexInboxWorkStatus(session) !== 'work') continue;
          const item = associate(draft, scope, session);
          if (item && item.record.manualSettled !== true) item.record.settledAt = null;
        }
        return true;
      });
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get error() { return error; }
  };
}

// Current routing and immutable creation surfaces may differ after a resume.
// Unknown/new source kinds require an explicit compatibility review, not a guess.
function codexInboxSource(session) {
  if (!session || typeof session !== 'object') return 'unknown';
  const source = session.source, created = session.created_source;
  if (source === 'cron' || created === 'cron') return 'cron';
  const known = ['desktop', 'tui', 'cli', 'web', 'local', 'api', 'api_server', 'tool', 'subagent', 'kanban',
    'telegram', 'discord', 'whatsapp', 'whatsapp_cloud', 'slack', 'signal', 'mattermost', 'matrix',
    'homeassistant', 'email', 'sms', 'dingtalk', 'webhook', 'msgraph_webhook', 'feishu', 'wecom',
    'wecom_callback', 'weixin', 'bluebubbles', 'qqbot', 'yuanbao', 'relay',
    'line', 'teams', 'ntfy', 'simplex', 'irc', 'a2a', 'raft', 'buzz', 'photon', 'google_chat'];
  if (!known.includes(source) || created != null && !known.includes(created)) return 'unknown';
  return 'noncron';
}

// v1 admissions mixed creation/open/work and cannot certify which happened.
// Keep that store untouched as a backup; v2 starts with verified work only.
// User Settle/Snooze records and aliases live in their unchanged separate store.
function createCodexInboxAdmission(storage, model) {
  const storeKey = 'inbox-admission-v2';
  let state = { version: 2, admitted: {}, blocked: {} }, error = null, readable = false;
  const pendingAdmissions = new Map(), blocked = new Set(), sources = new Map();
  const scopeKey = scope => { const valid = codexInboxScope(scope); return valid ? JSON.stringify([valid.connectionId, valid.profile]) : null; };
  const validKey = (key, length) => {
    try { const tuple = JSON.parse(key); return Array.isArray(tuple) && tuple.length === length && typeof tuple[0] === 'string' && tuple.slice(1).every(v => typeof v === 'string' && v); }
    catch { return false; }
  };
  const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
  const load = () => {
    try {
      if (typeof storage?.get !== 'function') throw Error('Storage unavailable');
      const raw = storage.get(storeKey), saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (saved != null) {
        const objectMap = value => value && typeof value === 'object' && !Array.isArray(value);
        if (saved.version !== 2 || !objectMap(saved.admitted) || !objectMap(saved.blocked)) throw Error('Invalid Inbox admission');
        for (const records of [saved.admitted, saved.blocked]) {
          for (const [key, value] of Object.entries(records)) if (!validKey(key, 3) || value !== true) throw Error('Invalid Inbox admission');
        }
        state = JSON.parse(JSON.stringify(saved));
        Object.keys(state.blocked).forEach(key => blocked.add(key));
      }
      readable = true; error = null; return true;
    } catch {
      readable = false; error = 'Inbox admission could not be read. Historical chats remain excluded until storage recovers.'; return false;
    }
  };
  load();
  const ids = session => [...new Set([codexInboxId(session), session?._lineage_root_id,
    ...(Array.isArray(session?._lineage_ids) ? session._lineage_ids : [])].filter(id => typeof id === 'string' && id))];
  const keys = (scope, session) => [...new Set([...ids(session).map(id => codexInboxKey(scope, id)), model?.key(scope, session)].filter(Boolean))];
  const allowed = (scope, session) => {
    if (!scopeKey(scope) || !codexInboxOwnedBy(scope, session)) return false;
    const rowKeys = keys(scope, session);
    if (!rowKeys.length || rowKeys.some(key => blocked.has(key) || state.blocked[key])) return false;
    // Strings and captured Undo identities use known, already verified work.
    // A full metadata row cannot borrow a previous safe classification.
    if (session && typeof session === 'object' && Object.hasOwn(session, 'source')) {
      if (codexInboxSource(session) !== 'noncron') return false;
    } else if (session && typeof session === 'object' && Object.keys(session).some(key =>
      !['id', 'session_id', 'profile', 'connectionId', 'connection_id', '_connection_id', '_lineage_root_id', '_lineage_ids'].includes(key))) return false;
    return !rowKeys.some(key => sources.has(key) && sources.get(key) !== 'noncron');
  };
  const eligible = (draft, scope, session) => allowed(scope, session) && keys(scope, session).some(key => draft.admitted[key] === true);
  const recordSessionIds = (scope, records) => {
    if (!readable || !scopeKey(scope)) return [];
    const owner = scopeKey(scope), ids = new Map();
    for (const key of Object.keys(records)) {
      const tuple = JSON.parse(key);
      if (JSON.stringify(tuple.slice(0, 2)) === owner) ids.set(model?.key(scope, tuple[2]) || key, tuple[2]);
    }
    return [...ids.values()];
  };
  return {
    cutoff: () => null,
    isEligible: (scope, session) => readable && eligible(state, scope, session),
    restore: (scope, session) => readable && eligible(state, scope, session),
    explicitSessionIds() { return []; },
    admittedSessionIds(scope) { return recordSessionIds(scope, state.admitted).filter(id => allowed(scope, id)); },
    observe(scope, sessions = [], options = {}) {
      const owner = scopeKey(scope);
      if (!owner) return false;
      if (!pendingAdmissions.has(owner)) pendingAdmissions.set(owner, new Set());
      const pending = pendingAdmissions.get(owner), working = new Set();
      // Classify the complete snapshot before admitting anything. Cron taint
      // follows only supported lineage/aliases, including late discovery.
      const rows = sessions.filter(session => codexInboxId(session) && codexInboxOwnedBy(scope, session));
      const classifications = new Map(), provenance = new Map();
      for (const session of rows) {
        const source = codexInboxSource(session);
        for (const key of keys(scope, session)) {
          const prior = classifications.get(key);
          const conflict = prior === 'noncron' && source === 'noncron' && provenance.get(key) !== session.source;
          classifications.set(key, prior === 'cron' || source === 'cron' ? 'cron' : conflict || prior && prior !== source ? 'unknown' : source);
          if (!provenance.has(key)) provenance.set(key, session.source);
        }
      }
      classifications.forEach((source, key) => { sources.set(key, source); if (source === 'cron') blocked.add(key); });
      let changed;
      do {
        changed = false;
        for (const session of rows) {
          const rowKeys = keys(scope, session);
          if (rowKeys.some(key => blocked.has(key))) for (const key of rowKeys) if (!blocked.has(key)) { blocked.add(key); changed = true; }
        }
      } while (changed);
      for (const session of options.workingSessions || []) if (allowed(scope, session) && codexInboxSource(session) === 'noncron') keys(scope, session).forEach(key => working.add(key));
      for (const live of options.liveSessions || []) {
        if (!codexInboxOwnedBy(scope, live) || codexInboxWorkStatus(live) !== 'work') continue;
        const liveIds = [...ids(live), live.session_key, live.stored_session_id].filter(Boolean);
        // Do not invent a durable chat from a transient runtime ID.
        for (const row of rows) if (allowed(scope, row) && codexInboxSource(row) === 'noncron' && ids(row).some(id => liveIds.includes(id))) keys(scope, row).forEach(key => working.add(key));
      }
      // Keep verified work intent pending across a failed save and subsequent
      // idle refresh. It is still excluded until a durable readback succeeds.
      working.forEach(key => pending.add(key));
      if (!readable && !load()) return false;
      const draft = JSON.parse(JSON.stringify(state));
      for (const session of rows) {
        if (!allowed(scope, session) || codexInboxSource(session) !== 'noncron') continue;
        const rowKeys = keys(scope, session);
        if (eligible(draft, scope, session) || rowKeys.some(key => working.has(key))) {
          for (const key of rowKeys) { draft.admitted[key] = true; pending.add(key); }
        }
      }
      for (const key of pending) if (!blocked.has(key) && sources.get(key) === 'noncron') draft.admitted[key] = true;
      for (const key of blocked) { draft.blocked[key] = true; delete draft.admitted[key]; pending.delete(key); }
      if (canonical(draft) === canonical(state) && !error) { pending.clear(); return true; }
      try {
        if (typeof storage?.set !== 'function') throw Error('Storage unavailable');
        storage.set(storeKey, draft);
        const raw = storage.get(storeKey), saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (canonical(saved) !== canonical(draft)) throw Error('Inbox admission readback failed');
        state = draft; pending.clear(); error = null; return true;
      } catch {
        error = 'Inbox admission could not be saved. New admissions were not applied; existing attention is preserved.'; return false;
      }
    },
    get error() { return error; }
  };
}

function installCodexInboxRuntime({ storage, host, document: doc = document, window: win = window }) {
  // Hot reload replaces only this DOM adapter, never the host's native children.
  const registryKey = '__codexInboxRuntimeDispose';
  doc[registryKey]?.();
  let admission;
  const model = createCodexInboxModel(storage, {
    restoreAttention: (scope, session) => admission.restore(scope, session)
  });
  admission = createCodexInboxAdmission(storage, model);
  let on = false;
  try { on = storage?.get?.('inbox', 'on') !== 'off'; } catch { /* Fail closed until the parent supplies a mode. */ }
  let disposed = false, raf = null, island = null, style = null, container = null;
  let deadlineTimer = null, armingDeadline = false, snoozePopup = null;
  const rowBindings = new Map();
  const settleNotices = new Map();
  const activityByKey = new Map();
  const timerHost = win.setTimeout ? win : doc.defaultView;
  const clearDeadline = () => { if (deadlineTimer !== null) timerHost.clearTimeout(deadlineTimer); deadlineTimer = null; };
  const refreshDeadline = () => {
    if (armingDeadline) return;
    armingDeadline = true;
    try {
      clearDeadline();
      if (disposed || !on) return;
      model.expireSnoozes();
      const next = model.nextSnoozeDeadline();
      if (next !== null) deadlineTimer = timerHost.setTimeout(() => {
        deadlineTimer = null; refreshDeadline(); requestRender();
      }, Math.max(1, Math.min(2147483647, next - Date.now())));
    } finally { armingDeadline = false; }
  };
  let inboxOpen = true, signature = null, currentScope = null;
  let input = { sessions: [], liveSessions: [], liveStatusKnown: false, loading: true };
  const badgeBindings = new Map();
  const settledBadgeBindings = new Map();
  const externalBindings = new Map();
  const own = 'data-codex-inbox-owned';
  const owns = node => node?.nodeType === 1 ? !!node.closest(`[${own}]`) : !!node?.parentElement?.closest(`[${own}]`);
  const setAttr = (el, name, value) => { if (el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value)); };
  const visibleSessions = () => {
    const rows = new Map();
    for (const session of input.sessions) {
      if (!codexInboxId(session) || session.archived || session.hidden || !codexInboxOwnedBy(currentScope, session)) continue;
      const key = model.key(currentScope, session);
      if (!rows.has(key)) rows.set(key, session);
    }
    return [...rows.values()];
  };
  const inboxSessions = () => visibleSessions().filter(session => admission.isEligible(currentScope, session));
  const findSession = id => visibleSessions().find(s => codexInboxId(s) === id || s._lineage_root_id === id || s._lineage_ids?.includes(id));
  const runtimeAliases = session => {
    const aliases = new Set([codexInboxId(session), session?._lineage_root_id, ...(session?._lineage_ids || [])].filter(Boolean));
    const owner = codexInboxScope(host.state?.focusedSessionOwner?.get?.());
    const stored = host.state?.focusedStoredSessionId?.get?.();
    if (owner && JSON.stringify(owner) === JSON.stringify(currentScope) && aliases.has(stored)) {
      const runtimeId = host.state?.focusedSessionId?.get?.();
      if (typeof runtimeId === 'string' && runtimeId) aliases.add(runtimeId);
    }
    for (const live of input.liveSessions || []) {
      if (!codexInboxOwnedBy(currentScope, live)) continue;
      const ids = [live.session_id, live.id, live.session_key, live.stored_session_id, live._lineage_root_id, ...(live._lineage_ids || [])].filter(Boolean);
      if (ids.some(id => aliases.has(id))) ids.forEach(id => aliases.add(id));
    }
    return aliases;
  };
  const safety = (session, admissionCheck = false) => {
    const ids = runtimeAliases(session);
    let unresolved = input.liveStatusKnown !== true;
    let reading = false;
    for (const live of input.liveSessions || []) {
      if (!codexInboxOwnedBy(currentScope, live)) continue;
      if (![live.id, live.session_id, live.session_key, live.stored_session_id, live._lineage_root_id].some(id => ids.has(id))) continue;
      const status = codexInboxWorkStatus(live);
      if (status === 'work') return 'work';
      if (status === 'unknown') unresolved = true;
      if (status === 'reading') reading = true;
    }
    for (const id of admissionCheck && input.busyOwnerKnown === false ? [] : ids) {
      const busy = input.busyBySession instanceof Map ? input.busyBySession.get(id) : input.busyBySession?.[id];
      if (busy === undefined) continue;
      const status = codexInboxWorkStatus(busy);
      if (status === 'work') return 'work';
      if (status === 'unknown') unresolved = true;
      if (status === 'reading') reading = true;
    }
    return unresolved ? 'unknown' : reading ? 'reading' : 'idle';
  };
  const reconcileAdmission = () => {
    const sessions = visibleSessions(), working = input.loading || input.error || input.liveStatusKnown !== true ? [] : sessions.filter(session => safety(session, true) === 'work');
    // Rendering deduplicates lineage rows, never their source evidence. A late
    // cron ancestor/alias must taint the whole thread whichever row comes first.
    admission.observe(currentScope, input.sessions, { workingSessions: working });
    model.ingest(currentScope, sessions, { liveSessions: working.map(session => ({ ...session, status: 'working' })) });
  };
  const reconcileActivity = () => {
    if (input.loading || input.error) return;
    for (const session of inboxSessions()) {
      const key = model.key(currentScope, session), previous = activityByKey.get(key);
      const status = safety(session, true), newer = Number.isFinite(input.liveStatusAt) && input.liveStatusAt > (previous?.at || 0);
      // A terminal frame precedes backend cleanup. A late working snapshot
      // cannot cancel that receipt; a new positive work event can.
      if (status === 'work' && !['completed', 'read'].includes(previous?.phase) && (!previous || newer)) {
        activityByKey.set(key, { phase: 'working', at: input.liveStatusAt || Date.now(), children: previous?.children || new Set() });
      } else if (status === 'idle' && previous?.phase === 'working' && !previous.children.size && newer) {
        activityByKey.set(key, { ...previous, phase: session.unread === true ? 'completed' : 'unknown', at: input.liveStatusAt });
      }
    }
  };
  const viewedReply = session => {
    const owner = codexInboxScope(host.state?.focusedSessionOwner?.get?.());
    const stored = host.state?.focusedStoredSessionId?.get?.();
    const runtime = host.state?.focusedSessionId?.get?.();
    if (!owner || !stored || !runtime || JSON.stringify(owner) !== JSON.stringify(currentScope) ||
        !runtimeAliases(session).has(stored) || doc.visibilityState !== 'visible' || !doc.hasFocus()) return false;
    const anchors = new Set([...runtimeAliases(session)].map(id => `session-tile:${id}`));
    if (host.state?.activeSessionId?.get?.() === runtime &&
        host.state?.connectionId?.get?.() === owner.connectionId && host.state?.profile?.get?.() === owner.profile) anchors.add('workspace');
    for (const surface of doc.querySelectorAll('[data-chat-surface][data-session-anchor]')) {
      if (!anchors.has(surface.getAttribute('data-session-anchor')) ||
          surface.closest('[data-pane-hidden], [inert], [aria-hidden="true"], [data-session-switching]')) continue;
      const viewport = surface.querySelector('[data-slot="aui_thread-viewport"]');
      if (!viewport || viewport.getAttribute('data-following') !== 'true') continue;
      const pair = [...viewport.querySelectorAll('[data-slot="aui_turn-pair"]')].at(-1);
      // Native footers belong to the last text reply, not a trailing tool-only bubble.
      const reply = pair && [...pair.querySelectorAll('[data-slot="aui_assistant-message-root"]')]
        .filter(root => root.closest('[data-slot="aui_turn-pair"]') === pair && root.querySelector('[data-slot="aui_msg-actions"]')).at(-1);
      if (!reply) continue;
      const bounds = viewport.getBoundingClientRect(), end = reply.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0 && end.width > 0 && end.height > 0 &&
          end.bottom > bounds.top && end.bottom <= bounds.bottom + 1 && end.right > bounds.left && end.left < bounds.right) return true;
    }
    return false;
  };
  const workState = session => {
    if (input.loading || input.error) return 'unknown';
    const key = model.key(currentScope, session), status = safety(session, true), activity = activityByKey.get(key);
    if (status === 'unknown' || status === 'reading') return status;
    if (activity?.phase === 'read') return 'idle';
    if (activity?.phase === 'completed' || status === 'idle' && session.unread === true) {
      if (!viewedReply(session)) return 'completed';
      // Reading acknowledges this reply's paint only. It never settles,
      // snoozes or admits a thread, and fresh work resets the receipt.
      activityByKey.set(key, { ...activity, phase: 'read', at: activity?.at || Date.now(), children: activity?.children || new Set() });
      return 'idle';
    }
    if (status === 'work' || activity?.phase === 'working') return 'working';
    if (activity?.phase === 'unknown') return 'unknown';
    // Native unread marks a completed reply. Merely idle/busy:false does not.
    return session.unread === true ? 'completed' : 'idle';
  };
  const requestRender = () => {
    if (!disposed && raf === null) raf = win.requestAnimationFrame(() => { raf = null; render(); });
  };
  const button = (label, handler) => {
    const el = doc.createElement('button');
    el.type = 'button'; el.textContent = label; el.addEventListener('click', handler);
    return el;
  };
  const stop = event => { event.preventDefault(); event.stopPropagation(); };
  const routeOptions = () => ({ profile: currentScope.profile, route: { ...currentScope } });
  const open = session => { if (!disposed && on && currentScope && codexInboxOwnedBy(currentScope, session)) host.openSession?.(codexInboxId(session), routeOptions()); };
  const active = session => {
    const stored = host.state?.focusedStoredSessionId?.get?.();
    const id = stored || host.state?.activeSessionId?.get?.();
    const focusedOwner = host.state?.focusedSessionOwner?.get?.();
    if (focusedOwner != null) {
      const owner = codexInboxScope(focusedOwner);
      if (!owner || owner.profile !== currentScope.profile || owner.connectionId !== currentScope.connectionId) return false;
    } else {
      const profile = host.state?.focusedSessionProfile?.get?.() || host.state?.profile?.get?.();
      const connection = host.state?.connectionId?.get?.();
      if (profile && profile !== currentScope.profile || typeof connection === 'string' && connection !== currentScope.connectionId) return false;
    }
    return !!id && runtimeAliases(session).has(id);
  };
  const removeFromInbox = (session, save) => {
    const isCurrent = active(session);
    const all = inboxSessions();
    const index = all.findIndex(s => model.key(currentScope, s) === model.key(currentScope, session));
    const following = [...all.slice(index + 1), ...all.slice(0, Math.max(0, index))];
    const candidates = following.filter(s => model.key(currentScope, s) !== model.key(currentScope, session) && !model.isSettled(currentScope, s) && !model.isSnoozed(currentScope, s));
    if (!save()) return false;
    if (isCurrent) {
      if (candidates.length) open(candidates[0]);
      else host.newChat?.({ ...currentScope });
    }
    requestRender();
    return true;
  };
  const sameScope = scope => JSON.stringify(codexInboxScope(scope)) === JSON.stringify(currentScope);
  const clearSettleNotice = item => {
    if (settleNotices.get(item.key) !== item) return;
    timerHost.clearTimeout(item.timer); settleNotices.delete(item.key);
  };
  const clearSettleNotices = () => { for (const item of settleNotices.values()) clearSettleNotice(item); };
  const undoSettle = item => {
    if (disposed || !on || !sameScope(item.scope) || settleNotices.get(item.key) !== item) return false;
    // Check the deadline in the handler too: sleeping/throttled timers confer no
    // extra time. The captured owner and durable identity never follow new focus.
    if (Date.now() >= item.until) { clearSettleNotice(item); requestRender(); return false; }
    if (!model.unsettle(item.scope, item.session)) { requestRender(); return false; }
    clearSettleNotice(item); requestRender(); return true;
  };
  const settle = session => {
    if (disposed || !on || !currentScope || !codexInboxOwnedBy(currentScope, session)) return false;
    const fresh = findSession(codexInboxId(session));
    if (!fresh || codexInboxId(fresh) !== codexInboxId(session) || !admission.isEligible(currentScope, fresh) ||
        model.isSettled(currentScope, fresh) || model.isSnoozed(currentScope, fresh)) return false;
    const scope = { ...currentScope };
    const result = removeFromInbox(fresh, () => {
      if (!model.settle(scope, fresh, { manual: true })) return false;
      const key = model.key(scope, fresh);
      clearSettleNotices();
      const captured = { id: codexInboxId(fresh), ...scope };
      if (fresh._lineage_root_id) captured._lineage_root_id = fresh._lineage_root_id;
      if (Array.isArray(fresh._lineage_ids)) captured._lineage_ids = [...fresh._lineage_ids];
      const item = { key, scope, session: captured, until: Date.now() + 3000, timer: null };
      settleNotices.set(key, item);
      item.timer = timerHost.setTimeout(() => { clearSettleNotice(item); requestRender(); }, 3000);
      return true;
    });
    if (result) render();
    return result;
  };
  const snooze = (session, until, scope = currentScope) => {
    if (disposed || !on || !currentScope || !sameScope(scope) || input.loading || input.error ||
        !codexInboxOwnedBy(currentScope, session) || model.isSettled(currentScope, session)) return false;
    const fresh = findSession(codexInboxId(session));
    return fresh ? removeFromInbox(fresh, () => model.snooze(currentScope, fresh, until)) : false;
  };
  const cancelSnooze = (session, scope = currentScope) => {
    if (disposed || !on || !currentScope || !sameScope(scope)) return false;
    return model.cancelSnooze(currentScope, session);
  };
  const closeSnoozePopup = (restoreFocus = true) => {
    const item = snoozePopup;
    if (!item) return;
    snoozePopup = null; item.element.remove();
    item.anchor.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', item.outside, true);
    doc.removeEventListener('keydown', item.keydown, true);
    win.removeEventListener?.('resize', item.position);
    doc.removeEventListener('scroll', item.position, true);
    if (restoreFocus && item.anchor.isConnected) item.anchor.focus();
  };
  const rowSession = row => {
    const binding = rowBindings.get(row.getAttribute('data-codex-inbox-key'));
    return !disposed && on && binding?.row === row && row.isConnected && sameScope(binding.scope) ? findSession(binding.id) : null;
  };
  const showSnoozePopup = (session, anchor, event) => {
    if (disposed || !on || !currentScope || input.loading || input.error) return;
    if (snoozePopup?.anchor === anchor) {
      const pointer = event?.detail > 0;
      closeSnoozePopup(!pointer);
      if (pointer && doc.activeElement === anchor) anchor.blur();
      return;
    }
    closeSnoozePopup(false);
    const element = doc.createElement('div');
    element.setAttribute(own, 'popup'); element.setAttribute('data-codex-inbox-snooze-popup', '');
    element.setAttribute('role', 'menu'); element.setAttribute('aria-label', 'Snooze thread');
    const item = { element, anchor, id: codexInboxId(session), scope: { ...currentScope } };
    snoozePopup = item; anchor.setAttribute('aria-expanded', 'true');
    const choose = duration => {
      if (snoozePopup !== item || !sameScope(item.scope) || disposed || !on) return;
      const fresh = findSession(item.id);
      if (fresh && snooze(fresh, Date.now() + duration, item.scope)) closeSnoozePopup(false);
      // A failed save keeps this exact menu open. Errors paint in the Inbox,
      // never as extra menu options, fields or a footer.
      else requestRender();
    };
    const controls = [];
    for (const [label, duration] of [['15 min', 900000], ['30 min', 1800000], ['1 hour', 3600000], ['3 hours', 10800000], ['1 day', 86400000]]) {
      const option = button(label, event => { stop(event); choose(duration); });
      option.setAttribute('role', 'menuitem'); option.tabIndex = -1;
      option.addEventListener('pointermove', () => {
        if (snoozePopup === item && doc.activeElement !== option) option.focus({ preventScroll: true });
      });
      controls.push(option); element.appendChild(option);
    }
    item.position = () => {
      const rect = anchor.getBoundingClientRect();
      const view = doc.defaultView, width = Math.min(160, Math.max(0, view.innerWidth - 16));
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(8, Math.min(rect.right - width, view.innerWidth - width - 8))}px`;
      const height = element.getBoundingClientRect().height;
      element.style.top = `${Math.max(8, Math.min(rect.bottom + 4, view.innerHeight - height - 8))}px`;
    };
    item.outside = event => { if (!element.contains(event.target) && !anchor.contains(event.target)) closeSnoozePopup(false); };
    item.keydown = event => {
      // Dismissal never cancels the host's original event or steals an outside
      // click. Only menu-owned navigation/activation consumes a key.
      if (event.key === 'Escape') { closeSnoozePopup(element.contains(doc.activeElement)); return; }
      if (!element.contains(event.target)) return;
      if (event.key === 'Tab') { closeSnoozePopup(false); return; }
      const index = controls.indexOf(doc.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        stop(event);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 :
          (Math.max(0, index) + (event.key === 'ArrowDown' ? 1 : controls.length - 1)) % controls.length;
        controls[next].focus();
      } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
        stop(event); if (!event.repeat) controls[index].click();
      }
    };
    doc.body.appendChild(element); item.position();
    doc.addEventListener('pointerdown', item.outside, true); doc.addEventListener('keydown', item.keydown, true);
    win.addEventListener?.('resize', item.position); doc.addEventListener('scroll', item.position, true);
    element.querySelector('button')?.focus();
  };
  const cleanupDOM = () => {
    closeSnoozePopup(false); clearSettleNotices(); rowBindings.clear();
    island?.remove(); island = null; signature = null; container = null;
    style?.remove(); style = null;
    for (const badge of badgeBindings.values()) badge.remove();
    badgeBindings.clear();
    for (const badge of settledBadgeBindings.values()) badge.remove();
    settledBadgeBindings.clear();
  };
  const nativeHeaderTemplate = root => {
    // Copy only a native header button and its wrapper, never rows, actions,
    // React ownership, or native listeners. Structural matching is locale-safe.
    let wrapper, header;
    for (const section of root.children) {
      if (owns(section) || !section.matches('[data-slot="sidebar-group"]')) continue;
      const candidate = [...section.children].find(el => el.classList.contains('group/section'));
      const source = [...(candidate?.children || [])].find(el => el.matches('button') && el.classList.contains('group/section-label'));
      if (!source?.querySelector('.dither') || !source.querySelector('.codicon-chevron-right') || !source.querySelector('.dither').parentElement.querySelector('.truncate')) continue;
      wrapper = candidate.cloneNode(false); header = source.cloneNode(true); break;
    }
    if (!header) {
      // Exact installed SidebarSectionHeader / SidebarPanelLabel / DisclosureCaret
      // shape, until native Pinned or Sessions mounts. Its classes inherit host fonts.
      wrapper = doc.createElement('div');
      wrapper.className = 'group/section flex shrink-0 items-center justify-between gap-1 pb-1 pt-1.5';
      header = doc.createElement('button');
      header.className = 'group/section-label flex w-fit min-w-0 items-center gap-1 bg-transparent text-left leading-none';
      const label = doc.createElement('span');
      label.className = 'flex min-w-0 items-center gap-2 pl-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-(--theme-primary)';
      const dot = doc.createElement('span'); dot.setAttribute('aria-hidden', 'true'); dot.className = 'dither inline-block size-2 shrink-0 rounded-[1px]';
      const text = doc.createElement('span'); text.className = 'min-w-0 truncate leading-none';
      label.append(dot, text);
      const caret = doc.createElement('i'); caret.setAttribute('aria-hidden', 'true'); caret.style.fontSize = '0.75rem';
      caret.className = 'codicon codicon-chevron-right shrink-0 duration-150 text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100';
      header.append(label, caret);
    }
    wrapper.appendChild(header);
    for (const node of [wrapper, ...wrapper.querySelectorAll('*')]) {
      for (const attr of [...node.attributes]) {
        if (/^on/i.test(attr.name) || attr.name === 'id' || attr.name.startsWith('data-codex-inbox-') || ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-expanded', 'title'].includes(attr.name)) node.removeAttribute(attr.name);
      }
    }
    header.type = 'button'; header.removeAttribute('disabled');
    header.querySelector('.dither').parentElement.querySelector('.truncate').textContent = 'Inbox';
    header.querySelector('.codicon-chevron-right').classList.remove('rotate-90');
    return { wrapper, header, fingerprint: wrapper.outerHTML };
  };
  const ensureStyle = () => {
    if (style?.isConnected) return;
    style = doc.createElement('style'); style.setAttribute(own, 'style');
    style.textContent = CODEX_INBOX_ROW_UI_CSS + `
/* Native Sessions keeps a growing, minimum-height viewport even when closed.
   Allocate the remaining height to Inbox; cap native lists without moving or
   rewriting their React-owned nodes. Removing the island restores the host. */
html[data-codex-chat-look='true'] [data-sessions-mode]:has(> [data-codex-inbox-owned='island']) { overflow:hidden; }
html[data-codex-chat-look='true'] [data-sessions-mode]:has(> [data-codex-inbox-owned='island']) > [data-slot='sidebar-group']:not([data-codex-inbox-owned]) { flex:0 1 auto!important; min-height:0!important; max-height:35%; overflow:hidden; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'] + [data-slot='sidebar-group'] { margin-top:auto; }
html[data-codex-chat-look='true'] [data-sessions-mode]:has(> [data-codex-inbox-owned='island']) > [data-slot='sidebar-group']:not([data-codex-inbox-owned]) > [data-slot='sidebar-group-content'] { min-height:0; overflow-y:auto; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'] { flex:1 1 0; min-height:3.5rem; color:var(--ui-text-primary); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'][data-codex-inbox-expanded='false'] { flex:0 0 auto; min-height:0; padding-bottom:0; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'] > [data-slot='sidebar-group-content'] { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='island'] > [data-slot='sidebar-group-content'][hidden] { display:none!important; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)) { color:inherit; background:transparent; border:0; cursor:pointer; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)):not([data-codex-inbox-header]):hover { background:var(--ui-control-hover-background); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)):focus-visible { outline:1px solid var(--ui-accent); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)):disabled { color:var(--ui-text-quaternary); cursor:default; }
html[data-codex-chat-look='true'] [data-codex-inbox-snooze-popup] { position:fixed; z-index:var(--z-modal-popover, 140); box-sizing:border-box; display:flex; flex-direction:column; padding:4px; max-height:calc(100vh - 16px); overflow:auto; border:1px solid var(--ui-stroke-secondary); border-radius:8px; background:color-mix(in srgb, var(--ui-bg-elevated) 96%, transparent); color:var(--ui-text-primary); font:12px var(--font-sans, system-ui); backdrop-filter:blur(12px); }
html[data-codex-chat-look='true'] [data-codex-inbox-snooze-popup] button { padding:4px 8px; text-align:left; border-radius:6px; font:inherit; line-height:16px; }
html[data-codex-chat-look='true'] [data-codex-inbox-snooze-popup] button:is(:hover,:focus) { background:var(--ui-control-active-background); color:var(--ui-text-primary); outline:none; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge'] { display:inline-flex; font-size:10px; padding:1px 4px; color:var(--ui-text-tertiary); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge'] .codex-inbox-unsettle { display:none; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge']:hover .codex-inbox-settled,
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge']:focus-within .codex-inbox-settled { display:none; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge']:hover .codex-inbox-unsettle,
html[data-codex-chat-look='true'] [data-codex-inbox-owned='badge']:focus-within .codex-inbox-unsettle { display:inline; }
html[data-codex-chat-look='true'] [data-codex-inbox-status] { padding:6px 8px; font-size:11px; color:var(--ui-text-tertiary); }
html[data-codex-chat-look='true'] [data-codex-inbox-settle-notice] { position:relative; overflow:hidden; display:flex; align-items:center; justify-content:space-between; gap:8px; margin:2px 4px; padding:4px 8px; border:1px solid var(--ui-stroke-secondary); border-radius:6px; background:var(--ui-sidebar-surface-background,var(--ui-bg-sidebar,var(--ui-bg-elevated))); color:var(--ui-text-primary); font:11px var(--font-sans, system-ui); }
html[data-codex-chat-look='true'] [data-codex-inbox-settle-notice] button { padding:2px 4px; border-radius:4px; font:inherit; }
html[data-codex-chat-look='true'] [data-codex-inbox-undo-track] { pointer-events:none; position:absolute; left:0; right:0; bottom:0; height:2px; background:color-mix(in srgb,var(--ui-accent,var(--ui-text-primary)) 12%,transparent); }
html[data-codex-chat-look='true'] [data-codex-inbox-undo-progress] { display:block; width:100%; height:100%; background:var(--ui-accent,var(--ui-text-primary)); transform-origin:left center; animation:codex-inbox-undo-progress 3s linear both; }
@keyframes codex-inbox-undo-progress { from { transform:scaleX(0); } to { transform:scaleX(1); } }
@media(prefers-reduced-motion:reduce) { html[data-codex-chat-look='true'] [data-codex-inbox-undo-progress] { animation:none; transform:scaleX(1); } }
`;
    (doc.head || doc.documentElement).appendChild(style);
  };
  const nativeSession = row => {
    const bound = externalBindings.get(row);
    return bound && bound.scope.connectionId === currentScope.connectionId && bound.scope.profile === currentScope.profile &&
      admission.isEligible(currentScope, bound.session) ? bound.session : null;
  };
  const renderBadges = root => {
    // Explicit opt-in bindings only. The shipping parent uses SESSION_ROW_AREAS;
    // do not infer identity from native labels, DOM order or conversation anchors.
    const rows = new Set(externalBindings.keys());
    for (const [row, badge] of settledBadgeBindings) {
      const session = rows.has(row) && row.isConnected && root.contains(row) && nativeSession(row);
      if (!session || !model.isSettled(currentScope, session) || !model.isSnoozed(currentScope, session)) { badge.remove(); settledBadgeBindings.delete(row); }
    }
    for (const [row, badge] of badgeBindings) {
      const session = rows.has(row) && row.isConnected && root.contains(row) && nativeSession(row);
      if (!session || !model.isSettled(currentScope, session) && !model.isSnoozed(currentScope, session)) { badge.remove(); badgeBindings.delete(row); }
    }
    for (const row of rows) {
      if (!root.contains(row) || owns(row)) continue;
      const session = nativeSession(row);
      const snoozed = session && model.isSnoozed(currentScope, session);
      if (!session || !model.isSettled(currentScope, session) && !snoozed) continue;
      let badge = badgeBindings.get(row);
      if (!badge?.isConnected) {
        badge?.remove();
        const scope = { ...currentScope };
        badge = button('', event => {
          stop(event);
          if (disposed || !on || !sameScope(scope)) return;
          const fresh = nativeSession(row);
          if (fresh) {
            if (model.isSnoozed(currentScope, fresh)) cancelSnooze(fresh, scope);
            else model.unsettle(currentScope, fresh);
          }
        });
        badge.setAttribute(own, 'badge');
        const label = doc.createElement('span'); label.className = 'codex-inbox-settled';
        const action = doc.createElement('span'); action.className = 'codex-inbox-unsettle';
        badge.append(label, action);
        const target = row.querySelector('[data-row-actions]') || row;
        // Never nest a button inside a native button; use an explicit sibling slot.
        if (target.closest('button')) continue;
        target.appendChild(badge); badgeBindings.set(row, badge);
      }
      const label = badge.querySelector('.codex-inbox-settled'), action = badge.querySelector('.codex-inbox-unsettle');
      const name = snoozed ? 'Wake now' : 'Un-settle', text = snoozed ? 'Snoozed' : 'Settled';
      if (label.textContent !== text) label.textContent = text;
      if (action.textContent !== name) action.textContent = name;
      setAttr(badge, 'aria-label', name);
      const title = snoozed ? `Snoozed until ${new Date(model.snoozedUntil(currentScope, session)).toLocaleString()}. Wake now` : name;
      if (badge.title !== title) badge.title = title;
      // Both states remain independently reversible, including while snoozed.
      if (snoozed && model.isSettled(currentScope, session)) {
        let settledBadge = settledBadgeBindings.get(row);
        if (!settledBadge?.isConnected) {
          settledBadge?.remove();
          const scope = { ...currentScope };
          settledBadge = button('', event => {
            stop(event);
            if (disposed || !on || !sameScope(scope)) return;
            const fresh = nativeSession(row); if (fresh) model.unsettle(currentScope, fresh);
          });
          settledBadge.setAttribute(own, 'badge'); settledBadge.setAttribute('aria-label', 'Un-settle'); settledBadge.title = 'Un-settle';
          const label = doc.createElement('span'); label.className = 'codex-inbox-settled'; label.textContent = 'Settled';
          const action = doc.createElement('span'); action.className = 'codex-inbox-unsettle'; action.textContent = 'Un-settle';
          settledBadge.append(label, action); badge.parentElement.appendChild(settledBadge); settledBadgeBindings.set(row, settledBadge);
        }
      }
    }
  };
  function render() {
    if (disposed) return;
    if (!on || !currentScope) { cleanupDOM(); return; }
    const root = doc.querySelector('[data-sessions-mode]');
    if (!root) { if (container) cleanupDOM(); return; }
    if (container !== root || !island?.isConnected) {
      cleanupDOM(); container = root; ensureStyle();
      island = doc.createElement('div'); island.setAttribute(own, 'island');
      island.setAttribute('data-slot', 'sidebar-group'); island.setAttribute('data-sidebar', 'group');
      island.className = 'relative flex w-full min-w-0 min-h-0 flex-col p-0 pb-1';
      const first = [...root.children].find(el => el.matches('[data-slot="sidebar-group"]'));
      root.insertBefore(island, first || root.firstChild);
    }
    setAttr(island, 'aria-busy', input.loading === true);
    const headerTemplate = nativeHeaderTemplate(root);
    for (const item of settleNotices.values()) {
      if (Date.now() >= item.until || !model.isManualSettled(item.scope, item.session)) clearSettleNotice(item);
    }
    const sessions = inboxSessions().filter(s => !model.isSettled(currentScope, s) && !model.isSnoozed(currentScope, s));
    const shown = sessions;
    const nextSignature = JSON.stringify([currentScope, inboxOpen, input.loading, !!input.error, model.error, admission.error, headerTemplate.fingerprint,
      [...settleNotices.values()].map(item => [item.key, item.until]), sessions.length, shown.map(s => [model.key(currentScope, s), codexInboxId(s), s.title, safety(s), workState(s), active(s)])]);
    if (signature !== nextSignature) {
      signature = nextSignature;
      setAttr(island, 'data-codex-inbox-expanded', inboxOpen);
      const focusedElement = island.contains(doc.activeElement) ? doc.activeElement : null;
      const focusedHeader = focusedElement?.hasAttribute('data-codex-inbox-header');
      const oldHeader = island.querySelector('[data-codex-inbox-header]');
      const scrollTop = island.querySelector('[data-slot="sidebar-group-content"]')?.scrollTop || 0;
      island.replaceChildren();
      const reuseHeader = oldHeader?.__codexInboxTemplate === headerTemplate.fingerprint;
      const header = reuseHeader ? oldHeader : headerTemplate.header;
      const wrapper = reuseHeader ? oldHeader.parentElement : headerTemplate.wrapper;
      if (!reuseHeader) {
        header.__codexInboxTemplate = headerTemplate.fingerprint;
        const toggle = event => {
          if (disposed || !on || !header.isConnected || !island.contains(header)) return;
          stop(event); inboxOpen = !inboxOpen; requestRender();
        };
        header.addEventListener('click', toggle);
        header.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { stop(event); if (!event.repeat) toggle(event); }
        });
      }
      header.setAttribute('aria-expanded', String(inboxOpen)); header.setAttribute('data-codex-inbox-header', '');
      header.querySelector('.codicon-chevron-right').classList.toggle('rotate-90', inboxOpen);
      island.appendChild(wrapper);
      const content = doc.createElement('div'); content.setAttribute('data-slot', 'sidebar-group-content'); content.className = 'w-full text-sm scrollbar-fade'; content.hidden = !inboxOpen;
      island.appendChild(content);
      const status = text => { const el = doc.createElement('div'); el.setAttribute('data-codex-inbox-status', ''); el.setAttribute('role', 'status'); el.textContent = text; content.appendChild(el); };
      if (input.error) {
        status('Inbox could not be loaded. Refresh Sessions to retry.');
        if (typeof input.retry === 'function') content.appendChild(button('Retry Inbox', () => input.retry()));
      }

      if (model.error) status(model.error);
      if (admission.error) status(admission.error);
      if (!input.loading && !input.error && !model.error && !admission.error && !sessions.length) status('Inbox is clear. Settled and snoozed threads remain in Sessions and Pinned.');
      const kept = new Set();
      for (const session of shown) {
        const key = model.key(currentScope, session);
        if (kept.has(key)) continue;
        kept.add(key);
        let binding = rowBindings.get(key);
        if (!binding) {
          const ui = createCodexInboxRowUI({
            document: doc,
            onOpen: () => { const fresh = rowSession(ui.row); if (fresh) open(fresh); },
            onMenu: event => { stop(event); const fresh = rowSession(ui.row); if (fresh) settle(fresh); },
            onSnooze: event => { stop(event); const fresh = rowSession(ui.row); if (fresh) showSnoozePopup(fresh, ui.clock, event); }
          });
          ui.row.setAttribute('data-codex-inbox-key', key);

          ui.clock.setAttribute('aria-haspopup', 'menu'); ui.clock.setAttribute('aria-expanded', 'false');
          binding = { ...ui, action: ui.menu }; rowBindings.set(key, binding);
        }
        binding.id = codexInboxId(session); binding.scope = { ...currentScope };
        const { row, clock, action } = binding;
        setAttr(row, 'data-codex-inbox-row', binding.id);
        const title = typeof session.title === 'string' && session.title ? session.title : 'Untitled thread';
        binding.update({
          title, selected: active(session), settleAction: true, workState: workState(session),
          menuDisabled: false,
          menuTitle: 'Remove from Inbox only. Work continues.'
        });
        setAttr(action, 'aria-label', `Settle ${title}`); setAttr(clock, 'aria-label', `Snooze ${title}`);
        // Opening stays enabled as before; Snooze does not depend on work status.
        clock.disabled = !!input.loading || !!input.error; clock.title = 'Hide from Inbox for a chosen duration. Work continues.';
        content.appendChild(row);
      }
      for (const item of settleNotices.values()) {
        const notice = doc.createElement('div');
        notice.setAttribute('data-codex-inbox-settle-notice', codexInboxId(item.session)); notice.setAttribute('role', 'status');
        const label = doc.createElement('span'); label.textContent = 'Settled';
        const undo = button('Undo', event => { stop(event); if (undo.isConnected && island?.contains(undo)) undoSettle(item); });
        const track = doc.createElement('span'); track.setAttribute('data-codex-inbox-undo-track', ''); track.setAttribute('aria-hidden', 'true');
        const progress = doc.createElement('span'); progress.setAttribute('data-codex-inbox-undo-progress', '');
        // A metadata repaint must not restart the visual deadline.
        progress.style.animationDelay = `-${Math.max(0, 3000 - (item.until - Date.now()))}ms`;
        track.appendChild(progress); notice.append(label, undo, track); content.appendChild(notice);
      }
      for (const key of rowBindings.keys()) if (!kept.has(key)) rowBindings.delete(key);
      if (snoozePopup && !snoozePopup.anchor.isConnected) closeSnoozePopup(false);

      content.scrollTop = scrollTop;
      if (focusedElement?.isConnected) focusedElement.focus({ preventScroll: true });
      else if (focusedHeader) header.focus();
      if (snoozePopup) snoozePopup.position();
    }
    renderBadges(root);
  }
  const observer = new win.MutationObserver(records => {
    if (records.some(record => {
      if (owns(record.target)) return false;
      if (record.type === 'attributes' && ['class', 'style'].includes(record.attributeName)) {
        return record.target.closest?.('[data-slot="sidebar-group"]')?.parentElement === container &&
          (record.target.classList.contains('group/section') || !!record.target.closest?.('button.group\\/section-label'));
      }
      if (record.type === 'attributes') return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => !owns(node));
    })) requestRender();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sessions-mode', 'aria-expanded', 'class', 'style', 'data-following', 'data-session-anchor', 'data-session-switching', 'data-pane-hidden'] });
  const offModel = model.subscribe(() => { refreshDeadline(); requestRender(); });
  const resume = () => { if (!disposed && on) { refreshDeadline(); requestRender(); } };
  doc.addEventListener('visibilitychange', resume);
  doc.addEventListener('scroll', resume, true);
  win.addEventListener?.('focus', resume);
  const offActive = ['activeSessionId', 'focusedStoredSessionId', 'focusedSessionOwner', 'focusedSessionProfile', 'profile', 'connectionId'].map(name => host.state?.[name]?.subscribe?.(requestRender)).filter(Boolean);
  const api = {
    model, admission, snooze, cancelSnooze,
    opened() {
      // Native navigation and metadata discovery are not attention decisions.
      return false;
    },
    update(next) {
      if (disposed) return;
      const scope = codexInboxScope(next.scope);
      if (JSON.stringify(scope) !== JSON.stringify(currentScope)) { cleanupDOM(); activityByKey.clear(); inboxOpen = true; }
      currentScope = scope;
      input = { ...next, sessions: Array.isArray(next.sessions) ? next.sessions : [], liveSessions: Array.isArray(next.liveSessions) ? next.liveSessions : [], liveStatusKnown: next.liveStatusKnown ?? Array.isArray(next.liveSessions) };
      if (scope && on) { reconcileAdmission(); reconcileActivity(); }
      refreshDeadline(); requestRender();
    },
    // Positive work/input events only. Callers must supply authoritative scope and ID.
    // Background reads/resuming and explicit UI opens do nothing.
    reactivate(event) {
      if (disposed || !on || !currentScope || !event || !codexInboxOwnedBy(currentScope, event) || JSON.stringify(codexInboxScope(event.scope)) !== JSON.stringify(currentScope)) return false;
      if (!['work', 'input', 'busy'].includes(event.type) && codexInboxWorkStatus(event) !== 'work') return false;
      const id = event.session_id || event.id || event.session_key;
      const session = findSession(id) || visibleSessions().find(s => runtimeAliases(s).has(id));
      if (!session || input.loading || input.error || input.liveStatusKnown !== true ||
          !admission.observe(currentScope, input.sessions, { workingSessions: [session] }) || !admission.isEligible(currentScope, session)) { requestRender(); return false; }
      if (model.isManualSettled(currentScope, session) && !model.unsettle(currentScope, session)) { requestRender(); return false; }
      const key = model.key(currentScope, session), previous = activityByKey.get(key);
      activityByKey.set(key, { phase: 'working', at: Date.now(), children: previous?.children || new Set() });
      const result = model.ingest(currentScope, [session], { liveSessions: [{ ...session, status: 'working' }] });
      requestRender(); return result;
    },
    activity(event) {
      if (disposed || !on || !currentScope || event?.replayed || !event?.session_id ||
          !sameScope({ connectionId: event.connectionId, profile: event.profile })) return false;
      const session = findSession(event.session_id) || visibleSessions().find(row => runtimeAliases(row).has(event.session_id));
      if (!session) return false;
      if (['message.start', 'tool.start'].includes(event.type)) {
        if (event.type === 'tool.start' && model.isManualSettled(currentScope, session)) return false;
        return api.reactivate({ type: 'work', scope: currentScope, session_id: event.session_id });
      }
      const key = model.key(currentScope, session), previous = activityByKey.get(key);
      if (event.type === 'message.complete' && previous?.phase === 'read') return false;
      const activity = { phase: previous?.phase || 'idle', at: Date.now(), children: new Set(previous?.children || []) };
      if (['subagent.spawn_requested', 'subagent.start', 'subagent.complete'].includes(event.type)) {
        const child = event.payload?.subagent_id;
        if (typeof child !== 'string' || !child) return false;
        if (event.type === 'subagent.complete') activity.children.delete(child);
        else { activity.children.add(child); activity.phase = 'working'; }
      } else if (event.type === 'message.complete') {
        activity.phase = activity.children.size ? 'working' : event.payload?.status === 'complete' && !event.payload.error ? 'completed' : 'unknown';
      } else if (event.type === 'error') activity.phase = 'unknown';
      else return false;
      activityByKey.set(key, activity);
      requestRender(); return true;
    },
    // Parent row-slot integration can bind an exact element without guessing React identity.
    // The row must be outside the Inbox island, inside the native sessions container.
    bindNativeRow(row, session, scope = currentScope) {
      const valid = codexInboxScope(scope);
      if (disposed || !row || !valid || !codexInboxId(session)) return () => {};
      const binding = { session, scope: valid }; externalBindings.set(row, binding); requestRender();
      return () => { if (externalBindings.get(row) === binding) { externalBindings.delete(row); badgeBindings.get(row)?.remove(); badgeBindings.delete(row); settledBadgeBindings.get(row)?.remove(); settledBadgeBindings.delete(row); requestRender(); } };
    },
    setMode(value) {
      if (disposed) return false;
      // Parent owns the string-valued preference and any persistence errors.
      on = !!value;
      if (!on) cleanupDOM();
      else if (currentScope) reconcileAdmission();
      refreshDeadline(); requestRender(); return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true; clearDeadline(); observer.disconnect(); offModel(); offActive.forEach(fn => fn());
      doc.removeEventListener('visibilitychange', resume); doc.removeEventListener('scroll', resume, true); win.removeEventListener?.('focus', resume);
      if (raf !== null) win.cancelAnimationFrame(raf);
      cleanupDOM(); externalBindings.clear(); activityByKey.clear();
      if (doc[registryKey] === api.dispose) delete doc[registryKey];
    }
  };
  doc[registryKey] = api.dispose;
  refreshDeadline(); requestRender();
  return api;
}
// END GENERATED INBOX RUNTIME
