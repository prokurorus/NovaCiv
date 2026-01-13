var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// netlify/lib/opsPulse.js
var require_opsPulse = __commonJS({
  "netlify/lib/opsPulse.js"(exports2, module2) {
    var FIREBASE_DB_URL2 = process.env.FIREBASE_DB_URL;
    var MAX_EVENTS = 20;
    function sanitizeString(str) {
      if (!str) return str;
      return String(str).replace(/sk-[a-zA-Z0-9]+/g, "sk-***").replace(/ghp_[a-zA-Z0-9]+/g, "ghp_***").replace(/AIza[^"'\s]+/g, "AIza***").replace(/-----BEGIN[^-]+-----END[^-]+-----/gs, "***PRIVATE_KEY***").replace(/["']([^"']*token[^"']*)["']/gi, '"***TOKEN***"');
    }
    async function writeHeartbeat2(component, status) {
      if (!FIREBASE_DB_URL2) return;
      try {
        let safeErrorMsg = status.lastErrorMsg || null;
        if (safeErrorMsg) {
          safeErrorMsg = sanitizeString(safeErrorMsg).slice(0, 500);
        }
        const heartbeatData = {
          lastRunAt: status.lastRunAt,
          lastOkAt: status.lastOkAt || null,
          lastErrorAt: status.lastErrorAt || null,
          lastErrorMsg: safeErrorMsg,
          updatedAt: Date.now(),
          ...status.metrics || {}
        };
        const url = `${FIREBASE_DB_URL2}/ops/heartbeat/${component}.json`;
        await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(heartbeatData)
        });
      } catch (error) {
        console.error(`[ops-pulse] Failed to write heartbeat for ${component}:`, error.message);
      }
    }
    async function writeEvent2(component, level, message, meta = {}) {
      if (!FIREBASE_DB_URL2) return;
      try {
        const safeMeta = {};
        for (const [key, value] of Object.entries(meta)) {
          if (typeof value === "string") {
            safeMeta[key] = sanitizeString(value).slice(0, 200);
          } else {
            safeMeta[key] = value;
          }
        }
        const event = {
          ts: Date.now(),
          component,
          level,
          message: String(message).slice(0, 500),
          meta: safeMeta
        };
        const eventsUrl = `${FIREBASE_DB_URL2}/ops/events.json`;
        const eventsResp = await fetch(eventsUrl);
        let events = {};
        if (eventsResp.ok) {
          const data = await eventsResp.json();
          if (data && typeof data === "object") {
            events = data;
          }
        }
        const newEventKey = Date.now().toString();
        events[newEventKey] = event;
        const eventKeys = Object.keys(events).sort((a, b) => parseInt(a) - parseInt(b));
        if (eventKeys.length > MAX_EVENTS) {
          const keysToRemove = eventKeys.slice(0, eventKeys.length - MAX_EVENTS);
          for (const key of keysToRemove) {
            delete events[key];
          }
          console.log(`[ops-pulse] Cleaned ${keysToRemove.length} old events (buffer size: ${MAX_EVENTS})`);
        }
        await fetch(eventsUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(events)
        });
      } catch (error) {
        console.error(`[ops-pulse] Failed to write event:`, error.message);
      }
    }
    async function writeFirebaseError2(component, error, meta = {}) {
      if (!FIREBASE_DB_URL2) return;
      try {
        const errorMeta = {
          op: meta.op || "unknown",
          path: meta.path || "unknown",
          status: meta.status || null,
          firebaseError: meta.firebaseError || null,
          ...meta
        };
        const safeMeta = {};
        for (const [key, value] of Object.entries(errorMeta)) {
          if (typeof value === "string") {
            safeMeta[key] = sanitizeString(value).slice(0, 200);
          } else {
            safeMeta[key] = value;
          }
        }
        const errorMsg = String(error && error.message ? error.message : error).slice(0, 500);
        await writeEvent2(component, "error", `Firebase ${errorMeta.op} error: ${errorMsg}`, safeMeta);
        await writeHeartbeat2(component, {
          lastRunAt: Date.now(),
          lastErrorAt: Date.now(),
          lastErrorMsg: sanitizeString(errorMsg).slice(0, 500)
        });
      } catch (e) {
        console.error(`[ops-pulse] Failed to write Firebase error:`, e.message);
      }
    }
    module2.exports = {
      writeHeartbeat: writeHeartbeat2,
      writeEvent: writeEvent2,
      writeFirebaseError: writeFirebaseError2
    };
  }
});

// netlify/lib/telegramFormat.js
var require_telegramFormat = __commonJS({
  "netlify/lib/telegramFormat.js"(exports2, module2) {
    function escapeHtml(text) {
      if (!text) return "";
      return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function formatDate(pubDate, lang) {
      if (!pubDate) return "";
      try {
        const date = new Date(pubDate);
        const now = /* @__PURE__ */ new Date();
        const diffHours = Math.floor((now - date) / (1e3 * 60 * 60));
        if (diffHours < 1) {
          return lang === "ru" ? "\u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u043E" : lang === "de" ? "gerade eben" : "just now";
        } else if (diffHours < 24) {
          return lang === "ru" ? `${diffHours} \u0447 \u043D\u0430\u0437\u0430\u0434` : lang === "de" ? `vor ${diffHours} Std` : `${diffHours}h ago`;
        } else {
          const diffDays = Math.floor(diffHours / 24);
          return lang === "ru" ? `${diffDays} \u0434\u043D \u043D\u0430\u0437\u0430\u0434` : lang === "de" ? `vor ${diffDays} Tagen` : `${diffDays}d ago`;
        }
      } catch (e) {
        return "";
      }
    }
    function extractDomain2(url) {
      if (!url) return "";
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, "");
      } catch (e) {
        return url;
      }
    }
    function enforceMaxLen(text, maxLen) {
      if (text.length <= maxLen) return text;
      const whyMatch = text.match(/(<b>Почему важно:<\/b>|<b>Warum wichtig:<\/b>|<b>Why it matters:<\/b>)\s*(.*?)(?=\n\n|$)/is);
      const viewMatch = text.match(/(<b>Взгляд NovaCiv:<\/b>|<b>NovaCiv-Perspektive:<\/b>|<b>NovaCiv perspective:<\/b>)\s*(.*?)(?=\n\n|$)/is);
      const questionMatch = text.match(/(<b>Вопрос:<\/b>|<b>Frage:<\/b>|<b>Question:<\/b>)\s*(.*?)(?=\n\n|$)/is);
      let result = text;
      if (whyMatch && result.length > maxLen) {
        result = result.replace(whyMatch[0], "").replace(/\n\n\n+/g, "\n\n");
      }
      if (viewMatch && result.length > maxLen) {
        result = result.replace(viewMatch[0], "").replace(/\n\n\n+/g, "\n\n");
      }
      if (result.length > maxLen) {
        const senseIndex = result.indexOf("\n\n");
        if (senseIndex !== -1) {
          const beforeSense = result.substring(0, senseIndex);
          const afterSense = result.substring(senseIndex);
          const maxSenseLen = maxLen - beforeSense.length - afterSense.length - 50;
          if (maxSenseLen > 100) {
            const senseText = result.substring(senseIndex + 2, senseIndex + 2 + maxSenseLen);
            result = beforeSense + "\n\n" + senseText + "..." + afterSense;
          }
        }
      }
      if (result.length > maxLen) {
        result = result.slice(0, maxLen - 3) + "...";
      }
      return result;
    }
    function formatNewsMessage2({ title, url, sourceName, date, sense, why, view, question, lang }) {
      const lines = [];
      lines.push(`<b>\u{1F310} NovaCiv \u2014 Movement news</b>`);
      lines.push(`<b>${escapeHtml(title || "(no title)")}</b>`);
      lines.push("");
      const domain = sourceName || (url ? extractDomain2(url) : "");
      const dateStr = formatDate(date, lang);
      if (domain || dateStr) {
        const sourceLine = [domain, dateStr].filter(Boolean).join(" \u2022 ");
        lines.push(`<i>${escapeHtml(sourceLine)}</i>`);
        lines.push("");
      }
      if (sense) {
        lines.push(escapeHtml(sense));
        lines.push("");
      }
      if (why) {
        const whyLabel = lang === "ru" ? "\u041F\u043E\u0447\u0435\u043C\u0443 \u0432\u0430\u0436\u043D\u043E:" : lang === "de" ? "Warum wichtig:" : "Why it matters:";
        lines.push(`<b>${whyLabel}</b> ${escapeHtml(why)}`);
        lines.push("");
      }
      if (view) {
        const viewLabel = lang === "ru" ? "\u0412\u0437\u0433\u043B\u044F\u0434 NovaCiv:" : lang === "de" ? "NovaCiv-Perspektive:" : "NovaCiv perspective:";
        lines.push(`<b>${viewLabel}</b> ${escapeHtml(view)}`);
        lines.push("");
      }
      if (question) {
        const questionLabel = lang === "ru" ? "\u0412\u043E\u043F\u0440\u043E\u0441:" : lang === "de" ? "Frage:" : "Question:";
        lines.push(`<b>${questionLabel}</b> ${escapeHtml(question)}`);
        lines.push("");
      }
      if (url) {
        lines.push(`<a href="${escapeHtml(url)}">\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A</a>`);
      }
      lines.push(`https://novaciv.space/news`);
      let message = lines.join("\n");
      message = enforceMaxLen(message, 3500);
      return message;
    }
    function formatDomovoyMessage({ headline, quote, reflection, question, lang }) {
      const lines = [];
      lines.push(`<b>\u{1F916} NovaCiv \u2014 \u0414\u043E\u043C\u043E\u0432\u043E\u0439</b>`);
      lines.push(`<b>${escapeHtml(headline || "NovaCiv")}</b>`);
      lines.push("");
      if (quote) {
        lines.push(escapeHtml(quote));
        lines.push("");
      }
      if (reflection) {
        lines.push(escapeHtml(reflection));
        lines.push("");
      }
      if (question) {
        const questionLabel = lang === "ru" ? "\u0412\u043E\u043F\u0440\u043E\u0441:" : lang === "de" ? "Frage:" : "Question:";
        lines.push(`<b>${questionLabel}</b> ${escapeHtml(question)}`);
        lines.push("");
      }
      lines.push(`https://novaciv.space`);
      let message = lines.join("\n");
      if (message.length > 1200) {
        const headerLength = lines[0].length + lines[1].length + lines[2].length + (lines[lines.length - 1]?.length || 0) + 20;
        const maxReflectionLength = 1200 - headerLength - (quote ? quote.length + 20 : 0) - (question ? question.length + 30 : 0);
        if (reflection && reflection.length > maxReflectionLength) {
          const truncatedReflection = reflection.slice(0, Math.max(100, maxReflectionLength - 3)) + "...";
          message = lines[0] + "\n" + lines[1] + "\n\n" + (quote ? escapeHtml(quote) + "\n\n" : "") + escapeHtml(truncatedReflection) + "\n\n" + (question ? lines[lines.length - 3] + "\n" : "") + lines[lines.length - 1];
        } else {
          message = message.slice(0, 1200 - 3) + "...";
        }
      }
      return message;
    }
    module2.exports = {
      formatNewsMessage: formatNewsMessage2,
      formatDomovoyMessage,
      enforceMaxLen,
      escapeHtml
    };
  }
});

// netlify/functions/news-cron.js
var FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
var NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;
var OPS_CRON_SECRET = process.env.OPS_CRON_SECRET;
var TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
var { writeHeartbeat, writeEvent, writeFirebaseError } = require_opsPulse();
var { formatNewsMessage } = require_telegramFormat();
var OPENAI_API_KEY = process.env.OPENAI_API_KEY;
var OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
var TELEGRAM_NEWS_CHAT_ID_EN = process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
var TELEGRAM_NEWS_CHAT_ID_RU = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
var TELEGRAM_NEWS_CHAT_ID_DE = process.env.TELEGRAM_NEWS_CHAT_ID_DE;
function log(...args) {
  console.log("[news-cron]", ...args);
}
function safeKey(value) {
  if (!value) return "unknown";
  return String(value).trim().toLowerCase().replace(/[.#$[\]/]/g, "_").replace(/\s+/g, "_").slice(0, 120);
}
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
    disable_web_page_preview: false
    // Включаем preview для новостей
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!data.ok) {
    log("Telegram error:", data);
  }
  return data;
}
async function sendPhotoToTelegram(chatId, photoUrl, caption, replyMarkup) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  if (!chatId) {
    return { ok: false, skipped: true, reason: "chatId not configured" };
  }
  if (!photoUrl) {
    return sendTextToTelegram(chatId, caption, replyMarkup);
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const body = {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "HTML"
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
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
function parseAnalyticData(topic) {
  if (topic.sense && topic.why && topic.view && topic.question) {
    return {
      sense: topic.sense,
      why: topic.why,
      view: topic.view,
      question: topic.question
    };
  }
  const content = topic.content || "";
  if (!content) return { sense: "", why: "", view: "", question: "" };
  const text = String(content).trim();
  const whyMatch = text.match(/(?:Why it matters|Почему важно|Warum es wichtig ist)[:.\s]+(.*?)(?:\n\n|$)/i);
  const perspectiveMatch = text.match(/(?:NovaCiv perspective|Взгляд NovaCiv|NovaCiv-Perspektive)[:.\s]+(.*?)(?:\n\n|$)/i);
  const questionMatch = text.match(/(?:Question|Вопрос|Frage)[:.\s]+(.*?)(?:\n\n|$)/i);
  let sense = text;
  if (whyMatch) {
    sense = text.substring(0, whyMatch.index).trim();
  } else if (perspectiveMatch) {
    sense = text.substring(0, perspectiveMatch.index).trim();
  }
  const sentences = sense.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  if (sentences.length > 3) {
    sense = sentences.slice(0, 3).join(". ") + ".";
  }
  return {
    sense: sense.slice(0, 360).trim(),
    why: whyMatch ? whyMatch[1].trim().slice(0, 180) : "",
    view: perspectiveMatch ? perspectiveMatch[1].trim().slice(0, 220) : "",
    question: questionMatch ? questionMatch[1].trim().slice(0, 160) : ""
  };
}
function extractDomain(url) {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}
function buildNewsMessage(topic) {
  const parsed = parseAnalyticData(topic);
  const sourceName = topic.originalLink ? extractDomain(topic.originalLink) : "";
  return formatNewsMessage({
    title: topic.title,
    url: topic.originalLink,
    sourceName,
    date: topic.pubDate,
    sense: parsed.sense,
    why: parsed.why,
    view: parsed.view,
    question: parsed.question,
    lang: topic.lang || "ru"
  });
}
function buildNewsKeyboard(topic) {
  const buttons = [];
  if (topic.originalLink) {
    buttons.push([{ text: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", url: topic.originalLink }]);
  }
  buttons.push([{ text: "NovaCiv", url: "https://novaciv.space" }]);
  return {
    inline_keyboard: buttons
  };
}
async function fetchNewsTopics() {
  if (!FIREBASE_DB_URL) {
    const error = new Error("FIREBASE_DB_URL is not configured");
    await writeFirebaseError("news-cron", error, {
      path: "forum/topics",
      op: "read"
    });
    throw error;
  }
  let dbUrlHost = "";
  let topicsPath = "forum/topics";
  let queryParams = { orderBy: '"section"', equalTo: '"news"' };
  let requestUrlSafe = "";
  try {
    const dbUrlObj = new URL(FIREBASE_DB_URL);
    dbUrlHost = dbUrlObj.host;
    const queryString = new URLSearchParams({
      orderBy: '"section"',
      equalTo: '"news"'
    }).toString();
    requestUrlSafe = `${FIREBASE_DB_URL}/forum/topics.json?${queryString}`;
    requestUrlSafe = requestUrlSafe.replace(/[?&]auth=[^&]*/gi, "&auth=***");
  } catch (e) {
    log("Error parsing FIREBASE_DB_URL:", e.message);
    dbUrlHost = "unknown";
    requestUrlSafe = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;
  }
  log("[firebase-request] dbUrlHost:", dbUrlHost);
  log("[firebase-request] topicsPath:", topicsPath);
  log("[firebase-request] queryParams:", queryParams);
  log("[firebase-request] requestUrlSafe:", requestUrlSafe);
  const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const errorText = await resp.text();
      let errorData = errorText;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
      }
      log("[firebase-error] status:", resp.status);
      log("[firebase-error] data:", errorData);
      log("[firebase-error] requestUrlSafe:", requestUrlSafe);
      const errorStr = typeof errorData === "string" ? errorData : JSON.stringify(errorData);
      const isIndexError = resp.status === 400 && (errorStr.includes("Index not defined") || errorStr.includes("index") && errorStr.toLowerCase().includes("not found"));
      if (isIndexError) {
        log("[news-cron] WARNING: firebase missing index on section; using full-scan fallback");
        await writeEvent("news-cron", "warn", "Firebase index missing for /forum/topics.section \u2014 using fallback", {
          path: "forum/topics",
          op: "query",
          status: 400,
          firebaseError: "Index not defined"
        });
        const fallbackUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
        const fallbackResp = await fetch(fallbackUrl);
        if (!fallbackResp.ok) {
          const errorText2 = await fallbackResp.text().catch(() => "");
          await writeFirebaseError("news-cron", new Error(`Fallback fetch failed: ${fallbackResp.status}`), {
            path: "forum/topics",
            op: "read",
            status: fallbackResp.status,
            firebaseError: errorText2.slice(0, 200)
          });
          throw new Error(
            `Firebase topics fetch failed (fallback): ${fallbackResp.status} ${fallbackResp.statusText}`
          );
        }
        const fallbackData = await fallbackResp.json();
        if (!fallbackData || typeof fallbackData !== "object") {
          return [];
        }
        const allItems = Object.entries(fallbackData).map(([id, value]) => ({
          id,
          ...value || {}
        }));
        const HARD_LIMIT = 5e3;
        if (allItems.length > HARD_LIMIT) {
          log(`[news-cron] WARNING: Full-scan returned ${allItems.length} items, limiting to ${HARD_LIMIT}`);
          await writeEvent("news-cron", "warn", `Full-scan exceeded hard limit: ${allItems.length} > ${HARD_LIMIT}`, {
            path: "forum/topics",
            op: "query",
            returnedCount: allItems.length,
            hardLimit: HARD_LIMIT
          });
        }
        const filteredItems = allItems.slice(0, HARD_LIMIT).filter((item) => item.section === "news");
        return filteredItems;
      }
      throw new Error(
        `Firebase topics fetch failed: ${resp.status} ${resp.statusText}`
      );
    }
    const data = await resp.json();
    if (!data || typeof data !== "object") {
      return [];
    }
    const items = Object.entries(data).map(([id, value]) => ({
      id,
      ...value || {}
    }));
    return items;
  } catch (err) {
    if (!err.message || !err.message.includes("Firebase topics fetch failed")) {
      log("[firebase-error] fetch exception:", err.message);
      log("[firebase-error] requestUrlSafe:", requestUrlSafe);
    }
    throw err;
  }
}
function getHeader(headers, key) {
  if (!headers || !key) return "";
  const lowerKey = key.toLowerCase();
  return headers[key] || headers[lowerKey] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || "";
}
function determineInvocationType(event) {
  const headers = event.headers || {};
  const userAgent = getHeader(headers, "user-agent");
  const eventHeader = getHeader(headers, "x-netlify-event") || getHeader(headers, "x-nf-event");
  const referer = getHeader(headers, "referer") || getHeader(headers, "referrer");
  const isScheduled = eventHeader && eventHeader.toLowerCase() === "schedule" || userAgent === "Netlify-Scheduled-Function";
  if (isScheduled) {
    return {
      type: "scheduled",
      skipAuth: true
    };
  }
  const allowRunNowBypass = process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS && process.env.ALLOW_NETLIFY_RUN_NOW_BYPASS.toLowerCase() === "true";
  if (allowRunNowBypass) {
    const xNfRequestId = getHeader(headers, "x-nf-request-id");
    const xNfSiteId = getHeader(headers, "x-nf-site-id");
    const xNfDeployId = getHeader(headers, "x-nf-deploy-id");
    const looksLikeNetlifyRunNow = referer && (referer.toLowerCase().includes("app.netlify.com") || referer.toLowerCase().includes("app.netlify.app")) || xNfRequestId || xNfSiteId || xNfDeployId || userAgent && userAgent.toLowerCase().includes("netlify");
    if (looksLikeNetlifyRunNow) {
      return {
        type: "netlify_run_now",
        skipAuth: true
      };
    }
  }
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
    skipAuth: false
  };
}
exports.handler = async (event) => {
  const startTime = Date.now();
  const runId = `news-cron-${startTime}`;
  const component = "news-cron";
  const qs = event.queryStringParameters || {};
  const isDebug = qs.debug === "1" || qs.debug === "true";
  await writeHeartbeat(component, {
    lastRunAt: startTime
  });
  try {
    const invocation = determineInvocationType(event);
    if (invocation.type === "scheduled") {
      log("invocation type: scheduled");
      log("auth skipped");
    } else if (invocation.type === "netlify_run_now") {
      log("invocation type: netlify_run_now");
      log("auth skipped (ALLOW_NETLIFY_RUN_NOW_BYPASS=true)");
    } else {
      log("invocation type: http");
      const validToken = NEWS_CRON_SECRET || OPS_CRON_SECRET;
      if (validToken) {
        const providedToken = qs.token;
        if (!providedToken || providedToken !== NEWS_CRON_SECRET && providedToken !== OPS_CRON_SECRET) {
          log("auth gate blocked (no token or token mismatch)");
          return {
            statusCode: 403,
            body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" })
          };
        }
      }
      log("auth gate passed");
    }
    if (!FIREBASE_DB_URL) {
      const errorMsg = "FIREBASE_DB_URL is not set";
      await writeEvent(component, "error", errorMsg);
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: false,
          error: errorMsg
        })
      };
    }
    const limitParam = qs.limit;
    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 1) : 10;
    const now = Date.now();
    const currentHour = new Date(now);
    currentHour.setMinutes(0, 0, 0);
    const hourStart = currentHour.getTime();
    const hourEnd = hourStart + 60 * 60 * 1e3;
    let topics = [];
    if (FIREBASE_DB_URL) {
      try {
        const topicsUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
        const topicsResp = await fetch(topicsUrl);
        if (topicsResp.ok) {
          const topicsData = await topicsResp.json();
          topics = Object.entries(topicsData || {}).map(([id, value]) => ({
            id,
            ...value || {}
          })).filter(
            (t) => t.section === "news" && !t.posted && t.scheduledFor && t.scheduledFor >= hourStart && t.scheduledFor < hourEnd
          );
        }
      } catch (e) {
        log(`[news-cron] Failed to fetch topics:`, e.message);
        topics = await fetchNewsTopics();
        topics = topics.filter((t) => !t.posted);
      }
    } else {
      topics = await fetchNewsTopics();
      topics = topics.filter((t) => !t.posted);
    }
    const CHANNELS = {
      ru: TELEGRAM_NEWS_CHAT_ID_RU,
      en: TELEGRAM_NEWS_CHAT_ID_EN,
      de: TELEGRAM_NEWS_CHAT_ID_DE
    };
    const stateByLang = {};
    for (const lang of ["ru", "en", "de"]) {
      try {
        if (FIREBASE_DB_URL) {
          const stateUrl = `${FIREBASE_DB_URL}/newsMeta/state_${lang}.json`;
          const stateResp = await fetch(stateUrl);
          if (stateResp.ok) {
            stateByLang[lang] = await stateResp.json() || {};
          } else {
            stateByLang[lang] = { lastNewsSource: null, recentTitleKeys: {} };
          }
        }
      } catch (e) {
        log(`Failed to load news state for ${lang}:`, e.message);
        stateByLang[lang] = { lastNewsSource: null, recentTitleKeys: {} };
      }
    }
    const perLanguage = {
      ru: { sent: 0, errors: [] },
      en: { sent: 0, errors: [] },
      de: { sent: 0, errors: [] }
    };
    for (const targetLang of ["ru", "en", "de"]) {
      const chatId = CHANNELS[targetLang];
      if (!chatId) {
        log(`No chat ID for ${targetLang}, skipping`);
        continue;
      }
      let topicToPost = topics.filter(
        (t) => t.section === "news" && t.lang === targetLang && !t.telegramPostedAt && !t.translatedFrom
        // Не переведённые копии
      ).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      if (!topicToPost) {
        log(`[news-cron] No ${targetLang} topic found, trying fallback translation`);
        const fallbackTopic = topics.filter(
          (t) => t.section === "news" && !t.telegramPostedAt && !t.translatedFrom && (t.lang === "en" || t.lang === targetLang)
          // Предпочитаем EN, но можно и свою
        ).sort((a, b) => {
          if (a.lang === "en" && b.lang !== "en") return -1;
          if (b.lang === "en" && a.lang !== "en") return 1;
          return (b.createdAt || 0) - (a.createdAt || 0);
        })[0];
        if (fallbackTopic && fallbackTopic.lang !== targetLang) {
          try {
            const translateField = async (text, targetLang2) => {
              if (!OPENAI_API_KEY || !text) return text;
              let targetDescription;
              if (targetLang2 === "ru") {
                targetDescription = "Russian";
              } else if (targetLang2 === "de") {
                targetDescription = "German";
              } else {
                targetDescription = "the target language";
              }
              const userPrompt = `
Target language: ${targetDescription} (code: ${targetLang2})

Translate the following text from ${fallbackTopic.lang === "ru" ? "Russian" : fallbackTopic.lang === "de" ? "German" : "English"} into the target language.
Preserve meaning and tone.

----
${text}
----
`.trim();
              const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${OPENAI_API_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  model: OPENAI_MODEL,
                  messages: [
                    { role: "system", content: "You are a precise translator. Return only the translation, no explanations." },
                    { role: "user", content: userPrompt }
                  ],
                  max_tokens: 300,
                  temperature: 0.3
                })
              });
              if (!response.ok) {
                const text2 = await response.text();
                throw new Error(`OpenAI translation error: HTTP ${response.status} \u2013 ${text2}`);
              }
              const data = await response.json();
              return data.choices?.[0]?.message?.content?.trim() || text;
            };
            const translated = await translateField(fallbackTopic.sense || "", targetLang);
            const translatedWhy = await translateField(fallbackTopic.why || "", targetLang);
            const translatedView = await translateField(fallbackTopic.view || "", targetLang);
            const translatedQuestion = await translateField(fallbackTopic.question || "", targetLang);
            const translatedTitle = await translateField(fallbackTopic.title || "", targetLang);
            const translatedTopic = {
              ...fallbackTopic,
              id: `${fallbackTopic.id}_translated_${targetLang}_${Date.now()}`,
              lang: targetLang,
              sourceLang: fallbackTopic.lang,
              translatedFrom: true,
              sourceTopicId: fallbackTopic.id,
              title: typeof translatedTitle === "string" ? translatedTitle : fallbackTopic.title,
              sense: typeof translated === "string" ? translated : fallbackTopic.sense,
              why: typeof translatedWhy === "string" ? translatedWhy : fallbackTopic.why,
              view: typeof translatedView === "string" ? translatedView : fallbackTopic.view,
              question: typeof translatedQuestion === "string" ? translatedQuestion : fallbackTopic.question,
              telegramPostedAt: null
              // Не помечаем как posted
            };
            if (FIREBASE_DB_URL) {
              try {
                const saveUrl = `${FIREBASE_DB_URL}/forum/topics.json`;
                const saveResp = await fetch(saveUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(translatedTopic)
                });
                if (saveResp.ok) {
                  const savedData = await saveResp.json();
                  translatedTopic.id = savedData.name || translatedTopic.id;
                  log(`[news-cron] Created translated topic for ${targetLang}`);
                }
              } catch (e) {
                log(`[news-cron] Failed to save translated topic:`, e.message);
              }
            }
            topicToPost = translatedTopic;
            await writeEvent(component, "info", `Fallback translation used for ${targetLang}`, {
              sourceLang: fallbackTopic.lang,
              sourceTopicId: fallbackTopic.id
            });
          } catch (e) {
            log(`[news-cron] Translation failed for ${targetLang}:`, e.message);
            continue;
          }
        } else if (!fallbackTopic) {
          log(`[news-cron] No fallback topic available for ${targetLang}`);
          continue;
        }
      }
      if (!topicToPost) {
        continue;
      }
      const messageText = buildNewsMessage(topicToPost);
      const keyboard = buildNewsKeyboard(topicToPost);
      let telegramResult = null;
      try {
        if (topicToPost.imageUrl || topicToPost.photoUrl) {
          telegramResult = await sendPhotoToTelegram(
            chatId,
            topicToPost.imageUrl || topicToPost.photoUrl,
            messageText,
            keyboard
          );
        } else {
          telegramResult = await sendTextToTelegram(chatId, messageText, keyboard);
        }
        if (telegramResult && telegramResult.ok && telegramResult.result) {
          const messageId = telegramResult.result.message_id;
          const postedAt = Date.now();
          let permalink = null;
          const channelUsername = process.env[`TELEGRAM_NEWS_CHANNEL_USERNAME_${targetLang.toUpperCase()}`];
          if (channelUsername) {
            permalink = `https://t.me/${channelUsername}/${messageId}`;
          }
          const safeTopicId = safeKey(topicToPost.id);
          const updateUrl = `${FIREBASE_DB_URL}/forum/topics/${safeTopicId}.json`;
          const updateData = {
            posted: true,
            postedAt,
            telegram: {
              chatId: String(chatId),
              messageId,
              permalink
            },
            channel: "news"
          };
          if (!topicToPost.channel) {
            updateData.channel = "news";
          }
          try {
            const updateResp = await fetch(updateUrl, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateData)
            });
            if (!updateResp.ok) {
              const errorText = await updateResp.text().catch(() => "");
              log(`Failed to update topic metadata: ${updateResp.status} - ${errorText}`);
              await writeFirebaseError("news-cron", new Error(`Failed to update topic: ${updateResp.status}`), {
                path: `forum/topics/${safeTopicId}`,
                op: "write",
                status: updateResp.status,
                firebaseError: errorText.slice(0, 200)
              });
            } else {
              log(`Updated topic ${topicToPost.id} with Telegram metadata`);
            }
          } catch (updateError) {
            log(`Error updating topic metadata:`, updateError.message);
            await writeFirebaseError("news-cron", updateError, {
              path: `forum/topics/${safeTopicId}`,
              op: "write"
            });
          }
          perLanguage[targetLang].sent = 1;
          await writeEvent(component, "info", `news sent: ${targetLang}`, {
            topicId: topicToPost.id,
            messageId,
            lang: targetLang
          });
        } else {
          log(`Telegram send failed for ${targetLang}:`, telegramResult?.description || "unknown error");
          perLanguage[targetLang].errors.push(telegramResult?.description || "unknown error");
        }
      } catch (sendError) {
        log(`Error sending to Telegram for ${targetLang}:`, sendError.message);
        perLanguage[targetLang].errors.push(sendError.message);
        await writeEvent(component, "error", `Telegram send error: ${targetLang}`, {
          error: sendError.message,
          lang: targetLang
        });
      }
    }
    const totalSent = perLanguage.ru.sent + perLanguage.en.sent + perLanguage.de.sent;
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastOkAt: Date.now(),
      metrics: {
        fetchedTopicsCount: topics.length,
        sentToTelegramCount: totalSent
      }
    });
    await writeEvent(component, "info", `Sent ${totalSent} messages to Telegram`, {
      fetchedTopics: topics.length,
      totalSent,
      perLanguage
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        processed: totalSent,
        totalSent,
        perLanguage
      })
    };
  } catch (err) {
    console.error("news-cron error:", err);
    const qs2 = event.queryStringParameters || {};
    const isDebug2 = qs2.debug === "1" || qs2.debug === "true";
    const errorMsg = String(err && err.message ? err.message : err);
    const errorStack = err && err.stack ? String(err.stack) : "";
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastErrorAt: Date.now(),
      lastErrorMsg: errorMsg
    });
    await writeEvent(component, "error", "Error in news-cron", {
      error: errorMsg
    });
    if (isDebug2) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: errorMsg,
          stack: errorStack,
          where: "news-cron handler"
        })
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: errorMsg })
    };
  }
};
