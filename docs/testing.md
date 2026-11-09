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
| `CODEX_NATIVE_ROUTER_SERVER`, `CODEX_NATIVE_ROUTER_SERVER_SHA256` | Reviewed external Python server and its exact lowercase SHA-256 for the standalone native HTTP probe. See [the server contract](native-router-dependency.md). Neither the path nor the digest certifies its native implementation. |
| `CODEX_NATIVE_PYTHON` | Optional absolute path to an existing compatible Python executable for that external server. Nothing is installed. |

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

## Public CI input bootstrap

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

The full CI command remains the unfiltered `test/*.test.mjs` glob (206 files),
under `test/helpers/chromium-suite.py`. Its process-budget/admission guard,
isolated profiles, bounded launches and identity-checked owned-descendant
cleanup are retained unchanged. Scratch is private under `RUNNER_TEMP`, never
`/tmp`. Only the owned CI suite step grants `CODEX_V9_BROWSER_AUTHORIZED=1`.
`scripts/check-ci-results.mjs` rejects missing totals, failures, skips, todos,
cancellations and incomplete harness cleanup even if Node itself exits zero.
The preceding candidate `a040ad95a4562c2906e3865ecc9963ba0dc6a4aa` passed public
CI run `42423504888`, with all 1,013 tests passing and 459 Chrome launches.
That result does not qualify later repairs. The final follow-up commit needs
its own complete CI run. Input byte and consumer-closure authentication alone
is not full-suite success.

## Second review regression checks

The browser-free reply-presence, Inbox routing/cancellation, sidebar geometry
and fixture-lifecycle checks execute the shipping functions with JSDOM or
process-local browser-I/O seams. Fixture lifecycle covers eleven authentic
setups, including acquisition failure, each setup failure and ownership transfer;
it does not certify their UI paint or caller teardown. The existing browser
sidebar test also exercises real native JSX in both directions and at multiple
font scales and CSS zoom levels.

CI additionally runs `python3 test/chromium_resource_command_test.py` without
Chrome to verify that the resource scenario uses the Node executable selected
through PATH. The standalone status-panel paint probe uses a separately painted
reference with the approved OKLCH lightness step and unchanged tolerance of two
channel levels. Its pure color tests are part of the glob; those tests do not
claim that the standalone full Glass/paint capture has run.

## Inbox scaffold mutation stability

Inbox preserves synchronous native scroll restoration for every projection,
including zero. Stable header and Working/Snoozed shelf values are compared
before writing attributes, text, visibility or display styles. Metadata-only
updates no longer replace unchanged shelf labels.
`test/inbox-layout-stability-browser.test.mjs` exercises native overflowing
content with `moveBefore` and its `insertBefore` fallback, synchronous and
next-frame scroll positions, focus, node identity and retained-row action gates.
Its mutation check applies only to unchanged scaffold state during title-only
updates. It does not forbid scroll restoration or drop query stages.

## Exact Sidebar fixture restoration

The Sidebar direction/zoom fixture synchronizes a CSSOM-mutated style attribute
before removing an originally absent attribute. This prevents Chromium from
leaving `style=""` during fixture cleanup. The original strict DOM-restoration
assertion and native Sidebar nodes/actions remain unchanged.
`test/sidebar-attribute-restoration.test.mjs` separately exercises absent, empty
and nonempty style/direction states in Chromium without serializing the element
before cleanup. This is a test-fixture repair, not a Sidebar product change.

A `node --test` invocation can contain real browser cases. Classify a selected
file by its browser imports/launches rather than treating every Node entrypoint
as a browser-free check.

## Exceptional fixture cleanup

`test/universal-fixture-cleanup-lifecycle.test.mjs` exercises the real universal
fixture and loopback HTTP listener, including a keep-alive socket. Browser I/O
is injected only for lifecycle checks. Acquisition, setup, callback and cleanup
failures must still close the listener and acquired browser independently.

`test/t3-theme-cleanup-lifecycle.test.mjs` runs the genuine theme test callbacks
with process-local browser I/O injection. It checks all three caller finalizers,
including an unset disposer and a throwing or rejecting cleanup. Its wrapper
test runs 50 child cases, not 51 independent scenarios. Theme assertions, browser
operations and the existing retirement delay remain unchanged. These checks
do not certify UI paint; `test/t3-theme-paint.test.mjs` still uses real Chromium.

## Open qualification boundaries

- `test/native-universal-contract.mjs` requires explicit
  `CODEX_NATIVE_ROUTER_SERVER` and `CODEX_NATIVE_ROUTER_SERVER_SHA256` inputs.
  The historical sibling server has not been recovered in the bounded linked
  source search. Without an authenticated compatible external implementation,
  the native HTTP gate remains blocked. The probe now rejects this missing
  dependency before native/browser imports. The separate preflight checks only
  dependency readiness and cleanup, not native HTTP, FastAPI/SessionDB, grant
  enforcement or browser behavior. See [the server contract](native-router-dependency.md).
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
