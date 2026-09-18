# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## [1.8.1] - 2026-09-18

### Added

- GitHub-hosted images in release-history previews, supporting Markdown and HTML image syntax without executing release HTML or event handlers. Images load on opening the menu and stay within its bounds.

### Fixed

- Center left and right window controls against their actual extended tab bands, including after pane rearrangement or resizing. Preserve native placement when controls and tabs use separate rows.
- Align chat, sidebar and preview tab bands vertically with equal top/bottom spacing, keeping the existing preview tab size and native vertical-tab behavior.
- Keep the hover menu above the composer as images finish loading; show readable descriptions when an image cannot load instead of raw image markup.
- Keep the skin active when opening Capabilities, Messaging, Artifacts or Settings and returning to chat. Styles now follow plugin lifetime rather than a titlebar slot, preserving native controls on extension pages.
- Keep update detection working after navigation and view remounts. Stop its controller only when the plugin is disabled or unloaded.

### Improved

- Give session-control error notices a rounded, theme-aware Codex card with readable wrapping on narrow panes. Preserve their native error icon, alert semantics and dismiss action.
- Update plugin-management instructions to Capabilities → Plugins.

## [1.8.0] - 2026-09-18

### Added

- In-app update notifications beside the composer's plus button, with hourly stable-release checks and stale refresh on app focus/reconnection.
- Scrollable release notes fetched directly from GitHub, including older releases on demand.
- One-click verified download and local plugin replacement, hot-reload confirmation, and a green success animation that disappears when complete. Skin settings are retained.
- Plugin manifest and desktop bundle for Hermes' plugin catalog, preserving the standalone manual-install path.

### Fixed

- Leave model labels entirely to Hermes, preserving its original names, capitalization and Fast indicator. Removed the skin's name rewriting and appended reasoning label; Hermes' native Thinking Level control is unchanged.
- Give tab close controls a circular background, balanced insets and a separate title area.
- Center queued-message edit/send actions across the complete row, including attachment and editing metadata, without changing Queue behavior.

### Improved

- Refined sidebar contrast: clearer conversation names, quieter section headings and navigation icons, and subtler neutral hover/selection fills. Layout, typography and native status colors are unchanged.
- Redraw the composer's plus icon with symmetric, unrotated strokes while retaining its original button and action.

### Maintenance

- Document GitHub update requests, local update state and the initial manual update needed to install the updater.
- Add regression coverage for update integrity, local replacement/recovery, activation receipts, hover behavior and composer control alignment.

## [1.7.0] - 2026-09-17

### Fixed

- Restored Codex styling for chat, browser and other panel tabs, including selected-tab backgrounds, labels and close controls.
- Restored Sessions/Bots header styling and the hidden minimize control with Hermes' updated panel structure.
- Corrected browser header colors, tab-row height and equal spacing above and below the tabs.
- Refined the browser navigation row and address-bar spacing. The Codex dark theme now uses a cleaner, borderless address field.
- Removed the unused header band above the chat when there are no chat tabs and the sidebar and browser already carry the window controls.
- Removed the unwanted rounded chat corners above and below integrated tab headers. The tabs themselves keep their rounded shape.
- Made the vertical sidebar/chat and chat/browser separators finer without shrinking their resize handles.
- Restored the rounded Codex appearance of the Tasks, Queue and Background panels above the composer, including in split chats.
- Adapted task-list scrolling and scrollbar styling to the updated status-panel structure, keeping the rounded edges clean.
- Centered the icon, filename and close button in single-line artifact rows, including HTML previews.
- Restored **Clean transcript** behavior with Hermes' updated response grouping, while preserving final replies and the existing safety checks.
- Corrected model-name and reasoning-effort display in the composer by reading Hermes' native labels rather than the skin's own reformatted text.
- Fixed the composer's scroll-edge fade remaining active after a long draft becomes short enough to fit again. Long scrolled drafts retain their fade.

### Improved

- Fixed reversed-looking history markers: the ticks now align on the left and expand to the right.
- Restored question-and-answer previews with Hermes' updated message structure and prevented the native tooltip from competing with the skin's preview.
- Gave the ticks more vertical spacing and quieter, theme-aware colors.
- Added a clearer current-message marker. Hover temporarily transfers emphasis to the previewed message; ordinary idle ticks no longer darken together.
- The rail now hides when its own chat pane is too narrow, independently of the overall window width.
- Removed the trailing width animation during pointer movement and repeated geometry measurements from stable hover frames. The exit animation remains.
- Refreshes cached positions when needed so moving, resizing or scrolling the pane does not leave the hover effect using stale coordinates.
- Preserved native message jumps, keyboard navigation and virtualized scrolling, with the visible ticks aligned to their click targets.

### Removed

- **Titlebar autohide.** The command-palette option and its behavior have been removed. The updated header layout no longer needs a separate hide-and-reveal mechanism. Tabs and window controls now remain accessible directly, without the old hover-triggered transitions. Old saved values no longer activate it; native Hermes window controls remain untouched.

### Maintenance

- Clarified contribution rules: fixes for Hermes-native bugs belong upstream, not as workarounds inside Codex Skin.
- Expanded automated regression coverage for the updated Hermes layout, split panes, history navigation, hover behavior, narrow panes, themes and cleanup.
- Added a developer-console activation message with the loaded skin build and UI component counts to help diagnose loading issues.

## [1.6.0] - 2026-09-15

### Added

- Left-side history ticks with proximity hover, a single question/reply preview and the native click-to-jump action. Previews are pane-scoped, keyboard-accessible and removed on plugin teardown.
- Recommended settings in the README: **Composer width = Codex**, **Pinned user messages = Off**, **Clean transcript = On**, and **Titlebar autohide = On**.

### Improved

- **Titlebar autohide** is now On by default (previously Off) when no choice has been saved. Existing On and Off choices are preserved, and the setting remains adjustable through the command palette.
- Applied browser-style tabs to the main pane groups while preserving the original Sessions/Bots appearance and aligning its header height.

### Fixed

- Matched the left Bots sidebar to Sessions: sidebar background, row hover, selected fill and 10 px corners. Bot avatars, status colors and secondary text keep their native theme styling.
- Made history-tick lengths follow the pointer continuously instead of changing in steps when crossing a tick.
- Kept tabs, close buttons and the `+` control above hover-to-reveal behavior, including gaps and horizontal travel between tab groups. Unused space after the controls still reveals the titlebar.
- Reconciled titlebar state when the sidebar remounts, without adding a blank band or moving tabs.
- Removed the dark background behind tab close controls while preserving clicks.
- Preserved the chat corner beside the visible sidebar, including when tabs are present.
- Removed the outer composer wash while preserving the long-draft fade inside the composer.

### Removed

- Hid the Sessions/Bots partial-minimize button in favor of the full sidebar toggle. Restore remains available for previously minimized layouts.

## [1.5.0] - 2026-09-14

### Added

- Optional **Titlebar autohide**, Off by default, active only with the left sidebar closed. The opening and keep-open zones both cover the full titlebar height. Native controls, focus and menus remain usable without moving the conversation.

### Improved

- Square previews in the composer and right-aligned sent attachments above user messages, while keeping generated images at their normal size.
- Codex-style browser tabs, address bar and controls without restyling the websites inside.
- Refined dark colors, composer spacing, attachment button and long-draft scrolling with a conditional fade.
- Larger image-removal control with a centered icon that scales only once.

### Fixed

- Sent image attachments appearing on the left instead of alongside user messages (#7).
- Images briefly appearing at full size before becoming thumbnails.

## [1.4.0] - 2026-09-01

### Added

- Added an opt-in **Clean transcript** command-palette setting. It is Off by default, keeps native progress visible during a run, then hides safely identified settled tool calls, thinking chrome, changed-file summaries, system notices and interim replies after the final response mounts.

### Improved

- Reworked the **Attach** menu into a compact 240 px popover with smaller rows, text and icons, native `+` anchoring, composer-matched surface chrome and a tighter menu-scale radius.
- Matched the `/` completion menu frame to the full useful composer width with 5 px side insets while preserving native content and placement.
- Matched Codex Desktop's sidebar typography hierarchy and stabilized chat rows at a 10 px radius before hover, focus and selection.
- Hid only the uninformative pure-idle grey session dot while preserving project identity and every active or attention state.
- Restyled expanded **Patched file** diffs as smoother Codex resource cards with 8 px geometry, a theme-owned translucent surface, 12/18 code rhythm and subtle add/remove tints.
- Rounded the chat surface into the visible sessions sidebar and removed unnecessary divider paint while preserving native tab, drag and resize interactions.

### Fixed

- Reconciled newly mounted historical turns and late final markdown additions without document-wide rescans, preventing safely identified pre-final text from reappearing in Clean transcript mode.
- Preserved generated images, artifacts, alerts, user messages and final answers while Clean transcript is active, and failed open whenever Hermes does not expose enough information to hide content safely.

### Known limitation

- Older content loaded through **Show previous messages** can remain visible when Hermes no longer exposes enough information to distinguish a final answer from an interim reply. Clean transcript leaves uncertain content visible rather than risk hiding a real final answer.

### Verification

- 75 automated checks pass.
- The exact candidate was hot-reloaded and visually accepted in Hermes Desktop on macOS without restarting the app.

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
