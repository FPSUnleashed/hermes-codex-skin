// Restore fixture-owned mutations without changing absent/empty native attributes.
export function restoreDOMAttribute(element, name, value) {
  if (value === null) {
    // Chromium can retain a dirty CSSOM style after removeAttribute when it has
    // not been serialized. Synchronize first; absence must not become style="".
    element.getAttribute(name)
    element.removeAttribute(name)
  }
  else element.setAttribute(name, value)
}
