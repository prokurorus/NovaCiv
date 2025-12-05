// netlify/functions/process-video-jobs.js

const admin = require("firebase-admin");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const axios = require("axios");
const FormData = require("form-data");

let initialized = false;
let openai;

function init() {
  if (!initialized) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    }
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });

    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    initialized = true;
  }
}

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

async function generateVideo(job) {
  // 1. создаём видео через Sora
  const videoJob = await openai.videos.create({
    model: "sora-2",
    prompt: job.prompt,
    size: "720x1280",
    seconds: "8",
  });

  let current;
  // 2. ждём, пока job станет completed
  for (;;) {
    current = await openai.videos.retrieve(videoJob.id);
    if (current.status === "completed") break;
    if (current.status === "failed") {
      throw new Error("Video generation failed: " + JSON.stringify(current.error));
    }
    // немного подождать перед следующей проверкой
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 3. качаем контент
  const response = await openai.videos.downloadContent(videoJob.id);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const videoPath = path.join("/tmp", `video-${videoJob.id}.mp4`);
  fs.writeFileSync(videoPath, buffer);

  return videoPath;
}

async function generateVoice(job) {
  const speechResponse = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: job.script,
  });

  const speechBuffer = Buffer.from(await speechResponse.arrayBuffer());
  const audioPath = path.join("/tmp", `voice-${job.id}.mp3`);
  fs.writeFileSync(audioPath, speechBuffer);

  return audioPath;
}

function mergeVideoAndAudio(videoPath, audioPath, outputPath) {
  // ffmpeg должен быть доступен в среде (binary в репо или layer)
  const cmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest "${outputPath}"`;
  execSync(cmd, { stdio: "inherit" });
}

async function sendToTelegram(finalVideoPath, job) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;  // @channelusername или id

  if (!botToken || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID not set");
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

    const pending = await getPendingJob(db);
    if (!pending) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, message: "no pending jobs" }),
      };
    }

    const { key, job } = pending;

    console.log("Processing video job", key);

    // помечаем как "processing", чтобы не взяли второй раз
    await db.ref(`videoJobs/${key}/status`).set("processing");

    const videoPath = await generateVideo(job);
    const audioPath = await generateVoice(job);

    const finalPath = path.join("/tmp", `final-${job.id}.mp4`);
    mergeVideoAndAudio(videoPath, audioPath, finalPath);

    await sendToTelegram(finalPath, job);

    // после успешной отправки — удаляем задание (как ты и хотел)
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
