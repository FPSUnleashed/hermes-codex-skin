# History rail: T3 Code provenance and Hermes adapter

## Pinned upstream source

Repository: [pingdotgg/t3code](https://github.com/pingdotgg/t3code).
Commit: [`2359643cffa6ba9ee84d6f2694b935de54a8013e`](https://github.com/pingdotgg/t3code/commit/2359643cffa6ba9ee84d6f2694b935de54a8013e).
The commit and the following paths were checked against public upstream bytes.
These references do not depend on a private checkout or a mutable branch.

| Upstream file at that commit | SHA-256 |
| --- | --- |
| [TimelineMinimap.tsx](https://github.com/pingdotgg/t3code/blob/2359643cffa6ba9ee84d6f2694b935de54a8013e/apps/web/src/components/chat/TimelineMinimap.tsx) | `34d7da77f82dd7656fa4d4837eb60ec62620f6ad893eb84fb7f63bb6e47743c0` |
| [timelineMinimapItems.ts](https://github.com/pingdotgg/t3code/blob/2359643cffa6ba9ee84d6f2694b935de54a8013e/apps/web/src/components/chat/timelineMinimapItems.ts) | `3bf1aebadc24a21cf144ef8f3a916afda9ba7cacb4f6856124e99b170fd4df1e` |
| [LICENSE](https://github.com/pingdotgg/t3code/blob/2359643cffa6ba9ee84d6f2694b935de54a8013e/LICENSE) | `935d8f2af0c703f9c39517ee57cc4930b19d02d533be930b63f0e82f93614b43` |

## Copied recipe versus adaptation

The implementation is in [the shipping plugin](codex-chat-look/plugin.js), with a byte-identical catalog mirror at [desktop/plugin.js](codex-chat-look/desktop/plugin.js).

- `TimelineMinimap.tsx:210–234`: the discrete distance branches and literal coefficients `1`, `0.667`, `0.417`, `0.333`; fixed `w-6`, left origin, 150 ms transform transition and rounded strip. These are transposed into scoped CSS and the existing `queueWave` scheduler, not a copied React component.
- `TimelineMinimap.tsx:235–241`: the 55% foreground in-view overlay and opacity transition are adapted as a pseudo-element on the native span. Native `aria-current` replaces T3's `data-in-view`; one current Hermes item is not equivalent to T3's potentially multi-strip visible range.
- `TimelineMinimap.tsx:256–274`: one-line question, three-line answer and 4 px answer gap. The plugin retains its bounded, inert fragment copier instead of importing T3's Markdown pipeline, React, Tooltip or Button. Its opaque elevated surface is an adaptation, not a literal copy of T3's dropdown-glass material.
- Native Hermes rail buttons, click/key handlers and scroll ownership remain the integration surface. The skin uses a 16.8 local-pixel strip with its retained `10/7` zoom, approximately 24 painted pixels at the reference scale. This is not a claim of equal physical size under every application zoom.
- T3's percent-height index resolver, previous/next controls, single-button event handler and wheel-forwarding controller are not imported.

`timelineMinimapItems.ts` is a source reference for understanding upstream indexing, not a claim that its resolver is embedded in this plugin.

## Hermes-specific identity and caching

The preview adapter uses native timeline/message identities and unique matching labels rather than pairing virtualized slices by ordinal or repeated prompt text. Lazy history uses durable `row_id` values and global user-turn indices; uncertain mappings fall back to the question instead of guessing an answer.

Preview indexing is versioned by scoped transcript mutations rather than pointer samples. Changes to native slices, identities, labels, pane/profile/runtime scope, scroll and size invalidate the relevant preview state. Preview fragments retain the existing 600-character / 160-visit bound.

These are descriptions of the adapter's source, not evidence that every native virtualizer or history case has been exercised. Native-host inspection material is not redistributed here and is not required to follow the upstream attribution.

## Evidence boundary

This notice records provenance and licensing. It does not certify browser layout, native Mac behavior, performance, user acceptance, release qualification or deployment. Instrumented fixtures are test inputs, not the T3 or Hermes application. See the [reference and license index](docs/reference-provenance.md) for the other borrowed material and the distinction between runtime assets and fixtures.

## MIT notice — T3 Code

MIT License

Copyright (c) 2026 T3 Tools Inc.

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
