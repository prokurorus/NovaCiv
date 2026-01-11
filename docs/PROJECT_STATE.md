# Project State — NovaCiv

**Last verified:** 2026-01-11  
**Status:** Active

---

## 🎯 Entry Points

**Для начала работы с системой:**
1. Прочитайте [REPO_MAP.md](./REPO_MAP.md) — структура проекта
2. Прочитайте [RUNBOOKS.md](./RUNBOOKS.md) — операционные процедуры
3. Прочитайте [runbooks/SOURCE_OF_TRUTH.md](../runbooks/SOURCE_OF_TRUTH.md) — регламент синхронизации
4. Проверьте snapshot: `cat /root/NovaCiv/_state/system_snapshot.md`

---

## 🔒 Source of Truth

**Source of Truth = GitHub main**

Все изменения кода: делаются на ПК → commit/push → GitHub.

Сервер: только `git pull + pm2 restart` (через `deploy_pull_only.sh`), без ручных правок кода.

На сервере вручную допускаются только: `.env`, системные конфиги, инфраструктурные настройки.

**Подробности:** см. [runbooks/SOURCE_OF_TRUTH.md](../runbooks/SOURCE_OF_TRUTH.md)

---

## 📍 Repere Points (Ключевые точки)

### Repository
- **Root path:** `/root/NovaCiv`
- **Branch:** `main` (pull-only режим)
- **Remote:** GitHub (source of truth)

### Server Processes (PM2)
- **nova-ops-agent** — GitHub Ops Agent (обрабатывает issues с меткой "ops")
- **nova-video** — Video Worker (обрабатывает видео для YouTube)

### Cron Jobs
- **snapshot_system.sh** — каждые 30 минут (`*/30 * * * *`)
  - Путь: `/root/NovaCiv/runbooks/snapshot_system.sh`
  - Лог: `/var/log/novaciv_snapshot.log`

### Health Endpoints
- **health-news:** `/.netlify/functions/health-news?token=<NEWS_CRON_SECRET>`
- **health-domovoy:** `/.netlify/functions/health-domovoy?token=<NEWS_CRON_SECRET>`

### Firebase Database Nodes
- **videoJobs** — очередь видео-задач для обработки и загрузки на YouTube
- **config** — конфигурационные флаги (feature flags)
- **newsMeta/en.json** — метаданные обработанных новостей (processedKeys, titleKeys)
- **forum/topics** — темы форума (включая новости и посты Домового)
- **forum/comments** — комментарии к темам
- **health/news/** — heartbeat метрики для новостного pipeline
- **health/domovoy/** — heartbeat метрики для Домового pipeline

### Netlify Scheduled Functions
Все scheduled functions настроены в `netlify.toml`:

- **fetch-news** — `0 */3 * * *` (каждые 3 часа)
  - Скачивает новости из RSS источников
  - Обрабатывает через OpenAI
  - Сохраняет в Firebase (`forum/topics`, `newsMeta/en.json`)
  - Пишет метрики в `/health/news/fetchNewsLastRun`

- **news-cron** — `0 * * * *` (каждый час)
  - Читает новые темы из `forum/topics` (section: "news")
  - Отправляет в Telegram каналы (RU/EN/DE)
  - Пишет метрики в `/health/news/newsCronLastRun`

- **domovoy-auto-post** — `0 0 * * *` (раз в сутки)
  - Генерирует философский пост через OpenAI
  - Сохраняет в Firebase (`forum/topics`)
  - Отправляет в Telegram канал по языку
  - Пишет метрики в `/health/domovoy/autoPostLastRun`

- **domovoy-auto-reply** — `*/10 * * * *` (каждые 10 минут)
  - Сканирует комментарии в темах Домового
  - Генерирует ответы через OpenAI
  - Сохраняет в Firebase (`forum/comments`)
  - Пишет метрики в `/health/domovoy/autoReplyLastRun`

- **video-worker** — `*/15 * * * *` (каждые 15 минут)
  - Обрабатывает видео-задачи из `videoJobs`

---

## 🔄 Main Flows

### News Pipeline
1. **fetch-news** (Netlify scheduled) → скачивает RSS → обрабатывает через OpenAI → сохраняет в Firebase
2. **news-cron** (Netlify scheduled) → читает новые темы → отправляет в Telegram (RU/EN/DE)

### Domovoy Pipeline
1. **domovoy-auto-post** (Netlify scheduled) → генерирует пост → сохраняет в Firebase → отправляет в Telegram
2. **domovoy-auto-reply** (Netlify scheduled) → сканирует комментарии → генерирует ответы → сохраняет в Firebase

### Video Pipeline
1. Создание задачи → Firebase (`videoJobs`)
2. **video-worker** (Netlify scheduled) → обрабатывает задачу → загружает на YouTube

### Ops Pipeline
1. GitHub Issue с меткой "ops" → **nova-ops-agent** (PM2) → выполняет команду → комментирует в Issue

---

## 🔧 Toggles & Configuration

### Feature Flags Contract (Firebase `config/features/`)

**Где живут:** Firebase Realtime Database → `config/features/`

**Кто читает:** 
- `server/video-worker.js` (nova-video PM2 process)
- `server/config/feature-flags.js` (функция чтения флагов)

**Примеры:**
- `youtubeUploadEnabled` (boolean) — включение/выключение загрузки видео на YouTube
- `telegramEnabled` (boolean) — включение/выключение отправки в Telegram

**Важные правила:**
- Изменение флагов = runtime-операция (через Firebase Console), не требует деплоя
- Флаги не должны дублироваться в коде или `.env`
- При ошибке чтения Firebase используются безопасные дефолты:
  - `youtubeUploadEnabled: false`
  - `telegramEnabled: true`

**Подробности:** см. [docs/DATA_MODEL_RTDB.md](./DATA_MODEL_RTDB.md#configfeatures)

### Environment Variables
См. `.env.example` для списка переменных окружения:
- `FIREBASE_DB_URL` — URL Firebase Realtime Database
- `FIREBASE_SERVICE_ACCOUNT_JSON` — сервисный аккаунт Firebase (JSON)
- `OPENAI_API_KEY` — ключ OpenAI API
- `TELEGRAM_BOT_TOKEN` — токен Telegram бота
- `TELEGRAM_NEWS_CHAT_ID_RU` — ID чата для новостей (RU)
- `TELEGRAM_NEWS_CHAT_ID_EN` — ID чата для новостей (EN)
- `TELEGRAM_NEWS_CHAT_ID_DE` — ID чата для новостей (DE)
- `NEWS_CRON_SECRET` — секрет для health endpoints
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` — YouTube OAuth
- И другие (см. `.env.example`)

**ВАЖНО:** Все секреты хранятся в `.env` файле на сервере, НЕ в Git.

---

## ⚠️ Known Issues

(Обновляется по мере обнаружения)

- Нет известных критических проблем на текущий момент

---

## 📊 Monitoring

### Health Checks
- **News pipeline:** `node scripts/check-health-news.mjs`
- **Domovoy pipeline:** `node scripts/check-health-domovoy.mjs`
- **GitHub Actions:** `.github/workflows/pipeline-health.yml` (каждые 30 минут)

### Logs
- **PM2 logs:** `pm2 logs` или `pm2 logs <process-name>`
- **Snapshot log:** `/var/log/novaciv_snapshot.log`
- **Netlify Functions:** Netlify Dashboard → Functions → Logs

### Metrics
- **Firebase:** `/health/news/*` и `/health/domovoy/*` (heartbeat метрики)
- **PM2:** `pm2 status`, `pm2 describe <process-name>`

---

*Документ обновляется при изменениях в системе.*
