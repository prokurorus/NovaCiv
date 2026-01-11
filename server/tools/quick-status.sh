#!/usr/bin/env bash
set -euo pipefail

echo "=== WHO ==="
pwd
whoami
date

echo "=== GIT ==="
cd /root/NovaCiv
git rev-parse --abbrev-ref HEAD || true
git status -sb || true
echo
git log -5 --oneline || true

echo "=== PM2 ==="
pm2 list || true
echo

echo "=== PM2: nova-ops-agent logs (last 200) ==="
pm2 logs nova-ops-agent --lines 200 --nostream || true
echo

echo "=== PM2: nova-video logs (last 120) ==="
pm2 logs nova-video --lines 120 --nostream || true
echo
