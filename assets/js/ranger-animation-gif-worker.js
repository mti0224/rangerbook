import { GIFEncoder, quantize, applyPalette } from "../vendor/gifenc/index.js";

let gif;
self.onmessage = ({ data }) => {
  try {
    if (data.type === "start") {
      gif = GIFEncoder();
    } else if (data.type === "frame") {
      if (!gif) throw new Error("encoder-not-started");
      const rgba = new Uint8Array(data.buffer);
      // Reserve index zero explicitly: opaque black must never become transparent.
      // Quantize only visible pixels, preserving 255 colors for the artwork.
      let visibleCount = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= 32) visibleCount++;
      const visible = new Uint8Array(visibleCount * 4);
      for (let i = 0, j = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] < 32) continue;
        visible[j++] = rgba[i];
        visible[j++] = rgba[i + 1];
        visible[j++] = rgba[i + 2];
        visible[j++] = 255;
      }
      const colors = visibleCount ? quantize(visible, 255) : [[0, 0, 0]];
      const mapped = visibleCount ? applyPalette(visible, colors) : [];
      const index = new Uint8Array(data.width * data.height);
      for (let i = 0, j = 0; i < index.length; i++) {
        if (rgba[i * 4 + 3] >= 32) index[i] = mapped[j++] + 1;
      }
      gif.writeFrame(index, data.width, data.height, {
        palette: [[0, 0, 0], ...colors],
        transparent: true,
        transparentIndex: 0,
        // Clear every full-size frame, so moving sprites leave no trails.
        dispose: 2,
        delay: data.delay,
        repeat: 0,
      });
    } else if (data.type === "finish") {
      gif.finish();
      const bytes = gif.bytes();
      self.postMessage({ type: "finished", buffer: bytes.buffer }, [bytes.buffer]);
      gif = null;
      return;
    }
    self.postMessage({ type: "ready" });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
