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
  ru: "Это открытая платформа. Счётчики и чат отражают реальных людей, которые сюда пришли, поставили «Нравится» и решили помочь развитию проекта.",
  en: "This is an open platform. The counters and chat reflect real people who came here, clicked “Like”, and decided to help the project grow.",
  de: "Dies ist eine offene Plattform. Zähler und Chat zeigen reale Menschen, die hierher gekommen sind, „Gefällt mir“ gedrückt haben und beschlossen haben, beim Aufbau des Projekts zu helfen.",
  es: "Esta es una plataforma abierta. Los contadores y el chat reflejan a personas reales que llegaron aquí, pusieron «Me gusta» y decidieron ayudar al desarrollo del proyecto.",
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

const nicknameChangeTitle: Record<Language, string> = {
  ru: "Смена ника",
  en: "Change nickname",
  de: "Nickname ändern",
  es: "Cambiar alias",
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

const nicknameChangeButton: Record<Language, string> = {
  ru: "Обновить ник",
  en: "Update nickname",
  de: "Nickname aktualisieren",
  es: "Actualizar alias",
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

/** Блок связи с основателем */

const contactTitle: Record<Language, string> = {
  ru: "Связь с основателем",
  en: "Contact the founder",
  de: "Kontakt zum Gründer",
  es: "Contacto con el fundador",
};

const contactIntro: Record<Language, string> = {
  ru: "Если ты хочешь помочь развивать NovaCiv, взять на себя участок работы или предложить идею — напиши. Сообщение попадёт напрямую к основателю.",
  en: "If you want to help develop NovaCiv, take responsibility for a part of the work or propose an idea — write here. Your message will go directly to the founder.",
  de: "Wenn du NovaCiv mitentwickeln, Verantwortung für einen Bereich übernehmen oder eine Idee vorschlagen möchtest – schreib hier. Deine Nachricht geht direkt an den Gründer.",
  es: "Si quieres ayudar a desarrollar NovaCiv, asumir una parte del trabajo o proponer una idea, escribe aquí. Tu mensaje irá directamente al fundador.",
};

const contactNameLabel: Record<Language, string> = {
  ru: "Как тебя называть",
  en: "How to call you",
  de: "Wie dürfen wir dich nennen",
  es: "Cómo llamarte",
};

const contactNamePlaceholder: Record<Language, string> = {
  ru: "Ник или имя (необязательно)",
  en: "Nickname or name (optional)",
  de: "Nickname oder Name (optional)",
  es: "Alias o nombre (opcional)",
};

const contactMethodLabel: Record<Language, string> = {
  ru: "Как с тобой связаться",
  en: "How to contact you",
  de: "Wie wir dich erreichen",
  es: "Cómo contactarte",
};

const contactMethodPlaceholder: Record<Language, string> = {
  ru: "Email, Telegram или другой удобный способ",
  en: "Email, Telegram or other preferred way",
  de: "E-Mail, Telegram oder anderer Weg",
  es: "Email, Telegram u otro medio",
};

const contactMessageLabel: Record<Language, string> = {
  ru: "Чем ты хочешь помочь или какой у тебя вопрос",
  en: "How you want to help or what you ask",
  de: "Wobei du helfen möchtest oder welche Frage du hast",
  es: "En qué quieres ayudar o cuál es tu pregunta",
};

const contactMessagePlaceholder: Record<Language, string> = {
  ru: "Коротко опиши, что ты умеешь или чем хочешь заняться.",
  en: "Briefly describe what you can do or what you want to work on.",
  de: "Beschreibe kurz, was du kannst oder woran du arbeiten möchtest.",
  es: "Describe brevemente lo que sabes hacer o en qué quieres trabajar.",
};

const contactConsentLabel: Record<Language, string> = {
  ru: "Я согласен использовать указанные данные только для связи по проекту NovaCiv.",
  en: "I agree that these details will be used only to contact me about the NovaCiv project.",
  de: "Ich bin einverstanden, dass diese Daten nur zur Kontaktaufnahme bezüglich des NovaCiv-Projekts genutzt werden.",
  es: "Acepto que estos datos se utilicen solo para contactarme sobre el proyecto NovaCiv.",
};

const contactSubmitLabel: Record<Language, string> = {
  ru: "Отправить основателю",
  en: "Send to founder",
  de: "An den Gründer senden",
  es: "Enviar al fundador",
};

const contactValidationError: Record<Language, string> = {
  ru: "Укажи способ связи, напиши сообщение и поставь галочку согласия.",
  en: "Please provide a contact method, write a message and check the consent box.",
  de: "Bitte gib eine Kontaktmöglichkeit an, schreibe eine Nachricht und setze das Häkchen für die Zustimmung.",
  es: "Indica un medio de contacto, escribe un mensaje y marca la casilla de consentimiento.",
};

const contactSendError: Record<Language, string> = {
  ru: "Не удалось отправить сообщение. Попробуй ещё раз чуть позже.",
  en: "Failed to send your message. Please try again a bit later.",
  de: "Die Nachricht konnte nicht gesendet werden. Bitte versuche es später erneut.",
  es: "No se pudo enviar tu mensaje. Inténtalo de nuevo más tarde.",
};

const contactSuccessText: Record<Language, string> = {
  ru: "Сообщение передано основателю NovaCiv. Спасибо за готовность помочь.",
  en: "Your message has been delivered to the founder of NovaCiv. Thank you for your willingness to help.",
  de: "Deine Nachricht wurde an den Gründer von NovaCiv übermittelt. Danke für deine Bereitschaft zu helfen.",
  es: "Tu mensaje ha sido enviado al fundador de NovaCiv. Gracias por tu disposición a ayudar.",
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

  // Состояние формы связи с основателем
  const [contactName, setContactName] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactAgree, setContactAgree] = useState(false);
  const [contactSending, setContactSending] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

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

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSuccess(null);

    const name = contactName.trim() || member.nickname || "";
       const method = contactMethod.trim();
    const msg = contactMessage.trim();

    if (!contactAgree || !method || !msg) {
      setContactError(contactValidationError[language]);
      return;
    }

    setContactSending(true);
    try {
      // 1. Сохраняем обращение в Firebase
      await push(ref(db, "contactRequests"), {
        createdAt: Date.now(),
        createdAtServer: serverTimestamp(),
        source: "direct",
        language,
        memberId: member.memberId || null,
        nickname: name || null,
        contact: method,
        message: msg,
        status: "new",
      });

      // 2. Пытаемся отправить письмо через Netlify Function (мягкая ошибка)
      try {
        const resp = await fetch("/.netlify/functions/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nickname: name || null,
            contact: method,
            message: msg,
            language,
            memberId: member.memberId || null,
          }),
        });

        if (!resp.ok) {
          console.error(
            "send-email function responded with status",
            resp.status
          );
        }
      } catch (emailErr) {
        console.error("Failed to call send-email function", emailErr);
      }

      setContactSuccess(contactSuccessText[language]);
      setContactMessage("");
      setContactMethod("");
      // Имя и согласие оставляем — удобно, если человек пишет повторно
    } catch (err) {
      console.error("Failed to send contact request", err);
      setContactError(contactSendError[language]);
    } finally {
      setContactSending(false);
    }
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

        {/* Навигация по сайту */}
        <div className="flex flex-wrap gap-2 mb-6">
          <a
            href="/"
            className="px-4 py-1.5 rounded-full border border-gray-300 text-sm hover:bg-gray-100 transition"
          >
            Главная
          </a>
          <a
            href="/manifest"
            className="px-4 py-1.5 rounded-full border border-gray-300 text-sm hover:bg-gray-100 transition"
          >
            Наше видение
          </a>
          <a
            href="/charter"
            className="px-4 py-1.5 rounded-full border border-gray-300 text-sm hover:bg-gray-100 transition"
          >
            Устав
          </a>
          <a
            href="/forum"
            className="px-4 py-1.5 rounded-full border border-gray-300 text-sm hover:bg-gray-100 transition"
          >
            Форум
          </a>
        </div>

        {/* Счётчики */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-500">{statsText.visitors}</div>
            <div className="text-2xl font-semibold mt-1">
              {stats.visitors}
            </div>
          </div>
          <div className="border rounded-xl p-4 shadow-sm">
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
          <div className="border rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-500">{statsText.joined}</div>
            <div className="text-2xl font-semibold mt-1">{stats.joined}</div>
          </div>
        </div>

        {/* Те, кто уже здесь */}
        <div className="border rounded-xl p-4 shadow-sm">
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

        {/* Связь с основателем */}
        <div className="border rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">{contactTitle[language]}</h2>
          <p className="text-sm text-gray-600">{contactIntro[language]}</p>

          <form onSubmit={handleContactSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-700">
                  {contactNameLabel[language]}
                </label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                  placeholder={contactNamePlaceholder[language]}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-700">
                  {contactMethodLabel[language]}
                </label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                  placeholder={contactMethodPlaceholder[language]}
                  value={contactMethod}
                  onChange={(e) => setContactMethod(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                {contactMessageLabel[language]}
              </label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300 min-h-[80px] resize-y"
                placeholder={contactMessagePlaceholder[language]}
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                id="contact-agree"
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={contactAgree}
                onChange={(e) => setContactAgree(e.target.checked)}
              />
              <label
                htmlFor="contact-agree"
                className="text-xs text-gray-600"
              >
                {contactConsentLabel[language]}
              </label>
            </div>

            {contactError && (
              <p className="text-xs text-red-600">{contactError}</p>
            )}
            {contactSuccess && (
              <p className="text-xs text-green-600">{contactSuccess}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={contactSending}
                className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition ${
                  contactSending
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-gray-900 hover:bg-gray-800"
                }`}
              >
                {contactSending
                  ? waitLabel(language, 2)
                  : contactSubmitLabel[language]}
              </button>
            </div>
          </form>
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
