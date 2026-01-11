// netlify/functions/domovoy-daily-video.js
//
// Ежедневная автоматическая генерация видео от Домового
//
// Что делает:
// 1) Генерирует короткий текст от Домового (для видео)
// 2) Получает text + lang от Домового
// 3) Создаёт 2 задачи в Firebase videoJobs:
//    - YouTube: 12-20 сек
//    - Telegram: 5-8 сек (в канал соответствующего языка)
// 4) Защищён токеном DOMOVOY_CRON_SECRET
//
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const DOMOVOY_CRON_SECRET = process.env.DOMOVOY_CRON_SECRET || "";

// Модель OpenAI для текста
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Поддерживаемые языки
const LANG_CONFIG = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
];

function log(...args) {
  console.log("[domovoy-daily-video]", ...args);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getLangConfig(langCode) {
  return LANG_CONFIG.find((l) => l.code === langCode) || LANG_CONFIG[0];
}

function buildSystemPrompt(langCode) {
  if (langCode === "ru") {
    return `Ты — Домовой цифровой цивилизации NovaCiv. Ты говоришь по-русски, знаешь Манифест и Устав NovaCiv.
Твоя задача — создать короткий текст для видео (12-20 секунд озвучки).
Текст должен быть простым, глубоким, без пафоса. Одна яркая мысль о свободе, разуме, справедливости или будущем цивилизации.`;
  }
  if (langCode === "de") {
    return `Du bist der Hausgeist der digitalen Zivilisation NovaCiv. Du sprichst Deutsch, kennst das Manifest und die Charta von NovaCiv.
Deine Aufgabe ist es, einen kurzen Text für ein Video zu erstellen (12-20 Sekunden Sprachausgabe).
Der Text soll einfach, tiefgründig und ohne Pathos sein. Ein klarer Gedanke über Freiheit, Bewusstsein, Gerechtigkeit oder die Zukunft der Zivilisation.`;
  }
  if (langCode === "es") {
    return `Eres el espíritu doméstico de la civilización digital NovaCiv. Hablas español, conoces el Manifiesto y la Carta de NovaCiv.
Tu tarea es crear un texto corto para un video (12-20 segundos de narración).
El texto debe ser simple, profundo, sin patetismo. Un pensamiento claro sobre libertad, conciencia, justicia o el futuro de la civilización.`;
  }
  // en и всё остальное
  return `You are the house spirit of the digital civilization NovaCiv. You speak English, know the NovaCiv Manifesto and Charter.
Your task is to create a short text for a video (12-20 seconds of narration).
The text should be simple, deep, without pomp. One clear thought about freedom, consciousness, justice, or the future of civilization.`;
}

function buildUserPrompt(langCode) {
  const langName =
    langCode === "ru"
      ? "по-русски"
      : langCode === "de"
      ? "auf Deutsch"
      : langCode === "es"
      ? "en español"
      : "in English";

  return `Создай ${langName} короткий текст для видео (12-20 секунд озвучки), который:
- содержит одну яркую мысль из философии NovaCiv (о свободе, разуме, справедливости, ненасилии, прямой демократии);
- написан простым, человеческим языком;
- без пафоса, но с глубиной;
- заканчивается мягким приглашением подумать или узнать больше;
- НЕ содержит ссылок на статьи Устава или номера пунктов;
- НЕ содержит эмодзи или хештегов.

Текст должен быть готов для озвучки через TTS (текст-в-речь).
Верни ТОЛЬКО текст, без дополнительных пояснений, без JSON, без кавычек.`;
}

async function generateVideoText(langCode) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const systemPrompt = buildSystemPrompt(langCode);
  const userPrompt = buildUserPrompt(langCode);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200, // Ограничиваем длину для коротких видео
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: HTTP ${response.status} – ${text}`);
  }

  const data = await response.json();
  const content =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  // Очищаем текст от кавычек и лишних символов
  const cleanText = content
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^```[\w]*\n?|\n?```$/g, "")
    .trim();

  if (!cleanText) {
    throw new Error("Cannot extract text from OpenAI response");
  }

  return cleanText;
}

async function createVideoJob({ text, lang, platform, maxDurationSec }) {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not set");
  }

  const now = Date.now();
  const job = {
    createdAt: now,
    language: lang,
    script: text,
    title: `NovaCiv Daily Video (${platform})`,
    topic: text.substring(0, 100), // Первые 100 символов как topic
    caption: `NovaCiv — novaciv.space`,
    status: "pending",
    platform: platform, // "youtube" или "telegram"
    maxDurationSec: maxDurationSec,
    source: "domovoy-daily-video",
  };

  const res = await fetch(`${FIREBASE_DB_URL}/videoJobs.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firebase write error: HTTP ${res.status} – ${text}`);
  }

  const data = await res.json();
  return data.name || null;
}

exports.handler = async (event) => {
  // Ограничим метод
  if (event.httpMethod && event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
    };
  }

  // Проверка токена
  if (DOMOVOY_CRON_SECRET) {
    const qs = event.queryStringParameters || {};
    if (!qs.token || qs.token !== DOMOVOY_CRON_SECRET) {
      return { statusCode: 403, body: "Forbidden" };
    }
  }

  try {
    const qs = event.queryStringParameters || {};
    const forcedLang = qs.lang || null;

    // Выбираем язык (по умолчанию случайный из поддерживаемых)
    const langCode = forcedLang || pickRandom(LANG_CONFIG.map((l) => l.code));

    const langCfg = getLangConfig(langCode);
    log("Generating video text:", { lang: langCfg.code });

    // Генерируем текст от Домового
    const text = await generateVideoText(langCfg.code);
    log("Generated text:", text.substring(0, 100) + "...");

    // Создаём 2 задачи: YouTube и Telegram
    const youtubeJobId = await createVideoJob({
      text,
      lang: langCfg.code,
      platform: "youtube",
      maxDurationSec: 20, // Максимум 20 сек для YouTube (12-20 сек)
    });

    const telegramJobId = await createVideoJob({
      text,
      lang: langCfg.code,
      platform: "telegram",
      maxDurationSec: 8, // Максимум 8 сек для Telegram (5-8 сек)
    });

    log("Created jobs:", {
      youtube: youtubeJobId,
      telegram: telegramJobId,
      lang: langCfg.code,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        lang: langCfg.code,
        text: text.substring(0, 100) + "...", // Первые 100 символов для лога
        youtubeJobId,
        telegramJobId,
      }),
    };
  } catch (err) {
    log("Fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(err && err.message ? err.message : err),
      }),
    };
  }
};
