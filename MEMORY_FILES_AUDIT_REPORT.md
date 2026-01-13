# Отчёт о файлах памяти и механизмах фиксации состояния NovaCiv

**Дата аудита:** 2026-01-11  
**Режим:** Read-only (без изменений)  
**Область:** Файлы памяти, snapshot-механизмы, ops-agent

---

## 1. Файлы памяти проекта

### 1.1. Основные файлы состояния

#### `docs/PROJECT_STATE.md`
- **Полный путь:** `c:\NovaCiv\NovaCiv\docs\PROJECT_STATE.md`
- **Назначение:** Документ текущего состояния системы (entry points, процессы, cron, health endpoints, flows, конфигурация)
- **Последнее обновление:** Согласно документу — 2026-01-11
- **Содержимое:** Описание процессов PM2, cron-задач, Netlify scheduled functions, Firebase nodes, feature flags, environment variables, known issues, monitoring

#### `runbooks/SOURCE_OF_TRUTH.md`
- **Полный путь:** `c:\NovaCiv\NovaCiv\runbooks\SOURCE_OF_TRUTH.md`
- **Назначение:** Регламент синхронизации (Source of Truth = GitHub main, правила работы, workflow, процедуры при dirty repository)
- **Последнее обновление:** Не указано
- **Содержимое:** Правила pull-only режима, разрешённые/запрещённые операции на сервере, процедуры деплоя, защита от нарушений

### 1.2. Snapshot файлы (на сервере)

#### `_state/system_snapshot.md`
- **Полный путь (сервер):** `/root/NovaCiv/_state/system_snapshot.md`
- **Назначение:** Markdown-формат системного snapshot (читаемый)
- **Генерация:** Автоматически через `snapshot_system.sh` каждые 30 минут
- **Содержимое:** Timestamp, hostname, uptime, repo path, versions (Node/PM2), resources (disk/memory), PM2 status, cron status, git status, health endpoints, PM2 logs (последние 80 строк, с фильтрацией секретов)
- **Безопасность:** Фильтрация секретов, проверка на паттерны (BEGIN PRIVATE KEY, AIza, sk-, ghp_, и т.д.), пометка "tainted" при обнаружении

#### `_state/system_snapshot.json`
- **Полный путь (сервер):** `/root/NovaCiv/_state/system_snapshot.json`
- **Назначение:** JSON-формат системного snapshot (структурированный)
- **Генерация:** Автоматически через `snapshot_system.sh` каждые 30 минут
- **Содержимое:** Структурированные данные в JSON (timestamp, system, repo, versions, pm2, resources, cron, critical_checks, git, health_endpoints, logs)
- **Безопасность:** Аналогично MD-версии

**Примечание:** Директория `_state/` не находится в репозитории (должна быть на сервере).

### 1.3. Дополнительные файлы документации

#### `docs/RUNBOOKS.md`
- **Полный путь:** `c:\NovaCiv\NovaCiv\docs\RUNBOOKS.md`
- **Назначение:** Операционные процедуры (deployment, snapshot, troubleshooting, PM2 logs, health endpoints, ops-agent commands)
- **Содержимое:** Инструкции по деплою, работе со snapshot, диагностике, командам ops-agent

#### `docs/OPS.md`
- **Полный путь:** `c:\NovaCiv\NovaCiv\docs\OPS.md`
- **Назначение:** Операторский пульт (мониторинг через Firebase, smoke test, принудительный запуск пайплайнов)
- **Содержимое:** Описание heartbeat статусов, событий, smoke test, endpoint `ops-run-now`, типовые ошибки

#### `docs/REPO_MAP.md`
- **Полный путь:** `c:\NovaCiv\NovaCiv\docs\REPO_MAP.md`
- **Назначение:** Структура проекта (карта репозитория)
- **Содержимое:** Описание директорий, ключевых файлов, процессов PM2, Firebase nodes

#### `runbooks/README.md`
- **Полный путь:** `c:\NovaCiv\NovaCiv\runbooks\README.md`
- **Назначение:** Описание runbooks (включая snapshot)
- **Содержимое:** Ссылки на runbooks, описание snapshot, команды ops-agent

#### `runbooks/EMERGENCY_HOTFIX.md`
- **Полный путь:** `c:\NovaCiv\NovaCiv\runbooks\EMERGENCY_HOTFIX.md`
- **Назначение:** Процедура экстренного hotfix
- **Содержимое:** Инструкции по экстренным правкам на сервере (включает обновление snapshot)

---

## 2. Snapshot / аудит-механизмы

### 2.1. Скрипт генерации snapshot

#### `runbooks/snapshot_system.sh`
- **Полный путь:** `c:\NovaCiv\NovaCiv\runbooks\snapshot_system.sh`
- **Назначение:** Генерация системного snapshot (без секретов)
- **Выходные форматы:** JSON и Markdown
- **Безопасность:**
  - Проверка на паттерны секретов (BEGIN PRIVATE KEY, AIza, sk-, ghp_, и т.д.)
  - Санитизация вывода (замена секретов на [REDACTED])
  - Пометка "tainted" при обнаружении секретов
  - Выход с кодом ошибки (1) при tainted для мониторинга
- **Что собирает:**
  - Timestamp, hostname, uptime
  - Repo path sanity check
  - Node/PM2 versions
  - PM2 status (только табличный вывод, БЕЗ env)
  - Disk usage (df -h)
  - Memory usage (free -h)
  - Cron status (список entries, БЕЗ env)
  - Git status (branch, commit, clean/dirty, ahead/behind, БЕЗ remote URL)
  - Health endpoints (список настроенных)
  - PM2 logs (последние 80 строк, с фильтрацией)
- **Что НЕ собирает:**
  - process.env или pm2_env dumps
  - .env файлы
  - Firebase/OpenAI/GitHub/YouTube/Telegram токены
  - Service account JSON
  - Private keys или certificates
  - Remote URLs с токенами

### 2.2. Cron-задача snapshot

- **Расписание:** `*/30 * * * *` (каждые 30 минут)
- **Скрипт:** `/root/NovaCiv/runbooks/snapshot_system.sh`
- **Лог:** `/var/log/novaciv_snapshot.log`
- **Результат:** 
  - `/root/NovaCiv/_state/system_snapshot.md`
  - `/root/NovaCiv/_state/system_snapshot.json`
- **Проверка активности:** Скрипт проверяет наличие cron-задачи в `critical_checks.snapshot_cron_active`

### 2.3. Endpoint'ы ops-agent для чтения состояния

#### Команда `snapshot` (ops-agent)
- **Доступ:** Через GitHub Issue с меткой "ops"
- **Обработчик:** `handleSnapshot()` в `server/ops-agent.js`
- **Что делает:** Читает `/root/NovaCiv/_state/system_snapshot.md` и возвращает содержимое (с дополнительной санитизацией)
- **Использование:** Создать Issue с командой `snapshot` или `snapshot:get` (deprecated)

#### Команда `report:status` (ops-agent)
- **Доступ:** Через GitHub Issue с меткой "ops"
- **Обработчик:** `handleReportStatus()` в `server/ops-agent.js`
- **Что делает:** Показывает PM2 status, git status, disk space
- **Использование:** Создать Issue с командой `report:status`

### 2.4. Проверка работоспособности snapshot

**Упоминается в документации:**
- Скрипт `scripts/test-snapshot-secrets.sh` (для проверки snapshot на секреты)
- **Статус:** Файл не найден в репозитории (возможно, существует только на сервере или не создан)

---

## 3. Ops-agent

### 3.1. Основная информация

- **Имя процесса в PM2:** `nova-ops-agent`
- **Путь к файлу:** `c:\NovaCiv\NovaCiv\server\ops-agent.js`
- **Назначение:** GitHub Ops Agent для автоматической обработки Issues с меткой "ops"

### 3.2. Функции ops-agent

#### Обработка GitHub Issues
- **Интервал проверки:** 60 секунд (`CHECK_INTERVAL = 60000`)
- **Условие:** Issue с меткой "ops" и статусом "open"
- **Процесс:**
  1. Парсинг команды из Issue (title или body)
  2. Проверка whitelist команд
  3. Выполнение команды
  4. Комментирование Issue с результатом
  5. Добавление меток (`ops-agent:processing`, `ops-agent:done`, `ops-agent:error`)

#### Доступные команды (whitelist)

1. **`report:status`**
   - Описание: Показать статус системы (PM2, процессы, git)
   - Обработчик: `handleReportStatus()`
   - Нужен git: нет
   - Нужен PR: нет

2. **`video:validate`**
   - Описание: Валидировать конфигурацию видео-пайплайна
   - Обработчик: `handleVideoValidate()`
   - Нужен git: нет
   - Нужен PR: нет

3. **`youtube:refresh-test`**
   - Описание: Проверить обновление YouTube токена
   - Обработчик: `handleYoutubeRefreshTest()`
   - Нужен git: нет
   - Нужен PR: нет

4. **`worker:restart`**
   - Описание: Перезапустить PM2 worker
   - Обработчик: `handleWorkerRestart()`
   - Нужен git: нет
   - Нужен PR: нет

5. **`pipeline:run-test-job`**
   - Описание: Создать тестовую задачу для пайплайна
   - Обработчик: `handlePipelineTestJob()`
   - Нужен git: нет
   - Нужен PR: нет

6. **`snapshot`**
   - Описание: Получить последний системный snapshot (без секретов)
   - Обработчик: `handleSnapshot()`
   - Нужен git: нет
   - Нужен PR: нет

7. **`snapshot:get`** (deprecated)
   - Описание: Получить последний системный snapshot (без секретов) [deprecated, use 'snapshot']
   - Обработчик: `handleSnapshot()`
   - Нужен git: нет
   - Нужен PR: нет

### 3.3. Безопасность ops-agent

- **Санитизация вывода:** Функция `sanitizeOutput()` фильтрует секреты (YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, FIREBASE_SERVICE_ACCOUNT_JSON, TELEGRAM_BOT_TOKEN, GITHUB_TOKEN, OPENAI_API_KEY)
- **Whitelist команд:** Только разрешённые команды выполняются
- **Таймаут:** 5 минут на выполнение команды
- **Кэш обработанных Issues:** Предотвращает повторную обработку

### 3.4. Конфигурация ops-agent

- **GitHub репозиторий:** Автоматически определяется из `git remote get-url origin` (fallback: переменные окружения `GITHUB_OWNER`, `GITHUB_REPO`)
- **Токен:** `GITHUB_TOKEN` из `.env`
- **Директория проекта:** `PROJECT_DIR` из `.env` (по умолчанию `/root/NovaCiv`)
- **Путь к .env:** `ENV_PATH` из окружения (по умолчанию `/root/NovaCiv/.env` на Linux, `c:\NovaCiv\NovaCiv\.env` на Windows)

---

## 4. Итоговый вывод

### 4.1. Что есть и работает

#### Файлы памяти
- ✅ `docs/PROJECT_STATE.md` — документ состояния (в репозитории)
- ✅ `runbooks/SOURCE_OF_TRUTH.md` — регламент синхронизации (в репозитории)
- ✅ `_state/system_snapshot.md` и `_state/system_snapshot.json` — snapshot файлы (на сервере, генерируются автоматически)

#### Snapshot-механизм
- ✅ `runbooks/snapshot_system.sh` — скрипт генерации (в репозитории)
- ✅ Cron-задача каждые 30 минут (настроена на сервере)
- ✅ Лог `/var/log/novaciv_snapshot.log` (на сервере)
- ✅ Фильтрация секретов в snapshot
- ✅ Проверка на паттерны секретов с пометкой "tainted"

#### Ops-agent
- ✅ `server/ops-agent.js` — файл агента (в репозитории)
- ✅ Процесс PM2 `nova-ops-agent` (должен быть запущен на сервере)
- ✅ 7 команд в whitelist (snapshot, report:status, video:validate, youtube:refresh-test, worker:restart, pipeline:run-test-job, snapshot:get)
- ✅ Интеграция с GitHub Issues (метка "ops")
- ✅ Санитизация вывода команд

#### Документация
- ✅ `docs/RUNBOOKS.md` — операционные процедуры
- ✅ `docs/OPS.md` — операторский пульт
- ✅ `docs/REPO_MAP.md` — карта репозитория
- ✅ `runbooks/README.md` — описание runbooks
- ✅ `runbooks/EMERGENCY_HOTFIX.md` — процедура hotfix

### 4.2. Что есть, но требует проверки на сервере

#### Файлы на сервере (не в репозитории)
- ⚠️ `/root/NovaCiv/_state/system_snapshot.md` — должен существовать, если cron работает
- ⚠️ `/root/NovaCiv/_state/system_snapshot.json` — должен существовать, если cron работает
- ⚠️ `/var/log/novaciv_snapshot.log` — должен существовать, если cron работает

#### Скрипты проверки
- ⚠️ `scripts/test-snapshot-secrets.sh` — упоминается в документации, но не найден в репозитории (возможно, только на сервере или не создан)

#### Процессы PM2
- ⚠️ `nova-ops-agent` — должен быть запущен на сервере (проверить через `pm2 list`)
- ⚠️ `nova-video` — Video Worker (упоминается в документации, должен быть запущен)

#### Cron-задачи
- ⚠️ `*/30 * * * * bash /root/NovaCiv/runbooks/snapshot_system.sh` — должна быть настроена на сервере (проверить через `crontab -l`)

### 4.3. Что отсутствует полностью

- ❌ Нет других файлов состояния (например, `system_snapshot_*.bak`, `_state/*.old`)
- ❌ Нет других snapshot-механизмов (кроме `snapshot_system.sh`)
- ❌ Нет других cron-задач, связанных со snapshot/state/audit (кроме snapshot каждые 30 минут)
- ❌ Нет других endpoint'ов ops-agent для чтения состояния (кроме `snapshot` и `report:status`)
- ❌ Нет других процессов PM2, связанных с памятью/состоянием (кроме `nova-ops-agent`)

---

## 5. Дополнительные наблюдения

### 5.1. Архитектурные особенности

- **Pull-only режим:** Сервер работает в режиме pull-only (изменения только через GitHub)
- **Source of Truth:** GitHub main является источником истины
- **Защита от нарушений:** Pre-commit hook блокирует коммиты на сервере
- **Мониторинг dirty repo:** Snapshot проверяет git status и помечает "dirty" как red flag

### 5.2. Безопасность

- **Фильтрация секретов:** Snapshot и ops-agent активно фильтруют секреты
- **Проверка паттернов:** Snapshot проверяет на наличие паттернов секретов
- **Санитизация вывода:** Ops-agent санитизирует вывод команд перед отправкой в GitHub

### 5.3. Интеграции

- **GitHub Issues:** Ops-agent интегрирован с GitHub Issues (метка "ops")
- **PM2:** Используется для управления процессами (`nova-ops-agent`, `nova-video`)
- **Cron:** Используется для автоматической генерации snapshot
- **Firebase:** Используется для хранения heartbeat статусов и событий (не относится к файлам памяти, но упоминается в документации)

---

**Конец отчёта**
