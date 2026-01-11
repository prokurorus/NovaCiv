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

const NEWS_BASE_URL = process.env.NEWS_BASE_URL || "https://novaciv.space";
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || process.env.CRON_TOKEN || "";

if (!NEWS_CRON_SECRET) {
  console.error("❌ NEWS_CRON_SECRET or CRON_TOKEN not set");
  process.exit(1);
}

const HEALTH_URL = `${NEWS_BASE_URL}/.netlify/functions/health-news?token=${NEWS_CRON_SECRET}`;

// SLA пороги
const FETCH_NEWS_MAX_AGE_MS = 90 * 60 * 1000; // 90 минут
const NEWS_CRON_MAX_AGE_MS = 90 * 60 * 1000; // 90 минут

async function main() {
  try {
    const response = await fetch(HEALTH_URL);
    if (!response.ok) {
      console.error(`❌ Health endpoint returned ${response.status}`);
      process.exit(1);
    }

    const data = await response.json();
    if (!data.ok) {
      console.error("❌ Health endpoint returned ok=false");
      console.error("Error:", data.error);
      process.exit(1);
    }

    const now = Date.now();
    let hasError = false;

    // Проверка fetch-news
    if (!data.fetch) {
      console.error("❌ fetch-news: no metrics found (scheduler not running)");
      hasError = true;
    } else {
      const age = now - data.fetch.ts;
      const ageMinutes = Math.floor(age / (60 * 1000));
      
      if (age > FETCH_NEWS_MAX_AGE_MS) {
        console.error(`❌ fetch-news: last run ${ageMinutes}m ago (max 90m, scheduler not running)`);
        hasError = true;
      } else if (data.fetch.processed === 0) {
        console.log(`⚠️  fetch-news: last run ${ageMinutes}m ago, processed=0 (no new items, but scheduler is running)`);
        // processed=0 не ошибка, это heartbeat
      } else {
        console.log(`✅ fetch-news: last run ${ageMinutes}m ago, processed=${data.fetch.processed}`);
      }
    }

    // Проверка news-cron
    if (!data.cron) {
      console.error("❌ news-cron: no metrics found (scheduler not running)");
      hasError = true;
    } else {
      const age = now - data.cron.ts;
      const ageMinutes = Math.floor(age / (60 * 1000));
      
      if (age > NEWS_CRON_MAX_AGE_MS) {
        console.error(`❌ news-cron: last run ${ageMinutes}m ago (max 90m, scheduler not running)`);
        hasError = true;
      } else if (data.cron.processed === 0) {
        console.log(`⚠️  news-cron: last run ${ageMinutes}m ago, processed=0 (no new topics, but scheduler is running)`);
        // processed=0 не ошибка, это heartbeat
      } else {
        console.log(`✅ news-cron: last run ${ageMinutes}m ago, processed=${data.cron.processed}, sent=${data.cron.totalSent || 0}`);
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
