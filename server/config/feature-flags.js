// server/config/feature-flags.js
//
// Управление feature flags через Firebase
// Все настройки функций хранятся в config/features/

const { getDatabase } = require("./firebase-config");

// Кэш для feature flags (обновляется при каждом запросе)
let featureFlagsCache = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 30000; // 30 секунд

/**
 * Получает feature flags из Firebase
 * @param {Object} logger - Логгер
 * @param {boolean} forceRefresh - Принудительно обновить кэш
 * @returns {Promise<Object>} Объект с feature flags
 */
async function getFeatureFlags(logger = console, forceRefresh = false) {
  const now = Date.now();

  // Используем кэш если он свежий и не требуется принудительное обновление
  if (
    !forceRefresh &&
    featureFlagsCache &&
    now - lastCacheUpdate < CACHE_TTL
  ) {
    return featureFlagsCache;
  }

  try {
    const db = getDatabase(logger);
    const configRef = db.ref("config/features");

    const snapshot = await configRef.once("value");
    const flags = snapshot.val() || {};

    // Значения по умолчанию
    const defaultFlags = {
      youtubeUploadEnabled: false,
      telegramEnabled: true,
    };

    // Мержим с дефолтами
    const mergedFlags = {
      ...defaultFlags,
      ...flags,
    };

    featureFlagsCache = mergedFlags;
    lastCacheUpdate = now;

    logger.log("[feature-flags] Loaded flags:", mergedFlags);
    return mergedFlags;
  } catch (error) {
    logger.error("[feature-flags] Error loading flags:", error);

    // В случае ошибки возвращаем кэш или дефолты
    if (featureFlagsCache) {
      logger.log("[feature-flags] Using cached flags due to error");
      return featureFlagsCache;
    }

    // Если кэша нет, возвращаем безопасные дефолты
    return {
      youtubeUploadEnabled: false,
      telegramEnabled: true,
    };
  }
}

/**
 * Получает конкретный feature flag
 * @param {string} flagName - Имя флага
 * @param {Object} logger - Логгер
 * @returns {Promise<boolean>} Значение флага
 */
async function getFeatureFlag(flagName, logger = console) {
  const flags = await getFeatureFlags(logger);
  return flags[flagName] === true;
}

/**
 * Очищает кэш (для тестирования или принудительного обновления)
 */
function clearCache() {
  featureFlagsCache = null;
  lastCacheUpdate = 0;
}

module.exports = {
  getFeatureFlags,
  getFeatureFlag,
  clearCache,
};


