# NovaCiv Video Worker - Архитектура v2

## Обзор

Архитектура v2 реализует принцип разделения ответственности:
- **Firebase** - управление feature flags и конфигурацией
- **env** - только секреты (токены, ключи API)
- **PM2** - только управление процессом, без логики конфигурации

## Структура проекта

```
server/
  video-worker.js          # Основной воркер (PM2)
  youtube.js               # Модуль загрузки на YouTube
  config/
    firebase-config.js     # Инициализация Firebase Admin SDK
    feature-flags.js       # Управление feature flags из Firebase
```

## Firebase структура

### Feature Flags

Все feature flags хранятся в `config/features/`:

```json
{
  "config": {
    "features": {
      "youtubeUploadEnabled": false,
      "telegramEnabled": true
    }
  }
}
```

### Значения по умолчанию

Если значения не заданы в Firebase, используются безопасные дефолты:
- `youtubeUploadEnabled: false` - YouTube выключен по умолчанию
- `telegramEnabled: true` - Telegram включен по умолчанию

## Переменные окружения (env)

### Обязательные секреты

```bash
# Firebase
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
FIREBASE_DB_URL=https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app

# Telegram (опционально, если telegramEnabled = true)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_NEWS_CHAT_ID=your_chat_id
TELEGRAM_NEWS_CHAT_ID_RU=your_ru_chat_id
TELEGRAM_NEWS_CHAT_ID_EN=your_en_chat_id
TELEGRAM_NEWS_CHAT_ID_DE=your_de_chat_id
TELEGRAM_NEWS_CHAT_ID_ES=your_es_chat_id

# YouTube OAuth (опционально, если youtubeUploadEnabled = true)
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REFRESH_TOKEN=your_refresh_token

# OpenAI (для pipeline)
OPENAI_API_KEY=your_openai_key
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

### Удалено из env

❌ **YOUTUBE_UPLOAD_ENABLED** - теперь управляется через Firebase

## Использование

### Запуск воркера

```bash
# Через PM2
pm2 start server/video-worker.js --name nova-video

# Или через скрипт
./restart-pm2-video-worker.sh
```

### Управление feature flags

#### Через Firebase Console

1. Откройте Firebase Console → Realtime Database
2. Перейдите в `config/features/`
3. Измените нужные флаги:
   - `youtubeUploadEnabled: true/false`
   - `telegramEnabled: true/false`
4. Изменения применяются автоматически (кэш обновляется каждые 30 секунд)

#### Через Firebase Admin SDK (программно)

```javascript
const admin = require("firebase-admin");
const db = admin.database();

// Включить YouTube
await db.ref("config/features/youtubeUploadEnabled").set(true);

// Выключить Telegram
await db.ref("config/features/telegramEnabled").set(false);
```

### Проверка статуса

```bash
# Статус PM2 процесса
pm2 status nova-video

# Логи воркера
pm2 logs nova-video

# Проверка feature flags в логах
pm2 logs nova-video | grep "feature flags"
```

## Архитектурные принципы

### 1. Разделение ответственности

- **Firebase** - конфигурация и feature flags
- **env** - секреты и учетные данные
- **PM2** - управление процессом

### 2. Централизованная конфигурация

Все настройки функций хранятся в одном месте (`config/features/`), что упрощает управление и мониторинг.

### 3. Безопасность

- Секреты хранятся только в env
- Feature flags не содержат чувствительных данных
- Изменение настроек не требует доступа к серверу

### 4. Масштабируемость

Легко добавлять новые feature flags без изменения кода:

```javascript
// В feature-flags.js добавьте в defaultFlags
const defaultFlags = {
  youtubeUploadEnabled: false,
  telegramEnabled: true,
  newFeatureEnabled: false, // новый флаг
};
```

## Миграция с v1

### Шаг 1: Создайте структуру в Firebase

```javascript
// Скрипт миграции (выполнить один раз)
const admin = require("firebase-admin");
// ... инициализация Firebase ...

const db = admin.database();

// Создаем структуру с дефолтными значениями
await db.ref("config/features").set({
  youtubeUploadEnabled: false, // безопасный дефолт
  telegramEnabled: true,
});
```

### Шаг 2: Обновите код

Код уже обновлен в этой версии. Просто замените старый `server/video-worker.js` на новый.

### Шаг 3: Удалите YOUTUBE_UPLOAD_ENABLED из .env

```bash
# Удалите строку из .env
sed -i '/^YOUTUBE_UPLOAD_ENABLED=/d' .env
```

### Шаг 4: Перезапустите воркер

```bash
./restart-pm2-video-worker.sh
```

### Шаг 5: Проверьте работу

1. Проверьте логи: `pm2 logs nova-video`
2. Должны увидеть: `[worker] feature flags: { youtubeUploadEnabled: false, telegramEnabled: true }`
3. Убедитесь, что воркер обрабатывает задачи

## Преимущества v2

✅ **Динамическое управление** - изменение настроек без перезапуска  
✅ **Централизация** - все настройки в одном месте  
✅ **Безопасность** - секреты отделены от логики  
✅ **История** - Firebase сохраняет историю изменений  
✅ **Масштабируемость** - легко добавлять новые функции  
✅ **Чистота кода** - разделение ответственности  

## Troubleshooting

### Воркер не видит изменения feature flags

- Кэш обновляется каждые 30 секунд
- Принудительно обновите: перезапустите воркер или подождите 30 секунд

### Ошибка инициализации Firebase

- Проверьте `FIREBASE_SERVICE_ACCOUNT_JSON` в env
- Проверьте `FIREBASE_DB_URL` в env
- Убедитесь, что Service Account имеет права на чтение/запись

### YouTube не загружает видео

- Проверьте `config/features/youtubeUploadEnabled` в Firebase (должно быть `true`)
- Проверьте YouTube OAuth токены в env
- Проверьте логи: `pm2 logs nova-video | grep youtube`

### Telegram не отправляет видео

- Проверьте `config/features/telegramEnabled` в Firebase (должно быть `true`)
- Проверьте `TELEGRAM_BOT_TOKEN` в env
- Проверьте chat IDs в env
- Проверьте логи: `pm2 logs nova-video | grep telegram`


