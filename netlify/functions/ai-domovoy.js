// netlify/functions/ai-domovoy.js
//
// Мозг Домового NovaCiv.
// Сейчас он:
// 1) Знает Манифест и Устав (из текстовых файлов).
// 2) Умеет по запросу цитировать и объяснять пункты Устава.
// 3) Подгружает свежий контекст с сайта из Firebase (лента и форум).
// 4) Принимает опциональный pageContext — текст текущей страницы/темы.
// 5) Работает мягко: даже при ошибках не роняет фронт, а честно говорит, что что-то не так.
//
// Поддерживает оба формата запроса:
//   - старый: { language, messages: [{ role, content }] }
//   - новый:  { lang, question, history: [{ role, text }] }

const fs = require("fs");
const path = require("path");

// ---------- ENV ----------
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || "";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---------- Глобальные переменные ----------
let manifestoRU = null;
let charterRU = null;

// ---------- Вспомогательные функции ----------

function loadFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    console.error("Failed to load file:", filePath, e);
    return "";
  }
}

function loadContext() {
  if (manifestoRU && charterRU) return;

  const rootDir = process.cwd();
  const manifestoPath = path.join(
    rootDir,
    "public",
    "texts",
    "manifest_ru.txt",
  );
  const charterPath = path.join(rootDir, "public", "texts", "charter_ru.txt");

  manifestoRU = loadFileSafe(manifestoPath);
  charterRU = loadFileSafe(charterPath);

  console.log("[ai-domovoy] Context loaded:", {
    manifestoLength: manifestoRU.length,
    charterLength: charterRU.length,
  });
}

function sliceText(text, maxLen) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function normalize(text) {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .replace(/[—–]/g, "-")
    .trim()
    .toLowerCase();
}

// ---------- Работа с Firebase (лента+форум) ----------

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch ${url}: ${res.status} – ${txt.slice(0, 200)}`,
    );
  }
  return res.json();
}

async function loadSiteContext(language) {
  if (!FIREBASE_DB_URL) {
    console.warn("[ai-domovoy] FIREBASE_DB_URL is not set, site context OFF");
    return "";
  }

  try {
    const topicsUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
    const commentsUrl = `${FIREBASE_DB_URL}/forum/comments.json`;
    const newsUrl = `${FIREBASE_DB_URL}/newsFeed.json`;

    const [topicsRaw, commentsRaw, newsRaw] = await Promise.all([
      fetchJSON(topicsUrl).catch(() => ({})),
      fetchJSON(commentsUrl).catch(() => ({})),
      fetchJSON(newsUrl).catch(() => ({})),
    ]);

    const topics = Object.entries(topicsRaw || {}).map(([id, t]) => ({
      id,
      ...(t || {}),
    }));

    const recentTopics = topics
      .filter((t) => !t.section || t.section === "general")
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 10);

    const commentsBlocks = [];
    for (const t of recentTopics) {
      const topicComments = Object.entries(commentsRaw?.[t.id] || {}).map(
        ([cid, c]) => ({
          id: cid,
          ...(c || {}),
        }),
      );
      const lastComments = topicComments
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 3);

      if (lastComments.length > 0) {
        commentsBlocks.push(
          `Тема: ${t.title || "(без названия)"}\n` +
            lastComments
              .map(
                (c) =>
                  `– ${c.author || "аноним"}: ${sliceText(
                    c.text || "",
                    240,
                  )}`,
              )
              .join("\n"),
        );
      }
    }

    const newsItems = Object.entries(newsRaw || {})
      .map(([id, n]) => ({ id, ...(n || {}) }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 10);

    const newsBlock =
      newsItems.length > 0
        ? newsItems
            .map(
              (n) =>
                `• ${sliceText(
                  n.title || n.text || "(новость)",
                  200,
                )}`.trim(),
            )
            .join("\n")
        : "";

    const forumBlock =
      commentsBlocks.length > 0 ? commentsBlocks.join("\n\n") : "";

    const combined = [newsBlock, forumBlock].filter(Boolean).join("\n\n");

    return combined;
  } catch (e) {
    console.error("[ai-domovoy] Failed to load site context:", e);
    return "";
  }
}

// ---------- Поиск пунктов Устава ----------

function extractCharterSections(charterText) {
  const lines = charterText.split(/\r?\n/);
  const sections = [];
  let current = null;
  const punktRegex = /^(\d+\.\d+)\s+(.*)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const m = trimmed.match(punktRegex);
    if (m) {
      if (current) sections.push(current);
      current = {
        id: m[1],
        title: "",
        bodyLines: [],
      };
      const rest = m[2].trim();
      if (rest) current.title = rest;
    } else if (current) {
      current.bodyLines.push(trimmed);
    }
  }

  if (current) sections.push(current);
  return sections;
}

function findFirstSection() {
  if (!charterRU) return null;
  const sections = extractCharterSections(charterRU);
  return sections.length > 0 ? sections[0] : null;
}

function findSectionById(id) {
  if (!charterRU) return null;
  const sections = extractCharterSections(charterRU);
  return sections.find((s) => s.id === id) || null;
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

function tryRecognizeFirstPunkt(text) {
  const t = normalize(text);

  if (t.includes("самый первый пункт") || t.includes("первый пункт")) {
    return "FIRST";
  }

  if (t.includes("пункт") && t.includes("перв")) {
    const first = findFirstSection();
    return first ? first.id : null;
  }

  return null;
}

function tryHandleCitation(userText, historyMessages) {
  const t = normalize(userText);
  if (!t) return null;

  const asksForCitation =
    t.includes("цитируй") ||
    t.includes("процитируй") ||
    t.includes("покажи пункт") ||
    t.includes("дай пункт") ||
    t.includes("сошлись на пункт");

  const mentionsPunkt = t.includes("пункт");

  if (!asksForCitation && !mentionsPunkt) return null;

  const explicitId = tryExtractPunktIdFromText(userText);
  const firstMarker = tryRecognizeFirstPunkt(userText);

  let targetSection = null;

  if (explicitId) {
    targetSection = findSectionById(explicitId);
  } else if (firstMarker === "FIRST") {
    targetSection = findFirstSection();
  }

  if (targetSection) {
    const body = targetSection.bodyLines.join(" ");
    return `Пункт Устава ${targetSection.id}:\n${targetSection.title}\n\n${body}`;
  }

  if (asksForCitation && mentionsPunkt) {
    return "Уточни, пожалуйста, номер пункта Устава, который тебя интересует (например, 0.0, 1.1 и т.п.), или скажи: «самый первый пункт устава».";
  }

  return null;
}

// ---------- Объяснение процитированного пункта ----------

async function tryHandleExplain(userText, historyMessages, language, apiKey) {
  const t = normalize(userText);
  if (!t) return null;

  const asksExplain =
    t.includes("объясни") ||
    t.includes("растолкуй") ||
    t.includes("что это значит") ||
    t.includes("что значит") ||
    t.includes("расскажи смысл");

  if (!asksExplain) return null;

  const lastCitation = [...historyMessages]
    .reverse()
    .find(
      (m) =>
        m.role === "assistant" &&
        typeof m.content === "string" &&
        m.content.includes("Пункт Устава"),
    );

  if (!lastCitation) {
    return "Сначала попроси меня процитировать конкретный пункт Устава, а потом уже — объяснить, что он значит.";
  }

  const prompt = `
Ты — Домовой NovaCiv, цифровой помощник и философ.
Пользователь попросил объяснить смысл процитированного ранее пункта Устава.

Вот цитата, которую ты давал ранее:
${lastCitation.content}

Теперь спокойно и понятно объясни, что это значит, зачем этот пункт нужен и как он связан с философией NovaCiv. Пиши на том же языке, на котором с тобой говорит пользователь.
`;

  const completion = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Ты — Домовой NovaCiv, мудрый и спокойный цифровой помощник. Объясняй нормы Устава и философию сообщества простым и честным языком. Не обещай того, чего в Уставе нет.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
    }),
  });

  if (!completion.ok) {
    const text = await completion.text().catch(() => "");
    console.error(
      "[ai-domovoy] OpenAI explain error:",
      completion.status,
      text.slice(0, 200),
    );
    // В случае ошибки не роняем всё — просто возвращаем null, чтобы пойти обычным путём.
    return null;
  }

  const data = await completion.json();
  const answer =
    data.choices?.[0]?.message?.content ||
    "Я пока не могу объяснить этот пункт. Попробуй переформулировать вопрос.";
  return answer;
}

// ---------- Основной handler ----------

exports.handler = async (event) => {
  // Никогда не роняем фронт: все ответы == 200, ошибки внутри JSON.
  try {
    loadContext();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer:
            "Сейчас на сервере не настроен ключ OpenAI. Я не могу говорить, но это исправим.",
          error: "OPENAI_API_KEY is not configured",
        }),
      };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");

    // Поддерживаем оба формата: старый (language, messages) и новый (lang, history, question, text)
    const language = body.lang || body.language || "ru";
    const page = body.page || "/";

    const incomingRaw = Array.isArray(body.messages)
      ? body.messages
      : Array.isArray(body.history)
      ? body.history
      : [];

    const incomingMessages = incomingRaw.map((m) => ({
      role: m.role || m.sender || "user",
      content: m.content || m.text || "",
    }));

    const rawPageContext =
      typeof body.pageContext === "string" ? body.pageContext : "";
    const pageContext = sliceText(rawPageContext, 8000);

    const lastUser =
      [...incomingMessages]
        .reverse()
        .find((m) => m.role === "user" && m.content) || null;

    const userTextFromHistory = lastUser?.content || "";
    const userText =
      typeof body.question === "string" && body.question.trim()
        ? body.question.trim()
        : userTextFromHistory;

    // 1. Попробовать выдать цитату Устава
    const citation = tryHandleCitation(userText, incomingMessages);
    if (citation) {
      return {
        statusCode: 200,
        body: JSON.stringify({ answer: citation }),
      };
    }

    // 2. Попробовать объяснить уже процитированный пункт
    const explained = await tryHandleExplain(
      userText,
      incomingMessages,
      language,
      apiKey,
    );
    if (explained) {
      return {
        statusCode: 200,
        body: JSON.stringify({ answer: explained }),
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

    const historyForModel = incomingMessages
      .slice(-10)
      .map(
        (m) =>
          `${m.role === "user" ? "Пользователь" : "Домовой"}: ${m.content}`,
      )
      .join("\n");

    const systemPrompt = `
Ты — Домовой NovaCiv, цифровой Дух дома Новой Цивилизации.
Ты дружелюбен, честен и спокоен. Ты помнишь философию сообщества:
— без насилия,
— без правителей,
— без манипуляций,
— с уважением к разуму и свободе.

Твоя задача:
— отвечать прямо и честно,
— опираться на Манифест и Устав,
— не обещать невозможного,
— не подменять волю Граждан.

Если тебя спрашивают о чём-то вне философии и Устава — отвечай как разумный помощник, признавая границы своих знаний.
`;

    const userPrompt = `
Пользователь задаёт вопрос Домовому.

Язык общения: ${language}.
Страница сайта: ${page}.

Вот фрагменты Манифеста (на русском):
${manifestoSlice}

Вот фрагменты Устава (на русском):
${charterSlice}

Если вопрос явно относится к Уставу или Манифесту — ссылайся на них по смыслу.
Если вопрос философский — отвечай спокойно и честно, не впадая в пафос.

История последних сообщений:
${historyForModel}

Дополнительный контекст с сайта:
${siteContextBlock}

Контекст текущей страницы (если есть):
${pageContextBlock}

Вопрос пользователя:
${userText || "(вопрос не распознан)"}\n`;

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.5,
      }),
    });

    if (!completion.ok) {
      const text = await completion.text().catch(() => "");
      console.error(
        "[ai-domovoy] OpenAI main error:",
        completion.status,
        text.slice(0, 200),
      );
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer:
            "Сейчас у меня проблемы со связью с основным мозгом. Попробуй задать вопрос чуть позже.",
          error: "OpenAI request failed",
        }),
      };
    }

    const data = await completion.json();
    const answer =
      data.choices?.[0]?.message?.content ||
      "Я пока не могу ответить. Попробуй задать вопрос иначе.";

    return {
      statusCode: 200,
      body: JSON.stringify({ answer }),
    };
  } catch (e) {
    console.error("[ai-domovoy] Handler fatal error:", e);
    return {
      statusCode: 200,
      body: JSON.stringify({
        answer:
          "Кажется, я запутался в проводах. На стороне сервера произошла ошибка, но платформа жива. Попробуй ещё раз или переформулируй вопрос.",
        error: "Internal Server Error",
      }),
    };
  }
};
