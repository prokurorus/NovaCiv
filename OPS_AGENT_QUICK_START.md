# NovaCiv Ops Agent - Быстрый старт

## GitHub Token (5 строк)

1. Перейди на https://github.com/settings/tokens
2. Generate new token (classic) → выбери scope `repo`
3. Скопируй токен (формат `ghp_xxxxx`)
4. Добавь в `/root/NovaCiv/.env`: `GITHUB_TOKEN=ghp_xxxxx`
5. Готово

## Запуск агента

```bash
cd /root/NovaCiv
bash scripts/setup-ops-agent.sh
```

## Использование

1. Создай Issue в GitHub репозитории
2. Добавь метку `ops`
3. В title или body укажи команду: `report:status`
4. Агент автоматически обработает и оставит комментарий

## Доступные команды

- `report:status` - Статус системы (PM2, git, disk)
- `video:validate` - Валидация видео-пайплайна
- `youtube:refresh-test` - Тест YouTube токена
- `worker:restart` - Перезапуск PM2 worker
- `pipeline:run-test-job` - Создать тестовую задачу
- `onebigstep:health` - Comprehensive health check (git, pm2, snapshot files, cron, health endpoints)
- `snapshot:run` - Execute snapshot_system.sh and return generated file paths
- `logs:tail <process-name>` - Tail logs from allowed PM2 processes (nova-ops-agent, nova-video)

## PM2 команды

```bash
pm2 logs nova-ops-agent        # Логи
pm2 restart nova-ops-agent     # Перезапуск
pm2 stop nova-ops-agent        # Остановка
pm2 status nova-ops-agent      # Статус
```
