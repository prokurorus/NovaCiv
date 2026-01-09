// server/config/firebase-config.js
//
// Централизованная инициализация Firebase Admin SDK
// Используется всеми серверными модулями

const admin = require("firebase-admin");

let firebaseInitialized = false;
let dbInstance = null;

/**
 * Инициализирует Firebase Admin SDK
 * @param {Object} logger - Логгер (по умолчанию console)
 * @returns {admin.database.Database} Экземпляр базы данных
 */
function initFirebase(logger = console) {
  if (firebaseInitialized && dbInstance) {
    return dbInstance;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);

    const dbUrl =
      process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;

    if (!dbUrl) {
      throw new Error("FIREBASE_DB_URL / FIREBASE_DATABASE_URL is not set");
    }

    // Инициализируем только если еще не инициализировано (safe singleton)
    if (!firebaseInitialized) {
      // Check if Firebase app already exists (prevents duplicate init errors)
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: dbUrl,
        });
        logger.log("[firebase-config] Firebase initialized with", dbUrl);
      } else {
        logger.log("[firebase-config] Firebase app already exists, reusing");
      }
      firebaseInitialized = true;
    }

    dbInstance = admin.database();
    return dbInstance;
  } catch (e) {
    logger.error("[firebase-config] Firebase init error", e);
    throw e;
  }
}

/**
 * Получает экземпляр базы данных (инициализирует если нужно)
 * @param {Object} logger - Логгер
 * @returns {admin.database.Database} Экземпляр базы данных
 */
function getDatabase(logger = console) {
  if (!dbInstance) {
    return initFirebase(logger);
  }
  return dbInstance;
}

module.exports = {
  initFirebase,
  getDatabase,
};

