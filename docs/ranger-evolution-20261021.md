# 角色進化階段

官方 V2 原始 `unit.json` 確認有三個明確目標欄位：`unitCodeAfterEvolution`、`unitCodeAfterTranscendence`、`unitCodeAfterHyper`。2026-10-21 快照 SHA-256：`992bccf2077ea316fec9672f108ff8c84af7ed6379ce213b3d43d893205626ab`。

站內 2,306 隻角色共有 1,688 筆進化連結，涉及 1,274 個起點；所有目標均存在。僅沿官方連結建立雙向可探索的角色群，顯示時保留原始單向進化目標；不按名字或 ID 猜測。例：8 星牡羊座兔兔分成究極／超進化，兩者均可進化為 9 星黃金牡羊座兔兔。貝拉路線包含 1 星原始角色、2／3／4 星及究極 4 星。

角色詳細頁及排名頁視窗皆在基本數值下、技能上加入進化階段。卡片顯示圖示、官方語系名稱、星數、目前角色及可進化目標，點擊可開啟詳細資料；無其他階段時顯示官方無其他資料，載入失敗則明確顯示暫時無法載入。繁中／英／泰／日四語完整支援。卡片可於手機單欄呈現。

## 資料更新

`assets/data/ranger-evolution.json` 是直接由官方原始資料投影的公開關聯快照，已納入 PWA 發行清單，支援現有發布器。

`deploy/aws/v2/ranger-evolution.patch` 是供獨立 V2 後端套用的最小增量，只增加 `evolutionTargets`，現有 schema 允許此附加欄位。以記憶體中的候選編譯器跑官方原始資料，確認 2,306 筆既有輸出完全相同，另增加 1,688 筆有效目標。此次未修改正式後端檔案；後續按既有備份、候選驗證、發布流程套用此 patch。後端完成後，前端自動優先使用每次官方更新內嵌的 `evolutionTargets`，不再請求舊快照。

快照亦可用下列命令重建（不使用 V1 資料）：

```sh
python3 scripts/export-ranger-evolution.py --units /path/to/official/unit.json --rangers res/v2/rangers.json --source-date 2026-10-21 --output assets/data/ranger-evolution.json
```

## 驗證

- `node tests/ranger-evolution.cjs`：全資料目標、分支、反向探索、無關同名角色不混入、內嵌資料優先、循環及失敗顯示。
- `tests/sitewide-localization.cjs`：四語介面、區塊位置、四階段分支、目前角色、實際跳轉及排名頁視窗；375px 手機版卡片不超出視窗。
- 全語系詞條覆蓋與前端語法檢查。
