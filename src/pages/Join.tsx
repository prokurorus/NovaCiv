import React, { useEffect, useState } from "react";
import { useStats } from "../hooks/useStats";
import { useChat } from "../hooks/useChat";
import { useMember } from "../hooks/useMember";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import LanguageSwitcher from "../components/LanguageSwitcher";

const topIntro: Record<Language, string> = {
  ru: "Это открытая платформа. Счётчики и чат отражают реальных людей, которые сюда пришли, поставили «Нравится» и решили помочь развитию проекта.",
  en: "This is an open platform. The counters and chat reflect real people who came here, clicked “Like”, and decided to help the project grow.",
  de: "Dies ist eine offene Plattform. Zähler und Chat zeigen reale Menschen, die hierher gekommen sind, „Gefällt mir“ gedrückt haben und beschlossen haben, beim Aufbau des Projekts zu helfen.",
  es: "Esta es una plataforma abierta. Los contadores y el chat reflejan a personas reales que llegaron aquí, pusieron «Me gusta» y decidieron ayudar al desarrollo del proyecto."
};

const statsLabels: Record<
  Language,
  { visitors: string; likes: string; joined: string; likeButton: string }
> = {
  ru: {
    visitors: "Посетители",
    likes: "Нравится",
    joined: "Присоединились",
    likeButton: "♥ Нравится",
  },
  en: {
    visitors: "Visitors",
    likes: "Likes",
    joined: "Joined",
    likeButton: "♥ Like",
  },
  de: {
    visitors: "Besucher",
    likes: "Gefällt",
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

const whoWeSeekIntro: Record<Language, string> = {
  ru: "NovaCiv — не продукт и не секта. Это экспериментальная площадка. Нам нужны люди, которые хотят не просто читать, а делать.",
  en: "NovaCiv is neither a product nor a cult. It is an experimental platform. We need people who want not only to read, but to build.",
  de: "NovaCiv ist weder ein Produkt noch eine Sekte. Es ist eine experimentelle Plattform. Wir brauchen Menschen, die nicht nur lesen, sondern handeln wollen.",
  es: "NovaCiv no es un producto ni una secta. Es una plataforma experimental. Necesitamos personas que no solo quieran leer, sino también hacer.",
};

const whoWeSeekBullets: Record<Language, string[]> = {
  ru: [
    "разработчики: React, TypeScript, backend, инфраструктура;",
    "дизайнеры: UI/UX, Figma, визуальный язык будущего;",
    "переводчики и редакторы для 10 языков платформы;",
    "исследователи, философы, социологи, люди с чувством справедливости;",
    "любые, кто готов взять на себя маленький участок работы и довести его до конца.",
  ],
  en: [
    "developers: React, TypeScript, backend, infrastructure;",
    "designers: UI/UX, Figma, visual language of the future;",
    "translators and editors for 10 platform languages;",
    "researchers, philosophers, sociologists, people with a strong sense of fairness;",
    "anyone ready to take a small piece of work and complete it.",
  ],
  de: [
    "Entwickler:innen: React, TypeScript, Backend, Infrastruktur;",
    "Designer:innen: UI/UX, Figma, visuelle Sprache der Zukunft;",
    "Übersetzer:innen und Redakteur:innen für 10 Plattformsprachen;",
    "Forscher:innen, Philosoph:innen, Soziolog:innen, Menschen mit starkem Gerechtigkeitssinn;",
    "alle, die bereit sind, ein kleines Stück Arbeit zu übernehmen und es zu Ende zu bringen.",
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

const nicknameTitle: Record<Language, string> = {
  ru: "Выбери свой ник",
  en: "Choose your nickname",
  de: "Wähle deinen Nickname",
  es: "Elige tu alias",
};

const nicknameDescription: Record<Language, string> = {
  ru: "Ник будет виден в общем чате. Позже можно будет усложнить систему регистрации, но сейчас главное — живая лента и реальные люди.",
  en: "Your nickname will be visible in the public chat. Later we can make registration more complex, but for now the main thing is a live feed and real people.",
  de: "Dein Nickname wird im öffentlichen Chat sichtbar sein. Später können wir die Registrierung komplexer machen, aber im Moment zählen vor allem ein lebendiger Feed und echte Menschen.",
  es: "Tu alias será visible en el chat público. Más adelante podremos complicar el sistema de registro, pero ahora lo principal es un canal vivo y personas reales.",
};

const nicknamePlaceholder: Record<Language, string> = {
  ru: "Например: NovaРомантик",
  en: "For example: NovaDreamer",
  de: "Zum Beispiel: NovaTräumer",
  es: "Por ejemplo: NovaSoñador",
};

const nicknameButton: Record<Language, string> = {
  ru: "Присоединяюсь",
  en: "Join",
  de: "Beitreten",
  es: "Unirme",
};

const openChatTitle: Record<Language, string> = {
  ru: "Открытый чат",
  en: "Open chat",
  de: "Offener Chat",
  es: "Chat abierto",
};

const openChatDescription: Record<Language, string> = {
  ru: "Лента доступна для чтения всем. Писать сообщения могут только те, кто нажал «Присоединяюсь» и выбрал ник.",
  en: "The feed is open for everyone to read. Only those who clicked “Join” and chose a nickname can write messages.",
  de: "Der Feed ist für alle lesbar. Schreiben können nur diejenigen, die auf „Beitreten“ geklickt und einen Nickname gewählt haben.",
  es: "El canal está abierto para que todos lo lean. Solo quienes hayan pulsado «Unirme» y elegido un alias pueden escribir mensajes.",
};

const emptyChatText: Record<Language, string> = {
  ru: "Пока здесь тихо. Напиши первое сообщение.",
  en: "It is quiet here for now. Write the first message.",
  de: "Hier ist es bisher ruhig. Schreib die erste Nachricht.",
  es: "Por ahora está tranquilo aquí. Escribe el primer mensaje.",
};

const messagePlaceholderMember: Record<Language, string> = {
  ru: "Напиши своё сообщение...",
  en: "Write your message...",
  de: "Schreibe deine Nachricht...",
  es: "Escribe tu mensaje...",
};

const messagePlaceholderNotMember: Record<Language, string> = {
  ru: "Чтобы писать, сначала выбери ник выше.",
  en: "To write messages, first choose a nickname above.",
  de: "Um zu schreiben, wähle zuerst oben einen Nickname.",
  es: "Para escribir mensajes, primero elige un alias arriba.",
};

const maxLengthLabel: Record<Language, string> = {
  ru: "Максимум",
  en: "Maximum",
  de: "Maximal",
  es: "Máximo",
};

const sendLabel: Record<Language, string> = {
  ru: "Отправить",
  en: "Send",
  de: "Senden",
  es: "Enviar",
};

const waitLabel = (lang: Language, seconds: number): string => {
  switch (lang) {
    case "ru":
      return `Подождите ${seconds} с…`;
    case "de":
      return `Bitte ${seconds} s warten…`;
    case "es":
      return `Espera ${seconds} s…`;
    case "en":
    default:
      return `Wait ${seconds} s…`;
  }
};

const JoinPage: React.FC = () => {
  const { stats, ensureVisitorCounted, like, joined } = useStats();
  const { member, registerNickname } = useMember();
  const { messages, sendMessage, isSending, cooldownLeft, maxLength } = useChat();
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


  const handleLike = async () => {
    await like();
  };

const handleRegister = async (e: React.FormEvent) => {
  e.preventDefault();
  setRegisterError(null);

  const result = await registerNickname(nicknameInput);
  if (!result) {
    setRegisterError(
      language === "ru"
        ? "Введите ник."
        : language === "de"
        ? "Bitte Nickname eingeben."
        : language === "es"
        ? "Introduce un alias."
        : "Please enter a nickname."
    );
    return;
  }

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
    console.error("Failed to increment joined counter", e);
  }
};


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(member, messageInput);
    setMessageInput("");
  };

  const isMember = Boolean(member.memberId && member.nickname);
  const length = messageInput.length;
  const nearLimit = length > maxLength - 40;

  const sendDisabled =
    !isMember || isSending || !messageInput.trim() || cooldownLeft > 0;

  const statsText = statsLabels[language];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
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
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-500">{statsText.visitors}</div>
            <div className="text-2xl font-semibold mt-1">{stats.visitors}</div>
          </div>
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify_between">
              <span className="text-sm text-gray-500">{statsText.likes}</span>
              <button
                onClick={handleLike}
                className="text-xs border rounded-full px-3 py-1 hover:bg-gray-100 transition"
              >
                {statsText.likeButton}
              </button>
            </div>
            <div className="text-2xl font-semibold mt-1">{stats.likes}</div>
          </div>
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-500">{statsText.joined}</div>
            <div className="text-2xl font-semibold mt-1">{stats.joined}</div>
          </div>
        </div>

        {/* Те, кто уже здесь */}
        <div className="border rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-medium mb-2">{alreadyHereTitle[language]}</h2>
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
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-600">
              {currentUserLabel[language]}{" "}
              <span className="font-semibold">@{member.nickname}</span>
            </div>
          </div>
        )}

        {/* Кого мы сейчас ищем */}
        <div className="border rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">{whoWeSeekTitle[language]}</h2>
          <p className="text-sm text-gray-600">{whoWeSeekIntro[language]}</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
            {whoWeSeekBullets[language].map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">{whoWeSeekNote[language]}</p>
        </div>

{/* Регистрация / смена ника */}
<div className="border rounded-xl p-4 shadow-sm space-y-3">
  <h2 className="text-lg font-medium">
    {isMember ? nicknameChangeTitle[language] : nicknameTitle[language]}
  </h2>
  <p className="text-sm text-gray-600">
    {nicknameDescription[language]}
  </p>
  <form
    onSubmit={handleRegister}
    className="flex flex-col sm:flex-row gap-3"
  >
    <input
      type="text"
      className="flex-1 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gray-300"
      placeholder={nicknamePlaceholder[language]}
      value={nicknameInput}
      onChange={(e) => setNicknameInput(e.target.value)}
    />
    <button
      type="submit"
      className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition"
    >
      {isMember ? nicknameChangeButton[language] : nicknameButton[language]}
    </button>
  </form>
  {registerError && (
    <p className="text-xs text-red-600">{registerError}</p>
  )}
</div>

{/* Чат */}


        {/* Чат */}
        <div className="border rounded-xl p-4 shadow-sm space-y-4">
          <h2 className="text-lg font-medium">{openChatTitle[language]}</h2>
          <p className="text-sm text-gray-600">
            {openChatDescription[language]}
          </p>

          {/* Сообщения */}
          <div className="max-h-80 overflow-y-auto border rounded-lg p-3 space-y-2 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-sm text-gray-500">
                {emptyChatText[language]}
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="text-sm chat-message">
                <span className="font-semibold">@{msg.nickname}</span>
                <span className="text-gray-500"> · </span>
                <span>{msg.text}</span>
              </div>
            ))}
          </div>

          {/* Форма отправки */}
          <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                className="flex-1 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gray-300"
                placeholder={
                  isMember
                    ? messagePlaceholderMember[language]
                    : messagePlaceholderNotMember[language]
                }
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                disabled={!isMember || isSending}
                maxLength={maxLength}
              />
              <button
                type="submit"
                disabled={sendDisabled}
                className={`px-4 py-2 rounded-lg text-white transition ${
                  sendDisabled
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-gray-900 hover:bg-gray-800"
                }`}
              >
                {cooldownLeft > 0
                  ? waitLabel(language, cooldownLeft)
                  : sendLabel[language]}
              </button>
            </div>

            {/* Счётчик символов */}
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">
                {maxLengthLabel[language]} {maxLength}{" "}
                {language === "ru"
                  ? "символов."
                  : language === "de"
                  ? "Zeichen."
                  : language === "es"
                  ? "caracteres."
                  : "characters."}
              </span>
              <span
                className={
                  nearLimit ? "text-red-500 font-medium" : "text-gray-400"
                }
              >
                {length} / {maxLength}
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default JoinPage;



