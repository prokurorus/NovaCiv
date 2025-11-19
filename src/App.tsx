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

/* ---------- Карточка андроида ---------- */

function AndroidCard() {
  return (
    <div className="relative w-full max-w-[420px] mx-auto lg:mx-0">
      <div className="android-eye-pulse z-20" />

      <img
        src="/lovable-uploads/android.png"
        alt="Цифровой собеседник NovaCiv"
        className="w-full h-auto select-none drop-shadow-[0_24px_80px_rgba(15,23,42,0.12)]"
        draggable={false}
      />
    </div>
  );
}


/* ---------- ПЕРВАЯ СТРАНИЦА: вход в сознание ---------- */

function IntroScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="min-h-screen bg-white">
      <div className="wrap max-w-6xl mx-auto py-10 space-y-14">

        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">

          {/* Андроид слева */}
          <div className="order-0 lg:order-0 flex items-center justify-center lg:justify-start fade-in-up-slow">
            <AndroidCard />
          </div>

          {/* Текст справа */}
          <div className="order-1 lg:order-1 space-y-7 lg:pl-6 flex flex-col justify-center fade-in-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              NovaCiv • экспериментальная цифровая цивилизация
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-900">
                Новая цивилизация
              </h1>
              <p className="text-base sm:text-lg text-zinc-600 max-w-2xl leading-relaxed">
                Мы не строим ещё одну социальную сеть.
                Мы пробуем собрать честные правила, открытый код и живой разговор
                о будущем — без начальников, партий и культа лидеров.
              </p>
              <p className="text-sm text-zinc-500 max-w-xl">
                Здесь важны не лайки, а понимание. Не идеальная биография, а
                готовность думать и действовать честно.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onEnter}
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-7 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-900/25 hover:bg-zinc-800 active:bg-zinc-900 transition"
              >
                Войти в сознание
              </button>
            </div>

            <p className="text-xs text-zinc-500 max-w-md">
              Никаких подписок, сборов и скрытых условий. Только тексты, открытый
              чат и возможность проверить, откликается ли тебе такая логика мира.
            </p>
          </div>

        </section>
      </div>
    </main>
  );
}


/* ---------- ВТОРАЯ СТРАНИЦА ---------- */

function MainScreen() {
  const { stats } = useStats();

  const visitors = stats?.visitors ?? 0;
  const likes = stats?.likes ?? 0;
  const joined = stats?.joined ?? 0;

  return (
    <main className="min-h-screen bg-white">
      <div className="wrap max-w-6xl mx-auto py-10 space-y-12">

        {/* Шапка */}
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            NovaCiv • цифровое сообщество прямой демократии
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900">
            С чего начать
          </h1>

          <p className="text-sm text-zinc-600 max-w-2xl">
            Сначала — понять смысл. Потом — прочитать правила игры.
            Если откликается, можно присоединиться и включиться в развитие
            Сообщества.
          </p>

          <div className="flex flex-wrap gap-4 text-xs sm:text-sm text-zinc-600">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 bg-white/80">
              Посетителей: <span className="font-semibold">{visitors}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 bg-white/80">
              Нравится: <span className="font-semibold">{likes}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 bg-white/80">
              Присоединились: <span className="font-semibold">{joined}</span>
            </div>
          </div>
        </header>

        {/* Блок "Коротко о NovaCiv" — андроид теперь СЛЕВА */}
        <section className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center">

          {/* Андроид слева */}
          <div className="hidden lg:flex justify-start">
            <AndroidCard />
          </div>

          {/* Текст справа */}
          <div className="space-y-5">
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-900">
              Коротко о NovaCiv
            </h2>

            <div className="space-y-3 text-sm text-zinc-700">
              <p><span className="font-medium">Что это?</span> Экспериментальная цифровая цивилизация…</p>
              <p><span className="font-medium">Как устроено?</span> В основе — Устав, открытый код…</p>
              <p><span className="font-medium">Чем отличается?</span> Мы не обещаем рай…</p>
            </div>

            <p className="text-xs text-zinc-500">
              Если всё это звучит необычно… значит, тебе сюда.
            </p>
          </div>
        </section>

        {/* Остальные блоки оставлены без изменений */}
        {/* МАНИФЕСТ / УСТАВ */}
        {/* ПРИСОЕДИНИТЬСЯ */}
        {/* ... (твой существующий код) ... */}

      </div>
    </main>
  );
}


/* ---------- Корень ---------- */

export default function App() {
  const [entered, setEntered] = React.useState(false);
  const pathname = window.location.pathname;

  if (pathname === "/Manifesto-ru") return <ManifestoRu />;
  if (pathname === "/Manifesto-en") return <ManifestoEn />;
  if (pathname === "/Manifesto-de") return <ManifestoDe />;
  if (pathname === "/Manifesto-es") return <ManifestoEs />;

  if (pathname === "/Charter-ru") return <CharterRu />;
  if (pathname === "/Charter-en") return <CharterEn />;
  if (pathname === "/Charter-de") return <CharterDe />;
  if (pathname === "/Charter-es") return <CharterEs />;

  if (pathname === "/join") return <Join />;

  if (!entered) return <IntroScreen onEnter={() => setEntered(true)} />;
  return <MainScreen />;
}
