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
              <button
                onClick={() => window.netlifyIdentity?.open()}
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition"
              >
                Войти
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!checkAdminRole(user)) {
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
                onClick={() => window.netlifyIdentity?.logout()}
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
              onClick={() => window.netlifyIdentity?.logout()}
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
