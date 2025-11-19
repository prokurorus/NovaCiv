import React, { useEffect, useState } from "react";
import { useStats } from "../hooks/useStats";
import { useChat, useMember } from "../hooks/useChat";

const JoinPage: React.FC = () => {
  const { stats, ensureVisitorCounted, like, joined } = useStats();
  const { member, registerNickname } = useMember();
  const { messages, sendMessage, isSending } = useChat();

  const [nicknameInput, setNicknameInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);

  useEffect(() => {
    ensureVisitorCounted();
  }, [ensureVisitorCounted]);

  const handleLike = () => {
    like();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    const result = await registerNickname(nicknameInput.trim());
    if (!result) {
      setRegisterError("Введите ник.");
      return;
    }

    setNicknameInput("");
    joined(); // увеличиваем счётчик присоединившихся
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    await sendMessage(member, messageInput.trim());
    setMessageInput("");
  };

  const isMember = Boolean(member.memberId && member.nickname);

  // Берём до 10 последних уникальных ников из ленты сообщений (с конца массива)
  const recentNicknames: string[] = [];
  for (let i = messages.length - 1; i >= 0 && recentNicknames.length < 10; i--) {
    const nick = messages[i].nickname;
    if (nick && !recentNicknames.includes(nick)) {
      recentNicknames.push(nick);
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {/* Заголовок */}
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-4 py-1 text-[11px] font-medium text-gray-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            NovaCiv • открытая цифровая платформа
          </div>
          <h1 className="text-3xl font-semibold">Присоединиться к NovaCiv</h1>
          <p className="text-gray-600 text-sm sm:text-base max-w-2xl">
            Это открытая платформа. Счётчики и чат отражают{" "}
            <span className="font-medium">реальных людей</span>, которые сюда
            пришли, поставили «Нравится» и решили помочь развитию проекта.
          </p>
        </header>

        {/* Счётчики */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-500">Посетители</div>
            <div className="text-2xl font-semibold mt-1">{stats.visitors}</div>
          </div>
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Нравится</span>
              <button
                onClick={handleLike}
                className="text-xs border rounded-full px-3 py-1 hover:bg-gray-100 transition"
              >
                ♥ Нравится
              </button>
            </div>
            <div className="text-2xl font-semibold mt-1">{stats.likes}</div>
          </div>
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-500">Присоединились</div>
            <div className="text-2xl font-semibold mt-1">{stats.joined}</div>
          </div>
        </section>

        {/* Те, кто уже здесь */}
        {recentNicknames.length > 0 && (
          <section className="border rounded-xl p-4 shadow-sm space-y-2">
            <h2 className="text-sm font-medium text-gray-800">
              Те, кто уже здесь
            </h2>
            <p className="text-xs text-gray-500">
              Список последних активных участников по никнеймам.
            </p>
            <div className="flex flex-wrap gap-2">
              {recentNicknames.map((nick) => (
                <span
                  key={nick}
                  className="inline-flex items-center rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 bg-gray-50"
                >
                  @{nick}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Регистрация ника */}
        {!isMember && (
          <section className="border rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="text-lg font-medium">Выбери свой ник</h2>
            <p className="text-sm text-gray-600">
              Ник будет виден в общем чате. Позже можно усложнить систему
              регистрации, но сейчас главное — живая лента и реальные люди.
            </p>
            <form
              onSubmit={handleRegister}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                type="text"
                className="flex-1 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gray-300"
                placeholder="Например: NovaРомантик"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition"
              >
                Присоединяюсь
              </button>
            </form>
            {registerError && (
              <div className="text-sm text-red-600">{registerError}</div>
            )}
          </section>
        )}

        {/* Информация о текущем участнике */}
        {isMember && (
          <section className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-600">
              Ты в системе как:{" "}
              <span className="font-semibold">@{member.nickname}</span>
            </div>
          </section>
        )}

        {/* Кого мы ищем (над чатом) */}
        <section className="border rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-medium">Кого мы сейчас ищем</h2>
          <p className="text-sm text-gray-600 max-w-2xl">
            NovaCiv — не продукт и не секта. Это экспериментальная площадка.
            Нам нужны люди, которые хотят не просто читать, а делать.
          </p>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            <li>разработчики: React, TypeScript, backend, инфраструктура;</li>
            <li>дизайнеры: UI/UX, Figma, визуальный язык будущего;</li>
            <li>переводчики и редакторы для 10 языков платформы;</li>
            <li>исследователи, философы, социологи, люди с чувством справедливости;</li>
            <li>любые, кто готов взять на себя маленький участок работы и довести его до конца.</li>
          </ul>
          <p className="text-xs text-gray-500">
            Если ты видишь себя в этом списке — просто представься в чате и
            напиши, чем хотел бы заняться.
          </p>
        </section>

        {/* Чат */}
        <section className="border rounded-xl p-4 shadow-sm space-y-4">
          <h2 className="text-lg font-medium">Открытый чат</h2>
          <p className="text-sm text-gray-600">
            Лента доступна для чтения всем. Писать сообщения могут только те, кто
            нажал «Присоединяюсь» и выбрал ник.
          </p>

          {/* Сообщения */}
          <div className="max-h-80 overflow-y-auto border rounded-lg p-3 space-y-2 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-sm text-gray-500">
                Пока здесь тихо. Напиши первое сообщение.
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="text-sm">
                <span className="font-semibold">@{msg.nickname}</span>
                <span className="text-gray-500"> · </span>
                <span>{msg.text}</span>
              </div>
            ))}
          </div>

          {/* Форма отправки */}
          <form
            onSubmit={handleSendMessage}
            className="flex flex-col sm:flex-row gap-3"
          >
            <input
              type="text"
              className="flex-1 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gray-300"
              placeholder={
                isMember
                  ? "Напиши своё сообщение..."
                  : "Чтобы писать, сначала выбери ник выше."
              }
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              disabled={!isMember || isSending}
            />
            <button
              type="submit"
              disabled={!isMember || isSending || !messageInput.trim()}
              className={`px-4 py-2 rounded-lg text-white transition ${
                !isMember || isSending || !messageInput.trim()
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-gray-900 hover:bg-gray-800"
              }`}
            >
              Отправить
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default JoinPage;
