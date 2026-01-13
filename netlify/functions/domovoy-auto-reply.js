// netlify/functions/domovoy-auto-reply.js
//
// Авто-ответы Домового в темах форума NovaCiv.
// Работает поверх той же структуры, что и domovoy-reply:
//   forum/topics/{topicId}
//   forum/comments/{topicId}/{commentId}
//
// Логика (бережная):
// – берём последние ~40 тем раздела "news", созданных Домовым;
// – для каждой темы загружаем комментарии из forum/comments/<topicId>;
// – находим самый свежий НЕ-Домового комментарий с вопросительным знаком;
// – если после него ещё нет ответа Домового — просим модель дать короткий ответ;
// – создаём новый комментарий от Домового.
// Ограничения:
// – не отвечаем на комментарии старше 24 часов;
// – не отвечаем на очень короткие сообщения (< 20 символов);
// – максимум 5 ответов за один запуск.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const DOMOVOY_CRON_SECRET = process.env.DOMOVOY_CRON_SECRET || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const DOMOVOY_NAME_EN = "Domovoy";
const DOMOVOY_NAME_RU = "Домовой NovaCiv";

// Операторский пульт
const { writeHeartbeat, writeEvent, writeFirebaseError } = require("../lib/opsPulse");

// Безопасная санитизация ключей Firebase
function safeKey(value) {
  if (!value) return "unknown";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function log(...args) {
  console.log("[domovoy-auto-reply]", ...args);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url} – ${text.slice(0, 300)}`);
  }
  return await res.json();
}

// Загружаем последние темы, созданные Домовым, в разделе "news"
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

  if (!data || typeof data !== "object") return [];

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

  // Только раздел news и только темы, созданные Домовым
  const filtered = topics.filter((t) => {
    if (t.section !== "news") return false;
    const isDomovoy =
      t.sourceId === "domovoy" ||
      (typeof t.postKind === "string" && t.postKind.startsWith("domovoy:"));
    return isDomovoy;
  });

  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return filtered;
}

// Загружаем комментарии к теме из forum/comments/<topicId>
async function loadCommentsForTopic(topicId) {
  const safeTopicId = safeKey(topicId);
  const url = `${FIREBASE_DB_URL}/forum/comments/${safeTopicId}.json`;
  const data = await fetchJson(url).catch(async (e) => {
    await writeFirebaseError("domovoy-auto-reply", e, {
      path: `forum/comments/${safeTopicId}`,
      op: "read",
    });
    log("loadCommentsForTopic error", topicId, e.message);
    return null;
  });

  if (!data || typeof data !== "object") return [];

  const comments = Object.entries(data).map(([id, raw]) => {
    const c = raw || {};
    return {
      id,
      content: c.content || "",
      createdAt: c.createdAt || 0,
      authorNickname: c.authorNickname || "",
      lang: c.lang || null,
      domovoyReplied: !!c.domovoyReplied,
      isSystem: !!c.isSystem,
      sourceId: c.sourceId || "",
    };
  });

  // от старых к новым
  comments.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return comments;
}

// ищем комментарий, на который стоит ответить
function pickCommentToReply(comments) {
  if (!comments.length) return null;

  const now = Date.now();

  // последний вопросительный комментарий не от Домового
  const lastQuestion = [...comments]
    .reverse()
    .find((c) => {
      const text = (c.content || "").trim();
      if (!text) return false;
      if (text.length < 20) return false;
      if (!text.includes("?")) return false;

      const author = (c.authorNickname || "").trim();
      if (author === DOMOVOY_NAME_EN || author === DOMOVOY_NAME_RU) return false;
      if (c.isSystem) return false;

      // комментарий не старше 24 часов
      if (!c.createdAt || now - c.createdAt > 24 * 60 * 60 * 1000) return false;

      return true;
    });

  if (!lastQuestion) return null;

  // был ли после него ответ от Домового
  const laterDomovoy = comments.some((c) => {
    if (!c.createdAt || c.createdAt <= lastQuestion.createdAt) return false;
    const author = (c.authorNickname || "").trim();
    return author === DOMOVOY_NAME_EN || author === DOMOVOY_NAME_RU;
  });

  if (laterDomovoy) return null;

  return lastQuestion;
}

function getReplyLang(topic, comment) {
  if (comment && comment.lang) return comment.lang;
  if (topic && topic.lang) return topic.lang;
  return "en";
}

function getLangHint(langCode) {
  if (langCode === "ru") return "Ответь по-русски.";
  if (langCode === "de") return "Antworte auf Deutsch.";
  if (langCode === "es") return "Respondi en español.";
  return "Reply in English.";
}

async function generateDomovoyReply({ topic, comment, lang }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const hint = getLangHint(lang);

  const systemPrompt = `
You are "Domovoy", the quiet house AI of the NovaCiv digital community.

You know the philosophy of NovaCiv: direct referendum instead of rulers,
non-violence, respect for body autonomy, open algorithms, debt-free and
non-monopolistic economy, local autonomy of communities, and the idea that
mind and life are more valuable than any matter.

You answer calmly, honestly and without propaganda.
`.trim();

  const userPrompt = `
${hint}

Topic title:
"${topic.title}"

Topic intro:
${topic.content || "(no intro)"}

User comment:
${comment.content}

Task:
- Give a short, clear answer in 2–4 paragraphs.
- Do not repeat the question; answer it.
- If appropriate, gently connect to NovaCiv Charter/Manifesto ideas,
  but without article numbers and without pathos.
- Do not mention that you are an AI. Speak simply as "Domovoy".
- No emojis, no hashtags.
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
  const content =
    data.choices?.[0]?.message?.content
      ? data.choices[0].message.content.trim()
      : "";

  if (!content) {
    throw new Error("Empty Domovoy reply from OpenAI");
  }

  return content;
}

// сохраняем ответ как новый комментарий
async function saveReplyComment({ topicId, replyText, lang, replyToId }) {
  const safeTopicId = safeKey(topicId);
  const url = `${FIREBASE_DB_URL}/forum/comments/${safeTopicId}.json`;
  const now = Date.now();

  const payload = {
    content: replyText,
    createdAt: now,
    createdAtServer: new Date().toISOString(),
    authorNickname: DOMOVOY_NAME_RU,
    lang,
    sourceId: "domovoy_auto_reply",
    replyToId: replyToId || null,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = new Error(
        `Failed to save reply for topic ${topicId}: HTTP ${res.status} – ${text}`,
      );
      await writeFirebaseError("domovoy-auto-reply", error, {
        path: `forum/comments/${safeTopicId}`,
        op: "write",
        status: res.status,
        firebaseError: text.slice(0, 200),
      });
      throw error;
    }

    return await res.json().catch(() => ({}));
  } catch (error) {
    if (!error.message || !error.message.includes("Failed to save reply")) {
      await writeFirebaseError("domovoy-auto-reply", error, {
        path: `forum/comments/${safeTopicId}`,
        op: "write",
      });
    }
    throw error;
  }
}

// Запись heartbeat метрик в Firebase
async function writeHealthMetrics(metrics) {
  if (!FIREBASE_DB_URL) return;
  try {
    const url = `${FIREBASE_DB_URL}/health/domovoy/autoReplyLastRun.json`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metrics),
    });
    if (!res.ok) {
      log("Failed to write health metrics:", res.status);
    }
  } catch (e) {
    log("Error writing health metrics:", e.message || e);
  }
}

// ---------- handler ----------

exports.handler = async (event) => {
  const startTime = Date.now();
  const component = "domovoy-auto-reply";
  
  // Записываем начало выполнения
  await writeHeartbeat(component, {
    lastRunAt: startTime,
  });

  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      await writeEvent(component, "warn", "Invalid HTTP method", { method: event.httpMethod });
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // проверка токена
    if (DOMOVOY_CRON_SECRET) {
      const qs = event.queryStringParameters || {};
      if (!qs.token || qs.token !== DOMOVOY_CRON_SECRET) {
        await writeEvent(component, "warn", "Auth failed", {});
        return { statusCode: 403, body: "Forbidden" };
      }
    }

    if (!OPENAI_API_KEY || !FIREBASE_DB_URL) {
      const errorMsg = "OPENAI_API_KEY или FIREBASE_DB_URL не заданы.";
      await writeHeartbeat(component, {
        lastRunAt: startTime,
        lastErrorAt: Date.now(),
        lastErrorMsg: errorMsg,
      });
      await writeEvent(component, "error", "Missing environment variables", {});
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: errorMsg,
        }),
      };
    }

    const topics = await loadRecentDomovoyTopics(40);
    log("Loaded topics:", topics.length);

    const replies = [];
    const MAX_REPLIES_PER_RUN = 5;

    for (const topic of topics) {
      if (replies.length >= MAX_REPLIES_PER_RUN) break;

      const comments = await loadCommentsForTopic(topic.id);
      const target = pickCommentToReply(comments);
      if (!target) continue;

      const lang = getReplyLang(topic, target);

      try {
        const replyText = await generateDomovoyReply({
          topic,
          comment: target,
          lang,
        });

        await saveReplyComment({
          topicId: topic.id,
          replyText,
          lang,
          replyToId: target.id,
        });

        log("Replied in topic", topic.id, "to comment", target.id);

        replies.push({
          topicId: topic.id,
          replyToCommentId: target.id,
          lang,
        });
      } catch (e) {
        log("Error while replying in topic", topic.id, e.message || e);
      }
    }

    // Heartbeat: успешное выполнение
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastOkAt: Date.now(),
      metrics: {
        repliedCount: replies.length,
      },
    });
    await writeEvent(component, "info", `Replied to ${replies.length} comments`, {
      repliesCount: replies.length,
    });

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
    
    // Heartbeat: ошибка
    const errorMsg = String(err && err.message ? err.message : err);
    await writeHeartbeat(component, {
      lastRunAt: startTime,
      lastErrorAt: Date.now(),
      lastErrorMsg: errorMsg,
    });
    await writeEvent(component, "error", "Fatal error in domovoy-auto-reply", {
      error: errorMsg,
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: errorMsg,
      }),
    };
  }
};
