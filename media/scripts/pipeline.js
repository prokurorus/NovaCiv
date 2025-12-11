// media/scripts/pipeline.js
//
// Универсальный конвейер для генерации вертикального видео 9:16
// из фоновой картинки + озвученного текста (TTS через OpenAI).

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

// простой запасной текст, если вдруг script не передали
const FALLBACK_SCRIPTS = {
  ru: `
NovaCiv — это цифровая цивилизация без правителей.
Все решения принимают сами люди — открыто и прозрачно.
Зайди на novaciv точка space и подпишись на будущее планеты.
`.trim(),
  en: `
NovaCiv is a digital civilization without rulers.
Decisions are made openly by the citizens themselves.
Visit novaciv dot space and subscribe to the future of the planet.
`.trim(),
  de: `
NovaCiv ist eine digitale Zivilisation ohne Herrscher.
Alle Entscheidungen treffen die Bürger offen und transparent.
Besuche novaciv Punkt space und abonniere die Zukunft des Planeten.
`.trim(),
  es: `
NovaCiv es una civilización digital sin gobernantes.
Todas las decisiones las toman abiertamente los propios ciudadanos.
Entra en novaciv punto space y suscríbete al futuro del planeta.
`.trim(),
};

function getVoiceForLang(lang) {
  // Можно потом разнести по разным голосам
  switch ((lang || "ru").toLowerCase()) {
    case "ru":
      return "alloy";
    case "en":
      return "alloy";
    case "de":
      return "alloy";
    case "es":
      return "alloy";
    default:
      return "alloy";
  }
}

// утилита запуска ffmpeg
function runFfmpeg(args, logger = console) {
  return new Promise((resolve, reject) => {
    logger.log("[pipeline] ffmpeg start", ffmpegPath, args.join(" "));

    const proc = spawn(ffmpegPath, args);

    // Чтобы логи Netlify не задыхались, не льем весь вывод ffmpeg
    // Если что-то пойдет не так — будет код завершения != 0
    /*
    proc.stdout.on("data", (d) =>
      logger.log("[pipeline][ffmpeg stdout]", d.toString())
    );
    proc.stderr.on("data", (d) =>
      logger.log("[pipeline][ffmpeg stderr]", d.toString())
    );
    */

    proc.on("error", (err) => {
      logger.error("[pipeline] ffmpeg error", err);
      reject(err);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        logger.log("[pipeline] ffmpeg finished with code 0");
        resolve();
      } else {
        const err = new Error(`ffmpeg exited with code ${code}`);
        logger.error("[pipeline] ffmpeg failed", err);
        reject(err);
      }
    });
  });
}

// утилита для выбора фоновой картинки
function pickBackground(lang, logger = console) {
  // Пытаемся брать из media/backgrounds/<lang>/...
  const baseDir = path.join(process.cwd(), "media", "backgrounds");
  const langDir = path.join(baseDir, lang || "ru");
  const fallbackDir = path.join(baseDir, "ru");

  function pickFrom(dir) {
    if (!fs.existsSync(dir)) {
      logger.warn("[pipeline] background dir not found", dir);
      return null;
    }

    try {
      const files = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(
          (d) =>
            d.isFile() &&
            /\.(jpe?g|png)$/i.test(d.name)
        )
        .map((d) => path.join(dir, d.name));

      if (files.length > 0) {
        const chosen = files[Math.floor(Math.random() * files.length)];
        logger.log("[pipeline] using background", chosen);
        return chosen;
      }

      logger.warn("[pipeline] no image files in dir", dir);
      return null;
    } catch (e) {
      logger.error("[pipeline] error reading dir", dir, e);
      return null;
    }
  }

  return pickFrom(langDir) || pickFrom(fallbackDir);
}

// простой логгер для OpenAI ошибок
function logOpenAIError(err, logger) {
  if (err && err.response) {
    logger.error(
      "[pipeline][openai] error response",
      err.response.status,
      err.response.data
    );
  } else {
    logger.error("[pipeline][openai] error", err);
  }
}

// основной конвейер: принимает текст и язык, выдаёт путь к mp4
async function runPipeline({
  script,
  lang = "ru",
  logger = console,
  stamp = Date.now(),
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = require("openai").OpenAI
    ? new (require("openai").OpenAI)({ apiKey: OPENAI_API_KEY })
    : new (require("openai"))({ apiKey: OPENAI_API_KEY });

  // Папка во временной директории
  const tmpRoot = "/tmp/nova-video";
  if (!fs.existsSync(tmpRoot)) {
    fs.mkdirSync(tmpRoot, { recursive: true });
  }

  const safeLang = (lang || "ru").toLowerCase();
  const voice = getVoiceForLang(safeLang);

  const backgroundPath = pickBackground(safeLang, logger);
  if (!backgroundPath) {
    throw new Error("No background image found");
  }

  const text =
    (script && script.trim().length > 0 && script.trim()) ||
    FALLBACK_SCRIPTS[safeLang] ||
    FALLBACK_SCRIPTS["en"];

  const audioPath = path.join(tmpRoot, `nv-${stamp}-${safeLang}.mp3`);
  const outPath = path.join(tmpRoot, `nv-${stamp}-${safeLang}.mp4`);

  logger.log("[pipeline] runPipeline start", {
    lang: safeLang,
    voice,
    audioPath,
    outPath,
  });

  // 1) генерируем озвучку через OpenAI TTS
  logger.log("[pipeline] generating TTS, lang:", safeLang);

  try {
    const response = await openai.audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice,
      input: text,
      format: "mp3",
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(audioPath, audioBuffer);
    logger.log("[pipeline] TTS saved to", audioPath);
  } catch (err) {
    logOpenAIError(err, logger);
    throw new Error("TTS generation failed");
  }

  // 2) собираем видео из картинки + аудио
  const ffmpegArgs = [
    "-y",
    "-loop",
    "1",
    "-i",
    backgroundPath,
    "-i",
    audioPath,
    "-c:v",
    "libx264",
    "-tune",
    "stillimage",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    "-vf",
    "scale=1080:1920,format=yuv420p",
    outPath,
  ];

  await runFfmpeg(ffmpegArgs, logger);

  if (!fs.existsSync(outPath)) {
    throw new Error("ffmpeg finished but output video not found");
  }

  logger.log("[pipeline] video saved to", outPath);

  return {
    audioPath,
    videoPath: outPath,
    backgroundPath,
    lang: safeLang,
    text,
  };
}

module.exports = {
  runPipeline,
};
