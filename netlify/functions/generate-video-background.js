// netlify/functions/generate-video.js
// HTTP-функция Netlify, запускающая видео-конвейер NovaCiv в облаке

const { runPipeline } = require("../../media/scripts/pipeline");

exports.handler = async (event, context) => {
  try {
    const result = await runPipeline(console);

    // На этом шаге только генерируем и возвращаем информацию.
    // Далее сюда добавим отправку в Telegram / TikTok / YouTube.

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
