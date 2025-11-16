
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language } from '../types/language';
import { translations } from '../data/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    // Автоматическое определение языка браузера при загрузке приложения
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('ru')) {
      setLanguage('ru');
    } else if (browserLang.startsWith('de')) {
      setLanguage('de');
    } else if (browserLang.startsWith('es')) {
      setLanguage('es');
    } else {
      setLanguage('en');
    }
  }, []);

  const value = {
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
