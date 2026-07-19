# PvP 資料更新器

此目錄負責產生網站公開使用的 PvP JSON：

- `res/pvp/leaderboard.json`：LEGEND 玩家排名與分數
- `res/pvp/usage.json`：LEGEND PvP 防守隊伍角色使用率

認證資料不會寫入上述 JSON。

## 私密檔案位置

正式伺服器預設使用：

```text
/home/ubuntu/rangerbook-secrets/latest_LF_AC.txt
/home/ubuntu/rangerbook-secrets/pvp_config.json
```

`latest_LF_AC.txt` 只放 LF_AC 本體。

`pvp_config.json`：

```json
{
  "uid": "ACCOUNT_UID",
  "udid": "DEVICE_UDID"
}
```

建議權限：

```bash
sudo mkdir -p /home/ubuntu/rangerbook-secrets
sudo chown ubuntu:ubuntu /home/ubuntu/rangerbook-secrets
chmod 700 /home/ubuntu/rangerbook-secrets
chmod 600 /home/ubuntu/rangerbook-secrets/latest_LF_AC.txt
chmod 600 /home/ubuntu/rangerbook-secrets/pvp_config.json
```

不要把 LF_AC、完整 Cookie、UDID 設定檔提交到 GitHub。

## 手動執行

只更新玩家排行榜：

```bash
cd /home/ubuntu/rangerbook
python3 scripts/pvp/update_pvp_data.py --mode leaderboard
```

更新排行榜並重新統計角色使用率：

```bash
cd /home/ubuntu/rangerbook
python3 scripts/pvp/update_pvp_data.py --mode full
```

也可透過環境變數覆寫：

```text
RANGER_PVP_UID
RANGER_PVP_UDID
RANGER_LF_AC_FILE
RANGER_PVP_CONFIG
```

## 使用率定義

資料來源為每位排行榜玩家的：

```text
result.playerUnitTeamGroupMap.pvpteam
```

同時支援：

- `{"1": [...], "2": [...]}` 巢狀格式
- 平坦 list 格式

每位玩家的兩組 PvP 防守隊伍會合併計算；同一角色即使在同一玩家資料中重複出現，`playerCount` 只增加一次，但 `appearanceCount` 會保留實際出現次數。

```text
usageRate = playerCount / sampleCount * 100%
```

`sampleCount` 只包含成功取得且能解析出 PvP 防守隊伍的玩家。

## 自動更新

repo 內提供：

```text
deploy/systemd/rangerbook-pvp-leaderboard.service
deploy/systemd/rangerbook-pvp-leaderboard.timer
deploy/systemd/rangerbook-pvp-usage.service
deploy/systemd/rangerbook-pvp-usage.timer
```

安裝：

```bash
sudo cp deploy/systemd/rangerbook-pvp-* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rangerbook-pvp-leaderboard.timer
sudo systemctl enable --now rangerbook-pvp-usage.timer
```

排程：

- Leaderboard：每 5 分鐘
- Usage：每小時第 2 分鐘執行一次完整更新，避免與整點 leaderboard 更新正面重疊

檢查：

```bash
systemctl list-timers | grep rangerbook-pvp
sudo systemctl status rangerbook-pvp-leaderboard.timer
sudo systemctl status rangerbook-pvp-usage.timer
```

查看最近執行紀錄：

```bash
journalctl -u rangerbook-pvp-leaderboard.service -n 100 --no-pager
journalctl -u rangerbook-pvp-usage.service -n 100 --no-pager
```

## LF_AC 失效

`401` 或 `403` 會讓更新器以 exit code `3` 結束，不會自動替換 LF_AC，也不會把認證資訊寫到公開輸出。

排行榜服務使用目前的 `latest_LF_AC.txt`；這與 LF_AC 壽命實驗應維持為兩套獨立流程。
