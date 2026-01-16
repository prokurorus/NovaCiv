import React, { useEffect, useState, useRef, ErrorInfo, ReactNode } from "react";
import Header from "../components/Header";

// ============================================
// === ADMIN BUILD MARKER ===
// Git SHA + BUILD TIME are injected at Netlify build time via Vite env:
//   import.meta.env.VITE_COMMIT_REF
//   import.meta.env.VITE_BUILD_TIME
// This is the REAL production entrypoint for /admin
// Route: src/App.tsx line 594 → renders <Admin /> from src/pages/Admin.tsx
// ============================================

// Error Boundary Component
class AdminErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Admin] Error boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <>
          <Header />
          <main className="min-h-screen bg-white">
            <div className="max-w-4xl mx-auto py-10 px-4">
              <div className="text-center space-y-4">
                <h1 className="text-2xl font-semibold text-zinc-900">
                  Ошибка загрузки админ-панели
                </h1>
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {this.state.error?.message || "Неизвестная ошибка"}
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition"
                >
                  Перезагрузить страницу
                </button>
              </div>
            </div>
          </main>
        </>
      );
    }

    return this.props.children;
  }
}

// Типы для Netlify Identity
interface NetlifyIdentityUser {
  id: string;
  email: string;
  jwt?: (refresh?: boolean) => Promise<string | null>;
  token?: {
    access_token?: string;
  };
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

function AdminInner() {
  const [user, setUser] = useState<NetlifyIdentityUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAdminRole, setHasAdminRole] = useState(false);
  const [text, setText] = useState("");
  const [response, setResponse] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{role: "user" | "assistant", content: string}>>(() => {
    // Load from localStorage on init
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("adminChatHistory");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.slice(-20); // Keep last 20 messages
          }
        }
      } catch (e) {
        console.error("[Admin] Failed to load chat history:", e);
      }
    }
    return [];
  });
  const [mode, setMode] = useState<"ops" | "direct">(() => {
    // Load from localStorage, default to "direct"
    if (typeof window !== "undefined") {
      const saved =
        localStorage.getItem("admin_mode") || localStorage.getItem("adminMode");
      return saved === "ops" ? "ops" : "direct";
    }
    return "direct";
  });
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("adminTheme");
      return saved === "dark" ? "dark" : "light";
    }
    return "light";
  });
  const [copiedStatus, setCopiedStatus] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    url: string;
    status: number | null;
    rawResponse: string;
    jsonKeys: string[];
    threadId?: string | null;
    pairCount?: number | null;
    lastSummaryTs?: string | null;
    origin?: string | null;
    upstreamUrl?: string | null;
    upstreamStatus?: number | null;
    mode?: string | null;
  } | null>(null);
  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const initCalledRef = useRef(false);
  const initEventFiredRef = useRef(false);
  const timersRef = useRef<Array<NodeJS.Timeout>>([]);
  const stillLoadingRef = useRef(true);
  const isDark = theme === "dark";
  const threadLabel = debugInfo?.threadId ?? "—";
  const textPrimary = isDark ? "text-zinc-100" : "text-zinc-900";
  const textSecondary = isDark ? "text-zinc-300" : "text-zinc-600";
  const textMuted = isDark ? "text-zinc-400" : "text-zinc-500";
  const panelClass = isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-200";
  const primaryButtonClass = isDark
    ? "bg-zinc-100 text-zinc-900 hover:bg-white"
    : "bg-zinc-900 text-white hover:bg-zinc-800";
  const secondaryButtonClass = isDark
    ? "border-zinc-700 text-zinc-100 hover:bg-zinc-800"
    : "border-zinc-300 text-zinc-800 hover:bg-zinc-50";
  const modeActiveClass = isDark ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-white";
  const modeInactiveClass = isDark
    ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200";
  const reportButtonClass = isDark
    ? "bg-emerald-500 text-white hover:bg-emerald-400"
    : "bg-emerald-600 text-white hover:bg-emerald-500";
  const inputClass = isDark
    ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:ring-zinc-200 focus:border-transparent"
    : "border-zinc-300 focus:ring-zinc-900 focus:border-transparent";
  const themeToggle = (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`fixed top-4 right-4 z-50 inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        isDark
          ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
      }`}
      aria-pressed={isDark}
    >
      {isDark ? "Светлая тема" : "Тёмная тема"}
    </button>
  );

  // Сильная очистка при выходе
  const performLogout = () => {
    if (window.netlifyIdentity) {
      window.netlifyIdentity.logout();
    }

    // Очищаем localStorage ключи Identity (защитная очистка)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const lowerKey = key.toLowerCase();
        const hasGotrue = lowerKey.includes("gotrue");
        const hasNetlify = lowerKey.includes("netlify");
        const hasAuth = lowerKey.includes("auth") || lowerKey.includes("identity") || lowerKey.includes("user") || lowerKey.includes("token");
        
        // Удаляем если содержит gotrue ИЛИ (netlify И auth/identity/user/token), НО не трогаем novaciv-*
        if (!key.startsWith("novaciv-") && (hasGotrue || (hasNetlify && hasAuth))) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Перенаправление на /admin чтобы открыть логин
    window.location.href = "/admin";
  };

  // Проверка роли с повторными попытками
  const checkRoleWithRetry = (userToCheck: NetlifyIdentityUser | null, retryCount = 0) => {
    if (!userToCheck) {
      setHasAdminRole(false);
      return;
    }
    
    const roles = userToCheck.app_metadata?.roles || userToCheck.user_metadata?.roles || [];
    const isAdmin = Array.isArray(roles) && roles.includes("admin");
    
    if (isAdmin) {
      setHasAdminRole(true);
      return;
    }
    
    // Если роли отсутствуют, пытаемся перечитать (до 3 раз с интервалом 300ms)
    if (roles.length === 0 && retryCount < 3) {
      setTimeout(() => {
        const currentUser = window.netlifyIdentity?.currentUser();
        if (currentUser) {
          const retriedRoles = currentUser.app_metadata?.roles || currentUser.user_metadata?.roles || [];
          if (retriedRoles.length > 0) {
            setHasAdminRole(Array.isArray(retriedRoles) && retriedRoles.includes("admin"));
          } else {
            checkRoleWithRetry(currentUser, retryCount + 1);
          }
        } else {
          setHasAdminRole(false);
        }
      }, 300);
    } else {
      setHasAdminRole(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem("adminTheme", theme);
    } catch (e) {
      console.error("[Admin] Failed to save theme:", e);
    }
  }, [theme]);

  useEffect(() => {
    if (!historyEndRef.current) return;
    historyEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversationHistory.length]);

  useEffect(() => {
    // Сброс состояния загрузки
    stillLoadingRef.current = true;
    initEventFiredRef.current = false;
    
    // Очистка всех таймеров при размонтировании
    const cleanup = () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current = [];
    };

    const initIdentity = () => {
      if (!window.netlifyIdentity || initCalledRef.current) return;
      
      initCalledRef.current = true;

      // 1) Регистрируем обработчики ПЕРВЫМИ, до вызова init()
      window.netlifyIdentity.on("init", (user) => {
        initEventFiredRef.current = true;
        stillLoadingRef.current = false;
        setUser(user);
        setIsLoading(false);
        
        if (user) {
          checkRoleWithRetry(user);
        } else {
          setHasAdminRole(false);
          // Если пользователь не залогинен, открываем модал
          window.netlifyIdentity?.open();
        }
      });

      window.netlifyIdentity.on("login", (user) => {
        setUser(user);
        setIsLoading(false);
        window.netlifyIdentity?.close();
        
        if (user) {
          checkRoleWithRetry(user);
        } else {
          setHasAdminRole(false);
        }
        
        // Принудительная перезагрузка для обновления claims
        window.location.href = "/admin";
      });

      window.netlifyIdentity.on("logout", () => {
        setUser(null);
        setHasAdminRole(false);
      });

      // 2) Вызываем init() ровно один раз
      window.netlifyIdentity.init();

      // 3) Детерминированный fallback через 700ms
      const fallbackTimer = setTimeout(() => {
        if (!initEventFiredRef.current && stillLoadingRef.current) {
          const u = window.netlifyIdentity?.currentUser?.() || null;
          setUser(u);
          setIsLoading(false);
          stillLoadingRef.current = false;
          if (!u) {
            window.netlifyIdentity?.open();
          } else {
            checkRoleWithRetry(u);
          }
        }
      }, 700);
      timersRef.current.push(fallbackTimer);

      // 4) Жёсткий таймаут безопасности через 2500ms
      const hardTimeout = setTimeout(() => {
        if (stillLoadingRef.current) {
          setIsLoading(false);
          stillLoadingRef.current = false;
          setError("Identity не инициализировался. Проверьте блокировщики/сеть.");
        }
      }, 2500);
      timersRef.current.push(hardTimeout);
    };

    if (!window.netlifyIdentity) {
      // Ждём загрузки скрипта
      const checkInterval = setInterval(() => {
        if (window.netlifyIdentity && !initCalledRef.current) {
          clearInterval(checkInterval);
          initIdentity();
        }
      }, 50);
      timersRef.current.push(checkInterval as unknown as NodeJS.Timeout);

      // Таймаут на случай, если скрипт не загрузится
      const scriptTimeout = setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.netlifyIdentity) {
          stillLoadingRef.current = false;
          setIsLoading(false);
          setError("Netlify Identity не загружен. Убедитесь, что скрипт подключен.");
        }
      }, 5000);
      timersRef.current.push(scriptTimeout);
    } else if (!initCalledRef.current) {
      initIdentity();
    }

    return cleanup;
  }, []);

  const handleOpenLogin = () => {
    if (!window.netlifyIdentity) {
      if (process.env.NODE_ENV === "development") {
        console.log("[Admin] netlifyIdentity not available");
      }
      return;
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[Admin] Opening Identity modal");
    }
    window.netlifyIdentity.open();
  };

  const handleClearHistory = () => {
    setConversationHistory([]);
    setResponse("");
    try {
      localStorage.removeItem("adminChatHistory");
    } catch (e) {
      console.error("[Admin] Failed to clear chat history:", e);
    }
  };

  const handleCopyResponse = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      setCopiedStatus(true);
      setTimeout(() => setCopiedStatus(false), 2000);
    } catch (e) {
      console.error("[Admin] Failed to copy:", e);
    }
  };

  const requestAdmin = async (
    requestBody: Record<string, unknown>,
    options: { timeoutMs?: number } = {},
  ) => {
    const currentUser = window.netlifyIdentity?.currentUser();
    if (!currentUser) {
      throw new Error("Пользователь не авторизован");
    }

    // Получаем токен: предпочитаем jwt(), иначе token.access_token
    let token: string | null = null;
    if (currentUser.jwt) {
      token = await currentUser.jwt(true);
    } else if (currentUser.token?.access_token) {
      token = currentUser.token.access_token;
    }

    if (!token) {
      throw new Error("Токен не готов, попробуйте перелогиниться");
    }

    const requestUrl = "/.netlify/functions/admin-proxy";
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs;
    const timeoutId = timeoutMs
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    let res: Response;
    try {
      res = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`Таймаут запроса (${Math.round((timeoutMs || 0) / 1000)}s)`);
      }
      throw err;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    // Получаем raw response text для debug
    const rawResponseText = await res.text();
    const rawResponseTruncated = rawResponseText.slice(0, 2000);

    // Проверяем, что ответ - JSON, а не HTML
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      setDebugInfo({
        url: requestUrl,
        status: res.status,
        rawResponse: rawResponseTruncated,
        jsonKeys: [],
      });
      throw new Error(`Ожидался JSON, получен ${contentType}. Ответ: ${rawResponseText.slice(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(rawResponseText);
    } catch (parseErr) {
      setDebugInfo({
        url: requestUrl,
        status: res.status,
        rawResponse: rawResponseTruncated,
        jsonKeys: [],
      });
      throw new Error(`Не удалось распарсить JSON: ${parseErr instanceof Error ? parseErr.message : "Unknown error"}`);
    }

    // Capture debug info
    const jsonKeys = Object.keys(data);
    const debug = (data && typeof data.debug === "object") ? data.debug : {};
    setDebugInfo({
      url: requestUrl,
      status: res.status,
      rawResponse: rawResponseTruncated,
      jsonKeys,
      threadId: debug.threadId ?? null,
      pairCount: typeof debug.pairCount === "number" ? debug.pairCount : null,
      lastSummaryTs: typeof debug.lastSummaryTs === "string" ? debug.lastSummaryTs : (debug.lastSummaryTs ? String(debug.lastSummaryTs) : null),
      origin: typeof debug.origin === "string" ? debug.origin : null,
      upstreamUrl: typeof debug.upstreamUrl === "string" ? debug.upstreamUrl : null,
      upstreamStatus: typeof debug.upstreamStatus === "number" ? debug.upstreamStatus : (debug.upstreamStatus === null ? null : undefined),
      mode: typeof debug.mode === "string" ? debug.mode : null,
    });

    // Handle error responses (ok: false or non-200 status)
    if (!res.ok || data.ok === false) {
      const errorMsg = data.error || data.message || "Ошибка запроса";
      let statusMsg: string;
      if (res.status === 401) {
        if (data.error === "unauthorized") {
          statusMsg = "Токен не совпадает между Netlify и VPS. Проверьте ADMIN_API_TOKEN в обеих системах.";
        } else {
          statusMsg = "Не авторизован. Проверьте вход через Netlify Identity.";
        }
      } else if (res.status === 403) {
        statusMsg = "Доступ запрещён. Требуется роль admin.";
      } else if (res.status === 500) {
        if (data.error === "openai_key_missing") {
          statusMsg = data.message || "OPENAI_API_KEY отсутствует на VPS";
        } else {
          statusMsg = "Ошибка сервера. Проверьте логи функции.";
        }
      } else if (res.status === 502) {
        statusMsg = data.error === "vps_unreachable" 
          ? "VPS недоступен. Проверьте доступность и порт."
          : data.error === "vps_timeout"
          ? "Таймаут соединения с VPS (>10s). Проверьте сеть."
          : errorMsg;
      } else if (res.status === 504) {
        statusMsg = "Таймаут от VPS. Проверьте доступность сервера.";
      } else {
        statusMsg = errorMsg;
      }
      throw new Error(`${statusMsg} (HTTP ${res.status})`);
    }

    return data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    setError("");
    setResponse("");
    setDebugInfo(null);
    setPendingMessage("Отправка...");

    try {
      const requestBody = {
        text: text.trim(),
        history: conversationHistory.slice(-20), // Last 20 messages
        threadId: "ruslan-main",
        mode: mode, // "ops" | "direct"
      };
      const data = await requestAdmin(requestBody);

      // Handle success response - prefer answer, then output, then text, then reply
      const answerText = data.answer || data.output || data.text || data.reply || "";
      if (!answerText) {
        throw new Error("Ответ получен, но пуст.");
      }
      
      // Update conversation history (keep last 20 messages)
      const newHistory = [
        ...conversationHistory,
        { role: "user" as const, content: text.trim() },
        { role: "assistant" as const, content: answerText },
      ].slice(-20);
      setConversationHistory(newHistory);
      
      // Save to localStorage
      try {
        localStorage.setItem("adminChatHistory", JSON.stringify(newHistory));
      } catch (e) {
        console.error("[Admin] Failed to save chat history:", e);
      }
      
      setResponse(answerText);
      setText(""); // Clear input after successful submission
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsSubmitting(false);
      setPendingMessage(null);
    }
  };

  const handleStabilityReport = async () => {
    setIsSubmitting(true);
    setError("");
    setResponse("");
    setDebugInfo(null);
    setPendingMessage("Генерирую отчет...");

    try {
      const data = await requestAdmin(
        { action: "snapshot:report", text: "manual run" },
        { timeoutMs: 180_000 },
      );
      const answerText = data.reportMd || data.answer || data.output || data.text || data.reply || "";
      if (!answerText) {
        throw new Error("Отчет получен, но пуст.");
      }

      const snapshotUserText = "Отчет устойчивости";
      const newHistory = [
        ...conversationHistory,
        { role: "user" as const, content: snapshotUserText },
        { role: "assistant" as const, content: answerText },
      ].slice(-20);
      setConversationHistory(newHistory);
      try {
        localStorage.setItem("adminChatHistory", JSON.stringify(newHistory));
      } catch (e) {
        console.error("[Admin] Failed to save chat history:", e);
      }

      setResponse(answerText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsSubmitting(false);
      setPendingMessage(null);
    }
  };

  if (isLoading) {
    return (
      <>
        {themeToggle}
        <Header />
        <main className={`min-h-screen ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-white text-zinc-900"}`}>
          <div className="max-w-4xl mx-auto py-10 px-4">
            <div className="text-center space-y-4">
              <div>Загрузка...</div>
              {error && (
                <>
                  <div className={`px-4 py-3 rounded-xl text-sm ${isDark ? "bg-red-950 border border-red-900 text-red-200" : "bg-red-50 border border-red-200 text-red-700"}`}>
                    {error}
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleOpenLogin}
                      className={`inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold transition ${primaryButtonClass}`}
                    >
                      Войти
                    </button>
                    <button
                      onClick={performLogout}
                      className={`inline-flex items-center justify-center rounded-full border px-6 py-2.5 text-sm font-semibold transition ${secondaryButtonClass}`}
                    >
                      Сбросить вход
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        {themeToggle}
        <Header />
        <main className={`min-h-screen ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-white text-zinc-900"}`}>
          <div className="max-w-4xl mx-auto py-10 px-4">
            <div className="text-center space-y-4">
              <h1 className={`text-2xl font-semibold ${textPrimary}`}>
                Админ-панель
              </h1>
              <p className={textSecondary}>
                Необходима авторизация через Netlify Identity
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleOpenLogin}
                  className={`inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold transition ${primaryButtonClass}`}
                >
                  Войти (GitHub / Email)
                </button>
                <button
                  onClick={performLogout}
                  className={`inline-flex items-center justify-center rounded-full border px-6 py-2.5 text-sm font-semibold transition ${secondaryButtonClass}`}
                >
                  Сбросить вход
                </button>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!hasAdminRole) {
    return (
      <>
        {themeToggle}
        <Header />
        <main className={`min-h-screen ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-white text-zinc-900"}`}>
          <div className="max-w-4xl mx-auto py-10 px-4">
            <div className="text-center space-y-4">
              <h1 className={`text-2xl font-semibold ${textPrimary}`}>
                Доступ запрещён
              </h1>
              <p className={textSecondary}>
                Для доступа к этой странице требуется роль admin.
              </p>
              <p className={`text-sm ${textMuted}`}>
                Вы вошли как: {user.email}
              </p>
              <button
                onClick={performLogout}
                className={`inline-flex items-center justify-center rounded-full border px-6 py-2.5 text-sm font-semibold transition ${secondaryButtonClass}`}
              >
                Выйти
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      {themeToggle}
      <Header />
      <main className={`min-h-screen ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-white text-zinc-900"}`}>
        <div className="max-w-4xl mx-auto py-10 px-4 space-y-6">
          {/* === ADMIN BUILD MARKER === */}
          <div className={`border-2 rounded-xl p-4 text-center ${
            isDark ? "bg-yellow-900/30 border-yellow-700" : "bg-yellow-100 border-yellow-400"
          }`}>
            <div className={`text-lg font-bold mb-1 ${isDark ? "text-yellow-100" : "text-yellow-900"}`}>
              === ADMIN BUILD MARKER ===
            </div>
            <div className={`text-sm font-mono ${isDark ? "text-yellow-200" : "text-yellow-800"}`}>
              Git SHA: {import.meta.env.VITE_COMMIT_REF || "unknown"} | Build time:{" "}
              {import.meta.env.VITE_BUILD_TIME || "unknown"} | Source: src/pages/Admin.tsx
            </div>
            <div className={`text-sm mt-2 font-semibold ${isDark ? "text-yellow-200" : "text-yellow-700"}`}>
              DEPLOY PROOF: if you see this, GitHub → Netlify pipeline is correct
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-semibold ${textPrimary}`}>
                Админ-панель
              </h1>
              <p className={`text-sm mt-1 ${textSecondary}`}>
                Вопросы к OpenAI на основе PROJECT_CONTEXT.md
              </p>
            </div>
            <button
              onClick={performLogout}
              className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${secondaryButtonClass}`}
            >
              Выйти ({user.email})
            </button>
          </div>

          {/* Chat History */}
          {conversationHistory.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-semibold ${textPrimary}`}>
                  История диалога
                </h2>
                <button
                  onClick={handleClearHistory}
                  className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-medium transition ${secondaryButtonClass}`}
                >
                  Очистить
                </button>
              </div>
              <div className={`text-xs mb-2 ${textMuted}`}>
                Очищает историю только в браузере. Серверный thread {threadLabel} не трогает.
              </div>
              <div className={`space-y-3 max-h-96 overflow-y-auto p-4 border rounded-xl ${panelClass}`}>
                {conversationHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`${
                      msg.role === "user" ? "text-right" : "text-left"
                    }`}
                  >
                    <div className={`text-xs font-medium mb-1 ${textSecondary}`}>
                      {msg.role === "user" ? "Ты:" : "NovaCiv Admin:"}
                    </div>
                    <div
                      className={`inline-block px-4 py-2 rounded-lg text-sm ${
                        msg.role === "user"
                          ? isDark
                            ? "bg-zinc-100 text-zinc-900"
                            : "bg-zinc-900 text-white"
                          : isDark
                          ? "bg-zinc-900 text-zinc-100 border border-zinc-700"
                          : "bg-white text-zinc-700 border border-zinc-300"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}
                <div ref={historyEndRef} />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Mode selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={`block text-sm font-medium ${textSecondary}`}>
                  Режим ответа
                </label>
                <div className={`text-xs ${textSecondary}`}>
                  <span className="font-medium">Режим:</span> {mode === "ops" ? "Оперативка (строго)" : "Диалог (свободно)"} | <span className="font-medium">Тред:</span> {threadLabel}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("ops");
                    localStorage.setItem("admin_mode", "ops");
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                    mode === "ops" ? modeActiveClass : modeInactiveClass
                  }`}
                  disabled={isSubmitting}
                >
                  Оперативка (строго)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("direct");
                    localStorage.setItem("admin_mode", "direct");
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                    mode === "direct" ? modeActiveClass : modeInactiveClass
                  }`}
                  disabled={isSubmitting}
                >
                  Диалог (свободно)
                </button>
                <button
                  type="button"
                  onClick={handleStabilityReport}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${reportButtonClass}`}
                  disabled={isSubmitting}
                >
                  Отчет устойчивости
                </button>
              </div>
              <div className={`text-xs mt-1 ${textMuted}`}>
                {mode === "ops" ? (
                  <>
                    <span className="font-medium">Оперативка:</span> Коротко и по делу: текущая проблема → причина → один следующий шаг. Без лишних планов.
                  </>
                ) : (
                  <>
                    <span className="font-medium">Диалог (свободно):</span> Живой чат без шаблонов и планов. Подходит для обсуждений и решений напрямую.
                  </>
                )}
                {debugInfo?.mode && (
                  <span className={`ml-3 ${textSecondary}`}>server mode: {debugInfo.mode}</span>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="text"
                className={`block text-sm font-medium mb-2 ${textSecondary}`}
              >
                Вопрос
              </label>
              <textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                className={`w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 resize-none ${inputClass}`}
                placeholder="Введите ваш вопрос..."
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className={`px-4 py-3 rounded-xl text-sm ${isDark ? "bg-red-950 border border-red-900 text-red-200" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !text.trim()}
              className={`inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition ${primaryButtonClass}`}
            >
              {isSubmitting ? "Отправка..." : "Отправить"}
            </button>
          </form>

          {isSubmitting && (
            <div className={`mt-6 p-6 border rounded-xl ${panelClass}`}>
              <div className={textSecondary}>{pendingMessage || "ожидаю..."}</div>
            </div>
          )}

          {response && !isSubmitting && (
            <div className={`mt-6 p-6 border rounded-xl ${panelClass}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className={`text-sm font-semibold ${textSecondary}`}>
                  Ответ:
                </h2>
                <button
                  onClick={handleCopyResponse}
                  className={`inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium transition ${secondaryButtonClass}`}
                >
                  {copiedStatus ? "Скопировано" : "Скопировать"}
                </button>
              </div>
              <div className={`prose prose-sm max-w-none whitespace-pre-wrap ${isDark ? "prose-invert text-zinc-100" : "text-zinc-700"}`}>
                {response}
              </div>
              {debugInfo?.mode && (
                <div className={`mt-3 text-xs ${textMuted}`}>
                  server mode: {debugInfo.mode}
                </div>
              )}
            </div>
          )}

          {/* Debug area (non-secret) */}
          {debugInfo && (
            <div className={`mt-4 p-4 border rounded-xl text-sm ${
              isDark ? "bg-yellow-900/30 border-yellow-700 text-yellow-100" : "bg-yellow-50 border-yellow-200"
            }`}>
              <div className={`font-semibold mb-2 ${isDark ? "text-yellow-100" : "text-yellow-800"}`}>Debug Info:</div>
              <div className={`font-mono text-xs space-y-1 ${isDark ? "text-yellow-200" : "text-yellow-700"}`}>
                <div><strong>URL:</strong> {debugInfo.url}</div>
                <div><strong>HTTP Status:</strong> {debugInfo.status}</div>
                {debugInfo.origin && (
                  <div><strong>Origin:</strong> {debugInfo.origin}</div>
                )}
                {debugInfo.upstreamUrl && (
                  <div><strong>Upstream URL:</strong> {debugInfo.upstreamUrl}</div>
                )}
                {debugInfo.upstreamStatus !== undefined && debugInfo.upstreamStatus !== null && (
                  <div><strong>Upstream Status:</strong> {debugInfo.upstreamStatus}</div>
                )}
                {debugInfo.mode && (
                  <div><strong>server mode:</strong> {debugInfo.mode}</div>
                )}
                <div><strong>JSON Keys:</strong> {debugInfo.jsonKeys.length > 0 ? debugInfo.jsonKeys.join(", ") : "none"}</div>
                {debugInfo.threadId && (
                  <div><strong>Thread ID:</strong> {debugInfo.threadId}</div>
                )}
                {typeof debugInfo.pairCount === "number" && (
                  <div><strong>pairCount:</strong> {debugInfo.pairCount}</div>
                )}
                {debugInfo.lastSummaryTs && (
                  <div><strong>lastSummaryTs:</strong> {debugInfo.lastSummaryTs}</div>
                )}
                <div><strong>Raw Response (truncated):</strong></div>
                <div className={`p-2 rounded border overflow-auto max-h-32 ${
                  isDark ? "bg-zinc-900 border-yellow-700 text-zinc-100" : "bg-white border-yellow-300"
                }`}>
                  {debugInfo.rawResponse || "(empty)"}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// Export with error boundary
export default function Admin() {
  return (
    <AdminErrorBoundary>
      <AdminInner />
    </AdminErrorBoundary>
  );
}
