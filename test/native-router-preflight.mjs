// Dependency readiness/lifecycle only. This never imports native modules or Chrome.
import { referenceRoot } from './helpers/reference-paths.mjs'
import { resolveNativeRouterDependency, startNativeRouterServer } from './helpers/native-router-dependency.mjs'

const dependency = resolveNativeRouterDependency()
const root = referenceRoot()
const scratch = referenceRoot('CODEX_NATIVE_SCRATCH_ROOT')
const servers = []
try {
  for (const source of ['A', 'B']) servers.push(await startNativeRouterServer({ dependency, source, root, scratch }))
} finally {
  await Promise.all(servers.map(server => server.stop()))
}
console.log(JSON.stringify({
  status: 'DEPENDENCY_PREFLIGHT_ONLY',
  dependency,
  sources: servers.map(({ source, baseUrl }) => ({ source, baseUrl })),
  cleanupComplete: true,
  nativeHttpCertified: false,
  browserCertified: false,
  boundary: 'Readable pinned file, real process spawn, PORT handshake and owned-child cleanup only. No FastAPI/SessionDB, HTTP, grant guard, native module or browser assertions were executed.',
}, null, 2))
