// tools/firebase-smoke-test.js
//
// Smoke test для проверки подключения к Firebase Realtime Database
// Использование: node tools/firebase-smoke-test.js

require("dotenv").config();
const { getDb } = require("../server/lib/firebaseAdmin");

async function smokeTest() {
  console.log("[smoke-test] Starting Firebase connection test...");

  try {
    // Подключаемся к базе
    const db = getDb();
    console.log("[smoke-test] Connected to Firebase");

    // Читаем первые 5 ключей из /forum/topics
    console.log("[smoke-test] Reading /forum/topics (first 5 keys)...");
    const topicsRef = db.ref("forum/topics");
    const topicsSnapshot = await topicsRef.limitToFirst(5).once("value");
    const topicsData = topicsSnapshot.val();
    
    if (topicsData) {
      const keys = Object.keys(topicsData);
      console.log(`[smoke-test] Found ${keys.length} topic(s):`, keys.slice(0, 5));
    } else {
      console.log("[smoke-test] No topics found (empty)");
    }

    // Тест записи: пишем тестовый ключ
    console.log("[smoke-test] Writing test key /_debug/smokeTest...");
    const testRef = db.ref("_debug/smokeTest");
    const testValue = {
      timestamp: Date.now(),
      message: "smoke test",
    };
    await testRef.set(testValue);
    console.log("[smoke-test] Test key written successfully");

    // Проверяем, что запись прошла
    const testSnapshot = await testRef.once("value");
    const testData = testSnapshot.val();
    if (testData && testData.timestamp) {
      console.log("[smoke-test] Test key read back successfully");
    } else {
      throw new Error("Test key was not written correctly");
    }

    // Удаляем тестовый ключ
    console.log("[smoke-test] Deleting test key...");
    await testRef.remove();
    console.log("[smoke-test] Test key deleted");

    // Проверяем, что удаление прошло
    const deletedSnapshot = await testRef.once("value");
    if (deletedSnapshot.val() === null) {
      console.log("[smoke-test] Test key deletion confirmed");
    } else {
      throw new Error("Test key was not deleted correctly");
    }

    console.log("[smoke-test] OK - All tests passed");
    process.exit(0);
  } catch (error) {
    console.error("[smoke-test] ERROR:", error.message);
    console.error("[smoke-test] Stack:", error.stack);
    process.exit(1);
  }
}

smokeTest();
