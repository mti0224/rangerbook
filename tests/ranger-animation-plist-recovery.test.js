const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function el(tagName, textContent = "", children = []) {
  return { tagName, textContent, children, firstElementChild: children[0] || null };
}
function dict(entries) {
  return el("dict", "", entries.flatMap(([key, val]) => [el("key", key), val]));
}
function sampleXmlDocument() {
  const sprite = dict([
    ["textureRect", el("string", "{{98.0,322.0},{99.0,99.0}}")],
    ["textureRotated", el("false")],
    ["aliases", el("array", "", [el("string", "alias.png")])],
  ]);
  const frames = dict([["sprite.png", sprite]]);
  return { documentElement: el("plist", "", [dict([["frames", frames]])]), querySelector: () => null };
}

function animationViewerApi(fetcher) {
  const document = {
    currentScript: { src: "https://local.test/assets/js/ranger-animation-viewer.js" },
    querySelector: () => true,
    getElementById: () => null,
    addEventListener: () => {},
    readyState: "loading",
  };
  const window = { location: { pathname: "/" }, addEventListener: () => {} };
  const source = fs.readFileSync(require.resolve("../assets/js/ranger-animation-viewer.js"), "utf8")
    .replace("  window.RangerAnimationExport = {",
      "  window.__spriteRecoveryTest = {atlasPixelRect, validSpriteRect, applyOriginalAtlasXml, recoverSpriteAtlas};\n  window.RangerAnimationExport = {");
  const context = {
    document, window, URL, console,
    fetch: fetcher,
    DOMParser: class { parseFromString() { return sampleXmlDocument(); } },
    MutationObserver: class { observe() {} },
  };
  vm.runInNewContext(source, context);
  assert.ok(window.__spriteRecoveryTest, "Actual viewer must expose internal helper to test");
  return window.__spriteRecoveryTest;
}

test("atlas decimal rectangle parsing doesn't split fractional values", () => {
  const api = animationViewerApi(() => { throw new Error("unexpected fetch"); });
  assert.equal(JSON.stringify(api.atlasPixelRect("{{98.0,322.0},{99.0,99.0}}")), "[98,322,99,99]");
  assert.equal(JSON.stringify(api.atlasPixelRect("{{-2.5,1.5},{22.5,20}}")), "[-2,2,23,20]");
  assert.equal(api.atlasPixelRect("not a rectangle"), null);
});

test("published broken sprite is recovered from original XML and alias is mapped", () => {
  const api = animationViewerApi(() => { throw new Error("unexpected fetch"); });
  const part = {
    images: [{ name: "sprite.png" }, { name: "alias.png" }],
    sprites: { "sprite.png": { rect: [98,0,322,0], rotated: true } },
  };
  assert.equal(api.applyOriginalAtlasXml(part, "<plist/>"), 2);
  assert.equal(JSON.stringify(part.sprites["sprite.png"].rect), "[98,322,99,99]");
  assert.equal(JSON.stringify(part.sprites["alias.png"].rect), "[98,322,99,99]");
  assert.equal(part.sprites["alias.png"].rotated, false);
});

test("raw plist recovery happens once and preserves all valid sprite metadata", async () => {
  let count = 0;
  const api = animationViewerApi(async () => {
    count++;
    return { ok: true, text: async () => "<plist/>" };
  });
  const part = {
    plist: "u415e-riza/u415e-riza-body.plist",
    images: [{name:"sprite.png"}],
    sprites: { "sprite.png": {rect:[0,0,0,0]} },
  };
  await Promise.all([api.recoverSpriteAtlas(part), api.recoverSpriteAtlas(part)]);
  await api.recoverSpriteAtlas(part);
  assert.equal(count, 1);
  assert.equal(JSON.stringify(part.sprites["sprite.png"].rect), "[98,322,99,99]");
  const normal = {plist:"u1000e-moon/u1000e-moon-body.plist",images:[{name:"ok"}],sprites:{ok:{rect:[0,0,20,30]}}};
  await api.recoverSpriteAtlas(normal);
  assert.equal(count, 1);
});

test("rejects traversal plist URL without requesting it", async () => {
  let count = 0;
  const api = animationViewerApi(async () => {count++; return {ok:false};});
  const part = {plist:"../../credentials.plist",images:[{name:"missing"}],sprites:{}};
  await api.recoverSpriteAtlas(part);
  assert.equal(count, 0);
});
