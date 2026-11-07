import { referenceFile, referenceRoot } from './reference-paths.mjs'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

// Read-only source seam. No preferences, installations or host source writes.
export function nativeStatusFixture() {
  const root = referenceRoot('HERMES_THEME_SOURCE_ROOT', 'HERMES_DESKTOP_SOURCE_ROOT')
  const require = createRequire(pathToFileURL(`${root}/package.json`))
  const ts = require('typescript'), inputs = {}, cache = new Map()
  const read = p => { const s = readFileSync(p, 'utf8'); inputs[p] = createHash('sha256').update(s).digest('hex'); return s }
  const compile = s => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  function load(p) {
    if (cache.has(p)) return cache.get(p)
    const exports = {}; cache.set(p, exports)
    const req = id => load(id === '@hermes/shared' ? `${root}/apps/shared/src/theme-presets.ts` : id === '@hermes/shared/color' ? `${root}/apps/shared/src/color.ts` : resolve(dirname(p), id + '.ts'))
    vm.runInNewContext(compile(read(p)), { exports, require: req }, { filename: p })
    return exports
  }
  const presets = load(`${root}/apps/desktop/src/themes/presets.ts`)
  const context = read(`${root}/apps/desktop/src/themes/context.tsx`)
  const slice = (a, b) => context.slice(context.indexOf(a), context.indexOf(b, context.indexOf(a)))
  const writer = compile(slice('function renderedModeFor(', '// ─── CSS application') + slice('const NEUTRAL_CHROME =', 'const TYPOGRAPHY_KNOB_VARS') + slice('function applyTheme(', '// Pin Electron\'s nativeTheme'))
  const colorPath = `${root}/apps/shared/src/color.ts`
  const colors = compile(read(colorPath))
  const desktopColors = compile(read(`${root}/apps/desktop/src/themes/color.ts`))
  const cssPath = referenceFile('HERMES_INSTALLED_ROW_CSS')
  const css = read(cssPath)
  if (inputs[cssPath] !== 'ce4eaebe23cc99c7ba7ca4d69c7221793a0eec3005564105dbaf4b9de69ad104') throw Error('Native CSS identity mismatch')
  // Pin the ancestry and opacity ladder consumed by this fixture.
  read(`${root}/apps/desktop/src/app/chat/composer/index.tsx`)
  read(`${root}/apps/desktop/src/app/chat/composer/status-stack/index.tsx`)
  read(`${root}/apps/desktop/src/app/chat/composer/status-stack/drawer.tsx`)
  return { themes: JSON.parse(JSON.stringify(presets.BUILTIN_THEME_LIST)), css, inputs,
    script: `const sharedColors=(()=>{const exports={};${colors}\nreturn exports})();
      const desktopColors=(()=>{const exports={},require=id=>{if(id!=='@hermes/shared/color')throw Error(id);return sharedColors};${desktopColors}\nreturn exports})();
      const {parseColor,mix,ensureContrast}=sharedColors,{harmonize,readableInk}=desktopColors;
      const DEFAULT_TYPOGRAPHY={fontSans:'serif',fontMono:'monospace'},nousTheme={},INJECTED_FONT_URLS=new Set();
      const setAppearance=()=>{},resolveChatFontFamily=x=>x,applyTypographyKnobs=()=>{};
      ${writer}
      window.nativePaint=(theme,mode)=>applyTheme({...theme,colors:mode==='dark'?(theme.darkColors||theme.colors):theme.colors},mode,'User font, serif');` }
}
