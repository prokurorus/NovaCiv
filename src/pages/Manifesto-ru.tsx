import React from "react";

const ManifestoRu: React.FC = () => {
  return (
    <main className="min-h-screen bg-white">
      <div className="wrap max-w-3xl mx-auto py-10 space-y-6">
        {/* Верхняя панель */}
        <header className="flex items-center justify-between gap-4 mb-4">
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
            О том, зачем вообще нужна новая цифровая цивилизация и почему мы
            считаем разум важнее любой материи.
          </p>
        </section>

        {/* Основной текст */}
        <section className="mt-4 text-[15px] leading-relaxed text-zinc-800 whitespace-pre-wrap text-justify">
          {`...здесь твой полный текст манифеста на русском, без изменений...

(просто вставь сюда тот текст, который у нас уже утверждён как финальный)`}
        </section>

        {/* Низ страницы */}
        <footer className="pt-6 border-t border-zinc-100 mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
          <div>
            Если после прочтения тебе откликается эта логика — загляни в Устав,
            а затем на страницу «Присоединиться».
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/Charter-ru"
              className="underline hover:text-zinc-800"
            >
              Устав (RU)
            </a>
            <a
              href="/join"
              className="underline hover:text-zinc-800"
            >
              Присоединиться
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
};

export default ManifestoRu;
