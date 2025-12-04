// netlify/functions/generate-video-background.js
// Тяжёлый рендер видео (background-функция)

const { runShortAutoCitation } = require("../../media/scripts/pipeline");

exports.handler = async (event, context) => {
  const lang =
    (event.queryStringParameters && event.queryStringParameters.lang) ||
    "ru";

  try {
    const result = await runShortAutoCitation({ lang });

    // Для background-функции ответ не важен, но пусть будет:
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "Background video job finished",
        result,
      }),
    };
  } catch (err) {
    console.error("generate-video-background error:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err.message || String(err),
      }),
    };
  }
};
