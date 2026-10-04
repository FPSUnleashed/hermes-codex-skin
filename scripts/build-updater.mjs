import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
export function bundleUpdater(source, runtime, name = 'UPDATE') {
  const begin = `// BEGIN GENERATED ${name} RUNTIME`
  const end = `// END GENERATED ${name} RUNTIME`
  const start = source.indexOf(begin), finish = source.indexOf(end)
  if ((start < 0) !== (finish < 0) || (start >= 0 && finish < start)) throw new Error('Incomplete updater markers')
  if (source.indexOf(begin, start + begin.length) >= 0 || source.indexOf(end, finish + end.length) >= 0) throw new Error('Duplicate updater markers')
  const block = `${begin}\n${runtime.trim()}\n${end}\n`
  return start < 0 ? `${source.trimEnd()}\n\n${block}` : source.slice(0, start) + block + source.slice(finish + end.length).trimStart()
}
async function build() {
  // Vendoring is an explicit maintenance operation, not a build dependency.
  const vendorRoot = process.argv.find(arg => arg.startsWith('--vendor-observer='))?.slice('--vendor-observer='.length)
  const observerUrl = new URL('../src/inbox-observer-runtime.js', import.meta.url)
  if (vendorRoot !== undefined) {
    const root = resolve(vendorRoot), require = createRequire(pathToFileURL(`${root}/package.json`))
    if (require('@tanstack/query-core/package.json').version !== '5.101.2' || require('esbuild/package.json').version !== '0.28.1') throw new Error('Observer vendoring requires query-core@5.101.2 and esbuild@0.28.1')
    const { build: bundle } = require('esbuild')
    const result = await bundle({
      stdin: { contents: 'export { QueryObserver } from "@tanstack/query-core"', resolveDir: root, sourcefile: 'codex-inbox-observer-entry.js' },
      bundle: true, write: false, format: 'iife', globalName: 'CodexInboxObserverVendor',
      platform: 'browser', target: 'es2022', minify: true, metafile: true, legalComments: 'none'
    })
    if (Object.values(result.metafile.outputs).some(output => output.imports.length)) throw new Error('Observer bundle has external imports')
    const source = await readFile(observerUrl, 'utf8'), marker = '// BEGIN PINNED OBSERVER BUNDLE'
    const start = source.indexOf(marker)
    if (start < 0) throw new Error('Observer provenance marker is missing')
    await writeFile(observerUrl, source.slice(0, start + marker.length) + '\n' + result.outputFiles[0].text)
  }
  const plugin = new URL('../codex-chat-look/plugin.js', import.meta.url)
  const source = await readFile(plugin, 'utf8')
  const runtime = await readFile(new URL('../src/update-runtime.js', import.meta.url), 'utf8')
  const inboxQuery = await readFile(new URL('../src/inbox-query.js', import.meta.url), 'utf8')
  const inboxObserver = await readFile(observerUrl, 'utf8')
  const inboxRuntime = await readFile(new URL('../src/inbox-runtime.js', import.meta.url), 'utf8')
  const inboxRowUI = await readFile(new URL('../src/inbox-row-ui.js', import.meta.url), 'utf8')
  const inboxOpenGesture = await readFile(new URL('../src/inbox-open-gesture.js', import.meta.url), 'utf8')
  const inboxOpenIntent = await readFile(new URL('../src/inbox-open-intent.js', import.meta.url), 'utf8')
  const output = bundleUpdater(bundleUpdater(source, runtime), `${inboxObserver}\n\n${inboxQuery}\n\n${inboxOpenGesture}\n\n${inboxOpenIntent}\n\n${inboxRowUI}\n\n${inboxRuntime}`, 'INBOX')
  const check = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: output, encoding: 'utf8' })
  if (check.status !== 0) throw new Error(check.stderr || 'Generated module did not parse')
  const digest = createHash('sha256').update(output).digest('hex')
  const files = [
    [plugin, output],
    [new URL('../codex-chat-look/desktop/plugin.js', import.meta.url), output],
    [new URL('../CHECKSUMS.sha256', import.meta.url), `${digest}  codex-chat-look/plugin.js\n`]
  ]
  const staged = [], committed = []
  try {
    for (const [url, content] of files) {
      const path = fileURLToPath(url), temporary = `${path}.build-${process.pid}.tmp`
      const previous = await readFile(path)
      await writeFile(temporary, content)
      staged.push({ path, temporary, previous })
    }
    for (const entry of staged) { await rename(entry.temporary, entry.path); committed.push(entry) }
  } catch (error) {
    for (const entry of committed.reverse()) { await writeFile(entry.temporary, entry.previous); await rename(entry.temporary, entry.path) }
    throw error
  } finally { for (const entry of staged) await unlink(entry.temporary).catch(() => {}) }
  console.log(JSON.stringify({ digest, bytes: Buffer.byteLength(output) }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build()
