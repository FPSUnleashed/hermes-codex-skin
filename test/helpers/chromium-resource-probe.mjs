import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
const { chromium } = await import(process.env.HELPER_URL)
const mode = process.argv[2]
if (mode === 'success') {
  for (let i = 0; i < 2; i++) {
    const browser = await chromium()
    assert.equal(await browser.evaluate('6 * 7'), 42)
    await browser.close()
    await new Promise(resolve => setTimeout(resolve, 500))
    const adopted = readFileSync(`/proc/${process.ppid}/task/${process.ppid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number).filter(pid => pid !== process.pid)
    assert.deepEqual(adopted, [], 'finished browser descendants must be reaped before the next launch')
    console.log(`SUCCESS_${i + 1}`)
  }
} else if (mode === 'startupfailure') {
  const dir = mkdtempSync(join(process.env.TMPDIR, 'codex-startup-failure-'))
  const entry = join(dir, 'fail-chrome.py')
  writeFileSync(entry, `#!/usr/bin/env python3\nimport os,sys\np=os.environ['CHROME_BIN_ORIGINAL']\nos.execv(p,[p,*sys.argv[1:],'--user-data-dir=/dev/null'])\n`, { mode: 0o700 })
  process.env.CHROME_BIN_ORIGINAL = process.env.CHROME_BIN
  process.env.CHROME_BIN = entry
  await assert.rejects(chromium(), /Chrome exited|CDP timeout/)
  console.log('EXPECTED_STARTUP_FAILURE')
} else if (mode === 'assertion') {
  const browser = await chromium()
  assert.equal(await browser.evaluate('6 * 7'), 42)
  // No close on purpose: the outer ownership boundary must still clean up.
  assert.fail('INTENTIONAL_ASSERTION_FAILURE')
} else if (mode === 'dumpdom') {
  const { stdout } = await promisify(execFile)(process.env.CHROME_BIN, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--dump-dom', 'data:text/html,<title>ISOLATED_DOM_OK</title>'], { timeout: 10000 })
  assert.match(stdout, /<title>ISOLATED_DOM_OK<\/title>/)
  console.log('DUMP_DOM_OK')
} else throw Error('unknown probe mode')
