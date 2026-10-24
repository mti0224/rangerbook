# 測試寄信續期、20 次上限與四語系信件（2026-10-24）

應用版本 `80ca6282fef985886c525392a8a2603bf78fccd5` 已於 **2026-10-24 21:25 台灣時間**同步至 https://rangerbook-test.warmycat.com/ 。PR #176 維持 Draft，正式網站／auth 未切換。後續交付文件提交不改變此部署版本。

## 已核准並實際完成

站長明確核准本次驗收續期 24 小時，總額度由 5 提高至 **20 次發送嘗試**，沿用原收件者白名單與已使用計數。部署後於 **21:28** 開始新期限，到 **2026-10-25 21:28:46 台灣時間**截止；不會自動續期或重新計數。

已向原核准信箱寄出 **一封新的繁中密碼重設信**，SES 接受成功，outbox=sent。此次作業結束時總額為 **5/20**，其中先前已用4次、本次新增1次，剩餘15次。這是測試程式的上限；孟買 SES 正式寄送已啟用，實際帳戶配額足夠，無須申請增加 SES 配額。SES 接受不代表已確認進入收件匣，仍由站長查收。

原寄信窗已於 10/24 15:17 到期，ExecCondition 因期限跳過，沒有向 SES 發送失敗。佇列中有三封舊重設信，現已在寄送前判定過期／被取代並清除加密內容，**不消耗寄信額度**。此次依站長明確指示，由受限操作者作業建立新的有效重設申請並記錄 `operator_reset_requested`；未清除網站限流紀錄、未改密碼或繞過 2FA。新連結以寄送嘗試起算15分鐘，單次使用；此次連結於 10/24 21:43:52 到期。後續正常申請的連結各有自己的15分鐘期限。

## 程式與信件

- `membership/mail_templates.py`：驗證／密碼重設依站長繁中原文，補英文、日文、泰文，含主旨、稱呼、提醒及署名；安全通知亦有四語系。提供純文字與 HTML，保留粗體／斜體／清單及可點擊連結，沒有追蹤圖片或外部資源。全文見 [四語系信件](member-email-copy-20261024.md)。
- `membership/service.py`：註冊、驗證信重寄、密碼救援及重設接受受限 locale；帳號名稱由後端取得。名稱／語言保存在既有加密 outbox，不新增使用者欄位或 migration。舊客戶端及舊佇列預設繁中。
- `membership/mail_worker.py`：寄送前確認 token 仍有效、未被取代，從權威帳號資料填入名稱；失效訊息不扣預算。HTML 插值跳脫、Token 留在 URL fragment；只有仍有效的目前 Token 才在實際寄送時設定15分鐘期限，不復活過期或撤銷連結。
- `membership/stage/mail_policy.py`、`mail_ready.py`：共用期限與原子預算設定。舊部署預設5次，需明確設定才能提高；允許上限最多20，無效或非有限期限拒絕。直接執行 worker 也遵守期限，SDK 自動重送維持關閉。
- `assets/js/admin-auth.js`、`member-login.js`、`member-action.js`：傳送目前網站語言。忘記密碼先檢查全站寄信狀態，暫停時以四語系提示，不依帳號存在與否回應。API 的通用回覆、帳號／IP／信箱限流不變。
- `assets/locales/sitewide-overrides.json`、`sw.js`：補暫停寄信提示，app hash `504f360d2eca`，data hash 不變。私人 API／帳號頁仍不快取。
- `AGENTS.md`、runtime 範本及 mail unit 說明：記錄站長本次獨立核准；範本保守預設與正式發布 hold 維持。

## 驗證

| 範圍 | 結果 |
| --- | --- |
| 真實舊後端＋隔離資料庫 | **55 passed**，包括四語系驗證／救援／重設與通知、名稱來源、無效 locale、暫停狀態及帳號不列舉；原 2FA、權限與 Session 案例保留 |
| 公開核心／正式部署 hold | **44 passed** |
| 新寄信測試 | **19 passed**，涵蓋八種模板、HTML 注入防護、過期／取代 Token、寄送時計時、舊已用4次加至20及並行上限、期限失效、readiness與worker一致、SDK Stubber驗證 UTF-8 HTML／純文字 request |
| 四語系會員互動 | **4/4** 手機深色，註冊及救援 locale、暫停時不送請求、恢復後正常通用提示，並執行原會員流程 |
| 信件版面 | 八種模板 × 手機／桌面 **16/16**，無橫向溢出，無外部內容，一個帶 noreferrer 的動作連結 |
| 實際 HTTPS | 四語系 **4/4**，使用明確瀏覽器 API 替身驗證部署後腳本、暫停提示與 locale，沒有真實會員 API 或寄信請求 |
| 實際 SES | 僅一封核准重設信；sent、MessageId 已記錄、累計5/20，三封失效佇列 suppressed，無額度重設 |
| 回歸 | 詞庫覆蓋 **4 passed**，公開邊界、Pages／Auth／PWA contract及worker通過；新寄信測試納入 CI |
| 應用 CI | `80ca6282` 的 **9/9 success**，包含完整會員畫面及隔離 artifact 回歸；文件後續提交另追蹤 |

共 **118 項後端測試**。本次沒有向真實使用者群發、沒有用真實 TOTP／恢復碼測試。語系與 HTML 以替身／本機檢查，真實寄出的只有繁中重設信；未聲稱完成 Gmail 原生介面及所有郵件客戶端顯示驗收。

## 保留、備份與正式界線

先以固定 commit、SHA-256及機密解析預檢確認相容性，再備份 SQLite、設定、憑證與私人隊伍。更新五個公開檔案（含既有 stage-bootstrap）及五個隔離後端檔案；初次同步的帳號／綁定／恢復碼／私人隊伍／設定與額度摘要一致，未寄信。之後依獨立核准更新兩項 runtime 設定、mail unit 描述並重啟測試 auth，排入唯一一封新重設信，啟動既有測試 timer；未 enable 開機啟動。

實際資料庫 integrity=ok，身份／密碼雜湊／角色／Google／TOTP／恢復碼與綁定保留；正式 auth PID190922、Nginx及provider維持，正式網站與auth health皆200。本次沒有修改 IAM、SES／SNS／SQS 設定或消費共用 feedback queue；原bounce／complaint限制維持。

受限紀錄目錄：`/home/ubuntu/rangerbook-member-mail-refresh-20261024-80ca6282/`。`backup/` 是資料／程式及續期前設定備份；`previous-site/` 保留舊前端；`result.json` 為程式同步結果；`mail-approval.json` 固定此次期限與上限，避免重跑再延長；`operator-reset-queued.json` 防止作業重跑重複申請；`extension-result.json` 記錄 SES 接受與額度。

回復程式時先停止測試 mail timer／service，回復前端與五個後端檔案；新版新增模組在回復至不引用它們的版本後才移除。回復 runtime 若撤回續期，將再次暫停寄信。**不得倒回資料庫、已使用計數或 Token，也不得重寄已接受的訊息。** 沒有合併 main、正式部署或正式郵件啟用。
