# Third-party notice: T3 themes and paint adapters

## Pinned source

The semantic palette literals and parts of the color conversion/paint recipe originate in **T3 Code**, copyright **2026 T3 Tools Inc.**, under the MIT license reproduced below.

Repository: [pingdotgg/t3code](https://github.com/pingdotgg/t3code).
Commit: [`6d450a4284852af137b2f3407fddd89eb76e7644`](https://github.com/pingdotgg/t3code/commit/6d450a4284852af137b2f3407fddd89eb76e7644).
The commit and each linked file were verified against public upstream bytes.

| Upstream file at the pinned commit | SHA-256 |
| --- | --- |
| [packages/shared/src/themePalettes.ts](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/packages/shared/src/themePalettes.ts) | `21b10dad58a61e86c563e48f75584a49ef61d423d426129e831c8c2c2090ddb8` |
| [apps/web/src/themePalette.ts](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/themePalette.ts) | `d5c9e00126c67f5fce87417032d2322ffe5e6e6bd7dccad03ef6b2ddcd65c112` |
| [apps/web/src/index.css](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/index.css) | `4922ba3213be8e969ff781f41ab16268787518fe335290e57ab7228d4c65c908` |
| [apps/web/src/components/chat/ChatComposer.tsx](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/ChatComposer.tsx) | `003fd2a888c9a90b3f6f3eb63ed521a194e24f80c83aee838cce4512bf20a04b` |
| [apps/web/src/components/chat/ComposerSurface.tsx](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/ComposerSurface.tsx) | `d8a36ae114a7d96c5d915e2a7bbd03f5d8afd9b1aaa894af5b75167e576a7906` |
| [LICENSE](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/LICENSE) | `935d8f2af0c703f9c39517ee57cc4930b19d02d533be930b63f0e82f93614b43` |

## What is reused

- **Copied data:** [src/t3-themes.js](src/t3-themes.js), `T3_SOURCE_PALETTES`, contains the six source palettes: T3 Chat, T3 Code, Ocean, Iris, Grove and Ember, each light/dark. Comparing the static data against the pinned upstream definitions found 732 matching role literals across 12 variants, with no missing, changed or extra role values. The local display labels add the T3 prefix where appropriate; they are not a claim that every local identifier is an upstream identifier.
- **Adapted code:** the restricted OKLCH-to-sRGB adapter retains upstream matrix coefficients, gamut fitting, tolerance and rounding from `themePalette.ts`. It accepts only the literal forms needed by these palettes; it does not embed upstream parsing, theme storage, schema handling or the Culori package.
- **Copied paint recipe with native mapping:** [src/t3-theme-paint.js](src/t3-theme-paint.js) maps upstream semantic roles to Hermes/Codex CSS variables. The web standard theme is taken from `index.css` rather than treating the shared/mobile T3 Code palette as identical web paint. `T3_CODE_WEB_PAINTED_OVERRIDES` follows the corresponding standard-web overrides in `themePalette.ts`.
- **Composer reference/adaptation:** `ChatComposer.tsx` and `ComposerSurface.tsx` establish the source surface/outline consumers. The skin adapts those roles and the default 80% surface tint to Hermes' existing composer, backing and status surfaces. Its CSS selectors, native variable mapping and Glass integration are plugin adapters, not copied T3 components.

## What this does not import or establish

The plugin registers Hermes theme contributions; it does not import T3's application, theme preference store, provider state, artwork, fonts or runtime dependencies. Native Hermes themes are a separate path; these optional T3 palettes do not authorize changing a user's selected theme, UI font, material or text scale.

Palette-literal equality is a data provenance check, not a claim of pixel equality, accessibility qualification, browser coverage, native acceptance or release readiness. Alpha composition, host materials and platform rendering still affect paint.

See the [reference and license index](docs/reference-provenance.md) for activity, sidebar, glyph and fixture provenance, and [the subagent notice](THIRD_PARTY_T3_SUBAGENT.md) for the timeline-row reference.

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
