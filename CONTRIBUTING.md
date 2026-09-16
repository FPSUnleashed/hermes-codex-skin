# Contributing

Contributions are welcome, especially compatibility fixes for newer Hermes Desktop releases.

## Bug-fix scope

Codex Skin fixes bugs caused by Codex Skin. It must not patch or work around bugs originating in Hermes Desktop or other components, even temporarily while an upstream fix is pending.

Before proposing a bug fix, identify which component causes the problem. Compare the same Hermes version and settings with the skin enabled and disabled, and trace the cause when that comparison is inconclusive. Include the evidence in your pull request; appearing while the skin is enabled does not, by itself, make a bug the skin's responsibility.

- Fixes to the skin's own styles, behavior or integration with supported Hermes behavior belong here.
- Bugs in Hermes belong in the Hermes repository. Bugs in other components belong with their respective maintainers. An upstream issue or pull request does not justify adding a workaround to the skin.
- Compatibility fixes adapt the skin to changes in Hermes; they must not compensate for defects in Hermes itself.

Pull requests that fix an upstream bug through the skin will be closed without merging. This is a scope decision, not a judgment on the usefulness of the bug report or upstream contribution.

## Ground rules

- Preserve Hermes' native model and Thinking Level menus.
- Preserve Hermes' native auto-speak and wake-word controls in the composer.
- Preserve Hermes' native assistant-turn rendering, commentary, tool calls, final answers and generated media.
- Do not add network access, a backend or external assets without explicit discussion.
- Keep all visual effects scoped to `html[data-codex-chat-look='true']`.
- Keep cleanup reversible when the plugin is disabled or hot-reloaded.
- Do not persist message text, prompt hashes or content-derived fingerprints.
- Avoid speculative refactors that change observable behavior.

## Before opening a pull request

1. Run `node --check codex-chat-look/plugin.js`.
2. Run `node --test --test-concurrency=1 test/*.test.mjs` (the same serial browser-test run as CI).
3. Install the exact candidate through Hermes' disk plugin directory.
4. Verify enable, disable and hot-reload behavior.
5. Check both light and dark themes.
6. Verify the native model and Thinking Level menus.
7. Verify Queue, Tasks, Background activity, Clarify, Approval, loaders and media remain visible.
8. Verify long user messages clamp at 4 lines / 110 px and expand manually.
9. Verify assistant replies, commentary, tool calls, final answers and media keep Hermes' native rendering.
10. Verify the native auto-speak and wake-word controls remain visible and clickable in the composer.
11. Describe the Hermes version and operating system used for validation.

Keep commits focused. Do not include fixtures, probes, credentials, private paths or captured conversation data.
