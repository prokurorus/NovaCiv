// netlify/functions/fetch-news.js
//
// Что делает:
// 1) Берёт новости из RSS (сейчас BBC World).
// 2) Парсит <item> (title, link, description, pubDate, guid).
// 3) Проверяет, что уже обрабатывали (по ключу и по заголовку) в /newsMeta/en.json.
// 4) Для новых новостей вызывает OpenAI, получает текст в стиле NovaCiv.
// 5) Сохраняет как тему форума (section: "news") в /forum/topics.
// 6) Отправляет пост в Telegram-канал NovaCiv.
// 7) Обновляет /newsMeta/en.json, чтобы при следующем запуске
//    не было повторов ни в Ленте, ни в Telegram.

// ---------- ENV ----------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL; // https://...firebaseio.com
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || "";

// Telegram: бот + канал для новостей (EN)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID =
  process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

// Максимум новых новостей за один запуск
const MAX_NEW_ITEMS_PER_RUN = 2;

// Где храним метаданные о уже обработанных новостях (EN)
const NEWS_META_PATH = "/newsMeta/en.json";

// Источники новостей (пока один)
const SOURCES = [
  {
    id: "bbc_world",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
];

// ---------- PROMPT ДЛЯ OPENAI ----------

const SYSTEM_PROMPT = `
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

// ---------- ВСПОМОГАТЕЛЬНОЕ ----------

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

// Простейший парсер RSS <item> ... </item>
function parseRss(xml, sourceId) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml))) {
    const block = match[1];

    const getTag = (tag) => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\s]*?)<\\/${tag}>`, "i");
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

    items.push({
      sourceId,
      title: title || "",
      link: link || "",
      guid: guid || "",
      pubDate: pubDate || "",
      description: description || "",
    });
  }

  return items;
}

// Забираем RSS одного источника
async function fetchRssSource(source) {
  const res = await fetch(source.url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `RSS fetch failed for ${source.id}: HTTP ${res.status} – ${text}`,
    );
  }
  const xml = await res.text();
  const items = parseRss(xml, source.id);
  return items;
}

// Нормализация заголовка для анти-дублей
function normalizeTitle(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"“”]/g, '"')
    .trim();
}

// Ключ новости — по источнику + guid/link/title
function makeNewsKey(item) {
  const base = (item.guid || item.link || item.title || "").trim();
  return `${item.sourceId}::${base.slice(0, 200)}`;
}

// ---------- ЧТЕНИЕ/ЗАПИСЬ META В FIREBASE ----------

const emptyMeta = { processedKeys: {}, titleKeys: {} };

async function loadNewsMeta() {
  if (!FIREBASE_DB_URL) return emptyMeta;

  try {
    const res = await fetch(`${FIREBASE_DB_URL}${NEWS_META_PATH}`);
    if (!res.ok) {
      // если ветка отсутствует — вернём пустую структуру
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

// ---------- ЗАПИСЬ В ФОРУМ ----------

async function saveNewsToForum(item, analyticText) {
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
    lang: "en",
    sourceId: item.sourceId || "",
    originalGuid: item.guid || "",
    originalLink: item.link || "",
    pubDate: item.pubDate || "",
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

// ---------- TELEGRAM ----------

function buildTelegramText(item, analyticText) {
  const lines = [];

  lines.push("🌐 NovaCiv — Movement news");
  if (item.pubDate) {
    const d = new Date(item.pubDate);
    if (!isNaN(d.getTime())) {
      lines.push(d.toLocaleDateString("en-GB"));
    }
  }
  lines.push("");

  if (item.title) {
    lines.push(item.title);
    lines.push("");
  }

  if (item.link) {
    lines.push(`Source: ${item.link}`);
    lines.push("");
  }

  lines.push(analyticText.trim());
  lines.push("");
  lines.push("Read more on the site: https://novaciv.space/news");

  return lines.join("\n");
}

async function sendNewsToTelegram(item, analyticText) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_NEWS_CHAT_ID) {
    console.warn(
      "Telegram is not configured: missing TELEGRAM_BOT_TOKEN or TELEGRAM_NEWS_CHAT_ID/TELEGRAM_CHAT_ID",
    );
    return;
  }

  const text = buildTelegramText(item, analyticText);

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_NEWS_CHAT_ID,
        text,
        disable_web_page_preview: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Telegram API error (news):", res.status, body);
    }
  } catch (err) {
    console.error("Telegram send error (news):", err);
  }
}

// ---------- OPENAI АНАЛИЗ ----------

async function analyzeNewsItem(item) {
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
        { role: "system", content: SYSTEM_PROMPT },
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

// ---------- HANDLER ----------

exports.handler = async (event) => {
  // Только GET/POST (под крон или ручной вызов)
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  // Простой секретный токен
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
    // 1) Загружаем метаданные (что уже обработано)
    const meta = await loadNewsMeta();
    const processedKeys = { ...(meta.processedKeys || {}) };
    const titleKeys = { ...(meta.titleKeys || {}) };

    // 2) Тянем все источники
    const allItems = [];
    for (const src of SOURCES) {
      try {
        const items = await fetchRssSource(src);
        allItems.push(...items);
      } catch (err) {
        console.error("RSS fetch error:", src.id, err);
      }
    }

    // 3) Сортируем по дате (сначала новые)
    allItems.sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

    // 4) Выбираем новые (не обработанные ранее)
    const toProcess = [];
    for (const item of allItems) {
      if (toProcess.length >= MAX_NEW_ITEMS_PER_RUN) break;

      const key = makeNewsKey(item);
      const titleKey = normalizeTitle(item.title);

      // Уже обработано по ключу
      if (processedKeys[key]) continue;
      // Уже есть новость с таким заголовком (анти-дубликат по title)
      if (titleKey && titleKeys[titleKey]) continue;

      // На всякий случай не обрабатываем пустые
      if (!item.title && !item.description) continue;

      toProcess.push({ item, key, titleKey });

      // Резервируем сразу в памяти, чтобы в рамках одного запуска
      // не взяли двойной дубликат
      processedKeys[key] = {
        reservedAt: Date.now(),
      };
      if (titleKey) {
        titleKeys[titleKey] = {
          reservedAt: Date.now(),
        };
      }
    }

    if (toProcess.length === 0) {
      // Просто ничего нового — тихо выходим
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

    // 5) Обрабатываем каждую новость
    for (const entry of toProcess) {
      const { item, key, titleKey } = entry;

      try {
        const analyticText = await analyzeNewsItem(item);
        await saveNewsToForum(item, analyticText);
        await sendNewsToTelegram(item, analyticText);

        // Помечаем как окончательно обработанную
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

    // 6) Обновляем мета-ветку (анти-дубликаты на будущее)
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
