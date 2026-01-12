// tools/ops-smoke-test.js
//
// Smoke test для операторского пульта NovaCiv
// Проверяет heartbeat статусы всех компонентов
// Использование: node tools/ops-smoke-test.js [--hours=24]

require("dotenv").config();
const { getDb } = require("../server/lib/firebaseAdmin");

// Парсим аргументы командной строки
const args = process.argv.slice(2);
let maxHours = 24; // По умолчанию проверяем последние 24 часа

for (const arg of args) {
  if (arg.startsWith("--hours=")) {
    maxHours = parseInt(arg.split("=")[1], 10) || 24;
  }
}

const MAX_AGE_MS = maxHours * 60 * 60 * 1000;

async function smokeTest() {
  console.log(`[ops-smoke-test] Checking heartbeat statuses (max age: ${maxHours} hours)...`);

  try {
    const db = getDb();
    const heartbeatRef = db.ref("ops/heartbeat");
    const snapshot = await heartbeatRef.once("value");
    const heartbeats = snapshot.val() || {};

    if (Object.keys(heartbeats).length === 0) {
      console.log("[ops-smoke-test] FAIL: No heartbeat data found in /ops/heartbeat");
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
      const age = now - lastRunAt;
      const ageHours = Math.floor(age / (60 * 60 * 1000));

      if (age > MAX_AGE_MS) {
        issues.push(`${component}: last run ${ageHours} hours ago (max: ${maxHours}h)`);
        allOk = false;
        continue;
      }

      // Проверяем наличие ошибок
      if (status.lastErrorAt && status.lastErrorAt > status.lastOkAt) {
        const errorAge = now - status.lastErrorAt;
        const errorAgeHours = Math.floor(errorAge / (60 * 60 * 1000));
        
        if (errorAge < MAX_AGE_MS) {
          issues.push(`${component}: last error ${errorAgeHours}h ago - ${status.lastErrorMsg || "unknown error"}`);
          allOk = false;
        }
      }

      // Выводим статус компонента
      const statusStr = status.lastErrorAt && status.lastErrorAt > status.lastOkAt ? "ERROR" : "OK";
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
    }

    // Проверяем события
    console.log("\n[ops-smoke-test] Recent events:");
    const eventsRef = db.ref("ops/events");
    const eventsSnapshot = await eventsRef.once("value");
    const events = eventsSnapshot.val() || {};
    
    const eventKeys = Object.keys(events).sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 5);
    for (const key of eventKeys) {
      const event = events[key];
      if (event) {
        const age = Math.floor((now - event.ts) / (60 * 1000));
        console.log(`  [${event.level}] ${event.component}: ${event.message} (${age}m ago)`);
      }
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
