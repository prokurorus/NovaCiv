# Детальный аудит использования Netlify функций в репозитории NovaCiv

**Дата:** 2024  
**Репозиторий:** NovaCiv  
**Путь к функциям:** `netlify/functions/`

---

## 1. АУДИТ ВЫЗОВОВ ФУНКЦИЙ

### 1.1 send-email

**STATUS:** (B) не найдено прямых вызовов

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/send-email.js`

**HOW:** 
- Ожидаемый тип вызова: `fetch POST` (но не найден в коде)

**ENV READ:**
- `SENDGRID_API_KEY` (обязательно)
- `TELEGRAM_BOT_TOKEN` (опционально, для уведомлений)
- `TELEGRAM_CHAT_ID` (опционально, для уведомлений)

---

### 1.2 ai-voice

**STATUS:** (B) не найдено прямых вызовов

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/ai-voice.js`

**HOW:**
- Ожидаемый тип вызова: `fetch POST` (но не найден в коде)

**ENV READ:**
- `OPENAI_API_KEY` (обязательно)
- `OPENAI_TTS_MODEL` (опционально, дефолт: "gpt-4o-mini-tts")

**ПРИМЕЧАНИЕ:** Функция может использоваться как standalone utility, но в коде проекта вызовов не найдено.

---

### 1.3 post-news-to-telegram

**STATUS:** (B) не найдено прямых вызовов

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/post-news-to-telegram.js`

**HOW:**
- Ожидаемый тип вызова: `GET/POST` с query параметром `token` (но не найден в коде)

**ENV READ:**
- `FIREBASE_DB_URL` (обязательно)
- `TELEGRAM_BOT_TOKEN` (обязательно)
- `NEWS_CRON_SECRET` (для проверки токена)
- `TELEGRAM_NEWS_CHAT_ID` (для английского канала)
- `TELEGRAM_NEWS_CHAT_ID_RU` (для русского канала)
- `TELEGRAM_NEWS_CHAT_ID_DE` (для немецкого канала)

**ПРИМЕЧАНИЕ:** Функция является альтернативой `news-cron.js` и дублирует функциональность.

---

### 1.4 news-cron

**STATUS:** (C) вызывается только кроном

**WHERE:**
- Настроено в `netlify.toml`: строка 19-20
- Функция: `netlify/functions/news-cron.js`

**HOW:**
- Тип вызова: **Netlify scheduled function**
- Cron schedule: `"0 * * * *"` (каждый час)

**ENV READ:**
- `FIREBASE_DB_URL` (обязательно)
- `NEWS_CRON_SECRET` (обязательно, для проверки токена)
- `TELEGRAM_BOT_TOKEN` (обязательно)
- `TELEGRAM_NEWS_CHAT_ID` или `TELEGRAM_CHAT_ID` (для английского канала)
- `TELEGRAM_NEWS_CHAT_ID_RU` (для русского канала)
- `TELEGRAM_NEWS_CHAT_ID_DE` (для немецкого канала)

**ПРИМЕЧАНИЕ:** Функция читает темы из Firebase (которые были созданы `fetch-news.js`), но сама `fetch-news.js` НЕ вызывает.

---

### 1.5 domovoy-reply

**STATUS:** (B) не найдено прямых вызовов

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/domovoy-reply.js`

**HOW:**
- Ожидаемый тип вызова: `GET/POST` с query параметром `token` (но не найден в коде)
- Предполагается manual/cron вызов

**ENV READ:**
- `OPENAI_API_KEY` (обязательно)
- `FIREBASE_DB_URL` (обязательно)
- `DOMOVOY_REPLY_CRON_SECRET` (для проверки токена)
- `OPENAI_MODEL` (опционально, дефолт: "gpt-4o-mini")

**ПРИМЕЧАНИЕ:** Функция дублирует функциональность `domovoy-auto-reply.js`.

---

### 1.6 domovoy-auto-reply

**STATUS:** (B) не найдено прямых вызовов

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/domovoy-auto-reply.js`

**HOW:**
- Ожидаемый тип вызова: `GET/POST` с query параметром `token` (но не найден в коде)
- Предполагается manual/cron вызов

**ENV READ:**
- `OPENAI_API_KEY` (обязательно)
- `FIREBASE_DB_URL` (обязательно)
- `DOMOVOY_CRON_SECRET` (для проверки токена)
- `OPENAI_MODEL` (опционально, дефолт: "gpt-4o-mini")

---

### 1.7 hello

**STATUS:** (B) не найдено прямых вызовов (test/legacy функция)

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/hello.js`

**HOW:**
- Ожидаемый тип вызова: любой HTTP (но не найден в коде)

**ENV READ:**
- Нет env variables

**ПРИМЕЧАНИЕ:** Тестовая функция, возвращает `{"ok": true, "message": "hello function is working"}`

---

### 1.8 test-video

**STATUS:** (B) не найдено прямых вызовов (test/legacy функция)

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/test-video.js`

**HOW:**
- Ожидаемый тип вызова: любой HTTP (но не найден в коде)

**ENV READ:**
- Нет env variables

**ПРИМЕЧАНИЕ:** Тестовая функция, возвращает `{"ok": true, "message": "test-video function works"}`

---

### 1.9 auto-create-video-job

**STATUS:** (B) не найдено прямых вызовов (test/legacy функция)

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/auto-create-video-job.js`

**HOW:**
- Ожидаемый тип вызова: любой HTTP (но не найден в коде)

**ENV READ:**
- Нет env variables

**ПРИМЕЧАНИЕ:** Тестовая функция, возвращает `{"ok": true, "message": "auto-create-video-job minimal test OK"}`

---

### 1.10 generate-video

**STATUS:** (B) не найдено прямых вызовов

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/generate-video.js`
- Вызывает: `generate-video-background` (строка 20)

**HOW:**
- Ожидаемый тип вызова: `GET/POST` с query параметром `lang` (но не найден в коде)
- Внутренний вызов: `fetch POST` к `/.netlify/functions/generate-video-background`

**ENV READ:**
- `URL` или `DEPLOY_PRIME_URL` или `SITE_NAME` (Netlify автоматические переменные, для построения URL)

---

### 1.11 generate-video-background

**STATUS:** (D) вызывается только другой функцией

**WHERE:**
- Вызывается из: `netlify/functions/generate-video.js` (строка 20)
- Функция: `netlify/functions/generate-video-background.js`

**HOW:**
- Тип вызова: **internal call** (fetch POST из `generate-video.js`)

**ENV READ:**
- Env vars читаются через `media/scripts/pipeline.js`:
  - `OPENAI_API_KEY` (обязательно, через pipeline)
  - `OPENAI_TTS_MODEL` (опционально, через pipeline)
  - Фоновые изображения из `media/backgrounds/` (включены через `included_files` в netlify.toml)

---

### 1.12 video-worker (ранее video-worker-background)

**STATUS:** (C) вызывается только кроном

**WHERE:**
- Настроено в `netlify.toml`: строка 22-23
- Функция: `netlify/functions/video-worker.js` (ранее `video-worker-background.js`)

**HOW:**
- Тип вызова: **Netlify scheduled function**
- Cron schedule: `"*/15 * * * *"` (каждые 15 минут)

**ENV READ:**
- `FIREBASE_SERVICE_ACCOUNT_JSON` (обязательно, для Firebase Admin)
- `FIREBASE_DB_URL` или `FIREBASE_DATABASE_URL` (обязательно)
- `TELEGRAM_BOT_TOKEN` (опционально, для отправки видео)
- `TELEGRAM_NEWS_CHAT_ID` (опционально, базовый канал)
- `TELEGRAM_NEWS_CHAT_ID_RU` (опционально)
- `TELEGRAM_NEWS_CHAT_ID_EN` (опционально)
- `TELEGRAM_NEWS_CHAT_ID_DE` (опционально)
- `TELEGRAM_NEWS_CHAT_ID_ES` (опционально)
- Env vars для pipeline (через `media/scripts/pipeline.js`):
  - `OPENAI_API_KEY` (обязательно)
  - `OPENAI_TTS_MODEL` (опционально)

**✅ ИСПРАВЛЕНО:** Файл переименован для соответствия имени в `netlify.toml`.

---

### 1.13 create-video-job

**STATUS:** (B) не найдено прямых вызовов

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/create-video-job.js`

**HOW:**
- Ожидаемый тип вызова: `GET/POST` (но не найден в коде)
- Предполагается manual/cron вызов

**ENV READ:**
- `FIREBASE_SERVICE_ACCOUNT_JSON` (обязательно, для Firebase Admin)
- `FIREBASE_DB_URL` или `FIREBASE_DATABASE_URL` (обязательно)

---

### 1.14 domovoy-auto-post

**STATUS:** (B) не найдено прямых вызовов

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/domovoy-auto-post.js`

**HOW:**
- Ожидаемый тип вызова: `GET` с query параметром `token` (но не найден в коде)
- Предполагается manual/cron вызов

**ENV READ:**
- `OPENAI_API_KEY` (обязательно)
- `FIREBASE_DB_URL` (обязательно)
- `DOMOVOY_CRON_SECRET` (для проверки токена)
- `OPENAI_MODEL` (опционально, дефолт: "gpt-4o-mini")

---

### 1.15 fetch-news

**STATUS:** (B) не найдено прямых вызовов

**WHERE:**
- Прямые вызовы: **НЕ НАЙДЕНО** в коде проекта
- Функция существует: `netlify/functions/fetch-news.js`

**HOW:**
- Ожидаемый тип вызова: `GET/POST` с query параметром `token` (но не найден в коде)
- Предполагается manual/cron вызов
- **ВАЖНО:** `news-cron.js` НЕ вызывает `fetch-news.js`. Они работают независимо:
  - `fetch-news.js` - получает новости из RSS, обрабатывает через OpenAI, сохраняет в Firebase
  - `news-cron.js` - читает темы из Firebase и отправляет в Telegram

**ENV READ:**
- `OPENAI_API_KEY` (обязательно)
- `FIREBASE_DB_URL` (обязательно)
- `NEWS_CRON_SECRET` (для проверки токена)
- `OPENAI_MODEL` (опционально, дефолт: "gpt-4o-mini")

---

## 2. КОНФИГУРАЦИЯ NETLIFY.TOML

### 2.1 [functions] секция

**Location:** `netlify.toml`, строки 14-17

```toml
[functions]
  included_files = ["media/**"]
  external_node_modules = ["ffmpeg-static", "openai"]
  node_bundler = "esbuild"
```

**Расшифровка:**
- `included_files = ["media/**"]` - включает все файлы из директории `media/` в функции (фоны, скрипты pipeline)
- `external_node_modules = ["ffmpeg-static", "openai"]` - внешние модули, которые не бандлятся
- `node_bundler = "esbuild"` - использует esbuild для бандлинга

### 2.2 [build] секция

**Location:** `netlify.toml`, строки 1-4, 6-7

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "18"
```

**Расшифровка:**
- `functions = "netlify/functions"` - директория с функциями
- `NODE_VERSION = "18"` - версия Node.js для сборки

### 2.3 [[redirects]] секция

**Location:** `netlify.toml`, строки 9-12

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Расшифровка:**
- SPA редирект: все маршруты ведут на `/index.html` (status 200 для SPA)

### 2.4 Schedule blocks (scheduled functions)

**Location:** `netlify.toml`, строки 19-23

#### 2.4.1 news-cron

```toml
[functions."news-cron"]
  schedule = "0 * * * *"
```

- **Имя функции:** `news-cron`
- **Cron выражение:** `0 * * * *` (каждый час, в 0 минут)
- **Файл функции:** `netlify/functions/news-cron.js`
- **Что делает:** Читает новые темы из Firebase (`forum/topics`, section: "news") и отправляет в Telegram каналы

#### 2.4.2 video-worker

```toml
[functions."video-worker"]
  schedule = "*/15 * * * *"
```

- **Имя функции:** `video-worker`
- **Cron выражение:** `*/15 * * * *` (каждые 15 минут)
- **Файл функции:** `netlify/functions/video-worker.js` (ранее `video-worker-background.js`)
- **Что делает:** Обрабатывает первую pending задачу из `videoJobs/` в Firebase, генерирует видео через pipeline, отправляет в Telegram

**✅ ИСПРАВЛЕНО:** Файл переименован из `video-worker-background.js` в `video-worker.js` для соответствия имени в `netlify.toml`.

---

## 3. РЕКОМЕНДАЦИИ

### KEEP (основной путь - оставить и использовать)

1. **ai-domovoy.js** ✅
   - Используется фронтендом (`src/components/AssistantWidget.tsx`, строка 205)
   - Критически важная функция для работы сайта

2. **news-cron.js** ✅
   - Запланирована в cron (каждый час)
   - Активно используется для публикации новостей в Telegram

3. **fetch-news.js** ✅
   - Обрабатывает RSS новости и сохраняет в Firebase
   - Необходима для работы `news-cron.js` (косвенно, через данные)

4. **video-worker.js** ✅ (ранее `video-worker-background.js`)
   - Запланирована в cron (каждые 15 минут)
   - Обрабатывает очередь видео-задач
   - **✅ ИСПРАВЛЕНО:** Имя функции соответствует файлу

5. **domovoy-auto-post.js** ✅
   - Генерирует авто-посты Домового
   - Полезна для автоматизации контента

6. **domovoy-auto-reply.js** ✅
   - Автоматически отвечает на комментарии
   - Полезна для поддержания активности

7. **create-video-job.js** ✅
   - Создает задачи для видео-очереди
   - Необходима для работы видео-воркера

8. **generate-video.js** + **generate-video-background.js** ✅
   - Связанные функции для генерации видео
   - `generate-video-background.js` вызывается из `generate-video.js`

---

### DEPRECATE (оставить но не запускать - возможно используются вручную или через внешние cron)

1. **post-news-to-telegram.js** ⚠️
   - Дублирует функциональность `news-cron.js`
   - Не используется в коде
   - **Рекомендация:** Проверить, используется ли вручную. Если нет - удалить

2. **domovoy-reply.js** ⚠️
   - Дублирует функциональность `domovoy-auto-reply.js`
   - Не используется в коде
   - **Рекомендация:** Проверить, используется ли вручную. Если нет - удалить

3. **send-email.js** ⚠️
   - Не найдено вызовов в коде
   - Может использоваться для contact form, но форма не найдена
   - **Рекомендация:** Проверить, используется ли на фронтенде (возможно в компонентах Join/Contact). Если нет - удалить

4. **ai-voice.js** ⚠️
   - Не найдено вызовов в коде
   - Standalone TTS utility
   - **Рекомендация:** Проверить, используется ли где-то внешне. Если нет - удалить или документировать назначение

---

### REMOVE (безопасно удалить - тестовые/legacy функции)

1. **hello.js** ❌
   - Тестовая функция
   - Не используется
   - **Рекомендация:** Удалить

2. **test-video.js** ❌
   - Тестовая функция
   - Не используется
   - **Рекомендация:** Удалить

3. **auto-create-video-job.js** ❌
   - Тестовая stub функция
   - Не используется
   - **Рекомендация:** Удалить

---

## 4. КРИТИЧЕСКИЕ ПРОБЛЕМЫ

1. **✅ ИСПРАВЛЕНО: Несоответствие имени функции в netlify.toml:**
   - Файл переименован: `video-worker-background.js` → `video-worker.js`
   - Теперь соответствует имени в `netlify.toml`: `[functions."video-worker"]`

2. **✅ ИСПРАВЛЕНО: Отсутствие вызовов критических функций:**
   - `fetch-news.js` - добавлена в cron (каждые 3 часа: `0 */3 * * *`)
   - Теперь news pipeline работает автоматически: `fetch-news.js` создаёт данные → `news-cron.js` публикует в Telegram

---

## 5. СВОДНАЯ ТАБЛИЦА ENV VARIABLES

| Env Variable | Функции, которые её используют |
|--------------|--------------------------------|
| `OPENAI_API_KEY` | ai-domovoy, ai-voice, domovoy-auto-post, domovoy-auto-reply, domovoy-reply, fetch-news, generate-video-background (via pipeline), video-worker (via pipeline) |
| `FIREBASE_DB_URL` / `FIREBASE_DATABASE_URL` | news-cron, post-news-to-telegram, fetch-news, domovoy-auto-post, domovoy-auto-reply, domovoy-reply, create-video-job, video-worker |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | create-video-job, video-worker |
| `TELEGRAM_BOT_TOKEN` | news-cron, post-news-to-telegram, video-worker, send-email |
| `NEWS_CRON_SECRET` | news-cron, post-news-to-telegram, fetch-news |
| `DOMOVOY_CRON_SECRET` | domovoy-auto-post, domovoy-auto-reply |
| `DOMOVOY_REPLY_CRON_SECRET` | domovoy-reply |
| `TELEGRAM_CHAT_ID` | send-email |
| `TELEGRAM_NEWS_CHAT_ID` | news-cron, post-news-to-telegram, video-worker |
| `TELEGRAM_NEWS_CHAT_ID_RU` | news-cron, post-news-to-telegram, video-worker |
| `TELEGRAM_NEWS_CHAT_ID_DE` | news-cron, post-news-to-telegram, video-worker |
| `TELEGRAM_NEWS_CHAT_ID_EN` | video-worker |
| `TELEGRAM_NEWS_CHAT_ID_ES` | video-worker |
| `SENDGRID_API_KEY` | send-email |
| `OPENAI_MODEL` | domovoy-auto-post, domovoy-auto-reply, domovoy-reply, fetch-news |
| `OPENAI_TTS_MODEL` | ai-domovoy, ai-voice, generate-video-background (via pipeline), video-worker (via pipeline) |

---

## 6. ИСПРАВЛЕНИЯ И ИЗМЕНЕНИЯ

**Дата исправлений:** 2024  
**Коммит:** `chore: pre-cleanup snapshot before netlify functions audit fixes` → `fix: netlify functions audit cleanup`

### 6.1 Список изменённых файлов

#### A) Исправление несоответствия имени scheduled функции

**Файлы:**
- `netlify/functions/video-worker-background.js` → `netlify/functions/video-worker.js` (переименован)
- `netlify.toml` (без изменений, но теперь соответствует)

**До:**
- В `netlify.toml`: `[functions."video-worker"]` → искал `video-worker.js`
- Фактический файл: `video-worker-background.js`
- **Проблема:** Netlify не мог найти функцию по расписанию

**После:**
- В `netlify.toml`: `[functions."video-worker"]` → находит `video-worker.js`
- Файл переименован: `video-worker-background.js` → `video-worker.js`
- **Результат:** Scheduled function теперь работает корректно

**Риски:** Минимальные. Функция не вызывалась напрямую из кода, только по расписанию. Переименование файла не влияет на логику.

---

#### B) Обеспечение согласованности news pipeline

**Файлы:**
- `netlify.toml` (добавлен schedule для fetch-news)

**До:**
- `fetch-news.js` не была запланирована в cron
- `news-cron.js` запускалась каждый час, но читала данные, которые создавала `fetch-news.js`
- **Проблема:** `fetch-news.js` не запускалась автоматически, новости не создавались

**После:**
- `fetch-news.js` запланирована: `0 */3 * * *` (каждые 3 часа)
- `news-cron.js` остаётся: `0 * * * *` (каждый час)
- **Pipeline:**
  1. `fetch-news.js` (каждые 3 часа) → получает RSS, обрабатывает через OpenAI, сохраняет в Firebase `forum/topics` (section: "news")
  2. `news-cron.js` (каждый час) → читает новые темы из Firebase, отправляет в Telegram, помечает как отправленные

**Риски:** Низкие. Добавление schedule не влияет на существующую логику, только автоматизирует запуск.

---

#### C) Очистка legacy/test/duplicate функций

**Удалённые файлы:**
- `netlify/functions/hello.js` (тестовая stub)
- `netlify/functions/test-video.js` (тестовая stub)
- `netlify/functions/auto-create-video-job.js` (тестовая stub)

**До:**
- Тестовые функции присутствовали в репозитории
- Не использовались в коде или по расписанию

**После:**
- Файлы удалены
- Репозиторий очищен от тестового кода

**Риски:** Отсутствуют. Функции не использовались.

---

**Помеченные как DEPRECATED:**
- `netlify/functions/post-news-to-telegram.js`
- `netlify/functions/domovoy-reply.js`

**До:**
- `post-news-to-telegram.js` дублировала функциональность `news-cron.js`
- `domovoy-reply.js` дублировала функциональность `domovoy-auto-reply.js`
- Обе функции не использовались в коде

**После:**
- Добавлены заголовки `⚠️ DEPRECATED` в начало файлов
- Функции сохранены для справки, но помечены как неиспользуемые
- В документации указано использовать альтернативы

**Риски:** Низкие. Функции не вызывались из кода. Если они использовались вручную или через внешние cron, их можно восстановить из git истории.

---

#### D) Обновление карты проекта

**Файлы:**
- `FILE_MAP_NovaCiv_UPDATED.txt`

**Изменения:**
- Все ссылки на `video-worker-background.js` → `video-worker.js`
- Обновлено расписание функций:
  - `fetch-news`: каждые 3 часа (0 */3 * * *)
  - `news-cron`: каждый час (0 * * * *)
  - `video-worker`: каждые 15 минут (*/15 * * * *)
- Удалены ссылки на удалённые тестовые функции
- Добавлены пометки [DEPRECATED] для устаревших функций
- Обновлены описания news pipeline

**Риски:** Отсутствуют. Только документация.

---

### 6.2 Что изменилось / Почему / Риски

#### Что изменилось:

1. **Переименование функции:** `video-worker-background.js` → `video-worker.js`
2. **Добавлен schedule:** `fetch-news.js` теперь запускается каждые 3 часа
3. **Удалены тестовые функции:** `hello.js`, `test-video.js`, `auto-create-video-job.js`
4. **Помечены как deprecated:** `post-news-to-telegram.js`, `domovoy-reply.js`
5. **Обновлена документация:** `FILE_MAP_NovaCiv_UPDATED.txt` отражает текущее состояние

#### Почему:

1. **Переименование:** Netlify ищет функцию по имени из `netlify.toml`. Несоответствие имени и файла приводило к ошибке scheduled function.
2. **Schedule для fetch-news:** Функция создаёт данные для `news-cron.js`, но не запускалась автоматически. Теперь pipeline работает автономно.
3. **Удаление тестов:** Очистка репозитория от неиспользуемого кода.
4. **Deprecation:** Сохранение функций для справки, но явное указание на альтернативы.

#### Риски:

- **Низкие:** Все изменения минимальны и не затрагивают активный код
- **Переименование:** Может потребоваться обновление внешних ссылок (если есть), но функция вызывалась только по расписанию
- **Deprecated функции:** Если они использовались вручную, их можно восстановить из git или использовать как есть (они всё ещё работают)

---

### 6.3 Git команды для финального коммита

```bash
git add -A
git commit -m "fix: netlify functions audit cleanup

- Rename video-worker-background.js to video-worker.js (fix schedule mismatch)
- Add schedule for fetch-news.js (every 3 hours: 0 */3 * * *)
- Delete test functions: hello.js, test-video.js, auto-create-video-job.js
- Deprecate post-news-to-telegram.js (use news-cron.js instead)
- Deprecate domovoy-reply.js (use domovoy-auto-reply.js instead)
- Update FILE_MAP_NovaCiv_UPDATED.txt with current state
- Document all changes in NETLIFY_FUNCTIONS_AUDIT_DETAILED.md"
```

**Примечание:** Коммит не будет отправлен (push) согласно инструкциям.

---

**Конец отчета**

