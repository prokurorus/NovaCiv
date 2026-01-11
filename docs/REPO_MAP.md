# Repository Map — NovaCiv

**Структура проекта и "откуда что берется"**

---

## 🗂️ Directory Structure

```
/root/NovaCiv/
├── .github/workflows/      # GitHub Actions workflows
│   └── pipeline-health.yml # Health monitoring (каждые 30 минут)
├── docs/                   # Документация проекта
│   ├── PROJECT_STATE.md    # Текущее состояние системы
│   ├── REPO_MAP.md         # Этот файл
│   ├── RUNBOOKS.md         # Операционные процедуры
│   └── health-monitoring.md # Мониторинг здоровья pipeline
├── netlify/                # Netlify Functions
│   └── functions/          # Scheduled и HTTP функции
│       ├── fetch-news.js          # Скачивание новостей (RSS → Firebase)
│       ├── news-cron.js           # Отправка новостей в Telegram
│       ├── domovoy-auto-post.js   # Генерация постов Домового
│       ├── domovoy-auto-reply.js  # Ответы Домового
│       ├── health-news.js         # Health endpoint для новостей
│       ├── health-domovoy.js      # Health endpoint для Домового
│       └── video-worker.js        # Обработка видео
├── netlify.toml            # Конфигурация Netlify (scheduled functions)
├── runbooks/               # Операционные runbooks
│   ├── README.md           # Индекс runbooks
│   ├── deploy_pull_only.sh # Деплой (pull-only)
│   └── snapshot_system.sh  # Генерация snapshot
├── scripts/                # Утилитарные скрипты
│   ├── check-health-news.mjs      # Проверка здоровья новостей
│   ├── check-health-domovoy.mjs   # Проверка здоровья Домового
│   └── test-snapshot-secrets.sh   # Проверка snapshot на секреты
├── server/                 # Серверные процессы (PM2)
│   ├── ops-agent.js        # GitHub Ops Agent
│   └── video-worker.js     # Video Worker (PM2)
├── src/                    # Frontend код (React)
├── _state/                 # Состояние системы (snapshot)
│   ├── system_snapshot.json # JSON snapshot
│   └── system_snapshot.md  # Markdown snapshot
└── .env                    # Переменные окружения (НЕ в Git!)

```

---

## 🔄 "Откуда что берется"

### Netlify Functions → Firebase

**Функции:** `netlify/functions/*.js`

**Настроены в:** `netlify.toml`

**Запускаются:** По расписанию (Netlify Scheduled Functions) или по HTTP запросу

**Пишут в Firebase:**
- `forum/topics` — темы форума (новости, посты Домового)
- `forum/comments` — комментарии к темам
- `newsMeta/en.json` — метаданные обработанных новостей
- `health/news/*` — heartbeat метрики новостного pipeline
- `health/domovoy/*` — heartbeat метрики Домового pipeline

**Читают из Firebase:**
- `forum/topics` — для отправки в Telegram (`news-cron`)
- `forum/comments` — для ответов Домового (`domovoy-auto-reply`)
- `videoJobs` — для обработки видео (`video-worker`)
- `config` — feature flags

### Server Processes (PM2) → Firebase/GitHub

**Процессы:** `server/*.js`

**Запускаются:** PM2 (см. `pm2 list`)

**nova-ops-agent:**
- Читает GitHub Issues (метка "ops")
- Выполняет команды (snapshot, status, и т.д.)
- Комментирует результаты в Issues
- Использует Firebase для хранения состояния (если нужно)

**nova-video:**
- Читает задачи из Firebase (`videoJobs`)
- Обрабатывает видео
- Загружает на YouTube
- Обновляет статус задач в Firebase

### Frontend (React) → Firebase

**Код:** `src/*.tsx`, `src/*.ts`

**Пишет/читает в Firebase:**
- `messages` — сообщения чата
- `forum/topics` — темы форума (чтение)
- `forum/comments` — комментарии (чтение/запись)
- `stats` — статистика (visitors, likes, joined)
- `members` — участники форума

---

## 📁 Key Files

### Configuration
- **netlify.toml** — конфигурация Netlify (scheduled functions, build settings)
- **.env** — переменные окружения (НЕ в Git, только на сервере)
- **.env.example** — пример переменных окружения (в Git)

### Documentation
- **docs/PROJECT_STATE.md** — текущее состояние системы
- **docs/REPO_MAP.md** — этот файл (структура проекта)
- **docs/RUNBOOKS.md** — операционные процедуры
- **docs/health-monitoring.md** — мониторинг здоровья pipeline
- **runbooks/README.md** — индекс runbooks

### Operations
- **runbooks/deploy_pull_only.sh** — деплой (pull-only)
- **runbooks/snapshot_system.sh** — генерация snapshot
- **scripts/check-health-news.mjs** — проверка здоровья новостей
- **scripts/check-health-domovoy.mjs** — проверка здоровья Домового
- **scripts/test-snapshot-secrets.sh** — проверка snapshot на секреты

### State
- **_state/system_snapshot.json** — JSON snapshot (автоматически обновляется каждые 30 минут)
- **_state/system_snapshot.md** — Markdown snapshot (автоматически обновляется каждые 30 минут)

---

## 🔗 External Services

### Firebase Realtime Database
- **URL:** из переменной `FIREBASE_DB_URL`
- **Auth:** Service Account JSON (`FIREBASE_SERVICE_ACCOUNT_JSON`)
- **Nodes:** см. `docs/PROJECT_STATE.md`

### Netlify
- **Functions:** `netlify/functions/*.js`
- **Scheduled:** настроены в `netlify.toml`
- **Deploy:** автоматически из GitHub (main branch)

### GitHub
- **Repository:** source of truth
- **Actions:** `.github/workflows/*.yml`
- **Ops:** Issues с меткой "ops" обрабатываются `nova-ops-agent`

### Telegram
- **Bot:** токен из `TELEGRAM_BOT_TOKEN`
- **Channels:** `TELEGRAM_NEWS_CHAT_ID_RU/EN/DE`

### OpenAI
- **API:** ключ из `OPENAI_API_KEY`
- **Usage:** генерация текстов (новости, посты Домового, ответы)

### YouTube
- **OAuth:** `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`
- **Upload:** через `video-worker` (Netlify scheduled function)

---

## 🚀 Deployment Flow

1. **Изменения в коде** → коммит в GitHub (main branch)
2. **Netlify** → автоматический deploy (из main branch)
3. **Сервер** → pull-only режим: `bash runbooks/deploy_pull_only.sh`
   - `git fetch origin`
   - `git reset --hard origin/main`
   - `pm2 restart all`

**ВАЖНО:** Сервер в pull-only режиме. Все изменения только через GitHub.

---

*Документ обновляется при изменениях в структуре проекта.*
