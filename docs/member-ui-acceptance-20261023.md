# Rangerbook 帳號介面與流程驗收（2026-10-23）

2026-10-24 更新：新版已獲授權同步至 [rangerbook-test](https://rangerbook-test.warmycat.com/login/)，供站長直接操作；實際 HTTPS、資料保留、後端健康及後續同步規則見 [測試站同步報告](member-test-sync-20261024.md)。以下保留原本實作與測試紀錄；正式站仍未發布。

本次沿用 PR #176 的 `codex/member-security-v2`，整合 11 頁 PDF 與最新文字規格，沒有建立第二套帳號系統。PR 保持 Draft，未合併 main、未部署正式網站或後端、未讀寫正式會員 DB、未寄送額外真實郵件。正式認證服務 PID 119300 的活動狀態已於檢查時確認。

補充附件與最初設計稿的 SHA-256 相同：`720cee265c15fa98dc4c7747adb87edbad04f6a45e8603acddf0210b2dca6811`。文字規格優先於示意圖的舊細節：註冊加入一般 Email；忘記密碼不顯示任何實際／遮蔽信箱；Google 更換與解除為分開按鈕；不增加 Google 登入。

## 沿用與補齊

沿用 FastAPI、Argon2、SQLite、HttpOnly Cookie Session、TOTP 加密、單次恢復碼、Turnstile、Google Code + PKCE/OIDC、加密郵件 outbox、SES suppression、權限判斷，以及個人隊伍持有驗證／匯入／解除。保留一般會員、管理員及最大管理員的既有權限與最大管理員強制 2FA。舊 PR #152 與 #176 功能重疊，沒有另行合併 #152。

本次補上：

- 獨立登入、註冊、2FA 設定、忘記密碼頁；既有 account-action 依連結呈現重設密碼或信箱驗證成功頁。所有頁面共用既有 page-title Banner、卡片、字體及主題；新增共用 member.css，沒有每頁複製樣式。
- 登入完成一律到首頁。已啟用 2FA 才顯示第二因素步驟，支持驗證器碼與恢復碼切換；最大管理員未設定因素時保留受限初始設定。
- 側欄「個人頁面」依完整 Session 顯示登入，或個人遊戲隊伍／隱私權與密碼／登出；管理員額外顯示管理頁。一般會員在正式發布後立即可見，不再受管理員試用旗標限制。後端角色與自己的資料檢查仍為真正權限邊界。
- 帳號安全設定以後端有效期鎖定；目前密碼驗證為 600 秒，前端以 mm:ss 顯示，成功後停用驗證欄。重新整理、恢復分頁與切回頁面會讀取後端狀態。未完成 MFA 的 Session 無法靠密碼 proof 取得完整權限。
- 解除 2FA、再生恢復碼、Google 綁定／更換／解除另要求當次有效因素（已啟用時）。不把 10 分鐘前的因素驗證視為本次解除授權。最大管理員仍不可解除 2FA。
- 獨立設定頁顯示步驟、QR、手動金鑰；驗證成功才啟用。可取消待設定資料；恢復碼可複製、下載，離開頁面會清除 DOM 中的 Secret 與恢復碼，不寫入瀏覽器儲存。
- Google 回呼驗證穩定 `sub`、簽章、issuer、audience、nonce、state、PKCE、Session 及 proof；更換成功才以交易寫入。授權交換期間若 Session 被撤銷，最後寫入也會拒絕。接受 Google 已驗證的 Workspace／其他 Google 帳號 Email，保留 Gmail 別名正規化。
- 密碼救援預設使用已驗證的註冊 Email，可選 Google 綁定信箱。兩種選項對所有帳號一律顯示，不公開實際信箱，也不回報是否有該綁定。冷卻內重寄不會立即作廢正在傳送的重設連結。
- 重設前檢查 Token；成功後單次失效、撤銷原 Sessions，保留 2FA／Google／角色。Email 驗證成功不建立登入 Session。
- 共用載入、防重複提交、成功／失敗／網路提示、Retry-After 倒數；修正操作訊息的 CSS 類別與範圍，避免重複舊訊息。動態語系按鈕／標籤同步更新 key。深色主要按鈕文字對比已調整。
- 新的所有帳號頁均納入 Service Worker 私人路由排除；API 使用 credentials + no-store。連結 Token 在任何子資源前從網址移除；帳號頁停用分析追蹤。同一分頁換入另一封驗證連結也會重新處理。

## 主要檔案

| 範圍 | 檔案 |
| --- | --- |
| 新入口 | `login/index.html`、`register/index.html`、`two-factor/index.html`、`forgot-password/index.html` |
| 既有入口 | `account/index.html`、`account-action/index.html`、`personal-teams/index.html`、`admin/index.html` |
| 控制與回饋 | `assets/js/member-ui.js`、`member-login.js`、`member-page.js`、`member-action.js`、既有 `member-registration.js` |
| 共用整合 | `assets/js/site.js`、`admin-auth.js`、`admin-page.js`、`assets/css/member.css`、`sidebar-drawer.css`、`assets/locales/sitewide-overrides.json` |
| 後端 | `membership/service.py`；既有私有 app/asgi/security/game-binding 原始碼未提交至公開儲存庫 |
| PWA／打包 | `assets/pwa/service-worker.js`、`scripts/build-pwa.mjs`、`package-pages.mjs`、衍生 `sw.js`／`pwa-data.json` |
| 預覽／測試 | `scripts/member-preview.mjs`、`tests/member-browser.cjs`、`test_membership_v2.py`、既有安全／側欄／PWA／隊伍合約檢查、security workflow |

`build-pwa.mjs` 另排除 `_site/`，避免先打包再建置時把輸出重複納入 release。membership、docs、tests、preview script 均不進 Pages artifact。

## API 差異

| API | 本次變更 |
| --- | --- |
| `POST /auth/reauth` | 密碼 proof 600 秒；不提升待 MFA 的權限；驗證欄不需再次消耗因素 |
| `GET /auth/security` | 仍回傳後端實際剩餘秒數與限流時間，供還原與倒數 |
| `POST /auth/2fa/disable` | 本次請求必須帶 `{code}`，有效 TOTP 或未用恢復碼 |
| `POST /auth/2fa/recovery-codes` | 本次請求帶 `{code}`，再生前驗證因素 |
| `POST /auth/2fa/cancel` | 新增：刪除目前 Session 的待設定資料，不啟用因素 |
| `POST /auth/google/start`、`unlink` | JSON `{code}`；無 2FA 時可為空字串。回呼寫入前重查 Session/proof |
| `POST /auth/password/forgot` | `{identifier: 帳號名稱, source: registration 或 google}`，預設 registration；一致通用回應 |
| `POST /auth/password/reset/check` | 新增：驗證連結後才開啟輸入表單，不消耗 Token |
| 其他 | 註冊／Email 驗證、2FA 啟用／登入、密碼更新／重設、個人隊伍沿用既有 API |

這些契約須先更新後端再發布新前端。舊測試入口不應直接指向新版後端並假設舊的無 body 解除 API 仍有效。

## 已執行測試及界線

| 類別 | 測試範圍 | 結果 |
| --- | --- | --- |
| EC2 隔離整合 | 真正既有私有後端程式、合成 SQLite／帳號／隊伍；無真實寄信與遊戲呼叫 | **78／78 通過** |
| 註冊／信箱 | 一般 Email、錯誤格式、重複帳號／Email、未驗證登入拒絕、重寄限流、過期與單次驗證、驗證後重新登入 | 通過（隔離 API） |
| 登入／2FA | 有／無因素、錯碼／過期／重播、恢復碼首用成功與重複拒絕、最大管理員初始設定、待驗證權限隔離 | 通過（隔離 API） |
| 敏感設定 | 未 proof 拒絕、600 秒及過期、取消待設定、當次因素解除／恢復碼再生、限流冷卻後重試、錯誤目前密碼 | 通過（隔離 API） |
| Google | RS256/OIDC、PKCE、錯誤 state／nonce／audience／未驗證 Email、重複身分、首次／更換／取消保留舊值、解除、回呼期間撤銷 Session | 通過（簽章與 HTTP provider 替身，非真實 Google E2E） |
| 救援／Session | 註冊 Email／Google 兩來源、不可信信箱不寄、不存在帳號一致回應、15 分鐘／單次 Token、撤銷舊 Session、保留並要求 2FA | 通過（隔離 API／outbox 替身） |
| 資料／權限 | 重複加法式 Migration、0600 備份還原、會員／管理員／最大管理員、即時降權、自己的隊伍七類模式與跨帳號隔離、UID 解除清除 | 通過（隔離 API） |
| 四語系畫面 | 繁中／英／日／泰 × 深／淺 × 390／1440，實際 Chromium 操作與提交按鈕對比 | **16／16 通過**（EC2 獨立 Chromium，所有 API／provider 為 fixture） |
| 公開核心 | 核心／部署保護 33 項、四語系完整性 4 項、Pages 邊界、auth no-store／真實登出狀態 | 通過 |
| PWA | manifest／release hashes／private bypass／多分頁更新同意／離線與容量等 worker 測試 | 通過；實際瀏覽器回歸另由 PR CI 執行 |
| 一般網站回歸 | 18 項 UI 合約、隊伍分析 A–F 計算與翻譯；公開頁／流量／側欄／PvP／公會戰 | 本機合約通過，完整 PR CI 最後核對 |
| 預覽伺服器 | 127.0.0.1 綁定、CSP 僅同源、私有檔 404、正式 API 改寫、停用 PWA、合成 MFA／proof | 通過（實際 HTTP smoke） |

本次首次回歸發現並修正 SQLite proof 的巢狀寫入鎖問題；未降低限流。瀏覽器也驗出同分頁 Token 導覽、回饋樣式與動態語系標籤問題，均已修正再測。

**未驗證／需人工確認：**

- 本次新版的真實 Google 首次／更換／解除授權與正式 callback/audience；舊版 PR 曾通過真人首次綁定，不能代替本次新流程。
- 本次新版的真實 Turnstile、註冊驗證／兩種救援地址的 SES 收信、垃圾郵件及收件端認證。前階段累計 4 封核准測試信的證據保留，本次沒有增加寄信額度或使用剩餘名額。唯讀重查 SES 顯示 ProductionAccessEnabled／SendingEnabled 為 true，warmycat.com 可寄送且 DKIM 狀態 SUCCESS；這不等於本次已完成收信驗證。
- iOS／Android 實機安裝 PWA、實際郵件 App 開啟連結與跨應用返回。
- 正式最大管理員的陪同 2FA 設定、切換時新的 DB 備份／Migration／真實流量、Gandi 收信及加密金鑰異地還原。

這些未驗證項目不以 mocked provider、合成信箱或 CI 通過替代。

## 安全預覽與重製

在此功能分支執行：

```sh
node scripts/member-preview.mjs
```

開啟 `http://127.0.0.1:4175/login/`。可用 demo、demo2fa、admin、super；密碼任意示範字串，驗證碼 `123456` 或示範恢復碼 `PREVIEW-RECOVERY`。畫面頂端會標示合成預覽；請勿輸入真實帳密。Google、QR 與郵件均為明確標示的本機替身，不能用來判定外部服務成功。預覽僅綁定本機回送介面，CSP 阻擋外部連線，沒有公開部署網址。

可直接查看 `/register/`、`/forgot-password/`、`/account-action/#verify=` 加任意長示範字串，或 `#reset=`。真正安全與權限驗證請使用測試套件，不以此視覺預覽替代。

```sh
python3 -m pytest -q tests/test_membership_core.py tests/test_membership_production.py
node scripts/build-pwa.mjs
node tests/security-pages.mjs
node tests/security-auth.cjs
node tests/pwa-contract.cjs
node tests/pwa-worker.cjs
node tests/member-browser.cjs
RANGERBOOK_LEGACY_SOURCE=/private/read-only/source python3 -m pytest -q tests/test_membership_v2.py
```

Browser 測試需安裝 Playwright 與 Chromium；所有 provider/API 請求均由 fixture 攔截。私有後端整合測試若沒有 source 會明確 skip，不能算通過。

## 資料庫、環境與正式切換

本次 UI 增量不新增資料表或欄位。第一次啟用 V2 仍須執行既有 migration version 2（加法式、保留舊會員／角色／密碼／UID 綁定），不能清空或重建 DB。現行會員的相容狀態與隊伍路徑保持原方案；新註冊帳號只有 Email 驗證成功才會啟用。

新增環境變數：無。沿用私有 Fernet key、Google／Turnstile、SES/outbox 等既有設定。production runtime 候選的 member navigation 設為 1，與發布後開放一般會員一致；候選仍受核准 hold 阻擋，沒有安裝或啟動。現有伺服器的舊候選 release 尚未用本次版本重製，不能拿先前 preflight 成績當作新版部署驗證。

正式發布前清單：

1. 站長先驗收本次新版介面與完整流程，另行授權後端／DB／Pages 發布；本 PR 不自動合併。
2. 再核對最新 main、PR head、所有必要 CI，重新建立獨立候選並重跑 preflight。main 的資料發布持續更新，合併時保留最新 `res/v2/resources.json`。
3. 完成金鑰異地加密保存與還原；保留當前 release、Nginx／unit 設定及 SSM 救援方式。
4. 在核准維護窗暫停寫入／worker，建立新的 0600 SQLite backup、完整性檢查後執行 migration；檢查帳號／角色／綁定完整保留。
5. 後端先更新，維持原 Cookie／來源與私人隊伍路徑、OAuth callback 日誌保護。核對信箱／因素／會員／管理員權限及正式最大管理員初始 2FA。
6. 後端驗收成功後才合併前端；main push 會發布 Pages。驗證四語系、PWA 更新、一般會員入口、私人資料不快取。
7. 只有在另有明確授權、feedback 單一 consumer 與監控就緒時，啟用正式郵件 worker。完成真實 Google、Turnstile、兩類收信及實機流程驗收。

回復方案：優先回退前端或暫停敏感功能，同時保留已啟用的 V2 因素驗證。**帳號已有 2FA 後不可回退到忽略第二因素的舊後端。** DB 如需還原，先停寫、保留失敗現況、確認備份與匹配 key，再還原到新檔；任何丟棄切換後資料的還原需另行核准。
