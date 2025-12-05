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

    // 2. помечаем как "processing" (ещё раз, даже если уже был такой статус)
    await db.ref(`videoJobs/${key}`).update({
      status: "processing",
      processingStartedAt: Date.now(),
    });

    // 3. запускаем конвейер
    const result = await runPipeline(console, { lang });

    const finalPath =
      result.videoPath || result.outputPath || result.finalVideoPath;
    if (!finalPath) {
      throw new Error("Pipeline did not return final video path");
    }

    // 4. шлём в Telegram
    await sendToTelegram(finalPath, job);

    // 5. обновляем мету
    await db.ref("videoJobsMeta").update({
      lastLang: lang,
      updatedAt: Date.now(),
    });

    // 6. удаляем задачу (как ты и хотел, чтобы БД не росла бесконечно)
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
// -------------------- YOUTUBE UPLOAD HELPERS --------------------

const fs = require("fs");

// читаем настройки для YouTube из окружения
const YT_UPLOAD_ENABLED =
  (process.env.YOUTUBE_UPLOAD_ENABLED || "").toLowerCase() === "true";
const YT_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YT_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YT_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

/**
 * Получаем access_token по refresh_token
 */
async function getYouTubeAccessToken() {
  const body = new URLSearchParams({
    client_id: YT_CLIENT_ID,
    client_secret: YT_CLIENT_SECRET,
    refresh_token: YT_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const localFetch =
    typeof fetch !== "undefined" ? fetch : (await import("node-fetch")).default;

  const res = await localFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error("YouTube token error", res.status, data);
    throw new Error("Failed to get YouTube access token");
  }

  return data.access_token;
}

/**
 * Строим заголовок ролика в зависимости от языка и цитаты
 */
function buildYouTubeTitle(language, quote) {
  const baseTitleByLang = {
    ru: "NovaCiv — цифровая цивилизация",
    en: "NovaCiv — Digital Civilization",
    de: "NovaCiv — Digitale Zivilisation",
    es: "NovaCiv — Civilización digital",
  };

  const base = baseTitleByLang[language] || baseTitleByLang.en;
  const cleanQuote = (quote || "").replace(/\s+/g, " ").trim();
  const shortQuote =
    cleanQuote.length > 70 ? cleanQuote.slice(0, 67).trimEnd() + "…" : cleanQuote;

  return shortQuote ? `${base}: ${shortQuote}` : base;
}

/**
 * Основная функция загрузки видео в YouTube
 * Возвращает URL ролика или null
 */
async function uploadToYouTube(videoPath, language, quote) {
  try {
    if (!YT_UPLOAD_ENABLED) {
      console.log("[YouTube] upload disabled by YOUTUBE_UPLOAD_ENABLED");
      return null;
    }

    if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
      console.warn("[YouTube] missing credentials env vars");
      return null;
    }

    const localFetch =
      typeof fetch !== "undefined"
        ? fetch
        : (await import("node-fetch")).default;

    const accessToken = await getYouTubeAccessToken();

    const defaultLanguage =
      language === "ru" || language === "de" || language === "es"
        ? language
        : "en";

    const title = buildYouTubeTitle(language, quote);
    const description =
      (quote || "").trim() +
      "\n\n" +
      "NovaCiv — digital civilization without rulers.\n" +
      "https://novaciv.space";

    const snippet = {
      title,
      description,
      defaultLanguage,
      categoryId: "27", // Education
    };

    const status = {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
    };

    // 1) Инициализируем резюмируемую загрузку
    const initRes = await localFetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify({ snippet, status }),
      }
    );

    const initData = await initRes.json().catch(() => ({}));
    const uploadUrl = initRes.headers.get("location");

    if (!initRes.ok || !uploadUrl) {
      console.error("[YouTube] init upload failed", initRes.status, initData);
      throw new Error("YouTube init upload failed");
    }

    // 2) Читаем файл и отправляем его на upload URL
    const videoBuffer = await fs.promises.readFile(videoPath);

    const uploadRes = await localFetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(videoBuffer.length),
      },
      body: videoBuffer,
    });

    const uploadData = await uploadRes.json().catch(() => ({}));

    if (!uploadRes.ok || !uploadData.id) {
      console.error("[YouTube] upload failed", uploadRes.status, uploadData);
      throw new Error("YouTube upload failed");
    }

    const videoId = uploadData.id;
    const videoUrl = `https://youtube.com/shorts/${videoId}`;

    console.log("[YouTube] uploaded successfully", videoUrl);

    return videoUrl;
  } catch (err) {
    console.error("[YouTube] upload error", err);
    return null;
  }
}

