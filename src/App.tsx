import React, { useEffect } from "react";
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

/**
 * Карточка с андроидом.
 * Изображение всегда слева от текста (на десктопе),
 * чтобы "взгляд" был направлен в сторону содержимого.
 */
function AndroidCard() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto lg:mx-0">
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

/**
 * Главная страница "С чего начать".
 * Здесь:
 *  – чип NovaCiv
 *  – три счётчика (посетители / нравится / присоединились)
 *  – блок "Коротко о NovaCiv" с андроидом слева
 *  – блоки ссылок на Манифест и Устав
 *  – блок-приглашение на страницу "Присоединиться"
 */
function MainPage() {
  const { stats, ensureVisitorCounted } = useStats();

  useEffect(() => {
    ensureVisitorCounted();
  }, [ensureVisitorCounted]);

  return (
    <main className="min-h-screen bg-white">
      <div className="wrap max-w-6xl mx-auto py-10 space-y-10">
        {/* Чип и заголовок */}
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            NovaCiv • цифровое сообщество прямой демократии
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900">
            С чего начать
          </h1>
          <p className="text-sm text-zinc-600 max-w-2xl">
            Сначала — понять смысл. Потом — прочитать правила игры. Если
            откликается, можно присоединиться и включиться в развитие
            Сообщества.
          </p>
        </header>

        {/* Счётчики */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-500">Посетителей</div>
            <div className="text-2xl font-semibold mt-1">{stats.visitors}</div>
          </div>
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-500">Нравится</div>
            <div className="text-2xl font-semibold mt-1">{stats.likes}</div>
          </div>
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-500">Присоединились</div>
            <div className="text-2xl font-semibold mt-1">{stats.joined}</div>
          </div>
        </section>

        {/* Коротко о NovaCiv + андроид слева */}
        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          {/* Андроид слева */}
          <div className="order-0 flex items-center justify-center lg:justify-start">
            <AndroidCard />
          </div>

          {/* Текст справа */}
          <div className="order-1 space-y-5 text-sm sm:text-base text-zinc-700">
            <h2 className="text-xl sm:text-2xl font-semibold text-zinc-900">
              Коротко о NovaCiv
            </h2>

            <div className="space-y-3">
              <p>
                <span className="font-semibold">Что это?</span>{" "}
                Экспериментальная цифровая цивилизация, где решения принимаются
                не лидерами, а прямым референдумом Граждан. Без скрытых советов
                и кулуарных договорённостей.
              </p>
              <p>
                <span className="font-semibold">Как устроено?</span>{" "}
                В основе — Устав, открытый код и прозрачные алгоритмы. Любой
                может проверить, как считаются голоса, как расходуются средства
                и как формируется повестка.
              </p>
              <p>
                <span className="font-semibold">Чем отличается?</span>{" "}
                Мы не обещаем рай. Мы честно фиксируем правила, признаём
                ценность разума и отказываемся от насилия и культа силы как
                нормального инструмента политики.
              </p>
            </div>

            <p className="text-xs text-zinc-500">
              Если всё это звучит необычно — но не отталкивает — значит, ты уже
              в редком меньшинстве. Возможно, тебе здесь и место.
            </p>
          </div>
        </section>

        {/* МАНИФЕСТ / УСТАВ */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Манифест */}
          <div className="card relative overflow-hidden bg-gradient-to-b from-white to-zinc-50/70 border-zinc-200/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-zinc-100 blur-2xl opacity-80 pointer-events-none" />
            <div className="relative space-y-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-zinc-900">
                  Манифест
                </h2>
                <p className="text-sm text-zinc-600">
                  Короткий и честный текст о том, зачем вообще нужна NovaCiv и
                  почему мы считаем разум важнее любой материи.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 text-sm">
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
          <div className="card relative overflow-hidden bg-gradient-to-b from-white to-zinc-50/70 border-zinc-200/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-zinc-100 blur-2xl opacity-80 pointer-events-none" />
            <div className="relative space-y-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-zinc-900">Устав</h2>
                <p className="text-sm text-zinc-600">
                  Полные правила игры: от референдума и экономики до культуры,
                  тела, автономий и цифровой архитектуры.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 text-sm">
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

        {/* ПРИСОЕДИНИТЬСЯ */}
        <section className="card bg-white/90 border-dashed border-zinc-300 space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            Присоединиться
          </h2>
          <p className="text-sm text-zinc-600 max-w-2xl">
            NovaCiv не просит веры или клятвы. Единственное, что важно —
            понимание и добровольность. Прочитай Манифест и Устав, загляни в
            открытый чат и реши, хочешь ли ты вкладывать часть себя в такой
            проект.
          </p>
          <a
            href="/join"
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-800 bg-white hover:bg-zinc-50 active:bg-zinc-100 transition"
          >
            Открыть страницу «Присоединиться»
          </a>
        </section>
      </div>
    </main>
  );
}

/**
 * Корневой компонент приложения.
 * Простейший роутинг по window.location.pathname.
 */
export default function App() {
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

  // Корень — главная страница "С чего начать"
  return <MainPage />;
}
