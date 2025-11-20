import React, { useState } from "react";
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

const AssistantWidget: React.FC = () => {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = await res.json();
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
            {error && (
              <p className="text-[11px] text-red-500">
                {error}
              </p>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-zinc-100 bg-white px-3 py-2 flex items-center gap-2"
          >
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
              disabled={isLoading || !input.trim()}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 transition ${
                isLoading || !input.trim()
                  ? "bg-zinc-200 text-zinc-500 cursor-not-allowed"
                  : "bg-zinc-900 text-white hover:bg-zinc-800"
              }`}
            >
              {labelSend[language]}
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default AssistantWidget;
