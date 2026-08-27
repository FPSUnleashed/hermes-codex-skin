import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const pluginUrl = new URL('../../codex-chat-look/plugin.js', import.meta.url)

export async function loadPluginInternals(names = []) {
  let source = await readFile(pluginUrl, 'utf8')
  source = source.replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')
  const exposed = names
    .map(name => `${JSON.stringify(name)}: typeof ${name} === 'undefined' ? null : ${name}`)
    .join(',')
  source += `\nglobalThis.__pluginInternals = {${exposed}};`

  const state = value => ({ get: () => value, subscribe: () => () => {} })
  const context = vm.createContext({
    host: {
      state: {
        activeSessionId: state('theme-test'),
        gateway: state('open'),
        profile: state('default')
      },
      onEvent: () => () => {}
    },
    jsx: () => null,
    useEffect: () => {},
    THEMES_AREA: 'themes',
    TITLEBAR_AREAS: { center: 'center' },
    PALETTE_AREA: 'palette',
    window: { location: { hash: '#/theme-test' } },
    console
  })
  context.globalThis = context
  vm.runInContext(source, context, { filename: pluginUrl.pathname })

  return context.__pluginInternals
}
