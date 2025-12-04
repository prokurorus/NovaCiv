// netlify/functions/generate-video-background.js

const { runPipeline } = require("../../media/scripts/pipeline");

exports.handler = async (event, context) => {
  try {
    console.log("generate-video-background started", {
      requestId: context && context.awsRequestId,
      eventBody: event && event.body,
    });

    // Запускаем основной конвейер генерации шорта
    const result = await runPipeline(console);

    console.log("generate-video-background finished", result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
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
