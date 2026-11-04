const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const renderer = import(pathToFileURL(path.join(root, 'assets/js/ranger-portrait.js')));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

test('native anchor maps the sprite face to the center, with bottom-up Y', async () => {
  const {portraitGeometry, portraitUrl} = await renderer;
  const image = {naturalWidth:200, naturalHeight:300};
  const g = portraitGeometry(image, {faceCenter:{x:.4,y:.7},sizeRatio:.9});
  assert.deepEqual(g, {x:-15,y:59-(1-.7)*270,width:180,height:270});
  assert.equal(g.x + .4*g.width, 57);
  assert.equal(g.y + (1-.7)*g.height, 59);
  assert.deepEqual(portraitGeometry(image, {}), {x:-43,y:-91,width:200,height:300});
});

test('every released Ranger preserves its authoritative native geometry', async () => {
  const {portraitGeometry, portraitUrl} = await renderer;
  const source = read('res/v2/projectiles.json').units;
  const rangers = read('res/v2/rangers.json').rangers;
  const projected = read('res/v2/fast/ranger-portraits.json');
  assert.equal(projected.schemaVersion, 2);
  assert.equal(Object.keys(projected.units).length, rangers.length);
  for (const {rangerCode:code} of rangers) {
    assert.ok((await portraitUrl(code))?.endsWith('/assets/portraits/' + code + '.png'), code);
    const visual = source[code].visual, meta = projected.units[code];
    assert.deepEqual(meta, {faceCenter:visual.faceCenter,sizeRatio:visual.scale}, code);
    const img = {naturalWidth:317,naturalHeight:283};
    const g = portraitGeometry(img, meta);
    // LRpvprank's original composition uses the intrinsic sprite size, never
    // an object-fit/cover factor or a guessed per-page zoom.
    assert.equal(g.width, img.naturalWidth*visual.scale, code);
    assert.equal(g.x, 114/2-visual.faceCenter.x*g.width, code);
    assert.equal(g.y, 118/2-(1-visual.faceCenter.y)*g.height, code);
  }
});

test('only thumbnail URLs qualify; animations, skills and rendered PNGs do not', async () => {
  const {rangerCodeFromUrl} = await renderer;
  assert.equal(rangerCodeFromUrl('https://res.warmycat.com/u003u-bella/u003u-bella-thum.png'), 'u003u-bella');
  assert.equal(rangerCodeFromUrl('https://rangers.lerico.net/res/u88-dwight/u88-dwight-thum-140.png?v=2'), 'u88-dwight');
  for (const src of ['data:image/png;base64,abc', 'https://res.warmycat.com/u1/u1.png',
    'https://res.warmycat.com/u1/u2-thum.png', 'https://res.warmycat.com/skill/icon.png'])
    assert.equal(rangerCodeFromUrl(src), null, src);
});
