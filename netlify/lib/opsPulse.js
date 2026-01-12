// netlify/lib/opsPulse.js
//
// Операторский пульт для Netlify Functions: heartbeat и события
// Использует fetch для записи в Firebase (без Firebase Admin SDK)

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;

const MAX_EVENTS = 20; // Кольцевой буфер событий

/**
 * Безопасная очистка строки от секретов
 */
function sanitizeString(str) {
  if (!str) return str;
  return String(str)
    .replace(/sk-[a-zA-Z0-9]+/g, "sk-***")
    .replace(/ghp_[a-zA-Z0-9]+/g, "ghp_***")
    .replace(/AIza[^"'\s]+/g, "AIza***")
    .replace(/-----BEGIN[^-]+-----END[^-]+-----/gs, "***PRIVATE_KEY***")
    .replace(/["']([^"']*token[^"']*)["']/gi, '"***TOKEN***"');
}

/**
 * Записывает heartbeat статус компонента
 */
async function writeHeartbeat(component, status) {
  if (!FIREBASE_DB_URL) return;
  
  try {
    // Безопасная очистка сообщения об ошибке
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
      ...(status.metrics || {}),
    };
    
    const url = `${FIREBASE_DB_URL}/ops/heartbeat/${component}.json`;
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(heartbeatData),
    });
  } catch (error) {
    // Не падаем, если не удалось записать heartbeat
    console.error(`[ops-pulse] Failed to write heartbeat for ${component}:`, error.message);
  }
}

/**
 * Записывает событие в кольцевой буфер
 */
async function writeEvent(component, level, message, meta = {}) {
  if (!FIREBASE_DB_URL) return;
  
  try {
    // Безопасная очистка метаданных
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
      meta: safeMeta,
    };
    
    // Получаем текущие события
    const eventsUrl = `${FIREBASE_DB_URL}/ops/events.json`;
    const eventsResp = await fetch(eventsUrl);
    let events = {};
    
    if (eventsResp.ok) {
      const data = await eventsResp.json();
      if (data && typeof data === "object") {
        events = data;
      }
    }
    
    // Добавляем новое событие
    const newEventKey = Date.now().toString();
    events[newEventKey] = event;
    
    // Авто-cleanup: удаляем старые события, если их больше MAX_EVENTS
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
      body: JSON.stringify(events),
    });
  } catch (error) {
    // Не падаем, если не удалось записать событие
    console.error(`[ops-pulse] Failed to write event:`, error.message);
  }
}

/**
 * Записывает ошибку Firebase в /ops/events с полной информацией
 */
async function writeFirebaseError(component, error, meta = {}) {
  if (!FIREBASE_DB_URL) return;
  
  try {
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
        safeMeta[key] = sanitizeString(value).slice(0, 200);
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
      lastErrorMsg: sanitizeString(errorMsg).slice(0, 500),
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
