#!/bin/bash
set -e
OUT="/tmp/novaciv_diag_$(date +%F_%H-%M-%S).txt"

{
  echo "=== NOVACIV DIAG ==="
  echo "Time: $(date -Is)"
  echo "Host: $(hostname) | User: $(whoami)"
  echo

  echo "== PM2 LIST =="
  pm2 ls
  echo

  echo "== PM2 DESCRIBE nova-video =="
  pm2 describe nova-video || true
  echo

  echo "== PM2 DESCRIBE nova-ops-agent =="
  pm2 describe nova-ops-agent || true
  echo

  echo "== PM2 LOGS (last lines, no stream) =="
  echo "-- nova-video --"
  pm2 logs nova-video --lines 120 --nostream || true
  echo
  echo "-- nova-ops-agent --"
  pm2 logs nova-ops-agent --lines 200 --nostream || true
  echo

  echo "== ENV (safe subset) =="
  # показываем только имена переменных и хвосты значений, без секретов
  (printenv | egrep '^(NODE_ENV|PORT|FIREBASE_|TELEGRAM_|YOUTUBE_|TIKTOK_|NETLIFY_)' || true) \
    | sed -E 's/(=.{0,8}).*/\1***REDACTED***/'
  echo

  echo "== LISTENING PORTS (top) =="
  ss -lntp | head -n 40 || true
  echo

  echo "== DISK & MEM =="
  df -hT || true
  echo
  free -h || true
  echo

  echo "== REPO QUICK CHECK (if exists) =="
  for d in /root/NovaCiv /root/novaciv /var/www/NovaCiv; do
    if [ -d "$d" ]; then
      echo "-- Repo dir: $d"
      cd "$d"
      git rev-parse --is-inside-work-tree >/dev/null 2>&1 && {
        echo "branch: $(git rev-parse --abbrev-ref HEAD)"
        echo "commit: $(git rev-parse --short HEAD)"
        git status -sb || true
        ls -la | head -n 40 || true
      }
      echo
    fi
  done

  echo "=== END ==="
} | tee "$OUT"

echo
echo "✅ Saved report: $OUT"
echo "👉 To show it again: cat $OUT"
