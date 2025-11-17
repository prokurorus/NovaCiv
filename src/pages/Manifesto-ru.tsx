import React from "react";

export default function ManifestoRu() {
  return (
    <main className="min-h-screen bg-white text-zinc-800">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">

        {/* Верхняя панель */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => (window.location.href = "/")}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 active:bg-zinc-100 transition"
          >
            ← На главную
          </button>

          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Manifesto • Russian
          </div>
        </header>

        {/* Заголовок */}
        <section className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-900">
            Манифест NovaCiv
          </h1>
          <p className="text-sm text-zinc-500">
            О том, зачем нужна новая цифровая цивилизация и почему разум важнее материи.
          </p>
        </section>

        {/* Основной текст */}
        <section className="prose prose-zinc max-w-none text-justify whitespace-pre-wrap leading-relaxed text-[15px]">
{`
...вставь сюда весь финальный текст Манифеста ровно так, как он есть...

`}
        </section>

        {/* Нижний блок */}
        <footer className="pt-6 border-t border-zinc-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-500">
          <div>
            Если откликается — загляни в Устав и на страницу «Присоединиться».
          </div>
          <div className="flex gap-3">
            <a href="/Charter-ru" className="underline hover:text-zinc-800">
              Устав (RU)
            </a>
            <a href="/join" className="underline hover:text-zinc-800">
              Присоединиться
            </a>
          </div>
        </footer>

      </div>
    </main>
  );
}
