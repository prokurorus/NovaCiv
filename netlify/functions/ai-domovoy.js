// netlify/functions/ai-domovoy.js

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: "OPENAI_API_KEY is not set on the server",
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const language = body.language || "ru";
    const page = body.page || "/";

    // Фолбэк — если сообщений нет, задаём системную рамку
    const finalMessages =
      messages.length > 0
        ? messages
        : [
            {
              role: "system",
              content:
                "You are a helpful AI assistant (Домовой) of the NovaCiv project (novaciv.space). " +
                "Answer concisely, clearly and kindly. The user is likely Russian-speaking. " +
                "Website language: " +
                language +
                ". Current page: " +
                page +
                ".",
            },
          ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        messages: finalMessages,
        temperature: 0.4,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 200,
        body: JSON.stringify({
          error: `OpenAI chat API error: HTTP ${response.status} – ${text}`,
        }),
      };
    }

    const data = await response.json();
    const answer =
      data.choices?.[0]?.message?.content?.trim() ||
      "Извини, я сейчас не могу ответить. Попробуй ещё раз чуть позже.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: `AI runtime error: ${String(err)}`,
      }),
    };
  }
};
