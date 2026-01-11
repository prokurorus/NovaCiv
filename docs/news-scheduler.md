# Новостной планировщик NovaCiv

## Обзор

Система автоматического сбора и публикации новостей работает в два этапа:

1. **`fetch-news`** — сбор новостей из RSS источников, обработка через OpenAI, сохранение в Firebase
2. **`news-cron`** — чтение новых тем из Firebase и отправка в Telegram-каналы по языкам (RU/EN/DE)

## Текущая конфигурация

### Netlify Scheduled Functions

Планировщик настроен в `netlify.toml`:

```toml
[functions."fetch-news"]
  schedule = "0 * * * *"    # Каждый час в :00

[functions."news-cron"]
  schedule = "5 * * * *"    # Каждый час в :05 (5 минут после fetch-news)
```

**Расписание:**
- `fetch-news`: запускается каждый час в :00 (00:00, 01:00, 02:00, ..., 23:00 UTC)
- `news-cron`: запускается каждый час в :05 (00:05, 01:05, 02:05, ..., 23:05 UTC)

**Примечание:** Сдвиг в 5 минут между `fetch-news` и `news-cron` предотвращает гонку при обращении к Firebase.

## Health Check (Мониторинг без ручных тестов)

Для проверки статуса планировщика используйте health endpoint:

**URL формат:**
```
GET ${NEWS_BASE_URL}/.netlify/functions/health-news?token=${NEWS_CRON_SECRET}
```

**Пример:**
```
GET https://novaciv.netlify.app/.netlify/functions/health-news?token=your_secret_token
```

**Ответ:**
```json
{
  "ok": true,
  "timestamp": "2024-01-11T18:00:00.000Z",
  "fetch": {
    "lastRun": "2024-01-11T17:00:00.000Z",
    "lastRunAgeMinutes": 60,
    "schedulerAlive": true,
    "processed": 3,
    "sourcesOk": 13,
    "sourcesFailed": 0,
    "fetched": 45,
    "filtered": 12
  },
  "cron": {
    "lastRun": "2024-01-11T17:05:00.000Z",
    "lastRunAgeMinutes": 55,
    "schedulerAlive": true,
    "processed": 3,
    "totalSent": 3,
    "fetchedTopics": 5
  },
  "pipeline": {
    "healthy": true,
    "fetchAlive": true,
    "cronAlive": true,
    "fetchProcessedRecently": true,
    "cronSentRecently": true
  }
}
```

**Поля:**
- `fetch.schedulerAlive`: `true` если последний запуск fetch-news был менее 90 минут назад
- `cron.schedulerAlive`: `true` если последний запуск news-cron был менее 90 минут назад
- `pipeline.healthy`: `true` если оба scheduler'а живы И (processed>0 ИЛИ totalSent>0) за последние 6 часов

**Автоматическая проверка:**

Используйте скрипт для автоматической проверки:
```bash
NEWS_BASE_URL=https://novaciv.netlify.app NEWS_CRON_SECRET=your_token node scripts/check-health-news.mjs
```

Скрипт выводит статус и возвращает exit code 1, если scheduler не работает.

**GitHub Actions мониторинг:**

Настроен автоматический мониторинг через GitHub Actions (`.github/workflows/news-health.yml`):
- Запускается каждые 30 минут по расписанию
- Использует скрипт `scripts/check-health-news.mjs`
- Требует GitHub Secrets: `NEWS_BASE_URL`, `NEWS_CRON_SECRET`

Для настройки secrets:
1. Перейдите в Settings → Secrets and variables → Actions
2. Добавьте `NEWS_BASE_URL` (например: `https://novaciv.netlify.app`)
3. Добавьте `NEWS_CRON_SECRET` (значение из переменной окружения Netlify)

---

## URL для ручного вызова

Если требуется ручной запуск, используйте следующие URL:

### 1. fetch-news

**URL формат:**
```
GET ${NEWS_BASE_URL}/.netlify/functions/fetch-news?token=${NEWS_CRON_TOKEN}
```

**Пример:**
```
GET https://novaciv.space/.netlify/functions/fetch-news?token=your_secret_token
```

**Ответ при успехе:**
```json
{
  "ok": true,
  "processed": 3,
  "titles": ["News Title 1", "News Title 2", "News Title 3"]
}
```

**Ответ при отсутствии новых новостей:**
```json
{
  "ok": true,
  "processed": 0,
  "message": "No new items"
}
```

### 2. news-cron

**URL формат:**
```
GET ${NEWS_BASE_URL}/.netlify/functions/news-cron?token=${NEWS_CRON_TOKEN}
```

**Пример:**
```
GET https://novaciv.space/.netlify/functions/news-cron?token=your_secret_token
```

**Ответ при успехе:**
```json
{
  "ok": true,
  "processed": 2,
  "totalSent": 2,
  "perLanguage": {
    "ru": { "sent": 1, "errors": [] },
    "en": { "sent": 1, "errors": [] },
    "de": { "sent": 0, "errors": [] }
  }
}
```

## Переменные окружения

Для корректной работы требуются следующие переменные окружения:

### Обязательные

- `NEWS_CRON_SECRET` — секретный токен для защиты endpoints
- `OPENAI_API_KEY` — ключ API OpenAI для анализа и перевода новостей
- `FIREBASE_DB_URL` — URL Firebase Realtime Database
- `TELEGRAM_BOT_TOKEN` — токен Telegram бота
- `TELEGRAM_NEWS_CHAT_ID_RU` — ID Telegram-канала для русских новостей
- `TELEGRAM_NEWS_CHAT_ID_EN` — ID Telegram-канала для английских новостей (или `TELEGRAM_NEWS_CHAT_ID`)
- `TELEGRAM_NEWS_CHAT_ID_DE` — ID Telegram-канала для немецких новостей

### Опциональные

- `OPENAI_MODEL` — модель OpenAI (по умолчанию: `gpt-4o-mini`)
- `NEWS_BASE_URL` — базовый URL сайта (для диагностики)

**Примечание:** Единственный планировщик — Netlify Scheduled Functions. Внешние планировщики (cron-job.org и др.) больше не используются.

## Проверка работоспособности

### Автоматическая проверка

Запустите диагностический скрипт:

```bash
NEWS_BASE_URL=https://novaciv.space CRON_TOKEN=your_secret_token node scripts/check-news-pipeline.mjs
```

Скрипт проверит:
- Доступность обоих endpoints
- Корректность токена
- Статус обработки (processed, totalSent, perLanguage)
- Возможные проблемы (403, 500, processed=0 и их причины)

### Проверка RSS источников

Проверьте доступность RSS источников:

```bash
node scripts/check-rss-sources.mjs
```

Скрипт проверит:
- Доступность каждого RSS источника
- Валидность формата (RSS/XML)
- Наличие элементов `<item>`
- Примеры заголовков

## Примечания

- **Netlify Scheduled Functions** автоматически запускаются по расписанию, указанному в `netlify.toml`
- Внешний планировщик **НЕ требуется**, если используется Netlify
- Если планировщик внешний, убедитесь, что секреты (`NEWS_CRON_SECRET`) совпадают в env и в URL
- При проблемах проверьте логи Netlify Functions в дашборде Netlify
