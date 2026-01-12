# 📰 NEWS PIPELINE DIAGNOSIS REPORT

**Дата:** 2026-01-11  
**GitHub commit:** d5f6f89  
**Статус:** ❌ PIPELINE BROKEN

---

## 1️⃣ АРХИТЕКТУРА PIPELINE

```
RSS SOURCES (BBC, DW, Meduza, Guardian, Tagesschau)
    ↓
fetch-news.js (scheduled: каждые 3 часа)
    ├─ Парсинг RSS
    ├─ OpenAI анализ (EN)
    ├─ OpenAI перевод (RU/DE)
    └─ Сохранение в Firebase /forum/topics (section: "news")
    ↓
Firebase Realtime Database (/forum/topics, section: "news")
    ↓
news-cron.js (scheduled: каждый час)
    ├─ Чтение новых тем (telegramPostedAt отсутствует)
    ├─ Отправка в Telegram (RU/EN/DE каналы)
    └─ Помечает telegramPostedAt = timestamp
    ↓
Telegram Channels (RU/EN/DE)
```

**Health Monitoring:**
- `/health/news/fetchNewsLastRun.json` (Firebase)
- `/health/news/newsCronLastRun.json` (Firebase)
- `health-news.js` endpoint (чтение метрик)

---

## 2️⃣ КОМПОНЕНТЫ И СТАТУС

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| **RSS Sources** | ✅ OK | 9 источников настроены (RU/EN/DE) |
| **fetch-news.js** | ⚠️ PARTIAL | Функция существует, schedule настроен (`0 */3 * * *`), но **не записывает health metrics** |
| **netlify.toml** | ✅ OK | Schedule для fetch-news настроен: `[functions."fetch-news"] schedule = "0 */3 * * *"` |
| **Firebase Storage** | ✅ OK | Путь `/forum/topics` (section: "news") корректный |
| **news-cron.js** | ❌ **BROKEN** | **КРИТИЧЕСКАЯ ОШИБКА: ReferenceError** (startTime/runId не определены) |
| **news-cron.js auth** | ❌ **BROKEN** | **Требует token в query, но Netlify scheduled НЕ передаёт query параметры** |
| **netlify.toml (news-cron)** | ✅ OK | Schedule настроен: `[functions."news-cron"] schedule = "0 * * * *"` |
| **Telegram Channels** | ⚠️ UNKNOWN | Зависит от ENV переменных (TELEGRAM_BOT_TOKEN, TELEGRAM_NEWS_CHAT_ID_*) |
| **health-news.js** | ✅ OK | Endpoint существует, читает метрики из Firebase |
| **Feature Flags** | ✅ N/A | Нет флагов, влияющих на новости (только telegramEnabled/youtubeUploadEnabled) |

---

## 3️⃣ ROOT CAUSE (ТОЧКА СБОЯ)

### ❌ ПРОБЛЕМА #1: ReferenceError в news-cron.js

**Локация:** `netlify/functions/news-cron.js`, строки 243-250

**Код:**
```javascript
// Heartbeat метрика
await writeHealthMetrics({
  ts: startTime,      // ❌ startTime не определена!
  runId,              // ❌ runId не определена!
  fetchedTopics: topics.length,
  processed: freshTopics.length,
  totalSent,
  perLanguage,
});
```

**Проблема:** Переменные `startTime` и `runId` используются в блоке `try`, но определены только в блоке `catch` (строки 265-266).

**Результат:** При каждом успешном запуске функция падает с `ReferenceError: startTime is not defined`, что приводит к:
- Функция не может завершиться успешно
- Новости не отправляются в Telegram
- Health metrics не записываются (кроме случая ошибки)

---

### ❌ ПРОБЛЕМА #2: 403 Forbidden при scheduled запуске

**Локация:** `netlify/functions/news-cron.js`, строки 168-173

**Код:**
```javascript
if (!token || token !== NEWS_CRON_SECRET) {
  return {
    statusCode: 403,
    body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" }),
  };
}
```

**Проблема:** 
- Netlify scheduled functions **НЕ передают query параметры** автоматически
- Функция требует `?token=...` в URL, но при scheduled вызове `event.queryStringParameters` = `undefined`
- Результат: **403 Forbidden** при каждом автоматическом запуске

**Сравнение с fetch-news.js:**
- `fetch-news.js` имеет **опциональную** проверку: `if (NEWS_CRON_SECRET) { ... if (!qs.token || ...) { return 403 } }`
- `news-cron.js` имеет **обязательную** проверку: `if (!token || token !== NEWS_CRON_SECRET) { return 403 }`

---

## 4️⃣ ДОПОЛНИТЕЛЬНЫЕ НАБЛЮДЕНИЯ

### ⚠️ fetch-news.js не записывает health metrics

**Локация:** `netlify/functions/fetch-news.js`

**Проблема:** Функция `writeHealthMetrics()` определена (строка 269), но **никогда не вызывается** в `handler`.

**Результат:** Health endpoint не может показать последний запуск fetch-news, даже если функция работает.

**Приоритет:** Низкий (не блокирует pipeline, но затрудняет мониторинг).

---

## 5️⃣ РЕКОМЕНДОВАННОЕ ИСПРАВЛЕНИЕ

### Шаг 1: Исправить ReferenceError в news-cron.js (КРИТИЧНО)

**Действие:** Добавить определение `startTime` и `runId` в начало `handler` функции.

**Изменение:**
```javascript
exports.handler = async (event) => {
  const startTime = Date.now();
  const runId = `news-cron-${startTime}`;
  
  try {
    // ... существующий код ...
```

**Файл:** `netlify/functions/news-cron.js`, строка 152

---

### Шаг 2: Исправить проверку токена в news-cron.js (КРИТИЧНО)

**Действие:** Сделать проверку токена опциональной для scheduled вызовов (как в fetch-news.js).

**Изменение:**
```javascript
// Заменить строки 158-173 на:
if (NEWS_CRON_SECRET) {
  const qs = event.queryStringParameters || {};
  if (!qs.token || qs.token !== NEWS_CRON_SECRET) {
    return {
      statusCode: 403,
      body: JSON.stringify({ ok: false, error: "Forbidden: invalid token" }),
    };
  }
}
```

**Обоснование:** Netlify scheduled functions не передают query параметры. Если `NEWS_CRON_SECRET` не установлен, функция работает без защиты (для разработки). Если установлен, требуется token только при ручном вызове.

---

### Шаг 3 (опционально): Добавить запись health metrics в fetch-news.js

**Действие:** Вызвать `writeHealthMetrics()` после успешной обработки.

**Приоритет:** Низкий (не блокирует pipeline).

---

## 6️⃣ ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ

1. ✅ `news-cron.js` успешно выполняется при scheduled запуске (каждый час)
2. ✅ Новости отправляются в Telegram каналы
3. ✅ Health metrics записываются в Firebase
4. ✅ Health endpoint показывает актуальные метрики

---

## 7️⃣ ПРОВЕРКА ИСПРАВЛЕНИЯ

После применения исправлений:

1. Проверить логи Netlify Functions для `news-cron`:
   - Должны отсутствовать `ReferenceError`
   - Должны отсутствовать `403 Forbidden` при scheduled запусках

2. Проверить health endpoint:
   ```
   GET /.netlify/functions/health-news?token=[NEWS_CRON_SECRET]
   ```
   - Должен возвращать метрики с актуальными timestamp

3. Проверить Telegram каналы:
   - Должны появляться новые посты каждые 1-3 часа (после того, как fetch-news создаст новые темы)

---

**СТАТУС ДИАГНОСТИКИ:** ✅ ЗАВЕРШЕНА  
**ТОЧКА СБОЯ:** Определена (2 критические ошибки в news-cron.js)  
**ИСПРАВЛЕНИЕ:** Минимальное (2 изменения в одном файле)
