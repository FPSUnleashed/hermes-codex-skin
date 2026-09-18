# Codex Skin for Hermes Desktop

![Codex Skin using a native Hermes theme with the Glass background](screenshots/codex-skin-native-glass.png)

Codex Skin gives Hermes Desktop a Codex-inspired chat layout while preserving Hermes' native behavior. It supports native Hermes themes and the native Glass background, while the original Codex colors remain available through the **Codex Skin** theme in Appearance settings.

> [!IMPORTANT]
> This project is an independent community plugin. It is not affiliated with or endorsed by Nous Research or OpenAI.

## Status

Version 1.8.1 adds images to the release-history hover menu, aligns chat and preview tabs, and centers the window controls on their taller tab bands. It retains v1.8.0's in-app update notifications and one-click skin updates. The plugin uses Hermes' desktop entry point, but some styling and the local update bridge depend on Desktop interfaces that can change between Hermes releases.

> [!IMPORTANT]
> This version targets the updated Hermes Desktop layout. If you are keeping the previous layout, use [Codex Skin v1.6.0](https://github.com/FPSUnleashed/hermes-codex-skin/releases/tag/v1.6.0) instead. Use a pinned download for that version, not `main`. See [Compatibility](#compatibility).

`main` can receive tested improvements between tagged releases. Merging changes does not create a new release or replace existing release assets. This README describes the current source, which may include changes not yet included in a tagged release.

## What it changes

- A small blue update button beside the composer's `+` menu when a newer stable release is available. Hover to browse GitHub release notes with images; click to update and hot-reload the skin.
- Native Hermes theme colors and Glass/Clear window translucency, without changing the Codex layout or typography
- A selectable **Codex Skin** theme in **Settings → Appearance** for the original Codex light and dark palettes
- Chat typography, spacing, sidebar, composer, Queue, bubbles, menus and loaders
- Rounded, theme-aware session-control error notices with native dismissal and readable text on narrow panes
- Native model names in the composer, without renaming or changing capitalization
- Hermes' native model and Thinking Level menus after clicking the model name
- Hermes' native auto-speak and wake-word controls inside the composer
- Cleaner styling for Hermes' native **Voice dictation** and **Reading aloud** surfaces
- Dynamic Voice dictation and Reading aloud lanes above Tasks, Queue and Background
- Pixel-matched 736 CSS px Codex composer, with an optional native-width Hermes mode
- Optional unpinned user messages while keeping Hermes' pinned behavior as the default
- Optional **Clean transcript** mode that hides safely identified settled execution details after the final response while keeping live progress and important content visible
- User-message clamp at 4 lines / 110 px, with a **Show more** control for longer messages
- Styling for Tasks, Background activity, Clarify, Approval and media surfaces
- Styling that stays active when navigating between chat, Capabilities, Messaging and Artifacts
- Compact Attach and `/` completion menus, smoother Patched file cards and cleaner sidebar/chat chrome
- Square image previews, right-aligned sent attachments and Codex-style browser controls
- Hidden Sessions/Bots minimize button: use the full sidebar toggle instead. Restore remains available for previously minimized layouts.
- Left-side history ticks with a proximity hover effect and one question/reply preview at a time. Clicking a tick keeps Hermes' native jump behavior.

History ticks use quieter theme-aware colors and more vertical spacing. The current-message marker gives way to the hovered marker without dimming ordinary idle ticks. The pointer-driven wave responds without a trailing width animation, and the rail hides when its own chat pane is 862 CSS pixels wide or narrower. Native click targets, keyboard navigation and virtualized scrolling remain intact.

History previews use the rendered exchange when available. Older turns in the main chat can use a read-only history request; if the plugin cannot safely match an exchange, it shows the question only. Split panes never borrow another pane's response. Disabling the plugin restores the native timeline.

## Adjustable settings

| Setting | Values | Default | Where |
| --- | --- | --- | --- |
| Codex Skin | On / Off | On after installation | **Capabilities → Plugins** |
| Theme | Codex Skin / any native Hermes theme | Hermes choice | **Settings → Appearance** |
| Composer width | Codex / Hermes | Codex | Command palette |
| Pinned user messages | Hermes / Off | Hermes | Command palette |
| Clean transcript | On / Off | On | Command palette |

### Recommended settings

For the recommended Codex-style setup, choose these values through the command palette. These are recommendations, not changes to the defaults listed above.

- **Composer width:** Codex
- **Pinned user messages:** Off
- **Clean transcript:** On

Turning **Codex Skin** off restores Hermes' normal appearance.

### Composer width

Open the command palette and run **Codex Skin: Composer width**. The row shows the active mode and the choice persists locally.

- **Codex** uses the measured Codex width of **736 CSS px**, with responsive 16 px minimum side gutters.
- **Hermes** restores Hermes' native full-width composer and conversation column.

The `+` menu above the composer follows the rendered composer width in both modes.

### Pinned user messages

Open the command palette and run **Codex Skin: Pinned user messages**. The row shows the active mode and the choice persists locally.

- **Hermes** preserves Hermes' native behavior, where the latest user message stays pinned at the top while scrolling.
- **Off** lets every user message scroll normally with the rest of the conversation.

### Clean transcript

Open the command palette and run **Codex Skin: Clean transcript**. The row shows the active mode and the choice persists locally.

Current `main` defaults to **On** only when no choice has been saved. An existing **Off** or **On** choice is preserved. The tagged v1.8.1 release still defaults to Off; this change is not yet in a tagged release.

- **Off** preserves Hermes' complete native transcript presentation.
- **On** keeps all live progress visible, then hides safely identified settled tool calls, thinking chrome, changed-file summaries, system notices and interim replies after the final response mounts. User messages, final answers, generated images, artifacts and alerts stay visible.

Older content loaded through **Show previous messages** can remain visible when Hermes no longer exposes enough information to distinguish a final answer from an interim reply. The plugin leaves uncertain content visible rather than risk hiding a real final answer.

## Screenshots

These captures document earlier releases. Some details, including the former Titlebar autohide option, differ from v1.8.1.

### Version 1.5.0

Square image previews and the refined browser and composer in dark mode:

<img src="https://github.com/FPSUnleashed/hermes-codex-skin/releases/download/v1.5.0/codex-skin-v1.5.0.png" alt="Codex Skin v1.5.0 in dark mode" width="800" />

A light theme with the top bar hidden:

<img src="https://github.com/FPSUnleashed/hermes-codex-skin/releases/download/v1.5.0/codex-skin-v1.5.0-light.png" alt="Codex Skin v1.5.0 with a light theme and the top bar hidden" width="600" />

### Codex Skin theme

<img src="https://github.com/FPSUnleashed/hermes-codex-skin/releases/download/v1.1.0/codex-skin-theme-appearance.png" alt="Codex Skin theme in Hermes Appearance settings" width="600" />

### Composer width setting

<img src="https://github.com/FPSUnleashed/hermes-codex-skin/releases/download/v1.1.0/codex-skin-composer-width-setting.png" alt="Codex Skin Composer width setting in the command palette" width="480" />

### Voice dictation and Reading aloud

<img src="https://github.com/FPSUnleashed/hermes-codex-skin/releases/download/v1.1.0/codex-skin-voice-dictation.png" alt="Voice dictation in Codex Skin" width="560" />

<img src="https://github.com/FPSUnleashed/hermes-codex-skin/releases/download/v1.1.0/codex-skin-reading-aloud.png" alt="Reading aloud in Codex Skin" width="560" />

### Tasks

*Demo weather steps used only to show the Tasks layout.*

<img src="https://github.com/FPSUnleashed/hermes-codex-skin/releases/download/v1.1.0/codex-skin-tasks-demo.png" alt="Tasks in Codex Skin with demo weather steps" width="600" />

## What it deliberately does not do

- It does not replace Hermes' model or Thinking Level selection logic.
- It preserves Hermes' native assistant-turn rendering.
- It does not own, persist, replay, remove or migrate queued prompts; Queue behavior remains Hermes-native.
- It does not modify Hermes source files.
- It does not run a separate backend. Update checks contact GitHub, and clicking the update button downloads the plugin's published release asset. History previews can use Hermes' native read-only session API.

## Requirements

- Hermes Desktop with the [Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)
- A local Hermes profile directory

In-app updates require the Desktop shell's local plugin-folder, complete file-read and file-write capabilities, plus its plugin hot reload. The updater checks local file capabilities and verifies each hot reload before reporting success. Updating a remote Agent alone does not add them to an older Desktop shell.

Current Hermes Desktop releases can install Git repositories directly. Older releases can still use the manual disk install below.

## Install

### Current Hermes Desktop

Open **Capabilities → Plugins → Install plugin** and paste this exact repository subdirectory:

```text
FPSUnleashed/hermes-codex-skin/codex-chat-look
```

The `/codex-chat-look` suffix matters because the desktop entry lives in that folder. Do not save or paste GitHub's `/blob/.../plugin.js` web page as the plugin file: it is HTML and Hermes will report `Unexpected token '<'` when it tries to load it.

### Manual install on macOS / Linux

```sh
PLUGIN_DIR="${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/codex-chat-look"
mkdir -p "$PLUGIN_DIR"
curl -fsSL \
  https://raw.githubusercontent.com/FPSUnleashed/hermes-codex-skin/main/codex-chat-look/plugin.js \
  -o "$PLUGIN_DIR/plugin.js"
```

Desktop plugins are app-level on current Hermes builds. Use the plugin folder on the computer running Hermes Desktop, even when the agent is remote; do not install the UI plugin only on the backend machine.

### Manual install on Windows PowerShell

```powershell
$pluginDir = Join-Path $HOME ".hermes\desktop-plugins\codex-chat-look"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/FPSUnleashed/hermes-codex-skin/main/codex-chat-look/plugin.js" `
  -OutFile (Join-Path $pluginDir "plugin.js")
```

Hermes watches the plugin folder and should load the file automatically. You can enable or disable it under **Capabilities → Plugins**. If the old appearance remains, use **Reload desktop plugins** where supported; some Hermes builds do not reevaluate an already-loaded plugin through that action, so a full app restart may be needed.

> [!IMPORTANT]
> Installing or enabling the plugin and selecting its theme are separate steps. After installation, open **Settings → Appearance** and select **Codex Skin** for the original Codex light/dark palette, or keep any other Hermes theme to use its colors with the Codex layout and typography.

## Update

**Install v1.8.0 or later once using your existing installation method to receive the updater.** Earlier versions cannot display the new button by themselves.

After that, the plugin checks the public GitHub release feed hourly and refreshes stale information when the app becomes active or reconnects. A small blue button appears beside `+` only when a newer stable release with a valid plugin asset is available. Hover to read the release history; click to download, verify and install it. The green check appears only after the new plugin has loaded, then the button disappears. Your skin settings remain unchanged.

Starting with v1.8.1, the hover menu renders Markdown images and HTML `img` elements from this repository's GitHub release assets/raw files and GitHub-hosted user attachments. Images load only after opening the menu, fit inside it without distortion and fall back to their description if unavailable. Other HTML and event handlers are never executed. An older installed version keeps its older menu renderer until the update has completed.

The updater resolves the local Desktop plugin folder, verifies the download's size, SHA-256 digest and build identity, and saves a rollback copy before replacing `plugin.js`. It does not execute release-note HTML. An update failure is shown on the control instead of claiming success.

The manual install commands remain available. If you are staying on the previous Desktop layout, keep the pinned v1.6.0 download instead of updating from `main`. Compare a source installation against [`CHECKSUMS.sha256`](CHECKSUMS.sha256) when you want byte-level verification.

The manual install commands above download from `main`, so running them can fetch improvements before the next tagged release. A merge alone does not replace a manually installed local file.

## Uninstall

Disable **Codex Skin** under **Capabilities → Plugins**, then remove its folder:

### macOS / Linux

```sh
rm -rf "${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/codex-chat-look"
```

### Windows PowerShell

```powershell
Remove-Item -Recurse -Force (Join-Path $HOME ".hermes\desktop-plugins\codex-chat-look")
```

Run **Reload desktop plugins** if Hermes does not unload it automatically.

## Privacy and authority

Desktop plugins execute inside the Hermes renderer and therefore carry the same local authority as the app. Review local plugins before installing them.

The public updater contacts GitHub for release metadata, permitted release images when you open the hover menu and, on your update click, the selected plugin asset. No GitHub account is needed. GitHub receives normal network request information; no chat content is sent to it, and the plugin adds no analytics.

Locally, the plugin caches release notes/check times and update verification receipts, and saves staged/rollback plugin files. It stores no message text, prompt hashes or content fingerprints. History previews can make a read-only request through Hermes' own session API when a turn is not rendered. It keeps a bounded local list of profile/session/message IDs for user messages that were manually expanded, capped at 250 entries, plus the **Composer width**, **Pinned user messages** and **Clean transcript** preferences.

## Compatibility

| Hermes Desktop layout | Codex Skin version |
| --- | --- |
| Desktop builds with the September 16, 2026 panel-header and virtualized-timeline changes ([Hermes commit 2efbbef](https://github.com/NousResearch/hermes-agent/commit/2efbbef981cc75ed6df6214ee6975a0ae0f418d3)) | v1.8.1; in-app updates additionally require the local capabilities described above |
| Older Desktop builds, including code from Hermes Agent 0.21.3 / v2026.9.14 or earlier | [v1.6.0](https://github.com/FPSUnleashed/hermes-codex-skin/releases/tag/v1.6.0) |

Titlebar autohide is not available in v1.8.1. Old saved values are ignored; the remaining skin settings and native Hermes window controls are preserved.

The updated header layout no longer needs a separate hide-and-reveal mechanism. Tabs and window controls now remain accessible directly, without the old hover-triggered transitions.

The v1.8.1 compatibility target is the Desktop build containing the September 16, 2026 layout and timeline changes, not a blanket remote Agent-version threshold. Hermes Agent and Hermes Desktop can update independently. This release has been tested against that updated layout only; it does not guarantee compatibility with all future builds.

### Staying on v1.6.0

Do not use the `main` install commands above on an older layout. Use the pinned file instead.

macOS / Linux:

```sh
PLUGIN_DIR="${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/codex-chat-look"
mkdir -p "$PLUGIN_DIR"
curl -fsSL \
  https://raw.githubusercontent.com/FPSUnleashed/hermes-codex-skin/v1.6.0/codex-chat-look/plugin.js \
  -o "$PLUGIN_DIR/plugin.js"
```

Windows PowerShell:

```powershell
$pluginDir = Join-Path $HOME ".hermes\desktop-plugins\codex-chat-look"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/FPSUnleashed/hermes-codex-skin/v1.6.0/codex-chat-look/plugin.js" `
  -OutFile (Join-Path $pluginDir "plugin.js")
```

The plugin is scoped behind `html[data-codex-chat-look='true']` and cleans up its runtime markers when disabled. It is self-contained, but it styles internal Hermes surfaces. A future Hermes UI update can require selector maintenance even when the official plugin loader remains compatible.

The internal plugin ID, theme ID and installation folder remain `codex-chat-look` / `codex-chat` so existing installations update in place.

### Known Hermes Queue issue

Queue persistence and transcript rehydration are owned by Hermes Desktop, not this skin. Some current Hermes builds can lose the visible queued rows after switching or reloading a compressed chat, or fail to show a message that was sent while that chat was in the background. Codex Skin does not write Queue data and this release does not claim to fix that native session-routing bug.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports should include the Hermes version, operating system, exact reproduction steps and a screenshot with private content removed.

## License

[MIT](LICENSE)
