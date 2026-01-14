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
      
      // Build context from memory files
      const contextBlocks = memoryPack.memoryFiles.map(file => 
        `=== ${file.name} ===\n\n${file.content}\n\n`
      ).join("\n---\n\n");
      
      // Build messages array
      const messages = [];
      
      // System prompt
      messages.push({
        role: "system",
        content: `Ты — административный помощник для проекта NovaCiv.
Ты в ADMIN_MODE, пользователь — администратор с полным доступом к проектной памяти.
Твоя задача — отвечать на вопросы администратора на основе полного контекста проекта.

ПРАВИЛА:
- Отвечай кратко, структурированно и по делу
- Это read-only режим: никаких действий, только информация
- НИКОГДА не печатай секреты, токены, ключи, пароли
- Если информации нет в предоставленном контексте, честно скажи, что данных нет, но не выдумывай
- Можешь обсуждать: ops, код, инфраструктуру, runbooks, серверные процессы, политики
- Держи ответы короткими и actionable`
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
      
      // Get snapshot mtime if exists
      const snapshotPath = path.join(PROJECT_DIR, "_state", "system_snapshot.md");
      let snapshotMtime = null;
      try {
        if (fs.existsSync(snapshotPath)) {
          const stats = fs.statSync(snapshotPath);
          snapshotMtime = stats.mtime.toISOString();
        }
      } catch (e) {
        // Ignore
      }
      
      // Success response
      sendJson(res, 200, {
        ok: true,
        answer: answer,
        debug: {
          filesLoaded: memoryPack.filesLoaded,
          snapshotMtime: snapshotMtime,
          memoryBytes: memoryPack.totalChars,
          threadId,
          pairCount: logResult && typeof logResult.pairCount === "number"
            ? logResult.pairCount
            : null,
          lastSummaryTs: memoryPack.lastSummaryTs || null,
          summariesIncluded: memoryPack.summaryCount,
          recentPairsIncluded: memoryPack.recentPairCount,
          summarizerRan: summarizerResult ? !!summarizerResult.ran : false,
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
