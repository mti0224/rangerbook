# 第 6 步：正式切換審核單（2026-10-23）

狀態：**獨立候選 release 與合成資料演練已完成；正式設定、備份、Migration、服務切換及 PR 合併尚未執行。** 本文件不是部署核准。原任務明確要求正式切換與合併前取得站長同意。

## 已執行的準備

- 從 EC2 正在部署的私有程式重新建立 `/home/ubuntu/rangerbook-member-candidate-20261023/release`，沒有把私有後端提交到公開儲存庫。9 個原始檔 SHA-256 均與本機整合測試使用的快照相符。
- 使用已真人驗收的會員程式候選 `8ccbdbe2`，在候選目錄建立獨立 venv，將測試站已安裝版本固定到受限的 `requirements.lock` 後安裝；`pip check` 通過。
- 以新建的合成資料庫及獨立 TLS／loopback port 18766 執行 `tests/member-release-smoke.py`：**10/10 通過**。包括加法式／重複 Migration、0600 備份、未設定功能安全關閉、一般會員權限、立即降權、強制初始 2FA、恢復碼登入、登出撤銷，以及升級前備份還原登入。
- 演練 HTTP 程序已停止；郵件與遊戲連線停用。沒有讀取或遷移正式 DB，沒有複製正式環境檔、生成正式金鑰、安裝 systemd unit、啟動正式 secret provider 或變更正式認證服務。
- 私有候選目錄與演練資料限制權限，不在 web root。候選不是測試站 release 的連結，後續不得依賴測試入口繼續運作。

## 已讀取確認、正式切換必須保留的設定

| 項目 | 現況／切換要求 |
| --- | --- |
| AWS | Mumbai `ap-south-1`，既有 `EC2-SSM-Role`；不建立長期 Access Key |
| systemd | `rangerbook-auth.service`，使用者 ubuntu，現行工作目錄 `/home/ubuntu/rangerbook-auth` |
| DB | `/home/ubuntu/rangerbook-private/auth/rangerbook_auth.db`；核准前不讀取會員資料、不遷移 |
| Cookie | `__Host-rangerbook_session`，維持 Secure／HttpOnly 及原 Cookie 行為 |
| API 允許來源與前端 | `https://rangerbook.warmycat.com` |
| 私人隊伍 | 原環境沒有覆寫，既有程式預設 `/home/ubuntu/rangerbook-private/teams`；正式設定應明確保留 |
| Google callback | `https://rangerbook-auth.warmycat.com/auth/google/callback`，須由站長核對 Google Console 精確 URI 及 pilot 測試使用者名單 |
| Turnstile | 正式 hostname 需核對；正式瀏覽器 acceptance 在切換後執行 |
| 原設定 | 保留原環境檔中的其他遊戲／快取／流量設定，僅在主機內合併；不可輸出值或複製至 Git |
| 導覽 | 一般會員導航保持未開放；此設定不取代後端 API 權限 |

## 正式設定還需完成的具體工作

1. **獨立 secrets provider**：使用固定版本的官方 binary 與 wrapper，放在正式候選管理路徑。正式 provider 可選 loopback 2774，與測試 provider 的 2773 分離。已檢查 wrapper 支援 `AWS_SECRETS_MANAGER_AGENT_ENDPOINT`；正式 runtime 設為 `http://127.0.0.1:2774`。複用已驗證的安全設定：log level NONE、SSRF header／隨機 token、instance profile、兩筆 exact secret IAM。正式 unit 與 readiness 檢查尚未安裝或驗證，不能直接把測試 unit 換名視為完成。
2. **獨立加密金鑰與恢復保管**：在主機產生正式 Fernet key 及 provider SSRF token，直接寫入非公開 0600 檔，不印出；金鑰另行備份。不得使用測試 key。尚未產生正式 key，避免未完成保管即開始寫入加密資料。
3. **正式 API unit 與 Nginx diff**：保留既有環境、loopback 8765、代理 IP 正規化及 request limit；新 release 用 `--no-access-log`。正式 Nginx 精確 callback location 必須禁止 access log，其他安全路由也不可記錄 query／body。先產生可審查 diff、驗證 unit 與 `nginx -t`，取得核准後才安裝／reload。不得將測試入口的 Basic Auth 或受限路徑帶入正式設定。
4. **郵件與 feedback**：正式 mail worker 預設停用，不依賴 OAuth secret provider；僅由 instance role、DB 及正式 Fernet key 啟動。核對專用 SQS queue 的單一 consumer、SNS envelope 驗證、outbox 失敗監控與 suppression。沒有 simulator／正式使用者寄信授權，不擴大測試收件者或重設 4/5 額度。
5. **外部與實機剩餘檢查**：Google 正式 URI／audience、Turnstile 正式 hostname、Gandi 收信與 DKIM 對齊、iOS／Android PWA。DMARC 如需新增另供 DNS diff 審查，不覆寫 Gandi MX 或新增第二筆根 SPF。真人未逐項比對每個 Ranger／裝備數值，詳見驗收報告。

## 核准後的執行順序與停止條件

1. 再讀取 main／PR head，記錄核准版本與必要 CI。此次 main `95da0374` 相較已整合的 `9e3fa3ba` 多 38 筆自動發布，淨差異只在 `res/v2/resources.json`；合併時保留 main 最新資料。自動更新會持續，這個快照不能取代合併當下檢查。
2. 確認 SSM 人工救援可用、獨立 key 備份完成、正式 unit／Nginx diff 已審查；保留舊 release 與設定副本。未完成任一項即停止，不進行 DB 變更。
3. 在核准維護窗停止正式寫入及 worker，使用 SQLite backup API 建立新的 0600 備份，再執行 `membership.manage migrate`。重複執行、完整性及舊帳號／角色／Session／綁定保留核對須成功；失敗則不啟動新服務。
4. 啟動 V2 後端，確認原 Cookie／來源正常、一般會員 API 隔離、管理員與最大管理員權限、未完成 MFA 的限制。陪同正式最大管理員完成初始 2FA，保留可稽核人工恢復通道；未通過則不發布前端。
5. **後端通過後**才合併 PR #176。main push 自動觸發 Pages，合併就是前端發布，不能先合併等待後端。驗證公開頁、舊登入、四語系、PWA 更新及私人回應不快取。
6. 只有在另有明確寄信授權、feedback consumer 與監控就緒時，啟用正式 mail worker／timer。觀察 API、outbox、抑制及稽核；測試入口的撤除另按站長安排執行。

核准範圍應明確列出 DB 備份／Migration、服務與 Nginx 變更、前端合併及寄信；原本最多 5 封指定測試信的同意不代表正式寄信授權。

## 回復界線

- 首選保留 V2 後端的第二因素限制，回退前端或暫停受保護功能後修正。**帳號啟用 2FA 後不能重新啟動忽略第二因素的舊後端。**
- 若需還原 DB，先停止所有寫入、保留失敗現況，再從完整性已驗證的備份還原到新檔並核對匹配 key。丟棄切換後資料需要另外核准；不可把升級前舊帳號狀態當作安全的 2FA 降級方式。
- 本次合成演練的升級前還原登入，只證明備份可還原；不代表已有正式 2FA 使用者時可直接回退舊驗證邏輯。

目前可審查候選與切換計畫。正式配置未完成驗證且未獲切換核准，PR 維持 Draft，不建議立即合併。
