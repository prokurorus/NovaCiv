// netlify/functions/ai-domovoy.js
//
// Мозг Домового NovaCiv.
// Теперь он:
// 1) Знает Манифест и Устав (из текстовых файлов).
// 2) Умеет по запросу цитировать и объяснять пункты Устава.
// 3) Подгружает свежий контекст с сайта из Firebase (лента и форум).
// 4) Принимает опциональный pageContext — текст текущей страницы/темы.
//
// ВАЖНО: поддерживает оба формата запроса:
//   - старый: { language, messages: [{ role, content }] }
//   - новый:  { lang, question, history: [{ role, text }] }

const fs = require("fs");
const path = require("path");

// ---------- ENV ----------
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || "";
const DEFAULT_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";

// ---------- Глобальные переменные ----------
let manifestoRU = null;
let charterRU = null;

// ---------- Загрузка текстов Манифеста и Устава ----------
function loadContext() {
  if (manifestoRU && charterRU) return;

  try {
    const rootDir = process.cwd();
    const manifestoPath = path.join(
      rootDir,
      "public",
      "texts",
      "manifest_ru.txt",
    );
    const charterPath = path.join(rootDir, "public", "texts", "charter_ru.txt");

    manifestoRU = fs.readFileSync(manifestoPath, "utf8");
    charterRU = fs.readFileSync(charterPath, "utf8");

    console.log("[ai-domovoy] Loaded manifesto & charter");
  } catch (e) {
    console.error("[ai-domovoy] Failed to load manifesto/charter:", e);
    manifestoRU = manifestoRU || "";
    charterRU = charterRU || "";
  }
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
    const postsUrl = `${FIREBASE_DB_URL}/forum/posts.json`;

    const [topicsRaw, postsRaw] = await Promise.all([
      fetchJSON(topicsUrl).catch(() => ({})),
      fetchJSON(postsUrl).catch(() => ({})),
    ]);

    // Превращаем темы в массив
    const topics = Object.entries(topicsRaw || {}).map(([id, t]) => ({
      id,
      ...(t || {}),
    }));

    // Сортируем по времени (последние сверху)
    const sortedTopics = topics.sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    );

    // ---------- БЛОК НОВОСТЕЙ (section === "news") ----------
    const newsItems = sortedTopics
      .filter((t) => (t.section || "").toLowerCase() === "news")
      .slice(0, 10);

    // --- КОРОТКИЕ НОВОСТИ ---
    const newsBlock =
      newsItems.length > 0
        ? newsItems.slice(0, 3)
            .map((n) => {
              const title = n.title || "(новость)";
              const content = n.content || n.text || "";
              const short = sliceText(content, 180);
              return `• ${title}\n  ${short}`;
            })
            .join("\n\n")
        : "";


    // ---------- БЛОК ФОРУМА (все темы, кроме news) ----------
    const discussionTopics = sortedTopics
      .filter((t) => (t.section || "").toLowerCase() !== "news")
      .slice(0, 10);

    const forumBlocks = [];

    for (const t of discussionTopics) {
      const topicPosts = Object.entries((postsRaw && postsRaw[t.id]) || {}).map(
        ([pid, p]) => ({ id: pid, ...(p || {}) }),
      );

      const lastComments = topicPosts
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 3);

      if (lastComments.length > 0) {
        forumBlocks.push(
          `Тема: ${t.title || "(без названия)"}\n` +
            lastComments
              .map((c) =>
                `– ${
                  c.authorNickname || c.author || "аноним"
                }: ${sliceText(
                  (c.text || c.content || "").toString(),
                  240,
                )}`,
              )
              .join("\n"),
        );
      }
    }

    const forumBlock =
      forumBlocks.length > 0 ? forumBlocks.join("\n\n") : "";

    const combined = [newsBlock, forumBlock].filter(Boolean).join("\n\n");

    return combined;
  } catch (e) {
    console.error("[ai-domovoy] Failed to load site context:", e);
    return "";
  }
}


// ---------- Генерация голосового ответа ----------

async function synthesizeSpeech(text, apiKey) {
  if (!text || !apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_TTS_MODEL,
        voice: DEFAULT_TTS_VOICE,
        input: text,
        format: "mp3",
      }),
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => "");
      console.error("[ai-domovoy] TTS error:", response.status, msg);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:audio/mp3;base64,${base64}`;
  } catch (e) {
    console.error("[ai-domovoy] TTS runtime error:", e);
    return null;
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
      model: "gpt-4.1-mini",
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

    // PUBLIC_MODE guard: строгая блокировка админских тем
    const normalizedUserText = userText.toLowerCase();
    const adminKeywords = [
      "admin", "админ", "админка", "админ-панель", "админ панель",
      "девопс", "devops", "ops-agent", "ops agent", "ops-agent.js",
      "auth", "авторизация", "jwt", "token", "токен",
      "secrets", "секреты", "secret", "секрет",
      "deploy", "деплой", "deployment", "деплоймент",
      "netlify", "github", "git", "repo", "репозиторий",
      "roles", "роли", "role", "роль",
      "tokens", "токены", "credentials", "credentials",
      "functions", "функции", "function", "функция",
      "pm2", "server", "сервер", "vps",
      "project_state", "project_context", "project state", "project context",
      "runbooks", "runbook", "операционные книги",
      "ops.md", "ops", "операции", "операционный",
      "source_of_truth", "source of truth",
      "nova-ops-agent", "nova-video", "nova-news-worker",
      "firebase", "firebase service account", "service account",
      "openai_api_key", "openai api key", "api key",
      "youtube", "telegram", "bot token"
    ];
    const isAdminTopic = adminKeywords.some(keyword => normalizedUserText.includes(keyword));
    
    if (isAdminTopic) {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          answer: "Это внутренние вопросы администрирования. Пожалуйста, обратитесь через админ-панель (/admin)."
        }),
      };
    }

    // 1. Попробовать выдать цитату Устава
    const citation = tryHandleCitation(userText, incomingMessages);
    if (citation) {
      const audioUrl = await synthesizeSpeech(citation, apiKey);
      return {
        statusCode: 200,
        body: JSON.stringify({ answer: citation, audioUrl }),
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

КРИТИЧЕСКИ ВАЖНО:
— Ты НЕ имеешь доступа к админской памяти (PROJECT_STATE.md, PROJECT_CONTEXT.md, runbooks)
— Ты НЕ можешь обсуждать: админ-панель, ops-agent, сервер, деплой, токены, секреты, инфраструктуру
— Если тебя спрашивают об админских/операционных темах — вежливо откажись и направь в /admin
— Ты публичный помощник, только философия NovaCiv, Манифест и Устав

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
Если вопрос философский — отвечай спокойно и честно, не уходя в пафос и абстракции.
Если вопрос практический — давай рекомендации в рамках разумного и честного взгляда NovaCiv.

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
        model: "gpt-4.1-mini",
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
        "[ai-domovoy] OpenAI error:",
        completion.status,
        text.slice(0, 200),
      );
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "OpenAI request failed",
        }),
      };
    }

    const data = await completion.json();
    const answer =
      data.choices?.[0]?.message?.content ||
      "Я пока не могу ответить. Попробуй задать вопрос иначе.";

    const audioUrl = await synthesizeSpeech(answer, apiKey);

    return {
      statusCode: 200,
      body: JSON.stringify({ answer, audioUrl }),
    };
  } catch (e) {
    console.error("[ai-domovoy] Handler error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Server Error",
      }),
    };
  }
};
