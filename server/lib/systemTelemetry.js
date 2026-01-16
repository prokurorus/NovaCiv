// server/lib/systemTelemetry.js
//
// Collect system telemetry from safe CLI tools only.
// Never reads env dumps or secret files.

const os = require("os");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DEFAULT_PROJECT_DIR = "/root/NovaCiv";
const PROJECT_DIR =
  process.env.PROJECT_DIR ||
  (fs.existsSync(DEFAULT_PROJECT_DIR) ? DEFAULT_PROJECT_DIR : path.resolve(__dirname, "..", ".."));

function execSafe(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (e) {
    return null;
  }
}

function parseDurationToSec(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized || /n\/a/i.test(normalized)) return null;
  let total = 0;
  const re = /(\d+)\s*([dhms])/gi;
  let match;
  while ((match = re.exec(normalized))) {
    const num = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "d") total += num * 86400;
    else if (unit === "h") total += num * 3600;
    else if (unit === "m") total += num * 60;
    else if (unit === "s") total += num;
  }
  if (total > 0) return total;
  const numeric = Number(normalized.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function parseMemToMb(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const num = Number(normalized.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(num)) return null;
  if (normalized.endsWith("gb") || normalized.endsWith("g")) return Math.round(num * 1024);
  if (normalized.endsWith("kb") || normalized.endsWith("k")) return Math.round(num / 1024);
  return Math.round(num);
}

function parsePm2StatusTable(output) {
  if (!output) return [];
  const lines = output.split("\n").filter((line) => line.includes("│"));
  const headerIndex = lines.findIndex((line) =>
    line.toLowerCase().includes("name") && line.toLowerCase().includes("status"),
  );
  if (headerIndex === -1) return [];

  const headerCells = lines[headerIndex].split("│").slice(1, -1).map((c) => c.trim());
  const normalizeHeader = (h) => h.toLowerCase();
  const headers = headerCells.map(normalizeHeader);

  const idxName = headers.indexOf("name");
  const idxStatus = headers.indexOf("status");
  const idxUptime = headers.indexOf("uptime");
  const idxRestarts = headers.findIndex((h) => h.includes("restart") || h.includes("↺"));
  const idxCpu = headers.findIndex((h) => h.includes("cpu"));
  const idxMem = headers.findIndex((h) => h.includes("mem"));

  const rows = lines.slice(headerIndex + 1);
  const processes = [];

  rows.forEach((line) => {
    const cells = line.split("│").slice(1, -1).map((c) => c.trim());
    if (cells.length < headerCells.length) return;
    const name = idxName >= 0 ? cells[idxName] : null;
    const status = idxStatus >= 0 ? cells[idxStatus] : null;
    const uptimeRaw = idxUptime >= 0 ? cells[idxUptime] : null;
    const restartsRaw = idxRestarts >= 0 ? cells[idxRestarts] : null;
    const cpuRaw = idxCpu >= 0 ? cells[idxCpu] : null;
    const memRaw = idxMem >= 0 ? cells[idxMem] : null;

    if (!name || name.toLowerCase() === "name") return;

    const restarts = restartsRaw ? Number(restartsRaw.replace(/[^\d]/g, "")) : 0;
    const cpuPct = cpuRaw ? Number(cpuRaw.replace(/[^\d.]/g, "")) : null;
    const memMb = parseMemToMb(memRaw);

    processes.push({
      name,
      status,
      uptimeSec: parseDurationToSec(uptimeRaw),
      restarts: Number.isFinite(restarts) ? restarts : 0,
      cpuPct: Number.isFinite(cpuPct) ? cpuPct : null,
      memMb: memMb ?? null,
    });
  });

  return processes;
}

function parsePm2Fallback(output) {
  if (!output) return [];
  const statusWords = ["online", "stopped", "errored", "launching", "stopping", "one-launch-status"];
  const processes = [];
  const lines = output.split("\n");

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^[┌└├┬┴─]+/.test(trimmed)) return;
    const lower = trimmed.toLowerCase();
    if (lower.includes("name") && lower.includes("status")) return;

    const normalized = trimmed.replace(/[│|]/g, "|");
    const cells = normalized.includes("|")
      ? normalized.split("|").map((c) => c.trim()).filter(Boolean)
      : trimmed.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) return;

    const statusIndex = cells.findIndex((cell) =>
      statusWords.includes(String(cell).toLowerCase()),
    );
    if (statusIndex === -1) return;

    const name = cells[1] || cells[statusIndex - 1] || null;
    if (!name || String(name).toLowerCase() === "name") return;

    const status = cells[statusIndex] || null;
    const restartsRaw =
      cells[statusIndex - 1] && /^\d+/.test(cells[statusIndex - 1])
        ? cells[statusIndex - 1]
        : null;
    const cpuRaw = cells[statusIndex + 1] || null;
    const memRaw = cells[statusIndex + 2] || null;
    const uptimeRaw = cells[statusIndex + 3] || null;

    const restarts = restartsRaw ? Number(restartsRaw.replace(/[^\d]/g, "")) : 0;
    const cpuPct = cpuRaw ? Number(cpuRaw.replace(/[^\d.]/g, "")) : null;
    const memMb = parseMemToMb(memRaw);

    processes.push({
      name,
      status,
      uptimeSec: parseDurationToSec(uptimeRaw),
      restarts: Number.isFinite(restarts) ? restarts : 0,
      cpuPct: Number.isFinite(cpuPct) ? cpuPct : null,
      memMb: memMb ?? null,
    });
  });

  return processes;
}

function parseDfTable(output) {
  if (!output) return [];
  const lines = output.split("\n").filter(Boolean);
  const rows = lines.slice(1);
  return rows
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 6)
    .map((parts) => ({
      filesystem: parts[0],
      size: parts[1],
      used: parts[2],
      avail: parts[3],
      usePct: parts[4],
      mount: parts.slice(5).join(" "),
    }));
}

function parseDfInodeTable(output) {
  if (!output) return [];
  const lines = output.split("\n").filter(Boolean);
  const rows = lines.slice(1);
  return rows
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 6)
    .map((parts) => ({
      filesystem: parts[0],
      inodes: parts[1],
      iused: parts[2],
      ifree: parts[3],
      iusePct: parts[4],
      mount: parts.slice(5).join(" "),
    }));
}

function parseFreeMem(output) {
  if (!output) return { totalMb: null, usedMb: null, freeMb: null, swapUsedMb: null };
  const lines = output.split("\n");
  const memLine = lines.find((line) => line.toLowerCase().startsWith("mem:"));
  const swapLine = lines.find((line) => line.toLowerCase().startsWith("swap:"));

  const memParts = memLine ? memLine.trim().split(/\s+/) : [];
  const swapParts = swapLine ? swapLine.trim().split(/\s+/) : [];

  const totalMb = memParts[1] ? Number(memParts[1]) : null;
  const usedMb = memParts[2] ? Number(memParts[2]) : null;
  const freeMb = memParts[3] ? Number(memParts[3]) : null;
  const swapUsedMb = swapParts[2] ? Number(swapParts[2]) : null;

  return {
    totalMb: Number.isFinite(totalMb) ? totalMb : null,
    usedMb: Number.isFinite(usedMb) ? usedMb : null,
    freeMb: Number.isFinite(freeMb) ? freeMb : null,
    swapUsedMb: Number.isFinite(swapUsedMb) ? swapUsedMb : null,
  };
}

function parseSsSummary(output) {
  if (!output) return { established: null };
  const estabMatch = output.match(/estab\s+(\d+)/i);
  const established = estabMatch ? Number(estabMatch[1]) : null;
  return { established: Number.isFinite(established) ? established : null };
}

function parseSsListening(output) {
  if (!output) return { listening: null, ports: [] };
  const lines = output.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return { listening: 0, ports: [] };
  const rows = lines.slice(1);
  const listening = rows.length;
  const ports = rows.map((line) => {
    const parts = line.trim().split(/\s+/);
    const local = parts[3] || "";
    return local;
  });
  return { listening, ports };
}

function parseIpLinkStats(output) {
  if (!output) {
    return { rxBytes: null, txBytes: null, rxErr: null, txErr: null };
  }
  const lines = output.split("\n");
  let rxBytes = 0;
  let txBytes = 0;
  let rxErr = 0;
  let txErr = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("RX:") && i + 1 < lines.length) {
      const data = lines[i + 1].trim().split(/\s+/);
      rxBytes += Number(data[0] || 0);
      rxErr += Number(data[2] || 0);
    }
    if (line.startsWith("TX:") && i + 1 < lines.length) {
      const data = lines[i + 1].trim().split(/\s+/);
      txBytes += Number(data[0] || 0);
      txErr += Number(data[2] || 0);
    }
  }
  return {
    rxBytes: Number.isFinite(rxBytes) ? rxBytes : null,
    txBytes: Number.isFinite(txBytes) ? txBytes : null,
    rxErr: Number.isFinite(rxErr) ? rxErr : null,
    txErr: Number.isFinite(txErr) ? txErr : null,
  };
}

function collectTelemetry() {
  const nowIso = new Date().toISOString();
  const repoPath = PROJECT_DIR;

  const branch = execSafe("git rev-parse --abbrev-ref HEAD", { cwd: repoPath });
  const head = execSafe("git rev-parse --short HEAD", { cwd: repoPath });
  const clean = execSafe("git status --porcelain", { cwd: repoPath });

  const pm2Output = execSafe("pm2 status --no-color");
  let pm2Processes = parsePm2StatusTable(pm2Output);
  if (pm2Processes.length === 0 && pm2Output) {
    pm2Processes = parsePm2Fallback(pm2Output);
  }

  const loadavg = os.loadavg();
  const cpu = {
    loadavg1: Number(loadavg[0].toFixed(2)),
    loadavg5: Number(loadavg[1].toFixed(2)),
    loadavg15: Number(loadavg[2].toFixed(2)),
    cores: os.cpus()?.length || null,
    topCpu: [],
  };

  const freeOutput = execSafe("free -m");
  const memParsed = parseFreeMem(freeOutput);
  const mem = {
    totalMb: memParsed.totalMb,
    usedMb: memParsed.usedMb,
    freeMb: memParsed.freeMb,
    swapUsedMb: memParsed.swapUsedMb,
    topRss: [],
  };

  const dfOutput = execSafe("df -h");
  const dfInodeOutput = execSafe("df -i");

  let ioSummary = null;
  let iostatPresent = false;
  const iostatOutput = execSafe("iostat -dx 1 1");
  if (iostatOutput) {
    iostatPresent = true;
    ioSummary = iostatOutput.split("\n").slice(-15).join("\n");
  }

  const ssSummaryOutput = execSafe("ss -s");
  const ssListeningOutput = execSafe("ss -lntp");

  const ssSummary = parseSsSummary(ssSummaryOutput);
  const ssListening = parseSsListening(ssListeningOutput);

  const ipLinkOutput = execSafe("ip -s link");
  const ipStats = parseIpLinkStats(ipLinkOutput);

  const adminPortListening = ssListeningOutput
    ? ssListeningOutput.split("\n").some((line) => line.includes(":3001"))
    : false;

  let monitoringState = null;
  const monitoringPath = path.join(PROJECT_DIR, "_state", "monitoring_state.json");
  try {
    if (fs.existsSync(monitoringPath)) {
      monitoringState = JSON.parse(fs.readFileSync(monitoringPath, "utf8"));
    }
  } catch (e) {
    monitoringState = null;
  }

  const lastSnapshotIso =
    monitoringState?.lastSnapshotAt ||
    monitoringState?.lastReportRunAt ||
    monitoringState?.snapshotLastRun ||
    null;
  const lastSnapshotOk =
    typeof monitoringState?.lastSnapshotOk === "boolean"
      ? monitoringState.lastSnapshotOk
      : typeof monitoringState?.lastReportOk === "boolean"
      ? monitoringState.lastReportOk
      : false;
  const lastReportIso = monitoringState?.lastReportRunAt || null;
  const lastReportOk =
    typeof monitoringState?.lastReportOk === "boolean" ? monitoringState.lastReportOk : false;

  return {
    ts: nowIso,
    host: {
      hostname: os.hostname(),
      uptimeSec: Math.floor(os.uptime()),
      timeIso: nowIso,
    },
    repo: {
      path: repoPath,
      branch: branch || null,
      head: head || null,
      clean: clean !== null ? clean.length === 0 : null,
    },
    pm2: {
      processes: pm2Processes,
    },
    cpu,
    mem,
    disk: {
      mounts: parseDfTable(dfOutput),
      inode: parseDfInodeTable(dfInodeOutput),
      io: {
        iostatPresent,
        summary: ioSummary,
      },
    },
    net: {
      summary: {
        rxBytes: ipStats.rxBytes,
        txBytes: ipStats.txBytes,
      },
      errors: {
        rxErr: ipStats.rxErr,
        txErr: ipStats.txErr,
      },
      conns: {
        established: ssSummary.established,
        listening: ssListening.listening,
      },
    },
    cron: {
      snapshotLastRun: {
        ok: lastSnapshotOk,
        iso: lastSnapshotIso,
      },
      reportLastRun: {
        ok: lastReportOk,
        iso: lastReportIso,
      },
      jobs: [],
    },
    health: {
      admin3001: adminPortListening,
      domovoyAdminEndpoint: adminPortListening,
      other: [],
    },
  };
}

module.exports = {
  collectTelemetry,
  parsePm2StatusTable,
};
