import React, { useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const STORAGE_KEY = "novaciv_domovoy_history_v1";

const labelOpen: Record<Language, string> = {
  ru: "Спросить домового",
  en: "Ask the house spirit",
  de: "Den Hausgeist fragen",
  es: "Preguntar al espíritu",
};

const labelTitle: Record<Language, string> = {
  ru: "Домовой NovaCiv",
  en: "NovaCiv House Spirit",
  de: "Hausgeist von NovaCiv",
  es: "Espíritu de NovaCiv",
};

const labelPlaceholder: Record<Language, string> = {
  ru: "Задай вопрос о NovaCiv или о самом проекте…",
  en: "Ask about NovaCiv or the project itself…",
  de: "Frag nach NovaCiv oder dem Projekt selbst…",
  es: "Pregunta sobre NovaCiv o el propio proyecto…",
};

const labelSend: Record<Language, string> = {
  ru: "Спросить",
  en: "Ask",
  de: "Fragen",
  es: "Preguntar",
};

const labelThinking: Record<Language, string> = {
  ru: "Домовой думает…",
  en: "The spirit is thinking…",
  de: "Der Geist denkt nach…",
  es: "El espíritu está pensando…",
};

const labelError: Record<Language, string> = {
  ru: "Что-то пошло не так. Попробуй ещё раз.",
  en: "Something went wrong. Try again.",
  de: "Etwas ist schiefgelaufen. Versuch es noch einmal.",
  es: "Algo ha salido mal. Inténtalo de nuevo.",
};

const labelJoinHint: Record<Language, string> = {
  ru: "Хочешь помочь проекту — загляни на страницу «Присоединиться».",
  en: "If you want to help the project, visit the “Join” page.",
  de: "Wenn du dem Projekt helfen möchtest, besuche die Seite „Beitreten“.",
  es: "Si quieres ayudar al proyecto, visita la página «Unirse».",
};

const labelForumHint: Record<Language, string> = {
  ru: "Для обсуждений с другими участниками будет развиваться форум.",
  en: "For discussions with others, the forum will be developed further.",
  de: "Für Diskussionen mit anderen wird das Forum weiterentwickelt.",
  es: "Para debatir con otros, el foro se seguirá desarrollando.",
};

const labelVoiceIn: Record<Language, string> = {
  ru: "Голосовой ввод",
  en: "Voice input",
  de: "Spracheingabe",
  es: "Entrada por voz",
};

const labelVoiceOut: Record<Language, string> = {
  ru: "Озвучка ответа",
  en: "Read answers aloud",
  de: "Antworten vorlesen",
  es: "Leer respuestas en voz alta",
};

const labelListening: Record<Language, string> = {
  ru: "Слушаю… скажи свой вопрос.",
  en: "Listening… say your question.",
  de: "Ich höre zu… stell deine Frage.",
  es: "Escuchando… di tu pregunta.",
};

const AssistantWidget: React.FC = () => {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);

  // --- Загрузка истории из localStorage ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      }
    } catch {
      // игнорируем
    }
  }, []);

  // --- Сохранение истории при изменении ---
  useEffect(() => {
    try {
      // ограничим историю, чтобы не раздувать storage
      const trimmed =
        messages.length > 30 ? messages.slice(messages.length - 30) : messages;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // игнорируем
    }
  }, [messages]);

  // --- Озвучка ответа, если включена ---
  useEffect(() => {
    if (!voiceOutputEnabled) return;
    if (typeof window === "undefined") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;

    const synth = (window as any).speechSynthesis;
    if (!synth) return;

    const utter = new SpeechSynthesisUtterance(last.content);
    utter.lang =
      language === "ru"
        ? "ru-RU"
        : language === "de"
        ? "de-DE"
        : language === "es"
        ? "es-ES"
        : "en-US";
    synth.cancel();
    synth.speak(utter);
  }, [messages, voiceOutputEnabled, language]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];

    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/.netlify/functions/ai-domovoy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          language,
          page:
            typeof window !== "undefined" ? window.location.pathname : "/",
        }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = await res.json();

      if (data.error) {
        setError(
          `${labelError[language]} (${String(data.error).slice(0, 200)})`
        );
        return;
      }

      const reply = (data.reply || "").toString();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply },
      ]);
    } catch (err) {
      console.error(err);
      setError(labelError[language]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Голосовой ввод (Web Speech API) ---
  const handleStartListening = () => {
    if (isListening) return;
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(
        language === "ru"
          ? "Браузер не поддерживает распознавание речи."
          : language === "de"
          ? "Dieser Browser unterstützt keine Spracherkennung."
          : language === "es"
          ? "Este navegador no admite reconocimiento de voz."
          : "This browser does not support speech recognition."
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang =
      language === "ru"
        ? "ru-RU"
        : language === "de"
        ? "de-DE"
        : language === "es"
        ? "es-ES"
        : "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setError(
        language === "ru"
          ? "Ошибка распознавания речи."
          : language === "de"
          ? "Fehler bei der Spracherkennung."
          : language === "es"
          ? "Error en el reconocimiento de voz."
          : "Speech recognition error."
      );
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const sendDisabled =
    isLoading || !input.trim();

  return (
    <>
      {/* Плавающая кнопка */}
      <button
        type="button"
        onClick={handleToggle}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-lg hover:bg-zinc-800 active:bg-zinc-900 transition"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[11px] text-zinc-900 font-bold">
          AI
        </span>
        <span>{labelOpen[language]}</span>
      </button>

      {/* Панель домового */}
      {isOpen && (
        <div className="fixed bottom-16 right-4 z-40 w-[320px] max-w-[100vw] rounded-2xl border border-zinc-200 bg-white shadow-2xl flex flex-col overflow-hidden">
          <header className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50/80">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-zinc-800">
                  {labelTitle[language]}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">
                NovaCiv • AI
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggle}
              className="text-xs text-zinc-500 hover:text-zinc-800"
            >
              ✕
            </button>
          </header>

          {/* Лента сообщений */}
          <div className="flex-1 max-h-72 overflow-y-auto px-3 py-2 space-y-2 text-[13px]">
            {messages.length === 0 && (
              <p className="text-zinc-500 text-xs">
                {labelPlaceholder[language]}
              </p>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`rounded-2xl px-3 py-1.5 max-w-[80%] whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-900"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <p className="text-[11px] text-zinc-500">
                {labelThinking[language]}
              </p>
            )}
            {isListening && (
              <p className="text-[11px] text-emerald-600">
                {labelListening[language]}
              </p>
            )}
            {error && (
              <p className="text-[11px] text-red-500">
                {error}
              </p>
            )}
          </div>

          {/* Подсказки про Join / форум */}
          <div className="px-3 pb-1 text-[10px] text-zinc-500 space-y-0.5">
            <p>
              {labelJoinHint[language]}{" "}
              <a
                href="/join"
                className="underline hover:text-zinc-800"
              >
                /join
              </a>
              .
            </p>
            <p>{labelForumHint[language]}</p>
          </div>

          {/* Форма ввода + голос */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-zinc-100 bg-white px-3 py-2 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartListening}
                className={`h-8 w-8 rounded-full border flex items-center justify-center text-[13px] ${
                  isListening
                    ? "bg-emerald-100 border-emerald-400 text-emerald-700"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-50"
                }`}
                title={labelVoiceIn[language]}
              >
                🎙
              </button>

              <input
                type="text"
                className="flex-1 text-xs border border-zinc-200 rounded-full px-3 py-1.5 outline-none focus:ring-2 focus:ring-zinc-300"
                placeholder={labelPlaceholder[language]}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
              />

              <button
                type="submit"
                disabled={sendDisabled}
                className={`text-xs font-semibold rounded-full px-3 py-1.5 transition ${
                  sendDisabled
                    ? "bg-zinc-200 text-zinc-500 cursor-not-allowed"
                    : "bg-zinc-900 text-white hover:bg-zinc-800"
                }`}
              >
                {labelSend[language]}
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={voiceOutputEnabled}
                  onChange={(e) => setVoiceOutputEnabled(e.target.checked)}
                />
                <span>{labelVoiceOut[language]}</span>
              </label>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default AssistantWidget;
