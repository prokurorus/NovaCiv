// netlify/functions/fetch-news.js

const fetch = require("node-fetch");
const Parser = require("rss-parser");
const OpenAI = require("openai").default;

const FIREBASE_URL = process.env.FIREBASE_URL;
const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID =
  process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SECRET_TOKEN = process.env.NEWS_TRIGGER_SECRET || "SECRET123";

const parser = new Parser();

// Build Telegram text from item + analytic text
function buildTelegramText(item, analyticText) {
  const title = item.title || "";
  const date = item.isoDate ? new Date(item.isoDate).toLocaleDateString("en-GB") : "";
  const link = item.link || "";

  return (
    `📰 *${title}*\n` +
    `_${date}_\n\n` +
    `${analyticText}\n\n` +
    `[Read more](${link})`
  );
}

// Send message to Telegram
async function sendNewsToTelegram(item, analyticText) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_NEWS_CHAT_ID) {
    console.warn("Missing Telegram token or chat ID");
    return;
  }

  const text = buildTelegramText(item, analyticText);
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_NEWS_CHAT_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Telegram error:", res.status, err);
  }
}

// Save news item to Firebase
async function saveNewsToForum(item, analyticText) {
  const topicId = item.guid.replace(/[^a-zA-Z0-9_-]/g, "");

  const payload = {
    id: topicId,
    title: item.title || "",
    content: analyticText,
    createdAt: Date.now(),
    language: "en",
    section: "news",
    originalLink: item.link || "",
  };

  const res = await fetch(`${FIREBASE_URL}/forum/topics/${topicId}.json?auth=${FIREBASE_SECRET}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Firebase save error:", res.status, err);
  }
}

// Check if news already processed
async function isProcessed(itemGuid) {
  const res = await fetch(`${FIREBASE_URL}/newsIndex/${itemGuid}.json?auth=${FIREBASE_SECRET}`);
  if (!res.ok) return false;
  return (await res.json()) === true;
}

// Mark news processed
async function markProcessed(itemGuid) {
  await fetch(`${FIREBASE_URL}/newsIndex/${itemGuid}.json?auth=${FIREBASE_SECRET}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(true),
  });
}

// Generate analytic text with GPT
async function analyzeNewsContent(content) {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  const prompt = `
Summarize the following news article in clean, factual, neutral English.
Then add a short paragraph explaining why this news matters globally.
Respond in plain text, no lists, no markup.

Article:
${content}
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0].message.content.trim();
}

exports.handler = async (event) => {
  // Token validation
  const token = event.queryStringParameters?.token;
  if (token !== SECRET_TOKEN) {
    return {
      statusCode: 403,
      body: "Forbidden: invalid token",
    };
  }

  try {
    const feed = await parser.parseURL("https://feeds.bbci.co.uk/news/world/rss.xml");

    let processedCount = 0;

    for (const item of feed.items) {
      const guid = item.guid || item.link || item.title;
      if (!guid) continue;

      const normalizedGuid = guid.replace(/[^a-zA-Z0-9_-]/g, "");

      // Skip if already processed
      if (await isProcessed(normalizedGuid)) continue;

      // Prepare text for GPT
      const fullText =
        (item.title || "") +
        "\n\n" +
        (item.content || item.contentSnippet || "") +
        "\n\nLink: " +
        (item.link || "");

      const analyticText = await analyzeNewsContent(fullText);

      // Save to Firebase
      await saveNewsToForum(item, analyticText);

      // Send to Telegram
      await sendNewsToTelegram(item, analyticText);

      // Mark processed
      await markProcessed(normalizedGuid);

      processedCount++;
    }

    return {
      statusCode: 200,
      body: `Processed ${processedCount} new items.`,
    };
  } catch (err) {
    console.error("Fetch-news error:", err);
    return {
      statusCode: 500,
      body: "Internal error",
    };
  }
};
