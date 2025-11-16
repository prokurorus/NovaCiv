import React from "react";
import Layout from "../components/Layout";

function useCounter(key: string, initial = 0) {
  const [value, setValue] = React.useState<number>(() => {
    const raw = localStorage.getItem(key);
    return raw ? Number(raw) : initial;
  });
  React.useEffect(() => {
    localStorage.setItem(key, String(value));
  }, [key, value]);
  return { value, setValue };
}

export default function JoinPage() {
  const members = useCounter("nciv_members", 0);
  const likes = useCounter("nciv_likes", 0);

  return (
    <Layout>
      <h1 className="text-2xl mb-6">Присоединиться</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-2xl shadow p-6 text-center">
          <div className="text-4xl font-semibold">{members.value}</div>
          <div className="opacity-70 mt-1">Уже с нами</div>
          <button
            className="mt-4 px-4 py-2 rounded-xl shadow border hover:shadow-md"
            onClick={() => members.setValue(members.value + 1)}
          >
            Присоединяюсь
          </button>
        </div>

        <div className="rounded-2xl shadow p-6 text-center">
          <div className="text-4xl font-semibold">{likes.value}</div>
          <div className="opacity-70 mt-1">Нравится проект</div>
          <button
            className="mt-4 px-4 py-2 rounded-xl shadow border hover:shadow-md"
            onClick={() => likes.setValue(likes.value + 1)}
          >
            Мне нравится
          </button>
        </div>
      </div>

      {/* Плавающий блок соцсетей */}
      <div className="fixed right-4 bottom-4 rounded-2xl shadow-lg bg-white/90 p-3 flex gap-3">
        <a href="https://t.me/novaciv" target="_blank">TG</a>
        <a href="https://github.com/prokurorus/nova-civ-ascendancy-web" target="_blank">GH</a>
        <a href="/" title="Поделиться">Share</a>
      </div>

      <p className="opacity-70 text-sm">
        Примечание: счётчики локальные (браузер). Позже подключим хранение в Supabase.
      </p>
    </Layout>
  );
}
