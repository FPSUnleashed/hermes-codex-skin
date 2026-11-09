import assert from 'node:assert/strict'
import test from 'node:test'
import { universalFixture } from './helpers/universal-fixture.mjs'

async function fixture(run) {
  await universalFixture(async browser => {
    // All modules are local and loaded; deny network during lifetime probes.
    await browser.call('Network.enable')
    await browser.call('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] })
    await browser.evaluate(`(async () => {
      await flush();
      window.inboxCommand = () => contributions.find(c => c.id === 'toggle-inbox-only').data;
      window.retainedInbox = inboxCommand();
      window.storageTrace = [];
      window.rootWrites = [];
      const get = storage.get, set = storage.set;
      storage.get = (key, fallback) => {
        if (key === 'inbox-only') storageTrace.push(['get', key]);
        return get(key, fallback);
      };
      storage.set = (key, value) => {
        if (key === 'inbox-only') storageTrace.push(['set', key, value]);
        return set(key, value);
      };
      const root = document.documentElement, setAttribute = root.setAttribute;
      root.setAttribute = function(key, value) {
        if (key === 'data-codex-inbox-only') rootWrites.push(value);
        return setAttribute.call(this, key, value);
      };
      window.selectInbox = async command => {
        nativePalette({ ...command, detail: command.detail() });
        await flush();
      };
      window.inboxSnapshot = command => ({
        detail: command.detail(),
        saved: saved.has('inbox-only') ? saved.get('inbox-only') : null,
        marker: root.getAttribute('data-codex-inbox-only'),
        storageTrace: [...storageTrace], rootWrites: [...rootWrites],
        notices: notifications.length
      });
      window.disposeInboxRegistration = async () => {
        for (const dispose of disposals.splice(0).reverse()) dispose();
        await new Promise(resolve => setTimeout(resolve, 450));
        await flush();
      };
    })()`)
    await run(browser)
    assert.deepEqual(await browser.evaluate('errors'), [])
  })
}

test('retained Inbox only native palette callback is inert after unload', async () => {
  await fixture(async browser => {
    const result = await browser.evaluate(`(async () => {
      await disposeInboxRegistration();
      const before = inboxSnapshot(retainedInbox), tick = paletteReceipt.tick;
      await selectInbox(retainedInbox);
      return { before, after: inboxSnapshot(retainedInbox), tick: paletteReceipt.tick - tick };
    })()`)
    assert.equal(result.tick, 1, 'native handleSelect ran the retained palette item')
    assert.equal(result.before.marker, null, 'style cleanup completed before the callback')
    assert.equal(result.before.saved, null)
    assert.deepEqual(result.after, result.before, 'unloaded callback must not read/write storage or restore the root marker')
  })
})

test('retained Inbox only callback cannot change replacement; current native palette callback works', async () => {
  await fixture(async browser => {
    const initial = await browser.evaluate('inboxSnapshot(retainedInbox)')
    assert.match(initial.detail, /^Off/)
    assert.equal(initial.saved, null)
    assert.equal(initial.marker, 'off')
    assert.deepEqual(initial.storageTrace, [])
    assert.deepEqual(initial.rootWrites, [])
    const replacement = await browser.evaluate(`(async () => {
      await disposeInboxRegistration();
      contributions.length = 0;
      __pluginDefault.register({ storage, register: c => contributions.push(c), onDispose: f => disposals.push(f) });
      await flush();
      window.currentInbox = inboxCommand();
      const before = inboxSnapshot(currentInbox), tick = paletteReceipt.tick;
      await selectInbox(retainedInbox);
      return { before, after: inboxSnapshot(currentInbox), tick: paletteReceipt.tick - tick };
    })()`)
    assert.equal(replacement.tick, 1)
    assert.match(replacement.before.detail, /^Off/)
    assert.deepEqual(replacement.after, replacement.before, 'disposed callback must not mutate the replacement registration')

    const enabled = await browser.evaluate(`(async () => {
      await selectInbox(currentInbox);
      return inboxSnapshot(currentInbox);
    })()`)
    assert.match(enabled.detail, /^On/)
    assert.equal(enabled.saved, 'on')
    assert.equal(enabled.marker, 'on')
    const staleWhileOn = await browser.evaluate(`(async () => {
      const before = inboxSnapshot(currentInbox);
      await selectInbox(retainedInbox);
      return { before, after: inboxSnapshot(currentInbox) };
    })()`)
    assert.deepEqual(staleWhileOn.after, staleWhileOn.before, 'stale callback cannot turn a fresh On choice Off')
    const disabled = await browser.evaluate(`(async () => {
      await selectInbox(currentInbox);
      return inboxSnapshot(currentInbox);
    })()`)
    assert.match(disabled.detail, /^Off/)
    assert.equal(disabled.saved, 'off')
    assert.equal(disabled.marker, 'off')
  })
})

test('current Inbox only native palette callback requires verified storage readback', async () => {
  await fixture(async browser => {
    for (const fault of ['silent', 'readback']) {
      const result = await browser.evaluate(`(async () => {
        const get = storage.get, set = storage.set;
        let wrote = false;
        storage.set = (key, value) => {
          if (key !== 'inbox-only') return set(key, value);
          wrote = true;
          if (${JSON.stringify(fault)} !== 'silent') set(key, value);
        };
        storage.get = (key, fallback) => {
          if (key === 'inbox-only' && wrote && ${JSON.stringify(fault)} === 'readback') throw Error('readback failed');
          return get(key, fallback);
        };
        const before = inboxSnapshot(retainedInbox), tick = paletteReceipt.tick;
        await selectInbox(retainedInbox);
        const after = inboxSnapshot(retainedInbox);
        storage.get = get; storage.set = set;
        return { before, after, tick: paletteReceipt.tick - tick, notice: notifications.at(-1) };
      })()`)
      assert.equal(result.tick, 1)
      assert.match(result.after.detail, /^Off/)
      assert.equal(result.after.marker, 'off')
      assert.deepEqual(result.after.rootWrites, result.before.rootWrites, `${fault}: failed save must not update the root`)
      assert.equal(result.after.notices, result.before.notices + 1)
      assert.equal(result.notice.kind, 'error')
      assert.match(result.notice.message, /could not be saved/i)
      assert.equal(result.after.saved, fault === 'silent' ? null : 'on')
    }
    const recovered = await browser.evaluate(`(async () => {
      await selectInbox(retainedInbox);
      return inboxSnapshot(retainedInbox);
    })()`)
    assert.match(recovered.detail, /^On/)
    assert.equal(recovered.saved, 'on')
    assert.equal(recovered.marker, 'on')
    assert.deepEqual(recovered.storageTrace.slice(-3), [['get', 'inbox-only'], ['set', 'inbox-only', 'on'], ['get', 'inbox-only']])
  })
})
