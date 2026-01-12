// netlify/functions/fetch-news.js
//
// Что делает:
// 1) Берёт новости из RSS по языковым группам:
//    - RU: BBC Russian, DW Russian, Meduza
//    - EN: BBC World, DW World (EN), The Guardian World
//    - DE: Tagesschau, DW German
// 2) Парсит <item> (title, link, description, pubDate, guid).
// 3) Проверяет, что уже обрабатывали, в /newsMeta/en.json.
// 4) Для каждой НОВОЙ новости делает аналитический текст на английском
//    в духе NovaCiv, затем переводит на нужные языки.
// 5) Сохраняет как темы форума (section: "news") с lang: "en" | "ru" | "de".
// 6) Отправляет пост в соответственные Telegram-каналы по языку источника.
// 7) Обновляет /newsMeta/en.json, чтобы не было дублей.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL; // https://...firebaseio.com
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;

// Операторский пульт
const { writeHeartbeat, writeEvent, writeFirebaseError } = require("../lib/opsPulse");
const { RSS_SOURCES } = require("../lib/rssSourcesByLang");

// Максимум новых RSS-элементов за один запуск (на язык)
const MAX_NEW_ITEMS_PER_LANG = 5;

// Где храним метаданные о уже обработанных новостях (по языкам)
const NEWS_META_BASE_PATH = "/newsMeta";

// Вывод по языкам (только форум; Telegram теперь отдельной функцией)
const LANG_OUTPUTS = [
  {
    code: "en",
    label: "English",
    saveToForum: true,
  },
  {
    code: "ru",
    label: "Russian",
    saveToForum: true,
  },
  {
    code: "de",
    label: "German",
    saveToForum: true,
  },
];


// ---------- PROMPTS ----------

const SYSTEM_PROMPT_ANALYSIS = `
You are an analyst for the digital community "NovaCiv" (New Civilization).

Core values of NovaCiv:
– non-violence and rejection of coercion;
– freedom and autonomy of the individual;
– honest dialogue and transparent decision-making;
– respect for intelligent life and its preservation;
– science, critical thinking and verifiable knowledge;
– cooperation instead of domination;
– sustainable attitude to the planet and resources;
– decentralization of power and distrust of monopolies.

You receive a news item (headline, short description, sometimes a text fragment).

Your task: create a meaningful analysis (NOT a dry summary) that helps readers understand the news through NovaCiv values.

Answer in ENGLISH. Write calmly, clearly, like an adult. No slogans, no propaganda, no moralizing, no "we need more information" excuses. One paragraph = one thought.

Structure (return as JSON):
{
  "sense": "240-360 characters. The living meaning of the news, in human language. What actually happened and why it matters to people.",
  "why": "Up to 180 characters. ONE thesis about how this affects people, freedoms, future, technologies, or ecosystems.",
  "view": "Up to 220 characters. ONE thesis strictly in NovaCiv principles: non-violence, autonomy, transparency, anti-militarism, anti-power-concentration. Where are risks of violence/monopolies/manipulation? Where are opportunities for science/cooperation?",
  "question": "Up to 160 characters. ONE question inviting reflection, not a call to action."
}

Rules:
- sense: human language, not bureaucratic. Show the real meaning.
- why: one clear thesis, not a list.
- view: strictly in NovaCiv principles. No generic "this is important".
- question: one question that makes people think, not a rhetorical one.
- No invented facts. If information is missing, say so briefly.
- No water, no fluff. Every word counts.
`.trim();

const SYSTEM_PROMPT_TRANSLATE = `
You are a precise translator for the digital community "NovaCiv".

Your task:
– Translate the given analytical text from ENGLISH into the target language.
– Preserve meaning, nuance and calm, neutral tone.
– Keep the structure, headings, numbering and paragraphs as in the original.
– Do NOT add your own commentary or extra sentences.
`.trim();

// ---------- HELPERS ----------

function stripCdata(str) {
  if (!str) return "";
  let s = String(str).trim();
  const cdataStart = "<![CDATA[";
  const cdataEnd = "]]>";
  if (s.startsWith(cdataStart) && s.endsWith(cdataEnd)) {
    s = s.slice(cdataStart.length, s.length - cdataEnd.length).trim();
  }
  return s;
}

// Простой парсер RSS <item>...</item>, с портированием targetLangs
function parseRss(xml, sourceId, languages) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml))) {
    const block = match[1];

    const getTag = (tag) => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const m = block.match(re);
      return m ? stripCdata(m[1]) : "";
    };

    const title = getTag("title");
    const link = getTag("link");
    const guid = getTag("guid");
    const pubDate = getTag("pubDate");
    let description = getTag("description");
    if (!description) {
      description = getTag("summary") || getTag("content:encoded") || "";
    }

    // Извлечение imageUrl из RSS (enclosure, media:thumbnail, og:image)
    let imageUrl = "";
    
    // 1. Проверяем enclosure (type="image/...")
    const enclosureMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
    if (enclosureMatch) {
      const enclosureType = (block.match(/<enclosure[^>]+type=["']([^"']+)["']/i) || [])[1] || "";
      if (enclosureType.startsWith("image/")) {
        imageUrl = enclosureMatch[1];
      }
    }
    
    // 2. Проверяем media:thumbnail
    if (!imageUrl) {
      const mediaThumb = getTag("media:thumbnail") || getTag("media:content");
      if (mediaThumb) {
        const urlMatch = mediaThumb.match(/url=["']([^"']+)["']/i);
        if (urlMatch) imageUrl = urlMatch[1];
      }
    }
    
    // 3. Ищем og:image в description (если есть HTML)
    if (!imageUrl && description) {
      const ogImageMatch = description.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (ogImageMatch) imageUrl = ogImageMatch[1];
      
      // Также проверяем обычные img теги
      if (!imageUrl) {
        const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) imageUrl = imgMatch[1];
      }
    }

    items.push({
      sourceId,
      title: title || "",
      link: link || "",
      guid: guid || "",
      pubDate: pubDate || "",
      description: description || "",
      imageUrl: imageUrl || "",
      targetLangs: Array.isArray(languages) ? [...languages] : [],
    });
  }

  return items;
}

async function fetchRssSource(sourceUrl, sourceName, sourceLang) {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `RSS fetch failed for ${sourceName}: HTTP ${res.status} – ${text}`,
    );
  }
  const xml = await res.text();
  const sourceId = safeKey(sourceName);
  const items = parseRss(xml, sourceId, [sourceLang]);
  return items;
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

function normalizeTitle(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"“"]/g, '"')
    .trim();
}

function makeNewsKey(item) {
  const base = (item.guid || item.link || item.title || "").trim();
  const rawKey = `${item.sourceId}::${base.slice(0, 200)}`;
  return safeKey(rawKey);
}

// ---------- META IN FIREBASE ----------

const emptyMeta = { processedKeys: {}, titleKeys: {} };

async function loadNewsMeta(lang) {
  if (!FIREBASE_DB_URL) return emptyMeta;

  const metaPath = `${NEWS_META_BASE_PATH}/${lang}.json`;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}${metaPath}`);
    if (!res.ok) {
      return emptyMeta;
    }

    const data = await res.json();
    if (!data || typeof data !== "object") return emptyMeta;

    const processedKeys =
      data.processedKeys && typeof data.processedKeys === "object"
        ? data.processedKeys
        : {};
    const titleKeys =
      data.titleKeys && typeof data.titleKeys === "object"
        ? data.titleKeys
        : {};

    return { processedKeys, titleKeys };
  } catch (e) {
    console.error(`Error loading news meta for ${lang}:`, e);
    return emptyMeta;
  }
}

async function saveNewsMeta(lang, meta) {
  if (!FIREBASE_DB_URL) return;
  
  // Санитизация всех ключей в processedKeys и titleKeys
  const sanitizedMeta = {
    processedKeys: {},
    titleKeys: {},
  };
  
  if (meta.processedKeys) {
    for (const [key, value] of Object.entries(meta.processedKeys)) {
      const safe = safeKey(key);
      sanitizedMeta.processedKeys[safe] = value;
    }
  }
  
  if (meta.titleKeys) {
    for (const [key, value] of Object.entries(meta.titleKeys)) {
      const safe = safeKey(key);
      sanitizedMeta.titleKeys[safe] = value;
    }
  }
  
  const metaPath = `${NEWS_META_BASE_PATH}/${lang}.json`;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}${metaPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizedMeta),
    });
    if (!res.ok) {
      const text = await res.text();
      await writeFirebaseError("fetch-news", new Error(`Failed to write news meta: ${res.status}`), {
        path: metaPath,
        op: "write",
        status: res.status,
        firebaseError: text.slice(0, 200),
      });
      console.error(`Failed to write news meta for ${lang}:`, res.status, text);
    }
  } catch (e) {
    await writeFirebaseError("fetch-news", e, {
      path: metaPath,
      op: "write",
    });
    console.error(`Error writing news meta for ${lang}:`, e);
  }
}

// Запись heartbeat метрик в Firebase
async function writeHealthMetrics(metrics) {
  if (!FIREBASE_DB_URL) return;
  try {
    const url = `${FIREBASE_DB_URL}/health/news/fetchNewsLastRun.json`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metrics),
    });
    if (!res.ok) {
      console.error("Failed to write health metrics:", res.status);
    }
  } catch (e) {
    console.error("Error writing health metrics:", e.message || e);
  }
}

// ---------- SAVE TO FORUM ----------

async function saveNewsToForumLang(item, analyticData, langCode) {
  if (!FIREBASE_DB_URL) {
    const error = new Error("FIREBASE_DB_URL is not set");
    await writeFirebaseError("fetch-news", error, {
      path: "forum/topics",
      op: "write",
    });
    throw error;
  }

  const now = Date.now();
  
  // Сохраняем структурированные данные (sense, why, view, question)
  // Для обратной совместимости также сохраняем как content
  const content = typeof analyticData === "string" 
    ? analyticData 
    : JSON.stringify(analyticData);
  
  const payload = {
    title: item.title || "(no title)",
    content: content,
    // Структурированные данные для форматирования
    sense: typeof analyticData === "object" ? analyticData.sense : null,
    why: typeof analyticData === "object" ? analyticData.why : null,
    view: typeof analyticData === "object" ? analyticData.view : null,
    question: typeof analyticData === "object" ? analyticData.question : null,
    section: "news",
    createdAt: now,
    createdAtServer: now,
    authorNickname: "NovaCiv News",
    lang: langCode,
    sourceId: safeKey(item.sourceId || item.sourceName || ""),
    sourceName: item.sourceName || "",
    originalGuid: item.guid || "",
    originalLink: item.link || "",
    pubDate: item.pubDate || "",
    imageUrl: item.imageUrl || "",
    analysisLang: "en", // Анализ всегда на EN
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
      await writeFirebaseError("fetch-news", error, {
        path: "forum/topics",
        op: "write",
        status: res.status,
        firebaseError: text.slice(0, 200),
      });
      throw error;
    }
  } catch (error) {
    if (!error.message || !error.message.includes("Firebase write error")) {
      await writeFirebaseError("fetch-news", error, {
        path: "forum/topics",
        op: "write",
      });
    }
    throw error;
  }
}



// ---------- OPENAI ANALYSIS & TRANSLATION ----------

async function analyzeNewsItemEn(item) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const userPrompt = `
News item:

Source: ${item.sourceId}
Title: ${item.title || "(no title)"}
Link: ${item.link || "(no link)"}

Short description / fragment:
${item.description || "(no description provided)"}

Please analyse this news item in the format described in the instructions.
Do not repeat the title. We only need the analytical text.
`.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_ANALYSIS },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 700,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: HTTP ${response.status} – ${text}`);
  }

  const data = await response.json();
  const answer =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "";

  if (!answer) {
    throw new Error("Empty answer from OpenAI for news item");
  }

  // Парсим JSON ответ
  try {
    const parsed = JSON.parse(answer);
    if (parsed.sense && parsed.why && parsed.view && parsed.question) {
      return parsed;
    }
  } catch (e) {
    // Не JSON, пытаемся извлечь из текста
    console.log("[fetch-news] OpenAI response is not JSON, trying to parse:", answer.slice(0, 200));
  }

  // Fallback: если не получилось распарсить JSON
  const fallback = {
    sense: `${item.title || "News"}. ${item.description ? item.description.slice(0, 200) : "Суть: важное событие, требующее внимания."}`,
    why: "Это влияет на свободы людей и будущее общества.",
    view: "С точки зрения NovaCiv важно оценить риски насилия и концентрации власти, а также возможности для сотрудничества.",
    question: "Как это событие влияет на вашу свободу и автономию?",
  };

  // Пытаемся извлечь секции из текста
  const senseMatch = answer.match(/"sense"\s*:\s*"([^"]+)"/i) || answer.match(/sense[:\s]+(.*?)(?:\n|"why"|$)/i);
  const whyMatch = answer.match(/"why"\s*:\s*"([^"]+)"/i) || answer.match(/why[:\s]+(.*?)(?:\n|"view"|$)/i);
  const viewMatch = answer.match(/"view"\s*:\s*"([^"]+)"/i) || answer.match(/view[:\s]+(.*?)(?:\n|"question"|$)/i);
  const questionMatch = answer.match(/"question"\s*:\s*"([^"]+)"/i) || answer.match(/question[:\s]+(.*?)(?:\n|$)/i);

  if (senseMatch) fallback.sense = senseMatch[1].slice(0, 360);
  if (whyMatch) fallback.why = whyMatch[1].slice(0, 180);
  if (viewMatch) fallback.view = viewMatch[1].slice(0, 220);
  if (questionMatch) fallback.question = questionMatch[1].slice(0, 160);

  console.log("[fetch-news] Using fallback analysis structure");
  return fallback;
}

async function translateText(englishText, targetLangCode) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  let targetDescription;
  if (targetLangCode === "ru") {
    targetDescription = "Russian";
  } else if (targetLangCode === "de") {
    targetDescription = "German";
  } else {
    targetDescription = "the target language";
  }

  const userPrompt = `
Target language: ${targetDescription} (code: ${targetLangCode})

Translate the following analytical text from ENGLISH into the target language.
Preserve structure, headings, numbering and paragraphs.

---
${englishText}
---
`.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_TRANSLATE },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 900,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OpenAI translation error (${targetLangCode}): HTTP ${response.status} – ${text}`,
    );
  }

  const data = await response.json();
  const answer =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "";

  if (!answer) {
    throw new Error(`Empty translation for language ${targetLangCode}`);
  }

  return answer;
}

// ---------- HELPERS FOR INVOCATION TYPE DETECTION ----------

// Безопасное чтение заголовков с учетом разных регистров
function getHeader(headers, key) {
  if (!headers || !key) return "";
  const lowerKey = key.toLowerCase();
  // Пробуем разные варианты регистра
  return headers[key] || headers[lowerKey] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || "";
}

// Определение типа вызова и проверка auth
function determineInvocationType(event) {
  const headers = event.headers || {};
  const userAgent = getHeader(headers, "user-agent");
  const eventHeader = getHeader(headers, "x-netlify-event") || getHeader(headers, "x-nf-event");
  const referer = getHeader(headers, "referer") || getHeader(headers, "referrer");
  
  // Проверка scheduled: заголовок x-netlify-event или x-nf-event == "schedule" (case-insensitive)
  // ИЛИ User-Agent == "Netlify-Scheduled-Function"
  const isScheduled = 
    (eventHeader && eventHeader.toLowerCase() === "schedule") ||
    userAgent === "Netlify-Scheduled-Function";
  
  if (isScheduled) {
    return {
      type: "scheduled",
      skipAuth: true,
    };
  }
  
  // Проверка Netlify Run Now: не scheduled + флаг включен + признаки Netlify вызова
  const allowRunNowBypass = process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS && 
    process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS.toLowerCase() === "true";
  
  if (allowRunNowBypass) {
    // Проверяем признаки Netlify Run Now:
    // - referer содержит app.netlify.com или app.netlify.app
    // - ИЛИ присутствует x-nf-request-id
    // - ИЛИ присутствует x-nf-site-id
    // - ИЛИ присутствует x-nf-deploy-id
    // - ИЛИ user-agent содержит "Netlify"
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
      return {
        type: "netlify_run_now",
        skipAuth: true,
      };
    }
  }
  
  // Иначе - обычный HTTP вызов
  // DEBUG-логирование только когда type = "http" и ALLOW_NETLIFY_RUN_NOW_BYPASS = "true"
  if (allowRunNowBypass) {
    const xNfRequestId = getHeader(headers, "x-nf-request-id");
    const xNfSiteId = getHeader(headers, "x-nf-site-id");
    const xNfDeployId = getHeader(headers, "x-nf-deploy-id");
    
    console.log("[debug] allowBypass=true http invocation headers keys:", Object.keys(headers));
    console.log("[debug] ua=", userAgent);
    console.log("[debug] x-nf-request-id=", xNfRequestId);
    console.log("[debug] x-nf-site-id=", xNfSiteId);
    console.log("[debug] x-nf-deploy-id=", xNfDeployId);
    console.log("[debug] referer=", referer);
    console.log("[debug] x-netlify-event=", eventHeader);
  }
  
  return {
    type: "http",
    skipAuth: false,
  };
}

// ---------- HANDLER ----------

exports.handler = async (event) => {
  console.log("fetch-news start");
  const startTime = Date.now();
  const component = "fetch-news";

  // Записываем начало выполнения
  await writeHeartbeat(component, {
    lastRunAt: startTime,
  });

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    await writeEvent(component, "warn", "Invalid HTTP method", { method: event.httpMethod });
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  // Определяем тип вызова
  const invocation = determineInvocationType(event);
  
  if (invocation.type === "scheduled") {
    console.log("invocation type: scheduled");
    console.log("auth skipped");
  } else if (invocation.type === "netlify_run_now") {
    console.log("invocation type: netlify_run_now");
    console.log("auth skipped (ALLOW_NETLIFY_RUN_NOW_BYPASS=true)");
  } else {
    console.log("invocation type: http");
    // Проверка токена только для HTTP/manual вызовов
    const qs = event.queryStringParameters || {};
    if (NEWS_CRON_SECRET) {
      if (!qs.token || qs.token !== NEWS_CRON_SECRET) {
        console.log("auth gate blocked (no token or token mismatch)");
        return {
          statusCode: 403,
          body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" }),
        };
      }
    }
    console.log("auth gate passed");
  }

  if (!OPENAI_API_KEY || !FIREBASE_DB_URL) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: false,
        error: "OPENAI_API_KEY или FIREBASE_DB_URL не заданы на сервере.",
      }),
    };
  }

  try {

  } catch (err) {
    console.error("fetch-news fatal error:", err);
    
    // Heartbeat: ошибка
    const errorMsg = String(err && err.message ? err.message : err);
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastErrorAt: Date.now(),
      lastErrorMsg: errorMsg,
    });
    await writeEvent(component, "error", "Fatal error in fetch-news", {
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
