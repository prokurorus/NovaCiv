#!/bin/bash
# Fix GITHUB_TOKEN on server (run this ON THE SERVER)
# Usage: GITHUB_TOKEN=ghp_xxxxx bash /root/NovaCiv/scripts/fix-github-token-remote.sh

set -euo pipefail

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "❌ ERROR: GITHUB_TOKEN environment variable is not set"
  echo "   Usage: GITHUB_TOKEN=ghp_xxxxx bash $0"
  exit 1
fi

if [[ ! "$GITHUB_TOKEN" =~ ^ghp_ ]]; then
  echo "❌ ERROR: GITHUB_TOKEN should start with 'ghp_'"
  exit 1
fi

PROJECT_DIR="/root/NovaCiv"
ENV_FILE="$PROJECT_DIR/.env"
ECO_FILE="$PROJECT_DIR/ecosystem.config.cjs"
APP_NAME="nova-ops-agent"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Fixing GITHUB_TOKEN on NovaCiv Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PROJECT_DIR"

# Backup existing .env if it exists
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
  echo "✅ Backed up existing .env"
fi

# Update or add GITHUB_TOKEN
if grep -qE "^GITHUB_TOKEN=" "$ENV_FILE" 2>/dev/null; then
  # Update existing token
  sed -i "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=${GITHUB_TOKEN}|" "$ENV_FILE"
  echo "✅ Updated GITHUB_TOKEN in .env"
else
  # Add new token
  echo "GITHUB_TOKEN=${GITHUB_TOKEN}" >> "$ENV_FILE"
  echo "✅ Added GITHUB_TOKEN to .env"
fi

# Verify token was written
if grep -qE "^GITHUB_TOKEN=ghp_" "$ENV_FILE"; then
  TOKEN_LEN=$(grep -E "^GITHUB_TOKEN=" "$ENV_FILE" | cut -d= -f2 | wc -c)
  echo "✅ Token verified in .env (length: $((TOKEN_LEN-1)) chars)"
else
  echo "❌ ERROR: Token verification failed"
  exit 1
fi
echo ""

# Verify ecosystem.config.cjs
echo "3️⃣  Verifying ecosystem.config.cjs..."
if [ ! -f "$ECO_FILE" ]; then
  echo "❌ ERROR: ecosystem.config.cjs not found"
  exit 1
fi

# Check if ecosystem.config.cjs loads .env
if grep -q "loadEnvFile\|envFileVars\|mergedEnv" "$ECO_FILE"; then
  echo "✅ ecosystem.config.cjs appears to load .env variables"
else
  echo "⚠️  WARNING: ecosystem.config.cjs may not load .env variables"
fi

# Check if apps[0].env is set
if grep -q "apps\[0\].env" "$ECO_FILE" || grep -q "env:.*mergedEnv" "$ECO_FILE"; then
  echo "✅ ecosystem.config.cjs has env configuration"
else
  echo "⚠️  WARNING: apps[0].env may not be configured"
fi
echo ""

# Restart PM2 process with --update-env
echo "4️⃣  Restarting PM2 process with --update-env..."
if ! pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "⚠️  Process $APP_NAME not found in PM2, starting it..."
  pm2 start "$ECO_FILE" --only "$APP_NAME"
  pm2 save
else
  echo "✅ Restarting $APP_NAME with --update-env..."
  pm2 restart "$APP_NAME" --update-env
  pm2 save
fi
echo ""

# Wait a bit for process to start
sleep 3

# Verify token is available in process
echo "5️⃣  Verifying GITHUB_TOKEN in process environment..."
PM2_ID=$(pm2 id "$APP_NAME" 2>/dev/null | tail -n 1 | tr -d "[:space:]" || echo "")
if [ -z "$PM2_ID" ]; then
  echo "❌ ERROR: Could not find PM2 process ID for $APP_NAME"
  exit 1
fi

# Check if GITHUB_TOKEN is in PM2 env
TOKEN_IN_ENV=$(pm2 env "$PM2_ID" 2>/dev/null | grep -E "^GITHUB_TOKEN=" | cut -d= -f2- || echo "")
if [ -z "$TOKEN_IN_ENV" ]; then
  echo "❌ ERROR: GITHUB_TOKEN not found in PM2 process environment"
  echo "   PM2 Process ID: $PM2_ID"
  echo "   Available env vars:"
  pm2 env "$PM2_ID" 2>/dev/null | grep -E "^[A-Z_]+" | head -n 10 || true
  exit 1
fi

TOKEN_LEN=${#TOKEN_IN_ENV}
if [ $TOKEN_LEN -lt 10 ]; then
  echo "❌ ERROR: GITHUB_TOKEN appears to be empty or too short (length: $TOKEN_LEN)"
  exit 1
fi

echo "✅ GITHUB_TOKEN found in PM2 process environment (length: $TOKEN_LEN chars)"
echo ""

# Check logs for token errors
echo "6️⃣  Checking logs for GITHUB_TOKEN errors..."
LOG_OUTPUT=$(pm2 logs "$APP_NAME" --lines 50 --nostream 2>&1 || echo "")

if echo "$LOG_OUTPUT" | grep -qi "GITHUB_TOKEN not set"; then
  echo "❌ ERROR: Found 'GITHUB_TOKEN not set' in logs"
  echo "   Recent log lines:"
  echo "$LOG_OUTPUT" | tail -n 20
  exit 1
elif echo "$LOG_OUTPUT" | grep -qi "GITHUB_TOKEN loaded"; then
  echo "✅ Found 'GITHUB_TOKEN loaded' message in logs"
else
  echo "⚠️  Could not find confirmation message in logs"
  echo "   Recent log lines:"
  echo "$LOG_OUTPUT" | tail -n 10
fi
echo ""

# Final status check
echo "7️⃣  Final status check..."
echo "   PM2 Status:"
pm2 list | grep -E "($APP_NAME|name|status|uptime|restarts)" || pm2 list
echo ""
echo "   Process info:"
pm2 describe "$APP_NAME" 2>/dev/null | grep -E "(status|uptime|restarts)" || echo "   ⚠️  Could not get process info"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ GITHUB_TOKEN fix completed successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
