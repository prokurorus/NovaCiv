// tools/content-smoke-test.js
//
// Автоматическая проверка контента: вызывает ops-run-now и проверяет результаты

require("dotenv").config();

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;
const OPS_CRON_SECRET = process.env.OPS_CRON_SECRET;

async function smokeTest() {
  console.log("[content-smoke-test] Starting content smoke test...");

  if (!FIREBASE_DB_URL) {
    console.error("[content-smoke-test] ERROR: FIREBASE_DB_URL is not set");
    process.exit(1);
  }

  try {
    // 1) Вызываем ops-run-now?maintenance=1 (если есть OPS_CRON_SECRET)
    if (OPS_CRON_SECRET) {
      console.log("[content-smoke-test] Step 1: Running maintenance mode...");
      try {
        const maintenanceUrl = `https://novaciv.space/.netlify/functions/ops-run-now?token=${OPS_CRON_SECRET}&maintenance=1`;
        const maintenanceResp = await fetch(maintenanceUrl);
        const maintenanceData = await maintenanceResp.json();
        
        if (maintenanceResp.ok && maintenanceData.ok) {
          console.log("[content-smoke-test] ✓ Maintenance completed");
        } else {
          console.log("[content-smoke-test] ⚠ Maintenance had issues:", maintenanceData.error || "unknown");
        }
      } catch (e) {
        console.log("[content-smoke-test] ⚠ Maintenance failed:", e.message);
      }
    } else {
      console.log("[content-smoke-test] ⚠ OPS_CRON_SECRET not set, skipping maintenance");
    }

    // Небольшая задержка
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 2) Вызываем обычный ops-run-now
    if (OPS_CRON_SECRET) {
      console.log("[content-smoke-test] Step 2: Running ops-run-now...");
      try {
        const runNowUrl = `https://novaciv.space/.netlify/functions/ops-run-now?token=${OPS_CRON_SECRET}`;
        const runNowResp = await fetch(runNowUrl);
        const runNowData = await runNowResp.json();
        
        if (runNowResp.ok && runNowData.ok) {
          console.log("[content-smoke-test] ✓ ops-run-now completed");
        } else {
          console.log("[content-smoke-test] ⚠ ops-run-now had issues:", runNowData.error || "unknown");
        }
      } catch (e) {
        console.log("[content-smoke-test] ⚠ ops-run-now failed:", e.message);
      }
    }

    // Небольшая задержка
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 3) Проверяем heartbeat и события
    console.log("[content-smoke-test] Step 3: Checking heartbeat and events...");
    
    const heartbeatUrl = `${FIREBASE_DB_URL}/ops/heartbeat.json`;
    const heartbeatResp = await fetch(heartbeatUrl);
    const heartbeats = await heartbeatResp.json() || {};
    
    const eventsUrl = `${FIREBASE_DB_URL}/ops/events.json?orderBy="$key"&limitToLast=10`;
    const eventsResp = await fetch(eventsUrl);
    const events = await eventsResp.json() || {};
    
    // Проверяем news-cron
    const newsCronHeartbeat = heartbeats["news-cron"];
    if (!newsCronHeartbeat || !newsCronHeartbeat.lastRunAt) {
      console.log("[content-smoke-test] FAIL: news-cron heartbeat missing or not updated");
      process.exit(1);
    }
    
    const newsCronAge = Date.now() - (newsCronHeartbeat.lastRunAt || 0);
    if (newsCronAge > 2 * 60 * 60 * 1000) {
      console.log(`[content-smoke-test] WARN: news-cron last run was ${Math.floor(newsCronAge / 60000)} minutes ago`);
    } else {
      console.log("[content-smoke-test] ✓ news-cron heartbeat updated");
    }
    
    // Проверяем события за последний час
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const eventList = Object.values(events).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    
    // Проверяем fetch-news: prepared news for {lang}
    const preparedEvents = eventList.filter(
      (e) => e.component === "fetch-news" && 
             e.message && 
             e.message.includes("prepared news for") &&
             (e.ts || 0) > oneHourAgo
    );
    
    const preparedRu = preparedEvents.some(e => e.message.includes("prepared news for ru"));
    const preparedEn = preparedEvents.some(e => e.message.includes("prepared news for en"));
    const preparedDe = preparedEvents.some(e => e.message.includes("prepared news for de"));
    
    if (preparedRu && preparedEn && preparedDe) {
      console.log("[content-smoke-test] ✓ All languages prepared in last hour");
    } else {
      console.log(`[content-smoke-test] FAIL: Missing prepared events - ru:${preparedRu} en:${preparedEn} de:${preparedDe}`);
      process.exit(1);
    }
    
    // Проверяем news-cron: news sent
    const recentNewsEvents = eventList.filter(
      (e) => e.component === "news-cron" && 
             e.message && 
             e.message.includes("news sent:") &&
             (e.ts || 0) > oneHourAgo
    );
    
    if (recentNewsEvents.length > 0) {
      console.log(`[content-smoke-test] ✓ Found ${recentNewsEvents.length} recent news sent events`);
      const latest = recentNewsEvents[0];
      console.log(`[content-smoke-test]   Latest: ${latest.message} (${Math.floor((Date.now() - latest.ts) / 1000)}s ago)`);
    } else {
      console.log("[content-smoke-test] ⚠ No recent 'news sent' events found (may be normal if just prepared)");
    }
    
    // Проверяем domovoy-every-3h
    const domovoyHeartbeat = heartbeats["domovoy-every-3h"];
    if (!domovoyHeartbeat || !domovoyHeartbeat.lastRunAt) {
      console.log("[content-smoke-test] WARN: domovoy-every-3h heartbeat missing");
    } else {
      const domovoyAge = Date.now() - (domovoyHeartbeat.lastRunAt || 0);
      if (domovoyAge > 4 * 60 * 60 * 1000) {
        console.log(`[content-smoke-test] WARN: domovoy-every-3h last run was ${Math.floor(domovoyAge / 60000)} minutes ago`);
      } else {
        console.log("[content-smoke-test] ✓ domovoy-every-3h heartbeat exists");
      }
    }
    
    const recentDomovoyEvents = eventList.filter(
      (e) => e.component === "domovoy-every-3h" && e.message && e.message.includes("post sent:")
    );
    
    if (recentDomovoyEvents.length > 0) {
      console.log(`[content-smoke-test] ✓ Found ${recentDomovoyEvents.length} recent domovoy post events`);
    }

    console.log("\n[content-smoke-test] ===== SUMMARY =====");
    console.log("[content-smoke-test] Status: OK");
    console.log("[content-smoke-test] ====================\n");
    
    process.exit(0);
  } catch (error) {
    console.error("[content-smoke-test] FATAL ERROR:", error.message);
    console.error("[content-smoke-test] Stack:", error.stack);
    process.exit(1);
  }
}

smokeTest();
