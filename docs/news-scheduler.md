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
  schedule = "0 */3 * * *"  # Каждые 3 часа

[functions."news-cron"]
  schedule = "0 * * * *"    # Каждый час
```

**Расписание:**
- `fetch-news`: запускается каждые 3 часа (00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 UTC)
- `news-cron`: запускается каждый час (00:00, 01:00, 02:00, ..., 23:00 UTC)

## URL для ручного вызова

Если планировщик внешний или требуется ручной запуск, используйте следующие URL:

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

## Рекомендуемый сдвиг при внешнем планировщике

Если используется внешний планировщик (например, cron-job.org, easycron, uptimerobot), рекомендуется:

1. **`fetch-news`** запускать **каждые 3 часа** (или чаще, но не реже)
   - Пример cron: `0 */3 * * *` (00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 UTC)

2. **`news-cron`** запускать **каждый час**, но **через 2-5 минут после `fetch-news`**
   - Пример cron: `5 */3 * * *` (00:05, 03:05, 06:05, ... UTC) — через 5 минут после fetch-news
   - Или: `0 * * * *` (каждый час) — для более частой проверки новых тем

**Логика:**
- `fetch-news` создаёт новые темы в Firebase
- `news-cron` читает эти темы и отправляет в Telegram
- Небольшой сдвиг (2-5 минут) гарантирует, что новости успели обработаться и сохраниться

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
