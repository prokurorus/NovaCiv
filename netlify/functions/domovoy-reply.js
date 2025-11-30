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

function log(...args) {
  console.log("[domovoy-reply]", ...args);
}

async function fetchNewsTopics() {
  if (!FIREBASE_DB_URL) throw new Error("FIREBASE_DB_URL is not configured");

  const url = `${FIREBASE_DB_URL}/forum/topics.json?orderBy=${encodeURIComponent(
    '"createdAt"',
  )}&limitToLast=40`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch topics: ${res.status} – ${text.slice(0, 200)}`,
    );
  }

  const data = await res.json();
  if (!data || typeof data !== "object") return [];

  const topics = Object.entries(data).map(([id, raw]) => {
    const t = raw || {};
    return {
      id,
      title: t.title || "",
      content: t.content || "",
      section: t.section || "",
      createdAt: t.createdAt || 0,
      lang: t.lang || null,
    };
  });

  return topics
    .filter((t) => t.section === "news")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function fetchCommentsForTopic(topicId) {
  const url = `${FIREBASE_DB_URL}/forum/comments/${topicId}.json`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch comments for topic ${topicId}: ${res.status} – ${text.slice(
        0,
        200,
      )}`,
    );
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
      sourceId: c.sourceId || "",
      isSystem: !!c.isSystem,
    };
  });
}

async function markCommentReplied(topicId, commentId) {
  const url = `${FIREBASE_DB_URL}/forum/comments/${topicId}/${commentId}.json`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domovoyReplied: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to mark comment replied: ${res.status} – ${text.slice(0, 200)}`,
    );
  }
}

async function postDomovoyComment(topicId, text, lang, replyToId) {
  const url = `${FIREBASE_DB_URL}/forum/comments/${topicId}.json`;
  const now = Date.now();

  const payload = {
    content: text,
    createdAt: now,
    createdAtServer: new Date().toISOString(),
    lang: lang || "ru",
    authorNickname: DOMOVOY_NICKNAME,
    sourceId: "domovoy_reply",
    replyToId: replyToId || null,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to post Domovoy comment: ${res.status} – ${text}`,
    );
  }

  const data = await res.json();
  return data && data.name ? data.name : null;
}

const SYSTEM_PROMPT = `
You are "Domovoy" — the same character as in the main NovaCiv assistant:
calm, thoughtful, honest, without aggression or propaganda.

You answer to comments in the NovaCiv "movement feed" and forum.
Your goal is:
– to support discussion,
– to clarify ideas of the NovaCiv Charter and Manifesto,
– to encourage reflection and dialogue,
– NOT to dominate or lecture people.

General style:
– equal to the reader, no "mentor" tone;
– short and meaningful answers (1–3 short paragraphs);
– do not repeat the whole comment, refer to key ideas instead;
– if the comment is aggressive or confused, stay calm and non-violent;
– you can disagree gently, but never insult.

Constraints:
– no calls for violence or hatred;
– no political or religious propaganda;
– no medical or financial prescriptions;
– do not pretend to be a human, but also do not emphasize that you are an AI.

You will get:
– the original comment text,
– the topic title and snippet,
– language code (ru/en/de),
– sometimes short context.

Answer in the same language as the comment.
Do NOT include any Markdown formatting, only plain text.
Keep answers compact and respectful.
`.trim();

async function generateReply(comment, topic) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const lang =
    comment.lang || topic.lang || "ru";

  const userPrompt = `
Language: ${lang}

Topic title:
${topic.title}

Topic snippet:
${(topic.content || "").slice(0, 400)}

Comment:
${comment.content}

Task:
Write a short, calm reply as "Domovoy" in the same language.
1–3 short paragraphs, without Markdown.
Be respectful and honest.
`.trim();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 400,
      temperature: 0.4,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `OpenAI API error: ${resp.status} – ${text.slice(0, 200)}`,
    );
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
    throw new Error("Empty reply from OpenAI");
  }

  return content;
}

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

    if (!FIREBASE_DB_URL) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "FIREBASE_DB_URL is not configured",
        }),
      };
    }

    const topics = await fetchNewsTopics();

    const candidates = [];
    for (const topic of topics) {
      const comments = await fetchCommentsForTopic(topic.id);

      for (const c of comments) {
        // Игнорируем комментарии самого Домового и системные/ботские
        if (
          (c.authorNickname || "").trim() === DOMOVOY_NICKNAME ||
          c.domovoyReplied ||
          c.isSystem ||
          (c.sourceId && c.sourceId !== "community")
        ) {
          continue;
        }

        const text = (c.content || "").trim();
        // Очень короткий комментарий (< 5 символов) — пропускаем
        if (!text || text.length < 5) continue;

        candidates.push({
          topic,
          comment: c,
        });
      }
    }

    if (!candidates.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          message: "No suitable comments to reply.",
          replies: [],
        }),
      };
    }

    candidates.sort(
      (a, b) => (b.comment.createdAt || 0) - (a.comment.createdAt || 0),
    );

    const toReply = candidates.slice(0, MAX_REPLIES_PER_RUN);
    const results = [];

    for (const { topic, comment } of toReply) {
      try {
        const replyText = await generateReply(comment, topic);
        const commentId = await postDomovoyComment(
          topic.id,
          replyText,
          comment.lang || topic.lang || "ru",
          comment.id,
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
        log("Error replying to comment", {
          topicId: topic.id,
          commentId: comment.id,
          error: String(e && e.message ? e.message : e),
        });
        results.push({
          topicId: topic.id,
          topicTitle: topic.title,
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
        repliesCount: results.length,
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
