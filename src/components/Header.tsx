import React from "react";
import { useLanguage } from "../context/LanguageContext";
import LanguageSwitcher from "./LanguageSwitcher";
import type { Language } from "../types/language";

const homeLabels: Record<Language, string> = {
  ru: "Главная",
  en: "Home",
  de: "Startseite",
  es: "Inicio",
};

const forumLabels: Record<Language, string> = {
  ru: "Форум",
  en: "Forum",
  de: "Forum",
  es: "Foro",
};

const Header: React.FC = () => {
  const { t, language } = useLanguage();
  const pathname = window.location.pathname;

  const navItems = [
    {
      id: "home",
      href: "/",
      label: homeLabels[language],
    },
    {
      id: "manifesto",
      href: `/Manifesto-${language}`,
      label: t.navigation.manifesto,
    },
    {
      id: "charter",
      href: `/Charter-${language}`,
      label: t.navigation.charter,
    },
    {
      id: "join",
      href: "/join",
      label: t.navigation.join,
    },
    {
      id: "forum",
      href: "/forum",
      label: forumLabels[language],
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        {/* Логотип / переход на главную */}
        <a href="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full border border-zinc-300 bg-zinc-50 shadow-sm" />
          <span className="text-base font-semibold tracking-tight text-zinc-900">
            NovaCiv
          </span>
        </a>

        {/* Навигация */}
        <nav className="flex flex-1 justify-center">
          <div
            className="
              flex w-full sm:w-auto flex-nowrap items-center gap-2
              overflow-x-auto whitespace-nowrap
              text-sm
              [-webkit-overflow-scrolling:touch]
            "
          >
            {navItems.map((item, index) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));

              const baseClasses =
                "inline-flex items-center justify-center rounded-full border px-3 sm:px-4 py-1.5 sm:py-2 transition text-xs sm:text-sm flex-shrink-0";
              const activeClasses =
                "border-zinc-900 bg-zinc-900 text-white shadow-sm";
              const defaultClasses =
                "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";
              const emphasisClasses =
                index === navItems.length - 1 ? "font-semibold" : "";

              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={`${baseClasses} ${
                    isActive ? activeClasses : defaultClasses
                  } ${emphasisClasses}`}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        </nav>

        {/* Переключатель языка */}
        <div className="flex items-center justify-end">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
};

export default Header;
