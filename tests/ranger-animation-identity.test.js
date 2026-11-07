const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../assets/js/ranger-animation-viewer.js'), 'utf8');

async function mount({id, src, fallback, readyState = 'complete'}) {
  let panel = '', load;
  const content = {
    children: [{}],
    querySelector(selector) {
      if (selector === '.ranger-detail-head') return id ? {dataset: {rangerUnitId: id}} : null;
      if (selector === '.ranger-detail-image') return src || fallback
        ? {getAttribute: () => src, dataset: {resourceFallbackSrc: fallback}} : null;
      return null;
    },
    insertAdjacentHTML(position, html) { panel += html; }
  };
  const document = {
    readyState,
    currentScript: {src: 'https://example.com/assets/js/ranger-animation-viewer.js'},
    querySelector: () => ({}),
    getElementById: () => content,
    addEventListener() {}
  };
  vm.runInNewContext(source, {
    document, URL, CSS: {escape: value => value},
    window: {location: {pathname: '/ranger/ranger/u1642e-crush'}, addEventListener: (name, fn) => { load = fn; }},
    MutationObserver: class { observe() {} },
    // No metadata: initialization must still insert the correctly identified fallback panel.
    fetch: async () => ({ok: true, json: async () => ({units: {}})})
  });
  if (load) load();
  await new Promise(resolve => setImmediate(resolve));
  return panel;
}

for (const readyState of ['loading', 'complete']) {
  test(`explicit identity survives a missing/replaced portrait (${readyState})`, async () => {
    const panel = await mount({id: 'u1642e-crush', src: '/unrelated.png', readyState});
    assert.match(panel, /data-animation-unit-id="u1642e-crush"/);
    assert.match(await mount({id: 'u1642e-crush', readyState}), /data-animation-unit-id="u1642e-crush"/);
  });
}

for (const src of [
  'https://example.com/assets/portraits/stars/u1642e-crush.png',
  '/rangerbook/assets/portraits/u1642e-crush.png?v=1',
  'https://res.warmycat.com/u1642e-crush/u1642e-crush-thum.png',
  'https://rangers.lerico.net/res/u1642e-crush/u1642e-crush-thum.png',
  '/res_from_emulator/u1642e-crush/u1642e-crush-thum.png'
]) {
  test(`legacy markup identifies ${src}`, async () => {
    assert.match(await mount({src}), /data-animation-unit-id="u1642e-crush"/);
  });
}

test('resource fallback URL remains compatible with older ranking markup', async () => {
  assert.match(await mount({src: '/unknown.png', fallback: 'https://rangers.lerico.net/res/u1642e-crush/u1642e-crush-thum.png'}), /data-animation-unit-id="u1642e-crush"/);
});

test('unidentified content does not mount the wrong animation', async () => {
  assert.equal(await mount({src: '/unknown.png'}), '');
});
