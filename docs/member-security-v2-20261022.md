# Rangerbook 會員系統 V2：實作、驗證與部署交接

本次以 main `d12658a8fddb6a419929deec9116514870b81c46` 與孟買 EC2 實際原始碼為基準；交付前已同步最新 main `66318c18581afd2bf04df250798cb0cf032445b8` 並重建 PWA 校驗資料。已完成程式修改、隔離測試及部署準備，尚未合併、正式部署、修改正式資料庫、改動帳號或寄送真實郵件。PR 應維持 Draft，不能把替身測試通過視為正式服務驗收完成。

## 1. 現況與選型

EC2 的認證後端比公開儲存庫完整，沿用其 FastAPI、SQLite、Argon2、HttpOnly Cookie、Origin 檢查與限流。沒有匯入正式資料庫、私人隊伍、環境檔或 Google／遊戲憑證。正式環境已有 16 位 admin 與 1 位 super_admin；原本降權會撤銷 Session，此行為保留。

新 `membership/` 是加在既有後端上的通用擴充套件，不包含遊戲 API 的私人實作。`prepare.py` 將既有私有原始碼複製到新版本目錄，最後接上擴充；不直接覆蓋運作中的程式。Pages 白名單與 PWA 建置都排除這個目錄。

## 2. 頁面與側邊欄

- 新增 `/personal-teams/`，搬移原管理頁面的完整個人隊伍介面，沿用原 JS、嵌入式隊伍檢視與分析計算。
- 新增 `/account/`，保留目前密碼驗證與修改，加入 Google 救援信箱、2FA 與獨立管理員申請。
- 新增 `/account-action/`，處理 Email 驗證、重寄與忘記／重設密碼。
- `/admin/` 保留原登入與註冊入口，只保留資料更新、GA4、帳號／權限及申請審核等管理分頁。舊個人隊伍與密碼分頁移除。
- 側欄新增「使用者」，內含個人隊伍、隱私權與密碼、管理員頁面。測試期僅完整登入的 admin／super_admin 顯示。`RANGERBOOK_MEMBER_NAVIGATION=1` 可日後開放一般會員的前兩項，管理員入口仍依角色限制。
- 繁中、英文、日文、泰文使用既有 i18n 機制；沿用現有深淺色、980px 內容寬度與手機抽屜。

## 3. API 與權限

| 路由 | 驗證方式與用途 |
| --- | --- |
| `/auth/features` | 公開的功能開關與 Turnstile 公開 site key，無機密 |
| `/auth/login`、`/auth/me` | 有 2FA 或 super_admin 時先建立受限登入階段；回應不授予完整角色 |
| `/auth/reauth` | 再次輸入密碼；已啟用 2FA 時同時驗證第二因素，安全操作有效五分鐘 |
| `/auth/security` | 自身安全狀態；第二因素未完成前不回傳救援 Gmail |
| `/auth/2fa/setup`、`enable`、`verify` | 初始註冊、確認啟用與登入第二步 |
| `/auth/2fa/recovery-codes`、`disable` | 完整登入且近期重新驗證；super_admin 禁止停用 |
| `/auth/google/start`、`callback`、`unlink` | 正式授權碼＋PKCE 綁定／更換／解除 |
| `/auth/register`、`/auth/email/verify`、`resend` | CAPTCHA 與 Email 啟用流程；不自動提出管理員申請 |
| `/auth/password/forgot`、`reset` | Gmail 救援、一次性限時密碼重設 |
| `/member/admin-application` | 已登入的一般會員自行提出申請 |
| `/member/game-players/search`、`/member/game-binding/*`、`/member/personal-teams*` | 完整登入會員使用；身分只來自後端 Session |

原 `/admin/` 個人隊伍路由保留相容別名，但套用相同會員驗證及自身資料範圍。其他管理 API 仍要求 admin／super_admin，帳號管理與申請審核仍要求 super_admin。沒有信任前端 user ID、角色或 URL 提升權限。第二因素未完成時，管理 API 和個人隊伍 API 均拒絕。

## 4. Migration、備份與相容性

新增使用者 Email／驗證／啟用狀態、Google `sub`／救援信箱、加密 TOTP 與最後使用步數；Session 新增 MFA 完成及重新驗證期限。新增單次 Token、2FA 設定暫存、恢復碼雜湊、OAuth 交易、稽核、加密 outbox、退信抑制與 Migration 版本表。

原帳號預設維持啟用，不要求舊帳號立即補 Email，不修改密碼雜湊、角色或遊戲綁定，也不清空既有 Session。新註冊帳號須驗證 Email。因舊表的申請狀態只有 pending／approved／rejected，新一般帳號以 rejected 表示沒有待審申請，前端改為中性的一般會員說明；使用者明確提出後才變成 pending。

`membership.manage migrate` 先使用 SQLite backup API 建立不可覆寫的 0600 備份，再執行可重複的加欄位／建表遷移，核對既有身分資料、Session 數量與綁定，檢查 integrity／foreign keys。沒有完成顯式 Migration，V2 不會啟動。

隔離資料庫已實測重複遷移、備份與還原。正式切換仍須先停寫、重新備份再執行；這一步本次未執行。還原須保留失敗版本、使用匹配金鑰並注意切換後寫入的損失。**啟用 2FA 後不能直接切回不驗證第二因素的舊後端。** 優先回退前端、保留 V2 驗證，或暫停登入／管理路由後修復。

## 5. Google、CAPTCHA 與密鑰

Google 驗證 RS256 簽章、issuer、audience、期限、sub、email_verified、nonce／azp；state 單次使用並綁定原 Session，PKCE verifier 由後端保存且加密。只接受經 Google 驗證的消費者 Gmail，並將 Gmail 點號、加號與 googlemail 別名正規化，防止重複綁定。未配置 OAuth 時停用功能。

手動設定：Google Auth Platform 建立 Web application OAuth client、設定 `warmycat.com` 授權網域，測試期加入測試使用者，redirect URI 精確設定為 `https://rangerbook-auth.warmycat.com/auth/google/callback`。將 ID、Secret 放入後端受限環境；不放在 Pages。完整步驟與 Google 官方文件連結見 `membership/README.md`。

Turnstile 需建立限制網站主機名稱的 Managed widget。後端驗證 success、hostname、action=register；密鑰缺漏或服務失敗時拒絕註冊。site key 可公開，secret 僅留後端。正式金鑰與實際瀏覽器驗收本次未完成。

TOTP／outbox 的 Fernet 金鑰由後端環境供應，不設預設值；金鑰需獨立備份與限制權限。不把密碼、Session Token、TOTP Secret 或恢復碼放入 localStorage。

## 6. SES、IAM、DNS 與監控

孟買 SES 已有 Production Access、網域／DKIM 驗證成功；BOUNCE／COMPLAINT 帳戶抑制已啟用。本次讀取時沒有 Configuration Set，EC2 instance profile 只有 SSM 政策，沒有寄信權限。

實作加密持久 outbox、租約、防併發、最多五次退避重試、寄件失敗不向前端暴露 AWS 錯誤、寄信總量上限及過期連結丟棄。worker 以 instance role 取得權限，不用長期 Access Key。成功／抑制後清除郵件 payload。需建立 Configuration Set → SNS → 受限 SQS 回饋，worker 處理 Bounce／Complaint 並記錄抑制。SNS topic envelope 需符合設定；沒有未驗證的公開 webhook。

已執行 IAM Policy Autopilot；產生的是含 wildcard 的**待縮限基準**，不是可直接上正式環境的最小權限政策，沒有套用。上線前須限制專用寄件身分／Configuration Set、FromAddress 與回饋佇列，移除未使用的 KMS／template 權限，完成 simulation 與受控寄信。README 有可重現命令，另有 worker systemd service／timer 範本。

DNS 查得 Gandi 的既有收信 MX 與 SPF，沒有 DMARC TXT 回覆；本次完全未改 DNS。建議先規劃 DMARC 監測與對齊驗證。若使用 SES custom MAIL FROM，使用專用子網域的 MX／SPF，不覆蓋 Gandi 根網域收信，不建立第二筆根網域 SPF。實際寄信、回饋佇列及 Gandi 收信回歸尚待核准設定後驗收。

## 7. 2FA 與救援安全

TOTP 使用標準 30 秒、六位碼、SHA-1，驗證相鄰時間窗並以原子更新阻止同一步數重放；已驗證 RFC 6238 SHA-1 測試向量。Secret 以 Fernet 加密；每組十個高熵恢復碼，只儲存 SHA-256 雜湊並僅顯示一次，使用時原子刪除。驗證嘗試有帳號與 IP 限制。

最大管理員初次以原密碼登入後只進入安全設定流程，需再次輸入密碼並完成 TOTP 才取得完整 Session。啟用與登入第二步後輪替 Cookie；原受限 Session 被撤銷。super_admin 不能從設定停用 2FA。

Google 綁定／更換／解除、恢復碼再生與停用 2FA 需近期重新驗證。密碼重設連結約十五分鐘、單次使用，資料庫只以雜湊作為可兌換 Token 索引，發送內容另以加密 outbox 保存。重設後撤銷所有 Session，保留 2FA 並排入安全通知。

忘記密碼不依帳號存在與否改變訊息；個別寄信超限也保持通用回覆，另有 IP 全域上限。Token 置於 URL fragment，專用頁先清除網址，再載入程式；不載入 GA 或網站主程式，使用 no-referrer，Token 只在 POST body 傳送。SW 排除所有帳號／驗證／個人頁與外站 API。

人工 2FA 恢復只能由具伺服器存取權的操作者，在站外確認身分、留存核准單及備份後執行。它保留密碼／角色、撤銷所有 Session、記錄操作者／工單；最大管理員仍需重新註冊第二因素。沒有公開免驗證的重設 2FA API。

## 8. 測試結果

| 驗證 | 結果 |
| --- | --- |
| Python 公開核心＋EC2 原始碼隔離整合 | 41 passed：9 核心＋32 實際來源整合，無跳過 |
| 會員 UI | 四語系 × 深淺色 × 390／1440 寬，共 16 組通過 |
| 原密碼／管理帳號操作 | 四語系通過，含失敗登出、成功登出與臨時密碼流程 |
| 原管理工作區 | guest／user／admin／super_admin 四種角色通過 |
| 側邊欄 | 八種角色／頁面情境通過 |
| 隊伍分析資料模型與總覽 | 原合成 A～F、分類計數與邊界規則通過 |
| 隊伍分析瀏覽器回歸 | 四語系通過，沿用原分析模型與互動 |
| 私人隊伍檢視版型契約 | 七項通過 |
| PWA 合約與 worker | 安裝／更新、完整性、離線、私密排除、快取配額等通過 |
| Pages 打包、安全邊界、i18n 合約、JS 語法 | 通過 |
| Release 準備 | 已以 EC2 原始碼快照建立新版本目錄並檢查來源語法 |

整合測試涵蓋角色越權、帳號降權／過期／撤銷、A 不能使用 B 的 candidate／綁定／隊伍、完整合成玩家交換驗證及七種隊伍匯入、Email 啟用、CAPTCHA 後端拒絕、重寄限流、Google state／nonce／audience／重複綁定、TOTP 正確／錯誤／過期／重放、恢復碼、重設密碼單次／過期與保留 2FA、CSRF／SQL 輸入、前端文字 XSS 與敏感資料快取。未對真實帳號或正式遊戲端點執行這些操作。

未完成：真 Google 授權、真 Turnstile、真 SES／退信客訴、完整新版本在預備服務埠運作、真實操作者 2FA 初始綁定、iOS／Android 實機驗證。公開 CI 只能跑公開核心與 UI，私有來源整合仍須在部署環境重跑。此交付不能代替獨立的專業滲透測試。

## 9. 相容性與合併判斷

前端會員 API 與新註冊流程依賴 V2 後端，不能先把新前端合併發布到尚未啟用 V2 的正式服務。既有匿名查詢及隊伍分析計算邏輯保留；PWA 建置會產生新版本，仍遵循原更新同意機制。

現有 super_admin 的舊 Cookie 在 V2 下不會直接得到管理權限，但可透過原密碼與重新驗證進行首次綁定；沒有刪除舊帳號或修改密碼。部署前須確保操作者在場、金鑰與備份可用並演練人工恢復。無法成功完成這些前置條件時不得切換服務。

結論：**目前可審查與進行隔離／預備環境驗收，尚不可合併正式部署。** PR 維持 Draft；第三方真實驗收、最小權限政策、監控、正式遷移與部署均需要後續明確核准。

## 10. 變更檔案與交接文件

新頁面：`personal-teams/index.html`、`account/index.html`、`account-action/index.html`。

會員後端：`membership/__init__.py`、`schema.py`、`service.py`、`manage.py`、`prepare.py`、`mail_worker.py`、`requirements.txt`、`config.example`、`README.md`、`rangerbook-member-mail.service.in`、`rangerbook-member-mail.timer.in`。

新前端：`assets/js/member-page.js`、`member-action.js`、`member-registration.js`。既有整合：`admin/index.html`、`assets/js/admin-auth.js`、`admin-page.js`、`admin-personal-teams.js`、`pvp-player-search.js`、`site.js`、`assets/css/admin.css`、`sidebar-drawer.css`、`assets/locales/sitewide-overrides.json`。

建置：`assets/pwa/service-worker.js`、`scripts/build-pwa.mjs`、`scripts/package-pages.mjs`、`pwa-data.json`、`sw.js`、`.gitignore`、`.github/workflows/validate-security.yml`。

測試：新增 `tests/test_membership_core.py`、`test_membership_v2.py`、`member-browser.cjs`、`local-static-fixture.cjs`；更新 `admin-workspace-ui.cjs`、`site-sidebar-ui.cjs`、`security-browser.cjs`、`security-pages.mjs`、`team-analysis-model.cjs`、`pwa-contract.cjs` 以追隨搬移後的入口與安全需求。

本報告：`docs/member-security-v2-20261022.md`。部署、備份回復、Google／Turnstile／SES／IAM 及人工恢復詳細命令見 `membership/README.md`。
