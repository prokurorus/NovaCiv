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
      id: "vision",
      href: "/vision",
      label: {
        ru: "Наше видение",
        en: "Vision",
        de: "Vision",
        es: "Visión",
      },
      active: pathname === "/vision",
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
    <header className="w-full border-b border-zinc-200 bg-white/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Логотип */}
        <a
          href="/"
          className="inline-flex items-center gap-2 text-lg font-semibold text-zinc-900"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          NovaCiv
        </a>

        {/* Меню: вертикальное на мобильном, горизонтальное на ПК */}
        <nav className="w-full md:w-auto">
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:justify-start">
            {items.map((item) => {
              const isActive = item.active;

              const baseClasses =
                "inline-flex items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-sm font-medium transition shadow-sm w-full md:w-auto";
              const activeClasses =
                "bg-zinc-900 border-zinc-900 text-white shadow-[0_14px_40px_rgba(15,23,42,0.35)]";
              const defaultClasses =
                "bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-50 hover:border-zinc-300";

              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={`${baseClasses} ${
                    isActive ? activeClasses : defaultClasses
                  }`}
                >
                  <span>{item.label[language]}</span>
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " +
                      (isActive ? "bg-emerald-400" : "bg-zinc-200")
                    }
                  />
                </a>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
