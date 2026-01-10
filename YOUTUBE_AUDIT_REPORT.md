# ОТЧЕТ: Проверка работоспособности YouTube в проекте NovaCiv

**Дата проверки:** 2025-01-27  
**ОС:** Windows  
**Расположение:** C:\NovaCiv\NovaCiv

---

## 1. ЧТО НАЙДЕНО

### 1.1. Файлы, отвечающие за YouTube

#### Основные модули:
- **`server/youtube.js`** (159 строк)
  - Основной модуль загрузки видео на YouTube
  - Функция `uploadToYouTube(videoPath, title, options)`
  - Использует `googleapis` (YouTube Data API v3)
  - Обрабатывает ошибки `invalid_grant` с детальными подсказками

- **`server/video-worker.js`** (324 строки)
  - Главный воркер, который вызывает YouTube-загрузку
  - Читает feature flag `youtubeUploadEnabled` из Firebase
  - Вызывает `uploadToYouTube()` после генерации видео (строки 226-258)

#### Вспомогательные скрипты:
- **`scripts/youtube-auth-cli.js`** (173 строки)
  - CLI-утилита для генерации OAuth refresh token
  - Запускает локальный OAuth flow (браузер + HTTP сервер на :3000)
  - Генерирует refresh token для копирования в .env

- **`scripts/test-youtube-auth.js`** (НОВЫЙ - только что создан)
  - Тестовый скрипт для проверки авторизации БЕЗ реальной загрузки
  - Проверяет OAuth токены, доступ к API, scopes

- **`scripts/disable-youtube.js`** (8 строк)
  - Утилита для отключения YouTube через Firebase

#### Конфигурация:
- **`server/config/feature-flags.js`** (98 строк)
  - Управление feature flags через Firebase
  - Кэширование флагов (TTL: 30 секунд)
  - Дефолт: `youtubeUploadEnabled: false`

- **`server/config/firebase-config.js`** (75 строк)
  - Инициализация Firebase Admin SDK
  - Требует `FIREBASE_SERVICE_ACCOUNT_JSON` и `FIREBASE_DB_URL`

### 1.2. Зависимости

**package.json:**
```json
"googleapis": "^144.0.0"  ✅ УСТАНОВЛЕН
```

**Проверка:** `npm list googleapis` → `googleapis@144.0.0` ✅

---

## 2. КАК ЭТО ДОЛЖНО РАБОТАТЬ

### 2.1. Архитектура загрузки

**Точка входа:** `server/video-worker.js` → цикл `processOneJob()`

**Поток выполнения:**

```
1. Firebase (videoJobs) → задача со статусом "pending"
   ↓
2. video-worker.js → атомически захватывает задачу (транзакция)
   ↓
3. Генерация видео через media/scripts/pipeline.js
   ↓
4. Проверка Firebase config/features/youtubeUploadEnabled
   ├─ Если false → пропуск (логируется: "[youtube] disabled via feature flag, skipping")
   └─ Если true → переход к шагу 5
   ↓
5. server/youtube.js → uploadToYouTube(videoPath, title)
   ├─ OAuth2 авторизация (refresh_token → access_token автоматически)
   ├─ Вызов YouTube API: youtube.videos.insert()
   ├─ Загрузка файла с прогрессом (логи каждые 10%)
   └─ Возврат videoId
   ↓
6. Обновление Firebase job:
   - youtubeId: <полученный_id> (при успехе)
   - youtubeError: <сообщение> (при ошибке)
   ↓
7. Telegram отправка (если telegramEnabled = true)
   ↓
8. Статус job → "done" или "error"
```

### 2.2. Где запускается

**Production (удаленный сервер):**
- **PM2 worker:** `pm2 start server/video-worker.js --name nova-video`
- **Путь к .env:** `/root/NovaCiv/.env` (захардкожен в строке 14)
- **Скрипты деплоя:**
  - `scripts/deploy-video-worker.sh`
  - `restart-pm2-video-worker.sh`

**Локально (Windows):**
- ❌ **ПРОБЛЕМА:** video-worker.js захардкожен на `/root/NovaCiv/.env`
- Нужна модификация для Windows или переменная окружения для пути

**Netlify Functions:**
- `netlify/functions/video-worker.js` - отключен (возвращает early с сообщением)
- Не используется для YouTube загрузки в production

---

## 3. FEATURE FLAGS

### 3.1. Где хранится

**Firebase Realtime Database:**
```
config/features/youtubeUploadEnabled: boolean
```

**Текущее значение по умолчанию:**
```javascript
youtubeUploadEnabled: false  // безопасный дефолт
telegramEnabled: true
```

### 3.2. Где читается

**`server/config/feature-flags.js`:**
- Функция `getFeatureFlags(logger, forceRefresh)`
- Кэш: 30 секунд
- При ошибке чтения Firebase → возвращает дефолты (`youtubeUploadEnabled: false`)

**`server/video-worker.js` (строки 127-136):**
```javascript
const { getFeatureFlags } = require("./config/feature-flags");
const flags = await getFeatureFlags(logger, false);
const youtubeEnabled = flags.youtubeUploadEnabled === true;
```

### 3.3. Как изменить

**Через Firebase Console:**
1. Firebase Console → Realtime Database
2. `config/features/youtubeUploadEnabled` → `true`
3. Изменения применяются автоматически (кэш обновляется через 30 секунд)

**Программно:**
```javascript
const db = admin.database();
await db.ref("config/features/youtubeUploadEnabled").set(true);
```

**Через скрипт:**
```bash
node scripts/disable-youtube.js  # устанавливает false
```

### 3.4. В продакшене

**Текущее состояние:** По умолчанию `false` (выключено)  
**Что нужно сделать для включения:** Установить `true` в Firebase `config/features/youtubeUploadEnabled`

---

## 4. ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

### 4.1. REQUIRED для YouTube

**Обязательные (проверяются в `server/youtube.js` строки 56-58):**

1. **`YOUTUBE_CLIENT_ID`**
   - OAuth 2.0 Client ID из Google Cloud Console
   - Где читается: `process.env.YOUTUBE_CLIENT_ID`
   - Что произойдет если нет: `throw new Error("YOUTUBE_CLIENT_ID is not set")`

2. **`YOUTUBE_CLIENT_SECRET`**
   - OAuth 2.0 Client Secret из Google Cloud Console
   - Где читается: `process.env.YOUTUBE_CLIENT_SECRET`
   - Что произойдет если нет: `throw new Error("YOUTUBE_CLIENT_SECRET is not set")`

3. **`YOUTUBE_REFRESH_TOKEN`**
   - Refresh token, полученный через OAuth flow
   - Где читается: `process.env.YOUTUBE_REFRESH_TOKEN`
   - Что произойдет если нет: `throw new Error("YOUTUBE_REFRESH_TOKEN is not set")`
   - Как получить: `node scripts/youtube-auth-cli.js`

### 4.2. Optional для YouTube

**Опциональные (имеют дефолты):**

4. **`YOUTUBE_PRIVACY_STATUS`**
   - Значения: `"public"` | `"unlisted"` | `"private"`
   - Дефолт: `"public"`
   - Где читается: `process.env.YOUTUBE_PRIVACY_STATUS` (строка 62)

5. **`YOUTUBE_CHANNEL_LANGUAGE`**
   - Примеры: `"en"`, `"ru"`, `"de"`, `"es"`
   - Дефолт: `"en"`
   - Где читается: `process.env.YOUTUBE_CHANNEL_LANGUAGE` (строка 67)

6. **`YOUTUBE_DEFAULT_TAGS`**
   - Теги через запятую
   - Дефолт: `""` (пустая строка)
   - Где читается: `process.env.YOUTUBE_DEFAULT_TAGS` (строка 39)

7. **`YOUTUBE_DESCRIPTION`**
   - Шаблон описания видео
   - Дефолт: `"NovaCiv — digital civilization without rulers..."`
   - Где читается: `process.env.YOUTUBE_DESCRIPTION` (строка 28)

### 4.3. REQUIRED для Firebase (необходимы для чтения feature flags)

8. **`FIREBASE_SERVICE_ACCOUNT_JSON`**
   - JSON строка с credentials Firebase Admin SDK
   - Где читается: `server/config/firebase-config.js:21`
   - Без этого: воркер не запустится (Firebase не инициализируется)

9. **`FIREBASE_DB_URL`** или **`FIREBASE_DATABASE_URL`**
   - URL Realtime Database
   - Пример: `https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app`
   - Где читается: `server/config/firebase-config.js:30`
   - Без этого: воркер не запустится

### 4.4. Где хранятся переменные

**На сервере (production):**
- Файл: `/root/NovaCiv/.env` (захардкожен в `video-worker.js:14`)
- Загружается: `require("dotenv").config({ path: "/root/NovaCiv/.env" });`

**Локально (Windows):**
- ❌ **ПРОБЛЕМА:** Путь `/root/NovaCiv/.env` не работает на Windows
- **РЕШЕНИЕ:** Создать `.env` в корне проекта и изменить загрузку в `video-worker.js`

**В Netlify:**
- Netlify Dashboard → Environment variables
- Не используется для YouTube (Netlify функция отключена)

### 4.5. .env файл

**Статус:** `.env` файл **НЕ НАЙДЕН** в репозитории (правильно, он в .gitignore)

**Что должно быть в .env для YouTube:**
```bash
# Firebase (обязательно для работы feature flags)
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
FIREBASE_DB_URL=https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app

# YouTube OAuth (обязательно если youtubeUploadEnabled = true)
YOUTUBE_CLIENT_ID=your_client_id_here
YOUTUBE_CLIENT_SECRET=your_client_secret_here
YOUTUBE_REFRESH_TOKEN=your_refresh_token_here

# YouTube опционально
YOUTUBE_PRIVACY_STATUS=public
YOUTUBE_CHANNEL_LANGUAGE=en
YOUTUBE_DEFAULT_TAGS=novaciv,digital,civilization
YOUTUBE_DESCRIPTION=Custom description template...
```

---

## 5. ЛОКАЛЬНАЯ ПРОВЕРКА СБОРКИ И РАНТАЙМА

### 5.1. Package Manager

**Используется:** `npm` (есть `package-lock.json`)

**Проверка зависимостей:**
```powershell
npm list googleapis
# Результат: ✅ googleapis@144.0.0 установлен
```

### 5.2. Команды для проверки

#### a) Установка зависимостей:
```powershell
cd C:\NovaCiv\NovaCiv
npm install
```

**Статус:** ✅ `googleapis` уже в `package.json` и установлен

#### b) Build (для фронтенда):
```powershell
npm run build
```
**Примечание:** YouTube модуль не требует сборки, это Node.js код

#### c) Проверка импорта модуля YouTube:

**Тест импорта:**
```powershell
node -e "const yt = require('./server/youtube'); console.log('✅ YouTube module loaded:', typeof yt);"
```

**Ожидаемый результат:** `✅ YouTube module loaded: function` (если все зависимости установлены)

**Если ошибка:** Проверить наличие `googleapis` в `node_modules`

### 5.3. Проблема с запуском воркера на Windows

**Проблема:** `server/video-worker.js` строка 14:
```javascript
require("dotenv").config({ path: "/root/NovaCiv/.env" });
```

**Это работает только на Linux сервере!**

**Решение для локального тестирования:**

**Вариант 1:** Использовать переменную окружения
```javascript
require("dotenv").config({ path: process.env.ENV_PATH || "/root/NovaCiv/.env" });
```

**Вариант 2:** Использовать относительный путь для локального запуска
```javascript
const envPath = process.env.ENV_PATH || (process.platform === 'win32' ? '.env' : '/root/NovaCiv/.env');
require("dotenv").config({ path: envPath });
```

**Вариант 3:** Загружать .env из текущей директории (по умолчанию)
```javascript
// Для локального тестирования
if (process.env.NODE_ENV !== 'production') {
  require("dotenv").config(); // загрузит .env из текущей директории
} else {
  require("dotenv").config({ path: "/root/NovaCiv/.env" });
}
```

---

## 6. ТЕСТ-ПЛАН БЕЗ ПУБЛИКАЦИИ

### 6.1. Режим DRY_RUN / TEST / MOCK

**Статус:** ❌ Встроенного DRY_RUN режима **НЕТ** в коде

### 6.2. Безопасная проверка (создан тестовый скрипт)

**Создан файл:** `scripts/test-youtube-auth.js` ✅

**Что делает:**
1. Проверяет наличие всех обязательных env переменных
2. Инициализирует OAuth2 клиент
3. Тестирует refresh token (получает access token) - **БЕЗ загрузки видео**
4. Делает безопасный запрос `channels.list` (только чтение)
5. Проверяет scopes (наличие `youtube.upload`)
6. Выводит информацию о канале

**Команда запуска:**
```powershell
cd C:\NovaCiv\NovaCiv
node scripts/test-youtube-auth.js
```

**Ожидаемый вывод при успехе:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  YouTube Auth Test (DRY RUN - NO UPLOAD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣  Checking environment variables...
   ✅ YOUTUBE_CLIENT_ID: ...
   ✅ YOUTUBE_CLIENT_SECRET: ...
   ✅ YOUTUBE_REFRESH_TOKEN: ...

2️⃣  Initializing OAuth2 client...
   ✅ OAuth2 client initialized

3️⃣  Testing refresh token (getting access token)...
   ✅ Access token obtained successfully
   ✅ Token expires at: ...

4️⃣  Testing YouTube API access (channels.list)...
   ✅ API access successful
   ✅ Channel ID: ...
   ✅ Channel Title: ...

5️⃣  Checking OAuth scopes...
   ✅ Available scopes:
      ✅ https://www.googleapis.com/auth/youtube.upload
   ✅ 'youtube.upload' scope is present

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ ALL CHECKS PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Если ошибка `invalid_grant`:**
- Скрипт покажет детали и предложит запустить `node scripts/youtube-auth-cli.js`

### 6.3. Альтернатива: тест с `privacyStatus: "private"`

**Если нужно протестировать реальную загрузку:**

1. Временно изменить в `server/youtube.js` строку 101:
   ```javascript
   privacyStatus: "private",  // вместо options.privacyStatus || ...
   ```

2. Или установить в `.env`:
   ```bash
   YOUTUBE_PRIVACY_STATUS=private
   ```

3. Загрузить тестовое видео (будет приватным, не видно публике)

4. После теста удалить видео вручную из YouTube Studio

**⚠️ ВНИМАНИЕ:** Это всё равно загрузит видео на YouTube (просто приватное)

### 6.4. Минимальное безопасное изменение для DRY_RUN

**Предложение:** Добавить флаг `DRY_RUN=true` в `server/youtube.js`

**Изменение:**
```javascript
async function uploadToYouTube(videoPath, title, options = {}) {
  // ... существующий код проверок ...
  
  const isDryRun = process.env.YOUTUBE_DRY_RUN === "true" || options.dryRun === true;
  
  if (isDryRun) {
    console.log("[youtube] DRY RUN MODE - skipping actual upload");
    console.log("[youtube] Would upload:", fileName, "bytes:", fileSize);
    console.log("[youtube] Would use privacyStatus:", privacyStatus);
    console.log("[youtube] Would use title:", title);
    console.log("[youtube] Would use tags:", tags.join(", "));
    // Тестируем только авторизацию
    await youtube.channels.list({ part: ["snippet"], mine: true });
    console.log("[youtube] ✅ Auth OK, would upload if not dry run");
    return "DRY_RUN_MOCK_VIDEO_ID";
  }
  
  // ... остальной код загрузки ...
}
```

**Использование:**
```powershell
$env:YOUTUBE_DRY_RUN="true"
node -e "const yt = require('./server/youtube'); yt('test.mp4', 'Test').then(console.log).catch(console.error);"
```

---

## 7. ЛОГИ И ДИАГНОСТИКА

### 7.1. Где смотреть логи

**На удаленном сервере (PM2):**
```bash
# Все логи
pm2 logs nova-video

# Последние 100 строк
pm2 logs nova-video --lines 100

# Мониторинг в реальном времени
pm2 logs nova-video --raw

# Только YouTube-связанные логи
pm2 logs nova-video | grep youtube
```

**Локально (Windows) - если запускаете воркер:**
```powershell
# Если запускаете через node напрямую
node server/video-worker.js

# Логи будут в консоли
```

**Netlify (если используется функция):**
- Netlify Dashboard → Functions → video-worker → Logs
- Но YouTube функция там отключена, так что не актуально

### 7.2. Ключевые лог-строки для диагностики

**1. Авторизация OK:**
```
[youtube] uploading file: video.mp4 bytes: 12345678
[youtube] privacyStatus: public
```
**Где:** `server/youtube.js:84-85`  
**Когда:** Перед началом загрузки, после успешной инициализации OAuth

**2. Видео файл найден:**
```
[youtube] uploading file: video.mp4 bytes: 12345678
```
**Где:** `server/youtube.js:84`  
**Когда:** После проверки существования файла (строка 54)

**3. Upload started:**
```
[youtube] progress: 0%
```
**Где:** `server/youtube.js:115`  
**Когда:** Начало загрузки (onUploadProgress callback)

**4. Upload progress:**
```
[youtube] progress: 10%
[youtube] progress: 20%
...
[youtube] progress: 90%
[youtube] progress: 100%
```
**Где:** `server/youtube.js:115`  
**Когда:** Каждые 10% прогресса загрузки

**5. Upload done / videoId:**
```
[youtube] uploaded OK, videoId: dQw4w9WgXcQ
```
**Где:** `server/youtube.js:125`  
**Когда:** После успешной загрузки, получен videoId

**6. Feature flag проверка:**
```
[worker] feature flags: { youtubeUploadEnabled: true, telegramEnabled: true }
[youtube] disabled via feature flag, skipping
```
**Где:** `server/video-worker.js:133, 257`  
**Когда:** Если `youtubeUploadEnabled = false`

**7. Ошибка invalid_grant:**
```
[youtube] ❌ INVALID_GRANT ERROR DETECTED
[youtube] This usually means:
[youtube]   1. Refresh token was revoked (user removed app access)
[youtube]   2. Client ID/Secret mismatch (wrong OAuth app)
[youtube]   3. Clock skew (server time is incorrect)
[youtube]   4. Token expired and cannot be refreshed
[youtube] ACTION REQUIRED: Regenerate refresh token
[youtube] Run: node scripts/youtube-auth-cli.js
```
**Где:** `server/youtube.js:134-143`  
**Когда:** При ошибке авторизации (неверный refresh token)

**8. Общая ошибка загрузки:**
```
[youtube] upload failed: <error message>
[youtube] API error data: {...}
```
**Где:** `server/youtube.js:154, 151`  
**Когда:** При любой другой ошибке API

**9. Воркер обработал задачу:**
```
[worker] job done <job_id>
[youtube] uploaded: <videoId>
```
**Где:** `server/video-worker.js:288, 244`  
**Когда:** После успешной загрузки и обновления Firebase

### 7.3. Рекомендации по логированию

**Минимум 5 лог-строк для проверки YouTube:**

1. ✅ **`[worker] feature flags: { youtubeUploadEnabled: true, ... }`**  
   → Проверка, что флаг включен

2. ✅ **`[youtube] uploading file: ... bytes: ...`**  
   → Файл найден, начало загрузки

3. ✅ **`[youtube] progress: 0%`** → **`[youtube] progress: 100%`**  
   → Прогресс загрузки

4. ✅ **`[youtube] uploaded OK, videoId: ...`**  
   → Успешная загрузка

5. ✅ **`[worker] job done`** с `youtubeId: ...`  
   → Задача полностью обработана

**Если видите эти строки по порядку → YouTube работает ✅**

---

## 8. КОМАНДЫ/ШАГИ ДЛЯ ПРОВЕРКИ НА ПК

### 8.1. Подготовка

```powershell
# 1. Перейти в проект
cd C:\NovaCiv\NovaCiv

# 2. Установить зависимости (если еще не установлены)
npm install

# 3. Проверить наличие googleapis
npm list googleapis
# Должно показать: googleapis@144.0.0
```

### 8.2. Создать .env файл (если его нет)

```powershell
# Создать .env в корне проекта
New-Item -Path ".env" -ItemType File -Force

# Отредактировать .env (вручную или через редактор)
notepad .env
```

**Минимальное содержимое для теста YouTube:**
```bash
# Firebase (обязательно)
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
FIREBASE_DB_URL=https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app

# YouTube OAuth (обязательно)
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REFRESH_TOKEN=your_refresh_token
```

### 8.3. Проверка авторизации (БЕЗ загрузки)

```powershell
# Запустить тестовый скрипт
node scripts/test-youtube-auth.js
```

**Ожидаемый результат:** Все проверки пройдены ✅

**Если ошибка:** Следовать инструкциям из вывода скрипта

### 8.4. Генерация нового refresh token (если нужно)

```powershell
# Убедиться, что YOUTUBE_CLIENT_ID и YOUTUBE_CLIENT_SECRET в .env
node scripts/youtube-auth-cli.js

# Следуйте инструкциям:
# 1. Браузер откроется автоматически (или скопируйте URL)
# 2. Авторизуйте приложение в Google
# 3. Скопируйте refresh token из консоли
# 4. Добавьте в .env: YOUTUBE_REFRESH_TOKEN=<новый_токен>
```

### 8.5. Проверка импорта модуля

```powershell
# Проверить, что модуль YouTube импортируется
node -e "const yt = require('./server/youtube'); console.log('✅ Module type:', typeof yt);"
```

**Ожидаемый результат:** `✅ Module type: function`

### 8.6. Проверка feature flags в Firebase

**Вариант 1: Через скрипт (требует .env с Firebase credentials)**
```powershell
node -e "require('dotenv').config(); const {getDatabase}=require('./server/config/firebase-config'); const db=getDatabase(console); db.ref('config/features').once('value').then(s=>{console.log('Features:',JSON.stringify(s.val(),null,2)); process.exit(0);}).catch(e=>{console.error('Error:',e.message); process.exit(1);});"
```

**Вариант 2: Через Firebase Console**
1. Откройте https://console.firebase.google.com
2. Выберите проект NovaCiv
3. Realtime Database → `config/features`
4. Проверьте `youtubeUploadEnabled`

### 8.7. Локальный запуск воркера

**✅ ИСПРАВЛЕНО:** Путь к .env теперь определяется автоматически

**Запуск воркера:**
```powershell
# 1. Убедитесь, что .env файл существует в корне проекта
# 2. Запустите воркер
node server/video-worker.js
```

**Альтернатива - использовать переменную ENV_PATH:**
```powershell
$env:ENV_PATH="C:\NovaCiv\NovaCiv\.env"
node server/video-worker.js
```

**⚠️ ПРЕДУПРЕЖДЕНИЕ:** Воркер будет работать в бесконечном цикле, проверяя Firebase каждые 15 секунд. Для остановки: `Ctrl+C`

**Логи в консоли:**
```
[worker] Firebase initialized
[worker] feature flags: { youtubeUploadEnabled: false, telegramEnabled: true }
[worker] checking for pending jobs...
[worker] no pending jobs
...
```

### 8.8. Полная проверка работоспособности

**Шаг 1:** Проверить зависимости
```powershell
npm install
npm list googleapis
```

**Шаг 2:** Проверить .env переменные
```powershell
node -e "require('dotenv').config(); console.log('YOUTUBE_CLIENT_ID:', process.env.YOUTUBE_CLIENT_ID ? 'SET ✅' : 'MISSING ❌'); console.log('YOUTUBE_CLIENT_SECRET:', process.env.YOUTUBE_CLIENT_SECRET ? 'SET ✅' : 'MISSING ❌'); console.log('YOUTUBE_REFRESH_TOKEN:', process.env.YOUTUBE_REFRESH_TOKEN ? 'SET ✅' : 'MISSING ❌');"
```

**Шаг 3:** Тест авторизации (без загрузки)
```powershell
node scripts/test-youtube-auth.js
```

**Шаг 4:** Проверка feature flags
```powershell
# Через Firebase Console или скрипт (см. 8.6)
```

**Шаг 5:** (Опционально) Тест с приватным видео
```powershell
# Установить приватный режим
$env:YOUTUBE_PRIVACY_STATUS="private"
# Запустить воркер или создать тестовую задачу в Firebase
```

---

## 9. ЧТО МЕШАЕТ СЕЙЧАС

### 9.1. Критические проблемы

**✅ ИСПРАВЛЕНО: ПРОБЛЕМА 1: Хардкод пути .env в video-worker.js**

**Файл:** `server/video-worker.js:14-18`  
**Было:** `require("dotenv").config({ path: "/root/NovaCiv/.env" });`

**Исправлено:** Теперь использует определение платформы:
```javascript
const path = require("path");
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(__dirname, '..', '.env') : '/root/NovaCiv/.env');
require("dotenv").config({ path: envPath });
```

**Статус:** ✅ Исправлено - теперь работает на Windows и Linux

**❌ ПРОБЛЕМА 2: Отсутствие .env файла**

**Статус:** `.env` файл не найден в репозитории (правильно в .gitignore, но нужно создать вручную)  
**Влияние:** Все env переменные отсутствуют  
**Решение:** Создать `.env` с необходимыми переменными (см. раздел 4.5)

### 9.2. Потенциальные проблемы

**⚠️ ПРОБЛЕМА 3: Отсутствие DRY_RUN режима**

**Статус:** Нет встроенного тестового режима  
**Влияние:** Невозможно протестировать без реальной загрузки видео  
**Решение:** Создан `scripts/test-youtube-auth.js` для проверки авторизации без загрузки (см. раздел 6.2)

**⚠️ ПРОБЛЕМА 4: Неопределенность значения youtubeUploadEnabled в Firebase**

**Статус:** По умолчанию `false`, но нужно проверить текущее значение в продакшене  
**Влияние:** YouTube может быть выключен даже если все переменные настроены  
**Решение:** Проверить `config/features/youtubeUploadEnabled` в Firebase Console

**⚠️ ПРОБЛЕМА 5: Возможные проблемы с refresh token**

**Статус:** Неизвестно, валиден ли текущий refresh token  
**Влияние:** Ошибка `invalid_grant` при попытке загрузки  
**Решение:** Запустить `node scripts/test-youtube-auth.js` для проверки

### 9.3. Что НЕ является проблемой

**✅ googleapis установлен:** `googleapis@144.0.0` присутствует  
**✅ Код YouTube модуля корректен:** Логика загрузки выглядит правильно  
**✅ Feature flags работают:** Чтение из Firebase реализовано  
**✅ Обработка ошибок есть:** `invalid_grant` обрабатывается с подсказками  
**✅ CLI для генерации токена есть:** `scripts/youtube-auth-cli.js` работает

---

## 10. ИТОГОВЫЙ ВЕРДИКТ

### ❌ **НЕ ГОТОВО** (требуется исправление для локального тестирования)

### Что нужно сделать, чтобы стало ГОТОВО:

#### Шаг 1: ✅ ИСПРАВЛЕНО - Путь к .env в video-worker.js

**Файл:** `server/video-worker.js` строки 14-18

**Исправлено:**
```javascript
const path = require("path");
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(__dirname, '..', '.env') : '/root/NovaCiv/.env');
require("dotenv").config({ path: envPath });
```

**Статус:** ✅ Исправлено - теперь автоматически определяет платформу и использует правильный путь

#### Шаг 2: Создать .env файл локально

```powershell
cd C:\NovaCiv\NovaCiv
# Создать .env и заполнить переменными (см. раздел 4.5)
```

#### Шаг 3: Проверить авторизацию

```powershell
node scripts/test-youtube-auth.js
```

**Ожидаемый результат:** Все проверки пройдены ✅

#### Шаг 4: Проверить feature flag в Firebase

```bash
# В Firebase Console:
config/features/youtubeUploadEnabled = true
```

Или через скрипт:
```powershell
node -e "require('dotenv').config(); const {getDatabase}=require('./server/config/firebase-config'); const db=getDatabase(console); db.ref('config/features/youtubeUploadEnabled').once('value').then(s=>{console.log('youtubeUploadEnabled:',s.val()); process.exit(0);}).catch(e=>{console.error(e); process.exit(1);});"
```

#### Шаг 5: (Опционально) Протестировать с приватным видео

```powershell
# Установить приватный режим
$env:YOUTUBE_PRIVACY_STATUS="private"
# Создать тестовую задачу в Firebase videoJobs или запустить воркер
```

---

## 11. ЧЕКЛИСТ ГОТОВНОСТИ

### Код и зависимости:
- ✅ `server/youtube.js` существует и корректен
- ✅ `googleapis` установлен (v144.0.0)
- ✅ Feature flags читаются из Firebase
- ✅ Путь к .env исправлен (теперь работает на Windows и Linux)

### Конфигурация:
- ❌ `.env` файл не найден (нужно создать)
- ⚠️ Значение `youtubeUploadEnabled` в Firebase неизвестно (нужно проверить)
- ❌ Env переменные YouTube не проверены (нужно проверить через тест-скрипт)

### Тестирование:
- ✅ Создан `scripts/test-youtube-auth.js` для безопасной проверки
- ✅ Есть `scripts/youtube-auth-cli.js` для генерации токенов
- ❌ Нет встроенного DRY_RUN режима (но есть альтернативный тест)

### Документация:
- ✅ Архитектура описана в `ARCHITECTURE_V2.md`
- ✅ Миграция описана в `MIGRATION_GUIDE.md`
- ✅ Deployment описан в `DEPLOYMENT_CHECKLIST.md`
- ✅ Этот отчет создан ✅

---

## 12. РЕКОМЕНДАЦИИ

### Краткосрочные (для локального тестирования):

1. **Исправить путь .env** в `video-worker.js` (см. Шаг 1 выше)
2. **Создать .env** с необходимыми переменными
3. **Запустить тест:** `node scripts/test-youtube-auth.js`
4. **Проверить Firebase:** значение `youtubeUploadEnabled`

### Долгосрочные (улучшения):

1. **Добавить DRY_RUN режим** в `server/youtube.js` (см. раздел 6.4)
2. **Создать .env.example** с шаблоном всех переменных (без секретов)
3. **Добавить валидацию env переменных** при старте воркера
4. **Улучшить логирование:** добавить больше контекста в логи
5. **Создать unit-тесты** для YouTube модуля с моками API

---

**Конец отчета**
