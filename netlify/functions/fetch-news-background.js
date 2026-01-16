// netlify/functions/fetch-news-background.js
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
//
// ============================================================================
// Background function for Netlify
// ============================================================================
// This function runs the full fetch-news pipeline (RSS -> scoring -> DB writes).
// The lightweight HTTP trigger lives in netlify/functions/fetch-news.js.
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL; // https://...firebaseio.com
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;

// Операторский пульт
const { writeHeartbeat, writeEvent, writeFirebaseError } = require("../lib/opsPulse");
const { writeHealthMetrics } = require("../../server/lib/healthMetrics");
const { RSS_SOURCES } = require("../lib/rssSourcesByLang");

// Максимум кандидатов для сбора (на язык)
const MAX_CANDIDATES_PER_LANG = 60;

// Временное окно для сбора новостей (6 часов)
const NEWS_WINDOW_HOURS = 6;

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

// --- RSS auto-disable (self-healing sources) ---
// Stores per-source health in Firebase RTDB:
// /newsMeta/rssHealth/<lang>/<sourceKey> = { failCount, disabledUntil, lastStatus, lastOkAt, lastFailAt, lastError }
// Rule: if failCount >= 3 => disable 24h, then retry later.
const RSS_AUTO_DISABLE_ENABLED = (process.env.RSS_AUTO_DISABLE_ENABLED ?? "true") === "true";
const RSS_FAIL_LIMIT = Number(process.env.RSS_FAIL_LIMIT || 3);
const RSS_DISABLE_MS = Number(process.env.RSS_DISABLE_MS || 24 * 60 * 60 * 1000);

function safeKey(value) {
  if (!value) return "unknown";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

async function getRssHealth(FIREBASE_DB_URL, lang, sourceKey) {
  try {
    const url = `${FIREBASE_DB_URL}/newsMeta/rssHealth/${safeKey(lang)}/${safeKey(sourceKey)}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function setRssHealth(FIREBASE_DB_URL, lang, sourceKey, patch) {
  try {
    const url = `${FIREBASE_DB_URL}/newsMeta/rssHealth/${safeKey(lang)}/${safeKey(sourceKey)}.json`;
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    // silent: health is best-effort
  }
}

async function shouldSkipSource({ FIREBASE_DB_URL, lang, sourceKey, now }) {
  if (!RSS_AUTO_DISABLE_ENABLED || !FIREBASE_DB_URL) return false;
  const h = await getRssHealth(FIREBASE_DB_URL, lang, sourceKey);
  if (!h || !h.disabledUntil) return false;
  return Number(h.disabledUntil) > now;
}

async function recordSourceOk({ FIREBASE_DB_URL, lang, sourceKey, now }) {
  if (!RSS_AUTO_DISABLE_ENABLED || !FIREBASE_DB_URL) return;
  await setRssHealth(FIREBASE_DB_URL, lang, sourceKey, {
    failCount: 0,
    disabledUntil: 0,
    lastStatus: 200,
    lastOkAt: now,
  });
}

async function recordSourceFail({ FIREBASE_DB_URL, lang, sourceKey, now, status, error }) {
  if (!RSS_AUTO_DISABLE_ENABLED || !FIREBASE_DB_URL) return;

  const h = (await getRssHealth(FIREBASE_DB_URL, lang, sourceKey)) || {};
  const nextFail = Number(h.failCount || 0) + 1;

  const patch = {
    failCount: nextFail,
    lastStatus: status ?? null,
    lastFailAt: now,
    lastError: error ? String(error).slice(0, 180) : "rss_fetch_failed",
  };

  if (nextFail >= RSS_FAIL_LIMIT) {
    patch.disabledUntil = now + RSS_DISABLE_MS;
  }

  await setRssHealth(FIREBASE_DB_URL, lang, sourceKey, patch);
}


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
    const error = new Error(`RSS fetch failed for ${sourceName}: HTTP ${res.status}`);
    error.statusCode = res.status;
    throw error;
  }
  const xml = await res.text();
  const sourceId = safeKey(sourceName);
  const items = parseRss(xml, sourceId, [sourceLang]);
  return items;
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

function safeUrlHost(url) {
  if (!url) return "unknown";
  try {
    return new URL(url).host || "unknown";
  } catch (e) {
    return "unknown";
  }
}

function sanitizeErrorMessage(message) {
  if (!message) return "unknown error";
  const trimmed = String(message).slice(0, 500);
  const withoutUrls = trimmed.replace(/https?:\/\/\S+/gi, (match) => {
    try {
      return new URL(match).host || "<url>";
    } catch (e) {
      return "<url>";
    }
  });
  return withoutUrls.slice(0, 200);
}

function buildSourceError(lang, source, err) {
  const message = sanitizeErrorMessage((err && err.message) ? err.message : err);
  const entry = {
    lang,
    sourceName: source && source.name ? source.name : "unknown",
    urlHost: safeUrlHost(source && source.url ? source.url : ""),
    message,
  };
  if (err && err.statusCode) {
    entry.statusCode = err.statusCode;
  }
  return entry;
}

// ---------- МУСОР-ФИЛЬТР (до OpenAI) ----------

function isJunkItem(item, publishedSources, publishedTitles) {
  // Нет title или url
  if (!item.title || !item.link) {
    return { isJunk: true, reason: "missing title or url" };
  }

  // title < 22 символа
  if (item.title.length < 22) {
    return { isJunk: true, reason: "title too short" };
  }

  // Источник уже публиковался на этом языке за 12 часов
  const sourceId = item.sourceId || safeKey(item.sourceName || "");
  const now = Date.now();
  const cutoff12h = now - 12 * 60 * 60 * 1000;
  
  if (publishedSources[sourceId] && publishedSources[sourceId] > cutoff12h) {
    return { isJunk: true, reason: "source published recently" };
  }

  // Заголовок похож на опубликованный за 48 часов
  const titleKey = safeKey(normalizeTitle(item.title));
  const cutoff48h = now - 48 * 60 * 60 * 1000;
  
  if (publishedTitles[titleKey] && publishedTitles[titleKey] > cutoff48h) {
    return { isJunk: true, reason: "similar title published recently" };
  }

  return { isJunk: false };
}

// ---------- СКОРИНГ НОВОСТЕЙ (0-100) ----------

function scoreNewsItem(item) {
  let score = 0;
  const title = (item.title || "").toLowerCase();
  const description = (item.description || "").toLowerCase();
  const text = `${title} ${description}`;

  // +25 — международные последствия
  const internationalKeywords = [
    "international", "global", "world", "united nations", "eu", "nato",
    "международный", "мировой", "оон", "ес", "нато",
    "international", "weltweit", "eu", "nato", "uno"
  ];
  if (internationalKeywords.some(kw => text.includes(kw))) {
    score += 25;
  }

  // +20 — власть / закон / институты
  const powerKeywords = [
    "government", "parliament", "court", "law", "legislation", "policy",
    "правительство", "парламент", "суд", "закон", "политика",
    "regierung", "parlament", "gericht", "gesetz", "politik"
  ];
  if (powerKeywords.some(kw => text.includes(kw))) {
    score += 20;
  }

  // +15 — права, свободы, автономия
  const rightsKeywords = [
    "rights", "freedom", "liberty", "autonomy", "privacy", "democracy",
    "права", "свобода", "автономия", "приватность", "демократия",
    "rechte", "freiheit", "autonomie", "privat", "demokratie"
  ];
  if (rightsKeywords.some(kw => text.includes(kw))) {
    score += 15;
  }

  // +10 — технологии, ИИ, наука
  const techKeywords = [
    "technology", "ai", "artificial intelligence", "science", "research",
    "технология", "ии", "искусственный интеллект", "наука", "исследование",
    "technologie", "ki", "künstliche intelligenz", "wissenschaft", "forschung"
  ];
  if (techKeywords.some(kw => text.includes(kw))) {
    score += 10;
  }

  // +10 — решение / прецедент / первый случай
  const precedentKeywords = [
    "first", "precedent", "decision", "ruling", "breakthrough",
    "первый", "прецедент", "решение", "прорыв",
    "erst", "präzedenzfall", "entscheidung", "durchbruch"
  ];
  if (precedentKeywords.some(kw => text.includes(kw))) {
    score += 10;
  }

  // −15 — локальный криминал без последствий
  const crimeKeywords = [
    "murder", "robbery", "theft", "assault", "arrest",
    "убийство", "ограбление", "кража", "нападение", "арест",
    "mord", "raub", "diebstahl", "angriff", "verhaftung"
  ];
  if (crimeKeywords.some(kw => text.includes(kw)) && 
      !internationalKeywords.some(kw => text.includes(kw)) &&
      !powerKeywords.some(kw => text.includes(kw))) {
    score -= 15;
  }

  // −15 — спорт / шоу / селебы
  const entertainmentKeywords = [
    "sport", "football", "soccer", "celebrity", "star", "show",
    "спорт", "футбол", "звезда", "шоу", "селебрити",
    "sport", "fußball", "star", "show", "prominente"
  ];
  if (entertainmentKeywords.some(kw => text.includes(kw))) {
    score -= 15;
  }

  // −10 — сенсационность без содержания
  const sensationalKeywords = [
    "shocking", "amazing", "incredible", "unbelievable", "breaking",
    "шокирующий", "невероятный", "сенсация",
    "schockierend", "unglaublich", "sensation"
  ];
  if (sensationalKeywords.some(kw => text.includes(kw)) && score < 20) {
    score -= 10;
  }

  // Ограничиваем диапазон 0-100
  return Math.max(0, Math.min(100, score));
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

// ---------- SAVE TO FORUM ----------

async function saveNewsToForumLang(item, analyticData, langCode, scheduledFor) {
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
    scheduledFor: scheduledFor, // Время ближайшего часа для публикации
    authorNickname: "NovaCiv News",
    lang: langCode,
    sourceId: safeKey(item.sourceId || item.sourceName || ""),
    sourceName: item.sourceName || "",
    originalGuid: item.guid || "",
    originalLink: item.link || "",
    pubDate: item.pubDate || "",
    imageUrl: item.imageUrl || "",
    analysisLang: "en", // Анализ всегда на EN
    posted: false,
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

exports.handler = async (event, context) => {
  const startTime = Date.now();
  const component = "fetch-news";
  const requestId = context && context.awsRequestId;
  console.log("fetch-news-background start", { requestId });

  let scheduledFor = null;
  const languages = ["ru", "en", "de"];
  const results = {
    ru: { prepared: false, fallback: false },
    en: { prepared: false, fallback: false },
    de: { prepared: false, fallback: false },
  };
  let totalCreated = 0;
  const errors = [];
  let healthStatus = "error";
  let healthDetails = {};
  let response;

  // Записываем начало выполнения
  await writeHeartbeat(component, {
    lastRunAt: startTime,
  });

  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      await writeEvent(component, "warn", "Invalid HTTP method", { method: event.httpMethod });
      response = {
        statusCode: 405,
        body: "Method Not Allowed",
      };
      healthDetails = { error: "Method Not Allowed" };
      return response;
    }

    if (!OPENAI_API_KEY || !FIREBASE_DB_URL) {
      response = {
        statusCode: 200,
        body: JSON.stringify({
          ok: false,
          error: "OPENAI_API_KEY или FIREBASE_DB_URL не заданы на сервере.",
        }),
      };
      healthDetails = { error: "Missing OPENAI_API_KEY or FIREBASE_DB_URL" };
      return response;
    }

    // Вычисляем scheduledFor (ближайший час)
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    scheduledFor = nextHour.getTime();

    console.log(`[fetch-news] Preparing news for ${new Date(scheduledFor).toISOString()}`);

    for (const lang of languages) {
      const langStart = Date.now();
      console.log(`[fetch-news] ${lang}: start`);

      try {
        // Загружаем метаданные для дедупа
        const meta = await loadNewsMeta(lang);
        const { processedKeys, titleKeys } = meta;

        // Строим словари для мусор-фильтра
        const publishedSources = {};
        const publishedTitles = {};
        const nowTs = Date.now();
        const cutoff24h = nowTs - 24 * 60 * 60 * 1000;
        const cutoff48h = nowTs - 48 * 60 * 60 * 1000;

        // Заполняем publishedSources из processedKeys
        for (const [key, value] of Object.entries(processedKeys)) {
          if (value.processedAt && value.processedAt > cutoff24h) {
            const sourceId = value.sourceId || key.split("::")[0];
            if (sourceId) {
              publishedSources[sourceId] = Math.max(publishedSources[sourceId] || 0, value.processedAt);
            }
          }
        }

        // Заполняем publishedTitles из titleKeys
        for (const [key, value] of Object.entries(titleKeys)) {
          if (value.processedAt && value.processedAt > cutoff48h) {
            publishedTitles[key] = Math.max(publishedTitles[key] || 0, value.processedAt);
          }
        }

        // 1) Сбор кандидатов за последние 6 часов
        const rawSources = RSS_SOURCES[lang] || [];
        const seen = new Set();
        const sources = [];
        for (const s of rawSources) {
          if (!s || !s.url) continue;
          const key = String(s.url).trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          sources.push(s);
        }
        if (sources.length === 0) {
          console.log(`[fetch-news] No sources for ${lang}`);
          continue;
        }

        const candidates = [];
        const windowStart = nowTs - NEWS_WINDOW_HOURS * 60 * 60 * 1000;

        for (const source of sources) {
          try {
            const sourceKey = `${source.name}::${source.url}`;
            if (await shouldSkipSource({ FIREBASE_DB_URL, lang, sourceKey, now: Date.now() })) {
              console.log(`[fetch-news] ${lang}: source temporarily disabled: ${source.name}`);
              continue;
            }

            const items = await fetchRssSource(source.url, source.name, lang);
            items.forEach(item => {
              item.sourceName = source.name;
              item.sourceLang = lang;
              item.sourceId = safeKey(source.name);
            });
            
            // Фильтруем по времени (последние 6 часов)
            const recentItems = items.filter(item => {
              if (!item.pubDate) return false;
              try {
                const pubTime = new Date(item.pubDate).getTime();
                return pubTime >= windowStart;
              } catch (e) {
                return false;
              }
            });

            candidates.push(...recentItems);
            
            await recordSourceOk({ FIREBASE_DB_URL, lang, sourceKey, now: Date.now() });

            if (candidates.length >= MAX_CANDIDATES_PER_LANG) {
              break; // Жёсткий лимит
            }
          } catch (err) {
            const sourceKey = `${source.name}::${source.url}`;
            await recordSourceFail({
              FIREBASE_DB_URL,
              lang,
              sourceKey,
              now: Date.now(),
              status: err && (err.statusCode || err.status) ? (err.statusCode || err.status) : null,
              error: err && err.message ? err.message : String(err),
            });
            const entry = buildSourceError(lang, source, err);
            errors.push(entry);
            console.error(
              `[fetch-news] RSS fetch error for ${entry.lang}/${entry.sourceName} (${entry.urlHost}):`,
              entry.message,
            );
          }
        }

        // Ограничиваем до MAX_CANDIDATES_PER_LANG
        const limitedCandidates = candidates.slice(0, MAX_CANDIDATES_PER_LANG);
        console.log(`[fetch-news] ${lang}: collected ${limitedCandidates.length} candidates`);

        // 2) Мусор-фильтр
        const filteredCandidates = [];
        for (const item of limitedCandidates) {
          const junkCheck = isJunkItem(item, publishedSources, publishedTitles);
          if (!junkCheck.isJunk) {
            filteredCandidates.push(item);
          }
        }
        console.log(`[fetch-news] ${lang}: after junk filter: ${filteredCandidates.length}`);

        if (filteredCandidates.length === 0) {
          console.log(`[fetch-news] ${lang}: no candidates after filtering`);
          // Fallback: попробуем взять EN и перевести
          if (lang !== "en") {
            results[lang].fallback = true;
          }
          continue;
        }

        // 3) Скоринг
        const scoredCandidates = filteredCandidates.map(item => ({
          item,
          score: scoreNewsItem(item),
        }));

        // 4) Выбор ТОП-5
        const top5 = scoredCandidates
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        console.log(`[fetch-news] ${lang}: top 5 scores:`, top5.map(t => t.score));

        // 5) Анализ только ТОП-5
        const analyzed = [];
        for (const { item, score } of top5) {
          try {
            // Анализ на EN
            const analyticEn = await analyzeNewsItemEn(item);
            
            // Проверяем валидность
            if (analyticEn && typeof analyticEn === "object" && 
                analyticEn.sense && analyticEn.why && analyticEn.view && analyticEn.question) {
              analyzed.push({
                item,
                score,
                analysis: analyticEn,
              });
            }
          } catch (err) {
            console.error(`[fetch-news] Analysis failed for ${lang} item:`, err.message);
          }
        }

        if (analyzed.length === 0) {
          console.log(`[fetch-news] ${lang}: no valid analysis results`);
          if (lang !== "en") {
            results[lang].fallback = true;
          }
          continue;
        }

        // 6) Финальный выбор 1 лучшей
        // Критерии: ясность sense, наличие причинно-следственного слоя, отсутствие морали, нормальный вопрос
        const best = analyzed
          .map(a => {
            let quality = 0;
            const { sense, why, view, question } = a.analysis;
            
            // Ясность sense (длина в разумных пределах)
            if (sense && sense.length >= 240 && sense.length <= 360) quality += 10;
            
            // Наличие причинно-следственного слоя в why
            if (why && (why.includes("leads to") || why.includes("affects") || why.includes("влияет") || why.includes("приводит"))) quality += 10;
            
            // Отсутствие морали в view (нет слов "should", "must", "должен", "обязан")
            if (view && !/(should|must|должен|обязан|sollte|muss)/i.test(view)) quality += 10;
            
            // Нормальный вопрос (не риторический, не "как вы считаете")
            if (question && !/(как вы считаете|what do you think|was denkst du)/i.test(question) && question.includes("?")) quality += 10;
            
            return { ...a, quality };
          })
          .sort((a, b) => (b.quality + b.score) - (a.quality + a.score))[0];

        if (!best) {
          console.log(`[fetch-news] ${lang}: no best candidate selected`);
          if (lang !== "en") {
            results[lang].fallback = true;
          }
          continue;
        }

        // 7) Сохранение в Firebase
        try {
          await saveNewsToForumLang(best.item, best.analysis, lang, scheduledFor);
          
          // Обновляем метаданные
          const key = makeNewsKey(best.item);
          const titleKey = safeKey(normalizeTitle(best.item.title || ""));
          const updatedProcessedKeys = { ...processedKeys };
          const updatedTitleKeys = { ...titleKeys };
          
          updatedProcessedKeys[key] = {
            processedAt: Date.now(),
            sourceId: best.item.sourceId || "",
          };
          if (titleKey) {
            updatedTitleKeys[titleKey] = {
              processedAt: Date.now(),
            };
          }
          
          await saveNewsMeta(lang, { processedKeys: updatedProcessedKeys, titleKeys: updatedTitleKeys });
          
          results[lang].prepared = true;
          totalCreated++;
          console.log(`[fetch-news] ${lang}: prepared 1 news item`);
          await writeEvent(component, "info", `prepared news for ${lang}`, { 
            lang, 
            score: best.score,
            quality: best.quality,
          });
        } catch (err) {
          console.error(`[fetch-news] Failed to save ${lang} news:`, err.message);
          await writeEvent(component, "error", `Failed to save news for ${lang}`, { 
            lang, 
            error: err.message,
          });
        }
      } finally {
        console.log(`[fetch-news] ${lang}: done in ${Date.now() - langStart}ms`);
      }
    }

    // Fallback для языков, где не удалось подготовить
    for (const lang of languages) {
      if (!results[lang].prepared && results[lang].fallback && lang !== "en") {
        // Пытаемся взять EN и перевести
        try {
          // Ищем последнюю EN новость
          if (FIREBASE_DB_URL) {
            const topicsUrl = `${FIREBASE_DB_URL}/forum/topics.json?orderBy="lang"&equalTo="en"&limitToLast=10`;
            const topicsResp = await fetch(topicsUrl);
            if (topicsResp.ok) {
              const topicsData = await topicsResp.json();
              const enTopics = Object.values(topicsData || {}).filter(t => 
                t.section === "news" && t.lang === "en" && t.sense && t.why && t.view && t.question
              );
              
              if (enTopics.length > 0) {
                const latestEn = enTopics.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
                
                // Переводим все поля
                const translateField = async (text) => {
                  if (!OPENAI_API_KEY || !text) return text;
                  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
                  const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${OPENAI_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model,
                      messages: [
                        { role: "system", content: "You are a precise translator. Return only the translation, no explanations." },
                        { role: "user", content: `Translate to ${lang === "ru" ? "Russian" : "German"}: ${text}` },
                      ],
                      max_tokens: 300,
                      temperature: 0.3,
                    }),
                  });
                  if (!response.ok) return text;
                  const data = await response.json();
                  return data.choices?.[0]?.message?.content?.trim() || text;
                };

                const translatedTitle = await translateField(latestEn.title);
                const translatedSense = await translateField(latestEn.sense);
                const translatedWhy = await translateField(latestEn.why);
                const translatedView = await translateField(latestEn.view);
                const translatedQuestion = await translateField(latestEn.question);

                const translatedTopic = {
                  ...latestEn,
                  id: `${latestEn.id || Date.now()}_translated_${lang}`,
                  lang: lang,
                  sourceLang: "en",
                  translatedFrom: true,
                  sourceTopicId: latestEn.id,
                  title: translatedTitle,
                  sense: translatedSense,
                  why: translatedWhy,
                  view: translatedView,
                  question: translatedQuestion,
                  scheduledFor: scheduledFor,
                  posted: false,
                };

                // Сохраняем переведённую topic
                const saveUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
                const saveResp = await fetch(saveUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(translatedTopic),
                });
                
                if (saveResp.ok) {
                  results[lang].prepared = true;
                  totalCreated++;
                  console.log(`[fetch-news] ${lang}: fallback translation used`);
                  await writeEvent(component, "warn", `fallback used for ${lang}`, { lang, sourceLang: "en" });
                }
              }
            }
          }
        } catch (err) {
          console.error(`[fetch-news] Fallback failed for ${lang}:`, err.message);
        }
      }
    }

    // Heartbeat
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastOkAt: Date.now(),
      metrics: {
        createdTopicsCount: totalCreated,
        preparedRu: results.ru.prepared,
        preparedEn: results.en.prepared,
        preparedDe: results.de.prepared,
        scheduledFor: scheduledFor,
      },
    });

    const preparedLangs = Object.entries(results)
      .filter(([, value]) => value && value.prepared)
      .map(([lang]) => lang);
    const hasSuccess = preparedLangs.length > 0;
    const partial = hasSuccess && (errors.length > 0 || preparedLangs.length < languages.length);

    healthStatus = hasSuccess ? (partial ? "partial" : "ok") : "error";
    healthDetails = {
      items: totalCreated,
      langs: preparedLangs,
      partial,
      failedSources: errors.length,
      errors: errors,
    };

    response = {
      statusCode: 200,
      body: JSON.stringify({
        ok: hasSuccess,
        prepared: totalCreated,
        results,
        scheduledFor: new Date(scheduledFor).toISOString(),
        partial,
        errors,
        error: hasSuccess ? undefined : "No news items were prepared for any language.",
      }),
    };
    return response;
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

    const preparedLangs = Object.entries(results)
      .filter(([, value]) => value && value.prepared)
      .map(([lang]) => lang);
    healthStatus = "error";
    healthDetails = {
      items: totalCreated,
      langs: preparedLangs,
      partial: true,
      failedSources: errors.length,
      errors: errors,
      error: errorMsg,
    };
    
    response = {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: errorMsg,
      }),
    };
    return response;
  } finally {
    const durationMs = Date.now() - startTime;
    console.log(`[fetch-news] total duration: ${durationMs}ms`);
    try {
      await writeHealthMetrics("news.fetch", {
        status: healthStatus,
        details: {
          ...healthDetails,
          durationMs,
          scheduledFor,
        },
      });
    } catch (err) {
      console.error("[fetch-news] Failed to write health metrics:", err);
    }
  }
};
