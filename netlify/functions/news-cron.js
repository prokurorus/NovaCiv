// netlify/functions/news-cron.js
// Крон-функция: берёт новые темы из раздела `news` форума NovaCiv
// и один раз рассылает каждую тему во все три Telegram-канала (RU / EN / DE).
// Повторные вызовы функции безопасны: темы, помеченные как отправленные,
// повторно не отправляются.

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_NEWS_CHAT_ID_EN =
  process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
const TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE;

function log(...args) {
  console.log("[news-cron]", ...args);
}

// Подпись по языку темы
function getTagline(lang) {
  if (lang === "ru") {
    return "Цифровое сообщество без правителей — только граждане.";
  }
  if (lang === "de") {
    return "Digitale Gemeinschaft ohne Herrscher – nur Bürger.";
  }
  return "Digital community without rulers — only citizens.";
}

async function sendToTelegram(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  if (!chatId) {
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

  if (!resp.ok) {
    const errorText = await resp.text();
    log("Telegram HTTP error:", resp.status, errorText);
    return { ok: false, httpError: true, status: resp.status };
  }

  const data = await resp.json();
  if (!data.ok) {
    log("Telegram error:", data);
  }
  return data;
}

function buildPostText(topic) {
  const lines = [];

  if (topic.content) {
    lines.push(String(topic.content).trim());
  } else if (topic.title) {
    lines.push(String(topic.title).trim());
  } else {
    lines.push("NovaCiv update");
  }

  lines.push("");
  lines.push("— NovaCiv movement");

  const tagline = getTagline(topic.lang);
  lines.push(tagline);
  lines.push("https://novaciv.space/news");

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  lines.push("");
  lines.push(`Posted via NovaCiv • ${stamp} UTC`);

  return lines.join("\n");
}

async function fetchNewsTopics() {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not configured");
  }

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

async function writeHealthMetrics(metrics) {
  if (!FIREBASE_DB_URL) return;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/health/news/newsCronLastRun.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metrics),
    });
    if (!res.ok) {
      const text = await res.text();
      log("Failed to write health metrics:", res.status, text);
    }
  } catch (e) {
    log("Error writing health metrics:", e);
  }
}

exports.handler = async (event) => {
  // Auto-diagnostics: generate runId and timestamp
  const runId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = new Date().toISOString();
  const trigger = event.headers?.["x-netlify-scheduled-event"] ? "scheduled" : "manual";

  log(`[${runId}] Starting news-cron at ${timestamp} (trigger: ${trigger})`);

  try {
    const url = new URL(event.rawUrl);
    const token = url.searchParams.get("token");
    const limitParam = url.searchParams.get("limit");

    if (!NEWS_CRON_SECRET) {
      log(`[${runId}] ERROR: NEWS_CRON_SECRET is not configured`);
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "NEWS_CRON_SECRET is not configured",
        }),
      };
    }

    if (!token || token !== NEWS_CRON_SECRET) {
      log(`[${runId}] ERROR: Forbidden - invalid token`);
      return {
        statusCode: 403,
        body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" }),
      };
    }

    const limit = limitParam
      ? Math.max(1, parseInt(limitParam, 10) || 1)
      : 10;

    log(`[${runId}] Fetching topics from Firebase (limit: ${limit})`);
    const topics = await fetchNewsTopics();
    log(`[${runId}] Fetched ${topics.length} total topics`);

    const freshTopics = topics
      .filter((t) => !t.telegramPostedAt)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .slice(0, limit);

    log(`[${runId}] Filtered to ${freshTopics.length} fresh topics (not posted yet)`);

    if (!freshTopics.length) {
      log(`[${runId}] No new topics to post - exiting`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          processed: 0,
          message: "No new topics to post",
          runId,
          timestamp,
        }),
      };
    }

    const perLanguage = {
      ru: { sent: 0, errors: [] },
      en: { sent: 0, errors: [] },
      de: { sent: 0, errors: [] },
    };

    for (const topic of freshTopics) {
      const topicLang = (topic.lang || "en").toLowerCase();
      const text = buildPostText(topic);

      // Определяем, в какой канал отправлять (только соответствующий языку темы)
      let targetChatId = null;
      let targetLangCode = null;

      if (topicLang === "ru" && TELEGRAM_NEWS_CHAT_ID_RU) {
        targetChatId = TELEGRAM_NEWS_CHAT_ID_RU;
        targetLangCode = "ru";
      } else if (topicLang === "en" && TELEGRAM_NEWS_CHAT_ID_EN) {
        targetChatId = TELEGRAM_NEWS_CHAT_ID_EN;
        targetLangCode = "en";
      } else if (topicLang === "de" && TELEGRAM_NEWS_CHAT_ID_DE) {
        targetChatId = TELEGRAM_NEWS_CHAT_ID_DE;
        targetLangCode = "de";
      }

      // Если канал для языка не настроен - логируем WARN и пропускаем
      if (!targetChatId) {
        log(
          `WARN: Topic ${topic.id} (lang=${topicLang}) skipped - no chat_id configured for this language`,
        );
        // НЕ ставим telegramPostedAt, чтобы не потерять пост
        continue;
      }

      // Отправляем только в соответствующий канал
      let sendSuccess = false;
      try {
        const res = await sendToTelegram(targetChatId, text);
        if (res && res.ok) {
          sendSuccess = true;
          perLanguage[targetLangCode].sent += 1;
        } else if (res && !res.skipped) {
          perLanguage[targetLangCode].errors.push(res);
          log(
            `Error sending topic ${topic.id} to ${targetLangCode}:`,
            res,
          );
        }
      } catch (err) {
        log(`Exception sending topic ${topic.id} to ${targetLangCode}:`, err);
        perLanguage[targetLangCode].errors.push({
          error: String(err && err.message ? err.message : err),
        });
      }

      // Ставим telegramPostedAt ТОЛЬКО если отправка успешна
      if (sendSuccess) {
        await markTopicAsPosted(topic.id);
      } else {
        log(
          `Topic ${topic.id} NOT marked as posted due to send failure - will retry on next run`,
        );
      }
    }

    const totalSent =
      perLanguage.ru.sent + perLanguage.en.sent + perLanguage.de.sent;

    // Write heartbeat metrics to Firebase
    await writeHealthMetrics({
      ts: Date.now(),
      runId,
      fetchedTopics: topics.length,
      processed: freshTopics.length,
      totalSent,
      perLanguage: {
        ru: { sent: perLanguage.ru.sent, errors: perLanguage.ru.errors.length },
        en: { sent: perLanguage.en.sent, errors: perLanguage.en.errors.length },
        de: { sent: perLanguage.de.sent, errors: perLanguage.de.errors.length },
      },
    });

    // Final logging with all metrics
    log(`[${runId}] Completed: processed=${freshTopics.length}, totalSent=${totalSent}, perLanguage: ru=${perLanguage.ru.sent}, en=${perLanguage.en.sent}, de=${perLanguage.de.sent}`);
    if (perLanguage.ru.errors.length > 0 || perLanguage.en.errors.length > 0 || perLanguage.de.errors.length > 0) {
      log(`[${runId}] Errors: ru=${perLanguage.ru.errors.length}, en=${perLanguage.en.errors.length}, de=${perLanguage.de.errors.length}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        processed: freshTopics.length,
        totalSent,
        perLanguage,
        runId,
        timestamp,
      }),
    };
  } catch (err) {
    log(`[${runId}] FATAL ERROR:`, err);
    console.error("news-cron error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: err.message,
        runId,
        timestamp,
      }),
    };
  }
};
