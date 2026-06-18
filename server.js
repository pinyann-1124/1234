const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./health.db', (err) => {
    if (err) console.error("資料庫連接失敗:", err.message);
    else console.log("已連接到 SQLite 資料庫。");
});

db.run(`CREATE TABLE IF NOT EXISTS health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date DATE NOT NULL,
    sleep_hours REAL NOT NULL,
    steps INTEGER NOT NULL,
    mood_score INTEGER NOT NULL,
    risk_level TEXT
)`);

// ==========================================
// 共用模組：呼叫 AI 決策樹模型
// ==========================================
async function getRiskLevelFromAI(sleep_hours, steps, mood_score) {
    const prompt = `
    你現在是一個健康風險評估系統的決策樹模型。
    請根據以下使用者的單日數據，評估其「健康風險等級」。
    - 睡眠時數：${sleep_hours} 小時
    - 步數：${steps} 步
    - 心情分數：${mood_score} 分 (1-10分)
    請綜合這三個特徵，判斷風險等級為：「低」、「中」、「高」其中一個。
    你只需要回答一個字（低、中、高），不要加任何其他解釋標點符號。
    `;

    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    
    // ✨ 這次我發誓絕對不會再錯了：確保使用最新現役的 2.5-flash 模型
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    try {
        console.log("正在發送請求給 AI...");
        const response = await axios.post(apiUrl, 
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' } }
        );

        let risk_level = response.data.candidates[0].content.parts[0].text.trim();
        if (!['低', '中', '高'].includes(risk_level)) risk_level = '未定 (AI 異常)';
        return risk_level;
    } catch (error) {
        throw error;
    }
}

// ==========================================
// 共用模組：統一處理 AI 錯誤 (包含詳細除錯訊息)
// ==========================================
function handleAIError(res, error) {
    let statusCode = error.response ? error.response.status : 500;
    
    if (error.response && error.response.data && error.response.data.error) {
        console.error("\n⛔ Google 官方回傳的詳細錯誤:");
        console.error(JSON.stringify(error.response.data.error, null, 2));
        console.error("-----------------------------------\n");
    } else {
        console.error("AI 呼叫發生錯誤:", error.message);
    }
    
    if (statusCode === 429 || (error.response && error.response.data && JSON.stringify(error.response.data).includes('quota'))) {
        let errorMessage = "【AI API 呼叫次數已達上限】\n\n這代表你的 API 免費額度已經用完，或是你按太快導致頻率超載。\n👉 請放心，這「絕對不是」你的語法或程式碼有錯！請換一把 API Key 或稍後再試。";
        return res.status(429).json({ success: false, isQuotaError: true, message: errorMessage });
    }

    res.status(statusCode).json({ success: false, isQuotaError: false, message: `連線 AI 失敗 (錯誤碼: ${statusCode})，請查看終端機的詳細錯誤。` });
}

// ==========================================
// 5 個 API 端點
// ==========================================
app.get('/health-logs', (req, res) => {
    db.all(`SELECT * FROM health_logs ORDER BY log_date DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/health-logs', async (req, res) => {
    const { log_date, sleep_hours, steps, mood_score } = req.body;
    try {
        const risk_level = await getRiskLevelFromAI(sleep_hours, steps, mood_score);
        const query = `INSERT INTO health_logs (log_date, sleep_hours, steps, mood_score, risk_level) VALUES (?, ?, ?, ?, ?)`;
        db.run(query, [log_date, sleep_hours, steps, mood_score, risk_level], function(err) {
            if (err) return res.status(500).json({ success: false, message: "資料庫寫入失敗" });
            res.json({ success: true, message: "新增成功！", data: { id: this.lastID, risk_level } });
        });
    } catch (error) {
        handleAIError(res, error);
    }
});

app.put('/health-logs/:id', async (req, res) => {
    const { id } = req.params;
    const { log_date, sleep_hours, steps, mood_score } = req.body;
    try {
        const risk_level = await getRiskLevelFromAI(sleep_hours, steps, mood_score);
        const query = `UPDATE health_logs SET log_date=?, sleep_hours=?, steps=?, mood_score=?, risk_level=? WHERE id=?`;
        db.run(query, [log_date, sleep_hours, steps, mood_score, risk_level, id], function(err) {
            if (err) return res.status(500).json({ success: false, message: "資料庫更新失敗" });
            res.json({ success: true, message: "修改成功！", data: { risk_level } });
        });
    } catch (error) {
        handleAIError(res, error);
    }
});

app.delete('/health-logs/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM health_logs WHERE id=?`, id, function(err) {
        if (err) return res.status(500).json({ success: false, message: "刪除失敗" });
        res.json({ success: true, message: "刪除成功！" });
    });
});

app.get('/health-logs/risk', async (req, res) => {
    const { sleep_hours, steps, mood_score } = req.query;
    if (!sleep_hours || !steps || !mood_score) {
        return res.status(400).json({ success: false, message: "請提供完整的參數" });
    }
    try {
        const risk_level = await getRiskLevelFromAI(sleep_hours, steps, mood_score);
        res.json({ success: true, message: "風險評估完成", data: { risk_level } });
    } catch (error) {
        handleAIError(res, error);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`伺服器運行中： http://localhost:${PORT}`);
});