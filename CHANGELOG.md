# Changelog

All notable changes to this project are documented here.

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
