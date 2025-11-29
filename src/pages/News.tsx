import React, { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { onValue, query, ref, orderByChild } from "firebase/database";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import LanguageSwitcher from "../components/LanguageSwitcher";

type ForumTopic = {
  id: string;
  title: string;
  content: string;
  section: string;
  createdAt: number;
  lang?: Language;
  sourceId?: string;
  postKind?: string;
  authorNickname?: string;
};

const sourceLabel = {
  news: {
    ru: "Новости движения",
    en: "Movement news",
    de: "News der Bewegung",
    es: "Noticias del movimiento",
  },
} as const;

const titleByLang: Record<Language, string> = {
  ru: "Лента движения NovaCiv",
  en: "NovaCiv movement feed",
  de: "NovaCiv-Bewegungsfeed",
  es: "Cronología del movimiento NovaCiv",
};

const introByLang: Record<Language, string> = {
  ru:
    "Здесь мы собираем посты, мысли, новости и фрагменты дискуссий вокруг NovaCiv.\n" +
    "В этой ленте живут три потока: мировые новости, голос Домового и записи сообщества. Всё, что рождает движение, оседает здесь.",
  en:
    "Here we collect posts, thoughts, news and discussion fragments around NovaCiv.\n" +
    "Three streams live in this feed: world news, Domovoy's voice and community posts. Everything that the movement creates lands here.",
  de:
    "Hier sammeln wir Beiträge, Gedanken, Nachrichten und Diskussionsfragmente rund um NovaCiv.\n" +
    "Drei Ströme leben in diesem Feed: Weltnachrichten, die Stimme des Domovoy und Beiträge der Gemeinschaft. Alles, was die Bewegung hervorbringt, landet hier.",
  es:
    "Aquí reunimos publicaciones, ideas, noticias y fragmentos de discusiones en torno a NovaCiv.\n" +
    "En este feed conviven tres corrientes: noticias del mundo, la voz del Domovoy y las publicaciones de la comunidad. Todo lo que genera el movimiento se queda aquí.",
};

const emptyTextByLang: Record<Language, string> = {
  ru:
    "Для выбранного языка пока нет записей.\n" +
    "Создай тему в разделе «Новости движения» на форуме — и она появится здесь.",
  en:
    "There are no entries yet for the selected language.\n" +
    "Create a topic in the “Movement news” section of the forum and it will appear here.",
  de:
    "Für die ausgewählte Sprache gibt es noch keine Einträge.\n" +
    "Erstelle ein Thema im Bereich „News der Bewegung“ im Forum, und es erscheint hier.",
  es:
    "Todavía no hay entradas para el idioma seleccionado.\n" +
    "Crea un tema en la sección «Noticias del movimiento» del foro y aparecerá aquí.",
};

// Тип фильтра
type FilterType = "all" | "domovoy" | "world" | "community";

const filterLabels: Record<FilterType, Record<Language, string>> = {
  all: {
    ru: "Все",
    en: "All",
    de: "Alle",
    es: "Todo",
  },
  domovoy: {
    ru: "Домовой",
    en: "Domovoy",
    de: "Domovoy",
    es: "Domovoy",
  },
  world: {
    ru: "Мировые новости",
    en: "World news",
    de: "Weltnachrichten",
    es: "Noticias del mundo",
  },
  community: {
    ru: "Сообщество",
    en: "Community",
    de: "Gemeinschaft",
    es: "Comunidad",
  },
};

// Форматирование даты и времени по языку
const formatDateTime = (timestamp: number | undefined, language: Language) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);

  let locale = "en-GB";
  switch (language) {
    case "ru":
      locale = "ru-RU";
      break;
    case "de":
      locale = "de-DE";
      break;
    case "es":
      locale = "es-ES";
      break;
  }

  return date.toLocaleString(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const NewsPage: React.FC = () => {
  const { language } = useLanguage();
  const [items, setItems] = useState<ForumTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    const topicsRef = query(ref(db, "forum/topics"), orderByChild("createdAt"));

    const unsubscribe = onValue(topicsRef, (snapshot) => {
      const value = snapshot.val() || {};

      const list: ForumTopic[] = Object.entries(value)
        .map(([id, raw]) => {
          const t = raw as any;
          return {
            id,
            title: t.title ?? "",
            content: t.content ?? "",
            section: t.section ?? "general",
            createdAt: t.createdAt ?? 0,
            lang: (t.lang as Language) ?? undefined,
            sourceId: t.sourceId ?? undefined,
            postKind: t.postKind ?? undefined,
            authorNickname: t.authorNickname ?? undefined,
          };
        })
        .filter((topic) => topic.section === "news");

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setItems(list);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Фильтрация по языку интерфейса
  const itemsForLang = items.filter((item) => {
    if (!item.lang) return true; // старые записи без lang видны во всех
    return item.lang === language;
  });

  // Фильтрация по типу
  const filteredItems = itemsForLang.filter((item) => {
    if (filter === "all") return true;

    const isDomovoy =
      item.sourceId === "domovoy" ||
      (typeof item.postKind === "string" &&
        item.postKind.startsWith("domovoy:"));

    const hasSource = typeof item.sourceId === "string" && item.sourceId;

    if (filter === "domovoy") {
      return isDomovoy;
    }

    if (filter === "world") {
      // мировые новости: есть sourceId и это не Домовой
      return hasSource && !isDomovoy;
    }

    if (filter === "community") {
      // сообщество: нет sourceId вообще (ручные/форумные записи)
      return !hasSource;
    }

    return true;
  });

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

        {/* Фильтры */}
        <div className="mb-5 flex flex-wrap gap-2">
          {(["all", "domovoy", "world", "community"] as FilterType[]).map(
            (f) => {
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs transition " +
                    (isActive
                      ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                  }
                >
                  {filterLabels[f][language]}
                </button>
              );
            },
          )}
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">
            {language === "ru" ? "Загрузка ленты..." : "Loading feed..."}
          </p>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <article key={item.id} className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                  <span>{formatDateTime(item.createdAt, language)}</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>{sourceLabel.news[language]}</span>
                    </span>
                    {item.sourceId === "domovoy" && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Domovoy
                      </span>
                    )}
                    {item.sourceId &&
                      item.sourceId !== "domovoy" && (
                        <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-500">
                          {item.sourceId}
                        </span>
                      )}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-zinc-900">
                  {item.title}
                </h2>
                <p className="text-sm text-zinc-700 whitespace-pre-wrap text-justify">
                  {item.content}
                </p>
              </article>
            ))}

            {!filteredItems.length && !loading && (
              <p className="text-sm text-zinc-500 whitespace-pre-wrap">
                {emptyTextByLang[language]}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
};

export default NewsPage;
