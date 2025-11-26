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

export default function TopNav() {
  const { language } = useLanguage();
  const pathname = window.location.pathname;

  const items = [
    {
      id: "home",
      href: "/",
      label: { ru: "Главная", en: "Home", de: "Start", es: "Inicio" },
      active: pathname === "/",
    },
    {
      id: "manifesto",
      href: manifestoPathByLang[language],
      label: {
        ru: "Манифест",
        en: "Manifesto",
        de: "Manifest",
        es: "Manifiesto",
      },
      active: pathname.startsWith("/Manifesto"),
    },
    {
      id: "charter",
      href: charterPathByLang[language],
      label: { ru: "Устав", en: "Charter", de: "Charta", es: "Carta" },
      active: pathname.startsWith("/Charter"),
    },
    {
      id: "join",
      href: "/join",
      label: {
        ru: "Присоединиться",
        en: "Join",
        de: "Beitreten",
        es: "Unirse",
      },
      active: pathname === "/join",
    },
    {
      id: "forum",
      href: "/forum",
      label: { ru: "Форум", en: "Forum", de: "Forum", es: "Foro" },
      active: pathname === "/forum" || pathname.startsWith("/forum/"),
    },
  ];

  return (
    <div className="w-full border-b border-zinc-200 bg-white/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Логотип */}
        <a
          href="/"
          className="inline-flex items-center gap-2 text-lg font-semibold text-zinc-900"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          NovaCiv
        </a>

        {/* Меню с переносом строк */}
        <nav className="w-full md:w-auto">
          <div className="flex flex-wrap justify-start md:justify-center gap-2">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={
                  "px-4 py-1.5 rounded-full border text-sm flex-shrink-0 transition " +
                  (item.active
                    ? "bg-zinc-900 border-zinc-900 text-white shadow-sm"
                    : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50")
                }
              >
                {item.label[language]}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
