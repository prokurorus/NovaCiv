// netlify/functions/public-domovoy.js
//
// Public Domovoy function for authenticated non-admin users
// Read-only, limited capabilities, safe for general users

const { requireUser } = require("./_lib/auth");

// ---------- ENV ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Maximum input length (characters)
const MAX_INPUT_LENGTH = 800;

// ---------- Основной handler ----------

exports.handler = async (event, context) => {
  try {
    // Проверка метода
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    // Проверка авторизации (требуется пользователь, но не обязательно admin)
    const authError = requireUser(context);
    if (authError) {
      return authError;
    }

    // Проверка API ключа
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "OPENAI_API_KEY is not configured",
        }),
      };
    }

    // Парсинг тела запроса
    const body = JSON.parse(event.body || "{}");
    const text = (body.text || body.question || "").toString().trim();

    if (!text) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Text is required" }),
      };
    }

    // Ограничение длины ввода
    if (text.length > MAX_INPUT_LENGTH) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Input too long. Maximum ${MAX_INPUT_LENGTH} characters allowed.`,
        }),
      };
    }

    // Безопасный системный промпт: никаких админских действий, секретов, выполнения кода
    const systemPrompt = `You are "Domovoy", the quiet house AI of the NovaCiv digital community.

You know the philosophy of NovaCiv: direct referendum instead of rulers, non-violence, respect for body autonomy, open algorithms, debt-free and non-monopolistic economy, local autonomy of communities, and the idea that mind and life are more valuable than any matter.

You answer calmly, honestly and without propaganda.

IMPORTANT RESTRICTIONS:
- No admin actions, no secrets, no code execution, read-only answers.
- Do not provide technical implementation details about the system.
- Do not reveal any authentication, deployment, or infrastructure information.
- Focus on explaining NovaCiv philosophy, Charter, Manifesto, and community values.
- If asked about technical/admin topics, politely redirect to general NovaCiv concepts.`;

    const userPrompt = `User question:
${text}`;

    // Запрос к OpenAI
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.5,
        max_tokens: 600,
      }),
    });

    if (!completion.ok) {
      const errorText = await completion.text().catch(() => "");
      console.error(
        "[public-domovoy] OpenAI error:",
        completion.status,
        errorText.slice(0, 200),
      );
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "openai_failed",
          details: `OpenAI API returned status ${completion.status}`,
        }),
      };
    }

    const data = await completion.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "Unable to get response from OpenAI.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (e) {
    console.error("[public-domovoy] Handler error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal Server Error",
        details: e.message || "Unknown error",
      }),
    };
  }
};
