// netlify/functions/process-video-jobs.js
// Минимальный тестовый handler без зависимостей

exports.handler = async function (event, context) {
  try {
    console.log("[process-video-jobs] minimal test started");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        ok: true,
        message: "process-video-jobs minimal test OK",
      }),
    };
  } catch (e) {
    console.error("[process-video-jobs] error in minimal test:", e);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        ok: false,
        error: e.message || String(e),
      }),
    };
  }
};
