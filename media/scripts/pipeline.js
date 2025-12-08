// media/scripts/pipeline.js
//
// Универсальный конвейер для генерации вертикального видео 9:16
// из фоновой картинки + озвученного текста (TTS через OpenAI).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

// простой запасной текст, если вдруг script не передали
const FALLBACK_SCRIPTS = {
  ru: `
Представь себе цивилизацию, где нет правителей и закрытых кабинетов.
Все решения принимают сами граждане — открыто и прозрачно.

NovaCiv — это цифровая платформа, которую мы строим вместе,
чтобы вернуть людям право решать свою судьбу без посредников.

Если тебе откликается эта идея —
зайди на novaciv точка space
и подпишись на будущее планеты.
`,
  en: `
Imagine a civilization with no rulers and no closed rooms.
Decisions are made openly by the citizens themselves.

NovaCiv is a digital platform we build together
to return people the right to decide their own future.

If this idea resonates with you,
visit novaciv dot space
and subscribe to the future of the planet.
`,
  de: `
Stell dir eine Zivilisation ohne Herrscher und ohne verschlossene Türen vor.
Alle Entscheidungen werden offen von den Bürgern selbst getroffen.

NovaCiv ist eine digitale Plattform, die wir gemeinsam aufbauen,
um den Menschen das Recht zurückzugeben, über ihr Schicksal selbst zu entscheiden.

Wenn dich diese Idee anspricht,
besuche novaciv Punkt space
und abonniere die Zukunft des Planeten.
`,
  es: `
Imagina una civilización sin gobernantes ni despachos cerrados.
Todas las decisiones las toman abiertamente los propios ciudadanos.

NovaCiv es una plataforma digital que construimos juntos
para devolver a las personas el derecho a decidir su propio destino.

Si esta idea resuena contigo,
entra en novaciv punto space
y suscríbete al futuro del planeta.
`,
};

// небольшая утилита: гарантированно создаём директорию для файла
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

// выбор фоновой картинки по языку
function pickBackground(lang, logger = console) {
  const language = (lang || "ru").toLowerCase();
  const root = process.cwd();

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
            d.isFile() && /\.(jpe?g|png)$/i.test(d.name)
        )
        .map((d) => path.join(dir, d.name));

      if (files.length > 0) {
        const chosen = files[Math.floor(Math.random() * files.length)];
        logger.log("[pipeline] using background", chosen);
        return chosen;
      }
    } catch (e) {
      // если директории нет — просто идём к следующей
      continue;
    }
  }

  throw new Error("Не удалось найти ни одного фонового изображения");
}

// генерация TTS через OpenAI
async function generateTTS({ lang, script, outPath }, logger = console) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const language = (lang || "ru").toLowerCase();
  const text =
    (script && script.trim().length > 0 ? script : FALLBACK_SCRIPTS[language]) ||
    FALLBACK_SCRIPTS["ru"];

  logger.log("[pipeline] generating TTS, lang:", language);

  ensureDir(outPath);

  const url = "https://api.openai.com/v1/audio/speech";

  const response = await axios.post(
    url,
    {
      model: OPENAI_TTS_MODEL,
      voice: "alloy",
      input: text,
    },
    {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  fs.writeFileSync(outPath, response.data);
  logger.log("[pipeline] TTS saved to", outPath);
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
      logger.error("[pipeline][ffmpeg error]", err);
      reject(err);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        logger.log("[pipeline] ffmpeg finished with code 0");
        resolve();
      } else {
        const err = new Error("ffmpeg exited with code " + code);
        logger.error("[pipeline] ffmpeg failed", err);
        reject(err);
      }
    });
  });
}

// сборка вертикального видео 9:16
async function buildVideo({ bgPath, audioPath, outPath }, logger = console) {
  ensureDir(outPath);

  const args = [
    "-y",                // перезаписывать выходной файл
    "-loop", "1",        // зациклить фон
    "-i", bgPath,        // вход 0: картинка
    "-i", audioPath,     // вход 1: аудио
    "-c:v", "libx264",
    "-tune", "stillimage",
    "-c:a", "aac",
    "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    "-vf", "scale=1080:1920,format=yuv420p",
    outPath,
  ];

  await runFfmpeg(args, logger);
  logger.log("[pipeline] video saved to", outPath);
}

// основной конвейер
async function runPipeline(logger = console, options = {}) {
  const lang = options.lang || "ru";
  const script = options.script || "";

  logger.log("[pipeline] runPipeline start", { lang });

  // 1. Выбираем фон
  const bgPath = pickBackground(lang, logger);

  // 2. Путь для аудио/видео во временной директории (пишем в /tmp — единственное
  // доступное на Netlify/Lambda место для записи во время выполнения)
  const tmpRoot = path.join(os.tmpdir(), "novaciv-shorts");
  const timestamp = Date.now();
  const audioPath = path.join(tmpRoot, `${timestamp}_${lang}.mp3`);
  const videoPath = path.join(tmpRoot, `${timestamp}_${lang}.mp4`);

  // 3. Генерируем озвучку
  await generateTTS({ lang, script, outPath: audioPath }, logger);

  // 4. Собираем видео
  await buildVideo({ bgPath, audioPath, outPath: videoPath }, logger);

  return {
    videoPath,
    audioPath,
    backgroundPath: bgPath,
  };
}

module.exports = {
  runPipeline,
};
