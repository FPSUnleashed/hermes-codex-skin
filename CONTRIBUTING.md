# Contributing

Contributions are welcome, especially compatibility fixes for newer Hermes Desktop releases.

## Ground rules

- Preserve Hermes' native model and Thinking Level menus.
- Preserve Hermes' native auto-speak and wake-word controls in the composer.
- Keep live commentary, final answers and generated media visible. Completed technical/interim work may collapse only through the fail-open execution summary.
- Do not add network access, a backend or external assets without explicit discussion.
- Keep all visual effects scoped to `html[data-codex-chat-look='true']`.
- Keep cleanup reversible when the plugin is disabled or hot-reloaded.
- Do not persist message text, prompt hashes or content-derived fingerprints.
- Avoid speculative refactors that change observable behavior.

## Before opening a pull request

1. Run `node --check codex-chat-look/plugin.js`.
2. Run `node --test test/*.test.mjs`.
3. Install the exact candidate through Hermes' disk plugin directory.
4. Verify enable, disable and hot-reload behavior.
5. Check both light and dark themes.
6. Verify the native model and Thinking Level menus.
7. Verify Queue, Tasks, Background activity, Clarify, Approval, loaders and media remain visible.
8. Verify long user messages clamp at 4 lines / 110 px and expand manually.
9. Verify completed technical execution collapses only after one final answer is certain, and expands without hiding assistant prose or media.
10. Verify the native auto-speak and wake-word controls remain visible and clickable in the composer.
11. Describe the Hermes version and operating system used for validation.

Keep commits focused. Do not include fixtures, probes, credentials, private paths or captured conversation data.
