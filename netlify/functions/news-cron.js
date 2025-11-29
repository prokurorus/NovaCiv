// netlify/functions/news-cron.js
// Запускается по расписанию на стороне Netlify.
// Последовательно дергает fetch-news и broadcast-news с секретом,
// чтобы новости подтянулись и ушли в три телеграм-канала.

const BASE_URL = process.env.URL || "https://novaciv.space";
const NEWS_CRON_SECRET = process.env.NEWS_CRON_SECRET;

async function callFunction(path) {
  const url = `${BASE_URL}/.netlify/functions/${path}?token=${encodeURIComponent(
    NEWS_CRON_SECRET || ""
  )}`;

  console.log("[news-cron] calling:", url);

  try {
    const res = await fetch(url);
    const text = await res.text();

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    console.log("[news-cron] result", path, res.status, body);

    return {
      ok: res.ok,
      status: res.status,
      body,
    };
  } catch (e) {
    console.error("[news-cron] error calling", path, e);
    return {
      ok: false,
      error: String(e),
    };
  }
}

exports.handler = async () => {
  try {
    if (!NEWS_CRON_SECRET) {
      throw new Error("NEWS_CRON_SECRET is not set");
    }

    // 1) Подтягиваем новые новости
    const fetchResult = await callFunction("fetch-news");

    // 2) Рассылаем свежие новости в 3 телеграм-канала
    const broadcastResult = await callFunction("broadcast-news");

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        fetch: fetchResult,
        broadcast: broadcastResult,
      }),
    };
  } catch (e) {
    console.error("[news-cron] runtime error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(e),
      }),
    };
  }
};
