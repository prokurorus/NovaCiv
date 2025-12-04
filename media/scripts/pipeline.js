// media/scripts/pipeline.js
// Главный конвейер NovaCiv: цитата → картинка → анимация → голос → видео

const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const fetch = require("node-fetch");

// ---------- БАЗОВЫЕ НАСТРОЙКИ ----------

const MEDIA_ROOT = path.resolve(__dirname, ".."); // .../media
const PRESET_PATH = path.join(MEDIA_ROOT, "shorts-presets", "short_auto_citation.json");

const STATE_PATH = path.join(__dirname, "pipeline_state.json");

const DIR_STATIC = path.join(MEDIA_ROOT, "backgrounds", "static");
const DIR_ANIM = path.join(MEDIA_ROOT, "backgrounds", "animated");
const DIR_AUDIO = path.join(MEDIA_ROOT, "audio");
const DIR_OUTPUT = path.join(MEDIA_ROOT, "output");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DOMOVOY_API_URL = process.env.DOMOVOY_API_URL; // например: https://novaciv.space/.netlify/functions/domovoy-quote

if (!OPENAI_API_KEY) {
  console.error("❌ Не задан OPENAI_API_KEY");
  process.exit(1);
}
if (!DOMOVOY_API_URL) {
  console.error("❌ Не задан DOMOVOY_API_URL");
  process.exit(1);
}

// ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ----------

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function execFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, (err, stdout, stderr) => {
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

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// ---------- РОТАЦИЯ ЯЗЫКОВ ----------
// EN каждый второй ролик, между ними: RU → DE → ES → RU …

const ROTATION = {
  primary: "en",
  primaryInterval: 2,
  others: ["ru", "de", "es"],
};

async function getNextLanguage() {
  let state = { counter: 0 };
  try {
    state = await readJson(STATE_PATH);
  } catch (_) {}

  const c = state.counter || 0;
  let lang;

  if ((c + 1) % ROTATION.primaryInterval === 0) {
    lang = ROTATION.primary;
  } else {
    const idx = Math.floor(c / ROTATION.primaryInterval) % ROTATION.others.length;
    lang = ROTATION.others[idx];
  }

  state.counter = c + 1;
  await writeJson(STATE_PATH, state);
  return lang;
}

// ---------- 1. ЦИТАТА ОТ ДОМОВОГО ----------

async function getQuoteFromDomovoy(lang, options) {
  const url = new URL(DOMOVOY_API_URL);
  url.searchParams.set("lang", lang);
  if (options?.from) url.searchParams.set("from", options.from.join(","));
  if (options?.max_chars) url.searchParams.set("max_chars", String(options.max_chars));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Domovoy quote error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.text) throw new Error("Domovoy response has no 'text'");
  return data.text;
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

// ---------- ГЛАВНАЯ ФУНКЦИЯ PIPELINE ----------

async function main() {
  console.log("🚀 NovaCiv pipeline start");

  const preset = await readJson(PRESET_PATH);
  const lang = await getNextLanguage();
  console.log("🌐 Language:", lang);

  const textOptions = preset.text_source?.options || {};
  const quote = await getQuoteFromDomovoy(lang, textOptions);
  console.log("💬 Quote:", quote);

  const imagePath = await generateImageForQuote(quote, lang);
  console.log("🖼 Image:", imagePath);

  const bgVideoPath = await animateImage(imagePath, preset.length_target_sec || 40);
  console.log("🎞 Animated bg:", bgVideoPath);

  const voicePresetName = preset.voice_presets[lang];
  const audioPath = await generateSpeech(quote, lang, voicePresetName);
  console.log("🔊 Audio:", audioPath);

  const finalVideo = await muxAudioVideo(bgVideoPath, audioPath, lang);
  console.log("✅ Done:", finalVideo);
}

main().catch((err) => {
  console.error("❌ Pipeline failed:", err);
  process.exit(1);
});
