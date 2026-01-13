// netlify/functions/admin-domovoy.js
//
// Админская функция для общения с OpenAI на основе PROJECT_CONTEXT.md
// Только read-only, никаких побочных эффектов
// Требует роль admin в Netlify Identity

const fs = require("fs");
const path = require("path");

// ---------- ENV ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---------- Глобальные переменные для контекста ----------
let projectState = null;
let projectContext = null;

// ---------- Загрузка PROJECT_STATE.md ----------
function loadProjectState() {
  if (projectState) return projectState;

  try {
    const rootDir = process.cwd();
    const statePath = path.join(rootDir, "docs", "PROJECT_STATE.md");
    projectState = fs.readFileSync(statePath, "utf8");
    console.log("[admin-domovoy] Loaded PROJECT_STATE.md");
  } catch (e) {
    console.error("[admin-domovoy] Failed to load PROJECT_STATE.md:", e);
    projectState = projectState || "";
  }

  return projectState;
}

// ---------- Загрузка PROJECT_CONTEXT.md ----------
function loadProjectContext() {
  if (projectContext) return projectContext;

  try {
    const rootDir = process.cwd();
    const contextPath = path.join(rootDir, "docs", "PROJECT_CONTEXT.md");
    projectContext = fs.readFileSync(contextPath, "utf8");
    console.log("[admin-domovoy] Loaded PROJECT_CONTEXT.md");
  } catch (e) {
    console.error("[admin-domovoy] Failed to load PROJECT_CONTEXT.md:", e);
    projectContext = projectContext || "";
  }

  return projectContext;
}

// ---------- Проверка роли admin через Netlify Identity ----------
function checkAdminRole(context) {
  // Netlify Identity предоставляет информацию о пользователе через context.clientContext.user
  // Это автоматически заполняется, когда запрос содержит валидный JWT токен
  const user = context?.clientContext?.user;
  
  if (!user) {
    console.log("[admin-domovoy] No user found in context.clientContext");
    return false;
  }

  // Проверяем роль admin
  // Роли должны быть в app_metadata.roles (используется Netlify Identity)
  const userRoles = user.app_metadata?.roles || user.user_metadata?.roles || [];
  const hasAdminRole = Array.isArray(userRoles) && userRoles.includes("admin");

  if (!hasAdminRole) {
    console.log("[admin-domovoy] User does not have admin role. Email:", user.email, "Roles:", userRoles);
  }

  return hasAdminRole;
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
    const user = context?.clientContext?.user;
    if (!user) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Unauthorized: authentication required" }),
      };
    }

    if (!checkAdminRole(context)) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Forbidden: admin role required" }),
      };
    }

    // Проверка API ключа
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "OPENAI_API_KEY is not configured",
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
        body: JSON.stringify({ ok: false, error: "Text is required" }),
      };
    }

    // Загрузка PROJECT_STATE.md и PROJECT_CONTEXT.md
    const stateContent = loadProjectState();
    const contextContent = loadProjectContext();

    // Формирование промпта для OpenAI
    const systemPrompt = `Ты — административный помощник для проекта NovaCiv.
Ты в ADMIN_MODE, пользователь администратор, разрешены тех. вопросы.
Твоя задача — отвечать на вопросы администратора на основе контекста проекта.
Отвечай кратко, структурированно и по делу.
Это read-only режим: никаких действий, только информация.
Не выдумывай статус, если нет в PROJECT_STATE/CONTEXT — говори "нет данных".`;

    const userPrompt = `Текущее состояние системы (PROJECT_STATE.md):

${stateContent}

---

Контекст проекта (PROJECT_CONTEXT.md):

${contextContent}

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
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "OpenAI request failed",
        }),
      };
    }

    const data = await completion.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "Не удалось получить ответ от OpenAI.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, reply }),
    };
  } catch (e) {
    console.error("[admin-domovoy] Handler error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Internal Server Error",
      }),
    };
  }
};
