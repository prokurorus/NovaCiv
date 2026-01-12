// tools/ops-smoke-test-simple.js
//
// Упрощённый smoke test через HTTP (без Admin SDK)
// Использует только FIREBASE_DB_URL для чтения /ops/heartbeat

require("dotenv").config();

// Парсим аргументы командной строки
const args = process.argv.slice(2);
let maxHours = 24;
for (const arg of args) {
  if (arg.startsWith("--hours=")) {
    maxHours = parseInt(arg.split("=")[1], 10) || 24;
  }
}

const MAX_AGE_MS = maxHours * 60 * 60 * 1000;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;

async function smokeTest() {
  if (!FIREBASE_DB_URL) {
    console.error("[ops-smoke-test] ERROR: FIREBASE_DB_URL is not set");
    console.error("[ops-smoke-test] Set FIREBASE_DB_URL=https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app");
    process.exit(1);
  }

  console.log(`[ops-smoke-test] Checking heartbeat statuses (max age: ${maxHours} hours)...`);
  console.log(`[ops-smoke-test] Database: ${FIREBASE_DB_URL}`);

  try {
    // Читаем heartbeat
    const heartbeatUrl = `${FIREBASE_DB_URL}/ops/heartbeat.json`;
    const heartbeatResp = await fetch(heartbeatUrl);
    
    if (!heartbeatResp.ok) {
      console.error(`[ops-smoke-test] FAIL: Cannot read heartbeat (HTTP ${heartbeatResp.status})`);
      process.exit(1);
    }

    const heartbeats = await heartbeatResp.json() || {};

    if (Object.keys(heartbeats).length === 0) {
      console.log("[ops-smoke-test] WARNING: No heartbeat data found in /ops/heartbeat");
      console.log("[ops-smoke-test] This might mean functions haven't run yet or ops-pulse is not integrated");
      console.log("[ops-smoke-test] SUGGESTION: Call ops-run-now to force pipeline execution:");
      console.log("[ops-smoke-test]   https://novaciv.space/.netlify/functions/ops-run-now?token=<OPS_CRON_SECRET>");
      process.exit(1);
    }

    const now = Date.now();
    let allOk = true;
    const issues = [];

    // Проверяем каждый компонент
    for (const [component, status] of Object.entries(heartbeats)) {
      if (!status || typeof status !== "object") {
        issues.push(`${component}: invalid status object`);
        allOk = false;
        continue;
      }

      const lastRunAt = status.lastRunAt || 0;
      
      // Если компонент никогда не запускался
      if (lastRunAt === 0) {
        issues.push(`${component}: has not run yet`);
        console.log(`[ops-smoke-test] ${component}: NOT RUN YET`);
        console.log(`  └─ SUGGESTION: Call ops-run-now to force execution`);
        allOk = false;
        continue;
      }
      
      const age = now - lastRunAt;
      const ageHours = Math.floor(age / (60 * 60 * 1000));

      if (age > MAX_AGE_MS) {
        issues.push(`${component}: last run ${ageHours} hours ago (max: ${maxHours}h)`);
        console.log(`[ops-smoke-test] ${component}: STALE (last run: ${ageHours}h ago)`);
        console.log(`  └─ SUGGESTION: Call ops-run-now to force execution`);
        allOk = false;
        continue;
      }

      // Проверяем наличие ошибок
      if (status.lastErrorAt && status.lastErrorAt > (status.lastOkAt || 0)) {
        const errorAge = now - status.lastErrorAt;
        const errorAgeHours = Math.floor(errorAge / (60 * 60 * 1000));
        
        if (errorAge < MAX_AGE_MS) {
          issues.push(`${component}: last error ${errorAgeHours}h ago - ${status.lastErrorMsg || "unknown error"}`);
          allOk = false;
        }
      }

      // Выводим статус компонента
      const statusStr = status.lastErrorAt && status.lastErrorAt > (status.lastOkAt || 0) ? "ERROR" : "OK";
      const metrics = status.metrics || {};
      console.log(`[ops-smoke-test] ${component}: ${statusStr} (last run: ${ageHours}h ago)`);
      
      if (metrics.createdTopicsCount !== undefined) {
        console.log(`  └─ createdTopicsCount: ${metrics.createdTopicsCount}`);
      }
      if (metrics.sentToTelegramCount !== undefined) {
        console.log(`  └─ sentToTelegramCount: ${metrics.sentToTelegramCount}`);
      }
      if (metrics.fetchedTopicsCount !== undefined) {
        console.log(`  └─ fetchedTopicsCount: ${metrics.fetchedTopicsCount}`);
      }
      if (metrics.createdPostsCount !== undefined) {
        console.log(`  └─ createdPostsCount: ${metrics.createdPostsCount}`);
      }
      if (metrics.repliedCount !== undefined) {
        console.log(`  └─ repliedCount: ${metrics.repliedCount}`);
      }
    }

    // Проверяем события
    console.log("\n[ops-smoke-test] Recent events:");
    const eventsUrl = `${FIREBASE_DB_URL}/ops/events.json`;
    const eventsResp = await fetch(eventsUrl);
    
    if (eventsResp.ok) {
      const events = await eventsResp.json() || {};
      const eventKeys = Object.keys(events).sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 5);
      
      if (eventKeys.length === 0) {
        console.log("  (no events)");
      } else {
        for (const key of eventKeys) {
          const event = events[key];
          if (event) {
            const age = Math.floor((now - event.ts) / (60 * 1000));
            console.log(`  [${event.level}] ${event.component}: ${event.message} (${age}m ago)`);
          }
        }
      }
    } else {
      console.log("  (cannot read events)");
    }

    // Итог
    if (allOk) {
      console.log("\n[ops-smoke-test] OK - All components are healthy");
      process.exit(0);
    } else {
      console.log("\n[ops-smoke-test] FAIL - Issues found:");
      for (const issue of issues) {
        console.log(`  - ${issue}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error("[ops-smoke-test] ERROR:", error.message);
    console.error("[ops-smoke-test] Stack:", error.stack);
    process.exit(1);
  }
}

smokeTest();
