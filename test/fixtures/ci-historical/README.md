# Historical CI-only inputs

These files are regression inputs, never shipping plugin code. `provenance.json`
records exact sizes, SHA-256 digests, roles, immutable source pins and notices.
No renderer runtime, separate font, image, build log or private capture receipt
is distributed here.

| File | Role | SHA-256 |
| --- | --- | --- |
| `native-row.css` | Exact public-source reproduction of historical main CSS, 403099 bytes | `ce4eaebe23cc99c7ba7ca4d69c7221793a0eec3005564105dbaf4b9de69ad104` |
| `renderer-class-projection.js` | Six verbatim class strings, 1084 bytes; **not a renderer** | `1560fb6c846273ba581a7a02238e9d4db8b96265bde05cbe6d48275d52b799bf` |
| `baseline/codex-chat-look/plugin.js` | Independent historical own pre-repair oracle, 477689 bytes | `86b5d1a506d1c5c36dd4f669995deb7b57338336916596c59dc0563e9a7619ca` |
| `baseline/test/helpers/load-plugin.mjs` | Original relative loader layout, 1425 bytes | `3e014f3191285bd22343a34b0420c89fbab167bd8ea793d90c0249a1cf345a34` |

## CSS: reproduction, not capture attestation

A single successful complete renderer Vite build of public
[`NousResearch/hermes-agent@e5ea5fd9ccdf2913c0b21b24eb3d22b321d2e2a6`](https://github.com/NousResearch/hermes-agent/tree/e5ea5fd9ccdf2913c0b21b24eb3d22b321d2e2a6)
with its full original Vite configuration emitted `assets/index-pdLEZZqK.css`
byte-for-byte equal to the historical CSS. The root lock SHA-256 is
`ba681cd436db12d02a82f80c19de02d94e9cd7ca7c1672c4589b37e0ece522c7`;
the Vite configuration SHA-256 is
`7b3dca61a7783f299fc37991bbc5d3c1c87271ce5a4c0c314ce4de1d8670b418`.
The exercised toolchain was Node v26.13.0, npm 11.20.0, Vite 8.3.4,
Rolldown 1.2.13 and Tailwind 4.3.3. There was no source/compiler option
substitution, stylesheet adjustment or post-processing. Ten PowerShell files
were canonical public Git-blob exports after checkout EOL expansion: the
reproduction checkout was noncleanGit, but its source bytes matched public Git
blobs. This is not an assertion of a clean checkout.

**The original historical producer commit and capture chain remain UNKNOWN.**
The public pin establishes independent exact-byte reproducibility, not the
identity of the original producer. No other renderer build output is qualified
for redistribution by this record.

The eight relevant CSS notices are retained in full: Hermes MIT, Tailwind MIT,
Tailwind Typography MIT, tw-shimmer MIT, KaTeX MIT, Codicons LICENSE-CODE MIT,
Codicons LICENSE CC-BY-4.0, and xterm MIT. Tailwind and Typography have identical
license bytes, stored once as `licenses/tailwindcss-4.3.3-LICENSE` for both roles.
Codicons attribution is to Microsoft Corporation; its code and asset notices
are both retained conservatively. The CSS already embeds only
`KaTeX_Size3-Regular.woff2` (3624 bytes, SHA-256
`73d591271b1604960cb10bb90fee021670af7297017e0e98480b332d11f51995`), covered
by the KaTeX notice. Relative Collapse, JetBrains Mono and codicon.ttf URLs do
not include those font bytes; no additional fonts are supplied.

## Renderer role: narrowly qualified literal projection

The legacy environment name `HERMES_INSTALLED_RENDERER_JS` deliberately points
to `renderer-class-projection.js` in CI. Its only qualified direct consumer is
unchanged `test/t3-width-fidelity.test.mjs`, SHA-256
`ad70501d5dfa8f3c1d31df658071954a862699e381c6dbd160a82716cfbee629`.
That consumer reads the file as text and checks six literal class memberships;
it does not execute renderer code. All six strings match both the historical
renderer SHA-256
`9fcdc165869b8646827eacba32787136d41cecedaa95fecdf7ef8d8dde83c097` and three
exact public Hermes source files at the pin above. Six source records in
`provenance.json` bind each slot, literal digest, source path/digest and historical
renderer offset. Offsets are JavaScript **UTF-16 code units**, not UTF-8 byte
offsets or Python Unicode code-point positions.

`scripts/verify-ci-inputs.mjs` authenticates the projection, provenance, notices,
consumer/helper/workflow hashes and closed test/script/source-directory
inventories before expensive source closure checks. Missing files, altered
literals, consumer/helper/source drift or new consumers fail closed; requalify
explicitly rather than updating a digest automatically. The projection does
not attest the full renderer build. Browser geometric equivalence and the full
CI matrix remain separate, pending qualification gates.

## Historical own baseline

The baseline is the independently audited historical pre-repair skin, bound to
historical installation custody and exactly recomposed generated T3/TanStack
blocks. It is not the current candidate used as its own oracle. Its original
relative loader layout is preserved. The loader and FPSU license are exact
public bytes from
[`FPSUnleashed/hermes-codex-skin@017c4a3aa19daa74f10c88aacbc6322398caa743`](https://github.com/FPSUnleashed/hermes-codex-skin/tree/017c4a3aa19daa74f10c88aacbc6322398caa743).
The different public plugin at that context pin is **not** claimed to be the
477689-byte historical baseline. FPSU, T3 and TanStack full MIT notices accompany
this fixture; the existing repository root `LICENSE` covers FPSU.

No dependency installation, browser pass, whole-renderer redistribution or
publication approval is implied by input authentication.
