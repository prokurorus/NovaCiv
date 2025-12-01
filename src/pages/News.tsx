import React, { useEffect, useState } from "react";
import { onValue, orderByChild, query, ref } from "firebase/database";
import { db } from "../lib/firebase";
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
};

type FilterType = "all" | "domovoy" | "world" | "community";
type LangFilter = "all" | "ru" | "en" | "de" | "es";

const sectionTitleByLang: Record<Language, string> = {
  ru: "Лента движения NovaCiv",
  en: "NovaCiv movement feed",
  de: "NovaCiv Bewegungs-Feed",
  es: "Flujo de movimiento de NovaCiv",
};

const sectionDescriptionByLang: Record<Language, string> = {
  ru: "Здесь мы собираем посты, мысли, новости и фрагменты дискуссий вокруг NovaCiv.",
  en: "Here we collect posts, thoughts, news and discussion fragments around NovaCiv.",
  de: "Hier sammeln wir Beiträge, Gedanken, Nachrichten und Diskussionsfragmente rund um NovaCiv.",
  es: "Aquí recopilamos publicaciones, ideas, noticias y fragmentos de debate en torno a NovaCiv.",
};

const subDescriptionByLang: Record<Language, string> = {
  ru: "В этой ленте живут три потока: мировые новости, голос Домового и записи сообщества. Всё, что рождает движение, оседает здесь.",
  en: "Three streams live in this feed: world news, the Domovoy voice and community posts. Everything that creates movement settles here.",
  de: "In diesem Feed leben drei Ströme: Weltnachrichten, die Stimme des Domovoy und Beiträge der Community. Alles, was Bewegung erzeugt, bleibt hier.",
  es: "En este feed viven tres flujos: noticias mundiales, la voz del Domovoy y publicaciones de la comunidad. Todo lo que genera movimiento se asienta aquí.",
};

const filterLabels: Record<Language, Record<FilterType, string>> = {
  ru: {
    all: "Все",
    domovoy: "Домовой",
    world: "Мировые новости",
    community: "Сообщество",
  },
  en: {
    all: "All",
    domovoy: "Domovoy",
    world: "World news",
    community: "Community",
  },
  de: {
    all: "Alle",
    domovoy: "Domovoy",
    world: "Weltnachrichten",
    community: "Community",
  },
  es: {
    all: "Todos",
    domovoy: "Domovoy",
    world: "Noticias mundiales",
    community: "Comunidad",
  },
};

const langFilterLabels: Record<Language, Record<LangFilter, string>> = {
  ru: { all: "Все языки", ru: "RU", en: "EN", de: "DE", es: "ES" },
  en: { all: "All languages", ru: "RU", en: "EN", de: "DE", es: "ES" },
  de: { all: "Alle Sprachen", ru: "RU", en: "EN", de: "DE", es: "ES" },
  es: { all: "Todos los idiomas", ru: "RU", en: "EN", de: "DE", es: "ES" },
};

const emptyTextByLang: Record<Language, string> = {
  ru: "В ленте пока нет записей. Но Домовой уже просыпается.",
  en: "The feed is empty for now. But Domovoy is already waking up.",
  de: "Der Feed ist noch leer. Aber Domovoy wacht bereits auf.",
  es: "El feed aún está vacío. Pero Domovoy ya está despertando.",
};

const discussLabelByLang: Record<Language, string> = {
  ru: "Читать полностью",
  en: "Read full post",
  de: "Vollständigen Beitrag lesen",
  es: "Leer la publicación completa",
};


function formatDate(value: number, language: Language): string {
  const date = new Date(value || 0);
  const locale =
    language === "ru"
      ? "ru-RU"
      : language === "de"
      ? "de-DE"
      : language === "es"
      ? "es-ES"
      : "en-US";

  return date.toLocaleString(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getSourceLabel(topic: ForumTopic, language: Language): string {
  const src = (topic.sourceId || "").toLowerCase();

  if (src === "domovoy" || (topic.postKind || "").startsWith("domovoy:")) {
    return language === "ru"
      ? "Голос Домового"
      : language === "de"
      ? "Stimme des Domovoy"
      : language === "es"
      ? "Voz de Domovoy"
      : "Voice of Domovoy";
  }

  if (src === "world_news" || src === "rss") {
    return language === "ru"
      ? "Мировые новости"
      : language === "de"
      ? "Weltnachrichten"
      : language === "es"
      ? "Noticias mundiales"
      : "World news";
  }

  // По умолчанию считаем, что это сообщество
  return language === "ru"
    ? "Сообщество"
    : language === "de"
    ? "Community"
    : language === "es"
    ? "Comunidad"
    : "Community";
}

function isCharterSeries(topic: ForumTopic): boolean {
  const kind = (topic.postKind || "").toLowerCase();
  return kind === "domovoy:charter_series";
}

function getCharterBadgeLabel(language: Language): string {
  return language === "ru"
    ? "Серия Хартии"
    : language === "de"
    ? "Charta-Serie"
    : language === "es"
    ? "Serie de la Carta"
    : "Charter series";
}

const NewsPage: React.FC = () => {
  const { language } = useLanguage();
  const [items, setItems] = useState<ForumTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [langFilter, setLangFilter] = useState<LangFilter>("all");

  useEffect(() => {
    const topicsRef = query(ref(db, "forum/topics"), orderByChild("createdAt"));

    const unsub = onValue(
      topicsRef,
      (snapshot) => {
        const raw = snapshot.val();
        if (!raw || typeof raw !== "object") {
          setItems([]);
          setLoading(false);
          return;
        }

        const list: ForumTopic[] = Object.entries(raw).map(([id, value]) => {
          const v = value as any;
          return {
            id,
            title: v.title || "",
            content: v.content || "",
            section: v.section || "",
            createdAt: v.createdAt || 0,
            lang: v.lang || "ru",
            sourceId: v.sourceId || "",
            postKind: v.postKind || "",
          };
        });

        const newsOnly = list.filter((t) => t.section === "news");
        newsOnly.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        setItems(newsOnly);
        setLoading(false);
      },
      (error) => {
        console.error("[NewsPage] onValue error:", error);
        setItems([]);
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  const filteredItems = items.filter((item) => {
    // Фильтр по источнику
    if (filter === "domovoy") {
      const src = (item.sourceId || "").toLowerCase();
      if (
        src !== "domovoy" &&
        !(item.postKind || "").toLowerCase().startsWith("domovoy:")
      ) {
        return false;
      }
    } else if (filter === "world") {
      const src = (item.sourceId || "").toLowerCase();
      if (src !== "world_news" && src !== "rss") return false;
    } else if (filter === "community") {
      const src = (item.sourceId || "").toLowerCase();
      if (src && src !== "community") return false;
    }

    // Фильтр по языку
    if (langFilter !== "all") {
      const itemLang = (item.lang || "ru") as LangFilter;
      if (itemLang !== langFilter) return false;
    }

    return true;
  });

  const preview = (text: string, max: number = 380) => {
    const normalized = (text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= max) return normalized;
    const cut = normalized.slice(0, max);
    const lastDot = cut.lastIndexOf(".");
    if (lastDot > 60) {
      return cut.slice(0, lastDot + 1);
    }
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 60) {
      return cut.slice(0, lastSpace) + "…";
    }
    return cut + "…";
  };

  const filters: FilterType[] = ["all", "domovoy", "world", "community"];
  const langFilters: LangFilter[] = ["all", "ru", "en", "de", "es"];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-12 pt-6 lg:px-0 lg:pt-10">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            NovaCiv
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
            {sectionTitleByLang[language]}
          </h1>
          <p className="max-w-2xl text-sm text-zinc-600">
            {sectionDescriptionByLang[language]}
          </p>
          <p className="max-w-2xl text-xs text-zinc-500">
            {subDescriptionByLang[language]}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <LanguageSwitcher />
        </div>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs md:text-sm">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`inline-flex items-center rounded-full border px-3 py-1 ${
                filter === f
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {filterLabels[language][f]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {langFilters.map((lf) => (
            <button
              key={lf}
              type="button"
              onClick={() => setLangFilter(lf)}
              className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] md:text-xs ${
                langFilter === lf
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {langFilterLabels[language][lf]}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {loading && (
          <p className="text-sm text-zinc-500">
            {language === "ru"
              ? "Загружаем записи…"
              : language === "de"
              ? "Beiträge werden geladen…"
              : language === "es"
              ? "Cargando entradas…"
              : "Loading posts…"}
          </p>
        )}

        {!loading && !filteredItems.length && (
          <p className="text-sm text-zinc-500 whitespace-pre-wrap">
            {emptyTextByLang[language]}
          </p>
        )}

        {filteredItems.length > 0 && (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const charter = isCharterSeries(item);
              const srcLabel = getSourceLabel(item, language);

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm shadow-zinc-900/5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                    <span>{formatDate(item.createdAt, language)}</span>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px]">
                        {srcLabel}
                      </span>
                      {charter && (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/70 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                          {getCharterBadgeLabel(language)}
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-500">
                        {(item.lang || "ru").toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h2 className="mt-2 text-sm font-semibold text-zinc-900">
                    {item.title || "NovaCiv"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-700 whitespace-pre-wrap">
                    {preview(item.content)}
                  </p>

                  {/* Кнопка перехода к обсуждению темы на форуме */}
                  <div className="mt-3 flex justify-end">
                    <a
                      href={`/forum/${item.id}`}
                      className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 transition"
                    >
                      {discussLabelByLang[language]}
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};

export default NewsPage;
