# LINE Rangers 資料查詢網站

這是可部署到 GitHub Pages 的靜態網站版本。

## 網址結構

- 首頁：`/`
- 能力查詢頁：`/ability/`
- 原始能力資料：`/res/能力.json`

## 重要說明

此版本直接使用原本的 `能力.json`，沒有把資料轉換成其他格式。

能力圖片來源維持：

```text
https://rangers.lerico.net/res/ability_icon/
```

前端會使用 JSON 內每筆資料的 `icon` 欄位組合圖片網址。

## GitHub Pages 部署方式

1. 將本資料夾內所有檔案上傳到 GitHub repository 根目錄。
2. 到 Repository Settings → Pages。
3. Source 選擇 `Deploy from a branch`。
4. Branch 選擇 `main` / `/root`。
5. 等待 GitHub Pages 部署完成。

## 未來新增其他查詢頁

建議維持以下結構：

```text
/res/xxx.json
/xxx/index.html
/assets/js/xxx.js
```

Header 已放在 `/assets/js/site.js`，之後新增頁面時只要引入同一個 `site.js` 即可共用導覽列。
