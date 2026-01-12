// server/lib/firebaseAdmin.js
//
// Единая точка инициализации Firebase Admin SDK
// Используется всеми функциями и скриптами для доступа к Firebase Realtime Database

const admin = require("firebase-admin");

let adminApp = null;
let dbInstance = null;

/**
 * Получает или создает экземпляр Firebase Admin App (синглтон)
 * @returns {admin.app.App} Экземпляр Firebase Admin App
 */
function getAdminApp() {
  if (adminApp) {
    return adminApp;
  }

  // Проверяем, не инициализирован ли уже app
  if (admin.apps.length > 0) {
    adminApp = admin.apps[0];
    return adminApp;
  }

  // Читаем переменные окружения
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  }

  const dbUrl = process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;
  if (!dbUrl) {
    throw new Error("FIREBASE_DB_URL or FIREBASE_DATABASE_URL is not set");
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);

    // Инициализируем Firebase Admin
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: dbUrl,
    });

    // Логируем только host (без секретов)
    try {
      const urlObj = new URL(dbUrl);
      console.log("[firebase-admin] Initialized with database:", urlObj.host);
    } catch (e) {
      console.log("[firebase-admin] Initialized");
    }

    return adminApp;
  } catch (e) {
    console.error("[firebase-admin] Initialization error:", e.message);
    throw e;
  }
}

/**
 * Получает экземпляр базы данных (синглтон)
 * @returns {admin.database.Database} Экземпляр базы данных
 */
function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const app = getAdminApp();
  dbInstance = admin.database(app);
  return dbInstance;
}

module.exports = {
  getAdminApp,
  getDb,
};
