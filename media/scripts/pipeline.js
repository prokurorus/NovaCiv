// media/scripts/pipeline.js
// Главный конвейер NovaCiv: цитата → картинка → анимация → голос → видео

const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
// Универсальный fetch: в Netlify/Node 18 берём глобальный,
// локально при необходимости подгружаем node-fetch через dynamic import.
const fetch =
  globalThis.fetch ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

const ffmpegPath = require("ffmpeg-static");

// ---------- БАЗОВЫЕ ПУТИ ----------

const MEDIA_ROOT = path.resolve(__dirname, ".."); // .../media
// В облаке писать можно только в /tmp, локально — в сам проект
const WRITABLE_ROOT =
  process.env.NETLIFY === "true" ? "/tmp/novaciv-media" : MEDIA_ROOT;

const PRESET_PATH = path.join(MEDIA_ROOT, "shorts-presets", "short_auto_citation.json");

const DIR_STATIC = path.join(WRITABLE_ROOT, "backgrounds", "static");
const DIR_ANIM = path.join(WRITABLE_ROOT, "backgrounds", "animated");
const DIR_AUDIO = path.join(WRITABLE_ROOT, "audio");
const DIR_OUTPUT = path.join(WRITABLE_ROOT, "output");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DOMOVOY_API_URL = process.env.DOMOVOY_API_URL; // например: https://novaciv.space/.netlify/functions/domovoy-quote

// ---------- ГАРАНТИРОВАННОЕ СОЗДАНИЕ ВСЕХ ПАПОК ----------
async function ensureAllDirs() {
  await fs.mkdir(DIR_STATIC, { recursive: true });
  await fs.mkdir(DIR_ANIM, { recursive: true });
  await fs.mkdir(DIR_AUDIO, { recursive: true });
  await fs.mkdir(DIR_OUTPUT, { recursive: true });
}


async function ensureEnv() {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!DOMOVOY_API_URL) {
    throw new Error("DOMOVOY_API_URL is not set");
  }
}

// ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ----------

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function execFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (err, stdout, stderr) => {
      if (err) {
        console.error("FFmpeg error:", stderr.toString());
        return reject(err);
      }
      resolve(stdout.toString());
    });
  });
}

async function readJson(file) {
  const txt = await fs.readFile(file, "utf8");
  return JSON.parse(txt);
}

// ---------- РОТАЦИЯ ЯЗЫКОВ ----------
// Без файлов — просто детерминированная последовательность по времени.
// EN каждый второй ролик, между ними: RU → DE → ES → RU …

const ROTATION = {
  primary: "en",
  primaryInterval: 2,
  others: ["ru", "de", "es"],
};

function getNextLanguage() {
  // шаг счётчика ~по 6 минут, но это не критично — важно лишь чередование
  const counter = Math.floor(Date.now() / (1000 * 60 * 6));

  let lang;
  if ((counter + 1) % ROTATION.primaryInterval === 0) {
    lang = ROTATION.primary;
  } else {
    const idx = Math.floor(counter / ROTATION.primaryInterval) % ROTATION.others.length;
    lang = ROTATION.others[idx];
  }
  return lang;
}

// ---------- 1. ЦИТАТА ОТ ДОМОВОГО ----------

async function getQuoteFromDomovoy(lang, options) {
  const maxChars = options?.max_chars || 420;

  const templates = {
    ru: `Сформулируй одну короткую вдохновляющую цитату (до ${maxChars} символов) на русском языке, основанную на Манифесте и Уставе цифрового сообщества NovaCiv. Говори от первого лица от имени NovaCiv. Не добавляй пояснений, только текст цитаты.`,
    en: `Create one short inspiring quote (up to ${maxChars} characters) in English, based on the Manifesto and Charter of the digital community NovaCiv. Speak in the first person as NovaCiv itself. No explanations, only the quote text.`,
    de: `Formuliere ein kurzes inspirierendes Zitat (bis zu ${maxChars} Zeichen) auf Deutsch, basierend auf dem Manifest und der Charta der digitalen Gemeinschaft NovaCiv. Sprich in der Ich-Form im Namen von NovaCiv. Keine Erklärungen, nur den Text des Zitats.`,
    es: `Crea una cita corta e inspiradora (hasta ${maxChars} caracteres) en español, basada en el Manifiesto y la Carta de la comunidad digital NovaCiv. Habla en primera persona como si fueras NovaCiv. Sin explicaciones, solo el texto de la cita.`,
  };

  const question = templates[lang] || templates.en;

  const body = {
    lang,
    question,
    history: [],
    page: "/shorts/auto-citation",
  };

  const res = await fetch(DOMOVOY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Domovoy quote error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text = data.answer || data.text;
  if (!text) {
    throw new Error("Domovoy response has no 'answer'");
  }

  // На всякий случай чуть подрежем, если вышло длиннее лимита
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}


// ---------- 2. ГЕНЕРАЦИЯ КАРТИНКИ (OpenAI Images) ----------

async function generateImageForQuote(text, lang) {
  await ensureDir(DIR_STATIC);
  const prompt = `Ultra-minimalistic white embossed bas-relief abstract background, vertical 9:16, calm futuristic style, no text, no color, high detail. Theme hint: ${text.slice(
    0,
    160
  )}`;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1792",
      n: 1,
    }),
  });

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error("OpenAI image error: " + errTxt);
  }

  const data = await res.json();
  const b64 = data.data[0].b64_json;
  const buf = Buffer.from(b64, "base64");
  const filename = `bg_${Date.now()}_${lang}.png`;
  const fullPath = path.join(DIR_STATIC, filename);
  await fs.writeFile(fullPath, buf);
  return fullPath;
}

// ---------- 3. АНИМАЦИЯ КАРТИНКИ В ВИДЕО-ЛУП ----------

async function animateImage(imagePath, durationSec) {
  await ensureDir(DIR_ANIM);
  const outPath = path.join(
    DIR_ANIM,
    path.basename(imagePath).replace(/\.(png|jpg|jpeg)$/i, "_loop.mp4")
  );

  // Эффект: лёгкий zoom + breathing light
  const filter =
    `zoompan=z='min(1.1,1+0.02*t)':d=1:s=1080x1920,` +
    `format=yuv420p,` +
    `eq=brightness='0.02*sin(0.6*t)'`;

  const args = [
    "-loop",
    "1",
    "-i",
    imagePath,
    "-t",
    String(durationSec),
    "-vf",
    filter,
    "-r",
    "30",
    "-an",
    "-y",
    outPath,
  ];

  await execFfmpeg(args);
  return outPath;
}

// ---------- 4. ОЗВУЧКА (OpenAI TTS) ----------

async function generateSpeech(text, lang, voicePresetName) {
  await ensureDir(DIR_AUDIO);

  const voicePresetPath = path.join(MEDIA_ROOT, "voices", "openai", `${voicePresetName}.json`);
  const preset = await readJson(voicePresetPath);

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: preset.voice || "alloy",
      input: text,
      format: "mp3",
      language: preset.language || lang,
    }),
  });

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error("OpenAI TTS error: " + errTxt);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const outPath = path.join(DIR_AUDIO, `voice_${Date.now()}_${lang}.mp3`);
  await fs.writeFile(outPath, buf);
  return outPath;
}

// ---------- 5. СКЛЕЙКА АУДИО + ВИДЕО ----------

async function muxAudioVideo(bgVideoPath, audioPath, lang) {
  await ensureDir(DIR_OUTPUT);
  const outPath = path.join(
    DIR_OUTPUT,
    `novaciv_short_${lang}_${Date.now()}.mp4`
  );

  const args = [
    "-i",
    bgVideoPath,
    "-i",
    audioPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    outPath,
  ];

  await execFfmpeg(args);
  return outPath;
}

// ---------- ЭКСПОНИРУЕМЫЙ КОНВЕЙЕР ----------

async function runPipeline(logger = console) {
  await ensureEnv();

  logger.log("🚀 NovaCiv pipeline start");

  const preset = await readJson(PRESET_PATH);
  const lang = getNextLanguage();
  logger.log("🌐 Language:", lang);

  const textOptions = preset.text_source?.options || {};
  const quote = await getQuoteFromDomovoy(lang, textOptions);
  logger.log("💬 Quote:", quote);

  const imagePath = await generateImageForQuote(quote, lang);
  logger.log("🖼 Image:", imagePath);

  const bgVideoPath = await animateImage(imagePath, preset.length_target_sec || 40);
  logger.log("🎞 Animated bg:", bgVideoPath);

  const voicePresetName = preset.voice_presets[lang];
  const audioPath = await generateSpeech(quote, lang, voicePresetName);
  logger.log("🔊 Audio:", audioPath);

  const finalVideo = await muxAudioVideo(bgVideoPath, audioPath, lang);
  logger.log("✅ Done:", finalVideo);

  return { lang, quote, finalVideo };
}

module.exports = { runPipeline };

// Локальный запуск: node media/scripts/pipeline.js
if (require.main === module) {
  runPipeline(console).catch((err) => {
    console.error("❌ Pipeline failed:", err);
    process.exit(1);
  });
}
