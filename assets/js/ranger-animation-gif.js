(() => {
  "use strict";
  const scriptBase = new URL(".", document.currentScript.src);
  const FPS = 30;
  const MAX_FRAMES = 1800;
  const states = new Map();
  let activeExport = null;
  const tr = (key, fallback) => window.RangerbookI18n?.t(key, fallback) || fallback;
  const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

  function isAdmin() {
    return window.RangerbookAuth?.isAdmin() === true;
  }

  async function ensureAuth() {
    if (!window.RangerbookAuth) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL("admin-auth.js", scriptBase).href;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    await window.RangerbookAuth.ready();
    updateAuth();
  }

  function updateAuth() {
    for (const [section, state] of states) {
      if (!section.isConnected) {
        if (activeExport?.section === section) activeExport.controller.abort();
        states.delete(section);
        continue;
      }
      state.actions.hidden = !isAdmin();
    }
    if (!isAdmin()) activeExport?.controller.abort();
  }

  // Measure transformed sprite rectangles without allocating a giant intermediate
  // canvas. Both passes invoke the identical renderer at identical timestamps.
  function boundsContext() {
    const context = document.createElement("canvas").getContext("2d");
    const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    const proxy = new Proxy(context, {
      get(target, name) {
        if (name === "drawImage") return (image, x, y) => {
          if (target.globalAlpha <= 0) return;
          const m = target.getTransform();
          for (const [px, py] of [[x, y], [x + image.width, y], [x, y + image.height], [x + image.width, y + image.height]]) {
            const tx = m.a * px + m.c * py + m.e;
            const ty = m.b * px + m.d * py + m.f;
            bounds.left = Math.min(bounds.left, tx);
            bounds.top = Math.min(bounds.top, ty);
            bounds.right = Math.max(bounds.right, tx);
            bounds.bottom = Math.max(bounds.bottom, ty);
          }
        };
        const value = target[name];
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, name, value) { target[name] = value; return true; },
    });
    return { context: proxy, bounds };
  }

  function encoderWorker(signal) {
    const worker = new Worker(new URL("ranger-animation-gif-worker.js", scriptBase), { type: "module" });
    let pending = null;
    let failure = null;
    function fail(error) {
      failure = error;
      pending?.reject(error);
      pending = null;
      worker.terminate();
    }
    worker.onmessage = ({ data }) => {
      if (data.type === "error") {
        fail(new Error(data.message));
        return;
      }
      const request = pending;
      pending = null;
      request?.resolve(data);
    };
    worker.onerror = event => {
      event.preventDefault();
      fail(new Error("encoder-worker-failed"));
    };
    const abort = () => fail(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    return {
      send(message, transfer = []) {
        if (failure) return Promise.reject(failure);
        return new Promise((resolve, reject) => {
          pending = { resolve, reject };
          worker.postMessage(message, transfer);
        });
      },
      close() {
        signal.removeEventListener("abort", abort);
        worker.terminate();
      },
    };
  }

  function setStatus(state, key, fallback, percent) {
    state.status.dataset.i18n = key;
    state.status.textContent = tr(key, fallback);
    state.progress.textContent = percent === undefined ? "" : ` ${percent}%`;
  }

  async function download(section, state) {
    if (activeExport || !isAdmin()) return;
    const controller = new AbortController();
    const { signal } = controller;
    activeExport = { section, controller };
    for (const value of states.values()) value.download.disabled = true;
    state.cancel.hidden = false;
    state.actions.setAttribute("aria-busy", "true");
    let encoder;
    try {
      // Revalidate the session before starting a privileged UI action.
      await window.RangerbookAuth.refresh();
      if (!isAdmin()) controller.abort();
      signal.throwIfAborted();
      const job = window.RangerAnimationExport.createJob(section);
      const count = Math.ceil(job.duration * FPS);
      if (!Number.isFinite(count) || count < 1) throw new Error("animation-unavailable");
      if (count > MAX_FRAMES) throw new Error("animation-too-long");
      const check = () => {
        if (!section.isConnected || !isAdmin()) controller.abort();
        signal.throwIfAborted();
      };
      setStatus(state, "animation.gif.preparing", "正在準備 GIF…", 0);
      const measure = boundsContext();
      for (let i = 0; i < count; i++) {
        check();
        await job.render(measure.context, i / FPS);
        if (i % 8 === 0) {
          setStatus(state, "animation.gif.preparing", "正在準備 GIF…", Math.round((i + 1) / count * 100));
          await nextTask();
        }
      }
      const { left, top, right, bottom } = measure.bounds;
      if (![left, top, right, bottom].every(Number.isFinite)) throw new Error("animation-unavailable");
      const padding = 12;
      const rawWidth = Math.ceil(right - left) + padding * 2;
      const rawHeight = Math.ceil(bottom - top) + padding * 2;
      const scale = Math.min(1, 1280 / rawWidth, 960 / rawHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(rawWidth * scale));
      canvas.height = Math.max(1, Math.ceil(rawHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      check();
      encoder = encoderWorker(signal);
      await encoder.send({ type: "start" });
      for (let i = 0; i < count; i++) {
        check();
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.save();
        context.scale(scale, scale);
        context.translate(padding - left, padding - top);
        await job.render(context, i / FPS);
        context.restore();
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        // GIF delays are centiseconds: alternate 30/40 ms at 30 fps without drift.
        const end = Math.min((i + 1) / FPS, job.duration);
        const delay = Math.max(10, (Math.round(end * 100) - Math.round(i / FPS * 100)) * 10);
        await encoder.send({ type: "frame", width: canvas.width, height: canvas.height, delay, buffer: data.buffer }, [data.buffer]);
        setStatus(state, "animation.gif.encoding", "正在產生 GIF…", Math.round((i + 1) / count * 100));
      }
      const result = await encoder.send({ type: "finish" });
      check();
      const url = URL.createObjectURL(new Blob([result.buffer], { type: "image/gif" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${job.unitId}_${job.clipKey}.gif`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus(state, "animation.gif.done", "GIF 已下載");
    } catch (error) {
      if (error.name === "AbortError") setStatus(state, "animation.gif.cancelled", "已取消匯出");
      else if (error.message === "animation-too-long") setStatus(state, "animation.gif.tooLong", "動畫超過 60 秒，請選擇個別動作後下載。");
      else {
        console.warn("Animation GIF export failed", error);
        setStatus(state, "animation.gif.error", "GIF 匯出失敗，請重新載入後再試。");
      }
    } finally {
      encoder?.close();
      activeExport = null;
      state.cancel.hidden = true;
      state.actions.removeAttribute("aria-busy");
      for (const value of states.values()) value.download.disabled = false;
      updateAuth();
    }
  }

  function patchSection(section) {
    if (states.has(section) || !section.querySelector(".ranger-animation-canvas")) return;
    const actions = document.createElement("div");
    actions.className = "ranger-animation-gif-actions";
    actions.hidden = true;
    actions.innerHTML = `
      <button type="button" class="ranger-animation-gif-download" data-i18n="animation.gif.download">下載 GIF</button>
      <button type="button" class="ranger-animation-gif-cancel" data-i18n="animation.gif.cancel" hidden>取消</button>
      <span class="ranger-animation-gif-hint" data-i18n="animation.gif.hint">匯出所選動畫；透明背景，僅含角色與子彈。</span>
      <span class="ranger-animation-gif-status" role="status"><span></span><span></span></span>`;
    section.querySelector(".ranger-animation-player").appendChild(actions);
    const state = {
      actions,
      download: actions.querySelector(".ranger-animation-gif-download"),
      cancel: actions.querySelector(".ranger-animation-gif-cancel"),
      status: actions.querySelector("[role=status]").firstElementChild,
      progress: actions.querySelector("[role=status]").lastElementChild,
    };
    states.set(section, state);
    state.download.disabled = Boolean(activeExport);
    state.download.addEventListener("click", () => download(section, state));
    state.cancel.addEventListener("click", () => activeExport?.controller.abort());
    window.RangerbookI18n?.translate?.(actions);
    updateAuth();
  }
  function patchAll() {
    updateAuth();
    document.querySelectorAll(".ranger-animation-section").forEach(patchSection);
  }
  window.addEventListener("rangerbook:auth-changed", updateAuth);
  document.addEventListener("ranger-animation-ready", event => patchSection(event.target));
  new MutationObserver(patchAll).observe(document.body, { childList: true, subtree: true });
  patchAll();
  ensureAuth().catch(error => console.warn("Animation export auth unavailable", error));
})();
