// netlify/functions/process-video-jobs.js

const admin = require("firebase-admin");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

// наш уже настроенный конвейер видео NovaCiv
const { runPipeline } = require("../../media/scripts/pipeline");

let initialized = false;

function init() {
  if (!initialized) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    }
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // ВАЖНО: используем именно FIREBASE_DB_URL (как в переменных Netlify)
      databaseURL: process.env.FIREBASE_DB_URL,
    });

    initialized = true;
  }
}

// берём первое задание со статусом "pending"
async function getPendingJob(db) {
  const snapshot = await db
    .ref("videoJobs")
    .orderByChild("status")
    .equalTo("pending")
    .limitToFirst(1)
    .once("value");

  const val = snapshot.val();
  if (!val) return null;

  const key = Object.keys(val)[0];
  return { key, job: val[key] };
}

// генерируем видео через наш pipeline (без Sora)
async function generateVideoWithPipeline(job) {
  // минимальный набор полей для конвейера
  const language = job.language || "ru";
  const text = job.script;
  const topic = job.topic || "NovaCiv";

  // runPipeline уже знает, как делать короткий ролик
  // (цитата + фон + TTS + ffmpeg)
  const result = await runPipeline({
    preset: "short_auto_citation",
    language,
    quoteText: text,
    quoteSource: topic,
  });

  // подстрахуемся на случай разных имён полей
  const finalPath =
    result.finalVideoPath ||
    result.outputPath ||
    result.videoPath;

  if (!finalPath) {
    throw new Error("Pipeline did not return final video path");
  }

  return finalPath;
}

// отправка готового файла в Telegram
async function sendToTelegram(finalVideoPath, job) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID; // можно использовать канал/чат для роликов

  if (!botToken || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
  }

  const caption =
    "NovaCiv — цифровая цивилизация без правителей.\n" +
    "Войти в сознание: https://novaciv.space";

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("supports_streaming", "true");
  form.append("video", fs.createReadStream(finalVideoPath));

  const url = `https://api.telegram.org/bot${botToken}/sendVideo`;

  await axios.post(url, form, {
    headers: form.getHeaders(),
  });
}

exports.handler = async (event, context) => {
  try {
    init();
    const db = admin.database();

    // 1. ищем задание
    const pending = await getPendingJob(db);
    if (!pending) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, message: "no pending jobs" }),
      };
    }

    const { key, job } = pending;
    console.log("Processing video job", key);

    // 2. помечаем как "processing", чтобы не схватить второй раз
    await db.ref(`videoJobs/${key}/status`).set("processing");

    // 3. генерим видео через готовый ffmpeg-конвейер
    const finalPath = await generateVideoWithPipeline(job);

    // 4. шлём в Telegram
    await sendToTelegram(finalPath, job);

    // 5. удаляем задание, чтобы не забивать БД
    await db.ref(`videoJobs/${key}`).remove();

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, processed: key }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
