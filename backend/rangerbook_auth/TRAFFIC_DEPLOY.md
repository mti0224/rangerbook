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

## 已確認正式 EC2 及 GA4 Property

- EC2: `i-05cb332634cb5d0a9`，AWS Sydney（ap-southeast-2）；此主機同時承載 Rangerbook Auth 和扭蛋機器人。
- 已在 **EC2 私有 .env** 寫入用戶提供的 GA4 Property ID `540346392`，並保留現有其他設定與檔案權限。此設定不等於已授權 Google API。
- AWS 執行個體 IAM Role：`arn:aws:iam::010421869571:role/EC2-SSM-Role`。
- 2026-10-10 檢查時 EC2 未有 Google ADC 設定、服務帳號檔案或 `google-analytics-data`，也未部署流量 API。請不要啟動新 Timer，直到完成 Google 授權並驗證首次同步。

## Google Cloud 專案與身分資料（已確認）

- Google Cloud Project ID：`rangerbook-ga4-reader`（**不是** Project Number；IAM principal 必須使用專案數字編號）
- Google 服務帳號：`rangerbook-ga4-reader@rangerbook-ga4-reader.iam.gserviceaccount.com`
- GA4 資源 ID：`540346392`
- AWS 帳戶：`010421869571`，IAM Role：`EC2-SSM-Role`
- AWS EC2：`i-05cb332634cb5d0a9`，使用 **IMDSv2 required**
- Google Workload Identity Pool ID（建議值）：`rangerbook-ec2`
- AWS provider ID（建議值）：`aws-rangerbook`

### 一次性 Google Cloud Shell 初始化

1. 開啟 [Google Cloud Shell](https://console.cloud.google.com/?project=rangerbook-ga4-reader)，選擇 `rangerbook-ga4-reader` 專案，確認登入帳戶有啟用 API、管理 WIF Pool、修改服務帳號 IAM Policy 的權限。
2. 使用 GitHub PR #120 的 `backend/rangerbook_auth/setup_google_wif.sh`，**先閱讀程式碼**，再在 Cloud Shell 執行。此程式只會修改 Google Cloud 專案，不會在 EC2 安裝或啟動任何服務。
3. 指令會自動查詢數字型 Project Number、開啟所需 API、建立 `rangerbook-ec2/aws-rangerbook`、將 AWS 身分限制到**這台 EC2**，並賦予服務帳號 `Workload Identity User`。如果 Pool 已存在會停止，避免不小心信任權限未知的設定。
4. 產生 `rangerbook-ga4-aws-wif.json`：這是供 AWS ADC 使用的 **不含私鑰** 的 External Account Config；使用 `--enable-imdsv2`，符合 EC2 的實際設定。
5. 到 **Google Analytics → 管理 → 資源存取權管理**，把該服務帳號 Email 加到 GA4 資源 `540346392`，角色設為 Viewer。Google Cloud IAM 的 `Workload Identity User` **不能取代** GA4 資源 Viewer。
6. 完成後告知此程式輸出的 `GOOGLE_PROJECT_NUMBER` 與 `GOOGLE_WIF_SETUP=SUCCESS`，不需要提供任何私鑰。後續即可在 AWS 上生成並部署對應的 External Account Config，安裝同步程式後使用實際資料驗證。

注意：使用此 EC2 的 `EC2-SSM-Role` 同時為其他任務提供身分。因此 AWS provider 的 attribute condition 與 service-account IAM principal 都限制到 `i-05cb332634cb5d0a9`，而非讓整個 AWS 帳戶或所有使用該 Role 的實例取得授權。

## 建立無私鑰的 GA4 認證（需在 Google Cloud / GA4 完成）

1. 登入管理這個 GA4 Property 的 Google Cloud 專案，開啟 **Google Analytics Data API**。
2. 建立一個 Google Cloud 服務帳號（例如 `rangerbook-ga4-reader`），記下其 **service account email**；不需要下載 JSON 私鑰。
3. 在 **Google Analytics → 管理 → 資源存取權管理**，把該服務帳號 email 加入 Property `540346392`，授予 **Viewer** 唯讀權限。單純有 Google Cloud IAM 權限不足以讀取 GA4 Property。
4. 在 Google Cloud 的 **Workload Identity Federation** 建立 AWS provider，對應 AWS Account `010421869571`。限制 principal 只允許本主機採用的 `EC2-SSM-Role`，避免讓此帳戶所有 IAM principal 都能取得 Google 身分。
5. 將 provider 的 federation principal 授予上述服務帳號 **Workload Identity User**。在具備 Google Cloud 管理權限的環境，透過 `gcloud iam workload-identity-pools create-cred-config` 產生 AWS external-account credential config。檔案不含私鑰，但仍只存放在 EC2 私有目錄。
6. EC2 私有 `.env` 補入 `GOOGLE_APPLICATION_CREDENTIALS=/home/ubuntu/rangerbook-auth/google-wif-credential-config.json`。確定認證配置的檔案權限僅執行使用者可讀，接著再依上方部署步驟安裝套件、手動驗證同步，最後開啟 Timer。

目前 ChatGPT 可操作的 AWS/GitHub 權限 **不能代替 Google Cloud / GA4 的資源管理員授權**；Google 步驟需要擁有該 GA4 資源權限的帳號執行。

## 2026-10-11 Google Cloud Shell 實測：已建立 Pool/Provider，SA IAM 拒絕

使用者以 `timochien@gmail.com` 執行時，成功建立 `rangerbook-ec2` Pool 和 `aws-rangerbook` Provider，**但** `gcloud iam service-accounts add-iam-policy-binding` 回報 `iam.serviceAccounts.setIamPolicy PERMISSION_DENIED`。GA4 Property `540346392` 已在使用者提供的畫面確認服務帳號擁有 Viewer 權限。Google Cloud 數字型 Project Number **`60763946234`**。

此時**不需要刪除重建已成功的 Pool/Provider**。建議由有管理權限的 Google Cloud 管理員執行最小權限的單一授權：

```bash
gcloud iam service-accounts add-iam-policy-binding \
  rangerbook-ga4-reader@rangerbook-ga4-reader.iam.gserviceaccount.com \
  --project=rangerbook-ga4-reader \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/60763946234/locations/global/workloadIdentityPools/rangerbook-ec2/attribute.aws_ec2_instance/i-05cb332634cb5d0a9"
```

若需要讓 `timochien@gmail.com` 自己執行，請由有權的管理員在**該服務帳號本身**授予其 `roles/iam.serviceAccountAdmin`（或含 `iam.serviceAccounts.setIamPolicy` 的自訂權限）。此權限很高；**優先由現有管理員直接執行上述單一綁定，避免額外授權給日常帳號**。

上述授權成功後，Cloud Shell 可生成無私鑰的 AWS external-account config：

```bash
gcloud iam workload-identity-pools create-cred-config \
 "projects/60763946234/locations/global/workloadIdentityPools/rangerbook-ec2/providers/aws-rangerbook" \
 --service-account="rangerbook-ga4-reader@rangerbook-ga4-reader.iam.gserviceaccount.com" \
 --aws --enable-imdsv2 --output-file="$HOME/rangerbook-ga4-aws-wif.json"
```

`setup_google_wif.sh` 已支援部分成功後安全續跑：會檢查已存在 Pool/Provider 的 account、Role、instance condition 與 mapping，而不再因「已存在」中斷。**但若自己仍沒有服務帳號 IAM 修改權限，重跑仍會在授權那步被拒絕**。

最後須在 **實際 EC2** 裝設並驗證 external-account config，確認 GA4 Data API 可回覆實際數據後，才啟用每小時 Timer。不要在 GitHub 上傳任何 Google Cloud 私鑰或認證檔。
