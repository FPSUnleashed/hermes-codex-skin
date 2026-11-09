import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Use rendered state, not wall time; fail even if Chromium stops producing frames.
export async function waitForRendered(browser, predicate, message, timeout = 1500) {
  return browser.evaluate(`new Promise((resolve,reject)=>{
    let frame;
    const cleanup=()=>{clearTimeout(timer);cancelAnimationFrame(frame)};
    const timer=setTimeout(()=>{cleanup();reject(Error(${JSON.stringify(message)}))},${timeout});
    const poll=()=>{
      try {if(${predicate}){cleanup();resolve();return}}
      catch(error){cleanup();reject(error);return}
      frame=requestAnimationFrame(poll);
    };
    poll();
  })`)
}

export async function chromium() {
  const executable = [process.env.CHROME_BIN, '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p))
  assert.ok(executable, 'Chrome is required for browser behavior tests')
  // Tests own their scratch profile; never attach to the user's default one.
  // Scratch retention cleans it after Chrome descendants finish writing.
  const profile = mkdtempSync(join(tmpdir(), 'codex-browser-'))
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', `--user-data-dir=${profile}`, '--remote-debugging-pipe'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })

  let serial = 0, buffer = ''
  const pending = new Map()
  const fail = error => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error) }
    pending.clear()
  }
  child.on('error', fail)
  child.on('exit', () => fail(new Error('Chrome exited')))
  child.stdio[4].on('data', chunk => {
    buffer += chunk.toString()
    let end
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1)
      const entry = pending.get(message.id)
      if (!entry) continue
      clearTimeout(entry.timer); pending.delete(message.id)
      message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result)
    }
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++serial
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
    pending.set(id, { resolve, reject, timer })
    child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const call = (method, params) => send(method, params, sessionId)
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    await call('Page.enable')
    await send('Target.activateTarget', { targetId })
    await call('Page.bringToFront')
    return { call, evaluate, close: () => { fail(new Error('Browser test ended')); child.kill('SIGKILL') } }
  } catch (error) { fail(error); child.kill('SIGKILL'); throw error }
}
