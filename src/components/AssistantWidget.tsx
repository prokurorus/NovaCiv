import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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
  ru: "Задай вопрос о NovaCiv, Уставе, Манифесте или сайте…",
  en: "Ask about NovaCiv, the Charter, the Manifesto, or the site…",
  de: "Frag nach NovaCiv, der Charta, dem Manifest oder der Seite…",
  es: "Pregunta sobre NovaCiv, la Carta, el Manifiesto o el sitio…",
};

const labelSend: Record<Language, string> = {
  ru: "Спросить",
  en: "Ask",
  de: "Fragen",
  es: "Preguntar",
};

const labelErrorCommon: Record<Language, string> = {
  ru: "Что-то пошло не так. Попробуй ещё раз чуть позже.",
  en: "Something went wrong. Please try again a bit later.",
  de: "Etwas ist schiefgelaufen. Versuche es später noch einmal.",
  es: "Algo salió mal. Inténtalo de nuevo más tarde.",
};

const labelIntro: Record<Language, string> = {
  ru: "Я — цифровой домовой NovaCiv. Могу объяснить, что это за проект, подсказать, куда нажать на сайте, и помочь с Манифестом и Уставом.",
  en: "I am the digital house spirit of NovaCiv. I can explain what this project is, show where to click on the site, and help with the Manifesto and the Charter.",
  de: "Ich bin der digitale Hausgeist von NovaCiv. Ich erkläre dir das Projekt, zeige dir, wohin du auf der Seite klicken kannst, und helfe mit Manifest und Charta.",
  es: "Soy el espíritu digital de NovaCiv. Puedo explicar qué es este proyecto, mostrar dónde hacer clic en el sitio y ayudarte con el Manifiesto y la Carta.",
};

const labelJoinHint: Record<Language, string> = {
  ru: "Если хочешь присоединиться к сообществу или заглянуть в открытый чат — зайди на страницу /join.",
  en: "If you want to join the community or visit the open chat, go to the /join page.",
  de: "Wenn du der Gemeinschaft beitreten oder den offenen Chat besuchen möchtest, gehe auf die Seite /join.",
  es: "Si quieres unirte a la comunidad o entrar al chat abierto, visita la página /join.",
};

const labelForumHint: Record<Language, string> = {
  ru: "Для обсуждений и предложений по будущему NovaCiv есть форум /forum.",
  en: "For discussions and proposals about NovaCiv's future, there is the /forum page.",
  de: "Für Diskussionen und Vorschläge zur Zukunft von NovaCiv gibt es die Seite /forum.",
  es: "Para debates y propuestas sobre el futuro de NovaCiv, está la página /forum.",
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

  const messagesRef = useRef<HTMLDivElement | null>(null);

  // Включаем озвучку по умолчанию на мобильных (если возможно)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 768) {
      setVoiceOutputEnabled(true);
    }
  }, []);

  // Авто-скролл вниз при новых сообщениях
  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, isOpen]);

  // Озвучка последнего ответа
  useEffect(() => {
    if (!voiceOutputEnabled) return;
    if (typeof window === "undefined") return;
    if (!messages.length) return;

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

  // Открытие/закрытие: каждое новое открытие — чистое окно
  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;

      if (!prev && next) {
        // Открываем виджет — начинаем новую сессию
        setMessages([]);
        setInput("");
        setError(null);
      }

      if (!next) {
        // Закрываем — останавливаем прослушку
        setIsListening(false);
      }

      return next;
    });
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
        throw new Error(data.error);
      }

      const reply: string = data.reply || "";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error(err);
      setError(labelErrorCommon[language]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartListening = () => {
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

    setIsListening(true);
    setError(null);

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
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const sendDisabled = isLoading || !input.trim();

  return (
    <>
      {/* Плавающая кнопка */}
      <button
        type="button"
        onClick={handleToggle}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-zinc-800 active:bg-zinc-950 transition"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[11px] text-zinc-900 font-bold">
          AI
        </span>
        <span>{labelOpen[language]}</span>
      </button>

      {/* Панель домового */}
      {isOpen && (
        <div className="fixed bottom-16 right-4 z-40 w-[320px] max-w-[92vw] rounded-2xl border border-zinc-200 bg-white shadow-2xl flex flex-col overflow-hidden">
          <header className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50/80">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              <h2 className="text-xs font-semibold text-zinc-900">
                {labelTitle[language]}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleToggle}
              className="text-xs text-zinc-500 hover:text-zinc-800"
            >
              ✕
            </button>
          </header>

          {/* Область сообщений */}
          <div
            ref={messagesRef}
            className="flex-1 min-h-[140px] max-h-[260px] overflow-y-auto px-3 py-2 space-y-2 text-xs"
          >
            {messages.length === 0 ? (
              <div className="space-y-2 text-zinc-600">
                <p>{labelIntro[language]}</p>
                <p className="text-[11px] text-zinc-500">
                  {labelJoinHint[language]}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {labelForumHint[language]}
                </p>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  className={
                    "px-3 py-1.5 rounded-xl text-[11px] leading-snug " +
                    (m.role === "user"
                      ? "bg-zinc-900 text-white ml-6"
                      : "bg-zinc-100 text-zinc-900 mr-6")
                  }
                >
                  {m.content}
                </div>
              ))
            )}
          </div>

          {/* Статус / ошибки */}
          <div className="px-3 pb-1 text-[11px] text-zinc-500 min-h-[18px]">
            {isListening ? (
              <span>{labelListening[language]}</span>
            ) : isLoading ? (
              <span>
                {language === "ru"
                  ? "Думаю над ответом…"
                  : language === "de"
                  ? "Ich denke nach…"
                  : language === "es"
                  ? "Pensando en la respuesta…"
                  : "Thinking…"}
              </span>
            ) : error ? (
              <span className="text-red-500">{error}</span>
            ) : null}
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
                className="flex-1 text-xs border border-zinc-300 rounded-full px-3 py-1.5 outline-none focus:ring-2 focus:ring-zinc-300"
                placeholder={labelPlaceholder[language]}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
              />

              <button
                type="submit"
                disabled={sendDisabled}
                className="text-xs px-3 py-1.5 rounded-full bg-zinc-900 text-white disabled:bg-zinc-300 disabled:text-zinc-500 hover:bg-zinc-800 transition"
              >
                {labelSend[language]}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1 text-[11px] text-zinc-500">
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
