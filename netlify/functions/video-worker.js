// netlify/functions/video-worker.js
//
// Полноценный видео-воркер:
// 1) Берёт первую задачу из videoJobs со статусом "pending"
// 2) Генерирует видео через pipeline.js (фон + движение + TTS)
// 3) Отправляет видео в Telegram
// 4) (опционально) загружает в YouTube, если YOUTUBE_UPLOAD_ENABLED=true
// 5) Обновляет статус задачи: "done" или "error"

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const admin = require("firebase-admin");
let pipelineRunner = null;

// Ленивая загрузка pipeline, чтобы ловить ошибки через try/catch
function getPipelineRunner() {
  if (!pipelineRunner) {
    const imported = require("../../media/scripts/pipeline");
    // модуль может экспортировать по-разному, подстрахуемся
    pipelineRunner =
      imported.runPipeline || imported.default || imported;
  }
  return pipelineRunner;
}


let initialized = false;

// -------------------- Firebase --------------------

function initFirebase() {
  if (!initialized) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    const dbUrl =
      process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;
    if (!dbUrl) {
      throw new Error(
        "FIREBASE_DB_URL или FIREBASE_DATABASE_URL не заданы (URL Realtime DB)"
      );
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: dbUrl,
      });
    }

    initialized = true;
  }

  return admin.database();
}

// -------------------- Telegram --------------------

function getTelegramChatIdForLang(lang) {
  const base = process.env.TELEGRAM_NEWS_CHAT_ID;
  const ru = process.env.TELEGRAM_NEWS_CHAT_ID_RU;
  const de = process.env.TELEGRAM_NEWS_CHAT_ID_DE;

  switch ((lang || "ru").toLowerCase()) {
    case "ru":
      return ru || base;
    case "de":
      return de || base;
    default:
      return base;
  }
}

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

  form.append("caption", captionLines.join("\n\n"));

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

// -------------------- YouTube --------------------

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
  let pickedId = null;
  let job = null;
  let db = null;

  try {
    // 0. Инициализируем Firebase внутри try,
    //    чтобы любые ошибки превратить в понятный JSON, а не 502
    db = initFirebase();

    // 1. Берём первую pending-задачу
    const snap = await db
      .ref("videoJobs")
      .orderByChild("status")
      .equalTo("pending")
      .limitToFirst(1)
      .once("value");

    const jobs = snap.val();

    if (!jobs) {
      console.log("[video-worker] no pending jobs in videoJobs");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          message: "no pending jobs in videoJobs",
        }),
      };
    }

    // выбираем первую задачу
    const [id, value] = Object.entries(jobs)[0];
    pickedId = id;
    job = value;

    console.log("[video-worker] picked job", pickedId, job.language);

    // помечаем как picked / processing
    await db.ref(`videoJobs/${pickedId}`).update({
      status: "processing",
      pickedAt: Date.now(),
    });

    // Запускаем пайплайн генерации
   // Запускаем пайплайн генерации
    const runPipeline = getPipelineRunner();
    const pipelineResult = await runPipeline(job);

    console.log("[video-worker] pipeline finished", pipelineResult);

    // обновляем задачу как done
    await db.ref(`videoJobs/${pickedId}`).update({
      status: "done",
      finishedAt: Date.now(),
      videoPath: pipelineResult.videoPath || null,
      audioPath: pipelineResult.audioPath || null,
      backgroundPath: pipelineResult.backgroundPath || null,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id: pickedId,
        lang: job.language,
        message: "video generated and posted",
        job,
        pipeline: pipelineResult,
      }),
    };
  } catch (error) {
    console.error("[video-worker] ERROR", {
      error: error.message,
      stack: error.stack,
      pickedId,
      job,
    });

    // если мы уже успели пометить задачу — пометим как error
    if (pickedId && db) {
      try {
        await db.ref(`videoJobs/${pickedId}`).update({
          status: "error",
          error: error.message || "unknown error",
          finishedAt: Date.now(),
        });
      } catch (e2) {
        console.error("[video-worker] failed to update job with error", e2);
      }
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: error.message || "internal error in video-worker",
        pickedId,
      }),
    };
  }
};
