// tools/db-audit-fix.js
//
// Автоматическое исправление проблем Firebase RTDB
// Исправляет то, что безопасно исправлять автоматом

require("dotenv").config();
const { getDb } = require("../server/lib/firebaseAdmin");

const MAX_BATCH_SIZE = 200;

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

// Проверка на недопустимые символы
function hasInvalidKeyChars(key) {
  if (!key || typeof key !== "string") return false;
  return /[.#$[\]/]/.test(key);
}

async function fix() {
  console.log("[db-audit-fix] Starting automatic fixes...");

  const fixes = {
    keysMigrated: 0,
    topicsNormalized: 0,
    newsMetaCleaned: 0,
    errors: [],
  };

  try {
    const db = getDb();

    // 2.1 Миграция ключей в /forum/topics
    console.log("[db-audit-fix] 2.1) Migrating invalid keys in /forum/topics...");
    try {
      const topicsRef = db.ref("forum/topics");
      const topicsSnapshot = await topicsRef.once("value");
      const topics = topicsSnapshot.val() || {};
      
      const invalidKeys = Object.keys(topics).filter(hasInvalidKeyChars);
      if (invalidKeys.length > 0) {
        console.log(`[db-audit-fix] Found ${invalidKeys.length} invalid keys, migrating...`);
        
        const migrationRef = db.ref(`ops/migrations/keys/${Date.now()}`);
        const migration = {
          timestamp: Date.now(),
          path: "forum/topics",
          mappings: {},
        };

        // Мигрируем батчами
        for (let i = 0; i < invalidKeys.length; i += MAX_BATCH_SIZE) {
          const batch = invalidKeys.slice(i, i + MAX_BATCH_SIZE);
          const updates = {};
          
          for (const oldKey of batch) {
            const newKey = safeKey(oldKey);
            if (newKey !== oldKey && !topics[newKey]) {
              // Копируем данные
              updates[`forum/topics/${newKey}`] = topics[oldKey];
              updates[`forum/topics/${oldKey}`] = null; // Удаляем старый
              migration.mappings[oldKey] = newKey;
              fixes.keysMigrated++;
            }
          }
          
          if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
            console.log(`[db-audit-fix] Migrated batch ${i + 1}-${Math.min(i + MAX_BATCH_SIZE, invalidKeys.length)}`);
          }
        }

        // Сохраняем mapping
        await migrationRef.set(migration);
        console.log(`[db-audit-fix] ✓ Migrated ${fixes.keysMigrated} keys`);
      } else {
        console.log("[db-audit-fix] ✓ No invalid keys in /forum/topics");
      }
    } catch (e) {
      fixes.errors.push(`Key migration error: ${e.message}`);
      console.error("[db-audit-fix] Key migration failed:", e.message);
    }

    // 2.2 Нормализация схемы topic
    console.log("[db-audit-fix] 2.2) Normalizing topic schema...");
    try {
      const topicsRef = db.ref("forum/topics");
      const topicsSnapshot = await topicsRef.limitToFirst(1000).once("value");
      const topics = topicsSnapshot.val() || {};
      
      const updates = {};
      let normalized = 0;

      for (const [id, topic] of Object.entries(topics)) {
        if (!topic || typeof topic !== "object") continue;
        
        let needsUpdate = false;
        const topicPath = `forum/topics/${id}`;

        // section
        if (!topic.section) {
          // Пытаемся вывести из контекста
          let inferredSection = "misc";
          if (topic.sourceId && topic.sourceId.includes("news")) {
            inferredSection = "news";
          } else if (topic.postKind && topic.postKind.includes("domovoy")) {
            inferredSection = "news"; // Домовой тоже в news
          }
          updates[`${topicPath}/section`] = inferredSection;
          needsUpdate = true;
        } else if (typeof topic.section !== "string") {
          updates[`${topicPath}/section`] = String(topic.section);
          needsUpdate = true;
        }

        // lang
        if (!topic.lang) {
          updates[`${topicPath}/lang`] = "ru"; // По умолчанию
          needsUpdate = true;
        }

        // createdAt
        if (!topic.createdAt) {
          updates[`${topicPath}/createdAt`] = Date.now();
          updates[`${topicPath}/migrated`] = true;
          needsUpdate = true;
        } else if (typeof topic.createdAt !== "number" && typeof topic.createdAt !== "string") {
          // Пытаемся преобразовать
          const parsed = new Date(topic.createdAt).getTime();
          if (!isNaN(parsed)) {
            updates[`${topicPath}/createdAt`] = parsed;
            needsUpdate = true;
          }
        }

        // posted flags
        if (topic.telegramPostedAt && typeof topic.telegramPostedAt === "number") {
          // Это нормально - timestamp
        }

        if (needsUpdate) {
          normalized++;
        }
      }

      if (normalized > 0) {
        // Применяем обновления батчами
        const updateKeys = Object.keys(updates);
        for (let i = 0; i < updateKeys.length; i += MAX_BATCH_SIZE) {
          const batchUpdates = {};
          const batch = updateKeys.slice(i, i + MAX_BATCH_SIZE);
          for (const key of batch) {
            batchUpdates[key] = updates[key];
          }
          await db.ref().update(batchUpdates);
        }
        fixes.topicsNormalized = normalized;
        console.log(`[db-audit-fix] ✓ Normalized ${normalized} topics`);
      } else {
        console.log("[db-audit-fix] ✓ Topics schema OK");
      }
    } catch (e) {
      fixes.errors.push(`Schema normalization error: ${e.message}`);
      console.error("[db-audit-fix] Schema normalization failed:", e.message);
    }

    // 2.3 Очистка newsMeta
    console.log("[db-audit-fix] 2.3) Cleaning /newsMeta...");
    try {
      const newsMetaRef = db.ref("newsMeta");
      const newsMetaSnapshot = await newsMetaRef.once("value");
      const newsMeta = newsMetaSnapshot.val() || {};
      
      const MAX_KEYS = 2000; // Лимит на количество ключей
      const updates = {};

      for (const [lang, data] of Object.entries(newsMeta)) {
        if (data && typeof data === "object") {
          const langPath = `newsMeta/${lang}`;
          
          // Очистка processedKeys
          if (data.processedKeys) {
            const processedKeys = data.processedKeys;
            const keys = Object.keys(processedKeys);
            
            // Санитизация ключей
            const sanitized = {};
            let sanitizedCount = 0;
            for (const [key, value] of Object.entries(processedKeys)) {
              const safe = hasInvalidKeyChars(key) ? safeKey(key) : key;
              if (safe !== key) sanitizedCount++;
              sanitized[safe] = value;
            }
            
            // Лимит размера: оставляем последние MAX_KEYS
            const sortedKeys = Object.keys(sanitized).sort((a, b) => {
              const timeA = sanitized[a]?.processedAt || sanitized[a]?.reservedAt || 0;
              const timeB = sanitized[b]?.processedAt || sanitized[b]?.reservedAt || 0;
              return timeB - timeA;
            });
            
            if (sortedKeys.length > MAX_KEYS) {
              const toKeep = sortedKeys.slice(0, MAX_KEYS);
              const cleaned = {};
              for (const key of toKeep) {
                cleaned[key] = sanitized[key];
              }
              updates[`${langPath}/processedKeys`] = cleaned;
              fixes.newsMetaCleaned += sortedKeys.length - MAX_KEYS;
            } else if (sanitizedCount > 0) {
              updates[`${langPath}/processedKeys`] = sanitized;
            }
          }
          
          // Аналогично для titleKeys
          if (data.titleKeys) {
            const titleKeys = data.titleKeys;
            const keys = Object.keys(titleKeys);
            
            const sanitized = {};
            let sanitizedCount = 0;
            for (const [key, value] of Object.entries(titleKeys)) {
              const safe = hasInvalidKeyChars(key) ? safeKey(key) : key;
              if (safe !== key) sanitizedCount++;
              sanitized[safe] = value;
            }
            
            const sortedKeys = Object.keys(sanitized).sort((a, b) => {
              const timeA = sanitized[a]?.processedAt || sanitized[a]?.reservedAt || 0;
              const timeB = sanitized[b]?.processedAt || sanitized[b]?.reservedAt || 0;
              return timeB - timeA;
            });
            
            if (sortedKeys.length > MAX_KEYS) {
              const toKeep = sortedKeys.slice(0, MAX_KEYS);
              const cleaned = {};
              for (const key of toKeep) {
                cleaned[key] = sanitized[key];
              }
              updates[`${langPath}/titleKeys`] = cleaned;
              fixes.newsMetaCleaned += sortedKeys.length - MAX_KEYS;
            } else if (sanitizedCount > 0) {
              updates[`${langPath}/titleKeys`] = sanitized;
            }
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        // Применяем обновления батчами
        const updateKeys = Object.keys(updates);
        for (let i = 0; i < updateKeys.length; i += MAX_BATCH_SIZE) {
          const batchUpdates = {};
          const batch = updateKeys.slice(i, i + MAX_BATCH_SIZE);
          for (const key of batch) {
            batchUpdates[key] = updates[key];
          }
          await db.ref().update(batchUpdates);
        }
        console.log(`[db-audit-fix] ✓ Cleaned /newsMeta (removed ${fixes.newsMetaCleaned} old keys)`);
      } else {
        console.log("[db-audit-fix] ✓ /newsMeta OK");
      }
    } catch (e) {
      fixes.errors.push(`newsMeta cleanup error: ${e.message}`);
      console.error("[db-audit-fix] newsMeta cleanup failed:", e.message);
    }

    // 2.5 Проверка /ops/events
    console.log("[db-audit-fix] 2.5) Checking /ops/events buffer...");
    try {
      const eventsRef = db.ref("ops/events");
      const eventsSnapshot = await eventsRef.once("value");
      const events = eventsSnapshot.val() || {};
      const eventKeys = Object.keys(events);
      
      if (eventKeys.length > 20) {
        // Удаляем старые события
        const sortedKeys = eventKeys.sort((a, b) => parseInt(a) - parseInt(b));
        const toRemove = sortedKeys.slice(0, sortedKeys.length - 20);
        const updates = {};
        for (const key of toRemove) {
          updates[`ops/events/${key}`] = null;
        }
        await db.ref().update(updates);
        console.log(`[db-audit-fix] ✓ Cleaned ${toRemove.length} old events`);
      } else {
        console.log("[db-audit-fix] ✓ /ops/events buffer OK");
      }
    } catch (e) {
      fixes.errors.push(`Events cleanup error: ${e.message}`);
      console.error("[db-audit-fix] Events cleanup failed:", e.message);
    }

    // Сохраняем отчёт о фиксах
    try {
      const fixesRef = db.ref(`ops/dbAudit/fixes/${Date.now()}`);
      await fixesRef.set({
        timestamp: Date.now(),
        fixes,
      });
    } catch (e) {
      console.error("[db-audit-fix] Failed to save fixes report:", e.message);
    }

    // Итог
    console.log("\n[db-audit-fix] ===== FIXES REPORT =====");
    console.log(`[db-audit-fix] Keys migrated: ${fixes.keysMigrated}`);
    console.log(`[db-audit-fix] Topics normalized: ${fixes.topicsNormalized}`);
    console.log(`[db-audit-fix] newsMeta keys cleaned: ${fixes.newsMetaCleaned}`);
    if (fixes.errors.length > 0) {
      console.log(`[db-audit-fix] Errors: ${fixes.errors.length}`);
      fixes.errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }
    console.log("[db-audit-fix] ========================\n");

    return fixes;
  } catch (error) {
    console.error("[db-audit-fix] FATAL ERROR:", error.message);
    console.error("[db-audit-fix] Stack:", error.stack);
    throw error;
  }
}

// Экспортируем функцию для использования в других модулях
module.exports = { fix };

// Если запущен напрямую - выполняем
if (require.main === module) {
  fix()
    .then(async (fixes) => {
      // Повторный audit
      console.log("[db-audit-fix] Running post-fix audit...");
      const { audit } = require("./db-audit");
      try {
        await audit();
      } catch (error) {
        console.error("[db-audit-fix] Post-fix audit error:", error.message);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error("[db-audit-fix] FATAL ERROR:", error.message);
      process.exit(1);
    });
}
