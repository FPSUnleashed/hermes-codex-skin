import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'
import { restoreDOMAttribute } from './helpers/restore-dom-attribute.mjs'

test('sidebar fixture restores exact native attributes after CSSOM RTL, including absent and empty style', async () => {
  const b = await chromium()
  try {
    await b.evaluate(`window.restoreDOMAttribute=${restoreDOMAttribute.toString()}`)
    for (const style of [null, '', 'color: red; --native: 7px !important;']) {
      for (const dir of [null, '', 'rtl']) {
        const result = await b.evaluate(`(() => {
          document.body.innerHTML='<aside><div class="search-row"><button>New session</button><input placeholder="Search sessions"></div></aside>';
          document.documentElement.dir='ltr';
          const sidebar=document.querySelector('aside'),row=sidebar.firstElementChild;
          const button=row.querySelector('button'),input=row.querySelector('input');
          const style=${JSON.stringify(style)},dir=${JSON.stringify(dir)};
          if(style!==null)row.setAttribute('style',style);
          if(dir!==null)row.setAttribute('dir',dir);
          const original=sidebar.innerHTML,attributes={style:row.getAttribute('style'),dir:row.getAttribute('dir')};
          let clicks=0,searches=0;
          button.addEventListener('click',()=>clicks++);
          input.addEventListener('input',()=>searches++);
          row.removeAttribute('dir');row.style.direction='rtl';
          const direction=getComputedStyle(row).direction;
          // Do not serialize/read the dirty style before calling the primitive:
          // that would accidentally repair the historical failing removal.
          for(const name of ['style','dir'])restoreDOMAttribute(row,name,attributes[name]);
          button.click();input.value='needle';input.dispatchEvent(new Event('input',{bubbles:true}));
          return {direction,exact:sidebar.innerHTML===original,style:row.getAttribute('style'),dir:row.getAttribute('dir'),
            nodes:sidebar.firstElementChild===row&&row.querySelector('button')===button&&row.querySelector('input')===input,
            clicks,searches,value:input.value,markers:sidebar.querySelectorAll('[data-codex-t3-search-row]').length};
        })()`)
        const identity = JSON.stringify({ style, dir })
        assert.equal(result.direction, 'rtl', identity + ': CSSOM override is actually exercised')
        assert.equal(result.exact, true, identity + ': exact native primitive DOM restored')
        assert.equal(result.style, style, identity + ': absent, empty and nonempty style remain distinct')
        assert.equal(result.dir, dir, identity + ': native dir restored')
        assert.equal(result.nodes, true, identity + ': original nodes retained')
        assert.equal(result.clicks, 1, identity + ': native button handler retained')
        assert.equal(result.searches, 1, identity + ': native input handler retained')
        assert.equal(result.value, 'needle')
        assert.equal(result.markers, 0)
      }
    }
  } finally { b.close() }
})
