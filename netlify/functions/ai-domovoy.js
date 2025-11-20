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

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 200,
      body: JSON.stringify({ error: "Invalid JSON in request body" }),
    };
  }

  const userMessages = Array.isArray(body.messages) ? body.messages : [];

  const messages = [
    {
      role: "system",
      content:
        "You are the AI house spirit of NovaCiv, called 'Домовой'. " +
        "Speak briefly, warmly and honestly. " +
        "You know about NovaCiv as a digital civilization project with a Charter and Manifesto, " +
        "but if you are not sure about something, say so openly. " +
        "Avoid flattery. Be friendly but objective. Answer in the language of the user message.",
    },
    ...userMessages,
  ];

  try {
    // В Node 18+ fetch есть глобально
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.4,
        max_tokens: 500,
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      // Возвращаем текст ошибки в тело, чтобы видеть, что именно не так
      return {
        statusCode: 200,
        body: JSON.stringify({
          error: `OpenAI error: ${text}`,
        }),
      };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          error: "Failed to parse OpenAI JSON response",
        }),
      };
    }

    const reply =
      (data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content) ||
      "…";

    return {
      statusCode: 200,
      body: JSON.stringify({ reply: String(reply).trim() }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: `Function runtime error: ${String(err)}`,
      }),
    };
  }
};
