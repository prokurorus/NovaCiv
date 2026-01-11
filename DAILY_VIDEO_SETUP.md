# Ежедневная автоматическая генерация видео

## Обзор

Система автоматически генерирует 1 видео в день от Домового:
- **YouTube**: 12-20 секунд
- **Telegram**: 5-8 секунд (публикуется в канал соответствующего языка)

## Как это работает

1. **Генерация текста**: Домовой генерирует короткий текст (text + lang)
2. **Создание задач**: Создаются 2 задачи в Firebase `videoJobs`:
   - Задача для YouTube (maxDurationSec: 20)
   - Задача для Telegram (maxDurationSec: 8)
3. **Обработка**: `video-worker.js` обрабатывает задачи:
   - Генерирует видео через pipeline с ограничением длительности
   - Загружает на YouTube (только для YouTube-задач)
   - Отправляет в Telegram (только для Telegram-задач, в канал соответствующего языка)
4. **Логирование**: Логируются: дата, язык, текст, YouTube videoId, Telegram channel

## Настройка

### Вариант 1: Netlify Functions (рекомендуется)

Функция `domovoy-daily-video.js` уже настроена в `netlify.toml`:
```toml
[functions."domovoy-daily-video"]
  schedule = "0 3 * * *"  # Каждый день в 3:00 UTC
```

Защита токеном: добавьте `DOMOVOY_CRON_SECRET` в переменные окружения Netlify.

### Вариант 2: Серверный cron

Если используете отдельный сервер с PM2:

```bash
# Добавьте в crontab
crontab -e

# Каждый день в 3:00 UTC
0 3 * * * cd /root/NovaCiv && node server/domovoy-daily-video.js

# Или с указанием языка
0 3 * * * cd /root/NovaCiv && node server/domovoy-daily-video.js ru
```

## Требования

### Переменные окружения

- `OPENAI_API_KEY` - для генерации текста от Домового
- `FIREBASE_SERVICE_ACCOUNT_JSON` - для доступа к Firebase
- `FIREBASE_DB_URL` - URL базы данных Firebase
- `TELEGRAM_BOT_TOKEN` - токен бота Telegram
- `TELEGRAM_NEWS_CHAT_ID_RU` - ID канала для русского языка
- `TELEGRAM_NEWS_CHAT_ID_EN` - ID канала для английского языка
- `TELEGRAM_NEWS_CHAT_ID_DE` - ID канала для немецкого языка
- `TELEGRAM_NEWS_CHAT_ID_ES` - ID канала для испанского языка
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` - для YouTube

### Firebase Feature Flags

Убедитесь, что в Firebase включены:
- `config/features/youtubeUploadEnabled = true`
- `config/features/telegramEnabled = true`

## Логирование

Все логи сохраняются в:
1. **Консоль воркера**: `pm2 logs nova-video`
2. **Firebase**: `videoLogs/` - полная история генераций

Формат лога:
```json
{
  "date": "2024-01-15T03:00:00.000Z",
  "language": "ru",
  "text": "Первые 200 символов текста...",
  "youtubeVideoId": "abc123xyz",
  "telegramChannel": "-1001234567890",
  "jobId": "job-id-123",
  "platform": "youtube" // или "telegram"
}
```

## Важные детали

1. **Разделение по языкам**: Видео публикуется строго в канал соответствующего языка
2. **Нет кросс-постинга**: YouTube и Telegram - отдельные задачи, никакого дублирования
3. **Ограничение длительности**: Pipeline автоматически обрезает видео, если оно длиннее указанного лимита
4. **Логика Домового**: Не изменяется - используется та же система генерации текста

## Проверка работы

```bash
# Проверить, что воркер запущен
pm2 status nova-video

# Посмотреть логи
pm2 logs nova-video

# Проверить задачи в Firebase
# Откройте Firebase Console → Realtime Database → videoJobs

# Проверить логи генераций
# Firebase Console → Realtime Database → videoLogs
```

## Ручной запуск

```bash
# Netlify функция (локально)
curl "http://localhost:8888/.netlify/functions/domovoy-daily-video?token=YOUR_SECRET"

# Серверный скрипт
node server/domovoy-daily-video.js

# С указанием языка
node server/domovoy-daily-video.js en
```

## Поддерживаемые языки

- `ru` - Русский
- `en` - English
- `de` - Deutsch
- `es` - Español

Язык выбирается случайно при каждом запуске (или можно указать через параметр).
