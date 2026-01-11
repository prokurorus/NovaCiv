import React from "react";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";

const LABELS: Record<Language, string> = {
  ru: "RU",
  en: "EN",
  de: "DE",
  es: "ES",
};

const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  const order: Language[] = ["ru", "en", "de", "es"];

  const handleChange = (code: Language) => {
    if (code === language) return;
    setLanguage(code);
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/80 px-2 py-1 text-[11px] sm:text-xs shadow-sm">
      {order.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => handleChange(code)}
          className={`px-2.5 py-1 rounded-full transition ${
            language === code
              ? "bg-zinc-900 text-white"
              : "text-zinc-700 hover:bg-zinc-100"
          }`}
          aria-pressed={language === code}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
