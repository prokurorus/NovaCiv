# Runbooks — NovaCiv

**Операционные процедуры для NovaCiv**

---

## 📍 Entry Points

**Для начала работы:**
1. Прочитайте snapshot: `cat /root/NovaCiv/_state/system_snapshot.md`
2. Проверьте [PROJECT_STATE.md](./PROJECT_STATE.md) — текущее состояние
3. См. [REPO_MAP.md](./REPO_MAP.md) — структура проекта

---

## 🚀 Deployment

### Deploy from GitHub (Pull-Only)

**Скрипт:** `runbooks/deploy_pull_only.sh`

**Использование:**
```bash
bash /root/NovaCiv/runbooks/deploy_pull_only.sh
```

**Что делает:**
1. `cd /root/NovaCiv`
2. `git fetch origin`
3. `git reset --hard origin/main`
4. `pm2 restart all`
5. `pm2 status`

**ВАЖНО:** Сервер в pull-only режиме. Все изменения только через GitHub.

**Логи:**
- PM2 логи: `pm2 logs`
- Git статус: `git status` (должен быть clean после deploy)

---

## 📸 Snapshot

### What It Contains

Snapshot содержит состояние системы БЕЗ секретов.

**Включает:**
- Timestamp, hostname
- Repo path sanity check (/root/NovaCiv)
- Git state (branch, commit, clean/dirty, ahead/behind) БЕЗ remote URL
- PM2 status (только табличный вывод, БЕЗ env переменных)
- Disk usage (df -h)
- Memory usage (free -h)
- Cron status (список crontab entries, БЕЗ env переменных)
- Health endpoints (список настроенных endpoints)
- PM2 logs (последние 80 строк, с фильтрацией секретов)

**НЕ включает (никогда):**
- ❌ process.env или pm2_env dumps
- ❌ .env файлы
- ❌ Firebase/OpenAI/GitHub/YouTube/Telegram токены
- ❌ Service account JSON
- ❌ Private keys или certificates
- ❌ Remote URLs с токенами
- ❌ Любые секреты или credentials

### Red-Flag Rules

**Если snapshot содержит подозрительные паттерны:**
- `BEGIN PRIVATE KEY`, `AIza`, `sk-`, `ghp_`, `-----BEGIN`, и т.д.
- Snapshot помечается как "tainted"
- Скрипт выходит с кодом ошибки (1) для мониторинга
- Логируется предупреждение в `/var/log/novaciv_snapshot.log`

**Проверка snapshot:**
```bash
bash /root/NovaCiv/scripts/test-snapshot-secrets.sh
```

**Автоматическое обновление:**
- Каждые 30 минут через cron
- Скрипт: `/root/NovaCiv/runbooks/snapshot_system.sh`
- Лог: `/var/log/novaciv_snapshot.log`

**Ручной запуск:**
```bash
bash /root/NovaCiv/runbooks/snapshot_system.sh
```

**Чтение snapshot:**
```bash
# Markdown (читаемый формат)
cat /root/NovaCiv/_state/system_snapshot.md

# JSON (структурированный)
cat /root/NovaCiv/_state/system_snapshot.json
```

---

## 🧪 Stability Report

### Запуск локально (ПК/VPS)

**Требования:** `OPENAI_API_KEY` в окружении.

```bash
cd /root/NovaCiv
node server/ops-stability-report.js
```

**Артефакты (последние):**
- `/root/NovaCiv/_state/telemetry_latest.json`
- `/root/NovaCiv/_state/system_report_latest.md`
- `/root/NovaCiv/_state/system_report_latest.json`

**Архив:** создаются timestamped копии рядом с latest-файлами.

### Ежедневный cron (VPS)

```bash
bash /root/NovaCiv/runbooks/stability_report_daily.sh
```

---

## 🔧 Troubleshooting

### PM2 Logs

**Статус всех процессов:**
```bash
pm2 status
```

**Логи всех процессов:**
```bash
pm2 logs --lines 100
```

**Логи конкретного процесса:**
```bash
pm2 logs nova-ops-agent --lines 100
pm2 logs nova-video --lines 100
```

**Логи в реальном времени:**
```bash
pm2 logs
```

**Детали процесса:**
```bash
pm2 describe nova-ops-agent
pm2 describe nova-video
```

**Перезапуск процесса:**
```bash
pm2 restart nova-ops-agent
pm2 restart nova-video
pm2 restart all
```

### Health Endpoints

**News pipeline:**
```bash
node scripts/check-health-news.mjs
```

**Domovoy pipeline:**
```bash
node scripts/check-health-domovoy.mjs
```

**Требования:**
- `.env` файл с `NEWS_BASE_URL`, `NEWS_CRON_SECRET`
- `npm ci` выполнен (зависимости установлены)

**Через curl (если есть токен):**
```bash
curl "https://novaciv.space/.netlify/functions/health-news?token=<NEWS_CRON_SECRET>"
curl "https://novaciv.space/.netlify/functions/health-domovoy?token=<NEWS_CRON_SECRET>"
```

**GitHub Actions:**
- Автоматическая проверка каждые 30 минут
- Workflow: `.github/workflows/pipeline-health.yml`

### Common Failures

#### PM2 Process Not Running

**Симптомы:**
- `pm2 status` показывает процесс как `stopped` или `errored`
- Логи не обновляются

**Решение:**
1. Проверить логи: `pm2 logs <process-name>`
2. Проверить .env файл: `ls -la /root/NovaCiv/.env`
3. Перезапустить: `pm2 restart <process-name>`
4. Если не помогает: `pm2 delete <process-name>` и создать заново

#### News Pipeline Not Working

**Симптомы:**
- Нет новых постов в Telegram
- Health check показывает ошибки

**Решение:**
1. Проверить health: `node scripts/check-health-news.mjs`
2. Проверить Netlify Functions logs (Netlify Dashboard)
3. Проверить Firebase: `/health/news/*` nodes
4. Проверить переменные окружения в Netlify Dashboard

#### Domovoy Pipeline Not Working

**Симптомы:**
- Нет новых постов Домового
- Health check показывает ошибки

**Решение:**
1. Проверить health: `node scripts/check-health-domovoy.mjs`
2. Проверить Netlify Functions logs (Netlify Dashboard)
3. Проверить Firebase: `/health/domovoy/*` nodes
4. Проверить scheduled functions в `netlify.toml`

#### Snapshot Contains Secrets

**Симптомы:**
- Тест `test-snapshot-secrets.sh` показывает ошибки
- Snapshot помечен как "tainted"

**Решение:**
1. Проверить скрипт: `runbooks/snapshot_system.sh`
2. Убедиться, что не используется `pm2 jlist` или `pm2 describe`
3. Убедиться, что не используется `git remote get-url`
4. Пересоздать snapshot: `bash runbooks/snapshot_system.sh`

#### Git Status Dirty (Red Flag) — Инцидент архитектуры

**ВАЖНО:** `git status != clean` на сервере считается инцидентом архитектуры (нарушение pull-only режима).

**Симптомы:**
- `git status` показывает незакоммиченные изменения
- Snapshot показывает `status: dirty` и `redFlag: true`
- Snapshot выводит: "⚠️ RED FLAG: Violation of pull-only mode"

**Стандартная процедура возврата в clean state:**

1. **Определить причину dirty:**
   ```bash
   cd /root/NovaCiv
   git status --short  # Какие файлы изменены?
   git diff --stat     # Статистика изменений
   git diff            # Детали изменений (если нужно)
   ```

2. **Определить тип изменений:**
   - **Tracked code files** (`.js`, `.ts`, `.tsx`, `.mjs`, `.sh`, `.md`, `.toml`, и т.д.) — **НЕДОПУСТИМО**
   - **Untracked files** (`_state/*`, логи, временные файлы) — допустимо игнорировать
   - **`.env`** — допустимо (изменения только в `.env` не считаются инцидентом)

3. **Если изменения в tracked code (НЕДОПУСТИМО):**
   - **Если изменения нужны:**
     - См. [runbooks/EMERGENCY_HOTFIX.md](../runbooks/EMERGENCY_HOTFIX.md) (только для критических ситуаций)
     - Закоммитить и запушить в GitHub: `git add -A && git commit -m "hotfix: описание" && git push origin main`
     - На ПК сделать pull: `git pull origin main`
   - **Если изменения не нужны:**
     ```bash
     cd /root/NovaCiv
     git reset --hard origin/main  # Откатить все изменения в tracked files
     git clean -fd                  # Удалить неотслеживаемые файлы (осторожно!)
     ```

4. **Если изменения только в untracked files (допустимо игнорировать):**
   - Можно оставить как есть (не блокирует pull-only режим)
   - Или удалить: `git clean -fd`

5. **Проверить состояние:**
   ```bash
   git status  # Должен показать "clean" или только untracked files
   ```

6. **Зафиксировать факт инцидента (если было нарушение):**
   - Создать GitHub Issue: `[INCIDENT] Dirty repo detected on server`
   - Указать: дата, время, причина, какие файлы изменены, как исправлено
   - Добавить в Issue ссылку на snapshot: `_state/system_snapshot.json`

7. **Обновить snapshot:**
   ```bash
   bash /root/NovaCiv/runbooks/snapshot_system.sh
   ```

**ВАЖНО:** 
- Сервер в pull-only режиме. Коммиты только через GitHub.
- **Обязательно к прочтению:** [runbooks/SOURCE_OF_TRUTH.md](../runbooks/SOURCE_OF_TRUTH.md)

### Ops-Agent Commands

**Доступные команды через GitHub Issues (метка "ops"):**
- `snapshot` — получить системный snapshot
- `report:status` — статус системы
- `worker:restart` — перезапуск worker
- И другие (см. `server/ops-agent.js`)

**Использование:**
1. Создать Issue в GitHub с меткой "ops"
2. В теле Issue написать команду (например: `snapshot`)
3. `nova-ops-agent` обработает Issue и оставит комментарий с результатом

---

## 📋 Quick Reference

### Check System State
```bash
# Snapshot
cat /root/NovaCiv/_state/system_snapshot.md

# PM2 status
pm2 status

# Health checks
node scripts/check-health-news.mjs
node scripts/check-health-domovoy.mjs
```

### Deploy
```bash
bash /root/NovaCiv/runbooks/deploy_pull_only.sh
```

### View Logs
```bash
# PM2 logs
pm2 logs --lines 100

# Snapshot log
tail -f /var/log/novaciv_snapshot.log
```

### Restart Services
```bash
pm2 restart all
```

---

*Документ обновляется при изменениях в операционных процедурах.*
