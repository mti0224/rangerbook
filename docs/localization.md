# Rangerbook 多語系系統（第二階段：全站 UI）

## 來源與優先順序

- 官方 lang_unit.json 和 lang_equip.json 提供 zh-Hant、en、ja、ko、th（本次正式網站僅開放 zh-Hant、en） 的 UNIT / SKILL / ABILITY / EQUIP 翻譯。
- custom.json 是站長自行撰寫的繁體中文效果翻譯，**不屬於官方資料**，不可被官方 DB 覆寫。
- custom_en.json 等檔是自行編寫或 AI 翻譯的草稿，待站長逐項確認。
- **assets/locales/ui.json** 是唯一持續維護的網站介面文字庫，依語言分層，與遊戲翻譯完全分開。舊版 assets/locales/zh-Hant.json 和 en.json 暫保留做快取相容，不再作為新介面翻譯的維護來源。

## 產生官方語言檔

在具備完整 data/raw 的環境執行：

    python3 scripts/export_game_locales.py --raw-dir data/raw --out-dir res/i18n

輸出包含各語言的 official（按 msgType 再按 dataCode 索引）及 custom（獨立覆寫），保留來源鍵值，不變更原始檔案。

正式部署時必須以 EC2 現有原始資料產出 zh-Hant / en 完整語言包；不要使用先前僅 4 個名稱的 smoke test 檔。

## 網站行為

- 設定入口改為 /settings/ 獨立頁面，深／淺色模式和繁中／英文均使用單選框；網站語言儲存於 rangerbook-language 並重新載入頁面，色彩模式儲存於 rangerbook-theme。
- 現已涵蓋全站 42 個 HTML 頁面中的全部靜態中文介面文字（含 aria-label/title/placeholder）；JavaScript 動態建立的常見按鈕、訊息、表格與彈窗文字也使用同一份字典。
- 翻譯器使用 data-i18n 明確鍵值優先，再對新增 DOM 中**完全符合已知中文介面原句**的文字節點做顯示層翻譯。無須修改原始 JSON、查詢參數、選項 value 或資料計算邏輯。
- 尚未在詞庫登錄的動態插值句子及遊戲自訂效果描述會保留原文，不會捏造翻譯；後續新增詞條應維護在同一份 ui.json。
- 角色名稱及描述可依 ID 取得官方翻譯，缺漏時退回原值。
- 原始 res/*.json 維持不變，避免破壞中文字條件的篩選、標籤、搜尋與數值運算。
- 未轉換的技能、裝備、能力、PvP、公會戰與關卡內容可能仍顯示繁體中文。

## 上線前必要驗收

1. 讓匯出器在正式 EC2 用最新 lang_unit/lang_equip 建立完整語言包。
2. 釐清 custom_en 等譯文的審核狀態，避免未審核的草稿誤用為正式譯文。
3. 測試深淺色模式、手機選單、管理員角色權限不受語系影響。
4. 逐頁以 ID 綁定技能、裝備、能力等翻譯，完成後再考慮正式合併。


## UI 字典與新增語言方式

`assets/locales/ui.json` 結構如下：

```json
{
  "zh-Hant": {"nav.home": "首頁", "filter.reset": "清除篩選"},
  "en": {"nav.home": "Home", "filter.reset": "Clear filters"}
}
```

- 原則上使用穩定的語意鍵（例如 `nav.home`, `filter.reset`, `settings.title`）。`copy.*` 為歷史畫面文字專用鍵，新增元件應改用有意義的語意鍵。
- 要新增 UI 文字時，在各語系同時加入相同的 key，並用 HTML `data-i18n="some.key"` 或 JS `window.RangerbookI18n.t("some.key", "繁中後備文字")`。純顯示文字也可透過 `window.RangerbookI18n.uiText(original)` 取得翻譯。
- UI 文字必須與遊戲官方 `res/i18n/{locale}.json` 分開；不能將網站 UI 字典作為遊戲資料欄位值、搜尋條件或認證判斷。
- 新增其他語言時複製一組同鍵的翻譯資料，再擴充 `assets/js/i18n.js` 的 supported 語言清單、設定頁選項及 QA。
- 執行 `python -m unittest discover -s tests -p 'test_ui_locale_coverage.py' -v` 會檢查每個 HTML 頁面的中文文字都已有字典條目。
