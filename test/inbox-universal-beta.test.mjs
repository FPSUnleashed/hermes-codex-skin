import assert from 'node:assert/strict'
import test from 'node:test'
import { universalFixture } from './helpers/universal-fixture.mjs'

test('Universal Inbox is visibly marked Beta without changing its saved preference or contribution identity',()=>universalFixture(async browser=>{
  assert.deepEqual(await browser.evaluate(`(()=>{const c=toggle();return {id:c.id,commandId:c.data.id,label:c.data.label,keepOpen:c.data.keepOpen,detailVariant:c.data.detailVariant,betaKeyword:c.data.keywords.includes('beta'),value:readUniversalInbox(),saved:saved.get('universal-inbox')??null}})()`),{
    id:'toggle-universal-inbox',commandId:'codex-chat-look.toggle-universal-inbox',label:'Codex Skin: Universal Inbox (Beta)',keepOpen:true,detailVariant:'state',betaKeyword:true,value:false,saved:null
  })
  await browser.evaluate('runToggle();flush()')
  assert.equal(await browser.evaluate("readUniversalInbox()&&saved.get('universal-inbox')===true&&toggle().data.detail()==='On'"),true)
  await browser.evaluate('runToggle();flush()')
  assert.equal(await browser.evaluate("!readUniversalInbox()&&saved.get('universal-inbox')===false&&toggle().data.detail()==='Off'"),true)
  assert.deepEqual(await browser.evaluate('errors'),[])
}))
