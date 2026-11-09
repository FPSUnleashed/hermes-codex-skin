#!/usr/bin/env node
// Read-only authentication. No downloads, installs, browser launches or fallback inputs.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { accessSync, constants, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const plugin = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(readFileSync(new URL('./ci-inputs.json', import.meta.url), 'utf8'))
const flags = new Set(process.argv.slice(2))
for (const flag of flags) assert.ok(['--installed', '--checkouts'].includes(flag), `Unknown argument: ${flag}`)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const receipt = { schema: 1, checks: [], packages: {}, checkouts: {} }

function required(name, directory = false) {
  assert.ok(process.env[name], `Required test input ${name} is not configured`)
  const path = resolve(process.env[name])
  assert.equal(directory ? lstatSync(path).isDirectory() : lstatSync(path).isFile(), true, `${name}: wrong input kind: ${path}`)
  accessSync(path, constants.R_OK)
  return path
}

function checkFile(path, expected) {
  assert.ok(lstatSync(path).isFile(), `Not a regular input file: ${path}`)
  const actual = sha(readFileSync(path))
  assert.equal(actual, expected, `SHA-256 mismatch: ${path}`)
  receipt.checks.push({ path, sha256: actual })
}

function checkFiles(root, files) {
  for (const [relative, expected] of Object.entries(files)) checkFile(resolve(root, relative), expected)
}

function checkDirectory(root, relative, expected) {
  const files = []
  function visit(path) {
    for (const name of readdirSync(resolve(root, path))) {
      const child = `${path}/${name}`
      if ((expected.excluded || []).includes(child)) continue
      const stat = lstatSync(resolve(root, child))
      assert.ok(!stat.isSymbolicLink(), `Symlink is not an authenticated source: ${child}`)
      if (stat.isDirectory()) visit(child)
      else {
        assert.ok(stat.isFile(), `Not a regular source: ${child}`)
        files.push(child)
      }
    }
  }
  visit(relative)
  files.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
  const records = files.map(path => `${sha(readFileSync(resolve(root, path)))}  ${path}\n`).join('')
  assert.equal(files.length, expected.files, `Source file count: ${relative}`)
  assert.equal(sha(records), expected.sha256, `Source directory SHA-256 mismatch: ${relative}`)
  receipt.checks.push({ path: resolve(root, relative), ...expected })
}

function checkCheckout(root, input) {
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  assert.equal(git(['rev-parse', 'HEAD']), input.commit, `Wrong checkout commit: ${root}`)
  git(['diff', '--exit-code', 'HEAD', '--'])
  receipt.checkouts[input.repository] = input.commit
}

function checkPackages(root, expected) {
  const lock = json(resolve(root, 'package-lock.json'))
  const versions = {}
  for (const [name, version] of Object.entries(expected)) {
    const slot = `node_modules/${name}`
    const actual = json(resolve(root, slot, 'package.json'))
    assert.equal(actual.name, name, `Wrong installed package: ${slot}`)
    assert.equal(actual.version, version, `Wrong installed version: ${name}`)
    assert.equal(lock.packages[slot]?.version, version, `Installed/locked version mismatch: ${name}`)
    versions[name] = version
  }
  receipt.packages[root] = versions
}

function checkHistorical(native) {
  const input = manifest.historical
  const fixture = resolve(plugin, 'test/fixtures/ci-historical')
  // Authenticate metadata/notices and fixed role paths before a dependency install.
  checkFiles(fixture, input.files)
  checkDirectory(plugin, 'test/fixtures/ci-historical', input.fixtureClosure)
  const provenance = json(resolve(fixture, 'provenance.json'))
  for (const [name, relative] of Object.entries(input.roles)) {
    assert.equal(realpathSync(required(name)), realpathSync(resolve(fixture, relative)), `${name}: use the qualified vendored role`)
    checkFile(required(name), input.files[relative])
  }
  const baseline = required('CODEX_WIDTH_PRE_REPAIR_ROOT', true)
  assert.equal(realpathSync(baseline), realpathSync(resolve(fixture, 'baseline')), 'Use the independent historical baseline layout')

  const projection = provenance.renderer_projection
  assert.equal(projection.source_commit, manifest.native.commit, 'Requalify projection for changed native pin')
  checkFile(resolve(plugin, projection.consumer), projection.consumer_sha256)
  checkFiles(plugin, input.consumerFiles)
  // Freeze the complete test and script closure, not a grep for today's env name:
  // indirect/new consumers or a changed helper also require explicit requalification.
  for (const [relative, expected] of Object.entries(input.consumerClosures)) checkDirectory(plugin, relative, expected)
  const text = readFileSync(resolve(fixture, 'renderer-class-projection.js'), 'utf8')
  const classes = JSON.parse(text.slice(text.indexOf('export default ') + 'export default '.length).trim().replace(/;$/, ''))
  assert.equal(classes.length, 6, 'Only the six qualified literals are permitted')
  assert.equal(projection.source_records.length, classes.length, 'Projection source record count')
  for (const [index, record] of projection.source_records.entries()) {
    checkFile(resolve(native, record.relative), record.source_sha256)
    assert.equal(sha(classes[index]), record.classes_sha256, `Qualified literal changed: ${record.slot}`)
    const source = readFileSync(resolve(native, record.relative), 'utf8')
    assert.ok(source.includes(classes[index]) && source.includes(record.slot), `Qualified source literal missing: ${record.slot}`)
  }
  receipt.historical = 'Exact public-reproduced CSS; independent historical baseline/loader; six-literal class projection only. Not original capture attestation or geometric qualification.'
}

try {
  assert.equal(process.version, manifest.node, 'Use the pinned CI Node version')
  for (const name of ['CODEX_INBOX_QUERY_CORE_ROOT', 'NODE_PATH', 'NODE_OPTIONS', 'CODEX_TRANSCRIPT_TEST_DOM', 'CODEX_WIDTH_BASELINE']) {
    assert.ok(!process.env[name], `Leave ${name} unset for the full CI contract`)
  }
  checkFiles(plugin, manifest.plugin.files)
  const tests = readdirSync(resolve(plugin, 'test')).filter(name => name.endsWith('.test.mjs'))
  assert.equal(tests.length, manifest.regressionFiles, 'Regression glob changed; reconcile the manifest, never filter files')
  receipt.regressionFiles = tests.length

  const native = required('HERMES_DESKTOP_SOURCE_ROOT', true)
  checkHistorical(native)
  for (const name of ['HERMES_THEME_SOURCE_ROOT', 'SIDEBAR_NATIVE_ROOT', 'COMPLETE_MESSAGES_NATIVE_ROOT']) {
    assert.equal(realpathSync(required(name, true)), realpathSync(native), `${name} must use the same locked native root`)
  }
  checkFiles(native, manifest.native.files)
  for (const [relative, expected] of Object.entries(manifest.native.sourceDirectories)) checkDirectory(native, relative, expected)
  const t3 = required('T3_THEME_SOURCE_ROOT', true)
  assert.equal(realpathSync(required('T3_REFERENCE_SOURCE_ROOT', true)), realpathSync(t3), 'Use the pinned T3 source for both roles')
  checkFiles(t3, manifest.t3.files)
  if (flags.has('--checkouts')) {
    checkCheckout(native, manifest.native)
    checkCheckout(t3, manifest.t3)
  }


  if (flags.has('--installed')) {
    const dependencies = process.env.CODEX_TEST_DEPENDENCY_ROOT ? required('CODEX_TEST_DEPENDENCY_ROOT', true) : plugin
    checkFiles(dependencies, manifest.plugin.files)
    checkPackages(dependencies, json(resolve(plugin, 'package.json')).devDependencies)
    checkPackages(native, manifest.native.packages)
    const tabler = required('SIDEBAR_TABLER_ENTRY')
    assert.equal(realpathSync(tabler), realpathSync(resolve(native, 'node_modules/@tabler/icons-react/dist/esm/tabler-icons-react.mjs')), 'Tabler must come from the native lock')
    checkFile(tabler, manifest.native.tablerEntrySHA256)
  }
  receipt.scope = 'Input bytes, source closures and optional installed package identities; not full npm file integrity, browser execution or suite qualification.'
  receipt.verified = true
  console.log(JSON.stringify(receipt, null, 2))
} catch (error) {
  console.error(JSON.stringify({ verified: false, error: error.message }, null, 2))
  process.exitCode = 1
}
