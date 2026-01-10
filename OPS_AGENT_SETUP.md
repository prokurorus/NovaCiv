# NovaCiv Ops Agent - Инструкция по настройке

## Что это

GitHub-агент для автоматической обработки Issues с меткой "ops". Агент выполняет безопасные команды из whitelist и отчитывается в комментариях Issue.

## Быстрая настройка

### 1. GitHub Token (5 строк)

1. Иди на https://github.com/settings/tokens
2. Generate new token (classic) → `repo` scope
3. Скопируй токен
4. Добавь в `/root/NovaCiv/.env`: `GITHUB_TOKEN=ghp_xxxxx`
5. Опционально: `GITHUB_OWNER=твой-username` и `GITHUB_REPO=NovaCiv`

### 2. Запуск агента

```bash
bash scripts/setup-ops-agent.sh
```

Или вручную через PM2:

```bash
cd /root/NovaCiv
ENV_PATH=/root/NovaCiv/.env pm2 start server/ops-agent.js --name nova-ops-agent --update-env
pm2 save
```

### 3. Проверка работы

```bash
pm2 logs nova-ops-agent
```

## Доступные команды

- `report:status` - Показать статус системы (PM2, git, disk)
- `video:validate` - Валидировать конфигурацию видео-пайплайна
- `youtube:refresh-test` - Проверить обновление YouTube токена
- `worker:restart` - Перезапустить PM2 worker
- `pipeline:run-test-job` - Создать тестовую задачу для пайплайна

## Использование

1. Создай Issue в GitHub репозитории
2. Добавь метку `ops`
3. В title или body укажи команду (например: `report:status`)
4. Агент автоматически обработает Issue и оставит комментарий с результатами

## Безопасность

- ✅ Агент выполняет ТОЛЬКО команды из whitelist
- ✅ Никаких произвольных bash команд
- ✅ Секреты автоматически маскируются в выводе
- ✅ Все изменения через git (не через прямые правки файлов)

## Переменные окружения

```bash
GITHUB_TOKEN=ghp_xxxxx          # Обязательно
GITHUB_OWNER=NovaCiv            # Опционально (по умолчанию NovaCiv)
GITHUB_REPO=NovaCiv             # Опционально (по умолчанию NovaCiv)
PROJECT_DIR=/root/NovaCiv       # Опционально
ENV_PATH=/root/NovaCiv/.env     # Опционально
```

## Логи

```bash
# Просмотр логов
pm2 logs nova-ops-agent

# Последние 100 строк
pm2 logs nova-ops-agent --lines 100

# Реал-тайм
pm2 logs nova-ops-agent --raw
```

## Перезапуск

```bash
pm2 restart nova-ops-agent
```

## Остановка

```bash
pm2 stop nova-ops-agent
```
