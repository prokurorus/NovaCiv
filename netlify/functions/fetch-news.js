// netlify/functions/fetch-news.js

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || "";

// Telegram: бот и канал для автопостинга новостей (пока EN)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID =
  process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

// Максимум новостей за один запуск
const MAX_NEW_ITEMS_PER_RUN = 2;

// Источники новостей (пока один)
const SOURCES = [
  {
    id: "bbc_world",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
];

// --------- PROMPTS ---------

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
– sustainable attitude to the planet and resources.

You receive a news item (headline, short description, sometimes a text fragment).

Your task is to briefly and clearly explain the news for NovaCiv readers
and show how it looks through our values.

Answer in ENGLISH, in a calm, neutral tone.

Structure of the answer:
1) Short summary – 3–5 sentences in simple language.
2) Why it matters – 2–4 sentences.
3) NovaCiv perspective – 3–6 sentences.
4) Question to the reader – 1–2 short questions.

Do not invent facts that are not in the news.
If information is missing, honestly say what data would be needed.
`.trim();

// --------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---------

function stripCdata(str) {
  if (!str) return "";
  let s = str.trim();
  const cdataStart = "<![CDATA[";
  const cdataEnd = "]]>";
  if (s.startsWith(cdataStart) && s.endsWith(cdataEnd)) {
    s = s.slice(cdataStart.length, s.length - cdataEnd.length).trim();
  }
  return s;
}

// Получить содержимое тега без регулярок
function extractTag(xml, tag) {
  if (!xml) return "";
  const openTag = "<" + tag;
  let start = xml.indexOf(openTag);
  if (start === -1) return "";
  const gtIndex = xml.indexOf(">", start);
  if (gtIndex === -1) return "";
  const closeTag = "</" + tag + ">";
  const end = xml.indexOf(closeTag, gtIndex + 1);
  if (end === -1) return "";
  const inner = xml.slice(gtIndex + 1, end);
  return stripCdata(inner);
}

// Простой разбор RSS <item>...</item>
function parseRss(xml, sourceId) {
  const items = [];
  if (!xml) return items;

  let pos = 0;
  while (true) {
    const start = xml.indexOf("<item>", pos);
    if (start === -1) break;
    const end = xml.indexOf("</item>", start);
    if (end === -1) break;

    const itemXml = xml.slice(start + "<item>".length, end);

    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const description = extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate");
    const guid = extractTag(itemXml, "guid") || link || title;

    items.push({
      sourceId,
      guid,
      title,
      link,
      description,
      pubDate,
    });

    pos = end + "</item>".length;
  }

  return items;
}

// Загрузка RSS
async function fetchRssSource(source) {
  const res = await fetch(source.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch RSS: HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseRss(xml, source.id);
}

// Нормализованный заголовок для сравнения (без регулярок)
function normalizeTitle(title) {
  if (!title) return "";
  let s = title.trim().toLowerCase();
  let result = "";
  let inSpace = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const isSpace =
      ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "\f";
    if (isSpace) {
      if (!inSpace) {
        result += " ";
        inSpace = true;
      }
    } else {
      result += ch;
      inSpace = false;
    }
  }

  return result;
}

// Ключ уникальности новости
function makeNewsKeyFromParts(sourceId, link, guid, title) {
  const s = sourceId || "unknown";
  const id = link || guid || title || "";
  return `${s}__${id}`;
}

function makeNewsKeyFromItem(item) {
  return makeNewsKeyFromParts(
    item.sourceId,
    item.link,
    item.guid,
    item.title,
  );
}

// Загружаем уже существующие новости из forum/topics
async function loadExistingNewsInfo() {
  const strongKeys = new Set();
  const titleKeys = new Set();

  if (!FIREBASE_DB_URL) return { strongKeys, titleKeys };

  try {
    const res = await fetch(`${FIREBASE_DB_URL}/forum/topics.json`);
    if (!res.ok) {
      console.error("Failed to read existing topics:", res.status);
      return { strongKeys, titleKeys };
    }
    const data = await res.json();
    if (!data || typeof data !== "object") return { strongKeys, titleKeys };

    for (const id of Object.keys(data)) {
      const t = data[id];
      if (!t || t.section !== "news") continue;

      const strongKey = makeNewsKeyFromParts(
        t.sourceId,
        t.originalLink,
        t.originalGuid,
        t.title,
      );
      strongKeys.add(strongKey);

      const titleKey = normalizeTitle(t.title || "");
      if (titleKey) {
        titleKeys.add(titleKey);
      }
    }
  } catch (e) {
    console.error("Error loading existing news keys:", e);
  }

  return { strongKeys, titleKeys };
}

// Сохраняем новость в forum/topics
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
    // дополнительные поля для уникальности и будущей аналитики
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
    throw new Error(
      `Firebase write error: HTTP ${res.status} – ${text}`,
    );
  }
}

// Отправка новости в Telegram
async function sendNewsToTelegram(item, analyticText) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_NEWS_CHAT_ID) return;

  const title = item.title || "(no title)";
  const link = item.link || "";
  const date = item.pubDate
    ? new Date(item.pubDate).toISOString().slice(0, 10)
    : "";

  const text =
    `📰 ${title}\n` +
    (date ? `${date}\n\n` : "\n") +
    `${analyticText.trim()}\n\n` +
    (link ? `More: ${link}` : "") +
    `\n\n— NovaCiv News Engine\nhttps://novaciv.space`;

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

// GPT-анализ одной новости
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
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
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

// --------- ОСНОВНОЙ HANDLER ---------

exports.handler = async (event) => {
  try {
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

    // 1) Считываем уже существующие новости из форума
    const { strongKeys, titleKeys } = await loadExistingNewsInfo();

    // 2) Забираем RSS со всех источников
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

    // сортировка по дате
    allItems.sort((a, b) => {
      const da = a.pubDate ? Date.parse(a.pubDate) : 0;
      const db = b.pubDate ? Date.parse(b.pubDate) : 0;
      return db - da;
    });

    // 3) Отбираем только те, которых ещё нет в базе
    const fresh = [];
    for (const item of allItems) {
      const strongKey = makeNewsKeyFromItem(item);
      const titleKey = normalizeTitle(item.title || "");

      if (strongKeys.has(strongKey)) continue;
      if (titleKey && titleKeys.has(titleKey)) continue;

      fresh.push({ item, strongKey, titleKey });

      // Чтобы в этом же запуске не набрать дубли
      strongKeys.add(strongKey);
      if (titleKey) titleKeys.add(titleKey);

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

    // 4) Обрабатываем свежие новости
    let processedCount = 0;

    for (const { item } of fresh) {
      try {
        const analyticText = await analyzeNewsItem(item);
        await saveNewsToForum(item, analyticText);
        await sendNewsToTelegram(item, analyticText);
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
