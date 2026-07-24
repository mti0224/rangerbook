# Rangerbook Auth API

Rangerbook 管理員登入、註冊、權限審核後端。前端預設呼叫：

`https://rangerbook-auth.warmycat.com`

## 權限

- `super_admin`：最大管理者。只能在伺服器端 bootstrap 建立，不能透過 Web API 升級取得。
- `admin`：可使用目前 Rangerbook 的管理員檢視權限。
- `user`：一般註冊帳號，不具管理員權限。

管理員申請狀態：`pending` / `approved` / `rejected`。

## 安全設計

- 密碼使用 Argon2id 雜湊，不儲存明文密碼。
- 登入 session 使用高熵隨機 token；SQLite 只儲存 token 的 SHA-256 摘要。
- 瀏覽器 session 使用 `Secure`、`HttpOnly`、`SameSite=Lax` 的 `__Host-` Cookie。
- 所有會修改資料的 API 都檢查 `Origin`。
- 權限由後端 API 驗證；不能再用 `localStorage.setItem("rangerbook-admin-mode", "true")` 取得管理員權限。

## EC2 安裝

```bash
sudo mkdir -p /home/ubuntu/rangerbook-auth
sudo chown -R ubuntu:ubuntu /home/ubuntu/rangerbook-auth
cd /home/ubuntu/rangerbook-auth

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
```

把本資料夾的 `app.py`、`bootstrap_super_admin.py`、`requirements.txt` 與 `.env` 放到 `/home/ubuntu/rangerbook-auth/`。

## 建立唯一的最大管理者

```bash
cd /home/ubuntu/rangerbook-auth
source venv/bin/activate
python bootstrap_super_admin.py warmycat
```

程式會在終端機安全詢問密碼與確認密碼，不需要把明文密碼寫入檔案或 shell history。

資料庫預設位置：

```text
/home/ubuntu/rangerbook-auth/rangerbook_auth.db
```

可透過 `.env` 的 `RANGERBOOK_AUTH_DB` 修改。

## systemd

```bash
sudo cp rangerbook-auth.service /etc/systemd/system/rangerbook-auth.service
sudo systemctl daemon-reload
sudo systemctl enable --now rangerbook-auth
sudo systemctl status rangerbook-auth
```

本機測試：

```bash
curl http://127.0.0.1:8765/health
```

預期：

```json
{"status":"ok"}
```

## Nginx / DNS / HTTPS

1. 建立 DNS：`rangerbook-auth.warmycat.com` 指向 EC2 公網 IP。
2. 將 `nginx-rangerbook-auth.conf` 放入 Nginx site 設定並啟用。
3. 先確認 HTTP 反向代理正常，再用現有的 HTTPS/Certbot 流程替此子網域簽 TLS 憑證。
4. HTTPS 完成前，`Secure` session cookie 不會在正式瀏覽器流程正常工作，因此不要以純 HTTP 上線登入系統。

目前正式 EC2 部署已驗證：systemd 常駐、`/health`、HTTPS、Let's Encrypt 續期模擬、註冊、登入、`super_admin` 核准、`admin` 權限檢查、撤銷後既有 session 立即失效皆正常。

## API

公開：

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me
GET  /health
```

最大管理者：

```text
GET  /admin/applications
POST /admin/applications/{user_id}/approve
POST /admin/applications/{user_id}/reject
GET  /admin/users
POST /admin/users/{user_id}/revoke
```

管理員權限測試：

```text
GET /admin/access-check
```

## 公開資料與 Admin 顯示

Rangerbook 的 `ability`、`gear` 等完整資料可繼續存在公開的 `res/*.json`。目前 admin 權限的目的，是控制網站介面是否顯示特定隱藏、測試或未公開項目，而不是把這些 JSON 當成真正的秘密資料。

真正需要保護且只存在後端的內容包含：帳號、密碼雜湊、session、角色權限、管理員申請與審核操作。未來若新增修改資料、刪除資料、上傳檔案或其他管理寫入功能，相關 API 必須繼續由後端 `admin` / `super_admin` 權限保護。
