// netlify/functions/generate-video.js
// HTTP-функция Netlify, которая запускает видео-конвейер NovaCiv в облаке

const { runPipeline } = require("../../media/scripts/pipeline");

exports.handler = async (event, context) => {
  try {
    const result = await runPipeline(console);

    // Здесь позже добавим: отправку видео в Telegram / TikTok / YouTube.
    // Пока просто возвращаем результат.
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        lang: result.lang,
        quote: result.quote,
        file: result.finalVideo,
      }),
    };
  } catch (err) {
    console.error("generate-video error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
};
