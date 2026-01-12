// netlify/functions/domovoy-every-3h.js
//
// Домовой NovaCiv: публикует 1 пост каждые 3 часа
// Красивый формат для Telegram с цитатами из Манифеста/Устава

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const DOMOVOY_CRON_SECRET = process.env.DOMOVOY_CRON_SECRET || "";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
const TELEGRAM_NEWS_CHAT_ID_EN = process.env.TELEGRAM_NEWS_CHAT_ID_EN || process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Операторский пульт
const { writeHeartbeat, writeEvent, writeFirebaseError } = require("../lib/opsPulse");
const { formatDomovoyMessage } = require("../lib/telegramFormat");
const { getSeeds } = require("../lib/domovoySeeds");

function log(...args) {
  console.log("[domovoy-every-3h]", ...args);
}

// Экранирование HTML
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

// Загрузка истории последних 48 часов
async function getRecentSeeds(lang) {
  if (!FIREBASE_DB_URL) return [];
  try {
    const safeLang = safeKey(lang);
    const url = `${FIREBASE_DB_URL}/domovoy/state/recent_${safeLang}.json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      // data может быть массивом или объектом с ключами
      if (Array.isArray(data)) {
        return data;
      } else if (data && typeof data === "object") {
        return Object.values(data).filter(Boolean);
      }
    }
  } catch (e) {
    await writeFirebaseError("domovoy-every-3h", e, {
      path: `domovoy/state/recent_${safeKey(lang)}`,
      op: "read",
    });
    log("Error loading recent seeds:", e.message);
  }
  return [];
}

// Сохранение истории последних 48 часов
async function saveRecentSeed(lang, seedKey, timestamp) {
  if (!FIREBASE_DB_URL) return;
  try {
    const safeLang = safeKey(lang);
    const recent = await getRecentSeeds(lang);
    
    // Добавляем новый seed
    recent.push({ seedKey, timestamp });
    
    // Удаляем старые (старше 48 часов)
    const cutoff = timestamp - 48 * 60 * 60 * 1000;
    const filtered = recent.filter((item) => item.timestamp >= cutoff);
    
    // Сохраняем
    const url = `${FIREBASE_DB_URL}/domovoy/state/recent_${safeLang}.json`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filtered),
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      await writeFirebaseError("domovoy-every-3h", new Error(`Failed to save recent seeds: ${res.status}`), {
        path: `domovoy/state/recent_${safeLang}`,
        op: "write",
        status: res.status,
        firebaseError: errorText.slice(0, 200),
      });
    }
  } catch (e) {
    await writeFirebaseError("domovoy-every-3h", e, {
      path: `domovoy/state/recent_${safeKey(lang)}`,
      op: "write",
    });
    log("Error saving recent seeds:", e.message);
  }
}

// Выбор seed с ротацией (избегаем повторов минимум 48 часов)
async function selectSeed(lang) {
  const seeds = getSeeds(lang);
  if (seeds.length === 0) return null;
  
  const recent = await getRecentSeeds(lang);
  const recentKeys = new Set(recent.map((item) => item.seedKey));
  
  // Исключаем недавние seeds
  let availableSeeds = seeds.filter((seed) => !recentKeys.has(seed.key));
  
  // Если все seeds в recent - очищаем recent и используем все
  if (availableSeeds.length === 0) {
    await writeEvent("domovoy-every-3h", "warn", "All seeds in recent history, clearing", { lang });
    availableSeeds = seeds;
    // Очищаем recent
    if (FIREBASE_DB_URL) {
      const safeLang = safeKey(lang);
      const url = `${FIREBASE_DB_URL}/domovoy/state/recent_${safeLang}.json`;
      await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify([]) });
    }
  }
  
  // Выбираем случайный из доступных
  const selectedSeed = availableSeeds[Math.floor(Math.random() * availableSeeds.length)];
  
  return selectedSeed;
}

// Генерация поста через OpenAI
async function generatePost(seed, lang) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const systemPrompt = lang === "ru"
    ? `Ты — Домовой цифровой цивилизации NovaCiv. Ты говоришь по-русски, знаешь Манифест и Устав NovaCiv. Пиши спокойно, ясно, без пафоса и лозунгов. Уважай читателя.`
    : lang === "de"
    ? `Du bist der Hausgeist der digitalen Zivilisation NovaCiv. Du sprichst Deutsch, kennst das Manifest und die Charta von NovaCiv. Schreibe klar, ruhig, ohne Pathos und Slogans. Respektiere den Leser.`
    : `You are the house spirit of the digital civilization NovaCiv. You speak English, know the NovaCiv Manifesto and Charter. Write clearly and calmly, without pomp and slogans. Respect the reader.`;

  const userPrompt = lang === "ru"
    ? `Создай короткий пост на основе этой мысли из Манифеста/Устава NovaCiv:

"${seed.quote}"

Структура (верни JSON):
{
  "headline": "3-6 слов",
  "quote": "1-3 строки цитаты (точная или слегка перефразированная, но без искажения смысла)",
  "reflection": "2-4 строки размышления Домового в стиле NovaCiv: спокойно, ясно, без лозунгов, без пафоса",
  "question": "1 вопрос к читателю"
}`
    : lang === "de"
    ? `Erstelle einen kurzen Post basierend auf diesem Gedanken aus dem Manifest/der Charta von NovaCiv:

"${seed.quote}"

Struktur (Antworte im JSON-Format):
{
  "headline": "3-6 Wörter",
  "quote": "1-3 Zeilen Zitat (genau oder leicht umformuliert, aber ohne Sinnverzerrung)",
  "reflection": "2-4 Zeilen Nachdenken des Hausgeists im NovaCiv-Stil: ruhig, klar, ohne Slogans, ohne Pathos",
  "question": "1 Frage an den Leser"
}`
    : `Create a short post based on this thought from the NovaCiv Manifesto/Charter:

"${seed.quote}"

Structure (return JSON):
{
  "headline": "3-6 words",
  "quote": "1-3 lines of quote (exact or slightly rephrased, but without distorting meaning)",
  "reflection": "2-4 lines of Domovoy's reflection in NovaCiv style: calmly, clearly, without slogans, without pomp",
  "question": "1 question to the reader"
}`;

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
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: HTTP ${response.status} – ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  // Парсим JSON ответ
  let parsed;
  try {
    parsed = JSON.parse(content);
    if (parsed.headline && parsed.quote && parsed.reflection && parsed.question) {
      return parsed;
    }
  } catch (e) {
    // Не JSON, пытаемся извлечь из текста
    console.log("[domovoy-every-3h] OpenAI response is not JSON, trying to parse:", content.slice(0, 200));
  }

  // Fallback: если не получилось распарсить
  return {
    headline: seed.headline || "NovaCiv",
    quote: seed.quote || "",
    reflection: "Размышление о ценности жизни, свободы и справедливости.",
    question: "Как это влияет на вашу свободу и автономию?",
  };
}

// Форматирование поста для Telegram (использует telegramFormat)
function formatPostForTelegram(postData, lang) {
  return formatDomovoyMessage({
    headline: postData.headline,
    quote: postData.quote,
    reflection: postData.reflection,
    question: postData.question,
    lang: lang,
  });
}

// Отправка в Telegram
async function sendToTelegram(chatId, message) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  if (!chatId) {
    return { ok: false, skipped: true, reason: "chatId not configured" };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true, // Без preview для чистоты поста
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!data.ok) {
    log("Telegram error:", data);
  }
  return data;
}

// Определение типа вызова (аналогично news-cron)
function getHeader(headers, key) {
  if (!headers || !key) return "";
  const lowerKey = key.toLowerCase();
  return headers[key] || headers[lowerKey] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || "";
}

function determineInvocationType(event) {
  const headers = event.headers || {};
  const userAgent = getHeader(headers, "user-agent");
  const eventHeader = getHeader(headers, "x-netlify-event") || getHeader(headers, "x-nf-event");
  const referer = getHeader(headers, "referer") || getHeader(headers, "referrer");
  
  const isScheduled = 
    (eventHeader && eventHeader.toLowerCase() === "schedule") ||
    userAgent === "Netlify-Scheduled-Function";
  
  if (isScheduled) {
    return { type: "scheduled", skipAuth: true };
  }
  
  const allowRunNowBypass = process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS && 
    process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS.toLowerCase() === "true";
  
  if (allowRunNowBypass) {
    const xNfRequestId = getHeader(headers, "x-nf-request-id");
    const xNfSiteId = getHeader(headers, "x-nf-site-id");
    const xNfDeployId = getHeader(headers, "x-nf-deploy-id");
    
    const looksLikeNetlifyRunNow = 
      (referer && (referer.toLowerCase().includes("app.netlify.com") || referer.toLowerCase().includes("app.netlify.app"))) ||
      xNfRequestId ||
      xNfSiteId ||
      xNfDeployId ||
      (userAgent && userAgent.toLowerCase().includes("netlify"));
    
    if (looksLikeNetlifyRunNow) {
      return { type: "netlify_run_now", skipAuth: true };
    }
  }
  
  return { type: "http", skipAuth: false };
}

exports.handler = async (event) => {
  const startTime = Date.now();
  const component = "domovoy-every-3h";
  
  // Записываем начало выполнения
  await writeHeartbeat(component, {
    lastRunAt: startTime,
  });

  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      await writeEvent(component, "warn", "Invalid HTTP method", { method: event.httpMethod });
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Определяем тип вызова
    const invocation = determineInvocationType(event);
    
    // Проверка токена (только для HTTP)
    if (!invocation.skipAuth && DOMOVOY_CRON_SECRET) {
      const qs = event.queryStringParameters || {};
      if (!qs.token || qs.token !== DOMOVOY_CRON_SECRET) {
        await writeEvent(component, "warn", "Auth failed", {});
        return { statusCode: 403, body: "Forbidden" };
      }
    }

    if (!OPENAI_API_KEY || !FIREBASE_DB_URL) {
      const errorMsg = "OPENAI_API_KEY или FIREBASE_DB_URL не заданы.";
      await writeHeartbeat(component, {
        lastRunAt: startTime,
        lastErrorAt: Date.now(),
        lastErrorMsg: errorMsg,
      });
      await writeEvent(component, "error", "Missing environment variables", {});
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: errorMsg }),
      };
    }

    // Выбираем язык (ротация: ru, en, de)
    const qs = event.queryStringParameters || {};
    const forcedLang = qs.lang;
    const lang = forcedLang || (["ru", "en", "de"][Math.floor(Date.now() / (3 * 60 * 60 * 1000)) % 3]);

    // Выбираем seed с ротацией
    const seed = await selectSeed(lang);
    if (!seed) {
      await writeEvent(component, "warn", "No seeds available", { lang });
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, message: "No seeds available" }),
      };
    }

    log("Selected seed:", seed.key, "for lang:", lang);

    // Генерируем пост
    const postData = await generatePost(seed, lang);
    log("Generated post:", postData.headline);

    // Форматируем для Telegram
    const message = formatPostForTelegram(postData, lang);

    // Отправляем в Telegram по языку
    let chatId = null;
    if (lang === "ru" && TELEGRAM_NEWS_CHAT_ID_RU) {
      chatId = TELEGRAM_NEWS_CHAT_ID_RU;
    } else if (lang === "en" && TELEGRAM_NEWS_CHAT_ID_EN) {
      chatId = TELEGRAM_NEWS_CHAT_ID_EN;
    } else if (lang === "de" && TELEGRAM_NEWS_CHAT_ID_DE) {
      chatId = TELEGRAM_NEWS_CHAT_ID_DE;
    }

    if (!chatId) {
      await writeEvent(component, "warn", "No chat ID for language", { lang });
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, message: `No chat ID for lang: ${lang}` }),
      };
    }

    const telegramResult = await sendToTelegram(chatId, message);
    
    if (!telegramResult.ok) {
      throw new Error(`Telegram send failed: ${telegramResult.description || "unknown"}`);
    }

    // Сохраняем seed в историю
    await saveRecentSeed(lang, seed.key, Date.now());
    
    // Записываем событие об отправке
    await writeEvent(component, "info", `domovoy post sent: ${postData.headline}`, { lang, seedKey: seed.key });

    // Heartbeat: успешное выполнение
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastOkAt: Date.now(),
      metrics: {
        createdPostsCount: 1,
        sentToTelegramCount: 1,
      },
    });
    await writeEvent(component, "info", "Post published successfully", {
      lang,
      seedKey,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        lang,
        headline: postData.headline,
        seedKey: seed.key,
      }),
    };
  } catch (err) {
    log("Fatal error:", err);
    
    // Heartbeat: ошибка
    const errorMsg = String(err && err.message ? err.message : err);
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastErrorAt: Date.now(),
      lastErrorMsg: errorMsg,
    });
    await writeEvent(component, "error", "Fatal error in domovoy-every-3h", {
      error: errorMsg,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: errorMsg,
      }),
    };
  }
};
