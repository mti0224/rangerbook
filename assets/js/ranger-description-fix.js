(() => {
  const DATA_URL = "../res/Rangers_data.json";
  let rangerMapPromise = null;

  const ROOT_DESC_KEYS = [
    "角色敘述", "Ranger敘述", "Ranger描述", "角色描述", "角色說明", "Ranger說明",
    "角色介紹", "Ranger介紹", "介紹", "敘述", "描述", "說明",
    "rangerDescription", "characterDescription", "description", "desc"
  ];
  const SKILL_DESC_KEYS = [
    "技能敘述", "技能描述", "技能說明", "技能介紹", "敘述", "描述", "說明", "介紹",
    "skillDescription", "description", "desc"
  ];
  const TALENT_DESC_KEYS = [
    "主要才能敘述", "主要才能描述", "主要才能說明", "主要才能介紹",
    "才能敘述", "才能描述", "才能說明", "才能介紹", "敘述", "描述", "說明", "介紹",
    "mainTalentDescription", "talentDescription", "description", "desc"
  ];
  const DESC_KEYWORDS = ["敘述", "描述", "說明", "介紹", "description", "desc"];

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return "";
    return String(value).replaceAll("\\n", "\n").trim();
  }

  function isNone(value) {
    const text = cleanText(value);
    return !text || text === "無" || text === "(無)" || text.toLowerCase() === "undefined";
  }

  function escapeHtml(value) {
    return cleanText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getByKeys(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    const entries = Object.entries(obj);

    for (const key of keys) {
      const found = entries.find(([k]) => cleanText(k) === key);
      if (found && !isNone(found[1])) return found[1];
    }

    for (const key of keys) {
      const found = entries.find(([k]) => cleanText(k).includes(key));
      if (found && !isNone(found[1])) return found[1];
    }

    return "";
  }

  function getFlexibleDescription(obj, preferredKeys, avoidKeywords = []) {
    const exact = getByKeys(obj, preferredKeys);
    if (!isNone(exact)) return exact;
    if (!obj || typeof obj !== "object") return "";

    const avoided = avoidKeywords.map((keyword) => keyword.toLowerCase());
    const found = Object.entries(obj).find(([key, value]) => {
      const keyText = cleanText(key).toLowerCase();
      if (avoided.some((keyword) => keyText.includes(keyword))) return false;
      if (isNone(value)) return false;
      return DESC_KEYWORDS.some((keyword) => keyText.includes(keyword.toLowerCase()));
    });

    return found ? found[1] : "";
  }

  function loadRangers() {
    if (!rangerMapPromise) {
      rangerMapPromise = fetch(DATA_URL)
        .then((res) => res.ok ? res.json() : [])
        .then((rows) => {
          const map = new Map();
          if (Array.isArray(rows)) {
            rows.forEach((ranger) => {
              const id = cleanText(ranger.ranger_id || ranger.unitCode || ranger.id || "");
              if (id) map.set(id, ranger);
            });
          }
          return map;
        })
        .catch(() => new Map());
    }
    return rangerMapPromise;
  }

  function getCurrentRangerId() {
    const img = document.querySelector("#rangerModalContent .ranger-detail-image");
    const src = img?.getAttribute("src") || "";
    const match = src.match(/\/res\/([^/]+)\//);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function renderDescription(text, className) {
    return `<p class="${className} preline">${escapeHtml(text)}</p>`;
  }

  function getSkillList(ranger) {
    return [ranger["技能1"], ranger["技能2"], ranger["技能3"]]
      .filter((skill) => skill && typeof skill === "object" && !Array.isArray(skill));
  }

  function getMainTalentObject(ranger) {
    const talent = ranger?.["才能"];
    if (!talent || typeof talent !== "object" || Array.isArray(talent)) return null;

    const entry = Object.entries(talent).find(([key]) => cleanText(key).includes("主要才能"));
    return entry && entry[1] && typeof entry[1] === "object" ? entry[1] : null;
  }

  async function applyDescriptions() {
    const modal = document.getElementById("rangerModal");
    const content = document.getElementById("rangerModalContent");
    if (!modal || modal.hidden || !content) return;

    const id = getCurrentRangerId();
    if (!id) return;

    const map = await loadRangers();
    const ranger = map.get(id);
    if (!ranger) return;

    const rootDesc = getFlexibleDescription(ranger, ROOT_DESC_KEYS, ["技能", "才能"]);
    const head = content.querySelector(".ranger-detail-head > div:last-child");
    if (head && !head.querySelector(".ranger-description") && !isNone(rootDesc)) {
      const date = head.querySelector(".ranger-date");
      const html = renderDescription(rootDesc, "ranger-description");
      if (date) date.insertAdjacentHTML("afterend", html);
      else head.insertAdjacentHTML("beforeend", html);
    }

    const skills = getSkillList(ranger);
    content.querySelectorAll(".ranger-skill-card").forEach((card, index) => {
      if (card.querySelector(".ranger-skill-description")) return;
      const desc = getFlexibleDescription(skills[index], SKILL_DESC_KEYS);
      if (isNone(desc)) return;
      const titleBlock = card.querySelector(".ranger-icon-title > div");
      if (titleBlock) titleBlock.insertAdjacentHTML("beforeend", renderDescription(desc, "ranger-skill-description"));
    });

    const mainTalent = getMainTalentObject(ranger);
    const talentDesc = getFlexibleDescription(mainTalent, TALENT_DESC_KEYS)
      || getFlexibleDescription(ranger, ["主要才能敘述", "主要才能描述", "主要才能說明", "主要才能介紹", "mainTalentDescription", "talentDescription"], ["技能", "角色"]);

    if (!isNone(talentDesc)) {
      const mainTalentCard = [...content.querySelectorAll(".ranger-talent-card")]
        .find((card) => card.querySelector(".talent-title-with-icon span")?.textContent.trim().includes("主要才能"));
      if (mainTalentCard && !mainTalentCard.querySelector(".ranger-talent-description")) {
        const title = mainTalentCard.querySelector(".talent-title-with-icon");
        if (title) title.insertAdjacentHTML("afterend", renderDescription(talentDesc, "ranger-talent-description"));
      }
    }
  }

  let timer = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(applyDescriptions, 20);
  });

  const modalContent = document.getElementById("rangerModalContent");
  if (modalContent) observer.observe(modalContent, { childList: true, subtree: true });
})();
