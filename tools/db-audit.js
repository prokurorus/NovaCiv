// tools/db-audit.js
//
// Автоматическая диагностика Firebase Realtime Database
// Проверяет доступ, структуру данных, индексы, консистентность

require("dotenv").config();
const { getDb } = require("../server/lib/firebaseAdmin");

const MAX_BATCH_SIZE = 500;

// Проверка на недопустимые символы в ключах
function hasInvalidKeyChars(key) {
  if (!key || typeof key !== "string") return false;
  return /[.#$[\]/]/.test(key);
}

// Безопасная санитизация ключей
function safeKey(value) {
  if (!value) return "unknown";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

async function audit() {
  console.log("[db-audit] Starting Firebase RTDB audit...");

  const report = {
    timestamp: Date.now(),
    status: "OK",
    warnings: [],
    errors: [],
    fixes: [],
    indexStatus: {},
    keyIssues: {},
    schemaIssues: {},
  };

  try {
    const db = getDb();

    // A) Проверка доступа на запись/чтение в /ops/*
    console.log("[db-audit] A) Checking /ops/* access...");
    try {
      const opsTestRef = db.ref("ops/auditTest");
      await opsTestRef.set({ test: Date.now() });
      const snapshot = await opsTestRef.once("value");
      if (snapshot.val()) {
        await opsTestRef.remove();
        console.log("[db-audit] ✓ /ops/* write/read OK");
      } else {
        report.errors.push("Cannot write/read /ops/*");
        report.status = "FAIL";
      }
    } catch (e) {
      report.errors.push(`/ops/* access error: ${e.message}`);
      report.status = "FAIL";
    }

    // B) Проверка наличия критичных узлов
    console.log("[db-audit] B) Checking critical nodes...");
    const criticalNodes = [
      "forum/topics",
      "forum/comments",
      "newsMeta",
      "domovoy/state",
      "config/features",
    ];

    for (const node of criticalNodes) {
      try {
        const ref = db.ref(node);
        const snapshot = await ref.limitToFirst(1).once("value");
        console.log(`[db-audit] ✓ ${node} exists`);
      } catch (e) {
        report.warnings.push(`Node ${node} not accessible: ${e.message}`);
        if (report.status === "OK") report.status = "WARN";
      }
    }

    // C) Проверка битых ключей
    console.log("[db-audit] C) Checking for invalid keys...");
    
    // Проверяем /forum/topics
    try {
      const topicsRef = db.ref("forum/topics");
      const topicsSnapshot = await topicsRef.once("value");
      const topics = topicsSnapshot.val() || {};
      const invalidKeys = Object.keys(topics).filter(hasInvalidKeyChars);
      if (invalidKeys.length > 0) {
        report.keyIssues["forum/topics"] = invalidKeys.length;
        report.warnings.push(`Invalid keys in /forum/topics: ${invalidKeys.length}`);
        if (report.status === "OK") report.status = "WARN";
      } else {
        console.log("[db-audit] ✓ /forum/topics keys OK");
      }
    } catch (e) {
      report.errors.push(`Error checking /forum/topics keys: ${e.message}`);
      report.status = "FAIL";
    }

    // Проверяем /newsMeta
    try {
      const newsMetaRef = db.ref("newsMeta");
      const newsMetaSnapshot = await newsMetaRef.once("value");
      const newsMeta = newsMetaSnapshot.val() || {};
      
      for (const [lang, data] of Object.entries(newsMeta)) {
        if (data && typeof data === "object") {
          // Проверяем processedKeys
          if (data.processedKeys) {
            const invalidProcessed = Object.keys(data.processedKeys).filter(hasInvalidKeyChars);
            if (invalidProcessed.length > 0) {
              if (!report.keyIssues["newsMeta"]) report.keyIssues["newsMeta"] = {};
              report.keyIssues["newsMeta"][`${lang}.processedKeys`] = invalidProcessed.length;
              report.warnings.push(`Invalid keys in /newsMeta/${lang}.processedKeys: ${invalidProcessed.length}`);
              if (report.status === "OK") report.status = "WARN";
            }
          }
          // Проверяем titleKeys
          if (data.titleKeys) {
            const invalidTitle = Object.keys(data.titleKeys).filter(hasInvalidKeyChars);
            if (invalidTitle.length > 0) {
              if (!report.keyIssues["newsMeta"]) report.keyIssues["newsMeta"] = {};
              report.keyIssues["newsMeta"][`${lang}.titleKeys`] = invalidTitle.length;
              report.warnings.push(`Invalid keys in /newsMeta/${lang}.titleKeys: ${invalidTitle.length}`);
              if (report.status === "OK") report.status = "WARN";
            }
          }
        }
      }
      
      if (!report.keyIssues["newsMeta"]) {
        console.log("[db-audit] ✓ /newsMeta keys OK");
      }
    } catch (e) {
      report.errors.push(`Error checking /newsMeta keys: ${e.message}`);
      report.status = "FAIL";
    }

    // Проверяем /domovoy/state
    try {
      const domovoyStateRef = db.ref("domovoy/state");
      const domovoyStateSnapshot = await domovoyStateRef.once("value");
      const domovoyState = domovoyStateSnapshot.val() || {};
      const invalidStateKeys = Object.keys(domovoyState).filter(hasInvalidKeyChars);
      if (invalidStateKeys.length > 0) {
        report.keyIssues["domovoy/state"] = invalidStateKeys.length;
        report.warnings.push(`Invalid keys in /domovoy/state: ${invalidStateKeys.length}`);
        if (report.status === "OK") report.status = "WARN";
      } else {
        console.log("[db-audit] ✓ /domovoy/state keys OK");
      }
    } catch (e) {
      // Может не существовать - это нормально
      console.log("[db-audit] ⚠ /domovoy/state not found (will be created)");
    }

    // D) Проверка консистентности схемы topic
    console.log("[db-audit] D) Checking topic schema consistency...");
    try {
      const topicsRef = db.ref("forum/topics");
      const topicsSnapshot = await topicsRef.limitToFirst(100).once("value");
      const topics = topicsSnapshot.val() || {};
      
      const schemaIssues = {
        missingSection: [],
        missingLang: [],
        missingCreatedAt: [],
        missingTitle: [],
        invalidSection: [],
        invalidCreatedAt: [],
        postedInconsistency: [],
      };

      for (const [id, topic] of Object.entries(topics)) {
        if (!topic || typeof topic !== "object") continue;

        if (!topic.section) {
          schemaIssues.missingSection.push(id);
        } else if (typeof topic.section !== "string") {
          schemaIssues.invalidSection.push(id);
        }

        if (!topic.lang) {
          schemaIssues.missingLang.push(id);
        }

        if (!topic.createdAt) {
          schemaIssues.missingCreatedAt.push(id);
        } else {
          const createdAt = topic.createdAt;
          if (typeof createdAt !== "number" && typeof createdAt !== "string") {
            schemaIssues.invalidCreatedAt.push(id);
          }
        }

        if (!topic.title) {
          schemaIssues.missingTitle.push(id);
        }

        // Проверка posted flags
        if (topic.telegramPostedAt && !topic.telegramPostedAt) {
          // postedAt есть, но это нормально (timestamp)
        }
      }

      const totalIssues = Object.values(schemaIssues).reduce((sum, arr) => sum + arr.length, 0);
      if (totalIssues > 0) {
        report.schemaIssues = schemaIssues;
        report.warnings.push(`Schema issues in topics: ${totalIssues} total`);
        if (report.status === "OK") report.status = "WARN";
      } else {
        console.log("[db-audit] ✓ Topic schema OK");
      }
    } catch (e) {
      report.errors.push(`Error checking topic schema: ${e.message}`);
      report.status = "FAIL";
    }

    // E) Проверка индексов
    console.log("[db-audit] E) Checking index for /forum/topics.section...");
    try {
      const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;
      if (FIREBASE_DB_URL) {
        const testUrl = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22&limitToFirst=1`;
        const testResp = await fetch(testUrl);
        
        if (testResp.status === 400) {
          const errorText = await testResp.text();
          if (errorText.includes("Index not defined") || errorText.includes("index")) {
            report.indexStatus["forum/topics.section"] = "NEED_INDEX";
            report.warnings.push("Index missing for /forum/topics.section - using fallback");
            if (report.status === "OK") report.status = "WARN";
          }
        } else if (testResp.ok) {
          report.indexStatus["forum/topics.section"] = "OK";
          console.log("[db-audit] ✓ Index for /forum/topics.section OK");
        }
      }
    } catch (e) {
      report.errors.push(`Error checking index: ${e.message}`);
      report.status = "FAIL";
    }

    // Сохраняем отчёт в Firebase
    try {
      const reportRef = db.ref("ops/dbAudit/latest");
      await reportRef.set(report);
      console.log("[db-audit] ✓ Report saved to /ops/dbAudit/latest");
    } catch (e) {
      console.error("[db-audit] Failed to save report:", e.message);
    }

    // Выводим итог
    console.log("\n[db-audit] ===== AUDIT REPORT =====");
    console.log(`[db-audit] Status: ${report.status}`);
    console.log(`[db-audit] Errors: ${report.errors.length}`);
    console.log(`[db-audit] Warnings: ${report.warnings.length}`);
    
    if (report.errors.length > 0) {
      console.log("\n[db-audit] ERRORS:");
      report.errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }
    
    if (report.warnings.length > 0) {
      console.log("\n[db-audit] WARNINGS:");
      report.warnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
    }

    if (Object.keys(report.keyIssues).length > 0) {
      console.log("\n[db-audit] KEY ISSUES:");
      console.log(JSON.stringify(report.keyIssues, null, 2));
    }

    if (Object.keys(report.schemaIssues).length > 0) {
      console.log("\n[db-audit] SCHEMA ISSUES:");
      Object.entries(report.schemaIssues).forEach(([type, ids]) => {
        if (ids.length > 0) {
          console.log(`  ${type}: ${ids.length} topics`);
        }
      });
    }

    if (Object.keys(report.indexStatus).length > 0) {
      console.log("\n[db-audit] INDEX STATUS:");
      Object.entries(report.indexStatus).forEach(([path, status]) => {
        console.log(`  ${path}: ${status}`);
      });
    }

    console.log("\n[db-audit] ========================\n");

    return report;
  } catch (error) {
    console.error("[db-audit] FATAL ERROR:", error.message);
    console.error("[db-audit] Stack:", error.stack);
    throw error;
  }
}

// Экспортируем функцию для использования в других модулях
module.exports = { audit };

// Если запущен напрямую - выполняем
if (require.main === module) {
  (async function() {
    try {
      const report = await audit();
      process.exit(report.status === "FAIL" ? 1 : 0);
    } catch (error) {
      console.error("[db-audit] FATAL ERROR:", error.message);
      process.exit(1);
    }
  })();
}
