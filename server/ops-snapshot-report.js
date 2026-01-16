// server/ops-snapshot-report.js
//
// CLI tool to run snapshot_system.sh and generate a stability report via OpenAI.
// Usage:
//   node server/ops-snapshot-report.js
//   node server/ops-snapshot-report.js --no-run-snapshot --no-save --print

const path = require("path");
require("dotenv").config({ path: process.env.ENV_PATH || "/root/NovaCiv/.env" });

const {
  runSnapshotScript,
  generateSnapshotReport,
  saveSnapshotReport,
} = require("./lib/snapshotReport");

const PROJECT_DIR = process.env.PROJECT_DIR || "/root/NovaCiv";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const runSnapshot = !hasFlag("--no-run-snapshot");
  const saveReport = !hasFlag("--no-save");
  const printReport = hasFlag("--print") || !hasFlag("--no-print");
  const quiet = hasFlag("--quiet");

  if (runSnapshot) {
    const snapshotResult = runSnapshotScript(PROJECT_DIR);
    if (!snapshotResult.success) {
      if (!quiet) {
        console.error("[ops-snapshot-report] Snapshot failed:", snapshotResult.error);
      }
      process.exit(1);
    }
  }

  const report = await generateSnapshotReport({
    projectDir: PROJECT_DIR,
    openaiApiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  });

  if (saveReport) {
    const saved = saveSnapshotReport({
      projectDir: PROJECT_DIR,
      reportText: report.reportText,
      snapshotTimestamp: report.snapshotTimestamp,
    });
    if (!quiet) {
      console.log("[ops-snapshot-report] Saved report:", saved.reportPath);
      console.log("[ops-snapshot-report] Saved report JSON:", saved.reportJsonPath);
    }
  }

  if (printReport) {
    console.log(report.reportText);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[ops-snapshot-report] Fatal error:", error.message || error);
    process.exit(1);
  });
}
