// tools/test-ops-run-now.js
// Простая проверка ops-run-now после деплоя

require("dotenv").config();

const OPS_CRON_SECRET = process.env.OPS_CRON_SECRET;
const NETLIFY_URL = "https://novaciv.space";

async function testOpsRunNow() {
  if (!OPS_CRON_SECRET) {
    console.error("[test] ERROR: OPS_CRON_SECRET is not set in environment");
    console.error("[test] Please set it in .env file or environment variables");
    process.exit(1);
  }

  console.log("[test] Testing ops-run-now after deployment...");
  console.log("[test] URL:", `${NETLIFY_URL}/.netlify/functions/ops-run-now`);

  try {
    // Тест 1: Dry-run
    console.log("\n[test] Test 1: Dry-run mode (dry=1)...");
    const dryRunUrl = `${NETLIFY_URL}/.netlify/functions/ops-run-now?token=${OPS_CRON_SECRET}&dry=1`;
    const dryRunResp = await fetch(dryRunUrl);
    const dryRunData = await dryRunResp.json();

    if (dryRunResp.ok && dryRunData.ok) {
      console.log("[test] ✓ Dry-run test PASSED");
      console.log("[test]   Status:", dryRunResp.status);
      console.log("[test]   Duration:", dryRunData.duration, "ms");
      console.log("[test]   Results:", JSON.stringify(dryRunData.results || {}, null, 2));
    } else {
      console.error("[test] ✗ Dry-run test FAILED");
      console.error("[test]   Status:", dryRunResp.status);
      console.error("[test]   Error:", dryRunData.error || "unknown");
      process.exit(1);
    }

    // Тест 2: Проверка синтаксиса (если была ошибка, она проявится здесь)
    console.log("\n[test] Test 2: Syntax check (no runtime errors)...");
    if (dryRunResp.status === 200 && !dryRunData.error) {
      console.log("[test] ✓ No syntax errors detected");
    } else {
      console.error("[test] ✗ Syntax error detected:", dryRunData.error);
      process.exit(1);
    }

    console.log("\n[test] ===== ALL TESTS PASSED =====");
    console.log("[test] The fix for 'Unexpected token catch' is working correctly!");
    process.exit(0);

  } catch (error) {
    console.error("[test] ✗ Test FAILED with exception:");
    console.error("[test]   Error:", error.message);
    console.error("[test]   Stack:", error.stack);
    process.exit(1);
  }
}

testOpsRunNow();
