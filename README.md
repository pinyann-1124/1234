# 智慧健康日誌與風險評估系統 🩺
> Smart Health Log & Risk Assessment System

這是一個基於 Node.js 與 SQLite 開發的 Web 應用程式。使用者可以記錄每日的健康數據（包含睡眠時數、步數、心情分數），系統會透過整合 **Google Gemini API** 來模擬決策樹邏輯，自動評估並回傳當日的「健康風險等級」（低 / 中 / 高），並將數據即時視覺化。

本專案為中原大學之學術期末展示專案。
**作者 (Author)：** 塗品妍

---

## ✨ 核心功能 (Features)

* **📝 完整健康日誌 CRUD：** 支援新增、讀取、修改與刪除使用者的健康紀錄。
* **🤖 AI 風險評估與容錯機制：** 整合 Google Gemini API，預設使用 `gemini-2.5-flash` 模型即時運算風險等級，並具備自動降級（Fallback）至 `gemini-1.5-flash` 的防呆機制。
* **📊 數據視覺化 (Chart.js)：** * **健康風險分佈：** 以圓餅圖直觀呈現歷史紀錄中的高中低風險比例。
  * **健康數據趨勢：** 採用雙 Y 軸折線圖，完美解決「萬步」與「1-10分心情/睡眠」比例懸殊的問題，清晰呈現數據走勢。
* **🛡️ 防連點與錯誤攔截：** 具備完善的前端按鈕狀態控制，精準捕捉 API `429 Too Many Requests` (額度上限) 錯誤，提供友善的使用者提示。
* **🩺填空格子：** 會提示你的格子有些尚未填空，免得浪費api-keys的使用次數
---

## 🛠️ 技術架構 (Tech Stack)

* **前端 (Frontend)：** HTML5, CSS3, Vanilla JavaScript, Chart.js
* **後端 (Backend)：** Node.js, Express.js
* **資料庫 (Database)：** SQLite3 (本地實體檔案資料庫 `health.db`)
* **外部 API (External API)：** Google Gemini API (`axios`)

