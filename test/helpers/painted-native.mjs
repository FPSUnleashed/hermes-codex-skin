// Mounted layout rectangles are not evidence of paint. Live compaction keeps
// a native current footprint/timer and clipped accessible older rows mounted.
export const paintedNativeJS = `
window.painted = node => {
  if (!node?.isConnected) return false;
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  for (let parent = node; parent; parent = parent.parentElement) {
    const css = getComputedStyle(parent);
    if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse'
      || Number(css.opacity) === 0 || css.clipPath === 'inset(50%)') return false;
    const box = parent.getBoundingClientRect();
    if ((css.overflow === 'hidden' || css.overflow === 'clip') && (box.width <= 0 || box.height <= 0)) return false;
  }
  return true;
};
// A native current timer can paint while its title/body is replaced by the
// safe plugin face. Test those independently instead of calling it unmounted.
window.nativeContentPainted = node => {
  if (!node) return false;
  const button = node.querySelector(':scope > [class~="group/disclosure-row"] > button, :scope > div > [class~="group/disclosure-row"] > button');
  if (!button) return painted(node);
  return painted(button) || [...node.querySelectorAll(':scope > [data-slot="aui_thinking-body"], :scope > pre, :scope > [data-native-body]')].some(painted);
};
`
