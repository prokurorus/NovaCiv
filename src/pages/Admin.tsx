import React, { useEffect, useState, useRef } from "react";
import Header from "../components/Header";

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

export default function Admin() {
  const [user, setUser] = useState<NetlifyIdentityUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAdminRole, setHasAdminRole] = useState(false);
  const [text, setText] = useState("");
  const [response, setResponse] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const initCalledRef = useRef(false);

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
    if (!window.netlifyIdentity) {
      // Ждём загрузки скрипта
      const checkInterval = setInterval(() => {
        if (window.netlifyIdentity && !initCalledRef.current) {
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
    } else if (!initCalledRef.current) {
      initIdentity();
    }
  }, []);

  const initIdentity = () => {
    if (!window.netlifyIdentity || initCalledRef.current) return;
    
    initCalledRef.current = true;

    // Инициализируем один раз
    window.netlifyIdentity.init();

    // Обработчик init - источник истины
    window.netlifyIdentity.on("init", (user) => {
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

    // Обработчик login
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

    // Обработчик logout
    window.netlifyIdentity.on("logout", () => {
      setUser(null);
      setHasAdminRole(false);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    setError("");
    setResponse("");

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

  if (isLoading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-white">
          <div className="max-w-4xl mx-auto py-10 px-4">
            <div className="text-center">Загрузка...</div>
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
                  onClick={() => window.netlifyIdentity?.open()}
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

          {response && (
            <div className="mt-6 p-6 bg-zinc-50 border border-zinc-200 rounded-xl">
              <h2 className="text-sm font-semibold text-zinc-700 mb-3">
                Ответ:
              </h2>
              <div className="prose prose-sm max-w-none text-zinc-700 whitespace-pre-wrap">
                {response}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
