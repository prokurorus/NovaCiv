// netlify/functions/fetch-news.js
// Lightweight HTTP trigger: starts background function and returns quickly

const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;

// Универсальный fetch (как в pipeline.js)
const fetchFn =
  (typeof fetch !== "undefined" && fetch) ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

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
    
    console.log("[debug] allowBypass=true http invocation headers keys:", Object.keys(headers));
    console.log("[debug] ua=", userAgent);
    console.log("[debug] x-nf-request-id=", xNfRequestId);
    console.log("[debug] x-nf-site-id=", xNfSiteId);
    console.log("[debug] x-nf-deploy-id=", xNfDeployId);
    console.log("[debug] referer=", referer);
    console.log("[debug] x-netlify-event=", eventHeader);
  }
  
  return {
    type: "http",
    skipAuth: false,
  };
}

// ---------- HANDLER ----------

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  // Определяем тип вызова
  const invocation = determineInvocationType(event);
  
  if (invocation.type === "scheduled") {
    console.log("invocation type: scheduled");
    console.log("auth skipped");
  } else if (invocation.type === "netlify_run_now") {
    console.log("invocation type: netlify_run_now");
    console.log("auth skipped (ALLOW_NETLIFY_RUN_NOW_BYPASS=true)");
  } else {
    console.log("invocation type: http");
    // Проверка токена только для HTTP/manual вызовов
    const qs = event.queryStringParameters || {};
    if (NEWS_CRON_SECRET) {
      if (!qs.token || qs.token !== NEWS_CRON_SECRET) {
        console.log("auth gate blocked (no token or token mismatch)");
        return {
          statusCode: 403,
          body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" }),
        };
      }
    }
    console.log("auth gate passed");
  }

  // Базовый URL текущего деплоя (Netlify сам пробросит эти переменные)
  const baseUrl =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    `https://${process.env.SITE_NAME}.netlify.app`;

  const triggerUrl = `${baseUrl}/.netlify/functions/fetch-news-background`;

  try {
    // Запускаем background-функцию, ответ нам не важен
    await fetchFn(triggerUrl, { method: "POST" }).catch((e) => {
      console.error("Error triggering background function:", e);
    });

    return {
      statusCode: 202,
      body: JSON.stringify({
        ok: true,
        queued: true,
      }),
    };
  } catch (err) {
    console.error("fetch-news trigger error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err.message || String(err),
      }),
    };
  }
};
