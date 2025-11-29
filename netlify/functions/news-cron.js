// netlify/functions/news-cron.js
// Крон-функция: берёт новые темы из раздела `news` форума NovaCiv
// и один раз рассылает каждую тему во все три Telegram-канала (RU / EN / DE).
// Повторные вызовы функции безопасны: темы, помеченные как отправленные,
// повторно не отправляются.

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;

// Основной английский канал (по умолчанию)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID_EN =
  process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

// Русский и немецкий каналы
const TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
const TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE;

// Вспомогательный лог с префиксом
function log(...args) {
  console.log("[news-cron]", ...args);
}

// Безопасный fetch к Telegram
async function sendToTelegram(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  if (!chatId) {
    // Если для какого-то языка не указан канал — просто пропускаем.
    return { ok: false, skipped: true, reason: "chatId not configured" };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  const data = await resp.json();
  if (!data.ok) {
    log("Telegram error:", data);
  }
  return data;
}

// Формирование текста поста
function buildPostText(topic) {
  const lines = [];

  if (topic.content) {
    lines.push(String(topic.content).trim());
  } else if (topic.title) {
    lines.push(String(topic.title).trim());
  } else {
    lines.push("NovaCiv update");
  }

  // Ссылка на ленту (пока без якоря на конкретную новость)
  lines.push("");
  lines.push("— NovaCiv movement");
  lines.push("https://novaciv.space/news");

  // Метка времени отправки поста (UTC)
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  lines.push("");
  lines.push(`Posted via NovaCiv • ${stamp} UTC`);

  return lines.join("\n");
}

// Чтение новостей из Realtime Database
async function fetchNewsTopics() {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not configured");
  }

  // Берём только раздел `news`
  const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Firebase topics fetch failed: ${resp.status} ${resp.statusText}`,
    );
  }

  const data = await resp.json();
  if (!data || typeof data !== "object") {
    return [];
  }

  const items = Object.entries(data).map(([id, value]) => ({
    id,
    ...(value || {}),
  }));

  return items;
}

// Помечаем тему как отправленную
async function markTopicAsPosted(topicId) {
  if (!FIREBASE_DB_URL) return;

  const url = `${FIREBASE_DB_URL}/forum/topics/${topicId}.json`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telegramPostedAt: Date.now(),
    }),
  });

  if (!resp.ok) {
    log(
      "Failed to mark topic as posted:",
      topicId,
      resp.status,
      resp.statusText,
    );
  }
}

// Основной хендлер Netlify Function
exports.handler = async (event) => {
  try {
    // 1. Проверяем токен
    const url = new URL(event.rawUrl);
    const token = url.searchParams.get("token");
    const limitParam = url.searchParams.get("limit");

    if (!NEWS_CRON_SECRET) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "NEWS_CRON_SECRET is not configured",
        }),
      };
    }

    if (!token || token !== NEWS_CRON_SECRET) {
      return {
        statusCode: 403,
        body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" }),
      };
    }

    const limit = limitParam
      ? Math.max(1, parseInt(limitParam, 10) || 1)
      : 10;

    // 2. Берём все новости из раздела `news`
    const topics = await fetchNewsTopics();

    // 3. Фильтруем только те, что ещё не отправлены
    const freshTopics = topics
      .filter((t) => !t.telegramPostedAt)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .slice(0, limit);

    if (!freshTopics.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          processed: 0,
          message: "No new topics to post",
        }),
      };
    }

    const perLanguage = {
      ru: { sent: 0, errors: [] },
      en: { sent: 0, errors: [] },
      de: { sent: 0, errors: [] },
    };

    for (const topic of freshTopics) {
      const text = buildPostText(topic);

      const tasks = [];

      if (TELEGRAM_NEWS_CHAT_ID_RU) {
        tasks.push(
          sendToTelegram(TELEGRAM_NEWS_CHAT_ID_RU, text).then((res) => {
            if (res && res.ok) perLanguage.ru.sent += 1;
            else if (res && !res.skipped) perLanguage.ru.errors.push(res);
          }),
        );
      }

      if (TELEGRAM_NEWS_CHAT_ID_EN) {
        tasks.push(
          sendToTelegram(TELEGRAM_NEWS_CHAT_ID_EN, text).then((res) => {
            if (res && res.ok) perLanguage.en.sent += 1;
            else if (res && !res.skipped) perLanguage.en.errors.push(res);
          }),
        );
      }

      if (TELEGRAM_NEWS_CHAT_ID_DE) {
        tasks.push(
          sendToTelegram(TELEGRAM_NEWS_CHAT_ID_DE, text).then((res) => {
            if (res && res.ok) perLanguage.de.sent += 1;
            else if (res && !res.skipped) perLanguage.de.errors.push(res);
          }),
        );
      }

      // Параллельно, но дожидаемся перед пометкой как отправленной
      await Promise.all(tasks);

      await markTopicAsPosted(topic.id);
    }

    const totalSent =
      perLanguage.ru.sent + perLanguage.en.sent + perLanguage.de.sent;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        processed: freshTopics.length,
        totalSent,
        perLanguage,
      }),
    };
  } catch (err) {
    console.error("news-cron error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
