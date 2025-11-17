import React from "react";

const charterTextRu = `
ТУТ БУДЕТ ТЕКСТ УСТАВА НА РУССКОМ
`;

export default function CharterRu() {
  return (
    <main className="min-h-screen bg-white text-zinc-800">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
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
            Charter • Russian
          </div>
        </header>

        {/* Заголовок */}
        <section className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-900">
            Устав NovaCiv
          </h1>
          <p className="text-sm text-zinc-500">
            Полные правила игры: от референдума и экономики до культуры,
            тела, автономий и цифровой архитектуры.
          </p>
        </section>

        {/* Основной текст Устава */}
        <section className="nova-text text-[15px] leading-relaxed mt-6 whitespace-pre-wrap text-justify">
          {charterTextRu}
        </section>

        {/* Нижний блок */}
        <footer className="pt-6 border-t border-zinc-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-500">
          <div>
            Если ты ещё не читал Манифест — лучше начать с него, а потом вернуться к Уставу.
          </div>
          <div className="flex gap-3">
            <a href="/Manifesto-ru" className="underline hover:text-zinc-800">
              Манифест (RU)
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
