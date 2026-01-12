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

// Безопасная санитизация ключей Firebase
function safeKey(value) {
  if (!value) return "unknown";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
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

// Отправка текстового сообщения
async function sendTextToTelegram(chatId, text, replyMarkup) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  if (!chatId) {
    return { ok: false, skipped: true, reason: "chatId not configured" };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!data.ok) {
    log("Telegram error:", data);
  }
  return data;
}

// Отправка фото с caption (с fallback на текст если картинка не загружается)
async function sendPhotoToTelegram(chatId, photoUrl, caption, replyMarkup) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  if (!chatId) {
    return { ok: false, skipped: true, reason: "chatId not configured" };
  }

  if (!photoUrl) {
    // Если нет фото, отправляем как текст
    return sendTextToTelegram(chatId, caption, replyMarkup);
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

  const body = {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "HTML",
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    
    // Если ошибка с фото (404, 400), fallback на текст
    if (!data.ok && (data.error_code === 400 || data.error_code === 404)) {
      log("Photo send failed, falling back to text:", data.description);
      return sendTextToTelegram(chatId, caption, replyMarkup);
    }
    
    if (!data.ok) {
      log("Telegram error:", data);
    }
    return data;
  } catch (err) {
    log("Photo send error, falling back to text:", err.message);
    return sendTextToTelegram(chatId, caption, replyMarkup);
  }
}

// Обертка для обратной совместимости
async function sendToTelegram(chatId, text) {
  return sendTextToTelegram(chatId, text);
}

// Создание caption для фото поста (краткий формат)
function buildPostCaption(topic) {
  const lines = [];
  
  // Заголовок (жирный)
  if (topic.title) {
    lines.push(`<b>${escapeHtml(topic.title)}</b>`);
    lines.push("");
  }
  
  // Краткое содержание (2-4 строки, обрезаем если длиннее)
  if (topic.content) {
    const content = String(topic.content).trim();
    // Берем первые 200 символов или до первого абзаца
    const shortContent = content.split('\n\n')[0].slice(0, 200);
    if (shortContent.length < content.length) {
      lines.push(shortContent + "...");
    } else {
      lines.push(shortContent);
    }
    lines.push("");
  }
  
  // Источник и сайт (кликабельные ссылки)
  if (topic.originalLink) {
    lines.push(`<a href="${escapeHtml(topic.originalLink)}">Источник</a> • <a href="https://novaciv.space">NovaCiv</a>`);
  } else {
    lines.push(`<a href="https://novaciv.space">NovaCiv</a>`);
  }
  
  return lines.join("\n");
}

// Создание текста для текстового поста (полный формат)
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
  
  if (topic.originalLink) {
    lines.push(`Источник: ${topic.originalLink}`);
  }
  lines.push("https://novaciv.space/news");

  return lines.join("\n");
}

// Экранирование HTML
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Создание inline keyboard для поста новости
function buildNewsKeyboard(topic) {
  const buttons = [];
  
  if (topic.originalLink) {
    buttons.push([{ text: "Источник", url: topic.originalLink }]);
  }
  
  buttons.push([{ text: "NovaCiv", url: "https://novaciv.space" }]);
  
  return {
    inline_keyboard: buttons,
  };
}

// Создание inline keyboard для бренд-вставки
function buildBrandKeyboard(lang) {
  return {
    inline_keyboard: [[{ text: lang === "ru" ? "Перейти на сайт" : lang === "de" ? "Zur Website" : "Visit Website", url: "https://novaciv.space" }]],
  };
}

// Тексты для бренд-вставок по языкам
function getBrandCaption(lang) {
  if (lang === "ru") {
    return "Цифровое сообщество без правителей — только граждане.\n\nNovaCiv";
  }
  if (lang === "de") {
    return "Digitale Gemeinschaft ohne Herrscher – nur Bürger.\n\nNovaCiv";
  }
  return "Digital community without rulers — only citizens.\n\nNovaCiv";
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

  const url = `${FIREBASE_DB_URL}/forum/topics/${safeKey(topicId)}.json`;
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

// Запись heartbeat метрик в Firebase
async function writeHealthMetrics(metrics) {
  if (!FIREBASE_DB_URL) return;
  try {
    const url = `${FIREBASE_DB_URL}/health/news/newsCronLastRun.json`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metrics),
    });
    if (!res.ok) {
      log("Failed to write health metrics:", res.status);
    }
  } catch (e) {
    log("Error writing health metrics:", e.message || e);
  }
}

// ---------- HELPERS FOR INVOCATION TYPE DETECTION ----------

// Безопасное чтение заголовков с учетом разных регистров
function getHeader(headers, key) {
  if (!headers || !key) return "";
  const lowerKey = key.toLowerCase();
  // Пробуем разные варианты регистра
  return headers[key] || headers[lowerKey] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || "";
}

// Определение типа вызова и проверка auth
function determineInvocationType(event) {
  const headers = event.headers || {};
  const userAgent = getHeader(headers, "user-agent");
  const eventHeader = getHeader(headers, "x-netlify-event") || getHeader(headers, "x-nf-event");
  const referer = getHeader(headers, "referer") || getHeader(headers, "referrer");
  
  // Проверка scheduled: заголовок x-netlify-event или x-nf-event == "schedule" (case-insensitive)
  // ИЛИ User-Agent == "Netlify-Scheduled-Function"
  const isScheduled = 
    (eventHeader && eventHeader.toLowerCase() === "schedule") ||
    userAgent === "Netlify-Scheduled-Function";
  
  if (isScheduled) {
    return {
      type: "scheduled",
      skipAuth: true,
    };
  }
  
  // Проверка Netlify Run Now: не scheduled + флаг включен + признаки Netlify вызова
  const allowRunNowBypass = process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS && 
    process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS.toLowerCase() === "true";
  
  if (allowRunNowBypass) {
    // Проверяем признаки Netlify Run Now:
    // - referer содержит app.netlify.com или app.netlify.app
    // - ИЛИ присутствует x-nf-request-id
    // - ИЛИ присутствует x-nf-site-id
    // - ИЛИ присутствует x-nf-deploy-id
    // - ИЛИ user-agent содержит "Netlify"
    const xNfRequestId = getHeader(headers, "x-nf-request-id");
    const xNfSiteId = getHeader(headers, "x-nf-site-id");
    const xNfDeployId = getHeader(headers, "x-nf-deploy-id");
    
    const looksLikeNetlifyRunNow = 
      (referer && (referer.toLowerCase().includes("app.netlify.com") || referer.toLowerCase().includes("app.netlify.app"))) ||
      xNfRequestId ||
      xNfSiteId ||
      xNfDeployId ||
      (userAgent && userAgent.toLowerCase().includes("netlify"));
    
    if (looksLikeNetlifyRunNow) {
      return {
        type: "netlify_run_now",
        skipAuth: true,
      };
    }
  }
  
  // Иначе - обычный HTTP вызов
  // DEBUG-логирование только когда type = "http" и ALLOW_NETLIFY_RUN_NOW_BYPASS = "true"
  if (allowRunNowBypass) {
    const xNfRequestId = getHeader(headers, "x-nf-request-id");
    const xNfSiteId = getHeader(headers, "x-nf-site-id");
    const xNfDeployId = getHeader(headers, "x-nf-deploy-id");
    
    log("[debug] allowBypass=true http invocation headers keys:", Object.keys(headers));
    log("[debug] ua=", userAgent);
    log("[debug] x-nf-request-id=", xNfRequestId);
    log("[debug] x-nf-site-id=", xNfSiteId);
    log("[debug] x-nf-deploy-id=", xNfDeployId);
    log("[debug] referer=", referer);
    log("[debug] x-netlify-event=", eventHeader);
  }
  
  return {
    type: "http",
    skipAuth: false,
  };
}

exports.handler = async (event) => {
  const startTime = Date.now();
  const runId = `news-cron-${startTime}`;

  try {
    // Определяем тип вызова
    const invocation = determineInvocationType(event);
    
    // Получаем query параметры (нужны для всех типов вызовов)
    const qs = event.queryStringParameters || {};
    
    if (invocation.type === "scheduled") {
      log("invocation type: scheduled");
      log("auth skipped");
    } else if (invocation.type === "netlify_run_now") {
      log("invocation type: netlify_run_now");
      log("auth skipped (ALLOW_NETLIFY_RUN_NOW_BYPASS=true)");
    } else {
      log("invocation type: http");
      // Проверка токена только для HTTP/manual вызовов
      if (NEWS_CRON_SECRET) {
        if (!qs.token || qs.token !== NEWS_CRON_SECRET) {
          log("auth gate blocked (no token or token mismatch)");
          return {
            statusCode: 403,
            body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" }),
          };
        }
      }
      log("auth gate passed");
    }

    const limitParam = qs.limit;

    const limit = limitParam
      ? Math.max(1, parseInt(limitParam, 10) || 1)
      : 10;

    const topics = await fetchNewsTopics();

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

    // Бренд-вставка каждые 3 поста (максимум 1 за запуск)
    const BRAND_INSERT_INTERVAL = 3;
    const BRAND_IMAGE_URL = "https://novaciv.space/og-image.png";

    let postCount = 0;
    let brandInsertSent = false; // Флаг для максимум 1 вставки за запуск

    for (const topic of freshTopics) {
      postCount++;
      
      // Определяем, нужно ли отправлять бренд-вставку перед этим постом
      // После каждых 3 постов, но максимум 1 раз за запуск
      const shouldSendBrandInsert = !brandInsertSent && postCount > 1 && (postCount - 1) % BRAND_INSERT_INTERVAL === 0;
      
      if (shouldSendBrandInsert) {
        brandInsertSent = true; // Помечаем, что вставка уже отправлена
        // Отправляем бренд-вставку во все каналы
        const brandTasks = [];
        
        if (TELEGRAM_NEWS_CHAT_ID_RU) {
          brandTasks.push(
            sendPhotoToTelegram(
              TELEGRAM_NEWS_CHAT_ID_RU,
              BRAND_IMAGE_URL,
              getBrandCaption("ru"),
              buildBrandKeyboard("ru")
            ).catch((err) => {
              log("Brand insert error (RU):", err.message);
            })
          );
        }
        
        if (TELEGRAM_NEWS_CHAT_ID_EN) {
          brandTasks.push(
            sendPhotoToTelegram(
              TELEGRAM_NEWS_CHAT_ID_EN,
              BRAND_IMAGE_URL,
              getBrandCaption("en"),
              buildBrandKeyboard("en")
            ).catch((err) => {
              log("Brand insert error (EN):", err.message);
            })
          );
        }
        
        if (TELEGRAM_NEWS_CHAT_ID_DE) {
          brandTasks.push(
            sendPhotoToTelegram(
              TELEGRAM_NEWS_CHAT_ID_DE,
              BRAND_IMAGE_URL,
              getBrandCaption("de"),
              buildBrandKeyboard("de")
            ).catch((err) => {
              log("Brand insert error (DE):", err.message);
            })
          );
        }
        
        await Promise.all(brandTasks);
        // Небольшая задержка между бренд-вставкой и новостью
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Отправляем новость
      const caption = buildPostCaption(topic);
      const text = buildPostText(topic);
      const keyboard = buildNewsKeyboard(topic);
      const imageUrl = topic.imageUrl || "";

      const tasks = [];

      if (TELEGRAM_NEWS_CHAT_ID_RU) {
        tasks.push(
          sendPhotoToTelegram(TELEGRAM_NEWS_CHAT_ID_RU, imageUrl, caption, keyboard).then((res) => {
            if (res && res.ok) perLanguage.ru.sent += 1;
            else if (res && !res.skipped) perLanguage.ru.errors.push(res);
          }),
        );
      }

      if (TELEGRAM_NEWS_CHAT_ID_EN) {
        tasks.push(
          sendPhotoToTelegram(TELEGRAM_NEWS_CHAT_ID_EN, imageUrl, caption, keyboard).then((res) => {
            if (res && res.ok) perLanguage.en.sent += 1;
            else if (res && !res.skipped) perLanguage.en.errors.push(res);
          }),
        );
      }

      if (TELEGRAM_NEWS_CHAT_ID_DE) {
        tasks.push(
          sendPhotoToTelegram(TELEGRAM_NEWS_CHAT_ID_DE, imageUrl, caption, keyboard).then((res) => {
            if (res && res.ok) perLanguage.de.sent += 1;
            else if (res && !res.skipped) perLanguage.de.errors.push(res);
          }),
        );
      }

      await Promise.all(tasks);
      await markTopicAsPosted(topic.id);
    }

    const totalSent =
      perLanguage.ru.sent + perLanguage.en.sent + perLanguage.de.sent;

    // Heartbeat метрика
    await writeHealthMetrics({
      ts: startTime,
      runId,
      fetchedTopics: topics.length,
      processed: freshTopics.length,
      totalSent,
      perLanguage,
    });

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
    
    // Heartbeat метрика при ошибке
    await writeHealthMetrics({
      ts: startTime,
      runId,
      fetchedTopics: 0,
      processed: 0,
      totalSent: 0,
      perLanguage: { ru: { sent: 0 }, en: { sent: 0 }, de: { sent: 0 } },
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
