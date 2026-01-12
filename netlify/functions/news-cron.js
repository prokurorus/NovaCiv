// netlify/functions/news-cron.js
// Крон-функция: берёт новые темы из раздела `news` форума NovaCiv
// и один раз рассылает каждую тему во все три Telegram-канала (RU / EN / DE).
// Повторные вызовы функции безопасны: темы, помеченные как отправленные,
// повторно не отправляются.

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Операторский пульт
const { writeHeartbeat, writeEvent } = require("../lib/opsPulse");
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
    disable_web_page_preview: false, // Включаем preview для новостей
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

// Парсинг аналитического текста на секции
function parseAnalyticText(content) {
  if (!content) return { summary: "", whyImportant: "", perspective: "", question: "" };
  
  const text = String(content).trim();
  
  // Пытаемся найти секции по ключевым словам
  const whyMatch = text.match(/(?:Why it matters|Почему важно|Warum es wichtig ist)[:.\s]+(.*?)(?:\n\n|$)/i);
  const perspectiveMatch = text.match(/(?:NovaCiv perspective|Взгляд NovaCiv|NovaCiv-Perspektive)[:.\s]+(.*?)(?:\n\n|$)/i);
  const questionMatch = text.match(/(?:Question|Вопрос|Frage)[:.\s]+(.*?)(?:\n\n|$)/i);
  
  // Summary - всё до "Why it matters" или первые 2-3 предложения
  let summary = text;
  if (whyMatch) {
    summary = text.substring(0, whyMatch.index).trim();
  } else if (perspectiveMatch) {
    summary = text.substring(0, perspectiveMatch.index).trim();
  }
  
  // Если summary слишком длинный, берём первые 2-3 предложения
  const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length > 3) {
    summary = sentences.slice(0, 3).join(". ") + ".";
  }
  
  return {
    summary: summary.slice(0, 360).trim(),
    whyImportant: whyMatch ? whyMatch[1].trim().slice(0, 200) : "",
    perspective: perspectiveMatch ? perspectiveMatch[1].trim().slice(0, 200) : "",
    question: questionMatch ? questionMatch[1].trim().slice(0, 150) : "",
  };
}

// Извлечение домена из URL
function extractDomain(url) {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}

// Форматирование даты
function formatDate(pubDate, lang) {
  if (!pubDate) return "";
  try {
    const date = new Date(pubDate);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffHours < 1) {
      return lang === "ru" ? "только что" : lang === "de" ? "gerade eben" : "just now";
    } else if (diffHours < 24) {
      return lang === "ru" ? `${diffHours} ч назад` : lang === "de" ? `vor ${diffHours} Std` : `${diffHours}h ago`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return lang === "ru" ? `${diffDays} дн назад` : lang === "de" ? `vor ${diffDays} Tagen` : `${diffDays}d ago`;
    }
  } catch (e) {
    return "";
  }
}

// Создание красивого HTML сообщения для новости
function buildNewsMessage(topic) {
  const lines = [];
  const MAX_LENGTH = 3500;
  
  // Заголовок
  lines.push(`<b>🌐 NovaCiv — Movement news</b>`);
  lines.push(`<b>${escapeHtml(topic.title || "(no title)")}</b>`);
  lines.push("");
  
  // Источник и дата
  const domain = topic.originalLink ? extractDomain(topic.originalLink) : "";
  const dateStr = formatDate(topic.pubDate, topic.lang);
  if (domain || dateStr) {
    const sourceLine = [domain, dateStr].filter(Boolean).join(" • ");
    lines.push(`<i>${escapeHtml(sourceLine)}</i>`);
    lines.push("");
  }
  
  // Парсим аналитический текст
  const parsed = parseAnalyticText(topic.content);
  
  // Смысл (summary) - 1-2 короткие строки
  if (parsed.summary) {
    lines.push(escapeHtml(parsed.summary));
    lines.push("");
  }
  
  // Почему важно
  if (parsed.whyImportant) {
    const whyLabel = topic.lang === "ru" ? "Почему важно:" : topic.lang === "de" ? "Warum wichtig:" : "Why it matters:";
    lines.push(`<b>${whyLabel}</b> ${escapeHtml(parsed.whyImportant)}`);
    lines.push("");
  }
  
  // Взгляд NovaCiv
  if (parsed.perspective) {
    const perspectiveLabel = topic.lang === "ru" ? "Взгляд NovaCiv:" : topic.lang === "de" ? "NovaCiv-Perspektive:" : "NovaCiv perspective:";
    lines.push(`<b>${perspectiveLabel}</b> ${escapeHtml(parsed.perspective)}`);
    lines.push("");
  }
  
  // Вопрос
  if (parsed.question) {
    const questionLabel = topic.lang === "ru" ? "Вопрос:" : topic.lang === "de" ? "Frage:" : "Question:";
    lines.push(`<b>${questionLabel}</b> ${escapeHtml(parsed.question)}`);
    lines.push("");
  }
  
  // Ссылки
  if (topic.originalLink) {
    lines.push(`<a href="${escapeHtml(topic.originalLink)}">Источник</a>`);
  }
  lines.push(`https://novaciv.space/news`);
  
  let message = lines.join("\n");
  
  // Контроль длины: обрезаем по приоритету
  if (message.length > MAX_LENGTH) {
    // Удаляем "Почему важно"
    if (parsed.whyImportant) {
      const whyLabel = topic.lang === "ru" ? "Почему важно:" : topic.lang === "de" ? "Warum wichtig:" : "Why it matters:";
      message = message.replace(new RegExp(`<b>${whyLabel}</b>.*?\n\n`, "s"), "");
    }
    
    if (message.length > MAX_LENGTH && parsed.perspective) {
      // Удаляем "Взгляд NovaCiv"
      const perspectiveLabel = topic.lang === "ru" ? "Взгляд NovaCiv:" : topic.lang === "de" ? "NovaCiv-Perspektive:" : "NovaCiv perspective:";
      message = message.replace(new RegExp(`<b>${perspectiveLabel}</b>.*?\n\n`, "s"), "");
    }
    
    if (message.length > MAX_LENGTH && parsed.summary) {
      // Обрезаем summary
      const summaryIndex = message.indexOf(parsed.summary);
      if (summaryIndex !== -1) {
        const beforeSummary = message.substring(0, summaryIndex);
        const afterSummary = message.substring(summaryIndex + parsed.summary.length);
        const maxSummaryLength = MAX_LENGTH - beforeSummary.length - afterSummary.length - 50;
        const truncatedSummary = parsed.summary.slice(0, Math.max(100, maxSummaryLength)) + "...";
        message = beforeSummary + truncatedSummary + afterSummary;
      }
    }
    
    // Финальная обрезка
    if (message.length > MAX_LENGTH) {
      message = message.slice(0, MAX_LENGTH - 3) + "...";
    }
  }
  
  return message;
}

// Создание caption для фото поста (краткий формат) - DEPRECATED, используем buildNewsMessage
function buildPostCaption(topic) {
  return buildNewsMessage(topic);
}

// Создание текста для текстового поста (полный формат) - DEPRECATED, используем buildNewsMessage
function buildPostText(topic) {
  return buildNewsMessage(topic);
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

  // Парсим URL для безопасного логирования
  let dbUrlHost = "";
  let topicsPath = "forum/topics";
  let queryParams = { orderBy: '"section"', equalTo: '"news"' };
  let requestUrlSafe = "";

  try {
    const dbUrlObj = new URL(FIREBASE_DB_URL);
    dbUrlHost = dbUrlObj.host;
    
    // Строим безопасный URL для логирования
    const queryString = new URLSearchParams({
      orderBy: '"section"',
      equalTo: '"news"',
    }).toString();
    requestUrlSafe = `${FIREBASE_DB_URL}/forum/topics.json?${queryString}`;
    
    // Убираем возможные секреты из URL (если есть auth параметры)
    requestUrlSafe = requestUrlSafe.replace(/[?&]auth=[^&]*/gi, "&auth=***");
  } catch (e) {
    log("Error parsing FIREBASE_DB_URL:", e.message);
    dbUrlHost = "unknown";
    requestUrlSafe = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;
  }

  // Логирование перед запросом
  log("[firebase-request] dbUrlHost:", dbUrlHost);
  log("[firebase-request] topicsPath:", topicsPath);
  log("[firebase-request] queryParams:", queryParams);
  log("[firebase-request] requestUrlSafe:", requestUrlSafe);

  const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;

  try {
    const resp = await fetch(url);
    
    if (!resp.ok) {
      // Детальное логирование для 400 ошибок
      const errorText = await resp.text();
      let errorData = errorText;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        // Если не JSON, оставляем как текст
      }
      
      log("[firebase-error] status:", resp.status);
      log("[firebase-error] data:", errorData);
      log("[firebase-error] requestUrlSafe:", requestUrlSafe);
      
      // Проверяем, является ли это ошибкой отсутствия индекса
      const errorStr = typeof errorData === "string" ? errorData : JSON.stringify(errorData);
      const isIndexError = resp.status === 400 && 
        (errorStr.includes("Index not defined") || 
         errorStr.includes("index") && errorStr.toLowerCase().includes("not found"));
      
      if (isIndexError) {
        // ВРЕМЕННЫЙ Fallback: запрос без индекса, фильтрация в JS
        // TODO: Применить индекс в Firebase Rules (см. docs/firebase.rules.patch.json)
        // После применения индекса этот fallback не должен срабатывать
        log("[news-cron] WARNING: firebase missing index on section; using full-scan fallback");
        
        const fallbackUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
        const fallbackResp = await fetch(fallbackUrl);
        
        if (!fallbackResp.ok) {
          throw new Error(
            `Firebase topics fetch failed (fallback): ${fallbackResp.status} ${fallbackResp.statusText}`,
          );
        }
        
        const fallbackData = await fallbackResp.json();
        if (!fallbackData || typeof fallbackData !== "object") {
          return [];
        }
        
        // Фильтруем в JS по section === "news"
        const allItems = Object.entries(fallbackData).map(([id, value]) => ({
          id,
          ...(value || {}),
        }));
        
        const filteredItems = allItems.filter((item) => item.section === "news");
        
        return filteredItems;
      }
      
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
  } catch (err) {
    // Если это не ошибка ответа (уже залогирована выше), логируем общую ошибку
    if (!err.message || !err.message.includes("Firebase topics fetch failed")) {
      log("[firebase-error] fetch exception:", err.message);
      log("[firebase-error] requestUrlSafe:", requestUrlSafe);
    }
    throw err;
  }
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
  const component = "news-cron";

  // Записываем начало выполнения
  await writeHeartbeat(component, {
    lastRunAt: startTime,
  });

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
      .slice(0, 1); // Ограничение: максимум 1 новость за запуск

    if (!freshTopics.length) {
      // Heartbeat: успешное выполнение без новых тем
      await writeHeartbeat(component, {
        lastRunAt: startTime,
        lastOkAt: Date.now(),
        metrics: {
          fetchedTopicsCount: topics.length,
          sentToTelegramCount: 0,
        },
      });
      await writeEvent(component, "info", "No new topics to post", {
        fetchedTopics: topics.length,
      });
      
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
      
      // Отправляем новость (новый красивый формат)
      const message = buildNewsMessage(topic);
      const keyboard = buildNewsKeyboard(topic);
      const imageUrl = topic.imageUrl || "";

      const tasks = [];

      // Отправляем как текстовое сообщение (HTML формат, с preview)
      if (TELEGRAM_NEWS_CHAT_ID_RU && topic.lang === "ru") {
        tasks.push(
          sendTextToTelegram(TELEGRAM_NEWS_CHAT_ID_RU, message, keyboard).then((res) => {
            if (res && res.ok) perLanguage.ru.sent += 1;
            else if (res && !res.skipped) perLanguage.ru.errors.push(res);
          }),
        );
      }

      if (TELEGRAM_NEWS_CHAT_ID_EN && topic.lang === "en") {
        tasks.push(
          sendTextToTelegram(TELEGRAM_NEWS_CHAT_ID_EN, message, keyboard).then((res) => {
            if (res && res.ok) perLanguage.en.sent += 1;
            else if (res && !res.skipped) perLanguage.en.errors.push(res);
          }),
        );
      }

      if (TELEGRAM_NEWS_CHAT_ID_DE && topic.lang === "de") {
        tasks.push(
          sendTextToTelegram(TELEGRAM_NEWS_CHAT_ID_DE, message, keyboard).then((res) => {
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

    // Heartbeat метрика (старая, для совместимости)
    await writeHealthMetrics({
      ts: startTime,
      runId,
      fetchedTopics: topics.length,
      processed: freshTopics.length,
      totalSent,
      perLanguage,
    });

    // Heartbeat: успешное выполнение
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastOkAt: Date.now(),
      metrics: {
        fetchedTopicsCount: topics.length,
        sentToTelegramCount: totalSent,
      },
    });
    await writeEvent(component, "info", `Sent ${totalSent} messages to Telegram`, {
      fetchedTopics: topics.length,
      processed: freshTopics.length,
      totalSent,
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
    
    // Heartbeat метрика при ошибке (старая, для совместимости)
    await writeHealthMetrics({
      ts: startTime,
      runId,
      fetchedTopics: 0,
      processed: 0,
      totalSent: 0,
      perLanguage: { ru: { sent: 0 }, en: { sent: 0 }, de: { sent: 0 } },
    });
    
    // Heartbeat: ошибка
    const errorMsg = String(err && err.message ? err.message : err);
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastErrorAt: Date.now(),
      lastErrorMsg: errorMsg,
    });
    await writeEvent(component, "error", "Error in news-cron", {
      error: errorMsg,
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
