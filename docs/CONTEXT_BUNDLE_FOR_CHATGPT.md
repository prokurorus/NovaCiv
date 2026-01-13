# Context Bundle for ChatGPT — NovaCiv Admin & Identity

**Generated:** 2026-01-11  
**Purpose:** Single context bundle for ChatGPT to continue work without re-asking questions

---

## 1. Current Branch and Last Commits

### Current Branch
```
main
```

### Last 10 Commits
```
6b226ce Fix admin-domovoy: add explicit Authorization header and ensure JSON responses
3b2939d Fix: Add /admin route to App.tsx
5349237 Merge branch 'docs/connect-project-context'
78463de fix: упрощена инициализация Netlify Identity - используется defer и polling вместо onload
9e4dbe6 Merge branch 'docs/connect-project-context'
458f890 fix: исправлена инициализация Netlify Identity - используется onload для гарантированной загрузки
6aca7a5 Merge pull request #11 from prokurorus/docs/connect-project-context
43cfce1 docs: add PROJECT_CONTEXT and wire read-only loader
702766d Merge pull request #10 from prokurorus/fix/restore-newsqueue
fc5685b fix: restore newsQueue module for netlify functions
```

---

## 2. Admin Implementation & Routing

### 2.1 Admin Component (`src/pages/Admin.tsx`)

**First 200 lines:**
```typescript
import React, { useEffect, useState } from "react";
import Header from "../components/Header";

// Типы для Netlify Identity
interface NetlifyIdentityUser {
  id: string;
  email: string;
  user_metadata?: {
    roles?: string[];
  };
  app_metadata?: {
    roles?: string[];
  };
}

declare global {
  interface Window {
    netlifyIdentity?: {
      init: () => void;
      on: (event: string, callback: (user: NetlifyIdentityUser | null) => void) => void;
      open: () => void;
      close: () => void;
      currentUser: () => NetlifyIdentityUser | null;
      logout: () => void;
    };
  }
}

export default function Admin() {
  const [user, setUser] = useState<NetlifyIdentityUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState("");
  const [response, setResponse] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Функция инициализации и проверки
    const initIdentity = () => {
      if (window.netlifyIdentity) {
        // Проверка текущего пользователя
        const currentUser = window.netlifyIdentity.currentUser();
        setUser(currentUser);
        setIsLoading(false);

        // Если пользователь не залогинен, автоматически открываем окно входа
        if (!currentUser) {
          window.netlifyIdentity.open();
        }

        // Подписка на изменения
        window.netlifyIdentity.on("login", (user) => {
          setUser(user);
          setIsLoading(false);
          window.netlifyIdentity.close();
        });

        window.netlifyIdentity.on("logout", () => {
          setUser(null);
        });
      } else {
        // Если скрипт ещё не загружен, ждём немного и пробуем снова
        const timer = setTimeout(() => {
          if (window.netlifyIdentity) {
            initIdentity();
          } else {
            setIsLoading(false);
            setError("Netlify Identity не загружен. Убедитесь, что скрипт подключен.");
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    };

    // Пробуем инициализировать сразу или после небольшой задержки
    if (window.netlifyIdentity) {
      initIdentity();
    } else {
      // Ждём загрузки скрипта
      const checkInterval = setInterval(() => {
        if (window.netlifyIdentity) {
          clearInterval(checkInterval);
          initIdentity();
        }
      }, 50);

      // Таймаут на случай, если скрипт не загрузится
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.netlifyIdentity) {
          setIsLoading(false);
          setError("Netlify Identity не загружен. Убедитесь, что скрипт подключен.");
        }
      }, 5000);

      return () => clearInterval(checkInterval);
    }
  }, []);

  const checkAdminRole = (user: NetlifyIdentityUser | null): boolean => {
    if (!user) return false;
    // Приоритет app_metadata.roles (используется Netlify Identity)
    const roles = user.app_metadata?.roles || user.user_metadata?.roles || [];
    return Array.isArray(roles) && roles.includes("admin");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    setError("");
    setResponse("");

    try {
      // Получаем токен из Netlify Identity
      const currentUser = window.netlifyIdentity?.currentUser();
      if (!currentUser) {
        throw new Error("Пользователь не авторизован");
      }

      // Получаем токен доступа
      const token = currentUser.token?.access_token;
      if (!token) {
        throw new Error("Токен доступа не найден");
      }

      const res = await fetch("/.netlify/functions/admin-domovoy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ text: text.trim() }),
      });

      // Проверяем, что ответ - JSON, а не HTML
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Ожидался JSON, получен ${contentType}. Ответ: ${text.slice(0, 200)}`);
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ошибка запроса");
      }

      setResponse(data.reply || data.answer || "Ответ получен, но пуст.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsSubmitting(false);
    }
  };
```

**Key Points:**
- Uses `window.netlifyIdentity.currentUser()` to get user
- Checks roles from `app_metadata.roles` (priority) or `user_metadata.roles`
- Automatically opens login widget if no user
- Polls for `window.netlifyIdentity` with 50ms interval, 5s timeout
- Gets token via `currentUser.token?.access_token`
- Sends token in `Authorization: Bearer ${token}` header

### 2.2 Routing (`src/App.tsx`)

**Relevant routing logic:**
```typescript
export default function App() {
  const [entered, setEntered] = React.useState(false);
  const pathname = window.location.pathname;

  // ... other routes ...

  // 8) Админ-панель
  if (pathname === "/admin") {
    return (
      <>
        <Admin />
        <AssistantWidget />
      </>
    );
  }

  // 9) На всякий случай — всё остальное ведём на "Наше видение"
  return (
    <>
      <Header />
      <MainScreen />
      <AssistantWidget />
    </>
  );
}
```

**Access/Role Check:**
- No route-level access check in `App.tsx`
- Access control is handled inside `Admin.tsx` component:
  - If no user → shows login button
  - If user but no admin role → shows "Доступ запрещён" message
  - If user with admin role → shows admin interface

### 2.3 Main Entry Point (`src/main.tsx`)

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import "./lib/firebase";
import { LanguageProvider } from "./context/LanguageContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
```

**No router library used** — routing is done via `window.location.pathname` checks in `App.tsx`.

---

## 3. Netlify Function `admin-domovoy` & Deployment

### 3.1 Function Implementation (`netlify/functions/admin-domovoy.js`)

**Full file:**
```javascript
// netlify/functions/admin-domovoy.js
//
// Админская функция для общения с OpenAI на основе PROJECT_CONTEXT.md
// Только read-only, никаких побочных эффектов
// Требует роль admin в Netlify Identity

const fs = require("fs");
const path = require("path");

// ---------- ENV ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---------- Глобальная переменная для PROJECT_CONTEXT.md ----------
let projectContext = null;

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

    // Загрузка PROJECT_CONTEXT.md
    const contextContent = loadProjectContext();

    // Формирование промпта для OpenAI
    const systemPrompt = `Ты — административный помощник для проекта NovaCiv.
Твоя задача — отвечать на вопросы администратора на основе контекста проекта.
Отвечай кратко, структурированно и по делу.
Это read-only режим: никаких действий, только информация.`;

    const userPrompt = `Контекст проекта (PROJECT_CONTEXT.md):

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
```

**Key Points:**
- Uses `context.clientContext.user` (auto-populated by Netlify when JWT token is valid)
- Checks `app_metadata.roles` (priority) or `user_metadata.roles`
- Requires `Authorization: Bearer ${token}` header from client
- Loads `docs/PROJECT_CONTEXT.md` at runtime

### 3.2 Deployment Configuration

**`netlify.toml`:**
```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[functions]
  included_files = ["media/**"]
  external_node_modules = ["ffmpeg-static", "openai"]
  node_bundler = "esbuild"

[functions."news-cron"]
  schedule = "0 * * * *"

[functions."fetch-news"]
  schedule = "30 * * * *"

[functions."video-worker"]
  schedule = "*/15 * * * *"

[functions."domovoy-auto-post"]
  schedule = "0 0 * * *"

[functions."domovoy-every-3h"]
  schedule = "0 */3 * * *"

[functions."domovoy-auto-reply"]
  schedule = "*/10 * * * *"
```

**`public/_redirects`:**
```
/*    /index.html   200
```

**No specific redirects for `/admin`** — handled by SPA routing via `index.html` → React Router.

---

## 4. Identity Integration

### 4.1 Initialization (`index.html`)

```html
<!-- Netlify Identity -->
<script src="https://identity.netlify.com/v1/netlify-identity-widget.js" defer></script>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    const tick = () => {
      if (!window.netlifyIdentity) {
        return setTimeout(tick, 50);
      }
      window.netlifyIdentity.on('init', (user) => {
        if (!user) {
          window.netlifyIdentity.on('login', () => {
            document.location.reload();
          });
        }
      });
      window.netlifyIdentity.init();
    };
    tick();
  });
</script>
```

**Key Points:**
- Script loaded with `defer` attribute
- Polls for `window.netlifyIdentity` with 50ms interval
- On login, reloads page (`document.location.reload()`)

### 4.2 Login Widget Opening

**Location:** `src/pages/Admin.tsx`

```typescript
// Automatically opens if no user
if (!currentUser) {
  window.netlifyIdentity.open();
}

// Manual button click
<button onClick={() => window.netlifyIdentity?.open()}>
  Войти
</button>
```

### 4.3 Token Retrieval

**Location:** `src/pages/Admin.tsx` (line 117-126)

```typescript
const currentUser = window.netlifyIdentity?.currentUser();
if (!currentUser) {
  throw new Error("Пользователь не авторизован");
}

const token = currentUser.token?.access_token;
if (!token) {
  throw new Error("Токен доступа не найден");
}
```

**Token structure:** `currentUser.token.access_token` (JWT token)

### 4.4 Role Check

**Frontend (`src/pages/Admin.tsx`):**
```typescript
const checkAdminRole = (user: NetlifyIdentityUser | null): boolean => {
  if (!user) return false;
  // Приоритет app_metadata.roles (используется Netlify Identity)
  const roles = user.app_metadata?.roles || user.user_metadata?.roles || [];
  return Array.isArray(roles) && roles.includes("admin");
};
```

**Backend (`netlify/functions/admin-domovoy.js`):**
```javascript
const userRoles = user.app_metadata?.roles || user.user_metadata?.roles || [];
const hasAdminRole = Array.isArray(userRoles) && userRoles.includes("admin");
```

**Both check:** `app_metadata.roles` first, then `user_metadata.roles`

### 4.5 Logout Handling

**Location:** `src/pages/Admin.tsx`

```typescript
// Event listener
window.netlifyIdentity.on("logout", () => {
  setUser(null);
});

// Manual logout button
<button onClick={() => window.netlifyIdentity?.logout()}>
  Выйти
</button>
```

**No explicit localStorage clearing** — Netlify Identity widget handles storage internally.

### 4.6 Storage Usage

**Netlify Identity Widget Storage:**
- Netlify Identity widget uses its own localStorage keys (managed by widget, not directly accessed)
- No explicit localStorage keys for identity in codebase

**Other localStorage usage in project:**
- `novaciv_joined_counted` — Join page flag
- `novaciv-lang` — Language preference
- `memberId`, `memberNickname` — Chat/member system
- Various stats flags (`novaciv_visitor_counted`, etc.)

**Identity storage is opaque** — managed by Netlify Identity widget internally.

---

## 5. Project Memory / Context Files

### 5.1 PROJECT_CONTEXT.md

**Path:** `docs/PROJECT_CONTEXT.md`

**First 120 lines:**
```markdown
# PROJECT_CONTEXT — NovaCiv (Canonical)

## Purpose
This file captures the stable, long-term operating context for NovaCiv:
- how the project should be managed
- what "clean ops" means
- what is allowed / forbidden in production
- how humans and ops-agent interact

This file is canonical and must be kept consistent with docs/PROJECT_STATE.md.

## Operating Principles
- Source of truth is GitHub `main`.
- VPS is pull-only. A dirty repo on VPS is an incident.
- No manual code edits on VPS (exception: `.env` and server configs only).
- Ops-agent must not expose secrets (tokens/keys) in outputs.
- Prefer "one big step" runbooks over ad-hoc manual commands.
- Changes happen via PRs; production changes are deployed by pull + targeted restart only.

## Interaction Style
- Keep responses short, structured, and actionable.
- Prefer checklists and single-pass runbooks.
- If uncertain, propose a read-only verification first.

## Memory Hierarchy
1) docs/START_HERE.md (entry point)
2) docs/PROJECT_STATE.md (canonical system state)
3) docs/PROJECT_CONTEXT.md (this file: canonical operating context)
4) /root/NovaCiv/_state/system_snapshot.{md,json} (runtime snapshots; non-canonical)

## Safety Baseline
- Never print env values.
- Never print tokens, keys, cookies, auth headers.
- Sanitize outputs consistently.
```

**Last 60 lines:**
*(File is only 35 lines total, so full content shown above)*

### 5.2 PROJECT_STATE.md

**Path:** `docs/PROJECT_STATE.md`

**First 60 lines:**
```markdown
# Project State — NovaCiv

**Last verified:** 2026-01-11  
**Status:** Active

---

## A. System Overview

### What exists in production (VPS)

- **nova-ops-agent** (PM2) — GitHub Ops Agent, processes Issues with "ops" label
- **nova-video** (PM2) — Video Worker, processes video jobs from Firebase `videoJobs` queue
- **Netlify scheduled functions** — fetch-news, news-cron, domovoy-auto-post, domovoy-auto-reply, video-worker

### What is explicitly NOT running in production

- **nova-news-worker** — Must NOT run on prod. News processing is handled by Netlify scheduled functions only.

---

## B. Source of Truth & Policies

**GitHub main is source of truth.** All code changes: PC → commit/push → GitHub.

**VPS is pull-only.** Server only does `git pull + pm2 restart` (via `deploy_pull_only.sh`), no manual code edits.

**"Dirty repo = incident"** — Any `git status != clean` on VPS violates pull-only mode and requires immediate remediation.

**No manual edits on VPS except .env/server configs** — Only `.env`, PM2 configs, cron, and infrastructure settings are allowed.

**Details:** [runbooks/SOURCE_OF_TRUTH.md](../runbooks/SOURCE_OF_TRUTH.md)

---

## C. Production Processes (PM2)

**Current prod processes:**
- `nova-ops-agent` — online
- `nova-video` — online

**Explicitly state:** `nova-news-worker` must NOT run on prod.

---

## D. Project Memory

**Repo docs:**
- `docs/PROJECT_STATE.md` — current system state (this file)
- `docs/OPS.md` — operator console, Firebase monitoring, smoke tests
- `docs/RUNBOOKS.md` — operational procedures, deployment, troubleshooting
- `docs/REPO_MAP.md` — repository structure map
- `runbooks/SOURCE_OF_TRUTH.md` — pull-only sync policy and procedures

**Server memory:**
- `/root/NovaCiv/_state/system_snapshot.md` — human-readable system snapshot (generated every 30 min)
- `/root/NovaCiv/_state/system_snapshot.json` — structured system snapshot (generated every 30 min)
```

**No environment secrets in these files** — they contain operational context only.

---

## 6. Issue Reproduction & Evidence

### Issue A: "Long wait / no email for magic-link"

**Evidence:**

1. **UI Flow:**
   - Admin page automatically opens `window.netlifyIdentity.open()` if no user
   - Netlify Identity widget handles authentication UI (not custom form)
   - Widget supports both email+password and magic-link flows (configurable in Netlify dashboard)

2. **Code Analysis:**
   - No explicit magic-link configuration in code
   - Widget initialization in `index.html` uses default behavior
   - No email sending logic in codebase (handled by Netlify Identity service)

3. **Potential Causes:**
   - Netlify Identity service delay (external service)
   - Email delivery delay (SPF/DKIM issues, spam filters)
   - Widget configuration in Netlify dashboard (magic-link enabled/disabled)
   - Network/firewall blocking email service

4. **Identity Settings Check:**
   - No Identity settings in code (configured in Netlify dashboard)
   - Widget script: `https://identity.netlify.com/v1/netlify-identity-widget.js`
   - Uses default Netlify Identity behavior

**Recommendation:** Check Netlify dashboard → Identity → Settings for:
- Magic-link enabled/disabled
- Email provider configuration
- Email templates
- Rate limiting

### Issue B: "Refresh sometimes shows logged-in unexpectedly / role missing"

**Evidence:**

1. **Storage Behavior:**
   - Netlify Identity widget stores session in localStorage (opaque, widget-managed)
   - On page refresh, widget calls `window.netlifyIdentity.init()`
   - `init()` event fires with user if session exists

2. **Code Flow:**
   ```typescript
   // index.html: On init, if user exists, no reload
   window.netlifyIdentity.on('init', (user) => {
     if (!user) {
       window.netlifyIdentity.on('login', () => {
         document.location.reload(); // Only reloads on login, not on init
       });
     }
   });
   ```

3. **Admin Component Behavior:**
   ```typescript
   // Admin.tsx: Checks currentUser on mount
   const currentUser = window.netlifyIdentity.currentUser();
   setUser(currentUser);
   ```

4. **Potential Race Condition:**
   - Widget may restore session before `Admin.tsx` mounts
   - `currentUser()` may return user before roles are fully loaded
   - Token may be valid but roles not yet populated in `app_metadata`

5. **Role Check Timing:**
   - Frontend checks roles immediately on mount
   - Backend checks roles from `context.clientContext.user` (populated by Netlify from JWT)
   - If JWT is valid but roles not in token, backend will reject

6. **Logout Behavior:**
   - `window.netlifyIdentity.logout()` clears widget storage
   - No explicit localStorage cleanup in code
   - If widget storage is corrupted, may show stale user

**Potential Causes:**
- Token refresh race condition (token valid, roles not yet synced)
- Widget storage corruption (stale session data)
- Netlify Identity service delay in role propagation
- JWT token doesn't include roles (should be in `app_metadata`)

**Recommendation:**
- Add explicit role refresh after login
- Add token validation before role check
- Clear localStorage on logout (defensive)
- Add retry logic for role check

---

## 7. Summary

### Architecture
- **Frontend:** React SPA with pathname-based routing
- **Admin Route:** `/admin` → `Admin.tsx` component
- **Identity:** Netlify Identity widget (external script)
- **Backend:** Netlify Function `admin-domovoy` (serverless)
- **Auth:** JWT tokens via Netlify Identity

### Authentication Flow
1. User visits `/admin`
2. `Admin.tsx` checks `window.netlifyIdentity.currentUser()`
3. If no user → opens widget (`window.netlifyIdentity.open()`)
4. User logs in via widget (magic-link or email+password)
5. Widget stores session in localStorage
6. `login` event fires → component updates
7. Token retrieved: `currentUser.token.access_token`
8. Token sent in `Authorization: Bearer ${token}` header

### Authorization Flow
1. Frontend checks: `app_metadata.roles` or `user_metadata.roles` includes "admin"
2. Backend checks: `context.clientContext.user.app_metadata.roles` includes "admin"
3. Netlify auto-populates `context.clientContext.user` from JWT token

### Known Issues
- **A:** Magic-link email delay (external service, no code control)
- **B:** Role check race condition on refresh (token valid, roles may not be synced)

---

**End of Context Bundle**
