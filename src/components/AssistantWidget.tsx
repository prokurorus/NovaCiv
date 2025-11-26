import React, { useEffect, useRef, useState } from "react";

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

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lang = detectLanguage();

  // Скроллим вниз при новых сообщениях
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Инициализация SpeechRecognition
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;

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
      } catch (_) {}
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const toggleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  const handleNewDialog = () => {
    setMessages([]);
    setError(null);
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
      } catch (err) {
        setError("Не удалось запустить микрофон.");
      }
    }
  };

  const sendToBackend = async (
    userText: string
  ): Promise<{ answer?: string; error?: string }> => {
    const page =
      typeof window !== "undefined" ? window.location.pathname : "/";

    try {
      const res = await fetch("/.netlify/functions/ai-domovoy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: lang,
          page,
          messages: [
            {
              role: "system",
              content:
                "Ты — Домовой проекта NovaCiv. Отвечай кратко, по существу, дружелюбно. Если к тебе обращаются на русском — отвечай по-русски. Если на другом языке — отвечай на нём.",
            },
            ...messages.map((m) => ({
              role: m.role,
              content: m.text,
            })),
            {
              role: "user",
              content: userText,
            },
          ],
        }),
      });

      const data = await res.json();
      return { answer: data.answer, error: data.error };
    } catch (err) {
      return { error: "Сеть недоступна. Попробуй ещё раз." };
    }
  };

  const requestVoice = async (text: string) => {
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
    } catch (err) {
      setIsSpeaking(false);
    }
  };

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

    // Озвучка ответа голосом OpenAI
    requestVoice(answer);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingText.trim()) return;
    handleSend(pendingText, false);
  };

  return (
    <>
      {/* Плавающая кнопка */}
      <button
        type="button"
        onClick={toggleOpen}
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-white/90 shadow-lg backdrop-blur hover:bg-zinc-50 transition"
        aria-label="Открыть помощника"
      >
        {/* Простая иконка чата */}
        <span className="text-xl">💬</span>
      </button>

      {isOpen && (
        <div className="fixed bottom-20 right-4 z-40 w-80 max-h-[70vh] rounded-2xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur flex flex-col overflow-hidden">
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
                onClick={toggleOpen}
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

          {/* Полоса статуса */}
          <div className="px-3 pb-1 text-[11px] text-zinc-500 flex items-center justify-between">
            <span>
              {isListening
                ? "Слушаю тебя…"
                : isSpeaking
                ? "Произношу ответ…"
                : ""}
            </span>
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
