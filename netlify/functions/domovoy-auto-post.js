// netlify/functions/domovoy-auto-post.js
//
// Авто-Домовой NovaCiv:
// 1) Раз в запуск создаёт один философский пост в духе Устава/Манифеста,
//    для трёх языков (ru/en/de).
// 2) Есть несколько типов постов:
//    - "charter_quote"      — мысль / микро-цитата из философии Устава/Манифеста;
//    - "question_to_reader" — небольшое рассуждение, которое приводит к вопросам к читателю;
//    - "term_explainer"     — разбор одного ключевого термина/принципа NovaCiv.
// 3) Сохраняет посты в Firebase (forum/topics, section: "news")
//    с пометкой postKind: "domovoy:<тип>".
// 4) Отправляет в соответствующие Telegram-каналы.
// 5) Запускать по крону через URL с token=DOMOVOY_CRON_SECRET.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL; // https://...firebaseio.com
const DOMOVOY_CRON_SECRET = process.env.DOMOVOY_CRON_SECRET || "";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID_EN =
  process.env.TELEGRAM_NEWS_CHAT_ID_EN ||
  process.env.TELEGRAM_NEWS_CHAT_ID ||
  process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU || "";
const TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE || "";

// Языковые конфиги
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

// Типы постов Домового
const POST_MODES = [
  "charter_quote",
  "question_to_reader",
  "term_explainer",
];

// Базовое философское ядро NovaCiv
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

Your general behaviour:
– You speak calmly, honestly and clearly.
– You do not use pathos, hype or manipulation.
– You do not sell anything and do not ask for money.
– You speak to a thinking adult who is tired of propaganda.

You will receive:
– target language code;
– post mode (one of: "charter_quote", "question_to_reader", "term_explainer").

For each mode:

1) "charter_quote"
   – Choose one principle from the philosophy above (for example: non-violence,
     direct referendum, body autonomy, open algorithms, fair economy, etc.).
   – Turn it into a short, strong statement that could be perceived as a quote
     of the community itself (but WITHOUT quoting any real people).
   – Then add a short explanation in 1–3 paragraphs.
   – Optionally, end with 1–2 short reflective questions.

2) "question_to_reader"
   – Build a short reflection (2–4 paragraphs) that leads to 2–4 explicit
     questions to the reader.
   – The questions must be written as full sentences ending with '?'.
   – They should invite the reader to think about their own role, freedoms,
     responsibility, or hopes.

3) "term_explainer"
   – Choose ONE key concept from the philosophy (for example: "non-violence",
     "direct referendum", "open code", "debt-free economy", "body autonomy",
     "anonymity with responsibility", "digital citizenship", etc.).
   – Explain it in simple language in 2–4 paragraphs:
       * give a definition in your own words,
       * show why it matters in everyday life,
       * show how it changes the way we live or organise a community.
   – At the end, add 1–2 short reflective questions.

Global constraints:
– The post must be self-contained and timeless (no news, no events of the day).
– Length: about 800–1300 characters in the target language (a few short paragraphs).
– No hashtags. No emojis. No bullet lists.
– Tone: honest, clear, slightly philosophical, but not pompous.
– No greeting at the beginning and no signature at the end
  (we add signature separately).

Output format:
Return strict JSON with two fields:
{
  "title": "Very short title, 3–8 words, no quotes",
  "content": "Main text of the post, with paragraphs separated by \\n\\n"
}
Do not add any other fields or any text outside the JSON.
`.trim();

function log(...args) {
  console.log("[domovoy-auto-post]", ...args);
}

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

async function saveToForum({ title, content, lang, postKind }) {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not set");
  }

  const now = Date.now();
  const payload = {
    title,
    content,
    section: "news",
    createdAt: now,
    createdAtServer: now,
    authorNickname: "Домовой NovaCiv",
    lang,
    sourceId: "domovoy",
    postKind,
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
  return data;
}

function buildTelegramText({ title, content, lang, manifestUrl, postKind }) {
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

  // Небольшая техническая пометка, какой тип поста (для отладки, можно убрать)
  if (postKind) {
    lines.push(`(Domovoy • ${postKind})`);
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  lines.push(`Posted via NovaCiv • ${stamp} UTC`);

  return lines.join("\n");
}

async function generatePostForLang(langCode, mode) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const langHint =
    langCode === "ru"
      ? "Write the JSON response in Russian."
      : langCode === "de"
      ? "Write the JSON response in German."
      : "Write the JSON response in English.";

  const userPrompt = `
Target language code: ${langCode}
Post mode: ${mode}

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

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
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

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

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

    // Выбираем один режим на запуск (одна тема, разные переводы)
    const mode =
      POST_MODES[Math.floor(Math.random() * POST_MODES.length)] ||
      "charter_quote";

    for (const cfg of LANG_CONFIG) {
      const { code, telegramChatId, manifestUrl } = cfg;

      try {
        const { title, content } = await generatePostForLang(code, mode);

        const postKind = `domovoy:${mode}`;

        const forumRes = await saveToForum({
          title,
          content,
          lang: code,
          postKind,
        });

        const telegramText = buildTelegramText({
          title,
          content,
          lang: code,
          manifestUrl,
          postKind,
        });

        let telegramResult = null;
        if (telegramChatId) {
          telegramResult = await sendToTelegram(telegramChatId, telegramText);
        }

        results.push({
          lang: code,
          title,
          postKind,
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
      body: JSON.stringify({ ok: true, mode, results }),
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
