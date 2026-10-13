# 2026-10-13 四語介面修正與驗收

修正版本：`20261013-v2.5`。接續已上線的 V2，未修改 V1 產生器、排程、後端編譯器或遊戲數值。

## 修正項目

| 使用位置 | 修正 |
| --- | --- |
| 角色列表彈出視窗 | 詳細資訊按鈕綁定 `action.viewDetails` |
| 關卡資訊及生產線視窗 | 角色 EXP、玩家 EXP、金幣、生產上限補齊四語 UI Key |
| Rangers 數據統計 | 折線圖選單、範圍說明、圖例翻譯；選單值、30 個月計算及數值保持原樣 |
| 管理員檔案更新 | 檔案數模板；展開／收合使用已翻譯的 HTML 屬性，不再由 CSS 寫死中文 |
| 管理員流量 | 四項指標、最新更新、圖表提示、瀏覽數及工作階段數以模板表示 |
| 公會戰使用率 | 星級／類型／屬性逐項翻譯；公會數及人數模板；篩選值保持原樣 |
| 鳴謝 | 非中文版本的超連結與後方文字間加一個空白 |
| 文字呈現 | 可見的字面 `\\n`、`/n` 改成空白；不改官方原始資料及程式／路徑區塊 |
| 設定 | 英文語言圖示改為 Lang；英文及泰文縮小字級 |
| 迷宮入口 | 桌面最多兩張一排，手機一張一排 |
| 首頁 | 入口卡片標題與說明放大，移除頂部三張角色圖片 |
| 更新日誌 | 2026-10-13 新增設定及四語支援兩則公告，四語完整 |

使用者提及的折線圖位於 `/ranger/stats/`（角色統計），`/ranger/compare/` 本身沒有該圖表。

## 主要檔案

- `assets/js/i18n.js`：可見文字清理及明確 Key／參數格式化。
- `assets/js/ranger.js`、`ranger-stats.js`、`admin-page.js`、`admin-traffic-charts.js`、`guildwar-usage.js`：相關動態介面。
- `assets/css/admin.css`、`settings-page.css`、`labyrinth.css`、`game-tech.css`：展開文字及版面。
- `settings/index.html`、`about/index.html`、`index.html`：圖示、空白及首頁。
- `deploy/aws/v2/locales/ui.json`、`deployment-plan.json`：24 個新增 UI Key、Lang 調整及部署輸入雜湊。
- `res/更新日誌.json`：網站自行維護的公告。
- `tests/v2-oct13-interface.cjs`、`test_game_term_alignment.py`：新增四語互動驗收；歷史翻譯稽核允許後續新增 UI Key。
- 正式 HTML 入口與核心載入器統一更新快取版本，防止舊程式配新翻譯庫。

## 實際驗收

瀏覽器測試在獨立工作環境的 Chromium 143 執行。管理員及公會使用率 API 使用唯讀 fixtures；未使用真實帳號或寫入管理員資料。圖片以確定性小圖代替；沒有關閉瀏覽器網路安全檢查。

| 指令／測試 | 結果 |
| --- | --- |
| `node --check`（修改的動態 JS） | 通過 |
| `python -m unittest discover -s tests -p test_user_audit_translations.py -v` | 3 通過 |
| `python -m unittest discover -s tests -p test_game_term_alignment.py -v` | 6 通過；185 筆官方對照及 437 筆遺物名稱仍成立 |
| `python -m unittest discover -s tests -p test_ui_locale_coverage.py -v` | 2 通過 |
| `python -m unittest discover -s tests -p test_i18n_detail_tables.py -v` | 3 通過 |
| `settings-ui.cjs` | 四語、1400／390 px 設定操作通過 |
| `v2-reported-regressions.cjs` | 四語既有技能表格、機關、裝備、PvP、公會及語言持久性回歸通過 |
| `v2-oct13-interface.cjs` | 四語本次所有項目通過；驗證數值及篩選操作，不只檢查文字存在 |
| `admin-workspace-ui.cjs` | guest／user／admin／super_admin 四種權限通過；非管理員未請求管理端 API |
| `admin-traffic-ui.cjs` | 兩種管理員 × 明暗色系 × 手機／桌面，共 8 組；30／7／90 天、空資料及提示操作通過 |
| `scripts.v2.audit.audit(res/v2)` | 0 阻斷文字／語意綁定錯誤 |
| `git diff --check` | 通過 |
| `node --test tests/game-tech-contract.test.js` | 19 通過；移除首頁角色圖片後保留入口卡片原圖與結構 |
| `node tests/i18n-contract.cjs`、`test_game_locale_export.py` | 通過；Python 1 項 |
| `first-paint.cjs` | 7 頁 × 明暗，共 14 組；延遲有快取參數的 site.js 時首屏版面仍正確 |
| `ui-i18n-page-audit.cjs` | 17 頁英語動態介面通過；測試期望跟隨已核對官方術語 Factor／Splash Radius／Agility Type |

重現瀏覽器測試：在網站根目錄啟動 HTTP server，設定 `AUDIT_BASE_URL`，安裝 Playwright／Chromium 後執行 `node tests/<測試檔>.cjs`。

翻譯：official 16,205、custom 470、UI 893。custom／UI 四語缺漏為 0。官方資料包 739 個不存在的引用 Key、8 個空白列仍保留標記；各語言官方缺漏合計 747，不以自行翻譯掩蓋。

## 發布與獨立性

本 PR 不提交 `res/v2/` 的人工替代輸出。AWS 只更新 V2 自身 `data/locales/ui.json`，使用既有獨立編譯器驗證後發布；正式發布前備份 V2 程式／輸出／metadata／state。V1 程式與 systemd 定義、V2 的 23 個修正後端檔案及登場日期表以雜湊驗證不變。

網站遊戲資料請求使用 V2 adapter。`res/更新日誌.json`（網站公告）及 `res/ranger_stats_config.json`（使用者統計設定）是明確保留的網站自有檔案，不是 V1 產生的遊戲 JSON。

AWS 不安裝瀏覽器、不建立 Git clone 或下載大型測試資料；編譯及發布時保留至少 3 GiB 可用空間。部署失敗使用備份回復本地 V2；GitHub 發布沿用已驗證的重試機制。正式部署與下一次排程執行結果記錄於 PR。

限制：本次管理端測試驗證前端登入權限與已授權 API 行為，未對正式帳號執行密碼／角色／管理資料寫入。

部署備份：`/home/ubuntu/rangerbook-v2/backups/v2-interface-20261013-retry/v2-before.tar.gz`（1,990,505 bytes）。AWS 24 檔驗證通過、文字綁定錯誤 0、後端 23 檔及 V1／服務 38 檔雜湊不變、歷史登場日期不變。最低可用 3.5777 GiB，完成時 3.6006 GiB。資料發布 commit：`8a7f919814b1e05d6419c16cacc3e29c7104518c`。

部署紀錄第一次以 root 讀取 ubuntu Git checkout 被 Git 擁有者檢查拒絕，本地 V2 自動回復；改用 ubuntu 讀取後重新部署成功，未變更 Git 安全設定。CI 的首屏測試修正為依 URL pathname 攔截 site.js，避免快取參數導致測試未實際延遲腳本。CI 在獨立 checkout 使用 authored UI catalog，無正式 `res/v2` 人工提交。

下一次排程驗證：Asia/Taipei 10/13 10:14:21 V2 更新成功（exit 0），UI 輸入及輸出仍是 SHA-256 `23bd0f11a0900021b9550769b67b0b227e9c2d8067455ec6b895471620aa33ae`；V1 10:12:09 更新成功。兩個 timer 均 active，38 個受保護檔案及登場日期仍未變；驗證時可用空間 3.6077 GiB。
