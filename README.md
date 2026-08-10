# Codex Skin for Hermes Desktop

Codex Skin gives Hermes Desktop a Codex-inspired chat interface while preserving Hermes' native behavior.

> [!IMPORTANT]
> This project is an independent community plugin. It is not affiliated with or endorsed by Nous Research or OpenAI.

## Status

**Beta.** The current build has been exercised in Hermes Desktop and visually accepted on its target setup. It uses Hermes' supported desktop plugin entry point, but some styling depends on internal DOM attributes that may change in future Hermes releases.

## What it changes

- Codex-inspired light and dark themes
- Chat typography, spacing, sidebar, composer, Queue, bubbles, menus and loaders
- Codex-style model name in the composer
- Hermes' native model and Thinking Level menus after clicking the model name
- User-message clamp at 8 lines / 198 px, with a **Show more** control for longer messages
- Styling for Tasks, Background activity, Clarify, Approval and media surfaces

## What it deliberately does not do

- It does not replace Hermes' model or Thinking Level selection logic.
- It does not hide completed turns, commentary, tool activity or intermediate output.
- It does not add collapsed execution summaries, projections or “Took Xs” timers.
- It does not modify Hermes source files.
- It does not use a backend, network requests or external assets.

## Requirements

- Hermes Desktop with the [Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)
- A local Hermes profile directory

Hermes desktop plugins currently use local disk distribution. There is no remote desktop-plugin marketplace or install command.

## Install

### macOS / Linux

```sh
PLUGIN_DIR="${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/codex-chat-look"
mkdir -p "$PLUGIN_DIR"
curl -fsSL \
  https://raw.githubusercontent.com/FPSUnleashed/hermes-codex-skin/main/codex-chat-look/plugin.js \
  -o "$PLUGIN_DIR/plugin.js"
```

For a named profile, use:

```text
~/.hermes/profiles/<profile>/desktop-plugins/codex-chat-look/plugin.js
```

### Windows PowerShell

```powershell
$pluginDir = Join-Path $HOME ".hermes\desktop-plugins\codex-chat-look"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/FPSUnleashed/hermes-codex-skin/main/codex-chat-look/plugin.js" `
  -OutFile (Join-Path $pluginDir "plugin.js")
```

Hermes watches the plugin folder and should load the file automatically. If it does not, open the command palette and run **Reload desktop plugins**. You can enable or disable it live under **Settings → Plugins**.

Select the **Codex Skin** theme in Hermes if it is not selected automatically.

## Update

Run the relevant install command again. Hermes hot-reloads the replaced file. Compare its SHA-256 against [`CHECKSUMS.sha256`](CHECKSUMS.sha256) when you want byte-level verification.

## Uninstall

Disable **Codex Skin** under **Settings → Plugins**, then remove its folder:

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

This plugin performs no network requests and stores no message text, prompt hashes or content fingerprints. It only keeps a bounded local list of profile/session/message IDs for user messages that were manually expanded, capped at 250 entries.

## Compatibility

The plugin is scoped behind `html[data-codex-chat-look='true']` and cleans up its runtime markers when disabled. It is self-contained, but it styles internal Hermes surfaces. A future Hermes UI update can require selector maintenance even when the official plugin loader remains compatible.

The internal plugin ID, theme ID and installation folder remain `codex-chat-look` / `codex-chat` so existing installations update in place.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports should include the Hermes version, operating system, exact reproduction steps and a screenshot with private content removed.

## License

[MIT](LICENSE)
