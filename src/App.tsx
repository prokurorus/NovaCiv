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
import ForumPage from "./pages/ForumPage";
import TopicPage from "./pages/TopicPage";
import { useStats } from "./hooks/useStats";
import { useLanguage } from "./context/LanguageContext";
import LanguageSwitcher from "./components/LanguageSwitcher";
import type { Language } from "./types/language";
import { LanguageProvider } from "./context/LanguageContext";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

/* ---------- Карточка андроида (левая колонка) ---------- */

function AndroidCard() {
  return (
    <div className="relative w-full max-w-xl">
      <div className="relative rounded-[32px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.12)] overflow-hidden">
        <div className="flex justify-center items-center px-6 pt-6 pb-4">
          <img
            src="/lovable-uploads/android.png"
            alt="Digital consciousness"
            className="w-full h-auto object-contain"
          />
        </div>
        <div className="flex justify-between items-center px-6 pb-4 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            DIGITAL CONSCIOUSNESS
          </span>
          <span className="text-[10px] text-zinc-400">
            Prototype node • alpha
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Панель статистики ---------- */

interface StatsBarProps {
  visitors: number;
  likes: number;
  joined: number;
  onLike: () => void;
}

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
      joined: "Se han unido",
      likeButton: "♥ Me gusta",
    },
  };

  const current = labels[language];

  return (
    <section className="grid gap-3 sm:grid-cols-3 text-xs sm:text-sm">
      <div className="border rounded-xl px-5 py-4 shadow-sm bg-white/80">
        <div className="text-xs font-medium text-zinc-500">
          {current.visitors}
        </div>
        <div className="mt-2 text-2xl font-semibold text-zinc-900">
          {visitors}
        </div>
      </div>

      <button
        type="button"
        onClick={onLike}
        className="border rounded-xl px-5 py-4 shadow-sm bg-white/80 text-left hover:bg-zinc-50 transition"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-zinc-500">
              {current.likes}
            </div>
            <div className="mt-2 text-2xl font-semibold text-zinc-900">
              {likes}
            </div>
          </div>
          <span className="inline-flex items-center justify-center rounded-full border border-emerald-500 text-emerald-600 text-[11px] px-3 py-1 font-medium">
            {current.likeButton}
          </span>
        </div>
      </button>

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

function IntroScreen({ onEnter }: { onEnter: () => void }) {
  const { t, language } = useLanguage();

  const forumNavLabel: Record<Language, string> = {
    ru: "Форум",
    en: "Forum",
    de: "Forum",
    es: "Foro",
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto py-10 px-4 space-y-10">
        {/* Бейдж + переключатель языка + mini-nav */}
        <div className="flex justify-between items-start gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t.home.title} • {t.home.subtitle}
          </div>
          <div className="flex flex-col items-end gap-2">
            <LanguageSwitcher />
            {/* обновлённое мини-меню */}
            <nav
              className="
                flex flex-nowrap items-center gap-2
                text-[11px] text-zinc-600 mt-1
                w-full sm:w-auto
                overflow-x-auto
                whitespace-nowrap
                [-webkit-overflow-scrolling:touch]
              "
            >
              <a
                href="/join"
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-1 hover:bg-zinc-50 transition flex-shrink-0"
              >
                {t.navigation.join}
              </a>
              <a
                href="/forum"
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-1 hover:bg-zinc-50 transition flex-shrink-0"
              >
                {forumNavLabel[language]}
              </a>
            </nav>
          </div>
        </div>

        {/* Основной блок: андроид + текст + кнопка */}
        <section className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.05fr)] gap-10 items-center">
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
                type="button"
                onClick={onEnter}
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.35)] hover:bg-zinc-800 transition"
              >
                {t.home.enterButton}
              </button>
              <button
                type="button"
                onClick={onEnter}
                className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
              >
                {t.home.moreButton}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ---------- ОСНОВНАЯ ГЛАВНАЯ СТРАНИЦА ---------- */

function MainScreen() {
  const { t, language } = useLanguage();
  const { stats, like } = useStats();

  const forumCardText: Record<Language, string> = {
    ru: "Открытое пространство для вопросов, идей и обсуждений Устава, Манифеста и будущего платформы.",
    en: "An open space for questions, ideas and discussions about the Charter, the Manifesto and the future of the platform.",
    de: "Ein offener Raum für Fragen, Ideen und Diskussionen über Charta, Manifest und die Zukunft der Plattform.",
    es: "Un espacio abierto para preguntas, ideas y debates sobre la Carta, el Manifiesto y el futuro de la plataforma.",
  };

  const forumCardButton: Record<Language, string> = {
    ru: "Перейти на форум",
    en: "Go to forum",
    de: "Zum Forum",
    es: "Ir al foro",
  };

  const forumNavLabel: Record<Language, string> = {
    ru: "Форум",
    en: "Forum",
    de: "Forum",
    es: "Foro",
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto py-10 px-4 space-y-10">
        {/* Верхний блок: бейдж, заголовок, язык, мини-меню */}
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-4 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {t.home.title} • {t.home.subtitle}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900">
                {t.home.title}
              </h1>
              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">
                {t.home.manifestoSummary.content}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <LanguageSwitcher />
            {/* обновлённое мини-меню */}
            <nav
              className="
                flex flex-nowrap items-center gap-2
                text-[11px] text-zinc-600 mt-1
                w-full sm:w-auto
                overflow-x-auto
                whitespace-nowrap
                [-webkit-overflow-scrolling:touch]
              "
            >
              <a
                href="/join"
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-1 hover:bg-zinc-50 transition flex-shrink-0"
              >
                {t.navigation.join}
              </a>
              <a
                href="/forum"
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-1 hover:bg-zinc-50 transition flex-shrink-0"
              >
                {forumNavLabel[language]}
              </a>
            </nav>
          </div>
        </header>

        {/* Секция: андроид + текст о платформе */}
        <section className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.05fr)] gap-10 items-center">
          <div className="order-0 flex items-center justify-center lg:justify-start">
            <AndroidCard />
          </div>

          <div className="order-1 space-y-6 lg:pl-6 flex flex-col justify-center">
            <header className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-semibold text-zinc-900">
                {t.home.platformTitle}
              </h2>
              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">
                {t.home.platformDescription}
              </p>
            </header>

            <div className="flex flex-col gap-4">
              <StatsBar
                visitors={stats.visitors}
                likes={stats.likes}
                joined={stats.joined}
                onLike={like}
              />
            </div>
          </div>
        </section>

        {/* МАНИФЕСТ / УСТАВ */}
        <section className="grid gap-6 lg:grid-cols-2 pt-4">
          {/* Манифест */}
          <div className="relative overflow-hidden rounded-[24px] bg-white/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)] p-5 sm:p-6">
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
              <div className="flex flex-wrap gap-3 items-center">
                <a
                  href="/manifesto"
                  className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white shadow-[0_16px_40px_rgba(15,23,42,0.35)] hover:bg-zinc-800 transition"
                >
                  {t.home.manifestoSummary.readButton}
                </a>
              </div>
            </div>
          </div>

          {/* Устав */}
          <div className="relative overflow-hidden rounded-[24px] bg-white/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)] p-5 sm:p-6">
            <div className="absolute -bottom-12 -left-12 h-28 w-28 rounded-full bg-zinc-100 blur-2xl opacity-80 pointer-events-none" />
            <div className="relative space-y-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-zinc-900">
                  {t.navigation.charter}
                </h2>
                <p className="text-sm text-zinc-600">
                  {t.home.charterSummary.content}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <a
                  href="/charter"
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 transition"
                >
                  {t.home.charterSummary.readButton}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Форум */}
        <section className="pt-4">
          <div className="relative overflow-hidden rounded-[24px] bg-white/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)] p-5 sm:p-6">
            <div className="relative flex flex-col sm:flex-row gap-6 sm:items-center">
              <div className="space-y-3 flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-zinc-900">
                  {t.home.forumTitle}
                </h2>
                <p className="text-sm text-zinc-600">
                  {forumCardText[language]}
                </p>
              </div>
              <div className="flex-shrink-0">
                <a
                  href="/forum"
                  className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-white shadow-[0_16px_40px_rgba(16,185,129,0.35)] hover:bg-emerald-600 transition"
                >
                  {forumCardButton[language]}
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ---------- ВИДЖЕТ ДОМОВОГО ---------- */

function AssistantWidget() {
  return (
    <a
      href="/ask"
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-black text-white text-sm font-medium px-4 py-2 shadow-lg hover:bg-zinc-800 transition"
    >
      <span className="inline-flex items-center justify-center rounded-full bg-emerald-500 text-xs h-5 w-5">
        AI
      </span>
      <span>Спросить домового</span>
    </a>
  );
}

/* ---------- КОРНЕВОЙ КОМПОНЕНТ ---------- */

function App() {
  const [entered, setEntered] = React.useState(false);

  if (!entered) {
    return (
      <>
        <IntroScreen onEnter={() => setEntered(true)} />
        <AssistantWidget />
      </>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<MainScreen />} />
        <Route path="/manifesto" element={<ManifestoWrapper />} />
        <Route path="/charter" element={<CharterWrapper />} />
        <Route path="/join" element={<Join />} />
        <Route path="/forum" element={<ForumPage />} />
        <Route path="/topic/:topicId" element={<TopicPage />} />
      </Routes>
      <AssistantWidget />
    </>
  );
}

/* ---------- ОБЁРТКИ ДЛЯ МАНИФЕСТА И УСТАВА ---------- */

function ManifestoWrapper() {
  const { language } = useLanguage();

  switch (language) {
    case "ru":
      return <ManifestoRu />;
    case "en":
      return <ManifestoEn />;
    case "de":
      return <ManifestoDe />;
    case "es":
      return <ManifestoEs />;
    default:
      return <ManifestoEn />;
  }
}

function CharterWrapper() {
  const { language } = useLanguage();

  switch (language) {
    case "ru":
      return <CharterRu />;
    case "en":
      return <CharterEn />;
    case "de":
      return <CharterDe />;
    case "es":
      return <CharterEs />;
    default:
      return <CharterEn />;
  }
}

/* ---------- ROOT РЕНДЕР ---------- */

export default function RootApp() {
  return (
    <Router>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </Router>
  );
}
