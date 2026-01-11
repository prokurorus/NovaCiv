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
require("dotenv").config({ path: envPath, override: true });

const axios = require("axios");
const { execSync } = require("child_process");
const fs = require("fs");

// --- Парсинг аргументов командной строки --- //

const args = process.argv.slice(2);
let MODE = "daemon"; // daemon | ci
let ISSUE_NUMBER = null;

for (const arg of args) {
  if (arg.startsWith("--mode=")) {
    MODE = arg.split("=")[1];
  } else if (arg.startsWith("--issue=")) {
    ISSUE_NUMBER = parseInt(arg.split("=")[1], 10);
  }
}

if (MODE === "ci" && !ISSUE_NUMBER) {
  console.error("[ops-agent] ERROR: In CI mode, --issue=N is required");
  process.exit(1);
}

// --- Конфигурация --- //

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
const CHECK_INTERVAL = 60000; // 60 секунд (для daemon режима)

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
    needsPr: false,
    aliases: ["status", "report", "pm2", "health"]
  },
  "video:validate": {
    description: "Валидировать конфигурацию видео-пайплайна",
    handler: handleVideoValidate,
    needsGit: false,
    needsPr: false,
    aliases: ["validate video", "video validate", "validate"]
  },
  "youtube:refresh-test": {
    description: "Проверить обновление YouTube токена",
    handler: handleYoutubeRefreshTest,
    needsGit: false,
    needsPr: false,
    aliases: ["youtube:refresh", "yt:refresh", "yt refresh", "youtube refresh", "youtube test"]
  },
  "worker:restart": {
    description: "Перезапустить PM2 worker",
    handler: handleWorkerRestart,
    needsGit: false,
    needsPr: false,
    aliases: ["restart", "worker restart", "restart worker", "pm2 restart"]
  },
  "pipeline:run-test-job": {
    description: "Создать тестовую задачу для пайплайна",
    handler: handlePipelineTestJob,
    needsGit: false,
    needsPr: false,
    aliases: ["test job", "run test", "pipeline test", "test pipeline"]
  }
};

// Карта алиасов -> команды (для быстрого поиска)
const ALIAS_MAP = {};
Object.keys(COMMAND_WHITELIST).forEach(cmd => {
  ALIAS_MAP[cmd] = cmd; // Сама команда тоже в карте
  if (COMMAND_WHITELIST[cmd].aliases) {
    COMMAND_WHITELIST[cmd].aliases.forEach(alias => {
      ALIAS_MAP[alias.toLowerCase().trim()] = cmd;
    });
  }
});

// Кэш обработанных Issues (чтобы не обрабатывать повторно)
const processedIssues = new Set();

const logger = console;

// --- GitHub API --- //

function hasLabel(issue, name) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  return labels.some(l => (typeof l === "string" ? l : l?.name) === name);
}

function getLabelNames(issue) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  return labels.map(l => (typeof l === "string" ? l : l?.name)).filter(Boolean);
}

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

/**
 * Удаляет метку Issue
 */
async function removeLabel(issueNumber, label) {
  if (!GITHUB_TOKEN) return;
  try {
    await axios.delete(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
  } catch (error) {
    // ignore if label not found / already removed
  }
}

/**
 * Получает комментарии Issue
 */
async function getIssueComments(issueNumber) {
  if (!GITHUB_TOKEN) {
    logger.error("[ops-agent] GITHUB_TOKEN not set");
    return [];
  }

  try {
    const response = await axios.get(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}/comments`,
      {
        params: {
          sort: "created",
          direction: "asc",
        },
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    return response.data || [];
  } catch (error) {
    logger.error(`[ops-agent] Failed to fetch comments for issue #${issueNumber}:`, error.response?.data || error.message);
    return [];
  }
}

/**
 * Вычисляет расстояние Левенштейна между двумя строками
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  // Инициализация матрицы
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Заполнение матрицы
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // удаление
          matrix[i][j - 1] + 1,     // вставка
          matrix[i - 1][j - 1] + 1  // замена
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Находит ближайшие команды по расстоянию Левенштейна
 */
function findClosestCommands(input, limit = 3) {
  const normalizedInput = input.toLowerCase().trim();
  const candidates = [];

  // Проверяем все команды и их алиасы
  Object.keys(COMMAND_WHITELIST).forEach(cmd => {
    const distance = levenshteinDistance(normalizedInput, cmd.toLowerCase());
    candidates.push({ command: cmd, distance, type: 'command' });

    if (COMMAND_WHITELIST[cmd].aliases) {
      COMMAND_WHITELIST[cmd].aliases.forEach(alias => {
        const aliasDistance = levenshteinDistance(normalizedInput, alias.toLowerCase());
        candidates.push({ command: cmd, distance: aliasDistance, type: 'alias' });
      });
    }
  });

  // Сортируем по расстоянию и берем первые N
  candidates.sort((a, b) => a.distance - b.distance);
  
  // Фильтруем дубликаты команд и ограничиваем расстояние (максимум 50% от длины входа)
  const maxDistance = Math.max(3, Math.floor(normalizedInput.length * 0.5));
  const seen = new Set();
  const results = [];
  
  for (const candidate of candidates) {
    if (candidate.distance <= maxDistance && !seen.has(candidate.command)) {
      seen.add(candidate.command);
      results.push(candidate.command);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Резолвит команду через алиасы и автокоррекцию
 */
function resolveCommand(input) {
  if (!input) return null;

  const normalized = input.toLowerCase().trim();

  // 1. Прямое совпадение в whitelist
  if (COMMAND_WHITELIST[normalized]) {
    return normalized;
  }

  // 2. Проверка алиасов
  if (ALIAS_MAP[normalized]) {
    return ALIAS_MAP[normalized];
  }

  // 3. Попытка найти команду через паттерн "команда:опция"
  const patternMatch = normalized.match(/(\w+:\w+)/);
  if (patternMatch) {
    const matched = patternMatch[1];
    if (COMMAND_WHITELIST[matched]) {
      return matched;
    }
    // Проверяем алиасы для паттерна
    if (ALIAS_MAP[matched]) {
      return ALIAS_MAP[matched];
    }
  }

  // 4. Нормализация пробелов и поиск по алиасам
  const normalizedSpaces = normalized.replace(/\s+/g, ' ').trim();
  if (ALIAS_MAP[normalizedSpaces]) {
    return ALIAS_MAP[normalizedSpaces];
  }

  // 5. Поиск по частичному совпадению (если команда содержит ввод)
  for (const [alias, cmd] of Object.entries(ALIAS_MAP)) {
    if (alias.includes(normalizedSpaces) || normalizedSpaces.includes(alias)) {
      return cmd;
    }
  }

  // 6. Fuzzy matching как последний fallback (для опечаток)
  // Используем порог: максимум 2 символа разницы или 30% от длины
  const maxDistance = Math.max(2, Math.floor(normalizedSpaces.length * 0.3));
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const [alias, cmd] of Object.entries(ALIAS_MAP)) {
    const distance = levenshteinDistance(normalizedSpaces, alias);
    if (distance <= maxDistance && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = cmd;
    }
  }

  // Также проверяем прямые команды
  if (!bestMatch || bestDistance > 2) {
    for (const cmd of Object.keys(COMMAND_WHITELIST)) {
      const distance = levenshteinDistance(normalizedSpaces, cmd.toLowerCase());
      if (distance <= maxDistance && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = cmd;
      }
    }
  }

  return bestMatch;
}

// --- Обработчики команд --- //

/**
 * Извлекает потенциальную команду из текста
 * Возвращает объект { input, command } или null
 */
function extractCommandFromText(text) {
  if (!text) return null;

  const trimmedText = text.trim();
  if (!trimmedText) return null;

  // Ищем команду в формате: "команда:опция"
  const patternMatch = trimmedText.match(/(\w+:\w+)/);
  if (patternMatch) {
    const matched = patternMatch[1];
    const resolved = resolveCommand(matched);
    return { input: matched, command: resolved || null };
  }

  // Ищем в первой строке (до переноса строки или точки)
  const firstLine = trimmedText.split(/[\n.]/)[0]?.trim();
  if (firstLine) {
    // Пробуем резолвить первую строку
    const resolved = resolveCommand(firstLine);
    return { input: firstLine, command: resolved || null };
  }

  return null;
}

/**
 * Парсит команду из Issue (title, body, или первый комментарий автора)
 */
async function parseCommand(issue, comments = null) {
  const recognizedInputs = [];
  let resolvedCommand = null;

  // 1. Ищем команду в title
  const title = issue.title || "";
  if (title) {
    const titleExtracted = extractCommandFromText(title);
    if (titleExtracted && titleExtracted.command) {
      recognizedInputs.push(`title: "${title.trim()}"`);
      resolvedCommand = titleExtracted.command;
      return { recognizedInput: recognizedInputs.join("; "), resolvedCommand: resolvedCommand };
    }
    // Если не нашлось через extractCommandFromText, пробуем резолвить весь title
    if (title) {
      const titleResolved = resolveCommand(title);
      if (titleResolved) {
        recognizedInputs.push(`title: "${title.trim()}"`);
        resolvedCommand = titleResolved;
        return { recognizedInput: recognizedInputs.join("; "), resolvedCommand: resolvedCommand };
      }
      recognizedInputs.push(`title: "${title.trim()}"`);
    }
  }

  // 2. Ищем команду в body (первая строка)
  const body = issue.body || "";
  if (body && !resolvedCommand) {
    const firstLine = body.split("\n")[0]?.trim();
    if (firstLine) {
      const bodyExtracted = extractCommandFromText(firstLine);
      if (bodyExtracted && bodyExtracted.command) {
        recognizedInputs.push(`body first line: "${firstLine}"`);
        resolvedCommand = bodyExtracted.command;
        return { recognizedInput: recognizedInputs.join("; "), resolvedCommand: resolvedCommand };
      }
      
      // Если не нашлось через extractCommandFromText, пробуем резолвить напрямую
      const bodyResolved = resolveCommand(firstLine);
      if (bodyResolved) {
        recognizedInputs.push(`body first line: "${firstLine}"`);
        resolvedCommand = bodyResolved;
        return { recognizedInput: recognizedInputs.join("; "), resolvedCommand: resolvedCommand };
      }
      
      recognizedInputs.push(`body first line: "${firstLine}"`);
    }
  }

  // 3. Ищем команду в первом комментарии автора Issue (если есть)
  if (!resolvedCommand && issue.user) {
    const issueAuthorLogin = issue.user.login;
    
    // Если комментарии не переданы, пытаемся их получить (но это async, так что пропускаем если нет)
    if (comments === null) {
      // В async контексте будем вызывать отдельно
      return { recognizedInput: recognizedInputs.join("; ") || "no input found", resolvedCommand: null, needsComments: true };
    }

    if (Array.isArray(comments)) {
      const authorComment = comments.find(comment => 
        comment.user && comment.user.login === issueAuthorLogin
      );
      
      if (authorComment) {
        const commentBody = authorComment.body || "";
        if (commentBody) {
          const firstCommentLine = commentBody.split("\n")[0]?.trim();
          if (firstCommentLine) {
            const commentExtracted = extractCommandFromText(firstCommentLine);
            if (commentExtracted && commentExtracted.command) {
              recognizedInputs.push(`author comment: "${firstCommentLine}"`);
              resolvedCommand = commentExtracted.command;
              return { recognizedInput: recognizedInputs.join("; "), resolvedCommand: resolvedCommand };
            }
            
            // Если не нашлось через extractCommandFromText, пробуем резолвить напрямую
            const commentResolved = resolveCommand(firstCommentLine);
            if (commentResolved) {
              recognizedInputs.push(`author comment: "${firstCommentLine}"`);
              resolvedCommand = commentResolved;
              return { recognizedInput: recognizedInputs.join("; "), resolvedCommand: resolvedCommand };
            }
            
            recognizedInputs.push(`author comment: "${firstCommentLine}"`);
          }
        }
      }
    }
  }

  // Если ничего не нашли
  return { 
    recognizedInput: recognizedInputs.join("; ") || (title || body).trim() || "no input found", 
    resolvedCommand: null 
  };
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

// --- Главный цикл --- //

/**
 * Форматирует список доступных команд с алиасами
 */
function formatAvailableCommands() {
  const lines = [];
  Object.keys(COMMAND_WHITELIST).forEach(cmd => {
    const config = COMMAND_WHITELIST[cmd];
    lines.push(`- \`${cmd}\`: ${config.description}`);
    
    if (config.aliases && config.aliases.length > 0) {
      const aliasList = config.aliases.slice(0, 5).map(a => `\`${a}\``).join(", ");
      const moreCount = config.aliases.length > 5 ? ` (+${config.aliases.length - 5} more)` : "";
      lines.push(`  → Aliases: ${aliasList}${moreCount}`);
    }
  });
  return lines.join("\n");
}

async function processIssue(issue) {
  // Skip issues already handled
  const labelNames = getLabelNames(issue);
  if (labelNames.includes("ops-agent:done") || labelNames.includes("ops-agent:error") || labelNames.includes("ops-agent:processing")) {
    return;
  }

  const issueNumber = issue.number;
  const issueId = `${GITHUB_OWNER}/${GITHUB_REPO}#${issueNumber}`;

  // Пропускаем уже обработанные
  if (processedIssues.has(issueId)) {
    return;
  }

  // Получаем комментарии Issue (если нужны)
  let comments = null;
  try {
    comments = await getIssueComments(issueNumber);
  } catch (error) {
    logger.warn(`[ops-agent] Could not fetch comments for issue #${issueNumber}:`, error.message);
  }

  // Парсим команду
  const parseResult = await parseCommand(issue, comments);
  const { recognizedInput, resolvedCommand } = parseResult;

  // Если команда не найдена, показываем подсказки
  if (!resolvedCommand) {
    // Пытаемся найти ближайшие команды для подсказки
    const inputText = recognizedInput.replace(/^(title|body first line|author comment):\s*"/, "").replace(/"$/, "").trim();
    const closest = findClosestCommands(inputText || issue.title || "", 3);
    
    let suggestionText = "";
    if (closest.length > 0) {
      suggestionText = `\n\n**Did you mean:**\n${closest.map(cmd => `- \`${cmd}\``).join("\n")}`;
    }

    await commentIssue(issueNumber, 
      `❌ **Unknown command**\n\n` +
      `**Recognized input:** ${recognizedInput || "none"}\n` +
      `**Resolved command:** (not found)${suggestionText}\n\n` +
      `**Available commands:**\n${formatAvailableCommands()}`
    );
    processedIssues.add(issueId);
    return;
  }

  // Проверяем whitelist (должна существовать, но на всякий случай)
  const commandConfig = COMMAND_WHITELIST[resolvedCommand];
  if (!commandConfig) {
    const closest = findClosestCommands(resolvedCommand, 3);
    const suggestionText = closest.length > 0 
      ? `\n\n**Did you mean:**\n${closest.map(cmd => `- \`${cmd}\``).join("\n")}`
      : "";

    await commentIssue(issueNumber, 
      `❌ **Invalid command**\n\n` +
      `**Recognized input:** ${recognizedInput}\n` +
      `**Resolved command:** \`${resolvedCommand}\` (not in whitelist)${suggestionText}\n\n` +
      `**Available commands:**\n${formatAvailableCommands()}`
    );
    processedIssues.add(issueId);
    return;
  }

  // Помечаем как обрабатываемую
  await addLabel(issueNumber, "ops-agent:processing");
  await commentIssue(issueNumber, 
    `🔄 **Processing command...**\n\n` +
    `**Recognized input:** ${recognizedInput}\n` +
    `**Resolved command:** \`${resolvedCommand}\``
  );

  try {
    // Выполняем команду
    logger.log(`[ops-agent] Executing command: ${resolvedCommand} (from input: ${recognizedInput})`);
    const result = await commandConfig.handler();

    // Форматируем результат с информацией о распознавании
    const comment = 
      `✅ **Command completed successfully**\n\n` +
      `**Recognized input:** ${recognizedInput}\n` +
      `**Resolved command:** \`${resolvedCommand}\`\n\n` +
      `---\n\n${result}`;
    await commentIssue(issueNumber, comment);
    await addLabel(issueNumber, "ops-agent:done");
    await removeLabel(issueNumber, "ops");
    
    logger.log(`[ops-agent] Issue #${issueNumber} processed successfully`);
  } catch (error) {
    const errorMessage = sanitizeOutput(error.message || String(error));
    await commentIssue(issueNumber, 
      `❌ **Command failed**\n\n` +
      `**Recognized input:** ${recognizedInput}\n` +
      `**Resolved command:** \`${resolvedCommand}\`\n\n` +
      `**Error:**\n\`\`\`\n${errorMessage}\n\`\`\``
    );
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

module.exports = { 
  main,
  resolveCommand,
  findClosestCommands,
  levenshteinDistance,
  COMMAND_WHITELIST,
  ALIAS_MAP
};
