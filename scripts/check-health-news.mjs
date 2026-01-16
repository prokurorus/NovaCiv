// scripts/check-health-news.mjs
//
// Скрипт проверки здоровья News pipeline
// Использование: node scripts/check-health-news.mjs

// Используем встроенный fetch (Node 18+)
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env
dotenv.config({ path: join(__dirname, "..", ".env") });

const fetch = globalThis.fetch;

const HEALTH_BASE_URL = "https://novaciv.space";
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || process.env.CRON_TOKEN || "";

if (!NEWS_CRON_SECRET) {
  console.error("❌ NEWS_CRON_SECRET or CRON_TOKEN not set");
  process.exit(1);
}

const HEALTH_FUNCTION = "health-news";
const HEALTH_URL = `${HEALTH_BASE_URL}/.netlify/functions/${HEALTH_FUNCTION}?token=${NEWS_CRON_SECRET}`;

// SLA пороги
const FETCH_NEWS_MAX_AGE_MS = 90 * 60 * 1000; // 90 минут
const NEWS_CRON_MAX_AGE_MS = 90 * 60 * 1000; // 90 минут

function isHtmlResponse(response, bodyText) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("text/html")) return true;
  const trimmed = (bodyText || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

async function main() {
  try {
    const response = await fetch(HEALTH_URL);
    const responseText = await response.text();

    if (isHtmlResponse(response, responseText)) {
      console.error("Function not deployed / returned SPA HTML");
      process.exit(1);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      const snippet = responseText.slice(0, 200).replace(/\s+/g, " ").trim();
      console.error("❌ Health endpoint did not return JSON");
      console.error(`Content-Type: ${response.headers.get("content-type") || "unknown"}`);
      console.error(`Snippet: ${snippet || "[empty response]"}`);
      process.exit(1);
    }

    if (!response.ok) {
      console.error(`❌ Health endpoint returned ${response.status}`);
      if (data?.error) {
        console.error("Error:", data.error);
      }
      process.exit(1);
    }

    if (!data.ok) {
      console.error("❌ Health endpoint returned ok=false");
      if (data?.error) {
        console.error("Error:", data.error);
      }
      process.exit(1);
    }

    const now = Date.now();
    let hasError = false;
    const details = data.details && typeof data.details === "object" ? data.details : data;
    const fetchMetrics = details.fetch || data.fetch || null;
    const cronMetrics = details.cron || data.cron || null;

    // Проверка fetch-news
    if (!fetchMetrics) {
      console.error("❌ fetch-news: no metrics found (scheduler not running)");
      hasError = true;
    } else {
      const age = now - fetchMetrics.ts;
      const ageMinutes = Math.floor(age / (60 * 1000));
      
      if (age > FETCH_NEWS_MAX_AGE_MS) {
        console.error(`❌ fetch-news: last run ${ageMinutes}m ago (max 90m, scheduler not running)`);
        hasError = true;
      } else if (fetchMetrics.processed === 0) {
        console.log(`⚠️  fetch-news: last run ${ageMinutes}m ago, processed=0 (no new items, but scheduler is running)`);
        // processed=0 не ошибка, это heartbeat
      } else {
        console.log(`✅ fetch-news: last run ${ageMinutes}m ago, processed=${fetchMetrics.processed}`);
      }
    }

    // Проверка news-cron
    if (!cronMetrics) {
      console.error("❌ news-cron: no metrics found (scheduler not running)");
      hasError = true;
    } else {
      const age = now - cronMetrics.ts;
      const ageMinutes = Math.floor(age / (60 * 1000));
      
      if (age > NEWS_CRON_MAX_AGE_MS) {
        console.error(`❌ news-cron: last run ${ageMinutes}m ago (max 90m, scheduler not running)`);
        hasError = true;
      } else if (cronMetrics.processed === 0) {
        console.log(`⚠️  news-cron: last run ${ageMinutes}m ago, processed=0 (no new topics, but scheduler is running)`);
        // processed=0 не ошибка, это heartbeat
      } else {
        console.log(`✅ news-cron: last run ${ageMinutes}m ago, processed=${cronMetrics.processed}, sent=${cronMetrics.totalSent || 0}`);
      }
    }

    if (hasError) {
      process.exit(1);
    }

    console.log("✅ All News health checks passed");
  } catch (err) {
    console.error("❌ Health check failed:", err.message);
    process.exit(1);
  }
}

main();
