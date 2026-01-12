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
const { writeHeartbeat, writeEvent } = require("../lib/opsPulse");

// Семена для Домового (цитаты/мысли из Манифеста и Устава)
const SEEDS = {
  ru: [
    "Ненасилие и отказ от принуждения — основа свободного общества.",
    "Ценность разумной жизни превыше любых идеологий.",
    "Прямая демократия даёт каждому голос в решении общих вопросов.",
    "Наука и критическое мышление — инструменты познания истины.",
    "Децентрализация власти защищает от монополий и злоупотреблений.",
    "Сотрудничество вместо господства — путь к устойчивому будущему.",
    "Прозрачность решений укрепляет доверие в сообществе.",
    "Автономия личности неотделима от ответственности перед другими.",
  ],
  en: [
    "Non-violence and rejection of coercion are the foundation of a free society.",
    "The value of intelligent life exceeds any ideology.",
    "Direct democracy gives everyone a voice in common decisions.",
    "Science and critical thinking are tools for discovering truth.",
    "Decentralization of power protects against monopolies and abuse.",
    "Cooperation instead of domination is the path to a sustainable future.",
    "Transparency of decisions strengthens trust in the community.",
    "Personal autonomy is inseparable from responsibility to others.",
  ],
  de: [
    "Gewaltlosigkeit und Ablehnung von Zwang sind die Grundlage einer freien Gesellschaft.",
    "Der Wert intelligenten Lebens übersteigt jede Ideologie.",
    "Direkte Demokratie gibt jedem eine Stimme bei gemeinsamen Entscheidungen.",
    "Wissenschaft und kritisches Denken sind Werkzeuge zur Wahrheitsfindung.",
    "Dezentralisierung der Macht schützt vor Monopolen und Missbrauch.",
    "Zusammenarbeit statt Herrschaft ist der Weg in eine nachhaltige Zukunft.",
    "Transparenz von Entscheidungen stärkt das Vertrauen in die Gemeinschaft.",
    "Persönliche Autonomie ist untrennbar mit Verantwortung anderen gegenüber verbunden.",
  ],
};

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

// Загрузка последнего использованного seed
async function getLastSeedKey(lang) {
  if (!FIREBASE_DB_URL) return null;
  try {
    const url = `${FIREBASE_DB_URL}/domovoy/state/lastSeedKey_${lang}.json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data || null;
    }
  } catch (e) {
    log("Error loading last seed key:", e.message);
  }
  return null;
}

// Сохранение последнего использованного seed
async function saveLastSeedKey(lang, seedKey, timestamp) {
  if (!FIREBASE_DB_URL) return;
  try {
    const url = `${FIREBASE_DB_URL}/domovoy/state/lastSeedKey_${lang}.json`;
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedKey, timestamp }),
    });
  } catch (e) {
    log("Error saving last seed key:", e.message);
  }
}

// Выбор seed с ротацией (избегаем повторов минимум 48 часов)
function selectSeed(lang, lastSeedData) {
  const seeds = SEEDS[lang] || SEEDS.en;
  if (seeds.length === 0) return null;
  
  const now = Date.now();
  const MIN_INTERVAL_MS = 48 * 60 * 60 * 1000; // 48 часов
  
  // Если есть последний seed и он недавний - исключаем его
  let availableSeeds = seeds;
  if (lastSeedData && lastSeedData.seedKey !== undefined) {
    const age = now - (lastSeedData.timestamp || 0);
    if (age < MIN_INTERVAL_MS) {
      // Исключаем последний seed
      availableSeeds = seeds.filter((_, idx) => idx !== lastSeedData.seedKey);
      if (availableSeeds.length === 0) {
        // Если все исключены, используем все
        availableSeeds = seeds;
      }
    }
  }
  
  // Выбираем случайный из доступных
  const selectedSeed = availableSeeds[Math.floor(Math.random() * availableSeeds.length)];
  const seedKey = seeds.indexOf(selectedSeed);
  
  return { seed: selectedSeed, seedKey };
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
    ? `Создай короткий пост (600-1200 символов) на основе этой мысли из Манифеста/Устава NovaCiv:

"${seed}"

Структура:
1) Короткий заголовок (3-6 слов)
2) Цитата/мысль (точная или слегка перефразированная, но без искажения смысла)
3) 2-4 строки размышления Домового в стиле NovaCiv: спокойно, ясно, без лозунгов, без пафоса
4) 1 вопрос к читателю

Ответ верни строго в формате JSON:
{"title": "...", "body": "..."}`
    : lang === "de"
    ? `Erstelle einen kurzen Post (600-1200 Zeichen) basierend auf diesem Gedanken aus dem Manifest/der Charta von NovaCiv:

"${seed}"

Struktur:
1) Kurze Überschrift (3-6 Wörter)
2) Zitat/Gedanke (genau oder leicht umformuliert, aber ohne Sinnverzerrung)
3) 2-4 Zeilen Nachdenken des Hausgeists im NovaCiv-Stil: ruhig, klar, ohne Slogans, ohne Pathos
4) 1 Frage an den Leser

Antworte strikt im JSON-Format:
{"title": "...", "body": "..."}`
    : `Create a short post (600-1200 characters) based on this thought from the NovaCiv Manifesto/Charter:

"${seed}"

Structure:
1) Short title (3-6 words)
2) Quote/thought (exact or slightly rephrased, but without distorting meaning)
3) 2-4 lines of Domovoy's reflection in NovaCiv style: calmly, clearly, without slogans, without pomp
4) 1 question to the reader

Return answer strictly in JSON format:
{"title": "...", "body": "..."}`;

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
  } catch (e) {
    // Если не JSON, пытаемся извлечь из текста
    const titleMatch = content.match(/"title"\s*:\s*"([^"]+)"/);
    const bodyMatch = content.match(/"body"\s*:\s*"([^"]+)"/);
    parsed = {
      title: titleMatch ? titleMatch[1] : "NovaCiv",
      body: bodyMatch ? bodyMatch[1] : content,
    };
  }

  return {
    title: parsed.title || "NovaCiv",
    body: parsed.body || content,
  };
}

// Форматирование поста для Telegram (HTML)
function formatPostForTelegram(title, body, lang) {
  const lines = [];
  
  lines.push(`<b>🤖 NovaCiv — Домовой</b>`);
  lines.push(`<b>${escapeHtml(title)}</b>`);
  lines.push("");
  lines.push(escapeHtml(body));
  lines.push("");
  lines.push(`https://novaciv.space`);
  
  let message = lines.join("\n");
  
  // Контроль длины: 600-1200 символов
  if (message.length > 1200) {
    // Обрезаем body
    const headerLength = lines[0].length + lines[1].length + lines[2].length + lines[lines.length - 2].length + lines[lines.length - 1].length + 10;
    const maxBodyLength = 1200 - headerLength;
    const bodyText = escapeHtml(body);
    if (bodyText.length > maxBodyLength) {
      const truncatedBody = bodyText.slice(0, maxBodyLength - 3) + "...";
      message = lines[0] + "\n" + lines[1] + "\n\n" + truncatedBody + "\n\n" + lines[lines.length - 1];
    }
  }
  
  return message;
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

    // Загружаем последний seed
    const lastSeedData = await getLastSeedKey(lang);
    
    // Выбираем seed с ротацией
    const seedSelection = selectSeed(lang, lastSeedData);
    if (!seedSelection) {
      await writeEvent(component, "warn", "No seeds available", { lang });
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, message: "No seeds available" }),
      };
    }

    const { seed, seedKey } = seedSelection;
    log("Selected seed:", seedKey, "for lang:", lang);

    // Генерируем пост
    const { title, body } = await generatePost(seed, lang);
    log("Generated post:", title);

    // Форматируем для Telegram
    const message = formatPostForTelegram(title, body, lang);

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

    // Сохраняем последний seed
    await saveLastSeedKey(lang, seedKey, Date.now());

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
        title,
        seedKey,
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
