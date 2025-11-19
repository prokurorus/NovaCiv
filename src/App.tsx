import React from "react";
import ManifestoRu from "./pages/Manifesto-ru";
import ManifestoEn from "./pages/Manifesto-en";
import ManifestoDe from "./pages/Manifesto-de";
import ManifestoEs from "./pages/Manifesto-es";
import CharterRu from "./pages/Charter-ru";
import CharterEn from "./pages/Charter-en";
import CharterDe from "./pages/Charter-de";
import CharterEs from "./pages/Charter-es";
import Join from "./pages/Join";
import { useStats } from "./hooks/useStats";
import { useLanguage } from "./context/LanguageContext";
import LanguageSwitcher from "./components/LanguageSwitcher";
import type { Language } from "./types/language";


/* ---------- Карточка андроида (левая колонка) ---------- */

function AndroidCard() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto lg:mx-0">
      <img
        src="/lovable-uploads/android.png"
        alt="Цифровой собеседник NovaCiv"
        className="w-full h-auto select-none drop-shadow-[0_24px_80px_rgba(15,23,42,0.12)]"
        draggable={false}
      />
    </div>
  );
}

/* ---------- Общая панель счётчиков ---------- */

/* ---------- Общая панель счётчиков ---------- */

type StatsBarProps = {
  visitors: number;
  likes: number;
  joined: number;
  onLike: () => void;
};

function StatsBar({ visitors, likes, joined, onLike }: StatsBarProps) {
  const { language } = useLanguage();

  const labels: Record<
    Language,
    { visitors: string; likes: string; joined: string; likeButton: string }
  > = {
    ru: {
      visitors: "Посетителей",
      likes: "Нравится",
      joined: "Присоединились",
      likeButton: "♥ Нравится",
    },
    en: {
      visitors: "Visitors",
      likes: "Likes",
      joined: "Joined",
      likeButton: "♥ Like",
    },
    de: {
      visitors: "Besucher",
      likes: "Gefällt",
      joined: "Beigetreten",
      likeButton: "♥ Gefällt mir",
    },
    es: {
      visitors: "Visitantes",
      likes: "Me gusta",
      joined: "Se unieron",
      likeButton: "♥ Me gusta",
    },
  };

  const current = labels[language];

  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-3">
      <div className="border rounded-xl px-5 py-4 shadow-sm bg-white/80">
        <div className="text-xs font-medium text-zinc-500">
          {current.visitors}
        </div>
        <div className="mt-2 text-2xl font-semibold text-zinc-900">
          {visitors}
        </div>
      </div>

      <div className="border rounded-xl px-5 py-4 shadow-sm bg-white/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500">
            {current.likes}
          </span>
          <button
            onClick={onLike}
            className="text-[11px] border rounded-full px-3 py-1 hover:bg-zinc-50 active:bg-zinc-100 transition"
          >
            {current.likeButton}
          </button>
        </div>
        <div className="mt-2 text-2xl font-semibold text-zinc-900">
          {likes}
        </div>
      </div>

      <div className="border rounded-xl px-5 py-4 shadow-sm bg-white/80">
        <div className="text-xs font-medium text-zinc-500">
          {current.joined}
        </div>
        <div className="mt-2 text-2xl font-semibold text-zinc-900">
          {joined}
        </div>
      </div>
    </section>
  );
}

/* ---------- ПЕРВАЯ СТРАНИЦА: вход в сознание ---------- */

/* ---------- ПЕРВАЯ СТРАНИЦА: вход в сознание ---------- */

function IntroScreen({ onEnter }: { onEnter: () => void }) {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto py-10 px-4 space-y-10">
        {/* Бейдж + переключатель языка */}
        <div className="flex justify-between items-start gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t.home.title} • {t.home.subtitle}
          </div>
          <LanguageSwitcher />
        </div>

        {/* Основной блок: андроид + текст */}
        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          {/* Андроид слева */}
          <div className="order-0 flex items-center justify-center lg:justify-start">
            <AndroidCard />
          </div>

          {/* Текст справа */}
          <div className="order-1 space-y-6 lg:pl-6 flex flex-col justify-center">
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-900">
                {t.home.title}
              </h1>
              <p className="text-base sm:text-lg text-zinc-600 leading-relaxed">
                {t.home.manifestoSummary.content}
              </p>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={onEnter}
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 active:bg-zinc-900 transition"
              >
                {t.home.enterButton}
              </button>
              <p className="text-xs text-zinc-500 max-w-xs">
                {t.home.hintText}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ---------- ВТОРАЯ СТРАНИЦА: с чего начать ---------- */

/* ---------- ВТОРАЯ СТРАНИЦА: с чего начать ---------- */

/* ---------- ВТОРАЯ СТРАНИЦА: с чего начать ---------- */

function MainScreen() {
  const { stats, ensureVisitorCounted, like } = useStats();
  const { t, language } = useLanguage();

  React.useEffect(() => {
    ensureVisitorCounted();
  }, [ensureVisitorCounted]);

  const joinText: Record<Language, string> = {
    ru: "NovaCiv не просит веры или клятвы. Важно только понимание и добровольность. Прочитай Манифест и Устав, загляни в открытый чат на странице «Присоединиться» и реши, хочешь ли ты вкладывать часть себя в такой проект.",
    en: "NovaCiv does not ask for faith or oaths. What matters is understanding and free choice. Read the Manifesto and the Charter, visit the open chat on the “Join” page and decide whether you want to invest a part of yourself in this project.",
    de: "NovaCiv verlangt keinen Glauben und keine Eide. Wichtig sind nur Verständnis und freiwillige Entscheidung. Lies Manifest und Charta, schau in den offenen Chat auf der Seite „Beitreten“ und entscheide, ob du einen Teil von dir in dieses Projekt investieren möchtest.",
    es: "NovaCiv no pide fe ni juramentos. Lo que importa es la comprensión y la decisión voluntaria. Lee el Manifiesto y la Carta, visita el chat abierto en la página «Unirse» y decide si quieres invertir una parte de ti en este proyecto."
  };

  const joinButtonLabel: Record<Language, string> = {
    ru: "Открыть страницу «Присоединиться»",
    en: "Open the “Join” page",
    de: "Seite „Beitreten“ öffnen",
    es: "Abrir página «Unirse»"
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto py-10 px-4 space-y-10">
        {/* Верхний блок: бейдж, заголовок, переключатель языка */}
        <div className="flex items-start justify-between gap-4">
          <header className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {t.home.title} • {t.home.subtitle}
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900">
              {t.home.manifestoSummary.title}
            </h1>
            <p className="text-sm text-zinc-600 max-w-2xl">
              {t.home.manifestoSummary.content}
            </p>
          </header>

          <LanguageSwitcher />
        </div>

        {/* Счётчики */}
        <StatsBar
          visitors={stats.visitors}
          likes={stats.likes}
          joined={stats.joined}
          onLike={like}
        />

        {/* МАНИФЕСТ / УСТАВ */}
        <section className="grid gap-6 lg:grid-cols-2 pt-4">
          {/* Манифест */}
          <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)] p-5 sm:p-6">
            <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-zinc-100 blur-2xl opacity-80 pointer-events-none" />
            <div className="relative space-y-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-zinc-900">
                  {t.navigation.manifesto}
                </h2>
                <p className="text-sm text-zinc-600">
                  {t.home.manifestoSummary.content}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <a
                  href="/Manifesto-ru"
                  className="underline text-blue-700 hover:text-zinc-900"
                >
                  Manifesto (RU)
                </a>
                <a
                  href="/Manifesto-en"
                  className="underline text-blue-700 hover:text-zinc-900"
                >
                  Manifesto (EN)
                </a>
                <a
                  href="/Manifesto-de"
                  className="underline text-blue-700 hover:text-zinc-900"
                >
                  Manifesto (DE)
                </a>
                <a
                  href="/Manifesto-es"
                  className="underline text-blue-700 hover:text-zinc-900"
                >
                  Manifesto (ES)
                </a>
              </div>
            </div>
          </div>

          {/* Устав */}
          <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)] p-5 sm:p-6">
            <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-zinc-100 blur-2xl opacity-80 pointer-events-none" />
            <div className="relative space-y-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-zinc-900">
                  {t.navigation.charter}
                </h2>
                <p className="text-sm text-zinc-600">
                  {t.charter.sections[0]?.content}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <a
                  href="/Charter-ru"
                  className="underline text-blue-700 hover:text-zinc-900"
                >
                  Charter (RU)
                </a>
                <a
                  href="/Charter-en"
                  className="underline text-blue-700 hover:text-zinc-900"
                >
                  Charter (EN)
                </a>
                <a
                  href="/Charter-de"
                  className="underline text-blue-700 hover:text-zinc-900"
                >
                  Charter (DE)
                </a>
                <a
                  href="/Charter-es"
                  className="underline text-blue-700 hover:text-zinc-900"
                >
                  Charter (ES)
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ПРИСОЕДИНИТЬСЯ + ЧАТ */}
        <section className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white/90 px-5 py-6 space-y-3 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            {t.navigation.join}
          </h2>
          <p className="text-sm text-zinc-600 max-w-2xl">
            {joinText[language]}
          </p>
          <a
            href="/join"
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-800 bg-white hover:bg-zinc-50 active:bg-zinc-100 transition"
          >
            {joinButtonLabel[language]}
          </a>
        </section>
      </div>
    </main>
  );
}



/* ---------- Корневой компонент ---------- */

export default function App() {
  const [entered, setEntered] = React.useState(false);
  const pathname = window.location.pathname;

  // Прямые переходы по адресам — сразу нужная страница
  if (pathname === "/Manifesto-ru") return <ManifestoRu />;
  if (pathname === "/Manifesto-en") return <ManifestoEn />;
  if (pathname === "/Manifesto-de") return <ManifestoDe />;
  if (pathname === "/Manifesto-es") return <ManifestoEs />;

  if (pathname === "/Charter-ru") return <CharterRu />;
  if (pathname === "/Charter-en") return <CharterEn />;
  if (pathname === "/Charter-de") return <CharterDe />;
  if (pathname === "/Charter-es") return <CharterEs />;

  if (pathname === "/join") return <Join />;

  // Корень — сначала вступительный экран, затем простая навигация
  if (!entered) {
    return <IntroScreen onEnter={() => setEntered(true)} />;
  }

  return <MainScreen />;
}
