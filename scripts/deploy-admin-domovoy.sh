#!/bin/bash
# Deploy and restart nova-admin-domovoy on VPS

set -euo pipefail
cd /root/NovaCiv

# 1) подтянуть эталон из GitHub (pull-only)
echo "Fetching latest changes from origin..."
git fetch origin
echo "Resetting to origin/main..."
git reset --hard origin/main

# 2) убедиться что файл памяти реально есть (без вывода содержимого)
test -s docs/ADMIN_ASSISTANT.md && echo "ADMIN_ASSISTANT: OK" || (echo "ADMIN_ASSISTANT: MISSING/EMPTY" && exit 1)

# 3) перезапуск админ-домового
echo "Restarting PM2 process nova-admin-domovoy..."
pm2 restart nova-admin-domovoy --update-env || pm2 start ecosystem.config.cjs --only nova-admin-domovoy --update-env

# 4) быстрые проверки
echo ""
echo "=== PM2 Status ==="
pm2 status | egrep "nova-admin-domovoy|nova-ops-agent|nova-video" || true
echo ""
echo "=== Port 3001 Check ==="
ss -lntp | grep ":3001" || true
echo ""
echo "=== Recent Logs (last 60 lines) ==="
pm2 logs nova-admin-domovoy --lines 60
