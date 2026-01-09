# Руководство по миграции на архитектуру v2

## Что изменилось

### ❌ Удалено

1. **YOUTUBE_UPLOAD_ENABLED из .env**
   - Теперь управляется через Firebase `config/features/youtubeUploadEnabled`

2. **Редактирование .env в PM2 скриптах**
   - Скрипты больше не изменяют .env файл
   - Только перезапуск процесса

### ✅ Добавлено

1. **Модули конфигурации**
   - `server/config/firebase-config.js` - централизованная инициализация Firebase
   - `server/config/feature-flags.js` - управление feature flags

2. **Firebase структура**
   - `config/features/youtubeUploadEnabled` - включение/выключение YouTube
   - `config/features/telegramEnabled` - включение/выключение Telegram

3. **googleapis в package.json**
   - Добавлена зависимость для YouTube модуля

## Пошаговая миграция

### Шаг 1: Установите зависимости

```bash
npm install
```

Это установит `googleapis`, если его еще нет.

### Шаг 2: Создайте структуру в Firebase

Выполните один раз следующий скрипт для создания структуры конфигурации:

```javascript
// scripts/setup-firebase-config.js
const admin = require("firebase-admin");
require("dotenv").config();

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
const dbUrl = process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: dbUrl,
});

const db = admin.database();

async function setupConfig() {
  const configRef = db.ref("config/features");
  
  // Проверяем, существует ли уже конфигурация
  const snapshot = await configRef.once("value");
  const existing = snapshot.val();
  
  if (existing) {
    console.log("Конфигурация уже существует:", existing);
    console.log("Пропускаем создание...");
    return;
  }
  
  // Создаем с безопасными дефолтами
  await configRef.set({
    youtubeUploadEnabled: false, // безопасный дефолт
    telegramEnabled: true,
  });
  
  console.log("✅ Конфигурация создана в Firebase");
  console.log("   config/features/youtubeUploadEnabled: false");
  console.log("   config/features/telegramEnabled: true");
}

setupConfig()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Ошибка:", err);
    process.exit(1);
  });
```

Запустите:

```bash
node scripts/setup-firebase-config.js
```

### Шаг 3: Обновите код

Код уже обновлен. Убедитесь, что у вас есть:

- ✅ `server/video-worker.js` (новая версия)
- ✅ `server/config/firebase-config.js`
- ✅ `server/config/feature-flags.js`
- ✅ `restart-pm2-video-worker.sh` (обновлен)
- ✅ `restart-video-worker.sh` (обновлен)

### Шаг 4: Очистите .env (опционально)

Можно удалить `YOUTUBE_UPLOAD_ENABLED` из .env, так как он больше не используется:

```bash
# Создайте backup
cp .env .env.backup

# Удалите строку (Linux/Mac)
sed -i '/^YOUTUBE_UPLOAD_ENABLED=/d' .env

# Или удалите вручную в редакторе
```

**Важно:** Не удаляйте другие переменные! Удаляйте только `YOUTUBE_UPLOAD_ENABLED`.

### Шаг 5: Перезапустите воркер

```bash
./restart-pm2-video-worker.sh
```

### Шаг 6: Проверьте работу

1. **Проверьте логи:**

```bash
pm2 logs nova-video --lines 50
```

Должны увидеть:
```
[worker] Firebase initialized
[worker] feature flags: { youtubeUploadEnabled: false, telegramEnabled: true }
[worker] checking for pending jobs...
```

2. **Проверьте Firebase:**

Откройте Firebase Console → Realtime Database → `config/features/`

Должны увидеть:
```json
{
  "youtubeUploadEnabled": false,
  "telegramEnabled": true
}
```

3. **Протестируйте включение YouTube:**

В Firebase Console измените:
```json
{
  "youtubeUploadEnabled": true,
  "telegramEnabled": true
}
```

Подождите 30 секунд (или перезапустите воркер) и проверьте логи:
```
[worker] feature flags: { youtubeUploadEnabled: true, telegramEnabled: true }
[youtube] uploading file: ...
```

## Откат на v1 (если нужно)

Если что-то пошло не так, можно откатиться:

1. Восстановите старый `server/video-worker.js` из git
2. Восстановите старые скрипты PM2
3. Добавьте обратно `YOUTUBE_UPLOAD_ENABLED=true` в .env
4. Перезапустите воркер

```bash
git checkout HEAD -- server/video-worker.js
git checkout HEAD -- restart-pm2-video-worker.sh
echo "YOUTUBE_UPLOAD_ENABLED=true" >> .env
./restart-pm2-video-worker.sh
```

## Проверочный список

- [ ] Установлены зависимости (`npm install`)
- [ ] Создана структура в Firebase (`config/features/`)
- [ ] Обновлен `server/video-worker.js`
- [ ] Обновлены скрипты PM2
- [ ] Удален `YOUTUBE_UPLOAD_ENABLED` из .env (опционально)
- [ ] Перезапущен воркер
- [ ] Проверены логи (видны feature flags)
- [ ] Протестировано включение/выключение YouTube через Firebase

## YouTube OAuth Token Regeneration

Если вы видите ошибку `invalid_grant` от YouTube API, нужно перегенерировать refresh token.

### Шаг 1: Запустите CLI инструмент на вашем PC

```bash
# Установите OAuth credentials в .env (или как env vars)
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_client_secret

# Запустите auth CLI
node scripts/youtube-auth-cli.js
```

Это откроет браузер для OAuth авторизации и сгенерирует новый refresh token.

### Шаг 2: Обновите .env на сервере

Скопируйте refresh token в файл `.env` на сервере:

```bash
# На сервере
nano /root/NovaCiv/.env

# Добавьте или обновите:
YOUTUBE_REFRESH_TOKEN=your_new_refresh_token
```

### Шаг 3: Перезапустите воркер

```bash
pm2 restart nova-video
```

### Частые причины invalid_grant:

1. **Refresh token отозван**: Пользователь удалил доступ к приложению в настройках Google Account
2. **Несоответствие Client**: Client ID/Secret не соответствуют OAuth приложению
3. **Расхождение времени**: Время на сервере неверное (проверьте командой `date`)
4. **Токен истек**: Токен не может быть обновлен (редко, но возможно)

### Проверьте настройки OAuth приложения:

- Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
- APIs & Services → Credentials
- Убедитесь, что OAuth 2.0 Client ID имеет правильные redirect URIs
- Scopes должны включать: `https://www.googleapis.com/auth/youtube.upload`

## FAQ

### Нужно ли перезапускать воркер при изменении feature flags?

Нет, но изменения применяются с задержкой до 30 секунд (кэш). Для немедленного применения перезапустите воркер.

### Что если Firebase недоступен?

Воркер использует кэшированные значения или безопасные дефолты (YouTube выключен, Telegram включен).

### Можно ли использовать старый способ через .env?

Нет, код больше не читает `YOUTUBE_UPLOAD_ENABLED` из env. Используйте Firebase.

### Как добавить новый feature flag?

1. Добавьте в `server/config/feature-flags.js` в `defaultFlags`
2. Используйте `getFeatureFlag("newFlagName")` в коде
3. Создайте значение в Firebase `config/features/newFlagName`

## Поддержка

При возникновении проблем:

1. Проверьте логи: `pm2 logs nova-video`
2. Проверьте Firebase: `config/features/`
3. Проверьте env переменные: `pm2 env nova-video`
4. Создайте issue с описанием проблемы

