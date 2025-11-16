import React from "react";

function AndroidCard() {
  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="rounded-[32px] bg-zinc-50 border border-zinc-200 shadow-xl shadow-zinc-200/80 p-8">
        {/* «Солнечное» пятно */}
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-300 blur-3xl opacity-70 pointer-events-none" />

        {/* Лицо-овал */}
        <div className="relative mx-auto h-44 w-44 rounded-[40%] bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-300 shadow-inner flex items-center justify-center">
          {/* Глаза */}
          <div className="flex gap-6 items-center justify-center">
            <div className="h-5 w-10 rounded-full bg-white/80 shadow-inner" />
            <div className="h-5 w-10 rounded-full bg-white/80 shadow-inner" />
          </div>

          {/* «Чёлка» / лоб */}
          <div className="absolute top-7 left-1/2 -translate-x-1/2 h-7 w-24 rounded-full bg-gradient-to-b from-white/90 to-zinc-200/70 shadow" />

          {/* Подбородок */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 h-6 w-[72px] rounded-b-[40%] bg-zinc-200/80" />
        </div>

        {/* Небольшой текст под изображением */}
        <div className="mt-6 text-center text-sm text-zinc-500">
          Цифровой собеседник, который не командует и не подчиняется.
          Только разговаривает и помогает думать.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <main className="min-h-screen bg-white">
      <div className="wrap py-10 space-y-12">
        {/* HERO-БЛОК */}
        <section className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-1 text-xs font-medium text-zinc-600">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              Цифровое сообщество NovaCiv
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-900">
                Новая цивилизация
              </h1>
              <p className="text-base sm:text-lg text-zinc-600 max-w-xl">
                Платформа для тех, кто не верит в старые модели власти и денег.
                Мы пробуем собрать честные правила, открытый код и живой разговор
                о будущем — без лозунгов и начальников.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/Manifesto-ru"
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-900/20 hover:bg-zinc-800 transition"
              >
                Войти в сознание
              </a>
              <a
                href="/join"
                className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-semibold text-zinc-800 bg-white hover:bg-zinc-50 transition"
              >
                Присоединиться
              </a>
            </div>

            <p className="text-xs text-zinc-500 max-w-md">
              Никаких подписок, сборов и скрытых условий.
              Только тексты, форум и возможность посмотреть, подходит ли тебе
              такая логика мира.
            </p>
          </div>

          <AndroidCard />
        </section>

        {/* БЛОК С ТЕКСТАМИ */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* МАНИФЕСТ */}
          <div className="card space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-zinc-900">Манифест</h2>
              <p className="text-sm text-zinc-600">
                Короткий и честный текст о том, зачем вообще нужна NovaCiv
                и почему мы считаем разум важнее любой материи.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <a href="/Manifesto-ru" className="underline text-blue-700 hover:text-zinc-900">
                Manifesto (RU)
              </a>
              <a href="/Manifesto-en" className="underline text-blue-700 hover:text-zinc-900">
                Manifesto (EN)
              </a>
              <a href="/Manifesto-de" className="underline text-blue-700 hover:text-zinc-900">
                Manifesto (DE)
              </a>
              <a href="/Manifesto-es" className="underline text-blue-700 hover:text-zinc-900">
                Manifesto (ES)
              </a>
              <a href="/Manifesto-fr" className="underline text-blue-700 hover:text-zinc-900">
                Manifesto (FR)
              </a>
            </div>
          </div>

          {/* УСТАВ */}
          <div className="card space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-zinc-900">Устав</h2>
              <p className="text-sm text-zinc-600">
                Полные правила игры: от референдума и экономики
                до культуры, тела, автономий и цифровой архитектуры.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <a href="/Charter-ru" className="underline text-blue-700 hover:text-zinc-900">
                Charter (RU)
              </a>
              <a href="/Charter-en" className="underline text-blue-700 hover:text-zinc-900">
                Charter (EN)
              </a>
              <a href="/Charter-de" className="underline text-blue-700 hover:text-zinc-900">
                Charter (DE)
              </a>
              <a href="/Charter-es" className="underline text-blue-700 hover:text-zinc-900">
                Charter (ES)
              </a>
              <a href="/Charter-fr" className="underline text-blue-700 hover:text-zinc-900">
                Charter (FR)
              </a>
            </div>
          </div>
        </section>

        {/* ПРИСОЕДИНИТЬСЯ */}
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">Присоединиться</h2>
          <p className="text-sm text-zinc-600 max-w-2xl">
            Если тебе близка эта логика — не нужно «записываться в организацию».
            Достаточно внимательно прочитать манифест и Устав, задать вопросы на форуме
            и решить, хочешь ли ты быть частью такого эксперимента.
          </p>
          <a
            href="/join"
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-800 bg-white hover:bg-zinc-50 transition"
          >
            Открыть страницу «Присоединиться»
          </a>
        </section>
      </div>
    </main>
  );
}
