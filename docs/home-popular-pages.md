# 首頁「大家都在找…」

首頁新增最近 7 天（含今日）的前三名資料頁入口，以 GA4 `screenPageViews` 排名，每小時由既有 `rangerbook-traffic.timer` 更新。這是頁面瀏覽次數，並非首頁卡片獨立 click event。第一名占排行區塊上半部；第二、三名分列下半部左右。

熱門排行與更新日誌的標題置於各卡片外、靠左對齊，下方入口卡片統一使用「所有頁面」標題，沒有額外的外框區塊。桌面熱門排行與更新日誌左右並列，原有入口卡片順序與桌面位置保持不變。960px 以下依序排列熱門排行、更新日誌、單欄入口卡片。區塊標題、期間、排名、瀏覽次數、資料頁名稱及載入／空白／錯誤狀態均支援繁中、英文、日文、泰文。

## 統計範圍

- 僅 `assets/data/popular-pages.json` 中的資料頁及經獨立 V2 索引驗證的詳細頁可入榜。
- 排除首頁、Rangers／PvP／公會／主要關卡／無限之塔／迷宮等中繼頁、管理員、玩家隊伍查詢、設定、介紹、贊助、教學及不存在頁面。
- `/index.html`、尾端斜線、GitHub Pages `/rangerbook/` 前綴統一後加總；舊 `hsEnemy`、`infEnemy` 路徑映射至現有資料頁。查詢參數不拆分排行榜。
- GA4 查詢僅納入正式 host `rangerbook.warmycat.com`、`mti0224.github.io`，使用分頁取得全部結果後加總、排序。相同次數依 canonical path 排序，最多三筆；無資料時不捏造排行。
- 個別 Ranger／裝備及困難、極限、無限之塔關卡詳細頁，須通過 V2 索引驗證才能入榜；角色及裝備名稱取現有四語官方詞庫。`?detail=` 與同一詳細路徑合併，維持與列表頁分開排名。

## API 與資料來源

`GET /public/popular-pages` 不需 Session，僅回傳 `status`、`days`、`updatedAt` 及最多三筆 `{rank, path, views}`。JSON 存在私有 `traffic-cache/popular-pages.json`，模式 `0600`；公開端點重新過濾及投影欄位，不會回傳完整管理員流量報表、使用者數或來源。

前端讀取 API 與共用資料頁清單，依 UI Key 顯示在地化名稱。請求 10 秒超時後顯示已翻譯的錯誤狀態，不影響首頁其他入口。原有 `/admin/traffic` 及相容端點仍需管理員登入。

翻譯維護於 `deploy/aws/v2/locales/ui.json`；`assets/locales/ui.json` 同步繁中／英文相容詞庫。`res/v2/` 由既有獨立 V2 編譯器產生，不提交人工替代輸出。

## 部署順序

1. 在 Sydney `i-05cb332634cb5d0a9` 備份 Auth 的 `app.py`、`traffic_collector.py`、私有快取及 V2 UI 輸入。
2. 核對正式 Auth 原始檔案與本 PR 的父版本一致。已於 2026-10-13 查核：app SHA-256 `6af5e972d6311696cd1d9a543ef387f14a1846bf303063121b4d45904e17708d`；collector `ff722293b189b2219efbf46089bcb6ffd79afc7dcfe1f8a59c08f0541141288f`。
3. 同步 `app.py`、`traffic_collector.py`、`popular_pages.py` 至 `/home/ubuntu/rangerbook-auth/`；將共用清單複製為該目錄的 `popular-page-catalog.json`。現有環境變數、認證、資料庫與排程保持原樣。
4. 更新 `/home/ubuntu/rangerbook-v2/data/locales/ui.json`，依既有 V2 鎖、備份及候選驗證流程產生並發布四語詞庫；不得覆寫登場日期或部署其他歷史補丁。
5. 手動執行既有 traffic service，確認新私有快取與 7／30／90 天報表皆成功；重啟 Auth 並驗證 HTTPS 公開端點 200、CORS、健康檢查以及未登入管理員流量端點 401。
6. 確認四語發布內容包含新增 Key，再合併前端 PR／部署 GitHub Pages；正式桌面及手機驗收。

## 驗證

- 五項 Python 測試：中繼頁排除、網址合併／穩定排名、有效詳細頁及列表分開排名、GA4 分頁、公開欄位邊界／CORS／管理員保護／壞快取。
- Playwright：四語 × 深淺色，1366／961／960／768／390／320px；兩等高上下區域、第二／三名位置、響應式外層順序、既有卡片單欄、連結、長文字、無橫向捲動、空白／未配置／錯誤狀態、真實 V2 角色／裝備名稱與關卡詳細連結。
- 已以正式 EC2 的既有無私鑰認證在記憶體執行候選 GA4 查詢（未替換正式檔案），回傳 PvP 使用率 11,456、Rangers 數據 1,390、PvP 排行榜 1,233。時間為 2026-10-13 18:38 Asia/Taipei，數字會隨資料更新。
- 本文件描述已完成的程式與候選驗證；不代表已更新正式 AWS 或 GitHub Pages。
