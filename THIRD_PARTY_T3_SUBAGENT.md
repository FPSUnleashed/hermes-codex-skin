# Third-party notice: T3 subagent timeline styling

## Pinned source

The layout reference is **T3 Code**, copyright **2026 T3 Tools Inc.**, MIT.
Repository: [pingdotgg/t3code](https://github.com/pingdotgg/t3code).
Commit: [`6d450a4284852af137b2f3407fddd89eb76e7644`](https://github.com/pingdotgg/t3code/commit/6d450a4284852af137b2f3407fddd89eb76e7644).
The commit and following source paths were verified against public upstream bytes.

| Upstream file at the pinned commit | SHA-256 |
| --- | --- |
| [apps/web/src/components/chat/V2LifecycleRow.tsx](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/V2LifecycleRow.tsx) | `e15b167e132db93cc866f5dc71562465393e89e0b7d4ae343d1c9e1a3fa2c06c` |
| [LICENSE](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/LICENSE) | `935d8f2af0c703f9c39517ee57cc4930b19d02d533be930b63f0e82f93614b43` |

## Adaptation, not a T3 runtime component

[src/t3-subagent-style.js](src/t3-subagent-style.js) is a CSS adapter for Hermes' existing delegate-card DOM. Its reference is `V2LifecycleRow.tsx`, specifically:

- **Lines 205–245, `SubagentAvatar`:** 24 px circular avatar, 14 px glyph, border/background semantics and lower-right status dot.
- **Lines 358–505, `SubagentTimelineLink`:** compact full-row presentation, 10 px item gap, rounded row with horizontal/vertical padding, small medium-weight title, secondary preview/status/timing, trailing navigation chevron, hover and keyboard-focus treatment.

These source styles are transposed to scoped CSS. This is derived styling, not merely an unattributed screenshot reference, but the TypeScript component, subscriptions, routing callbacks, provider icons and status computation are not embedded.

## Hermes-owned behavior and deliberate differences

The native goal button, agent identity, status node, model/duration text and live preview stay Hermes-owned. The adapter uses the existing agent glyph rather than copying T3 provider logos. The status dot uses the actual native status paint rather than guessing a state. An inert CSS pseudo-element extends the existing enabled goal button's hit area; it does not add a second navigation handler.

The adapter uses a grid over the existing layout, not T3's React tree. At narrow widths it wraps native metadata instead of dropping it or recreating T3's tooltip. Native model/duration labels remain together rather than being parsed into invented fields. The trailing chevron is drawn in CSS; no T3/Lucide chevron asset is embedded by this module.

This reference is **SubagentTimelineLink**, not the separate WorkLog card geometry. Other activity styles and the bundled third-party glyphs are covered by the [reference and license index](docs/reference-provenance.md). Theme role reuse is covered by [the theme notice](THIRD_PARTY_T3_THEMES.md).

## Evidence boundary

This notice documents the derivation and license. It does not certify native navigation, status accuracy, accessibility, layout fidelity, performance, user acceptance or a release. Test fixtures are not a full T3 application or proof of installed Hermes behavior.

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
