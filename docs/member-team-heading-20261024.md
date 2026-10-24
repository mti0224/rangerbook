# 「你的隊伍」欄位標題（2026-10-24）

應用版本 `76b0ee60151c42a5702c635645cc8f40d4752cda`，PR #176 保持 Draft，正式服務未切換。

- 個人隊伍檢視區將「預查看的隊伍」改為標準 `h3` 欄位標題「你的隊伍」。保留同一張檢視卡片與七種隊伍選單；桌面標題與選單同列，手機上下排列。
- 選單透過 `aria-labelledby` 使用標題作為無障礙名稱，移除舊的小字標籤，不新增獨立卡片。
- 繁中「你的隊伍」、英文「Your teams」、日文「あなたのチーム」、泰文「ทีมของคุณ」均使用現有 i18n 詞庫。一般最大管理員玩家查詢模式維持原樣。
- 沒有後端、權限、資料庫或會員資料變更；PWA app hash 更新為 `ed7c158d82aa`，資料 hash 不變。

## 驗證

- 本機真 iframe 四語系 × 深淺色 × 390／768／1440／1920：**32/32** 通過，包含標題、選單無障礙名稱、七模式、角色詳細資料／分析與欄位寬度。
- 語系完整性 **4/4**、私人檢視版型 **7/7**、隊伍分析模型／V2 詞庫一致性、PWA 合約／worker 及公開邊界通過。
- 實際 HTTPS 四語系 × 390／1440：**8/8** 標題、選單及七模式通過；以既有合成會員登入，綁定資料為瀏覽器內替身，未更動伺服器綁定。
- GitHub Actions 仍依應用版本追蹤；本次不以先前版本的 CI 成功結果代替。

## 同步

已於 **2026-10-24 18:01 台灣時間**同步至 https://rangerbook-test.warmycat.com/，`deployment.json` 為上述應用版本。更新四個公開檔案並驗證來源／隔離 artifact 雜湊。

同步前建立受限 SQLite、設定、金鑰／入口及私人隊伍備份。使用者、綁定、恢復碼、私人隊伍、設定及郵件預算摘要保留，DB integrity=ok；正式／隔離 auth PID 及正式 unit 摘要不變，正式網站／auth health 200，測試入口未授權仍 401。沒有寄信、實際 Google／遊戲 API 操作或 TOTP／恢復碼消耗，郵件維持 4/5。

備份：`/home/ubuntu/rangerbook-member-team-heading-20261024-76b0ee60/backup`；舊前端：同目錄 `previous-site`；結果：同目錄 `result.json`。失敗只回復前端，不還原資料庫。尚待站長確認視覺；正式切換 hold 維持。

修改：`assets/js/pvp-player-search.js`、`assets/css/personal-team-viewer.css`、`assets/locales/sitewide-overrides.json`、`pvp/search/index.html`、`sw.js`，並更新既有 iframe／受限主機驗收工具。
