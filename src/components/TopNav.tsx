import React from "react";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";

const manifestoPathByLang: Record<Language, string> = {
  ru: "/Manifesto-ru",
  en: "/Manifesto-en",
  de: "/Manifesto-de",
  es: "/Manifesto-es",
};

const charterPathByLang: Record<Language, string> = {
  ru: "/Charter-ru",
  en: "/Charter-en",
  de: "/Charter-de",
  es: "/Charter-es",
};

function TopNav() {
  const { language } = useLanguage();
  const pathname = window.location.pathname;

  const NAV = [
    {
      id: "home",
      label: { ru: "Главная", en: "Home", de: "Start", es: "Inicio" },
      href: "/",
      active: pathname === "/",
    },
    {
      id: "manifesto",
      label: { ru: "Манифест", en: "Manifesto", de: "Manifest", es: "Manifiesto" },
      href: manifestoPathByLang[language],
      active: pathname.startsWith("/Manifesto"),
    },
    {
      id: "charter",
      label: { ru: "Устав", en: "Charter", de: "Charta", es: "Carta" },
      href: charterPathByLang[language],
      active: pathname.startsWith("/Charter"),
    },
    {
      id: "join",
      label: { ru: "Присоединиться", en: "Join", de: "Beitreten", es: "Unirse" },
      href: "/join",
      active: pathname === "/join",
    },
    {
      id: "forum",
      label: { ru: "Форум", en: "Forum", de: "Forum", es: "Foro" },
      href: "/forum",
      active: pathname.startsWith("/forum"),
    },
  ];

  return (
    <div className="w-full border-b border-zinc-200 bg-white/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        {/* ЛОГО */}
        <a href="/" className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          NovaCiv
        </a>

        {/* ГОРИЗОНТАЛЬНОЕ МЕНЮ */}
        <nav className="flex-1 mx-4 overflow-x-auto whitespace-nowrap scrollbar-none">
          <div className="flex gap-2">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={
                  "px-4 py-1.5 rounded-full border flex-shrink-0 text-sm transition " +
                  (item.active
                    ? "bg-zinc-900 border-zinc-900 text-white"
                    : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50")
                }
              >
                {item.label[language]}
              </a>
            ))}
          </div>
        </nav>

        {/* ПЕРЕКЛЮЧАТЕЛЬ ЯЗЫКОВ */}
        <div>
          <div className="flex gap-1 px-2 py-1 rounded-full border border-zinc-300">
            {["ru", "en", "de", "es"].map((lng) => (
              <a
                key={lng}
                href={`/${lng}`}
                onClick={(e) => e.preventDefault()}
                className={
                  "px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer " +
                  (language === lng
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100")
                }
              >
                {lng.toUpperCase()}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TopNav;
