# Rangerbook 網站流量系統

## 狀態

本套件包含最高管理員「網站流量」分頁、受 Session 權限保護的 FastAPI 唯讀端點、GA4 資料同步程式、每小時同步的 systemd timer。部署前需確認 **執行 rangerbook-auth 的正確 EC2** 與 Google Analytics 權限。不得部署至不相關的 Discord bot EC2。

## GA4 啟用

1. 到 Google Analytics 管理介面取得數字型 GA4 Property ID（不同於 G- 開頭的 Measurement ID）。
2. 在 Google Cloud 啟用 Google Analytics Data API。
3. 設定有該 GA4 資源 Viewer 權限的服務帳號，推薦 AWS Workload Identity Federation / Google Application Default Credentials；不要把認證檔提交至 GitHub。
4. 正式 EC2 的私有環境變數設定 RANGERBOOK_GA4_PROPERTY_ID、RANGERBOOK_TRAFFIC_CACHE_DIR、ADC 認證資訊。
5. 確定網頁中的 GA4 追蹤碼實際有資料，並正確區分測試流量。

## EC2 部署

在已確認用途的 Rangerbook Auth 主機上：

- 同步 app.py、traffic_collector.py、requirements.txt、service、timer。
- 執行既有虛擬環境 pip install -r requirements.txt。
- 將 rangerbook-traffic.service 與 rangerbook-traffic.timer 放到 /etc/systemd/system，systemctl daemon-reload。
- 先執行 sudo systemctl start rangerbook-traffic.service，確認 exit code、日誌與 7/30/90 天 cache JSON；再執行 sudo systemctl enable --now rangerbook-traffic.timer。
- 重新啟動 rangerbook-auth；GET /super-admin/traffic?days=30 應只有 super_admin 能取得資料，admin/user 應收到 403，未登入收到 401。
- 確保 traffic-cache 僅存在 EC2 私有資料夾，不要發布至 GitHub Pages 的 res/ 或任何公開靜態目錄。

## 監控與故障

同步失敗時原有 JSON 仍保留，但管理員頁面的 updatedAt 會顯示最後成功更新時間。使用 journalctl -u rangerbook-traffic.service 檢查失敗，必要時設定 CloudWatch 告警。

資料為 GA4 聚合統計，更新約每小時一次；不是「此刻在線人數」。未配置時 API 回 status=unconfigured，前端不顯示假數字。
