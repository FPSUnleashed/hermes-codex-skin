import { statSync, accessSync, constants } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

function configuredPath(name, fallbackName, kind) {
  const setting = process.env[name] ? name : fallbackName
  const value = setting && process.env[setting]
  if (!value) throw new Error(`Required test input ${name} is not configured${fallbackName ? ` (or ${fallbackName})` : ''}; supply an authenticated ${kind}, not a substitute implementation`)
  const path = resolve(value)
  let metadata
  try {
    metadata = statSync(path)
    accessSync(path, constants.R_OK)
  } catch (cause) {
    throw new Error(`Required test input ${setting} is not readable: ${path}`, { cause })
  }
  if (kind === 'directory' ? !metadata.isDirectory() : !metadata.isFile()) {
    throw new Error(`Required test input ${setting} must be a ${kind}: ${path}`)
  }
  return path
}

// External source contracts are mandatory. No private machine default, search
// through repair workspaces, silent skip or synthetic native implementation.
export const referenceRoot = (name = 'HERMES_DESKTOP_SOURCE_ROOT', fallbackName) => configuredPath(name, fallbackName, 'directory')
export const referenceFile = name => configuredPath(name, undefined, 'file')

// DOM-only tests do not need native source. Prefer this repository's dependency
// graph; an explicitly provisioned package root may supply jsdom/React instead.
export function testDependencyRequire() {
  const root = process.env.CODEX_TEST_DEPENDENCY_ROOT ? referenceRoot('CODEX_TEST_DEPENDENCY_ROOT') : repositoryRoot
  return createRequire(pathToFileURL(resolve(root, 'package.json')))
}
