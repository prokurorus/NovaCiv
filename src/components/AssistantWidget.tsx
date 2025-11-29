import React, { useEffect, useRef, useState } from "react";
import {
  ref,
  push,
  query,
  orderByChild,
  limitToLast,
  get,
} from "firebase/database";
import { db } from "../lib/firebase";

type Role = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  fromFeed?: boolean;
}

const STORAGE_KEY_OPEN = "novaciv_domovoy_open";
const STORAGE_KEY_MUTED = "novaciv_domovoy_muted";
const STORAGE_KEY_USER_ID = "novaciv_domovoy_user_id";

const usePersistentState = <T,>(
  key: string,
  defaultValue: T,
): [T, (v: T) => void] => {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue];
};

const generateUserId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const key = STORAGE_KEY_USER_ID;
    const stored = window.localStorage.getItem(key);
    if (stored) return stored;

    const id = `u-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return null;
  }
};

const detectLanguage = (): string => {
  if (typeof document !== "undefined") {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return htmlLang.toLowerCase().slice(0, 2);
    const stored = window.localStorage.getItem(
      "novaciv_language_preference",
    );
    if (stored) return stored;
  }
  return "ru";
};

const AssistantWidget: React.FC = () => {
  const [isOpen, setIsOpen] = usePersistentState<boolean>(
    STORAGE_KEY_OPEN,
    false,
  );
  const [isMuted, setIsMuted] = usePersistentState<boolean>(
    STORAGE_KEY_MUTED,
    false,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const lang = detectLanguage();

  // ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ЛЕНТЫ ----------

  // Делает аккуратный заголовок из текста ответа
  const deriveTitleFromText = (text: string): string => {
    const firstLine = text.split(/\r?\n/)[0].trim();
    if (firstLine.length > 0 && firstLine.length <= 80) {
      return firstLine;
    }
    const noBreaks = text.replace(/\s+/g, " ").trim();
    if (noBreaks.length <= 80) return noBreaks;
    return noBreaks.slice(0, 77) + "…";
  };

  // Берём первые несколько предложений
  const derivePreviewFromText = (text: string): string => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    const sentences = normalized.split(/([.!?])/);
    let acc = "";
    for (let i = 0; i < sentences.length; i += 2) {
      const part = sentences[i];
      const delim = sentences[i + 1] || "";
      const next = (acc + part + delim).trim();
      if (next.length > 240) break;
      acc = next;
    }
    if (!acc) {
      return normalized.length > 240
        ? normalized.slice(0, 237) + "…"
        : normalized;
    }
    return acc;
  };

  // ID пользователя для привязки к сообщениям/постам
  const userId = generateUserId();

  // ---------- Загрузка последних сообщений из Firebase (лента Домового) ----------
  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      try {
        const messagesRef = query(
          ref(db, "assistantMessages"),
          orderByChild("userId"),
          // Для простоты берём не по userId, а по времени, позже можно усложнить
        );
        // Но чтобы не тащить всё подряд — берём последние N по createdAt
        const recentRef = query(
          ref(db, "assistantMessages"),
          orderByChild("createdAt"),
          limitToLast(50),
        );
        const snap = await get(recentRef);
        if (!snap.exists()) return;
        const raw = snap.val() || {};
        const list: ChatMessage[] = Object.entries(raw).map(
          ([id, value]) => {
            const v = value as any;
            return {
              id,
              role: v.role === "assistant" ? "assistant" : "user",
              text: v.text ?? "",
              fromFeed: true,
            };
          },
        );
        list.sort((a, b) => {
          const ca = (raw[a.id as any]?.createdAt as number) || 0;
          const cb = (raw[b.id as any]?.createdAt as number) || 0;
          return ca - cb;
        });
        setMessages(list.slice(-12));
      } catch (e) {
        console.error("Failed to load assistant messages:", e);
      }
    };

    load();
  }, [userId]);

  // ---------- Запись пары сообщений в Firebase ----------
  const savePairToFirebase = async (
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
  ) => {
    try {
      const messagesRef = ref(db, "assistantMessages");
      const now = Date.now();
      await push(messagesRef, {
        userId: userId ?? null,
        createdAt: now,
        page:
          typeof window !== "undefined"
            ? window.location.pathname
            : "/",
        language: lang,
        userText: userMessage.text,
        assistantText: assistantMessage.text,
        role: "assistant",
      });
    } catch (err) {
      console.error("Failed to save assistant messages:", err);
    }
  };

  // ---------- Голосовой ввод (Web Speech API) ----------
  const handleVoiceInput = () => {
    if (typeof window === "undefined" || !("webkitSpeechRecognition" in window)) {
      setError(
        lang.startsWith("ru")
          ? "Голосовой ввод не поддерживается в этом браузере."
          : "Voice input is not supported in this browser.",
      );
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang =
      lang === "ru"
        ? "ru-RU"
        : lang === "de"
        ? "de-DE"
        : lang === "es"
        ? "es-ES"
        : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const result = event.results?.[0]?.[0]?.transcript;
      if (result) {
        handleSend(result, true);
      }
    };

    recognition.onerror = () => {
      setError(
        lang.startsWith("ru")
          ? "Не удалось записать голос. Попробуй ещё раз."
          : "Failed to capture voice. Please try again.",
      );
    };

    recognition.onend = () => {
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setError(
        lang.startsWith("ru")
          ? "Не удалось запустить микрофон."
          : "Could not start the microphone.",
      );
    }
  };

  // ---------- Извлечение текстового контекста текущей страницы ----------
  const getPageContext = (maxChars: number = 8000): string => {
    if (typeof document === "undefined") return "";
    try {
      // Берём содержимое основного блока страницы.
      const mainEl = document.querySelector("main");
      const rawText =
        (mainEl as HTMLElement | null)?.innerText ??
        document.body.innerText ??
        "";

      const text = rawText.replace(/\s+/g, " ").trim();
      return text.length > maxChars ? text.slice(0, maxChars) : text;
    } catch {
      return "";
    }
  };

  // ---------- Вызов Netlify-функции с текстом ----------
  const sendToBackend = async (
    userText: string,
  ): Promise<{ answer?: string; error?: string }> => {
    const page =
      typeof window !== "undefined" ? window.location.pathname : "/";

    // Берём только последние 20 сообщений
    const recentMessages = messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.text,
    }));

    try {
      const res = await fetch("/.netlify/functions/ai-domovoy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: lang,
          page,
          pageContext: getPageContext(),
          messages: recentMessages.concat([
            {
              role: "user",
              content: userText,
            },
          ]),
        }),
      });

      const data = await res.json();
      return { answer: data.answer, error: data.error };
    } catch {
      return {
        error: lang.startsWith("ru")
          ? "Сеть недоступна. Попробуй ещё раз."
          : "Network error. Please try again.",
      };
    }
  };

  // ---------- Запрос на озвучку (используем и для ответов, и для подсказок) ----------
  async function requestVoice(text: string): Promise<void> {
    try {
      const res = await fetch("/.netlify/functions/ai-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: lang,
          text,
          voice: "domovoy",
        }),
      });

      if (!res.ok) {
        console.error("ai-voice error:", await res.text());
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (!audioRef.current) {
        audioRef.current = new Audio();
      } else {
        try {
          audioRef.current.pause();
        } catch {
          // ignore
        }
      }

      audioRef.current.src = url;
      audioRef.current.play().catch(() => {
        // Игнорируем ошибки автоплея
      });
    } catch (err) {
      console.error("Voice request failed:", err);
    }
  }

  // ---------- Отправка сообщения ----------
  const handleSend = async (text?: string, fromVoice?: boolean) => {
    const userText = typeof text === "string" ? text : inputValue;
    if (!userText.trim() || isProcessing) return;

    setError(null);
    setIsProcessing(true);

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: userText.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!fromVoice) {
      setInputValue("");
    }

    const { answer, error } = await sendToBackend(userText.trim());

    if (error) {
      setError(error);
      setIsProcessing(false);
      return;
    }

    const safeAnswer = answer || "";

    const assistantMessage: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      text: safeAnswer,
    };

    setMessages((prev) => [...prev, assistantMessage]);

    savePairToFirebase(userMessage, assistantMessage);

    if (!isMuted && safeAnswer) {
      requestVoice(safeAnswer);
    }

    setIsProcessing(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  // ---------- Публикация ответа Домового в Ленту ----------
  const publishToFeed = async (assistantMessage: ChatMessage) => {
    if (!assistantMessage.text.trim()) return;

    const title = deriveTitleFromText(assistantMessage.text);
    const preview = derivePreviewFromText(assistantMessage.text);

    // Определяем язык поста по языку интерфейса
    const postLang =
      lang === "ru" || lang === "en" || lang === "de" || lang === "es"
        ? lang
        : "ru";

    const now = Date.now();

    try {
      const topicRef = ref(db, "forum");
      await push(topicRef, {
        title,
        content: assistantMessage.text,
        section: "news",
        createdAt: now,
        createdAtServer: new Date().toISOString(),
        lang: postLang,
        authorNickname: "Domovoy",
        source: "assistant_auto",
        preview,
      });
    } catch (err) {
      console.error("Failed to publish to feed:", err);
      setError(
        lang.startsWith("ru")
          ? "Не получилось отправить в Ленту. Попробуй ещё раз позже."
          : "Failed to publish to the feed. Please try again later.",
      );
      throw err;
    }
  };

  // ---------- Скролл вниз при новых сообщениях ----------
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // ---------- Жесты для мобильных: свайп вниз/вверх ----------
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartYRef.current = touch.clientY;
    touchStartXRef.current = touch.clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchStartY = touchStartYRef.current;
    const touchStartX = touchStartXRef.current;
    touchStartYRef.current = null;
    touchStartXRef.current = null;

    if (touchStartY === null || touchStartX === null) return;

    const touch = e.changedTouches[0];
    const deltaY = touch.clientY - touchStartY;
    const deltaX = touch.clientX - touchStartX;

    // Игнорируем горизонтальные или слишком маленькие движения
    if (Math.abs(deltaX) > Math.abs(deltaY) || Math.abs(deltaY) < 40) return;

    if (deltaY > 0 && isOpen) {
      // свайп вниз — закрыть
      setIsOpen(false);
    } else if (deltaY < 0 && !isOpen) {
      // свайп вверх — открыть
      setIsOpen(true);
    }
  };

  if (typeof window === "undefined") return null;

  return (
    <>
      {/* Кнопка открытия/закрытия */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg shadow-zinc-900/30 focus:outline-none focus:ring-2 focus:ring-zinc-400 md:bottom-6 md:right-6"
      >
        <span className="sr-only">Открыть Домового</span>
        <span className="text-xl">◎</span>
      </button>

      {/* Панель Домового */}
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-zinc-200 bg-white/95 shadow-2xl shadow-zinc-900/40 backdrop-blur md:inset-auto md:bottom-6 md:right-6 md:h-[480px] md:w-[360px] md:rounded-3xl md:border md:bg-white"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex h-full flex-col">
            {/* Заголовок */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-400">
                  Домовой NovaCiv
                </div>
                <div className="text-sm font-semibold text-zinc-900">
                  Голосовой помощник · {lang.toUpperCase()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                    isMuted
                      ? "border-zinc-300 text-zinc-400 bg-zinc-50"
                      : "border-zinc-800 text-zinc-900 bg-zinc-100"
                  }`}
                >
                  {isMuted ? "🔇" : "🔊"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-500 hover:bg-zinc-100"
                >
                  ✕
                </button>
              </div>
            </header>

            {/* Лента сообщений */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm text-zinc-800"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                    m.role === "assistant"
                      ? "ml-auto bg-zinc-900 text-white"
                      : "mr-auto bg-zinc-100 text-zinc-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              ))}
              {isProcessing && (
                <div className="ml-auto max-w-[60%] rounded-2xl bg-zinc-900 px-3 py-2 text-xs text-zinc-100 opacity-70">
                  …
                </div>
              )}
            </div>

            {/* Ошибка, если есть */}
            {error && (
              <div className="px-4 pb-1 text-xs text-red-500">
                {error}
              </div>
            )}

            {/* Поле ввода и кнопки */}
            <form
              onSubmit={handleManualSubmit}
              className="flex items-center gap-2 border-t border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              <button
                type="button"
                onClick={handleVoiceInput}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs text-white shadow-sm"
              >
                🎤
              </button>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  lang.startsWith("ru")
                    ? "Задай вопрос текстом…"
                    : "Ask your question…"
                }
                className="flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
              <button
                type="submit"
                disabled={isProcessing || !inputValue.trim()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs text-white shadow-sm disabled:opacity-40"
              >
                ➤
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AssistantWidget;
