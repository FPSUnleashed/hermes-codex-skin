# Reference provenance and third-party licenses

This index distinguishes copied data/code, adapted presentation, visual references and test-only assets. It records the inspected source relationships, not a release qualification or legal opinion. The project [LICENSE](../LICENSE) does not replace third-party notices.

## T3 Code

T3 Code is copyright **2026 T3 Tools Inc.**, MIT. The full notice is retained in the following dedicated documents and in the existing runtime attribution blocks.

| Area / local implementation | Nature of reuse | Notice |
| --- | --- | --- |
| [Shipping history rail](../codex-chat-look/plugin.js) | Literal scale/transition recipe and preview layout transposed to native Hermes buttons, not T3's navigation controller | [History rail](../THIRD_PARTY_HISTORY_RAIL.md), commit `2359643cffa6ba9ee84d6f2694b935de54a8013e` |
| [Theme palettes](../src/t3-themes.js), [paint bridge](../src/t3-theme-paint.js) | Copied semantic literals, adapted color conversion and web paint recipes, native theme registration | [T3 themes](../THIRD_PARTY_T3_THEMES.md), commit `6d450a4284852af137b2f3407fddd89eb76e7644` |
| [Delegate-card CSS](../src/t3-subagent-style.js) | Derived compact SubagentTimelineLink styling, not a React component or state/routing import | [T3 subagents](../THIRD_PARTY_T3_SUBAGENT.md), same `6d450a4…` commit |
| Activity/disclosures in [the plugin](../codex-chat-look/plugin.js), [tool-sequences.js](../src/tool-sequences.js) | Derived T3-style work-row/disclosure presentation over native Hermes content; Hermes-specific DOM, identity, grouping, timing and cleanup adapters | Pinned activity references below; T3 MIT notice in [the history notice](../THIRD_PARTY_HISTORY_RAIL.md#mit-notice--t3-code) |
| [Sidebar search/new action](../src/t3-sidebar-actions.js) | Search/action row geometry adapted from T3; native Hermes controls remain the integration surface. SquarePen is a separate Lucide asset, not T3-owned artwork. | Pinned sidebar reference below; T3 MIT and Lucide notice below |

### Pinned activity, width and sidebar references

The current source references use [T3 commit `6d450a4284852af137b2f3407fddd89eb76e7644`](https://github.com/pingdotgg/t3code/commit/6d450a4284852af137b2f3407fddd89eb76e7644). These paths were checked at that commit:

- [WorkLog.tsx](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/WorkLog.tsx): shared work-row icon/label spacing and disclosure scaffolding.
- [TimelineWorkGroupRows.tsx](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/TimelineWorkGroupRows.tsx), [TimelineRowParts.tsx](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/TimelineRowParts.tsx) and [MessagesTimeline.logic.ts](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/MessagesTimeline.logic.ts): grouped work, row organization and completion/timing behavior consulted as references. This does not assert verbatim copying of those whole modules or equivalence of the two applications' data models.
- [index.css](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/index.css): typography, paint and layout tokens. Native Hermes font-family ownership and text-scale support are plugin integration decisions, not copied T3 preferences.
- [ChatComposer.tsx](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/ChatComposer.tsx), [ComposerSurface.tsx](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/ComposerSurface.tsx): composer layout/surface references; the plugin does not ship the T3 editor.
- [SidebarThreadHeader.tsx:62–173](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/sidebar/SidebarThreadHeader.tsx#L62-L173): compact search and new-thread controls. The verified path includes **`components/sidebar/`**, not the components root.
- [pnpm-lock.yaml](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/pnpm-lock.yaml): the T3 reference's Lucide package pin is `lucide-react@0.564.0`.

Earlier activity investigation also used a source-only snapshot of commit `2359643cffa6ba9ee84d6f2694b935de54a8013e`. That is distinct from the later theme/subagent reference, even where files have identical bytes. Neither source snapshot proves the identity or behavior of an installed T3 binary. Screenshots and visual references alone do not establish a state machine or a code license.

### Stable v0.1.7 collapse policy

The subsequent collapse comparison and adaptation use **T3 Code v0.1.7**, commit [`322f6544dfad0a3c8a0c8cbecf2c7f7874b14268`](https://github.com/pingdotgg/t3code/commit/322f6544dfad0a3c8a0c8cbecf2c7f7874b14268), not the later `main` visibility/Zen features. The earlier paint/layout references above remain unchanged.

- [`MessagesTimeline.logic.ts`](https://github.com/pingdotgg/t3code/blob/322f6544dfad0a3c8a0c8cbecf2c7f7874b14268/apps/web/src/components/chat/MessagesTimeline.logic.ts) informs settled-turn projection, preservation of terminal responses and safe work boundaries.
- [`MessagesTimeline.tsx`](https://github.com/pingdotgg/t3code/blob/322f6544dfad0a3c8a0c8cbecf2c7f7874b14268/apps/web/src/components/chat/MessagesTimeline.tsx) informs ephemeral, bounded disclosure memory. The Hermes adapter uses native owner/message identities only where they establish unique ownership.
- [`presentation.ts`](https://github.com/pingdotgg/t3code/blob/322f6544dfad0a3c8a0c8cbecf2c7f7874b14268/packages/client-runtime/src/work-log/presentation.ts) informs omission of reasoning captions from completed mixed tool/reasoning summaries.

The turn-fold runtime retains the full T3 MIT notice inline. Its implementation is a Hermes-specific DOM/SDK adapter, not a copy of T3's typed run model. It does not claim run/attempt segmentation, exact action counts, or recovery of inaccessible native disclosure internals. Unknown prose remains visible rather than being classified by position. See [the comparison and scope](t3-collapse-parity.md) for the tested changes and remaining differences.

### Historical comment names

The unchanged source/bundle comments mention these earlier note names. Small compatibility-link documents now preserve those paths and point to the canonical records without duplicating notices:

| Historical comment reference | Canonical document |
| --- | --- |
| `docs/t3-themes-provenance.md` | [T3 themes notice](../THIRD_PARTY_T3_THEMES.md) |
| `docs/t3-subagent-style.md` | [T3 subagent notice](../THIRD_PARTY_T3_SUBAGENT.md) |
| `docs/t3-activity-provenance.md` | This index's T3 activity and icon sections |

## Icons actually embedded in the runtime

### Lucide / Feather

- **Brain:** eight path definitions from `lucide-react@0.577.0`, used in the plugin's CSS mask for Thinking/reasoning.
- **Hammer:** three path definitions from `lucide-react@0.564.0`, used for mixed/unknown work summaries. The paths are also identical in `0.577.0`.
- **SquarePen:** two path definitions from `lucide-react@0.564.0`, used by the sidebar new-session action. The paths are also identical in `0.577.0`.

All of these path literals were compared against the versioned npm packages, including decoding the plugin's base64/percent-encoded mask data. The icons are adapted to CSS masks, size and theme color; the Lucide React runtime is not imported.

Exact source packages: [lucide-react 0.564.0 archive](https://registry.npmjs.org/lucide-react/-/lucide-react-0.564.0.tgz) and [0.577.0 archive](https://registry.npmjs.org/lucide-react/-/lucide-react-0.577.0.tgz). Package archive integrity was checked against registry metadata. The complete Lucide license below includes the Feather-derived MIT portion; it is not solely the project's MIT license.

### Phosphor Icons

[src/tool-sequence-glyphs.js](../src/tool-sequence-glyphs.js) contains 13 native tool-path literals and uses allowlisted matches to repaint homogeneous tool summaries. These literals are copied material, even though native glyph recognition is the integration mechanism. The immediate source is Hermes' `apps/desktop/src/components/ui/tool-icon.tsx`, whose source identifies them as Phosphor Icons, MIT. All 13 match that inspected local Hermes source; this is not a claim about the installed host revision.

Twelve literals also match the fill SVGs in the integrity-checked [@phosphor-icons/core 2.1.1 archive](https://registry.npmjs.org/@phosphor-icons/core/-/core-2.1.1.tgz): git-diff, pencil-simple, eye, file, image, files, globe, question, magnifying-glass, terminal-window, wrench and clock. **The native Brain literal does not match that package's Brain SVG.** Its immediate Hermes source is verified, but its exact original Phosphor package version/weight has not been established. Do not describe all 13 as verbatim `core@2.1.1` fill assets. The Phosphor MIT attribution and permission notice are retained below.

The code also refers to native `codicon-*` class names. Class-name reuse does not embed the host font in the runtime plugin. The separately checked-in Codicons font is a test fixture, described below.

## Existing vendored observer

[src/inbox-observer-runtime.js](../src/inbox-observer-runtime.js) declares a vendored `QueryObserver` from `@tanstack/query-core@5.101.2`, built with `esbuild@0.28.1`. Its full MIT notice, **copyright 2021-present Tanner Linsley**, remains in that source and the shipping generated bundle. This notice reconciliation did not regenerate or independently reproduce that existing vendor bundle; the checked-in source header is the version/build declaration, not a fresh reproducibility verdict. No TanStack package is newly imported by these documentation changes.

## Test-only assets and source-shaped fixtures

- [Brain fixture directory](../test/fixtures/brain): `brain.js` is byte-identical to the Lucide `0.577.0` package file; the directory's [LICENSE](../test/fixtures/brain/LICENSE) is also byte-identical to that package's complete ISC/Feather-MIT license. The companion SVG is a fixture representation. These files are not loaded by the shipping plugin; the runtime separately embeds the attributed path mask.
- [Subagent Codicons fixture](../test/fixtures/subagent-codicons): Microsoft Corporation's `@vscode/codicons@0.0.45`. The unmodified `codicon.ttf` and [LICENSE](../test/fixtures/subagent-codicons/LICENSE) match the registry archive and the fixture's [provenance record](../test/fixtures/subagent-codicons/provenance.json). This asset package is **CC BY 4.0**, not MIT; the linked full license is retained. It is used for test rendering, not bundled as a runtime plugin font.
- [T3 width fixture](../test/fixtures/t3-width): source-shaped layout inputs and generated test styles, not the full T3 application. Its existing [provenance record](../test/fixtures/t3-width/provenance.json) distinguishes extracted classes and compilation. Machine-specific capture locations in a historical receipt are not portable dependencies or public upstream sources; use the pinned public T3 references above for source context. Test-owner reconciliation of those receipts is separate from this notice.
- Native-host CSS/DOM fixtures describe host integration seams. Their presence is not evidence of copying the entire host renderer, and fixture execution alone does not prove native-app behavior.

## Full notice — Lucide and Feather

ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The MIT License (MIT) (for portions derived from Feather)

Copyright (c) 2013-2026 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Full notice — Phosphor Icons

MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Scope of this record

This documentation does not attest that all changes, third-party history, license obligations, tests or supported hosts have been exhaustively qualified. It does not authorize publication, a tag, installation, a host change or new dependency downloads at runtime. The Phosphor notice above is also retained in `src/tool-sequence-glyphs.js` and both generated standalone plugin copies. Original fixture licenses remain unchanged.
