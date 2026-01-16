// scripts/check-news-cron-execution.mjs
//
// Проверка выполнения news-cron после commit c125082
// Проверяет: health metrics, Firebase topics, наличие кандидатов

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

const fetch = globalThis.fetch;
const NEWS_BASE_URL = process.env.NEWS_BASE_URL || "https://novaciv.space";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "";
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

async function checkHealthEndpoint() {
  if (!ADMIN_API_TOKEN) {
    return { error: "ADMIN_API_TOKEN not set" };
  }

  const url = `${NEWS_BASE_URL}/.netlify/functions/admin-proxy/admin/health/news`;
  
  try {
    const res = await fetch(url, {
      headers: {
        "X-Admin-Token": ADMIN_API_TOKEN,
      },
    });
    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

async function checkFirebaseTopics() {
  if (!FIREBASE_DB_URL) {
    return { error: "FIREBASE_DB_URL not set" };
  }

  // Получаем все темы с section="news"
  const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    
    if (!data || typeof data !== "object") {
      return { topics: [], error: null };
    }

    const topics = Object.entries(data).map(([id, value]) => ({
      id,
      ...(value || {}),
    }));

    return { topics, error: null };
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  console.log("🔍 Checking news-cron execution (commit c125082)\n");
  console.log("=".repeat(60));

  // 1. Health Metrics
  console.log("\n1. Health Metrics Check");
  console.log("-".repeat(60));
  
  const health = await checkHealthEndpoint();
  
  if (health.error) {
    console.log(`❌ Cannot check health endpoint: ${health.error}`);
    console.log("   (Set ADMIN_API_TOKEN in .env to enable)");
  } else if (!health.ok) {
    console.log(`❌ Health endpoint error: ${health.error || "unknown"}`);
  } else {
    const now = Date.now();
    
    // Check news-cron metrics
    if (health.cron) {
      const age = now - health.cron.ts;
      const ageMinutes = Math.floor(age / (60 * 1000));
      const ageHours = (age / (60 * 60 * 1000)).toFixed(1);
      
      console.log("✅ newsCronLastRun metrics found");
      console.log(`   Timestamp: ${new Date(health.cron.ts).toISOString()}`);
      console.log(`   Age: ${ageMinutes} minutes (${ageHours} hours)`);
      console.log(`   RunId: ${health.cron.runId || "N/A"}`);
      console.log(`   Processed: ${health.cron.processed || 0}`);
      console.log(`   TotalSent: ${health.cron.totalSent || 0}`);
      
      if (age < TWO_HOURS_MS) {
        console.log("   ✅ Recent execution (within last 2 hours)");
      } else {
        console.log("   ⚠️  Last execution more than 2 hours ago");
      }
      
      if (health.cron.runId && health.cron.runId.startsWith("news-cron-")) {
        console.log("   ✅ RunId format correct");
      } else {
        console.log("   ⚠️  RunId format unexpected");
      }
    } else {
      console.log("❌ newsCronLastRun metrics NOT FOUND");
      console.log("   → news-cron may not have run or not writing metrics");
    }
    
    // Check fetch-news metrics
    if (health.fetch) {
      const age = now - health.fetch.ts;
      const ageMinutes = Math.floor(age / (60 * 1000));
      console.log("\n✅ fetchNewsLastRun metrics found");
      console.log(`   Timestamp: ${new Date(health.fetch.ts).toISOString()}`);
      console.log(`   Age: ${ageMinutes} minutes`);
      console.log(`   Processed: ${health.fetch.processed || 0}`);
    } else {
      console.log("\n⚠️  fetchNewsLastRun metrics NOT FOUND");
      console.log("   → fetch-news does not write metrics (known issue, not a blocker)");
    }
  }

  // 2. Firebase Topics Check
  console.log("\n2. Firebase Topics Check (Candidates for Posting)");
  console.log("-".repeat(60));
  
  const topicsResult = await checkFirebaseTopics();
  
  if (topicsResult.error) {
    console.log(`❌ Cannot check Firebase topics: ${topicsResult.error}`);
    console.log("   (Set FIREBASE_DB_URL in .env to enable)");
  } else {
    const topics = topicsResult.topics || [];
    console.log(`✅ Found ${topics.length} topics with section="news"`);
    
    // Filter unpublished topics
    const unpublished = topics.filter(t => !t.telegramPostedAt);
    const published = topics.filter(t => t.telegramPostedAt);
    
    console.log(`   Published: ${published.length}`);
    console.log(`   Unpublished: ${unpublished.length}`);
    
    if (unpublished.length > 0) {
      console.log("\n✅ Candidates for posting found:");
      unpublished.slice(0, 5).forEach((t, i) => {
        const createdAt = t.createdAt ? new Date(t.createdAt).toISOString() : "N/A";
        console.log(`   ${i + 1}. [${t.lang || "N/A"}] ${t.title || "No title"} (${createdAt})`);
      });
      if (unpublished.length > 5) {
        console.log(`   ... and ${unpublished.length - 5} more`);
      }
    } else {
      console.log("\n⚠️  No unpublished topics found");
      console.log("   → All topics already published or queue is empty");
    }
    
    // Analyze by language
    const byLang = {};
    unpublished.forEach(t => {
      const lang = t.lang || "unknown";
      byLang[lang] = (byLang[lang] || 0) + 1;
    });
    
    if (Object.keys(byLang).length > 0) {
      console.log("\n   Unpublished by language:");
      Object.entries(byLang).forEach(([lang, count]) => {
        console.log(`     ${lang}: ${count}`);
      });
    }
  }

  // 3. Summary and Diagnosis
  console.log("\n3. Diagnosis");
  console.log("-".repeat(60));
  
  let status = "UNKNOWN";
  let stopPoint = "";
  let fix = "";
  
  if (health.error || !health.ok || !health.cron) {
    status = "FAIL";
    stopPoint = "Health metrics not found or inaccessible";
    fix = "Check Netlify Functions logs for news-cron execution";
  } else {
    const cronAge = health.cron ? Date.now() - health.cron.ts : Infinity;
    const hasUnpublished = topicsResult.topics && topicsResult.topics.some(t => !t.telegramPostedAt);
    
    if (cronAge > TWO_HOURS_MS) {
      status = "FAIL";
      stopPoint = "news-cron not running (last run > 2 hours ago)";
      fix = "Check Netlify scheduled functions configuration";
    } else if (!hasUnpublished) {
      status = "PASS (no candidates)";
      stopPoint = "Queue empty - all topics published or no topics exist";
      fix = health.cron && health.cron.processed === 0 
        ? "Normal: no new topics to process"
        : "Create test topic or wait for fetch-news to create topics";
    } else if (health.cron.processed === 0 && hasUnpublished) {
      status = "FAIL";
      stopPoint = "news-cron ran but processed=0 despite unpublished topics";
      fix = "Check news-cron logic: filter conditions, Telegram env vars, or errors in logs";
    } else if (health.cron.totalSent === 0 && health.cron.processed > 0) {
      status = "FAIL";
      stopPoint = "news-cron processed topics but sent=0 (Telegram error)";
      fix = "Check TELEGRAM_BOT_TOKEN and TELEGRAM_NEWS_CHAT_ID_* env vars";
    } else {
      status = "PASS";
      stopPoint = "All checks passed";
      fix = "None";
    }
  }
  
  console.log(`Status: ${status}`);
  console.log(`Stop Point: ${stopPoint}`);
  console.log(`Fix: ${fix}`);
  
  console.log("\n" + "=".repeat(60));
  console.log("\n📋 Manual Checks Required:");
  console.log("   1. Netlify Dashboard → Functions → news-cron → Logs");
  console.log("      - Check for 403 Forbidden (should NOT appear)");
  console.log("      - Check for ReferenceError (should NOT appear)");
  console.log("      - Check execution status");
  console.log("   2. Netlify Dashboard → Deploys → commit c125082");
  console.log("      - Verify deploy is Published");
}

main().catch(console.error);
