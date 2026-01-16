// server/lib/healthMetrics.js
//
// Единая запись health-метрик в Firebase Realtime Database

const { getDb } = require("./firebaseAdmin");

function safeKey(value) {
  if (!value) return "unknown";
  return String(value)
    .trim()
    .replace(/[.#$[\]/]/g, "_")
    .slice(0, 120);
}

/**
 * Записывает health-метрики в /health/{name}
 * @param {string} name - имя метрики (например: "news.fetch")
 * @param {Object} payload - { status: "ok"|"error", details: object }
 */
async function writeHealthMetrics(name, payload = {}) {
  if (!name) {
    console.error("[health-metrics] Missing metric name");
    return;
  }

  const status = payload.status === "error" ? "error" : "ok";
  const details = payload.details && typeof payload.details === "object" ? payload.details : {};

  const data = {
    lastRun: new Date().toISOString(),
    status,
    details,
  };

  try {
    const db = getDb();
    const path = `health/${safeKey(name)}`;
    await db.ref(path).set(data);
  } catch (error) {
    console.error(`[health-metrics] Failed to write ${name}:`, error.message);
  }
}

module.exports = {
  writeHealthMetrics,
};
