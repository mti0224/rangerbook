# Rangerbook 公開儲存庫工作規則

- 專案：`mti0224/rangerbook`。此處僅維護網站程式、必要的測試資料和公開資訊。
- **私人工作紀錄庫**：`mti0224/rangerbook-ops-records`（Private）。更新時，詳細 Markdown/JSON 交付紀錄、資安稽核、實際部署/備份位置、故障處理及內部配置應保存到該私有庫；不得再新增 `docs/` 內部紀錄。
- 本庫需要的固定測試 JSON 位於 `tests/fixtures/`；網站使用的 `res/`、`assets/` 等資料仍留此庫。不可因搬遷紀錄而更動正式遊戲資料。
- 任何公開發布之前均需完成相關測試。會員介面相關調整通常先同步隔離測試站供驗收；**不要把歷史文件視為未來的永久部署授權**，實際合併/正式部署依最新的使用者指示。
- 禁止提交真實密碼、Access Key、OAuth Client Secret、Cookie、TOTP Secret、資料庫備份、私人玩家資料、完整 .env 或憑證。私有紀錄庫也不可當作存放有效密鑰的地方。
