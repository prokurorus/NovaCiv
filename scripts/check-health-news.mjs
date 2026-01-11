#!/usr/bin/env node
// scripts/check-health-news.mjs
//
// Health check script for news scheduler
// Checks if fetch-news and news-cron are running via Netlify scheduled functions
//
// Usage:
//   NEWS_BASE_URL=https://novaciv.netlify.app NEWS_CRON_SECRET=your_token node scripts/check-health-news.mjs

const NEWS_BASE_URL = process.env.NEWS_BASE_URL || process.env.BASE_URL;
const NEWS_CRON_SECRET =
  process.env.NEWS_CRON_SECRET || process.env.CRON_TOKEN || process.env.NEWS_CRON_TOKEN;

if (!NEWS_BASE_URL) {
  console.error("❌ Error: NEWS_BASE_URL or BASE_URL environment variable is required");
  process.exit(1);
}

if (!NEWS_CRON_SECRET) {
  console.error(
    "❌ Error: NEWS_CRON_SECRET, CRON_TOKEN, or NEWS_CRON_TOKEN environment variable is required",
  );
  process.exit(1);
}

const HEALTH_ENDPOINT = `${NEWS_BASE_URL}/.netlify/functions/health-news?token=${NEWS_CRON_SECRET}`;

async function checkHealth() {
  console.log("🔍 Checking news scheduler health...\n");
  console.log(`Endpoint: ${NEWS_BASE_URL}/.netlify/functions/health-news`);

  try {
    const response = await fetch(HEALTH_ENDPOINT);

    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      const text = await response.text();
      console.error(`Response: ${text}`);
      process.exit(1);
    }

    const data = await response.json();

    if (!data.ok) {
      console.error(`❌ Health check failed: ${data.error || "Unknown error"}`);
      process.exit(1);
    }

    // Print status
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 NEWS SCHEDULER HEALTH STATUS\n");

    // Fetch-news status
    console.log("📥 fetch-news:");
    if (data.fetch.lastRun) {
      console.log(`   Last run: ${data.fetch.lastRun} (${data.fetch.lastRunAgeMinutes} minutes ago)`);
      console.log(`   Scheduler alive: ${data.fetch.schedulerAlive ? "✅ YES" : "❌ NO"}`);
      console.log(`   Processed: ${data.fetch.processed ?? "N/A"}`);
      console.log(`   Sources: ${data.fetch.sourcesOk ?? "N/A"}/${data.fetch.sourcesFailed ?? "N/A"} (OK/failed)`);
      console.log(`   Fetched: ${data.fetch.fetched ?? "N/A"}, Filtered: ${data.fetch.filtered ?? "N/A"}`);
    } else {
      console.log("   ❌ No data (scheduler may not have run yet)");
    }

    // News-cron status
    console.log("\n📤 news-cron:");
    if (data.cron.lastRun) {
      console.log(`   Last run: ${data.cron.lastRun} (${data.cron.lastRunAgeMinutes} minutes ago)`);
      console.log(`   Scheduler alive: ${data.cron.schedulerAlive ? "✅ YES" : "❌ NO"}`);
      console.log(`   Processed: ${data.cron.processed ?? "N/A"}`);
      console.log(`   Total sent: ${data.cron.totalSent ?? "N/A"}`);
      console.log(`   Fetched topics: ${data.cron.fetchedTopics ?? "N/A"}`);
    } else {
      console.log("   ❌ No data (scheduler may not have run yet)");
    }

    // Pipeline status
    console.log("\n🔄 Pipeline:");
    console.log(`   Healthy: ${data.pipeline.healthy ? "✅ YES" : "❌ NO"}`);
    console.log(`   Fetch alive: ${data.pipeline.fetchAlive ? "✅" : "❌"}`);
    console.log(`   Cron alive: ${data.pipeline.cronAlive ? "✅" : "❌"}`);
    console.log(`   Processed recently: ${data.pipeline.fetchProcessedRecently ? "✅" : "❌"}`);
    console.log(`   Sent recently: ${data.pipeline.cronSentRecently ? "✅" : "❌"}`);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Exit code based on scheduler status
    if (!data.fetch.schedulerAlive || !data.cron.schedulerAlive) {
      console.error("❌ Scheduler is not alive");
      process.exit(1);
    }

    if (!data.pipeline.healthy) {
      console.warn("⚠️  Pipeline is not healthy (schedulers are alive but no activity recently)");
      // Don't exit with error for unhealthy pipeline, only for dead scheduler
    }

    console.log("✅ News scheduler is alive and healthy\n");
    process.exit(0);
  } catch (err) {
    console.error(`❌ Error checking health: ${err.message}`);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

checkHealth();
