// netlify/functions/post-news-to-telegram.js
//
// Берёт ГОТОВЫЕ новости из Firebase (forum/topics, section: "news")
// и отправляет их в телеграм-каналы по языкам.
// Каждую тему постит максимум один раз в каждый язык,
// отмечая отправку в поле topic.telegramPosted[langCode] = true.

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CRON_SECRET = process.env.NEWS_CRON_SECRET;

const LANGUAGE_CONFIGS = [
  {
    code: "ru",
    chatEnv: "TELEGRAM_NEWS_CHAT_ID_RU",
  },
  {
    code: "en",
    chatEnv: "TELEGRAM_NEWS_CHAT_ID",
  },
  {
    code: "de",
    chatEnv: "TELEGRAM_NEWS_CHAT_ID_DE",
  },
];

// Формируем текст для Telegram из данных темы
function buildMessageText(topic) {
  const title = topic.title || "(без заголовка)";
  const content = topic.content || "";
  const link = topic.sourceUrl || topic.link || "";

  let text = `*${title}*\n\n${content}`;
  if (link) {
    text += `\n\n[Источник](${link})`;
  }

  return text;
}

// Читаем последние темы из Firebase
async function fetchTopics() {
  const url =
    `${FIREBASE_DB_URL}/forum/topics.json` +
    `?orderBy=%22createdAt%22&limitToLast=200`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to load topics from Firebase: HTTP ${res.status} – ${text}`,
    );
  }

  const data = await res.json();
  if (!data || typeof data !== "object") {
    return [];
  }

  return Object.entries(data)
    .map(([id, value]) => ({
      id,
      ...(value || {}),
    }))
    .filter((t) => t && t.section === "news" && !t.deleted);
}

// Отправка одного сообщения в Telegram
async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    throw new Error("Telegram token or chatId is not set");
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Telegram send error: HTTP ${res.status} – ${body || "no body"}`,
    );
  }

  return true;
}

// Обновляем флаг telegramPosted[langCode] у темы
async function markTopicAsPosted(topicId, langCode, existingFlags) {
  const flags = existingFlags || {};
  const newFlags = {
    ...flags,
    [langCode]: true,
  };

  const url = `${FIREBASE_DB_URL}/forum/topics/${topicId}/telegramPosted.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newFlags),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to update telegramPosted for topic ${topicId}: HTTP ${res.status} – ${text}`,
    );
  }

  return true;
}

exports.handler = async (event) => {
  try {
    // Проверяем токен (тот же, что и у fetch-news)
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
          error: "FIREBASE_DB_URL or TELEGRAM_BOT_TOKEN is not set",
        }),
      };
    }

    const topics = await fetchTopics();

    const perLanguage = {};
    let totalSent = 0;

    for (const cfg of LANGUAGE_CONFIGS) {
      const chatId = process.env[cfg.chatEnv];
      if (!chatId) {
        perLanguage[cfg.code] = {
          sent: 0,
          reason: `Env var ${cfg.chatEnv} is not set`,
        };
        continue;
      }

      // Ищем первую новость нужного языка, которую ещё не постили в TG
      const candidate = topics.find((t) => {
        if (t.lang !== cfg.code) return false;
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

      try {
        await sendTelegramMessage(chatId, text);
        await markTopicAsPosted(
          candidate.id,
          cfg.code,
          candidate.telegramPosted,
        );

        totalSent += 1;
        perLanguage[cfg.code] = {
          sent: 1,
          topicId: candidate.id,
        };
      } catch (err) {
        console.error(
          `Error sending topic ${candidate.id} to ${cfg.code}:`,
          err,
        );
        perLanguage[cfg.code] = {
          sent: 0,
          error: String(err && err.message ? err.message : err),
        };
      }
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
    console.error("post-news-to-telegram error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err.message || "Unexpected error",
      }),
    };
  }
};
