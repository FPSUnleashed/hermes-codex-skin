import { testDependencyRequire } from './helpers/reference-paths.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {shippingCSS} from './helpers/native-background.mjs'
const require = testDependencyRequire()
const postcss = require('postcss')
// Static token contract only: actual pseudo paint/bounds are browser gates.
test('native summary Hammer uses the Thinking text role requested by Gabriel', async () => {
  const css = postcss.parse(await shippingCSS(process.env.CODEX_V9_CSS_BUNDLE))
  let color
  css.walkRules(rule => {
    if (rule.selector === "html[data-codex-chat-look='true'] [data-tool-summary] [class~='group/disclosure-row'] > button::before") {
      rule.walkDecls('color', decl => { color = decl.value })
    }
  })
  assert.equal(color, 'var(--conversation-scaffold-text)')
})
