// netlify/functions/process-video-jobs.js
//
// Упрощённая отладочная версия:
// - НЕ использует Firebase
// - Берёт один тестовый текст
// - Генерирует видео через pipeline
// - Пытается отправить в YouTube (если включено)
// - Отправляет в Telegram
//
// Любая ошибка попадает в JSON-ответ, а не в "Internal Error".

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

// наш конвейер генерации видео
const { runPipeline } = require("../../media/scripts/pipeline");

// -------------------- TELEGRAM helpers --------------------

function getTelegramChatIdForLang(lang) {
  const base = process.env.TELEGRAM_NEWS_CHAT_ID;
  const ru = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
  const de = process.env.TELEGRAM_NEWS_CHAT_ID_DE;

  switch ((lang || "ru").toLowerCase()) {
    case "ru":
      return ru || base;
    case "de":
      return de || base;
    // en / es и всё остальное — базовый канал
    default:
      return base;
  }
}

// отправка готового файла в Telegram
async function sendToTelegram(finalVideoPath, job) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN не задан");
  }

  const chatId = getTelegramChatIdForLang(job.language || "ru");
  if (!chatId) {
    throw new Error(
      "Не задан chat_id для Telegram (TELEGRAM_NEWS_CHAT_ID* переменные)"
    );
  }

  const url = `https://api.telegram.org/bot${token}/sendVideo`;

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("supports_streaming", "true");

  // подпись под роликом
  const captionLines = [];

  if (job.topic) {
    captionLines.push(job.topic);
  }

  if (job.script) {
    const text =
      job.script.length > 350
        ? job.script.slice(0, 347) + "..."
        : job.script;
    captionLines.push(text);
  }

  if (captionLines.length > 0) {
    form.append("caption", captionLines.join("\n\n"));
  }

  const fileStream = fs.createReadStream(finalVideoPath);
  form.append("video", fileStream, {
    filename: path.basename(finalVideoPath),
    contentType: "video/mp4",
  });

  await axios.post(url, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
}

// -------------------- YOUTUBE helpers --------------------

function isYouTubeEnabled() {
  const enabled = (process.env.YOUTUBE_UPLOAD_ENABLED || "").toLowerCase();
  return enabled === "true" || enabled === "1";
}

async function getYouTubeAccessToken() {
  const {
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REFRESH_TOKEN,
  } = process.env;

  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    console.log(
      "[youtube] credentials not fully set, skipping upload",
      !!YOUTUBE_CLIENT_ID,
      !!YOUTUBE_CLIENT_SECRET,
      !!YOUTUBE_REFRESH_TOKEN
    );
    return null;
  }

  const params = new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID,
    client_secret: YOUTUBE_CLIENT_SECRET,
    refresh_token: YOUTUBE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const res = await axios.post(
    "https://oauth2.googleapis.com/token",
    params.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!res.data || !res.data.access_token) {
    throw new Error("[youtube] no access_token in token response");
  }

  return res.data.access_token;
}

async function uploadToYouTube(videoPath, lang, title) {
  if (!isYouTubeEnabled()) {
    console.log("[youtube] upload disabled via YOUTUBE_UPLOAD_ENABLED");
    return;
  }

  const accessToken = await getYouTubeAccessToken();
  if (!accessToken) {
    return;
  }

  const fileStats = fs.statSync(videoPath);
  const fileSize = fileStats.size;

  const snippet = {
    title: (title || "NovaCiv short").slice(0, 95),
    description: `${title || ""}\n\nLanguage: ${lang}\nhttps://novaciv.space`,
    categoryId: "22", // People & Blogs
  };

  const status = {
    privacyStatus: "public",
    selfDeclaredMadeForKids: false,
  };

  // 1. создаём сессию загрузки
  const initRes = await axios.post(
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status",
    { snippet, status },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Length": fileSize,
        "X-Upload-Content-Type": "video/mp4",
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: (s) => s >= 200 && s < 400,
    }
  );

  const uploadUrl = initRes.headers.location;
  if (!uploadUrl) {
    console.log("[youtube] no upload URL in initRes headers");
    return;
  }

  // 2. отправляем файл
  const stream = fs.createReadStream(videoPath);

  await axios.put(uploadUrl, stream, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "video/mp4",
      "Content-Length": fileSize,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  console.log("[youtube] upload completed");
}

// -------------------- MAIN HANDLER --------------------

exports.handler = async (event) => {
  try {
    // язык можно задать ?lang=ru/en/de/es, по умолчанию ru
    const langParam =
      (event && event.queryStringParameters && event.queryStringParameters.lang) ||
      "ru";
    const lang = (langParam || "ru").toLowerCase();

    // тестовый текст – потом заменим на очередь из Firebase
    const scriptByLang = {
      ru: "NovaCiv — цифровая цивилизация без правителей. Все решения принимают сами граждане. Зайди на novaciv.space и подпишись на будущее планеты.",
      en: "NovaCiv is a digital civilization without rulers. Decisions are made openly by the citizens themselves. Visit novaciv.space and subscribe to the future of the planet.",
      de: "NovaCiv ist eine digitale Zivilisation ohne Herrscher. Alle Entscheidungen treffen die Bürger offen und transparent. Besuche novaciv.space und abonniere die Zukunft des Planeten.",
      es: "NovaCiv es una civilización digital sin gobernantes. Todas las decisiones las toman abiertamente los propios ciudadanos. Entra en novaciv.space y suscríbete al futuro del planeta.",
    };

    const script = scriptByLang[lang] || scriptByLang.ru;

    const job = {
      language: lang,
      topic: "NovaCiv — цифровая цивилизация будущего",
      script,
    };

    console.log("[process-video-jobs] starting pipeline with lang:", lang);

    // 1. генерируем видео через pipeline
    const result = await runPipeline(console, {
      lang,
      script: job.script,
    });

    const finalPath =
      result.videoPath || result.outputPath || result.finalVideoPath;
    if (!finalPath) {
      throw new Error("Pipeline did not return final video path");
    }

    // 2. пробуем залить в YouTube (если включено)
    try {
      const quoteForTitle =
        job.script || job.topic || result.quote || `NovaCiv — ${lang}`;
      await uploadToYouTube(finalPath, lang, quoteForTitle);
    } catch (e) {
      console.error("[process-video-jobs] YouTube upload failed (non-fatal):", e);
    }

    // 3. отправляем в Telegram
    await sendToTelegram(finalPath, job);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(
        {
          ok: true,
          message: "Video generated and sent",
          lang,
          finalPath,
        },
        null,
        2
      ),
    };
  } catch (err) {
    console.error("process-video-jobs error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(
        {
          ok: false,
          error: err.message || String(err),
        },
        null,
        2
      ),
    };
  }
};
