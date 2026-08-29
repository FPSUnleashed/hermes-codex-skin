# Changelog

All notable changes to this project are documented here.

## Unreleased

### Improved

- Reworked the **Attach** menu into a compact 240 px popover with smaller rows, text and icons, native `+` anchoring, composer-matched surface chrome and a tighter menu-scale radius.

## [1.3.1] - 2026-08-29

### Improved

- Reduced the composer task-status contrast by blending the active theme's tertiary color into the chat background, keeping the panel quieter without replacing the selected theme.

### Verification

- 65 automated checks pass.
- The final contrast was selected in the live Hermes Desktop renderer with the Solarized light theme.

## [1.3.0] - 2026-08-29

### Added

- Optional **Pinned user messages** command-palette setting with persisted `Hermes` and `Off` modes. Native Hermes pinning remains the default.

### Verification

- 64 automated checks pass.
- The exact toggle was validated in the live Hermes Desktop renderer: `Hermes` keeps `position: sticky`, `Off` applies `position: static`, and switching back restores native pinning.

## [1.2.0] - 2026-08-27

### Added

- Native Hermes theme support without changing the Codex layout, typography, dimensions or density.
- Live theme repainting when the selected Hermes theme changes.

### Improved

- Replaced the simulated composer outline with a real, uniform 0.5 px border and a separate shadow.
- Aligned the Tasks, Queue and Background panel with the composer's rounded edges, without a border or shadow.
- Kept light and dark surfaces consistent with the selected Hermes theme.

### Fixed

- Restored native Glass/Clear window translucency when the **Codex Skin** theme is selected.
- Reserved dynamic lanes for Voice dictation and Reading aloud above Tasks, Queue and Background instead of allowing overlap.
- Fixed the composer border appearing thicker in its rounded corners.

### Removed

- Removed the opaque sticky rectangle above the transcript. Its masking effect could not stay perfectly aligned while scrolling without fragile DOM manipulation, which caused visible drift. Messages now pass naturally behind the pinned user message instead.

### Preserved and compatible

- The original Codex color palette remains available exclusively through the **Codex Skin** theme in **Settings → Appearance**.
- Stable plugin, theme and installation IDs for in-place updates.
- Hermes-native Tasks, Queue, Background, Voice dictation and Reading aloud behavior.

### Verification

- 62 automated checks pass.
- Voice dictation, Reading aloud, Tasks, native themes and Glass were validated in the live Hermes Desktop app.

## [1.1.0] - 2026-08-27

### Added

- Optional **Composer width** command-palette setting with persisted `Codex` and native-width `Hermes` modes.
- Direct installation through current Hermes Desktop using the exact repository subdirectory.
- Native Queue-edit banner styling and inline sent-message editing that reuse the Codex bubble language without replacing Hermes handlers.
- Semantic Tasks-section detection so only the expanded task list scrolls while Queue, Background and sibling status sections remain fixed.
- Matching compact Codex styling for Hermes' native **Voice dictation** status and active control.

### Improved

- Corrected the Codex composer from an incorrect 1180 CSS px interpretation to the measured 736 CSS px Retina conversion.
- Matched the composer to a 21 px radius with responsive 16 px minimum side gutters.
- Bound the portaled `+` menu and shared status panel to the rendered composer instead of the viewport.
- Kept floating and popped-out composers on Hermes-owned width rather than forcing the main-column override onto them.
- Reduced long user-message clamping from eight lines / 198 px to four lines / 110 px while preserving manual expansion.
- Made task rows denser and limited scrolling to the Tasks body.
- Removed status-section divider lines in light and dark themes while preserving real dark menu separators.
- Kept the Tasks and Queue card 14 px inside the composer on both sides, without clipped gutters, square scrollbar artifacts, black shadows or overlap behind the composer.
- Made selected and unselected sidebar rows use the same native height; selection now changes paint only.
- Restyled Hermes' native **Reading aloud** surface as a compact neutral Codex row with a quieter icon, shorter waveform and native Stop behavior.
- Added equal 12 px spacing above and below **Reading aloud**.
- Replaced the stepped height animation with a 240 ms GPU-composited movement for smoother **Reading aloud** entry and exit.
- Moved voice status rows out of layout so starting or ending audio never shifts the composer vertically.
- Kept the 250 ms bridge for consecutive audio, reduced-motion handling and complete hot-reload cleanup.
- Restyled Queue editing with compact neutral actions, a pill-shaped Save action and a dark-mode treatment without the old blue border.
- Restyled the native inline sent-message editor to match the Codex user bubble.
- Narrowed the runtime observer away from ordinary streamed text and sidebar mutations.
- Replaced repeated full-history rescans and four delayed reconciliation sweeps with bounded idle batches.
- Replaced the latest-turn full query/reverse pass with a backward tree walk.
- Kept model-effort labels in stable English copy: `Low`, `Medium`, `High` and `Extra High`, even when Hermes uses another locale.

### Fixed

- Restored Hermes' native auto-speak and wake-word controls inside the composer.
- Kept progressive assistant text rendering on Hermes' native streaming path without buffering it in the skin.
- Preserved the dark context-menu separator after removing status-card separators.
- Documented the GitHub `/blob/.../plugin.js` mistake that returns HTML and causes `Unexpected token '<'`, then added the safe built-in and raw-file install paths.

### Removed

- Custom sidebar scrollbar detection, layout-style reads and per-element scroll listeners.
- Repeated session-settle rescan timers that reprocessed long histories after navigation.
- The incorrect 1180 px main-column width and previous 25 px composer radius.
- Synthetic README screenshots; no generated fixture is presented as a real Hermes capture.

### Preserved and compatible

- Hermes' native model and Thinking Level menus.
- Hermes' native Queue storage, ordering, edit, send, Stop and retry handlers. Codex Skin styles these surfaces but never writes, removes or migrates queued data.
- Hermes' native assistant-turn rendering, commentary, tool calls, final answers, generated media, Clarify questions, approvals and alerts.
- Stable internal plugin ID, theme ID and installation folder for in-place updates.
- No backend, network requests or external assets.
- No persisted message text, prompt hashes or content-derived fingerprints. Only bounded expansion IDs and the Composer-width preference are stored.

### Known Hermes Desktop issue

- Queue persistence and transcript rehydration remain owned by Hermes Desktop. Some current Hermes builds can lose the visible queued rows after switching/reloading a compressed chat, or fail to show a background-sent message when returning. Codex Skin neither causes nor fixes that native session-routing bug.

### Verification

- The automated regression suite covers the v1.0.0 contracts and every v1.1.0 behavior above.
- JavaScript syntax and Hermes' actual ESM runtime-loader parser pass.
- Automated runtime gates cover long-message expansion, composer geometry, sidebar height, Tasks scrolling, editing and playback motion.
- In the synthetic 150-turn / 200-mutation fixture, initial decoration is about 45% lighter and streamed-mutation processing about 10x faster than the previous installed runtime.
- The exact candidate hot-reloaded on macOS without restarting Hermes; the process stayed alive and fresh plugin-load errors remained at zero.

## [1.0.0] - 2026-08-10

### Added

- Stable Codex-inspired light and dark visual layer for Hermes Desktop.
- Automated CI for syntax, regression tests and checksum verification.

### Fixed

- Preserved exact native message text across disable and hot reload.
- Kept every label created by Codex Skin in English.

### Preserved

- Native Hermes model and Thinking Level menus.
- Full visibility of commentary, tools, loaders, tasks, approvals and media.
- Existing `codex-chat-look` installation path and internal IDs for in-place updates.

## [1.0.0-beta.3] - 2026-08-10

### Fixed

- Kept every label created by Codex Skin in English, regardless of the Hermes or system locale.
- Replaced the French long-message controls and model effort labels with English copy.
- Added regression tests for English-only plugin UI copy.

## [1.0.0-beta.2] - 2026-08-10

### Fixed

- Preserved the exact native user-message text when image attachment markers are hidden, including after disable and hot reload.
- Removed obsolete Queue decoration state and cleanup paths.

### Changed

- Renamed the public plugin and visible theme label to **Codex Skin**.
- Kept the internal plugin ID, theme ID and installation folder stable for in-place updates.
- Removed unused lifecycle and model metadata code.
- Added regression tests for marker ownership, cleanup, hot reload and the Maintainer findings.

## [1.0.0-beta.1] - 2026-08-10

### Added

- Self-contained Codex-inspired visual treatment for Hermes Desktop.
- Light and dark `Codex Chat` theme palettes.
- Styling for the sidebar, composer, Queue, messages, media, menus, loaders, Tasks, Background activity, Clarify and Approval surfaces.
- Eight-line / 198 px user-message clamp with manual expansion.

### Preserved

- Native Hermes model selection and Thinking Level menus.
- Commentary, intermediate activity and completed turns.
- Native plugin enable, disable and hot-reload lifecycle.

### Removed before publication

- Custom model-selection replacement.
- Turn collapsing, execution summaries, duration timers and projection state.
- Core Hermes patches and external runtime dependencies.
