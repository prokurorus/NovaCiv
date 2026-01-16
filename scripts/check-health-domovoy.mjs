// scripts/check-health-domovoy.mjs
//
// Скрипт проверки здоровья Домового pipeline
// Использование: node scripts/check-health-domovoy.mjs

// Используем встроенный fetch (Node 18+)
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env
dotenv.config({ path: join(__dirname, "..", ".env") });

const fetch = globalThis.fetch;

const HEALTH_BASE_URL = "https://novaciv.space";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "";

if (!ADMIN_API_TOKEN) {
  console.error("❌ ADMIN_API_TOKEN not set");
  process.exit(1);
}

const HEALTH_PROXY_PATH = "/.netlify/functions/admin-proxy/admin/health/domovoy";
const HEALTH_URL = `${HEALTH_BASE_URL}${HEALTH_PROXY_PATH}`;

// SLA пороги
const AUTO_POST_MAX_AGE_MS = 26 * 60 * 60 * 1000; // 26 часов
const AUTO_REPLY_MAX_AGE_MS = 20 * 60 * 1000; // 20 минут

function isHtmlResponse(response, bodyText) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("text/html")) return true;
  const trimmed = (bodyText || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

async function main() {
  try {
    const response = await fetch(HEALTH_URL, {
      headers: {
        "X-Admin-Token": ADMIN_API_TOKEN,
      },
    });
    const responseText = await response.text();

    if (isHtmlResponse(response, responseText)) {
      console.error("Function not deployed / returned SPA HTML");
      process.exit(1);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      const snippet = responseText.slice(0, 200).replace(/\s+/g, " ").trim();
      console.error("❌ Health endpoint did not return JSON");
      console.error(`Content-Type: ${response.headers.get("content-type") || "unknown"}`);
      console.error(`Snippet: ${snippet || "[empty response]"}`);
      process.exit(1);
    }

    if (!response.ok) {
      console.error(`❌ Health endpoint returned ${response.status}`);
      if (data?.error) {
        console.error("Error:", data.error);
      }
      process.exit(1);
    }

    if (!data.ok) {
      console.error("❌ Health endpoint returned ok=false");
      if (data?.error) {
        console.error("Error:", data.error);
      }
      process.exit(1);
    }

    const now = Date.now();
    let hasError = false;
    const details = data.details && typeof data.details === "object" ? data.details : data;
    const autoPost = details.autoPost || data.autoPost || null;
    const autoReply = details.autoReply || data.autoReply || null;

    // Проверка auto-post
    if (!autoPost) {
      console.error("❌ auto-post: no metrics found (never run)");
      hasError = true;
    } else {
      const age = now - autoPost.ts;
      const ageHours = Math.floor(age / (60 * 60 * 1000));
      
      if (age > AUTO_POST_MAX_AGE_MS) {
        console.error(`❌ auto-post: last run ${ageHours}h ago (max 26h)`);
        hasError = true;
      } else if (!autoPost.ok) {
        console.error(`❌ auto-post: last run failed (errCode: ${autoPost.errCode || "UNKNOWN"})`);
        hasError = true;
      } else {
        console.log(`✅ auto-post: last run ${ageHours}h ago, ok=true`);
      }
    }

    // Проверка auto-reply
    if (!autoReply) {
      console.error("❌ auto-reply: no metrics found (never run)");
      hasError = true;
    } else {
      const age = now - autoReply.ts;
      const ageMinutes = Math.floor(age / (60 * 1000));
      
      if (age > AUTO_REPLY_MAX_AGE_MS) {
        console.error(`❌ auto-reply: last run ${ageMinutes}m ago (max 20m)`);
        hasError = true;
      } else if (!autoReply.ok) {
        console.error(`❌ auto-reply: last run failed (errCode: ${autoReply.errCode || "UNKNOWN"})`);
        hasError = true;
      } else {
        console.log(`✅ auto-reply: last run ${ageMinutes}m ago, ok=true`);
      }
    }

    if (hasError) {
      process.exit(1);
    }

    console.log("✅ All Domovoy health checks passed");
  } catch (err) {
    console.error("❌ Health check failed:", err.message);
    process.exit(1);
  }
}

main();
