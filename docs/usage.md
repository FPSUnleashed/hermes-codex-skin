# Settings, older installations and historical screenshots

[Back to the README](../README.md)

## Detailed settings

### Composer width

Open the command palette and run **Codex Skin: Composer width**. Each run cycles **Codex → Codex +20 % → Codex +40 % → Hermes → Codex**. The row shows the active mode and the choice persists locally. Codex remains the default; existing choices are preserved.

- **Codex** uses the measured Codex width of **736 CSS px**, with responsive 16 px minimum side gutters.
- **Codex +20 %** uses **883.2 CSS px**, exactly 20% wider than Codex.
- **Codex +40 %** uses **1030.4 CSS px**, exactly 40% wider than Codex.
- **Hermes** restores Hermes' native full-width composer and conversation column.

All Codex modes keep the same responsive gutters and shrink to fit narrow panes. Floating and popped-out composers retain their native Hermes width in every mode. The `+` menu above the composer follows the rendered composer width in all four modes.

### Pinned user messages

Open the command palette and run **Codex Skin: Pinned user messages**. The row shows the active mode and the choice persists locally.

- **Hermes** preserves Hermes' native behavior, where the latest user message stays pinned at the top while scrolling.
- **Off** lets every user message scroll normally with the rest of the conversation.

### Clean transcript

Open the command palette and run **Codex Skin: Clean transcript**. The row shows the active mode and the choice persists locally.

Clean transcript defaults to **Off**. An existing **Off** or **On** choice is preserved.

- **Off** preserves Hermes' complete native transcript presentation.
- **On** keeps all live progress visible, then hides safely identified settled tool calls, thinking chrome, changed-file summaries, system notices and interim replies after the final response mounts. User messages, final answers, generated images, artifacts and alerts stay visible.

Older content loaded through **Show previous messages** can remain visible when Hermes no longer exposes enough information to distinguish a final answer from an interim reply. The plugin leaves uncertain content visible rather than risk hiding a real final answer.

## History navigation

History ticks use quieter theme-aware colors and more vertical spacing. The current-message marker gives way to the hovered marker without dimming ordinary idle ticks. The pointer-driven wave responds without a trailing width animation, and the rail hides when its own chat pane is 862 CSS pixels wide or narrower. Native click targets, keyboard navigation and virtualized scrolling remain intact.

History previews use the rendered exchange when available. Older turns in the main chat can use a read-only history request; if the plugin cannot safely match an exchange, it shows the question only. Split panes never borrow another pane's response. Disabling the plugin restores the native timeline.

## Older Desktop layout (v1.6.0)

For the older Desktop layout, install the pinned v1.6.0 file instead of v1.10.0 or `main`. Keep v1.6.0 while staying on that layout; it predates the in-plugin updater.

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

## Historical screenshots

These are historical captures, not screenshots of v1.10.0. They can show retired controls, including Titlebar autohide. The composer-width menu predates the two intermediate widths added in v1.10.0.

### Earlier native theme and Glass overview

![Earlier Codex Skin layout using a native Hermes theme with Glass](../screenshots/codex-skin-native-glass.png)

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

