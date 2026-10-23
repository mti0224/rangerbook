# 會員 V2：真人驗收與正式切換準備（2026-10-23）

本報告更新初次交付及第 4 步演練後的實際狀態。程式候選 `8ccbdbe2be52e880d57b46b025dd598ee3aae6a3` 的 9 個 GitHub Actions 工作流程全部通過。[PR #176](https://github.com/mti0224/rangerbook/pull/176) 維持 Draft。帳號安全主要真人驗收及個人隊伍綁定／匯入／解除流程已通過；正式環境切換檢查尚待完成，不可因本報告而直接合併或部署。

正式服務未切換，正式會員資料庫、帳號、角色及私人隊伍未修改。GitHub Pages 在 main 收到 push 後會自動發布，**合併本 PR 本身就是前端發布動作**，須先完成後端切換驗證並取得站長核准。

站長後續指定：先完成切換以外的準備，等新介面示意圖與介面修改完成後才合併切換。獨立 runtime／unit／Nginx 候選、機密載入、本機受限金鑰備份與 preflight 已完成，詳見 [第 6 步最新狀態](member-production-cutover-20261023.md)；PR 保留 Draft 及介面待完成 hold。

## 1. 已完成的真人驗收

| 項目 | 操作者與後端證據 | 結果 |
| --- | --- | --- |
| 註冊與 Turnstile | 真實 challenge 通過，建立未啟用一般會員；沒有管理員待審申請 | 通過 |
| 重複 Email | 第二次使用相同 Email 申請未建立第二帳號，前端維持通用回應 | 通過 |
| Email 驗證 | 收到新驗證信後啟用；後端 email_verified=1、account_active=1、role=user，含驗證及登入稽核 | 通過 |
| Google Gmail 綁定 | 真人授權完成，後端有 Google 身分、核准救援信箱與 google_linked 稽核；未輸出身分值或憑證 | 通過 |
| 普通會員 TOTP | 真人啟用、停用、重新啟用；加密 Secret 與恢復碼雜湊由後端儲存 | 通過 |
| 忘記／重設密碼 | 真人收取重設信並改用新密碼；受限重設前基準證明密碼雜湊已變更且原 Session 全部消失 | 通過 |
| 重設保留第二因素 | 加密 TOTP Secret、恢復碼集合、角色與 Google 綁定均未變動；新登入有 factor_verified | 通過 |
| 最大管理員強制 2FA | 先受限初始設定，再以 TOTP 取得完整 Session；角色保留，操作者可進管理頁 | 通過 |
| 恢復碼再生與單次使用 | 有 recovery_codes_replaced、recovery_code_used 稽核；首次成功後剩 9 組，同碼再次使用被拒絕 | 通過 |
| 真實寄信 | 驗證信兩封、重設連結及完成通知各一封，outbox sent=4；受控收件者與總額度 4/5 | 通過 |
| 個人隊伍綁定與匯入 | 真人完成遊戲帳號持有驗證，後端有成功匯入及私人隊伍檔；iframe 修正後另有手機／桌面七種隊伍及分析顯示回歸 | 通過，畫面範圍見第 8 節 |
| 個人隊伍解除綁定 | 操作者回報成功；後端確認綁定、私人隊伍檔、待驗證 challenge 與候選均已清除 | 通過 |

恢復碼單次使用測試後，操作者繼續登入及隊伍驗收。解除綁定後的唯讀檢查確認角色仍為 super_admin、TOTP 仍啟用、尚有 8 筆恢復碼雜湊，SQLite integrity_check=ok；先前單次使用驗收時的 9 筆是當時快照。未把待驗證 Session 當成完整授權。

## 2. 本次驗收發現並修正的問題

- 測試 mail worker 原本嘗試解析與寄信無關的 Google／Turnstile 機密，導致 outbox 有信但尚未呼叫 SES。已改由 instance role 及受限本機加密金鑰直接啟動 worker，保留白名單與持久化額度。
- 安全操作原本只在頁首顯示結果，操作區缺少反饋。新增各區處理中、成功、失敗及下一步訊息，防止重複送出。
- 身分驗證成功後顯示五分鐘有效倒數並避免再次提交；限流依後端實際剩餘時間倒數，CORS 開放讀取 Retry-After。每 15 分鐘 5 次重新驗證的限制維持，沒有清空既有計數。
- 修正管理員列表在 i18n ready 前渲染的競態；四語系回歸及 CI 通過。

另在個人隊伍真人測試發現測試帳號建立工具產生 `stage-` ID，既有私人隊伍儲存只接受 `usr_` ID；舊匯入測試替換 private_path，未覆蓋真實格式檢查。建立工具已改用標準格式。既有已發出的測試帳號不改 ID、綁定、Session 或 2FA，而由受限 compatibility helper 支援；只有 stage 旗標及精確 acceptance DB／隊伍目錄符合時才啟用。正式驗證規則不變，路徑穿越與其他格式仍拒絕。匯入測試已移除路徑替身，直接驗證實際檔案權限、讀取、跨帳號不可見及解除刪除，兩種 ID 都通過。

個人隊伍完成匯入後，測試站的全域 X-Frame-Options: DENY 阻擋了內嵌檢視頁。已僅為 /pvp/search/ 及 /pvp/search/index.html 設定 SAMEORIGIN 與 frame-ancestors self，並重述 Nginx add_header 的禁止快取等繼承標頭；其他頁面／API 維持 DENY。Nginx -t、graceful reload 與六個 HTTPS 網址的標頭檢查通過。新增使用實際 snippet 標頭的瀏覽器回歸：手機／桌面載入真正隊伍 iframe、七種隊伍切換與分析呈現均通過，外來源及其他受保護頁面嵌入仍遭拒絕。真人後續已回報解除綁定成功，後端檔案與資料清除亦確認。

## 3. 前端與權限

新增 `/personal-teams/`、`/account/`、`/account-action/`，沿用既有 CSS、i18n、隊伍檢視與分析模型。管理頁保留登入、註冊及真正的管理工作區；個人隊伍與密碼舊分頁移除。

側邊欄「使用者」測試期僅完整登入的 admin／super_admin 可見。一般會員仍可經直接頁面與已驗證 Session 使用個人功能；`RANGERBOOK_MEMBER_NAVIGATION` 是呈現設定，不影響 API 授權。未完成 MFA 不取得完整權限。

| API 範圍 | 後端身分與條件 |
| --- | --- |
| `/auth/login`、`me`、`logout` | 原 Cookie／Argon2 系統；需要 MFA 者先取得短期受限 Session |
| `/auth/security`、`reauth`、`2fa/*` | 自身 Session；安全修改需要近期密碼及適用的第二因素 |
| `/auth/google/start`、`callback`、`unlink` | 完整登入與再次驗證；Code + PKCE、單次 state、nonce、簽章與 Gmail 驗證 |
| `/auth/register`、`email/*`、`password/forgot`、`password/reset` | CAPTCHA、Email 啟用、限時單次 Token 與限流；忘記密碼使用通用回應 |
| `/member/game-*`、`/member/personal-teams*` | 完整登入會員；使用者身分僅取自 Session；原個人 `/admin/` 別名套用相同限制 |
| 原管理資料／GA4 API | admin 或 super_admin |
| 使用者權限與管理員申請審核 | super_admin |

前端及 PWA 不儲存密碼、Session Token、TOTP Secret 或恢復碼；私人頁面／API 不進 Service Worker 快取。測試站另停用 GA 及 PWA 安裝，HTTPS 回應 no-store，OAuth callback 不寫入存取日誌。

## 4. Migration、備份與回復

沿用 SQLite，加法式 Migration 新增 Email、Google 綁定、TOTP、Session MFA／重新驗證欄位，以及 Token、恢復碼、稽核、outbox、抑制等資料表。舊帳號預設維持啟用，保留原角色、密碼雜湊、Session 與遊戲綁定；舊帳號可登入後綁定 Google 增加救援方式。

`python -m membership.manage migrate DB --backup NEW_BACKUP` 以 SQLite backup API 建立不可覆寫的 0600 備份，核對原資料及 integrity／foreign keys，並支援重複執行。隔離升級與備份還原已實測。正式 Migration 尚未執行。

正式切換時先停寫及郵件 worker，建立新備份並獨立保管加密金鑰，再遷移與驗證。若須還原，先保留失敗現況，再還原到新檔並核對匹配金鑰；涉及丟棄切換後寫入時須另外核准。**啟用 2FA 後不得回退到不驗證第二因素的舊後端**；優先保留 V2 驗證、回退前端或暫停受保護操作後修復。

## 5. Google、Turnstile、SES 與 IAM

- Secrets Manager 已採 `client_id`／`client_secret` 及 `site_key`／`secret_key`，透過 runtime dynamic references 載入；機密值不進入維護代理輸出、Git、Pages 或日誌。
- 測試 Google callback 為 `https://rangerbook-test.warmycat.com/auth/google/callback`，已完成真人綁定。正式前須核對 Web client 的精確 callback：`https://rangerbook-auth.warmycat.com/auth/google/callback`。Testing audience 只允許列入的 Google 測試使用者，管理員試用期應確認名單；全面開放前處理發布狀態。
- Turnstile Managed widget 的測試 hostname 已通過真人註冊；正式 hostname 的實際瀏覽器驗收仍屬切換檢查，不能只看已存在金鑰。
- 孟買 SES Production Access、網域／DKIM 驗證、Configuration Set、SNS／SQS 回饋已準備。站長已核准並套用 `RangerbookMembershipRuntimeV2`，使用 instance role，不使用長期 Access Key。
- worker 使用加密 outbox、租約與退避重試，成功或抑制後清除 payload。測試總額度在 SES 呼叫前原子保留，跨重啟／並行最多 5 次；SDK 測試重試停用。已使用 4 次，額度不重設。
- 實際 SES Send 回饋及真人收信已確認；Bounce／Complaint 程式處理有模擬測試，尚未向 mailbox simulator 寄信。共用 queue 沒有由測試程序刪除事件；正式 consumer 啟動前需確認 queue 歸屬與單一消費者安排。
- Gandi 根網域 MX／SPF 未變更；DMARC、收件端 DKIM／對齊與既有 Gandi 收信回歸仍需核對。若新增 custom MAIL FROM，只使用獨立子網域，不覆蓋根網域收信。

## 6. 2FA 與人工救援

TOTP Secret 加密，恢復碼只存高熵雜湊、顯示一次並原子刪除；驗證有錯誤次數與步數重放保護。最大管理員禁止一般停用。密碼重設保留第二因素並撤銷所有原 Session。

人工恢復使用受限伺服器操作：先站外確認身分、記錄工單與核准、建立備份，再執行 `membership.manage recover-totp`。保留密碼與角色，撤銷 Session，記錄稽核；最大管理員仍須重新綁定才取得權限。沒有公開繞過驗證的重設 2FA 入口。此程序已有合成測試，正式最大管理員帳號未操作。

## 7. 測試結果及限制

| 範圍 | 實際結果 |
| --- | --- |
| 最新本機核心＋私有後端＋部署保護整合 | 67 passed，含實際私人檔案讀寫／刪除、帳號隔離、測試 ID 相容及切換保護 |
| 會員 UI | 四語系 × 深淺色 × 手機／桌面共 16 組通過，包含處理中、防重複、倒數及 Google 回呼結果 |
| 管理員安全 UI | 四語系登入／密碼／登出回歸通過 |
| 先前完整 EC2 ASGI 演練 | 10/10，含重複 Migration、備份與還原登入；見第 4 步報告 |
| 獨立正式候選 EC2 驗證 | 合成 ASGI 演練 10/10，部署保護 10/10，provider／Nginx preflight 11/11；正式 DB、PID 與設定維持現況 |
| 隊伍模型與公開網站 | 既有分析、版型、側欄、PWA、公開邊界回歸通過；沒有重寫分析公式 |
| 候選 8ccbdbe2 CI | 9/9 成功；本次文件更新另以最新 PR head 為準 |
| 真人帳號安全 | 見第 1 節，通過 |
| 真實遊戲連線及匯入 | 唯讀連線、一般會員搜尋及安全候選欄位通過；真人位置交換綁定、後端匯入及解除後資料／檔案清除通過 |
| 內嵌隊伍安全回歸 | 手機／桌面真 iframe、七種隊伍切換及分析顯示；外來源及其他頁面嵌入被拒絕；測試站六個 HTTPS 標頭檢查通過 |

真人未涵蓋 Google 解除／重複身分的外部授權、重設連結再次兌換，以及真實 Bounce／Complaint；這些後端拒絕分支已有隔離測試，報告不把替身測試寫成真人驗收。iOS／Android 實機 PWA 及 Gandi 收信仍待操作者確認。

## 8. 個人隊伍驗收完成範圍

測試站已建立受限遊戲連線副本與公開名稱索引快照，敏感檔案 0600、目錄 0700，位於 web root／公開儲存庫之外。API 僅回傳候選識別、名稱與公會，不洩漏原始遊戲 UID 或未驗證隊伍。一次唯讀連線及會員搜尋已通過；正式綁定與私人隊伍未複製或修改。

操作者以隔離站合成最大管理員完成搜尋、遊戲持有驗證、綁定與匯入，修正畫面問題後回報「成功解除綁定」。唯讀後端檢查確認無綁定、無私人隊伍檔、pending challenge=0、player candidates=0；角色與 2FA 保留。一般會員路由、跨帳號隔離及解除刪除由實際私人檔案整合測試補足。

七種隊伍（1–5、PvP 防守、公會戰進攻）及分析顯示由手機／桌面瀏覽器回歸驗證；這不等同操作者逐項比對所有真實隊伍的數值。反覆更新匯入、每個 Ranger／裝備數值及實機效能沒有另外取得完整真人逐項簽核，仍屬正式試用期間的回歸觀察範圍。

## 9. 第 6 步核准前的具體順序

1. 個人隊伍綁定／匯入／解除已完成。重新確認最新候選及 main 差異；本次查得 main `95da0374` 比已整合的 `9e3fa3ba` 多 38 筆自動資料發布，淨差異僅 `res/v2/resources.json`，不涉及會員程式。合併前仍須再次核對並保留 main 最新資料，避免將時間戳記回退。
2. 獨立 release／依賴／systemd／runtime secret 載入及本機受限金鑰備份已準備驗證；不使用測試 provider／key 作依賴。異地備援與正式 callback／Turnstile 瀏覽器確認依切換審核單保留。
3. 正式 Nginx／unit diff、callback 日誌抑制、代理 IP、request limit、worker 與聚合健康檢查已具體化並測試；檔案未安裝、正式 timer 未啟動。等待介面示意圖，完成介面並重驗後才安排正式審核。
4. 取得站長明確核准後，停寫、正式備份／Migration、啟動新後端並執行登入及權限 smoke test；保留 SSM 人工恢復通道並陪同最大管理員初始綁定。
5. 後端通過後才合併 PR，因 main push 會觸發 Pages 發布；驗證 PWA 更新、公開頁、四語系及會員功能，再啟動經核准的正式寄信。
6. 監控 API／outbox／稽核／回饋。確認穩定後按站長安排撤除測試入口，後續以設定開放一般會員導覽。

目前判斷：**第 5 步核心真人驗收完成，可進行第 6 步正式切換準備；尚不可直接合併或正式部署**。正式設定與操作範圍見 [具體切換審核單](member-production-cutover-20261023.md)，最後由站長明確核准切換。

## 10. 修改／新增檔案

以下清單由相對 main `9e3fa3ba` 的候選版本差異產生，包含本次交接文件；不包含私有 EC2 後端、設定、資料庫、郵件、遊戲連線憑證或使用者個資。

- `.github/workflows/validate-security.yml`
- `.gitignore`
- `account-action/index.html`
- `account/index.html`
- `admin/index.html`
- `assets/css/admin.css`
- `assets/css/sidebar-drawer.css`
- `assets/js/admin-auth.js`
- `assets/js/admin-page.js`
- `assets/js/admin-personal-teams.js`
- `assets/js/member-action.js`
- `assets/js/member-page.js`
- `assets/js/member-registration.js`
- `assets/js/pvp-player-search.js`
- `assets/js/site.js`
- `assets/locales/sitewide-overrides.json`
- `assets/pwa/service-worker.js`
- `docs/member-acceptance-20261023.md`
- `docs/member-production-cutover-20261023.md`
- `docs/member-security-v2-20261022.md`
- `docs/member-stage-validation-20261023.md`
- `membership/README.md`
- `membership/__init__.py`
- `membership/aws/README.md`
- `membership/aws/runtime-policy.json`
- `membership/config.example`
- `membership/mail_worker.py`
- `membership/manage.py`
- `membership/prepare.py`
- `membership/production/README.md`
- `membership/production/__init__.py`
- `membership/production/health.py`
- `membership/production/launch.py`
- `membership/production/prepare.py`
- `membership/production/rangerbook-auth.service.in`
- `membership/production/rangerbook-member-health.service.in`
- `membership/production/rangerbook-member-health.timer.in`
- `membership/production/rangerbook-member-mail.service.in`
- `membership/production/rangerbook-member-mail.timer.in`
- `membership/production/rangerbook-membership-secrets.service.in`
- `membership/production/runtime.env.in`
- `membership/production/secrets.toml`
- `membership/rangerbook-member-mail.service.in`
- `membership/rangerbook-member-mail.timer.in`
- `membership/requirements.txt`
- `membership/schema.py`
- `membership/service.py`
- `membership/stage/README.md`
- `membership/stage/bootstrap.py`
- `membership/stage/build-site.mjs`
- `membership/stage/launch.py`
- `membership/stage/mail_ready.py`
- `membership/stage/nginx.conf.in`
- `membership/stage/rangerbook-membership-test-mail.service.in`
- `membership/stage/rangerbook-membership-test-mail.timer.in`
- `membership/stage/rangerbook-membership-test-secrets.service.in`
- `membership/stage/rangerbook-membership-test.service.in`
- `membership/stage/runtime.env.in`
- `membership/stage/secrets.toml`
- `membership/stage/storage_compat.py`
- `membership/stage/viewer-headers.conf.in`
- `membership/stage/wait_provider.py`
- `personal-teams/index.html`
- `pwa-data.json`
- `scripts/build-pwa.mjs`
- `scripts/package-pages.mjs`
- `sw.js`
- `tests/admin-workspace-ui.cjs`
- `tests/game-tech-contract.test.js`
- `tests/local-static-fixture.cjs`
- `tests/member-browser.cjs`
- `tests/member-production-preflight.py`
- `tests/member-release-smoke.py`
- `tests/member-stage-browser.cjs`
- `tests/pwa-contract.cjs`
- `tests/pwa-worker.cjs`
- `tests/security-browser.cjs`
- `tests/security-pages.mjs`
- `tests/sidebar-drawer-ui.cjs`
- `tests/site-sidebar-ui.cjs`
- `tests/team-analysis-model.cjs`
- `tests/test_membership_core.py`
- `tests/test_membership_production.py`
- `tests/test_membership_v2.py`
- `tests/test_sitewide_locale_coverage.py`
- `tests/test_ui_locale_coverage.py`
