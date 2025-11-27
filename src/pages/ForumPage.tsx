import React, { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import {
  onValue,
  push,
  query,
  ref,
  serverTimestamp,
  orderByChild,
} from "firebase/database";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import { useMember } from "../hooks/useMember";
import LanguageSwitcher from "../components/LanguageSwitcher";

type Topic = {
  id: string;
  title: string;
  content: string;
  section: string;
  createdAt?: number;
  authorNickname?: string | null;
  lang?: Language; // язык, в котором создана тема
};


type PostsMeta = {
  repliesCount: number;
  lastReplyAt: number | null;
};

const sectionLabels: Record<string, Record<Language, string>> = {
  general: {
    ru: "Общее",
    en: "General",
    de: "Allgemeines",
    es: "General",
  },
  ideas: {
    ru: "Идеи и предложения",
    en: "Ideas & proposals",
    de: "Ideen & Vorschläge",
    es: "Ideas y propuestas",
  },
  tech: {
    ru: "Техника и сайт",
    en: "Tech & site",
    de: "Technik & Website",
    es: "Tecnología y sitio",
  },
  news: {
    ru: "Новости движения",
    en: "Movement news",
    de: "News der Bewegung",
    es: "Noticias del movimiento",
  },
};


const labels = {
  title: {
    ru: "Форум NovaCiv",
    en: "NovaCiv Forum",
    de: "NovaCiv-Forum",
    es: "Foro de NovaCiv",
  },
  intro: {
    ru: "Здесь можно обсуждать идеи, задавать вопросы и делиться мыслями о Новой цивилизации. Помни о взаимном уважении и ненасилии.",
    en: "Here you can discuss ideas, ask questions and share thoughts about the New Civilization. Remember mutual respect and non-violence.",
    de: "Hier kannst du Ideen diskutieren, Fragen stellen und Gedanken über die Neue Zivilisation teilen. Denk an gegenseitigen Respekt und Gewaltfreiheit.",
    es: "Aquí puedes debatir ideas, hacer preguntas y compartir pensamientos sobre la Nueva Civilización. Recuerda el respeto mutuo y la no violencia.",
  },
  newTopicTitle: {
    ru: "Новая тема",
    en: "New topic",
    de: "Neues Thema",
    es: "Nuevo tema",
  },
  topicTitleLabel: {
    ru: "Заголовок",
    en: "Title",
    de: "Titel",
    es: "Título",
  },
  sectionLabel: {
    ru: "Раздел",
    en: "Section",
    de: "Bereich",
    es: "Sección",
  },
  messageLabel: {
    ru: "Первое сообщение",
    en: "First message",
    de: "Erste Nachricht",
    es: "Primer mensaje",
  },
  submit: {
    ru: "Создать тему",
    en: "Create topic",
    de: "Thema erstellen",
    es: "Crear tema",
  },
  topicsList: {
    ru: "Темы",
    en: "Topics",
    de: "Themen",
    es: "Temas",
  },
  noTopics: {
    ru: "Тем пока нет. Стань первым, кто начнёт разговор.",
    en: "No topics yet. Be the first to start a conversation.",
    de: "Noch keine Themen. Sei der Erste, der ein Gespräch beginnt.",
    es: "Todavía no hay temas. Sé el primero en iniciar la conversación.",
  },
  error: {
    ru: "Не удалось сохранить тему. Попробуй ещё раз.",
    en: "Failed to save the topic. Please try again.",
    de: "Thema konnte nicht gespeichert werden. Versuch es noch einmal.",
    es: "No se pudo guardar el tema. Inténtalo de nuevo.",
  },
};

function getSectionLabel(section: string, language: Language): string {
  const dict = sectionLabels[section];
  if (!dict) return section;
  return dict[language] ?? section;
}

const ForumPage: React.FC = () => {
  const { language } = useLanguage();
  const { member } = useMember();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [postsMeta, setPostsMeta] = useState<Record<string, PostsMeta>>({});
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [section, setSection] = useState<keyof typeof sectionLabels>("general");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загрузка тем
  useEffect(() => {
    const topicsRef = query(ref(db, "forum/topics"), orderByChild("createdAt"));

    const unsubscribe = onValue(topicsRef, (snapshot) => {
      const value = snapshot.val() || {};
      const list: Topic[] = Object.entries(value).map(([id, raw]) => {
        const t = raw as any;
          return {
            id,
            title: t.title ?? "",
            content: t.content ?? "",
            section: t.section ?? "general",
            createdAt: t.createdAt ?? 0,
            authorNickname: t.authorNickname ?? null,
            lang: (t.lang as Language) ?? undefined,
          };
      });

      setTopics(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Метаданные по ответам
  useEffect(() => {
    const postsRef = ref(db, "forum/posts");

    const unsubscribe = onValue(postsRef, (snapshot) => {
      const value = snapshot.val() || {};
      const meta: Record<string, PostsMeta> = {};

      Object.entries(value).forEach(([topicId, postsRaw]) => {
        const postsForTopic = postsRaw as any;
        let count = 0;
        let last = 0;

        Object.values(postsForTopic).forEach((p: any) => {
          count += 1;
          const ts = p.createdAt || 0;
          if (ts > last) last = ts;
        });

        meta[topicId] = {
          repliesCount: count,
          lastReplyAt: last || null,
        };
      });

      setPostsMeta(meta);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const topicsRef = ref(db, "forum/topics");
      const newRef = await push(topicsRef, {
        title: title.trim(),
        content: content.trim(),
        section,
        createdAt: Date.now(),
        createdAtServer: serverTimestamp(),
        authorNickname: member.nickname ?? null,
      });

      const topicId = newRef.key;
      setTitle("");
      setContent("");

      if (topicId) {
        window.location.href = `/forum/${topicId}`;
      }
    } catch (e) {
      console.error(e);
      setError(labels.error[language]);
    } finally {
      setSubmitting(false);
    }
  };

  const t = (key: keyof typeof labels) => labels[key][language];

  const langCode =
    language === "ru"
      ? "ru-RU"
      : language === "de"
      ? "de-DE"
      : language === "es"
      ? "es-ES"
      : "en-US";

  const orderedTopics = [...topics].sort((a, b) => {
    const aMeta = postsMeta[a.id];
    const bMeta = postsMeta[b.id];

    const aLast = (aMeta?.lastReplyAt || a.createdAt || 0) as number;
    const bLast = (bMeta?.lastReplyAt || b.createdAt || 0) as number;

    return bLast - aLast;
  });

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Шапка */}
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-zinc-900">
              {t("title")}
            </h1>
            <p className="text-sm text-zinc-600 max-w-lg">
              {labels.intro[language]}
            </p>
          </div>

          <LanguageSwitcher />
        </header>

        <section className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
          {/* Список тем */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
              {t("topicsList")}
            </h2>

            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-900/5 p-4 space-y-3">
              {loading && <p className="text-xs text-zinc-500">…</p>}

              {!loading && orderedTopics.length === 0 && (
                <p className="text-sm text-zinc-500">{t("noTopics")}</p>
              )}

              {orderedTopics.map((topic) => {
                const meta = postsMeta[topic.id];
                const replies = meta?.repliesCount ?? 0;
                const lastActivity =
                  meta?.lastReplyAt || topic.createdAt || null;

                return (
                  <a
                    key={topic.id}
                    href={`/forum/${topic.id}`}
                    className="block rounded-xl border border-zinc-200 px-3 py-2.5 hover:border-zinc-400 hover:bg-zinc-50 transition"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <h3 className="text-sm font-semibold text-zinc-900">
                        {topic.title}
                      </h3>
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                        {getSectionLabel(topic.section, language)}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-600 line-clamp-2">
                      {topic.content}
                    </p>

                    <div className="mt-1 text-[10px] text-zinc-400 flex items-center justify-between">
                      <span>
                        {topic.authorNickname
                          ? `@${topic.authorNickname}`
                          : "anon"}
                      </span>

                      <span className="inline-flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <span>💬</span>
                          <span>{replies}</span>
                        </span>

                        {lastActivity && (
                          <span>
                            {new Date(lastActivity).toLocaleString(langCode)}
                          </span>
                        )}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Форма новой темы */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-900/5 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-700">
              {t("newTopicTitle")}
            </h2>
            <p className="text-xs text-zinc-500">
              {labels.intro[language]}
            </p>

            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700">
                  {t("topicTitleLabel")}
                </label>
                <input
                  className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700">
                  {t("sectionLabel")}
                </label>
                <select
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
                  value={section}
                  onChange={(e) =>
                    setSection(e.target.value as keyof typeof sectionLabels)
                  }
                >
                  {Object.keys(sectionLabels).map((secKey) => (
                    <option key={secKey} value={secKey}>
                      {getSectionLabel(secKey, language)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700">
                  {t("messageLabel")}
                </label>
                <textarea
                  className="w-full min-h-[80px] rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-300 resize-y"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={2000}
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !title.trim() || !content.trim()}
                  className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    submitting || !title.trim() || !content.trim()
                      ? "bg-zinc-200 text-zinc-500 cursor-not-allowed"
                      : "bg-zinc-900 text-white hover:bg-zinc-800"
                  }`}
                >
                  {submitting ? "…" : t("submit")}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
};

export default ForumPage;
