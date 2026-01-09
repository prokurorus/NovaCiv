#!/bin/bash
set -euo pipefail

APP_NAME="nova-video"
APP_SCRIPT="/root/NovaCiv/server/video-worker.js"
APP_DIR="/root/NovaCiv"

echo "=== Перезапуск PM2: ${APP_NAME} ==="
echo ""
echo "Примечание: Feature flags теперь управляются через Firebase (config/features/)"
echo "Изменение настроек не требует перезапуска воркера."
echo ""

# 1) Удаляем процесс по имени, если он есть
echo "1) Удаление процесса PM2 по имени (если есть)..."
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 save

# 2) Запускаем заново
echo "2) Запуск ${APP_NAME}..."
cd "$APP_DIR"
pm2 start "$APP_SCRIPT" --name "$APP_NAME"
pm2 save

# 3) Проверяем статус
echo "3) Статус процесса:"
pm2 status "$APP_NAME"

echo ""
echo "=== Готово ==="
echo ""
echo "Для управления feature flags используйте Firebase Console:"
echo "  - config/features/youtubeUploadEnabled"
echo "  - config/features/telegramEnabled"
