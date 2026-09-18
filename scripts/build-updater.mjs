import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
const begin = '// BEGIN GENERATED UPDATE RUNTIME'
const end = '// END GENERATED UPDATE RUNTIME'
export function bundleUpdater(source, runtime) {
  const start = source.indexOf(begin), finish = source.indexOf(end)
  if ((start < 0) !== (finish < 0) || (start >= 0 && finish < start)) throw new Error('Incomplete updater markers')
  if (source.indexOf(begin, start + begin.length) >= 0 || source.indexOf(end, finish + end.length) >= 0) throw new Error('Duplicate updater markers')
  const block = `${begin}\n${runtime.trim()}\n${end}\n`
  return start < 0 ? `${source.trimEnd()}\n\n${block}` : source.slice(0, start) + block + source.slice(finish + end.length).trimStart()
}
async function build() {
  const plugin = new URL('../codex-chat-look/plugin.js', import.meta.url)
  const source = await readFile(plugin, 'utf8')
  const runtime = await readFile(new URL('../src/update-runtime.js', import.meta.url), 'utf8')
  const output = bundleUpdater(source, runtime)
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
