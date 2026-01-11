#!/usr/bin/env node
// scripts/check-rss-sources.mjs
//
// Проверка доступности и валидности RSS источников из fetch-news.js
//
// Использование:
//   node scripts/check-rss-sources.mjs

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FETCH_NEWS_PATH = join(__dirname, "..", "netlify", "functions", "fetch-news.js");

function extractSources(fetchNewsContent) {
  // Ищем массив SOURCES
  const sourcesMatch = fetchNewsContent.match(/const\s+SOURCES\s*=\s*\[([\s\S]*?)\];/);
  if (!sourcesMatch) {
    throw new Error("Не найден массив SOURCES в fetch-news.js");
  }

  const sourcesArrayText = sourcesMatch[1];
  const sources = [];

  // Парсим объекты в массиве (многострочный формат)
  const sourceRegex = /\{\s*id:\s*["']([^"']+)["'][\s\S]*?url:\s*["']([^"']+)["'][\s\S]*?languages:\s*\[([\s\S]*?)\]\s*\}/g;
  let match;

  while ((match = sourceRegex.exec(sourcesArrayText)) !== null) {
    const id = match[1];
    const url = match[2];
    const languagesStr = match[3];
    const languages = languagesStr
      .split(",")
      .map((l) => l.trim().replace(/["']/g, ""))
      .filter((l) => l);

    sources.push({ id, url, languages });
  }

  return sources;
}

async function fetchRssSource(source, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startTime = Date.now();
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "NovaCiv-RSS-Checker/1.0",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    const responseTime = Date.now() - startTime;
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
        responseTime,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    const isRss = text.includes("<rss") || text.includes("<feed");
    const isXml = text.includes("<?xml") || contentType.includes("xml");

    // Пробуем извлечь заголовки
    const titles = [];
    const titleMatches = text.match(/<title[^>]*>([^<]+)<\/title>/gi);
    if (titleMatches) {
      titleMatches.slice(0, 5).forEach((match) => {
        const titleText = match.replace(/<\/?title[^>]*>/gi, "").trim();
        if (titleText && titleText.length > 5 && titleText.length < 200) {
          titles.push(titleText);
        }
      });
    }

    // Пробуем посчитать <item>
    const itemCount = (text.match(/<item>/gi) || []).length;

    return {
      success: true,
      status: response.status,
      responseTime,
      contentType,
      isRss,
      isXml,
      size: text.length,
      itemCount,
      titles: titles.slice(0, 2),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return {
        success: false,
        error: `Timeout после ${timeoutMs}ms`,
      };
    }
    return {
      success: false,
      error: err.message || String(err),
    };
  }
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").trim() : "";
    if (title) {
      items.push(title.substring(0, 80));
    }
  }

  return items.slice(0, 2);
}

async function main() {
  console.log("🔍 Проверка RSS источников NovaCiv\n");

  let sources;
  try {
    const fetchNewsContent = readFileSync(FETCH_NEWS_PATH, "utf-8");
    sources = extractSources(fetchNewsContent);
    console.log(`📋 Найдено источников: ${sources.length}\n`);
  } catch (err) {
    console.error(`❌ Ошибка чтения fetch-news.js: ${err.message}`);
    process.exit(1);
  }

  const results = {
    ok: [],
    failed: [],
  };

  console.log("━".repeat(60));

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    console.log(`\n[${i + 1}/${sources.length}] ${source.id}`);
    console.log(`   URL: ${source.url}`);
    console.log(`   Languages: ${source.languages.join(", ")}`);

    const result = await fetchRssSource(source);

    if (result.success) {
      console.log(`   ✅ OK (${result.responseTime}ms)`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Content-Type: ${result.contentType || "не указан"}`);
      console.log(`   RSS/XML: ${result.isRss ? "✅ RSS" : result.isXml ? "✅ XML" : "⚠️  не распознан"}`);
      console.log(`   Size: ${result.size} bytes`);
      console.log(`   Items: ${result.itemCount || 0}`);
      if (result.titles && result.titles.length > 0) {
        console.log(`   Sample titles:`);
        result.titles.forEach((title, idx) => {
          console.log(`      ${idx + 1}. ${title.substring(0, 70)}${title.length > 70 ? "..." : ""}`);
        });
      }

      if (result.status === 200 && result.isRss && result.itemCount > 0) {
        results.ok.push({ source, result });
      } else {
        results.failed.push({
          source,
          result,
          reason: !result.isRss ? "не RSS формат" : result.itemCount === 0 ? "нет <item>" : `HTTP ${result.status}`,
        });
      }
    } else {
      console.log(`   ❌ FAILED`);
      console.log(`   Error: ${result.error || "неизвестная ошибка"}`);
      if (result.status) {
        console.log(`   Status: ${result.status} ${result.statusText || ""}`);
      }
      results.failed.push({ source, result, reason: result.error || "неизвестная ошибка" });
    }
  }

  console.log("\n" + "━".repeat(60));
  console.log("\n📊 ИТОГОВАЯ СТАТИСТИКА\n");

  console.log(`✅ OK: ${results.ok.length} источников`);
  results.ok.forEach(({ source }) => {
    console.log(`   • ${source.id} (${source.languages.join(", ")})`);
  });

  console.log(`\n❌ FAILED: ${results.failed.length} источников`);
  results.failed.forEach(({ source, reason }) => {
    console.log(`   • ${source.id} (${source.languages.join(", ")}) — ${reason}`);
  });

  // Статистика по языкам
  console.log("\n📈 Статистика по языкам:");
  const langStats = { ru: 0, en: 0, de: 0 };
  results.ok.forEach(({ source }) => {
    source.languages.forEach((lang) => {
      if (langStats[lang] !== undefined) {
        langStats[lang] += 1;
      }
    });
  });

  Object.entries(langStats).forEach(([lang, count]) => {
    const totalForLang = sources.filter((s) => s.languages.includes(lang)).length;
    console.log(`   ${lang.toUpperCase()}: ${count}/${totalForLang} OK`);
  });

  console.log("\n✅ Проверка завершена\n");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
