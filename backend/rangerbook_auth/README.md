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

把本資料夾所有 Python 模組、`requirements.txt` 與 `.env` 放到 `/home/ubuntu/rangerbook-auth/`。

## 建立唯一的最大管理者

```bash
cd /home/ubuntu/rangerbook-auth
source venv/bin/activate
RANGERBOOK_AUTH_DB=/home/ubuntu/rangerbook-private/auth/rangerbook_auth.db python bootstrap_super_admin.py warmycat
```

程式會在終端機安全詢問密碼與確認密碼，不需要把明文密碼寫入檔案或 shell history。

資料庫預設位置：

```text
/home/ubuntu/rangerbook-auth/rangerbook_auth.db
```

開發時可透過 `RANGERBOOK_AUTH_DB` 修改。正式 systemd 服務最後載入 root 擁有的 `/etc/rangerbook-auth-paths.env`，將資料庫與玩家快取放在 `/home/ubuntu/rangerbook-private/auth/`；直接執行維護指令時也必須指定相同路徑。

升級既有服務時，先停止服務，以 SQLite backup API 複製既有資料庫到新路徑，並將既有 `player_lookup_cache.json` 複製過去；確認檔案屬於服務使用者、權限 `0600` 後再啟動。不得建立空資料庫來取代既有資料。程式、虛擬環境及 `.env` 對服務唯讀，僅私有資料目錄允許寫入。

## systemd

```bash
sudo install -d -o ubuntu -g ubuntu -m 700 /home/ubuntu/rangerbook-private/auth
sudo install -o root -g root -m 644 security-paths.env.example /etc/rangerbook-auth-paths.env
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


## 最大管理者：玩家隊伍查詢

玩家索引與最新查詢結果只保留在 EC2 私有路徑，不能放到公開的 `/var/www/rangerbook-pvp`。玩家索引由公會戰資料涵蓋「傳奇～黃金」所有段位；公會排名公開資料仍只維持網站實際顯示的段位：

```text
/home/ubuntu/rangerbook-data/player_index.json
/home/ubuntu/rangerbook-private/auth/player_lookup_cache.json
```

API：

```text
GET  /super-admin/player-search?q={name}&limit=30
POST /super-admin/player-team-query
```

兩個端點都由 `require_super_admin` 驗證。搜尋只讀取玩家索引；只有 POST 查詢指定 UID 時才會呼叫 LINE Rangers `/player/units/team/equip/uid/{UID}`，並將最新結果覆蓋寫入 `player_lookup_cache.json`。

前端入口：`/pvp/search/`。只有 `super_admin` 在 PvP 中繼頁面會看到「查詢玩家隊伍」入口；直接存取頁面時也會再次檢查權限。

Auth v1.2.0 會使用既有 Guild War collector 作為遊戲 API core，預設路徑為：

```text
/home/ubuntu/rangerbook-scripts/collect_guildwar_usage.py
```

可選環境變數：

```text
RANGERBOOK_GUILDWAR_CORE=/home/ubuntu/rangerbook-scripts/collect_guildwar_usage.py
RANGERBOOK_PLAYER_INDEX=/home/ubuntu/rangerbook-data/player_index.json
RANGERBOOK_PLAYER_QUERY_CACHE=/home/ubuntu/rangerbook-private/auth/player_lookup_cache.json
```


## 安全保護與驗證

- 登入、註冊、密碼變更、解除遊戲綁定與官方玩家查詢會記錄操作嘗試並限流；失敗嘗試也計入，Argon2 雜湊同時最多兩個。反向代理必須覆寫 `X-Forwarded-For`，且 Uvicorn 只信任 localhost 代理。
- 重設密碼每次產生獨立隨機值、撤銷既有 session，登入後必須先改密碼才能使用管理端點。一般使用者也能修改自己的密碼。
- 私有 API 回應禁止快取；驗證錯誤不回傳輸入值；非預期錯誤不回傳路徑或上游訊息。請求本文最多 16 KiB，包含串流本文。正式 API 不公開互動文件。
- 部署 Pages 時只上傳 `scripts/package-pages.mjs` 產生的 `_site/`，禁止將儲存庫根目錄當成網站產物。
- `python -m unittest discover -s backend/rangerbook_auth/tests -p 'test_*.py'`、`node tests/security-pages.mjs`、`node tests/security-auth.cjs` 與 `node tests/security-browser.cjs` 驗證權限及前端流程；瀏覽器測試使用隔離的假帳號與攔截 API。
- `pip-audit` 檢查實際安裝版本，維護時同時更新安裝工具 pip。不得將套件檢查通過解讀為不存在其他安全問題。
