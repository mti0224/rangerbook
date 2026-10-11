# Rangerbook 多語系改造（第一階段）

## 來源與優先順序

- 官方 lang_unit.json 和 lang_equip.json 提供 zh-Hant、en、ja、ko、th（本次正式網站僅開放 zh-Hant、en） 的 UNIT / SKILL / ABILITY / EQUIP 翻譯。
- custom.json 是站長自行撰寫的繁體中文效果翻譯，**不屬於官方資料**，不可被官方 DB 覆寫。
- custom_en.json 等檔是自行編寫或 AI 翻譯的草稿，待站長逐項確認。
- assets/locales/*.json 是網站 UI 的固定文字，與遊戲翻譯分開。

## 產生官方語言檔

在具備完整 data/raw 的環境執行：

    python3 scripts/export_game_locales.py --raw-dir data/raw --out-dir res/i18n

輸出包含各語言的 official（按 msgType 再按 dataCode 索引）及 custom（獨立覆寫），保留來源鍵值，不變更原始檔案。

正式部署時必須以 EC2 現有原始資料產出 zh-Hant / en 完整語言包；不要使用先前僅 4 個名稱的 smoke test 檔。

## 網站行為

- 設定入口改為 /settings/ 獨立頁面，深／淺色模式和繁中／英文均使用單選框；網站語言儲存於 rangerbook-language 並重新載入頁面，色彩模式儲存於 rangerbook-theme。
- 目前覆蓋首頁、共用導覽與 Ranger 列表的部分固定 UI 字詞；角色名稱及描述可依 ID 取得官方翻譯，缺漏時退回繁中原值。
- 原始 res/*.json 維持不變，避免破壞中文字條件的篩選、標籤、搜尋與數值運算。
- 未轉換的技能、裝備、能力、PvP、公會戰與關卡內容可能仍顯示繁體中文。

## 上線前必要驗收

1. 讓匯出器在正式 EC2 用最新 lang_unit/lang_equip 建立完整語言包。
2. 釐清 custom_en 等譯文的審核狀態，避免未審核的草稿誤用為正式譯文。
3. 測試深淺色模式、手機選單、管理員角色權限不受語系影響。
4. 逐頁以 ID 綁定技能、裝備、能力等翻譯，完成後再考慮正式合併。
