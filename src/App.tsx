import React from "react";

function AndroidCard() {
  return (
    <div className="relative w-full max-w-3xl mx-auto lg:max-w-none lg:h-full">
      {/* мягкое световое облако вокруг холста */}
      <div className="absolute -top-20 -right-10 h-48 w-48 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-300 blur-3xl opacity-70 pointer-events-none" />
      <div className="absolute -bottom-24 -left-4 h-40 w-40 rounded-full bg-gradient-to-tl from-zinc-100 to-zinc-300 blur-3xl opacity-60 pointer-events-none" />

      <div className="relative overflow-hidden rounded-[48px] bg-white/95 border border-zinc-200 shadow-[0_32px_90px_rgba(15,23,42,0.16)] lg:h-[360px]">
        {/* тонкий внутренний бордер */}
        <div className="absolute inset-[1px] rounded-[46px] border border-white/70 pointer-events-none z-10" />

        <img
          src="/lovable-uploads/android.png"
          alt="Цифровой собеседник NovaCiv"
          className="relative z-0 w-full h-full object-cover object-left"
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 via-white to-zinc-50">
      <div className="wrap max-w-6xl mx-auto py-10 space-y-14">

        {/* HERO: 1/2 текст, 1/2 большой андроид */}
        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          {/* Текст слева */}
          <div className="space-y-7 lg:pr-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              NovaCiv • экспериментальная цифровая цивилизация
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-900">
                Новая цивилизация
              </h1>
              <p className="text-base sm:text-lg text-zinc-600 max-w-2xl leading-relaxed">
                Для тех, кто устал от старых моделей власти и денег.
                Мы пробуем собрать честные правила, открытый код и живой разговор
                о будущем — без лозунгов и начальников.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/Manifesto-ru"
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-7 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-900/25 hover:bg-zinc-800 active:bg-zinc-900 transition"
              >
                Войти в сознание
              </a>
              <a
                href="/join"
                className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-7 py-2.5 text-sm font-semibold text-zinc-900 bg-white hover:bg-zinc-50 active:bg-zinc-100 transition"
              >
                Присоединиться
              </a>
            </div>

            <p className="text-xs text-zinc-500 max-w-md">
              Никаких подписок, сборов и скрытых условий. Только тексты, форум
              и возможность проверить, подходит ли тебе такая логика мира.
            </p>
          </div>

          {/* Андроид справа, половина экрана */}
          <div className="lg:pl-4 lg:order-none order-first">
            <AndroidCard />
          </div>
        </section>

        {/* МАНИФЕСТ / УСТАВ */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Манифест */}
          <div className="card relative overflow-hidden bg-gradient-to-b from-white to-zinc-50/70 border-zinc-200/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-zinc-100 blur-2xl opacity-80 pointer-events-none" />
            <div className="relative space-y-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-zinc-900">Манифест</h2>
                <p className="text-sm text-zinc-600">
                  Короткий и честный текст о том, зачем вообще нужна NovaCiv
                  и почему мы считаем разум важнее любой материи.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <a href="/Manifesto-ru" className="underline text-blue-700 hover:text-zinc-900">Manifesto (RU)</a>
                <a href="/Manifesto-en" className="underline text-blue-700 hover:text-zinc-900">Manifesto (EN)</a>
                <a href="/Manifesto-de" className="underline text-blue-700 hover:text-zinc-900">Manifesto (DE)</a>
                <a href="/Manifesto-es" className="underline text-blue-700 hover:text-zinc-900">Manifesto (ES)</a>
                <a href="/Manifesto-fr" className="underline text-blue-700 hover:text-zinc-900">Manifesto (FR)</a>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <a href="/Charter-ru" className="underline text-blue-700 hover:text-zinc-900">Charter (RU)</a>
                <a href="/Charter-en" className="underline text-blue-700 hover:text-zinc-900">Charter (EN)</a>
                <a href="/Charter-de" className="underline text-blue-700 hover:text-zinc-900">Charter (DE)</a>
                <a href="/Charter-es" className="underline text-blue-700 hover:text-zinc-900">Charter (ES)</a>
                <a href="/Charter-fr" className="underline text-blue-700 hover:text-zinc-900">Charter (FR)</a>
              </div>
            </div>
          </div>
        </section>

        {/* ПРИСОЕДИНИТЬСЯ */}
        <section className="card bg-white/90 border-dashed border-zinc-300 space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">Присоединиться</h2>
          <p className="text-sm text-zinc-600 max-w-2xl">
            NovaCiv не просит веры или клятвы. Единственное, что важно —
            понимание и добровольность. Прочитай манифест и Устав, задай вопросы
            на форуме и реши, хочешь ли ты вкладывать часть себя в такой проект.
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
