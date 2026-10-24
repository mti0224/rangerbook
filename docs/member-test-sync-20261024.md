# Rangerbook 測試站同步（2026-10-24）

依站長指示，已將新版帳號介面與相容後端同步到 **https://rangerbook-test.warmycat.com/**。應用程式版本為 `e13db3520dfdfa39a3bb82d9254964a8969fa0c7`，切換完成時間為 **2026-10-24 10:47:37 台灣時間**（02:47:37 UTC）。本次後續提交只補交付規則與部署紀錄，不變更應用程式；站上的 `deployment.json` 可確認實際應用版本。

## 驗收入口

- [登入](https://rangerbook-test.warmycat.com/login/)
- [註冊](https://rangerbook-test.warmycat.com/register/)
- [隱私權與密碼](https://rangerbook-test.warmycat.com/account/)
- [2FA 設定](https://rangerbook-test.warmycat.com/two-factor/)
- [忘記密碼](https://rangerbook-test.warmycat.com/forgot-password/)
- [個人遊戲隊伍](https://rangerbook-test.warmycat.com/personal-teams/)

沿用原有測試站入口及會員帳密。登入完成回首頁，再由側欄進入會員功能。重設與 Email 驗證仍由信件的 account-action 連結進入。若瀏覽器保留先前已開啟的分頁，重新載入頁面即可。

## 同步及資料保留

- 固定 PR #176 的應用 commit，重新產生 51 頁／105 支腳本的測試 artifact，部署至獨立 web root。新版獨立登入頁確實存在，安全頁包含 `memberSettings`，已非舊版 `memberVerifyForm`。
- 保留既有私有 host app/asgi/security/game-binding，僅更新同一套 membership extension；先切換相容後端，再更新前端。測試 member-navigation 設為 1，一般會員可操作自己的隊伍與安全設定。
- 先備份 SQLite、測試設定、金鑰／入口憑證及私人隊伍；保留舊前後端供回復。沒有重新 bootstrap、重新 migration、重建帳號或還原 DB。
- 切換前後比較 users、game_account_bindings、member_recovery_codes、member_stage_mail_budget 全表摘要，均一致；加密金鑰與入口憑證檔案摘要一致，SQLite integrity_check 為 ok。後續瀏覽器登入／登出只建立及結束當次測試 Session。
- 正式認證服務持續 active、PID 119300 未變；沒有停止／重載正式後端、修改正式會員 DB、合併 main 或發布正式 Pages。Nginx vhost、TLS 與既有同源隊伍 iframe 規則均未更動。
- 測試產物只使用測試 API，保留 no-store、Basic Auth、noindex、no-referrer，停用分析追蹤及 PWA 安裝；後端、設定、機密、測試與文件均不進 web root。

第一次切換時，既有隔離機密解析服務無法供應動態參照，啟動健康檢查失敗；程式與前端自動回復，沒有回復或清空資料庫。重新啟動僅限測試用的機密 provider 後，舊服務恢復健康，再次切換成功。沒有讀取／輸出 Secrets Manager 機密值，也沒有更動正式機密或 IAM。失敗部署與成功部署紀錄均保留。

## 本次實際測試

| 範圍 | 結果 |
| --- | --- |
| 私有後端＋合成 DB 的 core／V2／production 保護測試 | **78/78 通過**；無真實寄信或遊戲呼叫 |
| 實際 HTTPS 的繁中／英／日／泰 × 深淺色 × 390／1440 | **16/16 通過**；逐一開啟登入、註冊、忘記密碼、安全設定與 2FA，確認 Banner、欄位及無水平溢出 |
| 實際 HTTPS 版本／API／外層保護 | 通過：版本符合、member-navigation 開啟；匿名安全／管理／隊伍 API 拒絕、無效 reset Token 拒絕、匿名 cancel 拒絕、無入口憑證為 401 |
| 普通測試會員實際操作 | 通過：帳密登入回首頁、會員側欄、管理項目隱藏、設定先鎖定、密碼 proof 解鎖並回報最多 600 秒、重新載入還原、自己的隊伍 API、登出後側欄更新 |
| 管理員及最大管理員 | 管理員登入與管理頁入口、access-check 成功，users API 仍僅限最大管理員；最大管理員登入進入 MFA，未驗證前管理 API 拒絕。未消耗其 TOTP／恢復碼 |
| 資料及正式服務保留 | 通過：既有資料／金鑰摘要一致、SQLite 完整性正常、正式服務 PID 不變 |

瀏覽器檢查使用實際測試站及原有 synthetic 測試帳號，沒有把 fixture API 當成測試站成功。註冊頁的 Cloudflare 腳本在此次自動化中刻意阻擋，沒有提交註冊、救援郵件或 Google 授權；版面檢查不代表真實第三方 E2E。

本次未寄信，持久化測試郵件預算仍為 **4/5**，原收件白名單、寄送窗與 timer 設定不變。新版 Google 首次／更換／解除、真實 Turnstile、驗證／救援信收取及手機實機 PWA，仍須由站長實際驗收；既有前階段紀錄不冒充本次重測。

## 後續更新及回復

已將「必要測試後同步 rangerbook-test」寫入根目錄 `AGENTS.md` 及 `membership/stage/README.md`，作為後續工作交付規則；只更新 PR 或本機預覽不再算完成。每次固定應用版本、保留測試資料、更新隔離前後端、實測 HTTPS，回報版本與未驗證項目。這不授權自動合併 main、正式發布、擴充郵件額度或延長寄送窗。

本次受限備份及舊程式位於主機 `/home/ubuntu/rangerbook-member-ui-sync-20261024/`；不在公開 web root。若需要回復，僅停止獨立測試服務、恢復 previous-release 及 previous-site、恢復原測試設定，再確認健康與 HTTPS；保留當前 DB 及加密 key，不自動用舊備份覆寫驗收期間新資料。正式切換仍依原 runbook 與站長另行核准。
