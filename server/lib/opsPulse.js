// server/lib/opsPulse.js
//
// Операторский пульт для NovaCiv: heartbeat и события
// Используется всеми функциями для записи статусов в /ops/heartbeat и /ops/events

const { getDb } = require("./firebaseAdmin");

const MAX_EVENTS = 20; // Кольцевой буфер событий

/**
 * Записывает heartbeat статус компонента
 * @param {string} component - Имя компонента (fetch-news, news-cron, domovoy-auto-post, etc.)
 * @param {Object} status - Статус компонента
 * @param {number} status.lastRunAt - Время последнего запуска (timestamp)
 * @param {number} [status.lastOkAt] - Время последнего успешного выполнения
 * @param {number} [status.lastErrorAt] - Время последней ошибки
 * @param {string} [status.lastErrorMsg] - Сообщение последней ошибки (без секретов)
 * @param {Object} [status.metrics] - Дополнительные метрики (createdTopicsCount, sentToTelegramCount, etc.)
 */
async function writeHeartbeat(component, status) {
  try {
    const db = getDb();
    const heartbeatRef = db.ref(`ops/heartbeat/${component}`);
    
    // Безопасная очистка сообщения об ошибке (убираем секреты)
    let safeErrorMsg = status.lastErrorMsg || null;
    if (safeErrorMsg) {
      safeErrorMsg = safeErrorMsg
        .replace(/sk-[a-zA-Z0-9]+/g, "sk-***")
        .replace(/ghp_[a-zA-Z0-9]+/g, "ghp_***")
        .replace(/AIza[^"'\s]+/g, "AIza***")
        .replace(/-----BEGIN[^-]+-----END[^-]+-----/gs, "***PRIVATE_KEY***")
        .replace(/["']([^"']*token[^"']*)["']/gi, '"***TOKEN***"')
        .slice(0, 500); // Ограничиваем длину
    }
    
    const heartbeatData = {
      lastRunAt: status.lastRunAt,
      lastOkAt: status.lastOkAt || null,
      lastErrorAt: status.lastErrorAt || null,
      lastErrorMsg: safeErrorMsg,
      updatedAt: Date.now(),
      ...(status.metrics || {}),
    };
    
    await heartbeatRef.set(heartbeatData);
  } catch (error) {
    // Не падаем, если не удалось записать heartbeat
    console.error(`[ops-pulse] Failed to write heartbeat for ${component}:`, error.message);
  }
}

/**
 * Записывает событие в кольцевой буфер
 * @param {string} component - Имя компонента
 * @param {string} level - Уровень события (info, warn, error)
 * @param {string} message - Сообщение события
 * @param {Object} [meta] - Дополнительные метаданные (без секретов)
 */
async function writeEvent(component, level, message, meta = {}) {
  try {
    const db = getDb();
    const eventsRef = db.ref("ops/events");
    
    // Безопасная очистка метаданных
    const safeMeta = {};
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === "string") {
        safeMeta[key] = value
          .replace(/sk-[a-zA-Z0-9]+/g, "sk-***")
          .replace(/ghp_[a-zA-Z0-9]+/g, "ghp_***")
          .replace(/AIza[^"'\s]+/g, "AIza***")
          .replace(/-----BEGIN[^-]+-----END[^-]+-----/gs, "***PRIVATE_KEY***")
          .slice(0, 200);
      } else {
        safeMeta[key] = value;
      }
    }
    
    const event = {
      ts: Date.now(),
      component,
      level,
      message: message.slice(0, 500),
      meta: safeMeta,
    };
    
    // Получаем текущие события
    const snapshot = await eventsRef.once("value");
    const events = snapshot.val() || {};
    const eventKeys = Object.keys(events).sort((a, b) => parseInt(a) - parseInt(b));
    
    // Добавляем новое событие
    const newEventKey = Date.now().toString();
    events[newEventKey] = event;
    
    // Авто-cleanup: удаляем старые события, если их больше MAX_EVENTS
    if (eventKeys.length >= MAX_EVENTS) {
      const keysToRemove = eventKeys.slice(0, eventKeys.length - MAX_EVENTS + 1);
      for (const key of keysToRemove) {
        delete events[key];
      }
      console.log(`[ops-pulse] Cleaned ${keysToRemove.length} old events (buffer size: ${MAX_EVENTS})`);
    }
    
    await eventsRef.set(events);
  } catch (error) {
    // Не падаем, если не удалось записать событие
    console.error(`[ops-pulse] Failed to write event:`, error.message);
  }
}

/**
 * Записывает ошибку Firebase в /ops/events с полной информацией
 */
async function writeFirebaseError(component, error, meta = {}) {
  try {
    const db = getDb();
    const eventsRef = db.ref("ops/events");
    
    const errorMeta = {
      op: meta.op || "unknown",
      path: meta.path || "unknown",
      status: meta.status || null,
      firebaseError: meta.firebaseError || null,
      ...meta,
    };
    
    // Безопасная очистка
    const safeMeta = {};
    for (const [key, value] of Object.entries(errorMeta)) {
      if (typeof value === "string") {
        safeMeta[key] = value
          .replace(/sk-[a-zA-Z0-9]+/g, "sk-***")
          .replace(/ghp_[a-zA-Z0-9]+/g, "ghp_***")
          .replace(/AIza[^"'\s]+/g, "AIza***")
          .replace(/-----BEGIN[^-]+-----END[^-]+-----/gs, "***PRIVATE_KEY***")
          .slice(0, 200);
      } else {
        safeMeta[key] = value;
      }
    }
    
    const errorMsg = String(error && error.message ? error.message : error).slice(0, 500);
    
    await writeEvent(component, "error", `Firebase ${errorMeta.op} error: ${errorMsg}`, safeMeta);
    
    // Также обновляем heartbeat
    await writeHeartbeat(component, {
      lastRunAt: Date.now(),
      lastErrorAt: Date.now(),
      lastErrorMsg: errorMsg
        .replace(/sk-[a-zA-Z0-9]+/g, "sk-***")
        .replace(/ghp_[a-zA-Z0-9]+/g, "ghp_***")
        .replace(/AIza[^"'\s]+/g, "AIza***")
        .replace(/-----BEGIN[^-]+-----END[^-]+-----/gs, "***PRIVATE_KEY***")
        .slice(0, 500),
    });
  } catch (e) {
    console.error(`[ops-pulse] Failed to write Firebase error:`, e.message);
  }
}

module.exports = {
  writeHeartbeat,
  writeEvent,
  writeFirebaseError,
};
