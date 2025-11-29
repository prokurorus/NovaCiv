// netlify/functions/domovoy-auto-post.js
//
// Авто-Домовой NovaCiv:
// 1) Раз в запуск создаёт один философский пост в духе Устава/Манифеста.
// 2) Делает версии на ru/en/de.
// 3) Сохраняет в Firebase (forum/topics, section: "news").
// 4) Отправляет в соответствующие Telegram-каналы.
//
// ВАЖНО: не делает новостей про мир, а именно внутренние "голос" и идеи NovaCiv.
// Запускать по крону: например, раз в 1–3 часа через Netlify Scheduler
// или внешний cron с GET/POST на /.netlify/functions/domovoy-auto-post?token=XXX.

// --- ENV ---

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL; // https://...firebaseio.com
const DOMOVOY_CRON_SECRET = process.env.DOMOVOY_CRON_SECRET || "";

// Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID_EN =
  process.env.TELEGRAM_NEWS_CHAT_ID_EN ||
  process.env.TELEGRAM_NEWS_CHAT_ID ||
  process.env.TELEGRAM_CHAT_ID;

const TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU || "";
const TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE || "";

// --- КОНФИГ ЯЗЫКОВ ---

const LANG_CONFIG = [
  {
    code: "ru",
    label: "Russian",
    telegramChatId: TELEGRAM_NEWS_CHAT_ID_RU,
    manifestUrl: "https://novaciv.space/manifest",
  },
  {
    code: "en",
    label: "English",
    telegramChatId: TELEGRAM_NEWS_CHAT_ID_EN,
    manifestUrl: "https://novaciv.space/manifest",
  },
  {
    code: "de",
    label: "German",
    telegramChatId: TELEGRAM_NEWS_CHAT_ID_DE,
    manifestUrl: "https://novaciv.space/manifest",
  },
];

const TAGLINE_BY_LANG = {
  ru: "Цифровое сообщество без правителей — только граждане.",
  en: "Digital community without rulers — only citizens.",
  de: "Digitale Gemeinschaft ohne Herrscher – nur Bürger.",
};

// --- PROMPTS ---

// Общее описание философии NovaCiv для Домового
const NOVACIV_CORE_PHILOSOPHY = `
NovaCiv — цифровое сообщество и будущая цивилизация со следующими опорами:

– никакой власти над людьми: решения принимает только референдум граждан;
– ненасилие и отказ от принуждения как норма;
– свобода человека распоряжаться своим телом, жизнью, информацией и трудом;
– справедливость, основанная на договоре и прозрачных правилах;
– разум и жизнь важнее любой материи, денег и собственности;
– отказ от долгового рабства и монополий, собственная внутренняя экономика;
– открытая цифровая архитектура, понятные алгоритмы, отсутствие чёрных ящиков;
– поддержка науки, культуры и созидательного труда как ядра развития;
– анонимность и приватность при честной защите от накруток и манипуляций;
– автономия локальных сообществ, но общие принципы для всех.

Домовой — это тихий хранитель этих идей. Он не продавец и не пропагандист,
а собеседник, который умеет объяснять сложное простыми словами и задавать
честные вопросы читателю.
`.trim();

const SYSTEM_PROMPT_DOMOVOY = `
You are "Domovoy" — the house AI of the digital community "NovaCiv".

NovaCiv core philosophy (shortened):
${NOVACIV_CORE_PHILOSOPHY}

Your task now:
– Generate a short, self-contained post based on the principles above.
– The post should feel like a calm thoughtful note from the community itself.
– It may refer to ideas from the Charter and Manifesto (direct democracy, non-violence,
  scientific thinking, personal autonomy, fair economy, open algorithms, etc.).
– No news, no references to fresh events, only timeless thoughts.

VERY IMPORTANT:
– The post must be suitable to publish as-is in social networks.
– No greeting at the beginning and no signature at the end (we add signature separately).
– Length: about 800–1300 characters in the target language (roughly a few short paragraphs).
– No hashtags, no emojis, no bullet lists.
– Tone: honest, clear, slightly philosophical, but not pompous.
– Avoid pathos; speak simply, as if to a thoughtful adult reader.

Output format:
Return strict JSON with two fields:
{
  "title": "Very short title, 3–8 words, no quotes",
  "content": "Main text of the post, with paragraphs separated by \\n\\n"
}
Do not add any other fields or text outside the JSON.
`.trim();

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function log(...args) {
  console.log("[domovoy-auto-post]", ...args);
}

// Отправка в Telegram
async function sendToTelegram(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    return { ok: false, skipped: true, reason: "no bot token or chatId" };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!data.ok) {
    log("Telegram error:", data);
  }
  return data;
}

// Сохранение поста Домового в форум NovaCiv
async function saveToForum({ title, content, lang }) {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not set");
  }

  const now = Date.now();
  const payload = {
    title,
    content,
    section: "news", // чтобы появлялось в общей ленте движения
    createdAt: now,
    createdAtServer: now,
    authorNickname: "Домовой NovaCiv",
    lang,
    sourceId: "domovoy",
  };

  const res = await fetch(`${FIREBASE_DB_URL}/forum/topics.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firebase write error: HTTP ${res.status} – ${text}`);
  }

  const data = await res.json();
  return data; // { name: "...id..." }
}

// Построение текста для Telegram
function buildTelegramText({ title, content, lang, manifestUrl }) {
  const lines = [];

  if (title) {
    lines.push(title);
    lines.push("");
  }

  lines.push(content.trim());
  lines.push("");

  const tagline =
    TAGLINE_BY_LANG[lang] || TAGLINE_BY_LANG.en || TAGLINE_BY_LANG.ru;

  lines.push(tagline);
  if (manifestUrl) {
    lines.push(`Подробнее: ${manifestUrl}`);
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  lines.push(`Posted via NovaCiv • ${stamp} UTC`);

  return lines.join("\n");
}

// Вызов OpenAI для генерации поста на заданном языке
async function generatePostForLang(langCode) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // Уточнение языка в user-сообщении
  const langHint =
    langCode === "ru"
      ? "Write the JSON response in Russian."
      : langCode === "de"
      ? "Write the JSON response in German."
      : "Write the JSON response in English.";

  const userPrompt = `
Target language code: ${langCode}

${langHint}
`.trim();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_DOMOVOY },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 900,
      temperature: 0.55,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI API error: HTTP ${resp.status} – ${text}`);
  }

  const data = await resp.json();

  const content =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "";

  if (!content) {
    throw new Error("Empty response from OpenAI for Domovoy");
  }

  // Пытаемся разобрать JSON
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // На всякий случай грубый fallback: ищем JSON внутри текста
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Domovoy answer is not valid JSON");
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "NovaCiv reflection";

  const body =
    typeof parsed.content === "string" && parsed.content.trim()
      ? parsed.content.trim()
      : "";

  if (!body) {
    throw new Error("Domovoy JSON has empty content");
  }

  return { title, content: body };
}

// --- HANDLER ---

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Простой секрет для крон-запросов
    if (DOMOVOY_CRON_SECRET) {
      const qs = event.queryStringParameters || {};
      if (!qs.token || qs.token !== DOMOVOY_CRON_SECRET) {
        return { statusCode: 403, body: "Forbidden" };
      }
    }

    if (!OPENAI_API_KEY || !FIREBASE_DB_URL) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "OPENAI_API_KEY или FIREBASE_DB_URL не заданы.",
        }),
      };
    }

    const results = [];

    for (const cfg of LANG_CONFIG) {
      const { code, telegramChatId, manifestUrl } = cfg;

      // Если для языка нет канала и ты пока не хочешь постить — всё равно
      // создаём запись в ленте, но Telegram можно пропустить.
      try {
        // 1) Генерируем пост
        const { title, content } = await generatePostForLang(code);

        // 2) Сохраняем в форум
        const forumRes = await saveToForum({
          title,
          content,
          lang: code,
        });

        // 3) Готовим текст для Telegram
        const telegramText = buildTelegramText({
          title,
          content,
          lang: code,
          manifestUrl,
        });

        // 4) Отправляем в канал (если есть)
        let telegramResult = null;
        if (telegramChatId) {
          telegramResult = await sendToTelegram(telegramChatId, telegramText);
        }

        results.push({
          lang: code,
          title,
          forumId: forumRes && forumRes.name ? forumRes.name : null,
          telegramOk: telegramResult ? !!telegramResult.ok : false,
        });
      } catch (e) {
        log("Error for lang", cfg.code, e);
        results.push({
          lang: cfg.code,
          error: String(e && e.message ? e.message : e),
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, results }),
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
