// netlify/functions/domovoy-auto-post.js
//
// Авто-Домовой NovaCiv: создаёт один философский пост и сохраняет его в форум.
//
// Что делает:
// 1) Раз в запуск генерирует один пост в духе Устава/Манифеста.
// 2) Поддерживает несколько режимов поста (mode): charter_quote, question_to_reader, term_explainer, charter_series.
// 3) Пишет пост в Firebase Realtime Database в раздел forum/topics с section: "news" и postKind: "domovoy:<mode>".
// 4) Отправляет пост в Telegram-канал по языку (TELEGRAM_NEWS_CHAT_ID_RU/EN/DE).
// 5) Защищён токеном DOMOVOY_CRON_SECRET (?token=...).
//
// ============================================================================
// ⚠️ VPS-ONLY FUNCTION (NOT deployed to Netlify)
// ============================================================================
// This function uses heavy env vars and is VPS-only:
//   - FIREBASE_DB_URL
//   - OPENAI_API_KEY
//   - OPENAI_MODEL
//   - DOMOVOY_CRON_SECRET
//   - TELEGRAM_BOT_TOKEN
//   - TELEGRAM_NEWS_CHAT_ID_* (multiple)
//
// Netlify equivalent: None (moved to VPS workers)
// Cron schedule: Removed from netlify.toml (VPS handles via PM2)
// ============================================================================
//
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL; // https://...firebaseio.com
const DOMOVOY_CRON_SECRET = process.env.DOMOVOY_CRON_SECRET || "";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
const TELEGRAM_NEWS_CHAT_ID_EN = process.env.TELEGRAM_NEWS_CHAT_ID_EN || process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE;

// Операторский пульт
const { writeHeartbeat, writeEvent, writeFirebaseError } = require("../lib/opsPulse");
const { writeHealthMetrics } = require("../../server/lib/healthMetrics");

// Безопасная санитизация ключей Firebase
function safeKey(value) {
  if (!value) return "unknown";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

// Модель OpenAI для текста
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Поддерживаемые языки
const LANG_CONFIG = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
];

// Режимы постов Домового
const POST_MODES = [
  "charter_quote",      // краткая мысль / принцип с пояснением
  "question_to_reader", // рассуждение + вопросы к читателю
  "term_explainer",     // объяснение одного термина/принципа
  "charter_series",     // серия по разделам Устава/Манифеста
];

function log(...args) {
  console.log("[domovoy-auto-post]", ...args);
}


async function sendToTelegram(chatId, message) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  if (!chatId) {
    return { ok: false, skipped: true, reason: "chatId not configured" };
  }

  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.log("[domovoy-auto-post] Telegram HTTP", resp.status);
      return { ok: false, status: resp.status, bodySnippet: text.slice(0, 200) };
    }

    try {
      const data = JSON.parse(text);
      if (!data.ok) {
        return { ok: false, status: resp.status, bodySnippet: text.slice(0, 200) };
      }
      return data;
    } catch {
      return { ok: false, status: resp.status, bodySnippet: text.slice(0, 200) };
    }
  } catch (err) {
    return { ok: false, status: null, bodySnippet: String(err).slice(0, 200) };
  }
}


function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPostText(title, body) {
  const parts = [];
  if (title) parts.push(String(title).trim());
  if (body) parts.push(String(body).trim());
  return parts.filter(Boolean).join("\n\n");
}

function getLangConfig(langCode) {
  return LANG_CONFIG.find((l) => l.code === langCode) || LANG_CONFIG[0];
}

function buildSystemPrompt(langCode) {
  if (langCode === "ru") {
    return `Ты — Домовой цифровой цивилизации NovaCiv. Ты говоришь по-русски, знаешь Манифест и Устав NovaCiv и помогаешь людям задуматься о ценности жизни, разума, свободе и справедливости.
Пиши просто, человеческим языком, без пафоса, но глубоко. Уважай читателя и его свободу выбора.`;
  }
  if (langCode === "de") {
    return `Du bist der Hausgeist der digitalen Zivilisation NovaCiv. Du sprichst Deutsch, kennst das Manifest und die Charta von NovaCiv und hilfst Menschen, über Wert des Lebens, Bewusstsein, Freiheit und Gerechtigkeit nachzudenken.
Schreibe klar, ruhig und menschlich – ohne Pathos, aber mit Tiefe.`;
  }
  // en и всё остальное
  return `You are the house spirit of the digital civilization NovaCiv. You speak English, know the NovaCiv Manifesto and Charter, and help people reflect on the value of life, consciousness, freedom and fairness.
Write clearly and warmly, without pomp, but with depth and respect for the reader.`;
}

function buildUserPrompt(mode, langCode) {
  const langName =
    langCode === "ru" ? "по-русски" : langCode === "de" ? "auf Deutsch" : "in English";

  if (mode === "charter_quote") {
    return `Создай короткий пост ${langName}, который:
- опирается на идеи Манифеста и Устава NovaCiv;
- содержит одну яркую мысль или цитату (без явных ссылок на статьи и номера пунктов);
- даёт 2–4 предложения пояснения, почему эта мысль важна для живых существ и будущего цивилизации;
- завершает пост мягким приглашением подумать, без призывов и давления.

Ответ верни строго в формате JSON:
{"title": "...", "body": "..."}.`;
  }

  if (mode === "question_to_reader") {
    return `Создай небольшой пост ${langName}, который:
- описывает одну жизненную ситуацию, связанную с свободой, ответственностью, справедливостью или ценностью разума;
- подводит читателя к 2–3 аккуратным вопросам к самому себе;
- не даёт готовых ответов и не читает морали.

Ответ верни строго в формате JSON:
{"title": "...", "body": "..."}.`;
  }

  if (mode === "term_explainer") {
    return `Объясни ${langName} один ключевой принцип NovaCiv (например: "ненасилие", "прямая демократия", "ценность разума", "анонимность и ответственность" и т.п.):
- начни с короткого понятного определения;
- покажи, как этот принцип проявляется в обычной жизни;
- закончи 1–2 предложениями о том, почему этот принцип важен для будущего цивилизации.

Ответ верни строго в формате JSON:
{"title": "...", "body": "..."}.`;
  }

  // charter_series и всё остальное
  return `Сделай ${langName} краткий пост как часть серии по разделам Устава NovaCiv:
- выбери один аспект: гражданство, референдум, культура, здоровье, цифровые права, ИИ и т.п.;
- объясни, какую проблему мира он решает;
- покажи в 2–4 предложениях, как этот принцип меняет отношение к власти, свободе или совместной жизни.

Ответ верни строго в формате JSON:
{"title": "...", "body": "..."}.`;
}

async function generatePost(mode, langCode) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const systemPrompt = buildSystemPrompt(langCode);
  const userPrompt = buildUserPrompt(mode, langCode);

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

  let title = "";
  let body = "";

  // Пытаемся распарсить JSON
  try {
    const parsed = JSON.parse(content);
    title = (parsed.title || "").toString().trim();
    body = (parsed.body || "").toString().trim();
  } catch (e) {
    // Если модель не послушалась — пробуем эвристику
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      throw new Error("Cannot extract title/body from OpenAI response");
    }

    title = lines[0].replace(/^["#*-]+\s*/, "").slice(0, 200);
    body = lines.slice(1).join("\n").trim();
  }

  if (!title) {
    title =
      langCode === "ru"
        ? "Размышление NovaCiv"
        : langCode === "de"
        ? "Gedanke von NovaCiv"
        : "Reflection by NovaCiv";
  }

  if (!body) {
    body = content.trim();
  }

  return { title, body };
}

async function savePostToForum({ langCode, mode, title, body }) {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not set");
  }

  const now = Date.now();
  const payload = {
    title,
    content: body,
    section: "news",
    createdAt: now,
    createdAtServer: now,
    authorNickname:
      langCode === "ru"
        ? "Домовой NovaCiv"
        : langCode === "de"
        ? "Hausgeist NovaCiv"
        : "Domovoy NovaCiv",
    lang: langCode,
    postKind: `domovoy:${mode}`,
  };

  try {
    const res = await fetch(`${FIREBASE_DB_URL}/forum/topics.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      const error = new Error(`Firebase write error: HTTP ${res.status} – ${text}`);
      await writeFirebaseError("domovoy-auto-post", error, {
        path: "forum/topics",
        op: "write",
        status: res.status,
        firebaseError: text.slice(0, 200),
      });
      throw error;
    }

    const data = await res.json();
    return data.name || null;
  } catch (error) {
    if (!error.message || !error.message.includes("Firebase write error")) {
      await writeFirebaseError("domovoy-auto-post", error, {
        path: "forum/topics",
        op: "write",
      });
    }
    throw error;
  }
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

  const runId = `domovoy-post-${Date.now()}`;
  const startTime = Date.now();
  const component = "domovoy-auto-post";
  
  // Записываем начало выполнения
  await writeHeartbeat(component, {
    lastRunAt: startTime,
  });

  let metrics = {
    ts: startTime,
    runId,
    ok: false,
    postedPerLang: { ru: 0, en: 0, de: 0 },
    telegramSentPerLang: { ru: 0, en: 0, de: 0 },
    errCode: null,
  };

  try {
    const qs = event.queryStringParameters || {};
    const forcedMode = qs.mode && POST_MODES.includes(qs.mode) ? qs.mode : null;
    const forcedLang = qs.lang || null;

    const mode = forcedMode || pickRandom(POST_MODES);
    const langCode = forcedLang || "ru"; // по умолчанию — русский

    const langCfg = getLangConfig(langCode);
    log("Generating post:", { mode, lang: langCfg.code });

    const { title, body } = await generatePost(mode, langCfg.code);

    const topicId = await savePostToForum({
      langCode: langCfg.code,
      mode,
      title,
      body,
    });

    log("Saved post to forum:", { topicId });
    metrics.postedPerLang[langCode] = 1;

    // Отправка в Telegram по языку
    const telegramText = buildPostText(title, body);
    let telegramChatId = null;
    if (langCode === "ru" && TELEGRAM_NEWS_CHAT_ID_RU) {
      telegramChatId = TELEGRAM_NEWS_CHAT_ID_RU;
    } else if (langCode === "en" && TELEGRAM_NEWS_CHAT_ID_EN) {
      telegramChatId = TELEGRAM_NEWS_CHAT_ID_EN;
    } else if (langCode === "de" && TELEGRAM_NEWS_CHAT_ID_DE) {
      telegramChatId = TELEGRAM_NEWS_CHAT_ID_DE;
    }

    if (telegramChatId) {
      try {
        const telegramResult = await sendToTelegram(telegramChatId, telegramText);
        if (telegramResult && telegramResult.ok) {
          metrics.telegramSentPerLang[langCode] = 1;
          log("Sent to Telegram:", langCode);
        } else {
          log("Telegram send failed:", telegramResult?.reason || "unknown");
        }
      } catch (e) {
        log("Telegram send error:", e.message || e);
      }
    }

    metrics.ok = true;

    // Heartbeat: успешное выполнение
    const totalPosted = Object.values(metrics.postedPerLang).reduce((a, b) => a + b, 0);
    const totalSent = Object.values(metrics.telegramSentPerLang).reduce((a, b) => a + b, 0);
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastOkAt: Date.now(),
      metrics: {
        createdPostsCount: totalPosted,
        sentToTelegramCount: totalSent,
      },
    });
    await writeEvent(component, "info", `Created post and sent to Telegram`, {
      mode,
      lang: langCfg.code,
      topicId,
    });

    const result = {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        mode,
        lang: langCfg.code,
        topicId,
      }),
    };

  const totalPostedForHealth = Object.values(metrics.postedPerLang).reduce((a, b) => a + b, 0);
    const langsPosted = Object.entries(metrics.postedPerLang)
      .filter(([, count]) => count > 0)
      .map(([lang]) => lang);
    await writeHealthMetrics("domovoy.autoPost", {
      status: "ok",
      details: { posts: totalPostedForHealth, langs: langsPosted },
    });
    return result;
  } catch (err) {
    log("Fatal error:", err);
    const errMsg = String(err && err.message ? err.message : err);
    
    // Определяем errCode
    if (errMsg.includes("FIREBASE") || errMsg.includes("Firebase")) {
      metrics.errCode = "FIREBASE";
    } else if (errMsg.includes("OPENAI") || errMsg.includes("OpenAI")) {
      metrics.errCode = "OPENAI";
    } else if (errMsg.includes("TELEGRAM") || errMsg.includes("Telegram")) {
      metrics.errCode = "TELEGRAM";
    } else {
      metrics.errCode = "UNKNOWN";
    }

    // Heartbeat: ошибка
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastErrorAt: Date.now(),
      lastErrorMsg: errMsg,
    });
    await writeEvent(component, "error", "Fatal error in domovoy-auto-post", {
      errCode: metrics.errCode,
      error: errMsg,
    });

    await writeHealthMetrics("domovoy.autoPost", {
      status: "error",
      details: { message: errMsg },
    });
    throw err;
  }
};
