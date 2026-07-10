(() => {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  const pathMatch = path.match(/^(?:\/rangerbook)?\/gear\/([^/]+)\/?$/);
  const pathId = pathMatch && pathMatch[1] !== "index.html" ? decodeURIComponent(pathMatch[1]) : "";
  const detailId = (params.get("detail") || pathId || "").trim();
  const isDetailPage = Boolean(detailId);
  const root = path.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const modal = document.getElementById("gearModal");
  const modalContent = document.getElementById("gearModalContent");
  const list = document.getElementById("gearList");
  const search = document.getElementById("gearSearchInput");

  const detailUrl = (id) => `${root}gear/${encodeURIComponent(id)}`;
  const detailEntryUrl = (id) => `${root}gear/?detail=${encodeURIComponent(id)}`;

  if (isDetailPage) setupDetailPage();
  else setupSummaryModal();

  function setupSummaryModal() {
    if (!modalContent) return;

    function addDetailLink(id) {
      if (!id || !modalContent.children.length) return;
      const summaryArea = modalContent.querySelector(".gear-detail-head > div:not(.gear-detail-image-wrap)");
      if (!summaryArea) return;

      let link = summaryArea.querySelector(".gear-detail-link");
      if (!link) {
        link = document.createElement("a");
        link.className = "gear-detail-link";
        link.textContent = "查看詳細資訊";
        summaryArea.appendChild(link);
      }
      link.href = detailEntryUrl(id);
    }

    document.addEventListener("rangerbook:gear-rendered", (event) => {
      addDetailLink(event.detail?.id || "");
    });
  }

  function setupDetailPage() {
    document.body.classList.add("gear-detail-page");
    window.history.replaceState(null, "", detailUrl(detailId));

    const title = document.querySelector(".page-title h1");
    const intro = document.querySelector(".page-title p:last-child");
    if (title) title.textContent = "裝備詳細資料";
    if (intro) intro.textContent = "查詢裝備的完整數據。";
    document.title = "裝備詳細資料｜LINE Rangers Database";

    const main = document.querySelector("main.ranger-page");
    if (!main || !modal || !modalContent || !list || !search) return;

    const backLink = document.createElement("a");
    backLink.className = "endless-back-link gear-detail-back-link";
    backLink.href = `${root}gear/`;
    backLink.textContent = "返回裝備列表";

    const status = document.createElement("div");
    status.className = "gear-detail-loading";
    status.textContent = "裝備資料載入中…";

    const detailContent = document.createElement("section");
    detailContent.className = "gear-detail-content";
    detailContent.hidden = true;
    detailContent.appendChild(modalContent);
    main.append(status, detailContent);

    function removePagination() {
      document.querySelectorAll("#gearPaginationBar, #bottomPaginationBar").forEach((bar) => bar.remove());
    }

    new MutationObserver(removePagination).observe(document.body, { childList: true, subtree: true });
    removePagination();

    let phase = 0;
    let openRequested = false;

    function processList() {
      const failure = list.querySelector(".empty-state")?.textContent || "";
      if (failure.includes("資料載入失敗")) {
        status.textContent = "裝備資料載入失敗，請稍後再試。";
        return;
      }

      if (phase === 0 && list.querySelector(".gear-card")) {
        phase = 1;
        search.value = detailId;
        search.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }

      if (phase === 1 && !openRequested) {
        const card = [...list.querySelectorAll(".gear-card[data-gear-id]")]
          .find((item) => item.dataset.gearId === detailId);
        if (card) {
          openRequested = true;
          phase = 2;
          card.click();
          return;
        }
        if (list.querySelector(".empty-state")) {
          phase = 3;
          status.textContent = `找不到裝備 ID：${detailId}`;
        }
      }
    }

    function revealDetail(id) {
      if (id !== detailId || !modalContent.children.length) return;
      const detailHead = modalContent.querySelector(".gear-detail-head");
      if (detailHead && backLink.parentElement !== detailHead) detailHead.appendChild(backLink);
      modalContent.querySelector(".gear-detail-link")?.remove();
      status.hidden = true;
      detailContent.hidden = false;
      modal.hidden = true;
      document.body.classList.remove("modal-open");
      removePagination();
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    new MutationObserver(processList).observe(list, { childList: true });
    document.addEventListener("rangerbook:gear-rendered", (event) => {
      revealDetail(event.detail?.id || "");
    });

    processList();
    if (modalContent.dataset.renderedGearId) revealDetail(modalContent.dataset.renderedGearId);
  }
})();
