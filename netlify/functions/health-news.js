// netlify/functions/health-news.js
// Health check endpoint for news scheduler
// Returns status of fetch-news and news-cron based on Firebase heartbeat metrics

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || "";

// Threshold for "alive" status (90 minutes in milliseconds)
const ALIVE_THRESHOLD_MS = 90 * 60 * 1000;
// Threshold for "healthy pipeline" (6 hours in milliseconds)
const HEALTHY_PIPELINE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

async function readFirebasePath(path) {
  if (!FIREBASE_DB_URL) return null;

  try {
    const res = await fetch(`${FIREBASE_DB_URL}${path}.json`);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data;
  } catch (e) {
    console.error(`Error reading ${path}:`, e);
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
    };
  }

  // Check token if NEWS_CRON_SECRET is set
  if (NEWS_CRON_SECRET) {
    const qs = event.queryStringParameters || {};
    if (!qs.token || qs.token !== NEWS_CRON_SECRET) {
      return {
        statusCode: 403,
        body: JSON.stringify({ ok: false, error: "Forbidden" }),
      };
    }
  }

  if (!FIREBASE_DB_URL) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "FIREBASE_DB_URL is not configured",
      }),
    };
  }

  const now = Date.now();

  // Read heartbeat metrics from Firebase
  const fetchMetrics = await readFirebasePath("/health/news/fetchNewsLastRun");
  const cronMetrics = await readFirebasePath("/health/news/newsCronLastRun");

  // Check if schedulers are alive (last run < 90 minutes ago)
  const schedulerAliveFetch =
    fetchMetrics && fetchMetrics.ts
      ? now - fetchMetrics.ts < ALIVE_THRESHOLD_MS
      : false;
  const schedulerAliveCron =
    cronMetrics && cronMetrics.ts
      ? now - cronMetrics.ts < ALIVE_THRESHOLD_MS
      : false;

  // Check if pipeline is healthy (both alive AND (processed>0 OR totalSent>0) in last 6 hours)
  const fetchProcessedRecently =
    fetchMetrics && fetchMetrics.ts
      ? now - fetchMetrics.ts < HEALTHY_PIPELINE_THRESHOLD_MS &&
        fetchMetrics.processed > 0
      : false;
  const cronSentRecently =
    cronMetrics && cronMetrics.ts
      ? now - cronMetrics.ts < HEALTHY_PIPELINE_THRESHOLD_MS &&
        cronMetrics.totalSent > 0
      : false;
  const pipelineHealthy =
    schedulerAliveFetch &&
    schedulerAliveCron &&
    (fetchProcessedRecently || cronSentRecently);

  // Prepare response
  const response = {
    ok: true,
    timestamp: new Date().toISOString(),
    fetch: {
      lastRun: fetchMetrics?.ts
        ? new Date(fetchMetrics.ts).toISOString()
        : null,
      lastRunAgeMinutes: fetchMetrics?.ts
        ? Math.round((now - fetchMetrics.ts) / 60000)
        : null,
      schedulerAlive: schedulerAliveFetch,
      processed: fetchMetrics?.processed ?? null,
      sourcesOk: fetchMetrics?.sourcesOk ?? null,
      sourcesFailed: fetchMetrics?.sourcesFailed ?? null,
      fetched: fetchMetrics?.fetched ?? null,
      filtered: fetchMetrics?.filtered ?? null,
      runId: fetchMetrics?.runId ?? null,
    },
    cron: {
      lastRun: cronMetrics?.ts
        ? new Date(cronMetrics.ts).toISOString()
        : null,
      lastRunAgeMinutes: cronMetrics?.ts
        ? Math.round((now - cronMetrics.ts) / 60000)
        : null,
      schedulerAlive: schedulerAliveCron,
      processed: cronMetrics?.processed ?? null,
      totalSent: cronMetrics?.totalSent ?? null,
      fetchedTopics: cronMetrics?.fetchedTopics ?? null,
      perLanguage: cronMetrics?.perLanguage ?? null,
      runId: cronMetrics?.runId ?? null,
    },
    pipeline: {
      healthy: pipelineHealthy,
      fetchAlive: schedulerAliveFetch,
      cronAlive: schedulerAliveCron,
      fetchProcessedRecently: fetchProcessedRecently,
      cronSentRecently: cronSentRecently,
    },
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(response),
  };
};
