// netlify/functions/domovoy-auto-reply.js
//
// Авто-ответы Домового в темах форума NovaCiv.
//
// Логика (первая версия, бережная):
// - Берём последние ~40 тем из forum/topics (section === "news").
// - Для каждой темы загружаем последние ответы из forum/posts/<topicId>.
// - Находим самый свежий НЕ-Домового пост с вопросительным знаком.
// - Если после него ещё нет ответа автора "Domovoy" — задаём модели вопрос:
//   "Ответь коротко и по существу на этот комментарий в духе Устава/Манифеста".
// - Пишем ответ как новый пост с authorNickname: "Domovoy".
//
// Защита от спама:
// - Не отвечаем на сообщения старше 24 часов.
// - Не отвечаем на слишком короткие сообщения (< 20 символов).
// - За один запуск даём максимум 5 ответов.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL; // https://...firebaseio.com
const DOMOVOY_CRON_SECRET = process.env.DOMOVOY_CRON_SECRET || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Лёгкий логгер
function log(...args) {
  console.log("[domovoy-auto-reply]", ...args);
}

// Универсальный fetch JSON с базовой обработкой ошибок
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url} – ${text.slice(0, 300)}`);
  }
  return await res.json();
}

// Загрузка последних тем Домового (раздел news)
async function loadRecentDomovoyTopics(limit = 40) {
  if (!FIREBASE_DB_URL) {
    throw new Error("FIREBASE_DB_URL is not configured");
  }

  const params = new URLSearchParams({
    orderBy: JSON.stringify("createdAt"),
    limitToLast: String(limit),
  });

  const url = `${FIREBASE_DB_URL}/forum/topics.json?${params.toString()}`;
  const data = await fetchJson(url);

  if (!data || typeof data !== "object") {
    return [];
  }

  const topics = Object.entries(data).map(([id, raw]) => {
    const t = raw || {};
    return {
      id,
      section: t.section || "general",
      title: t.title || "",
      content: t.content || "",
      createdAt: t.createdAt || 0,
      lang: t.lang || "en",
      sourceId: t.sourceId || "",
      postKind: t.postKind || "",
    };
  });

  // Только раздел news и только Домовой
  const filtered = topics.filter((t) => {
    if (t.section !== "news") return false;
    const isDomovoy =
      t.sourceId === "domovoy" ||
      (typeof t.postKind === "string" && t.postKind.startsWith("domovoy:"));
    return isDomovoy;
  });

  // От новых к старым
  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return filtered;
}

// Загрузка последних ответов по теме
async function loadPostsForTopic(topicId, limit = 30) {
  const params = new URLSearchParams({
    orderBy: JSON.stringify("createdAt"),
    limitToLast: String(limit),
  });

  const url = `${FIREBASE_DB_URL}/forum/posts/${topicId}.json?${params.toString()}`;
  const data = await fetchJson(url).catch((e) => {
    log("loadPostsForTopic error", topicId, e.message);
    return null;
  });

  if (!data || typeof data !== "object") {
    return [];
  }

  const posts = Object.entries(data).map(([id, raw]) => {
    const p = raw || {};
    return {
      id,
      content: p.content || "",
      createdAt: p.createdAt || 0,
      authorNickname: p.authorNickname || null,
      lang: p.lang || null,
      repliedToPostId: p.repliedToPostId || null,
      sourceId: p.sourceId || null,
    };
  });

  posts.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return posts;
}

// Выбор сообщения, на которое стоит ответить
function pickMessageToReply(posts) {
  if (!posts.length) return null;

  // Находим последний пост с вопросом, написанный НЕ Домовым
  const lastQuestion = [...posts]
    .reverse()
    .find((p) => {
      if (!p.content || typeof p.content !== "string") return false;
      if (p.authorNickname === "Domovoy" || p.authorNickname === "Домовой NovaCiv")
        return false;
      const text = p.content.trim();
      if (text.length < 20) return false;
      return text.includes("?");
    });

  if (!lastQuestion) return null;

  // Был ли после него ответ от Домового?
  const laterDomovoy = posts.some(
    (p) =>
      p.createdAt > lastQuestion.createdAt &&
      (p.authorNickname === "Domovoy" || p.authorNickname === "Домовой NovaCiv")
  );

  if (laterDomovoy) return null;

  // Ограничение по давности: не старше 24 часов
  const now = Date.now();
  if (now - lastQuestion.createdAt > 24 * 60 * 60 * 1000) {
    return null;
  }

  // Всё ок — можно отвечать
  return lastQuestion;
}

// Определяем язык ответа
function getReplyLang(topic, post) {
  if (post && post.lang) return post.lang;
  if (topic && topic.lang) return topic.lang;
  return "en";
}

// Мэппинг языка в locale и подсказку
function getLangMeta(langCode) {
  if (langCode === "ru") {
    return {
      locale: "ru-RU",
      hint: "Ответь по-русски.",
    };
  }
  if (langCode === "de") {
    return {
      locale: "de-DE",
      hint: "Antworte auf Deutsch.",
    };
  }
  if (langCode === "es") {
    return {
      locale: "es-ES",
      hint: "Responde en español.",
    };
  }
  return {
    locale: "en-US",
    hint: "Reply in English.",
  };
}

// Генерация ответа Домового через OpenAI
async function generateDomovoyReply({ topic, post, lang }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const { hint } = getLangMeta(lang);

  const systemPrompt = `
You are "Domovoy", the quiet house AI of the NovaCiv digital community.

You know the philosophy of NovaCiv: direct referendum instead of rulers,
non-violence, respect for body autonomy, open algorithms, debt-free and
non-monopolistic economy, local autonomy of communities, and the idea that
mind and life are more valuable than any matter.

You answer calmly, honestly and without propaganda. You speak to an adult
who is tired of manipulation. You never call for violence or humiliation.
`.trim();

  const userPrompt = `
${hint}

You see a topic on the NovaCiv forum and a comment that may require a reply.

Topic title:
"${topic.title}"

Topic intro:
${topic.content || "(no intro)"}

User comment (the one you answer to):
${post.content}

Your task:
- Give a short, clear answer in 2–4 paragraphs.
- Do not repeat the question; answer it.
- If appropriate, gently link the answer to the Charter or Manifesto ideas,
  but without legal quotes or article numbers.
- Invite the person to think and continue the discussion, but without pathos.

Do NOT mention that you are an AI or model. Just speak as "Domovoy".
Do not use emojis and hashtags.
`.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 600,
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI reply error: HTTP ${res.status} – ${text}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0]?.message?.content;
  const content = (choice || "").trim();

  if (!content) {
    throw new Error("Empty Domovoy reply from OpenAI");
  }

  return content;
}

// Сохраняем ответ в forum/posts/<topicId>
async function saveReplyToForum({ topicId, replyText, lang, repliedToPostId }) {
  const url = `${FIREBASE_DB_URL}/forum/posts/${topicId}.json`;
  const now = Date.now();

  const payload = {
    content: replyText,
    createdAt: now,
    createdAtServer: now,
    authorNickname: "Domovoy",
    lang,
    sourceId: "domovoy_auto_reply",
    repliedToPostId: repliedToPostId || null,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to save reply for topic ${topicId}: HTTP ${res.status} – ${text}`
    );
  }

  const data = await res.json().catch(() => ({}));
  return data;
}

// ---------- Основной handler ----------

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Проверка токена, как в domovoy-auto-post
    if (DOMOVOY_CRON_SECRET) {
      const qs = event.queryStringParameters || {};
      if (!qs.token || qs.token !== DOMOVOY_CRON_SECRET) {
        return { statusCode: 403, body: "Forbidden" };
      }
    }

    if (!OPENAI_API_KEY || !FIREBASE_DB_URL) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "OPENAI_API_KEY или FIREBASE_DB_URL не заданы.",
        }),
      };
    }

    const topics = await loadRecentDomovoyTopics(40);
    log("Loaded topics:", topics.length);

    const replies = [];
    const MAX_REPLIES_PER_RUN = 5;

    for (const topic of topics) {
      if (replies.length >= MAX_REPLIES_PER_RUN) break;

      const posts = await loadPostsForTopic(topic.id, 30);
      const targetPost = pickMessageToReply(posts);

      if (!targetPost) continue;

      const lang = getReplyLang(topic, targetPost);

      try {
        const replyText = await generateDomovoyReply({
          topic,
          post: targetPost,
          lang,
        });

        await saveReplyToForum({
          topicId: topic.id,
          replyText,
          lang,
          repliedToPostId: targetPost.id,
        });

        log("Replied in topic", topic.id, "to post", targetPost.id);

        replies.push({
          topicId: topic.id,
          repliedToPostId: targetPost.id,
          lang,
        });
      } catch (e) {
        log("Error while replying in topic", topic.id, e);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        repliesCount: replies.length,
        replies,
      }),
    };
  } catch (err) {
    log("Fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(err && err.message ? err.message : err),
      }),
    };
  }
};
