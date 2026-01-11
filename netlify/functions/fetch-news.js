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
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || "";


// Максимум новых RSS-элементов за один запуск
const MAX_NEW_ITEMS_PER_RUN = 2;

// Где храним метаданные о уже обработанных новостях
const NEWS_META_PATH = "/newsMeta/en.json";

// Источники с привязкой к языкам каналов
const SOURCES = [
  // Русскоязычные зарубежные / независимые
  {
    id: "bbc_russian",
    url: "https://feeds.bbci.co.uk/russian/rss.xml",
    languages: ["ru"],
  },
  {
    id: "dw_russian_all",
    url: "https://rss.dw.com/rdf/rss-ru-all",
    languages: ["ru"],
  },
  {
    id: "meduza_news",
    url: "https://meduza.io/rss/news",
    languages: ["ru"],
  },

  // Англоязычные мировые
  {
    id: "bbc_world",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    languages: ["en"],
  },
  {
    id: "dw_english_world",
    url: "https://rss.dw.com/rdf/rss-en-world",
    languages: ["en"],
  },
  {
    id: "guardian_world",
    url: "https://www.theguardian.com/world/rss",
    languages: ["en"],
  },

  // Немецкие общенациональные
  {
    id: "tagesschau",
    url: "https://www.tagesschau.de/xml/rss2",
    languages: ["de"],
  },
  {
    id: "dw_german_all",
    url: "https://rss.dw.com/rdf/rss-de-all",
    languages: ["de"],
  },
];

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

Your task is to briefly and clearly explain the news for NovaCiv readers
and show how it looks through our values.

Answer in ENGLISH in a calm, neutral tone. Avoid propaganda language and party slogans.
Do not attack individuals.

Structure of the answer:
1) Short summary – 3–5 sentences in simple language.
2) Why it matters – 2–4 sentences about how it affects people, freedoms, the future,
   technologies, or ecosystems.
3) NovaCiv perspective – 3–6 sentences: where you see risks of violence, monopolies or
   manipulation, and where you see chances for science, cooperation and fair social systems.
4) Question to the reader – 1–2 short questions inviting them to reflect on their own view.

Do not invent facts that are not in the news.
If information is missing, honestly say what data would be needed for solid conclusions.
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

async function fetchRssSource(source) {
  const res = await fetch(source.url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `RSS fetch failed for ${source.id}: HTTP ${res.status} – ${text}`,
    );
  }
  const xml = await res.text();
  const items = parseRss(xml, source.id, source.languages || []);
  return items;
}

function normalizeTitle(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"“”]/g, '"')
    .trim();
}

function makeNewsKey(item) {
  const base = (item.guid || item.link || item.title || "").trim();
  return `${item.sourceId}::${base.slice(0, 200)}`;
}

// ---------- META IN FIREBASE ----------

const emptyMeta = { processedKeys: {}, titleKeys: {} };

async function loadNewsMeta() {
  if (!FIREBASE_DB_URL) return emptyMeta;

  try {
    const res = await fetch(`${FIREBASE_DB_URL}${NEWS_META_PATH}`);
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
    console.error("Error loading news meta:", e);
    return emptyMeta;
  }
}

async function saveNewsMeta(meta) {
  if (!FIREBASE_DB_URL) return;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}${NEWS_META_PATH}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Failed to write news meta:", res.status, text);
    }
  } catch (e) {
    console.error("Error writing news meta:", e);
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

async function saveNewsToForumLang(item, analyticText, langCode) {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not set");
  }

  const now = Date.now();
  const payload = {
    title: item.title || "(no title)",
    content: analyticText.trim(),
    section: "news",
    createdAt: now,
    createdAtServer: now,
    authorNickname: "NovaCiv News",
    lang: langCode,
    sourceId: item.sourceId || "",
    originalGuid: item.guid || "",
    originalLink: item.link || "",
    pubDate: item.pubDate || "",
    imageUrl: item.imageUrl || "",
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

  return answer;
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

// ---------- HANDLER ----------

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  if (NEWS_CRON_SECRET) {
    const qs = event.queryStringParameters || {};
    if (!qs.token || qs.token !== NEWS_CRON_SECRET) {
      return {
        statusCode: 403,
        body: "Forbidden",
      };
    }
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
    const meta = await loadNewsMeta();
    const processedKeys = { ...(meta.processedKeys || {}) };
    const titleKeys = { ...(meta.titleKeys || {}) };

    // 1) Тянем все источники
    const allItems = [];
    let sourcesOk = 0;
    let sourcesFailed = 0;
    for (const src of SOURCES) {
      try {
        const items = await fetchRssSource(src);
        allItems.push(...items);
        sourcesOk++;
      } catch (err) {
        console.error("RSS fetch error:", src.id, err);
        sourcesFailed++;
      }
    }

    // 2) Сортируем по дате (сначала новые)
    allItems.sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

    // 3) Отбираем новые
    const toProcess = [];
    for (const item of allItems) {
      if (toProcess.length >= MAX_NEW_ITEMS_PER_RUN) break;

      const key = makeNewsKey(item);
      const titleKey = normalizeTitle(item.title);

      if (processedKeys[key]) continue;
      if (titleKey && titleKeys[titleKey]) continue;
      if (!item.title && !item.description) continue;

      toProcess.push({ item, key, titleKey });

      processedKeys[key] = { reservedAt: Date.now() };
      if (titleKey) {
        titleKeys[titleKey] = { reservedAt: Date.now() };
      }
    }

    if (toProcess.length === 0) {
      await saveNewsMeta({ processedKeys, titleKeys });
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          processed: 0,
          message: "No new items",
        }),
      };
    }

    let successCount = 0;
    const titles = [];

    for (const entry of toProcess) {
      const { item, key, titleKey } = entry;

      try {
        const analyticEn = await analyzeNewsItemEn(item);

        const textsByLang = {
          en: analyticEn,
        };

        for (const cfg of LANG_OUTPUTS) {
          const code = cfg.code;

          // Если у источника нет этого языка — пропускаем
          if (
            Array.isArray(item.targetLangs) &&
            item.targetLangs.length > 0 &&
            !item.targetLangs.includes(code)
          ) {
            continue;
          }

          // Перевод, если нужен
          if (!textsByLang[code]) {
            const translated = await translateText(analyticEn, code);
            textsByLang[code] = translated;
          }

          const textForLang = textsByLang[code];

          // Сохраняем только в форум
          if (cfg.saveToForum) {
            await saveNewsToForumLang(item, textForLang, code);
          }
        }

        processedKeys[key] = {
          processedAt: Date.now(),
          sourceId: item.sourceId || null,
          link: item.link || null,
          title: item.title || null,
        };

        if (titleKey) {
          titleKeys[titleKey] = {
            processedAt: Date.now(),
            sourceId: item.sourceId || null,
            link: item.link || null,
          };
        }


        // --- Закрыли цикл LANG_OUTPUTS ‼️ ---
        // Теперь финализируем обработку этой новости

        processedKeys[key] = {
          processedAt: Date.now(),
          sourceId: item.sourceId || null,
          link: item.link || null,
          title: item.title || null,
        };

        if (titleKey) {
          titleKeys[titleKey] = {
            processedAt: Date.now(),
            sourceId: item.sourceId || null,
            link: item.link || null,
          };
        }

        successCount += 1;
        titles.push(item.title || "(no title)");

      } catch (err) {
        console.error("Failed to process news item:", item.title, err);
      }
    }

    await saveNewsMeta({ processedKeys, titleKeys });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        processed: successCount,
        titles,
      }),
    };
  } catch (err) {
    console.error("fetch-news fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(err && err.message ? err.message : err),
      }),
    };
  }
};
