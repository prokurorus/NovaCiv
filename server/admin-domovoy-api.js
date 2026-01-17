// server/admin-domovoy-api.js
//
// VPS-only Admin Domovoy API service
// Runs under PM2, handles POST /admin/domovoy requests
// Loads memory from server-only files (docs/, runbooks/, _state/system_snapshot.md)
// NEVER outputs secrets; sanitizes all logs and responses

const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
require("dotenv").config({ path: process.env.ENV_PATH || "/root/NovaCiv/.env" });

const { getDb } = require("./lib/firebaseAdmin");
const { parsePm2StatusTable } = require("./lib/systemTelemetry");
const { runStabilityReport } = require("./ops-stability-report");
const {
  DEFAULT_THREAD_ID,
  getEffectiveThreadId,
  logUserMessage,
  logAssistantMessageAndIncrementPair,
  buildAdminMemoryContext,
  checkAndSummarizeThread,
} = require("./lib/adminConversations");

// ---------- ENV ----------
const PORT = process.env.ADMIN_DOMOVOY_PORT || 3001;
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PROJECT_DIR = process.env.PROJECT_DIR || "/root/NovaCiv";
const DIRECT_SEED_VERSION = 2;
const STATE_DIR = path.join(PROJECT_DIR, "_state");
const SNAPSHOT_DOWNLOAD_ALLOWLIST = {
  "system_report_latest.md": {
    filename: "system_report_latest.md",
    fullPath: path.join(STATE_DIR, "system_report_latest.md"),
    contentType: "text/markdown; charset=utf-8",
  },
  "telemetry_latest.json": {
    filename: "telemetry_latest.json",
    fullPath: path.join(STATE_DIR, "telemetry_latest.json"),
    contentType: "application/json; charset=utf-8",
  },
  "system_report_latest.json": {
    filename: "system_report_latest.json",
    fullPath: path.join(STATE_DIR, "system_report_latest.json"),
    contentType: "application/json; charset=utf-8",
  },
};

// ---------- Memory cache (static docs + snapshot) ----------
// Cache is mode-aware: { mode: "ops"|"strategy"|"direct", cache: {...} }
let staticMemoryCache = null;
let cachedMode = null;
const HONESTY_SYSTEM_RULE =
  "Never claim you performed actions (opened browser, executed commands, checked endpoints) unless you actually have tool output provided in the conversation.";

// ---------- Helper: Load file safely ----------
function loadFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      console.log(`[admin-domovoy-api] Loaded: ${path.basename(filePath)}`);
      return content;
    }
  } catch (e) {
    console.warn(`[admin-domovoy-api] Failed to load ${filePath}:`, e.message);
  }
  return null;
}

// ---------- Helper: Sanitize content (remove secrets) ----------
function sanitizeContent(content) {
  if (!content) return "";
  
  // Patterns to redact
  const patterns = [
    /sk-[a-zA-Z0-9]{20,}/g,  // OpenAI keys
    /ghp_[a-zA-Z0-9]{36,}/g, // GitHub tokens
    /AIza[0-9A-Za-z_-]{35}/g, // Firebase keys
    /-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY)-----[\s\S]*?-----END (PRIVATE KEY|RSA PRIVATE KEY)-----/g,
    /"token":\s*"[^"]+"/gi,
    /"apiKey":\s*"[^"]+"/gi,
    /"password":\s*"[^"]+"/gi,
  ];
  
  let sanitized = content;
  patterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  });
  
  return sanitized;
}

function safeJsonParse(raw, fallback = null) {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function hasJsonContentType(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  return contentType.includes("application/json");
}

function parseJsonBody(req, res, onParsed) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    const trimmed = body.trim();
    if (!trimmed) {
      sendJson(res, 400, { ok: false, error: "empty_body" });
      return;
    }
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      sendJson(res, 400, { ok: false, error: "invalid_json" });
      return;
    }
    onParsed(data);
  });
}

function truncateWithSuffix(text, remaining) {
  if (typeof text !== "string") return "";
  if (text.length <= remaining) return text;
  const suffix = "\n\n[... truncated ...]";
  if (remaining <= suffix.length) {
    return text.slice(0, remaining);
  }
  return text.slice(0, remaining - suffix.length) + suffix;
}

function nowIso() {
  return new Date().toISOString();
}

function maxTimestamp(values) {
  const numeric = values
    .map((value) => (typeof value === "number" ? value : null))
    .filter((value) => Number.isFinite(value));
  if (!numeric.length) return null;
  return Math.max(...numeric);
}

async function fetchDbValue(path) {
  const db = getDb();
  const snapshot = await db.ref(path).once("value");
  return snapshot.val();
}

function loadPromptFile(filePath, fallbackPath) {
  const primary = filePath ? loadFile(filePath) : null;
  const fallback = fallbackPath ? loadFile(fallbackPath) : null;
  const content = primary || fallback || "";
  return sanitizeContent(content);
}

// ---------- Helper: One-time sanitation for direct thread ----------
async function sanitizeDirectThreadIfNeeded(threadId) {
  if (threadId !== "ruslan-direct") return { ran: false, reason: "not_direct" };

  const db = getDb();
  const baseRef = db.ref("adminConversations").child(threadId);

  const stateSnap = await baseRef.child("state").once("value");
  const existingState = stateSnap.val() || {};
  const existingSeedVersion = Number(existingState.directSeedVersion || 0);

  if (existingSeedVersion >= DIRECT_SEED_VERSION) {
    console.log(`[direct-seed] skip; version=${existingSeedVersion}`);
    return { ran: false, reason: "seed_version_ok", version: existingSeedVersion };
  }

  const existingSnap = await baseRef.once("value");
  const existing = existingSnap.val() || {};

  const seedPairs = [
    {
      q: "привет, на связи",
      a: "Привет! Я здесь. Чем помочь?",
    },
    {
      q: "можешь отвечать просто и по делу?",
      a: "Да, буду отвечать коротко и по сути.",
    },
    {
      q: "нет срочных проблем, что обсудим?",
      a: "Если срочного нет, давай выберем одну тему и разберем ее. Что сейчас важнее?",
    },
  ];

  const messagesRef = baseRef.child("messages");
  const messages = {};
  const baseTs = Date.now() - seedPairs.length * 2 * 1000;
  let ts = baseTs;

  seedPairs.forEach((pair) => {
    const userKey = messagesRef.push().key;
    const assistantKey = messagesRef.push().key;
    messages[userKey] = {
      role: "user",
      text: pair.q,
      ts,
      meta: {
        origin: "direct-seed",
      },
    };
    ts += 500;
    messages[assistantKey] = {
      role: "assistant",
      text: pair.a,
      ts,
      meta: {
        origin: "direct-seed",
      },
    };
    ts += 500;
  });

  const preserved = {};
  Object.keys(existing).forEach((key) => {
    if (
      key !== "messages" &&
      key !== "recentPairs" &&
      key !== "counters" &&
      key !== "state" &&
      key !== "summaries"
    ) {
      preserved[key] = existing[key];
    }
  });

  const existingRecentPairs = existing.recentPairs;
  let sanitizedRecentPairs = undefined;
  if (Array.isArray(existingRecentPairs)) {
    sanitizedRecentPairs = [];
  } else if (existingRecentPairs && typeof existingRecentPairs === "object") {
    sanitizedRecentPairs = {};
  }

  const newState = {
    ...(existing.state || {}),
    lastMessageTs: ts,
    lastSummaryTs: null,
    directSanitized: true,
    directSeedVersion: DIRECT_SEED_VERSION,
  };

  const newCounters = {
    ...(existing.counters || {}),
    pairCount: seedPairs.length,
    lastSummarizedPairCount: 0,
  };

  const newSummaries = {
    ...(existing.summaries || {}),
    level1: {},
    level2: {},
  };

  const newData = {
    ...preserved,
    messages,
    counters: newCounters,
    state: newState,
    summaries: newSummaries,
  };

  if (sanitizedRecentPairs !== undefined) {
    newData.recentPairs = sanitizedRecentPairs;
  }

  await baseRef.set(newData);

  console.log(`[direct-seed] done; pairs=${seedPairs.length}; version=${DIRECT_SEED_VERSION}`);
  return { ran: true, pairs: seedPairs.length };
}

// ---------- Helper: Collect OPS STATUS (real-time checks) ----------
function collectOpsStatus() {
  const ops = {
    gitClean: null,
    headSha: null,
    pm2: [],
    snapshotMtime: null,
    stabilityReportMtime: null,
    snapshotLastRun: null,
  };

  try {
    // Check git status (authoritative)
    try {
      const gitStatus = execSync("git status --porcelain", {
        cwd: PROJECT_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      ops.gitClean = gitStatus.length === 0;
    } catch (e) {
      console.warn("[admin-domovoy-api] Failed to check git status:", e.message);
      ops.gitClean = null;
    }

    // Get HEAD SHA
    try {
      ops.headSha = execSync("git rev-parse --short HEAD", {
        cwd: PROJECT_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    } catch (e) {
      console.warn("[admin-domovoy-api] Failed to get HEAD SHA:", e.message);
      ops.headSha = null;
    }

    // Get PM2 summary (safe table output)
    try {
      const pm2Table = execSync("pm2 status --no-color", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const pm2Processes = parsePm2StatusTable(pm2Table);
      ops.pm2 = pm2Processes.map((proc) => ({
        name: proc.name || null,
        status: proc.status || null,
        restarts: proc.restarts || 0,
        uptimeSeconds: proc.uptimeSec || null,
      }));
    } catch (e) {
      console.warn("[admin-domovoy-api] Failed to get PM2 status:", e.message);
      ops.pm2 = [];
    }

    // Get snapshot mtime
    const snapshotPath = path.join(PROJECT_DIR, "_state", "system_snapshot.md");
    try {
      if (fs.existsSync(snapshotPath)) {
        const stats = fs.statSync(snapshotPath);
        ops.snapshotMtime = stats.mtime.toISOString();
      }
    } catch (e) {
      // Ignore
    }

    // Get last stability report mtime
    const stabilityReportPath = path.join(
      PROJECT_DIR,
      "_state",
      "system_report_latest.md",
    );
    try {
      if (fs.existsSync(stabilityReportPath)) {
        const stats = fs.statSync(stabilityReportPath);
        ops.stabilityReportMtime = stats.mtime.toISOString();
      }
    } catch (e) {
      // Ignore
    }

    // Read monitoring state for report/snapshot last run
    const monitoringStatePath = path.join(
      PROJECT_DIR,
      "_state",
      "monitoring_state.json",
    );
    try {
      if (fs.existsSync(monitoringStatePath)) {
        const stateRaw = fs.readFileSync(monitoringStatePath, "utf8");
        const state = safeJsonParse(stateRaw, null);
        const lastRun =
          (state && typeof state.lastReportRunAt === "string" && state.lastReportRunAt) ||
          (state && typeof state.lastSnapshotAt === "string" && state.lastSnapshotAt) ||
          (state && typeof state.snapshotLastRun === "string" && state.snapshotLastRun) ||
          null;
        if (lastRun) {
          ops.snapshotLastRun = lastRun;
        }
      }
    } catch (e) {
      // Ignore
    }
  } catch (e) {
    console.warn("[admin-domovoy-api] Error collecting ops status:", e.message);
  }

  return ops;
}

// ---------- Helper: Format OPS STATUS block for prompt ----------
function formatOpsStatusBlock(ops) {
  const lines = [];
  lines.push("OPS STATUS (truth):");
  lines.push(`  gitClean: ${ops.gitClean === true ? "true" : ops.gitClean === false ? "false" : "unknown"}`);
  lines.push(`  headSha: ${ops.headSha || "unknown"}`);
  
  if (ops.pm2 && ops.pm2.length > 0) {
    lines.push("  pm2:");
    ops.pm2.forEach((proc) => {
      const uptimeStr = proc.uptimeSeconds !== null ? `${proc.uptimeSeconds}s` : "unknown";
      lines.push(`    - ${proc.name || "unnamed"}: status=${proc.status || "unknown"}, restarts=${proc.restarts || 0}, uptime=${uptimeStr}`);
    });
  } else {
    lines.push("  pm2: []");
  }
  
  lines.push(`  snapshotMtime: ${ops.snapshotMtime || "not found"}`);
  
  return lines.join("\n");
}

// ---------- Build static docs/snapshot memory ----------
function buildStaticMemoryFiles(mode = "ops") {
  const normalizedMode =
    mode === "direct" ? "direct" : mode === "strategy" ? "strategy" : "ops";

  // Check if cache is valid for this mode
  if (staticMemoryCache !== null && cachedMode === normalizedMode) {
    return staticMemoryCache;
  }

  const docsBase = path.join(PROJECT_DIR, "docs");
  const runbooksBase = path.join(PROJECT_DIR, "runbooks");
  const stateBase = path.join(PROJECT_DIR, "_state");
  
  const memoryFiles = [];
  const MAX_TOTAL_CHARS = normalizedMode === "ops" ? 25000 : 120000;
  
  const directCriticalFiles = [
    { path: path.join(docsBase, "MEMORY_BRIEF_ADMIN.md"), name: "MEMORY_BRIEF_ADMIN.md" },
    { path: path.join(docsBase, "ADMIN_ASSISTANT_DIRECT.md"), name: "ADMIN_ASSISTANT_DIRECT.md" },
    {
      path: path.join(docsBase, "PROJECT_CONTEXT.md"),
      name: "PROJECT_CONTEXT.md (reference only)",
      referenceOnly: true,
    },
  ];

  const opsCriticalFiles = [
    { path: path.join(docsBase, "MEMORY_BRIEF_ADMIN.md"), name: "MEMORY_BRIEF_ADMIN.md" },
    { path: path.join(docsBase, "ADMIN_ASSISTANT_OPS.md"), name: "ADMIN_ASSISTANT_OPS.md" },
    { path: path.join(docsBase, "PROJECT_STATE.md"), name: "PROJECT_STATE.md" },
  ];

  const strategyCriticalFiles = [
    { path: path.join(docsBase, "MEMORY_BRIEF_ADMIN.md"), name: "MEMORY_BRIEF_ADMIN.md" },
    { path: path.join(docsBase, "ADMIN_ASSISTANT.md"), name: "ADMIN_ASSISTANT.md" },
    { path: path.join(docsBase, "PROJECT_CONTEXT.md"), name: "PROJECT_CONTEXT.md" },
    { path: path.join(docsBase, "PROJECT_STATE.md"), name: "PROJECT_STATE.md" },
  ];

  const criticalFiles =
    normalizedMode === "direct"
      ? directCriticalFiles
      : normalizedMode === "strategy"
      ? strategyCriticalFiles
      : opsCriticalFiles;

  const importantFiles =
    normalizedMode === "direct" || normalizedMode === "ops"
      ? []
      : [
          { path: path.join(docsBase, "START_HERE.md"), name: "START_HERE.md" },
          { path: path.join(docsBase, "RUNBOOKS.md"), name: "RUNBOOKS.md" },
          { path: path.join(runbooksBase, "SOURCE_OF_TRUTH.md"), name: "runbooks/SOURCE_OF_TRUTH.md" },
        ];
  
  // Priority 3: System snapshot (tail last 250 lines if exists)
  const snapshotPath = path.join(stateBase, "system_snapshot.md");
  
  let totalChars = 0;
  
  // Load critical files (respect MAX_TOTAL_CHARS)
  for (const file of criticalFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    const content = loadFile(file.path);
    if (content) {
      const sanitized = sanitizeContent(content);
      const contentWithNote = file.referenceOnly
        ? `СПРАВКА: этот файл только для фактов. Не копируй шаблонный стиль ответа.\n\n${sanitized}`
        : sanitized;
      const remaining = MAX_TOTAL_CHARS - totalChars;
      if (contentWithNote.length <= remaining) {
        memoryFiles.push({ name: file.name, content: contentWithNote });
        totalChars += contentWithNote.length;
      } else if (remaining > 100) {
        memoryFiles.push({
          name: file.name,
          content: truncateWithSuffix(contentWithNote, remaining),
        });
        totalChars = MAX_TOTAL_CHARS;
        break;
      }
    }
  }
  
  // Load important files up to limit
  for (const file of importantFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    
    const content = loadFile(file.path);
    if (content) {
      const sanitized = sanitizeContent(content);
      const remaining = MAX_TOTAL_CHARS - totalChars;
      if (sanitized.length <= remaining) {
        memoryFiles.push({ name: file.name, content: sanitized });
        totalChars += sanitized.length;
      } else {
        memoryFiles.push({ 
          name: file.name, 
          content: truncateWithSuffix(sanitized, remaining),
        });
        totalChars = MAX_TOTAL_CHARS;
        break;
      }
    }
  }
  
  const snapshotTailLines = normalizedMode === "ops" ? 100 : 250;
  // Load snapshot (tail N lines) if space allows
  if (normalizedMode !== "direct" && totalChars < MAX_TOTAL_CHARS && fs.existsSync(snapshotPath)) {
    try {
      const snapshotContent = loadFile(snapshotPath);
      if (snapshotContent) {
        const lines = snapshotContent.split("\n");
        const tailLines = lines.slice(-snapshotTailLines).join("\n");
        const sanitized = sanitizeContent(tailLines);
        const remaining = MAX_TOTAL_CHARS - totalChars;
        
        if (sanitized.length <= remaining) {
          memoryFiles.push({ 
            name: `_state/system_snapshot.md (tail ${snapshotTailLines} lines)`, 
            content: sanitized 
          });
          totalChars += sanitized.length;
        } else if (remaining > 100) {
          memoryFiles.push({ 
            name: "_state/system_snapshot.md (tail, truncated)", 
            content: truncateWithSuffix(sanitized, remaining),
          });
          totalChars = MAX_TOTAL_CHARS;
        }
      }
    } catch (e) {
      console.warn(`[admin-domovoy-api] Failed to load snapshot:`, e.message);
    }
  }
  
  staticMemoryCache = {
    memoryFiles,
    filesLoaded: memoryFiles.map(f => f.name),
    totalChars,
  };

  cachedMode = normalizedMode;

  return staticMemoryCache;
}

// ---------- Build full Memory Pack (docs + snapshots + admin summaries/history) ----------
async function buildMemoryPack(threadIdRaw, mode = "ops") {
  const staticPack = buildStaticMemoryFiles(mode);
  const isOps = mode === "ops";
  const OPS_MAX_CHARS = 25000;

  let adminContext = null;
  try {
    adminContext = await buildAdminMemoryContext({
      threadId: threadIdRaw || DEFAULT_THREAD_ID,
      maxPairs: isOps ? 6 : 20,
    });
  } catch (e) {
    console.warn(
      "[admin-domovoy-api] Failed to build admin memory context from RTDB:",
      e.message,
    );
  }

  const memoryFiles = [...staticPack.memoryFiles];
  let summaryCount = 0;
  let recentPairCount = 0;
  let lastSummaryTs = null;
  let totalChars = memoryFiles.reduce(
    (sum, f) => sum + (typeof f.content === "string" ? f.content.length : 0),
    0,
  );
  let remainingOpsChars = isOps ? Math.max(0, OPS_MAX_CHARS - totalChars) : null;

  if (adminContext) {
    const { summaryText, recentPairsText } = adminContext;
    summaryCount = adminContext.summaryCount || 0;
    recentPairCount = adminContext.recentPairCount || 0;
    lastSummaryTs = adminContext.lastSummaryTs || null;

    if (summaryText && summaryText.trim().length > 0) {
      if (!isOps) {
        memoryFiles.push({
          name: "adminConversations/summaries",
          content: summaryText,
        });
        totalChars += summaryText.length;
      } else if (remainingOpsChars > 0) {
        const content = truncateWithSuffix(summaryText, remainingOpsChars);
        memoryFiles.push({
          name: "adminConversations/summaries",
          content,
        });
        totalChars += content.length;
        remainingOpsChars = Math.max(0, OPS_MAX_CHARS - totalChars);
      }
    }

    if (recentPairsText && recentPairsText.trim().length > 0) {
      if (!isOps) {
        memoryFiles.push({
          name: "adminConversations/recentPairs",
          content: recentPairsText,
        });
        totalChars += recentPairsText.length;
      } else if (remainingOpsChars > 0) {
        const content = truncateWithSuffix(recentPairsText, remainingOpsChars);
        memoryFiles.push({
          name: "adminConversations/recentPairs",
          content,
        });
        totalChars += content.length;
        remainingOpsChars = Math.max(0, OPS_MAX_CHARS - totalChars);
      }
    }
  }

  const filesLoaded = memoryFiles.map((f) => f.name);
  totalChars = memoryFiles.reduce(
    (sum, f) => sum + (typeof f.content === "string" ? f.content.length : 0),
    0,
  );

  console.log(
    `[admin-domovoy-api] Memory pack built: ${staticPack.filesLoaded.length} files + ${summaryCount} summaries + ${recentPairCount} recent pairs, ${totalChars} chars`,
  );

  return {
    memoryFiles,
    filesLoaded,
    totalChars,
    summaryCount,
    recentPairCount,
    lastSummaryTs,
  };
}

// ---------- Helper: JSON responses with origin tagging ----------
function sendJson(res, statusCode, payload) {
  const body = payload && typeof payload === "object" ? { ...payload } : {};
  if (!body.debug || typeof body.debug !== "object") {
    body.debug = {};
  }
  if (!body.debug.origin) {
    body.debug.origin = "vps";
  }

  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "X-Domovoy-Origin": "vps",
  });
  res.end(JSON.stringify(body));
}

// ---------- HTTP Server ----------
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token");
  
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "X-Domovoy-Origin": "vps",
    });
    res.end("");
    return;
  }
  
  // Support POST /admin/domovoy, POST /admin/direct, GET /admin/health/*
  const parsedUrl = url.parse(req.url, true);
  const isDomovoy = parsedUrl.pathname === "/admin/domovoy";
  const isDirect = parsedUrl.pathname === "/admin/direct";
  const isHealthNews = parsedUrl.pathname === "/admin/health/news";
  const isHealthDomovoy = parsedUrl.pathname === "/admin/health/domovoy";
  const isHealth = isHealthNews || isHealthDomovoy;
  
  if (!isDomovoy && !isDirect && !isHealth) {
    sendJson(res, 404, {
      ok: false,
      error: "Not Found",
    });
    return;
  }
  
  if (isHealth && req.method !== "GET") {
    sendJson(res, 405, {
      ok: false,
      error: "Method Not Allowed",
    });
    return;
  }
  
  if (!isHealth && req.method !== "POST") {
    sendJson(res, 404, {
      ok: false,
      error: "Not Found",
    });
    return;
  }
  
  // Check token (case-insensitive header lookup, trim whitespace)
  const tokenRaw = req.headers["x-admin-token"] || req.headers["X-Admin-Token"];
  const token = tokenRaw ? tokenRaw.trim() : null;
  const expectedToken = ADMIN_API_TOKEN ? ADMIN_API_TOKEN.trim() : null;
  
  if (!expectedToken) {
    sendJson(res, 500, {
      ok: false,
      error: "server_token_missing",
      message: "ADMIN_API_TOKEN is not configured on the server",
    });
    return;
  }
  
  if (!token || token !== expectedToken) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  if (isHealth) {
    try {
      if (isHealthNews) {
        const fetchMetrics = await fetchDbValue("/health/news/fetchNewsLastRun");
        const cronMetrics = await fetchDbValue("/health/news/newsCronLastRun");
        const lastRunTs = maxTimestamp([fetchMetrics?.ts, cronMetrics?.ts]);
        const lastRunIso = lastRunTs ? new Date(lastRunTs).toISOString() : null;

        sendJson(res, 200, {
          ok: true,
          service: "news",
          ts: nowIso(),
          lastRun: lastRunIso,
          details: {
            fetch: fetchMetrics || null,
            cron: cronMetrics || null,
          },
        });
        return;
      }

      if (isHealthDomovoy) {
        const autoPostMetrics = await fetchDbValue("/health/domovoy/autoPostLastRun");
        const autoReplyMetrics = await fetchDbValue("/health/domovoy/autoReplyLastRun");
        const lastRunTs = maxTimestamp([autoPostMetrics?.ts, autoReplyMetrics?.ts]);
        const lastRunIso = lastRunTs ? new Date(lastRunTs).toISOString() : null;

        sendJson(res, 200, {
          ok: true,
          service: "domovoy",
          ts: nowIso(),
          lastRun: lastRunIso,
          details: {
            autoPost: autoPostMetrics || null,
            autoReply: autoReplyMetrics || null,
          },
        });
        return;
      }
    } catch (e) {
      sendJson(res, 500, {
        ok: false,
        error: "health_fetch_failed",
        message: e.message || "Failed to read health metrics",
      });
      return;
    }
  }

  if (!hasJsonContentType(req)) {
    sendJson(res, 415, {
      ok: false,
      error: "unsupported_media_type",
      message: "Content-Type must include application/json",
    });
    return;
  }

  parseJsonBody(req, res, async (data) => {
    try {
      const text = (data.text || "").toString().trim();
      const history = Array.isArray(data.history) ? data.history : [];
      const action = (data.action || "").toString().trim();
      
      // Validate mode (default to "direct" if missing or invalid)
      const modeRaw = data.mode;
      const validModes = ["ops", "strategy", "direct"];
      const mode = validModes.includes(modeRaw) ? modeRaw : "direct";

      // For /admin/direct or mode=direct: force threadId = "ruslan-direct"
      // For ops/strategy: use incoming threadId or default to ruslan-main
      const isDirectMode = isDirect || mode === "direct";
      const threadId = isDirectMode
        ? "ruslan-direct" 
        : getEffectiveThreadId(data.threadId || DEFAULT_THREAD_ID);

      if (action === "snapshot:report") {
        const stabilityResult = await runStabilityReport();
        const { report, reportError, saved, telemetry } = stabilityResult;
        if (!report) {
          const isMissingKey =
            reportError && String(reportError.message || "").includes("OPENAI_API_KEY");
          sendJson(res, 500, {
            ok: false,
            error: isMissingKey ? "openai_key_missing" : "stability_report_failed",
            message: isMissingKey
              ? "OPENAI_API_KEY отсутствует на VPS"
              : reportError?.message || "Failed to generate stability report",
            saved: {
              telemetry: saved?.telemetryLatest || null,
            },
          });
          return;
        }

        const summary = {
          processes: telemetry?.pm2?.processes?.length ?? 0,
          repoClean: telemetry?.repo?.clean ?? null,
          loadavg1: telemetry?.cpu?.loadavg1 ?? null,
        };

        sendJson(res, 200, {
          ok: true,
          reportMd: report.reportMd,
          saved: {
            telemetry: saved?.telemetryLatest || null,
            report: saved?.reportLatestMd || null,
            metadata: saved?.reportLatestJson || null,
          },
          summary,
          ts: new Date().toISOString(),
          debug: {
            origin: "vps",
            mode: "snapshot:report",
            model: report.model,
          },
        });
        return;
      }

      if (action === "snapshot:download") {
        const name = (data.name || "").toString().trim();
        const allowed = SNAPSHOT_DOWNLOAD_ALLOWLIST[name];
        if (!allowed) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_name",
            message: "File name is not allowed",
          });
          return;
        }

        try {
          if (!fs.existsSync(allowed.fullPath)) {
            sendJson(res, 404, {
              ok: false,
              error: "not_found",
              message: "File not found",
            });
            return;
          }

          const fileBuffer = fs.readFileSync(allowed.fullPath);
          res.writeHead(200, {
            "Content-Type": allowed.contentType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${allowed.filename}"`,
            "Cache-Control": "no-store",
          });
          res.end(fileBuffer);
        } catch (e) {
          sendJson(res, 500, {
            ok: false,
            error: "download_failed",
            message: "Failed to read requested file",
          });
        }
        return;
      }

      if (action === "stability:report") {
        try {
          const stabilityResult = await runStabilityReport();
          const { report, reportError, saved, telemetry } = stabilityResult;
          if (!report) {
            const isMissingKey =
              reportError && String(reportError.message || "").includes("OPENAI_API_KEY");
            sendJson(res, 500, {
              ok: false,
              error: isMissingKey ? "openai_key_missing" : "stability_report_failed",
              message: isMissingKey
                ? "OPENAI_API_KEY отсутствует на VPS"
                : reportError?.message || "Failed to generate stability report",
              saved: {
                telemetry: saved?.telemetryLatest || null,
              },
            });
            return;
          }

          const summary = {
            processes: telemetry?.pm2?.processes?.length ?? 0,
            repoClean: telemetry?.repo?.clean ?? null,
            loadavg1: telemetry?.cpu?.loadavg1 ?? null,
          };

          sendJson(res, 200, {
            ok: true,
            reportMd: report.reportMd,
            saved: {
              telemetry: saved?.telemetryLatest || null,
              report: saved?.reportLatestMd || null,
              metadata: saved?.reportLatestJson || null,
            },
            summary,
            ts: new Date().toISOString(),
            debug: {
              origin: "vps",
              mode: "stability:report",
              model: report.model,
            },
          });
        } catch (e) {
          sendJson(res, 502, {
            ok: false,
            error: "stability_report_failed",
            message: e.message || "Failed to generate stability report",
          });
        }
        return;
      }

      if (action === "ops:status") {
        const opsStatus = collectOpsStatus();
        sendJson(res, 200, {
          ok: true,
          status: {
            gitClean: opsStatus.gitClean,
            headSha: opsStatus.headSha,
            pm2: opsStatus.pm2,
            snapshotMtime: opsStatus.snapshotMtime,
            stabilityReportMtime: opsStatus.stabilityReportMtime,
            snapshotLastRun: opsStatus.snapshotLastRun,
          },
          debug: {
            origin: "vps",
            mode: "ops:status",
          },
        });
        return;
      }
      
      // Validate question length (4k-8k chars limit)
      if (!text) {
        sendJson(res, 400, {
          ok: false,
          error: "Text is required",
          message: "Request body must include 'text' field",
        });
        return;
      }
      
      if (text.length > 8000) {
        sendJson(res, 400, {
          ok: false,
          error: "Text too long",
          message: "Question must be 8000 characters or less",
        });
        return;
      }
      
      if (text.length < 1) {
        sendJson(res, 400, {
          ok: false,
          error: "Text too short",
          message: "Question must be at least 1 character",
        });
        return;
      }

      if (isDirectMode) {
        try {
          await sanitizeDirectThreadIfNeeded(threadId);
        } catch (e) {
          console.warn("[direct-sanitize] failed:", e.message);
        }
      }

      // Log user message to RTDB (best-effort, non-fatal on error)
      const requestTs = Date.now();
      try {
        await logUserMessage({
          threadId,
          text,
          ts: requestTs,
          origin: "admin-ui",
        });
      } catch (e) {
        console.warn(
          "[admin-domovoy-api] Failed to log user message to RTDB:",
          e.message,
        );
      }
      
      // For /admin/direct: skip domovoy-specific logic, go straight to OpenAI
      if (isDirectMode) {
        // Load memory pack (mode-aware filtering)
        let memoryPack;
        try {
          memoryPack = await buildMemoryPack(threadId, "direct");
        } catch (e) {
          console.error("[admin-domovoy-api] Memory pack loading error:", e);
          sendJson(res, 500, {
            ok: false,
            error: "context_missing",
            message: `Failed to load memory pack: ${e.message}`,
            debugHint: "Check docs/, runbooks/ and Firebase admin credentials in PROJECT_DIR",
          });
          return;
        }
        
        if (!memoryPack.memoryFiles || memoryPack.memoryFiles.length === 0) {
          sendJson(res, 500, {
            ok: false,
            error: "context_missing",
            message: "Memory pack is empty or not found",
            debugHint: "Check docs/ files exist",
          });
          return;
        }
        
        // Build context from memory files
        const contextBlocks = memoryPack.memoryFiles.map(file => 
          `=== ${file.name} ===\n\n${file.content}\n\n`
        ).join("\n---\n\n");
        
        // Build messages array for direct mode
        const messages = [];

        const docsBase = path.join(PROJECT_DIR, "docs");
        const directPrompt = loadPromptFile(
          path.join(docsBase, "ADMIN_ASSISTANT_DIRECT.md"),
          path.join(docsBase, "ADMIN_ASSISTANT.md"),
        );

        // System prompt for Direct Admin Chat
        messages.push({
          role: "system",
          content: HONESTY_SYSTEM_RULE,
        });
        messages.push({
          role: "system",
          content: directPrompt,
        });
        
        // Add conversation history (last 20 messages)
        const recentHistory = history.slice(-20);
        for (const msg of recentHistory) {
          if (msg.role && msg.content && (msg.role === "user" || msg.role === "assistant")) {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
        
        // Add current question with context
        messages.push({
          role: "user",
          content: `Полная проектная память (Memory Pack):

${contextBlocks}

---

Вопрос администратора:
${text}`
        });
        
        if (!OPENAI_API_KEY) {
          sendJson(res, 500, {
            ok: false,
            error: "OPENAI_API_KEY is not configured",
            message: "OpenAI API key is missing in environment variables",
            debugHint: "Set OPENAI_API_KEY in VPS .env file",
          });
          return;
        }

        // Call OpenAI
        const completion = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0.5,
          }),
        });
        
        if (!completion.ok) {
          const errorText = await completion.text().catch(() => "");
          console.error(
            "[admin-domovoy-api] OpenAI error:",
            completion.status,
            errorText.slice(0, 200),
          );
          sendJson(res, 502, {
            ok: false,
            error: "openai_failed",
            message: `OpenAI API returned status ${completion.status}`,
            debugHint: "Check OPENAI_API_KEY and API quota",
          });
          return;
        }
        
        const completionData = await completion.json();
        let answer =
          completionData.choices?.[0]?.message?.content ||
          "Не удалось получить ответ от OpenAI.";
        
        if (!answer || answer.trim().length === 0) {
          sendJson(res, 502, {
            ok: false,
            error: "openai_empty_response",
            message: "OpenAI returned an empty response",
            debugHint: "Check OpenAI API response structure",
          });
          return;
        }
        
        // Log assistant message and increment pairCount (best-effort)
        let logResult = null;
        try {
          logResult = await logAssistantMessageAndIncrementPair({
            threadId,
            text: answer,
            ts: Date.now(),
            origin: "vps-direct",
          });
        } catch (e) {
          console.warn(
            "[admin-domovoy-api] Failed to log assistant message to RTDB:",
            e.message,
          );
        }
        
        // Success response for direct mode
        sendJson(res, 200, {
          ok: true,
          answer: answer,
          debug: {
            origin: "vps",
            mode: "direct",
            threadId,
            filesLoaded: memoryPack.filesLoaded,
            memoryBytes: memoryPack.totalChars,
            pairCount: logResult && typeof logResult.pairCount === "number"
              ? logResult.pairCount
              : null,
          },
        });
        return;
      }
      
      // Detect general questions for ops mode (before loading memory)
      if (mode === "ops") {
        const normalizedText = text.toLowerCase().trim();
        const generalQuestionPatterns = [
          /^что делать дальше/i,
          /^что дальше/i,
          /^что улучшить/i,
          /^next/i,
          /^дальше/i,
          /^что делать$/i,
          /^что можно сделать$/i,
          /^что нужно сделать$/i,
        ];
        
        const isGeneralQuestion = generalQuestionPatterns.some(pattern => 
          pattern.test(normalizedText) && normalizedText.length < 50
        );
        
        if (isGeneralQuestion) {
          const generalResponse = `Критичных проблем не видно.

Выбери цель: (A) админка/домовой (B) форум/UX (C) контент/постинг

Назови букву — дам один шаг.`;
          
          // Log assistant message
          try {
            await logAssistantMessageAndIncrementPair({
              threadId,
              text: generalResponse,
              ts: Date.now(),
              origin: "vps-admin",
            });
          } catch (e) {
            console.warn("[admin-domovoy-api] Failed to log general response:", e.message);
          }
          
          sendJson(res, 200, {
            ok: true,
            answer: generalResponse,
            debug: {
              filesLoaded: [],
              memoryBytes: 0,
              threadId,
              mode: mode,
              generalQuestionDetected: true,
            },
          });
          return;
        }
        
        // Handle A/B/C selection after general question
        const choicePattern = /^(выбираю|выбираем|выберу|выберём|выбрал|выбрали|выбрала|выбрало|a|b|c|а|б|в)$/i;
        if (choicePattern.test(normalizedText)) {
          // Let it through to OpenAI, but add instruction to give ONE step for chosen area
          // This will be handled by the system prompt
        }
      }
      
      // Load memory pack (docs + snapshots + admin RTDB context)
      let memoryPack;
      try {
        memoryPack = await buildMemoryPack(threadId, mode);
      } catch (e) {
        console.error("[admin-domovoy-api] Memory pack loading error:", e);
        sendJson(res, 500, {
          ok: false,
          error: "context_missing",
          message: `Failed to load memory pack: ${e.message}`,
          debugHint: "Check docs/, runbooks/ and Firebase admin credentials in PROJECT_DIR",
        });
        return;
      }
      
      if (!memoryPack.memoryFiles || memoryPack.memoryFiles.length === 0) {
        sendJson(res, 500, {
          ok: false,
          error: "context_missing",
          message: "Memory pack is empty or not found",
          debugHint: "Check docs/ADMIN_ASSISTANT.md exists",
        });
        return;
      }
      
      // Collect OPS STATUS (real-time checks, authoritative)
      const opsStatus = collectOpsStatus();
      
      // Build context from memory files
      const contextBlocks = memoryPack.memoryFiles.map(file => 
        `=== ${file.name} ===\n\n${file.content}\n\n`
      ).join("\n---\n\n");
      
      // Build messages array
      const messages = [];
      
      // System prompt (mode-aware)
      const docsBase = path.join(PROJECT_DIR, "docs");
      const opsPrompt = mode === "ops"
        ? loadPromptFile(
            path.join(docsBase, "ADMIN_ASSISTANT_OPS.md"),
            path.join(docsBase, "ADMIN_ASSISTANT.md"),
          )
        : `РЕЖИМ: СТРАТЕГИЯ
- Можно предлагать идеи улучшений и планы
- МАКСИМУМ 3 пункта улучшений
- Привязка к текущей архитектуре NovaCiv
- БЕЗ предложений "установить 10 инструментов"
- Использовать, когда нет пожара и хочется развитие
- Можно структурировать ответ с разделами, но кратко`;

      messages.push({
        role: "system",
        content: HONESTY_SYSTEM_RULE,
      });
      messages.push({
        role: "system",
        content: `Ты — Admin Domovoy: OPS brain и системный хранитель проекта NovaCiv.
Ты НЕ философский чат. Ты операционный мозг системы.

ТВОЯ РОЛЬ:
- Ты знаешь архитектуру: Netlify ↔ VPS ↔ Firebase ↔ PM2
- Ты знаешь failure modes и recovery procedures
- Ты знаешь текущие приоритеты и workflow rules
- Ты отвечаешь как системный оператор, не как философ

ПОЛЬЗОВАТЕЛЬ:
- Пользователь — Руслан, основатель и оператор NovaCiv
- Владелец novaciv.space, управляет GitHub/Netlify/VPS
- Когда спрашивает "кто я?" — отвечай: проектная роль (founder/operator), НЕ личные данные
- Thread ID по умолчанию: ruslan-main

КРИТИЧЕСКИ ВАЖНО — OPS STATUS (GROUND TRUTH):
- OPS STATUS блок содержит РЕАЛЬНЫЕ проверки системы в момент запроса
- OPS STATUS — это ИСТИНА, а НЕ память или предположения
- Ты ДОЛЖЕН использовать OPS STATUS как источник истины для статуса VPS
- Если gitClean=true в OPS STATUS — НЕ говори "dirty" или "RED FLAG"
- Если gitClean=false в OPS STATUS — говори "dirty" и предложи действия (без секретов)
- OPS STATUS обновляется при каждом запросе, это актуальные данные

${opsPrompt}

ПРАВИЛА ОТВЕТОВ (общие):
- Отвечай как спокойный человеческий помощник
- Используй OPS STATUS как источник истины для статуса VPS
- Используй memory pack (docs + snapshot + RTDB history) для контекста
- НИКОГДА не печатай секреты, токены, ключи, пароли
- Если данных нет в memory pack — честно скажи, не выдумывай
- Стиль: человеческий, спокойный, конкретный

КОГДА СПРАШИВАЮТ "кто я?":
- Отвечай: "Ты Руслан, основатель и оператор проекта NovaCiv, владелец novaciv.space, управляешь GitHub/Netlify/VPS."
- НЕ утверждай доступ к личным данным
- Фокус на проектной роли и операционной идентичности

КОГДА СПРАШИВАЮТ "какая сейчас стадия администрирования?" или "покажи кратко ops status":
- Проверь OPS STATUS (gitClean, pm2, snapshotMtime)
- Покажи краткий список:
  * VPS: OK (gitClean true/false)
  * PM2: список процессов (name, online/offline, restarts, uptime)
  * Snapshot mtime
- Затем добавь одно короткое человеческое предложение:
  * Если всё OK: "Всё ровно, ничего делать не нужно."
  * Если не OK: одна строка диагноза + спроси, хочет ли пользователь auto-fix задачу
- НЕ добавляй автоматически "Следующие действия" если пользователь не просит план`
      });
      
      // Add conversation history (last 20 messages)
      const recentHistory = history.slice(-20);
      for (const msg of recentHistory) {
        if (msg.role && msg.content && (msg.role === "user" || msg.role === "assistant")) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      
      // Add current question with context (OPS STATUS BEFORE memory pack)
      const opsStatusBlock = formatOpsStatusBlock(opsStatus);
      messages.push({
        role: "user",
        content: `${opsStatusBlock}

---

Полная проектная память (Memory Pack):

${contextBlocks}

---

Вопрос администратора:
${text}`
      });
      
      if (!OPENAI_API_KEY) {
        sendJson(res, 500, {
          ok: false,
          error: "OPENAI_API_KEY is not configured",
          message: "OpenAI API key is missing in environment variables",
          debugHint: "Set OPENAI_API_KEY in VPS .env file",
        });
        return;
      }

      // Call OpenAI
      const completion = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: messages,
          temperature: 0.5,
        }),
      });
      
      if (!completion.ok) {
        const errorText = await completion.text().catch(() => "");
        console.error(
          "[admin-domovoy-api] OpenAI error:",
          completion.status,
          errorText.slice(0, 200),
        );
        sendJson(res, 502, {
          ok: false,
          error: "openai_failed",
          message: `OpenAI API returned status ${completion.status}`,
          debugHint: "Check OPENAI_API_KEY and API quota",
        });
        return;
      }
      
      const completionData = await completion.json();
      let answer =
        completionData.choices?.[0]?.message?.content ||
        "Не удалось получить ответ от OpenAI.";
      
      if (!answer || answer.trim().length === 0) {
        sendJson(res, 502, {
          ok: false,
          error: "openai_empty_response",
          message: "OpenAI returned an empty response",
          debugHint: "Check OpenAI API response structure",
        });
        return;
      }
      
      // Log assistant message and increment pairCount (best-effort)
      let logResult = null;
      try {
        logResult = await logAssistantMessageAndIncrementPair({
          threadId,
          text: answer,
          ts: Date.now(),
          origin: "vps-admin",
        });
      } catch (e) {
        console.warn(
          "[admin-domovoy-api] Failed to log assistant message to RTDB:",
          e.message,
        );
      }

      // Trigger summarizer if thresholds are met (non-blocking failure)
      let summarizerResult = null;
      try {
        if (OPENAI_API_KEY) {
          const summarizerClient = async ({ role, content }) => {
            const resp = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role, content }],
                temperature: 0.2,
              }),
            });
            if (!resp.ok) {
              const txt = await resp.text().catch(() => "");
              console.warn(
                "[admin-domovoy-api] Summarizer OpenAI error:",
                resp.status,
                txt.slice(0, 200),
              );
              return "";
            }
            const data = await resp.json();
            return data.choices?.[0]?.message?.content || "";
          };

          summarizerResult = await checkAndSummarizeThread({
            threadId,
            minNewPairs: 100,
            level1MergeThreshold: 10,
            openAiClient: summarizerClient,
          });
        }
      } catch (e) {
        console.warn(
          "[admin-domovoy-api] Hierarchical summarizer failed:",
          e.message,
        );
      }
      
      // Success response
      sendJson(res, 200, {
        ok: true,
        answer: answer,
        debug: {
          filesLoaded: memoryPack.filesLoaded,
          memoryBytes: memoryPack.totalChars,
          threadId,
          mode: mode, // Include mode in debug for verification
          pairCount: logResult && typeof logResult.pairCount === "number"
            ? logResult.pairCount
            : null,
          lastSummaryTs: memoryPack.lastSummaryTs || null,
          summariesIncluded: memoryPack.summaryCount,
          recentPairsIncluded: memoryPack.recentPairCount,
          summarizerRan: summarizerResult ? !!summarizerResult.ran : false,
          ops: {
            gitClean: opsStatus.gitClean,
            headSha: opsStatus.headSha,
            pm2: opsStatus.pm2,
            snapshotMtime: opsStatus.snapshotMtime,
          },
        },
      });
      
    } catch (e) {
      console.error("[admin-domovoy-api] Handler error:", e);
      sendJson(res, 500, {
        ok: false,
        error: "Internal Server Error",
        message: e.message || "Unknown error",
        debugHint: "Check server logs for details",
      });
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`[admin-domovoy-api] Server listening on port ${PORT}`);
  console.log(`[admin-domovoy-api] Endpoint: POST http://localhost:${PORT}/admin/domovoy`);
  console.log(`[admin-domovoy-api] Endpoint: POST http://localhost:${PORT}/admin/direct`);
  console.log(`[admin-domovoy-api] PROJECT_DIR: ${PROJECT_DIR}`);
  
  if (!ADMIN_API_TOKEN) {
    console.warn("[admin-domovoy-api] WARNING: ADMIN_API_TOKEN not set!");
  }
  if (!OPENAI_API_KEY) {
    console.warn("[admin-domovoy-api] WARNING: OPENAI_API_KEY not set!");
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[admin-domovoy-api] SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("[admin-domovoy-api] Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[admin-domovoy-api] SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("[admin-domovoy-api] Server closed");
    process.exit(0);
  });
});
