// netlify/functions/video-worker.js
//
// Видео-воркер NovaCiv:
//
// 1) Берёт первую задачу из videoJobs со статусом "pending"
// 2) Генерирует видео через media/scripts/pipeline.js (фон + TTS + ffmpeg)
// 3) Отправляет видео в Telegram (если заданы переменные)
// 4) Помечает задачу как "done" или "error"
//
// ============================================================================
// ⚠️ VPS-ONLY FUNCTION (NOT deployed to Netlify)
// ============================================================================
// This function uses heavy env vars and is VPS-only:
//   - FIREBASE_SERVICE_ACCOUNT_JSON (CRITICAL: ~2-3KB, largest env var)
//   - FIREBASE_DB_URL / FIREBASE_DATABASE_URL
//   - TELEGRAM_BOT_TOKEN
//   - TELEGRAM_NEWS_CHAT_ID_* (multiple)
//   - YOUTUBE_* (if video upload enabled)
//
// Netlify equivalent: None (moved to server/video-worker.js on VPS)
// Cron schedule: Removed from netlify.toml (VPS handles via PM2)
// ============================================================================

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const admin = require("firebase-admin");

let firebaseInitialized = false;

function initFirebase(logger = console) {
  if (firebaseInitialized) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  }

  try {
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
    logger.log("[video-worker] Firebase initialized with", dbUrl);
  } catch (e) {
    logger.error("[video-worker] Firebase init error", e);
    throw e;
  }
}

function getTelegramChatIdForLang(lang) {
  const base = process.env.TELEGRAM_NEWS_CHAT_ID;
  const map = {
    ru: process.env.TELEGRAM_NEWS_CHAT_ID_RU,
    en: process.env.TELEGRAM_NEWS_CHAT_ID_EN,
    de: process.env.TELEGRAM_NEWS_CHAT_ID_DE,
    es: process.env.TELEGRAM_NEWS_CHAT_ID_ES,
  };

  const safeLang = (lang || "ru").toLowerCase();

  return map[safeLang] || base || null;
}

async function sendTelegramVideo({ lang, videoPath, caption, logger = console }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = getTelegramChatIdForLang(lang);

  if (!token) {
    logger.log("[telegram] TELEGRAM_BOT_TOKEN not set, skipping");
    return { ok: false, reason: "no token" };
  }

  if (!chatId) {
    logger.log("[telegram] no TELEGRAM_NEWS_CHAT_ID configured, skipping");
    return { ok: false, reason: "no chatId" };
  }

  if (!fs.existsSync(videoPath)) {
    logger.log("[telegram] videoPath not found", videoPath);
    return { ok: false, reason: "no file" };
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption || "");
  form.append("supports_streaming", "true");
  form.append("video", fs.createReadStream(videoPath));

  const url = `https://api.telegram.org/bot${token}/sendVideo`;

  logger.log("[telegram] sending video to", chatId);

  try {
    const resp = await axios.post(url, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    logger.log("[telegram] sent video, ok:", resp.data && resp.data.ok);
    return resp.data;
  } catch (err) {
    if (err.response) {
      logger.error(
        "[telegram] send error",
        err.response.status,
        err.response.data
      );
    } else {
      logger.error("[telegram] send error", err);
    }
    throw err;
  }
}

async function handler(event, context) {
  const logger = console;

  // ⚠️ DISABLED: Job processing is handled by PM2 server/video-worker.js only
  // This function is kept for backward compatibility but does not process jobs.
  // Jobs are created by create-video-job.js and processed by server/video-worker.js
  logger.log("[video-worker] This function is disabled. Jobs are processed by PM2 server/video-worker.js");
  
  return {
    statusCode: 200,
    body: JSON.stringify({ 
      ok: true, 
      message: "Job processing is handled by PM2 server/video-worker.js. This function is disabled.",
      note: "Use create-video-job.js to enqueue jobs, server/video-worker.js processes them"
    }),
  };

  // OLD CODE BELOW (disabled):
  /*
  // 1. Firebase
  try {
    initFirebase(logger);
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "Firebase init failed" }),
    };
  }

  const db = admin.database();
  const ref = db.ref("videoJobs");

  let pickedId = null;
  let picked = null;

  // 2. Берём первую pending-задачу
  try {
    const snapshot = await ref
      .orderByChild("status")
      .equalTo("pending")
      .limitToFirst(1)
      .once("value");

    const jobs = snapshot.val() || {};

    for (const [id, job] of Object.entries(jobs)) {
      pickedId = id;
      picked = job;
      break;
    }
  } catch (e) {
    logger.error("[video-worker] error reading videoJobs", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "error reading videoJobs" }),
    };
  }

  if (!pickedId || !picked) {
    logger.log("[video-worker] no pending jobs in videoJobs");
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, message: "no pending jobs in videoJobs" }),
    };
  }

  const safeLang = (picked.language || "ru").toLowerCase();

  logger.log(
    "[video-worker] picked job",
    pickedId,
    safeLang,
    picked.topic || ""
  );

  const jobRef = ref.child(pickedId);

  try {
    await jobRef.update({
      status: "processing",
      startedAt: Date.now(),
    });
  } catch (e) {
    logger.error("[video-worker] error updating job to processing", e);
  }

  // 3. Генерация видео через pipeline
  const { runPipeline } = require("../../media/scripts/pipeline");

  let pipelineResult = null;

  try {
    pipelineResult = await runPipeline({
      script: picked.script,
      lang: safeLang,
      logger,
      stamp: Date.now(),
    });
  } catch (e) {
    logger.error("[video-worker] pipeline error", e);
    try {
      await jobRef.update({
        status: "error",
        errorMessage: String(e && e.message ? e.message : e),
        finishedAt: Date.now(),
      });
    } catch (_) {}

    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "pipeline error" }),
    };
  }

  logger.log("[video-worker] pipeline finished", {
    lang: safeLang,
    videoPath: pipelineResult && pipelineResult.videoPath,
  });

  const caption =
    picked.caption ||
    picked.topic ||
    "NovaCiv — novaciv.space. Цифровая цивилизация без правителей.";

  // ✳️ МАРКЕР ПЕРЕД ТЕЛЕГРАМОЙ
  const chatIdForLog = getTelegramChatIdForLang(safeLang);
  logger.log("[video-worker] BEFORE TELEGRAM", {
    lang: safeLang,
    chatId: chatIdForLog,
    videoPath: pipelineResult && pipelineResult.videoPath,
  });

  // 4. Отправка в Telegram
  try {
    await sendTelegramVideo({
      lang: safeLang,
      videoPath: pipelineResult.videoPath,
      caption,
      logger,
    });

    // ✳️ МАРКЕР УСПЕХА
    logger.log("[video-worker] AFTER TELEGRAM success");
  } catch (e) {
    // ✳️ МАРКЕР ОШИБКИ
    logger.error("[video-worker] AFTER TELEGRAM error", e);

    // не падаем из-за телеги: помечаем job как error, но возвращаем 200
    try {
      await jobRef.update({
        status: "error",
        errorMessage: "telegram send error",
        finishedAt: Date.now(),
      });
    } catch (_) {}

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: false,
        error: "telegram send error",
        pickedId,
      }),
    };
  }

  // 5. Обновляем статус job
  try {
    await jobRef.update({
      status: "done",
      finishedAt: Date.now(),
      videoPath: pipelineResult.videoPath,
    });
  } catch (e) {
    logger.error("[video-worker] error updating job to done", e);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      id: pickedId,
      lang: safeLang,
      message: "video generated and posted",
      pipeline: pipelineResult,
    }),
  };
  */
}

module.exports = { handler };
