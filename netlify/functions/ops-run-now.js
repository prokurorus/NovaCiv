// netlify/functions/ops-run-now.js
//
// Операторский эндпоинт для принудительного запуска всех пайплайнов
// Защищён токеном OPS_CRON_SECRET
// Использование: /.netlify/functions/ops-run-now?token=<OPS_CRON_SECRET>

const OPS_CRON_SECRET = process.env.OPS_CRON_SECRET;

// Импортируем handlers функций
const fetchNewsHandler = require("./fetch-news").handler;
const newsCronHandler = require("./news-cron").handler;
const domovoyAutoPostHandler = require("./domovoy-auto-post").handler;

const { writeHeartbeat, writeEvent } = require("../lib/opsPulse");

function log(...args) {
  console.log("[ops-run-now]", ...args);
}

// Создаём mock event для вызова handler
function createMockEvent(method = "GET") {
  return {
    httpMethod: method,
    queryStringParameters: {},
    headers: {
      "x-netlify-event": "schedule",
      "user-agent": "Netlify-Scheduled-Function",
    },
  };
}

exports.handler = async (event) => {
  const startTime = Date.now();
  log("Starting ops-run-now");

  // Проверка токена
  const qs = event.queryStringParameters || {};
  if (!OPS_CRON_SECRET) {
    log("ERROR: OPS_CRON_SECRET is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "OPS_CRON_SECRET is not configured" }),
    };
  }

  if (!qs.token || qs.token !== OPS_CRON_SECRET) {
    log("Auth failed");
    await writeEvent("ops-run-now", "warn", "Auth failed", {});
    return {
      statusCode: 403,
      body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" }),
    };
  }

  const results = {
    fetchNews: null,
    newsCron: null,
    domovoyAutoPost: null,
  };

  try {
    // 1) Запускаем fetch-news
    log("Step 1: Running fetch-news...");
    await writeEvent("ops-run-now", "info", "Starting fetch-news", {});
    
    try {
      const fetchNewsEvent = createMockEvent("POST");
      const fetchNewsResult = await fetchNewsHandler(fetchNewsEvent);
      
      let fetchNewsBody = {};
      try {
        fetchNewsBody = typeof fetchNewsResult.body === "string" 
          ? JSON.parse(fetchNewsResult.body) 
          : fetchNewsResult.body || {};
      } catch (e) {
        fetchNewsBody = { raw: fetchNewsResult.body };
      }
      
      results.fetchNews = {
        statusCode: fetchNewsResult.statusCode,
        ok: fetchNewsResult.statusCode === 200,
        body: fetchNewsBody,
      };
      log("fetch-news completed:", results.fetchNews.statusCode);
      await writeEvent("ops-run-now", "info", "fetch-news completed", {
        statusCode: results.fetchNews.statusCode,
        processed: fetchNewsBody.processed || 0,
      });
    } catch (err) {
      log("fetch-news error:", err.message);
      results.fetchNews = {
        error: String(err && err.message ? err.message : err),
      };
      await writeEvent("ops-run-now", "error", "fetch-news failed", {
        error: String(err && err.message ? err.message : err),
      });
    }

    // Небольшая задержка между шагами
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 2) Запускаем news-cron
    log("Step 2: Running news-cron...");
    await writeEvent("ops-run-now", "info", "Starting news-cron", {});
    
    try {
      const newsCronEvent = createMockEvent("GET");
      const newsCronResult = await newsCronHandler(newsCronEvent);
      
      let newsCronBody = {};
      try {
        newsCronBody = typeof newsCronResult.body === "string" 
          ? JSON.parse(newsCronResult.body) 
          : newsCronResult.body || {};
      } catch (e) {
        newsCronBody = { raw: newsCronResult.body };
      }
      
      results.newsCron = {
        statusCode: newsCronResult.statusCode,
        ok: newsCronResult.statusCode === 200,
        body: newsCronBody,
      };
      log("news-cron completed:", results.newsCron.statusCode);
      await writeEvent("ops-run-now", "info", "news-cron completed", {
        statusCode: results.newsCron.statusCode,
        processed: newsCronBody.processed || 0,
        totalSent: newsCronBody.totalSent || 0,
      });
    } catch (err) {
      log("news-cron error:", err.message);
      results.newsCron = {
        error: String(err && err.message ? err.message : err),
      };
      await writeEvent("ops-run-now", "error", "news-cron failed", {
        error: String(err && err.message ? err.message : err),
      });
    }

    // Небольшая задержка между шагами
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3) Опционально: domovoy-auto-post (dry-run - только генерация без отправки)
    // Пропускаем для безопасности (можно включить позже)
    log("Step 3: Skipping domovoy-auto-post (dry-run not implemented)");

    // Heartbeat для ops-run-now
    await writeHeartbeat("ops-run-now", {
      lastRunAt: startTime,
      lastOkAt: Date.now(),
      metrics: {
        fetchNewsOk: results.fetchNews?.ok || false,
        newsCronOk: results.newsCron?.ok || false,
      },
    });

    const duration = Date.now() - startTime;
    log(`Completed in ${duration}ms`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        duration,
        results,
      }),
    };
  } catch (err) {
    log("Fatal error:", err.message);
    
    await writeHeartbeat("ops-run-now", {
      lastRunAt: startTime,
      lastErrorAt: Date.now(),
      lastErrorMsg: String(err && err.message ? err.message : err),
    });
    await writeEvent("ops-run-now", "error", "Fatal error", {
      error: String(err && err.message ? err.message : err),
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(err && err.message ? err.message : err),
        results,
      }),
    };
  }
};
