# Contributing

Contributions are welcome, especially compatibility fixes for newer Hermes Desktop releases.

## Ground rules

- Preserve Hermes' native model and Thinking Level menus.
- Do not hide commentary, intermediate activity, completed turns or media.
- Do not add network access, a backend or external assets without explicit discussion.
- Keep all visual effects scoped to `html[data-codex-chat-look='true']`.
- Keep cleanup reversible when the plugin is disabled or hot-reloaded.
- Do not persist message text, prompt hashes or content-derived fingerprints.
- Avoid speculative refactors that change observable behavior.

## Before opening a pull request

1. Run `node --check codex-chat-look/plugin.js`.
2. Install the exact candidate through Hermes' disk plugin directory.
3. Verify enable, disable and hot-reload behavior.
4. Check both light and dark themes.
5. Verify the native model and Thinking Level menus.
6. Verify Queue, Tasks, Background activity, Clarify, Approval, loaders and media remain visible.
7. Verify long user messages clamp at 8 lines / 198 px and expand manually.
8. Describe the Hermes version and operating system used for validation.

Keep commits focused. Do not include fixtures, probes, credentials, private paths or captured conversation data.
