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
    logger.log("[pipeline] ffmpeg", ffmpegPath, args.join(" "));

    const proc = spawn(ffmpegPath, args);

    proc.stdout.on("data", (d) =>
      logger.log("[pipeline][ffmpeg stdout]", d.toString())
    );
    proc.stderr.on("data", (d) =>
      logger.log("[pipeline][ffmpeg stderr]", d.toString())
    );

    proc.on("error", (err) => {
      logger.error("[pipeline] ffmpeg error", err);
      reject(err);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

// выбираем случайный фон по языку
function pickBackground(lang, logger = console) {
  const language = (lang || "ru").toLowerCase();
  const root = process.cwd();

  // пробуем: media/backgrounds/<lang>, иначе en, иначе любой
  const candidates = [
    path.join(root, "media", "backgrounds", language),
    path.join(root, "media", "backgrounds", "en"),
    path.join(root, "media", "backgrounds"),
  ];

  for (const dir of candidates) {
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
    } catch (e) {
      // просто идём к следующему варианту
      continue;
    }
  }

  throw new Error("Не удалось найти ни одного фонового изображения");
}

// генерация TTS и сохранение в файл
async function generateTTS({ lang, script, outPath }, logger = console) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const text =
    (script && script.toString().trim()) ||
    FALLBACK_SCRIPTS[lang] ||
    FALLBACK_SCRIPTS.ru;

  logger.log("[pipeline] TTS text length:", text.length);

  const voice = getVoiceForLang(lang);

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice,
      input: text,
      format: "mp3",
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    logger.error("[pipeline] TTS HTTP error", res.status, txt.slice(0, 200));
    throw new Error(`TTS failed: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await fs.promises.writeFile(outPath, buffer);
  logger.log("[pipeline] TTS saved to", outPath);
}

// сборка финального вертикального ролика
async function buildVideo({ bgPath, audioPath, outPath }, logger = console) {
  // делаем видео 1080x1920, сохраняем пропорции и обрезаем центр,
  // статичный кадр + озвучка
  const args = [
    "-y",
    "-loop",
    "1",
    "-i",
    bgPath,
    "-i",
    audioPath,
    "-c:v",
    "libx264",
    "-tune",
    "stillimage",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    "-r",
    "30",
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    outPath,
  ];

  await runFfmpeg(args, logger);
  logger.log("[pipeline] video saved to", outPath);
}

// основной экспортируемый конвейер
async function runPipeline(logger = console, opts = {}) {
  const lang = (opts.lang || "ru").toLowerCase();
  const script = opts.script || "";

  const tmpRoot = "/tmp/nova-video";
  await fs.promises.mkdir(tmpRoot, { recursive: true });

  const stamp = Date.now();
  const audioPath = path.join(tmpRoot, `nv-${stamp}-${lang}.mp3`);
  const outPath = path.join(tmpRoot, `nv-${stamp}-${lang}.mp4`);

  const bgPath = pickBackground(lang, logger);

  await generateTTS({ lang, script, outPath: audioPath }, logger);
  await buildVideo({ bgPath, audioPath, outPath }, logger);

  return {
    videoPath: outPath,
    audioPath,
    backgroundPath: bgPath,
  };
}

module.exports = {
  runPipeline,
};
