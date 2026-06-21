(() => {
  const params = new URLSearchParams(window.location.search);
  const detailId = (params.get("detail") || "").trim();
  const isDetailPage = Boolean(detailId);
  const root = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const modal = document.getElementById("rangerModal");
  const modalContent = document.getElementById("rangerModalContent");
  const list = document.getElementById("rangerList");
  const search = document.getElementById("rangerSearchInput");

  function inferUnitId() {
    const src = modalContent?.querySelector(".ranger-detail-image")?.getAttribute("src") || "";
    const match = src.match(/res(?:_from_emulator)?\/([^/]+)\//) || src.match(/\/([^/]+)\/[^/]+-thum/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function detailUrl(id) {
    return `${root}ranger/ranger/${encodeURIComponent(id)}`;
  }

  if (isDetailPage) {
    setupDetailPage();
  } else {
    setupSummaryModal();
  }

  function setupSummaryModal() {
    if (!modalContent) return;
    let selectedId = "";
    const allowedStats = new Set(["魔法攻擊力", "物理攻擊力", "體力", "生產礦物費用", "攻擊範圍"]);

    document.addEventListener("click", (event) => {
      const card = event.target.closest?.(".ranger-card[data-ranger-id]");
      if (card) selectedId = card.dataset.rangerId || "";
    }, true);

    function pruneModal() {
      if (!modalContent.children.length) return;

      modalContent.querySelectorAll(".ranger-stat").forEach((item) => {
        const label = item.querySelector("span")?.textContent?.trim() || "";
        if (!allowedStats.has(label)) item.remove();
      });

      modalContent.querySelectorAll(".ranger-skill-card .skill-meta-table-wrap").forEach((item) => item.remove());
      modalContent.querySelectorAll(".ranger-skill-card .table-scroll").forEach((item) => {
        if (item.querySelector(".skill-effect-table")) item.remove();
      });
      modalContent.querySelectorAll(".ability-effect-list").forEach((item) => item.remove());
      modalContent.querySelectorAll(".talent-main-table-wrap, .talent-main-effect-wrap").forEach((item) => item.remove());
      modalContent.querySelectorAll(".ranger-animation-section:not([data-ranger-summary-blocker])").forEach((item) => item.remove());

      const unitId = selectedId || inferUnitId();
      if (!unitId) return;

      const summaryArea = modalContent.querySelector(".ranger-detail-head > div:not(.ranger-detail-image-wrap)");
      const lastLine = summaryArea?.querySelector(".ranger-description")
        || summaryArea?.querySelector(".ranger-date")
        || summaryArea;
      modalContent.querySelector(".ranger-detail-link-wrap")?.remove();

      let link = modalContent.querySelector(".ranger-detail-link");
      if (!link) {
        link = document.createElement("a");
        link.className = "ranger-detail-link";
        link.textContent = "查看詳細資料";
      }
      if (lastLine && link.parentElement !== lastLine) lastLine.appendChild(link);
      const href = detailUrl(unitId);
      if (link.getAttribute("href") !== href) link.setAttribute("href", href);

      if (!modalContent.querySelector("[data-ranger-summary-blocker]")) {
        const blocker = document.createElement("span");
        blocker.hidden = true;
        blocker.className = "ranger-animation-section";
        blocker.dataset.animationUnitId = unitId;
        blocker.dataset.rangerSummaryBlocker = "";
        modalContent.appendChild(blocker);
      }
    }

    new MutationObserver(pruneModal).observe(modalContent, { childList: true });
    pruneModal();
  }

  function setupDetailPage() {
    document.body.classList.add("ranger-detail-page");
    const prettyUrl = detailUrl(detailId);
    window.history.replaceState(null, "", prettyUrl);

    const title = document.querySelector(".page-title h1");
    const intro = document.querySelector(".page-title p:last-child");
    if (title) title.textContent = "角色詳細資料";
    if (intro) intro.textContent = "查詢每隻角色的詳細數據。";
    document.title = "角色詳細資料｜LINE Rangers Database";

    const main = document.querySelector("main.ranger-page");
    if (!main || !modal || !modalContent || !list || !search) return;

    const backLink = document.createElement("a");
    backLink.className = "endless-back-link ranger-detail-back-link";
    backLink.href = `${root}ranger/ranger/`;
    backLink.textContent = "返回角色列表";

    const status = document.createElement("div");
    status.className = "ranger-detail-loading";
    status.textContent = "角色資料載入中…";

    const detailContent = document.createElement("section");
    detailContent.className = "ranger-detail-content";
    detailContent.appendChild(modalContent);
    main.append(status, detailContent);

    function removePagination() {
      document.querySelectorAll("#rangerPaginationBar, #bottomPaginationBar").forEach((bar) => bar.remove());
    }

    new MutationObserver(removePagination).observe(document.body, { childList: true, subtree: true });
    removePagination();

    let phase = 0;
    let openRequested = false;

    function processList() {
      const failure = list.querySelector(".empty-state")?.textContent || "";
      if (failure.includes("資料載入失敗")) {
        status.textContent = "角色資料載入失敗，請稍後再試。";
        return;
      }

      if (phase === 0 && list.querySelector(".ranger-card")) {
        phase = 1;
        search.value = detailId;
        search.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }

      if (phase === 1 && !openRequested) {
        const card = [...list.querySelectorAll(".ranger-card[data-ranger-id]")]
          .find((item) => item.dataset.rangerId === detailId);
        if (card) {
          openRequested = true;
          phase = 2;
          card.click();
          return;
        }
        if (list.querySelector(".empty-state")) {
          phase = 3;
          status.textContent = `找不到角色 ID：${detailId}`;
        }
      }
    }

    function revealDetail() {
      if (!modalContent.children.length) return;
      const detailHead = modalContent.querySelector(".ranger-detail-head");
      if (detailHead && backLink.parentElement !== detailHead) detailHead.appendChild(backLink);
      status.hidden = true;
      detailContent.hidden = false;
      document.body.classList.remove("modal-open");
      removePagination();
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    new MutationObserver(processList).observe(list, { childList: true });
    new MutationObserver(revealDetail).observe(modalContent, { childList: true });
    processList();
    revealDetail();
  }
})();
