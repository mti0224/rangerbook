# 第 6 步：正式切換審核單（2026-10-23）

狀態：**獨立候選 release、正式設定候選檔、機密載入、受限金鑰備份及切換前自動化驗證已完成；正式 DB 備份／Migration、服務切換及 PR 合併未執行。** 站長最新指示為「先完成切換以外的步驟，等待介面示意圖，介面修改完成後再合併切換」。因此保留介面待完成標記，不請求提前切換，也不把 CI 通過視為部署授權。

## 已執行的準備

- 從 EC2 正在部署的私有程式重新建立 `/home/ubuntu/rangerbook-member-candidate-20261023/release`，沒有把私有後端提交到公開儲存庫。9 個原始檔 SHA-256 均與本機整合測試使用的快照相符。
- 使用已真人驗收的會員程式候選 `8ccbdbe2`，在候選目錄建立獨立 venv，將測試站已安裝版本固定到受限的 `requirements.lock` 後安裝；`pip check` 通過。
- 以新建的合成資料庫及獨立 TLS／loopback port 18766 執行 `tests/member-release-smoke.py`：**10/10 通過**。包括加法式／重複 Migration、0600 備份、未設定功能安全關閉、一般會員權限、立即降權、強制初始 2FA、恢復碼登入、登出撤銷，以及升級前備份還原登入。
- 演練 HTTP 程序已停止；郵件與遊戲連線停用。沒有讀取或遷移正式 DB，沒有複製正式環境檔、安裝 systemd unit 或變更正式認證服務。
- 私有候選目錄與演練資料限制權限，不在 web root。候選不是測試站 release 的連結，後續不得依賴測試入口繼續運作。
- 新增 `membership/production/`：可重製候選設定、啟動前檢查、受限金鑰備份、API／provider／mail／health unit 與 timer。EC2 已產生 `review/` 及可審查的 Nginx／systemd diff；候選檔全部未安裝。
- 產生獨立 Fernet key 與 provider token，分開寫入 0600 環境檔。金鑰副本 root-owned 0400，已實測加密／備份解密，並確認與測試 key 不同。副本仍在同一 EC2 volume，不能宣稱已有異地災難復原。
- 本機核心＋私有後端＋部署保護共 **67/67**；新增部署保護在 EC2 **10/10**。EC2 實際獨立 provider／Nginx preflight 再 **11/11**：unit 驗證、未核准拒絕啟動、asm-exec 解析機密、完整 Nginx 語法、callback 的 access log 與含授權碼的 upstream error 均不落盤（含真實合成 502）、其他 access log 排除請求內容、代理 IP 正規化、原 16k body limit、正式 PID／設定未改、health 200。
- Provider 僅暫時在 loopback 2774 啟動；asm-exec 將機密傳給僅檢查設定的子程序，沒有匯入正式 app 或讀取正式 DB。測完停止；2774、18767、18768 均已關閉。沒有額外郵件、沒有領取或刪除 feedback 事件。
- Pages 實際打包及公開邊界檢查通過：`membership/`、`docs/`、`tests/` 不進 web artifact。介面程式本次未更動。

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

## 正式設定候選與保留條件

1. **獨立 secrets provider 已備妥並實測**：固定版本官方 binary 與 wrapper 位於候選自己的 `bin/`；endpoint 為 `http://127.0.0.1:2774`，與測試 2773 分離。log level NONE、SSRF token、instance profile 與兩筆 exact secret IAM 維持。正式 unit 保持未安裝，程序不常駐。
2. **獨立金鑰與本機受限備份已備妥**：`review/key.env` 只含 Fernet key，`provider.env` 只含 SSRF token。受限副本在 `/home/ubuntu/rangerbook-private/membership-key-backups/candidate-20261023/member-key.env`。正式寫入加密資料前仍須選定站長控制的加密異地保存位置並驗證還原；本次沒有擅自匯出金鑰或新增備份 IAM 權限。
3. **API unit／Nginx diff 已產生並驗證**：保留既有兩份環境檔、8765、Cookie／來源、私人資料路徑、hardening、IP 正規化與 request limit；Uvicorn 使用 `--no-access-log`。HTTP／HTTPS 存取日誌都使用不含 URI、query、body、Referer、Cookie 的格式；精確 OAuth callback 停寫 access log，並將該 location 的 error log 導向 /dev/null，防止 upstream 錯誤夾帶 query；可用性由安全狀態碼日誌／健康檢查觀察。完整候選 `nginx -t` 及獨立 dummy upstream 功能測試通過，未 reload 正式設定。
4. **郵件與監控已準備，保持停用**：worker 不解析 OAuth 機密，mail flag=0，另有獨立寄信核准標記；健康檢查用 SQLite `mode=ro` 輸出聚合計數，對失敗或逾時待寄工作回傳非零。unit／timer 已驗證但未啟用，沒有建立外部通知訂閱或宣稱 CloudWatch alarm 已運作。SES Production Access／identity／DKIM、BOUNCE+COMPLAINT suppression、七種事件 destination、SNS→SQS 訂閱與 SSE-SQS 均重新讀取確認；queue 當時 9 筆可見／0 筆不可見，未領取刪除。單一 consumer 必須在正式啟動時再確認。
5. **外部與實機剩餘檢查明列，不阻擋等待介面**：Google 正式 URI／audience、Turnstile 正式 hostname 沿用站長設定，正式站瀏覽器 smoke 隨未來切換執行。Gandi 實際收信、收件端 DKIM 對齊、iOS／Android 實機及真人未逐項比對的隊伍數值仍屬人工驗收。Bounce／Complaint simulator 沒有寄信授權，保持隔離替身測試。DNS 重查 Gandi MX 存在、根 SPF 只有一筆、DMARC 仍無記錄；未改 DNS。

可供日後審查的 DMARC 初始候選為 `_dmarc` TXT `v=DMARC1; p=none; adkim=r; aspf=r`，不含未核准的報告收件者，亦不會提供彙總報告。需報告時由站長指定並確認可收信的 rua 地址後再增補；本次不套用 DNS、不調整 Gandi MX／SPF，也不直接改為隔離或拒收政策。

## 等待介面期間

`INTERFACE_PENDING` 存在，`CUTOVER_APPROVED`／`MAIL_APPROVED` 均不存在。所有候選 service 都有啟動前 hold 檢查；這是操作防誤用措施，不能取代後端權限。正式 DB 備份與 Migration 留到核准維護窗，避免把目前快照誤當切換當下備份。等站長提供示意圖後才修改介面；完成介面後重新建置候選、確認 main 變更並重跑相關驗收，最後才安排合併與切換。

重製指令、檔案用途及監控限制見 [production 操作文件](../membership/production/README.md)。

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

目前切換前可自動完成的候選與驗證已完成；異地金鑰保存、外部／實機人工確認及維護窗工作仍依上述界線保留。站長正在設計介面，PR 維持 Draft；不提前合併或切換。
