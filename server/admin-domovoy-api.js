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

// ---------- Memory cache (static docs + snapshot) ----------
let staticMemoryCache = null;

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

// ---------- Helper: Collect OPS STATUS (real-time checks) ----------
function collectOpsStatus() {
  const ops = {
    gitClean: null,
    headSha: null,
    pm2: [],
    snapshotMtime: null,
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

    // Get PM2 summary (filtered to names + status + restarts + uptimeSeconds)
    try {
      const pm2List = execSync("pm2 jlist", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const pm2Processes = JSON.parse(pm2List);
      ops.pm2 = pm2Processes.map((proc) => ({
        name: proc.name || null,
        status: proc.pm2_env?.status || null,
        restarts: proc.pm2_env?.restart_time || 0,
        uptimeSeconds: proc.pm2_env?.pm_uptime ? Math.floor((Date.now() - proc.pm2_env.pm_uptime) / 1000) : null,
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
function buildStaticMemoryFiles() {
  if (staticMemoryCache !== null) return staticMemoryCache;

  const docsBase = path.join(PROJECT_DIR, "docs");
  const runbooksBase = path.join(PROJECT_DIR, "runbooks");
  const stateBase = path.join(PROJECT_DIR, "_state");
  
  const memoryFiles = [];
  const MAX_TOTAL_CHARS = 120000;
  
  // Priority 1: Critical files (always include)
  const criticalFiles = [
    { path: path.join(docsBase, "MEMORY_BRIEF_ADMIN.md"), name: "MEMORY_BRIEF_ADMIN.md" },
    { path: path.join(docsBase, "ADMIN_ASSISTANT.md"), name: "ADMIN_ASSISTANT.md" },
    { path: path.join(docsBase, "PROJECT_CONTEXT.md"), name: "PROJECT_CONTEXT.md" },
    { path: path.join(docsBase, "PROJECT_STATE.md"), name: "PROJECT_STATE.md" },
  ];
  
  // Priority 2: Important files (include if space allows)
  const importantFiles = [
    { path: path.join(docsBase, "START_HERE.md"), name: "START_HERE.md" },
    { path: path.join(docsBase, "RUNBOOKS.md"), name: "RUNBOOKS.md" },
    { path: path.join(runbooksBase, "SOURCE_OF_TRUTH.md"), name: "runbooks/SOURCE_OF_TRUTH.md" },
  ];
  
  // Priority 3: System snapshot (tail last 250 lines if exists)
  const snapshotPath = path.join(stateBase, "system_snapshot.md");
  
  let totalChars = 0;
  
  // Load critical files
  for (const file of criticalFiles) {
    const content = loadFile(file.path);
    if (content) {
      const sanitized = sanitizeContent(content);
      memoryFiles.push({ name: file.name, content: sanitized });
      totalChars += sanitized.length;
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
          content: sanitized.slice(0, remaining) + "\n\n[... truncated ...]" 
        });
        totalChars = MAX_TOTAL_CHARS;
        break;
      }
    }
  }
  
  // Load snapshot (tail 250 lines) if space allows
  if (totalChars < MAX_TOTAL_CHARS && fs.existsSync(snapshotPath)) {
    try {
      const snapshotContent = loadFile(snapshotPath);
      if (snapshotContent) {
        const lines = snapshotContent.split("\n");
        const tailLines = lines.slice(-250).join("\n");
        const sanitized = sanitizeContent(tailLines);
        const remaining = MAX_TOTAL_CHARS - totalChars;
        
        if (sanitized.length <= remaining) {
          memoryFiles.push({ 
            name: "_state/system_snapshot.md (tail 250 lines)", 
            content: sanitized 
          });
          totalChars += sanitized.length;
        } else if (remaining > 100) {
          memoryFiles.push({ 
            name: "_state/system_snapshot.md (tail, truncated)", 
            content: sanitized.slice(0, remaining) + "\n\n[... truncated ...]" 
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

  return staticMemoryCache;
}

// ---------- Build full Memory Pack (docs + snapshots + admin summaries/history) ----------
async function buildMemoryPack(threadIdRaw) {
  const staticPack = buildStaticMemoryFiles();

  let adminContext = null;
  try {
    adminContext = await buildAdminMemoryContext({
      threadId: threadIdRaw || DEFAULT_THREAD_ID,
      maxPairs: 20,
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

  if (adminContext) {
    const { summaryText, recentPairsText } = adminContext;
    summaryCount = adminContext.summaryCount || 0;
    recentPairCount = adminContext.recentPairCount || 0;
    lastSummaryTs = adminContext.lastSummaryTs || null;

    if (summaryText && summaryText.trim().length > 0) {
      memoryFiles.push({
        name: "adminConversations/summaries",
        content: summaryText,
      });
    }

    if (recentPairsText && recentPairsText.trim().length > 0) {
      memoryFiles.push({
        name: "adminConversations/recentPairs",
        content: recentPairsText,
      });
    }
  }

  const filesLoaded = memoryFiles.map((f) => f.name);
  const totalChars = memoryFiles.reduce(
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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token");
  
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "X-Domovoy-Origin": "vps",
    });
    res.end("");
    return;
  }
  
  // Only POST /admin/domovoy
  const parsedUrl = url.parse(req.url, true);
  if (req.method !== "POST" || parsedUrl.pathname !== "/admin/domovoy") {
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
  
  if (!expectedToken || !token || token !== expectedToken) {
    sendJson(res, 401, {
      ok: false,
      error: "unauthorized",
      message: "Invalid or missing X-Admin-Token header",
    });
    return;
  }
  
  // Check OpenAI key
  if (!OPENAI_API_KEY) {
    sendJson(res, 500, {
      ok: false,
      error: "OPENAI_API_KEY is not configured",
      message: "OpenAI API key is missing in environment variables",
      debugHint: "Set OPENAI_API_KEY in VPS .env file",
    });
    return;
  }
  
  // Parse body
  let body = "";
  req.on("data", chunk => { body += chunk.toString(); });
  
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}");
      const text = (data.text || "").toString().trim();
      const history = Array.isArray(data.history) ? data.history : [];
      const threadId = getEffectiveThreadId(data.threadId || DEFAULT_THREAD_ID);
      // Validate mode (default to "ops" if missing or invalid)
      const modeRaw = data.mode;
      const validModes = ["ops", "strategy"];
      const mode = validModes.includes(modeRaw) ? modeRaw : "ops";
      
      if (!text) {
        sendJson(res, 400, {
          ok: false,
          error: "Text is required",
          message: "Request body must include 'text' field",
        });
        return;
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
      
      // Load memory pack (docs + snapshots + admin RTDB context)
      let memoryPack;
      try {
        memoryPack = await buildMemoryPack(threadId);
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
      const modeInstructions = mode === "ops" 
        ? `РЕЖИМ: ОПЕРАТИВКА
- Отвечай КРАТКО и по делу
- Формат: текущая проблема/симптом → причина → ОДИН следующий шаг
- ЗАПРЕЩЕНО предлагать инфраструктурные рекомендации (Grafana/Prometheus/GA/CI/CD/Trello/Jira/мониторинг/установка инструментов), если пользователь явно не просит
- Без длинных списков действий
- Без автоматических разделов "Следующие действия"
- Фокус: текущая ошибка/симптом → причина → 1 следующий шаг

СПЕЦИАЛЬНАЯ ОБРАБОТКА "что делать дальше":
- Если пользователь спрашивает "что делать дальше" или "что дальше" БЕЗ конкретной проблемы:
  * Отвечай: "Критичных проблем не видно"
  * Затем: "Выбери цель на сегодня: (A) стабильность админки/домового (B) форум/UX (C) контент/видео/постинг"
  * Затем: "Назови букву — дам один следующий шаг"
  * НЕ предлагай установку инструментов, мониторинг, CI/CD или другие инфраструктурные решения`
        : `РЕЖИМ: СТРАТЕГИЯ
- Можно предлагать идеи улучшений и планы
- МАКСИМУМ 3 пункта улучшений
- Привязка к текущей архитектуре NovaCiv
- БЕЗ предложений "установить 10 инструментов"
- Использовать, когда нет пожара и хочется развитие
- Можно структурировать ответ с разделами, но кратко`;
      
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

${modeInstructions}

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
      const answer =
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
