#!/bin/bash
set -euo pipefail

APP_NAME="nova-ops-agent"
APP_SCRIPT="/root/NovaCiv/server/ops-agent.js"
APP_DIR="/root/NovaCiv"

echo "=== Настройка NovaCiv Ops Agent ==="
echo ""

# 1) Проверяем наличие .env файла
if [ ! -f "$APP_DIR/.env" ]; then
    echo "❌ .env file not found at $APP_DIR/.env"
    echo "   Please create .env file with required variables"
    exit 1
fi

# 2) Проверяем GITHUB_TOKEN
if ! grep -q "^GITHUB_TOKEN=" "$APP_DIR/.env" 2>/dev/null; then
    echo "⚠️  GITHUB_TOKEN not found in .env"
    echo "   Please add GITHUB_TOKEN to .env file"
    echo "   See OPS_AGENT_SETUP.md for instructions"
    exit 1
fi

# 3) Проверяем/настраиваем git
echo "=== Проверка Git конфигурации ==="
cd "$APP_DIR"

# Проверяем remote
if ! git remote get-url origin >/dev/null 2>&1; then
    echo "❌ Git remote 'origin' not configured"
    echo "   Please configure git remote:"
    echo "   git remote add origin <your-repo-url>"
    exit 1
fi

# Проверяем user.name и user.email
GIT_USER=$(git config user.name || echo "")
GIT_EMAIL=$(git config user.email || echo "")

if [ -z "$GIT_USER" ] || [ -z "$GIT_EMAIL" ]; then
    echo "⚠️  Git user not configured"
    echo "   Setting default git user..."
    git config user.name "NovaCiv Ops Agent" || true
    git config user.email "ops-agent@novaciv.space" || true
    echo "✅ Git user configured"
fi

# 4) Устанавливаем зависимости (если нужно)
if [ ! -d "$APP_DIR/node_modules" ]; then
    echo "=== Установка зависимостей ==="
    cd "$APP_DIR"
    npm ci
fi

# 5) Удаляем старый процесс PM2 (если есть)
echo "=== Настройка PM2 ==="
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 save

# 6) Запускаем агента
echo "=== Запуск Ops Agent ==="
cd "$APP_DIR"
ENV_PATH="$APP_DIR/.env" pm2 start "$APP_SCRIPT" --name "$APP_NAME" --update-env
pm2 save

# 7) Показываем статус
echo ""
echo "=== Статус ==="
pm2 status "$APP_NAME"

echo ""
echo "=== Готово ==="
echo ""
echo "Ops Agent запущен: pm2 logs $APP_NAME"
echo "Для остановки: pm2 stop $APP_NAME"
echo "Для перезапуска: pm2 restart $APP_NAME"
