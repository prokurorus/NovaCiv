// netlify/functions/video-worker.js
//
// Видео-воркер NovaCiv:
//
// 1) Берёт первую задачу из videoJobs со статусом "pending"
// 2) Генерирует видео через media/scripts/pipeline.js (фон + TTS + ffmpeg)
// 3) Отправляет видео в Telegram (если заданы переменные)
// 4) Помечает задачу как "done" или "error"

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const admin = require("firebase-admin");

let firebaseInitialized = false;
let pipelineRunner = null;

// -------------------- Firebase --------------------

function initFirebase() {
  if (!firebaseInitialized) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    const dbUrl =
      process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;

    if (!dbUrl) {
      throw new Error("FIREBASE_DB_URL / FIREBASE_DATABASE_URL is not set");
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: dbUrl,
    });

    firebaseInitialized = true;
    console.log("[video-worker] Firebase initialized with", dbUrl);
  }

  return admin.database();
}

// -------------------- Pipeline loader --------------------

function getPipelineRunner() {
  if (!pipelineRunner) {
    const imported = require("../../media/scripts/pipeline");
    pipelineRunner =
      imported.runPipeline || imported.default || imported;

    if (typeof pipelineRunner !== "function") {
      throw new Error(
        "pipeline.js does not export a callable runPipeline function"
      );
    }
  }
  return pipelineRunner;
}

// -------------------- Telegram helper --------------------

async function sendTelegramVideo({ videoPath, lang, topic }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const baseChatId = process.env.TELEGRAM_NEWS_CHAT_ID;

  const langLower = (lang || "ru").toLowerCase();
  const perLangChatIds = {
    ru: process.env.TELEGRAM_NEWS_CHAT_ID_RU,
    en: process.env.TELEGRAM_NEWS_CHAT_ID_EN,
    de: process.env.TELEGRAM_NEWS_CHAT_ID_DE,
    es: process.env.TELEGRAM_NEWS_CHAT_ID_ES,
  };

  const chatId = perLangChatIds[langLower] || baseChatId;

  if (!token) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN not set, skipping");
    return;
  }

  if (!chatId) {
    console.log("[telegram] no TELEGRAM_NEWS_CHAT_ID configured, skipping");
    return;
  }

  if (!videoPath || !fs.existsSync(videoPath)) {
    console.log("[telegram] video file not found", videoPath);
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendVideo`;

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("supports_streaming", "true");
  form.append(
    "caption",
    topic ? `NovaCiv · ${topic}` : "NovaCiv — цифровая цивилизация"
  );
  form.append("video", fs.createReadStream(videoPath));

  const headers = form.getHeaders();

  const resp = await axios.post(url, form, { headers });
  console.log("[telegram] sent video, ok:", resp.data && resp.data.ok);
}

// -------------------- MAIN HANDLER --------------------

exports.handler = async (event) => {
  let pickedId = null;
  let job = null;
  let db = null;

  try {
    db = initFirebase();

    // 1. Берём первую задачу со статусом "pending"
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

    const [id, value] = Object.entries(jobs)[0];
    pickedId = id;
    job = value;

    console.log("[video-worker] picked job", pickedId, job.language);

    // помечаем как processing
    await db.ref(`videoJobs/${pickedId}`).update({
      status: "processing",
      pickedAt: Date.now(),
    });

    // 2. Запускаем пайплайн
    const runPipeline = getPipelineRunner();

    const lang = job.language || job.lang || "ru";
    const script = job.script || "";

    const pipelineResult = await runPipeline(console, {
      lang,
      script,
    });

    console.log("[video-worker] pipeline finished", pipelineResult);

    // 3. Отправляем видео в Telegram, если есть
    if (pipelineResult && pipelineResult.videoPath) {
      try {
        await sendTelegramVideo({
          videoPath: pipelineResult.videoPath,
          lang,
          topic: job.topic,
        });
      } catch (e) {
        console.error("[video-worker] telegram send error", e);
      }
    }

    // 4. Обновляем задачу как done
    await db.ref(`videoJobs/${pickedId}`).update({
      status: "done",
      finishedAt: Date.now(),
      videoPath: pipelineResult ? pipelineResult.videoPath : null,
      audioPath: pipelineResult ? pipelineResult.audioPath : null,
      backgroundPath: pipelineResult ? pipelineResult.backgroundPath : null,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id: pickedId,
        lang,
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
