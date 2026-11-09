// Independent Tasks/Queue contract (CHANGELOG.md): premultiplied sRGB mix,
// then a directed OKLCH lightness step, retaining chroma, hue and alpha.
// Never read the candidate's status-panel token or lightness-shift variable.
export function approvedStatusPanelColor(mode) {
  const shift = mode === 'dark' ? 0.04 : -0.025
  return `oklch(from color-mix(in srgb, var(--codex-composer-fill) 50%, var(--codex-color-chat)) clamp(0, calc(l + ${shift}), 1) c h)`
}

// Expected is an independently painted reference at the same screen coordinate,
// including the native backdrop/Glass composition, not an opaque RGB shortcut.
export function statusPanelPaintFailures(row, expected) {
  for (const side of ['baseline', 'candidate']) {
    const p = row[side]
    p.midpoint = p.chat.map((v, i) => (v + p.composer[i]) / 2)
    p.expected = expected
    p.maxError = Math.max(...p.panel.map((v, i) => Math.abs(v - expected[i])))
  }
  return row.candidate.maxError > 2 ? [{ reason: 'not-painted-approved-contrast', row }] : []
}
