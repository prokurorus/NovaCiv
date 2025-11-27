// netlify/functions/ai-domovoy.js

const fs = require("fs");
const path = require("path");

// ---------- Глобальные переменные ----------
let manifestoRU = "";
let charterRU = "";
let charterSections = []; // [{ id: "0.0", text: "0.0. ..." }, ...]
let loaded = false;

// ---------- Загрузка контекста из файлов (один раз) ----------
function loadContext() {
  if (loaded) return;

  try {
    const base = path.resolve("./src/data");
    manifestoRU = fs.readFileSync(
      path.join(base, "manifesto_ru.txt"),
      "utf8"
    );
    charterRU = fs.readFileSync(
      path.join(base, "charter_ru.txt"),
      "utf8"
    );

    parseCharterSections(charterRU);
    loaded = true;
  } catch (e) {
    console.error("Контекст NovaCiv не загружен:", e);
    manifestoRU = "";
    charterRU = "";
    charterSections = [];
  }
}

// ---------- Разбор устава в структурированные пункты ----------
function parseCharterSections(text) {
  charterSections = [];
  if (!text) return;

  const lines = text.split(/\r?\n/);

  let currentId = null;
  let buffer = [];

  for (const rawLine of lines) {
    const line = rawLine; // не трогаем пробелы внутри строки
    // Ищем строки вида "0.0.", "1.1.", "10.2" и т.п. в начале строки
    const m = line.match(/^\s*(\d+\.\d+)\.?\s*(.*)$/);
    if (m) {
      // Сохраняем предыдущий пункт
      if (currentId) {
        const fullText =
          `${currentId}. ` + buffer.join("\n").trim();
        charterSections.push({
          id: currentId,
          text: fullText.trim(),
        });
      }
      currentId = m[1]; // "0.0"
      const rest = m[2] || "";
      buffer = [rest];
    } else if (currentId) {
      buffer.push(line);
    } else {
      // Текст до первого пронумерованного пункта игнорируем для схемы
    }
  }

  if (currentId) {
    const fullText =
      `${currentId}. ` + buffer.join("\n").trim();
    charterSections.push({
      id: currentId,
      text: fullText.trim(),
    });
  }

  console.log(
    `Разобрано пунктов устава: ${charterSections.length}`
  );
}

function sliceText(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

// ---------- Вспомогательные функции для цитирования ----------
function normalize(str) {
  return (str || "").toLowerCase();
}

// Находим последний ответ ассистента и выдираем оттуда ид пункта (0.0, 1.1 и т.п.)
function extractLastCitedIdFromHistory(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.content) continue;
    const match = m.content.match(/(\d+\.\d+)/);
    if (match) return match[1];
  }
  return null;
}

// Находим пункт по id
function findSectionById(id) {
  if (!id || !charterSections.length) return null;
  return charterSections.find((s) => s.id === id) || null;
}

// Находим "следующий" пункт относительно указанного id
function findNextSection(id) {
  if (!id || !charterSections.length) return null;
  const idx = charterSections.findIndex((s) => s.id === id);
  if (idx === -1 || idx >= charterSections.length - 1) return null;
  return charterSections[idx + 1];
}

// Находим "предыдущий" пункт
function findPrevSection(id) {
  if (!id || !charterSections.length) return null;
  const idx = charterSections.findIndex((s) => s.id === id);
  if (idx <= 0) return null;
  return charterSections[idx - 1];
}

// Пытаемся вытащить явно указанный номер пункта из текста
function extractExplicitIdFromText(text) {
  const t = normalize(text);

  // Сначала ищем "пункт 0.0", "пункт 1.1" и т.п.
  let m = t.match(/пункт[^0-9]*?(\d+\.\d+)/);
  if (m) return m[1];

  // Обработка "0 0", "1 1" после слова "пункт"
  if (t.includes("пункт")) {
    m = t.match(/пункт[^0-9]*?(\d+)\s*[.,]?\s*(\d+)/);
    if (m) {
      return `${m[1]}.${m[2]}`;
    }
  }

  return null;
}

// Основная логика: вернуть точную цитату (или null, если не надо цитировать напрямую)
function tryHandleCitation(userText, historyMessages) {
  if (!charterSections.length) return null;

  const t = normalize(userText);

  const asksForCitation =
    t.includes("процитируй") ||
    t.includes("процитируете") ||
    t.includes("цитируй") ||
    t.includes("дай текст") ||
    t.includes("приведи");

  const mentionsPunkt =
    t.includes("пункт") || t.includes("пункта") || t.includes("пункты");

  // 1) Явно указан id: "процитируй пункт 0.0", "процитируй пункт 1 1"
  const explicitId = extractExplicitIdFromText(t);
  if (explicitId) {
    const section = findSectionById(explicitId);
    if (section) {
      return section.text;
    }
    return `Я не нашёл в Уставе пункта с номером "${explicitId}". Проверь, пожалуйста, правильность номера.`;
  }

  // 2) "самый первый пункт", "первый пункт устава"
  const asksFirst =
    (t.includes("самый первый") || t.includes("первый")) &&
    t.includes("пункт");
  if (asksFirst && charterSections.length > 0) {
    return charterSections[0].text;
  }

  // 3) "следующий пункт"
  if (asksForCitation && mentionsPunkt && t.includes("следующ")) {
    const lastId = extractLastCitedIdFromHistory(historyMessages);
    if (!lastId) {
      return "Я не вижу, какой пункт был процитирован до этого. Скажи, пожалуйста, номер пункта, который тебя интересует (например, 0.0 или 1.1).";
    }
    const nextSection = findNextSection(lastId);
    if (!nextSection) {
      return `После пункта ${lastId} в Уставе нет следующего пункта.`;
    }
    return nextSection.text;
  }

  // 4) "предыдущий пункт"
  if (asksForCitation && mentionsPunkt && t.includes("предыдущ")) {
    const lastId = extractLastCitedIdFromHistory(historyMessages);
    if (!lastId) {
      return "Я не вижу, какой пункт был процитирован до этого. Скажи, пожалуйста, номер пункта, от которого нужно оттолкнуться.";
    }
    const prevSection = findPrevSection(lastId);
    if (!prevSection) {
      return `До пункта ${lastId} нет предыдущего пункта.`;
    }
    return prevSection.text;
  }

  // Если просто "процитируй пункт устава", но без номера — спросим номер
  if (asksForCitation && mentionsPunkt) {
    return "Уточни, пожалуйста, номер пункта Устава, который нужно процитировать (например, 0.0, 1.1 и т.п.), или скажи: «самый первый пункт устава».";
  }

  return null;
}

// ---------- Логика объяснения смысла последнего процитированного пункта ----------
async function tryHandleExplain(userText, historyMessages, language, apiKey) {
  const t = normalize(userText);
  if (!t) return null;

  const hasExplainWord =
    t.includes("объясни") ||
    t.includes("объясните") ||
    t.includes("поясни") ||
    t.includes("поясните") ||
    (t.includes("помоги") && t.includes("разобрать")) ||
    t.includes("разобрать смысл") ||
    t.includes("объясни смысл") ||
    t.includes("разъясни");

  const hasPointRef =
    t.includes("пункт") ||
    t.includes("пункта") ||
    t.includes("пункты") ||
    t.includes("этот пункт") ||
    t.includes("этого пункта") ||
    (t.includes("этот") && t.includes("смысл"));

  if (!hasExplainWord || !hasPointRef) {
    return null;
  }

  const lastId = extractLastCitedIdFromHistory(historyMessages);
  if (!lastId) {
    return null;
  }

  const section = findSectionById(lastId);
  if (!section) {
    return null;
  }

  const explainLanguage = language || "ru";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const systemPrompt = `
Ты — помощник проекта NovaCiv.
Твоя задача — спокойно и понятно объяснить смысл одного пункта Устава NovaCiv для обычного человека.
Не придумывай новых норм и не меняй формулировок Устава — только поясняй, как это можно понять и применить.
Отвечай на языке кода "${explainLanguage}" (ru — по-русски, en — по-английски и т.п.).
  `.trim();

  const userPrompt = `
Объясни, пожалуйста, смысл следующего пункта Устава NovaCiv:

"${section.text}"

Не переписывай его полностью ещё раз (можно цитировать отдельные фразы, если нужно),
а разложи по полочкам: о чём этот пункт, какие права и обязанности он задаёт, и что он означает для Гражданина.
  `.trim();

  try {
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 400,
          temperature: 0.4,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(
        "OpenAI explain-point error:",
        response.status,
        text
      );
      return null;
    }

    const data = await response.json();
    const answer =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? data.choices[0].message.content.trim()
        : "";

    return answer || null;
  } catch (e) {
    console.error("tryHandleExplain runtime error:", e);
    return null;
  }
}

// ---------- Основной handler ----------
exports.handler = async (event) => {
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
    const incomingMessages = Array.isArray(body.messages)
      ? body.messages
      : [];

    // Последнее сообщение пользователя
    const lastUser =
      [...incomingMessages]
        .reverse()
        .find((m) => m.role === "user" && m.content) || null;
    const userText = lastUser?.content || "";

    // 1) Пытаемся обработать запрос как "жёсткую" цитату из Устава
    const citation = tryHandleCitation(userText, incomingMessages);
    if (citation) {
      return {
        statusCode: 200,
        body: JSON.stringify({ answer: citation }),
      };
    }

    // 2) Пытаемся обработать как "объясни смысл этого пункта"
    const explanation = await tryHandleExplain(
      userText,
      incomingMessages,
      language,
      apiKey
    );
    if (explanation) {
      return {
        statusCode: 200,
        body: JSON.stringify({ answer: explanation }),
      };
    }

    // 3) Во всех остальных случаях — обычный диалог с OpenAI

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

ПРАВИЛА ОТВЕТОВ:

1) Если пользователь прямо просит процитировать текст Устава или Манифеста дословно,
   ты можешь процитировать один-два абзаца или один пункт, но не целые большие разделы.
   Старайся быть точным, но не перегружай ответ.

2) Если запрос общий и не содержит прямой просьбы о цитате,
   лучше отвечай кратким и понятным пересказом, объясняй суть своими словами.

3) Если пользователь просит слишком большой объём текста (целый раздел),
   честно скажи, что это слишком много для одного сообщения,
   и предложи краткое содержание или разбор по частям.

--------- Краткий контекст (фрагменты Устава и Манифеста, русская версия) ----------
${manifestoSlice}
-------------------------------------
${charterSlice}
-------------------------------------

Страница, с которой задают вопрос: ${page}
Язык интерфейса: ${language}
Отвечай так, как будто ты — живая часть NovaCiv.
    `.trim();

    // Собираем сообщения для OpenAI: наш системный промпт + история
    const messages = [
      { role: "system", content: systemPrompt },
      ...incomingMessages.map((m) => ({
        role:
          m.role === "assistant"
            ? "assistant"
            : m.role === "system"
            ? "system"
            : "user",
        content: m.content || m.text || "",
      })),
    ];

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
      }
    );

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
      data.choices &&
      data.choices[0] &&
      data.choices[0].message
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
