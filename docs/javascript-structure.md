# JavaScript 檔案分類與整理計畫

本文件記錄網站目前 `assets/js` 內主要 JavaScript 的用途、分類，以及後續整合方向。

## 1. 全站共用

| 檔案 | 用途 | 狀態 |
|---|---|---|
| `site.js` | 全站 header、導覽列、主題切換、圖片資源 URL 改寫與 fallback。 | 保留，作為全站入口共用檔。 |
| `card-tag-colors.js` | 依照卡片標籤文字套用類型 / 屬性顏色 class。 | 保留供其他頁面使用；Ranger 頁已將所需邏輯整合進 `ranger.js`。 |
| `bottom-pagination.js` | 複製上方分頁列到列表底部，讓使用者不用回到上方切頁。 | 保留供其他列表頁使用；Ranger 頁已直接建立上下兩組分頁。 |

## 2. Ranger 角色頁

Ranger 列表、彈出式視窗與獨立詳細頁目前採三檔架構：

| 檔案 | 用途 | 載入方式 |
|---|---|---|
| `site.js` | 全站導覽、主題與圖片資源處理。 | 所有 Ranger 頁面固定載入。 |
| `ranger.js` | Ranger 資料載入、搜尋、進階篩選、上下分頁、卡片、彈出式摘要、獨立詳細頁、技能 / 能力 / 才能表格、標籤顏色、等級滑桿、能力成長與再生產時間計算。 | 所有 Ranger 頁面固定載入。 |
| `ranger-animation-viewer.js` | 角色動畫播放器，讀取 animation metadata，以 Canvas 顯示角色與投射物。 | 只有獨立詳細頁由 `ranger.js` 動態載入。 |

已整合並移除：

- `ranger-animation-gate.js`
- `ranger-recovery.js`
- `ranger-grouped-detail-items.js`
- `ranger-level-slider.js`
- `ranger-advanced-filters.js`
- `ranger-animation-viewer-loader.js`
- `ranger-page-mode.js`

角色列表與彈出式視窗實際載入 2 個 JavaScript；獨立詳細頁因延後載入動畫播放器，合計載入 3 個 JavaScript。

## 3. 能力頁

| 檔案 | 用途 | 整理方向 |
|---|---|---|
| `ability.js` | 能力頁主程式：能力資料載入、篩選、卡片、Modal、效果表格。 | 保留為主程式。 |
| `ability-detail-table-fix.js` | 舊的能力效果卡片轉表格修補。 | 若 `ability.js` 已直接輸出表格，之後可移除。 |

## 4. 裝備頁

| 檔案 | 用途 | 整理方向 |
|---|---|---|
| `gear.js` | 裝備頁主程式：資料載入、搜尋、篩選、分頁、卡片與 Modal 生命週期。 | 保留為主程式。 |
| `gear-detail.js` | 裝備詳細資料、Skill+、Spec+、相似裝備與角色配對。 | 保留為正式詳細資料模組。 |
| `gear-page-mode.js` | 裝備彈出式摘要與獨立詳細頁模式。 | 保留為頁面模式模組。 |

## 5. 敵人列表頁

| 檔案 | 用途 | 整理方向 |
|---|---|---|
| `hsEnemy.js` | 敵人列表主程式，可透過各頁的 fetch alias 套用困難關卡 / 降臨 / 迷宮 / 無限之塔敵人資料。 | 保留為共用敵人列表主程式。 |
| `hsEnemy-skill-meta-table.js` | 把敵人技能的發動率 / 冷卻 / 觸發基準文字改成表格。 | 建議日後合併回 `hsEnemy.js`。 |
| `enemy-boss-tag.js` | 共用敵人魔王 / 一般標籤 helper，透過 `data-url` 指定資料來源。 | 保留共用檔。 |

## 6. 關卡 / 生產線頁

| 檔案 | 用途 | 整理方向 |
|---|---|---|
| `hs-stage.js` | 困難關卡生產線頁，顯示關卡選擇、敵人生產線、敵人詳細 Modal。 | 保留為主程式。 |
| `endless-stage.js` | 無限之塔生產線頁，顯示樓層選擇、敵人生產線、敵人詳細 Modal。 | 保留為主程式；與 `hs-stage.js` 有大量重複，日後可抽成共用 stage renderer。 |

## 7. 後續整理方向

1. 檢查能力頁的舊後處理腳本是否仍有必要。
2. 將 `hsEnemy-skill-meta-table.js` 的邏輯合併進 `hsEnemy.js`。
3. 評估 `hs-stage.js` 與 `endless-stage.js` 的共用 renderer 抽離。
