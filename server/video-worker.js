// server/video-worker.js
//
// Фоновый видео-воркер для отдельного сервера (PM2).
// Архитектура v2: feature flags управляются через Firebase, env только для секретов.
//
// Что делает:
// 1) Берёт задачи из Firebase (videoJobs) со статусом "pending"
// 2) Генерирует видео через media/scripts/pipeline.js
// 3) Загружает на YouTube (если включено в Firebase config/features/youtubeUploadEnabled)
// 4) Отправляет в Telegram (если включено в Firebase config/features/telegramEnabled)
// 5) Помечает задачу как "done" или "error"

// Load .env with absolute path (no CWD dependence)
// For Windows local testing: set ENV_PATH env var or use .env in project root
const path = require("path");
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(__dirname, '..', '.env') : '/root/NovaCiv/.env');
require("dotenv").config({ path: envPath });

const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

// Модули конфигурации
const { getDatabase } = require("./config/firebase-config");

// Pipeline для генерации видео
const { runPipeline } = require("../media/scripts/pipeline");

// --- Инициализация Firebase --- //

const logger = console;

try {
  getDatabase(logger);
  logger.log("[worker] Firebase initialized");
} catch (error) {
  logger.error("[worker] Failed to initialize Firebase:", error);
  process.exit(1);
}

const db = getDatabase(logger);
const jobsRef = db.ref("videoJobs");

// --- Telegram --- //

/**
 * Получает chat ID для языка
 * @param {string} lang - Язык (ru, en, de, es)
 * @returns {string|null} Chat ID или null
 */
function getTelegramChatIdForLang(lang) {
  const base = process.env.TELEGRAM_NEWS_CHAT_ID;
  const map = {
    ru: process.env.TELEGRAM_NEWS_CHAT_ID_RU,
    en: process.env.TELEGRAM_NEWS_CHAT_ID_EN,
    de: process.env.TELEGRAM_NEWS_CHAT_ID_DE,
    es: process.env.TELEGRAM_NEWS_CHAT_ID_ES,
  };

  const safeLang = (lang || "ru").toLowerCase();
  return map[safeLang] || base || null;
}

/**
 * Отправляет видео в Telegram
 * @param {Object} params - Параметры
 * @param {string} params.lang - Язык
 * @param {string} params.videoPath - Путь к видео файлу
 * @param {string} params.caption - Подпись к видео
 * @returns {Promise<void>}
 */
async function sendTelegramVideo({ lang, videoPath, caption }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = getTelegramChatIdForLang(lang);

  if (!token || !chatId) {
    logger.log(
      "[telegram] missing TELEGRAM_BOT_TOKEN or chat id, skipping send",
      { lang, chatId: !!chatId, token: !!token }
    );
    return;
  }

  if (!fs.existsSync(videoPath)) {
    logger.log("[telegram] video file not found", videoPath);
    return;
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption || "");
  form.append("supports_streaming", "true");
  form.append("video", fs.createReadStream(videoPath));

  const url = `https://api.telegram.org/bot${token}/sendVideo`;

  logger.log("[telegram] sending video to", chatId);

  try {
    const resp = await axios.post(url, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    logger.log("[telegram] sent, ok =", resp.data && resp.data.ok);
  } catch (err) {
    if (err.response) {
      logger.error(
        "[telegram] send error",
        err.response.status,
        err.response.data
      );
    } else {
      logger.error("[telegram] send error", err);
    }
    throw err;
  }
}

// --- Обработка одной задачи --- //

/**
 * Обрабатывает одну задачу из очереди
 * @returns {Promise<void>}
 */
async function processOneJob() {
  logger.log("[worker] checking for pending jobs...");

  // Загружаем feature flags из Firebase (одним вызовом)
  const { getFeatureFlags } = require("./config/feature-flags");
  const flags = await getFeatureFlags(logger, false);
  const youtubeEnabled = flags.youtubeUploadEnabled === true;
  const telegramEnabled = flags.telegramEnabled === true;

  logger.log("[worker] feature flags:", {
    youtubeUploadEnabled: youtubeEnabled,
    telegramEnabled: telegramEnabled,
  });

  // Ищем pending задачу
  const snapshot = await jobsRef
    .orderByChild("status")
    .equalTo("pending")
    .limitToFirst(1)
    .once("value");

  const jobs = snapshot.val() || null;
  if (!jobs) {
    logger.log("[worker] no pending jobs");
    return;
  }

  const [id, job] = Object.entries(jobs)[0];
  const safeLang = (job.language || "ru").toLowerCase();

  logger.log(
    "[worker] attempting to claim job",
    id,
    safeLang,
    job.topic ? job.topic : ""
  );

  const jobRef = jobsRef.child(id);

  // Атомически захватываем задачу (транзакция предотвращает дубликаты)
  const workerId = `pm2-${process.pid}-${Date.now()}`;
  const now = Date.now();
  const STALE_THRESHOLD = 30 * 60 * 1000; // 30 минут

  try {
    const transactionResult = await jobRef.transaction((current) => {
      if (!current) {
        // Job was deleted
        return null;
      }

      // Если задача уже обработана или обрабатывается другим воркером
      if (current.status === "done" || current.status === "error") {
        return undefined; // Abort transaction
      }

      // Если задача в статусе processing, проверяем на "зависшие" задачи
      if (current.status === "processing") {
        const startedAt = current.startedAt || 0;
        const isStale = now - startedAt > STALE_THRESHOLD;
        if (!isStale) {
          return undefined; // Job is being processed, abort
        }
        logger.log("[worker] detected stale job, taking over", id);
      }

      // Атомически меняем статус на processing
      return {
        ...current,
        status: "processing",
        startedAt: now,
        lockedAt: now,
        lockedBy: workerId,
      };
    });

    if (!transactionResult.committed) {
      logger.log("[worker] failed to claim job (already claimed or deleted)", id);
      return;
    }

    logger.log("[worker] successfully claimed job", id, "worker:", workerId);
  } catch (error) {
    logger.error("[worker] transaction error claiming job", id, error);
    return;
  }

  try {
    // Генерируем видео через pipeline
    const pipelineResult = await runPipeline({
      script: job.script,
      lang: safeLang,
      logger,
      stamp: Date.now(),
    });

    logger.log("[worker] pipeline finished", {
      lang: safeLang,
      videoPath: pipelineResult && pipelineResult.videoPath,
    });

    // --- Загрузка на YouTube (если включено в Firebase) ---
    if (youtubeEnabled) {
      try {
        const uploadToYouTube = require("./youtube");

        const ytTitle =
          job.title ||
          job.topic ||
          (safeLang === "de"
            ? "Erste Begegnung mit NovaCiv"
            : safeLang === "en"
            ? "First contact with NovaCiv"
            : "Первое знакомство с NovaCiv");

        const ytId = await uploadToYouTube(
          pipelineResult.videoPath,
          ytTitle
        );

        logger.log("[youtube] uploaded:", ytId);

        await jobRef.update({
          youtubeId: ytId,
        });
      } catch (err) {
        logger.error("[youtube] error:", err);
        await jobRef.update({
          youtubeError: String(err && err.message ? err.message : err),
        });
        // Не прерываем выполнение из-за ошибки YouTube
      }
    } else {
      logger.log("[youtube] disabled via feature flag, skipping");
    }

    // --- Отправка в Telegram (если включено в Firebase) ---
    if (telegramEnabled) {
      const caption =
        job.caption ||
        job.topic ||
        "NovaCiv — novaciv.space. Цифровая цивилизация без правителей.";

      try {
        await sendTelegramVideo({
          lang: safeLang,
          videoPath: pipelineResult.videoPath,
          caption,
        });
      } catch (err) {
        logger.error("[telegram] send error:", err);
        // Не прерываем выполнение из-за ошибки Telegram
      }
    } else {
      logger.log("[telegram] disabled via feature flag, skipping");
    }

    // Помечаем задачу как выполненную
    await jobRef.update({
      status: "done",
      finishedAt: Date.now(),
      videoPath: pipelineResult.videoPath,
    });

    logger.log("[worker] job done", id);
  } catch (e) {
    logger.error("[worker] error processing job", id, e);
    await jobRef.update({
      status: "error",
      errorMessage: String(e && e.message ? e.message : e),
      finishedAt: Date.now(),
    });
  }
}

// --- Основной цикл --- //

/**
 * Основной цикл воркера
 */
async function loop() {
  logger.log("[worker] loop started");

  while (true) {
    try {
      await processOneJob();
    } catch (e) {
      logger.error("[worker] loop error", e);
    }

    // Пауза между проверками очереди (15 секунд)
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}

// Запуск воркера
loop().catch((err) => {
  logger.error("[worker] fatal error", err);
  process.exit(1);
});
