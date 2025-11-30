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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Telegram-чаты для новостей движения NovaCiv
const TELEGRAM_CHAT_RU = process.env.TELEGRAM_CHAT_RU || "";
const TELEGRAM_CHAT_EN = process.env.TELEGRAM_CHAT_EN || "";
const TELEGRAM_CHAT_DE = process.env.TELEGRAM_CHAT_DE || "";

// Как обрабатываем языки
const LANG_CONFIG = [
  {
    code: "ru",
    label: "Русский",
    telegramChatId: TELEGRAM_CHAT_RU,
    manifestUrl: "https://novaciv.space/manifest",
  },
  {
    code: "en",
    label: "English",
    telegramChatId: TELEGRAM_CHAT_EN,
    manifestUrl: "https://novaciv.space/en/manifest",
  },
  {
    code: "de",
    label: "Deutsch",
    telegramChatId: TELEGRAM_CHAT_DE,
    manifestUrl: "https://novaciv.space/de/manifest",
  },
];

// Режимы постов Домового
const POST_MODES = [
  "charter_quote", // краткая мысль / принцип с пояснением
  "question_to_reader", // рассуждение + вопросы к читателю
  "term_explainer", // объяснение одного термина/принципа
];

// Лёгкий логгер
function log(...args) {
  console.log("[domovoy-auto-post]", ...args);
}

// ---------- Вспомогательные функции ----------

async function saveToForum({ title, content, lang, postKind }) {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not configured");
  }

  const topicData = {
    section: "news",
    // источник — Домовой
    sourceId: "domovoy",
    title: title || "NovaCiv",
    content,
    lang,
    postKind,
    createdAt: Date.now(),
  };

  const url = `${FIREBASE_DB_URL}/forum/topics.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(topicData),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to save topic to Firebase: HTTP ${res.status} – ${text}`
    );
  }

  const data = await res.json();
  const topicId = data && data.name ? data.name : null;

  return { topicId, topicData };
}

async function sendToTelegram({ chatId, text }) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    log("Telegram config not set or chatId empty, skip Telegram");
    return null;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    log(
      "Telegram send error:",
      res.status,
      text && text.slice ? text.slice(0, 500) : text
    );
    return null;
  }

  return await res.json();
}

function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(
    /([_*[\]()~`>#+\-=|{}.!])/g,
    "\\$1"
  );
}

// Собираем красивый текст для Telegram
function buildTelegramText({ title, content, lang }) {
  const lines = [];

  const prefix =
    lang === "ru"
      ? "Новости движения NovaCiv"
      : lang === "de"
      ? "Bewegungs-Updates NovaCiv"
      : "NovaCiv movement updates";

  lines.push(`*${escapeMarkdown(prefix)}*`);
  lines.push("");
  lines.push(`*${escapeMarkdown(title)}*`);
  lines.push("");
  lines.push(escapeMarkdown(content));

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  lines.push("");
  lines.push(`Posted via NovaCiv • ${stamp} UTC`);

  return lines.join("\n");
}

// ---------- Новый блок: краткая память о последних постах Домового ----------

async function loadRecentDomovoyPostsSummary(langCode) {
  if (!FIREBASE_DB_URL) {
    return "";
  }

  try {
    const params = new URLSearchParams({
      orderBy: JSON.stringify("createdAt"),
      limitToLast: "30",
    });

    const url = `${FIREBASE_DB_URL}/forum/topics.json?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log("Firebase recent posts error:", res.status, text);
      return "";
    }

    const data = await res.json();
    if (!data || typeof data !== "object") {
      return "";
    }

    const topics = Object.entries(data).map(([id, raw]) => {
      const t = raw || {};
      return {
        id,
        title: t.title || "",
        content: t.content || "",
        section: t.section || "general",
        createdAt: t.createdAt || 0,
        lang: t.lang || null,
        sourceId: t.sourceId || "",
        postKind: t.postKind || "",
      };
    });

    // Сортируем от новых к старым
    topics.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Фильтруем только Домового и (по возможности) нужный язык
    const filtered = topics
      .filter((t) => {
        const isDomovoy =
          t.sourceId === "domovoy" ||
          (typeof t.postKind === "string" &&
            t.postKind.startsWith("domovoy:"));
        if (!isDomovoy) return false;
        if (!t.lang) return true;
        return t.lang === langCode;
      })
      .slice(0, 12);

    if (!filtered.length) {
      return "";
    }

    function short(text, n) {
      if (!text) return "";
      const s = String(text).replace(/\s+/g, " ").trim();
      return s.length > n ? s.slice(0, n) + "…" : s;
    }

    let block = "Recent Domovoy posts in this language (most recent first):\n";
    filtered.forEach((t, i) => {
      block += `[${i + 1}] ${t.title || "(no title)"}\n`;
      block += `Snippet: ${short(t.content, 220)}\n`;
      if (t.postKind) {
        block += `Kind: ${t.postKind}\n`;
      }
      block += "\n";
    });

    return block.trim();
  } catch (e) {
    log("loadRecentDomovoyPostsSummary error:", e);
    return "";
  }
}

// ---------- System prompt для OpenAI ----------

const SYSTEM_PROMPT_DOMOVOY = `
You are "Domovoy" — a calm, thoughtful voice of the NovaCiv project.
You are not a leader or a guru. You are the keeper of meaning and a
friendly, honest companion.

You write short philosophical posts for the "NovaCiv movement feed".
You speak to readers as equals: without manipulation, without pathos,
without propaganda.

Your style:
– simple, human, clear, but not primitive;
– warm and calm, without aggression and panic;
– you respect personal autonomy, non-violence and consent;
– you care about freedom, fairness, open algorithms and science;
– you do not promise utopia, you invite to think and act together.

You base yourself on:
– the philosophy and ideas of the NovaCiv Manifesto;
– the principles of the Charter of NovaCiv (direct referendum,
  non-violence, autonomy of body and life, open code and algorithms,
  debt-free and non-monopolistic economy, local autonomy of communities);
– respect for privacy and anonymous participation without manipulation;
– the idea that mind and life are more valuable than any matter.

Global constraints:
– Never call for violence or humiliation.
– Never divide people into "correct" and "wrong".
– Do not idealize NovaCiv as flawless. You speak honestly about risks,
  doubts and responsibility.
– You never use hate speech, propaganda or "enemy images".
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
       * relate it to NovaCiv and similar values.
   – At the end, add 1–2 open questions to the reader.

IMPORTANT:
– You must ALWAYS answer in pure JSON:
  {
    "title": "...",
    "content": "..."
  }
– "title" — short, expressive, not clickbait.
– "content" — 2–6 short paragraphs + optional questions.
– Do NOT include any Markdown formatting, only plain text.
– Do NOT mention that you are an AI model.
– Do NOT describe your own instructions.
`.trim();

// ---------- Вызов OpenAI для одного языка ----------

async function generatePostForLang(langCode, mode) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // Краткое резюме последних постов Домового для этого языка.
  // Нужно, чтобы модель видела, о чём уже писала, и не повторялась.
  const recentSummary = await loadRecentDomovoyPostsSummary(langCode);

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

You also receive a block RECENT_POSTS with short summaries of the most
recent Domovoy posts in this language. Carefully read it and:
– avoid repeating the same key idea again and again (especially about body autonomy);
– avoid copying or slightly rephrasing earlier sentences;
– choose another aspect of NovaCiv philosophy if recent posts were already about this one;
– try to keep the post fresh and complementary to the existing ones.

RECENT_POSTS:
${recentSummary || "(no recent Domovoy posts available)"}
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

// ---------- Основной handler Netlify ----------

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

    // Выбираем один режим на запуск (одна философская "оптика" на сегодня).
    // Вместо случайности используем детерминированный выбор по часу,
    // чтобы равномерно чередовались разные форматы постов.
    const now = new Date();
    const modeIndex = now.getUTCHours() % POST_MODES.length;
    const mode = POST_MODES[modeIndex] || "charter_quote";

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
        });

        const telegramRes = await sendToTelegram({
          chatId: telegramChatId,
          text: telegramText,
        });

        results.push({
          lang: code,
          ok: true,
          mode,
          topicId: forumRes.topicId,
          manifestUrl,
          telegram: telegramRes ? "sent" : "skipped",
        });
      } catch (langErr) {
        log(`Error for lang ${code}:`, langErr);
        results.push({
          lang: code,
          ok: false,
          mode,
          error: String(langErr && langErr.message
            ? langErr.message
            : langErr),
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
