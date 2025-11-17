import React from "react";

const JOIN_KEY = "novaciv_join_count";
const LIKE_KEY = "novaciv_like_count";

export default function Join() {
  const [joinCount, setJoinCount] = React.useState(0);
  const [likeCount, setLikeCount] = React.useState(0);

  // Загружаем значения из localStorage при первом рендере
  React.useEffect(() => {
    try {
      const storedJoin = Number(localStorage.getItem(JOIN_KEY) || "0");
      const storedLike = Number(localStorage.getItem(LIKE_KEY) || "0");
      if (!Number.isNaN(storedJoin)) setJoinCount(storedJoin);
      if (!Number.isNaN(storedLike)) setLikeCount(storedLike);
    } catch {
      // если localStorage недоступен — просто игнорируем
    }
  }, []);

  const handleJoin = () => {
    setJoinCount((prev) => {
      const next = prev + 1;
      try {
        localStorage.setItem(JOIN_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const handleLike = () => {
    setLikeCount((prev) => {
      const next = prev + 1;
      try {
        localStorage.setItem(LIKE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="wrap max-w-4xl mx-auto py-12 space-y-10">
        {/* Заголовок */}
        <header className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Страница присоединения к NovaCiv
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-900">
            Присоединиться или просто поддержать
          </h1>
          <p className="text-sm text-zinc-600 max-w-2xl mx-auto">
            Здесь нет подписок и клятв. Эти кнопки фиксируют только твой выбор
            на этом устройстве. Общая статистика сообщества появится позже,
            когда мы подключим общий счётчик.
          </p>
        </header>

        {/* Счётчики + кнопки */}
        <section className="grid gap-6 md:grid-cols-2">
          {/* Присоединился */}
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 shadow-[0_18px_60px_rgba(15,23,42,0.08)] p-6 flex flex-col items-center text-center gap-4">
            <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-zinc-100 blur-2xl opacity-80 pointer-events-none" />
            <div className="relative space-y-2">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Внутренний круг
              </div>
              <div className="text-5xl font-semibold tabular-nums text-zinc-900">
                {joinCount}
              </div>
              <div className="text-sm text-zinc-600">
                человек отмечают себя как тех, кто{" "}
                <span className="font-medium text-zinc-900">присоединился</span>{" "}
                к NovaCiv на этом устройстве.
              </div>
            </div>
            <button
              onClick={handleJoin}
              className="relative inline-flex items-center justify-center rounded-full bg-zinc-900 px-7 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-900/25 hover:bg-zinc-800 active:bg-zinc-900 transition"
            >
              Присоединяюсь
            </button>
          </div>

          {/* Нравится идея */}
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 shadow-[0_18px_60px_rgba(15,23,42,0.08)] p-6 flex flex-col items-center text-center gap-4">
            <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-zinc-100 blur-2xl opacity-80 pointer-events-none" />
            <div className="relative space-y-2">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Внешний круг
              </div>
              <div className="text-5xl font-semibold tabular-nums text-zinc-900">
                {likeCount}
              </div>
              <div className="text-sm text-zinc-600">
                человек говорят, что им{" "}
                <span className="font-medium text-zinc-900">нравится идея</span>{" "}
                NovaCiv, даже если они пока не готовы вступать.
              </div>
            </div>
            <button
              onClick={handleLike}
              className="relative inline-flex items-center justify-center rounded-full border border-zinc-300 px-7 py-2.5 text-sm font-semibold text-zinc-900 bg-white hover:bg-zinc-50 active:bg-zinc-100 transition"
            >
              Мне нравится
            </button>
          </div>
        </section>

        {/* Небольшой поясняющий блок (вниз, не мешает визуалу) */}
        <section className="text-center text-xs text-zinc-500 max-w-2xl mx-auto">
          Эти счётчики пока фиксируют только локальные решения — чтобы ты сам
          видел свой выбор. Позже мы добавим общий, прозрачный счётчик
          гражданства и поддержки, привязанный к реальному участию.
        </section>

        {/* Плавающий блок соцсетей — декоративный, пока без ссылок */}
        <div className="fixed right-4 bottom-4 md:right-8 md:bottom-8">
          <div className="flex flex-col items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-3 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              Связь
            </span>
            <div className="flex flex-col gap-2">
              <div className="h-8 w-8 rounded-full bg-zinc-900 text-white text-xs flex items-center justify-center">
                Tg
              </div>
              <div className="h-8 w-8 rounded-full bg-zinc-900 text-white text-xs flex items-center justify-center">
                Yt
              </div>
              <div className="h-8 w-8 rounded-full bg-zinc-900 text-white text-xs flex items-center justify-center">
                @
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
