import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { referenceRoot, referenceFile, repositoryRoot, testDependencyRequire } from './helpers/reference-paths.mjs'

function environment(values, run) {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return run()
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const rootKey = 'CODEX_PATH_FIXTURE_ROOT', fileKey = 'CODEX_PATH_FIXTURE_FILE'
function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'codex reference paths '))
  try {
    const file = join(directory, 'captured asset.css')
    writeFileSync(file, '/* path-resolution input, not a native implementation */')
    return run(directory, file)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('external inputs fail closed when unconfigured, missing, or the wrong kind', () => fixture((directory, file) => {
  environment({ [rootKey]: undefined, [fileKey]: undefined }, () => {
    assert.throws(() => referenceRoot(rootKey), /Required test input CODEX_PATH_FIXTURE_ROOT is not configured/)
    assert.throws(() => referenceFile(fileKey), /Required test input CODEX_PATH_FIXTURE_FILE is not configured/)
  })
  environment({ [rootKey]: join(directory, 'missing'), [fileKey]: join(directory, 'missing.css') }, () => {
    assert.throws(() => referenceRoot(rootKey), /is not readable/)
    assert.throws(() => referenceFile(fileKey), /is not readable/)
  })
  environment({ [rootKey]: file, [fileKey]: directory }, () => {
    assert.throws(() => referenceRoot(rootKey), /must be a directory/)
    assert.throws(() => referenceFile(fileKey), /must be a file/)
  })
}))

test('configured roots and assets preserve spaces and resolve relative to the caller', () => fixture((directory, file) => {
  environment({ [rootKey]: relative(process.cwd(), directory), [fileKey]: relative(process.cwd(), file) }, () => {
    assert.equal(referenceRoot(rootKey), resolve(directory))
    assert.equal(referenceFile(fileKey), resolve(file))
  })
}))

test('explicit alias fallback is allowed; a broken primary never falls through', () => fixture((directory, file) => {
  environment({ [rootKey]: undefined, [fileKey]: directory }, () => assert.equal(referenceRoot(rootKey, fileKey), directory))
  environment({ [rootKey]: file, [fileKey]: directory }, () => assert.throws(() => referenceRoot(rootKey, fileKey), /must be a directory/))
  environment({ [rootKey]: undefined, [fileKey]: undefined }, () => assert.throws(() => referenceRoot(rootKey, fileKey), /or CODEX_PATH_FIXTURE_FILE/))
}))

test('test dependencies default to the repository, not the native source tree', () => {
  environment({ CODEX_TEST_DEPENDENCY_ROOT: undefined }, () => {
    const require = testDependencyRequire()
    assert.equal(require.resolve('./package.json'), join(repositoryRoot, 'package.json'))
    assert.equal(require('node:path').sep, process.platform === 'win32' ? '\\' : '/')
  })
})

test('explicit dependency roots load real packages without source replacement', () => fixture(directory => {
  const moduleRoot = join(directory, 'node_modules', 'path-fixture')
  mkdirSync(moduleRoot, { recursive: true })
  writeFileSync(join(moduleRoot, 'index.js'), 'module.exports = 42')
  environment({ CODEX_TEST_DEPENDENCY_ROOT: directory }, () => {
    const require = testDependencyRequire()
    assert.equal(require('path-fixture'), 42)
    assert.equal(require.resolve('path-fixture'), join(moduleRoot, 'index.js'))
  })
  environment({ CODEX_TEST_DEPENDENCY_ROOT: join(directory, 'missing') }, () => assert.throws(() => testDependencyRequire(), /is not readable/))
}))
