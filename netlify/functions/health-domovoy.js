// netlify/functions/health-domovoy.js
//
// Health endpoint для Домового: возвращает статус последних запусков
// Защищён токеном NEWS_CRON_SECRET (единый токен для health endpoints)

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || "";

async function fetchFirebaseData(path) {
  if (!FIREBASE_DB_URL) return null;
  try {
    const url = `${FIREBASE_DB_URL}${path}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (e) {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
    };
  }

  // Проверка токена
  if (NEWS_CRON_SECRET) {
    const qs = event.queryStringParameters || {};
    if (!qs.token || qs.token !== NEWS_CRON_SECRET) {
      return {
        statusCode: 403,
        body: JSON.stringify({ ok: false, error: "Forbidden" }),
      };
    }
  }

  try {
    const autoPostMetrics = await fetchFirebaseData("/health/domovoy/autoPostLastRun");
    const autoReplyMetrics = await fetchFirebaseData("/health/domovoy/autoReplyLastRun");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        autoPost: autoPostMetrics || null,
        autoReply: autoReplyMetrics || null,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(err && err.message ? err.message : err),
      }),
    };
  }
};
