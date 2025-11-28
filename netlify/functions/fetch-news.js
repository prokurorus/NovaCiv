// netlify/functions/fetch-news.js

// Эта функция:
// 1) Берёт пару внешних RSS-лент,
// 2) вытаскивает из них свежие новости,
// 3) для каждой новости просит OpenAI сделать разбор через призму NovaCiv,
// 4) записывает результат в Firebase Realtime Database в путь forum/topics
//    с section: "news" — так же, как это делает Домовой,
// 5) автоматически отправляет новость в Telegram-канал NovaCiv.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL; // например: https://novaciv-web-default-rtdb.firebaseio.com
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || "";

// Для Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID =
  process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;


// Максимум новых новостей за один запуск (чтобы не сжечь токены)
// Для начала берём мало, чтобы не упираться в лимит 30 секунд у Netlify
const MAX_NEW_ITEMS_PER_RUN = 2;

// Источники новостей (для теста — только один, самый простой)
const SOURCES = [
  {
    id: "bbc_world",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: "politics",
  },
  // Остальные источники добавим позже, когда убедимся, что всё работает стабильно
];

// Промпт NovaCiv для новостей
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

Answer in **English** in a calm, neutral tone. Avoid propaganda language and party slogans.
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

// Очень простой разбор RSS без сторонних библиотек
function parseRss(xml, sourceId) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];

    const getTag = (tag) => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const mm = re.exec(block);
      if (!mm) return "";
      return mm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    };

    const title = getTag("title");
    const link = getTag("link");
    const description = getTag("description");
    const pubDate = getTag("pubDate");

    if (!title && !description) continue;

    items.push({
      sourceId,
      title,
      link,
      description,
      pubDate,
    });
  }
  return items;
}

// Ключ для "мы уже обработали эту новость"
function makeProcessedKey(item) {
  const base =
    (item.sourceId || "src") +
    "::" +
    (item.link || item.title || "").slice(0, 200);
  return base.replace(/[.#$/\[\]]/g, "_");
}

// Чтение списка уже обработанных новостей
async function loadProcessedSet() {
  if (!FIREBASE_DB_URL) return new Set();

  try {
    const res = await fetch(`${FIREBASE_DB_URL}/newsMeta/processed.json`);
    if (!res.ok) return new Set();
    const data = await res.json();
    if (!data || typeof data !== "object") return new Set();
    return new Set(Object.keys(data));
  } catch (e) {
    console.error("Failed to load processed news from Firebase:", e);
    return new Set();
  }
}

// Запись отметки «обработано»
async function markProcessed(key, item) {
  if (!FIREBASE_DB_URL) return;
  try {
    const body = {
      processedAt: Date.now(),
      sourceId: item.sourceId || null,
      link: item.link || null,
      title: item.title || null,
    };
    await fetch(
      `${FIREBASE_DB_URL}/newsMeta/processed/${encodeURIComponent(
        key,
      )}.json`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    console.error("Failed to mark news as processed:", e);
  }
}

// Сохранение новости в forum/topics (section: "news"),
// чтобы она появилась в Ленте /news
async function saveNewsToForum(item, analyticText) {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not set");
  }

  const now = Date.now();
  const payload = {
    title: item.title || "(без заголовка)",
    content: analyticText.trim(),
    section: "news",
    createdAt: now,
    createdAtServer: now,
    authorNickname: "NovaCiv News",
    lang: "en",
  };

  const res = await fetch(`${FIREBASE_DB_URL}/forum/topics.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Firebase write error: HTTP ${res.status} – ${text}`,
    );
  }
}

// Вызов OpenAI для одной новости
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

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
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
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OpenAI API error: HTTP ${response.status} – ${text}`,
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
    throw new Error("Empty answer from OpenAI for news item");
  }

  return answer;
}

// Формируем текст для Telegram
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

// Отправка одной новости в Telegram (не ломает общий процесс при ошибке)
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


    if (!res.ok) {
      const body = await res.text();
      console.error("Telegram API error (news):", res.status, body);
    }
  } catch (err) {
    console.error("Telegram send error (news):", err);
  }
}

exports.handler = async (event) => {
  // Только GET/POST (под крон)
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  // Простая защита: секретный токен в query
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
        error:
          "OPENAI_API_KEY или FIREBASE_DB_URL не заданы на сервере.",
      }),
    };
  }

  try {
    // 1) Загружаем уже обработанные ключи
    const processedSet = await loadProcessedSet();

    // 2) Тянем RSS с источников
    let allItems = [];
    for (const src of SOURCES) {
      try {
        const res = await fetch(src.url);
        if (!res.ok) {
          console.error(
            `RSS fetch error for ${src.id}:`,
            res.status,
          );
          continue;
        }
        const xml = await res.text();
        const items = parseRss(xml, src.id);
        allItems = allItems.concat(items);
      } catch (e) {
        console.error(`RSS error for ${src.id}:`, e);
      }
    }

    if (!allItems.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          processed: 0,
          message: "Нет новостей для обработки.",
        }),
      };
    }

    // 3) Сортируем по дате (если есть) — новые первыми
    allItems.sort((a, b) => {
      const da = a.pubDate ? Date.parse(a.pubDate) : 0;
      const db = b.pubDate ? Date.parse(b.pubDate) : 0;
      return db - da;
    });

    // 4) Фильтруем уже обработанные
    const fresh = [];
    for (const item of allItems) {
      const key = makeProcessedKey(item);
      if (processedSet.has(key)) continue;
      fresh.push({ item, key });
      if (fresh.length >= MAX_NEW_ITEMS_PER_RUN) break;
    }

    if (!fresh.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          processed: 0,
          message: "Все свежие новости уже обработаны ранее.",
        }),
      };
    }

    let processedCount = 0;
    for (const { item, key } of fresh) {
      try {
        const analyticText = await analyzeNewsItem(item);
        await saveNewsToForum(item, analyticText);
        await sendNewsToTelegram(item, analyticText); // <-- Автоматический пост в Telegram
        await markProcessed(key, item);
        processedCount++;
      } catch (e) {
        console.error("Failed to process one news item:", e);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        processed: processedCount,
      }),
    };
  } catch (e) {
    console.error("fetch-news runtime error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(e),
      }),
    };
  }
};
