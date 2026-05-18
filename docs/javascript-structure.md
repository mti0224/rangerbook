# JavaScript 檔案分類與整理計畫

本文件記錄網站目前 `assets/js` 內主要 JavaScript 的用途、分類，以及後續整合方向。

## 1. 全站共用

| 檔案 | 用途 | 狀態 |
|---|---|---|
| `site.js` | 全站 header、導覽列、主題切換、圖片資源 URL 改寫與 fallback。 | 保留，作為全站入口共用檔。 |
| `card-tag-colors.js` | 依照卡片標籤文字套用類型 / 屬性顏色 class。 | 保留，可作為共用 UI helper。 |
| `bottom-pagination.js` | 複製上方分頁列到列表底部，讓使用者不用回到上方切頁。 | 保留，但之後可整合進各列表頁的共用 pagination helper。 |

## 2. Ranger 角色頁

| 檔案 | 用途 | 整理方向 |
|---|---|---|
| `ranger-recovery.js` | Ranger 角色頁主程式：資料載入、搜尋、篩選、分頁、卡片、Modal 詳細資料。 | 保留為主程式。未來可把 detail renderer 合併回此檔或拆成正式模組。 |
| `ranger-advanced-filters.js` | 控制 Ranger 進階篩選區塊展開 / 收合。 | 可保留獨立，或併入 Ranger 主程式。 |
| `ranger-detail-fixes.js` | Ranger 詳細頁後處理修補，包含部分技能 / 才能 / 敘述修補。 | 技術債。應逐步拆分或合併到正式 detail renderer。 |
| `ranger-talent-render-fix.js` | 目前實際處理 Ranger 技能表格、技能前搖、主要才能、強化才能。名稱已不準確。 | 建議改名為 `ranger-detail-table-renderer.js`，再停用舊檔。 |
| `ranger-animation-viewer.js` | 角色動畫播放器，讀取 animation metadata，Canvas 顯示 body 與 projectile。 | 保留獨立，因為功能重、資料大，適合延後載入。 |

## 3. 能力頁

| 檔案 | 用途 | 整理方向 |
|---|---|---|
| `ability.js` | 能力頁主程式：能力資料載入、篩選、卡片、Modal、效果表格。 | 保留為主程式。 |
| `ability-detail-table-fix.js` | 舊的能力效果卡片轉表格修補。 | 若 `ability.js` 已直接輸出表格，之後可移除。 |

## 4. 裝備頁

| 檔案 | 用途 | 整理方向 |
|---|---|---|
| `gear.js` | 裝備頁主程式：裝備資料載入、篩選、分頁、卡片、Modal、基本 / 高級 / Skill+。 | 保留為主程式。 |
| `gear-skillplus-fix.js` | 修正 Skill+ 顯示格式，將 Skill+ 正規化成表格。 | 建議日後合併回 `gear.js`，避免 Modal 被二次修改。 |

## 5. 敵人列表頁

| 檔案 | 用途 | 整理方向 |
|---|---|---|
| `hsEnemy.js` | 敵人列表主程式，可透過各頁的 fetch alias 套用困難關卡 / 降臨 / 迷宮 / 無限之塔敵人資料。 | 保留為共用敵人列表主程式。 |
| `hsEnemy-skill-meta-table.js` | 把敵人技能的發動率 / 冷卻 / 觸發基準文字改成表格。 | 建議日後合併回 `hsEnemy.js`。 |
| `enemy-boss-tag.js` | 共用敵人魔王 / 一般標籤 helper，透過 `data-url` 指定資料來源。 | 新共用檔，取代三個重複 boss-tag 檔。 |
| `infEnemy-boss-tag.js` | 舊無限之塔 boss tag helper。 | 已移除。 |
| `adventEnemy-boss-tag.js` | 舊降臨關卡 boss tag helper。 | 已移除。 |
| `labyrinthEnemy-boss-tag.js` | 舊迷宮 boss tag helper。 | 已移除。 |

## 6. 關卡 / 生產線頁

| 檔案 | 用途 | 整理方向 |
|---|---|---|
| `hs-stage.js` | 困難關卡生產線頁，顯示關卡選擇、敵人生產線、敵人詳細 Modal。 | 保留為主程式。 |
| `endless-stage.js` | 無限之塔生產線頁，顯示樓層選擇、敵人生產線、敵人詳細 Modal。 | 保留為主程式；與 `hs-stage.js` 有大量重複，日後可抽成共用 stage renderer。 |

## 7. 已完成的第一階段整理

- 新增 `enemy-boss-tag.js` 作為共用 boss tag helper。
- `adventEnemy/index.html` 改用 `enemy-boss-tag.js`。
- `labyrinthEnemy/index.html` 改用 `enemy-boss-tag.js`。
- `endless/enemy/index.html` 改用 `enemy-boss-tag.js`。
- 移除舊的 `infEnemy-boss-tag.js`、`adventEnemy-boss-tag.js`、`labyrinthEnemy-boss-tag.js`。

## 8. 建議下一階段

1. 將 `ranger-talent-render-fix.js` 正式改名為 `ranger-detail-table-renderer.js`，並更新 Ranger 頁面引用。
2. 檢查 `ranger-detail-fixes.js` 與新版 detail table renderer 的重複邏輯，逐步移除重複的技能 / 才能修補。
3. 將 `hsEnemy-skill-meta-table.js` 的邏輯合併進 `hsEnemy.js`。
4. 將 `gear-skillplus-fix.js` 的邏輯合併進 `gear.js`。
5. 評估 `hs-stage.js` 與 `endless-stage.js` 的共用 renderer 抽離。
