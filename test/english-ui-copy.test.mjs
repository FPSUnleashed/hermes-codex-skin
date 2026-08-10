import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../codex-chat-look/plugin.js', import.meta.url), 'utf8')

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf(`function ${nextName}(`, start)
  assert.notEqual(start, -1, `${name} must exist`)
  assert.notEqual(end, -1, `${nextName} must follow ${name}`)
  return source.slice(start, end)
}

test('long user controls stay English under a French locale', () => {
  const code = `${extractFunction('longUserLabels', 'decorateLongUserMessage')}\nresult = longUserLabels()`
  const context = {
    document: { documentElement: { lang: 'fr-FR' } },
    navigator: { language: 'fr-FR' },
    result: null
  }
  vm.runInNewContext(code, context)
  assert.deepEqual({ ...context.result }, { more: 'Show more', less: 'Show less' })
})

test('model effort labels stay English', () => {
  const code = `${extractFunction('prettyModelName', 'decorateModelTrigger')}\nresult = currentModelDisplay()`
  for (const [nativeEffort, expected] of [
    ['Low', 'Low'],
    ['Med', 'Medium'],
    ['Medium', 'Medium'],
    ['High', 'High'],
    ['Extra High', 'Extra High'],
    ['Faible', 'Low'],
    ['Moyen', 'Medium'],
    ['Élevé', 'High'],
    ['Très élevé', 'Extra High']
  ]) {
    const trigger = {
      dataset: {},
      querySelector: () => ({ textContent: `GPT-5.6 · ${nativeEffort}` }),
      textContent: `GPT-5.6 · ${nativeEffort}`
    }
    const context = {
      document: { querySelector: () => trigger },
      result: null
    }
    vm.runInNewContext(code, context)
    assert.equal(context.result.effort, expected, nativeEffort)
  }
})
