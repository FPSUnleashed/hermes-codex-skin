import assert from 'node:assert/strict'
import test from 'node:test'
import {fixture,part,wait} from './helpers/native-thought.mjs'
async function drain(b) {await b.evaluate(`(async()=>{for(let i=0;i<2;i++)await new Promise(resolve=>requestAnimationFrame(()=>requestIdleCallback(()=>resolve(),{timeout:800})))})()`)}
test('text-only critical specialized status duration and timestamp seams still dirty the pair',async()=>{
  const b=await fixture([part('thought','thought',{live:true})],{live:true})
  try {
    await wait(b,`!!header()`);await drain(b)
    await b.evaluate(`window.nativeQueries=0;const pair=el('pair'),native=pair.querySelectorAll;pair.querySelectorAll=function(...args){nativeQueries++;return native.apply(this,args)}`)
    for(const seam of ['aui_response-loading','aui_turn-activity','aui_turn-duration','timeline-timestamp','clarify-inline','tool-approval-inline','alert','error']) {
      await b.evaluate(`{const n=document.createElement('span');n.id='critical-seam';n.textContent='Native status';${seam==='alert'?`n.role='alert'`:seam==='error'?`n.className='text-destructive'`:`n.dataset.slot=${JSON.stringify(seam)}`};el('thought').querySelector('[data-slot="aui_reasoning-text"]').append(n)}`)
      await drain(b)
      const before=await b.evaluate(`nativeQueries`)
      await b.evaluate(`el('critical-seam').textContent='Updated native status'`)
      await drain(b)
      assert.ok(await b.evaluate(`nativeQueries`)>before,seam+' must still invalidate activity')
      assert.equal(await b.evaluate(`el('critical-seam').textContent==='Updated native status'&&el('critical-seam').isConnected`),true)
      await b.evaluate(`el('critical-seam').remove()`);await drain(b)
    }
  } finally { b.close() }
})
