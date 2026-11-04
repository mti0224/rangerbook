/* Native Ranger portrait composition, shared by all page thumbnails and PNG
 * exports. Geometry matches LRpvprank/assets/poster.js (uiScale = 1).
 * Keep full-body animation sprites and non-Ranger images untouched. */
const MASK_WIDTH = 114, MASK_HEIGHT = 118;
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

// Portrait PNGs are composed during publication. Page display performs no
// Canvas readback, cross-origin image loading, or asynchronous DOM replacement.
export async function portraitUrl(code) {
  if (!/^u\d+[a-z]*(?:-[a-z0-9_-]+)?$/i.test(String(code))) return null;
  return new URL('../portraits/stars/' + encodeURIComponent(code) + '.png', import.meta.url).href;
}
