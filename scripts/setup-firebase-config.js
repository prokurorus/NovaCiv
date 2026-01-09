// scripts/setup-firebase-config.js
//
// Скрипт для первоначальной настройки структуры конфигурации в Firebase
// Выполнить один раз после миграции на архитектуру v2

const admin = require("firebase-admin");
// Load .env with absolute path (no CWD dependence)
require("dotenv").config({ path: "/root/NovaCiv/.env" });

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
const dbUrl = process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;

if (!dbUrl) {
  console.error("❌ FIREBASE_DB_URL / FIREBASE_DATABASE_URL is not set");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: dbUrl,
});

const db = admin.database();

async function setupConfig() {
  console.log("🔧 Настройка структуры конфигурации в Firebase...");
  console.log("   Database URL:", dbUrl);
  console.log("");

  const configRef = db.ref("config/features");

  // Проверяем, существует ли уже конфигурация
  const snapshot = await configRef.once("value");
  const existing = snapshot.val();

  if (existing) {
    console.log("ℹ️  Конфигурация уже существует:");
    console.log("   ", JSON.stringify(existing, null, 2));
    console.log("");
    console.log("✅ Пропускаем создание (используем существующую)");
    return;
  }

  // Создаем с безопасными дефолтами
  const defaultConfig = {
    youtubeUploadEnabled: false, // безопасный дефолт
    telegramEnabled: true,
  };

  await configRef.set(defaultConfig);

  console.log("✅ Конфигурация создана в Firebase:");
  console.log("   config/features/youtubeUploadEnabled: false");
  console.log("   config/features/telegramEnabled: true");
  console.log("");
  console.log("💡 Теперь вы можете управлять feature flags через Firebase Console");
  console.log("   или программно через Firebase Admin SDK");
}

setupConfig()
  .then(() => {
    console.log("");
    console.log("✅ Готово!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("");
    console.error("❌ Ошибка:", err.message);
    console.error(err);
    process.exit(1);
  });

