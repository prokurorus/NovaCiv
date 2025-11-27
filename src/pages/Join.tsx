import React, { useEffect, useState } from "react";
import { useStats } from "../hooks/useStats";
import { useChat } from "../hooks/useChat";
import { useMember } from "../hooks/useMember";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { db } from "../lib/firebase";
import { push, ref, serverTimestamp } from "firebase/database";

const topIntro: Record<Language, string> = {
  ru: "Это открытая платформа. Счётчики и чат отражают реальных людей, которые однажды пришли, поставили «Нравится» и решили помочь развитию проекта.",
  en: "This is an open platform. The counters and chat reflect real people who once came here, clicked “Like”, and decided to help the project grow.",
  de: "Dies ist eine offene Plattform. Zähler und Chat zeigen reale Menschen, die einmal hierher kamen, auf „Gefällt mir“ klickten und beschlossen, beim Aufbau des Projekts zu helfen.",
  es: "Esta es una plataforma abierta. Los contadores y el chat reflejan a personas reales que un día llegaron, pulsaron «Me gusta» y decidieron ayudar al desarrollo del proyecto.",
};

const statsTextByLang: Record<
  Language,
  { visitors: string; likes: string; joined: string; likeButton: string }
> = {
  ru: {
    visitors: "Посетили",
    likes: "Сказали «Нравится»",
    joined: "Присоединились",
    likeButton: "♥ Нравится",
  },
  en: {
    visitors: "Visited",
    likes: "Clicked “Like”",
    joined: "Joined",
    likeButton: "♥ Like",
  },
  de: {
    visitors: "Besucht",
    likes: "„Gefällt mir“",
    joined: "Beigetreten",
    likeButton: "♥ Gefällt mir",
  },
  es: {
    visitors: "Visitantes",
    likes: "Me gusta",
    joined: "Se unieron",
    likeButton: "♥ Me gusta",
  },
};

const alreadyHereTitle: Record<Language, string> = {
  ru: "Те, кто уже здесь",
  en: "Those who are already here",
  de: "Die, die schon hier sind",
  es: "Los que ya están aquí",
};

const alreadyHereSubtitle: Record<Language, string> = {
  ru: "Список последних активных участников по никнеймам.",
  en: "List of the latest active participants by nickname.",
  de: "Liste der letzten aktiven Teilnehmer nach Nickname.",
  es: "Lista de los últimos participantes activos por alias.",
};

const currentUserLabel: Record<Language, string> = {
  ru: "Ты в системе как",
  en: "You are in the system as",
  de: "Du bist im System als",
  es: "Estás en el sistema como",
};

const whoWeSeekTitle: Record<Language, string> = {
  ru: "Кого мы сейчас ищем",
  en: "Who we are looking for right now",
  de: "Wen wir gerade suchen",
  es: "A quién buscamos ahora",
};

const whoWeSeekList: Record<Language, string[]> = {
  ru: [
    "разработчиков: React, TypeScript, backend, инфраструктура;",
    "дизайнеров: UI/UX, Figma, визуальный язык будущего;",
    "переводчиков и редакторов для 10 языков платформы;",
    "исследователей, философов, социологов, людей с чувством справедливости;",
    "любого, кто готов взять на себя маленький участок работы и довести его до конца.",
  ],
  en: [
    "developers: React, TypeScript, backend, infrastructure;",
    "designers: UI/UX, Figma, the visual language of the future;",
    "translators and editors for the platform’s 10 languages;",
    "researchers, philosophers, sociologists, people with a sense of justice;",
    "anyone ready to take a small piece of work and carry it through to completion.",
  ],
  de: [
    "Entwickler:innen: React, TypeScript, Backend, Infrastruktur;",
    "Designer:innen: UI/UX, Figma, die visuelle Sprache der Zukunft;",
    "Übersetzer:innen und Redakteur:innen für die 10 Sprachen der Plattform;",
    "Forscher:innen, Philosoph:innen, Soziolog:innen, Menschen mit Gerechtigkeitssinn;",
    "alle, die bereit sind, ein kleines Stück Arbeit zu übernehmen und bis zum Ende zu bringen.",
  ],
  es: [
    "desarrolladores: React, TypeScript, backend, infraestructura;",
    "diseñadores: UI/UX, Figma, lenguaje visual del futuro;",
    "traductores y editores para 10 idiomas de la plataforma;",
    "investigadores, filósofos, sociólogos, personas con sentido de la justicia;",
    "cualquiera que esté dispuesto a asumir una pequeña parte del trabajo y llevarla hasta el final.",
  ],
};

const whoWeSeekNote: Record<Language, string> = {
  ru: "Если ты видишь себя в этом списке — просто представься в чате и напиши, чем хотел бы заняться.",
  en: "If you see yourself in this list, just introduce yourself in the chat and write what you would like to work on.",
  de: "Wenn du dich in dieser Liste wiederfindest, stell dich einfach im Chat vor und schreibe, woran du arbeiten möchtest.",
  es: "Si te reconoces en esta lista, preséntate en el chat y escribe en qué te gustaría trabajar.",
};

const nicknameLabel: Record<Language, string> = {
  ru: "Твой никнейм",
  en: "Your nickname",
  de: "Dein Nickname",
  es: "Tu alias",
};

const nicknamePlaceholder: Record<Language, string> = {
  ru: "Придумай короткое имя (латиница)",
  en: "Choose a short name (latin letters)",
  de: "Wähle einen kurzen Namen (lateinische Buchstaben)",
  es: "Elige un nombre corto (letras latinas)",
};

const joinButtonLabel: Record<Language, string> = {
  ru: "Присоединиться",
  en: "Join",
  de: "Beitreten",
  es: "Unirse",
};

const joinHelperLabel: Record<Language, string> = {
  ru: "Ты можешь просто оставить ник и потом вернуться.",
  en: "You can just leave a nickname and come back later.",
  de: "Du kannst einfach einen Nicknamen hinterlassen und später zurückkehren.",
  es: "Puedes simplemente dejar un alias y volver más tarde.",
};

const chatTitle: Record<Language, string> = {
  ru: "Живой чат начала NovaCiv",
  en: "Live chat of NovaCiv’s beginning",
  de: "Live-Chat des Beginns von NovaCiv",
  es: "Chat en vivo del inicio de NovaCiv",
};

const chatSubtitle: Record<Language, string> = {
  ru: "Здесь можно представиться, задать вопрос или предложить помощь.",
  en: "Here you can introduce yourself, ask a question, or offer help.",
  de: "Hier kannst du dich vorstellen, eine Frage stellen oder Hilfe anbieten.",
  es: "Aquí puedes presentarte, hacer una pregunta u ofrecer ayuda.",
};

const chatInputPlaceholder: Record<Language, string> = {
  ru: "Напиши пару строк — кто ты и что тебе откликается.",
  en: "Write a few lines — who you are and what resonates with you.",
  de: "Schreibe ein paar Zeilen – wer du bist und was dich anspricht.",
  es: "Escribe unas líneas: quién eres y qué te resuena.",
};

const chatSendLabel: Record<Language, string> = {
  ru: "Отправить",
  en: "Send",
  de: "Senden",
  es: "Enviar",
};

const registerErrorText: Record<Language, string> = {
  ru: "Никнейм должен быть от 3 до 20 символов латиницей или цифрами.",
  en: "Nickname must be 3–20 characters, using Latin letters or digits.",
  de: "Der Nickname muss 3–20 Zeichen lang sein und lateinische Buchstaben oder Ziffern enthalten.",
  es: "El alias debe tener entre 3 y 20 caracteres, usando letras latinas o dígitos.",
};

const cooldownText: Record<Language, string> = {
  ru: "Можно писать не чаще, чем раз в минуту.",
  en: "You can post not more than once per minute.",
  de: "Du kannst nicht öfter als einmal pro Minute schreiben.",
  es: "No puedes escribir con más frecuencia que una vez por minuto.",
};

const JoinPage: React.FC = () => {
  const { stats, ensureVisitorCounted, like, joined } = useStats();
  const { member, registerNickname } = useMember();
  const { messages, sendMessage, isSending, cooldownLeft, maxLength } =
    useChat();
  const { language, t } = useLanguage();

  const [nicknameInput, setNicknameInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [hasJoinedFlag, setHasJoinedFlag] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("novaciv_joined_counted") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    ensureVisitorCounted();
  }, [ensureVisitorCounted]);

  const statsText = statsTextByLang[language];

  const handleLike = async () => {
    try {
      await like();
    } catch (e) {
      console.error("Failed to like:", e);
    }
  };

  const isMember = !!member.nickname;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    const trimmed = nicknameInput.trim();
    const valid = /^[a-zA-Z0-9_]{3,20}$/.test(trimmed);

    if (!valid) {
      setRegisterError(registerErrorText[language]);
      return;
    }

    try {
      await registerNickname(trimmed);

      const dbRef = ref(db, "joinNicknames");
      await push(dbRef, {
        nickname: trimmed,
        createdAt: serverTimestamp(),
      });

      setNicknameInput("");

      try {
        if (!hasJoinedFlag) {
          await joined();
          if (typeof window !== "undefined") {
            window.localStorage.setItem("novaciv_joined_counted", "1");
          }
          setHasJoinedFlag(true);
        }
      } catch (e) {
        console.error("Failed to increment joined counter:", e);
      }
    } catch (e) {
      console.error("Failed to register nickname:", e);
      setRegisterError(
        registerErrorText[language] ||
          "Ошибка при регистрации никнейма. Попробуй ещё раз."
      );
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    try {
      await sendMessage(messageInput.trim());
      setMessageInput("");
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const length = messageInput.length;
  const nearLimit = length > maxLength * 0.7;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-6 md:px-8 py-12 space-y-10">
        {/* Заголовок + переключатель языка */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold mb-2">{t.join.title}</h1>
            <p className="text-gray-600">{topIntro[language]}</p>
          </div>
          <LanguageSwitcher />
        </div>

        {/* Счётчики */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/80 shadow-sm">
            <div className="text-sm text-gray-500">{statsText.visitors}</div>
            <div className="text-2xl font-semibold mt-1">
              {stats.visitors}
            </div>
          </div>
          <div className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/80 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {statsText.likes}
              </span>
              <button
                onClick={handleLike}
                className="text-xs border rounded-full px-3 py-1 hover:bg-gray-100 transition"
              >
                {statsText.likeButton}
              </button>
            </div>
            <div className="text-2xl font-semibold mt-1">{stats.likes}</div>
          </div>
          <div className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/80 shadow-sm">
            <div className="text-sm text-gray-500">{statsText.joined}</div>
            <div className="text-2xl font-semibold mt-1">{stats.joined}</div>
          </div>
        </div>

        {/* Никнейм и «Те, кто уже здесь» */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Блок регистрации никнейма */}
          <div className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/80 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold">{t.join.nicknameTitle}</h2>
            <p className="text-sm text-gray-600">
              {t.join.nicknameSubtitle}
            </p>

            <form onSubmit={handleRegister} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {nicknameLabel[language]}
                </label>
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder={nicknamePlaceholder[language]}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/70 focus:border-transparent"
                />
                {registerError && (
                  <p className="text-xs text-red-500">{registerError}</p>
                )}
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full border border-black bg-black px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-900 transition"
              >
                {joinButtonLabel[language]}
              </button>
              <p className="text-xs text-gray-500">
                {joinHelperLabel[language]}
              </p>
            </form>
          </div>

          {/* Те, кто уже здесь */}
          <div className="space-y-4">
            {/* Те, кто уже здесь */}
            <div className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/80 shadow-sm">
              <h2 className="text-lg font-medium mb-2">
                {alreadyHereTitle[language]}
              </h2>
              <p className="text-sm text-gray-600 mb-1">
                {alreadyHereSubtitle[language]}
              </p>
              <div className="inline-flex flex-wrap gap-2 text-sm">
                {member.nickname && (
                  <span className="inline-flex items-center rounded-full border border-gray-300 px-3 py-1">
                    @{member.nickname}
                  </span>
                )}
              </div>
            </div>

            {/* Текущий пользователь */}
            {isMember && (
              <div className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/80 shadow-sm">
                <div className="text-sm text-gray-600">
                  {currentUserLabel[language]}{" "}
                  <span className="font-semibold">@{member.nickname}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Кого мы ищем */}
        <div className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/80 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">{whoWeSeekTitle[language]}</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
            {whoWeSeekList[language].map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
          <p className="text-sm text-gray-600">{whoWeSeekNote[language]}</p>
        </div>

        {/* Чат */}
        <div className="md:grid md:grid-cols-2 md:gap-6 space-y-6 md:space-y-0">
          {/* Сообщения */}
          <div className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/80 shadow-sm flex flex-col">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">{chatTitle[language]}</h2>
              <p className="text-sm text-gray-600">
                {chatSubtitle[language]}
              </p>
            </div>

            <div className="flex-1 border border-dashed border-gray-200 rounded-lg p-3 overflow-y-auto max-h-80 bg-white/70">
              {messages.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Пока здесь тихо. Напиши первым.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {messages.map((msg) => (
                    <li key={msg.id}>
                      <span className="font-semibold">@{msg.nickname}</span>
                      <span className="text-gray-600">: </span>
                      <span>{msg.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Форма отправки */}
          <form
            onSubmit={handleSendMessage}
            className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/80 shadow-sm space-y-4 flex flex-col"
          >
            <div>
              <label className="text-sm font-medium mb-1 block">
                {chatInputPlaceholder[language]}
              </label>
              <textarea
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                rows={5}
                maxLength={maxLength}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/70 focus:border-transparent resize-none bg-white/90"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{cooldownText[language]}</span>
              <span
                className={
                  nearLimit ? "text-red-500 font-medium" : "text-gray-400"
                }
              >
                {length} / {maxLength}
              </span>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSending || cooldownLeft > 0 || !messageInput.trim()}
                className="inline-flex items-center justify-center rounded-full border border-black bg-black px-5 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-900 transition"
              >
                {chatSendLabel[language]}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default JoinPage;
