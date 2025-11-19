import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { Language } from "../types/language";
import { translations } from "../data/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};

interface LanguageProviderProps {
  children: ReactNode;
}

const SUPPORTED_LANGUAGES: Language[] = ["en", "ru", "de", "es"];

function detectInitialLanguage(): Language {
  // SSR / очень ранний рендер
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "en";
  }

  // 1. Смотрим сохранённый выбор
  const saved = window.localStorage.getItem("novaciv-lang") as Language | null;
  if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
    return saved;
  }

  // 2. Смотрим языки браузера
  const browserLangs =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];

  for (const lang of browserLangs) {
    const base = (lang || "").toLowerCase().split("-")[0];
    if (base === "ru") return "ru";
    if (base === "de") return "de";
    if (base === "es") return "es";
    if (base === "en") return "en";
  }

  // 3. Запасной вариант
  return "en";
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({
  children,
}) => {
  const [language, setLanguage] = useState<Language>(() =>
    detectInitialLanguage()
  );

  // Сохраняем выбор и выставляем <html lang="...">
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("novaciv-lang", language);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
