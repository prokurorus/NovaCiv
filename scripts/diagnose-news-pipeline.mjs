// scripts/diagnose-news-pipeline.mjs
//
// Диагностика news pipeline: проверка структуры данных и логики фильтрации
// Использование: node scripts/diagnose-news-pipeline.mjs

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

const fetch = globalThis.fetch;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;

if (!FIREBASE_DB_URL) {
  console.error("❌ FIREBASE_DB_URL not set");
  process.exit(1);
}

async function checkFirebaseTopics() {
  const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=%22section%22&equalTo=%22news%22`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    
    if (!data || typeof data !== "object") {
      return { topics: [], error: null };
    }

    const topics = Object.entries(data).map(([id, value]) => ({
      id,
      ...(value || {}),
    }));

    return { topics, error: null };
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  console.log("🔍 Diagnosing News Pipeline\n");
  console.log("=".repeat(60));

  // 1. Check Firebase topics
  console.log("\n1. Firebase Topics Check");
  console.log("-".repeat(60));
  
  const result = await checkFirebaseTopics();
  
  if (result.error) {
    console.log(`❌ Cannot check Firebase: ${result.error}`);
    console.log("   (Check FIREBASE_DB_URL in .env)");
    process.exit(1);
  }

  const topics = result.topics || [];
  console.log(`✅ Found ${topics.length} topics with section="news"`);

  // Analyze topics
  const published = topics.filter(t => t.telegramPostedAt);
  const unpublished = topics.filter(t => !t.telegramPostedAt);
  
  console.log(`   Published (has telegramPostedAt): ${published.length}`);
  console.log(`   Unpublished (no telegramPostedAt): ${unpublished.length}`);

  // Check structure
  const byLang = {};
  const sectionVariations = {};
  
  topics.forEach(t => {
    const lang = t.lang || "unknown";
    byLang[lang] = (byLang[lang] || 0) + 1;
    
    const section = t.section || "missing";
    sectionVariations[section] = (sectionVariations[section] || 0) + 1;
  });

  console.log("\n   By language:");
  Object.entries(byLang).forEach(([lang, count]) => {
    console.log(`     ${lang}: ${count}`);
  });

  console.log("\n   Section variations:");
  Object.entries(sectionVariations).forEach(([section, count]) => {
    const match = section === "news" ? "✅" : "⚠️";
    console.log(`     ${match} "${section}": ${count}`);
  });

  // Check unpublished topics details
  if (unpublished.length > 0) {
    console.log("\n   Unpublished topics (first 5):");
    unpublished.slice(0, 5).forEach((t, i) => {
      const createdAt = t.createdAt ? new Date(t.createdAt).toISOString() : "N/A";
      const lang = t.lang || "N/A";
      const section = t.section || "N/A";
      console.log(`     ${i + 1}. [${lang}] "${section}" - ${t.title || "No title"} (${createdAt})`);
      console.log(`        ID: ${t.id}`);
      console.log(`        telegramPostedAt: ${t.telegramPostedAt === undefined ? "undefined" : t.telegramPostedAt}`);
    });
  }

  // 2. Filter simulation
  console.log("\n2. Filter Simulation (news-cron logic)");
  console.log("-".repeat(60));
  
  // Simulate fetchNewsTopics filter
  const filtered = topics.filter(t => !t.telegramPostedAt);
  const sorted = filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const limited = sorted.slice(0, 10);
  
  console.log(`✅ Filter: !telegramPostedAt`);
  console.log(`   After filter: ${filtered.length} topics`);
  console.log(`   After sort (by createdAt): ${sorted.length} topics`);
  console.log(`   After limit (10): ${limited.length} topics`);

  if (limited.length > 0) {
    console.log("\n   Would be processed (first 3):");
    limited.slice(0, 3).forEach((t, i) => {
      console.log(`     ${i + 1}. [${t.lang || "N/A"}] ${t.title || "No title"}`);
    });
  } else {
    console.log("\n   ⚠️  No topics would be processed");
    console.log("   → Queue is empty or all topics already published");
  }

  // 3. Diagnosis
  console.log("\n3. Diagnosis");
  console.log("-".repeat(60));
  
  if (topics.length === 0) {
    console.log("❌ ROOT CAUSE: No topics with section='news' in Firebase");
    console.log("   → fetch-news is not creating topics");
    console.log("   → Check fetch-news logs in Netlify Dashboard");
  } else if (unpublished.length === 0) {
    console.log("✅ ROOT CAUSE: All topics already published");
    console.log("   → Queue is empty");
    console.log("   → Wait for fetch-news to create new topics (runs every 3 hours)");
  } else if (limited.length === 0) {
    console.log("⚠️  ROOT CAUSE: Topics exist but filter returns 0");
    console.log("   → Check filter logic or topic structure");
  } else {
    console.log("✅ ROOT CAUSE: Topics available for posting");
    console.log(`   → ${limited.length} topics ready for news-cron`);
    console.log("   → If posts don't appear, check news-cron logs for Telegram errors");
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n📋 Next Steps:");
  console.log("   1. Check Netlify Dashboard → Functions → fetch-news → Logs");
  console.log("   2. Check Netlify Dashboard → Functions → news-cron → Logs");
  console.log("   3. Verify env variables (OPENAI_API_KEY, TELEGRAM_BOT_TOKEN, etc.)");
}

main().catch(console.error);
