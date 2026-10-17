(() => {
  "use strict";
  const auth = window.RangerbookAuth;
  const get = id => document.getElementById(id);
  if (!auth || !get("adminPersonalPanel")) return;

  let selected = null;
  let busy = false;
  let version = 0;
  const section = get("adminPersonalPanel");
  const status = get("adminPersonalStatus");
  const searchForm = get("adminPersonalSearchForm");
  const medalForm = get("adminPersonalMedalForm");
  const selectedPanel = get("adminPersonalSelected");
  const candidatesPanel = get("adminPersonalCandidates");
  const challengePanel = get("adminPersonalChallenge");
  const boundPanel = get("adminPersonalBound");
  const unboundPanel = get("adminPersonalUnbound");

  function setStatus(message = "", error = false) {
    status.textContent = message;
    status.className = "admin-message" + (error ? " error" : "");
  }
  function adminAllowed() {
    return auth.isAdmin() && !section.hidden;
  }
  function requestBusy(value) {
    busy = value;
    for (const item of section.querySelectorAll("button, input")) {
      item.disabled = value;
    }
  }
  function clearPrivateView() {
    selected = null;
    selectedPanel.hidden = true;
    challengePanel.hidden = true;
    boundPanel.hidden = true;
    unboundPanel.hidden = false;
    candidatesPanel.replaceChildren();
    get("adminPersonalTeams").replaceChildren();
    get("adminPersonalMedal").value = "";
    setStatus();
  }

  function showChallenge(challenge) {
    unboundPanel.hidden = false;
    searchForm.hidden = true;
    selectedPanel.hidden = true;
    candidatesPanel.hidden = true;
    challengePanel.hidden = false;
    const a = Number(challenge.firstPosition);
    const b = Number(challenge.secondPosition);
    get("adminPersonalChallengeInstruction").textContent =
      "請至遊戲「第 " + challenge.team + " 隊」的「" + challenge.side +
      " 隊」，將第 " + a + " 格與第 " + b + " 格的 Ranger 交換位置。";
    get("adminPersonalChallengeExpiry").textContent =
      "驗證期限：" + new Date(challenge.expiresAt).toLocaleString("zh-TW", { hour12: false });
    get("adminPersonalVerify").dataset.challengeId = challenge.challengeId;
  }

  function addTeamUnit(container, record) {
    const item = document.createElement("div");
    item.className = "personal-ranger";
    const name = document.createElement("strong");
    name.textContent = record.unitCode || "未知 Ranger";
    const detail = document.createElement("span");
    detail.textContent = "位置 " + (Number(record.slot) + 1) +
      (record.level ? " · Lv." + record.level : "");
    item.append(name, detail);
    container.append(item);
  }

  function drawTeams(teams) {
    const grid = get("adminPersonalTeams");
    grid.replaceChildren();
    for (let i = 1; i <= 5; i++) {
      const card = document.createElement("section");
      card.className = "personal-team-card";
      const title = document.createElement("h4");
      title.textContent = "隊伍 " + i;
      card.append(title);
      const team = teams?.["team" + i] || {};
      for (const side of ["A", "B"]) {
        const subtitle = document.createElement("h5");
        subtitle.textContent = side + " 隊";
        card.append(subtitle);
        const units = document.createElement("div");
        units.className = "personal-team-units";
        const data = Array.isArray(team[side]) ? team[side] : [];
        if (!data.length) {
          const empty = document.createElement("span");
          empty.className = "admin-muted";
          empty.textContent = "尚未配置";
          units.append(empty);
        } else {
          data.forEach(record => addTeamUnit(units, record));
        }
        card.append(units);
      }
      grid.append(card);
    }
  }

  async function refresh() {
    const id = ++version;
    clearPrivateView();
    searchForm.hidden = false;
    candidatesPanel.hidden = false;
    if (!adminAllowed()) return;
    setStatus("讀取個人隊伍狀態中…");
    try {
      const info = await auth.api("/admin/game-binding/status");
      if (id !== version || !adminAllowed()) return;
      if (info.bound) {
        unboundPanel.hidden = true;
        boundPanel.hidden = false;
        const player = info.player || {};
        get("adminPersonalBoundLabel").textContent = (player.player_name || "未知玩家") +
          " · " + (player.guild_name || "無公會");
        const privateInfo = await auth.api("/admin/personal-teams");
        if (id !== version || !adminAllowed()) return;
        drawTeams(privateInfo.teams);
        get("adminPersonalLastImported").textContent =
          player.last_imported_at ? "最後匯入：" + new Date(player.last_imported_at).toLocaleString("zh-TW", { hour12: false }) :
            "尚未匯入隊伍。完成驗證後，請先恢復原本配置再匯入。";
      } else if (info.challenge) {
        showChallenge(info.challenge);
      }
      setStatus("");
    } catch (error) {
      if (id === version && adminAllowed()) setStatus(error.message || "載入失敗", true);
    }
  }

  searchForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!adminAllowed() || busy) return;
    const query = get("adminPersonalSearch").value.trim();
    if (query.length < 2) return;
    const id = version;
    requestBusy(true);
    setStatus("搜尋玩家中…");
    candidatesPanel.replaceChildren();
    selectedPanel.hidden = true;
    selected = null;
    try {
      const data = await auth.api("/admin/game-players/search?q=" + encodeURIComponent(query));
      if (id !== version || !adminAllowed()) return;
      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "personal-candidate";
        const name = document.createElement("strong");
        name.textContent = item.name || "未公開名稱";
        const guild = document.createElement("span");
        guild.textContent = "公會：" + (item.guildName || "無");
        button.append(name, guild);
        button.addEventListener("click", () => {
          selected = item;
          selectedPanel.hidden = false;
          get("adminPersonalSelectedName").textContent =
            "已選擇：" + (item.name || "未公開名稱") + " · " + (item.guildName || "無公會");
          setStatus("");
        });
        candidatesPanel.append(button);
      }
      setStatus(items.length ? "請從候選名單選擇你的遊戲帳號。" : "找不到符合名稱的玩家。");
    } catch (error) {
      if (id === version && adminAllowed()) setStatus(error.message || "搜尋失敗", true);
    } finally {
      requestBusy(false);
    }
  });

  get("adminPersonalMedal").addEventListener("input", event => {
    event.target.value = event.target.value.replace(/[^0-9]/g, "");
  });
  medalForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!selected || !adminAllowed() || busy) return;
    const medal = get("adminPersonalMedal").value;
    if (!/^[0-9]{1,12}$/.test(medal)) {
      setStatus("請使用半形數字輸入公會獎牌數量。", true);
      return;
    }
    const id = version;
    requestBusy(true);
    setStatus("正在核對公會獎牌並建立驗證任務…");
    try {
      const challenge = await auth.api("/admin/game-binding/start", {
        method: "POST", body: JSON.stringify({ candidateId: selected.candidateId, medal })
      });
      if (id !== version || !adminAllowed()) return;
      showChallenge(challenge);
      setStatus("公會獎牌確認成功，請完成指定的隊伍交換。");
    } catch (error) {
      if (id === version && adminAllowed()) setStatus(error.message || "驗證失敗", true);
    } finally {
      requestBusy(false);
    }
  });

  get("adminPersonalVerify").addEventListener("click", async () => {
    const challengeId = get("adminPersonalVerify").dataset.challengeId;
    if (!challengeId || !adminAllowed() || busy) return;
    const id = version;
    requestBusy(true);
    setStatus("正在向官方 API 查詢最新隊伍配置…");
    try {
      const response = await auth.api("/admin/game-binding/verify", {
        method: "POST", body: JSON.stringify({ challengeId })
      });
      if (id !== version || !adminAllowed()) return;
      if (response.verified) {
        await refresh();
        setStatus("驗證成功！請先恢復 Ranger 原本位置，再匯入隊伍。");
      } else {
        setStatus(response.message || "尚未偵測到指定交換。", true);
      }
    } catch (error) {
      if (id === version && adminAllowed()) setStatus(error.message || "驗證失敗", true);
    } finally {
      requestBusy(false);
    }
  });

  get("adminPersonalImport").addEventListener("click", async () => {
    if (!adminAllowed() || busy) return;
    if (!window.confirm("確認已恢復驗證時交換的 Ranger 位置？現在要匯入自己的隊伍嗎？")) return;
    const id = version;
    requestBusy(true);
    setStatus("正在匯入最新隊伍…");
    try {
      await auth.api("/admin/personal-teams/import", { method: "POST" });
      if (id !== version || !adminAllowed()) return;
      await refresh();
      setStatus("個人隊伍已更新。");
    } catch (error) {
      if (id === version && adminAllowed()) setStatus(error.message || "匯入失敗", true);
    } finally {
      requestBusy(false);
    }
  });

  window.addEventListener("rangerbook:auth-changed", event => {
    if (!event.detail?.logged_in || !auth.isAdmin()) {
      ++version;
      clearPrivateView();
      return;
    }
    if (adminAllowed()) refresh();
  });
  window.RangerbookPersonalTeams = { refresh };
  auth.ready().then(() => { if (adminAllowed()) refresh(); });
})();
