# LRpvprank

LINE Rangers 傳奇段位 PvP 角色使用率統計頁面。

這個專案會在瀏覽器中抓取：

- `https://rangers.lerico.net/api/v2/translate?keys=zh:UNIT`
- `https://rangers.lerico.net/api/getRangersBasics`
- `https://rangers.lerico.net/api/v2/pvp/league/rank/{league}`
- `https://rangers.lerico.net/api/getPlayer/{mid}`

並統計指定段位玩家隊伍中的角色出現次數，輸出：

- 前 10 名玩家角色使用率
- 前 50 名玩家角色使用率
- 前 100 名玩家角色使用率
- 全段位資料
- Discord 公告格式文字

## 使用方式

直接開啟 `index.html` 即可。

若要部署到 GitHub Pages：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<你的帳號>/LRpvprank.git
git push -u origin main
```

接著到 GitHub repository：

`Settings` → `Pages` → `Deploy from a branch` → 選擇 `main / root`

## 注意事項

因為需要依序讀取玩家資料，前 100 名玩家可能需要一段時間才會完成。
如果 API 有 CORS 限制，請改用本地伺服器開啟：

```bash
python3 -m http.server 8000
```

然後打開：

```text
http://localhost:8000
```
