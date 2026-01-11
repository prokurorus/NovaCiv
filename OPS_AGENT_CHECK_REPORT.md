# Отчет о проверке nova-ops-agent

## Локальная проверка кода

### ✅ Код server/ops-agent.js корректен

Код правильно использует `ENV_PATH` для загрузки `.env` файла:

```javascript
const envPath = process.env.ENV_PATH || 
  (process.platform === 'win32' ? path.join(__dirname, '..', '.env') : '/root/NovaCiv/.env');

require("dotenv").config({ path: envPath, override: true });
```

**Исправления не требуются.**

## Команды для проверки на сервере

Выполните следующие команды на сервере для полной проверки:

### Способ 1: Выполнить скрипт через SSH

```bash
ssh root@77.42.36.198 "bash -s" < scripts/check-ops-agent-complete.sh
```

### Способ 2: Выполнить скрипт напрямую на сервере

```bash
# На сервере:
cd /root/NovaCiv
bash scripts/check-ops-agent-complete.sh
```

### Способ 3: Выполнить команды вручную

```bash
# На сервере выполните:
PROJECT_DIR="/root/NovaCiv"
ENV_FILE="$PROJECT_DIR/.env"
APP_NAME="nova-ops-agent"

# 1. Проверка всех .env файлов
find "$PROJECT_DIR" -type f -name ".env" 2>/dev/null | sort

# 2. Проверка GITHUB_TOKEN
grep -qE "^GITHUB_TOKEN=" "$ENV_FILE" && echo "✅ GITHUB_TOKEN exists" || echo "❌ GITHUB_TOKEN missing"

# 3. PM2 describe и env
PM2_ID=$(pm2 id "$APP_NAME" 2>/dev/null | tail -n 1 | tr -d '[:space:]')
pm2 describe "$APP_NAME"
pm2 env "$PM2_ID" | grep -E "^(ENV_PATH|PROJECT_DIR)="

# 4. Перезапуск и проверка
pm2 restart "$APP_NAME"
sleep 5
pm2 status "$APP_NAME"
pm2 logs "$APP_NAME" --lines 20 --nostream
```

### Быстрая диагностика (одна команда)

```bash
PM2_ID=$(pm2 id nova-ops-agent 2>/dev/null | tail -n 1 | tr -d '[:space:]') && pm2 describe nova-ops-agent && echo '---' && pm2 env $PM2_ID | grep -E '^(ENV_PATH|PROJECT_DIR)=' && grep -qE '^GITHUB_TOKEN=' /root/NovaCiv/.env && echo '✅ GITHUB_TOKEN exists' || echo '❌ GITHUB_TOKEN missing'
```

## Что проверить

1. ✅ **ecosystem.config.cjs** - процесс должен запускаться через этот файл
2. ✅ **ENV_PATH** - должен быть установлен в `/root/NovaCiv/.env` в PM2 окружении
3. ✅ **PROJECT_DIR** - должен быть установлен в `/root/NovaCiv` в PM2 окружении
4. ✅ **GITHUB_TOKEN** - должен быть в `/root/NovaCiv/.env`
5. ✅ **Все .env файлы** - список всех .env файлов в /root/NovaCiv
6. ✅ **Код** - server/ops-agent.js использует ENV_PATH (проверено локально)
