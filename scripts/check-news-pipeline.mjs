#!/usr/bin/env node
// scripts/check-news-pipeline.mjs
//
// Автоматическая проверка pipeline новостей:
// 1) GET /.netlify/functions/fetch-news?token=...
// 2) GET /.netlify/functions/news-cron?token=...
//
// Использование:
//   NEWS_BASE_URL=https://novaciv.space CRON_TOKEN=secret node scripts/check-news-pipeline.mjs

const NEWS_BASE_URL = process.env.NEWS_BASE_URL || "https://novaciv.space";
const CRON_TOKEN = process.env.CRON_TOKEN || process.env.NEWS_CRON_TOKEN || process.env.NEWS_CRON_SECRET;

if (!CRON_TOKEN) {
  console.error("❌ ERROR: CRON_TOKEN или NEWS_CRON_TOKEN не задан в env");
  console.error("   Использование: CRON_TOKEN=secret node scripts/check-news-pipeline.mjs");
  process.exit(1);
}

const FETCH_NEWS_URL = `${NEWS_BASE_URL}/.netlify/functions/fetch-news?token=${encodeURIComponent(CRON_TOKEN)}`;
const NEWS_CRON_URL = `${NEWS_BASE_URL}/.netlify/functions/news-cron?token=${encodeURIComponent(CRON_TOKEN)}`;

async function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "NovaCiv-News-Pipeline-Checker/1.0",
      },
    });
    const responseTime = Date.now() - startTime;
    clearTimeout(timeoutId);

    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      // Не JSON, оставляем null
    }

    return {
      status: response.status,
      statusText: response.statusText,
      responseTime,
      body: text,
      json,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Timeout после ${timeoutMs}ms`);
    }
    throw err;
  }
}

function analyzeFetchNewsResult(result) {
  const reasons = [];

  if (result.status === 403) {
    reasons.push("❌ 403 Forbidden — токен неверный или отсутствует");
  } else if (result.status === 405) {
    reasons.push("❌ 405 Method Not Allowed — используйте GET или POST");
  } else if (result.status === 500) {
    reasons.push("❌ 500 Internal Server Error — ошибка на сервере");
  } else if (result.status !== 200) {
    reasons.push(`❌ HTTP ${result.status} — неожиданный статус`);
  }

  if (result.json) {
    if (result.json.ok === false) {
      reasons.push(`❌ ok=false — ${result.json.error || "неизвестная ошибка"}`);
    } else if (result.json.processed === 0) {
      reasons.push("⚠️ processed=0 — новых новостей нет");
      reasons.push("   Возможные причины:");
      reasons.push("   • RSS недоступны (403/404/timeout)");
      reasons.push("   • Все новости отфильтрованы (дедупликация по guid/title)");
      reasons.push("   • Нет новостей с pubDate (старше 48 часов)");
      reasons.push("   • Все новости уже обработаны (проверьте /newsMeta/en.json)");
      reasons.push("   • Источники пустые (нет <item> в RSS)");
    }
  }

  return reasons;
}

function analyzeNewsCronResult(result) {
  const reasons = [];

  if (result.status === 403) {
    reasons.push("❌ 403 Forbidden — токен неверный или отсутствует");
  } else if (result.status === 500) {
    reasons.push("❌ 500 Internal Server Error — ошибка на сервере");
  } else if (result.status !== 200) {
    reasons.push(`❌ HTTP ${result.status} — неожиданный статус`);
  }

  if (result.json) {
    if (result.json.ok === false) {
      reasons.push(`❌ ok=false — ${result.json.error || "неизвестная ошибка"}`);
    } else if (result.json.processed === 0) {
      reasons.push("⚠️ processed=0 — новых тем для отправки нет");
      reasons.push("   Возможные причины:");
      reasons.push("   • Все темы уже отправлены (telegramPostedAt установлен)");
      reasons.push("   • fetch-news не создал новых тем (проверьте fetch-news)");
      reasons.push("   • Нет тем в Firebase forum/topics с section='news'");
    }
  }

  return reasons;
}

async function main() {
  console.log("🔍 Проверка pipeline новостей NovaCiv\n");
  console.log(`BASE_URL: ${NEWS_BASE_URL}`);
  console.log(`TOKEN: ${CRON_TOKEN.substring(0, 8)}...\n`);

  console.log("━".repeat(60));
  console.log("1️⃣  Запуск fetch-news\n");

  try {
    const fetchNewsResult = await fetchWithTimeout(FETCH_NEWS_URL, 60000);
    
    console.log(`📊 Результат fetch-news:`);
    console.log(`   HTTP Status: ${fetchNewsResult.status} ${fetchNewsResult.statusText}`);
    console.log(`   Response Time: ${fetchNewsResult.responseTime}ms`);

    if (fetchNewsResult.json) {
      console.log(`   ok: ${fetchNewsResult.json.ok}`);
      console.log(`   processed: ${fetchNewsResult.json.processed || 0}`);
      if (fetchNewsResult.json.titles && fetchNewsResult.json.titles.length > 0) {
        console.log(`   titles: ${fetchNewsResult.json.titles.length} шт.`);
        fetchNewsResult.json.titles.slice(0, 3).forEach((title, i) => {
          console.log(`      ${i + 1}. ${title.substring(0, 60)}${title.length > 60 ? "..." : ""}`);
        });
      }
    } else {
      console.log(`   body (первые 200 символов): ${fetchNewsResult.body.substring(0, 200)}`);
    }

    const fetchReasons = analyzeFetchNewsResult(fetchNewsResult);
    if (fetchReasons.length > 0) {
      console.log("\n   ⚠️  Диагностика:");
      fetchReasons.forEach((r) => console.log(`   ${r}`));
    } else if (fetchNewsResult.status === 200 && fetchNewsResult.json?.ok) {
      console.log("\n   ✅ fetch-news работает корректно");
    }

  } catch (err) {
    console.error(`   ❌ Ошибка при вызове fetch-news: ${err.message}`);
  }

  console.log("\n━".repeat(60));
  console.log("2️⃣  Запуск news-cron\n");

  try {
    const newsCronResult = await fetchWithTimeout(NEWS_CRON_URL, 30000);

    console.log(`📊 Результат news-cron:`);
    console.log(`   HTTP Status: ${newsCronResult.status} ${newsCronResult.statusText}`);
    console.log(`   Response Time: ${newsCronResult.responseTime}ms`);

    if (newsCronResult.json) {
      console.log(`   ok: ${newsCronResult.json.ok}`);
      console.log(`   processed: ${newsCronResult.json.processed || 0}`);
      if (newsCronResult.json.totalSent !== undefined) {
        console.log(`   totalSent: ${newsCronResult.json.totalSent}`);
      }
      if (newsCronResult.json.perLanguage) {
        const pl = newsCronResult.json.perLanguage;
        console.log(`   perLanguage:`);
        ["ru", "en", "de"].forEach((lang) => {
          if (pl[lang]) {
            console.log(`      ${lang}: sent=${pl[lang].sent || 0}, errors=${pl[lang].errors?.length || 0}`);
          }
        });
      }
    } else {
      console.log(`   body (первые 200 символов): ${newsCronResult.body.substring(0, 200)}`);
    }

    const cronReasons = analyzeNewsCronResult(newsCronResult);
    if (cronReasons.length > 0) {
      console.log("\n   ⚠️  Диагностика:");
      cronReasons.forEach((r) => console.log(`   ${r}`));
    } else if (newsCronResult.status === 200 && newsCronResult.json?.ok) {
      console.log("\n   ✅ news-cron работает корректно");
    }

  } catch (err) {
    console.error(`   ❌ Ошибка при вызове news-cron: ${err.message}`);
  }

  console.log("\n━".repeat(60));
  console.log("✅ Проверка завершена\n");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
