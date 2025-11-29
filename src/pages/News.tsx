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

  const itemsForLang = items.filter((item) => {
    if (!item.lang) return true;
    return item.lang === language;
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

        {loading ? (
          <p className="text-sm text-zinc-500">
            {language === "ru" ? "Загрузка ленты..." : "Loading feed..."}
          </p>
        ) : (
          <div className="space-y-4">
            {itemsForLang.map((item) => (
              <article key={item.id} className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                  <span>{formatDateTime(item.createdAt, language)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>{sourceLabel.news[language]}</span>
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

            {!itemsForLang.length && !loading && (
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
