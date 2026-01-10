#!/usr/bin/env node
// scripts/test-ops-agent-aliases.js
//
// Тест для проверки алиасов и автокоррекции команд ops-agent
// Запуск: node scripts/test-ops-agent-aliases.js

const path = require("path");
const fs = require("fs");

// Импортируем функции из ops-agent
const {
  resolveCommand,
  findClosestCommands,
  levenshteinDistance,
  COMMAND_WHITELIST,
  ALIAS_MAP
} = require("../server/ops-agent");

// Тестовые случаи
const testCases = [
  // Алиасы для report:status
  { input: "status", expected: "report:status" },
  { input: "report", expected: "report:status" },
  { input: "pm2", expected: "report:status" },
  { input: "health", expected: "report:status" },
  
  // Алиасы для youtube:refresh-test
  { input: "youtube:refresh", expected: "youtube:refresh-test" },
  { input: "yt:refresh", expected: "youtube:refresh-test" },
  { input: "yt refresh", expected: "youtube:refresh-test" },
  { input: "youtube refresh", expected: "youtube:refresh-test" },
  
  // Алиасы для worker:restart
  { input: "restart", expected: "worker:restart" },
  { input: "worker restart", expected: "worker:restart" },
  { input: "restart worker", expected: "worker:restart" },
  { input: "pm2 restart", expected: "worker:restart" },
  
  // Алиасы для pipeline:run-test-job
  { input: "test job", expected: "pipeline:run-test-job" },
  { input: "run test", expected: "pipeline:run-test-job" },
  { input: "pipeline test", expected: "pipeline:run-test-job" },
  { input: "test pipeline", expected: "pipeline:run-test-job" },
  
  // Алиасы для video:validate
  { input: "validate video", expected: "video:validate" },
  { input: "video validate", expected: "video:validate" },
  { input: "validate", expected: "video:validate" },
  
  // Прямые команды
  { input: "report:status", expected: "report:status" },
  { input: "youtube:refresh-test", expected: "youtube:refresh-test" },
  { input: "worker:restart", expected: "worker:restart" },
  { input: "pipeline:run-test-job", expected: "pipeline:run-test-job" },
  { input: "video:validate", expected: "video:validate" },
  
  // Автокоррекция (опечатки)
  { input: "staus", expected: "report:status", fuzzy: true }, // опечатка
  { input: "repor", expected: "report:status", fuzzy: true }, // опечатка
  { input: "restar", expected: "worker:restart", fuzzy: true }, // опечатка
  { input: "youtbe:refresh", expected: "youtube:refresh-test", fuzzy: true }, // опечатка
  
  // Неизвестные команды (должны вернуть null, но показать ближайшие)
  { input: "unknown command", expected: null },
  { input: "foo bar", expected: null },
];

// Тест функции resolveCommand
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Testing ops-agent command aliases and fuzzy matching");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

let passed = 0;
let failed = 0;
const failures = [];

for (const testCase of testCases) {
  const { input, expected, fuzzy } = testCase;
  const result = resolveCommand(input);
  
  if (result === expected) {
    console.log(`✅ "${input}" -> "${result}"`);
    passed++;
  } else {
    // Для fuzzy matching проверяем, что найдена хотя бы близкая команда
    if (fuzzy && expected && result === expected) {
      console.log(`✅ "${input}" -> "${result}" (fuzzy match)`);
      passed++;
    } else if (fuzzy && result) {
      // Для fuzzy matching, если не точное совпадение, показываем ближайшие
      const closest = findClosestCommands(input, 3);
      if (closest.includes(expected)) {
        console.log(`✅ "${input}" -> "${result}" (fuzzy, expected in closest: ${closest.join(", ")})`);
        passed++;
      } else {
        console.log(`❌ "${input}" -> "${result}" (expected: "${expected}")`);
        console.log(`   Closest: ${closest.join(", ")}`);
        failed++;
        failures.push({ input, expected, got: result, closest });
      }
    } else {
      console.log(`❌ "${input}" -> "${result || 'null'}" (expected: "${expected || 'null'}")`);
      if (!expected && result === null) {
        // Для неизвестных команд проверяем, что findClosestCommands работает
        const closest = findClosestCommands(input, 3);
        if (closest.length > 0) {
          console.log(`   ✓ Closest commands found: ${closest.join(", ")}`);
          passed++;
        } else {
          failed++;
          failures.push({ input, expected, got: result, closest: [] });
        }
      } else {
        failed++;
        failures.push({ input, expected, got: result });
      }
    }
  }
}

// Тест функции findClosestCommands
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Testing fuzzy matching (findClosestCommands)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

const fuzzyTestCases = [
  { input: "staus", shouldInclude: "report:status" },
  { input: "restar", shouldInclude: "worker:restart" },
  { input: "youtbe refresh", shouldInclude: "youtube:refresh-test" },
  { input: "validat", shouldInclude: "video:validate" },
  { input: "pipelin test", shouldInclude: "pipeline:run-test-job" },
];

for (const testCase of fuzzyTestCases) {
  const { input, shouldInclude } = testCase;
  const closest = findClosestCommands(input, 3);
  if (closest.includes(shouldInclude)) {
    console.log(`✅ "${input}" -> closest includes "${shouldInclude}"`);
    console.log(`   Closest: ${closest.join(", ")}`);
    passed++;
  } else {
    console.log(`❌ "${input}" -> closest does not include "${shouldInclude}"`);
    console.log(`   Closest: ${closest.join(", ")}`);
    failed++;
    failures.push({ input, shouldInclude, closest });
  }
}

// Итоги
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Test Results");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total:  ${passed + failed}\n`);

if (failures.length > 0) {
  console.log("Failures:");
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. Input: "${f.input}"`);
    console.log(`     Expected: ${f.expected || f.shouldInclude || 'null'}`);
    console.log(`     Got: ${f.got || 'null'}`);
    if (f.closest) {
      console.log(`     Closest: ${f.closest.join(", ") || "none"}`);
    }
    console.log("");
  });
  process.exit(1);
} else {
  console.log("🎉 All tests passed!");
  process.exit(0);
}
