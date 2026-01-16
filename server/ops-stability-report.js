// server/ops-stability-report.js
//
// CLI wrapper: collect → sanitize → generate → save → print.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { collectTelemetry } = require("./lib/systemTelemetry");
const { sanitizeTelemetry } = require("./lib/sanitizeTelemetry");
const { generateStabilityReport } = require("./lib/stabilityReport");

const PROJECT_DIR = process.env.PROJECT_DIR || path.resolve(__dirname, "..");

function buildTimestampSlug(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}${min}${ss}`;
}

function ensureStateDir(projectDir) {
  const stateDir = path.join(projectDir, "_state");
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

function safeExec(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15000,
      ...options,
    }).trim();
  } catch (e) {
    return null;
  }
}

function collectSnapshotMtime(projectDir) {
  const snapshotPath = path.join(projectDir, "_state", "system_snapshot.md");
  try {
    if (fs.existsSync(snapshotPath)) {
      const stats = fs.statSync(snapshotPath);
      return { path: snapshotPath, mtimeIso: stats.mtime.toISOString() };
    }
  } catch (e) {
    // Ignore
  }
  return { path: snapshotPath, mtimeIso: null };
}

function collectHealthChecks(projectDir) {
  const scripts = [
    {
      name: "health-news",
      path: path.join(projectDir, "scripts", "check-health-news.mjs"),
      command: "node scripts/check-health-news.mjs",
    },
    {
      name: "health-domovoy",
      path: path.join(projectDir, "scripts", "check-health-domovoy.mjs"),
      command: "node scripts/check-health-domovoy.mjs",
    },
  ];

  const checks = [];
  scripts.forEach((script) => {
    if (!fs.existsSync(script.path)) {
      return;
    }
    const output = safeExec(script.command, { cwd: projectDir });
    if (output === null) {
      checks.push({
        name: script.name,
        ok: false,
        output: "failed to run health check",
      });
      return;
    }
    checks.push({
      name: script.name,
      ok: true,
      output,
    });
  });
  return checks;
}

function saveArtifacts({ projectDir, telemetry, report }) {
  const stateDir = ensureStateDir(projectDir);
  const slug = buildTimestampSlug(new Date());

  const telemetryLatest = path.join(stateDir, "telemetry_latest.json");
  const telemetryArchive = path.join(stateDir, `telemetry_${slug}.json`);

  const reportLatestMd = path.join(stateDir, "system_report_latest.md");
  const reportArchiveMd = path.join(stateDir, `system_report_${slug}.md`);
  const reportLatestJson = path.join(stateDir, "system_report_latest.json");
  const reportArchiveJson = path.join(stateDir, `system_report_${slug}.json`);

  fs.writeFileSync(telemetryLatest, JSON.stringify(telemetry, null, 2), "utf8");
  fs.writeFileSync(telemetryArchive, JSON.stringify(telemetry, null, 2), "utf8");

  if (report?.reportMd) {
    fs.writeFileSync(reportLatestMd, `${report.reportMd}\n`, "utf8");
    fs.writeFileSync(reportArchiveMd, `${report.reportMd}\n`, "utf8");
  }

  const reportMeta = report
    ? {
        createdAt: report.createdAt || new Date().toISOString(),
        model: report.model || null,
        usage: report.usage || null,
        ok: true,
      }
    : {
        createdAt: new Date().toISOString(),
        model: null,
        usage: null,
        ok: false,
      };

  fs.writeFileSync(reportLatestJson, JSON.stringify(reportMeta, null, 2), "utf8");
  fs.writeFileSync(reportArchiveJson, JSON.stringify(reportMeta, null, 2), "utf8");

  return {
    telemetryLatest,
    telemetryArchive,
    reportLatestMd,
    reportArchiveMd,
    reportLatestJson,
    reportArchiveJson,
  };
}

function readMonitoringState(statePath) {
  try {
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, "utf8"));
    }
  } catch (e) {
    return null;
  }
  return null;
}

function writeMonitoringState(statePath, nextState) {
  const current = readMonitoringState(statePath) || {};
  const merged = { ...current, ...nextState };
  fs.writeFileSync(statePath, JSON.stringify(merged, null, 2), "utf8");
}

async function runStabilityReport() {
  const telemetry = collectTelemetry();
  const snapshotInfo = collectSnapshotMtime(PROJECT_DIR);
  const healthChecks = collectHealthChecks(PROJECT_DIR);
  telemetry.snapshot = snapshotInfo;
  if (!telemetry.health) {
    telemetry.health = {};
  }
  telemetry.health.checks = healthChecks;
  const sanitizedTelemetry = sanitizeTelemetry(telemetry);
  const stateDir = ensureStateDir(PROJECT_DIR);
  const monitoringStatePath = path.join(stateDir, "monitoring_state.json");

  let report = null;
  let reportError = null;
  try {
    report = await generateStabilityReport(sanitizedTelemetry);
  } catch (e) {
    reportError = e;
  }

  const saved = saveArtifacts({
    projectDir: PROJECT_DIR,
    telemetry: sanitizedTelemetry,
    report,
  });

  const nowIso = new Date().toISOString();
  writeMonitoringState(monitoringStatePath, {
    lastReportRunAt: nowIso,
    lastReportOk: Boolean(report),
    lastReportFiles: {
      telemetryLatest: saved.telemetryLatest,
      telemetryArchive: saved.telemetryArchive,
      reportLatestMd: saved.reportLatestMd,
      reportArchiveMd: saved.reportArchiveMd,
      reportLatestJson: saved.reportLatestJson,
      reportArchiveJson: saved.reportArchiveJson,
    },
    snapshotLastRun: nowIso,
  });

  return { telemetry: sanitizedTelemetry, report, saved, reportError };
}

if (require.main === module) {
  runStabilityReport()
    .then(({ report, reportError }) => {
      if (report?.reportMd) {
        console.log(report.reportMd);
        return;
      }
      if (reportError) {
        console.error("[ops-stability-report] OpenAI not available:", reportError.message);
        process.exit(2);
      }
      console.error("[ops-stability-report] Report is empty");
      process.exit(2);
    })
    .catch((err) => {
      console.error("[ops-stability-report] Failed:", err.message);
      process.exit(1);
    });
}

module.exports = {
  runStabilityReport,
};
