// netlify/functions/ai-domovoy.js

const fs = require("fs");
const path = require("path");

// ---------- Глобальные переменные для контекста ----------
let manifestoRU = "";
let charterRU = "";
let loaded = false;

// ---------- Загрузка контекста из файлов (один раз) ----------
function loadContext() {
  if (loaded) return;

  try {
    const base = path.resolve("./src/data");
    manifestoRU = fs.readFileSync(path.join(base, "manifesto_ru.txt"), "utf8");
    charterRU = fs.readFileSync(path.join(base, "charter_ru.txt"), "utf8");
    loaded = true;
  } catch (e) {
    console.error("Контекст NovaCiv не загружен:", e);
    manifestoRU = "";
    charterRU = "";
  }
}

function sliceText(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

exports.handler = async (event) => {
  // Только POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: "OPENAI_API_KEY не задан на сервере.",
      }),
    };
  }

  loadContext();

  try {
    const body = JSON.parse(event.body || "{}");
    const language = body.language || "ru";
    const page = body.page || "/";
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];

    const manifestoSlice = sliceText(manifestoRU, 20000);
    const charterSlice = sliceText(charterRU, 20000);

    const systemPrompt = `
Ты — Домовой проекта NovaCiv.  
Ты — не хозяин и не учитель. Ты — хранитель смысла, спокойный и честный собеседник.

Говори просто, тепло и по делу.  
Если пользователь обращается по-русски — отвечай по-русски.  
Если на другом языке — отвечай на том языке, который он использовал.

Ты опираешься на:
— Манифест NovaCiv (философия, смысл, мировоззрение);
— Устав NovaCiv (структура, правила, принципы).

Не цитируй огромные куски текста. Кратко пересказывай и объясняй по сути.

--------- Краткий контекст ----------
${manifestoSlice}
-------------------------------------
${charterSlice}
-------------------------------------

Страница, с которой задают вопрос: ${page}
Язык интерфейса: ${language}
Отвечай так, как будто ты — живая часть NovaCiv.
    `.trim();

    // Собираем сообщения для OpenAI
    const messages = [
      { role: "system", content: systemPrompt },
      ...incomingMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
        content: m.content || m.text || "",
      })),
    ];

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 250,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("OpenAI chat error:", response.status, text);
      return {
        statusCode: 200,
        body: JSON.stringify({
          error: `OpenAI API error: HTTP ${response.status}`,
        }),
      };
    }

    const data = await response.json();
    const answer =
      data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";

    return {
      statusCode: 200,
      body: JSON.stringify({ answer }),
    };
  } catch (err) {
    console.error("ai-domovoy runtime error:", err);
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: "Ошибка при обработке запроса Домового.",
      }),
    };
  }
};
