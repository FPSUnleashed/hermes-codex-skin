import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { spawn } from 'node:child_process'

// A pin identifies the supplied bytes, not their native implementation/provenance.
export function resolveNativeRouterDependency(env = process.env) {
  const path = env.CODEX_NATIVE_ROUTER_SERVER
  if (!path) throw new Error('Required test input CODEX_NATIVE_ROUTER_SERVER is not configured; supply an authenticated external Python server (see docs/native-router-dependency.md)')
  if (!isAbsolute(path)) throw new Error('CODEX_NATIVE_ROUTER_SERVER must be an absolute file path')
  try {
    if (!statSync(path).isFile()) throw new Error('not a regular file')
    accessSync(path, constants.R_OK)
  } catch (cause) {
    throw new Error(`CODEX_NATIVE_ROUTER_SERVER must be a readable regular file: ${path}`, { cause })
  }
  const expected = env.CODEX_NATIVE_ROUTER_SERVER_SHA256
  if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error('CODEX_NATIVE_ROUTER_SERVER_SHA256 must be the exact lowercase SHA-256 of the reviewed external server')
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (sha256 !== expected) throw new Error(`CODEX_NATIVE_ROUTER_SERVER_SHA256 mismatch: ${path}`)
  const python = env.CODEX_NATIVE_PYTHON ?? 'python'
  if (env.CODEX_NATIVE_PYTHON !== undefined) {
    if (!isAbsolute(python)) throw new Error('CODEX_NATIVE_PYTHON must be an absolute executable path when configured')
    try {
      if (!statSync(python).isFile()) throw new Error('not a regular file')
      accessSync(python, constants.R_OK | constants.X_OK)
    } catch (cause) {
      throw new Error(`CODEX_NATIVE_PYTHON must be an executable file: ${python}`, { cause })
    }
  }
  return Object.freeze({ path, sha256, python })
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 1000)
    child.once('close', () => { clearTimeout(timer); resolve() })
    child.kill('SIGTERM')
  })
}

export async function startNativeRouterServer({ dependency, source, root, scratch, timeoutMs = 30000 }) {
  if (!['A', 'B'].includes(source)) throw new Error('Native router source must be A or B')
  // Recheck the pin immediately before spawn, including callers reusing a resolution.
  resolveNativeRouterDependency({ CODEX_NATIVE_ROUTER_SERVER: dependency.path, CODEX_NATIVE_ROUTER_SERVER_SHA256: dependency.sha256, ...(dependency.python === 'python' ? {} : { CODEX_NATIVE_PYTHON: dependency.python }) })
  const child = spawn(dependency.python, ['-u', dependency.path, source], {
    cwd: root,
    env: { ...process.env, TMPDIR: scratch, PYTHONDONTWRITEBYTECODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stopPromise
  const stop = () => stopPromise ??= stopChild(child)
  try {
    const port = await new Promise((resolve, reject) => {
      let stdout = '', stderr = '', ready = false, stdoutBytes = 0
      const timer = setTimeout(() => fail(new Error(`Native router ${source} readiness timeout: ${stderr}`)), timeoutMs)
      function fail(error) { clearTimeout(timer); reject(error) }
      child.once('error', cause => fail(new Error(`Native router ${source} spawn failed: ${cause.message}`, { cause })))
      child.once('exit', (code, signal) => fail(new Error(`Native router ${source} exited before readiness: ${code ?? signal}; ${stderr}`)))
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192) })
      child.stdout.on('data', chunk => {
        if (ready) return
        stdoutBytes += chunk.length
        if (stdoutBytes > 65536) return fail(new Error(`Native router ${source} readiness output exceeds 64 KiB`))
        stdout += chunk
        const lines = stdout.split('\n')
        stdout = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('PORT=')) continue
          if (!/^PORT=[1-9][0-9]{0,4}\r?$/.test(line) || Number(line.slice(5)) > 65535) return fail(new Error(`Native router ${source} invalid PORT handshake: ${line}`))
          ready = true
          clearTimeout(timer)
          resolve(Number(line.slice(5)))
          return
        }
      })
    })
    return { child, source, baseUrl: `http://127.0.0.1:${port}`, stop }
  } catch (error) {
    await stop()
    throw error
  }
}
