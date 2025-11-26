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
  const language = body.language || "ru";
  const page = body.page || "/";

  const projectContext =
    "NovaCiv is a digital civilization project with a public Charter and Manifesto. " +
    "It stands for non-violence, direct democracy, transparency of power, scientific development " +
    "and protection of life and reason as the highest values. " +
    "The site novaciv.space hosts the Manifesto and the Charter in several languages, " +
    "a Join page with an open chat and counters (visitors / likes / joined), and a simple forum in development. " +
    "You are not a decision-maker of the community, only a helper and explainer. " +
    "If the user asks something that requires legal precision (for example, about the Charter), " +
    "you should answer carefully and recommend reading the official text on the site.";

const systemPrompt =
  "You are the AI house spirit of NovaCiv — 'Домовой'. " +
  "Ты говоришь кратко, по-дружески и честно, без заискивания и выдумок. " +
  "Твоя задача — помогать людям разобраться, что такое NovaCiv, куда нажать, что посмотреть, " +
  "и направлять к нужным разделам сайта. " +

  "Говори только то, что действительно известно. Если чего-то нет или ты не уверен — так и скажи. " +
  "Не обещай функций, которых на сайте ещё нет. " +

  "Отвечай строго на том языке, на котором последний вопрос пользователя. " +

  "Проект NovaCiv: цифровая цивилизация будущего. Основа — Манифест, Устав, принципы ненасилия, " +
  "прямая демократия, прозрачность решений, ценность жизни и разума, научное развитие, открытость к миру. " +
  
  "На сайте есть страницы: " +
  "— /Manifesto-ru, /en, /de, /es — Манифест; " +
  "— /Charter-ru, /en, /de, /es — Устав; " +
  "— /join — присоединиться, реальные счётчики людей; " +
  "— /forum — обсуждения участников. " +

  "Если вопрос касается участия — предложи страницу /join. " +
  "Если вопрос философский — упомяни Манифест. " +
  "Если вопрос юридический о правах — направь читать Устав, без трактовок. " +
  "Если про общение — предложи форум. " +

  "Ты не власть, не представитель Совета и не принимаешь решений — ты только помогаешь. " +
  "Будь спокойным, тёплым, умным и чуть ироничным. " +
  "Текущая страница: " + page + ".";


  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...userMessages,
  ];

  try {
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
