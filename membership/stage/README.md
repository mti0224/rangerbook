# 第 5 步：真人驗收準備

## 四語系信件與本次寄信續期（2026-10-24）

站長另行核准24小時與總額度20次；已套用至 **2026-10-25 21:28:46 台灣時間**，保留已用4次及原白名單。應用版本 `80ca6282fef985886c525392a8a2603bf78fccd5` 於21:25同步，21:28完成續期與一封繁中重設信，SES接受，當時累計5/20、剩15；後續操作仍會使用同一累計計數，不會自動續期。

驗證／重設信依站長原文完成四語系、HTML及純文字；前端傳送網站語言，後端填入帳號名稱。worker跳過被取代／過期Token而不扣額度，readiness與worker共用 `RANGERBOOK_STAGE_MAIL_MAX_ATTEMPTS=20` 及核准期限；範本仍預設5。寄信暫停時忘記密碼頁顯示全站狀態，不洩漏帳號存在與否。

118項後端、四語系互動4/4、信件版面16/16及實際HTTPS替身4/4通過；三封舊失效重設信抑制未寄，真人2FA／身份及正式服務保留。[信件全文](../../docs/member-email-copy-20261024.md)／[寄送、測試與回復報告](../../docs/member-mail-refresh-20261024.md)。以下5封／舊期限數字為先前階段歷史，不代表本次的新核准。

## 2FA 成功後的登入階段修正（2026-10-24）

應用版本 `3b640fcb450e45561c568b677e82daeae4f280ad` 已於台灣時間 **20:50** 同步前後端。後端依真正未完成的限制回報狀態，不再將「TOTP 已綁定」誤報為「仍需 MFA」；必要改密碼者會顯示單一改密碼表單與明確提示，成功後回首頁，正常 2FA 直接回首頁。未完成因素或必要改密碼的個人／管理 API 仍拒絕，真人旗標未直接更改。

後端94項、四語系會員畫面32/32、管理安全4/4及實際 HTTPS 替身畫面32/32通過。測試資料／設定／金鑰與郵件額度保留，正式服務未切換。[原因、驗證界線及備份／回復紀錄](../../docs/member-login-completion-20261024.md)。後續文件提交不改變部署版本。

## 登入中斷、切換帳號與入口提示修正（2026-10-24）

應用版本 `7e9ab9e0536bb4bace430d94311ace7302788e4b` 已於台灣時間 **20:01** 同步測試前後端。MFA 頁面新增「取消並使用其他帳號」，只有後端撤銷目前 pending Session 成功後才回到帳密表單；側欄亦可結束未完成的登入，過期驗證可重新登入。四語系實際 HTTPS 取消、舊 Cookie 重放拒絕及切換帳號 **4/4** 通過。

隔離啟動器使用 `http_transport:create_app --factory`，將會員 API 的 401 以 403 加 `X-Rangerbook-Auth-Status: 401` 傳送，測試前端限定同來源還原其語意；權限、Cookie、回應內容及限流不變。Nginx 入口仍是受保護的 401 Basic，正式服務不用此轉換。新增同來源 stage-bootstrap flag，維持 no-store、無正式 API／GA／PWA。

同步前除了 `/ping`，必須以既有 `asm-exec` 在服務帳號／環境內執行無副作用子程序，確認機密已動態解析且 `launch.validate` 與 Fernet key 格式有效；只回傳成功狀態，禁止輸出環境值。預檢失敗不得停止目前正常的測試 auth。Provider 的 IAM 必須同時允許兩筆 exact ARN 的 `GetSecretValue` 與 `DescribeSecret`，缺少後者會在快取更新時失敗。此次已備份並補齊既有政策，未增加資源範圍。

本機後端 84 項、會員畫面 32 組、iframe 32 組及應用 CI 9/9 通過；實際檢查保留身份／2FA／恢復碼／綁定／私人隊伍／金鑰／入口設定，DB integrity=ok，郵件 4/5 不變。正式 auth、Nginx 未重啟，PR 維持 Draft。完整測試、曾遇到的回復與限制見 [登入修正報告](../../docs/member-login-recovery-20261024.md)。後續測試／文件／IAM 範本提交不改變已部署應用版本。

## 隊伍驗證進度文字（2026-10-24）

最新應用版本 `4207dc250d41630358bf8bd17159924fc1bc1caa` 已於台灣時間 18:18 同步，位置交換驗證的提示改為「正在驗證中...」並同步四語系／各詞庫。實際 HTTPS 四語系進度顯示 4/4 通過，既有資料、設定及郵件額度保留，正式服務未切換。[修正與回復紀錄](../../docs/member-verification-copy-20261024.md)。後續文件提交不改變應用版本。

## 「你的隊伍」標題同步（2026-10-24）

最新應用版本 `76b0ee60151c42a5702c635645cc8f40d4752cda` 已於台灣時間 18:01 同步：隊伍檢視區改為「你的隊伍」h3 欄位標題，選單沿用並保留無障礙名稱；四語系完整。本機 32 組真 iframe 與實際 HTTPS 八組檢查通過，身份／設定／私人資料及郵件額度保留。詳見 [標題修正報告](../../docs/member-team-heading-20261024.md)。正式服務未切換，工具／文件後續提交不改變應用版本。

## 綁定後隊伍與安全視窗同步（2026-10-24）

最新應用版本 `9ab89d56a7d6f6f4bb3d807925ad1f9dd3981137` 已於台灣時間 17:41 同步：帳號設定卡片、框內狀態、固定格式匯入時間、隊伍選單整合、綁定後與管理頁寬度、2FA 恢復碼按鈕及四語系詞庫同步。CI 9/9、實際 HTTPS 32/32、八組模擬綁定／因素視窗與三角色操作通過；既有身份／綁定／2FA／私人隊伍、設定及郵件額度保留。完整結果與備份／回復位置見 [綁定後介面修正報告](../../docs/member-bound-ui-20261024.md)。正式服務未切換，後續工具／文件提交不改變應用版本。

## 查詢版型與候選區同步（2026-10-24）

最新應用版本 `58be669cae216a683f19975496d40b3996e46ca6` 已於台灣時間 16:09 同步：七個會員入口沿用資料查詢頁的共用寬度與 Banner，候選區初始隱藏、非空搜尋後才顯示且無重複標題。本機與實際 HTTPS 四語系／外觀／四尺寸各 32/32 通過，三角色操作及資料／金鑰／郵件預算保留。正式服務未切換，完整結果與備份／回復位置見 [查詢版型修正報告](../../docs/member-query-layout-20261024.md)。

## 第二版介面同步（2026-10-24）

已同步應用版本 `72038084feadf74bacc73d5f54fa824f39c39139`：Banner／卡片等寬、登入連結與 MFA 單一卡片、忘記密碼單一卡片、未綁定隊伍分步外框與管理頁重複操作移除。實際 HTTPS 16 組版面及三角色操作通過；身份資料／金鑰／郵件預算保留，前後端程序未重啟。完整結果與前端回復位置見 [第二版修正報告](../../docs/member-ui-refinements-20261024.md)。後續驗收工具／文件提交不改變此應用版本。

## 持續驗收規則（2026-10-24 站長指示）

本次帳號改版及後續功能、介面、流程或 API 更新，通過必要測試後，必須同步到 **https://rangerbook-test.warmycat.com/**，讓站長直接操作驗收；只更新 PR 或本機預覽不算完成。同步測試站已獲授權，不必就相同範圍反覆詢問。此授權不包含合併 main、正式 Pages／認證服務發布、增加寄信額度或延長寄信驗收窗。

- 固定 PR commit，再以 `build-site.mjs` 產生隔離 artifact；契約有變更時一併更新測試後端。不得將新前端接到不相容的舊後端。
- 切換前確認測試來源、Cookie、資料路徑及機密解析服務健康；備份 SQLite、設定與私人隊伍。保留既有測試帳號、Session、Google／2FA、恢復碼、加密金鑰、入口密碼及郵件預算。
- 僅重啟獨立測試服務；檢查健康、HTTPS 版本標記、登入／側欄／安全設定及權限。失敗時回復測試程式與前端，不自動倒回資料庫。正式服務不得停止或重載。
- 測試 web root 的 `deployment.json` 記錄應用程式 commit 與部署 UTC 時間，不含機密；驗收報告以台灣時間說明結果。文件專用提交不影響已部署應用版本。
- 每次交付提供測試網址、版本、實測結果與仍待人工確認的項目；保留 Draft PR 與正式切換 hold。

新版介面已於 2026-10-24 同步，應用版本 `e13db3520dfdfa39a3bb82d9254964a8969fa0c7`。部署紀錄與實測結果見 [測試站同步報告](../../docs/member-test-sync-20261024.md)。以下內容保留前階段操作與真人驗收歷史。

本目錄包含隔離測試部署設定。第 4 步的合成資料庫保留，真人驗收使用全新的 `acceptance/`；正式會員資料庫、Session、Google 綁定與私人隊伍不可複製。公開玩家名稱索引可建立受限測試快照。正式認證服務不停止、不重新載入；新增獨立測試 vhost 時，Nginx 經語法驗證後 graceful reload。

2026-10-23 真人驗收：Turnstile 註冊、Email 驗證與一般會員登入、Google Gmail 綁定、普通會員 TOTP 啟停、密碼重設後撤銷原 Session 且保留 TOTP、最大管理員強制初始設定及新登入 TOTP、恢復碼重新產生與單次使用均已通過。後續個人隊伍綁定、匯入及解除亦完成；解除後綁定／私人檔案／challenge／候選均清除，角色與 TOTP 保留，恢復碼餘 8 筆雜湊、資料庫完整性正常。測試郵件累計 4/5 封。完整證據、測試範圍限制及正式切換順序見 [驗收報告](../../docs/member-acceptance-20261023.md)。

修正了 mail worker 因無關的 Google 機密解析失敗而停止，以及安全操作缺少就近回饋；加入後端驗證有效／限流倒數並保留原安全限額。最新程式 8ccbdbe2 的 9 項 CI 全部通過；本機 57 項後端測試、16 組四語系／外觀／裝置會員畫面、四語系管理員安全及 PWA contract 通過。

個人隊伍另建立受限的遊戲連線副本與公開名稱索引快照；唯讀預檢、真人持有驗證／綁定、匯入及解除均完成。七種隊伍及分析顯示另有瀏覽器回歸；沒有聲稱操作者已逐項比對所有真實 Ranger／裝備數值。正式會員資料庫、Session、綁定及私人隊伍均未複製或變更。

已修正測試帳號 ID 與私人隊伍儲存不相容：新建立帳號使用標準 usr_ 格式；既有 stage- ID 僅在精確隔離路徑內相容，保留綁定、Session 與 2FA，正式環境規則不放寬。匯入測試不再替換 private_path，實際私人檔案讀寫、權限、跨帳號隔離與解除刪除均驗證。最新本機後端 57 項通過，修正版本的 CI 另以 PR head 確認。

個人隊伍匯入後的灰色 iframe 已確認為測試 vhost 全域 X-Frame-Options: DENY 所致。隊伍檢視的兩個網址改用獨立 viewer-headers.conf.in，僅允許同來源嵌入，並保留 no-store、no-referrer、noindex 及 nosniff；其他頁面與 API 維持 DENY。安裝 nginx.conf.in 前，須將此 snippet 放到 /etc/nginx/snippets/rangerbook-membership-test-viewer.conf。Nginx 語法檢查與實際 HTTPS 標頭通過；瀏覽器已測手機／桌面實際 iframe、七種隊伍切換及分析顯示，外來源與其他頁面嵌入均遭拒絕。原匯入紀錄保留，郵件仍 4/5。

## 測試入口設定（已由站長完成）

1. 在管理 `warmycat.com` 的 DNS 平台新增 A 記錄：名稱 `rangerbook-test`，值 `13.206.135.210`，TTL 300。先使用 DNS only。不改既有記錄、MX 或 SPF。AWS Route 53 目前沒有此網域的 hosted zone。
2. 在目前處於 Testing 的 Google OAuth Web client，**新增** redirect URI：`https://rangerbook-test.warmycat.com/auth/google/callback`。保留正式 callback。沿用本次尚未上線的測試 client 與既有測試使用者；不需傳送 Client Secret。這是後端 Code + PKCE 流程，無須新增 JavaScript origin。正式全面開放前可分拆測試 client 與 secret/IAM。
3. 在現有 Turnstile widget 的 Hostname Management **新增** `rangerbook-test.warmycat.com`，保留正式站 hostname、Managed 模式與 pre-clearance 關閉。
4. 指定由本人控制的測試信箱，明確同意最多 5 封測試郵件。沒有這項同意，`RANGERBOOK_MAIL_ENABLED=0`。白名單使用正規化 Email（Gmail 去除點與 +alias），不將地址寫入 GitHub。

## 啟動前由維護者完成

- `node membership/stage/build-site.mjs /fresh/path/outside/repository`，只從 Pages allowlist 產生獨立 artifact；47 頁注入測試設定、替換正式 API 位址、停用 GA 與 PWA 安裝。
- 上傳 artifact 至獨立 web root；私有 release/config/SQLite 不放入 web root。
- DNS 確認後以獨立 ACME webroot 取得測試網域憑證；不可使用會停掉既有 Nginx 的 standalone 模式。準備獨立 vhost，先 `nginx -t`，核准測試入口變更後才 graceful reload。
- 建立 HTTP Basic Auth 外層保護；`bootstrap.py` 在主機產生隨機入口及測試帳號密碼，僅寫入 root-owned 0600 的 `acceptance/operator-credentials.json`，由站長透過互動式 SSM session 查看，不放入訊息、URL、Git 或命令參數。所有測試路由（含 callback）均受保護。
- 複製 `runtime.env.in` 至受限目錄；產生獨立 Fernet key。環境檔模式 0600、目錄 0700。以 dynamic references 與 `asm-exec` 載入機密。已安裝 AWS Workload Credentials Provider 3.1.1（官方 Linux x86-64 binary，SHA-256 `471c1978f8bf63a0aeefb425e974ac3c816c7e04feb302236512eea375160de4`）及官方 `aws/agent-toolkit-for-aws` commit `9ab50636d12510dc351ff02fd7966efa4dba4341` 的 wrapper，僅放在隔離目錄。Provider 限 loopback、使用隨機 SSRF token 與既有 instance role；CloudTrail 已確認讀取權限成功。用秘密名稱及固定孟買區域解析，IAM 仍限原本兩個 exact ARN。
- `launch.py` 拒絕正式來源、Cookie、資料路徑、未解析機密，或沒有白名單的測試寄信設定。預設 game core 不存在；本次真人驗收另於 acceptance/game-acceptance 準備受限副本與私有設定，唯讀連線已成功。不可使用正式會員資料／綁定／私人隊伍路徑，私有原始碼與憑證不得進入公開儲存庫或 web root。
- 初始化全新 synthetic user/admin/super_admin，站長透過受限操作設定密碼；備份再 migration，檢查完整性。不可使用正式管理員密碼作測試。
- 使用獨立 systemd unit/venv/loopback port 18765，正式私人資料不可存取；不設定開機啟動。確認第三方功能與 feature flags 後，才提供 HTTPS 入口。
- 在站長明確核准後，測試專用 timer 可於核准驗收窗每15秒檢查待寄郵件。不得啟用正式mail timer。`RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST` 限定收件者，空白時停止；`member_stage_mail_budget` 在SES呼叫前以交易保留額度，跨batch／重啟／並行遵守 `RANGERBOOK_STAGE_MAIL_MAX_ATTEMPTS`（預設5，本次核准20），失敗與結果不明的timeout也消耗額度。readiness與worker均遵守 `RANGERBOOK_STAGE_EXPIRES_AT`；無待寄信、期限已過或額度用盡時跳過。SDK自動重送、timer開機啟用與額度自動重設均停用。
- mail unit 不解析 OAuth／Turnstile dynamic references；這些功能的暫時失敗不得阻擋驗證信。SES 使用 instance role，Fernet key 由受限 `key.env` 注入，收件者白名單、有效期限與 5 次總額度維持不變。
- 正式 worker 目前未啟動。消費共用 feedback queue 前先確認沒有其他 consumer；不可由測試 consumer 刪除正式寄送事件。若並行寄信已開始，先分離 queue/subscription。

## 真人驗收順序與證據

| 項目 | 操作與通過條件 |
| --- | --- |
| Turnstile／註冊（先執行） | 使用全新普通測試帳號；真實 challenge 驗證與驗證信通過，Email 啟用前不能取得完整權限，沒有自動管理員申請。指定信箱只建立一個帳號。 |
| Google | 使用上一列同一個帳號登入及重新驗證，綁定同一測試 Gmail；後端顯示已驗證信箱。另一測試帳號不能重複綁定；解除須重新驗證。 |
| 救援 | 帳號與 Email 都顯示通用結果；指定信箱收到 fragment link，完成後舊 Session 失效，重用連結失敗。 |
| 2FA | 測試 super_admin 只能先綁定驗證器；輸入正確 TOTP 後才可管理。測試 admin 可啟停；恢復碼顯示一次、單次使用。 |
| 重設＋2FA | 已啟用 2FA 的測試帳號重設密碼後仍須驗證第二因素。 |
| SES | 指定信箱查收及驗證 DKIM；以 MessageId 對照受控回饋，不輸出信件內容。Bounce/Complaint mailbox simulator 需要另行核准。 |

只有實際通過才記錄成功；缺少真實憑證、瀏覽器授權或郵件驗收仍列未完成。最新 CI 另以 PR head 為準。

## 撤除測試入口

停止並移除專用測試 unit/vhost，先測試 Nginx 設定再 reload，移除 Google 額外 callback、Turnstile 額外 hostname 及測試 DNS。測試 DB、key、郵件資料依站長同意保留或刪除；不操作正式路徑。測試入口撤除不等於正式發布核准。
