// T3 SubagentTimelineLink, not WorkLog/card geometry. T3 Code (MIT),
// pingdotgg/t3code@6d450a4284852af137b2f3407fddd89eb76e7644,
// V2LifecycleRow.tsx:205-245,358-505. Provenance/limits: docs/t3-subagent-style.md.
// CSS only: native goal button, agent identity, status, timer and preview remain owned by Hermes.
export const T3_SUBAGENT_CSS = String.raw`
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
