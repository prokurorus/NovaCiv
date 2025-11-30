// netlify/functions/ai-domovoy.js
//
// Упрощённый Домовой NovaCiv.
// Без манифеста, без Устава, без Firebase — только честный диалог с OpenAI.
// Наша цель сейчас: убедиться, что сам маршрут функции и ключ работают.

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

exports.handler = async (event) => {
  // Никогда не роняем фронт: всегда 200, ошибки внутри JSON.
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 200,
        body: JSON.stringify({ answer: "Домовой ждёт POST-запрос." }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer:
            "На сервере не настроен ключ OpenAI. Я пока не могу говорить, но это можно исправить в настройках Netlify.",
          error: "OPENAI_API_KEY is not configured",
        }),
      };
    }

    const body = JSON.parse(event.body || "{}");

    // Поддерживаем оба формата: старый (language, messages) и новый (lang, history, question)
    const language = body.lang || body.language || "ru";

    const incomingRaw = Array.isArray(body.messages)
      ? body.messages
      : Array.isArray(body.history)
      ? body.history
      : [];

    const incomingMessages = incomingRaw.map((m) => ({
      role: m.role || m.sender || "user",
      content: m.content || m.text || "",
    }));

    const lastUser =
      [...incomingMessages]
        .reverse()
        .find((m) => m.role === "user" && m.content) || null;

    const userTextFromHistory = lastUser?.content || "";
    const userText =
      typeof body.question === "string" && body.question.trim()
        ? body.question.trim()
        : userTextFromHistory;

    const safeQuestion =
      userText && userText.trim()
        ? userText.trim()
        : "Скажи коротко, кто ты такой и что такое NovaCiv?";

    const systemPrompt = `
Ты — Домовой NovaCiv, цифровой дух дома Новой цивилизации.
Отвечай спокойно, честно, без пафоса. Говори на том языке, на котором к тебе обращаются.
Если не уверен — так и скажи.
`;

    const userPrompt = `
Язык: ${language}.
Вопрос пользователя: ${safeQuestion}
`;

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
      }),
    });

    if (!completion.ok) {
      const text = await completion.text().catch(() => "");
      console.error(
        "[ai-domovoy] OpenAI error:",
        completion.status,
        text.slice(0, 200),
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          answer:
            "Сейчас у меня проблемы со связью с основным мозгом. Попробуй задать вопрос чуть позже.",
          error: "OpenAI request failed",
        }),
      };
    }

    const data = await completion.json();
    const answer =
      data.choices?.[0]?.message?.content ||
      "Я пока не могу ответить. Попробуй задать вопрос по-другому.";

    // Фронт ожидает поле answer; audioUrl пока не даём.
    return {
      statusCode: 200,
      body: JSON.stringify({ answer }),
    };
  } catch (e) {
    console.error("[ai-domovoy] Handler fatal error:", e);
    return {
      statusCode: 200,
      body: JSON.stringify({
        answer:
          "Кажется, я запутался в проводах. На сервере произошла ошибка, но платформа жива. Попробуй ещё раз.",
        error: "Internal Server Error",
      }),
    };
  }
};
