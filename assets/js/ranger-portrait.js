/* Native Ranger portrait composition, shared by all page thumbnails and PNG
 * exports. Geometry matches LRpvprank/assets/poster.js (uiScale = 1).
 * Keep full-body animation sprites and non-Ranger images untouched. */
const MASK_WIDTH = 114, MASK_HEIGHT = 118;
const assetRoot = 'https://raw.githubusercontent.com/mti0224/rangerbook_res/main/';
const metadataUrl = new URL('../../res/v2/fast/ranger-portraits.json', import.meta.url);
const maskUrl = new URL('../main_icon/portrait-mask-native.png', import.meta.url);
let metadataPromise, maskPromise;
const portraits = new Map();

export function portraitGeometry(img, meta, maskWidth = MASK_WIDTH, maskHeight = MASK_HEIGHT) {
  const ratio = Number(meta?.sizeRatio);
  const scale = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const mx = Number(meta?.faceCenter?.x), my = Number(meta?.faceCenter?.y);
  const ax = Number.isFinite(mx) ? mx : .5;
  const ay = Number.isFinite(my) ? my : .5;
  const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
  // Cocos2d anchors count Y from the bottom; Canvas counts from the top.
  return {x:maskWidth / 2 - ax * width, y:maskHeight / 2 - (1 - ay) * height, width, height};
}

export function rangerCodeFromUrl(src) {
  try {
    const url = new URL(src, import.meta.url);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const match = url.pathname.match(/\/([a-z0-9_-]+)\/\1-thum(?:-140)?\.png$/i);
    return match?.[1] || null;
  } catch { return null; }
}

function metadata() {
  return metadataPromise ||= fetch(metadataUrl.href).then(async response => {
    if (!response.ok) throw new Error('Portrait metadata HTTP ' + response.status);
    const data = await response.json();
    if (data.schemaVersion !== 2 || !data.units) throw new Error('Invalid portrait metadata');
    return data.units;
  }).catch(error => { metadataPromise = null; throw error; });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Portrait asset unavailable: ' + src));
    img.src = src;
  });
}

async function compose(code, meta) {
  const id = encodeURIComponent(code);
  const [img, mask] = await Promise.all([
    loadImage(assetRoot + id + '/' + id + '-thum.png')
      .catch(() => loadImage(assetRoot + id + '/' + id + '-thum-140.png')),
    maskPromise ||= loadImage(maskUrl.href).catch(error => { maskPromise = null; throw error; })
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = MASK_WIDTH; canvas.height = MASK_HEIGHT;
  const ctx = canvas.getContext('2d');
  const g = portraitGeometry(img, meta);
  ctx.drawImage(img, g.x, g.y, g.width, g.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  return canvas.toDataURL('image/png');
}

// The caller may keep the returned PNG after cache eviction. Data URLs avoid
// revoking a Blob URL that is still displayed in another page component.
export async function portraitUrl(code) {
  const units = await metadata();
  if (!Object.hasOwn(units, code)) return null;
  if (portraits.has(code)) {
    const value = portraits.get(code);
    portraits.delete(code); portraits.set(code, value);
    return value;
  }
  const value = compose(code, units[code]).catch(error => { portraits.delete(code); throw error; });
  portraits.set(code, value);
  if (portraits.size > 128) portraits.delete(portraits.keys().next().value);
  return value;
}

if (typeof document !== 'undefined') {
  const pending = new WeakMap(), requests = new WeakMap();
  async function render(img) {
    const src = img.getAttribute('src');
    const code = rangerCodeFromUrl(src);
    if (!code || requests.get(img) === src) return;
    requests.set(img, src);
    try {
      const url = await portraitUrl(code);
      // A recycled team slot may already refer to a different Ranger.
      if (!url || !img.isConnected || img.getAttribute('src') !== src) return;
      img.src = url;
      img.dataset.rangerPortrait = code;
    } catch (error) {
      // Original page image and its existing resource fallback remain usable.
      requests.delete(img);
      console.warn('Ranger portrait unavailable:', code, error);
    }
  }
  const visible = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      visible.unobserve(entry.target);
      render(entry.target);
    }
  }, {rootMargin:'300px'}) : null;
  function scan(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const src = img.getAttribute('src');
    if (!rangerCodeFromUrl(src)) { pending.delete(img); requests.delete(img); return; }
    if (pending.get(img) === src) return;
    pending.set(img, src);
    delete img.dataset.rangerPortrait;
    if (visible) visible.observe(img); else render(img);
  }
  function forget(img) {
    pending.delete(img); requests.delete(img); visible?.unobserve(img);
  }
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') scan(record.target);
      for (const node of record.addedNodes) if (node instanceof Element) {
        scan(node); node.querySelectorAll('img').forEach(scan);
      }
      for (const node of record.removedNodes) if (node instanceof Element && !node.isConnected) {
        forget(node); node.querySelectorAll('img').forEach(forget);
      }
    }
  }).observe(document.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  document.querySelectorAll('img').forEach(scan);
}
