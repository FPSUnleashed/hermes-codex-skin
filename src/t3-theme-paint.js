// Paint bridge for the pinned T3 web semantic roles, not Hermes' derived
// accent/foreground mixtures. Provenance: docs/t3-themes-provenance.md.
// Native theme registration keeps its hex adapters; this CSS preserves the web's
// raw OKLCH values, alpha, and color-mix space at paint time.
const ZINC = {
  25: 'oklch(0.992 0 0)', 50: 'oklch(0.985 0 0)',
  100: 'oklch(0.967 0.001 286.375)', 200: 'oklch(0.92 0.004 286.32)',
  300: 'oklch(0.871 0.006 286.286)', 500: 'oklch(0.552 0.016 285.938)',
  800: 'oklch(0.274 0.006 286.033)', 900: 'oklch(0.21 0.006 285.885)'
}
const RED = 'oklch(0.637 0.237 25.331)'
const RAISED = 'color-mix(in srgb, oklch(0.145 0 0) 97%, #fff)'
// index.css :root / @variant dark / [data-app-sidebar] are the actual standard
// web theme. The shared/mobile standard palette is NOT its paint oracle.
export const T3_WEB_DEFAULT_PAINT = {
  light: {
    canvas: ZINC[25], chrome: ZINC[25], toolbar: ZINC[25],
    surface: '#ffffff', surfaceOverlay: '#ffffff', surfaceRaised: 'rgb(255 255 255 / 20%)',
    text: ZINC[900], textMuted: ZINC[500], muted: ZINC[50], mutedForeground: ZINC[500],
    secondaryLabel: ZINC[500], iconMuted: ZINC[500], placeholder: ZINC[500],
    border: ZINC[200], input: ZINC[300], focus: 'oklch(0.488 0.217 264)',
    messageAction: 'oklch(0.488 0.217 264)', messageActionForeground: '#ffffff',
    messageActionHover: `color-mix(in srgb, oklch(0.488 0.217 264) 90%, ${ZINC[25]})`,
    secondary: ZINC[50], secondaryForeground: ZINC[800],
    accentSurface: ZINC[100], accentSurfaceForeground: ZINC[900],
    messageSurface: `color-mix(in srgb, ${ZINC[200]} 55%, ${ZINC[100]})`, messageForeground: ZINC[900],
    error: RED, errorForeground: 'oklch(0.505 0.213 27.518)',
    errorSurface: `color-mix(in srgb, ${RED} 8%, transparent)`,
    warning: 'oklch(0.769 0.188 70.08)', warningForeground: 'oklch(0.555 0.163 48.998)',
    warningSurface: 'color-mix(in srgb, oklch(0.769 0.188 70.08) 8%, transparent)',
    update: 'oklch(0.488 0.217 264)', updateForeground: 'oklch(0.488 0.217 264)',
    toolbarForeground: ZINC[900], toolbarBorder: ZINC[200], toolbarControl: '#ffffff', toolbarControlForeground: ZINC[900], toolbarControlHover: ZINC[100],
    terminalBackground: ZINC[25], terminalForeground: ZINC[900], terminalCursor: 'rgb(38 56 78)', terminalSelection: 'rgb(37 63 99 / 20%)',
    sidebar: ZINC[50], sidebarForeground: ZINC[900], sidebarMutedForeground: ZINC[500],
    sidebarControlSurface: ZINC[100], sidebarRowHover: ZINC[25], sidebarRowActive: '#ffffff', sidebarRowSelected: '#ffffff', sidebarBorder: ZINC[200],
    codeBackground: `color-mix(in srgb, #fff 90%, ${ZINC[25]})`, codeForeground: ZINC[900]
  },
  dark: {
    canvas: '#000000', chrome: '#000000', toolbar: '#000000',
    surface: RAISED, surfaceOverlay: RAISED, surfaceRaised: RAISED,
    text: 'oklch(0.97 0 0)', textMuted: 'oklch(0.708 0 0)', muted: 'rgb(255 255 255 / 3%)', mutedForeground: 'oklch(0.708 0 0)',
    secondaryLabel: 'oklch(0.708 0 0)', iconMuted: 'oklch(0.708 0 0)', placeholder: 'oklch(0.708 0 0)',
    border: 'rgb(255 255 255 / 8%)', input: 'rgb(255 255 255 / 11%)', focus: 'oklch(0.571 0.21 264)',
    messageAction: 'oklch(0.571 0.21 264)', messageActionForeground: '#ffffff',
    messageActionHover: 'color-mix(in srgb, oklch(0.571 0.21 264) 90%, #000)',
    secondary: 'rgb(255 255 255 / 3%)', secondaryForeground: 'oklch(0.97 0 0)',
    accentSurface: 'rgb(255 255 255 / 4%)', accentSurfaceForeground: 'oklch(0.97 0 0)',
    messageSurface: 'color-mix(in srgb, oklch(0.145 0 0) 92%, #fff)', messageForeground: 'oklch(0.97 0 0)',
    error: `color-mix(in srgb, ${RED} 90%, #fff)`, errorForeground: 'oklch(0.704 0.191 22.216)',
    errorSurface: `color-mix(in srgb, color-mix(in srgb, ${RED} 90%, #fff) 16%, transparent)`,
    warning: 'oklch(0.769 0.188 70.08)', warningForeground: 'oklch(0.828 0.189 84.429)',
    warningSurface: 'color-mix(in srgb, oklch(0.769 0.188 70.08) 16%, transparent)',
    update: 'oklch(0.571 0.21 264)', updateForeground: 'oklch(0.707 0.165 254.624)',
    toolbarForeground: 'oklch(0.97 0 0)', toolbarBorder: 'rgb(255 255 255 / 8%)', toolbarControl: RAISED, toolbarControlForeground: 'oklch(0.97 0 0)', toolbarControlHover: 'rgb(255 255 255 / 4%)',
    terminalBackground: '#000000', terminalForeground: 'oklch(0.97 0 0)', terminalCursor: 'rgb(180 203 255)', terminalSelection: 'rgb(180 203 255 / 25%)',
    sidebar: '#000000', sidebarForeground: '#f1f3f7', sidebarMutedForeground: '#a3a3a3',
    sidebarControlSurface: '#0a0a0a', sidebarRowHover: 'rgb(241 243 247 / 8%)', sidebarRowActive: 'rgb(241 243 247 / 11%)', sidebarRowSelected: 'rgb(241 243 247 / 7%)', sidebarBorder: 'rgb(255 255 255 / 8%)',
    codeBackground: `color-mix(in srgb, ${RAISED} 90%, #000)`, codeForeground: 'oklch(0.97 0 0)'
  }
}

// One role table feeds the raw theme seeds, the native semantic surface layer,
// and the skin. No geometry, typography, theme selection, or host state writes.
export const T3_PAINT_ROLE_MAP = {
  '--theme-background-seed': 'canvas', '--theme-foreground': 'text',
  '--theme-card-seed': 'surface', '--theme-elevated-seed': 'surfaceOverlay', '--theme-sidebar-seed': 'sidebar',
  '--theme-border-seed': 'border', '--theme-bubble-seed': 'messageSurface',
  '--dt-card': 'surface', '--dt-card-foreground': 'text', '--dt-popover': 'surfaceOverlay', '--dt-popover-foreground': 'text',
  '--dt-muted': 'muted', '--dt-muted-foreground': 'mutedForeground', '--dt-border': 'border', '--dt-input': 'input',
  '--dt-primary': 'messageAction', '--dt-primary-foreground': 'messageActionForeground',
  '--dt-secondary': 'secondary', '--dt-secondary-foreground': 'secondaryForeground',
  '--dt-accent': 'accentSurface', '--dt-accent-foreground': 'accentSurfaceForeground',
  '--dt-destructive': 'error', '--dt-destructive-foreground': 'errorForeground', '--dt-ring': 'focus',
  '--ui-text-primary': 'text', '--ui-text-secondary': 'secondaryLabel', '--ui-text-tertiary': 'mutedForeground', '--ui-text-quaternary': 'iconMuted',
  '--ui-icon-primary': 'text', '--ui-icon-secondary': 'iconMuted', '--ui-icon-tertiary': 'iconMuted',
  '--ui-bg-primary': 'canvas', '--ui-bg-secondary': 'surface', '--ui-bg-tertiary': 'muted', '--ui-bg-elevated': 'surfaceOverlay', '--ui-bg-sidebar': 'sidebar',
  '--ui-editor-surface-background': 'surface', '--ui-widget-surface-background': 'surfaceOverlay', '--ui-code-surface-background': 'codeBackground',
  '--ui-chat-bubble-background': 'messageSurface', '--ui-chat-bubble-foreground': 'messageForeground',
  '--ui-stroke-primary': 'border', '--ui-stroke-secondary': 'border', '--ui-stroke-tertiary': 'border',
  '--ui-control-default-background': 'secondary', '--ui-control-hover-background': 'accentSurface', '--ui-control-active-background': 'accentSurface',
  '--ui-row-hover-background': 'sidebarRowHover', '--ui-row-active-background': 'sidebarRowActive',
  '--codex-color-card': 'surface', '--codex-color-elevated': 'surfaceOverlay', '--codex-color-bubble': 'messageSurface',
  '--codex-color-text': 'text', '--codex-color-text-secondary': 'secondaryLabel', '--codex-color-text-tertiary': 'mutedForeground', '--codex-color-text-quaternary': 'iconMuted',
  '--codex-color-border': 'border', '--codex-color-border-subtle': 'border',
  '--codex-color-hover': 'sidebarRowHover', '--codex-color-active': 'sidebarRowActive',
  '--codex-color-primary': 'messageAction', '--codex-color-primary-foreground': 'messageActionForeground', '--codex-color-destructive': 'error',
  '--codex-sidebar-label': 'sidebarForeground', '--codex-sidebar-muted': 'sidebarMutedForeground', '--codex-sidebar-hover': 'sidebarRowHover', '--codex-sidebar-active': 'sidebarRowActive',
  '--dt-background': 'canvas', '--dt-foreground': 'text', '--dt-primary-solid': 'messageAction', '--dt-primary-solid-foreground': 'messageActionForeground',
  '--dt-sidebar-bg': 'sidebar', '--dt-sidebar-border': 'sidebarBorder', '--dt-composer-ring': 'border',
  '--ui-bg-chrome': 'chrome', '--ui-bg-editor': 'surface', '--ui-bg-card': 'surface', '--ui-bg-input': 'surface',
  '--ui-bg-quaternary': 'muted', '--ui-bg-quinary': 'muted', '--ui-surface-background': 'surface',
  '--ui-chat-bubble-opaque-background': 'messageSurface', '--ui-terminal-surface-background': 'terminalBackground',
  '--ui-inline-code-background': 'codeBackground', '--ui-inline-code-foreground': 'codeForeground',
  '--ui-red': 'error', '--ui-orange': 'warning', '--ui-yellow': 'warning',
  '--ui-accent': 'messageAction', '--ui-stroke-quaternary': 'border',
  '--codex-tool-label': 'secondaryLabel', '--codex-tool-icon': 'iconMuted', '--codex-activity-label': 'mutedForeground', '--codex-placeholder': 'placeholder',
  '--codex-subagent-text': 'text', '--codex-subagent-meta': 'mutedForeground', '--codex-subagent-avatar-background': 'muted'
}
const kebab = name => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
const role = name => `var(--codex-t3-${kebab(name)})`
export function t3ThemePaintCSS(id, source) {
  const name = `codex-t3-${id.replace(/^t3-/, '')}`
  const themeCSS = ['light', 'dark'].map(mode => {
    const palette = { ...source[mode], ...(id === 't3-code' ? T3_WEB_DEFAULT_PAINT[mode] : {}) }
    const selector = `html[data-codex-chat-look='true'][data-hermes-theme='${name}'][data-hermes-mode='${mode}']`
    const vars = Object.entries(palette).map(([key, value]) => `--codex-t3-${kebab(key)}:${value};`)
    vars.push(...Object.entries(T3_PAINT_ROLE_MAP).map(([key, value]) => `${key}:${role(value)}!important;`))
    // ComposerSurface owns an outline independent of the general border role.
    const composerOutline = id === 't3-code'
      ? `rgb(${mode === 'dark' ? '255 255 255 / 5%' : '0 0 0 / 8%'})`
      : mode === 'light' ? role('toolbarBorder')
      : id === 't3-chat' ? '#241e28'
      : `color-mix(in srgb, ${role('input')} 30%, ${role('canvas')})`
    vars.push(`--codex-t3-composer-outline:${composerOutline};`)
    // Shell uses card only for standard light, raised glass otherwise.
    // Precompose its default 80% tint once for composer, backing and status.
    const composerSurface = id === 't3-code' && mode === 'light' ? 'surface' : 'surfaceRaised'
    vars.push(`--codex-t3-composer-fill:color-mix(in srgb, ${role(composerSurface)} 80%, ${role('canvas')});`, '--codex-composer-fill:var(--codex-t3-composer-fill);')

    const boundary = id === 't3-code' ? role('border') : id === 't3-chat' && mode === 'dark' ? role('sidebarBorder') : `color-mix(in srgb, ${role('sidebarForeground')} ${mode === 'dark' ? 8 : 10}%, transparent)`
    vars.push(`--codex-sidebar-divider:${boundary};`, `--sidebar-edge-border:${boundary};`, `--codex-shelf-divider:color-mix(in oklab, ${role('sidebarBorder')} 50%, transparent);`, `--codex-secondary-paint:${role('secondaryLabel')};`,
      '--codex-stop-foreground:#fff;',
      `--codex-subagent-avatar-border:color-mix(in oklab, ${role('border')} 70%, transparent);`,
      `--codex-subagent-hover:color-mix(in oklab, ${role('accentSurface')} 20%, transparent);`,
      `--codex-subagent-focus:color-mix(in oklab, ${role('focus')} 70%, transparent);`)
    return `${selector}{${vars.join('')}}\n${selector}:not([data-hermes-glass]){--ui-chat-surface-background:${role('canvas')};--ui-sidebar-surface-background:${role('sidebar')};--codex-color-chat:${role('canvas')};--codex-color-sidebar:${role('sidebar')};}\n${selector}:not([data-hermes-glass]),${selector}:not([data-hermes-glass]) body{background-color:${role('canvas')}!important;}\n${selector} [data-tree-group='grp-sessions']{--ui-text-primary:${role('sidebarForeground')};--ui-text-secondary:${role('sidebarMutedForeground')};--ui-text-tertiary:${role('sidebarMutedForeground')};}\n${selector} [data-slot='sidebar']{border-right-color:var(--codex-sidebar-divider)!important;}\n${selector} [data-slot='composer-rich-input']:is(:empty,[data-empty])::before{color:${role('placeholder')}!important;}\n${selector} [data-slot='composer-surface'] button[type='submit']:not(:has(> span.block.bg-current)){background:${role('messageAction')}!important;color:${role('messageActionForeground')}!important;}\n${selector} [data-slot='composer-surface'] button[type='submit']:not(:has(> span.block.bg-current)):hover{background:${role('messageActionHover')}!important;}\n`
  }).join('\n')
  // Glass keeps one body painter and transparent native surface aliases. Only
  // its sidebar stop needs the T3 sidebar role instead of the chat/chrome role.
  const field = `color-mix(in srgb, ${role('sidebar')} var(--translucency-glass-keep, 100%), transparent) var(--glass-rail-edge, 0px), var(--ui-bg-chrome) var(--glass-rail-edge, 0px)`
  const glassCSS = ['light', 'dark'].map(mode => {
    const glass = `html[data-codex-chat-look='true'][data-hermes-theme='${name}'][data-hermes-mode='${mode}'][data-hermes-glass][data-hermes-glass-scope='sidebar']`
    return `${glass} body{background-image:linear-gradient(to right, ${field});}\n${glass}[dir='rtl'] body{background-image:linear-gradient(to left, ${field});}`
  }).join('\n')
  const composerCSS = ['light', 'dark'].map(mode => `html[data-codex-chat-look='true'][data-hermes-theme='${name}'][data-hermes-mode='${mode}'] [data-slot='composer-surface']{border-color:var(--codex-t3-composer-outline)!important;}`).join('\n')
  const composerFillCSS = ['light', 'dark'].map(mode => {
    const scope = `html[data-codex-chat-look='true'][data-hermes-theme='${name}'][data-hermes-mode='${mode}']`
    return `${scope} [data-slot='composer-surface'],${scope} [data-slot='composer-surface'] > [aria-hidden='true']{--composer-fill:var(--codex-t3-composer-fill)!important;background:var(--codex-composer-fill)!important;}`
  }).join('\n') + '\n'
  return `${themeCSS}\n${glassCSS}\n${composerCSS}\n${composerFillCSS}`
}
