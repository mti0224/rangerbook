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
    const viewer = get("adminPersonalViewer");
    if (viewer) { viewer.hidden = true; viewer.removeAttribute("src"); }
    get("adminPersonalUnbindForm").hidden = true;
    get("adminPersonalUnbindPassword").value = "";
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

  function drawTeams(teams) {
    const viewer = get("adminPersonalViewer");
    if (!viewer) return;
    const populated = ["team1","team2","team3","team4","team5","pvpteam","guildwar"].some(key => {
      const value = teams?.[key];
      return Array.isArray(value) ? value.length > 0 :
        Boolean(value && (value.A?.length || value.B?.length));
    });
    viewer.hidden = !populated;
    if (populated) {
      // Own authenticated API is queried by the embedded existing search renderer.
      viewer.src = "../pvp/search/?personal=1";
    } else {
      viewer.removeAttribute("src");
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
        if (privateInfo.teams && (!Array.isArray(privateInfo.teams.pvpteam) || !Array.isArray(privateInfo.teams.guildwar))) {
          setStatus("已新增 PvP 防守與公會戰進攻隊伍，請按「匯入／更新我的隊伍」取得完整隊伍資料。");
        }
        get("adminPersonalLastImported").textContent =
          player.last_imported_at ? "最後匯入：" + new Date(player.last_imported_at).toLocaleString("zh-TW", { hour12: false }) :
            "尚未匯入隊伍。完成驗證後，請先恢復原本配置再匯入。";
      } else if (info.challenge) {
        showChallenge(info.challenge);
      }
      if (!status.textContent) setStatus("");
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

  get("adminPersonalUnbind").addEventListener("click", () => {
    if (!adminAllowed() || busy) return;
    get("adminPersonalUnbindForm").hidden = false;
    get("adminPersonalUnbindPassword").focus();
  });
  get("adminPersonalUnbindCancel").addEventListener("click", () => {
    get("adminPersonalUnbindForm").hidden = true;
    get("adminPersonalUnbindPassword").value = "";
  });
  get("adminPersonalUnbindForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!adminAllowed() || busy) return;
    const password = get("adminPersonalUnbindPassword").value;
    if (!password) return;
    const id = version;
    requestBusy(true);
    setStatus("正在解除綁定並刪除私人隊伍…");
    try {
      await auth.api("/admin/game-binding/unbind", {
        method: "POST", body: JSON.stringify({ password })
      });
      if (id !== version || !adminAllowed()) return;
      await refresh();
      setStatus("已解除綁定，可重新搜尋並綁定其他遊戲帳號。");
    } catch (error) {
      if (id === version && adminAllowed()) setStatus(error.message || "解除綁定失敗", true);
    } finally {
      get("adminPersonalUnbindPassword").value = "";
      requestBusy(false);
    }
  });

  window.addEventListener("message", event => {
    const viewer = get("adminPersonalViewer");
    if (!viewer || event.source !== viewer.contentWindow || event.origin !== window.location.origin) return;
    if (event.data?.type !== "rangerbook-personal-viewer-height") return;
    const height = Number(event.data.height);
    if (Number.isFinite(height) && height >= 300 && height <= 9000) {
      viewer.style.height = Math.ceil(height) + "px";
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
  window.addEventListener("rangerbook:personal-teams-open", () => { if (adminAllowed()) refresh(); });
  window.RangerbookPersonalTeams = { refresh };
  auth.ready().then(() => { if (adminAllowed()) refresh(); });
})();
