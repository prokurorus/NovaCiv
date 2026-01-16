# NovaCiv Runbooks

## 📋 Index

1. **[SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md)** — регламент синхронизации (Source of Truth = GitHub main)
2. **[EMERGENCY_HOTFIX.md](./EMERGENCY_HOTFIX.md)** — процедура срочного хотфикса
3. **[deploy_pull_only.sh](./deploy_pull_only.sh)** — скрипт деплоя (pull-only)
4. **[snapshot_system.sh](./snapshot_system.sh)** — генерация системного snapshot

---

## 🎯 Точка входа: System Snapshot

**ВСЕГДА начинай с чтения snapshot** - это актуальное состояние системы.

```bash
cat /root/NovaCiv/_state/system_snapshot.md
```

Или через JSON:
```bash
cat /root/NovaCiv/_state/system_snapshot.json
```

---

## 🚀 Деплой

**Деплой ТОЛЬКО через скрипт:**

```bash
bash /root/NovaCiv/runbooks/deploy_pull_only.sh
```

Скрипт выполняет:
1. `git fetch origin`
2. `git reset --hard origin/main`
3. `pm2 restart all`
4. `pm2 status`

**ВАЖНО:** Сервер в pull-only режиме. Все изменения только через GitHub.

---

## 📋 Логи PM2

**Посмотреть статус:**
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

---

## 🤖 Проверка ops-agent

**Статус:**
```bash
pm2 status nova-ops-agent
```

**Логи:**
```bash
pm2 logs nova-ops-agent --lines 50
```

**Детали процесса:**
```bash
pm2 describe nova-ops-agent
```

**Команды ops-agent доступны через GitHub Issues с меткой "ops":**
- `snapshot` - получить системный snapshot
- `report:status` - статус системы
- `worker:restart` - перезапуск worker
- и другие (см. код ops-agent.js)

---

## 📸 System Snapshot

**Автоматическое обновление:** раз в сутки через cron (snapshot + отчет)

**Ручной запуск:**
```bash
bash /root/NovaCiv/runbooks/snapshot_system.sh
```

**Автоматический отчет через OpenAI (snapshot + отчет):**
```bash
bash /root/NovaCiv/runbooks/snapshot_system_send_openai.sh
```

**Файлы:**
- `/root/NovaCiv/_state/system_snapshot.md` - читаемый формат
- `/root/NovaCiv/_state/system_snapshot.json` - структурированный JSON
- `/root/NovaCiv/_state/system_report.md` - отчет по устойчивости
- `/root/NovaCiv/_state/system_report.json` - метаданные отчета

**Логи snapshot:**
```bash
tail -f /var/log/novaciv_snapshot.log
```

**Проверка на секреты:**
```bash
bash /root/NovaCiv/scripts/test-snapshot-secrets.sh
```

### Что включает snapshot

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

**Red-flag сканер:**
- Если snapshot содержит подозрительные паттерны (BEGIN PRIVATE KEY, AIza, sk-, ghp_, и т.д.), snapshot помечается как "tainted" и скрипт выходит с кодом ошибки (1) для мониторинга.

**Проверка:**
- Запустите `bash scripts/test-snapshot-secrets.sh` для проверки snapshot на наличие секретов.

---

*Обновлено: 2026-01-11*
