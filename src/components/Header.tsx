import React from "react";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import LanguageSwitcher from "./LanguageSwitcher";

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

type NavItemId = "home" | "manifesto" | "charter" | "join" | "forum";

interface NavItem {
  id: NavItemId;
  href: string;
  label: Record<Language, string>;
}

function buildNavItems(language: Language): NavItem[] {
  return [
    {
      id: "home",
      href: "/",
      label: {
        ru: "Главная",
        en: "Home",
        de: "Start",
        es: "Inicio",
      },
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
    },
    {
      id: "charter",
      href: charterPathByLang[language],
      label: {
        ru: "Устав",
        en: "Charter",
        de: "Charta",
        es: "Carta",
      },
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
    },
    {
      id: "forum",
      href: "/forum",
      label: {
        ru: "Форум",
        en: "Forum",
        de: "Forum",
        es: "Foro",
      },
    },
  ];
}

function isItemActive(item: NavItem, pathname: string): boolean {
  switch (item.id) {
    case "home":
      return pathname === "/";
    case "manifesto":
      return pathname.startsWith("/Manifesto");
    case "charter":
      return pathname.startsWith("/Charter");
    case "join":
      return pathname === "/join";
    case "forum":
      return pathname === "/forum" || pathname.startsWith("/forum/");
    default:
      return false;
  }
}

const Header: React.FC = () => {
  const { language } = useLanguage();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const navItems = buildNavItems(language);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        {/* Логотип / название */}
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="tracking-tight">NovaCiv</span>
        </a>

        {/* Центральное меню */}
        <nav
          className="
            flex flex-1 justify-center
            overflow-x-auto
            whitespace-nowrap
            [-webkit-overflow-scrolling:touch]
          "
        >
          <div className="flex items-center gap-2 px-2">
            {navItems.map((item) => {
              const active = isItemActive(item, pathname);

              const baseClasses =
                "inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-sm transition flex-shrink-0";
              const activeClasses =
                "border-zinc-900 bg-zinc-900 text-white shadow-sm";
              const defaultClasses =
                "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";

              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={`${baseClasses} ${
                    active ? activeClasses : defaultClasses
                  }`}
                >
                  {item.label[language]}
                </a>
              );
            })}
          </div>
        </nav>

        {/* Переключатель языка справа */}
        <div className="flex items-center justify-end">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
};

export default Header;
