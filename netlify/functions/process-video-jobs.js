// netlify/functions/process-video-jobs.js

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

// наш конвейер генерации видео
const { runPipeline } = require("../../media/scripts/pipeline");

let initialized = false;

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
        "FIREBASE_DB_URL или FIREBASE_DATABASE_URL не задана (Firebase Realtime DB URL)"
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: dbUrl,
    });

    initialized = true;
  }
  return admin.database();
}

// выбираем одну задачу со статусом "pending" ИЛИ "processing"
async function getNextJob(db) {
  const snapshot = await db.ref("videoJobs").once("value");
  const val = snapshot.val();
  if (!val) return null;

  const entries = Object.entries(val);

  // сортируем по времени создания (FIFO)
  entries.sort((a, b) => {
    const aCreated = a[1].createdAt || 0;
    const bCreated = b[1].createdAt || 0;
    return aCreated - bCreated;
  });

  // берём первую задачу, которая ещё не завершена
  for (const [key, job] of entries) {
    const status = (job.status || "pending").toLowerCase();

    // обрабатываем и "pending", и старые "processing"
    if (status === "pending" || status === "processing") {
      return { key, job };
    }
  }

  return null;
}

// выбор правильного чата по языку
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

  captionLines.push("");
  captionLines.push("https://novaciv.space");

  form.append("caption", captionLines.join("\n"));

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

// -------------------- YOUTUBE helpers (как были) --------------------
// (оставляем без изменений)
… весь твой блок YouTube … 

// -------------------- MAIN HANDLER --------------------

exports.handler = async () => {
  try {
    const db = initFirebase();

    // 1. ищем любую активную задачу (pending или processing)
    const next = await getNextJob(db);
    if (!next) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, message: "no pending jobs" }),
      };
    }

    const { key, job } = next;
    const lang = job.language || "ru";

    // 2. помечаем как "processing"
    await db.ref(`videoJobs/${key}`).update({
      status: "processing",
      processingStartedAt: Date.now(),
    });

    // 3. запускаем конвейер: передаём язык + текст для озвучки
    const result = await runPipeline(console, {
      lang,
      script: job.script || "",
    });

    const finalPath =
      result.videoPath || result.outputPath || result.finalVideoPath;
    if (!finalPath) {
      throw new Error("Pipeline did not return final video path");
    }

    // 4. пробуем залить в YouTube (если включено флагом)
    try {
      const quoteForTitle =
        job.script || job.topic || result.quote || `NovaCiv — ${lang}`;
      await uploadToYouTube(finalPath, lang, quoteForTitle);
    } catch (e) {
      console.error("YouTube upload failed (non-fatal):", e);
    }

    // 5. шлём в Telegram
    await sendToTelegram(finalPath, job);

    // 6. обновляем мету
    await db.ref("videoJobsMeta").update({
      lastLang: lang,
      updatedAt: Date.now(),
    });

    // 7. удаляем задачу
    await db.ref(`videoJobs/${key}`).remove();

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, processed: key }),
    };
  } catch (err) {
    console.error("process-video-jobs error:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
