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

type LanguageCode = "ru" | "en" | "de";

const STORAGE_KEY_OPEN = "novaciv_domovoy_open";
const STORAGE_KEY_MUTED = "novaciv_domovoy_muted";
const STORAGE_KEY_USER_ID = "novaciv_domovoy_user_id";
const STORAGE_KEY_LANG = "novaciv_domovoy_lang";

const usePersistentState = <T,>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] => {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored != null) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return defaultValue;
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
    const existing = window.localStorage.getItem(STORAGE_KEY_USER_ID);
    if (existing) return existing;
    const id = `u_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    window.localStorage.setItem(STORAGE_KEY_USER_ID, id);
    return id;
  } catch {
    return null;
  }
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

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [lang, setLang] = usePersistentState<LanguageCode>(
    STORAGE_KEY_LANG,
    "ru",
  );

  // Автопрокрутка вниз при появлении нового сообщения
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Мягкая нормализация: не даём сильно разрастись одному сообщению
  const normalizeText = (text: string, maxLength: number = 4000): string => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    return trimmed.length > maxLength
      ? trimmed.slice(0, maxLength - 1).trimEnd() + "…"
      : trimmed;
  };

  const buildPreview = (content: string, maxLength: number = 260): string => {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) return normalized;
    const cut = normalized.slice(0, maxLength);
    const lastDot = cut.lastIndexOf(".");
    if (lastDot > 60) {
      return cut.slice(0, lastDot + 1);
    }
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 60) {
      return cut.slice(0, lastSpace) + "…";
    }
    return cut + "…";
  };

  const userId = generateUserId();

  // ---------- Загрузка последних сообщений Домового из Firebase (лента) ----------
  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      try {
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
        setMessages(list);
      } catch (err) {
        console.error("[AssistantWidget] load messages error:", err);
      }
    };

    load();
  }, [userId]);

  // ---------- Извлечение текстового контекста текущей страницы ----------
  const getPageContext = (maxChars: number = 8000): string => {
    if (typeof document === "undefined") return "";
    try {
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

  // ---------- Отправка запроса к серверной функции Домового ----------
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

    try {
      const response = await fetch("/.netlify/functions/ai-domovoy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          lang,
          question: userText,
          pageContext: getPageContext(),
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            text: m.text,
          })),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("ai-domovoy error:", response.status, text);
        throw new Error("Ошибка ответа Домового");
      }

      const data = await response.json();

      const assistantText = normalizeText(data.answer || "");
      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: assistantText,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (!isMuted && data.audioUrl) {
        try {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          const audio = new Audio(data.audioUrl);
          audioRef.current = audio;
          await audio.play();
        } catch (err) {
          console.error("Audio play error:", err);
        }
      }

      if (data.shouldPostToFeed && data.feedTitle) {
        try {
          const title: string = data.feedTitle || "NovaCiv";
          const preview = buildPreview(assistantText);
          const now = Date.now();

          const postLang =
            lang === "ru" || lang === "en" || lang === "de" ? lang : "ru";

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
          console.error("Failed to create feed post:", err);
        }
      }
    } catch (err: any) {
      console.error("Error in handleSend:", err);
      setError(
        err && err.message
          ? String(err.message)
          : "Произошла ошибка. Попробуйте ещё раз.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------- Голосовой ввод ----------
  const handleVoiceInput = () => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Голосовой ввод не поддерживается в этом браузере.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.lang = lang === "ru" ? "ru-RU" : lang === "de" ? "de-DE" : "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        handleSend(transcript, true);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event);
        setError("Ошибка голосового ввода.");
      };

      recognition.onend = () => {
        recognitionRef.current = null;
      };

      recognition.start();
    } catch (err) {
      console.error("Speech recognition init error:", err);
      setError("Не удалось запустить голосовой ввод.");
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  // ---------- Жесты для мобильных (свайп вниз — закрыть) ----------
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    if (startY == null) return;
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - startY;

    if (deltaY > 80) {
      setIsOpen(false);
    }

    touchStartYRef.current = null;
  };

  const renderMessageText = (m: ChatMessage) => {
    return m.text.split("\n").map((line, i) => (
      <p key={i} className="mb-0.5">
        {line}
      </p>
    ));
  };

  const renderMessagePreview = () => {
    if (!messages.length) return "Спросите Домового о NovaCiv, уставе или смысле.";

    const last = messages[messages.length - 1];
    const label =
      last.role === "assistant"
        ? "Домовой:"
        : lang === "ru"
        ? "Вы:"
        : lang === "de"
        ? "Du:"
        : "You:";

    const normalized = last.text.replace(/\s+/g, " ").trim();
    const preview =
      normalized.length > 80 ? normalized.slice(0, 77).trimEnd() + "…" : normalized;

    return `${label} ${preview}`;
  };

  return (
    <>
      {/* Кнопка открытия/закрытия */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 shadow-lg shadow-zinc-900/5 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400 md:bottom-6 md:right-6"
      >
        <span className="sr-only">Открыть Домового</span>
        <span className="text-xl">◎</span>
      </button>

      {/* Панель Домового */}
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-zinc-200 bg-white shadow-xl shadow-zinc-900/10 md:inset-auto md:bottom-6 md:right-6 md:h-[480px] md:w-[360px] md:rounded-3xl md:border md:bg-white"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex h-full flex-col">
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
                  onClick={handleClearChat}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-500 hover:bg-zinc-100"
                  title="Очистить диалог"
                >
                  ⟲
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

            {isProcessing && (
              <div className="px-4 pt-1 text-[11px] text-zinc-400">
                Домовой думает…
              </div>
            )}

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
                      ? "bg-zinc-100 text-zinc-900"
                      : "ml-auto bg-zinc-900 text-white"
                  }`}
                >
                  {renderMessageText(m)}
                </div>
              ))}
              {!messages.length && (
                <div className="text-xs text-zinc-400">
                  Домовой знает Устав, Манифест и структуру сайта NovaCiv. Спросите его
                  о правах, принципах или смысле проекта.
                </div>
              )}
            </div>

            {/* Ошибка */}
            {error && (
              <div className="px-4 pb-2 text-xs text-red-500">{error}</div>
            )}

            {/* Панель ввода */}
            <form
              onSubmit={handleManualSubmit}
              className="flex items-center gap-2 border-t border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              <button
                type="button"
                onClick={handleVoiceInput}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-600 hover:bg-zinc-100"
                disabled={isProcessing}
              >
                🎙
              </button>

              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as LanguageCode)}
                className="h-8 rounded-full border border-zinc-300 bg-white px-2 text-xs text-zinc-700"
              >
                <option value="ru">RU</option>
                <option value="en">EN</option>
                <option value="de">DE</option>
              </select>

              <div className="flex-1">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={
                    lang === "ru"
                      ? "Спросите Домового…"
                      : lang === "de"
                      ? "Frag den Domovoy…"
                      : "Ask Domovoy…"
                  }
                  className="h-9 w-full rounded-full border border-zinc-300 bg-white px-3 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  disabled={isProcessing}
                />
              </div>

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
