# 第 5 步：真人驗收準備

本目錄包含隔離測試部署設定。第 4 步的合成資料庫保留，真人驗收使用全新的 `acceptance/`；正式帳號、Session、Google 綁定與遊戲資料不可複製。正式認證服務不停止、不重新載入；新增獨立測試 vhost 時，Nginx 經語法驗證後 graceful reload。

2026-10-23 已完成準備驗證：本機後端 47 項測試通過；產生 47 頁獨立 artifact；4 個會員／登入頁面的實際瀏覽器測試確認正式認證 API 請求、GA 請求與 Service Worker 註冊均為 0。6 份候選設定已寫入 EC2 的 `acceptance-preparation/`，Nginx 以臨時測試憑證及獨立 config 通過 `nginx -t`，未修改或重新載入既有 config。第 4 步 commit `63065388` 的 9 個 CI 工作流程均已通過；本次新增 commit 的 CI 需另外確認。

後續實際進度：站長已完成 DNS／provider console 設定並同意僅寄送到指定信箱、最多 5 封。測試 HTTPS 憑證取得，入口加上 Basic Auth，未登入回傳 401；正式站及正式 API 健康檢查仍為 200。三種角色的合成帳號、受限備份與 migration 已完成。站長補齊 `client_id`／`client_secret` 與 `site_key`／`secret_key` 後，API 成功啟動，Google／註冊功能開關可用。機密內容沒有回傳給維護代理。真實 HTTPS 的會員、管理員、未完成 2FA 最大管理員權限、CSRF 拒絕及登出預檢均通過；第三方真人流程仍需逐項驗收。

新增郵件總額度測試後，核心與私有整合測試共 49 項通過。另修正管理員列表在 i18n ready 之前渲染的競態；四語系實際瀏覽器回歸通過。`145a1904` 的 9 個 CI 工作流程全部通過；後續修正仍須檢查各自最新 CI。

真人註冊發現 mail worker 在處理 outbox 前，因為嘗試解析與寄信無關的 Google 機密而停止，SES 呼叫為 0。修正測試 mail unit，直接使用 EC2 instance role 與受限本機加密金鑰啟動 worker，不依賴 Google／Turnstile provider。`systemd-analyze verify` 與實際 oneshot 均成功，第一筆未過期驗證信已由 SES 接受，outbox 為 sent，持久化額度為 1/5；未重建帳號、延長原 token 或繞過驗證。相同 Email 的第二次註冊維持通用回應，不建立重複帳號。收件、連結驗證與 OAuth／TOTP 仍待操作者確認。

## 站長需要完成

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
- `launch.py` 拒絕正式來源、Cookie、資料路徑、未解析機密，或沒有白名單的測試寄信設定。預設 game core 不存在，真人遊戲綁定須另行準備受控來源；不可默默使用正式資料路徑。
- 初始化全新 synthetic user/admin/super_admin，站長透過受限操作設定密碼；備份再 migration，檢查完整性。不可使用正式管理員密碼作測試。
- 使用獨立 systemd unit/venv/loopback port 18765，正式私人資料不可存取；不設定開機啟動。確認第三方功能與 feature flags 後，才提供 HTTPS 入口。
- 在站長明確核准後，測試專用 timer 可於 24 小時驗收窗每 15 秒檢查待寄郵件，以便真人註冊立即收到信。不得啟用正式 mail timer。`RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST` 強制限制實際收件者，空白時停止；`member_stage_mail_budget` 在 SES 呼叫前以交易保留額度，跨 batch／重啟／並行總計最多 5 次發送嘗試，失敗與結果不明的 timeout 也消耗額度。測試模式停用 SDK 自動重送；`mail_ready.py` 在無待寄信、超過期限或用盡額度時跳過。沒有 timer 開機自動啟用，額度不可自動重設。
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
