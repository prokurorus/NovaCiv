import React, { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import {
  onValue,
  push,
  ref,
  serverTimestamp,
  query,
  orderByChild,
} from "firebase/database";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import { useMember } from "../hooks/useMember";

type Topic = {
  id: string;
  title: string;
  content: string;
  section: string;
  createdAt?: number;
  authorNickname?: string | null;
};

type Post = {
  id: string;
  content: string;
  createdAt?: number;
  authorNickname?: string | null;
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
};

const labels = {
  backToForum: {
    ru: "← Ко всем темам",
    en: "← Back to topics",
    de: "← Zur Themenliste",
    es: "← Volver a los temas",
  },
  replies: {
    ru: "Ответы",
    en: "Replies",
    de: "Antworten",
    es: "Respuestas",
  },
  newReply: {
    ru: "Новый ответ",
    en: "New reply",
    de: "Neue Antwort",
    es: "Nueva respuesta",
  },
  messageLabel: {
    ru: "Сообщение",
    en: "Message",
    de: "Nachricht",
    es: "Mensaje",
  },
  submit: {
    ru: "Отправить",
    en: "Send",
    de: "Senden",
    es: "Enviar",
  },
  error: {
    ru: "Не удалось сохранить ответ. Попробуй ещё раз.",
    en: "Failed to save the reply. Please try again.",
    de: "Antwort konnte nicht gespeichert werden. Versuch es noch einmal.",
    es: "No se pudo guardar la respuesta. Inténtalo de nuevo.",
  },
};

function getSectionLabel(section: string, language: Language): string {
  const dict = sectionLabels[section];
  if (!dict) return section;
  return dict[language] ?? section;
}

function getTopicIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/");
  const last = parts[parts.length - 1] || parts[parts.length - 2];
  return last || null;
}

const TopicPage: React.FC = () => {
  const { language } = useLanguage();
  const { member } = useMember();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [loadingTopic, setLoadingTopic] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topicId = getTopicIdFromLocation();

  useEffect(() => {
    if (!topicId) return;

    const topicRef = ref(db, `forum/topics/${topicId}`);
    const unsubscribe = onValue(topicRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setTopic(null);
      } else {
        setTopic({
          id: topicId,
          title: data.title ?? "",
          content: data.content ?? "",
          section: data.section ?? "general",
          createdAt: data.createdAt ?? 0,
          authorNickname: data.authorNickname ?? null,
        });
      }
      setLoadingTopic(false);
    });

    return () => unsubscribe();
  }, [topicId]);

  useEffect(() => {
    if (!topicId) return;
    const postsRef = query(
      ref(db, `forum/posts/${topicId}`),
      orderByChild("createdAt")
    );

    const unsubscribe = onValue(postsRef, (snapshot) => {
      const value = snapshot.val() || {};
      const list: Post[] = Object.entries(value).map(([id, raw]) => {
        const p = raw as any;
        return {
          id,
          content: p.content ?? "",
          createdAt: p.createdAt ?? 0,
          authorNickname: p.authorNickname ?? null,
        };
      });

      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setPosts(list);
      setLoadingPosts(false);
    });

    return () => unsubscribe();
  }, [topicId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicId || !content.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const postsRef = ref(db, `forum/posts/${topicId}`);
      await push(postsRef, {
        content: content.trim(),
        createdAt: Date.now(),
        createdAtServer: serverTimestamp(),
        authorNickname: member.nickname ?? null,
      });
      setContent("");
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-zinc-50 text-zinc-900">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <button
            onClick={() => (window.location.href = "/forum")}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 transition"
          >
            {t("backToForum")}
          </button>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-zinc-400">
              NovaCiv
            </div>
            <div className="text-sm font-semibold text-zinc-800">
              {topic ? topic.title : "…"}
            </div>
          </div>
        </header>

        {loadingTopic && (
          <p className="text-sm text-zinc-500">…</p>
        )}

        {!loadingTopic && !topic && (
          <p className="text-sm text-red-500">
            {language === "ru"
              ? "Тема не найдена."
              : language === "de"
              ? "Thema nicht gefunden."
              : language === "es"
              ? "Tema no encontrado."
              : "Topic not found."}
          </p>
        )}

        {topic && (
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-900/5 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-zinc-900">
                {topic.title}
              </h1>
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                {getSectionLabel(topic.section, language)}
              </span>
            </div>
            <p className="text-sm text-zinc-700 whitespace-pre-wrap">
              {topic.content}
            </p>
            <div className="mt-1 text-[10px] text-zinc-400 flex items-center justify-between">
              <span>
                {topic.authorNickname
                  ? `@${topic.authorNickname}`
                  : "anon"}
              </span>
              {topic.createdAt && (
                <span>
                  {new Date(topic.createdAt).toLocaleString(langCode)}
                </span>
              )}
            </div>
          </section>
        )}

        {/* Ответы */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-700">
            {t("replies")}
          </h2>
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-900/5 p-4 space-y-3 max-h-[260px] overflow-y-auto">
            {loadingPosts && (
              <p className="text-xs text-zinc-500">…</p>
            )}
            {!loadingPosts && posts.length === 0 && (
              <p className="text-sm text-zinc-500">
                {language === "ru"
                  ? "Ответов пока нет."
                  : language === "de"
                  ? "Noch keine Antworten."
                  : language === "es"
                  ? "Todavía no hay respuestas."
                  : "No replies yet."}
              </p>
            )}
            {posts.map((post) => (
              <div
                key={post.id}
                className="rounded-xl border border-zinc-200 px-3 py-2"
              >
                <p className="text-sm text-zinc-800 whitespace-pre-wrap">
                  {post.content}
                </p>
                <div className="mt-1 text-[10px] text-zinc-400 flex items-center justify-between">
                  <span>
                    {post.authorNickname
                      ? `@${post.authorNickname}`
                      : "anon"}
                  </span>
                  {post.createdAt && (
                    <span>
                      {new Date(post.createdAt).toLocaleString(langCode)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Форма нового ответа */}
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-900/5 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-700">
            {t("newReply")}
          </h2>
          <form className="space-y-3" onSubmit={handleSubmit}>
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

            {error && (
              <p className="text-xs text-red-500">
                {error}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  submitting || !content.trim()
                    ? "bg-zinc-200 text-zinc-500 cursor-not-allowed"
                    : "bg-zinc-900 text-white hover:bg-zinc-800"
                }`}
              >
                {submitting ? "…" : t("submit")}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
};

export default TopicPage;
