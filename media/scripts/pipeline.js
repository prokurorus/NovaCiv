// media/scripts/pipeline.js
// Автоконвейер NovaCiv: цитата → голос → фон-картинка → видео (вертикальный ролик)

const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

// Вертикальный размер попроще — чтобы быстрее рендерилось
const VIDEO_SIZE = "720x1280";

// ---------- Универсальный fetch ----------

const fetchFn =
  (typeof fetch !== "undefined" && fetch) ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

// ---------- Пути (Netlify может писать только в /tmp) ----------

const WRITABLE_ROOT = "/tmp/novaciv-media";
const DIR_AUDIO = path.join(WRITABLE_ROOT, "audio");
const DIR_OUTPUT = path.join(WRITABLE_ROOT, "output");
const DIR_IMAGES = path.join(WRITABLE_ROOT, "images"); // пока не используется, но пусть будет

// Фоны лежат в репозитории: media/backgrounds
const BACKGROUNDS_ROOT = path.join(__dirname, "..", "backgrounds");

// Пресет для шортов (лежит в репо, читаем как обычный файл только для настроек)
const PRESET_PATH = path.join(
  __dirname,
  "..",
  "shorts-presets",
  "short_auto_citation.json"
);

// ---------- ENV ----------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const DOMOVOY_API_URL = process.env.DOMOVOY_API_URL;

function ensureEnv() {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  if (!OPENAI_TTS_MODEL) throw new Error("OPENAI_TTS_MODEL is not set");
}

// Гарантируем каталоги в /tmp
async function ensureAllDirs() {
  for (const dir of [WRITABLE_ROOT, DIR_AUDIO, DIR_OUTPUT, DIR_IMAGES]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

// ---------- Утилиты ----------

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
  try {
    const raw = await fs.readFile(PRESET_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    // Если файла нет — используем дефолт
    return {
      text_source: { options: { max_chars: 420 } },
    };
  }
}

// fetch с таймаутом
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ---------- Локальные фоновые картинки ----------

async function pickBackgroundForLang(lang) {
  const candidates = [];

  async function collectFromDir(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        const lower = e.name.toLowerCase();
        if (
          lower.endsWith(".png") ||
          lower.endsWith(".jpg") ||
          lower.endsWith(".jpeg")
        ) {
          candidates.push(path.join(dirPath, e.name));
        }
      }
    } catch {
      // каталога может не быть — это нормально
    }
  }

  // сначала media/backgrounds/{lang}, потом media/backgrounds
  await collectFromDir(path.join(BACKGROUNDS_ROOT, lang));
  await collectFromDir(BACKGROUNDS_ROOT);

  if (candidates.length === 0) {
    return null; // нет фонов — пусть будет белый
  }

  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}

// ---------- Получение цитаты ----------

async function getQuoteFromDomovoy(lang, maxChars) {
  if (!DOMOVOY_API_URL) {
    throw new Error("DOMOVOY_API_URL is not set");
  }

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
          question,
          history: [],
          lang,
          page: "/shorts/auto-citation",
        }),
      },
      10000
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

async function getQuoteViaOpenAI(lang, maxChars) {
  const systemPrompt = `
Ты — голос цифрового сообщества NovaCiv.
Создай одну короткую, законченной мыслью цитату для ролика до ${maxChars} символов.
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

  try {
    return await getQuoteFromDomovoy(lang, maxChars);
  } catch (err) {
    console.error("Domovoy quote error, fallback to OpenAI:", err.message);
  }

  return await getQuoteViaOpenAI(lang, maxChars);
}

// ---------- Синтез голоса ----------

async function synthesizeSpeech(text, lang) {
  const outFile = path.join(DIR_AUDIO, `nova_voice_${Date.now()}.mp3`);

  const payload = {
    model: OPENAI_TTS_MODEL,
    voice: "alloy",
    format: "mp3",
    input: text,
  };

  try {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      12000
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenAI TTS HTTP ${response.status}: ${errText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outFile, buffer);
    return outFile;
  } catch (err) {
    console.error("TTS error:", err);
    throw new Error("TTS generation failed: " + (err.message || String(err)));
  }
}

// ---------- Сборка видео (фон: картинка или белый) ----------

async function createVideoWithSimpleBackground(audioPath) {
  const fileName = `nova_short_${Date.now()}.mp4`;
  const outPath = path.join(DIR_OUTPUT, fileName);

  const ffmpegArgs = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=white:s=${VIDEO_SIZE}`,
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

  await execFfmpeg(ffmpegArgs);

  return { fileName, outPath };
}

async function createVideoWithImageBackground(imagePath, audioPath) {
  const fileName = `nova_short_${Date.now()}.mp4`;
  const outPath = path.join(DIR_OUTPUT, fileName);

  // 1) Масштабируем так, чтобы картинка полностью покрывала 720x1280,
  //    сохраняя пропорции (increase = не сжимать по меньшей стороне).
  // 2) Обрезаем лишнее до точного размера 720x1280.
  // 3) Приводим к формату yuv420p для максимальной совместимости.
  const filter =
    "scale=720:1280:force_original_aspect_ratio=increase," +
    "crop=720:1280," +
    "format=yuv420p";

  const ffmpegArgs = [
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-i",
    audioPath,
    "-vf",
    filter,
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

  await execFfmpeg(ffmpegArgs);

  return { fileName, outPath };
}

// ---------- Главная функция конвейера ----------

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

  // пробуем взять фон из репозитория
  const bgPath = await pickBackgroundForLang(lang);
  if (bgPath) {
    logger.log("🖼️ Using background image from repo:", bgPath);
  } else {
    logger.log("🖼️ No background images found, using white background");
  }

  const video = bgPath
    ? await createVideoWithImageBackground(bgPath, audioPath)
    : await createVideoWithSimpleBackground(audioPath);

  logger.log("🎬 Video path:", video.outPath);

  return {
    ok: true,
    lang,
    quote,
    audioPath,
    imagePath: bgPath || null,
    videoFile: video.fileName,
    videoPath: video.outPath,
  };
}

module.exports = {
  runPipeline,
};
