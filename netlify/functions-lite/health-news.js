// netlify/functions-lite/health-news.js
//
// Health endpoint для новостей: возвращает статус последних запусков
// Защищён токеном NEWS_CRON_SECRET

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || "";

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function maxTimestamp(values) {
  const numeric = values
    .map((value) => (typeof value === "number" ? value : null))
    .filter((value) => Number.isFinite(value));
  if (!numeric.length) return null;
  return Math.max(...numeric);
}

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
    return jsonResponse(405, {
      ok: false,
      service: "news",
      ts: nowIso(),
      error: "Method Not Allowed",
    });
  }

  if (NEWS_CRON_SECRET) {
    const qs = event.queryStringParameters || {};
    if (!qs.token || qs.token !== NEWS_CRON_SECRET) {
      return jsonResponse(401, {
        ok: false,
        service: "news",
        ts: nowIso(),
        error: "Unauthorized",
      });
    }
  }

  try {
    const fetchMetrics = await fetchFirebaseData("/health/news/fetchNewsLastRun");
    const cronMetrics = await fetchFirebaseData("/health/news/newsCronLastRun");
    const lastRunTs = maxTimestamp([fetchMetrics?.ts, cronMetrics?.ts]);
    const lastRunIso = lastRunTs ? new Date(lastRunTs).toISOString() : null;

    return jsonResponse(200, {
      ok: true,
      service: "news",
      ts: nowIso(),
      lastRun: lastRunIso,
      details: {
        fetch: fetchMetrics || null,
        cron: cronMetrics || null,
      },
    });
  } catch (err) {
    return jsonResponse(500, {
      ok: false,
      service: "news",
      ts: nowIso(),
      error: String(err && err.message ? err.message : err),
      details: {
        fetch: null,
        cron: null,
      },
    });
  }
};
