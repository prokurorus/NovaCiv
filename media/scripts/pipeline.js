// media/scripts/pipeline.js
// Автоконвейер NovaCiv: цитата → голос → видео (вертикальный ролик)

const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

// Универсальный fetch: в Netlify (Node 18+) используем глобальный,
// локально — динамический импорт node-fetch при необходимости.
const fetchFn =
  (typeof fetch !== "undefined" && fetch) ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

// --------- КОНФИГ ПУТЕЙ ---------

// В Netlify функция может писать только в /tmp
const WRITABLE_ROOT = "/tmp/novaciv-media";

const DIR_AUDIO = path.join(WRITABLE_ROOT, "audio");
const DIR_OUTPUT = path.join(WRITABLE_ROOT, "output");

// Пресет для шортов
const PRESET_PATH = path.join(
  __dirname,
  "..",
  "shorts-presets",
  "short_auto_citation.json"
);

// --------- ENV ---------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const DOMOVOY_API_URL = process.env.DOMOVOY_API_URL;

// Проверка env
function ensureEnv() {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!OPENAI_TTS_MODEL) {
    throw new Error("OPENAI_TTS_MODEL is not set");
  }
  // DOMOVOY_API_URL можем не требовать жёстко — есть fallback
}

// Гарантируем наличие всех нужных директорий в /tmp
async function ensureAllDirs() {
  for (const dir of [WRITABLE_ROOT, DIR_AUDIO, DIR_OUTPUT]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

// --------- УТИЛИТЫ ---------

function execFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

async function loadPreset() {
  const raw = await fs.readFile(PRESET_PATH, "utf8");
  return JSON.parse(raw);
}

// Обёртка над fetch с таймаутом
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}


// --------- БЛОК: получение цитаты ---------

async function getQuoteFromDomovoy(lang, maxChars) {
  if (!DOMOVOY_API_URL) {
    throw new Error("DOMOVOY_API_URL is not set");
  }

  // Базовые промпты для разных языков
  const templates = {
    ru: `Сформулируй одну короткую, но содержательную цитату (до ${maxChars} символов) от имени сообщества NovaCiv. Это должна быть законченная мысль, которая звучит как фраза для видео.`,
    en: `Create one short but meaningful quote (up to ${maxChars} characters) on behalf of NovaCiv. It should be a complete thought that sounds like a line for a video.`,
    de: `Formuliere ein kurzes, aber bedeutungsvolles Zitat (bis zu ${maxChars} Zeichen) im Namen von NovaCiv. Es soll ein abgeschlossener Gedanke sein, der wie eine Zeile für ein Video klingt.`,
    es: `Crea una cita corta pero significativa (hasta ${maxChars} caracteres) en nombre de NovaCiv. Debe ser una idea completa que suene como una frase para un video.`,
  };

  const fallbackQuotes = {
    ru: "NovaCiv — это попытка построить цивилизацию, в которой власть принадлежит не правителям, а сознательным гражданам.",
    en: "NovaCiv is a quiet attempt to build a civilization where power belongs not to rulers, but to conscious citizens.",
    de: "NovaCiv ist ein Versuch, eine Zivilisation aufzubauen, in der die Macht nicht Herrschern, sondern bewussten Bürgern gehört.",
    es: "NovaCiv es un intento de crear una civilización donde el poder pertenezca no a los gobernantes, sino a los ciudadanos conscientes.",
  };

  const question = templates[lang] || templates.en;
  const fallback = fallbackQuotes[lang] || fallbackQuotes.en;

  try {
    const res = await fetchWithTimeout(
      DOMOVOY_API_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,           // Домовой читает именно это поле
          history: [],
          lang,
          page: "/shorts/auto-citation",
        }),
      },
      10000 // ⏱ ждём максимум 10 секунд
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Domovoy HTTP ${res.status}: ${txt}`);
    }

    const data = await res.json().catch(() => ({}));
    const text =
      data.answer || data.reply || data.message || data.text || data.result;

    if (!text || typeof text !== "string") {
      throw new Error("Domovoy returned empty or invalid answer");
    }

    return text.trim();
  } catch (err) {
    console.error("Domovoy quote error, using fallback:", err);
    return fallback;
  }
}


// Fallback: напрямую через OpenAI, если Домовой не сработал
async function getQuoteViaOpenAI(lang, maxChars) {
  const systemPrompt = `
Ты — голос цифрового сообщества NovaCiv.
Создай одну короткую, законченный мыслью цитату для ролика до ${maxChars} символов.
Цитата должна быть понятна без контекста и отражать ценности свободы, ненасилия, прямой демократии и ценности разума.
Не добавляй никаких пояснений, только сам текст цитаты.
`;

  const userPrompt =
    lang === "ru"
      ? "Создай одну цитату от имени сообщества NovaCiv."
      : "Create one quote on behalf of the NovaCiv community.";

  const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt.trim() },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 256,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI quote HTTP ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return String(text).trim();
}

async function getQuote(preset, lang) {
  const maxChars = preset?.text_source?.options?.max_chars || 420;

  // 1) Пытаемся через Домового
  try {
    return await getQuoteFromDomovoy(lang, maxChars);
  } catch (err) {
    console.error("Domovoy quote error, fallback to OpenAI:", err.message);
  }

  // 2) Fallback напрямую через OpenAI
  return await getQuoteViaOpenAI(lang, maxChars);
}

// --------- БЛОК: синтез голоса ---------

async function synthesizeSpeech(text, lang) {
  const fileName = `nova_voice_${Date.now()}.mp3`;
  const outPath = path.join(DIR_AUDIO, fileName);

  const res = await fetchFn("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice: "alloy",
      input: text,
      format: "mp3",
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS HTTP ${res.status}: ${txt}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(outPath, buffer);

  return outPath;
}

// --------- БЛОК: сборка видео ---------

async function createVideoWithSimpleBackground(audioPath) {
  const fileName = `nova_short_${Date.now()}.mp4`;
  const outPath = path.join(DIR_OUTPUT, fileName);

  // Вертикальное видео 1080x1920, белый фон, длительность = длительности аудио (через -shortest)
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=white:s=1080x1920",
    "-i",
    audioPath,
    "-c:v",
    "libx264",
    "-tune",
    "stillimage",
    "-c:a",
    "aac",
    "-shortest",
    "-pix_fmt",
    "yuv420p",
    outPath,
  ];

  await execFfmpeg(args);
  return { fileName, outPath };
}


// --------- ГЛАВНАЯ ФУНКЦИЯ КОНВЕЙЕРА ---------

async function runPipeline(logger = console, options = {}) {
  ensureEnv();
  await ensureAllDirs();

  const lang = options.lang || "ru";

  logger.log("🚀 NovaCiv media pipeline started", { lang });

  const preset = await loadPreset();

  const quote = await getQuote(preset, lang);
  logger.log("📝 Quote:", quote);

  const audioPath = await synthesizeSpeech(quote, lang);
  logger.log("🎧 Audio path:", audioPath);

  const video = await createVideoWithSimpleBackground(audioPath);
  logger.log("🎬 Video path:", video.outPath);

  return {
    ok: true,
    lang,
    quote,
    audioPath,
    videoFile: video.fileName,
    videoPath: video.outPath,
  };
}

module.exports = {
  runPipeline,
};
