// netlify/functions/broadcast-news.js

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CRON_SECRET = process.env.NEWS_CRON_SECRET;

// Каналы для новостей
const LANGUAGE_CONFIGS = [
  {
    code: "ru",
    chatEnv: "TELEGRAM_NEWS_CHAT_ID_RU",
  },
  {
    code: "en",
    chatEnv: "TELEGRAM_NEWS_CHAT_ID", // EN-канал (глобальный)
  },
  {
    code: "de",
    chatEnv: "TELEGRAM_NEWS_CHAT_ID_DE",
  },
];

// Простая отправка текста в Телеграм
async function sendToTelegram(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      // без parse_mode — Телеграм покажет как обычный текст, без проблем с спецсимволами
      disable_web_page_preview: false,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: data.ok, data };
}

// Формирование текста поста для Телеграма
function buildMessageText(topic) {
  const title = topic.title || "NovaCiv news";
  const content = topic.content || "";

  // Если когда-нибудь добавим ссылку в payload, можно будет её подставлять сюда
  // const link = topic.sourceLink || topic.link;

  let text = `${title}\n\n${content}`;

  // Немного фирменного хвоста — чтоб людям было понятно, откуда новость
  text += `\n\n— NovaCiv movement\nhttps://novaciv.space/news`;

  return text;
}

exports.handler = async (event) => {
  try {
    // Проверка секрета
    const token = event.queryStringParameters?.token;
    if (!CRON_SECRET || token !== CRON_SECRET) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          ok: false,
          error: "Unauthorized: invalid or missing token",
        }),
      };
    }

    if (!FIREBASE_DB_URL || !TELEGRAM_BOT_TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "Missing FIREBASE_DB_URL or TELEGRAM_BOT_TOKEN",
        }),
      };
    }

    // 1. Забираем все темы форума
    const topicsRes = await fetch(`${FIREBASE_DB_URL}/forum/topics.json`);
    if (!topicsRes.ok) {
      const text = await topicsRes.text();
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "Failed to load topics from Firebase",
          details: text,
        }),
      };
    }

    const topicsJson = (await topicsRes.json()) || {};
    const topics = Object.entries(topicsJson)
      .map(([id, t]) => ({ id, ...t }))
      .filter((t) => t && t.section === "news");

    if (!topics.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          processed: 0,
          message: "No news topics found",
        }),
      };
    }

    // Сортируем по времени создания — от старых к новым
    topics.sort((a, b) => {
      const aTime = a.createdAt || 0;
      const bTime = b.createdAt || 0;
      return aTime - bTime;
    });

    const perLanguage = {};
    let totalSent = 0;

    // 2. Для каждого языка берём по одной ещё не отправленной новости
    for (const cfg of LANGUAGE_CONFIGS) {
      const chatId = process.env[cfg.chatEnv];

      if (!chatId) {
        perLanguage[cfg.code] = {
          sent: 0,
          reason: `Env var ${cfg.chatEnv} is not set`,
        };
        continue;
      }

      // Ищем первый топик, который ещё не отправляли в этот язык
      const candidate = topics.find((t) => {
        const flags = t.telegramPosted || {};
        return !flags[cfg.code];
      });

      if (!candidate) {
        perLanguage[cfg.code] = {
          sent: 0,
          reason: "No new topics for this language",
        };
        continue;
      }

      const text = buildMessageText(candidate);
      const sendResult = await sendToTelegram(chatId, text);

      if (!sendResult.ok) {
        perLanguage[cfg.code] = {
          sent: 0,
          error: sendResult.data || "Telegram send error",
        };
        continue;
      }

      totalSent += 1;
      perLanguage[cfg.code] = {
        sent: 1,
        topicId: candidate.id,
        title: candidate.title,
      };

      // Помечаем в Firebase, что для этого языка новость уже отправлена
      const flags = candidate.telegramPosted || {};
      flags[cfg.code] = true;

      await fetch(
        `${FIREBASE_DB_URL}/forum/topics/${candidate.id}/telegramPosted.json`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(flags),
        }
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        totalSent,
        perLanguage,
      }),
    };
  } catch (err) {
    console.error("broadcast-news error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err.message || "Unexpected error",
      }),
    };
  }
};
