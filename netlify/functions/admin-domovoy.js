// netlify/functions/admin-domovoy.js
//
// Админская функция для общения с OpenAI на основе PROJECT_CONTEXT.md
// Только read-only, никаких побочных эффектов
// Требует роль admin в Netlify Identity

const fs = require("fs");
const path = require("path");
const { requireAdmin } = require("./_lib/auth");

// ---------- ENV ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---------- Глобальные переменные для контекста ----------
let memoryCache = null;

// ---------- Вспомогательная функция для загрузки файлов ----------
function loadFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      console.log(`[admin-domovoy] Loaded from:`, filePath);
      return content;
    }
  } catch (e) {
    console.warn(`[admin-domovoy] Failed to load ${filePath}:`, e.message);
  }
  return null;
}

// ---------- Построение Memory Pack для админа ----------
function buildMemoryPack() {
  if (memoryCache !== null) return memoryCache;
  
  const rootDir = process.cwd();
  const functionDir = __dirname;
  
  // Определяем базовый путь к docs и runbooks
  const docsBase = fs.existsSync(path.join(rootDir, "docs"))
    ? path.join(rootDir, "docs")
    : path.join(functionDir, "..", "..", "docs");
  
  const runbooksBase = fs.existsSync(path.join(rootDir, "runbooks"))
    ? path.join(rootDir, "runbooks")
    : path.join(functionDir, "..", "..", "runbooks");
  
  const memoryFiles = [];
  const MAX_TOTAL_CHARS = 120000; // Hard limit
  
  // Приоритет 1: Критичные файлы (всегда включаем)
  const criticalFiles = [
    { path: path.join(docsBase, "PROJECT_STATE.md"), name: "PROJECT_STATE.md" },
    { path: path.join(docsBase, "PROJECT_CONTEXT.md"), name: "PROJECT_CONTEXT.md" },
  ];
  
  // Приоритет 2: Важные файлы (включаем если есть место)
  const importantFiles = [
    { path: path.join(docsBase, "START_HERE.md"), name: "START_HERE.md" },
    { path: path.join(docsBase, "OPS.md"), name: "OPS.md" },
    { path: path.join(docsBase, "RUNBOOKS.md"), name: "RUNBOOKS.md" },
    { path: path.join(runbooksBase, "README.md"), name: "runbooks/README.md" },
    { path: path.join(runbooksBase, "SOURCE_OF_TRUTH.md"), name: "runbooks/SOURCE_OF_TRUTH.md" },
  ];
  
  let totalChars = 0;
  
  // Загружаем критичные файлы
  for (const file of criticalFiles) {
    const content = loadFile(file.path);
    if (content) {
      memoryFiles.push({ name: file.name, content });
      totalChars += content.length;
    }
  }
  
  // Загружаем важные файлы до лимита
  for (const file of importantFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    
    const content = loadFile(file.path);
    if (content) {
      const remaining = MAX_TOTAL_CHARS - totalChars;
      if (content.length <= remaining) {
        memoryFiles.push({ name: file.name, content });
        totalChars += content.length;
      } else {
        // Обрезаем если слишком большой
        memoryFiles.push({ 
          name: file.name, 
          content: content.slice(0, remaining) + "\n\n[... truncated ...]" 
        });
        totalChars = MAX_TOTAL_CHARS;
        break;
      }
    }
  }
  
  memoryCache = memoryFiles;
  console.log(`[admin-domovoy] Memory pack built: ${memoryFiles.length} files, ${totalChars} chars`);
  
  return memoryCache;
}

// ---------- Основной handler ----------

exports.handler = async (event, context) => {
  try {
    // Проверка метода
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      };
    }

    // Проверка авторизации и роли admin
    const authError = requireAdmin(context);
    if (authError) {
      return authError;
    }

    // Проверка API ключа
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "OPENAI_API_KEY is not configured",
          message: "OpenAI API key is missing in environment variables",
          debugHint: "Set OPENAI_API_KEY in Netlify environment variables",
        }),
      };
    }

    // Парсинг тела запроса
    const body = JSON.parse(event.body || "{}");
    const text = (body.text || "").toString().trim();

    if (!text) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Text is required",
          message: "Request body must include 'text' field",
        }),
      };
    }

    // Загрузка полного Memory Pack
    let memoryPack;
    
    try {
      memoryPack = buildMemoryPack();
    } catch (e) {
      console.error("[admin-domovoy] Memory pack loading error:", e);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "context_missing",
          message: `Failed to load memory pack: ${e.message}`,
          debugHint: "Check docs/ and runbooks/ exist in included_files",
        }),
      };
    }
    
    // Проверка, что memory pack не пустой
    if (!memoryPack || memoryPack.length === 0) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "context_missing",
          message: "Memory pack is empty or not found",
          debugHint: "Check docs/PROJECT_CONTEXT.md exists",
        }),
      };
    }
    
    // Формируем контекст из всех файлов
    const contextBlocks = memoryPack.map(file => 
      `=== ${file.name} ===\n\n${file.content}\n\n`
    ).join("\n---\n\n");

    // Формирование промпта для OpenAI
    const systemPrompt = `Ты — административный помощник для проекта NovaCiv.
Ты в ADMIN_MODE, пользователь — администратор с полным доступом к проектной памяти.
Твоя задача — отвечать на вопросы администратора на основе полного контекста проекта.

ПРАВИЛА:
- Отвечай кратко, структурированно и по делу
- Это read-only режим: никаких действий, только информация
- НИКОГДА не печатай секреты, токены, ключи, пароли
- Если информации нет в предоставленном контексте, честно скажи, что данных нет, но не выдумывай
- Можешь обсуждать: ops, код, инфраструктуру, runbooks, серверные процессы, политики
- Держи ответы короткими и actionable`;

    const userPrompt = `Полная проектная память (Memory Pack):

${contextBlocks}

---

Вопрос администратора:
${text}`;

    // Запрос к OpenAI
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.5,
      }),
    });

    if (!completion.ok) {
      const errorText = await completion.text().catch(() => "");
      console.error(
        "[admin-domovoy] OpenAI error:",
        completion.status,
        errorText.slice(0, 200),
      );
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "openai_failed",
          message: `OpenAI API returned status ${completion.status}`,
          debugHint: "Check OPENAI_API_KEY and API quota",
        }),
      };
    }

    const data = await completion.json();
    const answer =
      data.choices?.[0]?.message?.content ||
      "Не удалось получить ответ от OpenAI.";

    if (!answer || answer.trim().length === 0) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "openai_empty_response",
          message: "OpenAI returned an empty response",
          debugHint: "Check OpenAI API response structure",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, answer }),
    };
  } catch (e) {
    console.error("[admin-domovoy] Handler error:", e);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Internal Server Error",
          message: e.message || "Unknown error",
          debugHint: "Check function logs for details",
        }),
      };
  }
};
