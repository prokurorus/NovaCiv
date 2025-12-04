// netlify/functions/generate-video-background.js

const { runPipeline } = require("../../media/scripts/pipeline");

exports.handler = async (event, context) => {
  try {
    // Язык по умолчанию
    let lang = "ru";

    // Пробуем вытащить язык из тела запроса (которое шлёт generate-video)
    if (event && event.body) {
      try {
        const data = JSON.parse(event.body);
        if (data && typeof data.lang === "string") {
          lang = data.lang;
        }
      } catch (e) {
        console.warn("generate-video-background: body JSON parse error:", e);
      }
    }

    console.log("generate-video-background started", {
      requestId: context && context.awsRequestId,
      lang,
    });

    // Запускаем основной конвейер генерации шорта
    const result = await runPipeline(console, { lang });

    console.log("generate-video-background finished", result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        lang,
        ...result,
      }),
    };
  } catch (err) {
    console.error("generate-video-background error:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(err),
      }),
    };
  }
};
