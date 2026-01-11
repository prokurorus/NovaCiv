#!/bin/bash
# Quick fix for GITHUB_TOKEN - run this ON THE SERVER
# This script writes the token and restarts the service

set -euo pipefail

GITHUB_TOKEN="YOUR_GITHUB_TOKEN_HERE"
PROJECT_DIR="/root/NovaCiv"
ENV_FILE="$PROJECT_DIR/.env"
APP_NAME="nova-ops-agent"

cd "$PROJECT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Fixing GITHUB_TOKEN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Backup .env if exists
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Update or add GITHUB_TOKEN
if grep -qE "^GITHUB_TOKEN="YOUR_GITHUB_TOKEN_HERE"$ENV_FILE" 2>/dev/null; then
  sed -i "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=${GITHUB_TOKEN}|" "$ENV_FILE"
  echo "✅ Updated GITHUB_TOKEN in .env"
else
  echo "GITHUB_TOKEN=${GITHUB_TOKEN}" >> "$ENV_FILE"
  echo "✅ Added GITHUB_TOKEN to .env"
fi

# Verify
if grep -qE "^GITHUB_TOKEN=ghp_" "$ENV_FILE"; then
  TOKEN_LEN=$(grep -E "^GITHUB_TOKEN="YOUR_GITHUB_TOKEN_HERE"$ENV_FILE" | cut -d= -f2 | wc -c)
  echo "✅ Token verified (length: $((TOKEN_LEN-1)) chars)"
else
  echo "❌ ERROR: Token verification failed"
  exit 1
fi

# Restart PM2 with --update-env
echo ""
echo "🔄 Restarting PM2 process..."
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
  pm2 save
  echo "✅ Process restarted"
else
  echo "⚠️  Process not found, starting..."
  pm2 start ecosystem.config.cjs --only "$APP_NAME"
  pm2 save
fi

# Wait and verify
sleep 3

PM2_ID=$(pm2 id "$APP_NAME" 2>/dev/null | tail -n 1 | tr -d "[:space:]" || echo "")
if [ -n "$PM2_ID" ]; then
  TOKEN_IN_ENV=$(pm2 env "$PM2_ID" 2>/dev/null | grep -E "^GITHUB_TOKEN="YOUR_GITHUB_TOKEN_HERE"")
  if [ -n "$TOKEN_IN_ENV" ] && [ ${#TOKEN_IN_ENV} -gt 10 ]; then
    echo "✅ GITHUB_TOKEN found in PM2 process environment"
  else
    echo "❌ ERROR: GITHUB_TOKEN not in PM2 env"
    exit 1
  fi
fi

# Check logs
sleep 2
LOG_OUTPUT=$(pm2 logs "$APP_NAME" --lines 30 --nostream 2>&1 || echo "")
if echo "$LOG_OUTPUT" | grep -qi "GITHUB_TOKEN not set"; then
  echo "❌ ERROR: Found 'GITHUB_TOKEN not set' in logs"
  exit 1
elif echo "$LOG_OUTPUT" | grep -qi "GITHUB_TOKEN loaded"; then
  echo "✅ Found 'GITHUB_TOKEN loaded' in logs"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ GITHUB_TOKEN fix completed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
