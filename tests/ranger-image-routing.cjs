const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/site.js'), 'utf8');
const start = source.indexOf('  const LEGACY_RES_BASE');
const end = source.indexOf('\n(() => {\n  function normalizedPath', start);
const routing = '(() => {\n' + source.slice(start, end);

function fixture(base = 'https://test.invalid/') {
  class Element {
    constructor() { this.dataset = {}; this.attributes = {}; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] || null; }
    querySelectorAll() { return []; }
  }
  class Image extends Element {
    get src() { return new URL(this.getAttribute('src') || '', base).href; }
    set src(value) { this.attributes.src = String(value); }
  }
  const img = new Image();
  img.attributes.src = 'https://rangers.lerico.net/res/u003u-bella/u003u-bella-thum.png';
  let observer, onerror;
  const document = {currentScript:{src:base+'assets/js/site.js'},documentElement:{},
    querySelectorAll:()=>[img],addEventListener:(type, listener)=>{if(type==='error')onerror=listener;}};
  const location = {href:base};
  vm.runInNewContext(routing, {document,location,window:{location},Element,HTMLImageElement:Image,URL,
    MutationObserver:class {constructor(fn){observer=fn;} observe(){}}});
  return {img, change:()=>observer([{type:'attributes',target:img,addedNodes:[]}]),
    error:()=>{
      let stopped=false;
      onerror({target:img,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){stopped=true;}});
      return stopped;
    }};
}

test('HTML thumbnails immediately route to same-origin PNGs, including subpath hosting', () => {
  for (const root of ['https://test.invalid/', 'https://test.invalid/rangerbook/']) {
    const {img}=fixture(root);
    assert.equal(img.src,root+'assets/portraits/u003u-bella.png');
  }
});

test('missing local portrait preserves IMG and tries primary then legacy original', () => {
  const {img,error,change}=fixture();
  assert.equal(error(),true,'Suppress page handlers that remove failed image tags');
  assert.equal(img.src,'https://res.warmycat.com/u003u-bella/u003u-bella-thum.png');
  change();
  assert.equal(img.src,'https://res.warmycat.com/u003u-bella/u003u-bella-thum.png','Do not loop back to the missing local PNG');
  assert.equal(error(),true);
  assert.equal(img.src,'https://rangers.lerico.net/res/u003u-bella/u003u-bella-thum.png');
  change();
  assert.equal(error(),false,'Existing page failure handler runs only after original sources also fail');
});

test('a reused team image resets failure state when switched to another Ranger', () => {
  const {img,error,change}=fixture();
  error(); error();
  img.src='https://res.warmycat.com/u99-susu/u99-susu-thum.png';
  change();
  assert.equal(img.src,'https://test.invalid/assets/portraits/u99-susu.png');
  assert.equal(img.dataset.resourceFallbackTried,undefined);
  assert.equal(error(),true);
  assert.equal(img.src,'https://res.warmycat.com/u99-susu/u99-susu-thum.png');
});
