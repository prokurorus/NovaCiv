// scripts/create-test-news-topic.mjs
//
// Создаёт тестовую новостную тему в Firebase для проверки news-cron
// Использование: node scripts/create-test-news-topic.mjs

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;

if (!FIREBASE_DB_URL) {
  console.error("❌ FIREBASE_DB_URL not set");
  console.error("   Set FIREBASE_DB_URL in .env file");
  process.exit(1);
}

const now = Date.now();
const payload = {
  title: `Test News Topic (Verification ${new Date(now).toISOString()})`,
  content: `This is a test topic created to verify news-cron functionality.

The topic should be published to Telegram channels by news-cron function (runs every hour at :00 minutes).

After publication, the topic will have a telegramPostedAt field set.`,
  section: "news",
  createdAt: now,
  createdAtServer: now,
  authorNickname: "NovaCiv Test",
  lang: "en",
  sourceId: "test",
  originalGuid: `test-${now}`,
  originalLink: "https://novaciv.space",
  pubDate: new Date(now).toUTCString(),
};

console.log("📝 Creating test news topic...");
console.log(`   Title: ${payload.title}`);
console.log(`   Section: ${payload.section}`);
console.log(`   Language: ${payload.lang}`);

try {
  const res = await fetch(`${FIREBASE_DB_URL}/forum/topics.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Failed to create test topic: HTTP ${res.status}`);
    console.error(`   Response: ${text}`);
    process.exit(1);
  }

  const data = await res.json();
  const topicId = data.name;

  console.log("✅ Test topic created successfully!");
  console.log(`   Topic ID: ${topicId}`);
  console.log(`   Firebase path: /forum/topics/${topicId}`);
  console.log("");
  console.log("⏳ Next steps:");
  console.log("   1. Wait for next news-cron run (every hour at :00 minutes)");
  console.log("   2. Check Firebase: topic should get 'telegramPostedAt' field");
  console.log("   3. Check Telegram channels (if accessible)");
  console.log("");
  console.log("📊 To check status:");
  console.log(`   - Firebase Console → /forum/topics/${topicId}`);
  console.log("   - Health endpoint: https://novaciv.space/.netlify/functions/admin-proxy/admin/health/news");
} catch (err) {
  console.error("❌ Error creating test topic:", err.message);
  process.exit(1);
}
