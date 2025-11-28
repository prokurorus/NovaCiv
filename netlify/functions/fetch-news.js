// netlify/functions/fetch-news.js

// Эта функция:
// 1) Берёт пару внешних RSS-лент,
// 2) вытаскивает из них свежие новости,
// 3) для каждой новости просит OpenAI сделать разбор через призму NovaCiv,
// 4) записывает результат в Firebase Realtime Database в путь forum/topics
//    с section: "news" — так же, как это делает Домовой.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL; // например: https://novaciv-web-default-rtdb.firebaseio.com
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || "";

// Telegram: бот и канал для автопостинга новостей
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
  // Остальные источники добавим позже, когда убедимся, что всё стабильно
];

// Система промпта для GPT
const ANALYSIS_SYSTEM_PROMPT = `
You are an analytical assistant for NovaCiv — a digital civilization project
built on values of non-violence, science, decentralization and respect for all sentient beings.

Your job is to:
– explain what happened in clear, neutral language;
– show why it matters for ordinary people, freedoms, knowledge and future;
– look at it through NovaCiv values: non-violence, transparency, decentralization, science,
  respect for intelligent life and rejection of manipulation.

Avoid propaganda language. Avoid taking sides. Stick to verifiable facts.
`.trim();

const ANALYSIS_USER_PROMPT_INTRO = `
You analyze world news for the NovaCiv movement.

NovaCiv values:
– non-violence and respect for any form of intelligent life;
– transparency of decisions and honest communication;
– decentralization of power and distrust of monopolies;
– personal freedom and responsibility;
– science, critical thinking and openness to new knowledge;
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
2) Why it matters – 2–4 sentences about
   how it affects people, freedoms, the future,
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

  while ((m = itemRegex.exec(xml))) {
    const itemXml = m[1];

    function extract(tag) {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const mm = r.exec(itemXml);
      if (!mm) return "";
      return mm[1]
        .replace(/<!\\[CDATA\\[/g, "")
        .replace(/\\]\\]>/g, "")
        .trim();
    }

    const title = extract("title");
    const link = extract("link");
    const description = extract("description");
    const pubDate = extract("pubDate");
    const guid = extract("guid") || link || title;

    items.push({
      sourceId,
      guid,
      title,
      link,
      description,
      pubDate,
    });
  }

  return items;
}

// Загрузка RSS-ленты
async function fetchRssSource(source) {
  const res = await fetch(source.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch RSS: HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseRss(xml, source.id);
}

// Помощник для ключа обработанности новости
function makeProcessedKey(item) {
  // Делаем ключ по sourceId + guid
  return `${item.sourceId}__${item.guid}`;
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

// Пометка новости как обработанной
async function markProcessed(key, item) {
  if (!FIREBASE_DB_URL) return;
  const body = {
    sourceId: item.sourceId,
    guid: item.guid,
    title: item.title || "",
    createdAt: Date.now(),
  };

  try {
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

// Отправка новости в Telegram-канал движения
async function sendNewsToTelegram(item, analyticText) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_NEWS_CHAT_ID) {
    return;
  }

  const title = item.title || "(no title)";
  const link = item.link || "";
  const date = item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : "";

  const text =
    `📰 ${title}\n` +
    (date ? `${date}\n\n` : "\n") +
    `${analyticText.trim()}\n\n` +
    (link ? `More: ${link}` : "");

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_NEWS_CHAT_ID,
          text,
          disable_web_page_preview: false,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error("Telegram send error:", res.status, body);
    }
  } catch (e) {
    console.error("Telegram send exception:", e);
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
${item.description || "(no description)"}

---

${ANALYSIS_USER_PROMPT_INTRO}
`.trim();

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: ANALYSIS_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.3,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenAI API error: HTTP ${res.status} – ${text}`,
    );
  }

  const data = await res.json();
  const answer =
    data.choices?.[0]?.message?.content?.trim() ||
    "No answer generated.";

  return answer;
}

// Основной handler функции Netlify
exports.handler = async (event) => {
  try {
    // Простейшая защита по секрету в query ?token=...
    const token = event.queryStringParameters?.token || "";
    if (NEWS_CRON_SECRET && token !== NEWS_CRON_SECRET) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          ok: false,
          error: "Unauthorized: bad token",
        }),
      };
    }

    // 1) Загружаем уже обработанные новости
    const processedSet = await loadProcessedSet();

    // 2) Тянем RSS со всех источников
    let allItems = [];
    for (const src of SOURCES) {
      try {
        const items = await fetchRssSource(src);
        allItems = allItems.concat(items);
      } catch (e) {
        console.error(`Failed to fetch source ${src.id}:`, e);
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
        await sendNewsToTelegram(item, analyticText);
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
