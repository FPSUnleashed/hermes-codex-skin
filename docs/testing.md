# Testing

## Dependency setup

Public CI pins Node 26.13.0 and its npm 11.20.0 to satisfy the native workspace's
engine requirements. Earlier bounded plugin-only checks used Node 22.23.1;
they did not provision the native graph. Install this repository's exact graph:

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

`package.json` and `package-lock.json` pin the DOM/compiler dependencies, including
jsdom 29.1.1, React/React DOM 19.3.0, TypeScript 6.0.3, esbuild 0.28.2 and
PostCSS 8.5.29. No Hermes installation is changed by this command.
`CODEX_TEST_DEPENDENCY_ROOT` is an optional override for an independently
provisioned Node graph; omit it to use this repository's dependencies.

Installing these dependencies does **not** provide native Hermes source,
captured renderer assets, historical baselines or a complete T3 application.
Native compilation uses the authenticated host's own dependency graph. In
particular, Complete messages needs the host-pinned assistant-ui/Streamdown
reactive closure, not freshly resolved substitutes from this test package.

## Bounded DOM checks

The reconciled transcript tests keep the real shipping module and stylesheet,
exercise native-shaped DOM nodes and preserve their handlers and ancestry.
Their default mode uses Chromium. For a browser-free projection/handler check:

```sh
CODEX_TRANSCRIPT_TEST_DOM=1 node --test --test-concurrency=1 \
  test/clean-transcript-setting.test.mjs \
  test/clean-response-group.test.mjs \
  test/clean-subagent-completion.test.mjs \
  test/no-clean-collapse-orb.test.mjs
```

This explicit mode uses jsdom, with inert resize observation and a non-matching
media query fixture. It does not implement native animation, measure browser
layout, or establish native-window acceptance. The assertions are shared with
the default browser mode, not skipped or replaced. Clean transcript is retired:
legacy On/Off storage cannot restore its command or hide-all behavior. Completed
activity is reversibly folded behind **Worked** / **Worked for …**; finals,
media, errors, approvals and native controls remain available.

The two ESM headless palette cases can be selected without the browser case:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern='shipping ESM palette' test/palette-esm-render.test.mjs
```

Their `window` fixture owns reload-retention WeakMaps only. It does not supply
`document`, `confirm`, a missing production icon, or an alternative JSX runtime.
The browser palette callback case remains separate and unchanged.

## External inputs

The resolver in `test/helpers/reference-paths.mjs` requires explicit readable
files/directories. Invalid configured paths fail rather than silently falling
back, fabricating a native module or skipping a contract.

| Input | Required content |
| --- | --- |
| `HERMES_DESKTOP_SOURCE_ROOT` | Authenticated Hermes repository and its locked Node graph, including `apps/desktop/src` and Electron sources. This is a source input, not permission to start or modify Hermes. |
| `CODEX_INBOX_QUERY_CORE_ROOT` | Optional historical query-core 5.101.2 package root; omit to use this repository's lock. Native transport and middle-click source use `HERMES_DESKTOP_SOURCE_ROOT` first, with this variable retained only as a legacy source-root fallback. |
| `HERMES_THEME_SOURCE_ROOT`, `SIDEBAR_NATIVE_ROOT` | Optional specialized source roots; otherwise the explicitly configured Hermes root. |
| `T3_THEME_SOURCE_ROOT` | Real upstream `apps/web/src/index.css`, `apps/web/src/components/chat/ComposerSurface.tsx` and `packages/shared/src/themePalettes.ts`. |
| `T3_REFERENCE_SOURCE_ROOT` | Real upstream reference files, including `apps/web/src/components/chat/WorkLog.tsx`. |
| `HERMES_INSTALLED_ROW_CSS` | Captured native CSS. Contracts pinning SHA-256 `ce4eaebe23cc99c7ba7ca4d69c7221793a0eec3005564105dbaf4b9de69ad104` still require those exact bytes. |
| `HERMES_INSTALLED_RENDERER_JS` | Legacy name: qualified six-literal class projection for the unchanged width consumer only; not executable renderer code. |
| `COMPLETE_MESSAGES_NATIVE_ROOT` | Existing host-pinned assistant-ui/Streamdown/React dependency closure. |
| `SIDEBAR_TABLER_ENTRY` | Actual entrypoint of the required native Tabler package. |
| `BACKGROUND_BASELINE_BUNDLE`, `CODEX_WIDTH_PRE_REPAIR_ROOT` | Authenticated historical inputs; never point these at the current candidate as its own oracle. |
| `CODEX_NATIVE_EVIDENCE_ROOT`, `CODEX_NATIVE_SCRATCH_ROOT` | Dedicated existing output/scratch directories for the explicit HTTP probe. |

Keep the native dependency graph separate from the historical observer test graph.
Do not downgrade the native lock to satisfy the helper's query-core 5.101.2 pin:
configure `HERMES_DESKTOP_SOURCE_ROOT` and leave `CODEX_INBOX_QUERY_CORE_ROOT`
unset for the repository's historical dependency. Native source selection never
falls back from an explicitly configured but invalid Hermes root.

The source-only composer seam can run without a browser after configuring the
Hermes and T3 theme roots:

```sh
node --test --test-concurrency=1 test/t3-composer-source-v14.test.mjs
```

The preparation's minimal T3 input is pinned to upstream commit
`6d450a4284852af137b2f3407fddd89eb76e7644`, with upstream paths, LICENSE and
per-file hashes. This is **not** proof that a directory named `t3-v0.1.6` has that
version. Historical pins remain distinct. A composer seam pass does not qualify
theme/compositor paint or all T3 comparisons.

## Public CI input bootstrap (not yet end-to-end qualified)

`.github/workflows/ci.yml` checks out the plugin and separate public sources:

- `NousResearch/hermes-agent` at `e5ea5fd9ccdf2913c0b21b24eb3d22b321d2e2a6`.
- `pingdotgg/t3code` at `6d450a4284852af137b2f3407fddd89eb76e7644`.

All checkouts disable persisted credentials. Both source pins are immutable;
the hosted Ubuntu 24.04 image and its preinstalled official Chrome can move.
The browser prerequisite step records the actual Chrome version and fails if
its expected executable is absent. Python 3 and DejaVu Sans are required.
There is no T3 installation or application build.

`scripts/ci-inputs.json` pins both unchanged package manifests/locks, native
source-directory digests, seven T3 file hashes and qualified historical input,
provenance, notice and consumer-closure hashes.
Source-directory digests are SHA-256 over UTF-8 byte-sorted records
`<file SHA-256>  <repository-relative path>\n`; all regular files in each named
directory participate and symlinks are rejected. These digests authenticate
the source closure even for an already-authenticated local copy without `.git`.
CI additionally verifies the actual checkout commits and tracked cleanliness.
The native directories and native manifest/lock bytes were compared with the
public pin, not inferred from a local directory name.

With every External input above explicitly supplied, the read-only bootstrap is:

```sh
unset CODEX_INBOX_QUERY_CORE_ROOT NODE_PATH NODE_OPTIONS CODEX_TRANSCRIPT_TEST_DOM
node scripts/verify-ci-inputs.mjs
npm ci --ignore-scripts --no-audit --no-fund
(cd "$HERMES_DESKTOP_SOURCE_ROOT" && npm ci --ignore-scripts --no-audit --no-fund --workspace apps/desktop --include-workspace-root)
node scripts/verify-ci-inputs.mjs --installed
```

Add `--checkouts` for actual Git checkouts at the pinned public commits. The
first verifier needs no dependency installation; `--installed` additionally
checks installed package identities against the exact locks and the native
Tabler entrypoint. It is not a complete rehash of every installed npm file.
An explicit `CODEX_TEST_DEPENDENCY_ROOT` may reuse an existing graph only when
that root has the exact plugin manifests/lock; CI leaves it unset.

The workflow supplies qualified test-only inputs under
`test/fixtures/ci-historical/`. Its English README and `provenance.json` record
immutable source pins, exact roles/hashes and full notices. Public-source CSS
reproduction is exact, but the original historical producer commit and capture
chain remain **UNKNOWN**. This is not a capture attestation or permission to
redistribute the whole renderer:

| Role | Path under `test/fixtures/ci-historical/` |
| --- | --- |
| `HERMES_INSTALLED_ROW_CSS` | `native-row.css` |
| `HERMES_INSTALLED_RENDERER_JS` (legacy name, class projection only) | `renderer-class-projection.js` |
| `BACKGROUND_BASELINE_BUNDLE` and width baseline bundle | `baseline/codex-chat-look/plugin.js` |
| Width baseline loader | `baseline/test/helpers/load-plugin.mjs` |

The real verifier rejects absent/altered fixtures, provenance or notices and
requires these exact vendored role paths. The six-literal projection is bound
to its original renderer digest, six public-source records and the unchanged
width consumer hash. The entire existing test, script and source closures plus
the workflow/helper hashes are authenticated to reject direct or indirect
consumer drift, including added consumers. Requalify before changing any such
closure; do not merely refresh digests to admit arbitrary text with matching
literals. `CODEX_WIDTH_BASELINE` must stay unset, so an alternate candidate
cannot bypass the qualification. Never use the current candidate as its own
historical baseline or conflate historical T3 CSS pins. No additional font,
image, renderer code, private logs or build output is included.

The full CI command remains the unfiltered `test/*.test.mjs` glob (191 files),
under `test/helpers/chromium-suite.py`. Its process-budget/admission guard,
isolated profiles, bounded launches and identity-checked owned-descendant
cleanup are retained unchanged. Scratch is private under `RUNNER_TEMP`, never
`/tmp`. Only the owned CI suite step grants `CODEX_V9_BROWSER_AUTHORIZED=1`.
`scripts/check-ci-results.mjs` rejects missing totals, failures, skips, todos,
cancellations and incomplete harness cleanup even if Node itself exits zero.
This workflow still needs an integrated authorized browser run on the final
composition; projection geometry and full CI remain PENDING. Input byte and
consumer-closure authentication is not full-suite success.

## Open qualification boundaries

- `test/native-universal-contract.mjs` still references missing
  `test/native-router-server.py`. A bounded search of linked historical repair
  trees and relevant archives did not recover an authenticated copy. No server
  has been invented. The HTTP contract remains blocked.
- `test/native-run-stream-continuity.probe.mjs` needs the actual Web Animations
  API. jsdom lacks `Element.animate`; its two earlier mounting failures remain
  failed evidence. Do not polyfill a fake animation, disable the native hook or
  treat a different DOM subset as a passing native continuity gate.
- Browser geometry, full-native styling, captured assets, historical comparisons
  and full integration require their own verified inputs and authorized runs.
  Hermes's own Node requirement is independent of the Node version used for these
  bounded plugin checks.
- The repository's existing `npm test`/CI command covers all `test/*.test.mjs`,
  including browser/native-dependent files. The bounded checks above are not a
  claim that this complete command passes. No full-suite, browser or app run was
  performed for this preparation follow-up.
