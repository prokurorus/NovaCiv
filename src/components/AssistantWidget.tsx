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
}

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

// ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ПАМЯТИ ----------
const MESSAGES_LIMIT = 30; // сколько последних сообщений храним

const getOrCreateClientId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const key = "novaciv_client_id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
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
    const stored = window.localStorage.getItem("novaciv-lang");
    if (stored) return stored.toLowerCase().slice(0, 2);
  }
  if (typeof navigator !== "undefined") {
    return navigator.language.toLowerCase().slice(0, 2);
  }
  return "ru";
};

const AssistantWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pendingText, setPendingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loadedFromFirebase, setLoadedFromFirebase] = useState(false);

  const [showGestureHint, setShowGestureHint] = useState(false);
  const [gestureVoiceHintDone, setGestureVoiceHintDone] = useState(false);

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
    if (firstLine.length >= 10 && firstLine.length <= 120) {
      return firstLine;
    }
    if (firstLine.length > 120) {
      return firstLine.slice(0, 117) + "...";
    }

    const sentenceMatch = text.match(/^(.{20,120}?)[.!?](\s|$)/s);
    if (sentenceMatch) {
      return sentenceMatch[1].trim();
    }

    const trimmed = text.trim();
    if (trimmed.length <= 80) return trimmed;
    return trimmed.slice(0, 77) + "…";
  };

  // Публикация новости в раздел "Новости движения" форума
  const postNewsToForum = async (title: string, content: string) => {
    try {
      const topicsRef = ref(db, "forum/topics");
      const ts = Date.now();

      await push(topicsRef, {
        title: title.trim(),
        content: content.trim(),
        section: "news",
        createdAt: ts,
        createdAtServer: ts,
        authorNickname: clientId || null,
        lang: lang.toLowerCase().slice(0, 2),
      });
    } catch (err) {
      console.error("News publish error:", err);
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

  // ---------- clientId из localStorage ----------
  useEffect(() => {
    const id = getOrCreateClientId();
    setClientId(id);
  }, []);

  // ---------- Флаги подсказок из localStorage ----------
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const gestureSeen = window.localStorage.getItem(
        "novaciv_gesture_hint_shown",
      );
      if (!gestureSeen) {
        setShowGestureHint(true);
      }
      const voiceSeen = window.localStorage.getItem(
        "novaciv_gesture_voice_hint_done",
      );
      if (voiceSeen) {
        setGestureVoiceHintDone(true);
      }
    } catch {
      // игнорируем
    }
  }, []);

  // ---------- Загрузка последних сообщений из Firebase ----------
  useEffect(() => {
    if (!clientId || loadedFromFirebase) return;
    const load = async () => {
      try {
        const messagesRef = ref(
          db,
          `assistantSessions/${clientId}/messages`,
        );
        const q = query(
          messagesRef,
          orderByChild("ts"),
          limitToLast(MESSAGES_LIMIT),
        );
        const snap = await get(q);
        if (!snap.exists()) {
          setLoadedFromFirebase(true);
          return;
        }

        const data: { role: Role; text: string; ts?: number }[] = [];
        snap.forEach((child) => {
          const v = child.val();
          if (
            v &&
            v.text &&
            (v.role === "user" || v.role === "assistant")
          ) {
            data.push({
              role: v.role,
              text: v.text,
              ts: typeof v.ts === "number" ? v.ts : undefined,
            });
          }
        });

        data.sort((a, b) => (a.ts || 0) - (b.ts || 0));

        const restored: ChatMessage[] = data.map((m, index) => ({
          id: `${m.role}-${m.ts ?? index}`,
          role: m.role,
          text: m.text,
        }));

        setMessages(restored);
      } catch (err) {
        console.error("Firebase load error:", err);
      } finally {
        setLoadedFromFirebase(true);
      }
    };
    load();
  }, [clientId, loadedFromFirebase]);

  // ---------- Инициализация SpeechRecognition ----------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window.SpeechRecognition ||
      window.webkitSpeechRecognition ||
      null) as any;

    if (!SR) return;

    const recognition = new SR();
    recognition.lang = lang === "ru" ? "ru-RU" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error !== "no-speech") {
        setError("Проблема с микрофоном. Попробуй ещё раз.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join(" ")
        .trim();

      if (transcript) {
        handleSend(transcript, true);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ---------- Функция скрытия текстовой подсказки о жестах ----------
  const hideGestureHint = () => {
    setShowGestureHint(false);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("novaciv_gesture_hint_shown", "1");
      } catch {
        // ignore
      }
    }
  };

  // ---------- Голосовая подсказка о жестах при первом открытии на телефоне ----------
  useEffect(() => {
    if (!isOpen) return;
    if (gestureVoiceHintDone) return;
    if (typeof window === "undefined") return;

    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    const hintText =
      "Небольшая подсказка: на телефоне мной можно управлять жестами. " +
      "Свайп вверх — новый диалог. Свайп вниз — свернуть окно.";

    requestVoice(hintText).catch(() => {});

    setGestureVoiceHintDone(true);
    try {
      window.localStorage.setItem(
        "novaciv_gesture_voice_hint_done",
        "1",
      );
    } catch {
      // ignore
    }
  }, [isOpen, gestureVoiceHintDone]);

  const toggleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  const handleNewDialog = () => {
    setMessages([]);
    setError(null);
    hideGestureHint();
  };

  const handleMicClick = () => {
    if (!recognitionRef.current) {
      setError("Браузер не поддерживает голосовой ввод.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        setError(null);
        recognitionRef.current.start();
      } catch {
        setError("Не удалось запустить микрофон.");
      }
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
      return { error: "Сеть недоступна. Попробуй ещё раз." };
    }
  };

  // ---------- Запрос на озвучку (используем и для ответов, и для подсказок) ----------
  async function requestVoice(text: string): Promise<void> {
    try {
      const res = await fetch("/.netlify/functions/ai-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      if (!data.audio) return;

      const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
      audioRef.current = audio;
      setIsSpeaking(true);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      audio.play().catch(() => setIsSpeaking(false));
    } catch {
      setIsSpeaking(false);
    }
  }

  // ---------- Сохранение пары сообщений в Firebase ----------
  const savePairToFirebase = async (
    userMsg: ChatMessage,
    assistantMsg: ChatMessage,
  ) => {
    if (!clientId) return;
    try {
      const messagesRef = ref(
        db,
        `assistantSessions/${clientId}/messages`,
      );
      const ts = Date.now();

      await push(messagesRef, {
        role: "user",
        text: userMsg.text,
        ts,
      });

      await push(messagesRef, {
        role: "assistant",
        text: assistantMsg.text,
        ts: ts + 1,
      });
    } catch (err) {
      console.error("Firebase save error:", err);
    }
  };

  // ---------- Отправка сообщения ----------
  const handleSend = async (text: string, fromVoice = false) => {
    const clean = text.trim();
    if (!clean) return;

    setPendingText("");
    setError(null);

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: clean,
    };

    // Проверяем, не команда ли это "добавь в ленту"
    const lower = clean.toLowerCase();

    const isPublishCommand =
      lower === "добавь в ленту" ||
      lower === "в ленту" ||
      lower === "добавь это в ленту" ||
      lower === "/feed" ||
      lower === "/news" ||
      lower === "/tofeed";

    if (isPublishCommand) {
      const lastAssistant = [...messages]
        .slice()
        .reverse()
        .find((m) => m.role === "assistant");

      if (!lastAssistant) {
        setError(
          lang.startsWith("ru")
            ? "Пока нечего отправлять в Ленту — нет последнего ответа."
            : "There is nothing to publish yet — no last answer found.",
        );
        return;
      }

      try {
        const title = deriveTitleFromText(lastAssistant.text);
        await postNewsToForum(title, lastAssistant.text);

        const confirmationText = lang.startsWith("ru")
          ? "Я добавил последний ответ в Ленту движения NovaCiv."
          : "I have added the last answer to the NovaCiv movement feed.";

        const assistantMessage: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: confirmationText,
        };

        setMessages((prev) => [...prev, userMessage, assistantMessage]);
        savePairToFirebase(userMessage, assistantMessage);
        requestVoice(assistantMessage.text);
      } catch {
        // Ошибка уже установлена внутри postNewsToForum
      }
      return;
    }

    // Обычный диалог с Домовым
    setMessages((prev) => [...prev, userMessage]);

    const { answer, error: backendError } = await sendToBackend(clean);

    if (backendError || !answer) {
      if (backendError) setError(backendError);
      return;
    }

    const assistantMessage: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      text: answer,
    };

    setMessages((prev) => [...prev, assistantMessage]);

    savePairToFirebase(userMessage, assistantMessage);

    // озвучиваем ответ
    requestVoice(answer);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingText.trim()) return;
    handleSend(pendingText, false);
  };

  // ---------- ЖЕСТЫ: свайп вверх / вниз ----------
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touchStartYRef.current = t.clientY;
    touchStartXRef.current = t.clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (
      touchStartYRef.current === null ||
      touchStartXRef.current === null
    ) {
      return;
    }

    const t = e.changedTouches[0];
    const deltaY = t.clientY - touchStartYRef.current;
    const deltaX = t.clientX - touchStartXRef.current;

    touchStartYRef.current = null;
    touchStartXRef.current = null;

    const absY = Math.abs(deltaY);
    const absX = Math.abs(deltaX);

    // игнорируем мелкие движения
    if (Math.max(absX, absY) < 40) return;

    // вертикальный свайп важнее
    if (absY > absX) {
      if (deltaY < 0) {
        // свайп вверх — новый диалог
        handleNewDialog();
      } else {
        // свайп вниз — свернуть окно
        hideGestureHint();
        setIsOpen(false);
      }
    }
  };

  // ---------- РЕНДЕР ----------
  return (
    <>
      {/* Плавающая кнопка */}
      <button
        type="button"
        onClick={toggleOpen}
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-white/90 shadow-lg backdrop-blur hover:bg-zinc-50 transition"
        aria-label="Открыть помощника"
      >
        <span className="text-xl">💬</span>
      </button>

      {isOpen && (
        <div
          className="fixed bottom-20 right-4 z-40 w-80 max-h-[70vh] rounded-2xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur flex flex-col overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Заголовок */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 bg-zinc-50/80">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-zinc-900">
                Домовой NovaCiv
              </span>
              <span className="text-[11px] text-zinc-500">
                Голосовой помощник • {lang.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleNewDialog}
                className="text-[11px] px-2 py-1 rounded-full border border-zinc-300 text-zinc-600 hover:bg-zinc-100"
              >
                Новый диалог
              </button>
              <button
                type="button"
                onClick={() => {
                  hideGestureHint();
                  setIsOpen(false);
                }}
                className="text-zinc-500 hover:text-zinc-900 text-lg leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {/* История */}
          <div
            ref={scrollRef}
            className="flex-1 px-3 py-2 space-y-2 overflow-y-auto text-sm text-zinc-800"
          >
            {messages.length === 0 && (
              <div className="text-xs text-zinc-500">
                Задай вопрос голосом или текстом. Голосовой вопрос после
                паузы отправится автоматически.
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`rounded-2xl px-3 py-2 max-w-[80%] whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-900"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {error && (
              <div className="text-[11px] text-red-500 whitespace-pre-wrap">
                {error}
              </div>
            )}
          </div>

          {/* Статус + текстовая подсказка жестов */}
          <div className="px-3 pb-1 text-[11px] text-zinc-500 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span>
                {isListening
                  ? "Слушаю тебя…"
                  : isSpeaking
                  ? "Произношу ответ…"
                  : ""}
              </span>
            </div>
            {showGestureHint && (
              <div className="text-[10px] text-zinc-400">
                На телефоне можно управлять жестами: свайп вверх — новый
                диалог, свайп вниз — свернуть окно.
              </div>
            )}
          </div>

          {/* Ввод */}
          <form
            onSubmit={handleManualSubmit}
            className="px-3 pt-1 pb-3 flex items-center gap-2 border-t border-zinc-200 bg-white/90"
          >
            <button
              type="button"
              onClick={handleMicClick}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-lg ${
                isListening
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
              aria-label="Голосовой ввод"
            >
              🎤
            </button>
            <input
              type="text"
              className="flex-1 h-9 rounded-full border border-zinc-300 px-3 text-sm outline-none focus:ring-1 focus:ring-zinc-400"
              placeholder="Задай вопрос текстом…"
              value={pendingText}
              onChange={(e) => setPendingText(e.target.value)}
            />
            <button
              type="submit"
              className="inline-flex h-9 px-3 items-center justify-center rounded-full border border-zinc-900 bg-zinc-900 text-white text-xs hover:bg-zinc-800"
            >
              ▶
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default AssistantWidget;
