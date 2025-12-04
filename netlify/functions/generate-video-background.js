// netlify/functions/generate-video-background.js
// Background-функция Netlify: запускает видео-конвейер NovaCiv в фоне

const { runPipeline } = require("../../media/scripts/pipeline");

exports.handler = async (event, context) => {
  // Не ждём очистки event loop — Netlify отпустит HTTP-ответ,
  // а функция продолжит работать в фоне
  context.callbackWaitsForEmptyEventLoop = false;

  // Язык можно передавать через ?lang=ru|en|de|es, по умолчанию ru
  const lang =
    (event.queryStringParameters && event.queryStringParameters.lang) || "ru";

  // Запускаем пайплайн в фоне, без await
  runPipeline(console, { lang })
    .then((result) => {
      console.log("NovaCiv video pipeline finished:", {
        lang: result.lang,
        quote: result.quote,
        audioPath: result.audioPath,
        videoPath: result.videoPath,
      });
    })
    .catch((err) => {
      console.error("generate-video-background error:", err);
    });

  // Сразу отдаём быстрый ответ — задача принята
  return {
    statusCode: 202,
    body: JSON.stringify({
      ok: true,
      started: true,
      lang,
      message: "NovaCiv media pipeline started in background",
    }),
  };
};
