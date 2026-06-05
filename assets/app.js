const API_BASE = "https://rangers.lerico.net/api";

const leagueTranslate = {
  LEGEND: "傳奇",
  MASTER_1: "大師1",
  MASTER_2: "大師2",
  MASTER_3: "大師3",
  DIAMOND_1: "鑽石1",
  DIAMOND_2: "鑽石2",
  DIAMOND_3: "鑽石3",
  GOLD_1: "黃金1",
  GOLD_2: "黃金2",
  GOLD_3: "黃金3",
};

const roleMention = "<@&1245930262991339591>";

const els = {
  leagueSelect: document.querySelector("#leagueSelect"),
  dateInput: document.querySelector("#dateInput"),
  limitSelect: document.querySelector("#limitSelect"),
  runBtn: document.querySelector("#runBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  progressFill: document.querySelector("#progressFill"),
  statusText: document.querySelector("#statusText"),
  top10Output: document.querySelector("#top10Output"),
  top50Output: document.querySelector("#top50Output"),
  top100Output: document.querySelector("#top100Output"),
  allOutput: document.querySelector("#allOutput"),
  discordOutput: document.querySelector("#discordOutput"),
};

let latestResult = null;

function todayTitle() {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}`;
}

els.dateInput.value = todayTitle();

function setStatus(text, percent = null) {
  els.statusText.textContent = text;
  if (percent !== null) {
    els.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return response.json();
}

function increaseCount(counter, unitName) {
  counter[unitName] = (counter[unitName] || 0) + 1;
}

function toSortedRows(counter) {
  return Object.entries(counter)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));
}

function layout(counter, n = 999) {
  const rows = toSortedRows(counter).slice(0, n);
  if (rows.length === 0) return "尚無資料";
  return rows.map((row, index) => `${index + 1}. ${row.name}: ${row.count}`).join("\n");
}

function cloneCounter(counter) {
  return JSON.parse(JSON.stringify(counter));
}

function buildDiscordText({ date, league, snapshots }) {
  const leagueName = leagueTranslate[league] || league;

  return `${roleMention} 
# ${date}本週${leagueName}段位角色使用率
**前10名玩家：(角色使用率取前20名)**
\`\`\`
${layout(snapshots.top10, 20)}
\`\`\`
**前50名玩家：(角色使用率取前30名)**
\`\`\`
${layout(snapshots.top50, 30)}
\`\`\`
**前100名玩家：(角色使用率取前30名)：**
\`\`\`
${layout(snapshots.top100, 30)}
\`\`\`
**目前統計範圍玩家：(角色使用率取前30名)**
\`\`\`
${layout(snapshots.all, 30)}
\`\`\`
`;
}

async function loadRangersDict() {
  setStatus("讀取中文翻譯資料...", 2);
  const zhData = await fetchJson(`${API_BASE}/v2/translate?keys=zh:UNIT`);

  setStatus("讀取角色基本資料...", 5);
  const rangersData = await fetchJson(`${API_BASE}/getRangersBasics`);

  const unitNames = zhData["zh:UNIT"] || {};
  const dict = {};

  for (const ranger of rangersData) {
    const key = ranger.unitCode;
    const nameCode = ranger.unitNameCode;
    dict[key] = unitNames[nameCode] || "undefined";
  }

  return dict;
}

function extractTeams(playerData) {
  const teamGroup = playerData?.playerUnitTeamGroupMap;
  const pvpteam = teamGroup?.pvpteam;

  if (!pvpteam) return [];

  const teams = [];
  if (Array.isArray(pvpteam["1"])) teams.push(pvpteam["1"]);
  if (Array.isArray(pvpteam["2"])) teams.push(pvpteam["2"]);

  return teams;
}

async function runRankUsage() {
  const league = els.leagueSelect.value;
  const limit = Number(els.limitSelect.value);
  const date = els.dateInput.value.trim() || todayTitle();

  els.runBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.downloadBtn.disabled = true;
  latestResult = null;

  els.top10Output.textContent = "統計中...";
  els.top50Output.textContent = "統計中...";
  els.top100Output.textContent = "統計中...";
  els.allOutput.textContent = "統計中...";
  els.discordOutput.value = "";

  try {
    const rangersDict = await loadRangersDict();

    setStatus(`讀取 ${leagueTranslate[league] || league} 排行榜...`, 8);
    const rankData = await fetchJson(`${API_BASE}/v2/pvp/league/rank/${league}`);
    const top100 = Array.isArray(rankData.top100) ? rankData.top100 : [];
    const mids = top100.slice(0, limit).map(player => player.mid).filter(Boolean);

    if (mids.length === 0) {
      throw new Error("排行榜資料中沒有可用的 mid。");
    }

    const result = {};
    const snapshots = {
      top10: {},
      top50: {},
      top100: {},
      all: {},
    };

    for (let i = 0; i < mids.length; i += 1) {
      const mid = mids[i];
      const rank = i + 1;
      const percent = 8 + Math.round((rank / mids.length) * 87);

      setStatus(`讀取第 ${rank}/${mids.length} 名玩家資料...`, percent);

      try {
        const playerData = await fetchJson(`${API_BASE}/getPlayer/${mid}`);
        const teams = extractTeams(playerData);

        for (const team of teams) {
          for (const unit of team) {
            const unitCode = unit.unitCode;
            const unitName = rangersDict[unitCode] || unitCode || "undefined";
            increaseCount(result, unitName);
          }
        }
      } catch (error) {
        console.warn(`讀取玩家 ${mid} 失敗：`, error);
      }

      if (rank === 10) {
        snapshots.top10 = cloneCounter(result);
        els.top10Output.textContent = layout(snapshots.top10, 20);
      }

      if (rank === 50) {
        snapshots.top50 = cloneCounter(result);
        els.top50Output.textContent = layout(snapshots.top50, 30);
      }

      if (rank === 100) {
        snapshots.top100 = cloneCounter(result);
        els.top100Output.textContent = layout(snapshots.top100, 30);
      }

      await sleep(80);
    }

    if (Object.keys(snapshots.top10).length === 0) snapshots.top10 = cloneCounter(result);
    if (Object.keys(snapshots.top50).length === 0) snapshots.top50 = cloneCounter(result);
    if (Object.keys(snapshots.top100).length === 0) snapshots.top100 = cloneCounter(result);
    snapshots.all = cloneCounter(result);

    els.top10Output.textContent = layout(snapshots.top10, 20);
    els.top50Output.textContent = layout(snapshots.top50, 30);
    els.top100Output.textContent = layout(snapshots.top100, 30);
    els.allOutput.textContent = layout(snapshots.all, 30);

    latestResult = {
      generatedAt: new Date().toISOString(),
      league,
      leagueName: leagueTranslate[league] || league,
      playerLimit: limit,
      snapshots,
      sorted: {
        top10: toSortedRows(snapshots.top10),
        top50: toSortedRows(snapshots.top50),
        top100: toSortedRows(snapshots.top100),
        all: toSortedRows(snapshots.all),
      },
    };

    els.discordOutput.value = buildDiscordText({ date, league, snapshots });

    els.copyBtn.disabled = false;
    els.downloadBtn.disabled = false;
    setStatus("統計完成", 100);
  } catch (error) {
    console.error(error);
    setStatus(`發生錯誤：${error.message}`, 100);
    els.top10Output.textContent = "統計失敗";
    els.top50Output.textContent = "統計失敗";
    els.top100Output.textContent = "統計失敗";
    els.allOutput.textContent = "統計失敗";
  } finally {
    els.runBtn.disabled = false;
  }
}

async function copyDiscordText() {
  const text = els.discordOutput.value;
  if (!text) return;

  await navigator.clipboard.writeText(text);
  const oldText = els.copyBtn.textContent;
  els.copyBtn.textContent = "已複製";
  setTimeout(() => {
    els.copyBtn.textContent = oldText;
  }, 1200);
}

function downloadJson() {
  if (!latestResult) return;

  const league = latestResult.league.toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${league}_rank_units_${stamp}.json`;

  const blob = new Blob([JSON.stringify(latestResult, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

els.runBtn.addEventListener("click", runRankUsage);
els.copyBtn.addEventListener("click", copyDiscordText);
els.downloadBtn.addEventListener("click", downloadJson);
