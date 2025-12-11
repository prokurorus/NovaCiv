// server/video-worker.js
//
// Фоновый видео-воркер для отдельного сервера.
// Берёт задачи из Firebase (videoJobs), рендерит видео через pipeline,
// отправляет в Telegram, отмечает задачу как done/error.

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const admin = require("firebase-admin");

// Подтягиваем наш же pipeline
const { runPipeline } = require("../media/scripts/pipeline");

// --- Инициализация Firebase --- //

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

const dbUrl =
  process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;

if (!dbUrl) {
  throw new Error("FIREBASE_DB_URL / FIREBASE_DATABASE_URL is not set");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: dbUrl,
});

const db = admin.database();
const jobsRef = db.ref("videoJobs");

console.log("[worker] Firebase initialized with", dbUrl);

// --- Телега --- //

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

async function sendTelegramVideo({ lang, videoPath, caption }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = getTelegramChatIdForLang(lang);

  if (!token || !chatId) {
    console.log(
      "[telegram] missing TELEGRAM_BOT_TOKEN or chat id, skipping send",
      { lang, chatId: !!chatId, token: !!token }
    );
    return;
  }

  if (!fs.existsSync(videoPath)) {
    console.log("[telegram] video file not found", videoPath);
    return;
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption || "");
  form.append("supports_streaming", "true");
  form.append("video", fs.createReadStream(videoPath));

  const url = `https://api.telegram.org/bot${token}/sendVideo`;

  console.log("[telegram] sending video to", chatId);

  try {
    const resp = await axios.post(url, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log("[telegram] sent, ok =", resp.data && resp.data.ok);
  } catch (err) {
    if (err.response) {
      console.error(
        "[telegram] send error",
        err.response.status,
        err.response.data
      );
    } else {
      console.error("[telegram] send error", err);
    }
    throw err;
  }
}

// --- Обработка одной задачи --- //

async function processOneJob() {
  console.log("[worker] checking for pending jobs...");

  const snapshot = await jobsRef
    .orderByChild("status")
    .equalTo("pending")
    .limitToFirst(1)
    .once("value");

  const jobs = snapshot.val() || null;
  if (!jobs) {
    console.log("[worker] no pending jobs");
    return;
  }

  const [id, job] = Object.entries(jobs)[0];
  const safeLang = (job.language || "ru").toLowerCase();

  console.log(
    "[worker] picked job",
    id,
    safeLang,
    job.topic ? job.topic : ""
  );

  const jobRef = jobsRef.child(id);

  await jobRef.update({
    status: "processing",
    startedAt: Date.now(),
  });

  try {
    // запускаем наш общий pipeline
    const pipelineResult = await runPipeline({
      script: job.script,
      lang: safeLang,
      logger: console,
      stamp: Date.now(),
    });

    console.log("[worker] pipeline finished", {
      // --- YOUTUBE UPLOAD ---
      try {
        const uploadToYouTube = require("./youtube");
        const ytId = await uploadToYouTube(result.videoPath, job.title);
        console.log("[youtube] uploaded:", ytId);
      } catch (err) {
        console.error("[youtube] error:", err);
      }

      lang: safeLang,
      videoPath: pipelineResult && pipelineResult.videoPath,
    });

    const caption =
      job.caption ||
      job.topic ||
      "NovaCiv — novaciv.space. Цифровая цивилизация без правителей.";

    await sendTelegramVideo({
      lang: safeLang,
      videoPath: pipelineResult.videoPath,
      caption,
    });

    await jobRef.update({
      status: "done",
      finishedAt: Date.now(),
      videoPath: pipelineResult.videoPath,
    });

    console.log("[worker] job done", id);
  } catch (e) {
    console.error("[worker] error processing job", id, e);
    await jobRef.update({
      status: "error",
      errorMessage: String(e && e.message ? e.message : e),
      finishedAt: Date.now(),
    });
  }
}

// --- Бесконечный цикл --- //

async function loop() {
  console.log("[worker] loop started");

  while (true) {
    try {
      await processOneJob();
    } catch (e) {
      console.error("[worker] loop error", e);
    }

    // пауза между проверками очереди
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}

loop().catch((err) => {
  console.error("[worker] fatal error", err);
  process.exit(1);
});
