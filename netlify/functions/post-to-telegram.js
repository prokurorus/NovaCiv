// netlify/functions/post-to-telegram.js

exports.handler = async (event) => {
  try {
    // Разрешаем только POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: "Method Not Allowed",
      };
    }

    // Парсим тело запроса
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        body: "Invalid JSON in request body",
      };
    }

    const {
      text,
      parse_mode = "HTML",
      disable_web_page_preview = false,
    } = payload;

    if (!text || typeof text !== "string") {
      return {
        statusCode: 400,
        body: "Missing 'text' field in request body",
      };
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    // Сначала пробуем отдельный чат для новостей, если он есть.
    // Если нет — используем общий TELEGRAM_CHAT_ID (как сейчас).
    const chatId =
      process.env.TELEGRAM_NEWS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
      return {
        statusCode: 500,
        body: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID/TELEGRAM_NEWS_CHAT_ID env vars",
      };
    }


    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    // Node 18+ в Netlify уже умеет fetch
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode,
        disable_web_page_preview,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error("Telegram API error:", data);
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: data,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("post-to-telegram error:", err);
    return {
      statusCode: 500,
      body: "Internal Server Error",
    };
  }
};
