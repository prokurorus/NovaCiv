// netlify/functions/generate-video.js
// Лёгкий HTTP-триггер: запускает background-функцию и быстро отвечает

// Универсальный fetch (как в pipeline.js)
const fetchFn =
  (typeof fetch !== "undefined" && fetch) ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

exports.handler = async (event, context) => {
  const lang =
    (event.queryStringParameters && event.queryStringParameters.lang) ||
    "ru";

  // Базовый URL текущего деплоя (Netlify сам пробросит эти переменные)
  const baseUrl =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    `https://${process.env.SITE_NAME}.netlify.app`;

  const triggerUrl = `${baseUrl}/.netlify/functions/generate-video-background?lang=${encodeURIComponent(
    lang
  )}`;

  try {
    // Запускаем background-функцию, ответ нам не важен
    await fetchFn(triggerUrl, { method: "POST" }).catch((e) => {
      console.error("Error triggering background function:", e);
    });

    // Быстрый ответ посетителю / скрипту домового
    return {
      statusCode: 202,
      body: JSON.stringify({
        ok: true,
        message: "Video generation job started",
        lang,
      }),
    };
  } catch (err) {
    console.error("generate-video trigger error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err.message || String(err),
      }),
    };
  }
};
