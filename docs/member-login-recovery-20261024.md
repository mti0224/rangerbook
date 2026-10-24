# 中斷 2FA 後恢復登入與測試入口隔離（2026-10-24）

應用版本 `7e9ab9e0536bb4bace430d94311ace7302788e4b` 已於 **2026-10-24 20:01 台灣時間**同步至 https://rangerbook-test.warmycat.com/login/ 。PR #176 維持 Draft，未合併 main，未切換正式前後端。後續測試、文件及 IAM 範本提交不改變此應用版本。

## 問題與行為

使用者在密碼驗證後離開 2FA，伺服器仍正確保留尚未完成的登入，但原畫面缺少結束此狀態的操作，側欄也不顯示登出，因此不能重新輸入其他帳號。現在 MFA 卡片提供四語系「取消並使用其他帳號」：呼叫既有 `/auth/logout`，成功撤銷目前 Cookie 對應的 pending Session 後，清空上一個登入／因素輸入、恢復數字驗證模式並回到帳密表單。取消不需要提交空的 TOTP 表單；網路失敗保留原狀態及可見錯誤，可重試。其他裝置的 Session 不受此取消影響，密碼、TOTP、恢復碼與 Google 綁定均保留。

側欄允許未完成 MFA／初始 2FA／強制改密碼的登入使用登出；個人與管理入口依舊要求完整授權。驗證過期時重新取得伺服器狀態並回到帳密表單，顯示翻譯後的逾時訊息。清除前端因素冷卻不修改伺服器限流；舊倒數也不會覆寫取消失敗的錯誤提示。一般尚未登入的初次載入保留使用者輸入及自動填寫。

對入口提示的實際線路檢查確認兩層驗證：Nginx 入口未授權回傳 401＋Basic challenge，會員 API 未登入原本回傳 401 JSON。無法在操作者原生瀏覽器完整重現每一次 entrance 跳窗；此次採用測試專屬的 HTTP 層隔離，避免會員驗證失敗被當成入口驗證失敗。ASGI transport 將應用 401 轉為線路 403＋`X-Rangerbook-Auth-Status: 401`，去掉應用的 challenge，保留 JSON、Cookie、Retry-After 與 no-store。只有測試旗標且 API 與頁面同來源時，前端才還原會員錯誤語意；沒有改成成功回應，也不授予權限。

**初次開啟、使用新瀏覽器或入口憑證失效時，entrance 提示仍屬預期保護。** Nginx 入口、密碼、正式 API 與正式啟動流程均未改動。

## 修改檔案

| 範圍 | 檔案與用途 |
| --- | --- |
| 登入／共用回饋 | `assets/js/member-login.js`、`member-ui.js`：取消、過期、清空舊因素狀態與回饋倒數 |
| Session UI | `assets/js/site.js`：pending 狀態可登出；`admin-auth.js`：僅測試同來源還原線路 401 語意 |
| 畫面與詞庫 | `login/index.html`、`assets/locales/sitewide-overrides.json`：取消按鈕與四語系 |
| 隔離後端 | 新增 `membership/stage/http_transport.py`；`launch.py` 使用隔離 factory |
| 隔離 artifact／PWA | `membership/stage/build-site.mjs` 注入測試旗標；`sw.js` 更新 app hash，私人快取規則不變 |
| 自動測試 | `tests/member-browser.cjs`、`member-stage-browser.cjs`、`security-auth.cjs`、`test_membership_core.py`、`test_membership_v2.py`；新增受限操作者工具 `tests/member-hosted-login-recovery.cjs` |
| IAM 與交付文件 | `membership/aws/runtime-policy.json`、`membership/aws/README.md`、`membership/stage/README.md` 與本報告 |

沒有 schema migration，沒有重寫或取代既有 Session 系統。登出沿用後端來源驗證與 current-token-only 撤銷。

## 已執行測試

| 測試 | 結果 |
| --- | --- |
| 公開核心／正式適配 pytest | **38 passed**，含 transport 401／非401／body／Cookie／no-store／lifespan／環境限制 |
| 真實舊後端來源＋隔離 DB 整合 | **46 passed**，含 pending 登出後舊 Cookie 拒絕、切換帳號、保留同帳號另一裝置與其他帳號 Session，以及原角色／密碼／TOTP／救援安全案例 |
| 本機會員瀏覽器 | 四語系、深淺色、390／768／1440／1920 **32/32**，含取消失敗重試、取消清空恢復碼／倒數、過期恢復、側欄結束登入、原帳號流程 |
| 隔離 iframe | **32/32**，七種隊伍、分析、嵌入限制、無正式 API／GA／PWA |
| 其他回歸 | 四語系安全瀏覽器、25/25 Game-Tech／私人版型合約、4/4 詞庫覆蓋、公開邊界及 Pages／PWA 合約通過 |
| 應用版本 GitHub Actions | **9/9 success**；文件／測試後續提交另追蹤 |
| 實際測試站 HTTPS | 四語系手機390 **4/4**，使用受限檔案中的既有合成 super_admin／user，實際密碼登入、pending 權限拒絕、重載／跨頁、空因素取消、Cookie 移除、舊 Cookie 重放拒絕、切換其他帳號及登出 |
| 入口與錯誤回應 | 未提供入口憑證的 `/login/`、`/auth/me` 仍 401＋challenge；有入口憑證的會員錯誤／錯誤密碼回傳 403＋原狀態 metadata，無 challenge，瀏覽器顯示原翻譯錯誤 |

後端合計 **84 項**；既有 Starlette／HTTPX 相容性棄用警告保留，沒有測試失敗。真人 `warmycat_test` 的密碼與 2FA 沒有讀取或修改，操作者仍需用自己的原生瀏覽器重新確認跳窗不再於會員操作時出現。此次沒有提交 TOTP、使用恢復碼、寄信，亦無 Google 或真實遊戲供應者呼叫；既有真人安全驗收見前階段報告。

## 機密快取更新與 IAM 修正

同步過程曾因既有機密 provider 在快取更新時缺少 `secretsmanager:DescribeSecret` 而失敗；其 `/ping` 仍會回傳正常，所以單靠健康探測不足。已在主機上只輸出錯誤類型／去敏後訊息確認 AccessDenied，沒有直接讀取秘密值。先恢復舊測試程式及隔離 provider，正式服務未受影響。

在既有授權的 `EC2-SSM-Role`／`RangerbookMembershipRuntimeV2` 中，僅對原 Google OAuth、Turnstile 兩筆 exact ARN 增加 `DescribeSecret`；原 `GetSecretValue`、寄信／queue／trust 範圍均不變。符合 [AWS provider 必要權限](https://docs.aws.amazon.com/secretsmanager/latest/userguide/workload-credentials-provider.html)。先備份舊政策，再 Access Analyzer 驗證零 findings、更新及讀回比對；新增三組 custom-policy simulation：兩筆允許、無關秘密 implicitDeny。

部署工具在停止正常 auth **之前**，以服務帳號與既有環境透過 `asm-exec` 啟動無副作用子程序，驗證環境／Fernet key，秘密僅存在子程序內，僅回傳成功狀態。預檢失敗直接停止同步，保持原服務。另一次 hosted 測試因手機側欄未展開而檢查逾時，已回復程式、修正測試並完整重跑；未以移除驗證或放寬斷言處理。所有失敗回復均未還原資料庫。

## 部署、保留及回復

固定應用 commit，驗證來源與隔離 artifact SHA-256，備份後更新 **7 個測試公開檔案及 2 個隔離後端檔案**，只重啟獨立 `rangerbook-membership-test`。hosted 驗收通過後比對 users／綁定／恢復碼／郵件預算資料摘要、私人隊伍、runtime／key／入口憑證檔案，均保留；SQLite integrity=ok。郵件仍 **4/5**，未延長寄信窗。

正式 `rangerbook-auth` PID 維持 190922，正式網站與 auth health 皆 200。正式 unit、Nginx 設定／入口摘要不變，Nginx 及 provider PID 在最終同步期間未改變；測試 auth 健康正常。此次 IAM 有上述最小讀取補充，不宣稱所有 AWS 設定完全未改動。

受限目錄：`/home/ubuntu/rangerbook-member-login-recovery-20261024-7e9ab9e0-final/`。其中 `backup/` 含 0600 SQLite 備份、設定／憑證與私人隊伍及原後端程式；`previous-site/` 是舊前端；`result.json` 為不含機密的實測紀錄。IAM 舊政策位於 `/home/ubuntu/rangerbook-member-login-recovery-iam-20261024/RangerbookMembershipRuntimeV2.before.json`。

必要時將測試 web root 換回 `previous-site`，從 backup 還原舊 `membership/stage/launch.py`、移除本次新增 transport，再重啟及檢查測試 auth；**不得自動還原 DB**。機密快取權限補充應保留，直接移回舊政策會重現更新失敗。正式最大管理員、會員、Session、資料庫與網站沒有切換。正式發布、原生行動裝置與站長完整介面驗收仍待後續核准／操作。
