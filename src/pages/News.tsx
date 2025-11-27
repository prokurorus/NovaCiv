import React from "react";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import LanguageSwitcher from "../components/LanguageSwitcher";

type Source = "telegram" | "reddit" | "update" | "video" | "essay";

type NewsItem = {
  id: string;
  date: string; // YYYY-MM-DD
  lang: Language;
  source: Source;
  title: string;
  body: string;
};

const sourceLabel: Record<Source, Record<Language, string>> = {
  telegram: {
    ru: "Пост Telegram",
    en: "Telegram post",
    de: "Telegram-Post",
    es: "Publicación en Telegram",
  },
  reddit: {
    ru: "Дискуссия на Reddit",
    en: "Reddit discussion",
    de: "Reddit-Diskussion",
    es: "Discusión en Reddit",
  },
  update: {
    ru: "Обновление проекта",
    en: "Project update",
    de: "Projektupdate",
    es: "Actualización del proyecto",
  },
  video: {
    ru: "Видео / сценарий",
    en: "Video script",
    de: "Videoskript",
    es: "Guion de video",
  },
  essay: {
    ru: "Философская заметка",
    en: "Philosophical note",
    de: "Philosophische Notiz",
    es: "Nota filosófica",
  },
};

const newsItems: NewsItem[] = [
  // === RU ===
  {
    id: "ru-001",
    date: "2025-11-27",
    lang: "ru",
    source: "telegram",
    title: "Кто сказал, что цивилизацию нельзя переписать?",
    body:
      "Кто сказал, что цивилизацию нельзя переписать?\nМожно.\nГлавное — начать.\n\nNovaCiv — черновик будущего, который уже пишется.\nhttps://novaciv.space",
  },
  {
    id: "ru-002",
    date: "2025-11-27",
    lang: "ru",
    source: "telegram",
    title: "Голоса, которые нельзя купить",
    body:
      "Если убрать власть и оставить только людей — что останется?\nОтвет простой: ответственность.\n\nВ NovaCiv голос нельзя продать, купить или передать. Это не ресурс, а личное право.\nhttps://novaciv.space",
  },
  {
    id: "ru-003",
    date: "2025-11-27",
    lang: "ru",
    source: "telegram",
    title: "Цивилизация как черновик",
    body:
      "Каждая эпоха — это черновик следующей.\nМир, который мы получили, полон иерархий, страха и лжи.\nМир, который мы строим, должен быть другим.\n\nNovaCiv — попытка начать новый черновик осознанно, а не через катастрофу.\nhttps://novaciv.space",
  },
  {
    id: "ru-004",
    date: "2025-11-27",
    lang: "ru",
    source: "essay",
    title: "Не исправлять, а проектировать заново",
    body:
      "Большинство реформ — это попытка подлатать корабль, который уже идёт ко дну.\n\nNovaCiv исходит из другого принципа: не чинить старую архитектуру власти, а спроектировать новую — прозрачную, распределённую и ненасильственную.\nhttps://novaciv.space",
  },

  // === EN ===
  {
    id: "en-001",
    date: "2025-11-27",
    lang: "en",
    source: "telegram",
    title: "Who said you can't rewrite a civilization?",
    body:
      "Who said a civilization can’t be rewritten?\nYou can.\nYou just need to start.\n\nNovaCiv is the first draft of a future being written now.\nhttps://novaciv.space",
  },
  {
    id: "en-002",
    date: "2025-11-27",
    lang: "en",
    source: "telegram",
    title: "Votes that cannot be sold",
    body:
      "Remove authority. Leave only people. What remains?\nResponsibility.\n\nIn NovaCiv a vote cannot be sold, bought or delegated. It is a personal, non-transferable right.\nhttps://novaciv.space",
  },
  {
    id: "en-003",
    date: "2025-11-27",
    lang: "en",
    source: "essay",
    title: "Not fixing the system, but redesigning it",
    body:
      "Most reforms are attempts to patch a system that is already structurally outdated.\n\nNovaCiv starts from a different assumption: the architecture of power itself must change — towards transparency, direct decisions and non-violent governance.\nhttps://novaciv.space",
  },
  {
    id: "en-004",
    date: "2025-11-27",
    lang: "en",
    source: "reddit",
    title: "Could a civilization run without rulers?",
    body:
      "Technological growth has outpaced political structures for decades.\nThe next step might not be a \"better government\" but a entirely new model: citizen-driven decisions, open-source governance, no concentrated power.\n\nNovaCiv is one of the experiments in that direction.\nhttps://novaciv.space",
  },
].sort((a, b) => b.date.localeCompare(a.date));

const titleByLang: Record<Language, string> = {
  ru: "Лента движения NovaCiv",
  en: "NovaCiv movement feed",
  de: "NovaCiv-Bewegungsfeed",
  es: "Cronología del movimiento NovaCiv",
};

const introByLang: Record<Language, string> = {
  ru:
    "Здесь мы собираем посты, мысли и фрагменты дискуссий вокруг NovaCiv.\n" +
    "То, что публикуется в Telegram, Reddit и других местах, закрепляется здесь — как живая хроника рождения цифровой цивилизации.",
  en:
    "Here we collect posts, thoughts and fragments of discussions around NovaCiv.\n" +
    "What appears on Telegram, Reddit and other platforms is mirrored here as a living log of a digital civilization being born.",
  de:
    "Hier sammeln wir Beiträge, Gedanken und Diskussionsfragmente rund um NovaCiv.\n" +
    "Was auf Telegram, Reddit und anderen Plattformen erscheint, wird hier als lebendiges Protokoll einer entstehenden digitalen Zivilisation gespiegelt.",
  es:
    "Aquí reunimos publicaciones, ideas y fragmentos de discusiones en torno a NovaCiv.\n" +
    "Lo que aparece en Telegram, Reddit y otras plataformas se refleja aquí como un registro vivo de una civilización digital en nacimiento.",
};

const emptyTextByLang: Record<Language, string> = {
  ru:
    "Для выбранного языка пока нет записей.\n" +
    "Но лента будет пополняться по мере того, как движение NovaCiv будет расти.",
  en:
    "There are no entries yet for the selected language.\n" +
    "The feed will grow as the NovaCiv movement evolves.",
  de:
    "Für die ausgewählte Sprache gibt es noch keine Einträge.\n" +
    "Der Feed wird wachsen, während sich die NovaCiv-Bewegung entwickelt.",
  es:
    "Todavía no hay entradas para el idioma seleccionado.\n" +
    "El flujo crecerá a medida que el movimiento NovaCiv se desarrolle.",
};

const NewsPage: React.FC = () => {
  const { language } = useLanguage();

  const itemsForLang = newsItems.filter((item) => item.lang === language);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-zinc-900">
              {titleByLang[language]}
            </h1>
            <p className="mt-3 text-sm text-zinc-600 whitespace-pre-wrap text-justify">
              {introByLang[language]}
            </p>
          </div>
          <div className="flex justify-end">
            <LanguageSwitcher />
          </div>
        </div>

        <div className="space-y-4">
          {itemsForLang.map((item) => (
            <article key={item.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                <span>{item.date}</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>{sourceLabel[item.source][language]}</span>
                </span>
              </div>
              <h2 className="text-base font-semibold text-zinc-900">
                {item.title}
              </h2>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap text-justify">
                {item.body}
              </p>
            </article>
          ))}

          {itemsForLang.length === 0 && (
            <p className="text-sm text-zinc-500 whitespace-pre-wrap">
              {emptyTextByLang[language]}
            </p>
          )}
        </div>
      </div>
    </main>
  );
};

export default NewsPage;
