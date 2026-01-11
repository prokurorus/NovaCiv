// server/ops-agent.js
//
// GitHub Ops Agent для NovaCiv
// Автоматически обрабатывает Issues с меткой "ops" и выполняет безопасные команды
//
// Что делает:
// 1) Проверяет GitHub Issues с меткой "ops" каждые 60 секунд
// 2) Парсит команду из Issue (title или body)
// 3) Выполняет команды из whitelist
// 4) Делает изменения через git (commit, push, PR)
// 5) Комментирует Issue с результатами

const path = require("path");
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(__dirname, '..', '.env') : '/root/NovaCiv/.env');
require("dotenv").config({ path: envPath });

const axios = require("axios");
const { execSync } = require("child_process");
const fs = require("fs");

// --- Конфигурация --- //

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PROJECT_DIR = process.env.PROJECT_DIR || "/root/NovaCiv";
const CHECK_INTERVAL = 60000; // 60 секунд

const GITHUB_API_BASE = "https://api.github.com";

// Автоматическое определение owner/repo из git remote
function getGitHubRepo() {
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      cwd: PROJECT_DIR,
      encoding: "utf8",
    }).trim();
    
    // Поддерживаем разные форматы:
    // - https://github.com/owner/repo.git
    // - git@github.com:owner/repo.git
    // - https://github.com/owner/repo
    const match = remoteUrl.match(/(?:github\.com[/:]|@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch (error) {
    // Ignore
  }
  
  // Fallback на переменные окружения или дефолты
  return {
    owner: process.env.GITHUB_OWNER || "NovaCiv",
    repo: process.env.GITHUB_REPO || "NovaCiv"
  };
}

const { owner: GITHUB_OWNER, repo: GITHUB_REPO } = getGitHubRepo();

// Whitelist безопасных команд
const COMMAND_WHITELIST = {
  "report:status": {
    description: "Показать статус системы (PM2, процессы, git)",
    handler: handleReportStatus,
    needsGit: false,
    needsPr: false
  },
  "video:validate": {
    description: "Валидировать конфигурацию видео-пайплайна",
    handler: handleVideoValidate,
    needsGit: false,
    needsPr: false
  },
  "youtube:refresh-test": {
    description: "Проверить обновление YouTube токена",
    handler: handleYoutubeRefreshTest,
    needsGit: false,
    needsPr: false
  },
  "worker:restart": {
    description: "Перезапустить PM2 worker",
    handler: handleWorkerRestart,
    needsGit: false,
    needsPr: false
  },
  "pipeline:run-test-job": {
    description: "Создать тестовую задачу для пайплайна",
    handler: handlePipelineTestJob,
    needsGit: false,
    needsPr: false
  },
  "snapshot": {
    description: "Получить последний системный snapshot (без секретов)",
    handler: handleSnapshot,
    needsGit: false,
    needsPr: false
  },
  "snapshot:get": {
    description: "Получить последний системный snapshot (без секретов) [deprecated, use 'snapshot']",
    handler: handleSnapshot,
    needsGit: false,
    needsPr: false
  }
};

// Кэш обработанных Issues (чтобы не обрабатывать повторно)
const processedIssues = new Set();

const logger = console;

// --- GitHub API --- //

/**
 * Создает комментарий в Issue
 */
async function commentIssue(issueNumber, body) {
  if (!GITHUB_TOKEN) {
    logger.error("[ops-agent] GITHUB_TOKEN not set");
    return;
  }

  try {
    await axios.post(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}/comments`,
      { body },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    logger.log(`[ops-agent] Commented on issue #${issueNumber}`);
  } catch (error) {
    logger.error(`[ops-agent] Failed to comment on issue #${issueNumber}:`, error.response?.data || error.message);
  }
}

/**
 * Получает Issues с меткой "ops"
 */
async function getOpsIssues() {
  if (!GITHUB_TOKEN) {
    logger.error("[ops-agent] GITHUB_TOKEN not set");
    return [];
  }

  try {
    const response = await axios.get(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        params: {
          labels: "ops",
          state: "open",
          sort: "created",
          direction: "desc",
        },
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    return response.data || [];
  } catch (error) {
    logger.error("[ops-agent] Failed to fetch issues:", error.response?.data || error.message);
    return [];
  }
}

/**
 * Обновляет метки Issue
 */
async function addLabel(issueNumber, label) {
  if (!GITHUB_TOKEN) return;

  try {
    await axios.post(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}/labels`,
      { labels: [label] },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
  } catch (error) {
    logger.error(`[ops-agent] Failed to add label to issue #${issueNumber}:`, error.response?.data || error.message);
  }
}

// --- Обработчики команд --- //

/**
 * Парсит команду из Issue
 */
function parseCommand(issue) {
  const title = issue.title || "";
  const body = issue.body || "";

  // Ищем команду в формате: "команда:опция" или "/команда"
  const commandMatch = title.match(/(\w+:\w+|\/\w+)/) || body.match(/(\w+:\w+|\/\w+)/);
  if (commandMatch) {
    return commandMatch[1].replace("/", "");
  }

  // Ищем в первой строке body
  const firstLine = body.split("\n")[0]?.trim();
  if (firstLine && COMMAND_WHITELIST[firstLine]) {
    return firstLine;
  }

  return null;
}

/**
 * Выполняет команду безопасно
 */
function executeCommand(command) {
  try {
    const result = execSync(command, {
      cwd: PROJECT_DIR,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300000, // 5 минут
    });
    return { success: true, output: result, error: null };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || "",
      error: error.stderr || error.message,
    };
  }
}

/**
 * Фильтрует секреты из вывода
 */
function sanitizeOutput(output) {
  if (!output) return "";
  
  let sanitized = output;
  
  // Список паттернов для маскировки
  const secrets = [
    /YOUTUBE_CLIENT_SECRET[=\s:]+([^\s\n]+)/gi,
    /YOUTUBE_REFRESH_TOKEN[=\s:]+([^\s\n]+)/gi,
    /FIREBASE_SERVICE_ACCOUNT_JSON[=\s:]+([^\s\n]+)/gi,
    /TELEGRAM_BOT_TOKEN[=\s:]+([^\s\n]+)/gi,
    /GITHUB_TOKEN[=\s:]+([^\s\n]+)/gi,
    /OPENAI_API_KEY[=\s:]+([^\s\n]+)/gi,
  ];

  secrets.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, (match, secret) => {
      return match.replace(secret, "***REDACTED***");
    });
  });

  return sanitized;
}

// --- Обработчики команд --- //

async function handleReportStatus() {
  const results = [];

  // PM2 статус
  try {
    const pm2Status = executeCommand("pm2 list");
    results.push("## PM2 Status\n```\n" + sanitizeOutput(pm2Status.output || pm2Status.error) + "\n```");
  } catch (e) {
    results.push("❌ PM2 status failed: " + e.message);
  }

  // Git статус
  try {
    const gitStatus = executeCommand("git status --short");
    const gitBranch = executeCommand("git branch --show-current");
    results.push("## Git Status\nBranch: " + (gitBranch.output || "unknown").trim() + "\n```\n" + sanitizeOutput(gitStatus.output || "clean") + "\n```");
  } catch (e) {
    results.push("❌ Git status failed: " + e.message);
  }

  // Дисковое пространство
  try {
    const diskSpace = executeCommand("df -h /");
    results.push("## Disk Space\n```\n" + sanitizeOutput(diskSpace.output || "") + "\n```");
  } catch (e) {
    // Ignore
  }

  return results.join("\n\n");
}

async function handleVideoValidate() {
  try {
    // Проверяем наличие необходимых файлов
    const files = [
      "server/video-worker.js",
      "media/scripts/pipeline.js",
      "server/config/firebase-config.js"
    ];

    const checks = [];
    files.forEach(file => {
      const fullPath = path.join(PROJECT_DIR, file);
      const exists = fs.existsSync(fullPath);
      checks.push(`${exists ? "✅" : "❌"} ${file}`);
    });

    // Проверяем .env переменные (без значений)
    const envCheck = executeCommand('grep -E "^(FIREBASE_|YOUTUBE_|TELEGRAM_)" ' + path.join(PROJECT_DIR, ".env") + ' 2>/dev/null | cut -d= -f1 | sort | uniq || echo "No env file found"');
    
    return "## Video Pipeline Validation\n\n" + 
           "### Files\n" + checks.join("\n") + "\n\n" +
           "### Environment Variables (names only)\n```\n" + sanitizeOutput(envCheck.output || "") + "\n```";
  } catch (e) {
    return "❌ Validation failed: " + e.message;
  }
}

async function handleYoutubeRefreshTest() {
  try {
    // Используем существующий скрипт для проверки
    const script = `
require('dotenv').config({ path: '${path.join(PROJECT_DIR, ".env")}' });
const { google } = require('googleapis');

function need(n){ if(!process.env[n]) throw new Error("Missing env: " + n); }
need("YOUTUBE_CLIENT_ID");
need("YOUTUBE_CLIENT_SECRET");
need("YOUTUBE_REFRESH_TOKEN");

(async () => {
  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  try {
    const tok = await oauth2.getAccessToken();
    if (!tok || !tok.token) throw new Error("No access token returned");
    console.log("✅ YouTube refresh token is valid");
  } catch (e) {
    const msg = e?.response?.data?.error || e.message;
    console.log("❌ YouTube refresh failed: " + msg);
  }
})();
`;

    const result = executeCommand(`node -e "${script.replace(/"/g, '\\"')}"`);
    return "## YouTube Refresh Test\n```\n" + sanitizeOutput(result.output || result.error || "Unknown error") + "\n```";
  } catch (e) {
    return "❌ YouTube test failed: " + e.message;
  }
}

async function handleWorkerRestart() {
  try {
    // Перезапуск PM2 worker
    executeCommand("pm2 delete nova-video 2>/dev/null || true");
    const startResult = executeCommand("pm2 start server/video-worker.js --name nova-video --update-env");
    executeCommand("pm2 save");
    
    const statusResult = executeCommand("pm2 status nova-video");
    
    return "## Worker Restart\n```\n" + sanitizeOutput(startResult.output || startResult.error || "") + "\n\n" + 
           sanitizeOutput(statusResult.output || "") + "\n```";
  } catch (e) {
    return "❌ Worker restart failed: " + e.message;
  }
}

async function handlePipelineTestJob() {
  try {
    // Создаем тестовую задачу через Firebase
    const script = `
require('dotenv').config({ path: '${path.join(PROJECT_DIR, ".env")}' });
const admin = require("firebase-admin");
function need(name){ if(!process.env[name]) throw new Error("Missing env: "+name); }
need("FIREBASE_SERVICE_ACCOUNT_JSON");
need("FIREBASE_DB_URL");

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: process.env.FIREBASE_DB_URL });
const db = admin.database();

(async () => {
  const ref = db.ref("videoJobs").push();
  const id = ref.key;
  await ref.set({
    createdAt: Date.now(),
    language: "en",
    script: "Test job from ops-agent",
    status: "pending",
    targets: ["telegram"]
  });
  console.log("✅ Test job created: " + id);
  process.exit(0);
})().catch(e=>{ console.error("❌ Error: " + e.message); process.exit(1); });
`;

    const result = executeCommand(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
    return "## Pipeline Test Job\n```\n" + sanitizeOutput(result.output || result.error || "") + "\n```";
  } catch (e) {
    return "❌ Test job creation failed: " + e.message;
  }
}

async function handleSnapshot() {
  try {
    const snapshotPath = path.join(PROJECT_DIR, "_state", "system_snapshot.md");
    
    if (!fs.existsSync(snapshotPath)) {
      return "❌ Snapshot not found. Run snapshot_system.sh first, or wait for cron (every 30 minutes).";
    }
    
    const snapshotContent = fs.readFileSync(snapshotPath, "utf8");
    
    // Snapshot уже не содержит секретов (фильтруется в скрипте)
    // Но добавим дополнительную санитизацию на всякий случай
    const sanitized = sanitizeOutput(snapshotContent);
    
    return sanitized;
  } catch (e) {
    return "❌ Failed to read snapshot: " + e.message;
  }
}

// --- Главный цикл --- //

async function processIssue(issue) {
  const issueNumber = issue.number;
  const issueId = `${GITHUB_OWNER}/${GITHUB_REPO}#${issueNumber}`;

  // Пропускаем уже обработанные
  if (processedIssues.has(issueId)) {
    return;
  }

  // Парсим команду
  const command = parseCommand(issue);
  if (!command) {
    logger.log(`[ops-agent] Issue #${issueNumber} has no valid command, skipping`);
    return;
  }

  // Проверяем whitelist
  const commandConfig = COMMAND_WHITELIST[command];
  if (!commandConfig) {
    await commentIssue(issueNumber, `❌ Unknown command: \`${command}\`\n\nAvailable commands:\n${Object.keys(COMMAND_WHITELIST).map(c => `- \`${c}\`: ${COMMAND_WHITELIST[c].description}`).join("\n")}`);
    processedIssues.add(issueId);
    return;
  }

  // Помечаем как обрабатываемую
  await addLabel(issueNumber, "ops-agent:processing");
  await commentIssue(issueNumber, `🔄 Processing command: \`${command}\`...`);

  try {
    // Выполняем команду
    logger.log(`[ops-agent] Executing command: ${command}`);
    const result = await commandConfig.handler();

    // Форматируем результат
    const comment = `✅ Command \`${command}\` completed successfully\n\n${result}`;
    await commentIssue(issueNumber, comment);
    await addLabel(issueNumber, "ops-agent:done");
    
    logger.log(`[ops-agent] Issue #${issueNumber} processed successfully`);
  } catch (error) {
    const errorMessage = sanitizeOutput(error.message || String(error));
    await commentIssue(issueNumber, `❌ Command \`${command}\` failed:\n\n\`\`\`\n${errorMessage}\n\`\`\``);
    await addLabel(issueNumber, "ops-agent:error");
    logger.error(`[ops-agent] Issue #${issueNumber} failed:`, error);
  }

  // Помечаем как обработанную
  processedIssues.add(issueId);
}

async function main() {
  logger.log("[ops-agent] Starting NovaCiv Ops Agent");
  logger.log(`[ops-agent] GitHub: ${GITHUB_OWNER}/${GITHUB_REPO}`);
  logger.log(`[ops-agent] Project dir: ${PROJECT_DIR}`);
  logger.log(`[ops-agent] Check interval: ${CHECK_INTERVAL}ms`);

  if (!GITHUB_TOKEN) {
    logger.error("[ops-agent] GITHUB_TOKEN not set in environment");
    logger.error("[ops-agent] Please set GITHUB_TOKEN in .env file");
    process.exit(1);
  }

  // Проверяем доступность проекта
  if (!fs.existsSync(PROJECT_DIR)) {
    logger.error(`[ops-agent] Project directory not found: ${PROJECT_DIR}`);
    process.exit(1);
  }

  // Основной цикл
  while (true) {
    try {
      const issues = await getOpsIssues();
      logger.log(`[ops-agent] Found ${issues.length} open issues with label "ops"`);

      for (const issue of issues) {
        await processIssue(issue);
      }
    } catch (error) {
      logger.error("[ops-agent] Error in main loop:", error);
    }

    // Ждем перед следующей проверкой
    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
  }
}

// Обработка завершения
process.on("SIGTERM", () => {
  logger.log("[ops-agent] Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.log("[ops-agent] Received SIGINT, shutting down gracefully");
  process.exit(0);
});

// Запуск
if (require.main === module) {
  main().catch((error) => {
    logger.error("[ops-agent] Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { main };
