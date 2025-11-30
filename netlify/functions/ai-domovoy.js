// netlify/functions/ai-domovoy.js
//
// Мозг Домового NovaCiv.
// Теперь он:
// 1) Знает Манифест и Устав (из текстовых файлов).
// 2) Умеет по запросу цитировать и объяснять пункты Устава.
// 3) Подгружает свежий контекст с сайта из Firebase (лента и форум).
// 4) Принимает опциональный pageContext — текст текущей страницы/темы.
// 5) Генерирует голосовой ответ и отдаёт audioUrl, как ждёт фронтенд.

const fs = require("fs");
const path = require("path");

// ---------- ENV ----------
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || "";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_TTS_MODEL =
  process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const DEFAULT_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";

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
      "utf8",
    );
    charterRU = fs.readFileSync(
      path.join(base, "charter_ru.txt"),
      "utf8",
    );

    parseCharterSections(charterRU);
    loaded = true;
  } catch (e) {
    console.error("Контекст NovaCiv не загружен:", e);
    manifestoRU = "";
    charterRU = "";
    charterSections = [];
    loaded = true;
  }
}

function parseCharterSections(text) {
  charterSections = [];
  if (!text) return;

  const lines = text.split(/\r?\n/);
  let currentId = null;
  let buffer = [];

  const idRegex = /^(\d+\.\d+)\s*(.*)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(idRegex);

    if (m) {
      if (currentId) {
        const fullText = `${currentId}. ` + buffer.join("\n").trim();
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
    }
  }

  if (currentId) {
    const fullText = `${currentId}. ` + buffer.join("\n").trim();
    charterSections.push({
      id: currentId,
      text: fullText.trim(),
    });
  }

  console.log(`Разобрано пунктов устава: ${charterSections.length}`);
}

function sliceText(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

// ---------- Вспомогательные функции для цитирования ----------

function normalize(str) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/\s+/g, " ").trim();
}

function findSectionById(id) {
  return charterSections.find((s) => s.id === id) || null;
}

function findFirstSection() {
  if (!charterSections.length) return null;
  return charterSections[0];
}

function extractLastCitedIdFromHistory(historyMessages) {
  if (!Array.isArray(historyMessages)) return null;

  for (let i = historyMessages.length - 1; i >= 0; i--) {
    const m = historyMessages[i];
    const c = (m && m.content) || "";
    const nm = normalize(c);
    const match = nm.match(/пункт\s+(\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function findNextSection(id) {
  const idx = charterSections.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  if (idx + 1 >= charterSections.length) return null;
  return charterSections[idx + 1];
}

function findPrevSection(id) {
  const idx = charterSections.findIndex((s) => s.id === id);
  if (idx <= 0) return null;
  return charterSections[idx - 1];
}

function tryExtractPunktIdFromText(text) {
  const t = normalize(text);

  let m = t.match(/пункт[^0-9]*?(\d+\.\d+)/);
  if (m) return m[1];

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

  const mentionsPunkt = t.includes("пункт");

  if (asksForCitation && !mentionsPunkt) {
    return null;
  }

  const explicitId = tryExtractPunktIdFromText(userText);

  if (asksForCitation && explicitId) {
    const section = findSectionById(explicitId);
    if (!section) {
      return `Я не нашёл пункт ${explicitId} в Уставе NovaCiv. Возможно, он ещё не существует или номер указан неверно.`;
    }
    return section.text;
  }

  const lastId = extractLastCitedIdFromHistory(historyMessages);

  if (
    asksForCitation &&
    mentionsPunkt &&
    !explicitId &&
    lastId &&
    t.includes("следующ")
  ) {
    const nextSection = findNextSection(lastId);
    if (!nextSection) {
      return `После пункта ${lastId} нет следующего — он последний в Уставе.`;
    }
    return nextSection.text;
  }

  if (
    asksForCitation &&
    mentionsPunkt &&
    !explicitId &&
    lastId &&
    t.includes("предыдущ")
  ) {
    const prevSection = findPrevSection(lastId);
    if (!prevSection) {
      return `До пункта ${lastId} нет предыдущего пункта.`;
    }
    return prevSection.text;
  }

  if (asksForCitation && mentionsPunkt) {
    return "Уточни, пожалуйста, номер пункта Устава, который нужно процитировать (например, 0.0, 1.1 и т.п.), или скажи: «самый первый пункт устава».";
  }

  return null;
}

// ---------- Логика объяснения смысла последнего процитированного пункта ----------

async function tryHandleExplain(
  userText,
  historyMessages,
  language,
  apiKey,
) {
  const t = normalize(userText);
  if (!t) return null;

  const hasExplainWord =
    t.includes("объясни") ||
    t.includes("объясните") ||
    t.includes("поясни") ||
    t.includes("поясните") ||
    t.includes("что означает") ||
    t.includes("что значит");

  if (!hasExplainWord) {
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

  const explainLanguage =
    language === "ru" || language === "en" || language === "de"
      ? language
      : "ru";

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
          model: DEFAULT_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 400,
          temperature: 0.4,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(
        "OpenAI explain-point error:",
        response.status,
        text,
      );
      return null;
    }

    const data = await response.json();
    const answer =
      data.choices?.[0]?.message?.content?.trim() || "";

    return answer || null;
  } catch (e) {
    console.error("tryHandleExplain runtime error:", e);
    return null;
  }
}

// ---------- Загрузка свежего контекста сайта из Firebase ----------

async function loadSiteContext(language) {
  if (!FIREBASE_DB_URL) return "";

  try {
    const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22createdAt%22&limitToLast=16`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      console.error(
        "Firebase site-context error:",
        res.status,
        text,
      );
      return "";
    }

    const data = await res.json();
    if (!data || typeof data !== "object") return "";

    const items = Object.values(data)
      .filter((item) => item && typeof item === "object")
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const blocks = items.slice(0, 12).map((item) => {
      const title = (item.title || "").toString();
      const content = sliceText((item.content || "").toString(), 600);
      const section = item.section || "news";
      const lang = item.lang || "ru";

      return `[#${section}][${lang}] ${title}\n${content}`;
    });

    if (!blocks.length) return "";

    return blocks.join("\n\n");
  } catch (e) {
    console.error("loadSiteContext error:", e);
    return "";
  }
}

// ---------- Генерация голоса ----------

async function synthesizeSpeech(text, apiKey) {
  if (!text || !apiKey) return null;

  try {
    const response = await fetch(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DEFAULT_TTS_MODEL,
          voice: DEFAULT_VOICE,
          input: text,
          format: "mp3",
        }),
      },
    );

    if (!response.ok) {
      const msg = await response.text();
      console.error(
        "Domovoy TTS error:",
        response.status,
        msg.slice(0, 200),
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:audio/mp3;base64,${base64}`;
  } catch (e) {
    console.error("Domovoy TTS runtime error:", e);
    return null;
  }
}

// ---------- Основной handler ----------

exports.handler = async (event) => {
  try {
    loadContext();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "OPENAI_API_KEY is not configured",
        }),
      };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const language = body.language || body.lang || "ru";
    const page = body.page || "/";
    const incomingMessages = Array.isArray(body.messages)
      ? body.messages
      : Array.isArray(body.history)
      ? body.history.map((m) => ({
          role: m.role,
          content: m.text,
        }))
      : [];

    const rawPageContext =
      typeof body.pageContext === "string" ? body.pageContext : "";
    const pageContext = sliceText(rawPageContext, 8000);

    const lastUser =
      [...incomingMessages]
        .reverse()
        .find((m) => m.role === "user" && m.content) || null;
    const userText = lastUser?.content || body.question || "";

    // 1. Цитирование конкретного пункта
    const citation = tryHandleCitation(userText, incomingMessages);
    if (citation) {
      const audioUrl = await synthesizeSpeech(citation, apiKey);
      return {
        statusCode: 200,
        body: JSON.stringify({ answer: citation, audioUrl }),
      };
    }

    // 2. Объяснение уже процитированного пункта
    const explained = await tryHandleExplain(
      userText,
      incomingMessages,
      language,
      apiKey,
    );
    if (explained) {
      const audioUrl = await synthesizeSpeech(explained, apiKey);
      return {
        statusCode: 200,
        body: JSON.stringify({ answer: explained, audioUrl }),
      };
    }

    // 3. Общий философский / информационный ответ
    const siteContext = await loadSiteContext(language);

    const manifestoSlice = sliceText(manifestoRU, 3200);
    const charterSlice = sliceText(charterRU, 3200);
    const siteContextBlock = siteContext
      ? `\n\n--------- Фрагменты ленты и форума (последние записи) ----------\n${siteContext}\n-------------------------------------\n`
      : "";
    const pageContextBlock = pageContext
      ? `\n\n--------- Текст текущей страницы / темы ----------\n${pageContext}\n-------------------------------------\n`
      : "";

    const systemPrompt = `
Ты — Домовой проекта NovaCiv.
Ты — не хозяин и не учитель. Ты — хранитель смысла, спокойный и честный собеседник.
Ты ведёшь философские записи в «Ленте движения NovaCiv» и отвечаешь людям в чате тем же голосом.
В ленте ты формулируешь завершённые мысли и вопросы к сообществу, а в диалоге помогаешь человеку разобраться с его конкретной ситуацией.

Говори просто, тепло и по делу.
Если пользователь обращается по-русски — отвечай по-русски.
Если на другом языке — отвечай на том языке, который он использовал.

--------- Краткий контекст (фрагменты Устава и Манифеста, русская версия) ----------
${manifestoSlice}
-------------------------------------
${charterSlice}
-------------------------------------
${siteContextBlock}${pageContextBlock}
Страница, с которой задают вопрос: ${page}
Язык интерфейса: ${language}
    `.trim();

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

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages,
          max_tokens: 250,
          temperature: 0.4,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(
        "OpenAI Domovoy error:",
        response.status,
        text,
      );
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to get answer from OpenAI",
        }),
      };
    }

    const data = await response.json();
    const answer =
      data.choices?.[0]?.message?.content?.trim() ||
      "Я пока не могу ответить. Попробуй задать вопрос иначе.";

    const audioUrl = await synthesizeSpeech(answer, apiKey);

    return {
      statusCode: 200,
      body: JSON.stringify({ answer, audioUrl }),
    };
  } catch (e) {
    console.error("ai-domovoy handler error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error in ai-domovoy",
      }),
    };
  }
};
