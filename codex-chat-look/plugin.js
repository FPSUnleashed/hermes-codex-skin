import { host, PALETTE_AREA, THEMES_AREA, queryClient, useQuery, useValue, profileColor, profileColorSoft } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx } from 'react/jsx-runtime'

/* Activity design reference: T3 Code, commit 6d450a4284852af137b2f3407fddd89eb76e7644.
 * Rail painter/preview: T3 Code, commit 2359643cffa6ba9ee84d6f2694b935de54a8013e,
 * apps/web/src/components/chat/TimelineMinimap.tsx:208-274 (MIT).
 * Literal scale coefficients / 150ms transform recipe; native Hermes adapters,
 * not the T3 navigation controller. See THIRD_PARTY_HISTORY_RAIL.md.
 * Copyright (c) 2026 T3 Tools Inc. MIT License:
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const ID = 'codex-chat-look'
const STYLE_ID = `${ID}-styles`
const BUILD_ID = 'v1.13.0'
const STORAGE_PREFIX = `${ID}:turn:`
const LONG_USER_STATE_SUFFIX = ':long-user-expanded'
const MAX_PERSISTED_LONG_USER_STATES = 250
const RUNTIME_HANDOFF_KEY = '__hermesCodexChatLookRuntimeHandoff'
const COMPOSER_WIDTH_STORAGE_KEY = 'composer-width'
const COMPOSER_WIDTH_MODES = {
  codex: { label: 'Codex', next: 'codex-wide' },
  'codex-wide': { label: 'Codex +20 %', next: 'codex-wider' },
  'codex-wider': { label: 'Codex +40 %', next: 'hermes' },
  hermes: { label: 'Hermes', next: 'codex' }
}
const PINNED_USER_MESSAGES_STORAGE_KEY = 'pinned-user-messages'

const FLOATING_SIDEBAR_STORAGE_KEY = 'floating-sidebar'
const INBOX_ONLY_STORAGE_KEY = 'inbox-only'
let inboxOnlyMode = 'off'

const PLAYBACK_CLOSE_GRACE_MS = 250
const PLAYBACK_MOTION_MS = 240
let pluginStorage = null

const SYSTEM_FONT = `-apple-system, system-ui, "Segoe UI", sans-serif`
// Reply prose may fold, but interactive or unknown native output must fail open.
// Share the selector with CSS so late descendants are safe before reconciliation.
const TURN_REPLY_PROTECTED_SELECTOR = 'a, button, input, select, textarea, details, summary, object, embed, canvas, svg, img, audio, video, iframe, .text-destructive, [contenteditable], [tabindex], [role], [data-hermes-send], [data-slot]:not([data-slot="aui_assistant-message-content"])'
const TURN_REPLY_FOLD_GUARD = `:not(:is(.aui-md, [data-slot="aui_assistant-message-content"]):is(${TURN_REPLY_PROTECTED_SELECTOR})):not(:is(.aui-md, [data-slot="aui_assistant-message-content"]):has(${TURN_REPLY_PROTECTED_SELECTOR})):not([data-slot="aui_assistant-message-root"]:has(.aui-md:is(${TURN_REPLY_PROTECTED_SELECTOR}), .aui-md :is(${TURN_REPLY_PROTECTED_SELECTOR})))`

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
  --codex-browser-divider: #232323;
  --codex-sidebar-divider: #2c2c2c;
}
`

const CSS = `
/* Native drop targets identify complete sections even when empty/collapsed.
   The unpin target is also used by Projects/search/archive, so only flat is
   Sessions. A named important layer beats the existing disclosure layout's
   important sizing without changing that layout when this option is Off. */
@layer codex-inbox-only {
  html[data-codex-chat-look='true'][data-codex-inbox-only='on'] [data-sessions-mode] > [data-slot='sidebar-group'][data-session-pin-drop]:not([data-codex-inbox-owned]),
  html[data-codex-chat-look='true'][data-codex-inbox-only='on'] [data-sessions-mode='flat'] > [data-slot='sidebar-group'][data-session-unpin-drop]:not([data-codex-inbox-owned]) {
    display:none!important;
  }
  html[data-codex-chat-look='true'][data-codex-inbox-only='on'] [data-sessions-mode='flat'] > [data-codex-inbox-owned='island'] {
    flex:1 1 0!important; min-height:3.5rem!important; max-height:none!important; padding-bottom:0!important;
  }
  html[data-codex-chat-look='true'][data-codex-inbox-only='on'] [data-sessions-mode='flat'] > [data-codex-inbox-owned='island'][data-codex-inbox-expanded='false'] {
    flex:0 0 auto!important; min-height:0!important;
  }
}
html[data-codex-chat-look='true'] {
  --conversation-text-font-size: 14px;
  --conversation-line-height: 22px;
  --sticky-human-top: 0px;
  --codex-color-chat: var(--ui-chat-surface-background);
  --codex-color-sidebar: var(--ui-sidebar-surface-background);
  --codex-color-card: var(--dt-card, var(--ui-editor-surface-background));
  --codex-color-elevated: var(--dt-popover, var(--ui-widget-surface-background));
  --codex-color-bubble: var(--ui-chat-bubble-background);
  /* The status drawer is a sibling of composer-root, so its native local
     --composer-fill is not the skin's painted endpoint. Share that endpoint. */
  --codex-composer-fill: var(--codex-color-card);
  --codex-status-lightness-shift: -0.025;
  --codex-status-base: color-mix(
    in srgb,
    var(--codex-composer-fill) 50%,
    var(--codex-color-chat)
  );
  --codex-color-status-panel: oklch(from var(--codex-status-base) clamp(0, calc(l + var(--codex-status-lightness-shift)), 1) c h);
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

/* Dark surfaces need separation in the opposite direction, not a theme exception. */
html[data-codex-chat-look='true'][data-hermes-mode='dark'] {
  --codex-status-lightness-shift: 0.04;
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

/* T3 Code comfortable: index.css --chat-content-max-width and lane insets.
   The maximum is a lane, not Hermes' padded border box. */
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] {
  --composer-width: 46rem;
  --codex-chat-lane-inset: 0.75rem;
}
@media (min-width: 640px) {
  html[data-codex-chat-look='true'][data-codex-composer-width='codex'] {
    --codex-chat-lane-inset: 3rem;
  }
}
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='aui_thread-viewport'] {
  scrollbar-gutter: stable both-edges;
  scrollbar-width: auto;
}
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='aui_thread-content'] {
  max-width: min(var(--composer-width), calc(100% - 2 * var(--codex-chat-lane-inset) + var(--codex-chat-scrollbar-inset, 0px)));
  padding-inline: 0;
}
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='aui_assistant-message-content'] {
  padding-inline: 0 !important;
}
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='aui_assistant-message-content'] > .aui-md {
  padding-inline: 0.25rem !important;
}

html[data-codex-chat-look='true'][data-codex-composer-width='codex-wide'] {
  --composer-width: 883.2px;
}

html[data-codex-chat-look='true'][data-codex-composer-width='codex-wider'] {
  --composer-width: 1030.4px;
}

/* Hermes owns the live family; keep specialized code and icon families intact. */
html[data-codex-chat-look='true'] body,
html[data-codex-chat-look='true'] button,
html[data-codex-chat-look='true'] input,
html[data-codex-chat-look='true'] textarea,
html[data-codex-chat-look='true'] [contenteditable='true'] {
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

/* Only individually verified activity nodes fold. Native controls and output
   stay mounted where the renderer put them, including nested disclosures. */
html[data-codex-chat-look='true'] [data-codex-activity-item='collapsed']:not([data-codex-standalone-narration])${TURN_REPLY_FOLD_GUARD} {
  display: none !important;
}
/* Latest-reply presentation, not text deduplication. Older prose stays mounted
   and is available through the same disclosure, even while a turn is working.
   Removing the retained reply or inserting a sensitive control fails open. */
html[data-codex-chat-look='true'] [data-slot='aui_turn-pair']:has([data-codex-latest-reply]) [data-codex-previous-reply='collapsed']:not(:has(input, select, textarea, [contenteditable], [role='alert'], [data-slot='tool-approval-inline'], [data-slot='clarify-inline'], [data-slot='mcp-setup-inline'], [data-slot='aui_generated-image'], [data-slot='aui_artifact-card'], [data-slot='aui_markdown-alert'], [data-slot='aui_zoomable-image'], img, audio, video, iframe, .text-destructive))${TURN_REPLY_FOLD_GUARD} {
  display: none !important;
}
/* The completed-turn projection is reversible. A native promotion, streaming
   restart or interactive output must reveal the same node before reconciliation. */
html[data-codex-chat-look='true'] [data-slot='aui_turn-pair'][data-codex-activity-phase='completed']:not(:has([data-streaming='true'], [data-message-streaming='true'], [role='status'], [data-slot='tool-approval-inline'], [data-slot='clarify-inline'], [data-slot='mcp-setup-inline'])) [data-slot='aui_assistant-message-root']:not(:has([data-slot='aui_msg-actions'])) [data-codex-standalone-narration='true'][data-codex-activity-item='collapsed']:not(:has(a, button, input, select, textarea, [contenteditable], [role='alert'], img, audio, video, iframe, [data-slot='aui_generated-image'], [data-slot='aui_artifact-card'], [data-slot='aui_markdown-alert'], [data-slot='aui_zoomable-image'], .text-destructive))${TURN_REPLY_FOLD_GUARD} {
  display: none !important;
}
html[data-codex-chat-look='true'] [data-codex-turn-activity] {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 4px 4px 8px;
  margin: 0;
  border: 0;
  border-bottom: 1px solid color-mix(in oklab, var(--dt-border, var(--codex-color-border)) 60%, transparent);
  border-radius: 0;
  background: transparent;
  color: var(--codex-activity-label, var(--dt-muted-foreground, var(--ui-text-secondary)));
  font-weight: 400;
  font-size: 14px;
  line-height: 1.625;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
}
html[data-codex-chat-look='true'] [data-codex-turn-activity]:disabled { cursor: default; }
html[data-codex-chat-look='true'] [data-codex-turn-activity]:hover:not(:disabled) { color: var(--codex-color-text); }
html[data-codex-chat-look='true'] [data-codex-turn-activity]:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}
html[data-codex-chat-look='true'] [data-codex-turn-activity] svg {
  width: 14px;
  height: 14px;
  flex: none;
  transition: transform 120ms ease;
}
html[data-codex-chat-look='true'] [data-codex-turn-activity][aria-expanded='true'] [data-codex-turn-chevron] { transform: rotate(90deg); }

html[data-codex-chat-look='true'] [data-codex-turn-time] {
  position: relative;
  margin-left: auto;
  font-size: 11px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
}
html[data-codex-chat-look='true'] [data-codex-turn-activity]:hover [data-codex-turn-time],
html[data-codex-chat-look='true'] [data-codex-turn-activity]:focus-visible [data-codex-turn-time] { opacity: 1; pointer-events: auto; }
html[data-codex-chat-look='true'] [data-codex-turn-time-tip] {
  display: none;
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  padding: 4px 8px;
  border: 1px solid var(--ui-stroke-secondary);
  border-radius: 4px;
  background: var(--ui-bg);
  color: var(--ui-text);
  z-index: 1;
}
html[data-codex-chat-look='true'] [data-codex-turn-time]:hover [data-codex-turn-time-tip],
html[data-codex-chat-look='true'] [data-codex-turn-activity]:focus-visible [data-codex-turn-time-tip] { display: block; }
@media (prefers-reduced-motion: reduce) {
  html[data-codex-chat-look='true'] [data-codex-turn-activity] svg { transition: none; }
}

html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'],
html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'] .aui-md,
html[data-codex-chat-look='true'] [data-slot='aui_assistant-message-content'] .aui-md :where(p, li, blockquote, table),
html[data-codex-chat-look='true'] [data-slot='aui_user-inline-text'] {
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
:has([data-slot='aui_embedded-images']):is(html[data-codex-chat-look='true'] [data-slot='aui_turn-pair']
  > [data-role='user']
  + *:not([data-role])) {
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

/* Keep the native edit engine and Send button; only Cancel is skin-owned. */
html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] .composer-human-message-container {
  border-radius: 17px !important;
  background: transparent !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] .composer-human-message {
  width: 100% !important;
  max-width: 100% !important;
  padding: 12px 12px 56px !important;
  border: 0 !important;
  border-radius: 17px !important;
  background: var(--codex-color-bubble) !important;
  color: var(--codex-color-text) !important;
  box-shadow: none !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] [data-slot='composer-rich-input'] {
  min-height: 44px !important;
  padding: 0 !important;
  background: transparent !important;
  color: var(--codex-color-text) !important;
  caret-color: var(--codex-color-text) !important;
  font-size: 14px !important;
  line-height: 22px !important;
  font-weight: 400 !important;
}

html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] :is([data-codex-edit-send], [data-codex-edit-cancel]) {
  position: absolute !important;
  bottom: 12px !important;
  width: auto !important;
  height: 34px !important;
  min-width: 68px !important;
  padding: 0 14px !important;
  border: 1px solid var(--ui-stroke-secondary) !important;
  border-radius: 10px !important;
  font-weight: 500 !important;
  font-size: 13px !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer;
}
html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] [data-codex-edit-send] {
  right: 12px !important;
  background: var(--ui-text-primary) !important;
  color: var(--ui-bg-editor) !important;
  border-color: transparent !important;
}
html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] [data-codex-edit-send] > * {
  display: none !important;
}
html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] [data-codex-edit-send]::after {
  content: attr(data-codex-edit-send);
}
html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] [data-codex-edit-cancel] {
  right: calc(20px + var(--codex-edit-send-width, 80px)) !important;
  background: var(--ui-bg-editor) !important;
  color: var(--ui-text-primary) !important;
}
html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] :is([data-codex-edit-send], [data-codex-edit-cancel]):disabled {
  opacity: .4 !important;
  cursor: default;
}
html[data-codex-chat-look='true'] [data-slot='aui_edit-composer-root'] :is([data-codex-edit-send], [data-codex-edit-cancel]):focus-visible {
  outline: 2px solid var(--ui-text-primary) !important;
  outline-offset: 2px;
}

/* Keep the reasoning body compact; its disclosure header uses the same
   readable, scaled activity typography as completed thinking below. */
html[data-codex-chat-look='true'] [data-streaming='true'] [data-slot='aui_reasoning-text'],
html[data-codex-chat-look='true'] [data-streaming='true'] [data-slot='aui_reasoning-text'] .aui-md,
html[data-codex-chat-look='true'] [data-streaming='true'] [data-slot='aui_reasoning-text'] .aui-md :where(p, li, blockquote) {
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
  font-size: 14px !important;
  line-height: 21px !important;
  font-weight: 500 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] [class~='group/section-label'] > span:first-child > span:last-child {
  font-size: 14px !important;
  line-height: 21px !important;
  font-weight: 500 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar-menu-button'] {
  font-size: 14px !important;
  line-height: 21px !important;
  font-weight: 400 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
}

html[data-codex-chat-look='true'] [data-slot='sidebar'] span[class*='text-[0.8125rem]'] {
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
  /* T3 w-6 / origin-left / scale-x; compensate the retained native-space zoom. */
  width: 16.8px !important;
  height: 1.4px !important;
  flex: none !important;
  border-radius: 999px !important;
  background: color-mix(in srgb, var(--codex-color-text-secondary) 25%, transparent) !important;
  background-image: none !important;
  opacity: 1 !important;
  position: relative;
  transform-origin: left !important;
  transform: scaleX(var(--codex-history-scale, 0.333)) !important;
  transition: transform 150ms cubic-bezier(.4,0,.2,1) !important;
}
html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='timeline-bar']::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--codex-color-text) 55%, transparent);
  opacity: 0;
  transition: opacity 150ms cubic-bezier(.4,0,.2,1);
}
/* Native aria-current owns the equivalent of T3's in-view overlay. */
html[data-codex-chat-look='true'] [data-codex-history-rail] button.thread-timeline-tick[aria-current='location'] > [data-slot='timeline-bar']::after {
  opacity: 1;
}
html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='thread-timeline-ticks'] > .thread-timeline-track button.thread-timeline-tick[data-codex-history-hover] > [data-slot='timeline-bar'] {
  background: color-mix(in srgb, var(--codex-color-text-secondary) 60%, transparent) !important;
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
  -webkit-line-clamp: 1;
}
html[data-codex-chat-look='true'] [data-codex-history-question] { font-weight: 500; }
html[data-codex-chat-look='true'] [data-codex-history-answer] {
  -webkit-line-clamp: 3;
  margin-top: 4px;
  color: var(--codex-color-text-secondary);
  font-weight: 400;
}
html[data-codex-chat-look='true'] [data-codex-history-answer] p { margin: 0 0 8px; }
html[data-codex-chat-look='true'] [data-codex-history-answer] p:last-child { margin-bottom: 0; }
html[data-codex-chat-look='true'] [data-codex-history-answer] strong { font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='thread-timeline-ticks'] .thread-timeline-tick > [data-slot='timeline-bar'],
  html[data-codex-chat-look='true'] [data-codex-history-rail] [data-slot='timeline-bar']::after { transition: none !important; }
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

/* CSS Scrollbars colors make Chromium ignore the existing 8px WebKit lane
   and reserve a platform-sized track instead. Preserve the thumb's existing
   idle/scroll paint while retaining its measured, narrow layout footprint. */
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='aui_thread-viewport'],
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='aui_thread-viewport'][data-codex-scrollbar='true'][data-codex-scrolling='true'] {
  scrollbar-color: auto !important;
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

/* Restyle only Hermes' native busy rows. Native state, hints, clocks and
   live regions retain ownership; idle tails and compaction are not targets.
   Brain paths: lucide-react 0.577.0, ISC License.
   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as
   part of Feather (MIT). All other copyright (c) for Lucide are held by
   Lucide Contributors 2026.
   Permission to use, copy, modify, and/or distribute this software for any
   purpose with or without fee is hereby granted, provided that the above
   copyright notice and this permission notice appear in all copies.
   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE. */
html[data-codex-chat-look='true'] :is([data-slot='aui_response-loading']:not([aria-label='Summarizing thread']), [data-slot='aui_turn-activity'][data-state='active']:not([aria-label='Summarizing thread'])) {
  min-height: calc(1.5rem * var(--chat-text-scale, 1));
  padding-inline: 2px;
  gap: calc(.5rem * var(--chat-text-scale, 1)) !important;
  font-size: calc(.875rem * var(--chat-text-scale, 1));
  line-height: 1.625;
}
html[data-codex-chat-look='true'] :is([data-slot='aui_response-loading']:not([aria-label='Summarizing thread']), [data-slot='aui_turn-activity'][data-state='active']:not([aria-label='Summarizing thread'])) > .dither {
  display: none !important;
}
html[data-codex-chat-look='true'] :is([data-slot='aui_response-loading']:not([aria-label='Summarizing thread']), [data-slot='aui_turn-activity'][data-state='active']:not([aria-label='Summarizing thread']))::before {
  content: '';
  order: 0;
  /* Match tool rows' 24px icon cell and 6px label gap, retaining the scaled
     Brain and the native timer gap. Inline margins also mirror in RTL. */
  margin-inline-start: calc(12px - .5rem * var(--chat-text-scale, 1));
  margin-inline-end: calc(18px - 1rem * var(--chat-text-scale, 1));
  flex: 0 0 calc(1rem * var(--chat-text-scale, 1));
  width: calc(1rem * var(--chat-text-scale, 1));
  height: calc(1rem * var(--chat-text-scale, 1));
  color: var(--codex-color-text-tertiary);
  background: currentColor;
  mask: var(--codex-thinking-mask) center / contain no-repeat;
}
html[data-codex-chat-look='true'] :is([data-slot='aui_response-loading']:not([aria-label='Summarizing thread']), [data-slot='aui_turn-activity'][data-state='active']:not([aria-label='Summarizing thread'])):not(:has(.shimmer))::after {
  content: 'Thinking';
  order: 1;
  min-width: 0;
  color: var(--codex-color-text-secondary);
}
html[data-codex-chat-look='true'] :is([data-slot='aui_response-loading']:not([aria-label='Summarizing thread']), [data-slot='aui_turn-activity'][data-state='active']:not([aria-label='Summarizing thread'])) > * {
  order: 2;
}

/* The turn header already owns elapsed time. Keep the redundant quiet-status
   leaf accessible but out of layout, so tool/wait handoffs cannot add a row.
   Preserve initial waits, named hints, compaction and interactive notices. */
html[data-codex-chat-look='true'] [data-slot='aui_turn-pair'][data-codex-activity-phase='working']:has(> [data-codex-turn-activity])
  > [data-slot='aui_assistant-message-root'] > [data-slot='aui_assistant-message-content']
  > :is([data-slot='aui_turn-activity'][data-state='active'], [data-slot='aui_response-loading']):not([aria-label='Summarizing thread']):not(:has(.shimmer, [role='alert'], button, a[href], input, select, textarea)),
html[data-codex-chat-look='true'] [data-slot='aui_turn-pair'][data-codex-activity-phase='working']:has(> [data-codex-turn-activity])
  > [data-slot='aui_response-group'] > [data-slot='aui_assistant-message-root'] > [data-slot='aui_assistant-message-content']
  > :is([data-slot='aui_turn-activity'][data-state='active'], [data-slot='aui_response-loading']):not([aria-label='Summarizing thread']):not(:has(.shimmer, [role='alert'], button, a[href], input, select, textarea)) {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  min-height: 0 !important;
  margin: -1px !important;
  padding: 0 !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
  border-width: 0 !important;
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

/* T3's outer timeline owns the rhythm too: 8px after prose/standalone work,
   no gap within a work sequence, 6px after the duration header. Retain both
   native grouped responses and the older direct-message topology. */
html[data-codex-chat-look='true'] [data-codex-activity-phase] {
  --turn-block-gap: 8px;
  --scaffold-block-gap: 0px;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase] [data-slot='aui_response-group'] {
  gap: 0 !important;
}
html[data-codex-chat-look='true'] [data-codex-turn-activity] + [data-slot='aui_response-group'] {
  margin-top: 0 !important;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase] [data-slot='aui_assistant-message-content'] {
  padding-left: 0 !important;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase] [data-slot='aui_assistant-message-content'] > .aui-md {
  padding-inline: 4px;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase] [data-slot='aui_response-group'] > [data-slot='aui_assistant-message-root'] + [data-slot='aui_assistant-message-root'] {
  margin-top: 8px;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase] [data-slot='aui_response-group']
  > [data-slot='aui_assistant-message-root']:has(> [data-slot='aui_assistant-message-content'] > :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity']):not([data-delegate-card]):last-child)
  + [data-slot='aui_assistant-message-root']:has(> [data-slot='aui_assistant-message-content'] > :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity']):not([data-delegate-card]):first-child) {
  margin-top: 0;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase] [data-slot='aui_assistant-message-content']
  > :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity']) + [data-delegate-card],
html[data-codex-chat-look='true'] [data-codex-activity-phase] [data-slot='aui_assistant-message-content']
  > [data-delegate-card] + :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity']) {
  margin-top: 8px !important;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase] [data-slot='aui_assistant-message-content']
  > [data-tool-group]:has(> [data-tool-summary] button[aria-expanded='true']) + .aui-md,
html[data-codex-chat-look='true'] [data-codex-activity-phase] [data-slot='aui_response-group']
  > [data-slot='aui_assistant-message-root']:has(> [data-slot='aui_assistant-message-content'] > [data-tool-group]:last-child > [data-tool-summary] button[aria-expanded='true'])
  + [data-slot='aui_assistant-message-root']:has(> [data-slot='aui_assistant-message-content'] > .aui-md:first-child) {
  margin-top: 4px !important;
}
/* A sealed interim can still own Hermes' 32px hover toolbar. Keep its original
   controls and keyboard path as an overlay, rather than a blank timeline row.
   The terminal reply's footer and visible reactions keep their native space. */
html[data-codex-chat-look='true'] [data-codex-activity-phase]
  [data-slot='aui_assistant-message-root']:has(~ [data-slot='aui_assistant-message-root'])
  > div:not([data-slot]):has([data-slot='aui_msg-actions']):not(:has([data-reacted], > :nth-child(2))) {
  height: 0;
  min-height: 0;
  position: relative;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase]
  [data-slot='aui_assistant-message-root']:has(~ [data-slot='aui_assistant-message-root'])
  > div:not([data-slot]):has([data-slot='aui_msg-actions']):not(:has([data-reacted], > :nth-child(2))) > * {
  position: absolute;
  bottom: 0;
  right: 0;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase]
  [data-slot='aui_assistant-message-root']:has(~ [data-slot='aui_assistant-message-root'])
  > div:not([data-slot]):has([data-slot='aui_msg-actions']):not(:has([data-reacted], > :nth-child(2))) [data-slot='aui_turn-duration'] {
  left: 0;
  right: auto;
}
html[data-codex-chat-look='true'] [data-codex-activity-phase]
  [data-slot='aui_assistant-message-root']:has(~ [data-slot='aui_assistant-message-root'])
  > div:not([data-slot]):has([data-slot='aui_msg-actions']):not(:has([data-reacted], > :nth-child(2))) [data-slot='aui_msg-actions'] {
  padding-block: 0;
}
/* T3 Code WorkLog geometry, reference 6d450a4284852af137b2f3407fddd89eb76e7644.
   Keep native disclosures/handlers; remove Hermes' compounded scaffold fade.
   Background results share only their header, never the expanded report.
   Source and license attribution: docs/t3-activity-provenance.md. */
html[data-codex-chat-look='true'] :is([data-tool-row], [data-tool-summary], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold]) {
  --conversation-tool-font-size: calc(14px * var(--conversation-text-scale, 1));
  --conversation-line-height: calc(22.75px * var(--conversation-text-scale, 1));
  --conversation-scaffold-text: var(--codex-tool-label, var(--dt-muted-foreground, var(--ui-text-secondary)));
  --conversation-scaffold-meta: var(--codex-tool-label, var(--dt-muted-foreground, var(--ui-text-secondary)));
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-tool-summary], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold])[data-conversation-scaffold] {
  opacity: 1 !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-tool-summary], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold]) {
  padding: 2px !important;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  color: var(--conversation-scaffold-text) !important;
  font-weight: 400 !important;
  font-size: var(--conversation-tool-font-size) !important;
  line-height: 1.625 !important;
}
html[data-codex-chat-look='true'] [data-tool-group] [data-tool-row] {
  padding-block: 0 !important;
}
html[data-codex-chat-look='true'] [data-tool-row]:not([data-file-edit]),
html[data-codex-chat-look='true'] [data-tool-row]:not([data-file-edit]) > div:first-child {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
}
html[data-codex-chat-look='true'] [data-tool-row]:not([data-file-edit]) > div:first-child {
  padding: 0 !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-tool-summary], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] {
  align-items: center !important;
  min-height: 24px !important;
  color: inherit !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-tool-summary], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] > button {
  flex: 1 1 0 !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  min-height: 24px !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 0 !important;
  border-radius: 6px !important;
  color: inherit !important;
  text-align: left !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-tool-summary], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] > button:focus-visible {
  outline: 2px solid var(--ui-accent) !important;
  outline-offset: -2px !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-tool-summary], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] > button > span:first-child {
  flex: 1 1 0 !important;
  min-width: 0 !important;
  overflow: hidden !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-tool-summary], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] > button > span:first-child > span {
  min-height: 24px !important;
  gap: 6px !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] > button > span:first-child > span > span:first-child:has(svg, [class*='codicon'], [role='status']) {
  color: var(--codex-tool-icon, var(--conversation-scaffold-text));
  display: grid !important;
  place-items: center !important;
  width: 24px !important;
  height: 24px !important;
  flex: 0 0 24px !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] > button > span:first-child > span > span:first-child [class~='text-(--ui-text-secondary)'] {
  color: var(--codex-tool-icon, var(--conversation-scaffold-text)) !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] > button > span:first-child > span > span:first-child :is(svg, [class*='codicon'], [role='status']) {
  width: 16px !important;
  height: 16px !important;
  font-size: 16px !important;
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] > button > span:last-child:not(:first-child) {
  height: 24px !important;
  width: 16px !important;
  margin-left: auto !important;
  opacity: .7 !important;
}
html[data-codex-chat-look='true'] {
  --codex-thinking-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMiAxOFY1Ii8+PHBhdGggZD0iTTE1IDEzYTQuMTcgNC4xNyAwIDAgMS0zLTQgNC4xNyA0LjE3IDAgMCAxLTMgNCIvPjxwYXRoIGQ9Ik0xNy41OTggNi41QTMgMyAwIDEgMCAxMiA1YTMgMyAwIDEgMC01LjU5OCAxLjUiLz48cGF0aCBkPSJNMTcuOTk3IDUuMTI1YTQgNCAwIDAgMSAyLjUyNiA1Ljc3Ii8+PHBhdGggZD0iTTE4IDE4YTQgNCAwIDAgMCAyLTcuNDY0Ii8+PHBhdGggZD0iTTE5Ljk2NyAxNy40ODNBNCA0IDAgMSAxIDEyIDE4YTQgNCAwIDEgMS03Ljk2Ny0uNTE3Ii8+PHBhdGggZD0iTTYgMThhNCA0IDAgMCAxLTItNy40NjQiLz48cGF0aCBkPSJNNi4wMDMgNS4xMjVhNCA0IDAgMCAwLTIuNTI2IDUuNzciLz48L3N2Zz4=");
}
/* Source-derived T3 v0.1.6 activity primitive. Base content never transforms. */
html[data-codex-chat-look='true'] [data-codex-activity-face] {
  position: relative; display: inline-flex; min-width: 0; max-width: 100%;
  overflow: hidden; vertical-align: top; pointer-events: none;
  --codex-activity-icon-size: calc(1rem * var(--chat-text-scale, 1));
  --codex-activity-inset: max(0px, calc(var(--codex-activity-icon-size) / 2 - 12px));
  margin-inline-start: calc(-1 * var(--codex-activity-inset));
  --codex-activity-mask: var(--codex-thinking-mask);
}
html[data-codex-chat-look='true'] [data-codex-activity-content] {
  display: flex; align-items: center; gap: 6px; min-height: 24px;
  white-space: nowrap; color: var(--conversation-scaffold-text);
  padding-inline-start: var(--codex-activity-inset); box-sizing: border-box;
}
html[data-codex-chat-look='true'] [data-codex-activity-icon] {
  display: inline-block; flex: 0 0 var(--codex-activity-icon-size); width: var(--codex-activity-icon-size); height: var(--codex-activity-icon-size);
  margin-inline: calc(12px - var(--codex-activity-icon-size) / 2);
  color: var(--codex-tool-icon, var(--conversation-scaffold-text)); background: currentColor;
  mask: var(--codex-activity-mask) center / contain no-repeat;
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence] [data-codex-activity-face] {
  --codex-activity-icon-size: 16px;
  --codex-activity-mask: var(--codex-tool-sequence-mask, url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9'/%3E%3Cpath d='m18 15 4-4'/%3E%3Cpath d='m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5'/%3E%3C/svg%3E"));
}
/* The native-summary painter comes later; an owned face stays the sole leading. */
html[data-codex-chat-look='true'] [data-codex-tool-sequence] [class~='group/disclosure-row'] > button:has([data-codex-activity-face])::before { display: none; }
html[data-codex-chat-look='true'] [data-codex-tool-sequence]:not([data-codex-tool-sequence-glyph]):not([data-codex-activity-running]) [data-codex-activity-icon] {
  color: var(--conversation-scaffold-text);
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence][data-codex-tool-sequence-glyph='codicon'] [data-codex-activity-icon] { background: none; }
html[data-codex-chat-look='true'] [data-codex-tool-sequence][data-codex-activity-running]:not([data-codex-tool-sequence-glyph]) [data-codex-activity-icon] {
  background: none; mask: none; border: 1.5px solid currentColor; border-radius: 50%;
  border-inline-end-color: transparent; width: 14px; height: 14px; flex-basis: 14px; margin-inline: 5px;
}
html[data-codex-chat-look='true'] [data-codex-activity-busy]::before,
html[data-codex-chat-look='true'] [data-codex-activity-busy]::after,
html[data-codex-chat-look='true'] [data-codex-activity-owned]:not(:has(.shimmer)):not([aria-label='Summarizing thread'])::before,
html[data-codex-chat-look='true'] [data-codex-activity-owned]:not(:has(.shimmer)):not([aria-label='Summarizing thread'])::after { display: none; }
html[data-codex-chat-look='true'] [data-codex-activity-busy] [data-codex-activity-face] { order: 1; }
html[data-codex-chat-look='true'] [data-codex-activity-sweep] {
  --activity-band: 4.5rem;
  position: absolute; top: 0; bottom: 0; left: calc(-1 * var(--activity-band));
  width: calc(100% + var(--activity-band) + var(--activity-band));
  mask-image: linear-gradient(to right, transparent 0, color-mix(in srgb, black 12%, transparent) .675rem, color-mix(in srgb, black 55%, transparent) 1.575rem, black 2.25rem, color-mix(in srgb, black 55%, transparent) 2.925rem, color-mix(in srgb, black 12%, transparent) 3.825rem, transparent var(--activity-band), transparent 100%);
  mask-repeat: no-repeat;
  animation: codex-activity-focus 2.2s steps(30) infinite;
  animation-play-state: var(--visible-animation-state, running);
}
html[data-codex-chat-look='true'] [data-codex-activity-sweep] > span {
  display: block; width: 100%; height: 100%;
  animation: codex-activity-focus-counter 2.2s steps(30) infinite;
  animation-play-state: var(--visible-animation-state, running);
}
html[data-codex-chat-look='true'] [data-codex-activity-sweep] [data-codex-activity-content] {
  width: calc(100% - var(--activity-band) - var(--activity-band));
  margin-left: var(--activity-band); color: var(--codex-color-text, var(--ui-text-primary));
}
html[data-codex-chat-look='true'] [data-codex-activity-sweep] [data-codex-activity-icon] { color: inherit; }
@keyframes codex-activity-focus { from { transform: translateX(0); } to { transform: translateX(100%); } }
@keyframes codex-activity-focus-counter { from { transform: translateX(0); } to { transform: translateX(-100%); } }
html[data-codex-chat-look='true'][data-renderer-animations-paused] [data-codex-activity-sweep],
html[data-codex-chat-look='true'][data-renderer-animations-paused] [data-codex-activity-sweep] > span,
html[data-codex-chat-look='true'] [hidden] [data-codex-activity-sweep],
html[data-codex-chat-look='true'] [hidden] [data-codex-activity-sweep] > span,
html[data-codex-chat-look='true'] [data-slot='aui_thread-content'][aria-hidden='true'] [data-codex-activity-sweep],
html[data-codex-chat-look='true'] [data-slot='aui_thread-content'][aria-hidden='true'] [data-codex-activity-sweep] > span { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce), (forced-colors: active) {
  html[data-codex-chat-look='true'] [data-codex-activity-sweep], html[data-codex-chat-look='true'] [data-codex-activity-sweep] > span { animation: none; }
  html[data-codex-chat-look='true'] [data-codex-activity-sweep] { opacity: 0; }
}
html[data-codex-chat-look='true'] [data-codex-activity-busy] {
  --conversation-scaffold-text: var(--codex-tool-label, var(--dt-muted-foreground, var(--ui-text-secondary)));
}
html[data-codex-chat-look='true'] :is([data-codex-activity-busy]:has(.shimmer), [aria-label='Summarizing thread'], [data-slot='aui_turn-activity']:not([data-state='active'])) > [data-codex-activity-face] { display: none; }
@media (prefers-reduced-motion: no-preference) and (forced-colors: none) {
  html[data-codex-chat-look='true'] [data-codex-tool-sequence][data-codex-activity-live]:not([data-codex-tool-sequence-glyph='brain']) [data-codex-tool-sequence-label] {
    color: transparent;
    background-image: linear-gradient(to right, transparent, var(--codex-color-text, var(--ui-text-primary)), transparent), linear-gradient(var(--conversation-scaffold-text), var(--conversation-scaffold-text));
    background-size: 4.5rem 100%, 100% 100%; background-repeat: no-repeat; background-clip: text;
    animation: codex-tool-shine 2.2s steps(30) infinite;
    animation-play-state: var(--visible-animation-state, running);
  }
}
@keyframes codex-tool-shine { from { background-position: -4.5rem 0, 0 0; } to { background-position: calc(100% + 4.5rem) 0, 0 0; } }
html[data-codex-chat-look='true'][data-renderer-animations-paused] [data-codex-tool-sequence-label],
html[data-codex-chat-look='true'] [hidden] [data-codex-tool-sequence-label] { animation-play-state: paused !important; }
/* Local-safe certifies direct barriers only. Recheck marked units in CSS so
   a nested action/failure/media insertion opens them before observer delivery.
   The original global admission branch and turn-fold guards stay intact. */
/* While closed, the native current row still owns its trailing timer and live
   region. The plugin face overlays only its title. No native nodes move. */
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence][data-codex-activity-live]:has(button[aria-expanded='false']) {
  height: 0; min-height: 0; padding: 0 !important; margin-block: 0; overflow: visible; position: relative;
}
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence][data-codex-activity-live] button[aria-expanded='false'] { position: absolute; top: 0; inset-inline-start: 2px; width: calc(100% - 5rem) !important; z-index: 1; }
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence-item='live-collapsed'] { margin-block: 0 !important; overflow: visible !important; }
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence-item='live-collapsed']:not(:has([data-codex-activity-native-current])):not([data-codex-activity-native-current]),
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence-item='live-collapsed'] [data-tool-row]:not([data-codex-activity-native-current]) {
  position: absolute !important; width: 1px !important; height: 1px !important;
  padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip-path: inset(50%); pointer-events: none;
}
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence-item='live-collapsed'] > [data-tool-summary] { display: none; }
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence-item='live-collapsed'] [data-tool-ticker] { height: 24px; overflow: visible; }
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence-item='live-collapsed'] .tool-ticker__reel { transform: none !important; transition: none !important; }
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence-item='live-collapsed'] .tool-ticker__row { height: 0; overflow: visible; align-items: flex-start; }
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-activity-native-current] > :not(:first-child) { display: none; }
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) :is([data-codex-activity-native-current], [data-codex-activity-native-current] > div:first-child) { padding: 0 !important; border: 0 !important; }
html[data-codex-chat-look='true'] [data-slot="aui_turn-pair"]:is(:not(:has([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-activity-native-current] [class~='group/disclosure-row'] > button { opacity: 0; pointer-events: none; }

/* Only exact semantic tool units are folded; unsafe native UI fails open. */
html[data-codex-chat-look='true'] [data-slot='aui_turn-pair']:is(:not(:has([data-slot='tool-approval-inline'], [data-slot='clarify-inline'], [data-slot='mcp-setup-inline'], [role='alert'], .text-destructive, [class~='text-amber-700'], [class~='dark:text-amber-300'], [data-slot='aui_assistant-message-stopped'])), [data-codex-tool-sequence-local-safe]):not(:has([data-slot="aui_assistant-message-stopped"], [data-codex-tool-sequence-item]:is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]), [data-codex-tool-sequence-item] :is([data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [role="alert"], .text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"], [data-slot="aui_assistant-message-stopped"], img, audio, video, iframe, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"]))) [data-codex-tool-sequence-item='collapsed']:not(:has(img, audio, video, iframe, [data-slot='aui_artifact-card'], [data-slot='aui_generated-image'], [data-slot='aui_markdown-alert'], [data-slot='aui_zoomable-image'])) {
  display: none !important;
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence] [class~='group/disclosure-row'] {
  display: flex;
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence] button {
  display: flex;
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence] button > span:last-child {
  width: 16px;
  margin-left: auto;
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence] button[aria-expanded='true'] > span:last-child {
  transform: rotate(90deg);
}
html[data-codex-chat-look='true'] :is([data-tool-row], [data-tool-summary], [data-slot='aui_thinking-disclosure'], [data-slot='aui_background-result'] > [data-conversation-scaffold]) [class~='group/disclosure-row'] [class~='tabular-nums']:not([role='status']) {
  font-size: calc(12px * var(--conversation-text-scale, 1)) !important;
}
html[data-codex-chat-look='true'] :is([data-tool-summary], [data-slot='aui_thinking-disclosure']) [class~='group/disclosure-row'] > button::before {
  content: '';
  display: block;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  background: currentColor;
  mask: none center / 16px 16px no-repeat;
}
/* Lucide Hammer, lucide-react 0.564.0 (also identical in 0.577.0).
 * ISC License. Copyright (c) Lucide Contributors 2026; portions Copyright
 * (c) Cole Bemis 2013-2026 as part of Feather (MIT).
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * The native tool summary owns this glyph; the turn header keeps its chevron.
 */
html[data-codex-chat-look='true'] [data-tool-summary] [class~='group/disclosure-row'] > button::before {
  /* Gabriel's Hammer role matches Thinking text, independently of other icons. */
  color: var(--conversation-scaffold-text);
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9'/%3E%3Cpath d='m18 15 4-4'/%3E%3Cpath d='m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5'/%3E%3C/svg%3E");
}
/* Only generated aggregates can override Hammer with a validated native glyph. */
html[data-codex-chat-look='true'] [data-codex-tool-sequence][data-codex-tool-sequence-glyph='svg'] [class~='group/disclosure-row'] > button::before {
  mask-image: var(--codex-tool-sequence-mask);
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence][data-codex-tool-sequence-glyph='codicon'] [class~='group/disclosure-row'] > button {
  position: relative;
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence][data-codex-tool-sequence-glyph='codicon'] [class~='group/disclosure-row'] > button::before {
  mask-image: none;
  background: none;
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence] button [data-codex-tool-sequence-icon] {
  position: absolute;
  inset-inline-start: 0;
  top: 0;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  font-size: 16px;
  pointer-events: none;
}
html[data-codex-chat-look='true'] [data-slot='aui_thinking-disclosure'] > [class~='group/disclosure-row'] > button::before,
html[data-codex-chat-look='true'] [data-codex-tool-sequence][data-codex-tool-sequence-glyph='brain'] > [class~='group/disclosure-row'] > button::before {
  mask-image: var(--codex-thinking-mask);
}
html[data-codex-chat-look='true'] [data-codex-tool-sequence][data-codex-tool-sequence-glyph='brain'] [data-codex-activity-face] {
  --codex-activity-mask: var(--codex-thinking-mask);
}
html[data-codex-chat-look='true'] [data-slot='aui_thinking-body'] {
  margin-left: 28px !important;
  width: calc(100% - 28px) !important;
  max-height: 24rem !important;
  padding: 4px 2px !important;
  overflow: auto !important;
  font-style: normal !important;
  color: var(--codex-color-text) !important;
}
html[data-codex-chat-look='true'] [data-tool-group] {
  --tool-row-gap: 0px;
  gap: 0 !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}
html[data-codex-chat-look='true'] [data-tool-group] > div:not([data-tool-summary]):has(> [data-tool-row]),
html[data-codex-chat-look='true'] [data-tool-group] .tool-group-scroll {
  max-height: min(18rem, 50dvh) !important;
  /* The native outer grid makes this a definite-height grid item. Its default
     auto tracks can then shrink overflow-hidden tool rows below their text.
     Keep each track content-sized and let this bounded list own the scroll. */
  grid-auto-rows: max-content;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  scrollbar-width: thin !important;
  scrollbar-gutter: stable;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}
/* Opening a call may grow beyond the compact list cap, as in T3's measured
   expandedContentHeight allowance. Let the thread own that longer scroll. */
html[data-codex-chat-look='true'] [data-tool-group] > div:has(> [data-tool-row][data-tool-open]),
html[data-codex-chat-look='true'] [data-tool-group] .tool-group-scroll:has([data-tool-open]) {
  max-height: none !important;
}

/* Hide the branch / dirty-files strip only. Git state and review remain intact. */
html[data-codex-chat-look='true'] .coding-status-bar {
  display: none !important;
}

/* The Codex reference is 1472 Retina pixels wide at DPR 2: 736 CSS px.
   Codex +20 % and +40 % raise that limit to 883.2 and 1030.4 CSS px.
   All Codex modes shrink in narrow panes.
   Hermes keeps the 5px peel-out margin on each side, hence the +10px dock. */
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='composer-dock']:not([data-popped-out]),
html[data-codex-chat-look='true'][data-codex-composer-width='codex-wide'] [data-slot='composer-dock']:not([data-popped-out]),
html[data-codex-chat-look='true'][data-codex-composer-width='codex-wider'] [data-slot='composer-dock']:not([data-popped-out]) {
  width: calc(min(var(--composer-width), calc(100% - 2rem)) + 10px) !important;
  max-width: calc(100% - 22px) !important;
}

/* The dock still owns Hermes' two 5px peel-out margins. Only the default
   adopts T3's responsive lane and 1px shell + 1rem prompt inset. Floating
   composers, sent-message editors and optional width modes remain native. */
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='composer-dock']:not([data-popped-out]) {
  width: calc(min(var(--composer-width), max(0px, calc(100% - 2 * var(--codex-chat-lane-inset)))) + 10px) !important;
  max-width: 100% !important;
}
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='composer-dock']:not([data-popped-out]) [data-slot='composer-surface'] {
  border-width: 1px !important;
}
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='composer-dock']:not([data-popped-out]) [data-slot='composer-fade'] {
  padding-inline: 1rem !important;
}
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='composer-dock']:not([data-popped-out]) [data-slot='composer-fade'] > div:last-child {
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) minmax(0, auto) !important;
}
html[data-codex-chat-look='true'][data-codex-composer-width='codex'] [data-slot='composer-dock']:not([data-popped-out]) [data-slot='composer-fade'] > div:last-child > div:has([data-slot='composer-rich-input']) {
  padding-inline: 0 !important;
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
  background: var(--codex-composer-fill) !important;
  box-shadow: var(--shadow-nous) !important;
  backdrop-filter: none !important;
  overflow: hidden !important;
}

html[data-codex-chat-look='true'] [data-slot='composer-surface'] > [aria-hidden] {
  background: var(--codex-composer-fill) !important;
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

/* The native running branch uses a square, while redirect/sending can also
   carry aria-label=Stop. Match the actual native branch, not translated text. */
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[type='submit']:has(> span.block.bg-current) {
  background: color-mix(in oklab, var(--codex-color-destructive) 90%, transparent) !important;
  color: var(--codex-stop-foreground, var(--dt-destructive-foreground)) !important;
}
html[data-codex-chat-look='true'] [data-slot='composer-surface'] button[type='submit']:has(> span.block.bg-current):hover {
  background: var(--codex-color-destructive) !important;
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

/* The frame owns paint; native scroll-state opacity only ghosts the content.
   Keep the scroll owner's constraints and the frame's existing clip radius. */
html[data-codex-chat-look='true'] [data-slot='composer-status-stack'] > div:has(> [data-slot='status-stack-scroll']) {
  margin: 0 26px !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 20px 20px 0 0 !important;
  background: var(--codex-color-status-panel) !important;
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

/* Legacy cards still paint themselves; the current content keeps its native
   opacity ladder without dimming the frame's shared surface. */
html[data-codex-chat-look='true'] [data-slot='composer-status-stack'] [data-slot='status-stack-content'][data-codex-status-card='true'] {
  background: transparent !important;
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
html[data-codex-chat-look='true'] [data-tree-group] [data-zone-tabstrip] [role='tab'] > :is(span, button) > span.truncate,
html[data-codex-chat-look='true'] [data-tree-group] [data-zone-tabstrip] [role='tab'] > .pane-tab-content > :is(span, button) > span.truncate {
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
  container-type: inline-size;
  container-name: codex-browser;
  --codex-browser-shadow-ink: var(--ui-text-primary);
  --codex-browser-shadow: 0 1px 2px color-mix(in srgb, var(--codex-browser-shadow-ink) 9%, transparent),
    0 2px 6px color-mix(in srgb, var(--codex-browser-shadow-ink) 7%, transparent);
}

/* Keep custom-theme controls in the same color family as their backdrop. */
html[data-codex-chat-look='true']:not([data-hermes-theme='codex-chat']) aside[data-preview-browser] {
  --codex-browser-address: color-mix(in srgb, var(--codex-browser-background) 97%, var(--ui-text-primary));
  --codex-browser-border: color-mix(in srgb, var(--ui-text-primary) 10%, var(--codex-browser-address));
}

html[data-codex-chat-look='true'][data-hermes-mode='dark'] aside[data-preview-browser] {
  --codex-browser-shadow-ink: var(--theme-background-seed, var(--codex-browser-background));
}

/* Width responds to the pane, not the whole window. Keep every native action
   reachable when a split narrows: wrap instead of clipping the address. */
html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) {
  position: relative !important;
  isolation: isolate;
  anchor-scope: --codex-browser-tools-start, --codex-browser-tools-end;
  height: auto !important;
  min-height: 45px !important;
  flex: 0 0 auto !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  box-sizing: border-box !important;
  padding: 6px 10px !important;
  gap: 4px !important;
  border: 0 !important;
  border-bottom: 1px solid color-mix(in srgb, var(--codex-browser-divider) 35%, transparent) !important;
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
  height: 32px !important;
  min-height: 32px !important;
  box-sizing: border-box !important;
  border-radius: 999px !important;
  border-width: 1px !important;
  border-style: solid !important;
  background: var(--codex-browser-address) !important;
  color: var(--ui-text-primary) !important;
  padding-left: 12px !important;
  padding-right: 28px !important;
  font-size: 12px !important;
  box-shadow: var(--codex-browser-shadow) !important;
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

/* A shared capsule behind the three native navigation buttons. No reparenting:
   tooltips, disabled states and React's handlers remain on their own nodes. */
html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input'])::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 6px;
  width: 96px;
  height: 32px;
  box-sizing: border-box;
  border: 1px solid var(--codex-browser-border);
  border-radius: 999px;
  background: var(--codex-browser-address);
  box-shadow: var(--codex-browser-shadow);
  z-index: -1;
  pointer-events: none;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button:nth-child(-n+3) {
  position: relative;
  width: 28px !important;
  min-width: 28px !important;
  height: 28px !important;
  min-height: 28px !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) input[data-slot='input'].pl-6 {
  padding-left: 24px !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button:nth-child(3) {
  margin-inline-end: 6px !important;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button:nth-child(3)::before {
  content: '';
  position: absolute;
  left: -2px;
  top: 7px;
  width: 1px;
  height: 14px;
  background: var(--codex-browser-border);
  pointer-events: none;
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button {
  border-radius: 999px !important;
}

/* Paint shared chrome without moving React-owned controls. Narrow panes keep
   ungrouped actions so native wrapping remains usable. */
@supports (anchor-name: --codex-browser-tools-start) {
  @container codex-browser (min-width: 520px) {
    html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > div:has(> input[data-slot='input']) + button {
      anchor-name: --codex-browser-tools-start;
      margin-inline-start: 10px;
    }
    html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button:nth-last-child(2) {
      anchor-name: --codex-browser-tools-end;
    }
    html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input'])::after {
      content: '';
      position: absolute;
      left: calc(anchor(--codex-browser-tools-start left) - 4px);
      right: calc(anchor(--codex-browser-tools-end right) - 4px);
      top: calc(anchor(--codex-browser-tools-start top) - 4px);
      height: 32px;
      box-sizing: border-box;
      border: 1px solid var(--codex-browser-border);
      border-radius: 999px;
      background: var(--codex-browser-address);
      box-shadow: var(--codex-browser-shadow);
      pointer-events: none;
      z-index: -1;
    }
    html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button:last-child {
      width: 32px !important;
      min-width: 32px !important;
      height: 32px !important;
      min-height: 32px !important;
      margin-inline-start: 8px;
      border: 1px solid var(--codex-browser-border) !important;
      background: var(--codex-browser-address) !important;
      box-shadow: var(--codex-browser-shadow) !important;
    }
    html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) > button:last-child:is(:hover, :focus-visible):not(:disabled) {
      background: var(--ui-row-hover-background) !important;
    }
  }
}

html[data-codex-chat-look='true'] aside[data-preview-browser] > div:first-child > div:has(> div > input[data-slot='input']) button:not(:disabled) {
  color: var(--ui-text-primary) !important;
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
      codexSkinFeatureUsed('complete_messages')
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

const sentEditBindings = new Map()

function decorateSentMessageEditors() {
  for (const [root, binding] of sentEditBindings) {
    if (root.isConnected && root.contains(binding.send)) continue
    binding.cleanup()
    sentEditBindings.delete(root)
  }
  for (const root of document.querySelectorAll('[data-slot="aui_edit-composer-root"]')) {
    const panel = root.querySelector('.composer-human-message')
    const editor = root.querySelector('[data-slot="composer-rich-input"][contenteditable="true"]')
    const send = panel?.querySelector(':scope > button:not([data-codex-edit-cancel])')
    if (!editor || !send) continue
    let binding = sentEditBindings.get(root)
    if (!binding) {
      let active = true
      let retryFrame = null
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.setAttribute('data-codex-edit-cancel', '')
      cancel.onpointerdown = event => event.preventDefault()
      cancel.onclick = () => {
        if (!active || !root.isConnected) return
        if (retryFrame !== null) window.cancelAnimationFrame(retryFrame)
        const escape = () => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        escape()
        // The first Escape can close a native mention/file suggestion first.
        if (active) retryFrame = window.requestAnimationFrame(() => {
          retryFrame = null
          if (active && root.isConnected && editor.isConnected) escape()
        })
      }
      panel.append(cancel)
      const resize = new ResizeObserver(() => {
        panel.style.setProperty('--codex-edit-send-width', `${send.getBoundingClientRect().width}px`)
      })
      resize.observe(send)
      binding = { send, cancel, cleanup: () => {
        active = false
        if (retryFrame !== null) window.cancelAnimationFrame(retryFrame)
        retryFrame = null
        resize.disconnect()
        cancel.remove()
        send.removeAttribute('data-codex-edit-send')
        panel.style.removeProperty('--codex-edit-send-width')
      } }
      sentEditBindings.set(root, binding)
    }
    const french = document.documentElement.lang.toLowerCase().startsWith('fr')
    const cancelLabel = french ? 'Annuler' : 'Cancel'
    const sendLabel = french ? 'Envoyer' : 'Send'
    if (binding.cancel.textContent !== cancelLabel) binding.cancel.textContent = cancelLabel
    if (send.getAttribute('data-codex-edit-send') !== sendLabel) send.setAttribute('data-codex-edit-send', sendLabel)
  }
}

function clearSentMessageEditors() {
  for (const binding of sentEditBindings.values()) binding.cleanup()
  sentEditBindings.clear()
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
    return typeof mode === 'string' && Object.hasOwn(COMPOSER_WIDTH_MODES, mode) ? mode : 'codex'
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
  const normalized = typeof mode === 'string' && Object.hasOwn(COMPOSER_WIDTH_MODES, mode) ? mode : 'codex'
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


function loadInboxOnlyMode() {
  try {
    return pluginStorage?.get(INBOX_ONLY_STORAGE_KEY, 'off') === 'on' ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

function syncInboxOnlyRoot() {
  globalThis.document?.documentElement?.setAttribute?.('data-codex-inbox-only', inboxOnlyMode)
}

function setInboxOnlyMode(mode) {
  const normalized = mode === 'on' ? 'on' : 'off'
  try {
    if (typeof pluginStorage?.get !== 'function' || typeof pluginStorage?.set !== 'function') throw Error('Storage unavailable')
    pluginStorage.get(INBOX_ONLY_STORAGE_KEY, 'off')
    pluginStorage.set(INBOX_ONLY_STORAGE_KEY, normalized)
    if (pluginStorage.get(INBOX_ONLY_STORAGE_KEY, null) !== normalized) throw Error('Setting was not saved')
  } catch {
    host.notify?.({ kind: 'error', message: 'Inbox only (Beta) setting could not be saved. Display was not changed.' })
    return false
  }
  // Keep palette state and presentation on the last verified choice even if
  // the SDK swallows a write, or the read immediately after a write fails.
  inboxOnlyMode = normalized
  syncInboxOnlyRoot()
  return true
}

function readFloatingSidebarMode() {
  try {
    return pluginStorage?.get(FLOATING_SIDEBAR_STORAGE_KEY, 'on') === 'off' ? 'off' : 'on'
  } catch {
    return 'off'
  }
}

function syncFloatingSidebarRoot() {
  const mode = readFloatingSidebarMode()
  globalThis.document?.documentElement?.setAttribute?.('data-codex-floating-sidebar', mode)
  return mode
}

function setFloatingSidebarMode(mode) {
  const normalized = mode === 'off' ? 'off' : 'on'
  try {
    // Do not replace an unreadable preference or apply an unverified save.
    if (typeof pluginStorage?.get !== 'function' || typeof pluginStorage?.set !== 'function') throw Error('Storage unavailable')
    pluginStorage.get(FLOATING_SIDEBAR_STORAGE_KEY, 'on')
    pluginStorage.set(FLOATING_SIDEBAR_STORAGE_KEY, normalized)
    if (pluginStorage.get(FLOATING_SIDEBAR_STORAGE_KEY, null) !== normalized) throw Error('Setting was not saved')
  } catch {
    host.notify?.({ kind: 'error', message: 'Floating sidebar setting could not be saved. Layout was not changed.' })
    return false
  }
  syncFloatingSidebarRoot()
  return true
}

function turnDurationHistoryRecords(messages) {
  const records = new Map(), seen = new Set()
  let turn = null
  const validTime = value => typeof value === 'number' && Number.isFinite(value) && value > 0
  const finish = () => {
    if (turn && !turn.duplicate && validTime(turn.end) && turn.end >= turn.start) {
      records.set(turn.key, Math.max(1, Math.round(turn.end - turn.start)))
    }
  }
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.display_kind && message.display_kind !== 'skill_invocation') continue
    if (message?.role === 'user') {
      finish()
      turn = null
      if (!validTime(message.timestamp)) continue
      const key = String(message.timestamp), duplicate = seen.has(key)
      if (duplicate) records.delete(key)
      seen.add(key)
      turn = { key, start: message.timestamp, end: null, duplicate }
    } else if (message?.role === 'assistant' && turn && typeof message.text === 'string' && message.text.trim()) {
      turn.end = validTime(message.timestamp) ? message.timestamp : null
    }
  }
  finish()
  return records
}

// Hydration IDs contain their source timestamp, but the source index changes
// between REST and session.history projections. Match only a unique exact
// timestamp; duplicate or missing identities must leave prose visible.
function turnHistoryProseKinds(messages) {
  const kinds = new Map(), seen = new Set(), duplicates = new Set()
  for (const message of Array.isArray(messages) ? messages : []) {
    if (typeof message?.timestamp !== 'number' || !Number.isFinite(message.timestamp) || message.timestamp <= 0) continue
    const key = String(message.timestamp)
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
    if (message.role === 'assistant') kinds.set(key, Array.isArray(message.tool_calls) && message.tool_calls.length ? 'interim' : 'answer')
  }
  for (const key of duplicates) kinds.delete(key)
  return kinds
}

function formatTurnActivityDuration(seconds) {
  const minutes = Math.floor(seconds / 60), remainder = seconds % 60
  if (seconds >= 3600) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`
}

function formatNativeTurnActivityDuration(text) {
  // Native activity-timer.ts formatElapsed emits M:SS for whole minutes.
  // Other text remains authoritative but is not a certified numeric clock.
  const match = /^([1-9]\d*):([0-5]\d)$/.exec(text)
  const minutes = match ? Number(match[1]) : NaN
  return Number.isSafeInteger(minutes) && minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : text
}


const TURN_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const TURN_TIME_DETAIL_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' })

function decorateTurnHeader(header, label, completedAt) {
  // An existing header can survive a plugin hot reload from the old placement.
  header.querySelectorAll('[data-codex-turn-hammer]').forEach(icon => icon.remove())
  header.querySelector('svg')?.setAttribute('data-codex-turn-chevron', '')
  header.setAttribute('aria-label', label)
  header.removeAttribute('title')
  let timing = header.querySelector('[data-codex-turn-time]')
  const date = typeof completedAt === 'number' && Number.isFinite(completedAt) && completedAt > 0 ? new Date(completedAt * 1000) : null
  if (!date || Number.isNaN(date.getTime())) {
    timing?.remove()
    header.removeAttribute('aria-description')
    return
  }
  if (!timing) {
    timing = document.createElement('span')
    timing.setAttribute('data-codex-turn-time', '')
    timing.setAttribute('aria-hidden', 'true')
    timing.innerHTML = '<time data-codex-turn-finished-time></time><span data-codex-turn-time-tip role="tooltip"></span>'
    header.append(timing)
  }
  const time = timing.querySelector('time'), tooltip = timing.querySelector('[role="tooltip"]')
  const short = TURN_TIME_FORMAT.format(date), full = TURN_TIME_DETAIL_FORMAT.format(date)
  time.dateTime = date.toISOString()
  if (time.textContent !== short) time.textContent = short
  if (tooltip.textContent !== full) tooltip.textContent = full
  header.setAttribute('aria-description', full)
}

function turnActivityIsActive(pair) {
  return [...pair.querySelectorAll(`[data-role="assistant"][data-streaming="true"], [data-slot="aui_message-streaming-marker"][data-message-streaming="true"], [role="status"], ${TURN_ACTION_SELECTOR}`)]
    .some(node => node.closest('[data-slot="aui_turn-pair"]') === pair)
}

// The SDK busy flag follows focus, not every mounted timeline. Never lend it
// to a tile, another connection/profile, or a route still hydrating its owner.
function turnWorkspaceOwnerMatches() {
  const runtimeId = currentRuntimeSessionId(), storedId = routedStoredSessionId()
  const focused = host.state.focusedSessionOwner?.get?.()
  return Boolean(runtimeId && storedId && focused
    && host.state.focusedSessionId?.get?.() === runtimeId
    && host.state.focusedStoredSessionId?.get?.() === storedId
    && focused.connectionId === host.state.connectionId?.get?.()
    && focused.profile === currentProfileScope())
}

function turnWorkspaceBusy() {
  if (!turnWorkspaceOwnerMatches()) return null
  const runtimeId = currentRuntimeSessionId()
  const bySession = host.state.busyBySession?.get?.()
  const focusedBusy = host.state.busy?.get?.()
  // Either positive flag wins during atom publication gaps. An explicit
  // malformed per-session value is unknown, not an inferred idle fallback.
  if (bySession?.[runtimeId] === true || focusedBusy === true) return true
  const busy = bySession && Object.hasOwn(bySession, runtimeId) ? bySession[runtimeId] : focusedBusy
  return typeof busy === 'boolean' ? busy : null
}

function createTurnActivityEvidence(currentScope, currentDomScope = currentScope) {
  const owners = new WeakMap()
  let scope, running = null, selected = null, lastBusy = null, disposed = false
  const syncScope = () => {
    const next = currentScope()
    if (scope !== next) { scope = next; running = null; selected = null; lastBusy = null }
  }
  return {
    event(type, payload) {
      if (disposed) return
      syncScope()
      if (type === 'start') { running = true; selected = null }
      else if (type === 'complete') running = false
      else if (type === 'info' && typeof payload?.running === 'boolean') running = payload.running
    },
    snapshot() {
      const evidence = new Map()
      if (disposed) return evidence
      syncScope()
      const domScope = currentDomScope()
      const surfaces = document.querySelectorAll('[data-session-anchor="workspace"]')
      // Reject a known departed owner even while destination SDK atoms are
      // incomplete. Unknown activity cannot certify a stale footer as settled.
      for (const surface of surfaces) for (const pair of surface.querySelectorAll('[data-slot="aui_turn-pair"]')) {
        if (pair.closest('[data-session-anchor]') !== surface) continue
        const userId = userMessageId(pair), owner = owners.get(pair)
        if (userId && owner?.userId === userId && owner.scope !== domScope) evidence.set(pair, { quarantined: true })
        // DOM ownership must survive incomplete SDK publication too. A route
        // change cannot reassign already-seen native nodes to its destination.
        else if (userId) owners.set(pair, { scope: domScope, userId })
      }
      if (!turnWorkspaceOwnerMatches()) return evidence
      const busy = turnWorkspaceBusy()
      if (busy === null && running === null) return evidence
      if (busy === true && lastBusy === false) selected = null
      lastBusy = busy
      if (surfaces.length !== 1) return evidence
      const surface = surfaces[0]
      const pairs = [...surface.querySelectorAll('[data-slot="aui_turn-pair"]')].filter(pair => {
        if (pair.closest('[data-session-anchor]') !== surface || !userMessageId(pair) || isProvisionalTurn(pair)) return false
        const userId = userMessageId(pair)
        // A reused stale element cannot acquire a new session by navigation
        // alone. A new native user identity establishes its new lifecycle.
        if (evidence.has(pair)) return false
        owners.set(pair, { scope: domScope, userId })
        return true
      })
      const local = pairs.filter(turnActivityIsActive)
      if (local.length > 1) return evidence
      if (local.length === 1) selected = { pair: local[0], userId: userMessageId(local[0]), local: true }
      if (selected && (!pairs.includes(selected.pair) || selected.userId !== userMessageId(selected.pair))) selected = null
      // This is a conservative whole-pair veto, NOT an invented run id.
      // Once local activity identifies an earlier owner, keep it through gaps.
      if ((!selected || !selected.local) && pairs.length) selected = { pair: pairs.at(-1), userId: userMessageId(pairs.at(-1)), local: false }
      if (selected) {
        const active = busy === true || running === true
        evidence.set(selected.pair, { active, settled: !active && (busy === false || running === false) })
      }
      return evidence
    },
    clear() { disposed = true; selected = null; running = null }
  }
}

const TURN_NATIVE_ENDS = new WeakMap()

function turnNativeCompletedAt(pair, scope, semanticActive = false) {
  const userId = userMessageId(pair)
  let state = TURN_NATIVE_ENDS.get(pair)
  if (!state || state.scope !== scope || state.userId !== userId) {
    state = { scope, userId, blocked: undefined }
    TURN_NATIVE_ENDS.set(pair, state)
  }
  const root = [...pair.querySelectorAll('[data-role="assistant"][data-slot="aui_assistant-message-root"]')]
    .filter(node => node.closest('[data-slot="aui_turn-pair"]') === pair).at(-1)
  const timestamps = root && turnAnswerParts(root).length
    ? [...root.querySelectorAll(':scope > [data-slot="timeline-timestamp"], :scope > [data-slot="aui_assistant-message-content"] > [data-slot="timeline-timestamp"]')] : []
  // Native TimelineTimestamp emits two time elements only when completedAt
  // exists and exceeds createdAt. A lone authoring timestamp is NOT a finish.
  const times = timestamps.at(-1)?.querySelectorAll('time[datetime]')
  const start = times?.length === 2 ? Date.parse(times[0].getAttribute('datetime')) / 1000 : NaN
  const end = times?.length === 2 ? Date.parse(times[1].getAttribute('datetime')) / 1000 : NaN
  const completedAt = Number.isFinite(start) && start > 0 && Number.isFinite(end) && end > start ? end : undefined
  if (semanticActive || turnActivityIsActive(pair)) { state.blocked = completedAt; return undefined }
  return completedAt !== state.blocked ? completedAt : undefined
}

function clearTurnActivityDecorations(scope = document) {
  const pairs = scope?.matches?.('[data-slot="aui_turn-pair"]')
    ? [scope]
    : [...(scope?.querySelectorAll?.('[data-slot="aui_turn-pair"]') || [])]
  for (const pair of pairs) {
    pair.removeAttribute('data-codex-activity-phase')
    pair.removeAttribute('data-codex-activity-expanded')
    pair.removeAttribute('data-codex-has-previous-replies')
    for (const header of pair.querySelectorAll('[data-codex-turn-activity]')) header.remove()
    for (const item of pair.querySelectorAll('[data-codex-activity-item], [data-codex-standalone-narration], [data-codex-previous-reply], [data-codex-latest-reply]')) {
      item.removeAttribute('data-codex-activity-item')
      item.removeAttribute('data-codex-standalone-narration')
      item.removeAttribute('data-codex-previous-reply')
      item.removeAttribute('data-codex-latest-reply')
    }
  }
}

const TURN_ACTIVITY_SELECTOR = '[data-slot="tool-block"], [data-slot="aui_thinking-disclosure"], [data-slot="aui_changed-files"]'
const TURN_ACTION_SELECTOR = '[data-slot="tool-approval-inline"], [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"]'
// Native ToolTitle exposes failures through these classes, not role=alert.
const TURN_FAILURE_SELECTOR = '.text-destructive, [class~="text-amber-700"], [class~="dark:text-amber-300"]'
const TURN_PROTECTED_SELECTOR = `${TURN_ACTION_SELECTOR}, [data-slot="aui_generated-image"], [data-slot="aui_artifact-card"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"], [data-slot="aui_msg-actions"], [data-slot="aui_turn-duration"], [role="alert"], .text-destructive, img, audio, video, iframe`

function activityProtected(node) {
  if (node.matches(TURN_PROTECTED_SELECTOR) || node.querySelector(TURN_PROTECTED_SELECTOR)) return true
  const content = node.querySelector(':scope > [data-slot="aui_assistant-message-content"]')
  // Unmarked native output, including PreviewAttachment cards, is not prose
  // or activity. Keep its root mounted and fold only identified parts below.
  return Boolean(content && [...content.children].some(part => !part.matches(`.aui-md, ${TURN_ACTIVITY_SELECTOR}, [data-slot="timeline-timestamp"], [data-slot="aui_message-streaming-marker"]`)))
}

function turnAnswerParts(root) {
  const content = root.querySelector(':scope > [data-slot="aui_assistant-message-content"]')
  if (!content) return []
  // Older/native plain text content has no markdown element. Treat its
  // container as the answer rather than confusing a tool-only tail for one.
  if ([...content.childNodes].some(node => node.nodeType === 3 && (node.textContent || '').trim())) return [content]
  // Only the native markdown surface identifies prose. Attachment and status
  // chrome may have text too, but must never displace the actual answer.
  return [...content.children].filter(part => part.matches('.aui-md')
    && !part.closest(TURN_ACTIVITY_SELECTOR) && (part.textContent || '').trim())
}

function turnBackgroundBoundaries(pair) {
  return [...pair.querySelectorAll('[data-slot="aui_background-result"]')].filter(notice =>
    notice.closest('[data-slot="aui_turn-pair"]') === pair
    && !notice.closest('[data-role="user"], [data-role="assistant"], [role="alert"], [data-slot="aui_markdown-alert"]')
    && (notice.closest('[data-slot="aui_system-message-root"]') || notice.parentElement === pair))
}

function turnLatestAnswerParts(roots) {
  const root = roots.findLast(node => turnAnswerParts(node).length)
  if (!root) return new Set()
  const parts = turnAnswerParts(root)
  const last = parts.at(-1)
  const content = root.querySelector(':scope > [data-slot="aui_assistant-message-content"]')
  // Preserve all chunks of the latest reply, including text around media.
  // A native tool/thought or source timestamp separates earlier commentary
  // inside a composite history root from its terminal prose.
  const boundary = [...content.children].findLast(node =>
    node !== last && Boolean(node.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)
    && node.matches(`${TURN_ACTIVITY_SELECTOR}, [data-slot="timeline-timestamp"]`))
  return new Set(parts.filter(part => !boundary
    || part === last || Boolean(boundary.compareDocumentPosition(part) & Node.DOCUMENT_POSITION_FOLLOWING)))
}

function turnPreviousReplyParts(roots, answers) {
  const previous = new Set()
  for (const root of roots) {
    const parts = turnAnswerParts(root)
    for (const part of parts) {
      if (!answers.has(part) && !turnReplyProtected(part)) previous.add(part)
    }
    // Keep the old native controls mounted and reachable in the disclosure,
    // without leaving an orphan Copy/menu row under a folded earlier reply.
    if (parts.length && parts.every(part => previous.has(part))) {
      for (const chrome of root.querySelectorAll(':scope > [data-slot="aui_msg-actions"], :scope > [data-slot="aui_turn-duration"], :scope > [data-slot="timeline-timestamp"]')) previous.add(chrome)
    }
  }
  return previous
}

function turnReplyProtected(part) {
  return activityProtected(part) || part.matches(TURN_REPLY_PROTECTED_SELECTOR)
    || Boolean(part.querySelector(TURN_REPLY_PROTECTED_SELECTOR))
}

function turnActivityTargets(pair, roots, answers, historyKinds) {
  const targets = new Set()
  const add = node => {
    if (node && ![...answers].some(answer => node === answer || node.contains(answer))
      && node.closest('[data-slot="aui_turn-pair"]') === pair && !activityProtected(node)) targets.add(node)
  }
  for (const root of roots) {
    const parts = turnAnswerParts(root)
    const content = root.querySelector(':scope > [data-slot="aui_assistant-message-content"]')
    const firstActivity = content && [...content.children].find(part => part.matches(TURN_ACTIVITY_SELECTOR) || part.querySelector(TURN_ACTIVITY_SELECTOR))
    const historyKind = turnSourceProseKind(root, historyKinds)
    // The public DOM does not expose the mutable native interim flag or run
    // IDs. Even assistant-interim IDs can be promoted to completed replies.
    // Only a uniquely identified tool-bearing source row establishes pre-tool
    // commentary; unknown prose always stays outside the fold.
    const commentary = parts.filter(part => !answers.has(part) && firstActivity
      && historyKind === 'interim'
      && !turnReplyProtected(part)
      && Boolean(part.compareDocumentPosition(firstActivity) & Node.DOCUMENT_POSITION_FOLLOWING))
    if (parts.length && commentary.length === parts.length && !activityProtected(root)) {
      add(root)
      continue
    }
    for (const part of commentary) {
      add(part)
      if (targets.has(part) && part.previousElementSibling?.matches('[data-slot="timeline-timestamp"]')) add(part.previousElementSibling)
    }
    for (const node of root.querySelectorAll(TURN_ACTIVITY_SELECTOR)) add(node)
  }
  for (const notice of turnBackgroundBoundaries(pair)) {
    const label = notice.querySelector(':scope > [data-conversation-scaffold] .truncate')
    if (/^Subagent Tasks? Completed:\s*\S/.test((label?.textContent || '').trim())) add(notice)
  }
  return targets
}

function turnSourceProseKind(root, historyKinds) {
  const historical = /^(\d+(?:\.\d+)?)-\d+-assistant$/.exec(root.getAttribute('data-message-id') || '')
  return historical ? historyKinds?.get(historical[1]) : undefined
}

function turnStandaloneNarrationParts(roots, answers, historyKinds, completed) {
  const narration = new Set()
  if (!completed) return narration
  for (const root of roots) {
    const parts = turnAnswerParts(root)
    if (!parts.length || parts.some(part => answers.has(part)) || root.querySelector(TURN_ACTIVITY_SELECTOR)) continue
    // Same source contract as mixed roots: a missing footer, opaque live id,
    // or sibling order can never certify prose as pre-tool commentary.
    if (turnSourceProseKind(root, historyKinds) !== 'interim') continue
    for (const part of parts) {
      if (part.matches('.aui-md') && !turnReplyProtected(part)) narration.add(part)
    }
  }
  return narration
}

// globalThis is the real window in the renderer and keeps imports DOM-free.
const TURN_EXPANSION_MEMORY = globalThis.__hermesCodexChatLookTurnExpansion ||= new Map()
const TURN_EXPANSION_OWNERS = globalThis.__hermesCodexChatLookTurnExpansionOwners ||= new WeakMap()

function turnExpansionKey(pair, scope) {
  const userId = userMessageId(pair)
  const anchor = pair.closest('[data-session-anchor]')?.getAttribute('data-session-anchor')
  // Other surfaces expose their anchor but no public connection-qualified
  // owner. Preserve their live DOM choice without manufacturing a remount key.
  const key = anchor === 'workspace' && scope && userId && !isProvisionalTurn(pair) ? JSON.stringify([scope, anchor, userId]) : null
  const previous = TURN_EXPANSION_OWNERS.get(pair)
  if (previous && previous !== key) {
    pair.removeAttribute('data-codex-activity-phase')
    pair.removeAttribute('data-codex-activity-expanded')
  }
  TURN_EXPANSION_OWNERS.set(pair, key)
  return key
}

function rememberTurnExpansion(pair) {
  const key = TURN_EXPANSION_OWNERS.get(pair)
  if (!key) return
  TURN_EXPANSION_MEMORY.delete(key)
  TURN_EXPANSION_MEMORY.set(key, pair.getAttribute('data-codex-activity-expanded') === 'true')
  while (TURN_EXPANSION_MEMORY.size > 100) TURN_EXPANSION_MEMORY.delete(TURN_EXPANSION_MEMORY.keys().next().value)
}

function applyTurnActivityExpansion(pair) {
  const collapsed = pair.getAttribute('data-codex-activity-phase') === 'completed'
    && pair.getAttribute('data-codex-activity-expanded') === 'false'
  for (const item of pair.querySelectorAll('[data-codex-activity-item], [data-codex-tool-sequence]')) {
    if (item.closest('[data-slot="aui_turn-pair"]') === pair) item.setAttribute('data-codex-activity-item', collapsed ? 'collapsed' : 'expanded')
  }
  const repliesCollapsed = pair.getAttribute('data-codex-activity-expanded') !== 'true'
  for (const item of pair.querySelectorAll('[data-codex-previous-reply]')) {
    if (item.closest('[data-slot="aui_turn-pair"]') === pair) item.setAttribute('data-codex-previous-reply', repliesCollapsed ? 'collapsed' : 'expanded')
  }
  const header = pair.querySelector(':scope > [data-codex-turn-activity]')
  header?.setAttribute('aria-expanded', String(pair.hasAttribute('data-codex-has-previous-replies') ? !repliesCollapsed : !collapsed))
}

function collapsePreviousTurnActivity(pair) {
  const scope = pair.closest('[data-slot="aui_thread-content"], [data-session-anchor]')
  if (!scope) return
  // Once per new working turn, never on ordinary streamed text mutations.
  const previous = [...scope.querySelectorAll('[data-slot="aui_turn-pair"][data-codex-activity-phase="completed"]')]
    .filter(node => node.closest('[data-slot="aui_thread-content"], [data-session-anchor]') === scope
      && Boolean(node.compareDocumentPosition(pair) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1)
  if (previous) {
    previous.setAttribute('data-codex-activity-expanded', 'false')
    rememberTurnExpansion(previous)
    applyTurnActivityExpansion(previous)
  }
}

/* Turn-fold policy adapted from T3 Code v0.1.7, MessagesTimeline.logic.ts
 * (322f6544dfad0a3c8a0c8cbecf2c7f7874b14268). Native Hermes has no public
 * per-part run identity. Latest-only prose is an explicitly approved display
 * policy, not a claim that earlier replies are duplicates or interim messages.
 *
 * MIT License
 * Copyright (c) 2026 T3 Tools Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
function reconcileTurnActivity(pair, recordedDuration = '', historyKinds = null, ownerScope = '', recordedEnd = undefined, liveDuration = '', evidence = null) {
  if (evidence?.quarantined) { clearTurnActivityDecorations(pair); return }
  const expansionKey = turnExpansionKey(pair, ownerScope)
  const owned = selector => [...pair.querySelectorAll(selector)].filter(node => node.closest('[data-slot="aui_turn-pair"]') === pair)
  const failed = owned('[data-slot="tool-block"]').some(tool => tool.querySelector(TURN_FAILURE_SELECTOR))
  const interrupted = owned('[data-slot="aui_assistant-message-stopped"]').length > 0
  if (failed || interrupted) {
    clearTurnActivityDecorations(pair)
    return
  }
  const roots = owned('[data-role="assistant"][data-slot="aui_assistant-message-root"]')
  const active = turnActivityIsActive(pair) || evidence?.active === true
  const finalIndex = roots.findLastIndex(root => root.querySelector('[data-slot="aui_msg-actions"]'))
  const uncertainTail = roots.slice(finalIndex + 1).some(root => (root.textContent || '').trim() || root.querySelector(`${TURN_ACTIVITY_SELECTOR}, ${TURN_PROTECTED_SELECTOR}`))
  const completed = !active && ((finalIndex >= 0 && !uncertainTail) || evidence?.settled === true)
  const answers = turnLatestAnswerParts(roots)
  const previousReplies = turnPreviousReplyParts(roots, answers)
  const hadPreviousReplies = pair.hasAttribute('data-codex-has-previous-replies')
  pair.toggleAttribute('data-codex-has-previous-replies', previousReplies.size > 0)
  for (const old of owned('[data-codex-latest-reply]')) if (!answers.has(old)) old.removeAttribute('data-codex-latest-reply')
  for (const part of answers) if (!part.hasAttribute('data-codex-latest-reply')) part.setAttribute('data-codex-latest-reply', '')
  for (const old of owned('[data-codex-previous-reply]')) if (!previousReplies.has(old)) old.removeAttribute('data-codex-previous-reply')
  for (const part of previousReplies) if (!part.hasAttribute('data-codex-previous-reply')) part.setAttribute('data-codex-previous-reply', 'expanded')
  const targets = turnActivityTargets(pair, roots, answers, historyKinds)
  const standalone = turnStandaloneNarrationParts(roots, answers, historyKinds, completed)
  for (const part of standalone) targets.add(part)
  for (const old of owned('[data-codex-standalone-narration]')) if (!standalone.has(old)) old.removeAttribute('data-codex-standalone-narration')
  for (const part of standalone) if (!part.hasAttribute('data-codex-standalone-narration')) part.setAttribute('data-codex-standalone-narration', 'true')
  for (const old of owned('[data-codex-activity-item]')) if (!targets.has(old)) old.removeAttribute('data-codex-activity-item')
  for (const item of targets) item.setAttribute('data-codex-activity-item', 'expanded')
  let header = pair.querySelector(':scope > [data-codex-turn-activity]')
  if (!targets.size && !previousReplies.size) {
    header?.remove()
    pair.removeAttribute('data-codex-activity-phase')
    pair.removeAttribute('data-codex-activity-expanded')
    return
  }
  const phase = completed ? 'completed' : active ? 'working' : 'uncertain'
  if (active && pair.getAttribute('data-codex-activity-phase') !== 'working') {
    if (expansionKey) TURN_EXPANSION_MEMORY.delete(expansionKey)
    collapsePreviousTurnActivity(pair)
  }
  if (previousReplies.size && (!hadPreviousReplies || pair.getAttribute('data-codex-activity-phase') !== phase)) {
    const remembered = completed && expansionKey ? TURN_EXPANSION_MEMORY.get(expansionKey) : undefined
    pair.setAttribute('data-codex-activity-expanded', String(remembered === true))
  } else if (!previousReplies.size && (!completed || pair.getAttribute('data-codex-activity-phase') !== 'completed')) {
    const remembered = completed && expansionKey ? TURN_EXPANSION_MEMORY.get(expansionKey) : undefined
    pair.setAttribute('data-codex-activity-expanded', String(completed ? remembered === true : true))
  }
  pair.setAttribute('data-codex-activity-phase', phase)
  if (!header) {
    header = document.createElement('button')
    header.type = 'button'
    header.setAttribute('data-codex-turn-activity', '')
    header.innerHTML = '<span></span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>'
    let anchor = roots[0] || targets.values().next().value
    while (anchor?.parentElement !== pair && anchor?.parentElement) anchor = anchor.parentElement
    pair.insertBefore(header, anchor || null)
  }
  // Rebind on hot reload; DOM attributes retain the user's current choice.
  header.onclick = () => {
    if (pair.getAttribute('data-codex-activity-phase') !== 'completed' && !pair.hasAttribute('data-codex-has-previous-replies')) return
    pair.setAttribute('data-codex-activity-expanded', String(pair.getAttribute('data-codex-activity-expanded') !== 'true'))
    rememberTurnExpansion(pair)
    applyTurnActivityExpansion(pair)
    codexSkinFeatureUsed('collapse')
  }
  header.disabled = !completed && !previousReplies.size
  // This is Hermes' whole-turn duration, not summed tool times or hydration age.
  const nativeDuration = completed ? roots[finalIndex]?.querySelector('[data-slot="aui_turn-duration"]')?.textContent?.replace(/^\s*⏱\s*/, '').trim() : ''
  const duration = nativeDuration ? formatNativeTurnActivityDuration(nativeDuration) : recordedDuration
  const label = completed ? duration ? `Worked for ${duration}` : 'Worked' : active && liveDuration ? `working ${liveDuration}` : 'Working'
  const labelNode = header.querySelector('span')
  if (labelNode.textContent !== label) labelNode.textContent = label
  decorateTurnHeader(header, label, completed ? recordedEnd : undefined)
  applyTurnActivityExpansion(pair)
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
      // session_history.py forwards durable row_id, not a frontend message ID.
      // The installed timeline producer names unloaded rows history:<row_id>.
      const rowId = message.row_id
      const ids = Number.isSafeInteger(rowId) && rowId > 0 ? [`history:${rowId}`] : []
      turn = { ids, question: text, answer: '' }
      entries.push(turn)
    } else if (message.role === 'assistant' && turn && text) {
      turn.answer = text.slice(0, 600)
    }
  }
  return entries
}

function historyTimelineIndex(button) {
  const value = button.getAttribute('data-timeline-index')
  if (!/^(?:0|[1-9]\d*)$/.test(value || '')) return null
  const index = Number(value)
  return Number.isSafeInteger(index) ? index : null
}

function historyTranscriptSliceEntry(entries, buttons, button) {
  // The DOM is a virtualized slice, not a full/suffix prompt index. Verify
  // GLOBAL indices and exact unique durable IDs for every mounted tick.
  // An unrepresented earlier-history sentinel/filtered prefix fails closed.
  const identities = new Map()
  for (const entry of entries) for (const id of entry.ids) identities.set(id, identities.has(id) ? null : entry)
  const seen = new Set()
  for (const tick of buttons) {
    const index = historyTimelineIndex(tick)
    const id = tick.getAttribute('data-timeline-id')
    const entry = index === null ? null : entries[index]
    if (!id || seen.has(id) || !entry || identities.get(id) !== entry || historyPromptPreview(entry.question) !== tick.getAttribute('aria-label')) return null
    seen.add(id)
  }
  return entries[historyTimelineIndex(button)] || null
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
    let previewPair = null
    let previousDescription = null
    let closeTimer = 0
    let revision = 0
    let historyCache = null
    let labels = ''
    let waveFrame = 0
    let paintedIndex = null
    let ticksByIndex = new Map()
    const paintedBars = new Set()
    let contentVersion = 0
    let mountedVersion = -1
    let mountedUsers = new Map()
    let paneIdentity = surface.getAttribute('data-session-anchor')
    const cancelClose = () => window.clearTimeout(closeTimer)
    // T3 TimelineMinimap.tsx:210-234, literal discrete scale coefficients.
    // Native events choose the button; do not reinterpret its hit geometry.
    const queueWave = () => {
      if (waveFrame) return
      waveFrame = window.requestAnimationFrame(() => {
        waveFrame = 0
        if (!hovered || !buttons.length) return
        const index = historyTimelineIndex(hovered)
        if (!Number.isSafeInteger(index) || index < 0 || ticksByIndex.get(index)?.button !== hovered || paintedIndex === index) return
        const dirty = new Set(paintedBars)
        for (let delta = -2; delta <= 2; delta++) {
          const tick = ticksByIndex.get(index + delta)
          if (tick?.bar) dirty.add(tick.bar)
        }
        for (const bar of dirty) {
          const distance = Math.abs(Number(bar.parentElement.getAttribute('data-timeline-index')) - index)
          const scale = distance === 0 ? '1' : distance === 1 ? '0.667' : distance === 2 ? '0.417' : '0.333'
          if (scale === '0.333') {
            if (bar.style.getPropertyValue('--codex-history-scale')) bar.style.removeProperty('--codex-history-scale')
            paintedBars.delete(bar)
          } else {
            if (bar.style.getPropertyValue('--codex-history-scale') !== scale) bar.style.setProperty('--codex-history-scale', scale)
            paintedBars.add(bar)
          }
        }
        paintedIndex = index
      })
    }
    const close = () => {
      if (!hovered && card.hidden && !waveFrame && !paintedBars.size) { cancelClose(); return }
      revision += 1
      paintedIndex = null
      cancelClose()
      window.cancelAnimationFrame(waveFrame)
      waveFrame = 0
      if (hovered) {
        if (previousDescription === null) hovered.removeAttribute('aria-describedby')
        else hovered.setAttribute('aria-describedby', previousDescription)
      }
      hovered = null
      previewPair = null
      card.hidden = true
      question.textContent = ''
      answer.replaceChildren()
      root.removeAttribute('data-codex-history-open')
      for (const bar of paintedBars) bar.style.removeProperty('--codex-history-scale')
      paintedBars.clear()
      for (const button of buttons) if (button.hasAttribute('data-codex-history-hover')) button.removeAttribute('data-codex-history-hover')
    }
    const refresh = () => {
      const next = [...strip.querySelectorAll('.thread-timeline-tick')]
        .filter(button => button.closest('[data-slot="thread-timeline-ticks"]') === strip)
      const nextLabels = JSON.stringify(next.map(button => [button.getAttribute('data-timeline-id'), button.getAttribute('data-timeline-index'), button.getAttribute('aria-label')]))
      const changed = nextLabels !== labels || next.length !== buttons.length || next.some((b, i) => b !== buttons[i])
      if (changed) {
        close()
        historyCache = null
      }
      labels = nextLabels
      buttons = next
      if (changed) ticksByIndex = new Map(buttons.map(button => [historyTimelineIndex(button), { button, bar: button.querySelector('[data-slot="timeline-bar"]') }]).filter(([index]) => index !== null))
    }
    const position = () => {
      if (!hovered || card.hidden) return
      const boundary = surface.getBoundingClientRect()
      const tick = hovered.getBoundingClientRect()
      const edge = root.getBoundingClientRect().left - boundary.left + 36
      const setStyle = (name, value) => { if (card.style.getPropertyValue(name) !== value) card.style.setProperty(name, value) }
      setStyle('left', `${edge}px`)
      setStyle('width', `${Math.max(0, Math.min(320, boundary.width - edge - 8))}px`)
      setStyle('max-height', `${Math.max(0, boundary.height - 16)}px`)
      const height = card.getBoundingClientRect().height
      setStyle('top', `${Math.max(8, Math.min(boundary.height - height - 8, tick.top + tick.height / 2 - boundary.top - height / 2))}px`)
    }
    const fillUnloaded = button => {
      // The SDK's active runtime belongs to the primary workspace, not a tile's
      // stored ID. Never send a tile's identifier to this runtime-only RPC.
      if (surface.getAttribute('data-session-anchor') !== 'workspace' || typeof host.request !== 'function') return
      const sessionId = currentRuntimeSessionId()
      if (!sessionId) return
      const scope = JSON.stringify([sessionId, currentProfileScope(), routedStoredSessionId(), surface.getAttribute('data-session-anchor'), labels])
      const expectedRevision = revision
      if (!historyCache || historyCache.scope !== scope || Date.now() - historyCache.time > 20000) {
        historyCache = { scope, time: Date.now(), promise: Promise.resolve().then(() => host.request('session.history', { session_id: sessionId })).then(result => historyTranscriptEntries(result?.messages)) }
      }
      historyCache.promise.then(entries => {
        if (revision !== expectedRevision || hovered !== button || !root.isConnected || card.hidden) return
        if (JSON.stringify([currentRuntimeSessionId(), currentProfileScope(), routedStoredSessionId(), surface.getAttribute('data-session-anchor'), labels]) !== scope) return
        const entry = historyTranscriptSliceEntry(entries, buttons, button)
        if (!entry) return
        question.textContent = entry.question
        answer.replaceChildren(historyPlainFragment(entry.answer))
        answer.hidden = !entry.answer
        position()
      }).catch(() => { /* Keep the native question preview on missing history. */ })
    }
    const mountedRow = button => {
      // Index mounted users only once per content version, then resolve by
      // exact native identity. Duplicate labels are never an identity source.
      if (mountedVersion !== contentVersion) {
        mountedUsers.clear()
        const viewport = surface.querySelector('[data-slot="aui_thread-viewport"]')
        for (const user of viewport?.querySelectorAll('[data-slot="aui_user-message-root"]') || []) {
          const id = user.getAttribute('data-message-id')
          if (!id) continue
          const row = { user, text: user.querySelector('[data-slot="aui_user-message-text"]')?.textContent || '' }
          mountedUsers.set(id, mountedUsers.has(id) ? null : row)
        }
        mountedVersion = contentVersion
      }
      const candidate = mountedUsers.get(button.getAttribute('data-timeline-id'))
      return candidate && historyPromptPreview(candidate.text) === button.getAttribute('aria-label') ? candidate : null
    }
    const fillPreview = (button, row) => {
      question.textContent = button.getAttribute('aria-label') || ''
      answer.replaceChildren()
      const pair = row?.user?.closest('[data-slot="aui_turn-pair"]')
      previewPair = pair || null
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
      if (!pair) fillUnloaded(button)
    }
    const show = (button, pointerY = null) => {
      cancelClose()
      if (button === hovered) {
        if (pointerY !== null) queueWave(pointerY)
        return
      }
      for (const [otherRoot, state] of rails) if (otherRoot !== root) state.close()
      const index = buttons.indexOf(button)
      if (index < 0) return
      revision += 1
      if (hovered) {
        if (previousDescription === null) hovered.removeAttribute('aria-describedby')
        else hovered.setAttribute('aria-describedby', previousDescription)
        hovered.removeAttribute('data-codex-history-hover')
      }
      hovered = button
      previousDescription = button.getAttribute('aria-describedby')
      button.setAttribute('aria-describedby', [previousDescription, card.id].filter(Boolean).join(' '))
      if (!root.hasAttribute('data-codex-history-open')) root.setAttribute('data-codex-history-open', '')
      button.setAttribute('data-codex-history-hover', '')
      queueWave()
      fillPreview(button, mountedRow(button))
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
    const onScroll = () => close()
    strip.addEventListener('scroll', onScroll, { passive: true })
    card.addEventListener('mouseover', cancelClose)
    card.addEventListener('mouseout', onOut)
    const measureGeometry = () => JSON.stringify([surface, root].map(node => {
      const { left, top, width, height } = node.getBoundingClientRect()
      return [left, top, width, height]
    }))
    let geometry = measureGeometry()
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
      const height = `${Math.max(10, entries[0].contentRect.height - 32)}px`
      if (root.style.getPropertyValue('--codex-history-rail-height') !== height) root.style.setProperty('--codex-history-rail-height', height)
      const nextGeometry = measureGeometry()
      if (nextGeometry !== geometry) close()
      geometry = nextGeometry
    }) : null
    resize?.observe(surface)
    // This observer only invalidates preview data. It owns no navigation,
    // reads no transcript on pointer samples and ignores the preview itself.
    const contentChanges = new MutationObserver(records => {
      if (records.some(record => strip.contains(record.target))) refresh()
      const viewport = surface.querySelector('[data-slot="aui_thread-viewport"]')
      const transcriptChanges = records.filter(record => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement
        const projection = '[data-codex-turn-activity], [data-codex-tool-sequence], [data-codex-activity-face], [data-slot="timeline-timestamp"]'
        if (target?.closest(projection)) return false
        // Incremental plugin headers are not native transcript changes.
        if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes]
          .every(node => node instanceof Element && node.matches(projection))) return false
        return viewport?.contains(record.target) || (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes]
          .some(node => node instanceof Element && node.matches('[data-slot="aui_thread-viewport"]')))
      })
      if (!transcriptChanges.length) return
      contentVersion += 1
      mountedUsers.clear()
      if (!hovered) return
      const row = mountedRow(hovered)
      const pair = row?.user?.closest('[data-slot="aui_turn-pair"]') || null
      // Streaming in another turn invalidates the DOM index, not scoped RPC
      // history or its pending response. Repaint only this mounted preview or
      // a mounted/unmounted handoff; keep hover/ARIA/wave state intact.
      if (pair !== previewPair || (pair && transcriptChanges.some(record => pair.contains(record.target)))) {
        revision += 1
        fillPreview(hovered, row)
      }
    })
    contentChanges.observe(surface, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-message-id', 'data-timeline-id', 'data-timeline-index', 'aria-label'] })
    const cleanup = () => {
      close()
      historyCache = null
      resize?.disconnect()
      contentChanges.disconnect()
      mountedUsers.clear()
      ticksByIndex.clear()
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
    const invalidate = () => { close(); historyCache = null; mountedUsers.clear(); contentVersion += 1 }
    rails.set(root, { close, cleanup, refresh, surface, invalidate, checkPane: () => {
      const next = surface.getAttribute('data-session-anchor')
      if (paneIdentity !== next) { paneIdentity = next; invalidate() }
    } })
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
        state.checkPane()
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

function installChatWidthRuntime() {
  const selector = '[data-slot="aui_thread-viewport"]'
  const property = '--codex-chat-scrollbar-inset'
  const viewports = new Set()
  const sync = viewport => {
    // Match ChatCanvas.tsx's measured gutter rather than assuming overlay or
    // fixed-width scrollbars. Stable both-edges keeps the lane pane-centered.
    const next = `${viewport.offsetWidth - viewport.clientWidth}px`
    if (viewport.style.getPropertyValue(property) !== next) viewport.style.setProperty(property, next)
  }
  const observer = new window.ResizeObserver(entries => {
    for (const { target } of entries) if (viewports.has(target)) sync(target)
  })
  return {
    refresh() {
      for (const viewport of viewports) {
        if (viewport.isConnected && viewport.matches(selector)) continue
        observer.unobserve(viewport)
        viewport.style.removeProperty(property)
        viewports.delete(viewport)
      }
      for (const viewport of document.querySelectorAll(selector)) {
        if (viewports.has(viewport)) continue
        viewports.add(viewport)
        sync(viewport)
        observer.observe(viewport)
      }
    },
    cleanup() {
      observer.disconnect()
      for (const viewport of viewports) viewport.style.removeProperty(property)
      viewports.clear()
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
  const chatWidth = installChatWidthRuntime()
  let scheduled = false
  let animationFrame = 0
  let processAllPairs = true
  let historicalPairScanPending = false
  let pairWorkHandle = 0
  let pairWorkUsesIdleCallback = false
  let composerDirty = true
  let destroyed = false
  const dirtyPairs = new Set()
  const replyTextPresence = new WeakMap()
  const durationOwners = new WeakMap()
  let durationHistory = null
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

  const durationScope = () => liveClockScope()
  const liveClock = createLiveTurnClock()
  let liveClockTimer = 0
  const liveClockPairs = () => new Set([...document.querySelectorAll(
    `[data-role="assistant"][data-streaming="true"], [data-slot="aui_message-streaming-marker"][data-message-streaming="true"], [role="status"], ${TURN_ACTION_SELECTOR}`
  )].map(node => node.closest('[data-slot="aui_turn-pair"]')).filter(pair => pair
    && pair.closest('[data-session-anchor]')?.getAttribute('data-session-anchor') === 'workspace'))
  const refreshLiveClock = () => {
    window.clearTimeout(liveClockTimer)
    liveClockTimer = 0
    if (destroyed || !liveClock.running(liveClockScope()) || document.hidden) return
    liveClockTimer = window.setTimeout(() => {
      liveClockTimer = 0
      if (destroyed) return
      for (const pair of liveClockPairs()) markPair(pair)
      schedulePairWork()
      refreshLiveClock()
    }, 1000)
  }
  // Restored frames are not new work; source-qualified frames must also
  // belong to the active workspace connection, not a same-named remote chat.
  const ownedTurnEvent = event => !destroyed && event.replayed !== true
    && String(event.session_id || '') === currentRuntimeSessionId()
    && (!event.profile || profileScope(event.profile) === currentProfileScope())
    && (!event.connectionId || event.connectionId === host.state.connectionId?.get?.())
  // Grouping has its own full published owner, independent of duration/history.
  // The SDK focused owner contains connectionId/profile, not session ids.
  let groupingOwnerDescriptor = '', groupingOwnerIncarnation = 0
  let domOwnerDescriptor = '', domOwnerIncarnation = 0
  const groupingScope = () => {
    const focused = host.state.focusedSessionOwner?.get?.()
    const components = [
      host.state.connectionId?.get?.() ?? null,
      focused ? [focused.connectionId, focused.profile] : null,
      currentProfileScope(), currentRuntimeSessionId(), routedStoredSessionId(),
      host.state.focusedSessionId?.get?.() ?? null,
      host.state.focusedStoredSessionId?.get?.() ?? null
    ]
    const descriptor = JSON.stringify(components)
    const domDescriptor = JSON.stringify([components[0], components[2], components[3], components[4]])
    // SDK metadata can complete without replacing the rendered route owner.
    if (domDescriptor !== domOwnerDescriptor) {
      domOwnerDescriptor = domDescriptor
      domOwnerIncarnation += 1
    }
    if (descriptor !== groupingOwnerDescriptor) {
      groupingOwnerDescriptor = descriptor
      groupingOwnerIncarnation += 1
    }
    return descriptor
  }
  const groupingIncarnation = () => { groupingScope(); return groupingOwnerIncarnation }
  const liveClockScope = () => JSON.stringify([groupingScope(), groupingIncarnation()])
  const domOwnerScope = () => {
    groupingScope()
    return JSON.stringify([domOwnerDescriptor, domOwnerIncarnation])
  }
  const toolSequences = createToolSequenceRuntime(groupingScope, groupingIncarnation)
  const turnEvidence = createTurnActivityEvidence(liveClockScope, domOwnerScope)
  const recordedTurnDuration = pair => {
    if (pair.closest('[data-session-anchor]')?.getAttribute('data-session-anchor') !== 'workspace'
      || !currentRuntimeSessionId() || !routedStoredSessionId() || typeof host.request !== 'function'
      || (host.state.focusedSessionOwner && !turnWorkspaceOwnerMatches())) return ''
    const userId = userMessageId(pair), match = /^(\d+(?:\.\d+)?)-\d+-user$/.exec(userId)
    // Prose evidence also helps pairs with live/optimistic user IDs. The
    // duration itself still requires an exact recorded user timestamp below.
    if (!match && ![...pair.querySelectorAll('[data-role="assistant"][data-message-id]')]
      .some(root => /^\d+(?:\.\d+)?-\d+-assistant$/.test(root.getAttribute('data-message-id')))) return ''
    const scope = durationScope(), ownerScope = scope
    const owner = durationOwners.get(pair)
    if (owner?.userId === userId && owner.scope !== ownerScope) return ''
    durationOwners.set(pair, { userId, scope: ownerScope })
    if (durationHistory?.scope !== scope) {
      const cache = durationHistory = { scope, records: new Map(), proseKinds: new Map(), pairs: new Set(), ready: false }
      const runtimeId = currentRuntimeSessionId()
      // Historical hydration drops the live-only durationS field. Fetch the
      // recorded endpoints once, never add tool times or time since mounting.
      Promise.resolve().then(() => {
        if (destroyed || durationHistory !== cache || durationScope() !== scope) return null
        return host.request('session.history', { session_id: runtimeId })
      }).then(result => {
        if (!result || destroyed || durationHistory !== cache || durationScope() !== scope) return
        cache.records = turnDurationHistoryRecords(result?.messages)
        cache.proseKinds = turnHistoryProseKinds(result?.messages)
        cache.ready = true
        // Reproject only the native pairs that requested this owner evidence.
        for (const pending of cache.pairs) markPair(pending)
        cache.pairs.clear()
        schedule()
      }).catch(() => {}) // Unavailable history leaves the duration unspecified.
    }
    if (!durationHistory.ready) durationHistory.pairs.add(pair)
    const seconds = match ? durationHistory.records.get(match[1]) : undefined
    return seconds === undefined ? '' : formatTurnActivityDuration(seconds)
  }

  const runPairWork = deadline => {
    pairWorkHandle = 0
    if (destroyed) return
    if (historicalPairScanPending) {
      historicalPairScanPending = false
      for (const pair of document.querySelectorAll('[data-slot="aui_turn-pair"]')) markPair(pair)
    }
    const livePairs = liveClockPairs()
    const turnStates = turnEvidence.snapshot()
    let processed = 0
    while (dirtyPairs.size && processed < PAIR_WORK_BATCH_SIZE && (processed === 0 || deadline.timeRemaining() > 1)) {
      const pair = dirtyPairs.values().next().value
      dirtyPairs.delete(pair)
      if (!pair?.isConnected) continue
      stripImageAttachmentMarker(pair)
      decorateLongUserMessage(pair)
      const duration = recordedTurnDuration(pair)
      const scope = durationScope()
      const historyKinds = pair.closest('[data-session-anchor]')?.getAttribute('data-session-anchor') === 'workspace'
        && durationHistory?.scope === scope
        && durationOwners.get(pair)?.scope === scope
        && durationOwners.get(pair)?.userId === userMessageId(pair)
        ? durationHistory.proseKinds : null
      const recordedEnd = turnNativeCompletedAt(pair, groupingScope(), turnStates.get(pair)?.active === true)
      const liveDuration = liveClock.label(liveClockScope(), userMessageId(pair), livePairs.size === 1 && livePairs.has(pair))
      rememberReplyTextPresence(pair)
      reconcileTurnActivity(pair, duration, historyKinds, groupingScope(), recordedEnd, liveDuration, turnStates.get(pair))
      // Sequence compaction consumes this pass's whole-turn phase, not the
      // previous Working projection after native streaming has stopped.
      toolSequences.reconcile(pair, groupingScope())
      // New owned summaries join the already-decided outer fold without
      // re-running phase, owner, duration or previous-turn reconciliation.
      applyTurnActivityExpansion(pair)
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
    refreshLiveClock()
    historicalPairScanPending = true
    composerDirty = true
    schedule()
  }

  // Atom callbacks revoke every departed incarnation before scheduling paint.
  // Compare coordinates, not object identity, for equivalent owner republishes.
  let observedGroupingScope = groupingScope()
  const offGroupingOwner = [host.state.connectionId, host.state.focusedSessionOwner,
    host.state.profile, host.state.activeSessionId, host.state.focusedSessionId,
    host.state.focusedStoredSessionId].map(atom => atom?.subscribe?.(() => {
    if (destroyed) return
    const next = groupingScope()
    if (next === observedGroupingScope) return
    observedGroupingScope = next
    toolSequences.pruneDisconnected()
    reconcileSession()
  }))

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

  const offTurnEvents = host.onEvent?.('*', event => {
    if (!['session.info', 'message.start', 'message.complete'].includes(event.type) || !ownedTurnEvent(event)) return
    if (event.type === 'session.info') {
      liveClock.info(liveClockScope(), event.payload)
      turnEvidence.event('info', event.payload)
    } else if (event.type === 'message.start') {
      liveClock.start(liveClockScope())
      turnEvidence.event('start')
    } else {
      liveClock.finish(liveClockScope())
      turnEvidence.event('complete')
      durationHistory = null
    }
    reconcileSession()
  })

  const offTurnBusy = [host.state.busy, host.state.busyBySession]
    .map(atom => atom?.subscribe?.(reconcileSession))

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
    chatWidth.refresh()

    if (composerDirty) {
      composerDirty = false
      decorateSentMessageEditors()
      decorateComposerChrome()
      composerOverflow.refresh()
      refreshAudioLaneDocks()
    }
  }

  const touchesComposerChrome = element => Boolean(
    element?.closest?.('[data-slot="aui_edit-composer-root"], [data-slot="composer-dock"]:not([data-slot="composer-rich-input"]), [data-slot="composer-root"]:not([data-slot="composer-rich-input"])')
    || element?.matches?.('[data-slot="dropdown-menu-content"][role="menu"]')
    || (element?.firstElementChild && element.querySelector?.('[data-slot="aui_edit-composer-root"], [data-slot="dropdown-menu-content"][role="menu"], [data-slot="composer-dock"]'))
  )

  const runtimeSignalSelector = [
    '[data-slot="aui_thread-viewport"]',
    '[data-slot="aui_edit-composer-root"]',
    '[data-slot="aui_user-message-root"]',
    '[data-role="assistant"][data-slot="aui_assistant-message-root"]',
    '[data-role="system"][data-slot="aui_system-message-root"]',
    '[data-slot="aui_background-result"]',
    '[data-slot="aui_turn-pair"]',
    '[data-slot="aui_msg-actions"]',
    '[data-slot="aui_turn-duration"]',
    '[data-slot="aui_message-streaming-marker"]',
    '[data-slot="aui_assistant-message-stopped"]',
    '[data-slot="aui_markdown-alert"]',
    '[data-slot="aui_artifact-card"]',
    '[data-slot="aui_zoomable-image"]',
    'img, audio, video, iframe',
    '.text-destructive',
    '[role="alert"]',
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

  const replyTextPresent = part => part.matches('.aui-md')
    ? /\S/.test(part.textContent || '')
    : [...part.childNodes].some(node => node.nodeType === 3 && /\S/.test(node.textContent || ''))

  const rememberReplyTextPresence = pair => {
    for (const content of pair.querySelectorAll('[data-role="assistant"][data-slot="aui_assistant-message-root"] > [data-slot="aui_assistant-message-content"]')) {
      if (content.closest('[data-slot="aui_turn-pair"]') !== pair) continue
      replyTextPresence.set(content, replyTextPresent(content))
      for (const part of content.children) if (part.matches('.aui-md')) replyTextPresence.set(part, replyTextPresent(part))
    }
  }

  const replyTextPresenceChanged = (record, target, pair) => {
    if (!pair) return false
    const content = target?.closest?.('[data-slot="aui_assistant-message-content"]')
    if (!content?.parentElement?.matches('[data-role="assistant"][data-slot="aui_assistant-message-root"]')
      || content.closest('[data-slot="aui_turn-pair"]') !== pair) return false
    const markdown = target.closest('.aui-md')
    const part = markdown?.parentElement === content ? markdown : target === content ? content : null
    if (!part) return false
    // A nonempty changed text node already proves presence. Ordinary tokens
    // neither reread the growing markdown body nor schedule a turn projection.
    const present = (record.type === 'characterData' && record.target.nodeType === 3 && /\S/.test(record.target.data))
      || (record.type === 'childList' && [...record.addedNodes].some(node => node.nodeType === 3 && /\S/.test(node.textContent || '')))
      || replyTextPresent(part)
    const previous = replyTextPresence.get(part) || false
    replyTextPresence.set(part, present)
    return present !== previous
  }

  const handleMutations = records => {
    const changedPairs = new Set()
    const markChangedPair = pair => { markPair(pair); changedPairs.add(pair) }
    // Removal deliveries and owner boundaries collect disconnected state once,
    // never once per pair (nor per eight-pair idle batch).
    if (records.some(record => record.type === 'childList' && [...record.removedNodes].some(node =>
      node instanceof Element && (node.matches('[data-slot="aui_turn-pair"]') || node.querySelector('[data-slot="aui_turn-pair"]'))))) {
      toolSequences.pruneDisconnected()
    }
    // Text replacements have no rail topology, just like characterData edits.
    const historyRecords = records.filter(record => record.type !== 'characterData' && record.attributeName !== 'class'
      && (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element)))
    if (historyRecords.length) historyRail.observe(historyRecords)
    let relevant = false
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      if (target?.closest?.('[data-codex-user-expand], [data-codex-edit-cancel]')) continue
      if (target?.closest?.('[data-slot="sidebar"]')) continue

      const pair = target?.closest?.('[data-slot="aui_turn-pair"]')
      const nativePart = target?.closest?.('[data-tool-row], [data-tool-group], [data-slot="aui_thinking-disclosure"]')
      if (record.type === 'characterData') {
        // React updates compact captions through existing text nodes. Do not
        // schedule projections for ordinary prose tokens, private bodies or timers.
        if (replyTextPresenceChanged(record, target, pair)) {
          markChangedPair(pair)
          relevant = true
        } else if (pair && nativePart && target.closest('[class*="conversation-scaffold-text"]')
          && !target.closest('[data-codex-tool-sequence]')) {
          markChangedPair(pair)
          relevant = true
        }
        continue
      }
      if (record.type === 'attributes') {
        if (record.attributeName === 'data-session-anchor') {
          markPairsIn(target)
          relevant = true
          continue
        }
        // Class observation covers native failures and glyph replacements. Feeding plugin
        // chrome classes back into composer decoration would create a loop.
        if (record.attributeName === 'class') {
          if (pair && !target.closest('[data-codex-tool-sequence]')
            && ((target.matches(TURN_FAILURE_SELECTOR) && target.closest('[data-slot="tool-block"]'))
              || nativePart)) {
            markChangedPair(pair)
            relevant = true
          }
          continue
        }
        if (record.attributeName === 'data-clamped' && target?.closest?.('[data-role="user"]')) {
          if (pair) markChangedPair(pair)
          relevant = true
        } else if (
          (record.attributeName === 'role' && pair)
          || (record.attributeName === 'data-message-id' && pair)
          || (record.attributeName === 'data-streaming' && target?.matches?.('[data-role="assistant"]'))
          || (['data-state', 'aria-label'].includes(record.attributeName)
            && target?.matches?.('[data-slot="aui_response-loading"], [data-slot="aui_turn-activity"]'))
          || record.attributeName === 'data-message-streaming'
          || (record.attributeName === 'datetime' && target?.closest?.('[data-slot="timeline-timestamp"]'))
          || (['d', 'viewBox', 'fill', 'aria-expanded'].includes(record.attributeName)
            && pair && !target.closest('[data-codex-tool-sequence]')
            && target.closest('[data-slot="tool-block"], [data-slot="aui_thinking-disclosure"]'))

        ) {
          if (pair) markChangedPair(pair)
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
      if (!changedElements.length && replyTextPresenceChanged(record, target, pair)) {
        markChangedPair(pair)
        relevant = true
      }
      if (!changedElements.length && target?.matches?.('[data-slot="aui_assistant-message-content"]')
        && target.parentElement?.matches('[data-role="assistant"][data-slot="aui_assistant-message-root"]')) continue
      // Match the quiet characterData path only inside known text bodies/timers.
      // Compact captions and critical chrome still wake; unknown direct Thought
      // topology (including every Element insertion/removal) remains fail-open.
      if (!changedElements.length
        && target?.closest?.('[data-slot="aui_reasoning-text"], .aui-md, [role="status"]')
        && !target.closest('[class*="conversation-scaffold-text"], [data-slot="aui_response-loading"], [data-slot="aui_turn-activity"], [data-slot="aui_turn-duration"], [data-slot="timeline-timestamp"], [data-slot="aui_markdown-alert"], [role="alert"], .text-destructive, [data-slot="clarify-inline"], [data-slot="mcp-setup-inline"], [data-slot="tool-approval-inline"]')) continue
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
        || Boolean(nativePart && !target.closest('[data-codex-tool-sequence]'))
        || Boolean(target?.closest?.('[data-slot="aui_response-loading"], [data-slot="aui_turn-activity"]'))
        || Boolean(target?.closest?.('[data-slot="aui_turn-duration"]'))
        || Boolean(target?.closest?.('[data-slot="timeline-timestamp"]'))
        || Boolean(target?.matches?.('[data-slot="aui_assistant-message-content"]'))

      if (pair && (target?.closest?.('[data-role="user"]') || signalChanged || cleanPartChanged
        || target?.matches?.('[data-role="assistant"][data-slot="aui_assistant-message-root"]'))) {
        markChangedPair(pair)
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
    if (relevant) {
      // Native arrivals must join an existing collapsed sequence before the
      // browser paints; history and other turn decoration can remain idle work.
      const scope = groupingScope()
      for (const pair of changedPairs) toolSequences.reconcileObserved(pair, scope)
      schedule()
    }
  }

  const observer = new MutationObserver(handleMutations)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-state', 'role', 'data-message-id', 'data-session-anchor', 'data-clamped', 'data-streaming', 'data-message-streaming', 'datetime', 'class', 'd', 'viewBox', 'fill', 'aria-expanded']
  })
  for (const status of document.querySelectorAll('[data-slot="composer-fade"] > [role="status"][aria-live="polite"]')) {
    animatePlaybackEntry(status)
  }
  const onResize = () => {
    processAllPairs = true
    composerDirty = true
    schedule()
  }
  const onHashChange = () => { toolSequences.pruneDisconnected(); reconcileSession() }

  window.addEventListener('resize', onResize)
  window.addEventListener('hashchange', onHashChange)
  document.addEventListener('visibilitychange', refreshLiveClock)

  reconcileSession()

  const cleanup = () => {
    destroyed = true
    window.clearTimeout(liveClockTimer)
    liveClock.clear()
    turnEvidence.clear()
    document.removeEventListener('visibilitychange', refreshLiveClock)
    toolSequences.deactivate()
    if (animationFrame) window.cancelAnimationFrame(animationFrame)
    animationFrame = 0
    scheduled = false
    observer.disconnect()
    clearSentMessageEditors()
    historyRail.cleanup()
    composerOverflow.cleanup()
    chatWidth.cleanup()
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


    for (const off of offGroupingOwner) off?.()
    for (const off of offTurnBusy) off?.()
    offProfileState?.()
    offGatewayState?.()
    offActiveSession?.()
    offTurnEvents?.()

    const handoff = { timer: 0 }
    handoff.timer = window.setTimeout(() => {
      if (window[RUNTIME_HANDOFF_KEY] !== handoff) return
      for (const user of document.querySelectorAll('[data-slot="aui_user-message-root"]')) clearLongUserDecoration(user)
      clearTurnActivityDecorations()
      toolSequences.cleanup()
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
  style.textContent = CSS + BROWSER_PALETTE_CSS + UPDATE_CSS + T3_SUBAGENT_CSS + T3_SIDEBAR_ACTIONS_CSS
  style.dataset.codexChatLookBuild = BUILD_ID
  root.dataset.codexChatLook = 'true'
  root.dataset.codexChatLookBuild = BUILD_ID
  syncComposerWidthRoot()
  syncPinnedUserMessagesRoot()

  syncFloatingSidebarRoot()
  syncInboxOnlyRoot()
  const uninstallTitlebarAlignment = installTitlebarAlignment()
  const uninstallSidebarActions = installT3SidebarActions()
  const uninstallBehavior = installBehaviorRuntime(() => {
    style?.remove()
    delete root.dataset.codexChatLook
    root.removeAttribute('data-codex-composer-width')
    root.removeAttribute('data-codex-pinned-user-messages')

    root.removeAttribute('data-codex-floating-sidebar')
    root.removeAttribute('data-codex-inbox-only')
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
    uninstallSidebarActions()
    uninstallBehavior()
  }
}

export default {
  id: ID,
  name: 'Codex Skin',
  register(ctx) {
    installCodexSkinAnalytics(ctx)
    pluginStorage = ctx.storage
    inboxOnlyMode = loadInboxOnlyMode()
    syncInboxOnlyRoot()
    registerCompleteMessages(ctx, PALETTE_AREA, host, codexSkinFeatureUsed)
    const updater = createSkinUpdater(ctx.storage)
    const inbox = globalThis.document?.body ? installCodexInboxRuntime({ storage: ctx.storage, host, onFeatureUsed: codexSkinFeatureUsed, onFeatureFailed: codexSkinFeatureFailed }) : null
    startCodexInboxService(ctx, inbox)
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
    registerT3Themes(ctx, THEMES_AREA)
    ctx.register({
      id: 'toggle-composer-width',
      area: PALETTE_AREA,
      data: {
        id: 'codex-chat-look.toggle-composer-width',
        label: 'Codex Skin: Composer width',
        detail: () => COMPOSER_WIDTH_MODES[readComposerWidthMode()].label,
        detailVariant: 'state',
        keepOpen: true,
        keywords: ['codex', 'skin', 'composer', 'width', 'narrow', 'full', 'hermes'],
        run: () => { const next = COMPOSER_WIDTH_MODES[readComposerWidthMode()].next; return codexSkinSettingAction('settings', COMPOSER_WIDTH_STORAGE_KEY, next, () => setComposerWidthMode(next)) }
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
        run: () => { const next = readPinnedUserMessagesMode() === 'hermes' ? 'off' : 'hermes'; return codexSkinSettingAction('settings', PINNED_USER_MESSAGES_STORAGE_KEY, next, () => setPinnedUserMessagesMode(next)) }
      }
    })

    ctx.register({
      id: 'toggle-floating-sidebar',
      area: PALETTE_AREA,
      data: {
        id: 'codex-chat-look.toggle-floating-sidebar',
        label: 'Codex Skin: Floating sidebar',
        detail: () => readFloatingSidebarMode() === 'on' ? 'On' : 'Off',
        detailVariant: 'state',
        keepOpen: true,
        keywords: ['codex', 'skin', 'floating', 'sidebar', 'inbox', 'pinned', 'sessions', 'layout'],
        run: () => { const next = readFloatingSidebarMode() === 'on' ? 'off' : 'on'; return codexSkinSettingAction('settings', FLOATING_SIDEBAR_STORAGE_KEY, next, () => setFloatingSidebarMode(next)) }
      }
    })
    ctx.register({
      id: 'toggle-inbox-only',
      area: PALETTE_AREA,
      data: {
        id: 'codex-chat-look.toggle-inbox-only',
        label: 'Codex Skin: Inbox only (Beta)',
        detail: () => (inboxOnlyMode === 'on' ? 'On' : 'Off') + ' · Hide Pinned and Sessions, not delete',
        detailVariant: 'state',
        keepOpen: true,
        keywords: ['codex', 'skin', 'inbox', 'only', 'beta', 'pinned', 'sessions', 'hide', 'restore'],
        run: () => {
          if (disposed) return false
          return setInboxOnlyMode(inboxOnlyMode === 'on' ? 'off' : 'on')
        }
      }
    })
    ctx.register({
      id: 'toggle-universal-inbox',
      area: PALETTE_AREA,
      data: {
        id: 'codex-chat-look.toggle-universal-inbox',
        label: 'Codex Skin: Universal Inbox (Beta)',
        detail: () => readUniversalInbox() ? 'On' : 'Off',
        detailVariant: 'state',
        keepOpen: true,
        keywords: ['codex', 'skin', 'universal', 'inbox', 'profiles', 'beta'],
        run: () => { const next = !readUniversalInbox(); return codexSkinSettingAction('inbox', UNIVERSAL_INBOX_KEY, next, () => setUniversalInbox(next)) }
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
        run: () => { const next = readCodexInboxMode() === 'on' ? 'off' : 'on'; return codexSkinSettingAction('inbox', INBOX_MODE_KEY, next, () => setCodexInboxMode(next, inbox)) }
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
.codex-update-panel{box-sizing:border-box;position:fixed;z-index:10000;overflow:auto;overscroll-behavior:contain;width:320px;max-height:320px;padding:0 18px;border:1px solid var(--ui-stroke-secondary,#e5e5e5);border-radius:14px;background:var(--codex-color-card,var(--ui-editor-surface-background,#fff));color:var(--ui-text-primary,#171717);box-shadow:0 12px 36px #00000014,0 2px 6px #00000008;font:12px/1.65 var(--dt-font-sans);scrollbar-width:thin;scrollbar-color:var(--ui-stroke-secondary,#ccc) transparent}
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
  return !!left && !!right && left.connectionId === right.connectionId && left.profile === right.profile
}

function codexInboxDefaultOwnerScope() { return inboxOwnerScope() }
function codexInboxDefaultMode() { return readCodexInboxMode() }

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
  const values = [row.session_key, row.stored_session_id]
  if (values.some(id => id != null && typeof id !== 'string')) return []
  return [...new Set(values.filter(id => typeof id === 'string' && id))]
}

function codexInboxLiveStoredMatch(storedId, row, metadata) {
  const stored = codexInboxLiveStoredIds(row)
  if (!stored.length) return false
  const touched = metadata.filter(session => {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    return stored.some(id => ids.includes(id))
  })
  const roots = new Set(touched.map(session => session._lineage_root_id || session.id))
  if (!touched.length) return stored.length === 1 && stored[0] === storedId
  return roots.size === 1 && touched.some(session => {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    return ids.includes(storedId) && stored.every(id => ids.includes(id))
  })
}

function codexInboxUniqueLiveRow(runtimeId, rows) {
  if (typeof runtimeId !== 'string' || !runtimeId) return null
  const matching = rows.filter(row => row && [row.id, row.session_id].includes(runtimeId))
  const row = matching.length === 1 ? matching[0] : null
  return row && (!row.id || !row.session_id || row.id === row.session_id) ? row : null
}

function codexInboxCanonicalRuntime(scope, targetProfile, runtimeId, rawRows, metadata, owners) {
  if (typeof runtimeId !== 'string' || !runtimeId) return null
  const rows = rawRows.filter(row => row && [row.id, row.session_id].includes(runtimeId))
  const row = codexInboxUniqueLiveRow(runtimeId, rawRows), proof = owners.get(JSON.stringify([scope.connectionId, runtimeId]))
  if (rows.length && !row) return null
  if (proof && (proof.conflicted || !sameInboxScope(proof, scope))) return null
  if (row && (row.connection_id && row.connection_id !== scope.connectionId || row.profile && row.profile !== targetProfile)) return null
  if (!proof && (!row || row.profile !== targetProfile)) return null
  const stored = row ? codexInboxLiveStoredIds(row) : []
  if (row && (!stored.length || !stored.every(id => codexInboxLiveStoredMatch(id, row, metadata)))) return null
  const candidates = new Set(metadata.filter(session => {
    const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
    return (!proof || ids.includes(proof.storedId)) && stored.every(id => ids.includes(id))
  }).map(session => session._lineage_root_id || session.id))
  return candidates.size === 1 ? [...candidates][0] : null
}

function resolveCodexInboxLiveSessions(scope, targetProfile, rawRows, metadata, owners) {
  const liveSessions = [], unresolved = new Set()
  let liveStatusKnown = true
  for (const row of rawRows) {
    if (!row || typeof row !== 'object') { liveStatusKnown = false; continue }
    if (row.connection_id && row.connection_id !== scope.connectionId) continue
    if (row.profile && row.profile !== targetProfile) continue
    const runtimeId = row.session_id || row.id
    const ids = codexInboxLiveStoredIds(row)
    const canonicalId = codexInboxCanonicalRuntime(scope, targetProfile, runtimeId, rawRows, metadata, owners)
    if (canonicalId) {
      const session = metadata.find(session => (session._lineage_root_id || session.id) === canonicalId)
      liveSessions.push({ ...row, session_key: session.id, stored_session_id: session.id, profile: scope.profile, connection_id: scope.connectionId, _codexInboxCanonicalId: canonicalId })
    } else {
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
    liveSessions.push({ id: session.id, session_key: session.id, _codexInboxCanonicalId: session._lineage_root_id || session.id, status: 'unknown', profile: scope.profile, connection_id: scope.connectionId })
  }
  return { liveSessions, liveStatusKnown }
}


async function readCodexInboxLiveIdentity(read, row) {
  try {
    const result = await read(row.session_id || row.id)
    const lines = typeof result?.output === 'string' ? result.output.split('\n') : []
    // The native status header is producer-owned. Never search titles or
    // trailing text for a path that could impersonate a profile identity.
    if (lines[0] !== 'Hermes TUI Status' || lines[1] !== '' ||
        !lines[2]?.startsWith('Session ID: ') || !lines[3]?.startsWith('Path: ')) return null
    const storedId = lines[2].slice(12), home = lines[3].slice(6)
    return storedId && home && codexInboxLiveStoredIds(row).includes(storedId) ? { storedId, home } : null
  } catch { return null }
}

async function proveCodexInboxBackgroundOwners(scope, targetProfile, rows, metadata, owners, focus, read, stillCurrent, onProof = () => {}) {
  const focusKey = focus && JSON.stringify([scope.connectionId, focus.runtimeId])
  const anchor = focusKey && owners.get(focusKey)
  if (!anchor || anchor.conflicted || !sameInboxScope(anchor, scope) || !stillCurrent()) return
  const focusedRow = codexInboxUniqueLiveRow(focus.runtimeId, rows)
  if (!focusedRow || focusedRow.profile && focusedRow.profile !== targetProfile ||
      focusedRow.connection_id && focusedRow.connection_id !== scope.connectionId ||
      !metadata.some(session => codexInboxLiveStoredMatch(session.id, focusedRow, metadata)) ||
      !codexInboxLiveStoredMatch(focus.storedId, focusedRow, metadata) ||
      !codexInboxLiveStoredMatch(anchor.storedId, focusedRow, metadata)) return
  let home = anchor.home
  if (!home) {
    const identity = await readCodexInboxLiveIdentity(read, focusedRow)
    if (!identity || !stillCurrent() || JSON.stringify(codexInboxLiveFocus()) !== JSON.stringify(focus)) return
    home = identity.home
    owners.set(focusKey, { ...anchor, home })
  }
  // A home shared by contradictory owner proofs cannot certify either owner.
  if ([...owners.values()].some(proof => proof.home === home && (proof.conflicted || !sameInboxScope(proof, scope)))) return
  onProof()
  const candidates = rows.filter(row => {
    if (!row || row.profile || row.connection_id && row.connection_id !== scope.connectionId) return false
    const runtimeId = row.session_id || row.id
    if (!runtimeId || owners.has(JSON.stringify([scope.connectionId, runtimeId]))) return false
    if (codexInboxUniqueLiveRow(runtimeId, rows) !== row) return false
    return metadata.some(session => codexInboxLiveStoredMatch(session.id, row, metadata))
  })
  for (let offset = 0; offset < candidates.length; offset += 4) {
    await Promise.all(candidates.slice(offset, offset + 4).map(async row => {
      const identity = await readCodexInboxLiveIdentity(read, row)
      if (!stillCurrent() || JSON.stringify(codexInboxLiveFocus()) !== JSON.stringify(focus) || identity?.home !== home) return
      owners.set(JSON.stringify([scope.connectionId, row.session_id || row.id]), {
        ...scope, runtimeId: row.session_id || row.id, storedId: identity.storedId, home
      })
      onProof()
    }))
    if (!stillCurrent() || JSON.stringify(codexInboxLiveFocus()) !== JSON.stringify(focus)) return
  }
}

async function readCodexInboxChildSnapshots(scope, liveSessions, read, stillCurrent, onProgress = () => {}) {
  const byThread = new Map(), unknown = new Set()
  const rows = liveSessions.filter(row => row._codexInboxCanonicalId && row.status !== 'unknown')
  const remaining = new Map()
  for (const row of rows) remaining.set(row._codexInboxCanonicalId, (remaining.get(row._codexInboxCanonicalId) || 0) + 1)
  const at = Date.now()
  const snapshot = () => ({
    childSnapshots: [...byThread].filter(([id]) => !unknown.has(id) && remaining.get(id) === 0).map(([session_id, ids]) => ({ session_id, childIds: [...ids], at })),
    childUnknownSessionIds: [...unknown].filter(id => remaining.get(id) === 0)
  })
  for (let offset = 0; offset < rows.length; offset += 4) {
    await Promise.all(rows.slice(offset, offset + 4).map(async row => {
      let result
      try {
        result = await read(row.session_id || row.id)
      } catch { result = null }
      if (!stillCurrent()) throw new Error('Inbox child snapshot lost its owner.')
      const id = row._codexInboxCanonicalId
      const valid = Array.isArray(result?.subagents) && !result.subagents.some(child =>
        typeof child?.subagent_id !== 'string' || !child.subagent_id || typeof child.status !== 'string')
      remaining.set(id, remaining.get(id) - 1)
      if (!valid) unknown.add(id)
      else {
        if (!byThread.has(id)) byThread.set(id, new Set())
        result.subagents.filter(child => ['running', 'pending', 'queued'].includes(child.status)).forEach(child => byThread.get(id).add(child.subagent_id))
      }
      onProgress(snapshot())
    }))
    if (!stillCurrent()) throw new Error('Inbox child snapshot lost its owner.')
  }
  return snapshot()
}

async function readCodexInboxPage(scope, pageCount, signal, inbox, liveOwners = new Map(), onMetadata = () => {}, nominations = () => [], onProgress = () => {}, context = {}) {
  const inboxOwnerScope = context.ownerScope || codexInboxDefaultOwnerScope
  const bridge = globalThis.window?.hermesDesktop
  if (typeof bridge?.api !== 'function') throw new Error('Inbox requires the Desktop session API.')
  let route = scope.targetProfile && scope.mode ? { ...scope } : null
  if (!context.liveOwners && host.profileRoutes) {
    try {
      const routes = (await host.profileRoutes()).filter(item => sameInboxScope(item, scope))
      if (routes.length === 1) { route = { ...routes[0] }; scope = { ...scope, ...codexInboxStateScope(route) } }
    } catch { /* Explicit metadata can survive inventory failure, never live/row-owner authority. */ }
  }
  const focusedBefore = codexInboxLiveFocus()
  const sessions = new Map()
  const metadataIds = row => [row?.id, row?._lineage_root_id, ...(row?._lineage_ids || [])].filter(Boolean)
  const revalidatedMetadataIds = new Set()
  let offset = 0, total = 0
  let targetProfile = scope.targetProfile || scope.profile
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
    if (!context.liveOwners && targetProfile === scope.profile && data.sessions.some(session => session.profile && session.profile !== scope.profile) && host.profileRoutes) {
      const routes = await host.profileRoutes()
      const matches = routes.filter(route => sameInboxScope(route, scope))
      if (matches.length === 1 && typeof matches[0].targetProfile === 'string' && matches[0].targetProfile) targetProfile = matches[0].targetProfile
      if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    }
    if (data.errors?.length || data.storage?.[targetProfile] && data.storage[targetProfile] !== 'ok') {
      throw new Error('The session list could not be read completely.')
    }
    if (context.liveOwners && data.sessions.some(session => !session || typeof session.id !== 'string' || !session.id ||
        session.profile !== targetProfile || session.connection_id !== scope.connectionId)) {
      throw new Error('Inbox metadata owner could not be verified.')
    }
    total = data.total
    for (const session of data.sessions) {
      metadataIds(session).forEach(id => revalidatedMetadataIds.add(id))
      // A scoped response may still contain a carried row from another owner.
      if (session.profile && session.profile !== targetProfile) continue
      if (session.connection_id && session.connection_id !== scope.connectionId) continue
      if (session.hidden || session.archived || !session.id) continue
      const durable = session._lineage_root_id || session.id
      const previous = sessions.get(durable)
      if (!previous || (session.last_active || 0) > (previous.last_active || 0)) sessions.set(durable, { ...session,
        _codexInboxBackendOwner: { connectionId: session.connection_id || scope.connectionId, profile: session.profile || targetProfile },
        profile: scope.profile, connection_id: scope.connectionId })
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
  const nominatedIds = nominations().filter(focus => sameInboxScope(focus, scope)).map(focus => focus.storedId)
  const missing = [...new Set([...explicitRequestedIds, ...pendingWorkIds, ...nominatedIds])].filter(id => !listedIds.has(id))
  const pendingMetadataIds = new Set(missing.filter(id => !revalidatedMetadataIds.has(id)))
  const metadataProgress = () => ({ pendingMetadataIds: [...pendingMetadataIds], revalidatedMetadataIds: [...revalidatedMetadataIds] })
  onMetadata({ route, sessions: [...sessions.values()], ...metadataProgress(), explicitRequestedIds, hasMore: offset < total })
  let publishProgress = () => false
  const publishMetadata = () => {
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) return
    if (!publishProgress()) onMetadata({ route, sessions: [...sessions.values()], ...metadataProgress(), explicitRequestedIds, hasMore: offset < total })
  }
  const readMissing = async ids => {
  for (let index = 0; index < ids.length; index += 4) {
    if (index) {
      // Keep every metadata stage: lineage/source changes can revoke attention.
      // A task boundary, not a latest-snapshot mailbox, bounds cached IPC bursts.
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    let batchOpen = true, publicationQueued = false
    try {
      await Promise.all(ids.slice(index, index + 4).map(async id => {
        let row = null
        try {
          row = await readCodexInboxOpenedSession({ id, scope }, {
            followLineage: true,
            requireOwner: !!context.liveOwners,
            stillCurrent: () => !signal?.aborted && sameInboxScope(scope, inboxOwnerScope())
          })
        } catch (error) {
          if (!isCodexInboxSessionNotFound(error)) throw error
        }
        if (!batchOpen) return
        if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
        pendingMetadataIds.delete(id); revalidatedMetadataIds.add(id)
        metadataIds(row).forEach(alias => { pendingMetadataIds.delete(alias); revalidatedMetadataIds.add(alias) })
        if (row && !row.archived && !row.hidden) sessions.set(row._lineage_root_id || row.id, row)
        // A slow sibling must not retain a completed revision. Immediate cached
        // siblings still finish as one publication, preserving the batch budget.
        if (!publicationQueued) {
          publicationQueued = true
          setTimeout(() => {
            publicationQueued = false
            if (batchOpen) publishMetadata()
          }, 0)
        }
      }))
    } finally { batchOpen = false }
    if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    // The live progression already contains these exact metadata rows. Publishing
    // both performs the same owner transaction twice, without adding authority.
    publishMetadata()
  }
  }
  // Only the focused anchor can block ownership proof. Unrelated saved history
  // hydrates concurrently and cannot hold current activity behind its latency.
  const anchorIds = focusedBefore && missing.includes(focusedBefore.storedId) ? [focusedBefore.storedId] : []
  const anchorBackfill = readMissing(anchorIds).then(() => null, error => error)
  const historyBackfill = readMissing(missing.filter(id => !anchorIds.includes(id))).then(() => null, error => error)
  let liveSessions = [], rawLiveSessions = [], liveStatusKnown = false, liveReadSucceeded = false, liveStatusAt = 0
  let childSnapshots = [], childUnknownSessionIds = []
  publishProgress = () => {
    if (!liveReadSucceeded || signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) return false
    ;({ liveSessions, liveStatusKnown } = resolveCodexInboxLiveSessions(scope, targetProfile, rawLiveSessions, [...sessions.values()], liveOwners))
    onProgress({ route, sessions: [...sessions.values()], ...metadataProgress(), liveSessions, rawLiveSessions, childSnapshots, childUnknownSessionIds, targetProfile,
      liveStatusKnown, liveSnapshotComplete: false, liveReadSucceeded, liveStatusAt, rowOwnerScope: null, explicitRequestedIds, hasMore: offset < total })
    return true
  }
  try {
    if (context.liveAvailable?.() === false) throw new Error('Inbox live connection is not certified.')
    if (!sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
    let live, readIdentity, readChildren
    if (typeof host.requestProfile === 'function' && typeof host.profileRoutes === 'function') {
      const routes = (await host.profileRoutes()).filter(route => sameInboxScope(route, scope))
      if (routes.length !== 1 || signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox live owner could not be verified.')
      if (context.liveOwners && (routes[0].targetProfile !== scope.targetProfile || routes[0].mode !== scope.mode)) throw new Error('Inbox live route changed.')
      if (typeof routes[0].targetProfile === 'string' && routes[0].targetProfile) targetProfile = routes[0].targetProfile
      liveStatusAt = Date.now()
      live = await host.requestProfile(routes[0], 'session.active_list', { profile: targetProfile })
      readIdentity = sessionId => host.requestProfile(routes[0], 'session.status', { session_id: sessionId })
      readChildren = sessionId => host.requestProfile(routes[0], 'subagent.list', { session_id: sessionId })
    } else {
      // A legacy ambient request is safe only for the gateway it actually uses.
      if (!sameInboxScope(scope, inboxGatewayScope())) throw new Error('Inbox requires explicit live-owner routing.')
      liveStatusAt = Date.now()
      live = await host.request('session.active_list', { profile: targetProfile })
      readIdentity = sessionId => host.request('session.status', { session_id: sessionId })
      readChildren = sessionId => host.request('subagent.list', { session_id: sessionId })
    }
    if (Array.isArray(live?.sessions)) {
      liveReadSucceeded = true
      // Keep only identity/status metadata, not another profile's preview text.
      const fields = ['id', 'session_id', 'session_key', 'stored_session_id', 'profile', 'connection_id', 'status', 'state', 'busy']
      rawLiveSessions = live.sessions.map(row => row && typeof row === 'object'
        ? Object.fromEntries(fields.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]])) : null)
      const anchorError = await anchorBackfill
      if (anchorError) throw anchorError
      const focusedAfter = codexInboxLiveFocus(), metadata = [...sessions.values()]
      const stableFocus = focusedBefore && JSON.stringify(focusedBefore) === JSON.stringify(focusedAfter) ? [focusedBefore] : []
      // Departure preserves a nomination, not authority. The owner-routed
      // durable row and exactly one matching live runtime must validate it.
      for (const focus of [...stableFocus, ...nominations()]) {
        if (!sameInboxScope(focus, scope)) continue
        const row = codexInboxUniqueLiveRow(focus.runtimeId, rawLiveSessions)
        if (!row || row.profile && row.profile !== targetProfile || row.connection_id && row.connection_id !== scope.connectionId ||
            !metadata.some(session => [session.id, session._lineage_root_id, ...(session._lineage_ids || [])].includes(focus.storedId)) ||
            !codexInboxLiveStoredMatch(focus.storedId, row, metadata)) continue
        const key = JSON.stringify([scope.connectionId, focus.runtimeId]), previous = liveOwners.get(key)
        const conflict = previous && (previous.conflicted || previous.profile !== focus.profile ||
          !codexInboxLiveStoredMatch(previous.storedId, row, metadata))
        liveOwners.set(key, conflict ? { ...previous, conflicted: true } : focus)
        if (!conflict && typeof previous?.home === 'string' && previous.home && sameInboxScope(previous, focus)) {
          liveOwners.set(key, { ...focus, home: previous.home })
        }
      }
      publishProgress()
      if (stableFocus.length && sameInboxScope(focusedBefore, scope)) {
        await proveCodexInboxBackgroundOwners(scope, targetProfile, rawLiveSessions, metadata, liveOwners, focusedBefore, readIdentity,
          () => !signal?.aborted && sameInboxScope(scope, inboxOwnerScope()), publishProgress)
      }
      ;({ liveSessions, liveStatusKnown } = resolveCodexInboxLiveSessions(scope, targetProfile, rawLiveSessions, metadata, liveOwners))
      // A send can start before SQLite moves the old thread into the recent
      // page. Backfill only positively owned work, never unowned runtime IDs.
      const knownIds = new Set(metadata.flatMap(row => [row.id, row._lineage_root_id, ...(row._lineage_ids || [])].filter(Boolean)))
      // Qualified producer rows can discover missing metadata, but receive no
      // canonical activity authority until that exact-owner metadata is read.
      const discovery = rawLiveSessions.filter(row => row && row.profile === targetProfile &&
        (!row.connection_id || row.connection_id === scope.connectionId) &&
        codexInboxUniqueLiveRow(row.session_id || row.id, rawLiveSessions) === row &&
        new Set(codexInboxLiveStoredIds(row)).size === 1)
      const workingIds = [...new Set([...liveSessions, ...discovery].filter(row => codexInboxWorkStatus(row) === 'work')
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
      ;({ childSnapshots, childUnknownSessionIds } = await readCodexInboxChildSnapshots(scope, liveSessions, readChildren,
        () => !signal?.aborted && sameInboxScope(scope, inboxOwnerScope()), progress => {
          ;({ childSnapshots, childUnknownSessionIds } = progress)
          publishProgress()
        }))
    }
  } catch {
    // A partial live read or failed work backfill must not authorize Settle.
    liveSessions = []; rawLiveSessions = []; childSnapshots = []; childUnknownSessionIds = []; liveStatusKnown = false; liveReadSucceeded = false
  }
  const backfillErrors = await Promise.all([anchorBackfill, historyBackfill])
  const backfillError = backfillErrors.find(Boolean)
  if (backfillError) throw backfillError
  if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
  const rowOwnerScope = await readCodexInboxRowOwner(scope)
  if (signal?.aborted || !sameInboxScope(scope, inboxOwnerScope())) throw new Error('Inbox scope changed.')
  return { route, sessions: [...sessions.values()], liveSessions, rawLiveSessions, childSnapshots, childUnknownSessionIds, targetProfile, liveStatusKnown, liveReadSucceeded, liveStatusAt, rowOwnerScope, explicitRequestedIds, hasMore: offset < total }
}

function startCodexInboxObserver(ctx, inbox, context = {}) {
  const inboxOwnerScope = context.ownerScope || codexInboxDefaultOwnerScope
  const readCodexInboxMode = context.mode || codexInboxDefaultMode
  // A data service must not inherit the mount lifetime of optional UI chrome.
  // The vendored observer uses the SDK's cache, never a plugin-owned client.
  if (!inbox) return () => {}
  let scope = inboxOwnerScope(), pageCount = 1, mode = readCodexInboxMode(), disposed = false
  const liveOwners = context.liveOwners || new Map()
  const commitProofs = proofs => {
    let changed = false
    for (const [key, proof] of proofs) {
      const previous = liveOwners.get(key)
      const next = context.liveOwners && previous && (previous.conflicted || proof.conflicted || !sameInboxScope(previous, proof))
        ? { ...previous, conflicted: true } : proof
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        liveOwners.set(key, next)
        changed = true
      }
    }
    // Stable proof reads must not repeatedly reproject every owner's history.
    if (changed) context.onOwnersChanged?.()
  }
  const nominatedFocus = new Map()
  const pendingEvents = []
  let refreshVersion = 0, refreshing = false
  let lastFocus = JSON.stringify(codexInboxLiveFocus()), lastBusy = new Set()
  let metadataPreview = null
  let progressSnapshot = null
  let liveAuthority = Symbol('Inbox live connection')
  let retainedMetadata = [], retainedRoute = null
  const liveConnected = owner => context.liveAvailable ? context.liveAvailable() :
    !sameInboxScope(owner, inboxGatewayScope()) || !host.state.gateway || host.state.gateway.get() === 'open'
  const nominations = () => {
    for (const [key, item] of nominatedFocus) if (Date.now() - item.at > 10_000) nominatedFocus.delete(key)
    return [...nominatedFocus.values()].map(item => item.focus)
  }
  const rememberFocus = () => {
    const focus = codexInboxLiveFocus()
    const connected = liveConnected(scope)
    if (disposed || mode !== 'on' || !connected || !focus || !sameInboxScope(focus, scope)) return
    nominations()
    const key = JSON.stringify(focus)
    nominatedFocus.delete(key)
    nominatedFocus.set(key, { focus, at: Date.now() })
    if (nominatedFocus.size > 64) nominatedFocus.delete(nominatedFocus.keys().next().value)
  }
  const options = () => {
    const owner = { ...scope }, pages = pageCount
    return {
      queryKey: [ID, 'inbox', owner.connectionId, owner.profile, pages, ...(context.queryKey || [])],
      queryFn: async ({ signal }) => {
        const release = await context.acquire?.(signal)
        try {
        const authority = liveAuthority, proofs = new Map(liveOwners)
        rememberFocus()
        const data = await readCodexInboxPage(owner, pages, signal, inbox, proofs, metadata => {
          if (disposed || signal.aborted || authority !== liveAuthority || mode !== 'on' || !sameInboxScope(owner, inboxOwnerScope())) return
          metadataPreview = { ...metadata, _codexInboxMetadataAuthority: authority }
          project()
        }, nominations, progress => {
          const connected = liveConnected(owner)
          if (disposed || signal.aborted || authority !== liveAuthority || !connected || mode !== 'on' || !sameInboxScope(owner, inboxOwnerScope())) return
          commitProofs(proofs)
          metadataPreview = null
          progressSnapshot = { ...progress, _codexInboxLiveAuthority: authority, _codexInboxMetadataAuthority: authority }
          project()
        }, context)
        // In-flight reads and native cache hits cannot carry authority across
        // a disconnect or a new plugin lifetime. Stage owner proofs likewise.
        const connected = liveConnected(owner)
        const current = !disposed && authority === liveAuthority && connected && !signal.aborted
        if (current && data.liveReadSucceeded) {
          commitProofs(proofs)
        }
        if (current) { metadataPreview = null; progressSnapshot = null }
        return { ...data, _codexInboxLiveAuthority: current && data.liveReadSucceeded ? authority : null,
          _codexInboxMetadataAuthority: current ? authority : null }
        } finally { release?.() }
      },
      enabled: mode === 'on', staleTime: context.liveOwners ? 0 : 10_000,
      refetchInterval: mode === 'on' ? 10_000 : false, retry: 1
    }
  }
  const observer = new CodexInboxObserverVendor.QueryObserver(queryClient, options())
  const refreshLiveIdentity = () => {
    // Capture transitions even while an older read awaits proof. A microtask
    // sees only the final focus after a synchronous departure.
    rememberFocus()
    refreshVersion++
    if (refreshing || disposed || mode !== 'on') return
    refreshing = true
    // Atom changes settle together. If an old fetch is already in flight,
    // finish it before requesting proof for the newly focused runtime.
    void Promise.resolve().then(async () => {
      try {
        while (!disposed && mode === 'on') {
          const version = refreshVersion
          rememberFocus()
          if (observer.getCurrentResult().isFetching) await observer.refetch({ cancelRefetch: false })
          if (disposed || mode !== 'on') break
          await observer.refetch()
          if (version === refreshVersion) break
        }
      } finally { refreshing = false }
    })
  }
  const pendingWorkSessionIds = owner => [...new Set(pendingEvents.filter(item => sameInboxScope(item.focus, owner) &&
    Date.now() - item.at <= 10_000).flatMap(item => item.storedIds))]
  inbox.pendingWorkSessionIds = pendingWorkSessionIds
  const markReady = () => {
    const query = observer.getCurrentResult()
    const ready = !disposed && mode === 'on' && sameInboxScope(scope, inboxOwnerScope()) && !query.isPending && !query.error && !!query.data
    const island = globalThis.document?.querySelector?.('[data-codex-inbox-owned="island"]')
    if (island && island.dataset.codexInboxQueryReady !== String(ready)) island.dataset.codexInboxQueryReady = String(ready)
  }
  const project = () => {
    if (disposed || !sameInboxScope(scope, inboxOwnerScope())) return
    const query = observer.getCurrentResult(), snapshot = progressSnapshot || query.data, data = metadataPreview || snapshot
    const owner = { ...scope, ...codexInboxStateScope(data?.route || scope) }
    const routeKey = codexInboxRouteKey(data?.route || owner)
    const currentMetadata = mode === 'on' && !query.error && liveConnected(owner) && data?._codexInboxMetadataAuthority === liveAuthority
    if (!currentMetadata || retainedRoute !== routeKey) retainedMetadata = []
    retainedRoute = routeKey
    const pending = new Set(data?.pendingMetadataIds || []), revised = new Set(data?.revalidatedMetadataIds || [])
    const retainedSessions = retainedMetadata.filter(session => {
      const ids = [session.id, session._lineage_root_id, ...(session._lineage_ids || [])].filter(Boolean)
      return ids.some(id => pending.has(id)) && !ids.some(id => revised.has(id))
    })
    // Metadata can arrive before live RPCs. Retain this connection's last
    // proof, but revalidate it against the newest metadata before projecting.
    const authoritative = liveConnected(owner) && !query.error && snapshot?._codexInboxLiveAuthority === liveAuthority
    const live = authoritative && Array.isArray(snapshot?.rawLiveSessions)
      ? resolveCodexInboxLiveSessions(owner, snapshot.targetProfile, snapshot.rawLiveSessions, data.sessions, liveOwners)
      : { liveSessions: [], liveStatusKnown: false }
    if (authoritative) for (const id of snapshot.childUnknownSessionIds || []) {
      live.liveSessions.push({ id, session_key: id, _codexInboxCanonicalId: id, profile: owner.profile, connection_id: owner.connectionId, status: 'unknown' })
    }
    const verifiedRows = (live.liveSessions || []).filter(row =>
      row.profile === owner.profile && row.connection_id === owner.connectionId &&
      codexInboxUniqueLiveRow(row.session_id || row.id, snapshot.rawLiveSessions) && row.status !== 'unknown')
    const childSnapshots = authoritative ? (snapshot.childSnapshots || []).filter(child =>
      verifiedRows.some(row => row._codexInboxCanonicalId === child.session_id)) : []
    const busy = host.state.busyBySession?.get?.() || {}
    const busyBySession = {}, priority = { idle: 0, reading: 1, unknown: 2, work: 3 }
    for (const row of verifiedRows) {
      const runtimeId = row.session_id || row.id, storedId = row.session_key
      if (!storedId || !Object.hasOwn(busy, runtimeId)) continue
      const value = busy[runtimeId], previous = busyBySession[storedId]
      if (!Object.hasOwn(busyBySession, storedId) ||
          priority[codexInboxWorkStatus(value)] > priority[codexInboxWorkStatus(previous)]) busyBySession[storedId] = value
    }
    inbox.setMode(mode === 'on')
    inbox.rowOwnerEvidence = mode === 'on' && authoritative && snapshot?.rowOwnerScope && sameInboxScope(snapshot.rowOwnerScope, owner)
      ? { scope: owner, ids: data.sessions.flatMap(session => [session.id, session._lineage_root_id, ...(session._lineage_ids || [])].filter(Boolean)) }
      : null
    window.dispatchEvent(new CustomEvent(INBOX_ROWS_EVENT))
    inbox.update({
      scope: owner,
      route: data?.route,
      sessions: data?.sessions || [], retainedSessions, liveSessions: live?.liveSessions || [],
      liveStatusKnown: authoritative && !!snapshot?.liveStatusKnown && !!live?.liveStatusKnown,
      liveSnapshotComplete: snapshot?.liveSnapshotComplete !== false,
      liveStatusAt: authoritative ? snapshot?.liveStatusAt : undefined,
      childSnapshots,
      // ID-only busy flags borrow only independently verified runtime identity.
      busyBySession,
      busyOwnerKnown: authoritative && !!snapshot?.rowOwnerScope && sameInboxScope(snapshot.rowOwnerScope, owner),
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
    // Presentation continuity is not fresh metadata, live proof or admission.
    // Only this observer incarnation's positively admitted rows can be retained.
    if (currentMetadata) retainedMetadata = [...(data.sessions || []), ...retainedSessions]
      .filter(session => inbox.admission?.isEligible?.(owner, session) === true)
    if (authoritative && pendingEvents.length) {
      for (let index = 0; index < pendingEvents.length;) {
        const item = pendingEvents[index]
        if (Date.now() - item.at > 10_000 || !sameInboxScope(item.focus, owner)) {
          pendingEvents.splice(index, 1); continue
        }
        const resolved = resolveLiveEvent(item.event)
        const session = resolved && data.sessions.find(session => session.id === resolved.session_id)
        const ids = session && [session.id, session._lineage_root_id, ...(session._lineage_ids || [])]
        if (!session || !item.storedIds.some(id => ids.includes(id))) { index++; continue }
        const key = inbox.model.key(owner, session)
        if (!key) { index++; continue }
        pendingEvents.splice(index, 1)
        // Resolve decisions after lineage is known, not against a transitional
        // focus tuple. An unrelated Settle must not discard this runtime's work.
        if ([...item.settledKeys].some(settled => inbox.model.key(owner, JSON.parse(settled)[2]) === key)) continue
        inbox.activity?.({ ...resolved, canonicalSessionId: resolved.session_id })
      }
    }
    markReady()
  }
  const configure = () => {
    if (disposed) return
    const nextScope = inboxOwnerScope(), nextMode = readCodexInboxMode()
    if (sameInboxScope(scope, nextScope) && mode === nextMode) return
    pendingEvents.length = 0
    nominatedFocus.clear()
    // Task-sliced backfills can straddle A -> B -> A or Off -> On. Neither
    // matching coordinates nor a retained cache entry restores an old read.
    liveAuthority = Symbol('Inbox live connection')
    retainedMetadata = []; retainedRoute = null
    metadataPreview = null
    progressSnapshot = null
    if (!sameInboxScope(scope, nextScope)) { scope = nextScope; pageCount = 1 }
    mode = nextMode
    observer.setOptions(options())
    project()
  }
  const stopQuery = observer.subscribe(project)
  inbox.reproject = project
  const resolveLiveEvent = event => {
    const query = observer.getCurrentResult(), data = progressSnapshot || query.data
    if (disposed || mode !== 'on' || event.replayed || !event.session_id || query.error ||
        event.connectionId !== scope.connectionId || event.profile !== scope.profile ||
        !liveConnected(scope) || !sameInboxScope(scope, inboxOwnerScope()) || data?._codexInboxLiveAuthority !== liveAuthority) return null
    const metadata = metadataPreview?.sessions || data.sessions
    const canonicalId = codexInboxCanonicalRuntime(scope, data.targetProfile, event.session_id, data.rawLiveSessions, metadata, liveOwners)
    if (!canonicalId) return null
    const matches = metadata.filter(session => (session._lineage_root_id || session.id) === canonicalId)
    return matches.length ? { ...event, session_id: matches[0].id } : null
  }
  const verifyLiveEvent = event => !!resolveLiveEvent(event)
  inbox.verifyLiveEvent = verifyLiveEvent
  inbox.resolveLiveEvent = resolveLiveEvent
  const focusChanged = () => {
    configure(); rememberFocus(); project()
    const next = JSON.stringify(codexInboxLiveFocus())
    if (next !== lastFocus) {
      lastFocus = next
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
        if (!sameInboxScope(item.focus, event.scope)) continue
        item.settledKeys.add(settledKey)
        if (item.settledKeys.size > 64) pendingEvents.splice(index, 1)
      }
    }),
    ...['profile', 'connectionId', 'focusedSessionOwner', 'focusedStoredSessionId', 'focusedSessionId'].map(name => host.state[name]?.subscribe?.(focusChanged)),
    host.state.busyBySession?.subscribe?.(busyChanged),
    host.state.gateway?.subscribe?.(() => {
      if (host.state.gateway.get() !== 'open') {
        liveAuthority = Symbol('Inbox live connection')
        retainedMetadata = []; retainedRoute = null
        metadataPreview = null
        progressSnapshot = null
        pendingEvents.length = 0
        nominatedFocus.clear()
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
    if (!event.replayed && ['message.start', 'message.complete', 'error', 'clarify.request', 'clarify.settled', 'approval.request', 'approval.settled', 'tool.complete', 'subagent.spawn_requested', 'subagent.start', 'subagent.complete'].includes(event.type) &&
        mode === 'on' && event.connectionId === scope.connectionId && event.profile === scope.profile) {
      const currentFocus = codexInboxLiveFocus()
      if (currentFocus?.runtimeId === event.session_id) rememberFocus()
      const candidates = nominations().filter(focus => sameInboxScope(focus, scope) && focus.runtimeId === event.session_id)
      if (!verifyLiveEvent(event) && candidates.length) {
        // Keep only lifecycle + the nominated identity, never message content.
        // Runtime/stored atoms are not atomic. Retain alternatives and require
        // their independently proved durable lineage before releasing the event.
        const payload = {}
        if (typeof event.payload?.status === 'string') payload.status = event.payload.status
        if (typeof event.payload?.prompt_id === 'string') payload.prompt_id = event.payload.prompt_id
        if (typeof event.payload?.request_id === 'string') payload.request_id = event.payload.request_id
        if (event.payload?.error) payload.error = true
        if (typeof event.payload?.subagent_id === 'string') payload.subagent_id = event.payload.subagent_id
        pendingEvents.push({ focus: { ...scope }, storedIds: [...new Set(candidates.map(focus => focus.storedId))],
          settledKeys: new Set(), at: Date.now(), event: {
          type: event.type, ...scope, session_id: event.session_id, payload
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
    nominatedFocus.clear()
    subscriptions.forEach(unsubscribe => unsubscribe())
    window.removeEventListener(INBOX_MODE_EVENT, configure)
    readiness?.disconnect()
    stopQuery()
    observer.destroy()
    if (!context.liveOwners) liveOwners.clear()
    if (inbox.verifyLiveEvent === verifyLiveEvent) delete inbox.verifyLiveEvent
    if (inbox.resolveLiveEvent === resolveLiveEvent) delete inbox.resolveLiveEvent
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
    const resolved = inbox.resolveLiveEvent?.(event)
    if (!resolved) return
    if (typeof inbox.activity === 'function') inbox.activity({ ...resolved, canonicalSessionId: resolved.session_id })
    else if (['message.start', 'tool.start'].includes(event.type)) {
      inbox.reactivate({ type: 'work', scope: { connectionId: resolved.connectionId, profile: resolved.profile }, session_id: resolved.session_id, canonicalSessionId: resolved.session_id })
    }
  })
}


// Global plugin preference, deliberately independent of selected/focused owner.
const UNIVERSAL_INBOX_KEY = 'universal-inbox'
const UNIVERSAL_INBOX_EVENT = `${ID}:universal-inbox`
function readUniversalInbox() {
  try { return pluginStorage?.get(UNIVERSAL_INBOX_KEY, false) === true }
  catch { return false }
}
function setUniversalInbox(value) {
  const next = value === true
  try {
    if (!pluginStorage?.set || !pluginStorage?.get) throw new Error('Storage unavailable')
    pluginStorage.set(UNIVERSAL_INBOX_KEY, next)
    if (pluginStorage.get(UNIVERSAL_INBOX_KEY, null) !== next) throw new Error('Setting was not saved')
  } catch {
    host.notify?.({ kind: 'error', message: 'Could not save the Universal Inbox setting.' })
    return readUniversalInbox()
  }
  window.dispatchEvent(new CustomEvent(UNIVERSAL_INBOX_EVENT))
  return next
}

function inboxProfileAppearance(route, agent) {
  const name = route.profile.trim(), label = agent?.profileMetadata?.display_name?.trim() || route.profile
  let color = typeof profileColor === 'function' ? profileColor(name) : null
  // Approved compatibility seam: read only this native, credential-free key.
  // Never patch the storage/store; normal projection and storage events reread it.
  if (name && name !== 'default') try {
    const overrides = JSON.parse(window.localStorage.getItem('hermes.desktop.profileColors') || '{}')
    const value = Object.hasOwn(overrides || {}, name) ? overrides[name] : null
    if (typeof value === 'string' && value.length <= 128 && window.CSS.supports('color', value) && !/var\(|url\(/i.test(value)) color = value
  } catch { /* Public deterministic native color remains the fallback. */ }
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(label.trim())
  const letter = [...segments].map(part => part.segment).find(part => /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(part)) || '?'
  return { name, label, letter, color, background: color && typeof profileColorSoft === 'function' ? profileColorSoft(color, 22) : null }
}

function codexInboxReadLimiter(limit = 4) {
  let running = 0
  const queue = []
  const drain = () => {
    while (running < limit && queue.length) {
      const item = queue.shift()
      item.signal?.removeEventListener('abort', item.abort)
      if (item.signal?.aborted) { item.reject(new Error('Inbox read cancelled')); continue }
      running++
      let released = false
      item.resolve(() => { if (!released) { released = true; running--; drain() } })
    }
  }
  return signal => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Inbox read cancelled')); return }
    const item = { signal, resolve, reject, abort: () => {
      const index = queue.indexOf(item)
      if (index >= 0) queue.splice(index, 1)
      reject(new Error('Inbox read cancelled'))
    } }
    queue.push(item); signal?.addEventListener('abort', item.abort, { once: true }); drain()
  })
}

async function readUniversalInboxInventory() {
  if (!host.profileRoutes || !window.hermesDesktop?.getAgentRoster) throw new Error('Universal Inbox requires exact profile routes and roster')
  const [routes, roster] = await Promise.all([host.profileRoutes(), window.hermesDesktop.getAgentRoster()])
  if (!Array.isArray(routes) || !Array.isArray(roster?.agents) || !Array.isArray(roster?.sources) || !roster.sources.length) throw new Error('Incomplete Inbox inventory')
  const sources = new Map(roster.sources.map(source => [source.connectionId, source]))
  const routeCounts = new Map()
  for (const route of routes) {
    const key = JSON.stringify([route?.connectionId, route?.profile])
    routeCounts.set(key, (routeCounts.get(key) || 0) + 1)
  }
  const available = [], seen = new Set(), backendAliases = new Map()
  let complete = roster.sources.every(source => source.reachable === true && !source.error && !source.needsSignIn)
  for (const route of routes) {
    if (!route || !['connectionId', 'profile', 'targetProfile'].every(field => typeof route[field] === 'string' && route[field] && route[field] !== '*') || route.profile === 'all' || route.targetProfile === 'all' || !['local', 'remote'].includes(route.mode)) { complete = false; continue }
    const key = JSON.stringify([route.connectionId, route.profile])
    const agents = roster.agents.filter(agent => sameInboxScope(agent, route) && (!agent.targetProfile || agent.targetProfile === route.targetProfile))
    const source = sources.get(route.connectionId)
    if (routeCounts.get(key) !== 1 || agents.length !== 1 || source?.reachable !== true || source.error || source.needsSignIn) { complete = false; continue }
    seen.add(key)
    const backendKey = JSON.stringify([route.connectionId, route.targetProfile])
    backendAliases.set(backendKey, (backendAliases.get(backendKey) || 0) + 1)
    available.push({ key, route: { ...route }, agent: agents[0], backendKey })
  }
  if (roster.agents.some(agent => !seen.has(JSON.stringify([agent.connectionId, agent.profile])))) complete = false
  const verified = available.filter(item => {
    if (backendAliases.get(item.backendKey) === 1) return true
    complete = false; return false
  })
  return { complete, routes: verified, sources: roster.sources, ambiguous: !complete }
}

function startUniversalInboxObserver(ctx, inbox, acquire = codexInboxReadLimiter(4)) {
  let disposed = false
  const owners = new Map(), liveOwners = new Map(), stamp = Symbol('Universal inventory')
  let projectionQueued = false
  const onOwnersChanged = () => {
    if (projectionQueued || disposed) return
    projectionQueued = true
    queueMicrotask(() => {
      projectionQueued = false
      if (!disposed) for (const item of owners.values()) if (item.active) item.proxy?.reproject?.()
    })
  }
  const publish = () => {
    if (disposed) return
    inbox.updateOwners([...owners.values()].filter(item => item.snapshot).map(item => {
      const appearance = inboxProfileAppearance(item.route, item.agent), previous = item.published
      // Only this owner's new projection/availability/appearance invalidates its
      // published reference. An unrelated owner's progress must not clone it.
      if (!previous || item.publishedSource !== item.snapshot || previous.routeAvailable !== item.active ||
          Object.keys(appearance).some(key => appearance[key] !== previous.appearance[key])) {
        item.publishedSource = item.snapshot
        item.published = { ...item.snapshot, scope: item.route, route: item.route, appearance,
          routeAvailable: item.active, ownerGeneration: item.generation }
      }
      return item.published
    }))
  }
  const retire = (item, remove = false) => {
    item.active = false; item.stop?.(); item.stop = null
    for (const [key, proof] of liveOwners) if (sameInboxScope(proof, item.route) && !proof.conflicted) liveOwners.delete(key)
    onOwnersChanged()
    if (remove) owners.delete(item.key)
    else if (item.snapshot) item.snapshot = { ...item.snapshot, liveSessions: [], childSnapshots: [], busyBySession: {}, liveStatusKnown: false, error: 'Owner inventory unavailable' }
  }
  const reconcile = () => {
    if (disposed) return

    const query = observer.getCurrentResult(), data = query.data
    if (query.error || data?.stamp !== stamp) {
      if (query.error) for (const item of owners.values()) retire(item)
      publish(); return
    }
    const present = new Set(data.routes.map(item => item.key))
    for (const item of owners.values()) if (!present.has(item.key)) retire(item, data.complete && !data.ambiguous)
    for (const discovered of data.routes) {
      let item = owners.get(discovered.key)
      if (item && JSON.stringify(item.route) !== JSON.stringify(discovered.route)) { retire(item, true); item = null }
      if (!item) { item = { ...discovered, generation: Symbol('Universal owner'), active: true, snapshot: null }; owners.set(item.key, item) }
      item.agent = discovered.agent
      if (item.stop) continue
      item.active = true
      const localDisposals = []
      const proxy = { model: inbox.model, admission: inbox.admission, setMode() {},
        activity: event => item.active && !disposed && owners.get(item.key) === item && inbox.activity({ ...event, scope: { ...item.route, _codexInboxGeneration: item.generation } }),
        update: snapshot => {
          if (disposed || !item.active || owners.get(item.key) !== item) return
          item.snapshot = snapshot; publish()
        }
      }
      item.proxy = proxy
      startCodexInboxObserver({ onDispose: fn => localDisposals.push(fn) }, proxy, {
        ownerScope: () => item.active && !disposed ? item.route : null,
        mode: () => item.active && !disposed && readUniversalInbox() ? readCodexInboxMode() : 'off',
        queryKey: ['universal', item.route.targetProfile, item.route.mode], acquire, liveOwners, onOwnersChanged,
        liveAvailable: () => !host.state.gateway?.get || host.state.gateway.get() === 'open'
      })
      item.stop = () => localDisposals.reverse().forEach(fn => fn())
    }
    publish()
  }
  const observer = new CodexInboxObserverVendor.QueryObserver(queryClient, {
    queryKey: [ID, 'universal-inbox-inventory'],
    queryFn: async () => ({ ...await readUniversalInboxInventory(), stamp }),
    staleTime: 0, refetchInterval: 10_000, retry: 1
  })
  const resolve = event => {
    const item = owners.get(JSON.stringify([event.connectionId, event.profile]))
    const resolved = item?.active && item.proxy?.resolveLiveEvent?.(event)
    return resolved ? { ...resolved, scope: { ...item.route, _codexInboxGeneration: item.generation } } : null
  }
  inbox.resolveLiveEvent = resolve
  const stopQuery = observer.subscribe(reconcile)
  const storageChanged = event => { if (!event.key || event.key === 'hermes.desktop.profileColors') publish() }
  window.addEventListener('storage', storageChanged)
  const stopGateway = host.state.gateway?.subscribe?.(() => {
    // The selected socket is not the availability of independent HTTP owners.
    // Per-owner observers revoke live proof; metadata remains roster-routed.
    liveOwners.clear()
    onOwnersChanged()
    void observer.refetch()
  })
  reconcile()
  const stop = () => {
    if (disposed) return
    disposed = true; stopQuery(); observer.destroy(); stopGateway?.()
    window.removeEventListener('storage', storageChanged)
    for (const item of owners.values()) retire(item)
    owners.clear()
    if (inbox.resolveLiveEvent === resolve) delete inbox.resolveLiveEvent
  }
  ctx.onDispose(stop)
  return stop
}

function startCodexInboxService(ctx, inbox) {
  if (!inbox) return () => {}
  // Keep the bound across retired generations whose native IPC cannot abort.
  const acquire = codexInboxReadLimiter(4)
  let disposed = false, signature = null, disposals = []
  const configure = () => {
    if (disposed) return
    const next = JSON.stringify([readUniversalInbox(), readUniversalInbox() ? readCodexInboxMode() : null])
    if (signature === next) return
    signature = next; disposals.reverse().forEach(fn => fn()); disposals = []
    const local = { onDispose: fn => disposals.push(fn) }
    inbox.resetOwners?.()
    inbox.setMode(readCodexInboxMode() === 'on')
    if (readUniversalInbox() && readCodexInboxMode() === 'on') startUniversalInboxObserver(local, inbox, acquire)
    else startCodexInboxObserver(local, inbox)
  }
  window.addEventListener(UNIVERSAL_INBOX_EVENT, configure)
  window.addEventListener(INBOX_MODE_EVENT, configure)
  configure()
  const stop = () => {
    if (disposed) return
    disposed = true; disposals.reverse().forEach(fn => fn()); disposals = []
    window.removeEventListener(UNIVERSAL_INBOX_EVENT, configure); window.removeEventListener(INBOX_MODE_EVENT, configure)
  }
  ctx.onDispose(stop)
  return stop
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
async function readCodexInboxOpenedSession(thread, { stillCurrent = () => true, expectedRootId, followLineage = false, requireOwner = false } = {}) {
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
  let targetProfile = scope.targetProfile || scope.profile
  if (row.profile !== targetProfile && typeof host.profileRoutes === 'function') {
    const routes = await host.profileRoutes()
    const matches = routes.filter(route => sameInboxScope(route, scope))
    if (matches.length === 1 && matches[0].targetProfile) targetProfile = matches[0].targetProfile
  }
  if (!stillCurrent() || row.profile !== targetProfile || row.connection_id && row.connection_id !== scope.connectionId || requireOwner && row.connection_id !== scope.connectionId) {
    throw new Error('Inbox opened-chat owner could not be verified.')
  }
  return { ...row, ...(lineage ? { _lineage_root_id: lineage.path[0], _lineage_ids: lineage.path } : {}),
    _codexInboxBackendOwner: { connectionId: row.connection_id || scope.connectionId, profile: row.profile },
    profile: scope.profile, connection_id: scope.connectionId }
}

function isCodexInboxSessionNotFound(error) {
  const status = error?.status ?? error?.statusCode
  if (status != null) return status === 404
  // Electron invoke drops statusCode. Read only the native HTTP prefix,
  // never a status mentioned inside an auth, transport or corrupt-body error.
  const nativeStatus = /^Error invoking remote method 'hermes:api': Error: (\d{3}): /.exec(error?.message || '')
  if (nativeStatus) return nativeStatus[1] === '404'
  // Hermes Desktop answers an EXPECTED 404 through the `__hermesExpected404__`
  // sentinel (electron/api-expected-404.ts): the main process resolves with it
  // and the preload rethrows the status text as a bare `<status>: <body>` error,
  // with neither the invoke prefix nor a status field. Accept that complete
  // shape only, so a body that merely mentions a status stays rejected.
  const expectedNotFound = /^(\d{3}): \{[^\n]*\}$/.exec(error?.message || '')
  if (expectedNotFound?.[1] !== '404') return false
  try {
    JSON.parse(expectedNotFound[0].slice(5))
    return true
  } catch {
    return false
  }
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
[data-codex-inbox-row-ui][data-work-state='working'] [data-codex-inbox-work-dot] { background:var(--ui-accent,var(--ui-text-primary,currentColor)); opacity:1; }
[data-codex-inbox-row-ui][data-work-state='completed'] [data-codex-inbox-work-dot] { background:var(--ui-success,var(--ui-text-quaternary,currentColor)); opacity:1; }
[data-codex-inbox-row-ui][data-work-state='needs-input'] [data-codex-inbox-work-dot] { background:var(--color-amber-500); opacity:1; }
/* Plugin-owned transcription of the installed host's private arc-border arc-row:
   styles.css:1217-1262,1307-1330,1346-1360,1373-1377; captured index-pdLEZZqK.css.
   The installed SDK has no RunningBorder export; session-row.tsx paints an aria-hidden span.
   Keep the masked 240% repeating gradient and one-period compositor translation. */
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
  content:''; position:absolute; top:0; left:0; width:240%; height:240%;
  background:repeating-linear-gradient(var(--codex-inbox-arc-angle),transparent 0%,var(--codex-inbox-arc-c0) 18.75%,var(--codex-inbox-arc-c1) 25%,var(--codex-inbox-arc-c2) 31.25%,transparent 43.75%,transparent 50%);
  will-change:transform; animation:codex-inbox-row-contour var(--codex-inbox-arc-duration) linear infinite;
}
@keyframes codex-inbox-row-contour { 0% { transform:translate(0,0); } 100% { transform:translate(-50%,-50%); } }
[data-codex-inbox-row-ui] [data-codex-inbox-title-wrap] { min-width:0; flex:1; align-self:center; }
[data-codex-inbox-row-ui] [data-codex-inbox-label] { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.8125rem; line-height:1.35; font-weight:400; color:var(--ui-text-secondary,inherit); }
[data-codex-inbox-row-ui]:is(:hover,:focus-within,[data-active='true']) [data-codex-inbox-label] { color:var(--ui-text-primary,inherit); }
[data-codex-inbox-row-ui] > [data-row-actions] { display:flex; flex-shrink:0; align-items:center; align-self:stretch; }
[data-codex-inbox-row-ui] > [data-row-actions] { position:relative; }
[data-codex-inbox-profile-slot] { position:absolute; right:0; top:0; bottom:0; width:1.5rem; display:grid; place-items:center; pointer-events:none; }
[data-codex-inbox-profile-slot][hidden] { display:none; }
[data-codex-inbox-profile-glyph] { box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; width:16px; height:16px; border-radius:3px; font-size:8px; font-weight:600; line-height:1; text-transform:uppercase; }
[data-codex-inbox-profile-glyph] .codicon { font-size:12px; }
[data-codex-inbox-row-ui]:is(:hover,:focus-within) [data-codex-inbox-profile-slot] { visibility:hidden; }
[data-codex-inbox-row-ui] > [data-row-actions] > button { box-sizing:border-box; display:inline-flex; width:1.5rem; height:1.5rem; flex-shrink:0; align-items:center; justify-content:center; padding:0; border:0; border-radius:4px; background:transparent; color:var(--ui-text-secondary,inherit); font:inherit; cursor:pointer; opacity:0; pointer-events:none; transition:opacity 100ms; }
[data-codex-inbox-row-ui]:is(:hover,:focus-within) > [data-row-actions] > button { opacity:1; pointer-events:auto; }
[data-codex-inbox-row-ui] > [data-row-actions] > button:hover { background:var(--chrome-action-hover,var(--ui-control-hover-background,transparent)); color:var(--ui-text-primary,inherit); }
[data-codex-inbox-row-ui] button:focus-visible { outline:1px solid var(--ui-accent,currentColor); outline-offset:-1px; }
[data-codex-inbox-row-ui] button:disabled { cursor:default; }
[data-codex-inbox-row-ui] > [data-row-actions] > button:disabled { pointer-events:none; }
[data-codex-inbox-row-ui]:is(:hover,:focus-within) > [data-row-actions] > button:disabled { opacity:.5; }
[data-codex-inbox-row-ui] > [data-row-actions] > [data-codex-inbox-snooze][aria-hidden='true'],
[data-codex-inbox-row-ui]:is(:hover,:focus-within) > [data-row-actions] > [data-codex-inbox-snooze][aria-hidden='true'] { opacity:0; visibility:hidden; pointer-events:none; transition:none; }

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
  const profileSlot = make('span', '', 'data-codex-inbox-profile-slot');
  profileSlot.setAttribute('aria-hidden', 'true'); profileSlot.hidden = true;
  const profileGlyph = make('span', '', 'data-codex-inbox-profile-glyph');
  profileSlot.append(profileGlyph);
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
      if (!button.disabled && !button.inert && typeof callback === 'function') callback(event);
    });
  }
  // The action remains the same button/callback and disabled ledger. Only
  // callers opting in get a Settle check rather than the generic options menu.
  let settleAction = false;
  let cancelSnoozeAction = false;
  let snoozeDisabled = false;
  let menuTitle = null;
  let menuLabel = null;
  const property = (node, name, value) => { if (node[name] !== value) node[name] = value; };
  const attribute = (node, name, value) => {
    if (value === null) { if (node.hasAttribute(name)) node.removeAttribute(name); }
    else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  };
  // Normalize only the consumed CSS properties, not the metadata object. The
  // detached declaration handles hex/rgb serialization without live writes and
  // still lets an identical update repair actual inline-style drift.
  const normalizedStyle = doc.createElement('span').style;
  const appearanceStyle = (name, value) => {
    normalizedStyle[name] = value;
    property(profileGlyph.style, name, normalizedStyle[name]);
  };
  const workStates = new Set(['needs-input', 'working', 'completed', 'reading', 'unknown', 'idle']);
  const update = (state = {}) => {
    if ('foreignProfile' in state) {
      const appearance = state.profileAppearance;
      property(profileSlot, 'hidden', !state.foreignProfile || !appearance);
      if (!profileSlot.hidden) {
        property(profileSlot, 'title', String(appearance.label));
        appearanceStyle('color', appearance.name === 'default' ? 'var(--ui-text-quaternary)' : appearance.color || '');
        appearanceStyle('background', appearance.name === 'default' ? 'transparent' : appearance.background || 'color-mix(in srgb,var(--ui-text-quaternary) 22%,transparent)');
        if (appearance.name === 'default') {
          if (!profileGlyph.querySelector('.codicon-home')) { const home = make('i', 'codicon codicon-home'); home.setAttribute('aria-hidden', 'true'); profileGlyph.replaceChildren(home); }
        } else if (profileGlyph.textContent !== appearance.letter) profileGlyph.textContent = appearance.letter;
      }
      if (state.foreignProfile && !profileSlot.isConnected) actions.append(profileSlot);
    }
    if ('title' in state) { property(text, 'textContent', String(state.title ?? '')); property(go, 'title', text.textContent); }
    if ('selected' in state) {
      const selected = Boolean(state.selected);
      if (row.classList.contains('bg-(--ui-row-active-background)') !== selected) row.classList.toggle('bg-(--ui-row-active-background)', selected);
      attribute(row, 'data-active', String(selected));
      // The shipped skin paints aria-current; keep it on the shell, not the
      // transparent body, so selection does not create a second inset band.
      attribute(row, 'aria-current', selected ? 'true' : null);
    }
    if ('disabled' in state) property(go, 'disabled', Boolean(state.disabled));
    if ('snoozeDisabled' in state) snoozeDisabled = Boolean(state.snoozeDisabled);
    if ('menuDisabled' in state || 'disabled' in state) {
      if ('menuDisabled' in state) attribute(menu, 'data-menu-disabled', String(Boolean(state.menuDisabled)));
      property(menu, 'disabled', go.disabled || menu.dataset.menuDisabled === 'true');
    }
    if ('workState' in state) {
      // Rendering consumes an explicit state; it never guesses completion from
      // inactivity, selection or a missing runtime slice.
      attribute(row, 'data-work-state', workStates.has(state.workState) ? state.workState : 'unknown');
      if (state.workState === 'needs-input') {
        attribute(workDot, 'role', 'status'); attribute(workDot, 'aria-label', 'Needs input'); property(workDot, 'title', 'Waiting for your answer');
      } else {
        attribute(workDot, 'role', null); attribute(workDot, 'aria-label', null); attribute(workDot, 'title', null);
      }
    }
    if ('settleAction' in state || 'cancelSnoozeAction' in state) {
      if ('cancelSnoozeAction' in state) cancelSnoozeAction = Boolean(state.cancelSnoozeAction);
      if ('settleAction' in state) settleAction = Boolean(state.settleAction);
      // Only Inbox opts into Snooze-left / Settle-right. Generic options keep
      // their original order. Move a sibling only on mode changes so ordinary
      // keyed updates cannot detach controls or disturb their keyboard focus.
      const firstAction = settleAction || cancelSnoozeAction ? clock : menu;
      if (actions.firstElementChild !== firstAction) actions.insertBefore(firstAction, actions.firstChild);
      attribute(menu, 'data-codex-inbox-settle', settleAction && !cancelSnoozeAction ? '' : null);
      attribute(menu, 'data-codex-inbox-cancel-snooze', cancelSnoozeAction ? '' : null);
      // Keep the clock's slot, but only restore is actionable during Snooze.
      property(clock, 'inert', cancelSnoozeAction);
      property(clock, 'tabIndex', cancelSnoozeAction ? -1 : 0);
      attribute(clock, 'aria-hidden', cancelSnoozeAction ? 'true' : null);
      attribute(menu.firstChild.firstChild, 'd', cancelSnoozeAction ? 'M8 13V3M3.5 7.5 8 3l4.5 4.5' : settleAction ? 'M3.5 8.5l3 3 6-7' : 'M3 8h.01M8 8h.01M13 8h.01');
      attribute(menu.firstChild, 'stroke-width', settleAction || cancelSnoozeAction ? '1.25' : '2.5');
      if (settleAction || cancelSnoozeAction) {
        attribute(menu, 'aria-haspopup', null); attribute(menu, 'aria-expanded', null);
      } else {
        attribute(menu, 'aria-haspopup', 'menu'); attribute(menu, 'aria-expanded', 'false');
      }
    }
    property(clock, 'disabled', go.disabled || cancelSnoozeAction || snoozeDisabled);
    if ('menuTitle' in state) menuTitle = state.menuTitle == null ? null : String(state.menuTitle);
    if ('menuLabel' in state) menuLabel = state.menuLabel == null ? null : String(state.menuLabel);
    if ('menuTitle' in state || 'menuLabel' in state || 'settleAction' in state || 'cancelSnoozeAction' in state) {
      const name = menuTitle ?? (cancelSnoozeAction ? 'Cancel snooze' : settleAction ? 'Settle' : 'Inbox row options');
      property(menu, 'title', name); attribute(menu, 'aria-label', menuLabel ?? name);
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
  if (!valid || !id) return null;
  // Keep the stable identity-mapped local namespace. An old alias-only record
  // cannot certify a remote backend: preserve it, but never silently adopt it.
  const backend = scope.targetProfile && (scope.targetProfile !== valid.profile || scope.mode === 'remote')
    ? [scope.targetProfile, scope.mode] : [];
  return JSON.stringify([valid.connectionId, valid.profile, id, ...backend]);
}

function codexInboxRouteKey(route) {
  return JSON.stringify([route?.connectionId, route?.profile, route?.targetProfile, route?.mode]);
}

function codexInboxStateScope(scope) {
  const valid = codexInboxScope(scope);
  return valid && scope.targetProfile && scope.mode ? { ...valid, targetProfile: scope.targetProfile, mode: scope.mode } : valid;
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
    try { const p = JSON.parse(key); return Array.isArray(p) && [3, 5].includes(p.length) && typeof p[0] === 'string' && p.slice(1).every(v => typeof v === 'string' && v); }
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
          ...(record.reply && ['completed', 'read', 'none'].includes(record.reply.state) && validTimestamp(record.reply.at) &&
            typeof record.reply.sessionId === 'string' && record.reply.sessionId &&
            (record.reply.messageCount === null || Number.isSafeInteger(record.reply.messageCount) && record.reply.messageCount >= 0)
            ? { reply: { ...record.reply } } : {}),
          ...(record.manualSettled === true ? { manualSettled: true } : {})
        };
      }
      for (const [alias, root] of Object.entries(saved.aliases)) {
        if (!validKey(alias) || !validKey(root)) continue;
        const a = JSON.parse(alias), r = JSON.parse(root);
        if (JSON.stringify([a[0], a[1], ...a.slice(3)]) === JSON.stringify([r[0], r[1], ...r.slice(3)]) && state.records[root]) state.aliases[alias] = root;
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
        if (prior.reply && (!record.reply || prior.reply.at > record.reply.at ||
            prior.reply.at === record.reply.at && prior.reply.state === 'read')) record.reply = prior.reply;
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
  const transaction = (change, event, publish = true) => {
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
      if (publish) notify(event);
      return result;
    } catch {
      error = 'Inbox state could not be saved. No Inbox changes were applied.';
      if (publish) notify();
      return false;
    }
  };
  return {
    key: (scope, session) => rootKey(state, scope, session),
    replyState(scope, session) {
      const reply = state.records[rootKey(state, scope, session)]?.reply;
      // A new native unread reply can arrive while no lifecycle events were
      // observed. Only positive unread evidence plus a newer count releases read.
      if (reply?.state === 'read' && session?.unread === true && reply.sessionId === codexInboxId(session) &&
          Number.isSafeInteger(reply.messageCount) && Number.isSafeInteger(session.message_count) && session.message_count > reply.messageCount) return null;
      return reply?.state === 'none' ? null : reply?.state || null;
    },
    recordReply(scope, session, phase) {
      if (!['completed', 'read', 'none'].includes(phase)) return false;
      return transaction(draft => {
        const item = associate(draft, scope, session);
        if (!item) return false;
        const messageCount = Number.isSafeInteger(session?.message_count) && session.message_count >= 0 ? session.message_count : null;
        if (item.record.reply?.state === phase && item.record.reply.sessionId === item.id && item.record.reply.messageCount === messageCount) return true;
        let at = Date.now();
        for (const record of Object.values(draft.records)) at = Math.max(at, (record.reply?.at || 0) + 1);
        item.record.reply = { state: phase, at, sessionId: item.id, messageCount };
        return true;
      // Receipt writes can originate while painting. Do not schedule another
      // paint from their own storage failure and spin while storage is full.
      }, undefined, false);
    },
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
  const scopeKey = scope => { const key = codexInboxKey(scope, '@'); if (!key) return null; const tuple = JSON.parse(key); return JSON.stringify([tuple[0], tuple[1], ...tuple.slice(3)]); };
  const validKey = (key, length) => {
    try { const tuple = JSON.parse(key); return Array.isArray(tuple) && [length, length + 2].includes(tuple.length) && typeof tuple[0] === 'string' && tuple.slice(1).every(v => typeof v === 'string' && v); }
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
      if (JSON.stringify([tuple[0], tuple[1], ...tuple.slice(3)]) === owner) ids.set(model?.key(scope, tuple[2]) || key, tuple[2]);
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

function codexInboxSnoozeOptions(now = Date.now()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now);
  // Next week means the next Monday, including when today is Monday before 09:00.
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7)); monday.setHours(9, 0, 0, 0);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  return [
    ['hour', 'In 1 hour', now + 3600000], ['hours', 'In 3 hours', now + 10800000],
    ['tomorrow', 'Tomorrow', tomorrow.getTime()], ['week', 'Next week', monday.getTime()]
  ].map(([id, label, until]) => ({ id, label, until,
    indicator: `${id === 'week' ? day.format(until) + ' ' : ''}${time.format(until)}` }));
}

function installCodexInboxRuntime({ storage, host, document: doc = document, window: win = window, onFeatureUsed = () => {}, onFeatureFailed = () => {} }) {
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
  let workingShelfOpen = false;
  let snoozedShelfOpen = false;
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
  // Each synchronous owner pipeline keeps the stable Snooze implementation's
  // exact scope/input semantics. Only its qualified projections are merged.
  let ownerSnapshots = null;
  let ownerSnapshotSources = new Map();
  let singleGeneration = Symbol('Inbox owner');
  const ownerKey = scope => JSON.stringify([scope?.connectionId, scope?.profile]);
  const withinOwner = (scope, fn, actionable = false) => {
    if (!ownerSnapshots) {
      if (actionable && (JSON.stringify(codexInboxScope(scope)) !== JSON.stringify(codexInboxScope(currentScope)) ||
          scope?.targetProfile && codexInboxRouteKey(scope) !== codexInboxRouteKey(input.route || currentScope) ||
          scope?._codexInboxGeneration && scope._codexInboxGeneration !== singleGeneration)) return null;
      return fn();
    }
    const snapshot = ownerSnapshots.get(ownerKey(scope));
    if (!snapshot || actionable && (snapshot.routeAvailable !== true || codexInboxRouteKey(scope) !== codexInboxRouteKey(snapshot.route) || scope?._codexInboxGeneration !== snapshot.ownerGeneration)) return null;
    const previousScope = currentScope, previousInput = input;
    currentScope = codexInboxStateScope(snapshot.route || snapshot.scope); input = snapshot;
    try { return fn(); } finally { currentScope = previousScope; input = previousInput; }
  };
  const withSession = (session, fn, actionable = false) => withinOwner(session?._codexInboxRoute || currentScope, fn, actionable);
  const sessionKey = session => withSession(session, () => model.key(currentScope, session));
  const projectedSessions = () => ownerSnapshots
    ? [...ownerSnapshots.values()].flatMap(snapshot => withinOwner(snapshot.scope, () => inboxSessions()))
    : inboxSessions();
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
  const inboxSessions = () => [...visibleSessions(), ...(input.retainedSessions || [])]
    .filter(session => admission.isEligible(currentScope, session));
  const findSession = id => visibleSessions().find(s => codexInboxId(s) === id || s._lineage_root_id === id || s._lineage_ids?.includes(id));
  const durableAliases = session => new Set([codexInboxId(session), session?._lineage_root_id, ...(session?._lineage_ids || [])].filter(Boolean));
  const liveMatches = (session, live) => {
    const ids = durableAliases(session);
    if (Object.hasOwn(live, '_codexInboxCanonicalId')) return typeof live._codexInboxCanonicalId === 'string' && ids.has(live._codexInboxCanonicalId);
    const stored = [live.session_key, live.stored_session_id, live._lineage_root_id, ...(live._lineage_ids || [])].filter(Boolean);
    // Legacy authorized fixtures may omit stored fields. Once present, they
    // identify the lineage; equality with a runtime ID is never a relationship.
    if (stored.length) return stored.some(id => ids.has(id));
    return [live.id, live.session_id].some(id => ids.has(id));
  };
  const eventSession = event => {
    if (Object.hasOwn(event, 'canonicalSessionId')) return typeof event.canonicalSessionId === 'string' && event.canonicalSessionId
      ? findSession(event.canonicalSessionId) : null;
    const id = event.session_id || event.id || event.session_key;
    return findSession(id) || visibleSessions().find(session => runtimeAliases(session).has(id));
  };
  const runtimeAliases = session => {
    const aliases = durableAliases(session);
    for (const live of input.liveSessions || []) {
      if (!codexInboxOwnedBy(currentScope, live) || !liveMatches(session, live)) continue;
      const runtimeId = live.session_id || live.id;
      if (runtimeId) aliases.add(runtimeId);
    }
    return aliases;
  };
  const safety = (session, admissionCheck = false) => {
    if (session._codexInboxPresentationOnly) return 'unknown';
    let unresolved = input.liveStatusKnown !== true;
    let reading = false;
    for (const live of input.liveSessions || []) {
      if (!codexInboxOwnedBy(currentScope, live)) continue;
      if (!liveMatches(session, live)) continue;
      const status = codexInboxWorkStatus(live);
      if (status === 'work') return 'work';
      if (status === 'unknown') unresolved = true;
      if (status === 'reading') reading = true;
    }
    for (const id of admissionCheck && input.busyOwnerKnown === false ? [] : durableAliases(session)) {
      const busy = input.busyBySession instanceof Map ? input.busyBySession.get(id) : input.busyBySession?.[id];
      if (busy === undefined) continue;
      const status = codexInboxWorkStatus(busy);
      if (status === 'work') return 'work';
      if (status === 'unknown') unresolved = true;
      if (status === 'reading') reading = true;
    }
    return unresolved ? 'unknown' : reading ? 'reading' : 'idle';
  };
  const freshChildSnapshot = snapshot => {
    if (typeof snapshot?.session_id !== 'string' || !snapshot.session_id || !Number.isFinite(snapshot.at) || snapshot.at <= 0 ||
        !Array.isArray(snapshot.childIds) || snapshot.childIds.some(id => typeof id !== 'string' || !id)) return null;
    const session = findSession(snapshot.session_id);
    if (!session) return null;
    const key = model.key(currentScope, session), previous = activityByKey.get(key);
    if (snapshot.at <= (previous?.childEventAt || 0) || snapshot.at <= (previous?.childSnapshotAt || 0)) return null;
    const childIds = snapshot.childIds.filter(id => !previous?.terminalChildren?.has(id) &&
      (!previous?.terminalChildrenOverflow || previous.children?.has(id) || previous.pendingChildren?.has(id)));
    return { session, key, previous, childIds };
  };
  const reconcileAdmission = () => {
    const sessions = visibleSessions(), working = input.loading || input.error || input.liveStatusKnown !== true ? [] : sessions.filter(session => safety(session, true) === 'work');
    const childWorking = input.loading || input.error || input.liveStatusKnown !== true ? [] : (input.childSnapshots || [])
      .map(freshChildSnapshot).filter(fresh => fresh?.childIds.length).map(fresh => fresh.session);
    // Rendering deduplicates lineage rows, never their source evidence. A late
    // cron ancestor/alias must taint the whole thread whichever row comes first.
    admission.observe(currentScope, input.sessions, { workingSessions: [...working, ...childWorking] });
    // Child proof admits work, not a new attention decision. Parent work keeps
    // its existing ingestion rules; child snapshots never clear Settle/Snooze.
    model.ingest(currentScope, sessions, { liveSessions: working.map(session => ({ ...session, status: 'working' })) });
  };
  const reconcileActivity = () => {
    if (input.loading || input.error) return;
    for (const session of visibleSessions().filter(session => admission.isEligible(currentScope, session))) {
      const key = model.key(currentScope, session), previous = activityByKey.get(key);
      const phase = previous?.phase || model.replyState(currentScope, session);
      const status = safety(session, true), newer = Number.isFinite(input.liveStatusAt) && input.liveStatusAt > (previous?.at || 0);
      // A terminal frame precedes backend cleanup. A late working snapshot
      // cannot cancel that receipt; a new positive work event can.
      if (status === 'work' && !previous?.parentFinished && !['completed', 'read'].includes(phase) && (!previous || newer)) {
        activityByKey.set(key, { ...previous, phase: 'working', at: input.liveStatusAt || Date.now(), children: previous?.children || new Set() });
      } else if (status === 'idle' && previous?.phase === 'working' && newer) {
        activityByKey.set(key, { ...previous, phase: session.unread === true ? 'completed' : 'unknown', at: input.liveStatusAt });
        if (session.unread === true) model.recordReply(currentScope, session, 'completed');
      }
    }
  };
  const reconcileChildActivity = () => {
    if (input.loading || input.error || input.liveStatusKnown !== true) return;
    for (const snapshot of input.childSnapshots || []) {
      // Request-start ordering fences in-flight reads against child lifecycle
      // events. Parent snapshots and attention decisions have separate clocks.
      const fresh = freshChildSnapshot(snapshot);
      if (!fresh) continue;
      const { key, previous, childIds } = fresh;
      // Native rosters omit queued spawns until registration. A fresh empty
      // roster cannot cancel that proved intent; start/complete can release it.
      const pendingChildren = new Set([...(previous?.pendingChildren || [])].filter(id => !childIds.includes(id)));
      activityByKey.set(key, { ...previous, phase: previous?.phase || model.replyState(currentScope, fresh.session) || 'unknown', at: previous?.at || 0,
        children: new Set([...childIds, ...pendingChildren]), pendingChildren, childSnapshotAt: snapshot.at });
    }
  };
  const viewedReply = session => {
    const owner = codexInboxScope(host.state?.focusedSessionOwner?.get?.());
    const stored = host.state?.focusedStoredSessionId?.get?.();
    const runtime = host.state?.focusedSessionId?.get?.();
    if (!owner || !stored || !runtime || JSON.stringify(owner) !== JSON.stringify(codexInboxScope(currentScope)) ||
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
    if (session._codexInboxPresentationOnly) return rowBindings.get(model.key(currentScope, session))?.presentationState || 'unknown';
    if (input.loading || input.error || input.liveStatusKnown !== true) return 'unknown';
    const key = model.key(currentScope, session), status = safety(session, true), activity = activityByKey.get(key);
    const phase = activity?.phase === 'read' ? model.replyState(currentScope, session) : activity?.phase || model.replyState(currentScope, session);
    if (status === 'unknown') return 'unknown';
    if (waitingForInput(session)) return 'needs-input';
    if (activity?.children.size) return 'working';
    if (status === 'reading') return 'reading';
    if (activity?.phase === 'working') {
      if (model.replyState(currentScope, session)) model.recordReply(currentScope, session, 'none');
      return 'working';
    }
    if (phase === 'read') return 'idle';
    if (activity?.phase === 'unknown' && activity.parentFinished) {
      if (model.replyState(currentScope, session)) model.recordReply(currentScope, session, 'none');
      return 'unknown';
    }
    if (phase === 'completed' || status === 'idle' && session.unread === true) {
      // Live paint must not depend on disk availability. Retain the receipt
      // in this controller and retry its durable write when storage recovers.
      if (phase !== 'completed') activityByKey.set(key, { ...activity, phase: 'completed', at: activity?.at || Date.now(), children: activity?.children || new Set() });
      if (model.replyState(currentScope, session) !== 'completed') model.recordReply(currentScope, session, 'completed');
      if (!viewedReply(session)) return 'completed';
      // Reading acknowledges this reply's paint only. It never settles,
      // snoozes or admits a thread, and fresh work resets the receipt.
      if (!model.recordReply(currentScope, session, 'read')) return 'completed';
      activityByKey.set(key, { ...activity, phase: 'read', at: activity?.at || Date.now(), children: activity?.children || new Set() });
      return 'idle';
    }
    if (status === 'work' && !activity?.parentFinished) return 'working';
    if (activity?.phase === 'unknown') return 'unknown';
    // Native unread marks a completed reply. Merely idle/busy:false does not.
    return session.unread === true ? 'completed' : 'idle';
  };
  const waitingForInput = session => {
    const activity = activityByKey.get(model.key(currentScope, session));
    // Busy includes paused turns. A newer native read recovers legacy requests
    // and reloads; a read begun before an input event cannot overwrite it.
    if (!activity?.inputEventAt || input.liveStatusAt > activity.inputEventAt) {
      return !activity?.parentFinished && input.liveSessions.some(live => codexInboxOwnedBy(currentScope, live) &&
        liveMatches(session, live) && ['waiting', 'needs-input'].includes(live.status ?? live.state));
    }
    return activity.awaitingInput === true;
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
  const routeOptions = () => ({ profile: currentScope.profile, route: { ...(input.route || currentScope) } });
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
  const removeFromInbox = (session, save, feature) => {
    const isCurrent = active(session);
    const all = inboxSessions();
    const index = all.findIndex(s => model.key(currentScope, s) === model.key(currentScope, session));
    const following = [...all.slice(index + 1), ...all.slice(0, Math.max(0, index))];
    const candidates = following.filter(s => !s._codexInboxPresentationOnly && model.key(currentScope, s) !== model.key(currentScope, session) && !model.isSettled(currentScope, s) && !model.isSnoozed(currentScope, s));
    if (!save()) { if (model.error) onFeatureFailed(feature, 'storage_write'); return false; }
    onFeatureUsed(feature);
    if (isCurrent) {
      if (candidates.length) open(candidates[0]);
      else host.newChat?.({ ...currentScope });
    }
    requestRender();
    return true;
  };
  const captureScope = () => ({ ...(input.route || currentScope), _codexInboxGeneration: ownerSnapshots ? input.ownerGeneration : singleGeneration });
  const sameScope = scope => ownerSnapshots ? !!withinOwner(scope, () => true, true) :
    JSON.stringify(codexInboxScope(scope)) === JSON.stringify(codexInboxScope(currentScope)) &&
    (!scope?._codexInboxGeneration || scope._codexInboxGeneration === singleGeneration && codexInboxRouteKey(scope) === codexInboxRouteKey(input.route || currentScope));
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
    if (!model.unsettle(item.scope, item.session)) { if (model.error) onFeatureFailed('restore', 'storage_write'); requestRender(); return false; }
    onFeatureUsed('restore');
    clearSettleNotice(item); requestRender(); return true;
  };
  const settle = session => {
    if (disposed || !on || !currentScope || input.liveSnapshotComplete === false || !codexInboxOwnedBy(currentScope, session)) return false;
    const fresh = findSession(codexInboxId(session));
    if (!fresh || codexInboxId(fresh) !== codexInboxId(session) || !admission.isEligible(currentScope, fresh) ||
        model.isSettled(currentScope, fresh) || model.isSnoozed(currentScope, fresh)) return false;
    if (ownerSnapshots && (input.loading || input.error || input.liveStatusKnown !== true || safety(fresh) === 'unknown')) return false;
    const scope = captureScope();
    const result = removeFromInbox(fresh, () => {
      if (!model.settle(scope, fresh, { manual: true })) return false;
      const key = model.key(scope, fresh);
      clearSettleNotices();
      const captured = { id: codexInboxId(fresh), ...codexInboxScope(scope) };
      if (fresh._lineage_root_id) captured._lineage_root_id = fresh._lineage_root_id;
      if (Array.isArray(fresh._lineage_ids)) captured._lineage_ids = [...fresh._lineage_ids];
      const item = { key, scope, session: captured, until: Date.now() + 3000, timer: null };
      settleNotices.set(key, item);
      item.timer = timerHost.setTimeout(() => { clearSettleNotice(item); requestRender(); }, 3000);
      return true;
    }, 'settle');
    if (result) render();
    return result;
  };
  const snooze = (session, until, scope = captureScope()) => {
    if (disposed || !on || !currentScope || !sameScope(scope) || input.loading || input.error ||
        !codexInboxOwnedBy(currentScope, session) || model.isSettled(currentScope, session)) return false;
    const fresh = findSession(codexInboxId(session));
    if (!fresh || model.isSettled(currentScope, fresh) || model.isSnoozed(currentScope, fresh)) return false;
    return removeFromInbox(fresh, () => model.snooze(currentScope, fresh, until), 'snooze');
  };
  const cancelSnooze = (session, scope = captureScope()) => {
    if (disposed || !on || !currentScope || !sameScope(scope) || !codexInboxOwnedBy(currentScope, session)) return false;
    const fresh = findSession(codexInboxId(session));
    const wasSnoozed = fresh && model.isSnoozed(currentScope, fresh);
    const restored = fresh ? model.cancelSnooze(currentScope, fresh) : false;
    if (wasSnoozed && restored) onFeatureUsed('restore');
    else if (wasSnoozed && model.error) onFeatureFailed('restore', 'storage_write');
    return restored;
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
    return !disposed && on && binding?.row === row && row.isConnected && sameScope(binding.scope)
      ? withinOwner(binding.scope, () => { const fresh = findSession(binding.id); return fresh && admission.isEligible(currentScope, fresh) ? fresh : null; }, true) : null;
  };
  const showSnoozePopup = (session, anchor, event) => {
    if (disposed || !on || !currentScope || input.loading || input.error ||
        model.isSnoozed(currentScope, session) || model.isSettled(currentScope, session)) return;
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
    const item = { element, anchor, id: codexInboxId(session), scope: captureScope() };
    snoozePopup = item; anchor.setAttribute('aria-expanded', 'true');
    const choose = option => {
      return withinOwner(item.scope, () => {
      if (snoozePopup !== item || !sameScope(item.scope) || disposed || !on) return;
      const fresh = findSession(item.id);
      if (fresh && model.isSnoozed(item.scope, fresh)) { closeSnoozePopup(false); return; }
      const until = codexInboxSnoozeOptions().find(next => next.id === option.id).until;
      try {
        if (fresh && snooze(fresh, until, item.scope)) closeSnoozePopup(false);
        // A failed save keeps this exact menu open. Errors paint in the Inbox.
        else requestRender();
      } finally {
        // Navigation may throw after a verified save; the row now stays mounted
        // in Snoozed, so disconnection can no longer dismiss its old menu.
        if (fresh && !model.error && model.snoozedUntil(item.scope, fresh) === until) closeSnoozePopup(false);
      }
      }, true);
    };
    const controls = [];
    for (const preset of codexInboxSnoozeOptions()) {
      const option = button('', event => { stop(event); choose(preset); });
      const label = doc.createElement('span'); label.textContent = preset.label;
      const indicator = doc.createElement('span'); indicator.textContent = preset.indicator;
      indicator.setAttribute('data-codex-inbox-snooze-indicator', '');
      option.append(label, indicator);
      option.setAttribute('role', 'menuitem'); option.tabIndex = -1;
      option.addEventListener('pointermove', () => {
        if (snoozePopup === item && doc.activeElement !== option) option.focus({ preventScroll: true });
      });
      controls.push(option); element.appendChild(option);
    }
    item.position = () => {
      const rect = anchor.getBoundingClientRect();
      const view = doc.defaultView, width = Math.min(240, Math.max(0, view.innerWidth - 16));
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
    workingShelfOpen = false;
    snoozedShelfOpen = false;
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
    // The host conditionally mounts direct content bodies for Pinned/Sessions.
    // Keep the bottom layout when both are closed, without copying React state.
    const topLayout = `html[data-codex-chat-look='true']:not([data-codex-floating-sidebar='off']) [data-sessions-mode]:is(
  :has(> [data-codex-inbox-owned='island'] + [data-slot='sidebar-group'] > [data-slot='sidebar-group-content']),
  :has(> [data-codex-inbox-owned='island'] + [data-slot='sidebar-group'] + [data-slot='sidebar-group'] > [data-slot='sidebar-group-content'])
)`;
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

/* Expanded native lists follow the content-sized Inbox; closed lists retain
   the original bottom layout. Leave native nodes and scroll owners intact. */
${topLayout} { justify-content:flex-start!important; }
${topLayout} > [data-codex-inbox-owned='island'] { box-sizing:border-box; flex:0 1 auto!important; min-height:0!important; max-height:max(35%,4rem); }
${topLayout} > [data-codex-inbox-owned='island'] > [data-slot='sidebar-group-content'] { flex:0 1 auto!important; }
${topLayout} > [data-codex-inbox-owned='island'] + [data-slot='sidebar-group'] { margin-top:0!important; }

${topLayout} > [data-slot='sidebar-group'][class~='flex-1']:not([data-codex-inbox-owned]):has(> [data-slot='sidebar-group-content']) { flex:1 1 0!important; max-height:none!important; }

html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)) { color:inherit; background:transparent; border:0; cursor:pointer; }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)):not([data-codex-inbox-header]):hover { background:var(--ui-control-hover-background); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)):focus-visible { outline:1px solid var(--ui-accent); }
html[data-codex-chat-look='true'] [data-codex-inbox-owned] button:not(:where([data-codex-inbox-row-ui] button)):disabled { color:var(--ui-text-quaternary); cursor:default; }
html[data-codex-chat-look='true'] [data-codex-inbox-snooze-popup] { position:fixed; z-index:var(--z-modal-popover, 140); box-sizing:border-box; display:flex; flex-direction:column; padding:4px; max-height:calc(100vh - 16px); overflow:auto; border:1px solid var(--ui-stroke-secondary); border-radius:8px; background:color-mix(in srgb, var(--ui-bg-elevated) 96%, transparent); color:var(--ui-text-primary); font:12px var(--font-sans, system-ui); backdrop-filter:blur(12px); }
html[data-codex-chat-look='true'] [data-codex-inbox-snooze-popup] button { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:4px 8px; text-align:left; border-radius:6px; font:inherit; line-height:16px; }
html[data-codex-chat-look='true'] [data-codex-inbox-snooze-indicator] { margin-left:auto; text-align:right; white-space:nowrap; color:var(--ui-text-tertiary,var(--ui-text-secondary)); }
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
        const scope = captureScope();
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
          const scope = captureScope();
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
    const sessions = projectedSessions().filter(s => !withSession(s, () => model.isSettled(currentScope, s)));
    const snoozed = sessions.filter(s => withSession(s, () => model.isSnoozed(currentScope, s)));
    const snoozedKeys = new Set(snoozed.map(sessionKey));
    const workStates = new Map(sessions.map(s => [sessionKey(s), withSession(s, () => workState(s))]));
    const working = sessions.filter(s => !snoozedKeys.has(sessionKey(s)) && workStates.get(sessionKey(s)) === 'working');
    const workingKeys = new Set(working.map(sessionKey));
    const shown = sessions.filter(s => !workingKeys.has(sessionKey(s)) && !snoozedKeys.has(sessionKey(s)));
    const nextSignature = JSON.stringify([currentScope, inboxOpen, workingShelfOpen, snoozedShelfOpen, [...snoozedKeys], input.loading, !!input.error, model.error, admission.error, headerTemplate.fingerprint,
      [...settleNotices.values()].map(item => [item.key, item.until]), sessions.length, sessions.map(s => [sessionKey(s), codexInboxId(s), s.title, withSession(s, () => safety(s)), workStates.get(sessionKey(s)), withSession(s, () => active(s)), activityByKey.get(sessionKey(s))?.children.size || 0, s._codexInboxAppearance]), host.state?.connectionId?.get?.(), host.state?.profile?.get?.()]);
    if (signature !== nextSignature) {
      signature = nextSignature;
      setAttr(island, 'data-codex-inbox-expanded', inboxOpen);
      const focusedElement = island.contains(doc.activeElement) ? doc.activeElement : null;
      const focusedHeader = focusedElement?.hasAttribute('data-codex-inbox-header');
      const oldHeader = island.querySelector('[data-codex-inbox-header]');
      const scrollTop = island.querySelector('[data-slot="sidebar-group-content"]')?.scrollTop || 0;
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
      // Selection/title updates must not detach working rows and restart their
      // CSS animation. Keep their content owner mounted between projections.
      if (!reuseHeader) oldHeader?.parentElement?.remove();
      if (wrapper.parentElement !== island) island.insertBefore(wrapper, island.firstChild);
      let content = island.querySelector('[data-slot="sidebar-group-content"]');
      if (!content) {
        content = doc.createElement('div'); content.setAttribute('data-slot', 'sidebar-group-content'); content.className = 'w-full text-sm scrollbar-fade';
        island.appendChild(content);
      }
      content.hidden = !inboxOpen;
      for (const child of [...content.children]) if (!child.matches('[data-codex-inbox-row], [data-codex-inbox-working-toggle], [data-codex-inbox-working-rows], [data-codex-inbox-snoozed-toggle], [data-codex-inbox-snoozed-rows]')) child.remove();
      let shelfToggle = content.querySelector('[data-codex-inbox-working-toggle]');
      let shelfRows = content.querySelector('[data-codex-inbox-working-rows]');
      if (!shelfToggle) {
        shelfToggle = button('', event => {
          stop(event);
          if (disposed || !on || shelfToggle.hidden || !shelfToggle.isConnected || !island?.contains(shelfToggle)) return;
          workingShelfOpen = !workingShelfOpen; requestRender();
        });
        shelfToggle.setAttribute('data-codex-inbox-working-toggle', '');
        shelfToggle.setAttribute('aria-controls', 'codex-inbox-working-rows');
        shelfToggle.style.cssText = 'display:block;width:100%;padding:6px 8px;background:transparent;text-align:left;font:inherit;font-size:11px;line-height:16px;font-weight:400;color:var(--ui-text-tertiary);cursor:pointer';
        shelfRows = doc.createElement('div');
        shelfRows.id = 'codex-inbox-working-rows'; shelfRows.setAttribute('data-codex-inbox-working-rows', '');
        content.append(shelfToggle, shelfRows);
      }
      shelfToggle.textContent = `Working ${working.length}`;
      shelfToggle.hidden = !working.length;
      // The inline display value must not override the native hidden contract.
      shelfToggle.style.display = working.length ? 'block' : 'none';
      shelfToggle.setAttribute('aria-expanded', String(workingShelfOpen));
      shelfRows.hidden = !working.length || !workingShelfOpen;
      let snoozedToggle = content.querySelector('[data-codex-inbox-snoozed-toggle]');
      let snoozedRows = content.querySelector('[data-codex-inbox-snoozed-rows]');
      if (!snoozedToggle) {
        snoozedToggle = button('', event => {
          stop(event);
          if (disposed || !on || snoozedToggle.hidden || !snoozedToggle.isConnected || !island?.contains(snoozedToggle)) return;
          snoozedShelfOpen = !snoozedShelfOpen; requestRender();
        });
        snoozedToggle.setAttribute('data-codex-inbox-snoozed-toggle', '');
        snoozedToggle.setAttribute('aria-controls', 'codex-inbox-snoozed-rows');
        snoozedToggle.style.cssText = shelfToggle.style.cssText;
        snoozedRows = doc.createElement('div');
        snoozedRows.id = 'codex-inbox-snoozed-rows'; snoozedRows.setAttribute('data-codex-inbox-snoozed-rows', '');
        content.append(snoozedToggle, snoozedRows);
      }
      snoozedToggle.textContent = `Snoozed ${snoozed.length}`;
      snoozedToggle.hidden = !snoozed.length;
      snoozedToggle.style.display = snoozed.length ? 'block' : 'none';
      snoozedToggle.setAttribute('aria-expanded', String(snoozedShelfOpen));
      snoozedRows.hidden = !snoozed.length || !snoozedShelfOpen;
      const place = (node, parent, before) => {
        if (node === before) return;
        if (node.isConnected && typeof parent.moveBefore === 'function') parent.moveBefore(node, before);
        else parent.insertBefore(node, before);
      };
      const status = text => { const el = doc.createElement('div'); el.setAttribute('data-codex-inbox-status', ''); el.setAttribute('role', 'status'); el.textContent = text; content.appendChild(el); };

      if (model.error) status(model.error);
      if (admission.error) status(admission.error);
      if (!input.loading && !input.error && !model.error && !admission.error && !sessions.length) status('Inbox is clear. Settled and snoozed threads remain in Sessions and Pinned.');
      const kept = new Set();
      let cursor = content.firstChild;
      let workingCursor, snoozedCursor, lastMainRow = null;
      for (const session of [...shown, ...working, ...snoozed]) {
        const key = sessionKey(session);
        if (kept.has(key)) continue;
        kept.add(key);
        let binding = rowBindings.get(key);
        if (!binding) {
          const ui = createCodexInboxRowUI({
            document: doc,
            onOpen: () => { const fresh = rowSession(ui.row); if (fresh) withSession(fresh, () => open(fresh), true); },
            onMenu: event => { stop(event); const fresh = rowSession(ui.row); if (fresh) withSession(fresh, () => {
              if (ui.menu.hasAttribute('data-codex-inbox-cancel-snooze')) cancelSnooze(fresh); else settle(fresh);
            }, true); },
            onSnooze: event => { stop(event); const fresh = rowSession(ui.row); if (fresh) withSession(fresh, () => { if (!model.isSnoozed(currentScope, fresh)) showSnoozePopup(fresh, ui.clock, event); }, true); }
          });
          ui.row.setAttribute('data-codex-inbox-key', key);

          ui.clock.setAttribute('aria-haspopup', 'menu'); ui.clock.setAttribute('aria-expanded', 'false');
          binding = { ...ui, action: ui.menu }; rowBindings.set(key, binding);
        }
        binding.id = codexInboxId(session); binding.scope = { ...(session._codexInboxRoute || captureScope()) };
        if (!session._codexInboxPresentationOnly) binding.presentationState = workStates.get(key);
        const { row, clock, action } = binding;
        setAttr(row, 'data-codex-inbox-row', binding.id);
        setAttr(row, 'data-codex-inbox-metadata-pending', !!session._codexInboxPresentationOnly);
        setAttr(row, 'data-codex-inbox-active-children', activityByKey.get(key)?.children.size || 0);
        const title = typeof session.title === 'string' && session.title ? session.title : 'Untitled thread';
        binding.update({
          title, selected: withSession(session, () => active(session)), settleAction: true, cancelSnoozeAction: snoozedKeys.has(key), workState: workStates.get(key),
          profileAppearance: session._codexInboxAppearance,
          foreignProfile: !!ownerSnapshots && (binding.scope.connectionId !== host.state?.connectionId?.get?.() || binding.scope.profile !== host.state?.profile?.get?.()),
          snoozeDisabled: !!session._codexInboxPresentationOnly || snoozedKeys.has(key) || !!withSession(session, () => input.loading || input.error || input.routeAvailable === false),
          menuDisabled: !!session._codexInboxPresentationOnly || !!ownerSnapshots && !!withSession(session, () => input.routeAvailable === false || !snoozedKeys.has(key) && (input.loading || input.error || input.liveStatusKnown !== true || safety(session) === 'unknown')),
          menuLabel: `${snoozedKeys.has(key) ? 'Cancel snooze for' : 'Settle'} ${title}`,
          menuTitle: snoozedKeys.has(key) ? 'Cancel snooze. Return to Inbox or Working. Work continues.' : 'Remove from Inbox only. Work continues.'
        });
        setAttr(clock, 'aria-label', `Snooze ${title}`);
        // Opening stays enabled as before; Snooze does not depend on work status.
        if (clock.title !== 'Hide from Inbox for a chosen duration. Work continues.') clock.title = 'Hide from Inbox for a chosen duration. Work continues.';
        if (snoozedKeys.has(key)) {
          if (snoozedCursor === undefined) snoozedCursor = snoozedRows.firstChild;
          place(row, snoozedRows, snoozedCursor); snoozedCursor = row.nextSibling;
        } else if (workingKeys.has(key)) {
          if (workingCursor === undefined) workingCursor = shelfRows.firstChild;
          place(row, shelfRows, workingCursor); workingCursor = row.nextSibling;
        } else {
          place(row, content, cursor); cursor = row.nextSibling; lastMainRow = row;
        }
      }
      place(shelfToggle, content, lastMainRow ? lastMainRow.nextSibling : content.firstChild);
      place(shelfRows, content, shelfToggle.nextSibling);
      place(snoozedToggle, content, shelfRows.nextSibling);
      place(snoozedRows, content, snoozedToggle.nextSibling);
      for (const item of settleNotices.values()) {
        const notice = doc.createElement('div');
        notice.setAttribute('data-codex-inbox-settle-notice', codexInboxId(item.session)); notice.setAttribute('role', 'status');
        const label = doc.createElement('span'); label.textContent = 'Settled';
        const undo = button('Undo', event => { stop(event); if (undo.isConnected && island?.contains(undo)) withinOwner(item.scope, () => undoSettle(item), true); });
        const track = doc.createElement('span'); track.setAttribute('data-codex-inbox-undo-track', ''); track.setAttribute('aria-hidden', 'true');
        const progress = doc.createElement('span'); progress.setAttribute('data-codex-inbox-undo-progress', '');
        // A metadata repaint must not restart the visual deadline.
        progress.style.animationDelay = `-${Math.max(0, 3000 - (item.until - Date.now()))}ms`;
        track.appendChild(progress); notice.append(label, undo, track); content.appendChild(notice);
      }
      for (const [key, binding] of rowBindings) if (!kept.has(key)) { binding.row.remove(); rowBindings.delete(key); }
      if (snoozePopup && (!snoozePopup.anchor.isConnected || model.isSnoozed(snoozePopup.scope, snoozePopup.id))) closeSnoozePopup(false);

      content.scrollTop = scrollTop;
      if (focusedElement?.isConnected) focusedElement.focus({ preventScroll: true });
      else if (focusedHeader) header.focus();
      if (snoozePopup) snoozePopup.position();
    }
    if (!ownerSnapshots) renderBadges(root);
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
    resetOwners() {
      ownerSnapshots = null;
      ownerSnapshotSources.clear();
      singleGeneration = Symbol('Inbox owner');
      cleanupDOM(); activityByKey.clear(); currentScope = null;
    },
    updateOwners(snapshots) {
      if (disposed) return;
      const next = new Map(), sources = new Map(), changed = [];
      for (const snapshot of snapshots) {
        const scope = codexInboxStateScope(snapshot.route || snapshot.scope);
        if (!scope) continue;
        const previous = ownerSnapshots?.get(ownerKey(scope));
        sources.set(ownerKey(scope), snapshot);
        if (previous && ownerSnapshotSources.get(ownerKey(scope)) === snapshot) {
          next.set(ownerKey(scope), previous);
          continue;
        }
        const ownerGeneration = snapshot.ownerGeneration || (previous && codexInboxRouteKey(previous.route) === codexInboxRouteKey(snapshot.route) ? previous.ownerGeneration : Symbol('Inbox owner'));
        next.set(ownerKey(scope), { ...snapshot, scope, ownerGeneration,
          retainedSessions: (snapshot.retainedSessions || []).filter(session => codexInboxOwnedBy(scope, session)).map(session => ({ ...session,
            _codexInboxPresentationOnly: true, _codexInboxRoute: { ...snapshot.route, _codexInboxGeneration: ownerGeneration }, _codexInboxAppearance: snapshot.appearance })),
          sessions: (snapshot.sessions || []).filter(session => codexInboxOwnedBy(scope, session)).map(session => ({ ...session,
            _codexInboxRoute: { ...snapshot.route, _codexInboxGeneration: ownerGeneration }, _codexInboxAppearance: snapshot.appearance })) });
        changed.push(next.get(ownerKey(scope)));
      }
      ownerSnapshots = next;
      ownerSnapshotSources = sources;
      // Invalidate before queued paint: retained handlers cannot see a new owner.
      if (snoozePopup && !sameScope(snoozePopup.scope)) closeSnoozePopup(false);
      for (const item of settleNotices.values()) if (!sameScope(item.scope)) clearSettleNotice(item);
      for (const [key, binding] of rowBindings) {
        const snapshot = next.get(ownerKey(binding.scope));
        if (!snapshot || codexInboxRouteKey(binding.scope) !== codexInboxRouteKey(snapshot.route) || binding.scope._codexInboxGeneration !== snapshot.ownerGeneration) {
          binding.row.remove(); rowBindings.delete(key);
        }
      }
      currentScope = { connectionId: String(host.state?.connectionId?.get?.() || ''), profile: String(host.state?.profile?.get?.() || 'default') };
      input = { sessions: [], liveSessions: [], loading: !snapshots.length, error: snapshots.some(snapshot => snapshot.error) ? 'Partial Inbox read' : null };
      for (const snapshot of changed) withinOwner(snapshot.scope, () => {
        reconcileAdmission(); reconcileActivity(); reconcileChildActivity();
      });
      refreshDeadline(); requestRender();
    },
    opened() {
      // Native navigation and metadata discovery are not attention decisions.
      return false;
    },
    update(next) {
      if (disposed) return;
      const scope = codexInboxStateScope(next.route || next.scope);
      if (JSON.stringify(scope) !== JSON.stringify(currentScope)) { singleGeneration = Symbol('Inbox owner'); cleanupDOM(); activityByKey.clear(); inboxOpen = true; }
      currentScope = scope;
      input = { ...next, sessions: Array.isArray(next.sessions) ? next.sessions : [], liveSessions: Array.isArray(next.liveSessions) ? next.liveSessions : [],
        childSnapshots: Array.isArray(next.childSnapshots) ? next.childSnapshots : [], liveStatusKnown: next.liveStatusKnown ?? Array.isArray(next.liveSessions) };
      if (input.route?.targetProfile) input.sessions = input.sessions.map(session => ({ ...session, _codexInboxRoute: captureScope() }));
      input.retainedSessions = (next.retainedSessions || []).map(session => ({ ...session, _codexInboxPresentationOnly: true, _codexInboxRoute: captureScope() }));
      if (scope && on) { reconcileAdmission(); reconcileActivity(); reconcileChildActivity(); }
      refreshDeadline(); requestRender();
    },
    // Positive work/input events only. Callers must supply authoritative scope and ID.
    // Background reads/resuming and explicit UI opens do nothing.
    reactivate(event) {
      if (disposed || !on || !currentScope || !event || !codexInboxOwnedBy(currentScope, event) || JSON.stringify(codexInboxScope(event.scope)) !== JSON.stringify(codexInboxScope(currentScope))) return false;
      if (!['work', 'input', 'busy'].includes(event.type) && codexInboxWorkStatus(event) !== 'work') return false;
      const session = eventSession(event);
      if (!session || input.loading || input.error || input.liveStatusKnown !== true ||
          !admission.observe(currentScope, input.sessions, { workingSessions: [session] }) || !admission.isEligible(currentScope, session)) { requestRender(); return false; }
      if (model.isManualSettled(currentScope, session) && !model.unsettle(currentScope, session)) { requestRender(); return false; }
      model.recordReply(currentScope, session, 'none');
      const key = model.key(currentScope, session), previous = activityByKey.get(key);
      activityByKey.set(key, { ...previous, phase: 'working', parentFinished: false, at: Date.now(), children: previous?.children || new Set(),
        ...(event.type === 'input' ? { awaitingInput: true, inputEventAt: Date.now() } : {}) });
      const result = model.ingest(currentScope, [session], { liveSessions: [{ ...session, status: 'working' }] });
      requestRender(); return result;
    },
    activity(event) {
      if (disposed || !on || !currentScope || !event || event.replayed || !codexInboxOwnedBy(currentScope, event) ||
          !sameScope(event.scope || { connectionId: event.connectionId, profile: event.profile })) return false;
      const session = eventSession(event);
      if (!session) return false;
      if (['clarify.request', 'approval.request'].includes(event.type)) {
        const promptId = event.payload?.prompt_id ?? event.payload?.request_id;
        if (typeof promptId !== 'string' || !promptId) return false;
        const key = model.key(currentScope, session), previous = activityByKey.get(key);
        const pendingInputs = new Set(waitingForInput(session) ? previous?.pendingInputs || [] : []);
        pendingInputs.add(promptId);
        if (!api.reactivate({ type: 'input', scope: captureScope(), canonicalSessionId: codexInboxId(session) })) return false;
        activityByKey.set(key, { ...activityByKey.get(key), pendingInputs });
        requestRender(); return true;
      }
      if (['clarify.settled', 'approval.settled'].includes(event.type)) {
        const promptId = event.payload?.prompt_id ?? event.payload?.request_id;
        const key = model.key(currentScope, session), previous = activityByKey.get(key);
        if (typeof promptId !== 'string' || !previous?.pendingInputs?.has(promptId)) return false;
        const pendingInputs = new Set(previous.pendingInputs); pendingInputs.delete(promptId);
        activityByKey.set(key, { ...previous, pendingInputs, awaitingInput: pendingInputs.size > 0, inputEventAt: Date.now() });
        requestRender(); return true;
      }
      if (['message.start', 'tool.start'].includes(event.type)) {
        if (event.type === 'tool.start' && model.isManualSettled(currentScope, session)) return false;
        if (event.type === 'message.start') {
          const key = model.key(currentScope, session), previous = activityByKey.get(key);
          if (previous) activityByKey.set(key, { ...previous, awaitingInput: false, pendingInputs: new Set(), inputEventAt: Date.now() });
        }
        return api.reactivate({ type: 'work', scope: captureScope(), session_id: codexInboxId(session), canonicalSessionId: codexInboxId(session) });
      }
      const key = model.key(currentScope, session), previous = activityByKey.get(key);
      if (event.type === 'message.complete' && (previous?.phase || model.replyState(currentScope, session)) === 'read') return false;
      const activity = { ...previous, phase: previous?.phase || model.replyState(currentScope, session) || 'unknown', at: previous?.at || 0,
        children: new Set(previous?.children || []), pendingChildren: new Set(previous?.pendingChildren || []),
        terminalChildren: new Set(previous?.terminalChildren || []) };
      if (['subagent.spawn_requested', 'subagent.start', 'subagent.complete'].includes(event.type)) {
        const child = event.payload?.subagent_id;
        if (typeof child !== 'string' || !child) return false;
        if (event.type === 'subagent.complete') {
          if (activity.terminalChildren.has(child) && !activity.children.has(child) && !activity.pendingChildren.has(child)) return true;
          activity.children.delete(child); activity.pendingChildren.delete(child);
          // Native completion is emitted before registry removal. Even a newer
          // roster cannot revive this ID; only another proved spawn/start can.
          // Cap per-thread terminal IDs without evicting safety evidence: on
          // overflow, snapshots may sustain known children but not add IDs.
          if (activity.terminalChildren.size < 256) activity.terminalChildren.add(child);
          else activity.terminalChildrenOverflow = true;
        } else {
          activity.terminalChildren.delete(child);
          if (event.type === 'subagent.spawn_requested') activity.pendingChildren.add(child);
          else activity.pendingChildren.delete(child);
          activity.children.add(child);
        }
        activity.childEventAt = Date.now();
      } else if (event.type === 'message.complete') {
        activity.phase = activity.children.size ? 'unknown' : event.payload?.status === 'complete' && !event.payload.error ? 'completed' : 'unknown';
        activity.parentFinished = true; activity.at = Date.now();
      } else if (event.type === 'error') { activity.phase = 'unknown'; activity.parentFinished = true; activity.at = Date.now(); }
      else return false;
      if (['message.complete', 'error'].includes(event.type)) {
        model.recordReply(currentScope, session, activity.phase === 'completed' ? 'completed' : 'none');
        activity.awaitingInput = false; activity.pendingInputs = new Set(); activity.inputEventAt = Date.now();
      }
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
      if (on === !!value) return true;
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
  // Public callbacks may outlive a render. Re-enter only their exact retained
  // owner projection; a colliding id never borrows the selected profile.
  for (const name of ['activity', 'reactivate']) {
    const apply = api[name];
    api[name] = event => withinOwner(event?.scope || { connectionId: event?.connectionId, profile: event?.profile }, () => apply(event), true) ?? false;
  }
  for (const name of ['snooze', 'cancelSnooze']) {
    const apply = api[name];
    api[name] = (session, ...args) => {
      if (!ownerSnapshots && input.route?.targetProfile && !session?._codexInboxRoute?._codexInboxGeneration) return false;
      return withSession(session, () => apply(session, ...args), true) ?? false;
    };
  }
  doc[registryKey] = api.dispose;
  refreshDeadline(); requestRender();
  return api;
}
// END GENERATED INBOX RUNTIME
// BEGIN GENERATED T3 THEMES RUNTIME
// Paint bridge for the pinned T3 web semantic roles, not Hermes' derived
// accent/foreground mixtures. Provenance: docs/t3-themes-provenance.md.
// Native theme registration keeps its hex adapters; this CSS preserves the web's
// raw OKLCH values, alpha, and color-mix space at paint time.
const ZINC = {
  25: 'oklch(0.992 0 0)', 50: 'oklch(0.985 0 0)',
  100: 'oklch(0.967 0.001 286.375)', 200: 'oklch(0.92 0.004 286.32)',
  300: 'oklch(0.871 0.006 286.286)', 500: 'oklch(0.552 0.016 285.938)',
  800: 'oklch(0.274 0.006 286.033)', 900: 'oklch(0.21 0.006 285.885)'
}
const RED = 'oklch(0.637 0.237 25.331)'
const RAISED = 'color-mix(in srgb, oklch(0.145 0 0) 97%, #fff)'
// index.css :root / @variant dark / [data-app-sidebar] are the actual standard
// web theme. The shared/mobile standard palette is NOT its paint oracle.
const T3_WEB_DEFAULT_PAINT = {
  light: {
    canvas: ZINC[25], chrome: ZINC[25], toolbar: ZINC[25],
    surface: '#ffffff', surfaceOverlay: '#ffffff', surfaceRaised: 'rgb(255 255 255 / 20%)',
    text: ZINC[900], textMuted: ZINC[500], muted: ZINC[50], mutedForeground: ZINC[500],
    secondaryLabel: ZINC[500], iconMuted: ZINC[500], placeholder: ZINC[500],
    border: ZINC[200], input: ZINC[300], focus: 'oklch(0.488 0.217 264)',
    messageAction: 'oklch(0.488 0.217 264)', messageActionForeground: '#ffffff',
    messageActionHover: `color-mix(in srgb, oklch(0.488 0.217 264) 90%, ${ZINC[25]})`,
    secondary: ZINC[50], secondaryForeground: ZINC[800],
    accentSurface: ZINC[100], accentSurfaceForeground: ZINC[900],
    messageSurface: `color-mix(in srgb, ${ZINC[200]} 55%, ${ZINC[100]})`, messageForeground: ZINC[900],
    error: RED, errorForeground: 'oklch(0.505 0.213 27.518)',
    errorSurface: `color-mix(in srgb, ${RED} 8%, transparent)`,
    warning: 'oklch(0.769 0.188 70.08)', warningForeground: 'oklch(0.555 0.163 48.998)',
    warningSurface: 'color-mix(in srgb, oklch(0.769 0.188 70.08) 8%, transparent)',
    update: 'oklch(0.488 0.217 264)', updateForeground: 'oklch(0.488 0.217 264)',
    toolbarForeground: ZINC[900], toolbarBorder: ZINC[200], toolbarControl: '#ffffff', toolbarControlForeground: ZINC[900], toolbarControlHover: ZINC[100],
    terminalBackground: ZINC[25], terminalForeground: ZINC[900], terminalCursor: 'rgb(38 56 78)', terminalSelection: 'rgb(37 63 99 / 20%)',
    sidebar: ZINC[50], sidebarForeground: ZINC[900], sidebarMutedForeground: ZINC[500],
    sidebarControlSurface: ZINC[100], sidebarRowHover: ZINC[25], sidebarRowActive: '#ffffff', sidebarRowSelected: '#ffffff', sidebarBorder: ZINC[200],
    codeBackground: `color-mix(in srgb, #fff 90%, ${ZINC[25]})`, codeForeground: ZINC[900]
  },
  dark: {
    canvas: '#000000', chrome: '#000000', toolbar: '#000000',
    surface: RAISED, surfaceOverlay: RAISED, surfaceRaised: RAISED,
    text: 'oklch(0.97 0 0)', textMuted: 'oklch(0.708 0 0)', muted: 'rgb(255 255 255 / 3%)', mutedForeground: 'oklch(0.708 0 0)',
    secondaryLabel: 'oklch(0.708 0 0)', iconMuted: 'oklch(0.708 0 0)', placeholder: 'oklch(0.708 0 0)',
    border: 'rgb(255 255 255 / 8%)', input: 'rgb(255 255 255 / 11%)', focus: 'oklch(0.571 0.21 264)',
    messageAction: 'oklch(0.571 0.21 264)', messageActionForeground: '#ffffff',
    messageActionHover: 'color-mix(in srgb, oklch(0.571 0.21 264) 90%, #000)',
    secondary: 'rgb(255 255 255 / 3%)', secondaryForeground: 'oklch(0.97 0 0)',
    accentSurface: 'rgb(255 255 255 / 4%)', accentSurfaceForeground: 'oklch(0.97 0 0)',
    messageSurface: 'color-mix(in srgb, oklch(0.145 0 0) 92%, #fff)', messageForeground: 'oklch(0.97 0 0)',
    error: `color-mix(in srgb, ${RED} 90%, #fff)`, errorForeground: 'oklch(0.704 0.191 22.216)',
    errorSurface: `color-mix(in srgb, color-mix(in srgb, ${RED} 90%, #fff) 16%, transparent)`,
    warning: 'oklch(0.769 0.188 70.08)', warningForeground: 'oklch(0.828 0.189 84.429)',
    warningSurface: 'color-mix(in srgb, oklch(0.769 0.188 70.08) 16%, transparent)',
    update: 'oklch(0.571 0.21 264)', updateForeground: 'oklch(0.707 0.165 254.624)',
    toolbarForeground: 'oklch(0.97 0 0)', toolbarBorder: 'rgb(255 255 255 / 8%)', toolbarControl: RAISED, toolbarControlForeground: 'oklch(0.97 0 0)', toolbarControlHover: 'rgb(255 255 255 / 4%)',
    terminalBackground: '#000000', terminalForeground: 'oklch(0.97 0 0)', terminalCursor: 'rgb(180 203 255)', terminalSelection: 'rgb(180 203 255 / 25%)',
    sidebar: '#000000', sidebarForeground: '#f1f3f7', sidebarMutedForeground: '#a3a3a3',
    sidebarControlSurface: '#0a0a0a', sidebarRowHover: 'rgb(241 243 247 / 8%)', sidebarRowActive: 'rgb(241 243 247 / 11%)', sidebarRowSelected: 'rgb(241 243 247 / 7%)', sidebarBorder: 'rgb(255 255 255 / 8%)',
    codeBackground: `color-mix(in srgb, ${RAISED} 90%, #000)`, codeForeground: 'oklch(0.97 0 0)'
  }
}

// One role table feeds the raw theme seeds, the native semantic surface layer,
// and the skin. No geometry, typography, theme selection, or host state writes.
const T3_PAINT_ROLE_MAP = {
  '--theme-background-seed': 'canvas', '--theme-foreground': 'text',
  '--theme-card-seed': 'surface', '--theme-elevated-seed': 'surfaceOverlay', '--theme-sidebar-seed': 'sidebar',
  '--theme-border-seed': 'border', '--theme-bubble-seed': 'messageSurface',
  '--dt-card': 'surface', '--dt-card-foreground': 'text', '--dt-popover': 'surfaceOverlay', '--dt-popover-foreground': 'text',
  '--dt-muted': 'muted', '--dt-muted-foreground': 'mutedForeground', '--dt-border': 'border', '--dt-input': 'input',
  '--dt-primary': 'messageAction', '--dt-primary-foreground': 'messageActionForeground',
  '--dt-secondary': 'secondary', '--dt-secondary-foreground': 'secondaryForeground',
  '--dt-accent': 'accentSurface', '--dt-accent-foreground': 'accentSurfaceForeground',
  '--dt-destructive': 'error', '--dt-destructive-foreground': 'errorForeground', '--dt-ring': 'focus',
  '--ui-text-primary': 'text', '--ui-text-secondary': 'secondaryLabel', '--ui-text-tertiary': 'mutedForeground', '--ui-text-quaternary': 'iconMuted',
  '--ui-icon-primary': 'text', '--ui-icon-secondary': 'iconMuted', '--ui-icon-tertiary': 'iconMuted',
  '--ui-bg-primary': 'canvas', '--ui-bg-secondary': 'surface', '--ui-bg-tertiary': 'muted', '--ui-bg-elevated': 'surfaceOverlay', '--ui-bg-sidebar': 'sidebar',
  '--ui-editor-surface-background': 'surface', '--ui-widget-surface-background': 'surfaceOverlay', '--ui-code-surface-background': 'codeBackground',
  '--ui-chat-bubble-background': 'messageSurface', '--ui-chat-bubble-foreground': 'messageForeground',
  '--ui-stroke-primary': 'border', '--ui-stroke-secondary': 'border', '--ui-stroke-tertiary': 'border',
  '--ui-control-default-background': 'secondary', '--ui-control-hover-background': 'accentSurface', '--ui-control-active-background': 'accentSurface',
  '--ui-row-hover-background': 'sidebarRowHover', '--ui-row-active-background': 'sidebarRowActive',
  '--codex-color-card': 'surface', '--codex-color-elevated': 'surfaceOverlay', '--codex-color-bubble': 'messageSurface',
  '--codex-color-text': 'text', '--codex-color-text-secondary': 'secondaryLabel', '--codex-color-text-tertiary': 'mutedForeground', '--codex-color-text-quaternary': 'iconMuted',
  '--codex-color-border': 'border', '--codex-color-border-subtle': 'border',
  '--codex-color-hover': 'sidebarRowHover', '--codex-color-active': 'sidebarRowActive',
  '--codex-color-primary': 'messageAction', '--codex-color-primary-foreground': 'messageActionForeground', '--codex-color-destructive': 'error',
  '--codex-sidebar-label': 'sidebarForeground', '--codex-sidebar-muted': 'sidebarMutedForeground', '--codex-sidebar-hover': 'sidebarRowHover', '--codex-sidebar-active': 'sidebarRowActive',
  '--dt-background': 'canvas', '--dt-foreground': 'text', '--dt-primary-solid': 'messageAction', '--dt-primary-solid-foreground': 'messageActionForeground',
  '--dt-sidebar-bg': 'sidebar', '--dt-sidebar-border': 'sidebarBorder', '--dt-composer-ring': 'border',
  '--ui-bg-chrome': 'chrome', '--ui-bg-editor': 'surface', '--ui-bg-card': 'surface', '--ui-bg-input': 'surface',
  '--ui-bg-quaternary': 'muted', '--ui-bg-quinary': 'muted', '--ui-surface-background': 'surface',
  '--ui-chat-bubble-opaque-background': 'messageSurface', '--ui-terminal-surface-background': 'terminalBackground',
  '--ui-inline-code-background': 'codeBackground', '--ui-inline-code-foreground': 'codeForeground',
  '--ui-red': 'error', '--ui-orange': 'warning', '--ui-yellow': 'warning',
  '--ui-accent': 'messageAction', '--ui-stroke-quaternary': 'border',
  '--codex-tool-label': 'secondaryLabel', '--codex-tool-icon': 'iconMuted', '--codex-activity-label': 'mutedForeground', '--codex-placeholder': 'placeholder',
  '--codex-subagent-text': 'text', '--codex-subagent-meta': 'mutedForeground', '--codex-subagent-avatar-background': 'muted'
}
const kebab = name => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
const role = name => `var(--codex-t3-${kebab(name)})`
function t3ThemePaintCSS(id, source) {
  const name = `codex-t3-${id.replace(/^t3-/, '')}`
  const themeCSS = ['light', 'dark'].map(mode => {
    const palette = { ...source[mode], ...(id === 't3-code' ? T3_WEB_DEFAULT_PAINT[mode] : {}) }
    const selector = `html[data-codex-chat-look='true'][data-hermes-theme='${name}'][data-hermes-mode='${mode}']`
    const vars = Object.entries(palette).map(([key, value]) => `--codex-t3-${kebab(key)}:${value};`)
    vars.push(...Object.entries(T3_PAINT_ROLE_MAP).map(([key, value]) => `${key}:${role(value)}!important;`))
    // ComposerSurface owns an outline independent of the general border role.
    const composerOutline = id === 't3-code'
      ? `rgb(${mode === 'dark' ? '255 255 255 / 5%' : '0 0 0 / 8%'})`
      : mode === 'light' ? role('toolbarBorder')
      : id === 't3-chat' ? '#241e28'
      : `color-mix(in srgb, ${role('input')} 30%, ${role('canvas')})`
    vars.push(`--codex-t3-composer-outline:${composerOutline};`)
    // Shell uses card only for standard light, raised glass otherwise.
    // Precompose its default 80% tint once for composer, backing and status.
    const composerSurface = id === 't3-code' && mode === 'light' ? 'surface' : 'surfaceRaised'
    vars.push(`--codex-t3-composer-fill:color-mix(in srgb, ${role(composerSurface)} 80%, ${role('canvas')});`, '--codex-composer-fill:var(--codex-t3-composer-fill);')

    const boundary = id === 't3-code' ? role('border') : id === 't3-chat' && mode === 'dark' ? role('sidebarBorder') : `color-mix(in srgb, ${role('sidebarForeground')} ${mode === 'dark' ? 8 : 10}%, transparent)`
    vars.push(`--codex-sidebar-divider:${boundary};`, `--sidebar-edge-border:${boundary};`, `--codex-shelf-divider:color-mix(in oklab, ${role('sidebarBorder')} 50%, transparent);`, `--codex-secondary-paint:${role('secondaryLabel')};`,
      '--codex-stop-foreground:#fff;',
      `--codex-subagent-avatar-border:color-mix(in oklab, ${role('border')} 70%, transparent);`,
      `--codex-subagent-hover:color-mix(in oklab, ${role('accentSurface')} 20%, transparent);`,
      `--codex-subagent-focus:color-mix(in oklab, ${role('focus')} 70%, transparent);`)
    return `${selector}{${vars.join('')}}\n${selector}:not([data-hermes-glass]){--ui-chat-surface-background:${role('canvas')};--ui-sidebar-surface-background:${role('sidebar')};--codex-color-chat:${role('canvas')};--codex-color-sidebar:${role('sidebar')};}\n${selector}:not([data-hermes-glass]),${selector}:not([data-hermes-glass]) body{background-color:${role('canvas')}!important;}\n${selector} [data-tree-group='grp-sessions']{--ui-text-primary:${role('sidebarForeground')};--ui-text-secondary:${role('sidebarMutedForeground')};--ui-text-tertiary:${role('sidebarMutedForeground')};}\n${selector} [data-slot='sidebar']{border-right-color:var(--codex-sidebar-divider)!important;}\n${selector} [data-slot='composer-rich-input']:is(:empty,[data-empty])::before{color:${role('placeholder')}!important;}\n${selector} [data-slot='composer-surface'] button[type='submit']:not(:has(> span.block.bg-current)){background:${role('messageAction')}!important;color:${role('messageActionForeground')}!important;}\n${selector} [data-slot='composer-surface'] button[type='submit']:not(:has(> span.block.bg-current)):hover{background:${role('messageActionHover')}!important;}\n`
  }).join('\n')
  // Glass keeps one body painter and transparent native surface aliases. Only
  // its sidebar stop needs the T3 sidebar role instead of the chat/chrome role.
  const field = `color-mix(in srgb, ${role('sidebar')} var(--translucency-glass-keep, 100%), transparent) var(--glass-rail-edge, 0px), var(--ui-bg-chrome) var(--glass-rail-edge, 0px)`
  const glassCSS = ['light', 'dark'].map(mode => {
    const glass = `html[data-codex-chat-look='true'][data-hermes-theme='${name}'][data-hermes-mode='${mode}'][data-hermes-glass][data-hermes-glass-scope='sidebar']`
    return `${glass} body{background-image:linear-gradient(to right, ${field});}\n${glass}[dir='rtl'] body{background-image:linear-gradient(to left, ${field});}`
  }).join('\n')
  const composerCSS = ['light', 'dark'].map(mode => `html[data-codex-chat-look='true'][data-hermes-theme='${name}'][data-hermes-mode='${mode}'] [data-slot='composer-surface']{border-color:var(--codex-t3-composer-outline)!important;}`).join('\n')
  const composerFillCSS = ['light', 'dark'].map(mode => {
    const scope = `html[data-codex-chat-look='true'][data-hermes-theme='${name}'][data-hermes-mode='${mode}']`
    return `${scope} [data-slot='composer-surface'],${scope} [data-slot='composer-surface'] > [aria-hidden='true']{--composer-fill:var(--codex-t3-composer-fill)!important;background:var(--codex-composer-fill)!important;}`
  }).join('\n') + '\n'
  return `${themeCSS}\n${glassCSS}\n${composerCSS}\n${composerFillCSS}`
}




/*
 * T3 Code semantic palettes, pinned at 6d450a4284852af137b2f3407fddd89eb76e7644.
 * Source: pingdotgg/t3code packages/shared/src/themePalettes.ts.
 * Color conversion: apps/web/src/themePalette.ts, same commit.
 * Keep this notice when embedding; see docs/t3-themes-provenance.md.
 *
 * MIT License
 * 
 * Copyright (c) 2026 T3 Tools Inc.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const T3_THEME_UPSTREAM_COMMIT = "6d450a4284852af137b2f3407fddd89eb76e7644"

// Preserve every upstream literal; native colors below are sRGB hex adapters.
const T3_SOURCE_PALETTES = {
  "t3-chat": {
    "label": "T3 Chat",
    "light": {
      "canvas": "oklch(0.982446 0.010114 325.653)",
      "chrome": "oklch(0.982446 0.010114 325.653)",
      "toolbar": "oklch(0.982446 0.010114 325.653)",
      "toolbarForeground": "oklch(0.325698 0.116116 325.037)",
      "toolbarBorder": "oklch(0.856784 0.082879 328.911)",
      "toolbarControl": "oklch(0.939552 0.024286 321.664)",
      "toolbarControlForeground": "oklch(0.325698 0.116116 325.037)",
      "toolbarControlHover": "oklch(0.884525 0.041658 337.177)",
      "surface": "oklch(0.971835 0.012884 321.894)",
      "surfaceRaised": "oklch(0.988235 0.005049 325.615)",
      "surfaceOverlay": "oklch(1 0 0)",
      "text": "oklch(0.325698 0.116116 325.037)",
      "textMuted": "oklch(0.494754 0.190937 354.544)",
      "border": "oklch(0.923531 0.021247 328.096)",
      "input": "oklch(0.851713 0.055822 336.6)",
      "focus": "oklch(0.591646 0.217985 0.584)",
      "accent": "oklch(0.591646 0.217985 0.584)",
      "accentForeground": "oklch(1 0 0)",
      "secondary": "oklch(0.869588 0.06751 334.899)",
      "secondaryForeground": "oklch(0.444777 0.134061 324.799)",
      "muted": "oklch(0.802407 0.090963 345.892)",
      "mutedForeground": "oklch(0.428932 0.163929 354.332)",
      "placeholder": "oklch(0.549927 0.090215 323.149)",
      "secondaryLabel": "oklch(0.494754 0.190937 354.544)",
      "iconMuted": "oklch(0.494754 0.190937 354.544)",
      "error": "oklch(0.627117 0.248974 7.734)",
      "errorForeground": "oklch(0.458704 0.169677 3.815)",
      "errorSurface": "oklch(0.942787 0.032076 344.963)",
      "warning": "oklch(0.76859 0.164659 70.08)",
      "warningForeground": "oklch(0.54612 0.143036 48.949)",
      "warningSurface": "oklch(0.962901 0.015297 48.56)",
      "update": "oklch(0.591646 0.217985 0.584)",
      "updateForeground": "oklch(0.494754 0.190937 354.544)",
      "updateSurface": "oklch(0.930264 0.036194 341.45)",
      "accentSurface": "oklch(0.939552 0.024286 321.664)",
      "accentSurfaceForeground": "oklch(0.396296 0.025134 285.196)",
      "messageSurface": "oklch(0.926746 0.037898 332.6)",
      "messageForeground": "oklch(0.354591 0.093575 307.568)",
      "messageAction": "oklch(0.591646 0.217985 0.584)",
      "messageActionForeground": "oklch(1 0 0)",
      "messageActionHover": "oklch(0.539042 0.197866 0.305)",
      "codeBackground": "oklch(0.953855 0.019695 315.668)",
      "codeForeground": "oklch(0.445128 0.13005 307.026)",
      "searchMatchBackground": "oklch(0.915 0.11 85)",
      "searchMatchForeground": "oklch(0.216164 0.028283 77.423)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.928886 0.031178 322.592)",
      "sidebarForeground": "oklch(0.396296 0.025134 285.196)",
      "sidebarMutedForeground": "oklch(0.494754 0.190937 354.544)",
      "sidebarControlSurface": "oklch(0.978851 0.001321 106.424)",
      "sidebarRowHover": "oklch(0.978851 0.001321 106.424)",
      "sidebarRowActive": "oklch(0.978851 0.001321 106.424)",
      "sidebarRowSelected": "oklch(0.978851 0.001321 106.424)",
      "sidebarBorder": "oklch(0.938313 0.002552 48.717)",
      "terminalBackground": "oklch(0.982446 0.010114 325.653)",
      "terminalForeground": "oklch(0.325698 0.116116 325.037)",
      "terminalCursor": "oklch(0.591646 0.217985 0.584)",
      "terminalSelection": "oklch(0.869588 0.06751 334.899)",
      "terminalScrollbar": "oklch(0.851713 0.055822 336.6)",
      "terminalScrollbarHover": "oklch(0.802407 0.090963 345.892)"
    },
    "dark": {
      "canvas": "oklch(0.22813 0.020366 307.469)",
      "chrome": "oklch(0.22813 0.020366 307.469)",
      "toolbar": "oklch(0.22813 0.020366 307.469)",
      "toolbarForeground": "oklch(0.980735 0.004092 301.426)",
      "toolbarBorder": "oklch(0.266943 0.015262 302.425)",
      "toolbarControl": "oklch(0.313674 0.030572 310.061)",
      "toolbarControlForeground": "oklch(0.848252 0.038248 307.961)",
      "toolbarControlHover": "oklch(0.364912 0.050794 308.491)",
      "surface": "oklch(0.267101 0.02016 311.799)",
      "surfaceRaised": "oklch(0.279864 0.021572 309.532)",
      "surfaceOverlay": "oklch(0.154761 0.01316 338.901)",
      "text": "oklch(0.980735 0.004092 301.426)",
      "textMuted": "oklch(0.880303 0.03077 342.696)",
      "border": "oklch(0.266943 0.015262 302.425)",
      "input": "oklch(0.266817 0.02897 344.461)",
      "focus": "oklch(0.591646 0.217985 0.584)",
      "accent": "oklch(0.460685 0.185347 4.099)",
      "accentForeground": "oklch(0.901233 0.057189 343.694)",
      "secondary": "oklch(0.313674 0.030572 310.061)",
      "secondaryForeground": "oklch(0.848252 0.038248 307.961)",
      "muted": "oklch(0.360924 0.021469 316.83)",
      "mutedForeground": "oklch(0.880303 0.03077 342.696)",
      "placeholder": "oklch(0.657087 0.028226 307.985)",
      "secondaryLabel": "oklch(0.880303 0.03077 342.696)",
      "iconMuted": "oklch(0.848252 0.038248 307.961)",
      "error": "oklch(0.458704 0.169677 3.815)",
      "errorForeground": "oklch(0.901233 0.057189 343.694)",
      "errorSurface": "oklch(0.259022 0.04799 340.062)",
      "warning": "oklch(0.76859 0.164659 70.08)",
      "warningForeground": "oklch(0.836861 0.164422 84.429)",
      "warningSurface": "oklch(0.321706 0.036256 60.806)",
      "update": "oklch(0.460685 0.185347 4.099)",
      "updateForeground": "oklch(0.901233 0.057189 343.694)",
      "updateSurface": "oklch(0.256077 0.063004 342.914)",
      "accentSurface": "oklch(0.364912 0.050794 308.491)",
      "accentSurfaceForeground": "oklch(0.964695 0.009139 341.803)",
      "messageSurface": "oklch(0.273791 0.025541 309.079)",
      "messageForeground": "oklch(0.949872 0.021269 306.838)",
      "messageAction": "oklch(0.460685 0.185347 4.099)",
      "messageActionForeground": "oklch(0.901233 0.057189 343.694)",
      "messageActionHover": "oklch(0.458754 0.184639 3.857)",
      "codeBackground": "oklch(0.22813 0.020366 307.469)",
      "codeForeground": "oklch(0.848703 0.064239 306.645)",
      "searchMatchBackground": "oklch(0.55 0.1 85)",
      "searchMatchForeground": "oklch(0.970151 0 0)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.185778 0.019368 322.159)",
      "sidebarForeground": "oklch(0.967434 0.001326 286.375)",
      "sidebarMutedForeground": "oklch(0.880303 0.03077 342.696)",
      "sidebarControlSurface": "oklch(0.23366 0.026081 338.196)",
      "sidebarRowHover": "oklch(0.23366 0.026081 338.196)",
      "sidebarRowActive": "oklch(0.23366 0.026081 338.196)",
      "sidebarRowSelected": "oklch(0.23366 0.026081 338.196)",
      "sidebarBorder": "oklch(0.269132 0.030766 351.067)",
      "terminalBackground": "oklch(0.22813 0.020366 307.469)",
      "terminalForeground": "oklch(0.980735 0.004092 301.426)",
      "terminalCursor": "oklch(0.591646 0.217985 0.584)",
      "terminalSelection": "oklch(0.313674 0.030572 310.061)",
      "terminalScrollbar": "oklch(0.266817 0.02897 344.461)",
      "terminalScrollbarHover": "oklch(0.360924 0.021469 316.83)"
    }
  },
  "t3-code": {
    "label": "T3 Code",
    "light": {
      "searchMatchBackground": "#ffde8b",
      "searchMatchForeground": "#21180a",
      "searchMatchActiveBackground": "#eea52b",
      "searchMatchActiveForeground": "#21180a",
      "canvas": "#fcfcfc",
      "chrome": "#fcfcfc",
      "toolbar": "#fcfcfc",
      "toolbarForeground": "#27272a",
      "toolbarBorder": "#e4e4e7",
      "toolbarControl": "#ffffff",
      "toolbarControlForeground": "#27272a",
      "toolbarControlHover": "#f4f4f5",
      "surface": "#ffffff",
      "surfaceRaised": "#fcfcfc",
      "surfaceOverlay": "#ffffff",
      "text": "#27272a",
      "textMuted": "#71717b",
      "border": "#e4e4e7",
      "input": "#d4d4d8",
      "focus": "#1b4ed8",
      "accent": "#1b4ed8",
      "accentForeground": "#ffffff",
      "secondary": "#fafafa",
      "secondaryForeground": "#27272a",
      "muted": "#fafafa",
      "mutedForeground": "#71717b",
      "placeholder": "#71717b",
      "secondaryLabel": "#71717b",
      "iconMuted": "#71717b",
      "error": "#fb2c36",
      "errorForeground": "#c10007",
      "errorSurface": "#fcebec",
      "warning": "#fe9a00",
      "warningForeground": "#bb4d00",
      "warningSurface": "#fcf4e8",
      "update": "#1b4ed8",
      "updateForeground": "#1b4ed8",
      "updateSurface": "#e0e6f7",
      "accentSurface": "#f4f4f5",
      "accentSurfaceForeground": "#18181b",
      "messageSurface": "#f4f4f5",
      "messageForeground": "#27272a",
      "messageAction": "#1b4ed8",
      "messageActionForeground": "#ffffff",
      "messageActionHover": "#3160db",
      "codeBackground": "#ffffff",
      "codeForeground": "#27272a",
      "sidebar": "#fafafa",
      "sidebarForeground": "#27272a",
      "sidebarMutedForeground": "#71717b",
      "sidebarControlSurface": "#f4f4f5",
      "sidebarRowHover": "#fcfcfc",
      "sidebarRowActive": "#ffffff",
      "sidebarRowSelected": "#ffffff",
      "sidebarBorder": "#e4e4e7",
      "terminalBackground": "#fcfcfc",
      "terminalForeground": "#27272a",
      "terminalCursor": "#26384e",
      "terminalSelection": "#d0d6dd",
      "terminalScrollbar": "#d6d6d6",
      "terminalScrollbarHover": "#bdbdbd"
    },
    "dark": {
      "searchMatchBackground": "#8c6c1f",
      "searchMatchForeground": "#f5f5f5",
      "searchMatchActiveBackground": "#eea52b",
      "searchMatchActiveForeground": "#21180a",
      "canvas": "#0a0a0a",
      "chrome": "#0a0a0a",
      "toolbar": "#0a0a0a",
      "toolbarForeground": "#f5f5f5",
      "toolbarBorder": "#191919",
      "toolbarControl": "#111111",
      "toolbarControlForeground": "#f5f5f5",
      "toolbarControlHover": "#141414",
      "surface": "#111111",
      "surfaceRaised": "#111111",
      "surfaceOverlay": "#111111",
      "text": "#f5f5f5",
      "textMuted": "#818181",
      "border": "#191919",
      "input": "#1e1e1e",
      "focus": "#346bf1",
      "accent": "#346bf1",
      "accentForeground": "#ffffff",
      "secondary": "#111111",
      "secondaryForeground": "#f5f5f5",
      "muted": "#111111",
      "mutedForeground": "#818181",
      "placeholder": "#818181",
      "secondaryLabel": "#818181",
      "iconMuted": "#818181",
      "error": "#fb414a",
      "errorForeground": "#ff6467",
      "errorSurface": "#301214",
      "warning": "#fe9a00",
      "warningForeground": "#ffb900",
      "warningSurface": "#312108",
      "update": "#346bf1",
      "updateForeground": "#51a2ff",
      "updateSurface": "#121b34",
      "accentSurface": "#141414",
      "accentSurfaceForeground": "#f5f5f5",
      "messageSurface": "#141414",
      "messageForeground": "#f5f5f5",
      "messageAction": "#346bf1",
      "messageActionForeground": "#ffffff",
      "messageActionHover": "#3061d9",
      "codeBackground": "#111111",
      "codeForeground": "#f5f5f5",
      "sidebar": "#000000",
      "sidebarForeground": "#f1f3f7",
      "sidebarMutedForeground": "#a3a3a3",
      "sidebarControlSurface": "#0a0a0a",
      "sidebarRowHover": "#131313",
      "sidebarRowActive": "#1a1b1b",
      "sidebarRowSelected": "#111111",
      "sidebarBorder": "#141414",
      "terminalBackground": "#0a0a0a",
      "terminalForeground": "#f5f5f5",
      "terminalCursor": "#b4cbff",
      "terminalSelection": "#343a47",
      "terminalScrollbar": "#222222",
      "terminalScrollbarHover": "#363636"
    }
  },
  "ocean": {
    "label": "T3 Ocean",
    "light": {
      "canvas": "oklch(0.974199 0.002856 241.597)",
      "chrome": "oklch(0.974199 0.002856 241.597)",
      "toolbar": "oklch(0.974199 0.002856 241.597)",
      "toolbarForeground": "oklch(0.222003 0.03479 328.979)",
      "toolbarBorder": "oklch(0.91295 0.018827 241.836)",
      "toolbarControl": "oklch(0.939254 0.01193 241.729)",
      "toolbarControlForeground": "oklch(0.222003 0.03479 328.979)",
      "toolbarControlHover": "oklch(0.91295 0.018827 241.836)",
      "surface": "oklch(0.974199 0.002856 241.597)",
      "surfaceRaised": "oklch(0.951058 0.002962 258.339)",
      "surfaceOverlay": "oklch(0.934442 0.003181 269.1)",
      "text": "oklch(0.222003 0.03479 328.979)",
      "textMuted": "oklch(0.541555 0.017468 323.531)",
      "border": "oklch(0.867646 0.013482 252.362)",
      "input": "oklch(0.832939 0.017389 252.598)",
      "focus": "oklch(0.536684 0.120219 247.01)",
      "accent": "oklch(0.536684 0.120219 247.01)",
      "accentForeground": "oklch(0.990339 0.008411 325.64)",
      "secondary": "oklch(0.939254 0.01193 241.729)",
      "secondaryForeground": "oklch(0.222003 0.03479 328.979)",
      "muted": "oklch(0.948004 0.009649 241.695)",
      "mutedForeground": "oklch(0.528741 0.01828 313.823)",
      "placeholder": "oklch(0.530733 0.01795 323.79)",
      "secondaryLabel": "oklch(0.541555 0.017468 323.531)",
      "iconMuted": "oklch(0.541555 0.017468 323.531)",
      "error": "oklch(0.637823 0.237287 25.436)",
      "errorForeground": "oklch(0.509494 0.208583 28.513)",
      "errorSurface": "oklch(0.938747 0.016377 7.186)",
      "warning": "oklch(0.772406 0.172798 65.367)",
      "warningForeground": "oklch(0.546927 0.155556 45.359)",
      "warningSurface": "oklch(0.954846 0.016009 81.731)",
      "update": "oklch(0.536684 0.120219 247.01)",
      "updateForeground": "oklch(0.397497 0.084999 246.523)",
      "updateSurface": "oklch(0.904165 0.021144 241.874)",
      "accentSurface": "oklch(0.91295 0.018827 241.836)",
      "accentSurfaceForeground": "oklch(0.222003 0.03479 328.979)",
      "messageSurface": "oklch(0.895373 0.023469 241.913)",
      "messageForeground": "oklch(0.222003 0.03479 328.979)",
      "messageAction": "oklch(0.493961 0.08175 201.584)",
      "messageActionForeground": "oklch(0.990339 0.008411 325.64)",
      "messageActionHover": "oklch(0.45151 0.074407 201.516)",
      "codeBackground": "oklch(0.957684 0.002906 253.68)",
      "codeForeground": "oklch(0.222003 0.03479 328.979)",
      "searchMatchBackground": "oklch(0.915 0.11 85)",
      "searchMatchForeground": "oklch(0.216164 0.028283 77.423)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.939254 0.01193 241.729)",
      "sidebarForeground": "oklch(0.222003 0.03479 328.979)",
      "sidebarMutedForeground": "oklch(0.517366 0.018944 311.433)",
      "sidebarControlSurface": "oklch(0.888479 0.011475 251.638)",
      "sidebarRowHover": "oklch(0.890798 0.024681 241.933)",
      "sidebarRowActive": "oklch(0.858363 0.033325 242.089)",
      "sidebarRowSelected": "oklch(0.842113 0.037689 242.174)",
      "sidebarBorder": "oklch(0.862823 0.011384 256.926)",
      "terminalBackground": "oklch(0.974199 0.002856 241.597)",
      "terminalForeground": "oklch(0.222003 0.03479 328.979)",
      "terminalCursor": "oklch(0.536684 0.120219 247.01)",
      "terminalSelection": "oklch(0.895373 0.023469 241.913)",
      "terminalScrollbar": "oklch(0.826271 0.006191 305.456)",
      "terminalScrollbarHover": "oklch(0.756866 0.008685 313.721)"
    },
    "dark": {
      "canvas": "oklch(0.242641 0.024125 250.573)",
      "chrome": "oklch(0.242641 0.024125 250.573)",
      "toolbar": "oklch(0.242641 0.024125 250.573)",
      "toolbarForeground": "oklch(0.990339 0.008411 325.64)",
      "toolbarBorder": "oklch(0.439946 0.0561 243.479)",
      "toolbarControl": "oklch(0.358725 0.043145 244.911)",
      "toolbarControlForeground": "oklch(0.990339 0.008411 325.64)",
      "toolbarControlHover": "oklch(0.413315 0.051874 243.855)",
      "surface": "oklch(0.242641 0.024125 250.573)",
      "surfaceRaised": "oklch(0.348439 0.019942 253.696)",
      "surfaceOverlay": "oklch(0.398517 0.018232 255.72)",
      "text": "oklch(0.990339 0.008411 325.64)",
      "textMuted": "oklch(0.652227 0.01149 273.31)",
      "border": "oklch(0.438653 0.039496 245.44)",
      "input": "oklch(0.500905 0.043574 244.781)",
      "focus": "oklch(0.758933 0.105833 241.548)",
      "accent": "oklch(0.758933 0.105833 241.548)",
      "accentForeground": "oklch(0.222003 0.03479 328.979)",
      "secondary": "oklch(0.358725 0.043145 244.911)",
      "secondaryForeground": "oklch(0.990339 0.008411 325.64)",
      "muted": "oklch(0.319287 0.036766 246.065)",
      "mutedForeground": "oklch(0.691936 0.016294 261.588)",
      "placeholder": "oklch(0.721641 0.010192 281.271)",
      "secondaryLabel": "oklch(0.652227 0.01149 273.31)",
      "iconMuted": "oklch(0.652227 0.01149 273.31)",
      "error": "oklch(0.655108 0.221148 23.473)",
      "errorForeground": "oklch(0.702184 0.189226 22.228)",
      "errorSurface": "oklch(0.298933 0.036443 350.094)",
      "warning": "oklch(0.772406 0.172798 65.367)",
      "warningForeground": "oklch(0.829017 0.171221 81.038)",
      "warningSurface": "oklch(0.329449 0.028712 84.495)",
      "update": "oklch(0.758933 0.105833 241.548)",
      "updateForeground": "oklch(0.840844 0.069217 240.151)",
      "updateSurface": "oklch(0.424017 0.053575 243.695)",
      "accentSurface": "oklch(0.413315 0.051874 243.855)",
      "accentSurfaceForeground": "oklch(0.990339 0.008411 325.64)",
      "messageSurface": "oklch(0.445224 0.056936 243.413)",
      "messageForeground": "oklch(0.990339 0.008411 325.64)",
      "messageAction": "oklch(0.793363 0.105022 199.893)",
      "messageActionForeground": "oklch(0.222003 0.03479 328.979)",
      "messageActionHover": "oklch(0.815308 0.096174 199.862)",
      "codeBackground": "oklch(0.29661 0.021883 251.968)",
      "codeForeground": "oklch(0.990339 0.008411 325.64)",
      "searchMatchBackground": "oklch(0.55 0.1 85)",
      "searchMatchForeground": "oklch(0.970151 0 0)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.290387 0.032043 247.274)",
      "sidebarForeground": "oklch(0.990339 0.008411 325.64)",
      "sidebarMutedForeground": "oklch(0.69099 0.01395 266.424)",
      "sidebarControlSurface": "oklch(0.417822 0.02535 250.162)",
      "sidebarRowHover": "oklch(0.353381 0.042285 245.043)",
      "sidebarRowActive": "oklch(0.393878 0.048778 244.179)",
      "sidebarRowSelected": "oklch(0.413744 0.051943 243.848)",
      "sidebarBorder": "oklch(0.55859 0.019001 256.223)",
      "terminalBackground": "oklch(0.242641 0.024125 250.573)",
      "terminalForeground": "oklch(0.990339 0.008411 325.64)",
      "terminalCursor": "oklch(0.758933 0.105833 241.548)",
      "terminalSelection": "oklch(0.439946 0.0561 243.479)",
      "terminalScrollbar": "oklch(0.58613 0.012959 267.22)",
      "terminalScrollbarHover": "oklch(0.681569 0.010909 276.465)"
    }
  },
  "iris": {
    "label": "T3 Iris",
    "light": {
      "canvas": "oklch(0.976531 0.003855 303.226)",
      "chrome": "oklch(0.976531 0.003855 303.226)",
      "toolbar": "oklch(0.976531 0.003855 303.226)",
      "toolbarForeground": "oklch(0.222003 0.03479 328.979)",
      "toolbarBorder": "oklch(0.914882 0.022965 299.986)",
      "toolbarControl": "oklch(0.941387 0.014687 300.474)",
      "toolbarControlForeground": "oklch(0.222003 0.03479 328.979)",
      "toolbarControlHover": "oklch(0.914882 0.022965 299.986)",
      "surface": "oklch(0.976531 0.003855 303.226)",
      "surfaceRaised": "oklch(0.953326 0.004536 307.676)",
      "surfaceOverlay": "oklch(0.936665 0.005041 310.132)",
      "text": "oklch(0.222003 0.03479 328.979)",
      "textMuted": "oklch(0.543042 0.018894 325.652)",
      "border": "oklch(0.869608 0.018226 303.859)",
      "input": "oklch(0.834773 0.023405 303.676)",
      "focus": "oklch(0.525348 0.15373 294.176)",
      "accent": "oklch(0.525348 0.15373 294.176)",
      "accentForeground": "oklch(0.990339 0.008411 325.64)",
      "secondary": "oklch(0.941387 0.014687 300.474)",
      "secondaryForeground": "oklch(0.222003 0.03479 328.979)",
      "muted": "oklch(0.950194 0.011956 300.733)",
      "mutedForeground": "oklch(0.529955 0.022319 321.556)",
      "placeholder": "oklch(0.532177 0.019333 325.784)",
      "secondaryLabel": "oklch(0.543042 0.018894 325.652)",
      "iconMuted": "oklch(0.543042 0.018894 325.652)",
      "error": "oklch(0.637823 0.237287 25.436)",
      "errorForeground": "oklch(0.509494 0.208583 28.513)",
      "errorSurface": "oklch(0.941043 0.019582 4.235)",
      "warning": "oklch(0.772406 0.172798 65.367)",
      "warningForeground": "oklch(0.549154 0.156188 45.359)",
      "warningSurface": "oklch(0.957054 0.016197 69.932)",
      "update": "oklch(0.525348 0.15373 294.176)",
      "updateForeground": "oklch(0.389926 0.10825 294.547)",
      "updateSurface": "oklch(0.90602 0.025754 299.867)",
      "accentSurface": "oklch(0.914882 0.022965 299.986)",
      "accentSurfaceForeground": "oklch(0.222003 0.03479 328.979)",
      "messageSurface": "oklch(0.897143 0.028558 299.758)",
      "messageForeground": "oklch(0.222003 0.03479 328.979)",
      "messageAction": "oklch(0.516084 0.185229 340.776)",
      "messageActionForeground": "oklch(0.990339 0.008411 325.64)",
      "messageActionHover": "oklch(0.471003 0.16748 340.687)",
      "codeBackground": "oklch(0.95997 0.004338 306.542)",
      "codeForeground": "oklch(0.222003 0.03479 328.979)",
      "searchMatchBackground": "oklch(0.915 0.11 85)",
      "searchMatchForeground": "oklch(0.216164 0.028283 77.423)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.941387 0.014687 300.474)",
      "sidebarForeground": "oklch(0.222003 0.03479 328.979)",
      "sidebarMutedForeground": "oklch(0.518417 0.023683 320.681)",
      "sidebarControlSurface": "oklch(0.890512 0.0155 303.803)",
      "sidebarRowHover": "oklch(0.892522 0.030022 299.704)",
      "sidebarRowActive": "oklch(0.85971 0.040501 299.36)",
      "sidebarRowSelected": "oklch(0.843236 0.045818 299.198)",
      "sidebarBorder": "oklch(0.864805 0.015938 305.371)",
      "terminalBackground": "oklch(0.976531 0.003855 303.226)",
      "terminalForeground": "oklch(0.222003 0.03479 328.979)",
      "terminalCursor": "oklch(0.525348 0.15373 294.176)",
      "terminalSelection": "oklch(0.897143 0.028558 299.758)",
      "terminalScrollbar": "oklch(0.828195 0.008526 318.858)",
      "terminalScrollbarHover": "oklch(0.758596 0.010892 321.538)"
    },
    "dark": {
      "canvas": "oklch(0.225975 0.031062 293.741)",
      "chrome": "oklch(0.225975 0.031062 293.741)",
      "toolbar": "oklch(0.225975 0.031062 293.741)",
      "toolbarForeground": "oklch(0.990339 0.008411 325.64)",
      "toolbarBorder": "oklch(0.395417 0.085554 294.182)",
      "toolbarControl": "oklch(0.325405 0.063614 294.23)",
      "toolbarControlForeground": "oklch(0.990339 0.008411 325.64)",
      "toolbarControlHover": "oklch(0.372436 0.07841 294.204)",
      "surface": "oklch(0.225975 0.031062 293.741)",
      "surfaceRaised": "oklch(0.335291 0.026008 296.394)",
      "surfaceOverlay": "oklch(0.386739 0.024023 297.509)",
      "text": "oklch(0.990339 0.008411 325.64)",
      "textMuted": "oklch(0.640465 0.016197 304.171)",
      "border": "oklch(0.40874 0.058536 295.893)",
      "input": "oklch(0.46756 0.065775 296.265)",
      "focus": "oklch(0.671712 0.169136 293.929)",
      "accent": "oklch(0.671712 0.169136 293.929)",
      "accentForeground": "oklch(0.222003 0.03479 328.979)",
      "secondary": "oklch(0.325405 0.063614 294.23)",
      "secondaryForeground": "oklch(0.990339 0.008411 325.64)",
      "muted": "oklch(0.291515 0.05276 294.209)",
      "mutedForeground": "oklch(0.663321 0.025932 301.862)",
      "placeholder": "oklch(0.706249 0.014508 306.607)",
      "secondaryLabel": "oklch(0.640465 0.016197 304.171)",
      "iconMuted": "oklch(0.640465 0.016197 304.171)",
      "error": "oklch(0.655108 0.221148 23.473)",
      "errorForeground": "oklch(0.702184 0.189226 22.228)",
      "errorSurface": "oklch(0.291658 0.054707 352.238)",
      "warning": "oklch(0.772406 0.172798 65.367)",
      "warningForeground": "oklch(0.829017 0.171221 81.038)",
      "warningSurface": "oklch(0.318952 0.033845 51.646)",
      "update": "oklch(0.671712 0.169136 293.929)",
      "updateForeground": "oklch(0.785032 0.108439 296.344)",
      "updateSurface": "oklch(0.381668 0.081286 294.195)",
      "accentSurface": "oklch(0.372436 0.07841 294.204)",
      "accentSurfaceForeground": "oklch(0.990339 0.008411 325.64)",
      "messageSurface": "oklch(0.399975 0.086965 294.177)",
      "messageForeground": "oklch(0.990339 0.008411 325.64)",
      "messageAction": "oklch(0.789904 0.130063 337.621)",
      "messageActionForeground": "oklch(0.222003 0.03479 328.979)",
      "messageActionHover": "oklch(0.813537 0.114101 337.23)",
      "codeBackground": "oklch(0.281873 0.028308 295.193)",
      "codeForeground": "oklch(0.990339 0.008411 325.64)",
      "searchMatchBackground": "oklch(0.55 0.1 85)",
      "searchMatchForeground": "oklch(0.970151 0 0)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.266743 0.044689 294.138)",
      "sidebarForeground": "oklch(0.990339 0.008411 325.64)",
      "sidebarMutedForeground": "oklch(0.668773 0.021522 302.949)",
      "sidebarControlSurface": "oklch(0.399977 0.035678 297.031)",
      "sidebarRowHover": "oklch(0.320808 0.062152 294.23)",
      "sidebarRowActive": "oklch(0.355677 0.073167 294.217)",
      "sidebarRowSelected": "oklch(0.372806 0.078525 294.203)",
      "sidebarBorder": "oklch(0.545895 0.027522 299.871)",
      "terminalBackground": "oklch(0.225975 0.031062 293.741)",
      "terminalForeground": "oklch(0.990339 0.008411 325.64)",
      "terminalCursor": "oklch(0.671712 0.169136 293.929)",
      "terminalSelection": "oklch(0.395417 0.085554 294.182)",
      "terminalScrollbar": "oklch(0.578663 0.017888 302.229)",
      "terminalScrollbarHover": "oklch(0.676012 0.015271 305.433)"
    }
  },
  "grove": {
    "label": "T3 Grove",
    "light": {
      "canvas": "oklch(0.972369 0.005497 157.15)",
      "chrome": "oklch(0.972369 0.005497 157.15)",
      "toolbar": "oklch(0.972369 0.005497 157.15)",
      "toolbarForeground": "oklch(0.222003 0.03479 328.979)",
      "toolbarBorder": "oklch(0.909438 0.021521 164.612)",
      "toolbarControl": "oklch(0.936464 0.014601 163.554)",
      "toolbarControlForeground": "oklch(0.222003 0.03479 328.979)",
      "toolbarControlHover": "oklch(0.909438 0.021521 164.612)",
      "surface": "oklch(0.972369 0.005497 157.15)",
      "surfaceRaised": "oklch(0.949276 0.004496 159.002)",
      "surfaceOverlay": "oklch(0.932695 0.003778 160.944)",
      "text": "oklch(0.222003 0.03479 328.979)",
      "textMuted": "oklch(0.540472 0.014944 326.176)",
      "border": "oklch(0.864831 0.01312 167.255)",
      "input": "oklch(0.829746 0.016084 168.234)",
      "focus": "oklch(0.523295 0.112292 158.089)",
      "accent": "oklch(0.523295 0.112292 158.089)",
      "accentForeground": "oklch(0.990339 0.008411 325.64)",
      "secondary": "oklch(0.936464 0.014601 163.554)",
      "secondaryForeground": "oklch(0.222003 0.03479 328.979)",
      "muted": "oklch(0.945455 0.012308 162.879)",
      "mutedForeground": "oklch(0.527266 0.012309 320.683)",
      "placeholder": "oklch(0.529681 0.01551 326.299)",
      "secondaryLabel": "oklch(0.540472 0.014944 326.176)",
      "iconMuted": "oklch(0.540472 0.014944 326.176)",
      "error": "oklch(0.637823 0.237287 25.436)",
      "errorForeground": "oklch(0.509494 0.208583 28.513)",
      "errorSurface": "oklch(0.936968 0.014243 26.295)",
      "warning": "oklch(0.772406 0.172798 65.367)",
      "warningForeground": "oklch(0.545036 0.155019 45.359)",
      "warningSurface": "oklch(0.953175 0.02009 93.379)",
      "update": "oklch(0.523295 0.112292 158.089)",
      "updateForeground": "oklch(0.388012 0.080082 158.768)",
      "updateSurface": "oklch(0.900411 0.02384 164.795)",
      "accentSurface": "oklch(0.909438 0.021521 164.612)",
      "accentSurfaceForeground": "oklch(0.222003 0.03479 328.979)",
      "messageSurface": "oklch(0.891377 0.026164 164.929)",
      "messageForeground": "oklch(0.222003 0.03479 328.979)",
      "messageAction": "oklch(0.535028 0.106403 77.549)",
      "messageActionForeground": "oklch(0.990339 0.008411 325.64)",
      "messageActionHover": "oklch(0.488753 0.096536 77.829)",
      "codeBackground": "oklch(0.955888 0.004783 158.391)",
      "codeForeground": "oklch(0.222003 0.03479 328.979)",
      "searchMatchBackground": "oklch(0.915 0.11 85)",
      "searchMatchForeground": "oklch(0.216164 0.028283 77.423)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.936464 0.014601 163.554)",
      "sidebarForeground": "oklch(0.222003 0.03479 328.979)",
      "sidebarMutedForeground": "oklch(0.515606 0.011938 318.897)",
      "sidebarControlSurface": "oklch(0.88585 0.011734 166.331)",
      "sidebarRowHover": "oklch(0.886676 0.027374 164.983)",
      "sidebarRowActive": "oklch(0.85335 0.03597 165.158)",
      "sidebarRowSelected": "oklch(0.836654 0.040284 165.149)",
      "sidebarBorder": "oklch(0.860274 0.010287 168.339)",
      "terminalBackground": "oklch(0.972369 0.005497 157.15)",
      "terminalForeground": "oklch(0.222003 0.03479 328.979)",
      "terminalCursor": "oklch(0.523295 0.112292 158.089)",
      "terminalSelection": "oklch(0.891377 0.026164 164.929)",
      "terminalScrollbar": "oklch(0.824752 0.001392 294.641)",
      "terminalScrollbarHover": "oklch(0.755495 0.004415 318.776)"
    },
    "dark": {
      "canvas": "oklch(0.260865 0.02152 162.75)",
      "chrome": "oklch(0.260865 0.02152 162.75)",
      "toolbar": "oklch(0.260865 0.02152 162.75)",
      "toolbarForeground": "oklch(0.990339 0.008411 325.64)",
      "toolbarBorder": "oklch(0.464636 0.066083 158.72)",
      "toolbarControl": "oklch(0.380487 0.048313 159.608)",
      "toolbarControlForeground": "oklch(0.990339 0.008411 325.64)",
      "toolbarControlHover": "oklch(0.437021 0.060312 158.962)",
      "surface": "oklch(0.260865 0.02152 162.75)",
      "surfaceRaised": "oklch(0.363192 0.016572 165.32)",
      "surfaceOverlay": "oklch(0.411828 0.014378 166.627)",
      "text": "oklch(0.990339 0.008411 325.64)",
      "textMuted": "oklch(0.666747 0.004239 187.292)",
      "border": "oklch(0.457475 0.044046 160.971)",
      "input": "oklch(0.519849 0.049896 160.863)",
      "focus": "oklch(0.796228 0.133058 157.319)",
      "accent": "oklch(0.796228 0.133058 157.319)",
      "accentForeground": "oklch(0.222003 0.03479 328.979)",
      "secondary": "oklch(0.380487 0.048313 159.608)",
      "secondaryForeground": "oklch(0.990339 0.008411 325.64)",
      "muted": "oklch(0.339728 0.039456 160.274)",
      "mutedForeground": "oklch(0.715427 0.010896 171.428)",
      "placeholder": "oklch(0.739243 0.002222 223.225)",
      "secondaryLabel": "oklch(0.666747 0.004239 187.292)",
      "iconMuted": "oklch(0.666747 0.004239 187.292)",
      "error": "oklch(0.655108 0.221148 23.473)",
      "errorForeground": "oklch(0.704237 0.187511 22.228)",
      "errorSurface": "oklch(0.312773 0.02923 32.121)",
      "warning": "oklch(0.772406 0.172798 65.367)",
      "warningForeground": "oklch(0.829017 0.171221 81.038)",
      "warningSurface": "oklch(0.345524 0.046882 99.736)",
      "update": "oklch(0.796228 0.133058 157.319)",
      "updateForeground": "oklch(0.86276 0.089288 159.704)",
      "updateSurface": "oklch(0.448116 0.062637 158.86)",
      "accentSurface": "oklch(0.437021 0.060312 158.962)",
      "accentSurfaceForeground": "oklch(0.990339 0.008411 325.64)",
      "messageSurface": "oklch(0.470111 0.067221 158.676)",
      "messageForeground": "oklch(0.990339 0.008411 325.64)",
      "messageAction": "oklch(0.791603 0.129713 83.299)",
      "messageActionForeground": "oklch(0.222003 0.03479 328.979)",
      "messageActionHover": "oklch(0.815227 0.117902 84.21)",
      "codeBackground": "oklch(0.312979 0.018942 164.082)",
      "codeForeground": "oklch(0.990339 0.008411 325.64)",
      "searchMatchBackground": "oklch(0.55 0.1 85)",
      "searchMatchForeground": "oklch(0.970151 0 0)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.309925 0.032827 160.944)",
      "sidebarForeground": "oklch(0.990339 0.008411 325.64)",
      "sidebarMutedForeground": "oklch(0.711387 0.007643 175.89)",
      "sidebarControlSurface": "oklch(0.432727 0.024549 163.654)",
      "sidebarRowHover": "oklch(0.374959 0.047124 159.686)",
      "sidebarRowActive": "oklch(0.41688 0.056069 159.165)",
      "sidebarRowSelected": "oklch(0.437466 0.060406 158.958)",
      "sidebarBorder": "oklch(0.569253 0.015933 167.062)",
      "terminalBackground": "oklch(0.260865 0.02152 162.75)",
      "terminalForeground": "oklch(0.990339 0.008411 325.64)",
      "terminalCursor": "oklch(0.796228 0.133058 157.319)",
      "terminalSelection": "oklch(0.464636 0.066083 158.72)",
      "terminalScrollbar": "oklch(0.594692 0.006862 176.022)",
      "terminalScrollbarHover": "oklch(0.687968 0.00354 193.55)"
    }
  },
  "ember": {
    "label": "T3 Ember",
    "light": {
      "canvas": "oklch(0.976527 0.002685 60.725)",
      "chrome": "oklch(0.976527 0.002685 60.725)",
      "toolbar": "oklch(0.976527 0.002685 60.725)",
      "toolbarForeground": "oklch(0.222003 0.03479 328.979)",
      "toolbarBorder": "oklch(0.916502 0.01832 49.597)",
      "toolbarControl": "oklch(0.942267 0.01151 50.785)",
      "toolbarControlForeground": "oklch(0.222003 0.03479 328.979)",
      "toolbarControlHover": "oklch(0.916502 0.01832 49.597)",
      "surface": "oklch(0.976527 0.002685 60.725)",
      "surfaceRaised": "oklch(0.953321 0.002701 42.266)",
      "surfaceOverlay": "oklch(0.936659 0.002879 29.96)",
      "text": "oklch(0.222003 0.03479 328.979)",
      "textMuted": "oklch(0.543023 0.017316 331.964)",
      "border": "oklch(0.870631 0.013204 39.431)",
      "input": "oklch(0.836213 0.017153 38.661)",
      "focus": "oklch(0.552831 0.129438 44.656)",
      "accent": "oklch(0.552831 0.129438 44.656)",
      "accentForeground": "oklch(0.990339 0.008411 325.64)",
      "secondary": "oklch(0.942267 0.01151 50.785)",
      "secondaryForeground": "oklch(0.222003 0.03479 328.979)",
      "muted": "oklch(0.950842 0.009273 51.528)",
      "mutedForeground": "oklch(0.530413 0.018453 341.181)",
      "placeholder": "oklch(0.532339 0.017796 331.748)",
      "secondaryLabel": "oklch(0.543023 0.017316 331.964)",
      "iconMuted": "oklch(0.543023 0.017316 331.964)",
      "error": "oklch(0.637823 0.237287 25.436)",
      "errorForeground": "oklch(0.509494 0.208583 28.513)",
      "errorSurface": "oklch(0.941094 0.019938 19.375)",
      "warning": "oklch(0.772406 0.172798 65.367)",
      "warningForeground": "oklch(0.549154 0.156188 45.359)",
      "warningSurface": "oklch(0.957148 0.020843 76.702)",
      "update": "oklch(0.552831 0.129438 44.656)",
      "updateForeground": "oklch(0.408647 0.091207 45.037)",
      "updateSurface": "oklch(0.907902 0.020621 49.36)",
      "accentSurface": "oklch(0.916502 0.01832 49.597)",
      "accentSurfaceForeground": "oklch(0.222003 0.03479 328.979)",
      "messageSurface": "oklch(0.899296 0.022939 49.163)",
      "messageForeground": "oklch(0.222003 0.03479 328.979)",
      "messageAction": "oklch(0.516323 0.161628 24.82)",
      "messageActionForeground": "oklch(0.990339 0.008411 325.64)",
      "messageActionHover": "oklch(0.471223 0.145843 24.688)",
      "codeBackground": "oklch(0.959965 0.002668 47.512)",
      "codeForeground": "oklch(0.222003 0.03479 328.979)",
      "searchMatchBackground": "oklch(0.915 0.11 85)",
      "searchMatchForeground": "oklch(0.216164 0.028283 77.423)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.942267 0.01151 50.785)",
      "sidebarForeground": "oklch(0.222003 0.03479 328.979)",
      "sidebarMutedForeground": "oklch(0.519146 0.019214 343.427)",
      "sidebarControlSurface": "oklch(0.891332 0.011179 40.596)",
      "sidebarRowHover": "oklch(0.894819 0.024151 49.073)",
      "sidebarRowActive": "oklch(0.863104 0.032855 48.586)",
      "sidebarRowSelected": "oklch(0.84723 0.037292 48.403)",
      "sidebarBorder": "oklch(0.865593 0.011154 35.246)",
      "terminalBackground": "oklch(0.976527 0.002685 60.725)",
      "terminalForeground": "oklch(0.222003 0.03479 328.979)",
      "terminalCursor": "oklch(0.552831 0.129438 44.656)",
      "terminalSelection": "oklch(0.899296 0.022939 49.163)",
      "terminalScrollbar": "oklch(0.828185 0.005884 349.533)",
      "terminalScrollbarHover": "oklch(0.758584 0.008423 341.16)"
    },
    "dark": {
      "canvas": "oklch(0.245899 0.019144 42.044)",
      "chrome": "oklch(0.245899 0.019144 42.044)",
      "toolbar": "oklch(0.245899 0.019144 42.044)",
      "toolbarForeground": "oklch(0.990339 0.008411 325.64)",
      "toolbarBorder": "oklch(0.442681 0.0608 50.795)",
      "toolbarControl": "oklch(0.361499 0.044052 49.515)",
      "toolbarControlForeground": "oklch(0.990339 0.008411 325.64)",
      "toolbarControlHover": "oklch(0.416048 0.055354 50.484)",
      "surface": "oklch(0.245899 0.019144 42.044)",
      "surfaceRaised": "oklch(0.351262 0.01565 37.592)",
      "surfaceOverlay": "oklch(0.401111 0.014308 34.896)",
      "text": "oklch(0.990339 0.008411 325.64)",
      "textMuted": "oklch(0.654017 0.009505 13.287)",
      "border": "oklch(0.44099 0.040202 48.807)",
      "input": "oklch(0.503003 0.045721 49.44)",
      "focus": "oklch(0.762174 0.124117 52.082)",
      "accent": "oklch(0.762174 0.124117 52.082)",
      "accentForeground": "oklch(0.222003 0.03479 328.979)",
      "secondary": "oklch(0.361499 0.044052 49.515)",
      "secondaryForeground": "oklch(0.990339 0.008411 325.64)",
      "muted": "oklch(0.322144 0.03574 48.309)",
      "mutedForeground": "oklch(0.692479 0.015227 30.963)",
      "placeholder": "oklch(0.723533 0.008741 4.515)",
      "secondaryLabel": "oklch(0.654017 0.009505 13.287)",
      "iconMuted": "oklch(0.654017 0.009505 13.287)",
      "error": "oklch(0.655108 0.221148 23.473)",
      "errorForeground": "oklch(0.702184 0.189226 22.228)",
      "errorSurface": "oklch(0.310955 0.059624 24.334)",
      "warning": "oklch(0.772406 0.172798 65.367)",
      "warningForeground": "oklch(0.829017 0.171221 81.038)",
      "warningSurface": "oklch(0.339137 0.055638 66.911)",
      "update": "oklch(0.762174 0.124117 52.082)",
      "updateForeground": "oklch(0.841456 0.079585 53.521)",
      "updateSurface": "oklch(0.426749 0.057547 50.618)",
      "accentSurface": "oklch(0.416048 0.055354 50.484)",
      "accentSurfaceForeground": "oklch(0.990339 0.008411 325.64)",
      "messageSurface": "oklch(0.447961 0.061874 50.849)",
      "messageForeground": "oklch(0.990339 0.008411 325.64)",
      "messageAction": "oklch(0.747955 0.135578 29.432)",
      "messageActionForeground": "oklch(0.222003 0.03479 328.979)",
      "messageActionHover": "oklch(0.775116 0.117953 29.014)",
      "codeBackground": "oklch(0.299662 0.017229 39.973)",
      "codeForeground": "oklch(0.990339 0.008411 325.64)",
      "searchMatchBackground": "oklch(0.55 0.1 85)",
      "searchMatchForeground": "oklch(0.970151 0 0)",
      "searchMatchActiveBackground": "oklch(0.774202 0.151946 74.331)",
      "searchMatchActiveForeground": "oklch(0.216164 0.028283 77.423)",
      "sidebar": "oklch(0.293349 0.029554 46.882)",
      "sidebarForeground": "oklch(0.990339 0.008411 325.64)",
      "sidebarMutedForeground": "oklch(0.691874 0.012538 24.638)",
      "sidebarControlSurface": "oklch(0.420227 0.022893 43.226)",
      "sidebarRowHover": "oklch(0.356163 0.042933 49.385)",
      "sidebarRowActive": "oklch(0.396617 0.051353 50.201)",
      "sidebarRowSelected": "oklch(0.416477 0.055442 50.489)",
      "sidebarBorder": "oklch(0.560372 0.016998 36.179)",
      "terminalBackground": "oklch(0.245899 0.019144 42.044)",
      "terminalForeground": "oklch(0.990339 0.008411 325.64)",
      "terminalCursor": "oklch(0.762174 0.124117 52.082)",
      "terminalSelection": "oklch(0.442681 0.0608 50.795)",
      "terminalScrollbar": "oklch(0.587861 0.010463 20.444)",
      "terminalScrollbarHover": "oklch(0.682876 0.009156 9.796)"
    }
  }
}

// Upstream web paint differs from the shared/mobile standard in these roles.
const T3_CODE_WEB_PAINTED_OVERRIDES = {
  light: { messageSurface: '#ebebed' },
  dark: { canvas: '#000000', messageSurface: '#1e1e1e' }
}

// T3's primary means a solid action, not its soft selection/accent surface.
const T3_NATIVE_ROLE_MAP = {
  background: 'canvas', foreground: 'text',
  card: 'surface', cardForeground: 'text',
  muted: 'muted', mutedForeground: 'mutedForeground',
  popover: 'surfaceOverlay', popoverForeground: 'text',
  primary: 'messageAction', primaryForeground: 'messageActionForeground',
  secondary: 'secondary', secondaryForeground: 'secondaryForeground',
  accent: 'accentSurface', accentForeground: 'accentSurfaceForeground',
  border: 'border', input: 'input', ring: 'focus',
  midground: 'accent', midgroundForeground: 'accentForeground', composerRing: 'focus',
  destructive: 'error', destructiveForeground: 'errorForeground',
  sidebarBackground: 'sidebar', sidebarBorder: 'sidebarBorder',
  userBubble: 'messageSurface', userBubbleBorder: 'messageSurface'
}

function t3OklchToLinear({ L, C, h }) {
  const radians = h * Math.PI / 180
  const a = C * Math.cos(radians), b = C * Math.sin(radians)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

// T3's own gamut fit, tolerance and rounding, not a hand-picked nearest color.
function t3ColorToHex(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value)
  if (!match) throw new TypeError(`Unsupported T3 source color: ${value}`)
  const [L, C, h] = match.slice(1).map(Number)
  const color = { L, C, h }
  const inGamut = chroma => t3OklchToLinear({ ...color, C: chroma })
    .every(channel => channel >= -0.0001 && channel <= 1.0001)
  if (!inGamut(C)) {
    let low = 0, high = C
    const resolution = 0.000001
    const steps = Math.max(1, Math.ceil(Math.log2(Math.max(C, resolution)) - Math.log2(resolution)))
    for (let step = 0; step < steps; step++) {
      const mid = (low + high) / 2
      if (inGamut(mid)) low = mid
      else high = mid
    }
    color.C = low
  }
  return '#' + t3OklchToLinear(color).map(channel => {
    const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')
  }).join('')
}

function t3NativeColors(source) {
  return Object.fromEntries(Object.entries(T3_NATIVE_ROLE_MAP)
    .map(([native, role]) => [native, t3ColorToHex(source[role])]))
}

function t3NativeTerminal(source) {
  return {
    foreground: t3ColorToHex(source.terminalForeground),
    cursor: t3ColorToHex(source.terminalCursor),
    selectionBackground: t3ColorToHex(source.terminalSelection)
  }
}

const T3_THEMES = Object.entries(T3_SOURCE_PALETTES).map(([id, source]) => {
  const light = { ...source.light, ...(id === 't3-code' ? T3_CODE_WEB_PAINTED_OVERRIDES.light : {}) }
  const dark = { ...source.dark, ...(id === 't3-code' ? T3_CODE_WEB_PAINTED_OVERRIDES.dark : {}) }
  return {
    name: `codex-t3-${id.replace(/^t3-/, '')}`,
    label: source.label,
    description: `T3 Code upstream ${source.label} palette, light and dark`,
    customCSS: t3ThemePaintCSS(id, source),
    colors: t3NativeColors(light), darkColors: t3NativeColors(dark),
    terminal: t3NativeTerminal(light), darkTerminal: t3NativeTerminal(dark)
  }
})

// Additive only. The host owns activation, appearance, material and disposal.
// Inject THEMES_AREA from the SDK when embedding; no relative runtime imports.
function registerT3Themes(ctx, themesArea = 'themes') {
  for (const theme of T3_THEMES) {
    ctx.register({ id: `theme-${theme.name}`, area: themesArea, data: theme })
  }
}
// END GENERATED T3 THEMES RUNTIME
// BEGIN GENERATED T3 SUBAGENT STYLE RUNTIME
// T3 SubagentTimelineLink, not WorkLog/card geometry. T3 Code (MIT),
// pingdotgg/t3code@6d450a4284852af137b2f3407fddd89eb76e7644,
// V2LifecycleRow.tsx:205-245,358-505. Provenance/limits: docs/t3-subagent-style.md.
// CSS only: native goal button, agent identity, status, timer and preview remain owned by Hermes.
const T3_SUBAGENT_CSS = String.raw`
html[data-codex-chat-look='true'] [data-slot='tool-block'][data-delegate-card] {
  --conversation-tool-font-size: calc(.75rem * var(--chat-text-scale, 1));
  --conversation-line-height: calc(1.1171875rem * var(--chat-text-scale, 1));
  --conversation-scaffold-text: var(--codex-subagent-text, var(--codex-color-text, var(--ui-text-primary)));
  --conversation-scaffold-meta: var(--codex-subagent-meta, var(--codex-color-text-secondary, var(--ui-text-secondary)));
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0;
  container-type: inline-size;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div {
  position: relative;
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr) minmax(0, auto) auto .875rem;
  align-items: center;
  column-gap: .625rem !important;
  row-gap: 0 !important;
  min-width: 0;
  min-height: 2.875rem;
  border: 0 !important;
  border-radius: .375rem !important;
  padding: .375rem .5rem !important;
  background: transparent !important;
  box-shadow: none !important;
  opacity: 1 !important;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div:not(:has(> [data-conversation-scaffold] > button ~ span.inline-flex)) {
  grid-template-columns: 1.5rem minmax(0, 1fr) minmax(0, auto) .875rem;
}
/* Flatten layout only, not the native DOM/React ownership or accessible controls. */
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] {
  display: contents !important;
  opacity: 1 !important;
}
/* The existing Hermes agent glyph becomes the avatar, not a made-up provider/user logo. */
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > .codicon {
  display: grid;
  place-items: center;
  grid-column: 1;
  grid-row: 1 / 3;
  justify-self: center;
  align-self: center;
  width: 1.5rem;
  height: 1.5rem;
  margin: 0 !important;
  border: 1px solid var(--codex-subagent-avatar-border, var(--ui-stroke-tertiary));
  border-radius: 50%;
  background: var(--codex-subagent-avatar-background, color-mix(in srgb, var(--conversation-scaffold-meta) 12%, var(--codex-color-chat, var(--ui-chat-surface-background))));
  color: var(--conversation-scaffold-text) !important;
  font-size: .875rem !important;
  line-height: 1 !important;
}
/* The REAL native status node supplies its color and accessible status; only its
   decorative glyph paint becomes the T3 lower-right dot. No status is inferred. */
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > span:first-child {
  grid-column: 1;
  grid-row: 1 / 3;
  justify-self: center;
  align-self: center;
  width: .5rem !important;
  height: .5rem !important;
  transform: translate(.5625rem, .5625rem);
  z-index: 1;
  pointer-events: none;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--codex-color-chat, var(--ui-chat-surface-background));
}
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > span:first-child > :is(svg, span) {
  width: .5rem !important;
  height: .5rem !important;
  border-radius: 50%;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > span:first-child > :is(svg, [role='status']) {
  background: currentColor;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > span:first-child > [role='status'] {
  color: var(--ui-accent) !important;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > span:first-child > :is(svg, [role='status']) > * {
  visibility: hidden;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > button {
  grid-column: 2;
  grid-row: 1;
  position: static !important;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--conversation-tool-font-size) !important;
  font-weight: 500;
  line-height: calc(1rem * var(--chat-text-scale, 1)) !important;
  color: var(--conversation-scaffold-text) !important;
}
/* Extend the original button's hit target; never install a second click handler.
   This catches actual pointer hits on avatar, preview and chevron as T3 does. */
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > button:not(:disabled)::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  cursor: pointer;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div:has(> [data-conversation-scaffold] > button:not(:disabled)):hover {
  background: var(--codex-subagent-hover, color-mix(in srgb, var(--ui-bg-tertiary, var(--conversation-scaffold-meta)) 20%, transparent)) !important;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div:has(> [data-conversation-scaffold] > button:focus-visible) {
  outline: 2px solid var(--codex-subagent-focus, var(--ui-accent)) !important;
  outline-offset: -2px;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > button:focus-visible {
  outline: none !important;
}
/* Keep original model/duration text together: native Hermes does not expose
   separate fields here. Never split/rewrite labels or drop model information. */
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > button ~ span {
  grid-column: 3;
  grid-row: 1 / 3;
  min-width: 0;
  max-width: 20em;
  margin: 0 !important;
  overflow-wrap: anywhere;
  white-space: normal;
  font-size: calc(.75rem * var(--chat-text-scale, 1)) !important;
  line-height: calc(1rem * var(--chat-text-scale, 1)) !important;
  color: var(--conversation-scaffold-meta) !important;
  opacity: 1 !important;
  font-variant-numeric: tabular-nums;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > button ~ .inline-flex {
  grid-column: 4;
  white-space: nowrap;
}
html[data-codex-chat-look='true'] [data-delegate-card] > div > div:has(> [data-tool-ticker]) {
  grid-column: 2;
  grid-row: 2;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  min-width: 0;
}
html[data-codex-chat-look='true'] [data-delegate-card] [data-tool-ticker] {
  height: var(--conversation-line-height) !important;
  overflow: clip !important;
  isolation: isolate;
}
html[data-codex-chat-look='true'] [data-delegate-card] .tool-ticker__row {
  height: var(--conversation-line-height) !important;
  line-height: var(--conversation-line-height) !important;
}
html[data-codex-chat-look='true'] [data-delegate-card] .tool-ticker__row > span {
  font-size: calc(.6875rem * var(--chat-text-scale, 1)) !important;
  line-height: var(--conversation-line-height) !important;
  color: var(--conversation-scaffold-meta) !important;
}
/* Navigation affordance only when the existing native goal button can open. */
html[data-codex-chat-look='true'] [data-delegate-card] > div:has(> [data-conversation-scaffold] > button:not(:disabled))::after {
  content: '';
  grid-column: -2 / -1;
  grid-row: 1 / 3;
  justify-self: center;
  width: .375rem;
  height: .375rem;
  border-top: 1.5px solid;
  border-right: 1.5px solid;
  color: var(--conversation-scaffold-meta);
  opacity: .6;
  transform: rotate(45deg);
  pointer-events: none;
}
/* Preserve metadata at docked widths instead of hiding it to imitate T3's tooltip. */
@container (max-width: 30rem) {
  html[data-codex-chat-look='true'] [data-delegate-card] > div {
    grid-template-columns: 1.5rem minmax(0, 1fr) auto .875rem !important;
  }
  html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > button + span:not(.inline-flex) {
    grid-column: 2 / -1;
    grid-row: 3;
    max-width: 100%;
  }
  html[data-codex-chat-look='true'] [data-delegate-card] > div > [data-conversation-scaffold] > button ~ .inline-flex {
    grid-column: 3;
  }
}
@media (prefers-reduced-motion: reduce) {
  html[data-codex-chat-look='true'] [data-delegate-card] *,
  html[data-codex-chat-look='true'] [data-delegate-card] *::before,
  html[data-codex-chat-look='true'] [data-delegate-card] *::after {
    animation: none !important;
    transition: none !important;
  }
}
`
// END GENERATED T3 SUBAGENT STYLE RUNTIME
// BEGIN GENERATED ANALYTICS RUNTIME
// Inlined by the builder. Only the separate project's PUBLIC token belongs here.
// No fallback to another project's key, personal API credential or runtime lookup.
const CODEX_ANALYTICS_PROJECT = Object.freeze({ token: 'phc_C5rFsRfQypCeJSiAjw67pWUnsB5RRhAmj44Mh5craJWV', host: 'https://eu.i.posthog.com' })
const CODEX_ANALYTICS_KEY = 'usage-consent-v1'
const CODEX_ANALYTICS_FEATURES = Object.freeze(['inbox', 'snooze', 'restore', 'settle', 'settings', 'theme', 'complete_messages', 'collapse'])
const CODEX_ANALYTICS_FAILURES = Object.freeze(['storage_write', 'storage_readback', 'action_failed'])

function codexAnalyticsOS(platform) {
  if (typeof platform !== 'string') return 'other'
  if (/^Mac/i.test(platform)) return 'macos'
  if (/^Win/i.test(platform)) return 'windows'
  if (/^Linux/i.test(platform)) return 'linux'
  return 'other'
}

function createCodexSkinAnalytics({ storage, token = null, host = null, version = 'unknown', isTest = false,
  document: doc = globalThis.document, navigator: nav = globalThis.navigator,
  request = (...args) => globalThis.fetch(...args), crypto: random = globalThis.crypto,
  timers = globalThis, now = () => Date.now() } = {}) {
  const configured = typeof token === 'string' && /^phc_[A-Za-z0-9]{16,160}$/.test(token) &&
    ['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(host)
  const publicVersion = typeof version === 'string' && /^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,40})?$/.test(version) ? version : 'unknown'
  const base = Object.freeze({ plugin_version: publicVersion, os_family: codexAnalyticsOS(nav?.platform), is_test: isTest === true, $process_person_profile: false, $geoip_disable: true })
  const validId = id => typeof id === 'string' && /^cs_[a-f0-9]{32}$/.test(id)
  const blocked = () => nav?.globalPrivacyControl === true || nav?.doNotTrack === '1' || nav?.doNotTrack === 'yes'
  let enabled = false, disposed = false, id = null, generation = 0, heartbeat = null, flushTimer = null, flight = null
  let minute = -1, minuteCount = 0, day = '', dayCount = 0
  const queue = []
  const read = () => storage?.get?.(CODEX_ANALYTICS_KEY, null)
  const verifiedWrite = value => {
    if (!storage?.set || !storage?.get) throw Error('Storage unavailable')
    storage.set(CODEX_ANALYTICS_KEY, value)
    const saved = read()
    if (!saved || JSON.stringify(saved) !== JSON.stringify(value)) throw Error('Storage readback failed')
  }
  const stop = () => {
    enabled = false; id = null; generation++; queue.length = 0
    if (heartbeat !== null) timers.clearInterval(heartbeat)
    if (flushTimer !== null) timers.clearTimeout(flushTimer)
    heartbeat = flushTimer = null
    if (flight) { timers.clearTimeout(flight.timeout); flight.abort.abort(); flight = null }
    doc?.removeEventListener?.('visibilitychange', visibility)
  }
  const consentCurrent = () => {
    if (disposed || !enabled || blocked()) { if (enabled) stop(); return false }
    try {
      const saved = read()
      if (saved?.v !== 1 || saved.enabled !== true || saved.id !== id) { stop(); return false }
      return true
    } catch { stop(); return false }
  }
  const schedule = () => {
    if (enabled && !disposed && queue.length && !flight && flushTimer === null) {
      flushTimer = timers.setTimeout(() => { flushTimer = null; void flush() }, 250)
    }
  }
  async function flush() {
    if (!consentCurrent() || flight || !queue.length) return
    const event = queue.shift(), epoch = generation
    const abort = new AbortController()
    const current = { abort, timeout: timers.setTimeout(() => abort.abort(), 5000) }
    flight = current
    try {
      // Official JSON capture contract; browser CORS still applies. No cookies,
      // referrer, beacon, keepalive, SDK enrichment or automatic retries.
      await request(host + '/i/v0/e/', {
        method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
        cache: 'no-store', redirect: 'error', keepalive: false,
        headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ api_key: token, event: event.name, distinct_id: id,
          properties: event.properties, timestamp: new Date(event.at).toISOString() })
      })
    } catch { /* Lost telemetry must never fail a user action. No retry. */ }
    finally {
      timers.clearTimeout(current.timeout)
      if (flight === current) flight = null
      if (generation === epoch) schedule()
    }
  }
  const capture = (name, properties = {}) => {
    try {
      // Reject unexpected keys rather than forwarding or stringifying content.
      if (!properties || Object.getPrototypeOf(properties) !== Object.prototype) return false
      const expected = name === 'codex_skin_active' ? [] : name === 'codex_skin_feature_used' ? ['feature'] :
        name === 'codex_skin_feature_failed' ? ['feature', 'failure_category'] : null
      if (!expected || Object.keys(properties).length !== expected.length || expected.some(key => !Object.hasOwn(properties, key))) return false
      if (expected.includes('feature') && !CODEX_ANALYTICS_FEATURES.includes(properties.feature)) return false
      if (expected.includes('failure_category') && !CODEX_ANALYTICS_FAILURES.includes(properties.failure_category)) return false
      if (!consentCurrent() || doc?.visibilityState !== 'visible') return false
      const at = now(), nextMinute = Math.floor(at / 60000), nextDay = new Date(at).toISOString().slice(0, 10)
      if (nextMinute !== minute) { minute = nextMinute; minuteCount = 0 }
      if (nextDay !== day) { day = nextDay; dayCount = 0 }
      if (queue.length >= 20 || minuteCount >= 30 || dayCount >= 1200) return false
      queue.push({ name, at, properties: { ...base, ...properties } }); minuteCount++; dayCount++
      schedule(); return true
    } catch { return false }
  }
  const active = () => {
    if (!consentCurrent() || doc?.visibilityState !== 'visible') return
    try {
      const saved = read(), today = new Date(now()).toISOString().slice(0, 10)
      if (saved.lastActiveDay === today) return
      // Readback before claiming the daily event prevents hot-reload repetition.
      if (capture('codex_skin_active')) verifiedWrite({ v: 1, enabled: true, id, lastActiveDay: today })
    } catch { stop() }
  }
  function visibility() { active() }
  const start = saved => {
    if (!configured || disposed || blocked() || saved?.v !== 1 || saved.enabled !== true || !validId(saved.id)) return false
    id = saved.id; enabled = true
    doc?.addEventListener?.('visibilitychange', visibility)
    heartbeat = timers.setInterval(active, 60000)
    active()
    return enabled
  }
  const setConsent = value => {
    if (disposed || typeof value !== 'boolean') return false
    stop()
    try {
      if (!value) {
        // Even native storage's swallowed quota failures must be detected.
        verifiedWrite({ v: 1, enabled: false })
        return true
      }
      if (!configured || blocked() || typeof random?.getRandomValues !== 'function') return false
      const bytes = new Uint8Array(16); random.getRandomValues(bytes)
      const saved = { v: 1, enabled: true, id: 'cs_' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''), lastActiveDay: '' }
      verifiedWrite(saved)
      return start(saved)
    } catch { stop(); return false }
  }
  // Startup reads the opt-in only. A fresh install writes nothing and creates
  // no identifier, timer, listener or request for analytics.
  try { start(read()) } catch { stop() }
  return Object.freeze({
    configured, isEnabled: () => enabled && !disposed,
    setConsent, capture,
    used: feature => capture('codex_skin_feature_used', { feature }),
    failed: (feature, failure_category) => capture('codex_skin_feature_failed', { feature, failure_category }),
    dispose() { if (!disposed) { stop(); disposed = true } }
  })
}

// This seam accepts only fixed categorical signals from plugin-owned handlers.
// It never inspects a DOM event, native atom, session object or exception.
let codexSkinAnalytics = null
function codexSkinFeatureUsed(feature) { codexSkinAnalytics?.used(feature) }
function codexSkinFeatureFailed(feature, category) { codexSkinAnalytics?.failed(feature, category) }
function codexSkinSettingAction(feature, key, expected, action) {
  let result
  try { result = action() }
  catch (error) { codexSkinFeatureFailed(feature, 'action_failed'); throw error }
  if (!codexSkinAnalytics?.isEnabled()) return result
  try {
    if (pluginStorage?.get(key, null) === expected) codexSkinFeatureUsed(feature)
    else codexSkinFeatureFailed(feature, 'storage_readback')
  } catch { codexSkinFeatureFailed(feature, 'storage_readback') }
  return result
}
function installCodexSkinAnalytics(ctx, project = CODEX_ANALYTICS_PROJECT) {
  codexSkinAnalytics?.dispose()
  const analytics = createCodexSkinAnalytics({ storage: ctx.storage, token: project.token, host: project.host, version: BUILD_ID })
  codexSkinAnalytics = analytics
  ctx.onDispose(() => { analytics.dispose(); if (codexSkinAnalytics === analytics) codexSkinAnalytics = null })
  ctx.register({ id: 'share-usage-statistics', area: PALETTE_AREA, data: {
    id: 'codex-chat-look.share-usage-statistics',
    label: 'Codex Skin: Share usage statistics',
    detail: () => analytics.isEnabled() ? 'On (pseudonymous installation)' : 'Off',
    detailVariant: 'state', keepOpen: false,
    keywords: ['codex', 'skin', 'privacy', 'analytics', 'statistics'],
    run: () => {
      const next = !analytics.isEnabled()
      if (next) {
        // Native confirm supplies a keyboard-accessible explicit consent step.
        const accepted = globalThis.window?.confirm?.('Share Codex Skin usage statistics with PostHog? This uses a random persistent installation ID (pseudonymous, not fully anonymous), plugin version, OS family and fixed feature/failure categories. No conversations, prompts, titles, files or raw errors. PostHog receives network metadata, including your IP address. Opting out stops collection and removes the local ID; it does not delete previously received events. You can turn this off here at any time.')
        if (accepted !== true) return false
      }
      const saved = analytics.setConsent(next)
      host.notify?.({ kind: saved ? 'info' : 'error', message: saved ? (next ? 'Usage statistics are on.' : 'Usage statistics are off. The local installation ID was removed.') :
        (!analytics.configured ? 'Usage statistics are unavailable until the separate PostHog project is configured.' : 'Usage statistics are off for this session. The preference could not be saved or a privacy signal blocks collection.') })
      return saved
    }
  } })
  return analytics
}
// END GENERATED ANALYTICS RUNTIME
// BEGIN GENERATED COMPLETE MESSAGES RUNTIME
// The host-pinned StreamdownTextPrimitive exposes each TEXT PART's status on
// .aui-md[data-status]. Message/turn status is too broad: a running message may
// already contain sealed commentary or a previous final after a child wake.
const COMPLETE_MESSAGES_KEY = 'show-complete-messages'
const COMPLETE_MESSAGES_OWNER = Symbol.for('codex-chat-look.complete-messages')
// Native markdown can contain media, alerts and preview/action cards before
// its text part completes. Unknown native slots also fail open. CSS :has keeps
// late-mounted content accessible without an observer or a remembered node.
const COMPLETE_MESSAGES_PROTECTED_SELECTOR = `${TURN_PROTECTED_SELECTOR}, ${TURN_REPLY_PROTECTED_SELECTOR}, [data-slot]`
const COMPLETE_MESSAGES_CSS = `
html[data-codex-chat-look="true"][data-codex-complete-messages="true"]
[data-slot="aui_assistant-message-content"] > .aui-md[data-status="running"]:not(${COMPLETE_MESSAGES_PROTECTED_SELECTOR}):not(:has(${COMPLETE_MESSAGES_PROTECTED_SELECTOR})) {
  display: none !important;
}
`

function registerCompleteMessages(ctx, paletteArea, host, onFeatureUsed = () => {}) {
  let active = true
  let enabled
  const report = message => host.notify?.({ kind: 'error', message })
  try {
    enabled = ctx.storage.get(COMPLETE_MESSAGES_KEY, true) !== false
  } catch {
    // A read failure is not proof that a user never saved Off.
    enabled = false
    report('Could not read Show complete messages. Text streaming remains on.')
  }
  const root = globalThis.document?.body ? document.documentElement : null
  const style = root ? document.createElement('style') : null
  const owner = { root, style }
  if (style) {
    style.dataset.codexCompleteMessages = ''
    style.textContent = COMPLETE_MESSAGES_CSS
    document.head.append(style)
    globalThis[COMPLETE_MESSAGES_OWNER] = owner
  }
  const apply = () => {
    if (!root || globalThis[COMPLETE_MESSAGES_OWNER] !== owner) return
    if (enabled) root.setAttribute('data-codex-complete-messages', 'true')
    else root.removeAttribute('data-codex-complete-messages')
  }
  apply()
  ctx.register({
    id: 'toggle-complete-messages',
    area: paletteArea,
    data: {
      id: 'codex-chat-look.toggle-complete-messages',
      label: 'Codex Skin: Show complete messages',
      detail: () => enabled ? 'On' : 'Off',
      detailVariant: 'state',
      keepOpen: true,
      keywords: ['codex', 'skin', 'complete', 'messages', 'text', 'streaming', 'tokens'],
      run: () => {
        if (!active) return
        const next = !enabled
        try {
          ctx.storage.set(COMPLETE_MESSAGES_KEY, next)
          // The SDK storage layer can swallow persistence failures.
          if (ctx.storage.get(COMPLETE_MESSAGES_KEY, null) !== next) throw new Error('Preference readback mismatch')
        } catch {
          report('Could not save Show complete messages. The current display is unchanged.')
          return
        }
        enabled = next
        apply()
        onFeatureUsed('complete_messages')
      }
    }
  })
  ctx.onDispose(() => {
    active = false
    style?.remove()
    if (globalThis[COMPLETE_MESSAGES_OWNER] !== owner) return
    root?.removeAttribute('data-codex-complete-messages')
    delete globalThis[COMPLETE_MESSAGES_OWNER]
  })
}
// END GENERATED COMPLETE MESSAGES RUNTIME
// BEGIN GENERATED T3 SIDEBAR ACTIONS RUNTIME
// T3 6d450a4 SidebarThreadHeader.tsx:62-87,113-132,138-173.
// SquarePen paths: lucide-react 0.564.0, pinned by that tree's pnpm-lock.yaml.
const T3_SIDEBAR_ACTIONS_CSS = `
html[data-codex-chat-look='true'] [data-codex-t3-search-row] {
  display:flex!important; align-items:center!important; gap:0.25rem!important; padding:0.25rem 0.5rem!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field] {
  display:flex!important; flex:0 1 calc(100% - 2rem)!important; width:calc(100% - 2rem)!important;
  height:2rem!important; min-width:0!important; gap:0.5rem!important; padding:0.375rem 0.5rem!important;
  box-sizing:border-box!important; border:0!important; border-radius:0.375rem!important;
  opacity:1!important; color:var(--codex-sidebar-muted)!important; background:transparent!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field]:is(:hover,:focus-within) {
  background:var(--codex-sidebar-hover)!important; color:var(--codex-color-text)!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field]:focus-within {
  box-shadow:inset 0 0 0 1px var(--ui-accent)!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field] > input {
  width:100%!important; min-width:0!important; height:1.25rem!important; padding:0!important;
  font-size:0.875rem!important; font-weight:500!important; line-height:1.25rem!important;
  color:inherit!important; field-sizing:initial!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-search-field] > input::placeholder { color:inherit!important; opacity:1!important; }
html[data-codex-chat-look='true'] [data-codex-t3-search-field] > svg { width:1rem!important; height:1rem!important; color:inherit!important; }
html[data-codex-chat-look='true'] [data-codex-t3-new-item] { height:0!important; min-height:0!important; margin:0!important; padding:0!important; }
html[data-codex-chat-look='true'] [data-codex-t3-new-session] {
  position:absolute!important; left:var(--codex-t3-new-left)!important; top:var(--codex-t3-new-top)!important;
  width:1.75rem!important; height:1.75rem!important; min-width:1.75rem!important; min-height:1.75rem!important;
  display:flex!important; align-items:center!important; justify-content:center!important;
  margin:0!important; padding:0!important; border:0!important; border-radius:0.375rem!important;
  background:transparent!important; color:var(--codex-sidebar-muted)!important; box-shadow:none!important;
  overflow:hidden!important; z-index:2; -webkit-app-region:no-drag;
}
html[data-codex-chat-look='true'] [data-codex-t3-new-session]:is(:hover,:focus-visible) {
  background:var(--codex-sidebar-hover)!important; color:var(--codex-color-text)!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-new-session]:focus-visible { outline:2px solid var(--ui-accent)!important; outline-offset:-2px!important; }
/* Keep Hermes' accessible label, native shortcut hint/tooltip and handlers.
   Only their visual presentation disappears; the control itself is the original. */
html[data-codex-chat-look='true'] [data-codex-t3-new-session] > :not(svg):not(.codicon) {
  position:absolute!important; width:1px!important; height:1px!important; margin:-1px!important;
  padding:0!important; overflow:hidden!important; clip-path:inset(50%)!important; white-space:nowrap!important;
}
html[data-codex-chat-look='true'] [data-codex-t3-new-session] > :is(svg,.codicon) { display:none!important; }
html[data-codex-chat-look='true'] [data-codex-t3-new-session]::before {
  content:''; width:1rem; height:1rem; flex:none; background:currentColor;
  mask:center/contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/%3E%3Cpath d='M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z'/%3E%3C/svg%3E");
}
`

// Position the *native* action without reparenting React nodes, proxy clicks,
// private stores, captured profile callbacks or additional keyboard controls.
function installT3SidebarActions() {
  const bindings = new Map()
  let frame = 0, disposed = false
  const clear = binding => {
    const { input, button, item, row, field, placeholder, hadStyle } = binding
    if (input.getAttribute('placeholder') === 'Search') {
      if (placeholder === null) input.removeAttribute('placeholder')
      else input.setAttribute('placeholder', placeholder)
    }
    for (const [element, name] of [[button,'new-session'],[item,'new-item'],[row,'search-row'],[field,'search-field']]) element.removeAttribute(`data-codex-t3-${name}`)
    button.style.removeProperty('--codex-t3-new-left'); button.style.removeProperty('--codex-t3-new-top')
    if (!hadStyle && !button.getAttribute('style')) button.removeAttribute('style')
  }
  const sync = () => {
    frame = 0
    if (disposed) return
    const current = new Set()
    if (document.documentElement.dataset.codexChatLook === 'true') {
      for (const sidebar of document.querySelectorAll('[data-tour="sessions-sidebar"]')) {
        const content = sidebar.querySelector(':scope > [data-slot="sidebar-content"]')
        const label = content?.querySelector('[data-tour="sidebar-nav-new-session"]')
        // Radix ContextMenu/Tooltip asChild can overwrite data-slot. The
        // native menu-button semantic marker survives those prop merges.
        const button = label?.closest('button[data-sidebar="menu-button"], button[data-slot="sidebar-menu-button"]')
        const item = button?.closest('[data-slot="sidebar-menu-item"]')
        // Exact native SearchField sibling, not generic text/aria-label matching.
        const row = content && [...content.children].find(el => el.nextElementSibling?.hasAttribute('data-sessions-mode') && el.querySelector(':scope > div > input'))
        const field = row?.firstElementChild, input = field?.querySelector(':scope > input')
        if (!button || !item || !input || button.closest('[data-tour="sessions-sidebar"]') !== sidebar) continue
        current.add(input)
        let binding = bindings.get(input)
        if (binding && binding.button !== button) { clear(binding); bindings.delete(input); binding = null }
        if (!binding) {
          binding = { input, button, item, row, field, placeholder:input.getAttribute('placeholder'), hadStyle:button.hasAttribute('style') }
          bindings.set(input, binding)
        }
        if (input.getAttribute('placeholder') !== 'Search') { binding.placeholder = input.getAttribute('placeholder'); input.setAttribute('placeholder','Search') }
        for (const [element, name] of [[button,'new-session'],[item,'new-item'],[row,'search-row'],[field,'search-field']]) {
          if (!element.hasAttribute(`data-codex-t3-${name}`)) element.setAttribute(`data-codex-t3-${name}`, '')
        }
        const parent = button.offsetParent
        if (!parent) continue // Hidden/collapsed native sidebar, recomputed on reveal.
        const p = parent.getBoundingClientRect(), r = field.getBoundingClientRect()
        const scale = p.width / parent.offsetWidth || 1
        const rowStyle = getComputedStyle(row), gap = parseFloat(rowStyle.columnGap)
        const action = button.getBoundingClientRect(), size = action.height / scale
        // Flex reserves inline-end space in the row's direction; left remains
        // a physical offset-parent coordinate, including its border and scroll.
        const left = rowStyle.direction === 'rtl' ? (r.left - p.left - action.width) / scale - gap : (r.right - p.left) / scale + gap
        const coordinates = { left:left - parent.clientLeft + parent.scrollLeft, top:(r.top - p.top) / scale + (r.height / scale - size) / 2 - parent.clientTop + parent.scrollTop }
        for (const [key, value] of Object.entries(coordinates)) {
          const next = `${Math.round(value * 100) / 100}px`
          if (button.style.getPropertyValue(`--codex-t3-new-${key}`) !== next) button.style.setProperty(`--codex-t3-new-${key}`,next)
        }
      }
    }
    for (const [input, binding] of bindings) if (!current.has(input)) { clear(binding); bindings.delete(input) }
    const owners = new Set([...bindings.values()].flatMap(b => [b.row,b.button.closest('[data-tour="sessions-sidebar"]')]))
    for (const element of observed) if (!owners.has(element)) { resize.unobserve(element); observed.delete(element) }
    for (const element of owners) if (!observed.has(element)) { resize.observe(element); observed.add(element) }
  }
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(sync) }
  const observed = new Set(), resize = new ResizeObserver(schedule)
  const sidebarSelector = '[data-tour="sessions-sidebar"]'
  const containsSidebar = node => node.nodeType === 1 && (node.matches(sidebarSelector) || node.querySelector(sidebarSelector))
  const mutations = new MutationObserver(records => {
    // Keep body discovery, including detached removals, without coupling layout to transcript streaming.
    if (records.some(record => {
      // Direction can change without resizing. Ignore style/class churn on
      // transcripts and our own action: only row ancestors can affect it.
      if (record.type === 'attributes' && ['dir','class','style'].includes(record.attributeName)) return [...bindings.values()].some(({row}) => record.target.contains(row))
      return record.target.closest?.(sidebarSelector)
        || (record.type === 'attributes' && observed.has(record.target))
        || (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(containsSidebar))
    })) schedule()
  })
  mutations.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['placeholder','data-tour','data-sessions-mode','dir','class','style']})
  const rootChanges = new MutationObserver(schedule)
  rootChanges.observe(document.documentElement,{attributes:true,attributeFilter:['data-codex-chat-look','dir','class','style']})
  window.addEventListener('resize',schedule)
  sync()
  return () => {
    disposed = true; cancelAnimationFrame(frame); mutations.disconnect(); rootChanges.disconnect(); resize.disconnect()
    window.removeEventListener('resize',schedule)
    for (const binding of bindings.values()) clear(binding)
    bindings.clear(); observed.clear()
  }
}
// END GENERATED T3 SIDEBAR ACTIONS RUNTIME
// BEGIN GENERATED TOOL SEQUENCES RUNTIME
// Exact native ToolIcon filled geometries, Phosphor Icons (MIT), 256x256.
/*
MIT License

Copyright (c) 2023 Phosphor Icons

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
// Source: apps/desktop/src/components/ui/tool-icon.tsx. Presentation identity
// does not establish raw tool names or hidden run membership.
const TOOL_SEQUENCE_PATHS = new Set([
  "M248,124a56.11,56.11,0,0,0-32-50.61V72a48,48,0,0,0-88-26.49A48,48,0,0,0,40,72v1.39a56,56,0,0,0,0,101.22V176a48,48,0,0,0,88,26.49A48,48,0,0,0,216,176v-1.39A56.09,56.09,0,0,0,248,124ZM88,208a32,32,0,0,1-31.81-28.56A55.87,55.87,0,0,0,64,180h8a8,8,0,0,0,0-16H64A40,40,0,0,1,51.2,86.1a8,8,0,0,0,5.6-6.83A32,32,0,0,1,120,72v75.36A47.79,47.79,0,0,0,88,136a8,8,0,0,0,0,16,32,32,0,0,1,32,32A24,24,0,0,1,88,208Zm104-44h-8a8,8,0,0,0,0,16h8a55.87,55.87,0,0,0,7.81-.56A32,32,0,1,1,136,184a32,32,0,0,1,32-32,8,8,0,0,0,0-16,47.79,47.79,0,0,0-32,11.36V72a32,32,0,0,1,63.2-7.27,8,8,0,0,0,5.6,6.83A40,40,0,0,1,192,164Z",
  "M118.18,213.08c-.11.14-.24.27-.36.4l-.16.18-.17.15a4.83,4.83,0,0,1-.42.37,3.92,3.92,0,0,1-.32.25l-.3.22-.38.23a2.91,2.91,0,0,1-.3.17l-.37.19-.34.15-.36.13a2.84,2.84,0,0,1-.38.13l-.36.1c-.14,0-.26.07-.4.09l-.42.07-.35.05a7,7,0,0,1-.79,0H64a8,8,0,0,1,0-16H92.69L55,162.34a23.85,23.85,0,0,1-7-17V95a32,32,0,1,1,16,0v50.38A8,8,0,0,0,66.34,151L104,188.69V160a8,8,0,0,1,16,0v48a7,7,0,0,1,0,.8c0,.11,0,.21,0,.32s0,.3-.07.46a2.83,2.83,0,0,1-.09.37c0,.13-.06.26-.1.39s-.08.23-.12.35l-.14.39-.15.31c-.06.13-.12.27-.19.4s-.11.18-.16.28l-.24.39-.21.28ZM208,161V110.63a23.85,23.85,0,0,0-7-17L163.31,56H192a8,8,0,0,0,0-16H143.82l-.6,0c-.14,0-.28,0-.41.06l-.37,0-.43.11-.33.08-.4.14-.34.13-.35.16-.36.18a3.14,3.14,0,0,0-.31.18c-.12.07-.25.14-.36.22a3.55,3.55,0,0,0-.31.23,3.81,3.81,0,0,0-.32.24c-.15.12-.28.24-.42.37l-.17.15-.16.18c-.12.13-.25.26-.36.4l-.26.35-.21.28-.24.39c-.05.1-.11.19-.16.28s-.13.27-.19.4l-.15.31-.14.39c0,.12-.09.23-.12.35s-.07.26-.1.39a2.83,2.83,0,0,0-.09.37c0,.16,0,.31-.07.46s0,.21-.05.32a7,7,0,0,0,0,.8V96a8,8,0,0,0,16,0V67.31L189.66,105a8,8,0,0,1,2.34,5.66V161a32,32,0,1,0,16,0Z",
  "M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM192,108.68,147.31,64l24-24L216,84.68Z",
  "M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z",
  "M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM152,88V44l44,44Z",
  "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM156,88a12,12,0,1,1-12,12A12,12,0,0,1,156,88Zm60,112H40V160.69l46.34-46.35a8,8,0,0,1,11.32,0h0L165,181.66a8,8,0,0,0,11.32-11.32l-17.66-17.65L173,138.34a8,8,0,0,1,11.31,0L216,170.07V200Z",
  "M213.66,66.34l-40-40A8,8,0,0,0,168,24H88A16,16,0,0,0,72,40V56H56A16,16,0,0,0,40,72V216a16,16,0,0,0,16,16H168a16,16,0,0,0,16-16V200h16a16,16,0,0,0,16-16V72A8,8,0,0,0,213.66,66.34ZM136,192H88a8,8,0,0,1,0-16h48a8,8,0,0,1,0,16Zm0-32H88a8,8,0,0,1,0-16h48a8,8,0,0,1,0,16Zm64,24H184V104a8,8,0,0,0-2.34-5.66l-40-40A8,8,0,0,0,136,56H88V40h76.69L200,75.31Z",
  "M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm78.36,64H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM216,128a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM128,43a115.27,115.27,0,0,1,26,45H102A115.11,115.11,0,0,1,128,43ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48Zm50.35,61.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z",
  "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,168a12,12,0,1,1,12-12A12,12,0,0,1,128,192Zm8-48.72V144a8,8,0,0,1-16,0v-8a8,8,0,0,1,8-8c13.23,0,24-9,24-20s-10.77-20-24-20-24,9-24,20v4a8,8,0,0,1-16,0v-4c0-19.85,17.94-36,40-36s40,16.15,40,36C168,125.38,154.24,139.93,136,143.28Z",
  "M168,112a56,56,0,1,1-56-56A56,56,0,0,1,168,112Zm61.66,117.66a8,8,0,0,1-11.32,0l-50.06-50.07a88,88,0,1,1,11.32-11.31l50.06,50.06A8,8,0,0,1,229.66,229.66ZM112,184a72,72,0,1,0-72-72A72.08,72.08,0,0,0,112,184Z",
  "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-91,94.25-40,32a8,8,0,1,1-10-12.5L107.19,128,75,102.25a8,8,0,1,1,10-12.5l40,32a8,8,0,0,1,0,12.5ZM176,168H136a8,8,0,0,1,0-16h40a8,8,0,0,1,0,16Z",
  "M232,96a72,72,0,0,1-100.94,66L79,222.22c-.12.14-.26.29-.39.42a32,32,0,0,1-45.26-45.26c.14-.13.28-.27.43-.39L94,124.94a72.07,72.07,0,0,1,83.54-98.78,8,8,0,0,1,3.93,13.19L144,80l5.66,26.35L176,112l40.65-37.52a8,8,0,0,1,13.19,3.93A72.6,72.6,0,0,1,232,96Z",
  "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm56,112H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z"
])
const TOOL_SEQUENCE_CODICONS = new Set([
  'codicon-terminal', 'codicon-edit', 'codicon-search', 'codicon-file',
  'codicon-files', 'codicon-globe', 'codicon-tools', 'codicon-eye',
  'codicon-brain', 'codicon-watch', 'codicon-question', 'codicon-diff', 'codicon-file-media'
])

// ReasoningAccordionGroup mounts exactly this ThinkingDisclosure shape only
// when Hermes' own showReasoning gate admits actual reasoning text. Treat its
// body as part of that one unit, never as assistant prose or hidden tool rows.
function nativeThinkingUnit(node) {
  if (!node.matches('[data-slot="aui_thinking-disclosure"][data-conversation-scaffold]')) return false
  const [row, body] = node.children
  if (node.children.length < 1 || node.children.length > 2 || !row.matches('div[class~="group/disclosure-row"]')
    || row.children.length !== 2 || !row.lastElementChild.matches('span')) return false
  const button = row.firstElementChild
  if (!button?.matches('button[type="button"][aria-expanded]:not([disabled])')
    || !['true', 'false'].includes(button.getAttribute('aria-expanded')) || button.children.length !== 2
    || !button.querySelector(':scope > span:first-child > span > span')
    || Boolean(body) !== (button.getAttribute('aria-expanded') === 'true')) return false
  if (body && (!body.matches('div[data-slot="aui_thinking-body"]')
    || body.children.length !== 1 || !body.querySelector('[data-slot="aui_reasoning-text"]'))) return false
  return ![...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim())
}

function toolSequenceGlyph(node) {
  if (nativeThinkingUnit(node)) return {kind: 'brain', value: 'thinking'}
  if (node.matches('[data-tool-group]')) {
    // Closed native summaries conceal unmounted membership. Never parse prose.
    const summary = node.querySelector(':scope > [data-tool-summary]')
    if (summary && summary.querySelector('button')?.getAttribute('aria-expanded') !== 'true') return null
    if (node.children.length !== (summary ? 2 : 1)) return null
    const wrapper = node.lastElementChild
    if (wrapper.tagName !== 'DIV' || !wrapper.children.length
      || (!summary && wrapper.children.length !== 1)
      || [...wrapper.children].some(row => !row.matches('[data-slot="tool-block"][data-tool-row]'))) return null
    const glyphs = [...wrapper.children].map(toolSequenceGlyph), first = glyphs[0]
    return first && glyphs.every(glyph => glyph?.kind === first.kind && glyph.value === first.value) ? first : null
  }
  if (!node.matches('[data-tool-row]')) return null
  // Exact ToolEntry > DisclosureRow > ScaffoldRow > ToolGlyph position.
  // Never search arbitrary SVG descendants (caret, status, timer and output).
  const cell = node.querySelector(':scope > div > [class~="group/disclosure-row"] > button > span:first-child > span > span:first-child, :scope > [class~="group/disclosure-row"] > button > span:first-child > span > span:first-child')
  if (!cell?.classList.contains('place-items-center') || cell.children.length !== 1) return null
  const icon = cell.firstElementChild
  if (icon.tagName.toLowerCase() === 'i') {
    const identities = [...icon.classList].filter(name => name.startsWith('codicon-'))
    return icon.classList.contains('codicon') && !icon.children.length && identities.length === 1
      && TOOL_SEQUENCE_CODICONS.has(identities[0]) ? {kind: 'codicon', value: identities[0]} : null
  }
  if (icon.namespaceURI !== 'http://www.w3.org/2000/svg' || icon.tagName !== 'svg'
    || icon.getAttribute('viewBox') !== '0 0 256 256' || icon.getAttribute('fill') !== 'currentColor'
    || icon.children.length !== 1 || icon.childNodes.length !== 1) return null
  // Attributes are validated, never copied. Events, href, filters, embedded
  // foreignObject and animation cannot enter the plugin-owned mask.
  const safeRootAttributes = new Set(['aria-hidden', 'class', 'fill', 'style', 'viewBox'])
  if ([...icon.attributes].some(attr => !safeRootAttributes.has(attr.name))) return null
  if (icon.getAttribute('aria-hidden') !== 'true' || (icon.getAttribute('class') || '').length > 512
    || !/^[\w\s()[\].:/%-]*$/.test(icon.getAttribute('class') || '')
    || [...icon.style].some(name => !['width', 'height'].includes(name)
      || !/^(?:\d{1,3})(?:\.\d{1,4})?(?:px|rem|em)$/.test(icon.style.getPropertyValue(name)))) return null
  const path = icon.firstElementChild, d = path.getAttribute('d')
  if (path.namespaceURI !== icon.namespaceURI || path.tagName !== 'path' || path.attributes.length !== 1
    || path.childNodes.length || !d || d.length > 4096
    || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,+\s-]+$/.test(d) || !TOOL_SEQUENCE_PATHS.has(d)) return null
  return {kind: 'svg', value: d}
}

function paintToolSequenceGlyph(header, units, selected) {
  const glyphs = units.map(toolSequenceGlyph), first = glyphs[0]
  const glyph = selected !== undefined ? selected : first && glyphs.every(item => item?.kind === first.kind && item.value === first.value) ? first : null
  const identity = glyph ? JSON.stringify(glyph) : ''
  if ((header.getAttribute('data-codex-tool-sequence-glyph-identity') || '') === identity) return
  header.querySelector('[data-codex-tool-sequence-icon]')?.remove()
  header.style.removeProperty('--codex-tool-sequence-mask')
  header.removeAttribute('data-codex-tool-sequence-glyph')
  header.removeAttribute('data-codex-tool-sequence-glyph-identity')
  if (!glyph) return
  header.setAttribute('data-codex-tool-sequence-glyph-identity', identity)
  header.setAttribute('data-codex-tool-sequence-glyph', glyph.kind)
  if (glyph.kind === 'svg') {
    // Fixed markup and allowlisted exact path only; no native innerHTML/nodes.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="black"><path d="${glyph.value}"/></svg>`
    header.style.setProperty('--codex-tool-sequence-mask', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
  } else if (glyph.kind === 'codicon') {
    const icon = document.createElement('i')
    icon.className = `codicon ${glyph.value}`
    icon.setAttribute('aria-hidden', 'true')
    icon.setAttribute('data-codex-tool-sequence-icon', '')
    header.querySelector('button').firstElementChild.append(icon)
  }
}


// Public DOM seam: native fallback.tsx ToolRun / ToolFallback, ScaffoldRow.
// Native parts never move. Only this runtime's sibling headers and attributes
// are owned here; unknown parts, user input and actionable content are barriers.
function createToolSequenceDisclosureMemory(rootSelector, surface, owned, skip) {
  // Ephemeral presentation choices only. No transcript, labels or storage.
  const disclosures = new Map()
  let owner = '', qualified = false
  function completeOwner(scope) {
    // groupingScope's published connection/profile/runtime/stored owner. A
    // draft, unresolved owner or focused tile must not inherit workspace UI.
    if (typeof scope !== 'string' || scope.length > 8192) return false
    let value
    try { value = JSON.parse(scope) } catch { return false }
    return Array.isArray(value) && value.length === 7
      && [value[0], value[2], value[3], value[4], value[5], value[6]].every(part => typeof part === 'string' && part.length > 0)
      && Array.isArray(value[1]) && value[1].length === 2
      && value[1][0] === value[0] && value[1][1] === value[2]
      && value[3] === value[5] && value[4] === value[6]
  }
  return {
    syncOwner(scope, incarnation) {
      const next = JSON.stringify([scope, incarnation])
      if (owner !== next) { disclosures.clear(); owner = next; qualified = completeOwner(scope) }
    },
    identity(pair, units, key) {
      if (!qualified || surface(pair)?.getAttribute('data-session-anchor') !== 'workspace') return ''
      const content = units[0].parentElement, root = content?.parentElement
      if (!content?.matches('[data-slot="aui_assistant-message-content"]') || !root?.matches(rootSelector)) return ''
      const id = root.getAttribute('data-message-id'), users = owned(pair, '[data-role="user"][data-message-id]')
      const stable = value => typeof value === 'string' && value.length > 0 && value.length <= 1024
        && !/^(?:user|assistant)-(?:inflight|queued|pending)(?:-|$)/i.test(value)
      if (!stable(id) || users.length !== 1 || !stable(users[0].getAttribute('data-message-id'))
        || owned(pair, rootSelector).filter(node => node.getAttribute('data-message-id') === id).length !== 1) return ''
      const parts = [...content.childNodes].filter(node => node instanceof Element ? !skip(node) : node.textContent.trim())
      // Hermes publishes message IDs, not ToolRun/call IDs. Only an entire
      // execution-only message is uniquely owned by that native ID. Never key
      // multiple within-message groups by ordinal, glyph or a localized label.
      return parts.length === units.length && parts.every((node, index) => node === units[index])
        ? JSON.stringify([key, id]) : ''
    },
    initial(key, fallback) { return disclosures.has(key) ? disclosures.get(key) : fallback },
    remember(record) {
      if (!record.memoryKey) return
      disclosures.delete(record.memoryKey)
      disclosures.set(record.memoryKey, record.open)
      if (disclosures.size > 100) disclosures.delete(disclosures.keys().next().value)
    },
    clear() { disclosures.clear() }
  }
}

function toolSequenceFactualSummary(units, nativeRows, compact) {
  const captions = []
  let more = false
  // Match T3's settled mixed-group policy without reading reasoning bodies.
  // A native reasoning disclosure can fold several parts; its mounted count
  // cannot establish T3's Thought (×N), so reasoning-only captions stay native.
  const tools = units.filter(node => !nativeThinkingUnit(node))
  for (const node of tools.length ? tools : units) {
    // A native group owns its summary even when its members are unmounted.
    // Read only ScaffoldRow's label, never its clock, body, or hidden rows.
    const summary = node.matches('[data-tool-group]') && node.querySelector(':scope > [data-tool-summary]')
    let caption
    if (summary) {
      const title = summary.querySelector(':scope > [class~="group/disclosure-row"] > button > span:first-child > span > span:first-child')
      if (!title?.className.includes('conversation-scaffold-text')
        || [...title.children].some(child => !child.matches('span.shimmer') || child.children.length)
        || title.textContent.length > 1024) return null
      caption = title.textContent.trim()
    } else if (node.matches('[data-tool-group]')) {
      const rows = nativeRows([node])
      if (rows.length === 1) caption = compact(rows[0])?.label
    } else caption = compact(node)?.label
    // No authoritative caption means no aggregate: leave that run native.
    // Identical captions are a sample, not a count or category inference.
    if (!caption || /^tool activity$/i.test(caption)) return null
    if (!captions.includes(caption)) {
      if (captions.length < 3) captions.push(caption)
      else more = true
    }
  }
  return captions.join(' · ') + (more ? ' · …' : '')
}

function createToolSequenceRuntime(currentScope, currentIncarnation) {
  const states = new Map()
  const rootSelector = '[data-role="assistant"][data-slot="aui_assistant-message-root"]'
  const ownedSelector = '[data-codex-tool-sequence]'
  const itemAttribute = 'data-codex-tool-sequence-item'
  const busySelector = '[data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"]'
  const pairUnsafeSelector = `${TURN_ACTION_SELECTOR}, ${TURN_FAILURE_SELECTOR}, [role="alert"], [data-slot="aui_assistant-message-stopped"]`
  const unsafeSelector = `${pairUnsafeSelector}, [data-slot="aui_generated-image"], [data-slot="aui_artifact-card"], [data-slot="aui_markdown-alert"], [data-slot="aui_zoomable-image"], img, audio, video, iframe`
  let active = true
  const surface = pair => pair.closest('[data-session-anchor], [data-slot="aui_thread-content"]')
  const owned = (pair, selector) => [...pair.querySelectorAll(selector)].filter(node => node.closest('[data-slot="aui_turn-pair"]') === pair)
  const identity = (pair, scope) => {
    const user = owned(pair, '[data-role="user"][data-message-id]')[0]?.getAttribute('data-message-id')
    const first = owned(pair, rootSelector)[0]?.getAttribute('data-message-id')
    return user && first ? JSON.stringify([scope, surface(pair)?.getAttribute('data-session-anchor') || '', user, first]) : ''
  }
  const nativeOwner = unit => {
    const root = unit.closest(rootSelector)
    return {root, id: root?.getAttribute('data-message-id') || ''}
  }
  const nativeOwnersMatch = (record, units) => units.every(unit => {
    const previous = record.nativeOwners?.get(unit)
    if (!previous) return true // Appending new units is not a native rebind.
    const current = nativeOwner(unit)
    return previous.root === current.root && previous.id === current.id
  })
  const protectedPart = node => node.matches(unsafeSelector) || node.querySelector(unsafeSelector)
  const skip = node => node.matches(`${ownedSelector}, [data-codex-turn-activity], [data-slot="timeline-timestamp"]`)
    || node.matches(busySelector)
    || (node.matches('[data-slot="aui_message-streaming-marker"]') && !node.textContent.trim() && !node.children.length)
  const toolUnitSelector = '[data-slot="tool-block"]:is([data-tool-group], [data-tool-row])'
  const unit = node => (node.matches(toolUnitSelector) || nativeThinkingUnit(node))
    && !node.matches(ownedSelector) && !protectedPart(node)
  const disclosures = createToolSequenceDisclosureMemory(rootSelector, surface, owned, skip)
  function safeBoundaries(pair) {
    for (const node of owned(pair, pairUnsafeSelector)) {
      if (node.matches('[data-slot="aui_assistant-message-stopped"]')) return false
      let part = node
      while (part.parentElement && !part.parentElement.matches('[data-slot="aui_assistant-message-content"]')) part = part.parentElement
      const root = part.parentElement?.parentElement
      if (!root?.matches(rootSelector) || root.closest('[data-slot="aui_turn-pair"]') !== pair) return false
      // Native action cards are direct message parts. An unknown wrapper or
      // action nested inside a tool establishes no narrower ownership scope.
      if (part.matches(TURN_ACTION_SELECTOR)) continue
      if (!part.matches(toolUnitSelector) || part.matches(ownedSelector)
        || part.querySelector(TURN_ACTION_SELECTOR)) return false
    }
    return true
  }

  function runs(pair) {
    const result = []
    let pending = []
    const boundary = () => { if (pending.length) result.push(pending); pending = [] }
    const part = node => {
      if (node.nodeType === 3) { if (node.textContent.trim()) boundary(); return }
      if (!(node instanceof Element) || skip(node)) return
      if (unit(node)) pending.push(node)
      else boundary()
    }
    const visit = parent => {
      for (const node of parent.childNodes) {
        if (!(node instanceof Element)) { part(node); continue }
        if (skip(node)) continue
        if (node.matches(rootSelector) && node.closest('[data-slot="aui_turn-pair"]') === pair) {
          for (const child of node.childNodes) {
            if (child instanceof Element && child.matches('[data-slot="aui_assistant-message-content"]')) {
              for (const directPart of child.childNodes) part(directPart)
            } else part(child)
          }
        } else if (node.matches('[data-slot="aui_response-group"]')) visit(node)
        else boundary()
      }
    }
    visit(pair)
    const tail = pending
    boundary()
    return {groups: result, tail}
  }
  const attr = (node, name, value) => {
    if (value === null) { if (node.hasAttribute(name)) node.removeAttribute(name) }
    else if (node.getAttribute(name) !== value) node.setAttribute(name, value)
  }
  const nativeRows = units => units.flatMap(node => {
    if (node.matches('[data-tool-row]') || nativeThinkingUnit(node)) return [node]
    const ticker = node.querySelector(':scope > [data-tool-ticker] > .tool-ticker__reel')
    if (ticker) {
      const rows = [...ticker.children]
      return rows.every(row => row.matches('.tool-ticker__row') && row.children.length === 1
        && row.firstElementChild.matches('[data-slot="tool-block"][data-tool-row]'))
        ? rows.map(row => row.firstElementChild) : []
    }
    const wrapper = node.lastElementChild
    return wrapper?.tagName === 'DIV' && !wrapper.matches('[data-tool-summary]')
      && [...wrapper.children].every(row => row.matches('[data-slot="tool-block"][data-tool-row]'))
      ? [...wrapper.children] : []
  })
  function compact(row) {
    if (nativeThinkingUnit(row)) {
      // Only the native label is public activity metadata. Neither the body
      // nor the trailing clock establishes the label or its running state.
      const title = row.querySelector(':scope > [class~="group/disclosure-row"] > button > span:first-child > span > span')
      if (!title?.className.includes('conversation-scaffold-text') || title.children.length
        || !title.textContent.trim() || title.textContent.length > 1024) return null
      return {row, label: title.textContent.trim(), running: title.classList.contains('shimmer'), glyph: toolSequenceGlyph(row)}
    }
    const cells = row.querySelector(':scope > div > [class~="group/disclosure-row"] > button > span:first-child > span, :scope > [class~="group/disclosure-row"] > button > span:first-child > span')
    if (!cells || cells.children.length < 2 || !cells.firstElementChild.classList.contains('place-items-center')) return null
    const title = cells.children[1]
    if (!title.className.includes('conversation-scaffold-text') || title.querySelector('button,input,img,svg,code,pre')
      || title.textContent.length > 1024 || !title.textContent.trim()) return null
    const running = !!cells.firstElementChild.querySelector(':scope > [role="status"] > .glyph-spinner')
    return {row, label: title.textContent.trim(), running, glyph: toolSequenceGlyph(row)}
  }
  function thinking(pair, enabled) {
    for (const row of owned(pair, `${busySelector}, [data-codex-activity-busy]`)) {
      const generic = enabled && row.matches(busySelector) && row.getAttribute('aria-label') !== 'Summarizing thread'
        && !row.querySelector('.shimmer') && row.querySelector(':scope > .dither')
      attr(row, 'data-codex-activity-busy', generic ? '' : null)
      let face = row.querySelector(':scope > [data-codex-activity-face]')
      if (!generic) { face?.remove(); continue }
      if (!face) {
        face = document.createElement('span')
        face.setAttribute('data-codex-activity-face', '')
        face.setAttribute('aria-hidden', 'true')
        face.innerHTML = '<span data-codex-activity-content><span data-codex-activity-icon></span><span>Thinking</span></span><span data-codex-activity-sweep><span><span data-codex-activity-content><span data-codex-activity-icon></span><span>Thinking</span></span></span></span>'
        row.insertBefore(face, row.lastElementChild)
      }
    }
  }
  const clearPair = pair => {
    for (const record of states.get(pair)?.records.values() || []) restoreFocus(record)
    for (const node of owned(pair, `[${itemAttribute}]`)) node.removeAttribute(itemAttribute)
    for (const node of owned(pair, '[data-codex-activity-native-current]')) node.removeAttribute('data-codex-activity-native-current')
    thinking(pair, false)
    for (const row of owned(pair, '[data-codex-activity-owned]')) row.removeAttribute('data-codex-activity-owned')
    for (const header of owned(pair, ownedSelector)) { header.querySelector('button').onclick = null; header.remove() }
    attr(pair, 'data-codex-tool-sequence-local-safe', null)
    states.delete(pair)
  }
  function restoreFocus(record) {
    for (const [node, value] of record.focus || []) {
      if (node.getAttribute('tabindex') === '-1') attr(node, 'tabindex', value)
    }
    record.focus?.clear()
  }
  const apply = record => {
    attr(record.button, 'aria-expanded', String(record.open))
    attr(record.header, 'data-codex-activity-live', record.current ? '' : null)
    for (const node of record.units) {
      attr(node, itemAttribute, record.open ? null : record.current ? 'live-collapsed' : 'collapsed')
    }
    for (const row of nativeRows(record.units)) attr(row, 'data-codex-activity-native-current', !record.open && row === record.current?.row ? '' : null)
    const focusables = new Set(!record.open && record.current
      ? record.units.flatMap(unit => [...unit.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')]) : [])
    record.focus ||= new Map()
    for (const [node, value] of record.focus) if (!focusables.has(node)) {
      if (node.getAttribute('tabindex') === '-1') attr(node, 'tabindex', value)
      record.focus.delete(node)
    }
    for (const node of focusables) {
      if (!record.focus.has(node)) record.focus.set(node, node.getAttribute('tabindex'))
      attr(node, 'tabindex', '-1')
    }
  }
  function reconcile(pair, scope) {
    if (!active) return
    const key = identity(pair, scope), owner = surface(pair), incarnation = currentIncarnation()
    disclosures.syncOwner(scope, incarnation)
    if (!owner || !key || !safeBoundaries(pair)
      || owned(pair, '[data-slot="aui_thinking-disclosure"]').some(node => !nativeThinkingUnit(node))) { clearPair(pair); return }
    let state = states.get(pair)
    if (state && (state.key !== key || state.surface !== owner || state.incarnation !== incarnation)) { clearPair(pair); state = null }
    const previous = state?.records || new Map(), records = new Map()
    const {groups, tail} = runs(pair)
    // CSS integration may admit this certified local topology, never the
    // protected units themselves. Global/unknown failures still clear above.
    attr(pair, 'data-codex-tool-sequence-local-safe', owned(pair, pairUnsafeSelector).length ? '' : null)

    const live = pair.getAttribute('data-codex-activity-phase') === 'working'
      || owned(pair, '[data-role="assistant"][data-streaming="true"], [data-message-streaming="true"]')
      .length > 0 || owned(pair, busySelector).length > 0
    let hasCurrent = false
    for (const units of groups) {
      const first = units[0]
      let record = previous.get(first)
      if (record && !nativeOwnersMatch(record, units)) {
        restoreFocus(record)
        record.button.onclick = null
        record.header.remove()
        record = null
      }
      const isTail = units === tail && live
      const lastUnit = units.at(-1)
      const terminalRows = isTail ? nativeRows([lastUnit]) : []
      const terminal = terminalRows.length ? compact(terminalRows.at(-1)) : null
      // An older opaque run cannot veto a newer mounted activity. But an
      // opaque terminal unit proves no latest name, even if an older row runs.
      // Match ToolRunTicker: the last row of the last native unit is current.
      const current = terminal
        || (isTail && !terminalRows.length && lastUnit.matches('[data-tool-group]')
          && record?.lastUnit === lastUnit && record.current
          && toolSequenceFactualSummary([lastUnit], nativeRows, compact)
          ? {label: record.current.label, glyph: record.current.glyph, running: false, row: null} : null
        )
      if (units.length < 2 && !current) continue
      // Native ToolRun may unmount its ticker while the owning turn still
      // works. Keep only its witnessed public caption until a prose boundary;
      // never retain a detached row, infer a spinner or borrow another unit.
      const label = current?.label || toolSequenceFactualSummary(units, nativeRows, compact)
      if (!label || /^tool activity$/i.test(label)) continue
      const memoryKey = disclosures.identity(pair, units, key)
      if (!record) {
        // A header can survive the existing 300ms plugin hot-reload handoff.
        const old = first.previousElementSibling
        const header = old?.matches(ownedSelector) && old.getAttribute('data-codex-tool-sequence-owner') === key ? old : document.createElement('div')
        if (header !== old) {
          header.setAttribute('data-codex-tool-sequence', '')
          header.setAttribute('data-codex-tool-sequence-owner', key)
          header.setAttribute('data-slot', 'tool-block')
          header.setAttribute('data-tool-summary', '')
          header.setAttribute('data-conversation-scaffold', '')
          header.innerHTML = '<div class="group/disclosure-row"><button type="button" aria-expanded="false"><span data-codex-activity-face aria-hidden="true"><span data-codex-activity-content><span data-codex-activity-icon></span><span data-codex-tool-sequence-label></span></span></span><span aria-hidden="true">›</span></button></div>'
          first.before(header)
        }
        const button = header.querySelector('button')
        record = {header, button, units, open: disclosures.initial(memoryKey, button.getAttribute('aria-expanded') === 'true')}
      }
      record.units = units
      record.nativeOwners = new Map(units.map(unit => [unit, nativeOwner(unit)]))
      record.memoryKey = memoryKey
      record.current = current
      record.lastUnit = units.at(-1)
      hasCurrent ||= !!current
      paintToolSequenceGlyph(record.header, units, current ? current.glyph : undefined)
      attr(record.header, 'data-codex-activity-running', current?.running ? '' : null)
      // React may insert a new prose boundary before the same first tool.
      // Reposition only our sibling, never any native part.
      if (record.header.parentElement !== first.parentElement || record.header.nextElementSibling !== first) first.before(record.header)
      // Native summary counts stay verbatim in their own clause. Never add
      // them to mounted rows or infer commands/files from glyphs or locale.
      const labelNode = record.header.querySelector('[data-codex-tool-sequence-label]')
      if (labelNode.textContent !== label) labelNode.textContent = label
      // Reconstruct only the safe face, never a React-owned reasoning row.
      const face = record.header.querySelector('[data-codex-activity-face]')
      let sweep = face.querySelector('[data-codex-activity-sweep]')
      const brainRunning = current?.glyph?.kind === 'brain' && current.running
      if (!brainRunning) sweep?.remove()
      else {
        if (!sweep) {
          sweep = document.createElement('span')
          sweep.setAttribute('data-codex-activity-sweep', '')
          sweep.innerHTML = '<span><span data-codex-activity-content><span data-codex-activity-icon></span><span data-codex-activity-caption></span></span></span>'
          face.append(sweep)
        }
        const caption = sweep.querySelector('[data-codex-activity-caption]')
        if (caption.textContent !== label) caption.textContent = label
      }
      attr(record.button, 'aria-label', label)
      if (!record.bound) record.button.onclick = () => {
        // Fence late clicks before the dirty-pair scheduler sees a new route.
        if (!active || !pair.isConnected || currentScope() !== scope || currentIncarnation() !== incarnation || surface(pair) !== owner
          || identity(pair, currentScope()) !== key || states.get(pair)?.records.get(first) !== record) return
        if (!safeBoundaries(pair)) { clearPair(pair); return }
        if (!nativeOwnersMatch(record, record.units)) { reconcile(pair, scope); return }
        if (!runs(pair).groups.some(units => units.length === record.units.length && units.every((node, index) => node === record.units[index]))) {
          reconcile(pair, scope)
          return
        }
        record.open = !record.open
        // Revalidate the complete native message on interaction as React may
        // have changed its parts before the observer has reconciled them.
        record.memoryKey = disclosures.identity(pair, record.units, key)
        disclosures.remember(record)
        apply(record)
        // This explicit user click opens native run disclosures, not tool
        // result/action controls. Reconciliation never clicks native UI.
        if (record.open) for (const unit of record.units) {
          // Mounted rows already expose their native controls on expansion.
          // Forward only an opaque run summary whose members are unmounted;
          // opening a live ticker would replace those nodes and their handlers.
          if (!unit.matches('[data-tool-group]') || nativeRows([unit]).length) continue
          const toggle = unit.querySelector(':scope > [data-tool-summary] > [class~="group/disclosure-row"] > button')
          if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click()
        }
      }
      record.bound = true
      apply(record)
      records.set(first, record)
    }
    const retained = new Set([...records.values()].map(record => record.header))
    for (const record of previous.values()) if (!retained.has(record.header)) restoreFocus(record)
    const retainedUnits = new Set([...records.values()].flatMap(record => record.units))
    for (const node of owned(pair, `[${itemAttribute}]`)) if (!retainedUnits.has(node)) attr(node, itemAttribute, null)
    for (const node of owned(pair, '[data-codex-activity-native-current]')) {
      if (![...records.values()].some(record => !record.open && record.current?.row === node)) attr(node, 'data-codex-activity-native-current', null)
    }
    // The native status and timer stay mounted. Only its duplicate visual face
    // is suppressed while an observed active tail owns the activity slot.
    for (const row of owned(pair, busySelector)) attr(row, 'data-codex-activity-owned', hasCurrent ? '' : null)
    thinking(pair, !hasCurrent)
    for (const header of owned(pair, ownedSelector)) if (!retained.has(header)) { header.querySelector('button').onclick = null; header.remove() }
    states.set(pair, {key, surface: owner, incarnation, records})
  }
  return {
    reconcile,
    reconcileObserved(pair, scope) {
      const state = states.get(pair)
      // Only refresh an already-owned projection before paint. New pairs and
      // owner handoffs still enter through the normal bounded scheduler.
      if (!active || !pair.isConnected || !state?.records.size
        || state.key !== identity(pair, scope) || state.surface !== surface(pair)
        || state.incarnation !== currentIncarnation()) return
      reconcile(pair, scope)
    },
    pruneDisconnected() {
      for (const [pair] of states) if (!pair.isConnected) clearPair(pair)
    },
    deactivate() {
      active = false
      disclosures.clear()
      for (const state of states.values()) for (const record of state.records.values()) restoreFocus(record)
    },
    cleanup() {
      active = false
      // Disable may precede the first scheduled adoption after hot reload.
      const pairs = new Set(states.keys())
      for (const node of document.querySelectorAll(`${ownedSelector}, [${itemAttribute}], [data-codex-activity-busy], [data-codex-activity-owned], [data-codex-tool-sequence-local-safe]`)) {
        const pair = node.closest('[data-slot="aui_turn-pair"]')
        if (pair) pairs.add(pair)
      }
      for (const pair of pairs) clearPair(pair)
      states.clear()
      disclosures.clear()
    }
  }
}
// END GENERATED TOOL SEQUENCES RUNTIME
// BEGIN GENERATED LIVE TURN CLOCK RUNTIME
// Presentation only: origins are observed message.start or native
// session.info.turn_started_at, never mount age or a tool/Thinking timer.
function formatLiveTurnActivityDuration(value) {
  if (!Number.isFinite(value) || value < 0) return ''
  const seconds = Math.floor(value)
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}hour ${Math.floor(seconds / 60) % 60}min`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}min ${seconds % 60}s`
  return `${seconds}s`
}

function createLiveTurnClock(now = () => Date.now()) {
  let record = null
  const current = scope => {
    if (record && record.scope !== scope) record = null
    return record
  }
  const fresh = (scope, startedAt, authoritative) => {
    record = { scope, startedAt, authoritative, endedAt: null, userId: '' }
  }
  const finish = scope => {
    const item = current(scope)
    if (item && item.endedAt === null) item.endedAt = now()
  }
  return {
    start(scope) {
      const item = current(scope)
      if (!item || item.endedAt !== null) fresh(scope, now(), false)
    },
    info(scope, payload) {
      const item = current(scope)
      if (payload?.running === false) { finish(scope); return }
      const seconds = payload?.turn_started_at
      if (payload?.running !== true || typeof seconds !== 'number' || !Number.isFinite(seconds)
        || seconds <= 0 || seconds * 1000 > now()) return
      const startedAt = seconds * 1000
      if (!item) fresh(scope, startedAt, true)
      else if (!item.authoritative && item.endedAt === null) {
        item.startedAt = startedAt
        item.authoritative = true
      } else if (startedAt > item.startedAt) fresh(scope, startedAt, true)
    },
    finish,
    running(scope) { const item = current(scope); return Boolean(item && item.endedAt === null) },
    label(scope, userId, uniquelyLive) {
      const item = current(scope)
      if (!item || !uniquelyLive || !userId || item.userId && item.userId !== userId) return ''
      item.userId = userId
      return formatLiveTurnActivityDuration(Math.max(0, Math.floor(((item.endedAt ?? now()) - item.startedAt) / 1000)))
    },
    clear() { record = null }
  }
}
// END GENERATED LIVE TURN CLOCK RUNTIME
