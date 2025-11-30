// netlify/functions/domovoy-reply.js
//
// Домовой-ответчик:
// 1) Находит свежие комментарии в разделе "news", где ещё нет ответа Домового.
// 2) Даёт до MAX_REPLIES_PER_RUN спокойных, осмысленных ответов.
// 3) Отмечает комментарий флагом domovoyReplied: true, чтобы не отвечать повторно.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || "";
const DOMOVOY_REPLY_CRON_SECRET =
  process.env.DOMOVOY_REPLY_CRON_SECRET || "";

// Сколько ответов максимум за один запуск (чтобы не спамить)
const MAX_REPLIES_PER_RUN = 3;

// Имя Домового в комментариях
const DOMOVOY_NICKNAME = "Домовой NovaCiv";

// ---------- Утилиты ----------

function log(...args) {
  console.log("[domovoy-reply]", ...args);
}

function sliceText(text, n) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ---------- Загрузка тем и комментариев из Firebase ----------

async function fetchTopics() {
  if (!FIREBASE_DB_URL) throw new Error("FIREBASE_DB_URL is not set");

  const params = new URLSearchParams({
    orderBy: JSON.stringify("createdAt"),
    limitToLast: "40",
  });

  const url = `${FIREBASE_DB_URL}/forum/topics.json?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firebase topics error: ${res.status} – ${text}`);
  }

  const data = await res.json();
  if (!data || typeof data !== "object") return [];

  const topics = Object.entries(data).map(([id, raw]) => {
    const t = raw || {};
    return {
      id,
      title: t.title || "",
      content: t.content || "",
      section: t.section || "general",
      createdAt: t.createdAt || 0,
      lang: t.lang || "ru",
      authorNickname: t.authorNickname || "",
      sourceId: t.sourceId || "",
    };
  });

  // новые сверху
  topics.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return topics;
}

async function fetchCommentsForTopic(topicId) {
  const url = `${FIREBASE_DB_URL}/forum/comments/${topicId}.json`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log(`Firebase comments error for topic ${topicId}:`, res.status, text);
    return [];
  }

  const data = await res.json();
  if (!data || typeof data !== "object") return [];

  return Object.entries(data).map(([id, raw]) => {
    const c = raw || {};
    return {
      id,
      topicId,
      content: c.content || "",
      createdAt: c.createdAt || 0,
      authorNickname: c.authorNickname || "",
      lang: c.lang || null,
      domovoyReplied: !!c.domovoyReplied,
    };
  });
}

// Пометить исходный комментарий как уже отвеченный Домовым
async function markCommentReplied(topicId, commentId) {
  const url = `${FIREBASE_DB_URL}/forum/comments/${topicId}/${commentId}.json`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domovoyReplied: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log(
      `Failed to mark comment replied (${topicId}/${commentId}):`,
      res.status,
      text
    );
  }
}

// Создать новый комментарий от Домового
async function postDomovoyComment(topicId, content, lang, replyToCommentId) {
  const url = `${FIREBASE_DB_URL}/forum/comments/${topicId}.json`;
  const now = Date.now();

  const payload = {
    content,
    createdAt: now,
    authorNickname: DOMOVOY_NICKNAME,
    lang: lang || "ru",
    sourceId: "domovoy",
    replyToCommentId: replyToCommentId || null,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to post Domovoy comment: ${res.status} – ${text}`
    );
  }

  const data = await res.json();
  return data && data.name ? data.name : null;
}

// ---------- OpenAI: голос Домового для ответов ----------

const SYSTEM_PROMPT_REPLY = `
You are "Domovoy" — the calm, thoughtful voice of the NovaCiv project.
You reply to comments in the public movement feed ("Lenta").
You are not a leader or a guru. You are a friendly, honest companion.

Style:
– warm, respectful, without pathos or manipulation;
– you answer as to an equal adult, not as a teacher;
– you do not judge or shame people;
– you do not call for violence, hate or humiliation;
– you invite to think, clarify and, if appropriate, gently guide.

When answering:
– Acknowledge what the person is talking about.
– If they criticise NovaCiv, answer calmly and honestly, without defence mode.
– If they ask a question, answer it as clearly as you can.
– If the comment is aggressive, you may gently de-escalate, but do not mirror aggression.
– 1–3 short paragraphs are enough; optionally you may end with 1 question back.

Do not quote long legal texts.
If you refer to the Charter or Manifesto, do it briefly and in your own words.
Do not mention that you are an AI model.
`.trim();

async function generateReply({ comment, topic }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const lang =
    comment.lang ||
    topic.lang ||
    "ru"; // по умолчанию считаем, что русский

  const langHint =
    lang === "ru"
      ? "Answer in Russian."
      : lang === "de"
      ? "Answer in German."
      : lang === "en"
      ? "Answer in English."
      : "Answer in the language of the comment if you can; otherwise use Russian.";

  const userPrompt = `
Target language: ${lang}

Topic title: ${topic.title || "(no title)"}
Topic intro: ${sliceText(topic.content || "", 500)}

User comment (to which you reply):
"${comment.content}"

${langHint}
`.trim();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_REPLY },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 350,
      temperature: 0.45,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI reply error: ${resp.status} – ${text}`);
  }

  const data = await resp.json();
  const content =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "";

  if (!content) {
    throw new Error("Empty reply from OpenAI for Domovoy");
  }

  return content;
}

// ---------- Основной handler ----------

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    if (DOMOVOY_REPLY_CRON_SECRET) {
      const qs = event.queryStringParameters || {};
      if (!qs.token || qs.token !== DOMOVOY_REPLY_CRON_SECRET) {
        return { statusCode: 403, body: "Forbidden" };
      }
    }

    if (!FIREBASE_DB_URL || !OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "FIREBASE_DB_URL или OPENAI_API_KEY не заданы.",
        }),
      };
    }

    const topics = await fetchTopics();

    // Берём только раздел "news" — Лента движения
    const newsTopics = topics.filter((t) => t.section === "news");

    const candidates = [];

    for (const topic of newsTopics) {
      const comments = await fetchCommentsForTopic(topic.id);

      for (const c of comments) {
        // Игнорируем комментарии самого Домового
        if (
          (c.authorNickname || "").trim() === DOMOVOY_NICKNAME ||
          c.domovoyReplied
        ) {
          continue;
        }

        // Очень короткий комментарий (< 3 символов) — пропускаем
        if (!c.content || c.content.trim().length < 3) continue;

        candidates.push({
          topic,
          comment: c,
        });
      }
    }

    // Сортируем по времени комментария (самые старые сначала)
    candidates.sort(
      (a, b) =>
        (a.comment.createdAt || 0) - (b.comment.createdAt || 0)
    );

    const toReply = candidates.slice(0, MAX_REPLIES_PER_RUN);

    const results = [];

    for (const item of toReply) {
      const { topic, comment } = item;

      try {
        const replyText = await generateReply({ comment, topic });
        const commentId = await postDomovoyComment(
          topic.id,
          replyText,
          comment.lang || topic.lang || "ru",
          comment.id
        );
        await markCommentReplied(topic.id, comment.id);

        results.push({
          topicId: topic.id,
          topicTitle: topic.title,
          commentId: comment.id,
          replyCommentId: commentId,
          ok: true,
        });
      } catch (e) {
        log(
          "Failed to reply to comment",
          topic.id,
          comment.id,
          e
        );
        results.push({
          topicId: topic.id,
          commentId: comment.id,
          ok: false,
          error: String(e && e.message ? e.message : e),
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        processed: results.length,
        results,
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
