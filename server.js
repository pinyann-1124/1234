const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ================= DB =================
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

// ================= AI =================
async function getRiskLevelFromAI(sleep_hours, steps, mood_score) {
    const prompt = `
你是一個健康風險評估系統。

請根據以下資料判斷風險等級（低 / 中 / 高）：

睡眠：${sleep_hours}
步數：${steps}
心情：${mood_score}

⚠️ 只回答一個字：低 或 中 或 高
不要標點符號
不要句號
不要解釋
`;

    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) throw new Error("API KEY 沒設");

    // 🔥 你指定的 2.5 flash（但加 fallback）
    const models = [
        "gemini-2.5-flash",
        "gemini-1.5-flash" // fallback 防 404
    ];

    for (let model of models) {
        const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

        try {
            console.log(`👉 嘗試模型: ${model}`);

            const response = await axios.post(apiUrl, {
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }]
                    }
                ]
            });

            let text =
                response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

            if (!text) throw new Error("AI 回傳空");

            // 🔥 清洗 AI 回答（超關鍵）
            text = text.replace(/[^\u4e00-\u9fa5]/g, "");

            if (['低', '中', '高'].includes(text)) {
                return text;
            }

            console.log("⚠️ AI 回傳異常:", text);
            return "未定";

        } catch (error) {
            if (error.response) {
                console.error(`❌ ${model} 失敗:`, error.response.status);
            } else {
                console.error(`❌ ${model} 錯誤:`, error.message);
            }

            // 換下一個模型
        }
    }

    throw new Error("所有模型都失敗");
}

// ================= 錯誤處理 =================
function handleAIError(res, error) {
    if (error.response) {
        console.error("AI 詳細錯誤：");
        console.error(JSON.stringify(error.response.data, null, 2));
    } else {
        console.error(error.message);
    }

    if (error.response?.status === 429) {
        return res.status(429).json({
            success: false,
            message: "AI 次數超過限制，稍後再試"
        });
    }

    res.status(500).json({
        success: false,
        message: "AI 呼叫失敗"
    });
}

// ================= API =================

// 查全部
app.get('/health-logs', (req, res) => {
    db.all(`SELECT * FROM health_logs ORDER BY log_date DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, data: rows });
    });
});

// 新增
app.post('/health-logs', async (req, res) => {
    const { log_date, sleep_hours, steps, mood_score } = req.body;

    try {
        const risk_level = await getRiskLevelFromAI(sleep_hours, steps, mood_score);

        db.run(
            `INSERT INTO health_logs (log_date, sleep_hours, steps, mood_score, risk_level)
             VALUES (?, ?, ?, ?, ?)`,
            [log_date, sleep_hours, steps, mood_score, risk_level],
            function (err) {
                if (err) return res.status(500).json({ success: false });
                res.json({
                    success: true,
                    message: "新增成功",
                    risk_level
                });
            }
        );

    } catch (error) {
        handleAIError(res, error);
    }
});

// 修改
app.put('/health-logs/:id', async (req, res) => {
    const { id } = req.params;
    const { log_date, sleep_hours, steps, mood_score } = req.body;

    try {
        const risk_level = await getRiskLevelFromAI(sleep_hours, steps, mood_score);

        db.run(
            `UPDATE health_logs
             SET log_date=?, sleep_hours=?, steps=?, mood_score=?, risk_level=?
             WHERE id=?`,
            [log_date, sleep_hours, steps, mood_score, risk_level, id],
            function (err) {
                if (err) return res.status(500).json({ success: false });
                res.json({
                    success: true,
                    message: "修改成功",
                    risk_level
                });
            }
        );

    } catch (error) {
        handleAIError(res, error);
    }
});

// 刪除
app.delete('/health-logs/:id', (req, res) => {
    const { id } = req.params;

    db.run(`DELETE FROM health_logs WHERE id=?`, id, function (err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: "刪除成功" });
    });
});

// 單純測 AI
app.get('/health-logs/risk', async (req, res) => {
    const { sleep_hours, steps, mood_score } = req.query;

    if (!sleep_hours || !steps || !mood_score) {
        return res.status(400).json({ success: false, message: "缺參數" });
    }

    try {
        const risk_level = await getRiskLevelFromAI(sleep_hours, steps, mood_score);

        res.json({
            success: true,
            risk_level
        });

    } catch (error) {
        handleAIError(res, error);
    }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 伺服器運行：http://localhost:${PORT}`);
});