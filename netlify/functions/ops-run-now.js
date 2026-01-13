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

  // Режим dry-run: без Telegram, только heartbeat + events
  const isDryRun = qs.dry === "1" || qs.dry === "true";
  
  // Режим maintenance: запуск db-audit и db-audit-fix
  const isMaintenance = qs.maintenance === "1" || qs.maintenance === "true";
  if (isMaintenance) {
    log("Maintenance mode: running db-audit and fixes...");
    await writeEvent("ops-run-now", "info", "Maintenance mode started", {});
    
    try {
      // Импортируем функции audit и fix
      // В Netlify Functions используем require с относительным путём
      const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;
      
      // Путь к tools/ из netlify/functions/
      const path = require("path");
      const projectRoot = path.resolve(__dirname, "../..");
      
      // Загружаем модули (удаляем кэш для свежего импорта)
      const auditPath = path.join(projectRoot, "tools/db-audit.js");
      const fixPath = path.join(projectRoot, "tools/db-audit-fix.js");
      
      delete require.cache[auditPath];
      delete require.cache[fixPath];
      
      const { audit } = require(auditPath);
      const { fix } = require(fixPath);
      
      // 1) Запускаем audit
      log("Step 1: Running db-audit...");
      const auditReport = await audit();
      
      // Сохраняем отчёт в Firebase через HTTP API
      try {
        if (FIREBASE_DB_URL) {
          const reportUrl = `${FIREBASE_DB_URL}/ops/dbAudit/latest.json`;
          await fetch(reportUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(auditReport),
          });
          log("Audit report saved to /ops/dbAudit/latest");
        }
      } catch (e) {
        log("Failed to save audit report:", e.message);
      }
      
      // 2) Если найдены проблемы - запускаем fix
      const hasKeyIssues = Object.keys(auditReport.keyIssues || {}).length > 0;
      const hasSchemaIssues = Object.keys(auditReport.schemaIssues || {}).length > 0;
      const needsFix = hasKeyIssues || hasSchemaIssues || auditReport.status === "WARN" || auditReport.status === "FAIL";
      
      let fixResults = null;
      if (needsFix) {
        log("Step 2: Issues found, running db-audit-fix...");
        await writeEvent("ops-run-now", "info", "Running db-audit-fix", {
          keyIssues: hasKeyIssues,
          schemaIssues: hasSchemaIssues,
        });
        
        try {
          fixResults = await fix();
          log("db-audit-fix completed:", fixResults);
          
          // Повторный audit после фиксов
          log("Step 3: Running post-fix audit...");
          const postFixReport = await audit();
          
          // Обновляем отчёт через HTTP API
          try {
            if (FIREBASE_DB_URL) {
              const reportUrl = `${FIREBASE_DB_URL}/ops/dbAudit/latest.json`;
              await fetch(reportUrl, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...postFixReport,
                  preFixStatus: auditReport.status,
                  fixesApplied: fixResults,
                }),
              });
              log("Post-fix audit report saved");
            }
          } catch (e) {
            log("Failed to save post-fix report:", e.message);
          }
        } catch (fixError) {
          log("db-audit-fix error:", fixError.message);
          await writeEvent("ops-run-now", "error", "db-audit-fix failed", {
            error: String(fixError && fixError.message ? fixError.message : fixError),
          });
        }
      } else {
        log("No issues found, skipping db-audit-fix");
      }
      
      // 3) Записываем событие "maintenance done"
      await writeEvent("ops-run-now", "info", "Maintenance done", {
        auditStatus: auditReport.status,
        hasKeyIssues,
        hasSchemaIssues,
        fixesApplied: fixResults !== null,
        fixResults: fixResults ? {
          keysMigrated: fixResults.keysMigrated || 0,
          topicsNormalized: fixResults.topicsNormalized || 0,
          newsMetaCleaned: fixResults.newsMetaCleaned || 0,
        } : null,
      });
      
      await writeHeartbeat("ops-run-now", {
        lastRunAt: startTime,
        lastOkAt: Date.now(),
        metrics: {
          maintenanceMode: true,
          auditStatus: auditReport.status,
          fixesApplied: fixResults !== null,
        },
      });
      
      const duration = Date.now() - startTime;
      log(`Maintenance completed in ${duration}ms`);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          mode: "maintenance",
          duration,
          audit: {
            status: auditReport.status,
            warnings: auditReport.warnings.length,
            errors: auditReport.errors.length,
            keyIssues: Object.keys(auditReport.keyIssues || {}).length,
            schemaIssues: Object.keys(auditReport.schemaIssues || {}).length,
          },
          fixes: fixResults,
        }),
      };
    } catch (error) {
      log("Maintenance error:", error.message);
      
      await writeHeartbeat("ops-run-now", {
        lastRunAt: startTime,
        lastErrorAt: Date.now(),
        lastErrorMsg: String(error && error.message ? error.message : error),
      });
      await writeEvent("ops-run-now", "error", "Maintenance failed", {
        error: String(error && error.message ? error.message : error),
      });
      
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          mode: "maintenance",
          error: String(error && error.message ? error.message : error),
        }),
      };
    }
  }

  const results = {
    fetchNews: null,
    newsCron: null,
    domovoyAutoPost: null,
  };

  try {
    // 1) Запускаем fetch-news
    log(`Step 1: Running fetch-news${isDryRun ? " (dry-run)" : ""}...`);
    await writeEvent("ops-run-now", "info", `Starting fetch-news${isDryRun ? " (dry-run)" : ""}`, { dryRun: isDryRun });
    
    try {
      const fetchNewsEvent = createMockEvent("POST");
      // В dry-run режиме устанавливаем флаг
      if (isDryRun) {
        fetchNewsEvent.queryStringParameters = { ...fetchNewsEvent.queryStringParameters, dry: "1" };
      }
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
    log(`Step 2: Running news-cron${isDryRun ? " (dry-run)" : ""}...`);
    await writeEvent("ops-run-now", "info", `Starting news-cron${isDryRun ? " (dry-run)" : ""}`, { dryRun: isDryRun });
    
    try {
      const newsCronEvent = createMockEvent("GET");
      // В dry-run режиме устанавливаем флаг
      if (isDryRun) {
        newsCronEvent.queryStringParameters = { ...newsCronEvent.queryStringParameters, dry: "1" };
      }
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
