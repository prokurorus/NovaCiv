#!/bin/bash
set -euo pipefail

echo "=== NovaCiv ops-agent fix (ENV_PATH + PM2 ecosystem) ==="
echo "Time: $(date -Is)"
echo

PROJECT_DIR="/root/NovaCiv"
ENV_FILE="$PROJECT_DIR/.env"
ECO_FILE="$PROJECT_DIR/ecosystem.config.cjs"
APP_NAME="nova-ops-agent"
SCRIPT="$PROJECT_DIR/server/ops-agent.js"

cd "$PROJECT_DIR"

echo "1) Checking .env exists..."
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ ERROR: $ENV_FILE not found"
  echo "   Create it (server secrets are allowed only in .env)."
  exit 1
fi
echo "✅ .env exists"

echo
echo "2) Checking GITHUB_TOKEN in .env (without printing it)..."
if grep -qE "^GITHUB_TOKEN=" "$ENV_FILE"; then
  echo "✅ GITHUB_TOKEN present in .env"
else
  echo "❌ ERROR: GITHUB_TOKEN is missing in $ENV_FILE"
  echo "   Add line: GITHUB_TOKEN=xxxx"
  exit 1
fi

echo
echo "3) Writing PM2 ecosystem with fixed ENV_PATH..."
cat > "$ECO_FILE" <<EOF
module.exports = {
  apps: [
    {
      name: "${APP_NAME}",
      script: "${SCRIPT}",
      cwd: "${PROJECT_DIR}",
      exec_mode: "fork",
      instances: 1,
      env: {
        ENV_PATH: "${ENV_FILE}",
        PROJECT_DIR: "${PROJECT_DIR}"
      }
    }
  ]
};
EOF
echo "✅ Wrote $ECO_FILE"

echo
echo "4) Restarting via ecosystem (stable across reboot)..."
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start "$ECO_FILE"
pm2 save

echo
echo "5) Status:"
pm2 list | sed -n "1,25p"

echo
echo "6) Verify ENV_PATH is actually set in PM2 env:"
PM2_ID="$(pm2 id "$APP_NAME" 2>/dev/null | tail -n 1 | tr -d "[:space:]")"
if [ -n "${PM2_ID:-}" ]; then
  ENV_PATH_VALUE="$(pm2 env "$PM2_ID" 2>/dev/null | grep -E "^ENV_PATH=" | cut -d'=' -f2- || echo "")"
  if [ -n "$ENV_PATH_VALUE" ]; then
    echo "✅ ENV_PATH is set in PM2: $ENV_PATH_VALUE"
  else
    echo "⚠️  WARNING: ENV_PATH not found in PM2 environment"
  fi
  
  PROJECT_DIR_VALUE="$(pm2 env "$PM2_ID" 2>/dev/null | grep -E "^PROJECT_DIR=" | cut -d'=' -f2- || echo "")"
  if [ -n "$PROJECT_DIR_VALUE" ]; then
    echo "✅ PROJECT_DIR is set in PM2: $PROJECT_DIR_VALUE"
  fi
else
  echo "⚠️  WARNING: Could not determine PM2 process ID for $APP_NAME"
fi

echo
echo "7) Recent logs (last 10 lines):"
pm2 logs "$APP_NAME" --lines 10 --nostream || echo "⚠️  Could not fetch logs"

echo
echo "=== Done ==="
echo "To view logs: pm2 logs $APP_NAME"
echo "To restart: pm2 restart $APP_NAME"
