// scripts/check-health-domovoy.mjs
//
// Скрипт проверки здоровья Домового pipeline
// Использование: node scripts/check-health-domovoy.mjs

// Используем встроенный fetch (Node 18+)
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env
dotenv.config({ path: join(__dirname, "..", ".env") });

const fetch = globalThis.fetch;

const DOMOVOY_BASE_URL = process.env.DOMOVOY_BASE_URL || process.env.NEWS_BASE_URL || "https://novaciv.space";
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || process.env.CRON_TOKEN || "";

if (!NEWS_CRON_SECRET) {
  console.error("❌ NEWS_CRON_SECRET or CRON_TOKEN not set");
  process.exit(1);
}

const HEALTH_URL = `${DOMOVOY_BASE_URL}/.netlify/functions/health-domovoy?token=${NEWS_CRON_SECRET}`;

// SLA пороги
const AUTO_POST_MAX_AGE_MS = 26 * 60 * 60 * 1000; // 26 часов
const AUTO_REPLY_MAX_AGE_MS = 20 * 60 * 1000; // 20 минут

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

    // Проверка auto-post
    if (!data.autoPost) {
      console.error("❌ auto-post: no metrics found (never run)");
      hasError = true;
    } else {
      const age = now - data.autoPost.ts;
      const ageHours = Math.floor(age / (60 * 60 * 1000));
      
      if (age > AUTO_POST_MAX_AGE_MS) {
        console.error(`❌ auto-post: last run ${ageHours}h ago (max 26h)`);
        hasError = true;
      } else if (!data.autoPost.ok) {
        console.error(`❌ auto-post: last run failed (errCode: ${data.autoPost.errCode || "UNKNOWN"})`);
        hasError = true;
      } else {
        console.log(`✅ auto-post: last run ${ageHours}h ago, ok=true`);
      }
    }

    // Проверка auto-reply
    if (!data.autoReply) {
      console.error("❌ auto-reply: no metrics found (never run)");
      hasError = true;
    } else {
      const age = now - data.autoReply.ts;
      const ageMinutes = Math.floor(age / (60 * 1000));
      
      if (age > AUTO_REPLY_MAX_AGE_MS) {
        console.error(`❌ auto-reply: last run ${ageMinutes}m ago (max 20m)`);
        hasError = true;
      } else if (!data.autoReply.ok) {
        console.error(`❌ auto-reply: last run failed (errCode: ${data.autoReply.errCode || "UNKNOWN"})`);
        hasError = true;
      } else {
        console.log(`✅ auto-reply: last run ${ageMinutes}m ago, ok=true`);
      }
    }

    if (hasError) {
      process.exit(1);
    }

    console.log("✅ All Domovoy health checks passed");
  } catch (err) {
    console.error("❌ Health check failed:", err.message);
    process.exit(1);
  }
}

main();
