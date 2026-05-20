(() => {
  const mount = document.getElementById("homeUpdateLatest");
  if (!mount) return;

  const UPDATE_LOG_URL = "./res/%E6%9B%B4%E6%96%B0%E6%97%A5%E8%AA%8C.json";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[char]));
  }

  function getDate(entry) {
    return entry?.日期 || entry?.date || "";
  }

  function getItems(entry) {
    const items = entry?.內容 || entry?.items || entry?.changes || [];
    return Array.isArray(items) ? items : [];
  }

  function sortByDateDesc(logs) {
    return [...logs].sort((a, b) => String(getDate(b)).localeCompare(String(getDate(a))));
  }

  function renderLatest(entry) {
    if (!entry) {
      mount.innerHTML = `<p class="home-update-error">目前沒有更新日誌。</p>`;
      return;
    }

    const date = getDate(entry);
    const items = getItems(entry);
    const listHtml = items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");

    mount.innerHTML = `
      <p class="home-update-date">${escapeHtml(date)}</p>
      <ul class="home-update-list">${listHtml}</ul>
    `;
  }

  async function init() {
    try {
      const response = await fetch(`${UPDATE_LOG_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const logs = await response.json();
      renderLatest(sortByDateDesc(Array.isArray(logs) ? logs : [])[0]);
    } catch (error) {
      console.error(error);
      mount.innerHTML = `<p class="home-update-error">更新日誌載入失敗。</p>`;
    }
  }

  init();
})();
