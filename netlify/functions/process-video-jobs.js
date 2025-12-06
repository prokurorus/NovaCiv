// netlify/functions/process-video-jobs.js
//
// ВРЕМЕННЫЙ ОТЛАДОЧНЫЙ ВАРИАНТ.
// Без Firebase, без ffmpeg, без OpenAI – только проверка переменных.

exports.handler = async (event, context) => {
  try {
    const info = {
      ok: true,
      message: "process-video-jobs DEBUG",
      // что реально видим из переменных окружения
      hasFirebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      hasFirebaseDbUrl:
        !!(process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL),
      hasOpenAiKey: !!process.env.OPENAI_API_KEY,
      hasOpenAiTtsModel: !!process.env.OPENAI_TTS_MODEL,
      hasTelegramBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
      telegramBaseChatId: process.env.TELEGRAM_NEWS_CHAT_ID || null,
      telegramRuChatId: process.env.TELEGRAM_NEWS_CHAT_ID_RU || null,
      telegramDeChatId: process.env.TELEGRAM_NEWS_CHAT_ID_DE || null,
      youtubeUploadEnabled:
        (process.env.YOUTUBE_UPLOAD_ENABLED || "").toLowerCase() === "true",
      hasYoutubeClient:
        !!process.env.YOUTUBE_CLIENT_ID &&
        !!process.env.YOUTUBE_CLIENT_SECRET &&
        !!process.env.YOUTUBE_REFRESH_TOKEN,
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(info, null, 2),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        ok: false,
        error: err.message || String(err),
      }),
    };
  }
};
