# Rangerbook V2 — 2026-10-13 使用者回歸修正驗收

PR：[#134](https://github.com/mti0224/rangerbook/pull/134)，分支 `fix/v2-ui-regressions-20261013`。

本次接續已上線的 V2 修正。V1 後端不變，V2 的 23 個後端修正版檔案仍與既有完整套件一致（逐檔 SHA-256：0 個不符）；本次 AWS 僅更新 V2 自有翻譯輸入，再用現有編譯器驗證及發布。GitHub Pages 部署結果與正式驗證記於 PR 說明。

## 官方用詞查核

來源為官方 API 語言資料包 `lang_unit`、`lang_equip`、`lang_prop`、`lang_etc`、`lang_guild`。額外三份語言包僅在獨立臨時目錄查核指定用詞，未加入另一套生產更新流程；查核後已移除該臨時目錄。`lang_msg` 在官方 manifest 已標示 deleted，未將舊資料視為現行官方翻譯。來源 Key、包雜湊及四語原文見 `official-term-sources-20261013.json`、`terminology-20261013.json`。

| 中文 | 英文 | 日文 | 泰文 |
|---|---|---|---|
| 濺射範圍 | Splash Radius | スプラッシュの範囲 | ระยะสแปลช |
| 魔法攻擊力 | Magical ATK | 魔法攻撃力 | พลังเวทโจมตี |
| 魔法防禦力 | Magical DEF | 魔法防御力 | พลังเวทป้องกัน |
| 閃避機率 | Evade Rate | 回避率 | อัตราการหลบหลีก |
| 技能閃避機率 | Skill Evade Rate | スキル回避率 | อัตราการหลบสกิล |
| 技能發動率 | Skill Use Rate | スキル発動率 | อัตราการใช้สกิล |
| 命中率 | Hit Rate | 命中率 | อัตราความแม่นยำ |
| 技能命中率 | Skill Hit Rate | スキル命中率 | อัตราความแม่นยำของทักษะ |
| 爆擊傷害 | Critical Damage | 決定打のダメージ | แรงโจมตีคริทิคอล |
| 爆擊機率 | Critical Rate | 決定打の確率 | อัตราติดคริทิคอล |
| 係數 | Factor | 係数 | ค่าสัมประสิทธิ์ |

「係數」未找到對應技能表格標題的官方名稱 Key，採使用者指定的自訂 UI 用詞 Factor；其日泰翻譯也標為 authored UI。`SELECTED_MUL_VALUE` 的 Multiplier 屬另一個官方 UI 情境，不冒充成技能係數來源。

段位採官方 PVP 名稱：傳奇 `ตำนาน / レジェンド`、大師 `มาสเตอร์ / マスター`、鑽石 `เพชร / ダイア`、黃金 `ทอง / ゴールド`；分級取 `PVP_MASTER_1_nm` 等完整名稱，不改段位 API 代碼。

## 修正項目與原因

| 項目 | 原因與修正 |
|---|---|
| 敵人技能發動率、冷卻、觸發基準表格 | 舊補丁依顯示文字反向解析，且冒號與分隔符不一致；改由 hsEnemy.js 直接從技能欄位生成表格，移除反向解析。 |
| 搜尋後第一次點擊敵人失效 | input 失去焦點的 change 事件重建卡片；搜尋僅用 input，保留選單的 change 事件。 |
| PvP 裝備組合排名 | 插入區塊依中文標題比對；改為 data-pvp-section="equipment"，保留列、分頁與配裝資料。 |
| 極限模式機關 | 尋找生產線標題僅接受中英；改為 data-stage-section="production"，保留機關與生產線位置。 |
| 查看詳細資訊 | 按鈕加入明確 UI Key。 |
| 裝備六種效果、兩種抵抗能力 | 不同換行表示與重複官方名稱造成翻譯映射衝突；先正規化換行／空白，官方屬性名稱與能力名稱使用明確優先順序。 |
| 相似裝備星級 | 星級與種類合成一個字串，使模板無法命中；先翻譯星級後再組合標籤。 |
| 才能階段、未解放、使用次數、會員排名／人數、檔案數、關卡／樓層 | 新增四語數值模板，保留各語言數字順序；模板允許正常顯示空白。 |
| PvP 與公會段位選單 | 改用官方段位用詞；語言庫就緒後重繪選單文字，選單值維持 API 代碼。 |
| 暗屬性條件 | 結構化條件翻譯映射可正常套用；選單 value 保留條件識別值，顯示文字以所選語言呈現。 |
| 技能係數 | SKILL_RESET、BUBBLE、FEAR 已有觸發率及上限，但表格只讀 magnitude；改為獨立模板把兩項數值呈現在係數欄。SUMMON_ENEMY 同時顯示數量上限與等級。 |
| 將夥伴送往前方 | 正式 V1 對 u1534h-brown 也顯示係數「-」。官方原始 THROW_ALLY factor=360、buffFactor=400 及描述「將1名夥伴送往前方」已查核；沒有足夠證據把這些內部值解釋為特定係數，因此維持 V1 行為，不補造數值。 |
| 才能排列 | V2 視圖先產出主要才能，再產出強化才能，恢復原有顯示順序。 |
| 語言保存 | 保留 localStorage，加上 cookie 回復、zh_TW／ja 別名與 pageshow／storage 同步，讓 BFCache 舊頁跟隨最新偏好。 |
| CSS 載入與中文閃現 | 42 個入口在 head 預載共同 CSS；首屏依所選語言等待小型 UI/custom 語言庫完成，不再等待大型 official 包。腳本與語言包統一版本參數，避免混用舊快取。 |
| 翻譯容器 | 翻譯標記若在容器上，只更新標籤文字，不以 textContent 刪除子表格／控制項。 |
| 贊助連結 | 連結前後加入實際空白，保持多語行文分隔。 |

## 實際測試與結果

| 指令／範圍 | 結果 |
|---|---|
| node tests/v2-site-adapter.cjs | 18 種 V2 視圖 × 四語通過，2306 角色／951 裝備逐筆效果及類別檢查通過；沒有原生 V1 遊戲 JSON 網路請求。 |
| tests/v2-reported-regressions.cjs（Playwright，Work Mode） | 四語通過：敵人 metadata 數值、極限機關、生產線、PvP 配裝組合／才能／次數、所有 PvP／公會段位、成員統計、暗屬性條件、admin 12 檔案、才能順序、五種效果、六種裝備效果、兩種能力實際視窗、相似裝備星級、贊助空白、語言重載。 |
| tests/v2-locale-loading.cjs | en/th/jp 冷載入通過：刻意延遲 official 包時 UI 可就緒並切換語言；首次畫面不先顯示中文，head CSS 就緒；儲存不可讀時 cookie 與 V2 語言一致；嵌套表格／按鈕保留。另驗證 pageshow 恢復舊頁後同步新語言偏好。 |
| tests/settings-ui.cjs | 1400px／390px 四語切換、深淺色、頁間保存通過。 |
| tests/v2-browser-interactions.cjs | 四語角色名稱搜尋與等級滑桿、裝備名稱搜尋與強化操作通過。 |
| tests/v2-pvp-guild-browser.cjs | 四語 PvP／公會主要互動、會員依身分匹配與 guest 權限通過。 |
| tests/admin-workspace-ui.cjs | guest/user/admin/super_admin 四種角色通過，非管理員不發送管理 API 請求。 |
| V2_CORE_ONLY=1 tests/v2-browser-acceptance.cjs | 18 個核心頁面 × 四語，共 72 組載入／導航通過；0 pageerror、0 原生 V1 遊戲 JSON 網路請求。此項是載入測試，具體互動以其他測試驗證。 |
| python -m unittest scripts.v2.test_semantic scripts.v2_preview.test_normalize scripts.v2.test_semantic_audit scripts.v2.test_release scripts.v2.test_publisher -q | Work Mode 38 tests 通過，包含發布重試與釋出回復；測試使用臨時模擬 Git repo。 |
| python3 update_all_v2.py --skip-fetch（AWS，已備份、持 V2 鎖） | 現有編譯器 29 個語意測試、18 個獨立輸出測試通過；候選 release 驗證後 promote。 |
| python3 publish_v2.py（AWS） | 安全發布成功；最終資料 commit 80fb169ed43f2c218916ba885f6175c5639f8773。 |
| python -m scripts.v2.validate --root res/v2 | 24 個 JSON 通過 schema、參數及語意結構驗證；textBindingErrors=0；official gaps 仍明示。 |
| python -m unittest discover -s tests -p test_v2_audit.py -q | 5 個稽核器測試通過。 |
| python -m unittest discover -s tests -p test_ui_locale_coverage.py -v | 2 個 UI 覆蓋測試通過。 |

稽核器 strict 模式仍會對既有官方缺漏回傳非零：739 個 unique 被引用的官方空值、8 個其他原包空值，以及 3 個原包 dataCode 含換行的來源項目。未將這些缺漏藏成「所有翻譯完成」；全域 manifest 的 allReferencedTranslationsComplete=false 保留。

## AWS 備份、獨立性與排程

- 備份：`/home/ubuntu/rangerbook-v2/backups/v2-ui-regressions-20261013/before.tar.gz`；最終用詞備份：`/home/ubuntu/rangerbook-v2/backups/v2-official-terms-20261013/before.tar.gz`。保存現有 Python、runner、語言輸入、已發布 V2 資料、日期表與狀態。
- 兩次套用皆先核對舊／新輸入雜湊，再持原有 V2 fd9 鎖，用 runuser 以 ubuntu 執行既有編譯器與發布器。失敗路徑會回復翻譯輸入、release 與日期表。
- V1 核心程式、runner 與兩套 systemd unit／timer 共 37 個檔案雜湊前後相同；V2 的既有 23 檔修正版也 0 mismatch。
- 日期表在本次前後 SHA-256 相同。新 ID 仍採 Asia/Taipei 首次成功記錄日期；既有日期保留。
- 2026-10-13 02:12:09（台北）V1 更新 exit=0；02:14:23 V2 定時更新 exit=0。兩個 timer 都 active，翻譯輸入雜湊與 sourceFingerprint 未被舊版覆蓋。
- 最終來源 fingerprint：`8608b12457181d52b478c353f3aa3e62833dc0ddb0814a0c951aef80d9ca8492`。
- 操作前後均大於 3 GiB；最後確認可用約 3.63 GiB。臨時語言包小量查核已清除。未在 EC2 建立新 Git clone、瀏覽器或大型測試資料。

## 翻譯統計

| 類別 | Key 數 | 英／泰／日完整數 |
|---|---:|---:|
| official | 16205 | 各15458 |
| custom | 470 | 各470 |
| ui | 869 | 各869 |

缺漏：custom/UI 各語言 0；official 各語言 747 個空值，其中 739 個是被資料引用且官方 API 缺失的 Key，另外 8 個原包項目本身為空。未解決的 generated text key=0，參數綁定錯誤=0。

## 尚待觀察

真實行動裝置的長時間閒置／作業系統清除儲存情況仍須觀察。已驗證一般導航、重載、cookie 回復與 BFCache 同步；不把短期模擬測試宣稱為所有裝置的長時間測試。公開統計及管理員互動測試使用模擬 API 回覆；正式登入服務與權限邏輯未修改，也未用真實帳號執行有寫入副作用的測試。

## 修改檔案

- `404.html`
- `ability/index.html`
- `about/index.html`
- `admin/index.html`
- `adventEnemy/index.html`
- `assets/js/equipment-combination-ranking.js`
- `assets/js/gear-detail.js`
- `assets/js/gear-page-mode.js`
- `assets/js/hs-stage.js`
- `assets/js/hsEnemy-skill-meta-table.js`
- `assets/js/hsEnemy.js`
- `assets/js/i18n.js`
- `assets/js/mainstage-stage-adapter.js`
- `assets/js/pvp-league-switcher.js`
- `assets/js/pvp-usage.js`
- `assets/js/site.js`
- `assets/js/v2-data.js`
- `deploy/aws/v2/deployment-plan.json`
- `deploy/aws/v2/locales/custom.json`
- `deploy/aws/v2/locales/ui.json`
- `docs/v2-audit/official-term-sources-20261013.json`
- `docs/v2-audit/terminology-20261013.json`
- `endless/enemy/index.html`
- `endless/index.html`
- `endless/stage/index.html`
- `eventStageEnemy/index.html`
- `gear/index.html`
- `guildwar/index.html`
- `guildwar/ranking/index.html`
- `guildwar/usage/index.html`
- `hsEnemy/index.html`
- `index.html`
- `infEnemy/index.html`
- `labyrinth/artifact/index.html`
- `labyrinth/enemy/index.html`
- `labyrinth/index.html`
- `labyrinth/stage/how_to_find_stage/index.html`
- `labyrinth/stage/index.html`
- `mainstage/extreme/enemy/index.html`
- `mainstage/extreme/index.html`
- `mainstage/extreme/stage/index.html`
- `mainstage/hard/enemy/index.html`
- `mainstage/hard/index.html`
- `mainstage/hard/stage/index.html`
- `mainstage/index.html`
- `pvp/index.html`
- `pvp/leaderboard/index.html`
- `pvp/search/index.html`
- `pvp/usage-history/index.html`
- `pvp/usage/index.html`
- `ranger/compare/index.html`
- `ranger/index.html`
- `ranger/ranger/index.html`
- `ranger/ranking/index.html`
- `ranger/stats/index.html`
- `ranger/stats/marks/index.html`
- `settings/index.html`
- `sponsor/index.html`
- `tests/v2-browser-acceptance.cjs`
- `tests/v2-locale-loading.cjs`
- `tests/v2-reported-regressions.cjs`
- `update/index.html`
- `docs/v2-audit/regressions-20261013.md`（本文件）
