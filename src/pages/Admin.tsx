import React, { useEffect, useState, useRef, ErrorInfo, ReactNode } from "react";
import Header from "../components/Header";

// ============================================
// === ADMIN BUILD MARKER ===
// Git SHA: ca75353
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
  const [debugInfo, setDebugInfo] = useState<{
    url: string;
    status: number | null;
    rawResponse: string;
    jsonKeys: string[];
  } | null>(null);
  const initCalledRef = useRef(false);
  const initEventFiredRef = useRef(false);
  const timersRef = useRef<Array<NodeJS.Timeout>>([]);
  const stillLoadingRef = useRef(true);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    setError("");
    setResponse("");
    setDebugInfo(null);

    try {
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

      const requestUrl = "/.netlify/functions/admin-domovoy";
      const res = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ text: text.trim() }),
      });

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
      setDebugInfo({
        url: requestUrl,
        status: res.status,
        rawResponse: rawResponseTruncated,
        jsonKeys,
      });

      // Handle error responses (ok: false or non-200 status)
      if (!res.ok || data.ok === false) {
        const errorMsg = data.error || data.message || "Ошибка запроса";
        const statusMsg = res.status === 401 
          ? "Не авторизован. Проверьте вход через Netlify Identity."
          : res.status === 403
          ? "Доступ запрещён. Требуется роль admin."
          : res.status === 500
          ? "Ошибка сервера. Проверьте логи функции."
          : errorMsg;
        throw new Error(`${statusMsg} (HTTP ${res.status})`);
      }

      // Handle success response - prefer answer, then output, then text, then reply
      const answerText = data.answer || data.output || data.text || data.reply || "";
      if (!answerText) {
        throw new Error("Ответ получен, но пуст.");
      }
      setResponse(answerText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-white">
          <div className="max-w-4xl mx-auto py-10 px-4">
            <div className="text-center space-y-4">
              <div>Загрузка...</div>
              {error && (
                <>
                  <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    {error}
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleOpenLogin}
                      className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition"
                    >
                      Войти
                    </button>
                    <button
                      onClick={performLogout}
                      className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 transition"
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
        <Header />
        <main className="min-h-screen bg-white">
          <div className="max-w-4xl mx-auto py-10 px-4">
            <div className="text-center space-y-4">
              <h1 className="text-2xl font-semibold text-zinc-900">
                Админ-панель
              </h1>
              <p className="text-zinc-600">
                Необходима авторизация через Netlify Identity
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleOpenLogin}
                  className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition"
                >
                  Войти (GitHub / Email)
                </button>
                <button
                  onClick={performLogout}
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 transition"
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
        <Header />
        <main className="min-h-screen bg-white">
          <div className="max-w-4xl mx-auto py-10 px-4">
            <div className="text-center space-y-4">
              <h1 className="text-2xl font-semibold text-zinc-900">
                Доступ запрещён
              </h1>
              <p className="text-zinc-600">
                Для доступа к этой странице требуется роль admin.
              </p>
              <p className="text-sm text-zinc-500">
                Вы вошли как: {user.email}
              </p>
              <button
                onClick={performLogout}
                className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 transition"
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
      <Header />
      <main className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto py-10 px-4 space-y-6">
          {/* === ADMIN BUILD MARKER === */}
          <div className="bg-yellow-100 border-2 border-yellow-400 rounded-xl p-4 text-center">
            <div className="text-lg font-bold text-yellow-900 mb-1">
              === ADMIN BUILD MARKER ===
            </div>
            <div className="text-sm text-yellow-800 font-mono">
              Git SHA: ca75353 | Source: src/pages/Admin.tsx
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">
                Админ-панель
              </h1>
              <p className="text-sm text-zinc-600 mt-1">
                Вопросы к OpenAI на основе PROJECT_CONTEXT.md
              </p>
            </div>
            <button
              onClick={performLogout}
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 transition"
            >
              Выйти ({user.email})
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="text"
                className="block text-sm font-medium text-zinc-700 mb-2"
              >
                Вопрос
              </label>
              <textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none"
                placeholder="Введите ваш вопрос..."
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !text.trim()}
              className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isSubmitting ? "Отправка..." : "Отправить"}
            </button>
          </form>

          {isSubmitting && (
            <div className="mt-6 p-6 bg-zinc-50 border border-zinc-200 rounded-xl">
              <div className="text-zinc-600">ожидаю...</div>
            </div>
          )}

          {response && !isSubmitting && (
            <div className="mt-6 p-6 bg-zinc-50 border border-zinc-200 rounded-xl">
              <h2 className="text-sm font-semibold text-zinc-700 mb-3">
                Ответ:
              </h2>
              <div className="prose prose-sm max-w-none text-zinc-700 whitespace-pre-wrap">
                {response}
              </div>
            </div>
          )}

          {/* Debug area (non-secret) */}
          {debugInfo && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm">
              <div className="font-semibold text-yellow-800 mb-2">Debug Info:</div>
              <div className="text-yellow-700 font-mono text-xs space-y-1">
                <div><strong>URL:</strong> {debugInfo.url}</div>
                <div><strong>HTTP Status:</strong> {debugInfo.status}</div>
                <div><strong>JSON Keys:</strong> {debugInfo.jsonKeys.length > 0 ? debugInfo.jsonKeys.join(", ") : "none"}</div>
                <div><strong>Raw Response (truncated):</strong></div>
                <div className="bg-white p-2 rounded border border-yellow-300 overflow-auto max-h-32">
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
