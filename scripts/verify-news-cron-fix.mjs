// scripts/verify-news-cron-fix.mjs
//
// Скрипт проверки исправлений news-cron после commit c125082
// Проверяет: health metrics, структуру данных, доступность endpoints

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env") });

const fetch = globalThis.fetch;
const NEWS_BASE_URL = process.env.NEWS_BASE_URL || "https://novaciv.space";
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET || "";

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || ""; // Опционально, для публичного доступа

async function checkHealthEndpoint() {
  if (!NEWS_CRON_SECRET) {
    console.log("⚠️  NEWS_CRON_SECRET not set, skipping health endpoint check");
    return null;
  }

  const url = `${NEWS_BASE_URL}/.netlify/functions/health-news?token=${NEWS_CRON_SECRET}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ Health endpoint returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`❌ Health endpoint error: ${err.message}`);
    return null;
  }
}

async function checkFirebasePublic(path) {
  if (!FIREBASE_DB_URL) {
    console.log("⚠️  FIREBASE_DB_URL not set, skipping Firebase check");
    return null;
  }

  const url = `${FIREBASE_DB_URL}${path}.json${FIREBASE_API_KEY ? `?auth=${FIREBASE_API_KEY}` : ""}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // Firebase может требовать auth, это нормально
      if (res.status === 401 || res.status === 403) {
        console.log(`ℹ️  Firebase ${path}: requires authentication (expected)`);
        return null;
      }
      return null;
    }
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log("🔍 Verifying news-cron fix (commit c125082)\n");

  // 1. Check health endpoint
  console.log("1. Health Endpoint Check");
  console.log("─".repeat(50));
  const health = await checkHealthEndpoint();
  
  if (health) {
    if (!health.ok) {
      console.error("❌ Health endpoint returned ok=false");
      console.error("Error:", health.error);
    } else {
      console.log("✅ Health endpoint accessible");

      // Check cron metrics
      if (health.cron) {
        const age = Date.now() - health.cron.ts;
        const ageMinutes = Math.floor(age / (60 * 1000));
        console.log(`   news-cron last run: ${ageMinutes} minutes ago`);
        console.log(`   runId: ${health.cron.runId || "N/A"}`);
        console.log(`   processed: ${health.cron.processed || 0}`);
        console.log(`   totalSent: ${health.cron.totalSent || 0}`);
        
        if (ageMinutes > 120) {
          console.log("   ⚠️  Last run is more than 2 hours ago");
        } else {
          console.log("   ✅ Recent run detected");
        }
      } else {
        console.log("   ⚠️  No cron metrics found (may not have run yet)");
      }

      // Check fetch metrics
      if (health.fetch) {
        const age = Date.now() - health.fetch.ts;
        const ageMinutes = Math.floor(age / (60 * 1000));
        console.log(`   fetch-news last run: ${ageMinutes} minutes ago`);
        console.log(`   processed: ${health.fetch.processed || 0}`);
      } else {
        console.log("   ⚠️  No fetch metrics found");
      }
    }
  } else {
    console.log("❌ Health endpoint check failed (check NEWS_CRON_SECRET)");
  }

  console.log("\n2. Firebase Health Metrics (if accessible)");
  console.log("─".repeat(50));
  const cronMetrics = await checkFirebasePublic("/health/news/newsCronLastRun");
  if (cronMetrics) {
    console.log("✅ Firebase health metrics accessible");
    console.log("   Timestamp:", new Date(cronMetrics.ts).toISOString());
    console.log("   RunId:", cronMetrics.runId || "N/A");
  } else {
    console.log("ℹ️  Firebase metrics require authentication (expected)");
  }

  console.log("\n3. Summary");
  console.log("─".repeat(50));
  console.log("✅ Health endpoint check completed");
  console.log("ℹ️  For full verification, check:");
  console.log("   - Netlify Dashboard → Functions → news-cron → Logs");
  console.log("   - Netlify Dashboard → Deploys → commit c125082");
  console.log("   - Firebase Console → /health/news/newsCronLastRun");
  console.log("   - Telegram channels (if accessible)");
}

main().catch(console.error);
