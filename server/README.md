# NovaCiv Video Worker

Фоновый воркер для обработки видео-задач из Firebase.

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка Firebase

Создайте структуру конфигурации в Firebase:

```bash
node ../scripts/setup-firebase-config.js
```

Или вручную в Firebase Console:
```
config/features/
  youtubeUploadEnabled: false
  telegramEnabled: true
```

### 3. Настройка env

Создайте `.env` файл с обязательными переменными:

```bash
# Firebase (обязательно)
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
FIREBASE_DB_URL=https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app

# OpenAI (обязательно)
OPENAI_API_KEY=your_key
OPENAI_TTS_MODEL=gpt-4o-mini-tts

# Telegram (если telegramEnabled = true)
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_NEWS_CHAT_ID_RU=your_chat_id

# YouTube (если youtubeUploadEnabled = true)
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_secret
YOUTUBE_REFRESH_TOKEN=your_token
```

### 4. Запуск

```bash
# Через PM2
pm2 start video-worker.js --name nova-video

# Или через скрипт
../restart-pm2-video-worker.sh
```

## Управление feature flags

Feature flags управляются через Firebase `config/features/`:

- `youtubeUploadEnabled` - включить/выключить загрузку на YouTube
- `telegramEnabled` - включить/выключить отправку в Telegram

Изменения применяются автоматически (кэш обновляется каждые 30 секунд).

## Структура

```
server/
  video-worker.js          # Основной воркер
  youtube.js               # Модуль загрузки на YouTube
  config/
    firebase-config.js     # Инициализация Firebase
    feature-flags.js       # Управление feature flags
```

## Документация

- [ARCHITECTURE_V2.md](../ARCHITECTURE_V2.md) - описание архитектуры
- [MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md) - руководство по миграции
- [AUDIT_SUMMARY.md](../AUDIT_SUMMARY.md) - итоговый отчет

## Логи

```bash
# Просмотр логов
pm2 logs nova-video

# Последние 50 строк
pm2 logs nova-video --lines 50

# Мониторинг в реальном времени
pm2 logs nova-video --raw
```

## Troubleshooting

### Воркер не видит изменения feature flags

Подождите 30 секунд (кэш) или перезапустите воркер.

### Ошибка инициализации Firebase

Проверьте `FIREBASE_SERVICE_ACCOUNT_JSON` и `FIREBASE_DB_URL` в env.

### YouTube не загружает

1. Проверьте `config/features/youtubeUploadEnabled` в Firebase (должно быть `true`)
2. Проверьте YouTube OAuth токены в env
3. Проверьте логи: `pm2 logs nova-video | grep youtube`


