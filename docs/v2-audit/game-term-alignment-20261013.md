# Rangerbook V2 遊戲用詞比對 — 2026-10-13

接續 PR #134 的正式 V2，僅修正明確可對應官方情境的英、日、泰文字。繁體中文、資料 Key、遊戲數值、條件及控制項值不變。完整逐列決策、修改前後文字、官方來源 Key／原文／資料包 SHA-256 見 [game-term-alignment-20261013.json](game-term-alignment-20261013.json)。

## 查核範圍與結論

- official 16,205 個公開 Key 與 V2 自有 API 解密資料逐 Key、逐語言比對：已有來源的 15,466 Key，四語欄位 **0 差異**。739 個被引用但原包不存在的 Key 及 8 個原包空項目保留既有缺漏標記。
- 掃描目前 custom 470、UI 869，共 1,339 列的英、日、泰文字；查核 lang_unit、lang_equip、lang_prop、lang_etc、lang_guild、lang_area、lang_tip。
- 官方來源中找到 433 個中文精確匹配候選列及 141 個可嵌入自訂句子的短用詞候選。候選數包含同詞不同情境，不能當成可直接替換數。
- 根據明確資料 Key、功能情境與使用位置，修正 **185 列（custom 92、UI 93）**：英文 40、日文 76、泰文 161 個欄位。引用 73 個官方來源 Key。
- 202 列有候選但已一致或情境不適合替換，維持原文；952 列沒有精確候選，維持自訂翻譯。「沒有精確候選」不代表官方所有資料包必然沒有對應句子，也不代表人工逐句翻譯審核完成。
- 自訂整句僅調整遊戲名詞，繼續標為 authored；不冒充官方完整敘述。保留所有數字佔位符、目標數量、時間、百分比及詞句的增減／免疫／條件語意。

## 代表性改善

| 用詞 | 英文 | 日文 | 泰文 |
|---|---|---|---|
| 無限之塔 | INFINITOWER | 無限の塔 | หอคอยไร้ขีดจำกัด |
| 主要才能 | Main Talents | 主な才能 | พรสวรรค์หลัก |
| 強化才能 | Enhance Talents | 強化才能 | พรสวรรค์เพิ่มพลัง |
| 誘惑之歌 | Siren Song | 誘惑の歌 | ลำนำเย้ายวน |
| 墨（機關） | Ink | 墨 | หมึกทมิฬ |
| 幽靈（能力） | Ghost | ゴースト | โกสต์ |
| 敏捷型 | Agility Type | 敏捷タイプ | ความว่องไว |
| 非常快 | Very Fast | 超速い | เร็วมาก |
| 非常慢 | Very Slow | 超遅い | ช้ามาก |
| 技能冷卻時間 | Skill Cooldown | スキルクールタイム | เวลารอทักษะ |
| 公會戰 | Guild War | ギルド戦 | กิลด์วอร์ |
| 裝備重新產生時間 (%) | Ranger Regeneration Time (%) | レンジャー 再生成時間 (%) | ระยะเวลาที่สร้าง เรนเจอร์ใหม่ (%) |
| 才能階段（數值模板） | Talent Level %N1 | 才能%N1ステージ | พรสวรรค์ขั้น %N1 |

其中界面換行會正規化為空白，官方 Regene-\\nration 的排版斷字合併為 Regeneration。TALENT_LEVEL 的單一 %d 重新綁定為 V2 %N1，仍使用相同階段數值。段位敘述中的英文 Legend/Master/Diamond 改為日／泰官方段位名稱，與已修正的下拉選單一致。

## 刻意保留的差異

- 死神機關採 Reaper；不因中文「死神」相同就換成另一個敵人角色的 DEATH。
- 角色等級 Level 不改成裝備等階 Grade；覺醒狀態 Awakened 不改成某個技能名稱 Awakening。
- 不依一般道具 uv-035 的同名項目替換生命寶石；補查 lang_area 後，已直接以 a1_bf_hp_*_nm 證明迷宮遺物 bf_hp 的名稱為 Vital Jewel。
- 英文 Hyper／Ultra 依使用者先前指定保留；泰文進化用詞採官方名稱。
- 「係數」及網站專用管理、登入、統計等文字保留自訂來源。
- 歷史 custom ELEMENT_none 的中文「暗」／英文 Dark 與日泰「無屬性」不一致。現行結構化能力編譯器使用另一個 ELEMENT_NONE；本次保留歷史項目並記錄，避免把中文識別值與資料語意一起改動。

## 驗證

| 指令 | 結果 |
|---|---|
| python -m unittest discover -s tests -p test_game_term_alignment.py -v | 6 tests 通過；185 列來源、三語文字、模板參數、關鍵情境差異及官方缺漏標記 |
| python -m unittest discover -s tests -p test_ui_locale_coverage.py -v | 2 tests 通過；所有正式頁面 UI Key 及英文覆蓋 |
| tests/v2-reported-regressions.cjs（Work Mode Playwright） | 四語通過；敵人技能表格、關卡機關、PvP 配裝／才能／次數、公會、暗屬性、管理員統計、裝備效果、相似星級、語言保存 |
| tests/v2-game-term-browser.cjs（Work Mode Playwright） | 四語 6 個指定遺物名稱搜尋／視窗通過；品級、效果參數及 8 種對象分數保留 |
| tests/v2-browser-interactions.cjs（Work Mode Playwright） | 四語角色／裝備名稱搜尋、角色等級、裝備升級通過 |
| python -m scripts.v2.validate --root res/v2（完整既有 V2 驗證器） | 24 JSON 通過；textBindingErrors=0；custom/UI 各語言缺漏=0；official 各語言 747 空值明示 |

語言更新採原有 V2 編譯器及 publisher，不更改後端 23 個已驗證程式、V1 程式、日期表及排程。44 個入口／共用載入檔僅提升版本參數至 20261013-v2.4，確保新文字不與舊語言包快取混用。AWS 備份及部署成功，詳見下列記錄；定時更新及 Pages 的最終結果記於本 PR。

## 修改檔案

- deploy/aws/v2/locales/custom.json、ui.json：V2 自有翻譯輸入，custom Key 仍不含 CUSTOM:。
- deploy/aws/v2/deployment-plan.json：輸入 SHA-256 與 authoredCatalogRevision。
- docs/v2-audit/game-term-alignment-20261013.json、.md：逐項決策、來源與本報告。
- tests/test_game_term_alignment.py：官方來源與語意／參數回歸。
- 42 個 HTML 入口、assets/js/site.js、assets/js/v2-data.js：僅 cache 版本。
- res/v2/：由正式 V2 runner 重新產出及安全發布，不在來源 PR 人工覆寫。

## 限制

本次是來源比對及有證據的用詞修正，不宣稱全站每句文字都是官方句子。其他官方包及網站自訂句子仍可能有進一步改善空間。既有官方缺漏不捏造翻譯，allReferencedTranslationsComplete=false 保留。

## AWS 實際部署記錄

- PR [#135](https://github.com/mti0224/rangerbook/pull/135)，分支 fix/v2-official-term-alignment-20261013。
- 備份 `/home/ubuntu/rangerbook-v2/backups/v2-game-term-alignment-20261013/before.tar.gz`（1,985,643 bytes），更新前後核對輸入雜湊，持既有 V2 fd9 鎖。
- `update_all_v2.py --skip-fetch` 通過 29 個語意與 18 個獨立流程測試及 24 個 JSON 驗證；`publish_v2.py` 成功發布資料 commit `6e05e2316be023171325e2cac4512a22038409ff`。
- 既有 V2 後端 23 檔、V1 與 systemd 核心 30 檔雜湊無變更；登場日期表雜湊無變更。
- 新 sourceFingerprint `8c26c9eb78093009e71eadfbce055122df56727705a886c48f17c37b46be2cf7`；validated content SHA-256 `9d5ae944fdb3bf745431040d71c680cbcbd9e1acf6e35cebdd9c50f3879eda25`。
- 磁碟更新前 3.623 GiB、更新後 3.621 GiB；全程保留至少 3 GiB，未新增 clone 或瀏覽器。

## 迷宮遺物與其餘官方包補查

- 查核全部 7 個現行官方語言包；lang_msg 在 manifest 為 deleted，未視為現行來源。lang_area / lang_tip 共 15,590 筆語言來源列；中文精確候選 164 列（同文不同 Key 重複很多），去重後 12 組用詞。
- 迷宮遺物由官方代碼 a1/a2/a3 + bf/df + 類型／屬性對應，檢查 21 個網站名稱與 437 個官方品級／對象變體：四語去除另行顯示的品級／對象後，基底名稱全部一致。修改 17 個有差異的名稱，未改 55 筆遺物的等級、效果與 pointsByTarget。
- 代表用詞：Fresh Lizard's Tail、Vital Jewel、Heavy Boomerang、Divine Mirror、Noxious Tree Sap、Soundproof Mask；日文遺物為 遺物、泰文 โบราณวัตถุ。自訂說明句子只套用這些名詞片段，不冒充整句官方譯文。
- 日本文機關標題與主動／被動文字改用 ギミック、泰文 กลไก；英文網站概念保留 Gimmick / Obstacles 的既有情境，不把無限之塔的 Conditions 直接擴大套到所有機關。
