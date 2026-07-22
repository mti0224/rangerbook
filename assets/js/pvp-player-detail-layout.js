(() => {
  const modalContent = document.getElementById("pvpPlayerTeamModalContent");
  if (!modalContent) return;

  function itemLabel(item) {
    return item?.querySelector("div > span")?.textContent?.trim() || "";
  }

  function enhanceDetailCard(card) {
    if (!card || card.dataset.compactDetailLayout === "1") return;
    card.dataset.compactDetailLayout = "1";

    const headCopy = card.querySelector(".pvp-player-unit-detail-head > div");
    const extraList = card.querySelector(".pvp-player-extra-list");
    if (!headCopy || !extraList) return;

    const items = [...extraList.querySelectorAll(".pvp-player-extra-item")];
    const leonardItem = items.find((item) => itemLabel(item) === "Leonard 點數");
    const talentItem = items.find((item) => itemLabel(item) === "解放才能");

    if (leonardItem) {
      const value = leonardItem.querySelector("strong")?.textContent?.trim() || "-";
      const line = document.createElement("span");
      line.className = "pvp-player-leonard-line";
      line.textContent = `雷納德點數：${value === "-" ? "-" : `${value}點`}`;
      headCopy.appendChild(line);
      leonardItem.remove();
    }

    if (talentItem) {
      const talentText = talentItem.querySelector("strong")?.textContent?.trim() || "";
      const hasTalent = talentText
        && talentText !== "未解放才能"
        && talentText !== "才能解放狀態無資料";

      if (hasTalent) {
        const talentIcon = talentItem.querySelector("img");
        const name = headCopy.querySelector(":scope > strong");
        if (name && talentIcon) {
          const nameLine = document.createElement("div");
          nameLine.className = "pvp-player-name-with-talent";

          const icon = talentIcon.cloneNode(true);
          icon.className = "pvp-player-talent-badge";
          icon.alt = "";
          icon.title = talentText;

          headCopy.insertBefore(nameLine, name);
          nameLine.append(icon, name);
        }
      }

      talentItem.remove();
    }

    if (!extraList.children.length) extraList.remove();
  }

  function enhanceAll() {
    modalContent.querySelectorAll(".pvp-player-unit-detail-card").forEach(enhanceDetailCard);
  }

  const observer = new MutationObserver(enhanceAll);
  observer.observe(modalContent, { childList: true, subtree: true });
  enhanceAll();
})();
